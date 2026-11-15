# Identity Verification Failure Matrix

**Owner:** Team 3 (Identity & Authentication)  
**Status:** Draft v0.1.0-draft (Gate G1 first slice)  
**Integration:** Team 2 (ExtMCP Policy Orchestrator) converts these failures to appropriate denial responses.

## Overview

This document exhaustively enumerates every authentication failure scenario, the returned `FailureReason` code, and the behavior Team 2 should implement.

**Key Principles:**
1. **Deterministic:** Same input always produces same failure code.
2. **Fail-Safe:** Ambiguous or error conditions default to authentication failure.
3. **Secret Redaction:** No raw tokens or sensitive claim values in error messages.
4. **Observability:** Every failure includes correlation IDs for tracing.

## Failure Scenarios

### 1. Missing Credentials

**Scenario:** No `Authorization` header present in `RuntimeRequest`.

**Failure Code:** `MISSING_CREDENTIALS`

**IdentityVerifier Behavior:**
```rust
Err(AuthenticationFailure {
    reason: FailureReason::MissingCredentials,
    message: "No Authorization header present".to_string(),
    request_id: Some(request.request_id.clone()),
    target_server: None,
})
```

**Team 2 Response (Enforce Mode):**
- For `tools/call`: Return HTTP 200 with `isError: true` and message "Authentication required".
- For other methods: Return JSON-RPC error `-32001` with message "Authentication required".

**Team 5 Audit Event:**
```json
{
  "decision": "DENY",
  "denial_reason": "MISSING_CREDENTIALS",
  "agent_id": "anonymous",
  "authenticated": false
}
```

---

### 2. Malformed Authorization Header

**Scenario:** `Authorization` header present but not in `Bearer <token>` format.

**Examples:**
- `Authorization: Basic dXNlcjpwYXNz`
- `Authorization: token abc123`
- `Authorization: Bearer` (missing token)
- `Authorization: BearereyJ...` (missing space)

**Failure Code:** `MALFORMED_HEADER`

**IdentityVerifier Behavior:**
```rust
Err(AuthenticationFailure {
    reason: FailureReason::MalformedHeader,
    message: "Authorization header must be in format 'Bearer <token>'".to_string(),
    request_id: Some(request.request_id.clone()),
    target_server: None,
})
```

---

### 3. Invalid JWT Structure

**Scenario:** Bearer token is not a valid JWT (cannot be decoded).

**Examples:**
- Not three base64url-encoded parts separated by `.`
- Invalid base64url encoding
- Malformed JSON in header or payload

**Failure Code:** `INVALID_TOKEN`

**IdentityVerifier Behavior:**
```rust
Err(AuthenticationFailure {
    reason: FailureReason::InvalidToken,
    message: "Token is not a valid JWT".to_string(),
    request_id: Some(request.request_id.clone()),
    target_server: None,
})
```

**Security Note:** Error message does NOT echo the invalid token content.

---

### 4. Unsupported or Missing Algorithm

**Scenario:** JWT `alg` header is `none`, missing, or uses an unsupported algorithm.

**Rejected Algorithms:**
- `alg: none` (unsigned tokens)
- `HS256`, `HS384`, `HS512` (symmetric algorithms; require shared secrets)

**Allowed Algorithms:**
- `RS256`, `RS384`, `RS512` (RSA signatures)
- `ES256`, `ES384`, `ES512` (ECDSA signatures)

**Failure Code:** `UNSUPPORTED_ALGORITHM`

**IdentityVerifier Behavior:**
```rust
Err(AuthenticationFailure {
    reason: FailureReason::UnsupportedAlgorithm,
    message: "Token algorithm not supported (only RSA/ECDSA allowed)".to_string(),
    request_id: Some(request.request_id.clone()),
    target_server: None,
})
```

---

### 5. Invalid Signature

**Scenario:** JWT signature verification fails against JWKS public key.

**Possible Causes:**
- Token signed by wrong key
- Token modified after signing
- `kid` (key ID) in JWT header doesn't match any key in JWKS

**Failure Code:** `INVALID_SIGNATURE`

**IdentityVerifier Behavior:**
```rust
Err(AuthenticationFailure {
    reason: FailureReason::InvalidSignature,
    message: "Token signature verification failed".to_string(),
    request_id: Some(request.request_id.clone()),
    target_server: None,
})
```

**Security Note:** Do not reveal whether the failure was due to missing `kid` vs. signature mismatch (avoid oracle attacks).

---

### 6. Token Expired

**Scenario:** Current time > `exp` claim (accounting for clock skew).

**Validation Logic:**
```rust
let now_unix = Utc::now().timestamp();
let clock_skew_seconds = 30;
if now_unix > claims.exp + clock_skew_seconds {
    return Err(AuthenticationFailure::TokenExpired);
}
```

**Failure Code:** `TOKEN_EXPIRED`

**IdentityVerifier Behavior:**
```rust
Err(AuthenticationFailure {
    reason: FailureReason::TokenExpired,
    message: "Token has expired".to_string(),
    request_id: Some(request.request_id.clone()),
    target_server: None,
})
```

**Security Note:** Do NOT include the actual `exp` timestamp or current time in the error message (information leakage).

---

### 7. Token Not Yet Valid

**Scenario:** Current time < `nbf` claim (accounting for clock skew).

**Validation Logic:**
```rust
let now_unix = Utc::now().timestamp();
let clock_skew_seconds = 30;
if let Some(nbf) = claims.nbf {
    if now_unix < nbf - clock_skew_seconds {
        return Err(AuthenticationFailure::TokenNotYetValid);
    }
}
```

**Failure Code:** `TOKEN_NOT_YET_VALID`

**IdentityVerifier Behavior:**
```rust
Err(AuthenticationFailure {
    reason: FailureReason::TokenNotYetValid,
    message: "Token is not yet valid".to_string(),
    request_id: Some(request.request_id.clone()),
    target_server: None,
})
```

---

### 8. Audience Mismatch (Confused Deputy Protection)

**Scenario:** JWT `aud` claim does not include the `target_server` from RuntimeRequest.

**Example:**
- JWT has `aud: ["mcp://analytics-server"]`
- RuntimeRequest has `target_server: "prod-db"`
- Result: Audience mismatch

**Failure Code:** `AUDIENCE_MISMATCH`

**IdentityVerifier Behavior:**
```rust
Err(AuthenticationFailure {
    reason: FailureReason::AudienceMismatch,
    message: format!("Token audience does not include target server '{}'", target_server),
    request_id: Some(request.request_id.clone()),
    target_server: Some(target_server.clone()),
})
```

**Security Note:** Error message includes `target_server` but NOT the actual `aud` values from the JWT (secret redaction).

---

### 9. Missing Required Claims

**Scenario:** One or more required JWT claims are missing.

**Required Claims:**
- `sub` (subject/agent ID)
- `iss` (issuer)
- `aud` (audience)
- `exp` (expiration)
- `jti` (JWT ID, optional per OAuth but required by Axiom for revocation tracking)
- `client_id` (optional per OAuth but required by Axiom for client identification)

**Failure Code:** `MISSING_REQUIRED_CLAIMS`

**IdentityVerifier Behavior:**
```rust
Err(AuthenticationFailure {
    reason: FailureReason::MissingRequiredClaims,
    message: "Token is missing required claims (sub, iss, aud, exp, jti, client_id)".to_string(),
    request_id: Some(request.request_id.clone()),
    target_server: None,
})
```

**Implementation Note:** Do not enumerate which specific claims are missing (avoid oracle attacks).

---

### 10. JWKS Unavailable

**Scenario:** Cannot fetch JWKS from OAuth provider.

**Possible Causes:**
- Network timeout
- OAuth provider endpoint returns 4xx/5xx
- DNS resolution failure

**Failure Code:** `JWKS_UNAVAILABLE`

**IdentityVerifier Behavior:**
```rust
Err(AuthenticationFailure {
    reason: FailureReason::JwksUnavailable,
    message: "Unable to fetch key set for token verification".to_string(),
    request_id: Some(request.request_id.clone()),
    target_server: None,
})
```

**Team 2 Behavior:**
- **Enforce Mode:** Treat as authentication failure (fail-closed).
- **Observe-Only Mode:** Forward request, emit shadow failure event.

**Open Decision (Team 0):** Should there be a grace period to use stale cached JWKS? See SECURITY.md.

---

### 11. Network Timeout

**Scenario:** JWKS or CIMD fetch exceeds the timeout threshold (5 seconds).

**Failure Code:** `NETWORK_TIMEOUT`

**IdentityVerifier Behavior:**
```rust
Err(AuthenticationFailure {
    reason: FailureReason::NetworkTimeout,
    message: "Timeout fetching authentication metadata".to_string(),
    request_id: Some(request.request_id.clone()),
    target_server: None,
})
```

**Team 2 Behavior:** Same as `JWKS_UNAVAILABLE` (fail-closed in enforce mode).

---

### 12. SSRF Rejection

**Scenario:** JWKS or CIMD URL points to a disallowed destination.

**Rejected Patterns:**
- Private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, ::1, etc.)
- Non-HTTPS URLs (`http://`, `file://`, etc.)
- Link-local addresses (169.254.x.x, fe80::/10)

**Failure Code:** `SSRF_REJECTION`

**IdentityVerifier Behavior:**
```rust
Err(AuthenticationFailure {
    reason: FailureReason::SsrfRejection,
    message: "Token issuer URL is not allowed".to_string(),
    request_id: Some(request.request_id.clone()),
    target_server: None,
})
```

**Security Note:** Do NOT include the rejected URL in the error message (avoid leaking internal topology).

---

### 13. CIMD Unavailable (Non-Blocking)

**Scenario:** `client_id` is a URL but CIMD document fetch fails.

**Failure Code:** `CIMD_UNAVAILABLE`

**IdentityVerifier Behavior (Phase 1):**
- **Does NOT return an error**
- Sets `IdentityContext.cimd_uri = None`
- Request proceeds with authentication (CIMD is optional metadata)

**Team 5 Audit Event:**
- Include a warning field: `"cimd_fetch_failed": true`

**Future Enhancement (Phase 2):** Make CIMD failure blocking for client_id URLs if operational data shows CIMD is reliably available.

---

### 14. Internal Error

**Scenario:** Unhandled exception or unexpected error during verification.

**Examples:**
- Panic in JWT library (should be caught)
- Out-of-memory condition
- Corrupted cache state

**Failure Code:** `INTERNAL_ERROR`

**IdentityVerifier Behavior:**
```rust
Err(AuthenticationFailure {
    reason: FailureReason::InternalError,
    message: "An internal error occurred during authentication".to_string(),
    request_id: Some(request.request_id.clone()),
    target_server: None,
})
```

**Team 2 Behavior:** Fail-closed (treat as authentication failure).

**Observability:** Log full error details with tracing for Team 5, but redact from client-facing message.

---

## Integration Contract with Team 2

Team 2's ExtMCP orchestrator MUST handle these failure codes:

```rust
match identity_result {
    Ok(identity_context) => {
        // Proceed to validator and policy evaluation
    }
    Err(auth_failure) => {
        match runtime_mode {
            RuntimeMode::Enforce => {
                // Convert to appropriate denial response
                // tools/call: HTTP 200 + isError: true
                // Other methods: JSON-RPC error -32001
            }
            RuntimeMode::ObserveOnly => {
                // Record shadow failure, forward request
                audit_event.decision = "WOULD_DENY";
                audit_event.denial_reason = auth_failure.reason.to_string();
            }
        }
    }
}
```

## Testing Requirements

Team 3 MUST provide unit tests covering all 14 failure scenarios.

Team 6 (QA) MUST validate:
1. No raw tokens appear in any error message or log output.
2. All failure codes are deterministic (same input → same code).
3. Correlation IDs (`request_id`) are preserved in failure responses.

## Appendix: Sample Test Cases

### Test: Missing Authorization Header
```rust
#[tokio::test]
async fn test_missing_authorization_header() {
    let verifier = create_test_verifier();
    let request = VerificationRequest {
        raw_auth_header: None,
        target_server: "prod-db".to_string(),
        mcp_session_id: "session-123".to_string(),
        request_id: "req-456".to_string(),
    };
    
    let result = verifier.verify(&request).await;
    assert!(result.is_err());
    let err = result.unwrap_err();
    assert_eq!(err.reason, FailureReason::MissingCredentials);
    assert_eq!(err.request_id, Some("req-456".to_string()));
}
```

### Test: Expired Token
```rust
#[tokio::test]
async fn test_expired_token() {
    let expired_token = create_jwt_with_exp(Utc::now().timestamp() - 3600); // 1 hour ago
    let verifier = create_test_verifier();
    let request = VerificationRequest {
        raw_auth_header: Some(format!("Bearer {}", expired_token)),
        target_server: "prod-db".to_string(),
        mcp_session_id: "session-123".to_string(),
        request_id: "req-456".to_string(),
    };
    
    let result = verifier.verify(&request).await;
    assert!(result.is_err());
    let err = result.unwrap_err();
    assert_eq!(err.reason, FailureReason::TokenExpired);
}
```

### Test: Confused Deputy Attack (Audience Mismatch)
```rust
#[tokio::test]
async fn test_confused_deputy_protection() {
    let token = create_jwt_with_aud(vec!["mcp://analytics-server"]);
    let verifier = create_test_verifier();
    let request = VerificationRequest {
        raw_auth_header: Some(format!("Bearer {}", token)),
        target_server: "prod-db".to_string(), // Different from token aud
        mcp_session_id: "session-123".to_string(),
        request_id: "req-456".to_string(),
    };
    
    let result = verifier.verify(&request).await;
    assert!(result.is_err());
    let err = result.unwrap_err();
    assert_eq!(err.reason, FailureReason::AudienceMismatch);
    assert!(err.message.contains("prod-db")); // Target server logged
    assert!(!err.message.contains("analytics")); // Aud value NOT logged
}
```
