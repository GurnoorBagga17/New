//! SQL parsing and conservative read-only classification.

use std::{collections::BTreeSet, ops::ControlFlow};

use sqlparser::{
    ast::{Expr, ObjectName, Query, Select, SetExpr, Statement, TableFactor, Visit, Visitor},
    dialect::{Dialect, GenericDialect, MsSqlDialect, MySqlDialect, PostgreSqlDialect},
    parser::Parser,
};
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SqlFacts {
    pub verbs: Vec<String>,
    pub tables: Vec<String>,
    pub is_readonly: bool,
    pub statement_count: u32,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum DialectKind {
    #[default]
    Generic,
    PostgreSql,
    MySql,
    MsSql,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum SqlError {
    #[error("SQL input is empty")]
    Empty,
    #[error("SQL could not be parsed")]
    Parse,
}

/// Parses SQL as an AST. Only query statements without locks, output clauses,
/// or non-allowlisted function calls are classified read-only.
pub fn analyze(sql: &str, allowed_functions: &[String]) -> Result<SqlFacts, SqlError> {
    analyze_with_dialect(sql, allowed_functions, DialectKind::Generic)
}

pub fn analyze_with_dialect(
    sql: &str,
    allowed_functions: &[String],
    dialect_kind: DialectKind,
) -> Result<SqlFacts, SqlError> {
    match dialect_kind {
        DialectKind::Generic => analyze_with(sql, allowed_functions, &GenericDialect {}),
        DialectKind::PostgreSql => analyze_with(sql, allowed_functions, &PostgreSqlDialect {}),
        DialectKind::MySql => analyze_with(sql, allowed_functions, &MySqlDialect {}),
        DialectKind::MsSql => analyze_with(sql, allowed_functions, &MsSqlDialect {}),
    }
}

fn analyze_with(
    sql: &str,
    allowed_functions: &[String],
    dialect: &dyn Dialect,
) -> Result<SqlFacts, SqlError> {
    if sql.trim().is_empty() {
        return Err(SqlError::Empty);
    }
    let statements = Parser::parse_sql(dialect, sql).map_err(|_| SqlError::Parse)?;
    if statements.is_empty() || statements.len() > u32::MAX as usize {
        return Err(SqlError::Empty);
    }

    let allowed: BTreeSet<String> = allowed_functions
        .iter()
        .map(|name| name.to_ascii_lowercase())
        .collect();
    let mut visitor = SqlVisitor {
        allowed_functions: &allowed,
        unsafe_function_seen: false,
        tables: BTreeSet::new(),
    };
    let _ = statements.visit(&mut visitor);

    let mut verbs = Vec::with_capacity(statements.len());
    let mut readonly = !visitor.unsafe_function_seen;
    for statement in &statements {
        match statement {
            Statement::Query(query) => {
                verbs.push("SELECT".to_owned());
                if !query_is_readonly(query) {
                    readonly = false;
                }
            }
            other => {
                readonly = false;
                verbs.push(statement_verb(other));
            }
        }
    }

    Ok(SqlFacts {
        verbs,
        tables: visitor.tables.into_iter().collect(),
        is_readonly: readonly,
        statement_count: statements.len() as u32,
    })
}

fn query_is_readonly(query: &Query) -> bool {
    query.locks.is_empty()
        && query.for_clause.is_none()
        && set_expr_is_readonly(&query.body)
        && query.with.as_ref().is_none_or(|with| {
            with.cte_tables
                .iter()
                .all(|cte| query_is_readonly(&cte.query))
        })
}

fn set_expr_is_readonly(body: &SetExpr) -> bool {
    match body {
        SetExpr::Select(select) => select.into.is_none(),
        SetExpr::Query(query) => query_is_readonly(query),
        SetExpr::SetOperation { left, right, .. } => {
            set_expr_is_readonly(left) && set_expr_is_readonly(right)
        }
        SetExpr::Values(_) => true,
        // sqlparser also represents data-changing CTE bodies with these variants.
        SetExpr::Insert(_)
        | SetExpr::Update(_)
        | SetExpr::Delete(_)
        | SetExpr::Merge(_)
        | SetExpr::Table(_) => false,
    }
}

fn statement_verb(statement: &Statement) -> String {
    statement
        .to_string()
        .split_whitespace()
        .next()
        .unwrap_or("UNKNOWN")
        .trim_matches(|c: char| !c.is_ascii_alphabetic())
        .to_ascii_uppercase()
}

struct SqlVisitor<'a> {
    allowed_functions: &'a BTreeSet<String>,
    unsafe_function_seen: bool,
    tables: BTreeSet<String>,
}

impl Visitor for SqlVisitor<'_> {
    type Break = ();

    fn pre_visit_expr(&mut self, expr: &Expr) -> ControlFlow<Self::Break> {
        if let Expr::Function(function) = expr {
            let name = function.name.to_string().to_ascii_lowercase();
            if !self.allowed_functions.contains(&name) {
                self.unsafe_function_seen = true;
            }
        }
        ControlFlow::Continue(())
    }

    fn pre_visit_relation(&mut self, relation: &ObjectName) -> ControlFlow<Self::Break> {
        self.tables.insert(relation.to_string());
        ControlFlow::Continue(())
    }

    fn pre_visit_select(&mut self, select: &Select) -> ControlFlow<Self::Break> {
        if select.into.is_some() {
            self.unsafe_function_seen = true;
        }
        ControlFlow::Continue(())
    }

    fn pre_visit_table_factor(&mut self, factor: &TableFactor) -> ControlFlow<Self::Break> {
        match factor {
            TableFactor::Table { args: Some(_), .. }
            | TableFactor::TableFunction { .. }
            | TableFactor::Function { .. }
            | TableFactor::JsonTable { .. }
            | TableFactor::OpenJsonTable { .. }
            | TableFactor::UNNEST { .. }
            | TableFactor::XmlTable { .. }
            | TableFactor::SemanticView { .. } => self.unsafe_function_seen = true,
            _ => {}
        }
        ControlFlow::Continue(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selects_are_parsed_and_table_names_normalized() {
        let facts = analyze("SELECT id FROM public.orders", &[]).unwrap();
        assert!(facts.is_readonly);
        assert_eq!(facts.verbs, ["SELECT"]);
        assert_eq!(facts.tables, ["public.orders"]);
        assert_eq!(facts.statement_count, 1);
    }

    #[test]
    fn multiple_statements_are_independently_classified() {
        let facts = analyze("SELECT 1; DELETE FROM users", &[]).unwrap();
        assert_eq!(facts.verbs, ["SELECT", "DELETE"]);
        assert_eq!(facts.statement_count, 2);
        assert!(!facts.is_readonly);
    }

    #[test]
    fn locking_select_is_not_readonly() {
        let facts = analyze("SELECT id FROM users FOR UPDATE", &[]).unwrap();
        assert!(!facts.is_readonly);
    }

    #[test]
    fn select_into_and_table_functions_are_not_readonly() {
        let into = analyze("SELECT id INTO backup FROM users", &[]).unwrap();
        assert!(!into.is_readonly);
        let table_function = analyze("SELECT * FROM generate_series(1, 10)", &[]).unwrap();
        assert!(!table_function.is_readonly);
    }

    #[test]
    fn data_modifying_ctes_are_not_readonly() {
        let facts = analyze_with_dialect(
            "WITH deleted AS (DELETE FROM users RETURNING id) SELECT id FROM deleted",
            &[],
            DialectKind::PostgreSql,
        )
        .unwrap();
        assert_eq!(facts.verbs, ["SELECT"]);
        assert!(!facts.is_readonly);
    }

    #[test]
    fn unknown_functions_make_readonly_classification_conservative() {
        let facts = analyze("SELECT dangerous_side_effect()", &[]).unwrap();
        assert!(!facts.is_readonly);
        let safe = analyze("SELECT count(*)", &["count".into()]).unwrap();
        assert!(safe.is_readonly);
    }

    #[test]
    fn malformed_and_empty_sql_are_rejected() {
        assert_eq!(analyze("", &[]), Err(SqlError::Empty));
        assert_eq!(analyze("SELECT FROM", &[]), Err(SqlError::Parse));
    }

    #[test]
    fn mysql_quoted_identifiers_use_the_configured_dialect() {
        let facts =
            analyze_with_dialect("SELECT `id` FROM `orders`", &[], DialectKind::MySql).unwrap();
        assert!(facts.is_readonly);
        assert_eq!(facts.tables, ["`orders`"]);
    }
}
