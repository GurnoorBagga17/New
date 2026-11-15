# Security Boundaries and Threat Model

**Owner:** Team 3 (Identity & Authentication)  
**Status:** Draft v0.1.0-draft (Gate G1 first slice)  
**Last Updated:** 2024-11-14

## Security Guarantees

Team 3's identity verification layer enforces these security boundaries:

### 1. OAuth 2.1 Compliance

**Threat:** Token leakage via URL logging, browser history, or proxy caches.

**Mitigation:**
- Per OAuth 2.1 Section 5.2, bearer tokens MUST be transmitted in the `Authorization` header.
- Team 1 (Gateway) must extract tokens from HTTP headers only, never from query strings or fragments.
- Team 3 rejects any attempt to pass tokens via URL parameters.

**Test Coverage:** `tests/failure_matrix_tests.rs::test_reject_query_string_token`

### 2. Cryptographic Signature Verification

**Threat:** Token forgery, tampering, or unsigned `alg: none` attacks.

**Mitigation:**
- All JWTs verified using `jsonwebtoken` crate with strict signature validation.
- Public keys fetched from OAuth provider's JWKS endpoint and cached securely.
- `alg: none` tokens explicitly rejected (covered by `jsonwebtoken` defaults).
- Implemented allowlist: RS256, ES256, and EdDSA. Symmetric algorithms and JWK key-type/algorithm mismatches are rejected.

**Test Coverage:** `src/oauth/jwt_validator.rs` tests signed-token verification, tampering, unsupported key types, and weak RSA keys.

### 3. Temporal Validity with Bounded Clock Skew

**Threat:** Expired or not-yet-valid token replay attacks.

**Mitigation:**
- `exp` (expiration) claim strictly enforced: `current_time <= exp + clock_skew`
- `nbf` (not before) claim enforced: `current_time >= nbf - clock_skew`
- **Clock skew tolerance: ≤30 seconds** to balance distributed system clock drift vs. replay window.
- Clock skew is a security-vs-reliability tradeoff: smaller values tighten replay window but increase false rejections.

**Rationale:** 30-second skew allows for reasonable NTP drift while limiting token reuse window to an acceptable risk level for Phase 1.

**Test Coverage:** `tests/jwt_validation_tests.rs::test_expired_token_with_clock_skew`

### 4. RFC 8707 Audience Binding (Confused Deputy Protection)

**Threat:** Cross-resource token replay attacks.

**Attack Scenario:**
1. Attacker obtains legitimate token with `aud: ["mcp://analytics-server"]`
2. Attacker replays token against `mcp://prod-db-server`
3. Without audience binding, the token would be accepted despite wrong target.

**Mitigation:**
- JWT `aud` claim MUST contain the exact configured canonical resource URI from `RuntimeRequest`.
- Supports both single-string and array `aud` formats per RFC 7519.
- Display names, aliases, URI suffixes, and other non-exact matches are rejected.
- On mismatch, error message includes `target_server` but NOT the mismatched `aud` values (secret redaction).

**Test Coverage:** `tests/audience_binding_tests.rs` plus signed JWT tests in `src/oauth/jwt_validator.rs`.

### 5. SSRF Protection for Remote Metadata Fetches

**Threat:** Server-Side Request Forgery via malicious JWKS/CIMD URLs.

**Attack Scenarios:**
- Attacker provides JWT with `iss: "http://169.254.169.254/evil-jwks"` (AWS metadata endpoint)
- Attacker uses DNS rebinding to bypass IP checks
- Attacker forces fetches to internal services or localhost

**Mitigation:**
- **IP Address Filtering:**
  - Reject loopback: `127.0.0.0/8`, `::1`
  - Reject link-local: `169.254.0.0/16`, `fe80::/10`
  - Reject RFC 1918 private: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
  - Reject documentation/test ranges: `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`
- **Protocol Requirements:**
  - JWKS and CIMD URLs MUST use HTTPS (reject `http://`, `file://`, etc.).
  - TLS certificate validation enforced via `reqwest` with `rustls-tls` (no self-signed certs).
- **Request Timeouts:**
  - Hard 5-second timeout for JWKS fetches.
  - Hard 5-second timeout for CIMD fetches.
- **Redirect Handling:** Redirects are disabled. A configured JWKS URL that responds with a redirect is rejected.

**Implementation Notes:**
- URL parsing uses `url` crate; the issuer and JWKS URL must be administrator-configured HTTPS URLs.
- DNS is resolved before the request; every result must be globally routable, and reqwest is pinned to those checked addresses to prevent rebinding.
- Ambient proxies are disabled, response bodies are capped at 1 MiB, and the 5-second timeout covers DNS and HTTP.
- The unverified `iss` claim only selects a preconfigured issuer entry; it never supplies a fetch URL.
- CIMD fetching is not implemented. No client metadata is claimed as verified in `IdentityContext`.

**Test Coverage:** `src/oauth/jwks_cache.rs` tests URL validation and rejects non-global IPv4/IPv6 ranges.

### 6. Secret Redaction

**Threat:** Bearer token leakage via logs, error messages, or telemetry.

**Mitigation:**
- Raw bearer tokens NEVER appear in:
  - Error messages returned to callers
  - Tracing/logging output (Team 5 telemetry)
  - Audit events
  - Debug output
- Error messages use generic phrasing: "Invalid token" instead of echoing token content.
- On audience mismatch, log `target_server` but NOT the mismatched `aud` value.

**Implementation Pattern:**
```rust
// ✅ GOOD: Redacted error
tracing::warn!(
    request_id = %request_id,
    target_server = %target_server,
    "Audience mismatch detected"
);

// ❌ BAD: Token leak
tracing::warn!(
    token = %raw_token,  // NEVER DO THIS
    "Invalid token"
);
```

**Test Coverage:** Manual security review + Team 6 adversarial logging tests.

## Out of Scope for Team 3

The following security responsibilities belong to other teams:

| Threat | Responsible Team | Phase |
|--------|------------------|-------|
| Authorization policy decisions | Team 2 (Policy) | Phase 1 |
| SQL injection / path traversal in arguments | Team 4 (Validators) | Phase 1 |
| Audit log tampering / integrity | Team 5 (Observability) | Phase 1 |
| Rate limiting / DDoS protection | Team 1 (Gateway) | Phase 1 |
| Token exchange / delegation (RFC 8693) | Team 3 | Phase 3 |
| Cloud IAM discovery (AWS, K8s, GitHub) | Team 3 | Phase 2 |
| Multi-factor authentication | Team 3 | Phase 3+ |

## Open Security Questions for Team 0

These questions require architectural decisions before contract freeze:

### Q1: Fail-Open vs. Fail-Closed for JWKS Unavailability

**Scenario:** JWKS endpoint is unreachable (network failure, provider outage, etc.).

**Options:**
- **Option A (Fail-Closed):** Return `AuthenticationFailure::JwksUnavailable`, which Team 2 treats as a denial in enforce mode.
  - **Pro:** Maximum security; no unverified tokens processed.
  - **Con:** Complete service outage if OAuth provider has a transient failure.
- **Option B (Fail-Open with Cache Grace Period):** If JWKS fetch fails, continue using cached JWKS beyond TTL for a grace period (e.g., 15 minutes).
  - **Pro:** Resilience to transient OAuth provider outages.
  - **Con:** Potential to accept revoked keys during the grace period.

**Team 3 Recommendation:** Option A (fail-closed) for Phase 1; add configurable grace period in Phase 2 after measuring OAuth provider SLAs.

### Q2: CIMD Fetch Failure Behavior

**Scenario:** `client_id` is a URL but CIMD document fetch fails.

**Current Behavior:** Non-blocking; `IdentityContext.cimd_uri` set to `None` and request proceeds.

**Question:** Should CIMD fetch failure be a hard error if the `client_id` is URL-formatted?

**Team 3 Recommendation:** Keep non-blocking for Phase 1. CIMD is optional metadata enrichment, not a core authentication requirement.

### Q3: Token Revocation Integration with Team 5

**Current Design:** Team 5 owns a kill-switch that checks `agent_id` and `token_jti` before policy evaluation.

**Question:** Should Team 3 also check revocation state during identity verification, or is a single check at the ExtMCP orchestration layer (Team 2) sufficient?

**Trade-offs:**
- **Single check (Team 2):** Simpler, avoids duplicate revocation lookups.
- **Dual check (Team 3 + Team 2):** Defense in depth, faster rejection of revoked tokens.

**Team 3 Recommendation:** Single check at Team 2 orchestration layer (current design). Re-evaluate if performance data shows benefit to early rejection.

## References

- [OAuth 2.1](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1)
- [RFC 7519 - JSON Web Token (JWT)](https://www.rfc-editor.org/rfc/rfc7519.html)
- [RFC 8707 - Resource Indicators for OAuth 2.0](https://www.rfc-editor.org/rfc/rfc8707.html)
- [MCP OAuth 2.1 Authorization Specification](https://modelcontextprotocol.io/specification/draft/basic/authorization)
- [MCP Client Registration Blog Post](https://blog.modelcontextprotocol.io/posts/client_registration/)
- [OWASP SSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
