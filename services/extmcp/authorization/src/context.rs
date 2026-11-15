//! Cedar context builder.
//!
//! Merges structured facts from [`IdentityContext`] and [`ValidatorResult`]
//! into a flat JSON object for use as Cedar `context`.
//!
//! # Design note
//! Cedar receives only pre-parsed, normalized facts. Raw SQL, file paths,
//! and bearer token values are never placed in Cedar context. See Team 4
//! (validators) for argument normalization and Team 3 (identity) for JWT
//! verification.

use serde_json::{json, Value};

use crate::{IdentityContext, ValidatorResult};

/// Build the Cedar evaluation context from verified identity and validator facts.
///
/// The returned [`Value`] is a flat JSON object conforming to the
/// `axiom.cedarschema` context record. All attributes are present so that
/// Cedar policies can reference them without an "attribute absent" error.
///
/// # Security
/// - Bearer token values are never included.
/// - Raw SQL or path strings are never included; only structured boolean/set
///   attributes produced by Team 4 validators.
///
/// DRAFT: Attribute names and types must be aligned with the axiom.cedarschema
/// when it is frozen by Team 0.
pub fn build_cedar_context(
    identity: &IdentityContext,
    validators: &[ValidatorResult],
    // DRAFT: included for audit-only policies; Cedar evaluation is mode-agnostic
    runtime_mode: &str,
) -> Value {
    // --- Aggregate validator facts across all results ---
    let mut sql_verbs: Vec<Value> = vec![];
    let mut sql_tables: Vec<Value> = vec![];
    let mut sql_is_readonly: Option<bool> = None;
    let mut sql_statement_count: u32 = 0;
    let mut normalized_path = String::new();
    let mut path_traversal_detected = false;
    let mut egress_domain = String::new();
    let mut egress_is_private_ip = false;
    let mut tool_pin_sha256 = String::new();
    let mut tool_pin_validation_present = false;
    let mut tool_pin_verified = true;
    let mut all_validators_passed = !validators.is_empty();
    let mut sql_validation_present = false;

    for vr in validators {
        if vr.validator_id == "sql" {
            sql_validation_present = true;
            sql_is_readonly = Some(sql_is_readonly.unwrap_or(true) && vr.sql_is_readonly);
        }
        // SQL facts
        for verb in &vr.sql_verbs {
            let v = json!(verb);
            if !sql_verbs.contains(&v) {
                sql_verbs.push(v);
            }
        }
        for table in &vr.sql_tables {
            let t = json!(table);
            if !sql_tables.contains(&t) {
                sql_tables.push(t);
            }
        }
        sql_statement_count = sql_statement_count.saturating_add(vr.sql_statement_count);

        // Filesystem facts
        if let Some(ref p) = vr.normalized_path {
            normalized_path = p.clone();
        }
        if vr.path_traversal_detected {
            path_traversal_detected = true;
        }

        // Egress facts
        if let Some(ref d) = vr.egress_domain {
            egress_domain = d.clone();
        }
        if vr.egress_is_private_ip {
            egress_is_private_ip = true;
        }

        // Tool-pin facts
        if vr.validator_id == "tool-pinning" {
            tool_pin_validation_present = true;
            if let Some(ref sha) = vr.tool_pin_sha256 {
                tool_pin_sha256 = sha.clone();
            }
            tool_pin_verified &= vr.tool_pin_verified;
        }

        if !vr.passed {
            all_validators_passed = false;
        }
    }

    json!({
        // Identity facts (from Team 3)
        "authenticated":        identity.authenticated,
        "agent_id":             identity.agent_id,
        "client_id":            identity.client_id,
        "cimd_uri":             identity.cimd_uri.clone().unwrap_or_default(),
        "issuer":               identity.issuer,
        "scopes":               identity.scopes,
        // SECURITY: token_jti is included for audit-only context;
        // it is not sensitive (not the token itself).
        "token_jti":            identity.token_jti,

        // SQL validator facts (from Team 4)
        "sql_verbs":            sql_verbs,
        "sql_tables":           sql_tables,
        "sql_is_readonly":      sql_is_readonly.unwrap_or(false),
        "sql_statement_count":  sql_statement_count,

        // Filesystem validator facts (from Team 4)
        "normalized_path":          normalized_path,
        "path_traversal_detected":  path_traversal_detected,

        // Egress validator facts (from Team 4)
        "egress_domain":        egress_domain,
        "egress_is_private_ip": egress_is_private_ip,

        // Tool-pin validator facts (from Team 4)
        "tool_pin_sha256":      tool_pin_sha256,
        "tool_pin_verified":    tool_pin_validation_present && tool_pin_verified,

        // Aggregate
        "validator_passed":     all_validators_passed,
        "validator_count":      validators.len() as u64,
        "sql_validation_present": sql_validation_present,

        // Runtime mode — DRAFT: audit-only; policies SHOULD NOT branch on this.
        // See module-level design notes in lib.rs.
        "runtime_mode":         runtime_mode,
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{IdentityContext, ValidatorResult};

    fn sample_identity() -> IdentityContext {
        IdentityContext {
            authenticated: true,
            agent_id: "finance-agent".into(),
            client_id: "acme-client".into(),
            cimd_uri: Some("https://cimd.example.com".into()),
            issuer: "https://auth.example.com".into(),
            audience: vec!["mcp://prod-db".into()],
            scopes: vec!["tools:read".into()],
            token_jti: "jti-xyz".into(),
            expires_at_unix: 9_999_999_999,
        }
    }

    fn sql_validator(readonly: bool, verbs: &[&str]) -> ValidatorResult {
        ValidatorResult {
            validator_id: "sql".into(),
            passed: readonly,
            violation_code: if readonly {
                None
            } else {
                Some("DESTRUCTIVE_SQL".into())
            },
            reason: None,
            sql_verbs: verbs.iter().map(|&s| s.into()).collect(),
            sql_tables: vec!["orders".into()],
            sql_is_readonly: readonly,
            sql_statement_count: 1,
            normalized_path: None,
            path_traversal_detected: false,
            egress_domain: None,
            egress_is_private_ip: false,
            tool_pin_sha256: None,
            tool_pin_verified: true,
        }
    }

    #[test]
    fn test_context_contains_identity_fields() {
        let ctx = build_cedar_context(&sample_identity(), &[], "enforce");
        assert_eq!(ctx["authenticated"], true);
        assert_eq!(ctx["agent_id"], "finance-agent");
        assert_eq!(ctx["client_id"], "acme-client");
        assert_eq!(ctx["issuer"], "https://auth.example.com");
        assert_eq!(ctx["cimd_uri"], "https://cimd.example.com");
        assert_eq!(ctx["token_jti"], "jti-xyz");
    }

    #[test]
    fn test_context_merges_sql_verbs_dedup() {
        let v1 = sql_validator(true, &["SELECT"]);
        let mut v2 = sql_validator(true, &["SELECT", "SHOW"]);
        v2.validator_id = "sql-2".into();
        let ctx = build_cedar_context(&sample_identity(), &[v1, v2], "enforce");
        let verbs = ctx["sql_verbs"].as_array().unwrap();
        // SELECT appears in both — should be deduplicated
        let select_count = verbs.iter().filter(|v| v == &&json!("SELECT")).count();
        assert_eq!(select_count, 1, "SELECT should be deduplicated");
        assert!(verbs.contains(&json!("SHOW")));
    }

    #[test]
    fn test_context_readonly_false_if_any_nonreadonly() {
        let readonly = sql_validator(true, &["SELECT"]);
        let destructive = sql_validator(false, &["DELETE"]);
        let ctx = build_cedar_context(&sample_identity(), &[readonly, destructive], "enforce");
        assert_eq!(ctx["sql_is_readonly"], false);
        assert_eq!(ctx["validator_passed"], false);
    }

    #[test]
    fn test_context_path_traversal_aggregation() {
        let mut v = sql_validator(true, &[]);
        v.path_traversal_detected = true;
        v.normalized_path = Some("/etc/passwd".into());
        let ctx = build_cedar_context(&sample_identity(), &[v], "enforce");
        assert_eq!(ctx["path_traversal_detected"], true);
        assert_eq!(ctx["normalized_path"], "/etc/passwd");
    }

    #[test]
    fn test_context_private_ip_aggregation() {
        let mut v = sql_validator(true, &[]);
        v.egress_is_private_ip = true;
        v.egress_domain = Some("169.254.169.254".into());
        let ctx = build_cedar_context(&sample_identity(), &[v], "enforce");
        assert_eq!(ctx["egress_is_private_ip"], true);
        assert_eq!(ctx["egress_domain"], "169.254.169.254");
    }

    #[test]
    fn test_context_tool_pin_unverified() {
        let mut v = sql_validator(true, &[]);
        v.validator_id = "tool-pinning".into();
        v.tool_pin_verified = false;
        v.tool_pin_sha256 = Some("aabbcc".into());
        v.passed = false;
        let ctx = build_cedar_context(&sample_identity(), &[v], "enforce");
        assert_eq!(ctx["tool_pin_verified"], false);
        assert_eq!(ctx["tool_pin_sha256"], "aabbcc");
        assert_eq!(ctx["validator_passed"], false);
    }

    #[test]
    fn test_context_runtime_mode_included() {
        let ctx = build_cedar_context(&sample_identity(), &[], "observe");
        assert_eq!(ctx["runtime_mode"], "observe");
    }

    #[test]
    fn empty_validator_results_fail_closed() {
        let ctx = build_cedar_context(&sample_identity(), &[], "enforce");
        assert_eq!(ctx["validator_passed"], false);
        assert_eq!(ctx["validator_count"], 0);
        assert_eq!(ctx["sql_validation_present"], false);
        assert_eq!(ctx["sql_is_readonly"], false);
        assert_eq!(ctx["tool_pin_verified"], false);
    }

    #[test]
    fn test_context_no_bearer_token() {
        // Confirm raw bearer tokens are never in the context object
        let ctx = build_cedar_context(&sample_identity(), &[], "enforce");
        let ctx_str = ctx.to_string();
        // token_jti is fine (it's the JWT ID, not the token)
        // But the raw header value "Bearer ..." should never appear
        assert!(
            !ctx_str.contains("Bearer"),
            "raw bearer token must not appear in Cedar context"
        );
    }
}
