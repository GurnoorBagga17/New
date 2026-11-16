//! # extmcp-authorization
//!
//! Main orchestration crate for the Axiom NHI policy pipeline.
//!
//! This crate owns the [`CheckPipeline`] orchestrator which sequences:
//! 1. Kill-switch / revocation check (Team 5 seam)
//! 2. Identity verification (Team 3 seam)
//! 3. Argument & tool-pin validation (Team 4 seam)
//! 4. Cedar authorization (Team 2, implemented in `extmcp-cedar`)
//!
//! ## Design decisions recorded here
//!
//! - `WouldDeny` is NOT returned from Cedar evaluation. Cedar returns only
//!   `Permit | Deny`. The gateway (Team 1) derives `WouldDeny` shadow behavior
//!   in observe-only mode by forwarding despite receiving `Deny`. The policy
//!   pipeline is mode-agnostic. This avoids leaking runtime-mode awareness into
//!   policy evaluation.
//!
//! - On policy errors (parse fail, schema fail, missing required context in
//!   enforce mode): return `Deny` with an explicit `ErrorCategory` in
//!   `PolicyResponse`.
//!
//! - On callout timeout: Team 1 fails closed in enforce mode (the 15 ms
//!   deadline is owned by Team 1, not Team 2). Team 2 must respond within its
//!   own budget.
//!
//! - All Team 3/4/5 integration points are behind typed traits (mockable
//!   seams), not direct calls.
//!
//! # Contract version
//! All shared types mirror Team 0 draft contracts v0.1.0-draft.
//! Fields must not be renamed or retyped without proposing a contract change.

pub mod context;
pub mod identity_adapter;

use std::sync::Arc;
use std::time::Instant;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tracing::{debug, error, warn};

// ---------------------------------------------------------------------------
// § Domain types — mirroring Team 0 draft contracts v0.1.0-draft
// ---------------------------------------------------------------------------

/// Runtime mode indicating whether the gateway enforces or only observes policy.
///
/// DRAFT: depends on Team 0 contract freeze.
/// NOTE: `WouldDeny` is intentionally absent from this enum because Cedar
/// evaluation is mode-agnostic. See module-level docs for the design decision.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RuntimeMode {
    /// Policy decisions are enforced — deny terminates the request.
    Enforce,
    /// Policy decisions are observed only — deny is logged but the request is
    /// forwarded (shadow / canary mode). Team 1 owns this behaviour.
    Observe,
}

/// The binary authorization decision returned by Cedar.
///
/// DRAFT: depends on Team 0 contract freeze.
/// `WouldDeny` is NOT present here — see module-level design notes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Decision {
    /// The request is permitted by policy.
    Permit,
    /// The request is denied by policy (or by a pipeline error — see
    /// [`ErrorCategory`] on [`PolicyResponse`]).
    Deny,
}

/// Structured category for denials that originate from pipeline errors rather
/// than explicit Cedar policy decisions.
///
/// DRAFT: depends on Team 0 contract freeze.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCategory {
    /// A kill-switch or per-entity revocation entry matched.
    Revoked,
    /// Identity verification (Team 3) failed — invalid or expired credential.
    AuthenticationFailure,
    /// Argument or tool-pin validation (Team 4) failed.
    ValidatorFailure,
    /// Cedar engine returned an error (parse, schema, or context fault).
    PolicyEngineError,
    /// An internal pipeline error not attributable to a specific stage.
    InternalError,
}

/// Full request envelope from the gateway.
///
/// DRAFT: depends on Team 0 contract freeze.
/// Fields mirror the Team 0 `RuntimeRequest` struct exactly.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeRequest {
    /// Unique request identifier for correlation.
    pub request_id: String,
    /// Distributed trace identifier.
    pub trace_id: String,
    /// MCP session identifier.
    pub mcp_session_id: String,
    /// MCP method being invoked (e.g. `tools/call`).
    pub mcp_method: String,
    /// Configured canonical MCP resource URI used for exact JWT audience binding.
    pub target_server: String,
    /// Tool being called on the target server.
    pub tool_name: String,
    /// Raw JSON arguments supplied by the caller.
    pub raw_arguments: serde_json::Value,
    /// Runtime mode — owned by Team 1; Cedar evaluation is mode-agnostic.
    pub runtime_mode: RuntimeMode,
    /// Raw Authorization header value.
    // SECURITY: never log raw_auth_header
    pub raw_auth_header: Option<String>,
}

/// Verified identity facts produced by Team 3.
///
/// DRAFT: depends on Team 0 contract freeze.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdentityContext {
    /// Whether the credential passed cryptographic verification.
    pub authenticated: bool,
    /// Stable agent identifier (e.g. `finance-agent`).
    pub agent_id: String,
    /// OAuth2 / OIDC client identifier.
    pub client_id: String,
    /// CIMD URI for the authenticated non-human identity, if present.
    pub cimd_uri: Option<String>,
    /// Token issuer URI.
    pub issuer: String,
    /// Audiences claimed by the token.
    pub audience: Vec<String>,
    /// OAuth2 scopes granted.
    pub scopes: Vec<String>,
    /// JWT `jti` claim — used for per-token revocation checks.
    pub token_jti: String,
    /// Token expiry as a Unix timestamp.
    pub expires_at_unix: i64,
}

/// Structured validator facts produced by Team 4.
///
/// DRAFT: depends on Team 0 contract freeze.
/// Returns structural facts, never policy decisions — policy is Cedar's job.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidatorResult {
    /// Identifier of the validator that produced this result.
    pub validator_id: String,
    /// Whether the validator's own checks passed.
    pub passed: bool,
    /// Machine-readable violation code if `passed` is false.
    pub violation_code: Option<String>,
    /// Human-readable explanation of a violation.
    pub reason: Option<String>,
    /// SQL verbs found in the arguments (e.g. `SELECT`, `DELETE`).
    pub sql_verbs: Vec<String>,
    /// SQL table names referenced.
    pub sql_tables: Vec<String>,
    /// Whether all detected SQL statements are read-only.
    pub sql_is_readonly: bool,
    /// Number of SQL statements detected.
    pub sql_statement_count: u32,
    /// Normalised file path, if the tool operates on a path.
    pub normalized_path: Option<String>,
    /// Whether a path traversal attempt was detected.
    pub path_traversal_detected: bool,
    /// Egress domain extracted from arguments.
    pub egress_domain: Option<String>,
    /// Whether the egress target resolves to a private/RFC-1918 IP.
    pub egress_is_private_ip: bool,
    /// SHA-256 of the tool definition that was pinned.
    pub tool_pin_sha256: Option<String>,
    /// Whether the tool's current definition matches the pin.
    pub tool_pin_verified: bool,
}

/// Input to the Cedar authorization engine.
///
/// DRAFT: depends on Team 0 contract freeze.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyRequest {
    /// Cedar principal UID, e.g. `Axiom::Agent::"finance-agent"`.
    pub principal_uid: String,
    /// Cedar action UID, e.g. `Axiom::Action::"tools/call"`.
    pub action_uid: String,
    /// Cedar resource UID, e.g. `Axiom::Tool::"prod-db/execute_sql"`.
    pub resource_uid: String,
    /// Flat JSON object passed as Cedar `context`.
    pub context_json: serde_json::Value,
}

/// Authorization decision returned by Cedar and enriched by the pipeline.
///
/// DRAFT: depends on Team 0 contract freeze.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyResponse {
    /// Binary permit/deny decision.
    pub decision: Decision,
    /// SHA-256 of the policy bundle that was evaluated.
    pub policy_version: String,
    /// IDs of Cedar policies that matched (non-empty on explicit allow/deny).
    pub matched_policy_ids: Vec<String>,
    /// Human-readable reason string.
    pub reason: String,
    /// Wall-clock evaluation time inside the Cedar engine, in microseconds.
    pub evaluation_latency_us: u64,
    /// Set when the decision is `Deny` due to a pipeline or engine error.
    pub error_category: Option<ErrorCategory>,
}

// ---------------------------------------------------------------------------
// § Mockable seams to other teams
// ---------------------------------------------------------------------------

/// Error type for identity verification failures.
#[derive(Debug, Error)]
pub enum IdentityError {
    /// The credential was missing, malformed, or could not be decoded.
    #[error("credential decode failed: {0}")]
    DecodeFailed(String),
    /// The credential signature is invalid.
    #[error("signature invalid: {0}")]
    SignatureInvalid(String),
    /// The credential has expired.
    #[error("credential expired at unix {0}")]
    Expired(i64),
    /// A downstream call required for verification timed out.
    #[error("identity verification timeout")]
    Timeout,
    /// An internal error in the verifier.
    #[error("identity verifier internal error: {0}")]
    Internal(String),
    /// A typed authentication failure produced by Team 3.
    #[error("authentication rejected ({reason}): {message}")]
    Rejected {
        reason: axiom_identity::FailureReason,
        message: String,
    },
}

/// Error type for argument/tool-pin validation failures.
#[derive(Debug, Error)]
pub enum ValidatorError {
    /// The validator itself encountered an internal error (distinct from a
    /// validation violation, which is expressed in [`ValidatorResult`]).
    #[error("validator internal error: {0}")]
    Internal(String),
    /// A downstream call required for validation timed out.
    #[error("validator timeout")]
    Timeout,
}

/// Outcome of a synchronous revocation check.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RevocationOutcome {
    /// No revocation entry matched.
    Active,
    /// A kill-switch or per-entity revocation entry matched.
    Revoked {
        /// Human-readable reason from the revocation table.
        reason: String,
    },
}

/// Mockable seam to Team 3 — identity verification.
///
/// # Contract
/// Implementations MUST NOT perform JWT crypto directly in this crate.
/// Only the Team 3 implementation is authorised to decode credentials.
///
/// DRAFT-SEAM: Team 3 — do not implement JWT crypto here.
/// Returns [`IdentityContext`] or a typed [`IdentityError`].
#[async_trait]
pub trait IdentityVerifier: Send + Sync {
    /// Verify the raw Authorization header for the given target server.
    ///
    /// # Security
    /// The `raw_auth_header` value MUST NOT be logged by any implementation.
    async fn verify(
        &self,
        // SECURITY: never log raw_auth_header
        raw_auth_header: Option<&str>,
        target_server: &str,
        mcp_session_id: &str,
        request_id: &str,
    ) -> Result<IdentityContext, IdentityError>;
}

/// Mockable seam to Team 4 — argument and tool-pin validation.
///
/// Returns structured facts; never makes policy decisions. Policy is
/// entirely Cedar's responsibility.
///
/// DRAFT-SEAM: Team 4 — returns structured facts, never policy decisions.
#[async_trait]
pub trait ArgumentValidator: Send + Sync {
    /// Validate the raw arguments for the given MCP method.
    ///
    /// Returns one [`ValidatorResult`] per validator that ran. An empty `Vec`
    /// means no validators are registered for the method (not an error).
    async fn validate(
        &self,
        method: &str,
        target_server: &str,
        tool_name: &str,
        raw_arguments: &serde_json::Value,
    ) -> Result<Vec<ValidatorResult>, ValidatorError>;
}

/// Mockable seam to Team 5 — synchronous kill-switch / revocation check.
///
/// Implementations MUST read from an in-memory `ArcSwap` table and complete
/// in <50 µs. No I/O is permitted inside `is_revoked`.
///
/// DRAFT-SEAM: Team 5 — read-only check of revocation state.
/// Must complete in <50 µs from an in-memory ArcSwap table.
pub trait RevocationChecker: Send + Sync {
    /// Check global, server, and tool revocations before caller identity is known.
    fn check_pre_identity(&self, server: &str, tool_name: &str) -> RevocationOutcome;

    /// Check agent-specific revocation after identity verification.
    fn check_post_identity(
        &self,
        agent_id: &str,
        server: &str,
        tool_name: &str,
    ) -> RevocationOutcome;
}

// ---------------------------------------------------------------------------
// § PolicyEngine trait (implemented in `extmcp-cedar`)
// ---------------------------------------------------------------------------

/// Error type for Cedar engine failures.
#[derive(Debug, Error)]
pub enum PolicyEngineError {
    /// The policy snapshot could not be loaded (bad syntax, schema mismatch).
    #[error("snapshot load failed: {0}")]
    SnapshotLoad(String),
    /// A Cedar entity UID could not be parsed from the request.
    #[error("entity UID parse failed: {0}")]
    EntityUidParse(String),
    /// The Cedar context JSON is invalid or missing required fields.
    #[error("context build failed: {0}")]
    ContextBuild(String),
    /// An unexpected internal error in the Cedar engine.
    #[error("cedar engine internal error: {0}")]
    Internal(String),
}

/// Trait implemented by the Cedar policy engine in `extmcp-cedar`.
///
/// # Fail-closed contract
/// Implementations MUST return `Deny` with an appropriate `ErrorCategory`
/// rather than propagating errors that would leave the decision ambiguous.
///
/// DRAFT: depends on Team 0 contract freeze.
#[async_trait]
pub trait PolicyEngine: Send + Sync {
    /// Evaluate a [`PolicyRequest`] and return a [`PolicyResponse`].
    ///
    /// On any engine error the response MUST contain `decision = Deny`
    /// and `error_category = Some(ErrorCategory::PolicyEngineError)`.
    async fn evaluate(&self, request: &PolicyRequest) -> Result<PolicyResponse, PolicyEngineError>;
}

// ---------------------------------------------------------------------------
// § Pipeline error and result types
// ---------------------------------------------------------------------------

/// A structured error produced by the [`CheckPipeline`].
///
/// Each variant corresponds to the pipeline stage that failed so that audit
/// logs can attribute the denial precisely.
#[derive(Debug, Error)]
pub enum PipelineError {
    /// Stage 1 — revocation check indicated the entity is revoked.
    #[error("revoked: {reason}")]
    Revoked { reason: String },
    /// Stage 2 — identity verification failed.
    #[error("identity error: {0}")]
    Identity(#[from] IdentityError),
    /// Stage 3 — argument/tool-pin validation failed.
    #[error("validator error: {0}")]
    Validator(#[from] ValidatorError),
    /// Stage 4 — Cedar engine returned an error.
    #[error("policy engine error: {0}")]
    PolicyEngine(#[from] PolicyEngineError),
}

/// The enriched result returned by [`CheckPipeline::execute`].
///
/// Wraps the final [`PolicyResponse`] together with pipeline metadata that
/// the async audit layer (Team 5) can consume without re-parsing the response.
#[derive(Debug, Clone)]
pub struct CheckResult {
    /// The final authorization decision (always present — pipeline is fail-closed).
    pub policy_response: PolicyResponse,
    /// Pipeline stage that produced the result (for audit attribution).
    pub stage: PipelineStage,
    /// Total wall-clock time for the pipeline, in microseconds.
    pub pipeline_latency_us: u64,
}

/// Which pipeline stage produced the final [`CheckResult`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PipelineStage {
    /// Terminated early at the revocation check.
    RevocationCheck,
    /// Terminated at identity verification.
    IdentityVerification,
    /// Terminated at argument/tool-pin validation.
    ArgumentValidation,
    /// Reached Cedar evaluation (normal path).
    CedarEvaluation,
}

// ---------------------------------------------------------------------------
// § CheckPipeline — main orchestrator
// ---------------------------------------------------------------------------

/// Orchestrates the full NHI authorization pipeline.
///
/// Type parameters allow compile-time injection of mockable seams:
/// - `I` — [`IdentityVerifier`] (Team 3 seam)
/// - `V` — [`ArgumentValidator`] (Team 4 seam)
/// - `R` — [`RevocationChecker`] (Team 5 seam)
///
/// The Cedar [`PolicyEngine`] is held as a trait object so it can be hot-swapped.
pub struct CheckPipeline<I, V, R> {
    identity_verifier: Arc<I>,
    argument_validator: Arc<V>,
    revocation_checker: Arc<R>,
    policy_engine: Arc<dyn PolicyEngine>,
}

impl<I, V, R> CheckPipeline<I, V, R>
where
    I: IdentityVerifier,
    V: ArgumentValidator,
    R: RevocationChecker,
{
    /// Create a new [`CheckPipeline`] with the given seam implementations.
    pub fn new(
        identity_verifier: Arc<I>,
        argument_validator: Arc<V>,
        revocation_checker: Arc<R>,
        policy_engine: Arc<dyn PolicyEngine>,
    ) -> Self {
        Self {
            identity_verifier,
            argument_validator,
            revocation_checker,
            policy_engine,
        }
    }

    /// Execute the full authorization pipeline for the given request.
    ///
    /// # Pipeline order
    /// 1. Revocation check (synchronous, <50 µs)
    /// 2. Identity verification (async, Team 3 seam)
    /// 3. Argument & tool-pin validation (async, Team 4 seam)
    /// 4. Cedar authorization (async, Team 2 engine)
    ///
    /// # Fail-closed guarantee
    /// Every error path returns a `CheckResult` with `Decision::Deny`.
    /// The pipeline never returns an ambiguous result.
    ///
    /// # Security
    /// `raw_auth_header` on the request is passed to the identity verifier and
    /// MUST NOT be logged at any point in this function.
    pub async fn execute(&self, req: &RuntimeRequest) -> CheckResult {
        let pipeline_start = Instant::now();

        debug!(
            request_id = %req.request_id,
            trace_id = %req.trace_id,
            tool_name = %req.tool_name,
            target_server = %req.target_server,
            "pipeline start"
            // SECURITY: never log raw_auth_header
        );

        // --- Stage 1: Revocation check ---
        let revocation_outcome = self
            .revocation_checker
            .check_pre_identity(&req.target_server, &req.tool_name);

        if let RevocationOutcome::Revoked { reason } = revocation_outcome {
            warn!(
                request_id = %req.request_id,
                tool_name = %req.tool_name,
                "request short-circuited: revoked"
            );
            let latency_us =
                u64::try_from(pipeline_start.elapsed().as_micros()).unwrap_or(u64::MAX);
            return CheckResult {
                policy_response: PolicyResponse {
                    decision: Decision::Deny,
                    policy_version: String::from("n/a"),
                    matched_policy_ids: vec![],
                    reason: format!("revoked: {reason}"),
                    evaluation_latency_us: 0,
                    error_category: Some(ErrorCategory::Revoked),
                },
                stage: PipelineStage::RevocationCheck,
                pipeline_latency_us: latency_us,
            };
        }

        // --- Stage 2: Identity verification ---
        // SECURITY: never log raw_auth_header
        let identity = match self
            .identity_verifier
            .verify(
                req.raw_auth_header.as_deref(),
                &req.target_server,
                &req.mcp_session_id,
                &req.request_id,
            )
            .await
        {
            Ok(ctx) => {
                debug!(
                    request_id = %req.request_id,
                    agent_id = %ctx.agent_id,
                    "identity verified"
                );
                ctx
            }
            Err(err) => {
                warn!(
                    request_id = %req.request_id,
                    error = %err,
                    "identity verification failed"
                );
                let latency_us =
                    u64::try_from(pipeline_start.elapsed().as_micros()).unwrap_or(u64::MAX);
                return CheckResult {
                    policy_response: PolicyResponse {
                        decision: Decision::Deny,
                        policy_version: String::from("n/a"),
                        matched_policy_ids: vec![],
                        reason: format!("authentication failure: {err}"),
                        evaluation_latency_us: 0,
                        error_category: Some(ErrorCategory::AuthenticationFailure),
                    },
                    stage: PipelineStage::IdentityVerification,
                    pipeline_latency_us: latency_us,
                };
            }
        };

        // Agent IDs are trusted only after Team 3 verifies the bearer token.
        // Check them in a second phase; never substitute a tool/server name.
        if let RevocationOutcome::Revoked { reason } = self.revocation_checker.check_post_identity(
            &identity.agent_id,
            &req.target_server,
            &req.tool_name,
        ) {
            warn!(
                request_id = %req.request_id,
                agent_id = %identity.agent_id,
                "request short-circuited: agent revoked"
            );
            let latency_us =
                u64::try_from(pipeline_start.elapsed().as_micros()).unwrap_or(u64::MAX);
            return CheckResult {
                policy_response: PolicyResponse {
                    decision: Decision::Deny,
                    policy_version: String::from("n/a"),
                    matched_policy_ids: vec![],
                    reason: format!("revoked: {reason}"),
                    evaluation_latency_us: 0,
                    error_category: Some(ErrorCategory::Revoked),
                },
                stage: PipelineStage::RevocationCheck,
                pipeline_latency_us: latency_us,
            };
        }

        // --- Stage 3: Argument & tool-pin validation ---
        let validator_results = match self
            .argument_validator
            .validate(
                &req.mcp_method,
                &req.target_server,
                &req.tool_name,
                &req.raw_arguments,
            )
            .await
        {
            Ok(results) => {
                debug!(
                    request_id = %req.request_id,
                    validator_count = results.len(),
                    "argument validation complete"
                );
                results
            }
            Err(err) => {
                warn!(
                    request_id = %req.request_id,
                    error = %err,
                    "argument validation failed"
                );
                let latency_us =
                    u64::try_from(pipeline_start.elapsed().as_micros()).unwrap_or(u64::MAX);
                return CheckResult {
                    policy_response: PolicyResponse {
                        decision: Decision::Deny,
                        policy_version: String::from("n/a"),
                        matched_policy_ids: vec![],
                        reason: format!("validator failure: {err}"),
                        evaluation_latency_us: 0,
                        error_category: Some(ErrorCategory::ValidatorFailure),
                    },
                    stage: PipelineStage::ArgumentValidation,
                    pipeline_latency_us: latency_us,
                };
            }
        };

        // --- Stage 4: Build PolicyRequest and call Cedar ---
        // DRAFT: depends on Team 0 contract freeze for UID format conventions.
        let principal_uid = format!("Axiom::Agent::\"{}\"", identity.agent_id);
        let action_uid = format!("Axiom::Action::\"{}\"", req.mcp_method);
        let resource_uid = if req.mcp_method == "tools/call" {
            format!("Axiom::Tool::\"{}/{}\"", req.target_server, req.tool_name)
        } else {
            format!("Axiom::McpServer::\"{}\"", req.target_server)
        };

        // DRAFT: runtime_mode_str is passed to context builder so that future
        // audit-only policies can key on it; Cedar evaluation itself remains
        // mode-agnostic (see module-level design notes).
        let runtime_mode_str = match req.runtime_mode {
            RuntimeMode::Enforce => "enforce",
            RuntimeMode::Observe => "observe",
        };

        let context_json =
            context::build_cedar_context(&identity, &validator_results, runtime_mode_str);

        let policy_request = PolicyRequest {
            principal_uid,
            action_uid,
            resource_uid,
            context_json,
        };

        debug!(
            request_id = %req.request_id,
            principal = %policy_request.principal_uid,
            action = %policy_request.action_uid,
            resource = %policy_request.resource_uid,
            "calling cedar policy engine"
        );

        let policy_response = match self.policy_engine.evaluate(&policy_request).await {
            Ok(resp) => resp,
            Err(err) => {
                // Fail closed: any engine error becomes Deny.
                error!(
                    request_id = %req.request_id,
                    error = %err,
                    "cedar engine error — failing closed"
                );
                let latency_us =
                    u64::try_from(pipeline_start.elapsed().as_micros()).unwrap_or(u64::MAX);
                return CheckResult {
                    policy_response: PolicyResponse {
                        decision: Decision::Deny,
                        policy_version: String::from("n/a"),
                        matched_policy_ids: vec![],
                        reason: format!("policy engine error: {err}"),
                        evaluation_latency_us: 0,
                        error_category: Some(ErrorCategory::PolicyEngineError),
                    },
                    stage: PipelineStage::CedarEvaluation,
                    pipeline_latency_us: latency_us,
                };
            }
        };

        let latency_us = u64::try_from(pipeline_start.elapsed().as_micros()).unwrap_or(u64::MAX);

        debug!(
            request_id = %req.request_id,
            decision = ?policy_response.decision,
            policy_version = %policy_response.policy_version,
            pipeline_latency_us = latency_us,
            "pipeline complete"
        );

        CheckResult {
            policy_response,
            stage: PipelineStage::CedarEvaluation,
            pipeline_latency_us: latency_us,
        }
    }
}

// ---------------------------------------------------------------------------
// § Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};

    // --- Hand-rolled mocks ---

    struct AlwaysPermitEngine;

    #[async_trait]
    impl PolicyEngine for AlwaysPermitEngine {
        async fn evaluate(
            &self,
            _req: &PolicyRequest,
        ) -> Result<PolicyResponse, PolicyEngineError> {
            Ok(PolicyResponse {
                decision: Decision::Permit,
                policy_version: String::from("test-sha"),
                matched_policy_ids: vec!["test-permit-policy".to_string()],
                reason: String::from("permitted by test engine"),
                evaluation_latency_us: 42,
                error_category: None,
            })
        }
    }

    struct AlwaysDenyEngine {
        reason: String,
        policy_id: String,
    }

    #[async_trait]
    impl PolicyEngine for AlwaysDenyEngine {
        async fn evaluate(
            &self,
            _req: &PolicyRequest,
        ) -> Result<PolicyResponse, PolicyEngineError> {
            Ok(PolicyResponse {
                decision: Decision::Deny,
                policy_version: String::from("test-sha"),
                matched_policy_ids: vec![self.policy_id.clone()],
                reason: self.reason.clone(),
                evaluation_latency_us: 11,
                error_category: None,
            })
        }
    }

    struct MockIdentityVerifier {
        called: Arc<AtomicBool>,
        result: Result<IdentityContext, ()>,
    }

    impl MockIdentityVerifier {
        fn ok(agent_id: &str) -> Self {
            Self {
                called: Arc::new(AtomicBool::new(false)),
                result: Ok(IdentityContext {
                    authenticated: true,
                    agent_id: agent_id.to_string(),
                    client_id: "test-client".to_string(),
                    cimd_uri: None,
                    issuer: "https://issuer.test".to_string(),
                    audience: vec!["axiom".to_string()],
                    scopes: vec!["tools:call".to_string()],
                    token_jti: "test-jti".to_string(),
                    expires_at_unix: 9_999_999_999,
                }),
            }
        }

        fn fail() -> Self {
            Self {
                called: Arc::new(AtomicBool::new(false)),
                result: Err(()),
            }
        }
    }

    #[async_trait]
    impl IdentityVerifier for MockIdentityVerifier {
        async fn verify(
            &self,
            _raw_auth_header: Option<&str>,
            _target_server: &str,
            _mcp_session_id: &str,
            _request_id: &str,
        ) -> Result<IdentityContext, IdentityError> {
            self.called.store(true, Ordering::SeqCst);
            self.result
                .clone()
                .map_err(|_| IdentityError::SignatureInvalid("mock failure".to_string()))
        }
    }

    struct MockArgumentValidator {
        result: Result<Vec<ValidatorResult>, ()>,
    }

    impl MockArgumentValidator {
        fn ok() -> Self {
            Self {
                result: Ok(vec![ValidatorResult {
                    validator_id: "test-validator".to_string(),
                    passed: true,
                    violation_code: None,
                    reason: None,
                    sql_verbs: vec!["SELECT".to_string()],
                    sql_tables: vec!["users".to_string()],
                    sql_is_readonly: true,
                    sql_statement_count: 1,
                    normalized_path: None,
                    path_traversal_detected: false,
                    egress_domain: None,
                    egress_is_private_ip: false,
                    tool_pin_sha256: None,
                    tool_pin_verified: true,
                }]),
            }
        }

        fn fail() -> Self {
            Self { result: Err(()) }
        }
    }

    #[async_trait]
    impl ArgumentValidator for MockArgumentValidator {
        async fn validate(
            &self,
            _method: &str,
            _target_server: &str,
            _tool_name: &str,
            _raw_arguments: &serde_json::Value,
        ) -> Result<Vec<ValidatorResult>, ValidatorError> {
            self.result
                .clone()
                .map_err(|_| ValidatorError::Internal("mock failure".to_string()))
        }
    }

    struct NeverRevokedChecker;
    impl RevocationChecker for NeverRevokedChecker {
        fn check_pre_identity(&self, _server: &str, _tool_name: &str) -> RevocationOutcome {
            RevocationOutcome::Active
        }

        fn check_post_identity(
            &self,
            _agent_id: &str,
            _server: &str,
            _tool_name: &str,
        ) -> RevocationOutcome {
            RevocationOutcome::Active
        }
    }

    struct AlwaysRevokedChecker;
    impl RevocationChecker for AlwaysRevokedChecker {
        fn check_pre_identity(&self, _server: &str, _tool_name: &str) -> RevocationOutcome {
            RevocationOutcome::Revoked {
                reason: "kill-switch active".to_string(),
            }
        }

        fn check_post_identity(
            &self,
            _agent_id: &str,
            _server: &str,
            _tool_name: &str,
        ) -> RevocationOutcome {
            RevocationOutcome::Active
        }
    }

    struct AgentRevokedChecker;
    impl RevocationChecker for AgentRevokedChecker {
        fn check_pre_identity(&self, _server: &str, _tool_name: &str) -> RevocationOutcome {
            RevocationOutcome::Active
        }

        fn check_post_identity(
            &self,
            agent_id: &str,
            _server: &str,
            _tool_name: &str,
        ) -> RevocationOutcome {
            if agent_id == "finance-agent" {
                RevocationOutcome::Revoked {
                    reason: "agent disabled".into(),
                }
            } else {
                RevocationOutcome::Active
            }
        }
    }

    fn make_request() -> RuntimeRequest {
        RuntimeRequest {
            request_id: "req-001".to_string(),
            trace_id: "trace-001".to_string(),
            mcp_session_id: "sess-001".to_string(),
            mcp_method: "tools/call".to_string(),
            target_server: "prod-db".to_string(),
            tool_name: "execute_sql".to_string(),
            raw_arguments: serde_json::json!({"query": "SELECT 1"}),
            runtime_mode: RuntimeMode::Enforce,
            raw_auth_header: Some("Bearer test-token".to_string()),
        }
    }

    // --- Test: happy path → Permit ---
    #[tokio::test]
    async fn test_happy_path_permit() {
        let identity_verifier = Arc::new(MockIdentityVerifier::ok("finance-agent"));
        let argument_validator = Arc::new(MockArgumentValidator::ok());
        let revocation_checker = Arc::new(NeverRevokedChecker);
        let policy_engine: Arc<dyn PolicyEngine> = Arc::new(AlwaysPermitEngine);

        let pipeline = CheckPipeline::new(
            identity_verifier,
            argument_validator,
            revocation_checker,
            policy_engine,
        );

        let result = pipeline.execute(&make_request()).await;
        assert_eq!(result.policy_response.decision, Decision::Permit);
        assert_eq!(result.stage, PipelineStage::CedarEvaluation);
        assert!(result.policy_response.error_category.is_none());
    }

    // --- Test: revocation short-circuits before identity is called ---
    #[tokio::test]
    async fn test_revocation_short_circuits_before_identity() {
        let identity_verifier = Arc::new(MockIdentityVerifier::ok("finance-agent"));
        let was_called = identity_verifier.called.clone();
        let argument_validator = Arc::new(MockArgumentValidator::ok());
        let revocation_checker = Arc::new(AlwaysRevokedChecker);
        let policy_engine: Arc<dyn PolicyEngine> = Arc::new(AlwaysPermitEngine);

        let pipeline = CheckPipeline::new(
            identity_verifier,
            argument_validator,
            revocation_checker,
            policy_engine,
        );

        let result = pipeline.execute(&make_request()).await;

        // Decision must be Deny
        assert_eq!(result.policy_response.decision, Decision::Deny);
        // ErrorCategory must be Revoked
        assert_eq!(
            result.policy_response.error_category,
            Some(ErrorCategory::Revoked)
        );
        // Stage must be RevocationCheck
        assert_eq!(result.stage, PipelineStage::RevocationCheck);
        // Identity verifier must NOT have been called
        assert!(
            !was_called.load(Ordering::SeqCst),
            "identity verifier should not be called when revoked"
        );
    }

    #[tokio::test]
    async fn test_agent_revocation_checks_verified_identity_after_authentication() {
        let identity_verifier = Arc::new(MockIdentityVerifier::ok("finance-agent"));
        let was_called = identity_verifier.called.clone();
        let pipeline = CheckPipeline::new(
            identity_verifier,
            Arc::new(MockArgumentValidator::ok()),
            Arc::new(AgentRevokedChecker),
            Arc::new(AlwaysPermitEngine),
        );

        let result = pipeline.execute(&make_request()).await;
        assert!(was_called.load(Ordering::SeqCst));
        assert_eq!(result.policy_response.decision, Decision::Deny);
        assert_eq!(
            result.policy_response.error_category,
            Some(ErrorCategory::Revoked)
        );
        assert_eq!(result.stage, PipelineStage::RevocationCheck);
    }

    // --- Test: identity failure → Deny with AuthenticationFailure ---
    #[tokio::test]
    async fn test_identity_failure_deny() {
        let identity_verifier = Arc::new(MockIdentityVerifier::fail());
        let argument_validator = Arc::new(MockArgumentValidator::ok());
        let revocation_checker = Arc::new(NeverRevokedChecker);
        let policy_engine: Arc<dyn PolicyEngine> = Arc::new(AlwaysPermitEngine);

        let pipeline = CheckPipeline::new(
            identity_verifier,
            argument_validator,
            revocation_checker,
            policy_engine,
        );

        let result = pipeline.execute(&make_request()).await;
        assert_eq!(result.policy_response.decision, Decision::Deny);
        assert_eq!(
            result.policy_response.error_category,
            Some(ErrorCategory::AuthenticationFailure)
        );
        assert_eq!(result.stage, PipelineStage::IdentityVerification);
    }

    // --- Test: policy engine Deny preserves reason and matched_policy_ids ---
    #[tokio::test]
    async fn test_policy_deny_preserves_metadata() {
        let identity_verifier = Arc::new(MockIdentityVerifier::ok("finance-agent"));
        let argument_validator = Arc::new(MockArgumentValidator::ok());
        let revocation_checker = Arc::new(NeverRevokedChecker);
        let policy_engine: Arc<dyn PolicyEngine> = Arc::new(AlwaysDenyEngine {
            reason: "destructive SQL forbidden".to_string(),
            policy_id: "DENY_DESTRUCTIVE_SQL".to_string(),
        });

        let pipeline = CheckPipeline::new(
            identity_verifier,
            argument_validator,
            revocation_checker,
            policy_engine,
        );

        let result = pipeline.execute(&make_request()).await;
        assert_eq!(result.policy_response.decision, Decision::Deny);
        assert_eq!(result.stage, PipelineStage::CedarEvaluation);
        assert!(
            result.policy_response.reason.contains("destructive SQL"),
            "reason must be preserved from engine"
        );
        assert!(
            result
                .policy_response
                .matched_policy_ids
                .contains(&"DENY_DESTRUCTIVE_SQL".to_string()),
            "matched_policy_ids must be preserved from engine"
        );
    }

    // --- Test: validator failure → Deny with ValidatorFailure ---
    #[tokio::test]
    async fn test_validator_failure_deny() {
        let identity_verifier = Arc::new(MockIdentityVerifier::ok("finance-agent"));
        let argument_validator = Arc::new(MockArgumentValidator::fail());
        let revocation_checker = Arc::new(NeverRevokedChecker);
        let policy_engine: Arc<dyn PolicyEngine> = Arc::new(AlwaysPermitEngine);

        let pipeline = CheckPipeline::new(
            identity_verifier,
            argument_validator,
            revocation_checker,
            policy_engine,
        );

        let result = pipeline.execute(&make_request()).await;
        assert_eq!(result.policy_response.decision, Decision::Deny);
        assert_eq!(
            result.policy_response.error_category,
            Some(ErrorCategory::ValidatorFailure)
        );
        assert_eq!(result.stage, PipelineStage::ArgumentValidation);
    }
}
