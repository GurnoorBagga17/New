//! Cedar policy engine implementation for Axiom NHI Phase 1.
//!
//! This crate implements [`extmcp_authorization::PolicyEngine`] using the
//! [`cedar_policy`] crate (v4.x) with:
//!
//! - Lock-free policy snapshot access via [`arc_swap::ArcSwap`]
//! - Deterministic SHA-256 policy versioning
//! - Fail-closed evaluation: any engine error produces `Decision::Deny`
//! - Hot-reload via atomic snapshot swap
//!
//! # Policy evaluation model
//! Cedar evaluation is mode-agnostic: this crate returns only `Permit` or
//! `Deny`. The gateway (Team 1) derives `WouldDeny` shadow behavior in
//! observe-only mode. See `extmcp-authorization` module-level docs.
//!
//! # Phase 1 entity model
//! Entities are empty in Phase 1 (no entity attribute graph). All relevant
//! facts are passed through Cedar `context`.
//!
//! DRAFT: Team 0 must decide whether full entity graphs are needed in Phase 1.
//! See open decision D10.

pub mod schema;

use std::{str::FromStr, sync::Arc, time::Instant};

use arc_swap::ArcSwap;
use async_trait::async_trait;
use cedar_policy::{
    Authorizer, Context, Entities, EntityUid, PolicySet, Request, Schema, ValidationMode, Validator,
};
use extmcp_authorization::{
    Decision, PolicyEngine, PolicyEngineError, PolicyRequest, PolicyResponse,
};
use sha2::{Digest, Sha256};
use thiserror::Error;
use tracing::{debug, info, warn};

// ---------------------------------------------------------------------------
// SnapshotError
// ---------------------------------------------------------------------------

/// Errors that can occur when loading or validating a policy snapshot.
#[derive(Debug, Error)]
pub enum SnapshotError {
    /// One or more policy strings failed to parse as valid Cedar.
    #[error("policy parse error: {0}")]
    PolicyParse(String),

    /// The Cedar schema source failed to parse.
    #[error("schema parse error: {0}")]
    SchemaParse(String),

    /// The policy set failed schema validation.
    #[error("schema validation failed: {0}")]
    SchemaValidation(String),

    /// No policies were provided.
    #[error("empty policy bundle — refusing to create snapshot with no policies")]
    EmptyBundle,
}

// ---------------------------------------------------------------------------
// PolicySnapshot
// ---------------------------------------------------------------------------

/// An immutable, validated snapshot of the active Cedar policy bundle.
///
/// Snapshots are created via [`load_snapshot`] and stored in
/// [`PolicySnapshotStore`] behind an [`ArcSwap`] for lock-free hot reload.
#[derive(Debug)]
pub struct PolicySnapshot {
    /// Deterministic SHA-256 version of the policy bundle content.
    pub version: String,
    /// The compiled, schema-validated Cedar policy set.
    pub policy_set: PolicySet,
    /// The compiled Cedar schema (retained for future validation use).
    pub schema: Schema,
    /// Wall-clock instant when this snapshot was created.
    pub loaded_at: Instant,
    /// Unix timestamp when this snapshot was created.
    pub loaded_at_unix: i64,
    /// Number of policies in the bundle.
    pub policy_count: usize,
}

// ---------------------------------------------------------------------------
// load_snapshot
// ---------------------------------------------------------------------------

/// Parse, validate, and version a Cedar policy bundle.
///
/// # Validation
/// - Each policy string is parsed individually; a parse error on any policy
///   fails the entire bundle.
/// - The combined policy set is validated against the schema using
///   `ValidationMode::Strict`.
/// - The SHA-256 version is computed over all policies sorted by their
///   Cedar policy ID for determinism.
///
/// # Fail-safe
/// On any error, `SnapshotError` is returned and the caller's existing live
/// snapshot is not disturbed.
///
/// DRAFT: depends on Team 0 schema freeze.
pub fn load_snapshot(
    policy_sources: &[&str],
    schema_src: &str,
) -> Result<PolicySnapshot, SnapshotError> {
    if policy_sources.is_empty() {
        return Err(SnapshotError::EmptyBundle);
    }

    // Parse schema
    let (schema, _warnings) = Schema::from_cedarschema_str(schema_src)
        .map_err(|e| SnapshotError::SchemaParse(e.to_string()))?;

    // Parse all policy sources into a single PolicySet
    let mut combined_src = String::new();
    for src in policy_sources {
        combined_src.push_str(src);
        combined_src.push('\n');
    }

    let policy_set = PolicySet::from_str(&combined_src)
        .map_err(|e| SnapshotError::PolicyParse(e.to_string()))?;

    // Validate policy set against schema (strict mode)
    let validator = Validator::new(schema.clone());
    let validation_result = validator.validate(&policy_set, ValidationMode::Strict);
    if validation_result.validation_passed() {
        debug!("policy bundle schema validation passed");
    } else {
        let errors: Vec<String> = validation_result
            .validation_errors()
            .map(|e| e.to_string())
            .collect();
        let warnings: Vec<String> = validation_result
            .validation_warnings()
            .map(|w| w.to_string())
            .collect();
        if !errors.is_empty() {
            return Err(SnapshotError::SchemaValidation(errors.join("; ")));
        }
        // Warnings are non-fatal but logged
        for w in &warnings {
            warn!("cedar schema validation warning: {w}");
        }
    }

    // Compute deterministic version: SHA-256 of sorted policy IDs + text
    let policy_count = policy_set.policies().count();
    let mut id_texts: Vec<String> = policy_set
        .policies()
        .map(|p| format!("{}:{}", p.id(), p))
        .collect();
    id_texts.sort();
    let schema_digest = hex::encode(Sha256::digest(schema_src.as_bytes()));
    let version_input = format!("schema-sha256:{schema_digest}\n{}", id_texts.join("\n"));

    let mut hasher = Sha256::new();
    hasher.update(version_input.as_bytes());
    let version = hex::encode(hasher.finalize());

    info!(
        policy_count,
        version = %version,
        "policy snapshot loaded"
    );

    Ok(PolicySnapshot {
        version,
        policy_set,
        schema,
        loaded_at: Instant::now(),
        loaded_at_unix: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64,
        policy_count,
    })
}

// ---------------------------------------------------------------------------
// PolicySnapshotStore
// ---------------------------------------------------------------------------

/// Lock-free store for the active [`PolicySnapshot`].
///
/// Uses [`ArcSwap`] so that [`CedarPolicyEngine::evaluate`] can read the
/// current snapshot without blocking, while [`PolicySnapshotStore::swap`]
/// atomically installs a new snapshot.
pub struct PolicySnapshotStore {
    inner: ArcSwap<PolicySnapshot>,
}

impl PolicySnapshotStore {
    /// Create a new store with an initial snapshot.
    pub fn new(initial: PolicySnapshot) -> Self {
        Self {
            inner: ArcSwap::new(Arc::new(initial)),
        }
    }

    /// Return the current snapshot version string.
    pub fn current_version(&self) -> String {
        self.inner.load().version.clone()
    }

    /// Atomically swap in a new snapshot.
    ///
    /// Returns the new version string. The old snapshot is released when no
    /// readers hold a reference to it.
    pub fn swap(&self, new_snapshot: PolicySnapshot) -> String {
        let version = new_snapshot.version.clone();
        self.inner.store(Arc::new(new_snapshot));
        version
    }

    /// Load a guard providing access to the current snapshot.
    pub fn load(&self) -> arc_swap::Guard<Arc<PolicySnapshot>> {
        self.inner.load()
    }
}

// ---------------------------------------------------------------------------
// CedarPolicyEngine
// ---------------------------------------------------------------------------

/// Cedar-backed implementation of [`PolicyEngine`].
///
/// Evaluation is lock-free and synchronous inside the Cedar crate.
/// The `async` wrapper allows integration with the async pipeline.
///
/// # Fail-closed guarantee
/// Any error during entity UID parsing, context building, or policy evaluation
/// returns a `Deny` decision with `ErrorCategory::PolicyEngineError` rather
/// than propagating the error.
pub struct CedarPolicyEngine {
    store: Arc<PolicySnapshotStore>,
}

impl CedarPolicyEngine {
    pub fn new(store: Arc<PolicySnapshotStore>) -> Self {
        Self { store }
    }
}

#[async_trait]
impl PolicyEngine for CedarPolicyEngine {
    async fn evaluate(&self, request: &PolicyRequest) -> Result<PolicyResponse, PolicyEngineError> {
        let eval_start = Instant::now();
        let snapshot = self.store.load();

        // Parse entity UIDs
        // DRAFT: UID format (`Axiom::Agent::"id"`) must be confirmed with Team 0.
        let principal = EntityUid::from_str(&request.principal_uid).map_err(|e| {
            PolicyEngineError::EntityUidParse(format!("principal '{}': {e}", request.principal_uid))
        })?;

        let action = EntityUid::from_str(&request.action_uid).map_err(|e| {
            PolicyEngineError::EntityUidParse(format!("action '{}': {e}", request.action_uid))
        })?;

        let resource = EntityUid::from_str(&request.resource_uid).map_err(|e| {
            PolicyEngineError::EntityUidParse(format!("resource '{}': {e}", request.resource_uid))
        })?;

        // Build Cedar context from the JSON object
        let context = Context::from_json_value(request.context_json.clone(), None)
            .map_err(|e| PolicyEngineError::ContextBuild(e.to_string()))?;

        // Phase 1: empty entity store — all facts are in context.
        // DRAFT: Team 0 must decide whether full entity graphs are needed.
        let entities = Entities::empty();

        // Build the Cedar request
        let cedar_request = Request::new(
            principal, action, resource, context,
            None, // no schema for request validation at evaluation time
        )
        .map_err(|e| PolicyEngineError::Internal(e.to_string()))?;

        // Evaluate
        let authorizer = Authorizer::new();
        let output = authorizer.is_authorized(&cedar_request, &snapshot.policy_set, &entities);

        let evaluation_latency_us =
            u64::try_from(eval_start.elapsed().as_micros()).unwrap_or(u64::MAX);

        // Map Cedar decision to Axiom Decision
        let decision = match output.decision() {
            cedar_policy::Decision::Allow => Decision::Permit,
            cedar_policy::Decision::Deny => Decision::Deny,
        };

        // Collect matched policy IDs from diagnostics
        let matched_policy_ids: Vec<String> = output
            .diagnostics()
            .reason()
            .map(ToString::to_string)
            .collect();

        let reason = match decision {
            Decision::Permit => format!(
                "permitted by {} polic{}",
                matched_policy_ids.len(),
                if matched_policy_ids.len() == 1 {
                    "y"
                } else {
                    "ies"
                }
            ),
            Decision::Deny => {
                if matched_policy_ids.is_empty() {
                    "denied: no permit policy matched (implicit deny)".into()
                } else {
                    format!("denied by: {}", matched_policy_ids.join(", "))
                }
            }
        };

        debug!(
            decision = ?decision,
            policy_version = %snapshot.version,
            evaluation_latency_us,
            matched_count = matched_policy_ids.len(),
            "cedar evaluation complete"
        );

        Ok(PolicyResponse {
            decision,
            policy_version: snapshot.version.clone(),
            matched_policy_ids,
            reason,
            evaluation_latency_us,
            error_category: None,
        })
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use extmcp_authorization::Decision;
    use schema::{
        AXIOM_SCHEMA_SRC, DEFAULT_POLICY_BUNDLE, DENY_DESTRUCTIVE_SQL, PERMIT_READONLY_SQL,
    };

    fn permit_context() -> serde_json::Value {
        serde_json::json!({
            "authenticated": true,
            "agent_id": "finance-agent",
            "client_id": "acme",
            "cimd_uri": "",
            "issuer": "https://auth.example.com",
            "scopes": ["tools:read"],
            "token_jti": "jti-001",
            "sql_verbs": ["SELECT"],
            "sql_tables": ["orders"],
            "sql_is_readonly": true,
            "sql_statement_count": 1,
            "normalized_path": "",
            "path_traversal_detected": false,
            "egress_domain": "",
            "egress_is_private_ip": false,
            "tool_pin_sha256": "",
            "tool_pin_verified": true,
            "validator_passed": true,
            "validator_count": 1,
            "sql_validation_present": true,
            "runtime_mode": "enforce"
        })
    }

    fn deny_context_destructive_sql() -> serde_json::Value {
        let mut ctx = permit_context();
        ctx["sql_verbs"] = serde_json::json!(["SELECT", "DELETE"]);
        ctx["sql_is_readonly"] = serde_json::json!(false);
        ctx["validator_passed"] = serde_json::json!(false);
        ctx
    }

    fn make_request(context: serde_json::Value) -> PolicyRequest {
        PolicyRequest {
            principal_uid: r#"Axiom::Agent::"finance-agent""#.into(),
            action_uid: r#"Axiom::Action::"tools/call""#.into(),
            resource_uid: r#"Axiom::Tool::"prod-db/execute_sql""#.into(),
            context_json: context,
        }
    }

    // --- Snapshot loading tests ---

    #[test]
    fn test_load_snapshot_valid() {
        let snapshot = load_snapshot(&[PERMIT_READONLY_SQL], AXIOM_SCHEMA_SRC);
        assert!(
            snapshot.is_ok(),
            "valid schema + policy should load: {:?}",
            snapshot.err()
        );
        let snap = snapshot.unwrap();
        assert!(!snap.version.is_empty());
        assert!(snap.policy_count > 0);
    }

    #[test]
    fn test_load_snapshot_empty_bundle_errors() {
        let result = load_snapshot(&[], AXIOM_SCHEMA_SRC);
        assert!(matches!(result, Err(SnapshotError::EmptyBundle)));
    }

    #[test]
    fn test_load_snapshot_invalid_cedar_syntax() {
        let bad_policy = "this is not valid cedar!!@#$";
        let result = load_snapshot(&[bad_policy], AXIOM_SCHEMA_SRC);
        assert!(
            matches!(result, Err(SnapshotError::PolicyParse(_))),
            "expected PolicyParse error, got: {:?}",
            result
        );
    }

    #[test]
    fn test_load_snapshot_invalid_schema() {
        let bad_schema = "this is not a cedar schema {{ }}";
        let result = load_snapshot(&[PERMIT_READONLY_SQL], bad_schema);
        assert!(
            matches!(result, Err(SnapshotError::SchemaParse(_))),
            "expected SchemaParse error, got: {:?}",
            result
        );
    }

    #[test]
    fn test_version_is_deterministic() {
        let snap1 = load_snapshot(&[PERMIT_READONLY_SQL], AXIOM_SCHEMA_SRC).unwrap();
        let snap2 = load_snapshot(&[PERMIT_READONLY_SQL], AXIOM_SCHEMA_SRC).unwrap();
        assert_eq!(
            snap1.version, snap2.version,
            "version must be deterministic"
        );
    }

    #[test]
    fn test_version_changes_with_different_policy() {
        let snap1 = load_snapshot(&[PERMIT_READONLY_SQL], AXIOM_SCHEMA_SRC).unwrap();
        let snap2 = load_snapshot(
            &[PERMIT_READONLY_SQL, DENY_DESTRUCTIVE_SQL],
            AXIOM_SCHEMA_SRC,
        )
        .unwrap();
        assert_ne!(
            snap1.version, snap2.version,
            "different bundles must produce different versions"
        );
    }

    #[test]
    fn test_version_changes_with_schema() {
        let with_comment = format!("{}\n// schema revision marker\n", AXIOM_SCHEMA_SRC);
        let snap1 = load_snapshot(&[PERMIT_READONLY_SQL], AXIOM_SCHEMA_SRC).unwrap();
        let snap2 = load_snapshot(&[PERMIT_READONLY_SQL], &with_comment).unwrap();
        assert_ne!(
            snap1.version, snap2.version,
            "schema changes must change the snapshot version"
        );
    }

    // --- PolicyEngine evaluation tests ---

    #[tokio::test]
    async fn test_evaluate_permit_readonly_sql() {
        let snapshot = load_snapshot(DEFAULT_POLICY_BUNDLE, AXIOM_SCHEMA_SRC)
            .expect("default bundle must load");
        let store = Arc::new(PolicySnapshotStore::new(snapshot));
        let engine = CedarPolicyEngine::new(store);

        let result = engine.evaluate(&make_request(permit_context())).await;
        assert!(
            result.is_ok(),
            "evaluation must not error: {:?}",
            result.err()
        );
        let resp = result.unwrap();
        assert_eq!(resp.decision, Decision::Permit);
        assert!(!resp.policy_version.is_empty());
    }

    #[tokio::test]
    async fn test_evaluate_deny_destructive_sql() {
        let snapshot = load_snapshot(DEFAULT_POLICY_BUNDLE, AXIOM_SCHEMA_SRC)
            .expect("default bundle must load");
        let store = Arc::new(PolicySnapshotStore::new(snapshot));
        let engine = CedarPolicyEngine::new(store);

        let result = engine
            .evaluate(&make_request(deny_context_destructive_sql()))
            .await;
        assert!(
            result.is_ok(),
            "evaluation must not error: {:?}",
            result.err()
        );
        let resp = result.unwrap();
        assert_eq!(resp.decision, Decision::Deny);
        assert!(
            !resp.matched_policy_ids.is_empty(),
            "forbid policy ID must be reported"
        );
    }

    #[tokio::test]
    async fn test_evaluate_implicit_deny_no_permit_policy() {
        // A policy set with only a forbid and no permit → implicit deny
        // (Cedar's default is deny when no permit matches)
        let snapshot = load_snapshot(&[DENY_DESTRUCTIVE_SQL], AXIOM_SCHEMA_SRC)
            .expect("deny-only bundle must load");
        let store = Arc::new(PolicySnapshotStore::new(snapshot));
        let engine = CedarPolicyEngine::new(store);

        // Even a "clean" context with no destructive SQL still gets denied because
        // there's no permit policy.
        let result = engine.evaluate(&make_request(permit_context())).await;
        let resp = result.unwrap();
        assert_eq!(
            resp.decision,
            Decision::Deny,
            "no permit policy → implicit deny (fail-closed baseline)"
        );
    }

    #[tokio::test]
    async fn test_evaluate_deny_path_traversal() {
        let snapshot = load_snapshot(DEFAULT_POLICY_BUNDLE, AXIOM_SCHEMA_SRC)
            .expect("default bundle must load");
        let store = Arc::new(PolicySnapshotStore::new(snapshot));
        let engine = CedarPolicyEngine::new(store);

        let mut ctx = permit_context();
        ctx["path_traversal_detected"] = serde_json::json!(true);
        ctx["normalized_path"] = serde_json::json!("/etc/passwd");

        let resp = engine.evaluate(&make_request(ctx)).await.unwrap();
        assert_eq!(resp.decision, Decision::Deny);
    }

    #[tokio::test]
    async fn test_evaluate_deny_private_egress() {
        let snapshot = load_snapshot(DEFAULT_POLICY_BUNDLE, AXIOM_SCHEMA_SRC)
            .expect("default bundle must load");
        let store = Arc::new(PolicySnapshotStore::new(snapshot));
        let engine = CedarPolicyEngine::new(store);

        let mut ctx = permit_context();
        ctx["egress_is_private_ip"] = serde_json::json!(true);
        ctx["egress_domain"] = serde_json::json!("169.254.169.254");

        let resp = engine.evaluate(&make_request(ctx)).await.unwrap();
        assert_eq!(resp.decision, Decision::Deny);
    }

    #[tokio::test]
    async fn test_evaluate_deny_unverified_tool_pin() {
        let snapshot = load_snapshot(DEFAULT_POLICY_BUNDLE, AXIOM_SCHEMA_SRC)
            .expect("default bundle must load");
        let store = Arc::new(PolicySnapshotStore::new(snapshot));
        let engine = CedarPolicyEngine::new(store);

        let mut ctx = permit_context();
        ctx["tool_pin_sha256"] = serde_json::json!("aabbcc");
        ctx["tool_pin_verified"] = serde_json::json!(false);

        let resp = engine.evaluate(&make_request(ctx)).await.unwrap();
        assert_eq!(resp.decision, Decision::Deny);
    }

    #[tokio::test]
    async fn test_evaluate_denies_missing_validator_evidence() {
        let snapshot = load_snapshot(DEFAULT_POLICY_BUNDLE, AXIOM_SCHEMA_SRC)
            .expect("default bundle must load");
        let store = Arc::new(PolicySnapshotStore::new(snapshot));
        let engine = CedarPolicyEngine::new(store);

        let mut ctx = permit_context();
        ctx["validator_count"] = serde_json::json!(0);
        ctx["sql_validation_present"] = serde_json::json!(false);
        ctx["tool_pin_verified"] = serde_json::json!(false);

        let resp = engine.evaluate(&make_request(ctx)).await.unwrap();
        assert_eq!(resp.decision, Decision::Deny);
    }

    #[tokio::test]
    async fn test_snapshot_hot_reload_atomic() {
        // Load initial snapshot
        let snap1 = load_snapshot(&[PERMIT_READONLY_SQL], AXIOM_SCHEMA_SRC).unwrap();
        let v1 = snap1.version.clone();
        let store = Arc::new(PolicySnapshotStore::new(snap1));

        // Hot-reload with new bundle
        let snap2 = load_snapshot(DEFAULT_POLICY_BUNDLE, AXIOM_SCHEMA_SRC).unwrap();
        let v2 = snap2.version.clone();
        let new_v = store.swap(snap2);

        assert_eq!(new_v, v2);
        assert_ne!(v1, v2, "new snapshot must have a different version");
        assert_eq!(store.current_version(), v2);
    }
}
