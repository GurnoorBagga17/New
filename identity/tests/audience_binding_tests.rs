// Copyright 2024 Axiom NHI — Licensed under Apache-2.0
//! RFC 8707 audience binding and confused deputy protection tests.
//!
//! These tests verify that Team 3's identity verifier correctly enforces
//! audience matching to prevent confused deputy attacks.

use axiom_identity::resource_indicators::validator::validate_audience;
use axiom_identity::FailureReason;

#[test]
fn test_exact_audience_match() {
    let audience = vec!["prod-db".to_string()];
    let result = validate_audience(&audience, "prod-db");
    assert!(result.is_ok(), "Exact match should succeed");
}

#[test]
fn test_uri_formatted_audience_match() {
    let audience = vec!["mcp://prod-db".to_string()];
    let result = validate_audience(&audience, "mcp://prod-db");
    assert!(
        result.is_ok(),
        "configured canonical resource URI should match exactly"
    );
}

#[test]
fn test_https_formatted_audience_match() {
    let audience = vec!["https://mcp.example.com/prod-db".to_string()];
    let result = validate_audience(&audience, "https://mcp.example.com/prod-db");
    assert!(
        result.is_ok(),
        "configured HTTPS resource URI should match exactly"
    );
}

#[test]
fn test_multiple_audiences_contains_target() {
    let audience = vec![
        "mcp://analytics".to_string(),
        "mcp://prod-db".to_string(),
        "mcp://staging-db".to_string(),
    ];
    let result = validate_audience(&audience, "mcp://prod-db");
    assert!(
        result.is_ok(),
        "Canonical target resource in multi-audience list should succeed"
    );
}

#[test]
fn test_audience_mismatch_denial() {
    let audience = vec!["mcp://analytics-server".to_string()];
    let result = validate_audience(&audience, "prod-db");

    assert!(result.is_err(), "Audience mismatch should fail");

    let err = result.unwrap_err();
    assert_eq!(
        err.reason,
        FailureReason::AudienceMismatch,
        "Failure reason should be AUDIENCE_MISMATCH"
    );
    assert!(
        err.message.contains("prod-db"),
        "Error message should include target server"
    );
    assert!(
        !err.message.contains("analytics"),
        "Error message must NOT include actual audience (secret redaction)"
    );
}

#[test]
fn test_empty_audience_list() {
    let audience = vec![];
    let result = validate_audience(&audience, "prod-db");

    assert!(result.is_err(), "Empty audience should fail");
    assert_eq!(result.unwrap_err().reason, FailureReason::AudienceMismatch);
}

#[test]
fn test_confused_deputy_attack_prevention() {
    // Scenario: Attacker obtains token for analytics server and tries to replay against prod-db
    let analytics_token_aud = vec!["mcp://analytics-server".to_string()];

    // Attempt to use analytics token for prod-db access
    let result = validate_audience(&analytics_token_aud, "prod-db");

    assert!(
        result.is_err(),
        "Confused deputy attack should be prevented"
    );
    assert_eq!(result.unwrap_err().reason, FailureReason::AudienceMismatch);
}

#[test]
fn test_wildcard_should_not_match() {
    // Ensure that wildcard audiences are not supported (explicit target required)
    let audience = vec!["mcp://*".to_string()];
    let result = validate_audience(&audience, "prod-db");

    // Current implementation does not support wildcards
    assert!(
        result.is_err(),
        "Wildcard audience should not match specific target"
    );
}

#[test]
fn test_partial_name_does_not_match() {
    // Ensure that "prod" doesn't match "prod-db" (no substring matching)
    let audience = vec!["mcp://prod".to_string()];
    let result = validate_audience(&audience, "prod-db");

    assert!(result.is_err(), "Partial name match should fail");
}

#[test]
fn test_case_sensitive_matching() {
    // Audience matching should be case-sensitive
    let audience = vec!["mcp://PROD-DB".to_string()];
    let result = validate_audience(&audience, "prod-db");

    // Current implementation is case-sensitive
    assert!(
        result.is_err(),
        "Case mismatch should fail (audience validation is case-sensitive)"
    );
}
