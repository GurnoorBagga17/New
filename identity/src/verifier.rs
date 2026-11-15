// Copyright 2024 Axiom NHI — Licensed under Apache-2.0
//! Identity verifier trait and verification request model.
//!
//! This module defines the core `IdentityVerifier` trait that Team 2 (ExtMCP orchestrator)
//! will call to authenticate incoming MCP requests.

use crate::types::VerificationResult;
use crate::{
    oauth::jwks_cache::{JwksCache, JwksError, TrustedIssuer},
    oauth::jwt_validator::JwtValidator,
    types::{AuthenticationFailure, FailureReason},
};
use async_trait::async_trait;
use std::fmt;
use std::{collections::HashSet, sync::Arc, time::Duration};

/// Request context required for identity verification.
///
/// This struct maps to fields extracted from Team 1's `RuntimeRequest` and passed
/// to the identity verifier by Team 2's ExtMCP orchestrator.
///
/// **Integration Contract:**
/// - Populated by Team 2 from `RuntimeRequest` (Team 1's gateway output)
/// - Consumed by any `IdentityVerifier` implementation
#[derive(Clone)]
pub struct VerificationRequest {
    /// Raw `Authorization` header value, expected format: `Bearer <jwt>`
    ///
    /// **Security Note:** Per OAuth 2.1 Section 5.2, tokens MUST be transmitted in
    /// the Authorization header, not in URL query strings or fragments.
    /// Team 1 must extract this from HTTP headers only.
    pub raw_auth_header: Option<String>,

    /// Configured canonical MCP resource URI for RFC 8707 audience binding.
    ///
    /// Example: `"mcp://prod-db"`, `"https://mcp.example.com/analytics"`
    ///
    /// This is compared against the JWT `aud` claim to prevent confused deputy attacks
    /// where a token issued for one resource is replayed against another.
    pub target_server: String,

    /// MCP session identifier for correlation and logging.
    pub mcp_session_id: String,

    /// Unique request identifier from Team 1 for tracing.
    pub request_id: String,
}

impl fmt::Debug for VerificationRequest {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("VerificationRequest")
            .field(
                "raw_auth_header",
                &self.raw_auth_header.as_ref().map(|_| "[REDACTED]"),
            )
            .field("target_server", &self.target_server)
            .field("mcp_session_id", &self.mcp_session_id)
            .field("request_id", &self.request_id)
            .finish()
    }
}

/// Core identity verification trait.
///
/// Implementations verify bearer tokens, validate JWT signatures/claims, enforce
/// audience binding per RFC 8707, and return a validated `IdentityContext` or
/// typed authentication failure.
///
/// **Scope Boundaries:**
/// - DOES: Cryptographic token verification, temporal validity, exact audience binding
/// - DOES NOT: Authorization decisions, tool permissions, argument validation, token exchange
///
/// **Implementation Notes:**
/// - Signature verification uses cached JWKS from configured trusted issuers
/// - Clock skew tolerance: ≤30 seconds for exp/nbf validation
/// - JWKS fetches validate and pin public DNS results; CIMD fetching is not implemented
/// - Raw bearer tokens are never logged or included in error messages
///
/// **Async Design:**
/// The trait is async to support remote JWKS/CIMD fetches without blocking the
/// inline request path when caches are cold. Implementations should aggressively
/// cache to meet the <0.5ms cached path latency budget.
#[async_trait]
pub trait IdentityVerifier: Send + Sync {
    /// Verify the bearer token and return validated identity context.
    ///
    /// # Arguments
    /// * `request` - Verification request with raw auth header, target server, and correlation IDs
    ///
    /// # Returns
    /// * `Ok(IdentityContext)` - Successfully verified identity with all required claims
    /// * `Err(AuthenticationFailure)` - Typed failure with reason code and redacted message
    ///
    /// # Errors
    /// Returns `AuthenticationFailure` for:
    /// - Missing or malformed Authorization header
    /// - Invalid JWT structure or signature
    /// - Expired or not-yet-valid tokens (with bounded clock skew)
    /// - Audience mismatch (confused deputy protection)
    /// - Missing required claims (sub, iss, aud, jti, client_id, exp)
    /// - JWKS/CIMD fetch failures or timeouts
    /// - SSRF rejection (private IPs, non-HTTPS, etc.)
    ///
    /// # Security Guarantees
    /// - Raw bearer token values never appear in errors or logs
    /// - Signature verification uses cryptographically secure JWKS validation
    /// - Clock skew bounded to ≤30 seconds to limit replay window
    /// - Audience binding enforced per RFC 8707 to prevent confused deputy attacks
    /// - Remote fetches protected against SSRF (no private IPs, TLS required)
    async fn verify(&self, request: &VerificationRequest) -> VerificationResult;

    /// Optionally pre-warm caches for a known issuer and canonical resource URI.
    ///
    /// This is a hint to the implementation to fetch and cache JWKS/CIMD in the background
    /// before the first request arrives. Implementations may ignore this if not applicable.
    ///
    /// # Arguments
    /// * `issuer` - OAuth issuer URL (e.g., `https://auth.example.com`)
    /// * `target_server` - configured canonical MCP resource URI for audience binding
    async fn warm_cache(&self, issuer: &str, target_server: &str) -> Result<(), String> {
        // Default implementation is a no-op
        let _ = (issuer, target_server);
        Ok(())
    }

    /// Return cache statistics for observability (hits, misses, evictions).
    ///
    /// Used by Team 5 (Observability) to emit cache performance metrics.
    /// Implementations may return `None` if cache stats are not tracked.
    fn cache_stats(&self) -> Option<CacheStats> {
        None
    }
}

/// Concrete OAuth/OIDC verifier backed by administrator-configured issuers.
///
/// Every request must target one of the configured canonical resource URIs.
/// Bearer tokens are never included in logs or returned error text.
pub struct OidcIdentityVerifier {
    validator: JwtValidator,
    jwks: Arc<JwksCache>,
    canonical_resources: HashSet<String>,
}

impl OidcIdentityVerifier {
    pub fn new(
        issuers: Vec<TrustedIssuer>,
        canonical_resources: Vec<String>,
        jwks_ttl: Duration,
    ) -> Result<Self, JwksError> {
        if canonical_resources.is_empty()
            || canonical_resources
                .iter()
                .any(|resource| !is_canonical_resource(resource))
        {
            return Err(JwksError::InvalidConfiguration);
        }
        let canonical_resources: HashSet<_> = canonical_resources.into_iter().collect();
        if canonical_resources.is_empty() {
            return Err(JwksError::InvalidConfiguration);
        }
        let jwks = Arc::new(JwksCache::new(issuers, jwks_ttl)?);
        Ok(Self {
            validator: JwtValidator::new(Arc::clone(&jwks)),
            jwks,
            canonical_resources,
        })
    }
}

#[async_trait]
impl IdentityVerifier for OidcIdentityVerifier {
    async fn verify(&self, request: &VerificationRequest) -> VerificationResult {
        if !self.canonical_resources.contains(&request.target_server) {
            return Err(AuthenticationFailure::new(
                FailureReason::AudienceMismatch,
                "Target resource is not configured",
            )
            .with_request_id(&request.request_id)
            .with_target_server(&request.target_server));
        }

        let token =
            extract_bearer(request.raw_auth_header.as_deref()).map_err(|(reason, message)| {
                AuthenticationFailure::new(reason, message)
                    .with_request_id(&request.request_id)
                    .with_target_server(&request.target_server)
            })?;

        self.validator
            .validate(token, &request.target_server)
            .await
            .map_err(|error| {
                error
                    .with_request_id(&request.request_id)
                    .with_target_server(&request.target_server)
            })
    }

    async fn warm_cache(&self, issuer: &str, target_server: &str) -> Result<(), String> {
        if !self.canonical_resources.contains(target_server) {
            return Err("target resource is not configured".to_owned());
        }
        self.jwks
            .refresh(issuer)
            .await
            .map(|_| ())
            .map_err(|_| "trusted signing keys are unavailable".to_owned())
    }

    fn cache_stats(&self) -> Option<CacheStats> {
        let (jwks_hits, jwks_misses, evictions) = self.jwks.stats();
        Some(CacheStats {
            jwks_hits,
            jwks_misses,
            evictions,
            ..CacheStats::default()
        })
    }
}

fn extract_bearer(header: Option<&str>) -> Result<&str, (FailureReason, &'static str)> {
    let Some(header) = header else {
        return Err((
            FailureReason::MissingCredentials,
            "Bearer credentials are required",
        ));
    };
    let mut parts = header.split_ascii_whitespace();
    let (Some(scheme), Some(token)) = (parts.next(), parts.next()) else {
        return Err((
            FailureReason::MalformedHeader,
            "Authorization header is malformed",
        ));
    };
    if !scheme.eq_ignore_ascii_case("Bearer") || parts.next().is_some() || token.len() > 16 * 1024 {
        return Err((
            FailureReason::MalformedHeader,
            "Authorization header is malformed",
        ));
    }
    Ok(token)
}

fn is_canonical_resource(resource: &str) -> bool {
    if resource.is_empty() || resource.trim() != resource {
        return false;
    }
    let Ok(url) = url::Url::parse(resource) else {
        return false;
    };
    url.has_host()
        && url.username().is_empty()
        && url.password().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
        && url.as_str() == resource
}

/// Cache performance statistics for observability.
#[derive(Debug, Clone, Copy, Default)]
pub struct CacheStats {
    /// Number of JWKS cache hits (served from memory).
    pub jwks_hits: u64,

    /// Number of JWKS cache misses (required remote fetch).
    pub jwks_misses: u64,

    /// Number of CIMD cache hits.
    pub cimd_hits: u64,

    /// Number of CIMD cache misses.
    pub cimd_misses: u64,

    /// Number of cache evictions (due to TTL expiry or size limits).
    pub evictions: u64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};

    #[test]
    fn test_verification_request_construction() {
        let req = VerificationRequest {
            raw_auth_header: Some("Bearer eyJ...".to_string()),
            target_server: "mcp://prod-db".to_string(),
            mcp_session_id: "session-123".to_string(),
            request_id: "req-456".to_string(),
        };

        assert!(req.raw_auth_header.is_some());
        assert_eq!(req.target_server, "mcp://prod-db");
        let rendered = format!("{req:?}");
        assert!(!rendered.contains("eyJ"));
        assert!(rendered.contains("[REDACTED]"));
    }

    #[test]
    fn bearer_extraction_rejects_missing_wrong_scheme_and_extra_values() {
        assert_eq!(
            extract_bearer(None),
            Err((
                FailureReason::MissingCredentials,
                "Bearer credentials are required"
            ))
        );
        assert_eq!(
            extract_bearer(Some("Basic abc")),
            Err((
                FailureReason::MalformedHeader,
                "Authorization header is malformed"
            ))
        );
        assert_eq!(
            extract_bearer(Some("Bearer abc extra")),
            Err((
                FailureReason::MalformedHeader,
                "Authorization header is malformed"
            ))
        );
        assert_eq!(extract_bearer(Some("bEaReR abc")), Ok("abc"));
    }

    #[test]
    fn canonical_resource_configuration_requires_absolute_stable_uris() {
        assert!(is_canonical_resource("mcp://prod-db"));
        assert!(is_canonical_resource("https://mcp.example/prod-db"));
        assert!(!is_canonical_resource("prod-db"));
        assert!(!is_canonical_resource("https://user@mcp.example/prod-db"));
        assert!(!is_canonical_resource(
            "https://mcp.example/prod-db?tenant=one"
        ));
    }

    fn configured_verifier() -> OidcIdentityVerifier {
        let issuer = TrustedIssuer::new(
            "https://issuer.example",
            "https://issuer.example/.well-known/jwks.json",
        )
        .unwrap();
        OidcIdentityVerifier::new(
            vec![issuer],
            vec!["mcp://prod-db".into()],
            Duration::from_secs(3600),
        )
        .unwrap()
    }

    fn request(auth: Option<String>, target: &str) -> VerificationRequest {
        VerificationRequest {
            raw_auth_header: auth,
            target_server: target.into(),
            mcp_session_id: "session-test".into(),
            request_id: "request-test".into(),
        }
    }

    #[tokio::test]
    async fn concrete_verifier_enforces_configured_resource_and_bearer_header() {
        let verifier = configured_verifier();
        let missing = verifier
            .verify(&request(None, "mcp://prod-db"))
            .await
            .unwrap_err();
        assert_eq!(missing.reason, FailureReason::MissingCredentials);

        let unknown_resource = verifier
            .verify(&request(Some("Bearer ignored".into()), "mcp://other"))
            .await
            .unwrap_err();
        assert_eq!(unknown_resource.reason, FailureReason::AudienceMismatch);
    }

    #[tokio::test]
    async fn concrete_verifier_authenticates_signed_bearer_end_to_end() {
        let verifier = configured_verifier();
        let keys: jsonwebtoken::jwk::JwkSet =
            serde_json::from_str(include_str!("../tests/fixtures/jwks.json")).unwrap();
        verifier.jwks.seed_for_test("https://issuer.example", keys);

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let claims = serde_json::json!({
            "iss":"https://issuer.example",
            "sub":"agent-integration-test",
            "aud":"mcp://prod-db",
            "exp":now + 300,
            "jti":"integration-jti",
            "client_id":"integration-client"
        });
        let mut header = Header::new(Algorithm::RS256);
        header.kid = Some("axiom-test-rsa-1".into());
        let token = encode(
            &header,
            &claims,
            &EncodingKey::from_rsa_pem(include_bytes!(
                "../tests/fixtures/identity_test_private.pem"
            ))
            .unwrap(),
        )
        .unwrap();

        let identity = verifier
            .verify(&request(Some(format!("Bearer {token}")), "mcp://prod-db"))
            .await
            .unwrap();
        assert_eq!(identity.agent_id, "agent-integration-test");
        assert_eq!(identity.token_jti, "integration-jti");
        assert!(identity.authenticated);
    }
}
