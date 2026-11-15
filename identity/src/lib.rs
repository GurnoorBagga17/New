// Copyright 2024 Axiom NHI — Licensed under Apache-2.0
//! Axiom NHI Phase 1 — Identity Verification and Authentication
//!
//! **Team:** Team 3 (Identity & Authentication)  
//! **Owner:** `@axiom-nhi/team-3-identity`  
//! **Status:** JWT/JWKS verifier implemented; runtime integration and CIMD fetching remain incomplete
//!
//! # Mission
//!
//! Authenticate every MCP client/agent request using:
//! - OAuth 2.1 bearer token verification
//! - Client ID Metadata Documents (CIMD) per MCP spec
//! - RFC 8707 Resource Indicators for audience binding
//!
//! Produces a tamper-proof `IdentityContext` for Team 2's policy engine.
//!
//! # Scope Boundaries
//!
//! ## What Team 3 DOES:
//! - Verify JWT cryptographic signatures against JWKS
//! - Enforce temporal validity (exp/nbf with bounded clock skew ≤30s)
//! - Validate audience binding per RFC 8707 (prevent confused deputy attacks)
//! - Fetch and cache CIMD metadata for URL-formatted client_id values
//! - Protect against SSRF in remote metadata fetches
//! - Redact raw bearer tokens from all logs and errors
//!
//! ## What Team 3 DOES NOT:
//! - Make authorization decisions (that's Team 2)
//! - Interpret validator facts or tool permissions (Team 4/Team 2)
//! - Implement RFC 8693 token exchange (deferred to Phase 3)
//! - Build cloud IAM discovery (AWS, K8s, GitHub — Phase 2)
//!
//! # Integration Contract
//!
//! **Inputs from Team 1 (Gateway):**
//! - `RuntimeRequest.raw_auth_header: Option<String>` — Bearer token
//! - `RuntimeRequest.target_server: String` — configured canonical resource URI for audience binding
//!
//! **Outputs to Team 2 (Policy):**
//! - `IdentityContext` — Validated identity with agent_id, scopes, audience, etc.
//! - `AuthenticationFailure` — Typed failure with reason code (no raw tokens)
//!
//! # Security Guarantees
//!
//! 1. **OAuth 2.1 Compliance:** Tokens only accepted in Authorization header (not query strings)
//! 2. **Cryptographic Verification:** JWS signatures validated against cached JWKS
//! 3. **Temporal Bounds:** Clock skew ≤30s to limit token replay window
//! 4. **Confused Deputy Protection:** RFC 8707 audience binding prevents cross-resource replay
//! 5. **SSRF Protection:** Remote fetches reject private IPs, require HTTPS with TLS verification
//! 6. **Secret Redaction:** Raw bearer tokens never logged or included in error responses
//!
//! # Latency Budget
//!
//! - **Cached path (hot JWKS):** <0.5 ms (signature verify + claims check)
//! - **Cold path (JWKS fetch):** May exceed inline budget; cache aggressively with TTL
//!
//! # Example Usage
//!
//! ```rust,no_run
//! use axiom_identity::{IdentityVerifier, VerificationRequest};
//!
//! # async fn example(verifier: impl IdentityVerifier) {
//! let request = VerificationRequest {
//!     raw_auth_header: Some("Bearer eyJhbGc...".to_string()),
//!     target_server: "mcp://prod-db".to_string(),
//!     mcp_session_id: "session-123".to_string(),
//!     request_id: "req-456".to_string(),
//! };
//!
//! match verifier.verify(&request).await {
//!     Ok(identity) => {
//!         println!("Authenticated: {}", identity.agent_id);
//!         // Pass identity to Team 2's policy engine
//!     }
//!     Err(failure) => {
//!         println!("Auth failed: {} ({})", failure.message, failure.reason);
//!         // Team 2 converts this to appropriate denial response
//!     }
//! }
//! # }
//! ```

// Public API surface
pub mod types;
pub mod verifier;

// OAuth verification is public so deployments can supply trusted issuer/JWKS configuration.
pub(crate) mod cimd;
pub mod oauth;

// Resource indicators module is public for testing audience validation logic
pub mod resource_indicators;

// Re-export primary types for convenience
pub use oauth::jwks_cache::{JwksError, TrustedIssuer};
pub use types::{AuthenticationFailure, FailureReason, IdentityContext, VerificationResult};
pub use verifier::{CacheStats, IdentityVerifier, OidcIdentityVerifier, VerificationRequest};
