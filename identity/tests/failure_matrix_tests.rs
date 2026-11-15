// Copyright 2024 Axiom NHI — Licensed under Apache-2.0
//! Failure matrix validation tests.
//!
//! These tests verify that all documented failure scenarios are correctly implemented
//! and produce the expected FailureReason codes per FAILURE_MATRIX.md.
//!
//! These tests cover shared failure-code serialization and request structure.
//! Concrete verifier behavior is covered in the identity crate unit tests.

use axiom_identity::{AuthenticationFailure, FailureReason, VerificationRequest};

#[test]
fn test_failure_reason_serialization() {
    // Verify that FailureReason serializes to expected string codes
    let reasons = vec![
        (FailureReason::MissingCredentials, "MISSING_CREDENTIALS"),
        (FailureReason::MalformedHeader, "MALFORMED_HEADER"),
        (FailureReason::InvalidToken, "INVALID_TOKEN"),
        (FailureReason::InvalidSignature, "INVALID_SIGNATURE"),
        (FailureReason::TokenExpired, "TOKEN_EXPIRED"),
        (FailureReason::TokenNotYetValid, "TOKEN_NOT_YET_VALID"),
        (FailureReason::AudienceMismatch, "AUDIENCE_MISMATCH"),
        (
            FailureReason::MissingRequiredClaims,
            "MISSING_REQUIRED_CLAIMS",
        ),
        (FailureReason::JwksUnavailable, "JWKS_UNAVAILABLE"),
        (FailureReason::NetworkTimeout, "NETWORK_TIMEOUT"),
        (FailureReason::SsrfRejection, "SSRF_REJECTION"),
    ];

    for (reason, expected) in reasons {
        let json = serde_json::to_string(&reason).unwrap();
        assert_eq!(
            json,
            format!(r#""{}""#, expected),
            "FailureReason::{:?} should serialize to {}",
            reason,
            expected
        );
    }
}

#[test]
fn test_authentication_failure_structure() {
    let failure = AuthenticationFailure::new(FailureReason::TokenExpired, "Token has expired")
        .with_request_id("req-12345")
        .with_target_server("prod-db");

    assert_eq!(failure.reason, FailureReason::TokenExpired);
    assert_eq!(failure.message, "Token has expired");
    assert_eq!(failure.request_id, Some("req-12345".to_string()));
    assert_eq!(failure.target_server, Some("prod-db".to_string()));
}

#[test]
fn test_verification_request_construction() {
    let request = VerificationRequest {
        raw_auth_header: Some("Bearer eyJhbGciOiJSUzI1NiJ9...".to_string()),
        target_server: "prod-db".to_string(),
        mcp_session_id: "session-abc123".to_string(),
        request_id: "req-def456".to_string(),
    };

    assert!(request.raw_auth_header.is_some());
    assert_eq!(request.target_server, "prod-db");
    assert_eq!(request.mcp_session_id, "session-abc123");
    assert_eq!(request.request_id, "req-def456");
}

#[test]
fn test_verification_request_missing_auth() {
    let request = VerificationRequest {
        raw_auth_header: None,
        target_server: "prod-db".to_string(),
        mcp_session_id: "session-abc123".to_string(),
        request_id: "req-def456".to_string(),
    };

    assert!(request.raw_auth_header.is_none());
}

// Signature, claims, bearer parsing, audience, and pre-connect SSRF behavior
// are exercised in `src/oauth/jwt_validator.rs` and `src/verifier.rs` tests.
