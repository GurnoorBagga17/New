// Copyright 2024 Axiom NHI — Licensed under Apache-2.0
//! Audience validation logic for RFC 8707 resource binding.

use crate::types::{AuthenticationFailure, FailureReason};

/// Validate that the JWT audience claim matches the target MCP server.
///
/// # Arguments
/// * `jwt_audience` - Audience from JWT (single string or array)
/// * `target_server` - Canonical resource URI for the MCP server, not a display name
///
/// # Returns
/// * `Ok(())` if audience exactly contains target_server
/// * `Err(AuthenticationFailure)` with AudienceMismatch reason
///
/// # Security Notes
/// - Error message includes target_server but NOT the mismatched audience values
/// - Supports both `"aud": "value"` and `"aud": ["value1", "value2"]` per RFC 7519
pub fn validate_audience(
    jwt_audience: &[String],
    target_server: &str,
) -> Result<(), AuthenticationFailure> {
    // Compare canonical resource identifiers exactly. Suffix matching would
    // allow https://attacker.invalid/path/prod-db to match mcp://prod-db.
    let matched = jwt_audience.iter().any(|aud| aud == target_server);

    if matched {
        Ok(())
    } else {
        Err(AuthenticationFailure::new(
            FailureReason::AudienceMismatch,
            format!(
                "Token audience does not include the canonical resource for target server '{}'",
                target_server
            ),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_exact_audience_match() {
        let audience = vec!["prod-db".to_string()];
        assert!(validate_audience(&audience, "prod-db").is_ok());
    }

    #[test]
    fn test_canonical_uri_audience() {
        let audience = vec!["mcp://prod-db".to_string()];
        assert!(validate_audience(&audience, "mcp://prod-db").is_ok());
    }

    #[test]
    fn test_multiple_audiences() {
        let audience = vec!["mcp://analytics".to_string(), "mcp://prod-db".to_string()];
        assert!(validate_audience(&audience, "mcp://prod-db").is_ok());
    }

    #[test]
    fn test_audience_mismatch() {
        let audience = vec!["mcp://analytics".to_string()];
        let result = validate_audience(&audience, "mcp://prod-db");
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert_eq!(err.reason, FailureReason::AudienceMismatch);
        assert!(err.message.contains("mcp://prod-db"));
    }

    #[test]
    fn test_empty_audience() {
        let audience = vec![];
        let result = validate_audience(&audience, "mcp://prod-db");
        assert!(result.is_err());
    }

    #[test]
    fn rejects_attacker_uri_with_matching_server_name_suffix() {
        let audience = vec!["https://attacker.invalid/path/prod-db".to_string()];
        assert!(validate_audience(&audience, "mcp://prod-db").is_err());
    }

    #[test]
    fn bare_server_name_does_not_match_canonical_resource_uri() {
        let audience = vec!["prod-db".to_string()];
        assert!(validate_audience(&audience, "mcp://prod-db").is_err());
    }
}
