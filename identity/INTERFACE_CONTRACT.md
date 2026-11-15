# Interface Contract with Teams 1 and 2

**Owner:** Team 3 (Identity & Authentication)  
**Status:** Draft v0.1.0-draft (Gate G1 first slice)  
**Contract Version:** Must be approved by Team 0 before freeze

## Overview

This document defines the integration contract between:
- **Team 1 (Gateway)** → **Team 3 (Identity)**: Input contract
- **Team 3 (Identity)** → **Team 2 (Policy)**: Output contract

## Input Contract: Team 1 → Team 3

### Data Source: `RuntimeRequest`

Team 1's gateway extracts these fields from the incoming MCP request and passes them to Team 2's ExtMCP orchestrator, which then invokes Team 3's `IdentityVerifier`.

**Required Fields:**

```rust
// From Team 1's RuntimeRequest (draft v0.1.0)
pub struct RuntimeRequest {
    pub request_id: String,          // UUIDv7 generated at gateway ingress
    pub mcp_session_id: String,      // MCP session header
    pub target_server: String,       // Configured canonical MCP resource URI
    pub raw_auth_header: Option<String>, // Authorization: Bearer <token>
    // ... other fields omitted for brevity
}
```

**Team 3 Maps These To:**

```rust
pub struct VerificationRequest {
    pub raw_auth_header: Option<String>,  // <- RuntimeRequest.raw_auth_header
    pub target_server: String,            // <- RuntimeRequest.target_server
    pub mcp_session_id: String,           // <- RuntimeRequest.mcp_session_id
    pub request_id: String,               // <- RuntimeRequest.request_id
}
```

### Team 1 Responsibilities

1. **Extract Bearer Token from Authorization Header ONLY**
   - MUST NOT extract tokens from URL query strings or fragments (OAuth 2.1 Section 5.2).
   - Example extraction logic:
     ```javascript
     const authHeader = request.headers.get('authorization');
     if (authHeader && authHeader.startsWith('Bearer ')) {
       runtimeRequest.raw_auth_header = authHeader; // Full header value
     }
     ```

2. **Resolve Canonical Resource URI**
   - The `target_server` field MUST contain the configured canonical resource URI, not a display name.
   - Example: If the request is routed to `mcp://prod-db`, then `target_server = "mcp://prod-db"`.
   - Team 3 compares this value exactly against JWT `aud` for RFC 8707 audience binding.

3. **Preserve Session and Request IDs**
   - `mcp_session_id`: Extracted from `Mcp-Session-Id` header.
   - `request_id`: Generated UUIDv7 at gateway ingress for tracing.

### Failure Behavior

If Team 1 fails to extract these fields correctly:
- **Missing `raw_auth_header`**: Team 3 returns `FailureReason::MissingCredentials`.
- **Empty/Invalid `target_server`**: Team 3 cannot perform audience binding; recommend Team 2 fail-closed.
- **Missing correlation IDs**: Authentication may succeed but tracing/observability will be degraded.

---

## Output Contract: Team 3 → Team 2

### Success Path: `IdentityContext`

When authentication succeeds, Team 3 returns a fully validated `IdentityContext` struct:

```rust
pub struct IdentityContext {
    pub authenticated: bool,         // Always true on success path
    pub agent_id: String,            // JWT sub claim
    pub client_id: String,           // OAuth client_id claim
    pub cimd_uri: Option<String>,    // CIMD URL if client_id is URL-formatted
    pub issuer: String,              // JWT iss claim
    pub audience: Vec<String>,       // JWT aud claim (validated)
    pub scopes: Vec<String>,         // Parsed OAuth scopes
    pub token_jti: String,           // JWT jti claim (for revocation)
    pub expires_at_unix: i64,        // JWT exp claim
}
```

**Field Guarantees:**
- All required claims have been validated (sub, iss, aud, exp, jti, client_id).
- Cryptographic signature verified against JWKS.
- Token is temporally valid (current time within exp/nbf bounds + clock skew).
- Audience matches `target_server` per RFC 8707.

**DRAFT DEPENDENCY:**
- The `cimd_uri` field is marked `Option<String>` because CIMD is optional.
- **Team 0 must confirm:** Should this field be required, or can it remain optional for non-URL-formatted `client_id` values?

### Failure Path: `AuthenticationFailure`

When authentication fails, Team 3 returns a typed failure:

```rust
pub struct AuthenticationFailure {
    pub reason: FailureReason,       // Machine-readable code
    pub message: String,             // Human-readable (no secrets)
    pub request_id: Option<String>,  // Correlation ID
    pub target_server: Option<String>, // For audience mismatch logging
}

pub enum FailureReason {
    MissingCredentials,
    MalformedHeader,
    InvalidToken,
    InvalidSignature,
    UnsupportedAlgorithm,
    TokenExpired,
    TokenNotYetValid,
    AudienceMismatch,
    MissingRequiredClaims,
    JwksUnavailable,
    CimdUnavailable,
    NetworkTimeout,
    SsrfRejection,
    InternalError,
}
```

See [FAILURE_MATRIX.md](./FAILURE_MATRIX.md) for exhaustive failure scenarios.

### Team 2 Responsibilities

1. **Call Team 3's Verifier**
   ```rust
   let verification_request = VerificationRequest {
       raw_auth_header: runtime_request.raw_auth_header.clone(),
       target_server: runtime_request.target_server.clone(),
       mcp_session_id: runtime_request.mcp_session_id.clone(),
       request_id: runtime_request.request_id.clone(),
   };

   match identity_verifier.verify(&verification_request).await {
       Ok(identity_context) => { /* Proceed to validators and policy */ }
       Err(auth_failure) => { /* Handle authentication failure */ }
   }
   ```

2. **Handle Failures According to Runtime Mode**
   - **Enforce Mode:**
     - `tools/call`: Return HTTP 200 with `isError: true` and redacted message.
     - Other methods: Return JSON-RPC error `-32001`.
   - **Observe-Only Mode:**
     - Record shadow failure in audit event (`decision: "WOULD_DENY"`).
     - Forward request to backend (zero production disruption).

3. **Propagate Identity Context to Cedar**
   - Map `IdentityContext` fields to Cedar `principal` and `context`:
     ```rust
     let principal_uid = format!("Axiom::Agent::\"{}\"", identity_context.agent_id);
     let context_json = json!({
         "agent_id": identity_context.agent_id,
         "client_id": identity_context.client_id,
         "issuer": identity_context.issuer,
         "scopes": identity_context.scopes,
         "token_jti": identity_context.token_jti,
         // Merge with validator results...
     });
     ```

4. **Never Log Raw Tokens**
   - If logging `RuntimeRequest` for debugging, redact `raw_auth_header`.
   - If emitting audit events, include `agent_id` but not the bearer token.

---

## Integration with Team 5 (Observability)

Team 3 does NOT directly emit audit events or telemetry. Instead:

**Tracing Integration:**
- All identity verification operations use `tracing::instrument` for span context.
- Tracing output MUST NOT include raw bearer tokens.
- Example:
  ```rust
  #[tracing::instrument(
      name = "verify_identity",
      skip(self, request),
      fields(
          request_id = %request.request_id,
          target_server = %request.target_server,
          // DO NOT log raw_auth_header
      )
  )]
  async fn verify(&self, request: &VerificationRequest) -> VerificationResult {
      // ...
  }
  ```

**Cache Statistics:**
- Team 3 exposes `IdentityVerifier::cache_stats()` for observability.
- Team 5 can poll these stats for metrics emission (JWKS hits/misses, evictions).

---

## Latency Budget Allocation

From the [runtime pipeline](../docs/architecture/runtime-pipeline.md):

| Stage | Latency Budget (p99) |
|-------|----------------------|
| Team 3: Identity verification (cached JWKS) | <0.5 ms |
| Team 3: Identity verification (cold JWKS fetch) | May exceed inline budget; cache aggressively |

**Implementation Notes:**
- JWKS cache TTL: 1 hour (configurable).
- JWKS fetch timeout: 5 seconds (hard limit).
- Signature verification: <0.1 ms (via `jsonwebtoken` crate).

**When Latency Budget Exceeded:**
- If a cold JWKS fetch causes total ExtMCP latency to exceed 15 ms, the gateway's hard timeout will trigger.
- Team 2 interprets timeout as authentication failure in enforce mode.
- Mitigation: Aggressive caching + background JWKS refresh before TTL expiry.

---

## Open Questions for Team 0

These contract details require architectural decisions:

### 1. CIMD Field Optionality

**Question:** Is `IdentityContext.cimd_uri` always `Option<String>`, or should it be required when `client_id` is a URL?

**Options:**
- **Option A:** Always `Option<String>` (current design). CIMD fetch failure is non-blocking.
- **Option B:** Make it required for URL-formatted `client_id`; return authentication failure if CIMD fetch fails.

**Team 3 Recommendation:** Option A for Phase 1 (fail-open on CIMD unavailability).

### 2. RuntimeRequest.target_server Format — Resolved

`target_server` is the configured canonical resource URI for the selected MCP server. Team 3 compares it exactly with a JWT `aud` value. Display names, aliases, and suffix matches are not accepted. The gateway route configuration must map each route to this canonical URI.


### 3. Fail-Open Grace Period for JWKS Unavailability

**Question:** If JWKS endpoint is unreachable, should we use stale cached JWKS for a grace period?

**Current Behavior:** Hard failure (return `JwksUnavailable`).

**Proposed Enhancement (Phase 2):** Configurable grace period (e.g., use cached JWKS up to 15 minutes beyond TTL).

See [SECURITY.md](./SECURITY.md) for detailed analysis.

---

## Testing Contract

### Team 3 Provides

1. **Unit test fixtures** for common scenarios:
   - Valid JWT with matching audience
   - Expired JWT
   - Wrong audience JWT (confused deputy scenario)
   - Malformed tokens

2. **Mock `IdentityVerifier`** for Team 2's policy engine tests:
   ```rust
   pub struct MockIdentityVerifier {
       pub return_success: bool,
       pub identity_context: IdentityContext,
       pub failure: AuthenticationFailure,
   }
   ```

### Team 6 (QA) Validates

1. **Integration tests** with full pipeline (Team 1 → Team 2 → Team 3).
2. **Adversarial tests**:
   - Replay attacks (expired tokens)
   - Confused deputy attacks (wrong audience)
   - Token forgery (unsigned, tampered)
   - SSRF attempts (malicious JWKS URLs)
3. **Secret redaction audit**: No raw tokens in logs, errors, or telemetry.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0-draft | 2024-11-14 | Initial draft for Gate G1 first slice |

**Next Steps:**
- Team 0 review and approval of contract structure
- Team 1 and Team 2 review of integration points
- Contract freeze and version bump to 0.1.0 (no `-draft` suffix)
