//! RFC 8785 canonical tool-definition hashing.

use serde::Serialize;
use sha2::{Digest, Sha256};
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToolPinFacts {
    pub sha256: String,
    pub verified: bool,
}

#[derive(Debug, Error)]
pub enum ToolPinError {
    #[error("tool definition could not be canonicalized")]
    Canonicalization,
}

pub fn digest<T: Serialize>(definition: &T) -> Result<String, ToolPinError> {
    let canonical = serde_jcs::to_vec(definition).map_err(|_| ToolPinError::Canonicalization)?;
    Ok(hex::encode(Sha256::digest(canonical)))
}

pub fn verify<T: Serialize>(
    definition: &T,
    expected_sha256: &str,
) -> Result<ToolPinFacts, ToolPinError> {
    let actual = digest(definition)?;
    let expected = expected_sha256.trim().to_ascii_lowercase();
    let verified = expected.len() == 64
        && expected.bytes().all(|byte| byte.is_ascii_hexdigit())
        && constant_time_eq(actual.as_bytes(), expected.as_bytes());
    Ok(ToolPinFacts {
        sha256: actual,
        verified,
    })
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.iter()
        .zip(right)
        .fold(0u8, |diff, (a, b)| diff | (a ^ b))
        == 0
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn jcs_hash_is_independent_of_object_key_order() {
        let first = json!({"name":"lookup","inputSchema":{"type":"object","required":["id"]}});
        let second = json!({"inputSchema":{"required":["id"],"type":"object"},"name":"lookup"});
        assert_eq!(digest(&first).unwrap(), digest(&second).unwrap());
    }

    #[test]
    fn verifies_only_the_configured_digest() {
        let definition = json!({"name":"lookup","version":1});
        let digest = digest(&definition).unwrap();
        assert!(verify(&definition, &digest).unwrap().verified);
        assert!(!verify(&definition, &"0".repeat(64)).unwrap().verified);
        assert!(!verify(&definition, "invalid").unwrap().verified);
    }
}
