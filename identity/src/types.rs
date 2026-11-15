// Copyright 2024 Axiom NHI — Licensed under Apache-2.0
//! Core identity types matching the Phase 1 shared contract (draft v0.1.0-draft).
//!
//! These types represent the canonical authentication result consumed by Team 2 (Policy).
//! Do NOT add authorization decisions, tool permissions, or validator facts here.

use serde::{Deserialize, Serialize};
use std::fmt;

/// Identity context produced after successful bearer token verification.
///
/// This struct matches the `IdentityContext` contract defined in the Phase 1 playbooks
/// and will be consumed by Team 2's ExtMCP policy orchestrator.
///
/// **Contract Status:** DRAFT v0.1.0-draft
/// **Owner:** Team 0 (Architecture) — not frozen; optionality of cimd_uri needs confirmation.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct IdentityContext {
    /// Whether the request carried valid authentication credentials.
    /// Always `true` when this struct is returned from successful verification.
    pub authenticated: bool,

    /// JWT `sub` claim — the unique identifier of the agent/principal.
    /// Example: `"agent-finance-prod-1"`, `"user@example.com"`
    pub agent_id: String,

    /// OAuth 2.1 `client_id` claim — identifies the application/client registration.
    pub client_id: String,

    /// Verified Client ID Metadata Document (CIMD) URI, if the client_id is a URL-formatted identifier.
    /// Per MCP Client Registration spec: https://blog.modelcontextprotocol.io/posts/client_registration/
    ///
    /// **DRAFT DEPENDENCY:** Optionality needs Team 0 confirmation. Recommend `Option<String>`
    /// because not all OAuth providers use CIMD (traditional static registrations exist).
    pub cimd_uri: Option<String>,

    /// JWT `iss` claim — the token issuer (OAuth/OIDC provider).
    pub issuer: String,

    /// JWT `aud` claim — validated against RFC 8707 resource indicator.
    /// Must match the target MCP server to prevent confused deputy attacks.
    pub audience: Vec<String>,

    /// Parsed OAuth scopes from the token (space-separated per OAuth 2.0 spec).
    pub scopes: Vec<String>,

    /// JWT `jti` claim — unique token identifier for revocation/replay tracking.
    /// Team 5's kill-switch may need to revoke by `jti` in addition to agent_id.
    pub token_jti: String,

    /// JWT `exp` claim — Unix timestamp (seconds since epoch) when the token expires.
    pub expires_at_unix: i64,
}

/// Result of identity verification.
///
/// Success returns the fully validated `IdentityContext`.
/// Failure returns a typed `AuthenticationFailure` with reason and correlation context.
pub type VerificationResult = Result<IdentityContext, AuthenticationFailure>;

/// Typed authentication failure reasons for observability and policy orchestration.
///
/// Team 2 (ExtMCP) will convert these into appropriate denial responses.
/// Team 5 (Observability) will record these in audit events with redacted details.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AuthenticationFailure {
    /// Machine-readable failure reason code.
    pub reason: FailureReason,

    /// Human-readable explanation (must not include raw tokens or secrets).
    pub message: String,

    /// Optional request correlation ID for tracing (from RuntimeRequest.request_id).
    pub request_id: Option<String>,

    /// Optional target server that was being accessed (for confused deputy logging).
    /// Never log the mismatched audience value itself.
    pub target_server: Option<String>,
}

impl AuthenticationFailure {
    /// Create a new authentication failure with the given reason and message.
    pub fn new(reason: FailureReason, message: impl Into<String>) -> Self {
        Self {
            reason,
            message: message.into(),
            request_id: None,
            target_server: None,
        }
    }

    /// Add request correlation context.
    pub fn with_request_id(mut self, request_id: impl Into<String>) -> Self {
        self.request_id = Some(request_id.into());
        self
    }

    /// Add target server context (for audience mismatch logging).
    pub fn with_target_server(mut self, target_server: impl Into<String>) -> Self {
        self.target_server = Some(target_server.into());
        self
    }
}

impl std::error::Error for AuthenticationFailure {}

impl fmt::Display for AuthenticationFailure {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "Authentication failed: {} ({})",
            self.message, self.reason
        )
    }
}

/// Machine-readable authentication failure reason codes.
///
/// These codes enable deterministic policy behavior and structured telemetry.
/// Team 2 uses these to decide fail-closed vs fail-open behavior in enforce mode.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FailureReason {
    /// No `Authorization` header present in the request.
    MissingCredentials,

    /// `Authorization` header present but not in expected `Bearer <token>` format.
    MalformedHeader,

    /// Bearer token is not a valid JWT structure (missing parts, invalid base64, etc.).
    InvalidToken,

    /// JWT signature verification failed against cached JWKS.
    InvalidSignature,

    /// JWT `alg` header is `none` or uses a disallowed algorithm.
    UnsupportedAlgorithm,

    /// Token is expired (current time > `exp` claim, accounting for clock skew).
    TokenExpired,

    /// Token is not yet valid (current time < `nbf` claim, accounting for clock skew).
    TokenNotYetValid,

    /// JWT `aud` claim does not match the target MCP server (RFC 8707 confused deputy protection).
    AudienceMismatch,

    /// Required JWT claims are missing (`sub`, `iss`, `aud`, `jti`, `client_id`, `exp`).
    MissingRequiredClaims,

    /// JWKS endpoint unreachable or returned invalid data.
    /// **DRAFT DEPENDENCY:** Team 0/Team 2 must decide fail-open vs fail-closed for this case.
    JwksUnavailable,

    /// CIMD document unreachable or invalid.
    /// Non-blocking in Phase 1; CIMD is optional metadata enrichment.
    CimdUnavailable,

    /// Network timeout during JWKS or CIMD fetch.
    NetworkTimeout,

    /// SSRF protection triggered (attempted fetch to private IP, non-HTTPS, etc.).
    SsrfRejection,

    /// Unspecified internal error during verification (last resort; prefer specific codes).
    InternalError,
}

impl fmt::Display for FailureReason {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            Self::MissingCredentials => "MISSING_CREDENTIALS",
            Self::MalformedHeader => "MALFORMED_HEADER",
            Self::InvalidToken => "INVALID_TOKEN",
            Self::InvalidSignature => "INVALID_SIGNATURE",
            Self::UnsupportedAlgorithm => "UNSUPPORTED_ALGORITHM",
            Self::TokenExpired => "TOKEN_EXPIRED",
            Self::TokenNotYetValid => "TOKEN_NOT_YET_VALID",
            Self::AudienceMismatch => "AUDIENCE_MISMATCH",
            Self::MissingRequiredClaims => "MISSING_REQUIRED_CLAIMS",
            Self::JwksUnavailable => "JWKS_UNAVAILABLE",
            Self::CimdUnavailable => "CIMD_UNAVAILABLE",
            Self::NetworkTimeout => "NETWORK_TIMEOUT",
            Self::SsrfRejection => "SSRF_REJECTION",
            Self::InternalError => "INTERNAL_ERROR",
        };
        write!(f, "{}", s)
    }
}

/// JWT claims extracted during verification (internal representation).
///
/// This is an internal type for parsing JWT payloads. The public API surface
/// returns `IdentityContext` after validation.
#[allow(dead_code)] // Will be used in next iteration when JWT validator is implemented
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct JwtClaims {
    /// Subject (agent/user identifier).
    pub sub: String,

    /// Issuer (OAuth provider).
    pub iss: String,

    /// Audience (target resource).
    #[serde(default)]
    pub aud: Audience,

    /// Expiration time (Unix timestamp).
    pub exp: i64,

    /// Not before time (Unix timestamp, optional).
    #[serde(default)]
    pub nbf: Option<i64>,

    /// JWT ID (unique token identifier).
    #[serde(default)]
    pub jti: Option<String>,

    /// Client ID (OAuth client identifier).
    #[serde(default)]
    pub client_id: Option<String>,

    /// Scope (space-separated string per OAuth 2.0 spec).
    #[serde(default)]
    pub scope: Option<String>,
}

/// JWT `aud` claim can be a single string or an array of strings per RFC 7519.
#[allow(dead_code)] // Will be used in next iteration when JWT validator is implemented
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub(crate) enum Audience {
    Single(String),
    Multiple(Vec<String>),
}

impl Default for Audience {
    fn default() -> Self {
        Self::Multiple(Vec::new())
    }
}

impl Audience {
    /// Convert to a Vec<String> regardless of representation.
    #[allow(dead_code)] // Will be used when JWT validator is implemented
    pub fn into_vec(self) -> Vec<String> {
        match self {
            Self::Single(s) => vec![s],
            Self::Multiple(v) => v,
        }
    }

    /// Check if the audience contains the given value.
    #[allow(dead_code)] // Will be used when JWT validator is implemented
    pub fn contains(&self, value: &str) -> bool {
        match self {
            Self::Single(s) => s == value,
            Self::Multiple(v) => v.iter().any(|a| a == value),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_failure_reason_serialization() {
        let reason = FailureReason::AudienceMismatch;
        let json = serde_json::to_string(&reason).unwrap();
        assert_eq!(json, r#""AUDIENCE_MISMATCH""#);
    }

    #[test]
    fn test_audience_single() {
        let aud = Audience::Single("mcp://prod-db".to_string());
        assert!(aud.contains("mcp://prod-db"));
        assert!(!aud.contains("mcp://analytics"));
        assert_eq!(aud.into_vec(), vec!["mcp://prod-db"]);
    }

    #[test]
    fn test_audience_multiple() {
        let aud = Audience::Multiple(vec![
            "mcp://prod-db".to_string(),
            "mcp://analytics".to_string(),
        ]);
        assert!(aud.contains("mcp://prod-db"));
        assert!(aud.contains("mcp://analytics"));
        assert!(!aud.contains("mcp://other"));
    }

    #[test]
    fn test_authentication_failure_display() {
        let failure = AuthenticationFailure::new(
            FailureReason::TokenExpired,
            "Token expired at 2024-01-01T00:00:00Z",
        )
        .with_request_id("req-123");

        let display = format!("{}", failure);
        assert!(display.contains("Authentication failed"));
        assert!(display.contains("TOKEN_EXPIRED"));
    }
}
