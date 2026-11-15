# Team 3 — Identity & Authentication

**Owner:** Team 3 (`@axiom-nhi/team-3-identity`)  
**Status:** JWT/JWKS verifier implemented; runtime integration and CIMD fetching remain incomplete (Draft v0.1.0-draft)  
**Mission:** Authenticate MCP requests and produce tamper-proof `IdentityContext` for Team 2's policy engine.

## Overview

Team 3 verifies bearer tokens using OAuth 2.1, OIDC, and MCP-specific extensions:
- **JWT signature verification** against cached JWKS endpoints
- **Temporal validity** (exp/nbf) with bounded clock skew (≤30s)
- **RFC 8707 audience binding** to prevent confused deputy attacks
- **Client ID Metadata Documents (CIMD)** are planned optional enrichment; fetching/caching is not implemented
- **SSRF protection** for the configured JWKS fetch path

**Scope Boundaries:**
- ✅ DOES: Cryptographic verification against configured JWKS, temporal checks, exact audience binding
- ❌ DOES NOT: Authorization decisions (Team 2), argument validation (Team 4), token exchange (Phase 3)

## Quick Start

### Using the Identity Verifier

```rust
use axiom_identity::{IdentityVerifier, VerificationRequest};

async fn authenticate_request(
    verifier: &impl IdentityVerifier,
    runtime_request: &RuntimeRequest,
) -> Result<IdentityContext, AuthenticationFailure> {
    let verification_request = VerificationRequest {
        raw_auth_header: runtime_request.raw_auth_header.clone(),
        target_server: runtime_request.target_server.clone(),
        mcp_session_id: runtime_request.mcp_session_id.clone(),
        request_id: runtime_request.request_id.clone(),
    };

    verifier.verify(&verification_request).await
}
```

### Handling Failures

```rust
match verifier.verify(&request).await {
    Ok(identity) => {
        println!("Authenticated: {} (issuer: {})", identity.agent_id, identity.issuer);
        // Proceed to Team 2's policy evaluation
    }
    Err(failure) => {
        match failure.reason {
            FailureReason::TokenExpired => {
                // Return 401 Unauthorized or similar
            }
            FailureReason::AudienceMismatch => {
                // Log confused deputy attempt, deny request
            }
            FailureReason::JwksUnavailable => {
                // Fail-closed in enforce mode (see SECURITY.md)
            }
            _ => {
                // Generic authentication failure
            }
        }
    }
}
```

## Architecture

### Module Structure

```
identity/
├── src/
│   ├── types.rs                   # IdentityContext, VerificationResult, failure enums
│   ├── verifier.rs                # IdentityVerifier trait
│   ├── oauth/
│   │   ├── jwt_validator.rs       # Asymmetric JWT signature and claims verification
│   │   └── jwks_cache.rs          # Configured JWKS fetch/cache with SSRF protections
│   ├── cimd/                       # Reserved; fetching/caching is not implemented
│   └── resource_indicators/
│       └── validator.rs           # RFC 8707 audience matching
├── SECURITY.md                    # Security boundaries, threat model, SSRF protections
├── FAILURE_MATRIX.md              # Exhaustive failure scenario documentation
└── INTERFACE_CONTRACT.md          # Integration contract with Teams 1 & 2
```

### Key Types

**Success Output:**
```rust
pub struct IdentityContext {
    pub authenticated: bool,
    pub agent_id: String,          // JWT sub
    pub client_id: String,         // OAuth client_id
    pub cimd_uri: Option<String>,  // CIMD URL if applicable
    pub issuer: String,            // JWT iss
    pub audience: Vec<String>,     // JWT aud (validated)
    pub scopes: Vec<String>,       // Parsed OAuth scopes
    pub token_jti: String,         // JWT jti (for revocation)
    pub expires_at_unix: i64,      // JWT exp
}
```

**Failure Output:**
```rust
pub struct AuthenticationFailure {
    pub reason: FailureReason,     // Machine-readable code
    pub message: String,           // Human-readable (no secrets)
    pub request_id: Option<String>,
    pub target_server: Option<String>,
}

pub enum FailureReason {
    MissingCredentials,
    InvalidSignature,
    TokenExpired,
    AudienceMismatch,
    JwksUnavailable,
    // ... see FAILURE_MATRIX.md for all 14 codes
}
```

## Integration Points

### Input from Team 1 (Gateway)

Team 1 extracts these fields from `RuntimeRequest`:
- `raw_auth_header: Option<String>` — Full `Authorization: Bearer <token>` header value
- `target_server: String` — Configured canonical MCP resource URI for exact audience binding
- `mcp_session_id: String` — Session correlation ID
- `request_id: String` — Request trace ID (UUIDv7)

**Team 1 Requirements:**
- Extract bearer tokens from HTTP Authorization header ONLY (never query strings per OAuth 2.1)
- Provide the configured canonical resource URI as `target_server` for RFC 8707 validation

### Output to Team 2 (Policy)

Team 2's ExtMCP orchestrator receives:
- **Success:** `IdentityContext` with validated identity claims
- **Failure:** `AuthenticationFailure` with typed reason code

**Team 2 Responsibilities:**
- Handle failures according to runtime mode (enforce vs. observe-only)
- Map `IdentityContext` to Cedar principal and context
- Never log raw bearer tokens (redact from all telemetry)

See [INTERFACE_CONTRACT.md](./INTERFACE_CONTRACT.md) for detailed integration specification.

## Security Guarantees

1. **OAuth 2.1 Compliance:** Tokens only accepted in Authorization header
2. **Cryptographic Verification:** JWS signatures validated against JWKS
3. **Bounded Clock Skew:** ≤30 seconds to limit replay window
4. **Confused Deputy Protection:** RFC 8707 audience binding enforced
5. **SSRF Protection:** Remote fetches reject private IPs, require HTTPS
6. **Secret Redaction:** Raw tokens never appear in logs or errors

See [SECURITY.md](./SECURITY.md) for threat model and detailed security analysis.

## Failure Behavior

All authentication failures return typed `FailureReason` codes for deterministic handling:

| Failure Code | Scenario | Enforce Mode Behavior |
|-------------|----------|----------------------|
| `MISSING_CREDENTIALS` | No Authorization header | Deny with "Authentication required" |
| `INVALID_SIGNATURE` | JWT signature verification failed | Deny with "Invalid token" |
| `TOKEN_EXPIRED` | Current time > exp + clock_skew | Deny with "Token expired" |
| `AUDIENCE_MISMATCH` | JWT aud ≠ target_server | Deny with "Invalid audience" |
| `JWKS_UNAVAILABLE` | Cannot fetch JWKS endpoint | Fail-closed (deny) |

See [FAILURE_MATRIX.md](./FAILURE_MATRIX.md) for all 14 failure scenarios with examples and test cases.

## Latency Budget

- **Cached path (hot JWKS):** <0.5 ms target (signature verify + claims check)
- **Cold path (JWKS fetch):** May exceed inline budget; cache aggressively with 1-hour TTL

**Strategy:**
- JWKS cache: 1-hour TTL with background refresh
- JWKS fetch timeout: 5 seconds (hard limit)
- Signature verification: <0.1 ms (jsonwebtoken crate)

## Testing

### Unit Tests

Run Team 3's unit tests:
```bash
cargo test --package axiom-identity
```

**Coverage includes:**
- Valid JWT verification with matching audience
- Expired token rejection
- Confused deputy attack prevention (audience mismatch)
- SSRF rejection (private IPs, non-HTTPS URLs)
- All 14 failure reason codes

### Integration Testing with Team 2

Team 3 provides mock `IdentityVerifier` for Team 2's policy engine tests:
```rust
use axiom_identity::testing::MockIdentityVerifier;

let mock = MockIdentityVerifier::new()
    .with_success(identity_context)
    .build();
```

## Open Dependencies (Requires Team 0 Approval)

### 1. Contract Status: DRAFT v0.1.0-draft

The `IdentityContext` struct matches the Phase 1 playbook but is NOT frozen.

**Unresolved:**
- `cimd_uri` field optionality (always `Option<String>` vs. required for URL-formatted client_id?)
- `target_server` must be the configured canonical resource URI; audience checks are exact

### 2. JWKS Unavailability Behavior

**Current:** Hard failure (return `JwksUnavailable`, fail-closed in enforce mode)

**Open Question:** Should there be a grace period to use stale cached JWKS beyond TTL?

**Team 3 Recommendation:** Keep fail-closed for Phase 1; add configurable grace period in Phase 2.

The current cache fetches on miss/expiry (no background refresh), does not use
stale keys beyond TTL, and throttles unknown-key refreshes to once per 30 seconds.
Issuer/JWKS URLs come from administrator configuration. Fetches require HTTPS,
reject redirects and ambient proxies, validate all DNS answers as public, pin
those answers for the request, and cap the response at 1 MiB. Supported
algorithms are `RS256`, `ES256`, and `EdDSA`; symmetric keys and invalid/private
JWK material are rejected.

### 3. CIMD Fetch Failure Behavior

**Current:** CIMD fetching is not implemented. `cimd_uri` remains `None`, and the
claim is not presented as verified metadata.

**Open Question:** Should CIMD fetch failure be a hard error for URL-formatted client_id?

**Team 3 Recommendation:** Keep non-blocking for Phase 1; re-evaluate based on operational data.

## Implementation Status

### ✅ Implemented locally

- [x] Type definitions (`IdentityContext`, `AuthenticationFailure`, `VerificationResult`)
- [x] `IdentityVerifier` trait interface
- [x] RFC 8707 audience validation logic
- [x] Comprehensive documentation (SECURITY.md, FAILURE_MATRIX.md, INTERFACE_CONTRACT.md)
- [x] Unit tests for audience matching
- [x] Asymmetric JWT signature and claim validation with required `sub`, `iss`, `aud`, `exp`, `jti`, and `client_id`
- [x] Configured JWKS fetch/cache with SSRF protections and fail-closed expiry
- [x] Concrete `OidcIdentityVerifier` implementing the verifier trait

### 🚧 Remaining for Gate G1

- [ ] CIMD fetcher and cache
- [ ] Integration with Team 2's ExtMCP orchestrator

### 📋 Blocked/Needs Team 0 Decision

- [ ] Contract freeze (including optional `cimd_uri` and canonical `target_server`)
- [ ] JWKS unavailability grace period policy
- [ ] Fail-open vs. fail-closed decision for CIMD failures

## References

- [MCP OAuth 2.1 Authorization Specification](https://modelcontextprotocol.io/specification/draft/basic/authorization)
- [MCP Client Registration](https://blog.modelcontextprotocol.io/posts/client_registration/)
- [RFC 7519 - JSON Web Token (JWT)](https://www.rfc-editor.org/rfc/rfc7519.html)
- [RFC 8707 - Resource Indicators for OAuth 2.0](https://www.rfc-editor.org/rfc/rfc8707.html)
- [OAuth 2.1](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1)

## Contact

**Team Lead:** Team 3 Identity  
**GitHub Team:** `@axiom-nhi/team-3-identity`  
**Coordination:** See [Phase 1 Team Playbooks](../axiom_nhi_phase_1_team_implementation_playbooks.md) for cross-team integration
