//! Adapter from configured validator profiles to Team 2's typed seam.

use std::{collections::HashMap, path::PathBuf};

use async_trait::async_trait;
use extmcp_authorization::{ArgumentValidator, ValidatorError, ValidatorResult};
use serde_json::Value;

use crate::{
    egress::EgressValidator,
    filesystem::{validate_path, PathValidationError},
    sql, tool_pin,
};

#[derive(Debug, Clone)]
pub struct PathArgumentSpec {
    pub argument_name: String,
    pub root: PathBuf,
}

#[derive(Debug, Clone)]
pub struct EgressArgumentSpec {
    pub argument_name: String,
    pub allowed_hosts: Vec<String>,
}

/// Explicit trusted configuration for one server-side tool definition.
/// Profile selection is by exact configured server and tool; no validators
/// are inferred from client-supplied names or argument shapes.
#[derive(Debug, Clone)]
pub struct ToolValidationProfile {
    pub target_server: String,
    pub tool_name: String,
    pub tool_definition: Value,
    pub expected_tool_sha256: String,
    pub sql_argument: Option<String>,
    pub sql_dialect: sql::DialectKind,
    pub allowed_sql_functions: Vec<String>,
    pub path_arguments: Vec<PathArgumentSpec>,
    pub egress_arguments: Vec<EgressArgumentSpec>,
}

pub struct AxiomArgumentValidator {
    profiles: HashMap<(String, String), ToolValidationProfile>,
}

impl AxiomArgumentValidator {
    pub fn new(profiles: Vec<ToolValidationProfile>) -> Result<Self, ValidatorError> {
        let mut indexed = HashMap::new();
        for profile in profiles {
            let pin = tool_pin::verify(&profile.tool_definition, &profile.expected_tool_sha256)
                .map_err(|error| ValidatorError::Internal(error.to_string()))?;
            if !pin.verified {
                return Err(ValidatorError::Internal(format!(
                    "configured tool definition pin does not match for '{}'",
                    profile.tool_name
                )));
            }
            let key = (profile.target_server.clone(), profile.tool_name.clone());
            if indexed.insert(key.clone(), profile).is_some() {
                return Err(ValidatorError::Internal(format!(
                    "duplicate validator profile for '{}/{}'",
                    key.0, key.1
                )));
            }
        }
        Ok(Self { profiles: indexed })
    }

    async fn validate_profile(
        &self,
        profile: &ToolValidationProfile,
        args: &Value,
    ) -> Vec<ValidatorResult> {
        let mut results = Vec::new();
        let pin = tool_pin::verify(&profile.tool_definition, &profile.expected_tool_sha256);
        match pin {
            Ok(facts) => results.push(ValidatorResult {
                validator_id: "tool-pinning".into(),
                passed: facts.verified,
                violation_code: (!facts.verified).then(|| "TOOL_PIN_MISMATCH".into()),
                reason: (!facts.verified).then(|| {
                    "registered tool definition does not match its configured digest".into()
                }),
                sql_verbs: vec![],
                sql_tables: vec![],
                sql_is_readonly: false,
                sql_statement_count: 0,
                normalized_path: None,
                path_traversal_detected: false,
                egress_domain: None,
                egress_is_private_ip: false,
                tool_pin_sha256: Some(facts.sha256),
                tool_pin_verified: facts.verified,
            }),
            Err(error) => {
                results.push(failure("tool-pinning", "TOOL_PIN_ERROR", error.to_string()))
            }
        }

        if let Some(argument_name) = &profile.sql_argument {
            let result = match args.get(argument_name).and_then(Value::as_str) {
                Some(statement) => match sql::analyze_with_dialect(
                    statement,
                    &profile.allowed_sql_functions,
                    profile.sql_dialect,
                ) {
                    Ok(facts) => ValidatorResult {
                        validator_id: "sql".into(),
                        passed: true,
                        violation_code: None,
                        reason: None,
                        sql_verbs: facts.verbs,
                        sql_tables: facts.tables,
                        sql_is_readonly: facts.is_readonly,
                        sql_statement_count: facts.statement_count,
                        normalized_path: None,
                        path_traversal_detected: false,
                        egress_domain: None,
                        egress_is_private_ip: false,
                        tool_pin_sha256: None,
                        tool_pin_verified: false,
                    },
                    Err(error) => failure("sql", "SQL_PARSE_FAILED", error.to_string()),
                },
                None => failure(
                    "sql",
                    "SQL_ARGUMENT_MISSING",
                    "configured SQL argument is missing or not a string",
                ),
            };
            results.push(result);
        }

        for spec in &profile.path_arguments {
            let result = match args.get(&spec.argument_name).and_then(Value::as_str) {
                Some(path) => match validate_path(&spec.root, path) {
                    Ok(facts) => ValidatorResult {
                        validator_id: "filesystem".into(),
                        passed: true,
                        violation_code: None,
                        reason: None,
                        sql_verbs: vec![],
                        sql_tables: vec![],
                        sql_is_readonly: false,
                        sql_statement_count: 0,
                        normalized_path: facts.normalized_path,
                        path_traversal_detected: facts.traversal_detected,
                        egress_domain: None,
                        egress_is_private_ip: false,
                        tool_pin_sha256: None,
                        tool_pin_verified: false,
                    },
                    Err(error) => {
                        let traversal = matches!(&error, PathValidationError::OutsideRoot);
                        let mut failed = failure(
                            "filesystem",
                            if traversal {
                                "PATH_OUTSIDE_ROOT"
                            } else {
                                "PATH_INVALID"
                            },
                            error.to_string(),
                        );
                        failed.path_traversal_detected = traversal;
                        failed
                    }
                },
                None => failure(
                    "filesystem",
                    "PATH_ARGUMENT_MISSING",
                    "configured path argument is missing or not a string",
                ),
            };
            results.push(result);
        }

        for spec in &profile.egress_arguments {
            let result = match args.get(&spec.argument_name).and_then(Value::as_str) {
                Some(url) => {
                    let facts = EgressValidator::new(spec.allowed_hosts.clone())
                        .validate(url)
                        .await;
                    ValidatorResult {
                        validator_id: "egress".into(),
                        passed: facts.passed,
                        violation_code: facts.violation_code,
                        reason: None,
                        sql_verbs: vec![],
                        sql_tables: vec![],
                        sql_is_readonly: false,
                        sql_statement_count: 0,
                        normalized_path: None,
                        path_traversal_detected: false,
                        egress_domain: facts.domain,
                        egress_is_private_ip: facts.is_private_ip,
                        tool_pin_sha256: None,
                        tool_pin_verified: false,
                    }
                }
                None => failure(
                    "egress",
                    "EGRESS_ARGUMENT_MISSING",
                    "configured URL argument is missing or not a string",
                ),
            };
            results.push(result);
        }
        results
    }
}

#[async_trait]
impl ArgumentValidator for AxiomArgumentValidator {
    async fn validate(
        &self,
        method: &str,
        target_server: &str,
        tool_name: &str,
        raw_arguments: &Value,
    ) -> Result<Vec<ValidatorResult>, ValidatorError> {
        if method != "tools/call" {
            return Ok(Vec::new());
        }
        let arguments = raw_arguments
            .get("arguments")
            .filter(|value| value.is_object())
            .unwrap_or(raw_arguments);
        let Some(profile) = self
            .profiles
            .get(&(target_server.to_owned(), tool_name.to_owned()))
        else {
            return Ok(vec![failure(
                "tool-pinning",
                "TOOL_PROFILE_MISSING",
                "no trusted validation profile is registered for this tool",
            )]);
        };
        Ok(self.validate_profile(profile, arguments).await)
    }
}

fn failure(validator_id: &str, code: &str, reason: impl Into<String>) -> ValidatorResult {
    ValidatorResult {
        validator_id: validator_id.into(),
        passed: false,
        violation_code: Some(code.into()),
        reason: Some(reason.into()),
        sql_verbs: vec![],
        sql_tables: vec![],
        sql_is_readonly: false,
        sql_statement_count: 0,
        normalized_path: None,
        path_traversal_detected: false,
        egress_domain: None,
        egress_is_private_ip: false,
        tool_pin_sha256: None,
        tool_pin_verified: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn profile() -> ToolValidationProfile {
        let definition = json!({"name":"run_sql","inputSchema":{"type":"object"}});
        let pin = tool_pin::digest(&definition).unwrap();
        ToolValidationProfile {
            target_server: "mcp://prod-db".into(),
            tool_name: "run_sql".into(),
            tool_definition: definition,
            expected_tool_sha256: pin,
            sql_argument: Some("query".into()),
            sql_dialect: sql::DialectKind::Generic,
            allowed_sql_functions: vec!["count".into()],
            path_arguments: vec![],
            egress_arguments: vec![],
        }
    }

    #[tokio::test]
    async fn exact_profile_returns_pin_and_sql_facts() {
        let validator = AxiomArgumentValidator::new(vec![profile()]).unwrap();
        let results = validator
            .validate(
                "tools/call",
                "mcp://prod-db",
                "run_sql",
                &json!({"name":"run_sql","arguments":{"query":"SELECT count(*) FROM orders"}}),
            )
            .await
            .unwrap();
        assert_eq!(results.len(), 2);
        assert!(results.iter().all(|result| result.passed));
        assert!(results
            .iter()
            .any(|result| result.validator_id == "sql" && result.sql_is_readonly));
    }

    #[tokio::test]
    async fn unregistered_tools_fail_closed() {
        let validator = AxiomArgumentValidator::new(vec![]).unwrap();
        let results = validator
            .validate(
                "tools/call",
                "mcp://prod-db",
                "unknown",
                &json!({"name":"run_sql","arguments":{}}),
            )
            .await
            .unwrap();
        assert_eq!(results.len(), 1);
        assert!(!results[0].passed);
        assert_eq!(
            results[0].violation_code.as_deref(),
            Some("TOOL_PROFILE_MISSING")
        );

        let identity = extmcp_authorization::IdentityContext {
            authenticated: true,
            agent_id: "agent".into(),
            client_id: "client".into(),
            cimd_uri: None,
            issuer: "https://issuer.example".into(),
            audience: vec!["mcp://server".into()],
            scopes: vec![],
            token_jti: "jti".into(),
            expires_at_unix: 2_000_000_000,
        };
        let context =
            extmcp_authorization::context::build_cedar_context(&identity, &results, "enforce");
        assert_eq!(context["validator_passed"], false);
        assert_eq!(context["validator_count"], 1);
        assert_eq!(context["tool_pin_verified"], false);
    }

    #[tokio::test]
    async fn profile_is_bound_to_configured_server_and_tool() {
        let validator = AxiomArgumentValidator::new(vec![profile()]).unwrap();
        let results = validator
            .validate(
                "tools/call",
                "mcp://other-server",
                "run_sql",
                &json!({"name":"run_sql","arguments":{"query":"SELECT 1"}}),
            )
            .await
            .unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(
            results[0].violation_code.as_deref(),
            Some("TOOL_PROFILE_MISSING")
        );
        assert!(!results[0].passed);
    }

    #[test]
    fn refuses_a_bad_pin_at_registration_time() {
        let mut config = profile();
        config.expected_tool_sha256 = "0".repeat(64);
        assert!(AxiomArgumentValidator::new(vec![config]).is_err());
    }
}
