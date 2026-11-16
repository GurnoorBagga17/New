//! Cryptographic JWT verification and strict claim normalization.

use std::sync::Arc;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use jsonwebtoken::{
    decode, decode_header,
    jwk::{AlgorithmParameters, EllipticCurve, Jwk, KeyAlgorithm, KeyOperations, PublicKeyUse},
    Algorithm, DecodingKey, TokenData, Validation,
};
use serde::Deserialize;

use crate::{
    resource_indicators::validator::validate_audience,
    types::{Audience, AuthenticationFailure, FailureReason, IdentityContext},
};

use super::jwks_cache::{JwksCache, JwksError};

const MAX_TOKEN_BYTES: usize = 16 * 1024;
const CLOCK_SKEW_SECONDS: u64 = 30;

#[derive(Debug, Deserialize)]
struct Claims {
    sub: Option<String>,
    iss: Option<String>,
    aud: Option<Audience>,
    exp: Option<i64>,
    jti: Option<String>,
    client_id: Option<String>,
    #[serde(default, alias = "scp")]
    scope: Option<String>,
}

/// Validates JWTs against administrator-configured issuer JWKS endpoints.
pub struct JwtValidator {
    jwks: Arc<JwksCache>,
    clock_skew_seconds: u64,
    cimd: Option<Arc<crate::cimd::CimdValidator>>,
}

impl JwtValidator {
    pub fn new(jwks: Arc<JwksCache>) -> Self {
        Self {
            jwks,
            clock_skew_seconds: CLOCK_SKEW_SECONDS,
            cimd: None,
        }
    }

    pub fn with_cimd(mut self, cimd: Arc<crate::cimd::CimdValidator>) -> Self {
        self.cimd = Some(cimd);
        self
    }

    pub async fn validate(
        &self,
        token: &str,
        target_resource: &str,
    ) -> Result<IdentityContext, AuthenticationFailure> {
        if token.is_empty() || token.len() > MAX_TOKEN_BYTES {
            return Err(failure(FailureReason::InvalidToken, "Invalid bearer token"));
        }
        let issuer = unverified_issuer(token)
            .ok_or_else(|| failure(FailureReason::InvalidToken, "Invalid bearer token"))?;
        let header = decode_header(token)
            .map_err(|_| failure(FailureReason::InvalidToken, "Invalid bearer token"))?;
        if header.kid.as_deref().is_none_or(str::is_empty) || !allowed_algorithm(header.alg) {
            return Err(failure(
                FailureReason::UnsupportedAlgorithm,
                "Token signing algorithm or key identifier is not supported",
            ));
        }

        let mut keys = self.jwks.get(&issuer).await.map_err(map_jwks_error)?;
        let context = match header.kid.as_deref().and_then(|kid| keys.find(kid)) {
            Some(jwk) => self.decode_with_key(token, target_resource, &issuer, &header.alg, jwk)?,
            None => {
                keys = self.jwks.refresh(&issuer).await.map_err(map_jwks_error)?;
                let Some(jwk) = header.kid.as_deref().and_then(|kid| keys.find(kid)) else {
                    return Err(failure(
                        FailureReason::InvalidSignature,
                        "Token signing key is not trusted",
                    ));
                };
                self.decode_with_key(token, target_resource, &issuer, &header.alg, jwk)?
            }
        };

        if let Some(ref cimd) = self.cimd {
            if context.client_id.starts_with("https://") {
                cimd.resolve_or_fetch(&context.client_id)
                    .await
                    .map_err(|_| {
                        failure(
                            FailureReason::InvalidToken,
                            "CIMD metadata document verification failed",
                        )
                    })?;
            }
        }

        Ok(context)
    }

    fn decode_with_key(
        &self,
        token: &str,
        target_resource: &str,
        issuer: &str,
        algorithm: &Algorithm,
        jwk: &Jwk,
    ) -> Result<IdentityContext, AuthenticationFailure> {
        if !jwk_matches_algorithm(jwk, *algorithm) {
            return Err(failure(
                FailureReason::UnsupportedAlgorithm,
                "Token signing key is not an allowed public verification key",
            ));
        }
        let key = DecodingKey::from_jwk(jwk)
            .map_err(|_| failure(FailureReason::InvalidSignature, "Invalid token signature"))?;
        let mut validation = Validation::new(*algorithm);
        validation.algorithms = vec![*algorithm];
        validation.leeway = self.clock_skew_seconds;
        validation.validate_exp = true;
        validation.validate_nbf = true;
        validation.validate_aud = false;
        validation.set_issuer(&[issuer]);
        validation.set_required_spec_claims(&["exp", "iss", "aud"]);

        let data: TokenData<Claims> = decode(token, &key, &validation).map_err(map_jwt_error)?;
        let claims = data.claims;
        let subject = non_empty_claim(claims.sub)?;
        let claim_issuer = non_empty_claim(claims.iss)?;
        let client_id = non_empty_claim(claims.client_id)?;
        let token_jti = non_empty_claim(claims.jti)?;
        let expires_at_unix = claims.exp.ok_or_else(|| {
            failure(
                FailureReason::MissingRequiredClaims,
                "Required token claims are missing",
            )
        })?;
        let audiences = claims
            .aud
            .ok_or_else(|| {
                failure(
                    FailureReason::MissingRequiredClaims,
                    "Required token claims are missing",
                )
            })?
            .into_vec();
        if audiences.is_empty() || audiences.iter().any(|value| value.trim().is_empty()) {
            return Err(failure(
                FailureReason::MissingRequiredClaims,
                "Required token claims are missing",
            ));
        }
        validate_audience(&audiences, target_resource).map_err(|_| {
            AuthenticationFailure::new(
                FailureReason::AudienceMismatch,
                "Token audience does not match the configured resource",
            )
            .with_target_server(target_resource)
        })?;

        if claim_issuer != issuer {
            return Err(failure(
                FailureReason::InvalidToken,
                "Token issuer is not trusted",
            ));
        }
        let scopes = claims
            .scope
            .unwrap_or_default()
            .split_ascii_whitespace()
            .map(str::to_owned)
            .collect();

        let verified_cimd_uri = if crate::cimd::CimdValidator::is_cimd_client_id(&client_id)
            && crate::cimd::CimdValidator::validate_cimd_url(&client_id).is_ok()
        {
            Some(client_id.clone())
        } else {
            None
        };

        Ok(IdentityContext {
            authenticated: true,
            agent_id: subject,
            client_id,
            cimd_uri: verified_cimd_uri,
            issuer: claim_issuer,
            audience: audiences,
            scopes,
            token_jti,
            expires_at_unix,
        })
    }
}

fn unverified_issuer(token: &str) -> Option<String> {
    let mut parts = token.split('.');
    let _header = parts.next()?;
    let payload = parts.next()?;
    let signature = parts.next()?;
    if parts.next().is_some() || signature.is_empty() {
        return None;
    }
    let bytes = URL_SAFE_NO_PAD.decode(payload).ok()?;
    let value: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
    value.get("iss")?.as_str().map(str::to_owned)
}

fn non_empty_claim(value: Option<String>) -> Result<String, AuthenticationFailure> {
    value
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| {
            failure(
                FailureReason::MissingRequiredClaims,
                "Required token claims are missing",
            )
        })
}

fn allowed_algorithm(algorithm: Algorithm) -> bool {
    matches!(
        algorithm,
        Algorithm::RS256 | Algorithm::ES256 | Algorithm::EdDSA
    )
}

fn jwk_matches_algorithm(jwk: &Jwk, algorithm: Algorithm) -> bool {
    if let Some(key_use) = &jwk.common.public_key_use {
        if key_use != &PublicKeyUse::Signature {
            return false;
        }
    }
    if let Some(operations) = &jwk.common.key_operations {
        if !operations.contains(&KeyOperations::Verify)
            || operations
                .iter()
                .any(|operation| operation != &KeyOperations::Verify)
        {
            return false;
        }
    }
    if let Some(key_algorithm) = jwk.common.key_algorithm {
        let expected = match algorithm {
            Algorithm::RS256 => KeyAlgorithm::RS256,
            Algorithm::ES256 => KeyAlgorithm::ES256,
            Algorithm::EdDSA => KeyAlgorithm::EdDSA,
            _ => return false,
        };
        if key_algorithm != expected {
            return false;
        }
    }

    match (&jwk.algorithm, algorithm) {
        (AlgorithmParameters::RSA(parameters), Algorithm::RS256) => URL_SAFE_NO_PAD
            .decode(&parameters.n)
            .is_ok_and(|modulus| modulus.len() >= 256),
        (AlgorithmParameters::EllipticCurve(parameters), Algorithm::ES256) => {
            parameters.curve == EllipticCurve::P256
        }
        (AlgorithmParameters::OctetKeyPair(parameters), Algorithm::EdDSA) => {
            parameters.curve == EllipticCurve::Ed25519
        }
        // Symmetric JWKs and all unsupported/ambiguous key combinations fail closed.
        _ => false,
    }
}

fn map_jwks_error(error: JwksError) -> AuthenticationFailure {
    match error {
        JwksError::UnknownIssuer => {
            failure(FailureReason::InvalidToken, "Token issuer is not trusted")
        }
        JwksError::SsrfRejection => failure(
            FailureReason::SsrfRejection,
            "Trusted key endpoint was rejected",
        ),
        JwksError::Timeout => failure(
            FailureReason::NetworkTimeout,
            "Trusted key endpoint timed out",
        ),
        JwksError::InvalidConfiguration | JwksError::Unavailable => failure(
            FailureReason::JwksUnavailable,
            "Trusted signing keys are unavailable",
        ),
    }
}

fn map_jwt_error(error: jsonwebtoken::errors::Error) -> AuthenticationFailure {
    use jsonwebtoken::errors::ErrorKind;
    let (reason, message) = match error.kind() {
        ErrorKind::ExpiredSignature => (FailureReason::TokenExpired, "Bearer token has expired"),
        ErrorKind::ImmatureSignature => (
            FailureReason::TokenNotYetValid,
            "Bearer token is not yet valid",
        ),
        ErrorKind::InvalidSignature => (FailureReason::InvalidSignature, "Invalid token signature"),
        ErrorKind::InvalidAlgorithm | ErrorKind::InvalidAlgorithmName => (
            FailureReason::UnsupportedAlgorithm,
            "Token signing algorithm is not supported",
        ),
        ErrorKind::MissingRequiredClaim(_) => (
            FailureReason::MissingRequiredClaims,
            "Required token claims are missing",
        ),
        _ => (FailureReason::InvalidToken, "Invalid bearer token"),
    };
    failure(reason, message)
}

fn failure(reason: FailureReason, message: &str) -> AuthenticationFailure {
    AuthenticationFailure::new(reason, message)
}

#[cfg(test)]
mod tests {
    use super::*;
    use jsonwebtoken::{encode, EncodingKey, Header};
    use std::time::{SystemTime, UNIX_EPOCH};

    const TEST_ISSUER: &str = "https://issuer.example";
    const TEST_RESOURCE: &str = "mcp://prod-db";

    fn validator() -> JwtValidator {
        let issuer = super::super::jwks_cache::TrustedIssuer::new(
            TEST_ISSUER,
            "https://issuer.example/.well-known/jwks.json",
        )
        .unwrap();
        let cache =
            Arc::new(JwksCache::new(vec![issuer], std::time::Duration::from_secs(3600)).unwrap());
        let keys: jsonwebtoken::jwk::JwkSet =
            serde_json::from_str(include_str!("../../tests/fixtures/jwks.json")).unwrap();
        cache.seed_for_test(TEST_ISSUER, keys);
        JwtValidator::new(cache)
    }

    fn signed_token(mut claims: serde_json::Value) -> String {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        if let Some(object) = claims.as_object_mut() {
            object.entry("iss").or_insert(TEST_ISSUER.into());
            object.entry("sub").or_insert("agent-test-1".into());
            object.entry("aud").or_insert(TEST_RESOURCE.into());
            object.entry("exp").or_insert((now + 300).into());
            object.entry("jti").or_insert("jti-test-1".into());
            object.entry("client_id").or_insert("test-client".into());
            object.entry("scope").or_insert("mcp:read mcp:write".into());
        }
        let mut header = Header::new(Algorithm::RS256);
        header.kid = Some("axiom-test-rsa-1".into());
        encode(
            &header,
            &claims,
            &EncodingKey::from_rsa_pem(include_bytes!(
                "../../tests/fixtures/identity_test_private.pem"
            ))
            .unwrap(),
        )
        .unwrap()
    }

    #[test]
    fn rejects_symmetric_and_mismatched_jwks_algorithms() {
        let symmetric: Jwk = serde_json::from_value(serde_json::json!({
            "kty":"oct", "kid":"k", "alg":"HS256", "k":"c2VjcmV0"
        }))
        .unwrap();
        assert!(!jwk_matches_algorithm(&symmetric, Algorithm::HS256));

        let rsa: Jwk = serde_json::from_value(serde_json::json!({
            "kty":"RSA", "kid":"r", "alg":"RS256", "n":"AQ", "e":"AQAB"
        }))
        .unwrap();
        assert!(!jwk_matches_algorithm(&rsa, Algorithm::RS256));
        assert!(!jwk_matches_algorithm(&rsa, Algorithm::ES256));
    }

    #[test]
    fn unverified_issuer_parser_only_extracts_structural_claim() {
        let payload = URL_SAFE_NO_PAD.encode(br#"{"iss":"https://issuer.example"}"#);
        assert_eq!(
            unverified_issuer(&format!("e30.{payload}.signature")),
            Some("https://issuer.example".into())
        );
        assert!(unverified_issuer("one.two.three.four").is_none());
    }

    #[tokio::test]
    async fn verifies_signature_claims_and_exact_resource_audience() {
        let token = signed_token(serde_json::json!({}));
        let identity = validator().validate(&token, TEST_RESOURCE).await.unwrap();
        assert!(identity.authenticated);
        assert_eq!(identity.agent_id, "agent-test-1");
        assert_eq!(identity.client_id, "test-client");
        assert_eq!(identity.audience, [TEST_RESOURCE]);
        assert_eq!(identity.scopes, ["mcp:read", "mcp:write"]);
        assert_eq!(identity.token_jti, "jti-test-1");
    }

    #[tokio::test]
    async fn rejects_expired_and_not_yet_valid_tokens() {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let expired = signed_token(serde_json::json!({"exp": now - 60}));
        assert_eq!(
            validator()
                .validate(&expired, TEST_RESOURCE)
                .await
                .unwrap_err()
                .reason,
            FailureReason::TokenExpired
        );

        let premature = signed_token(serde_json::json!({"nbf": now + 60}));
        assert_eq!(
            validator()
                .validate(&premature, TEST_RESOURCE)
                .await
                .unwrap_err()
                .reason,
            FailureReason::TokenNotYetValid
        );
    }

    #[tokio::test]
    async fn rejects_wrong_audience_bad_signature_and_missing_contract_claims() {
        let wrong_audience = signed_token(serde_json::json!({"aud":"mcp://other"}));
        assert_eq!(
            validator()
                .validate(&wrong_audience, TEST_RESOURCE)
                .await
                .unwrap_err()
                .reason,
            FailureReason::AudienceMismatch
        );

        let token = signed_token(serde_json::json!({}));
        let mut parts: Vec<_> = token.split('.').map(str::to_owned).collect();
        parts[2] = URL_SAFE_NO_PAD.encode(b"tampered");
        assert_eq!(
            validator()
                .validate(&parts.join("."), TEST_RESOURCE)
                .await
                .unwrap_err()
                .reason,
            FailureReason::InvalidSignature
        );

        let missing_jti = signed_token(serde_json::json!({"jti": null}));
        assert_eq!(
            validator()
                .validate(&missing_jti, TEST_RESOURCE)
                .await
                .unwrap_err()
                .reason,
            FailureReason::MissingRequiredClaims
        );
    }
}
