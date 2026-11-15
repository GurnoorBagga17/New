//! Adapter from Team 2's authorization seam to Team 3's identity verifier.

use std::sync::Arc;

use async_trait::async_trait;
use axiom_identity::{IdentityVerifier as Team3Verifier, VerificationRequest};

use crate::{IdentityContext, IdentityError};

/// Bridges the authorization pipeline to the concrete identity component.
pub struct Team3IdentityAdapter {
    verifier: Arc<dyn Team3Verifier>,
}

impl Team3IdentityAdapter {
    pub fn new(verifier: Arc<dyn Team3Verifier>) -> Self {
        Self { verifier }
    }
}

#[async_trait]
impl crate::IdentityVerifier for Team3IdentityAdapter {
    async fn verify(
        &self,
        raw_auth_header: Option<&str>,
        target_server: &str,
        mcp_session_id: &str,
        request_id: &str,
    ) -> Result<IdentityContext, IdentityError> {
        let request = VerificationRequest {
            raw_auth_header: raw_auth_header.map(str::to_owned),
            target_server: target_server.to_owned(),
            mcp_session_id: mcp_session_id.to_owned(),
            request_id: request_id.to_owned(),
        };
        let identity =
            self.verifier
                .verify(&request)
                .await
                .map_err(|failure| IdentityError::Rejected {
                    reason: failure.reason,
                    message: failure.message,
                })?;
        if !identity.authenticated {
            return Err(IdentityError::Internal(
                "identity verifier returned an unauthenticated success".to_owned(),
            ));
        }

        Ok(IdentityContext {
            authenticated: identity.authenticated,
            agent_id: identity.agent_id,
            client_id: identity.client_id,
            cimd_uri: identity.cimd_uri,
            issuer: identity.issuer,
            audience: identity.audience,
            scopes: identity.scopes,
            token_jti: identity.token_jti,
            expires_at_unix: identity.expires_at_unix,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::IdentityVerifier;
    use axiom_identity::{AuthenticationFailure, FailureReason};
    use std::sync::Mutex;

    struct MockVerifier {
        request: Mutex<Option<VerificationRequest>>,
        result: Result<axiom_identity::IdentityContext, AuthenticationFailure>,
    }

    #[async_trait]
    impl Team3Verifier for MockVerifier {
        async fn verify(
            &self,
            request: &VerificationRequest,
        ) -> axiom_identity::VerificationResult {
            *self.request.lock().unwrap() = Some(request.clone());
            self.result.clone()
        }
    }

    fn identity(authenticated: bool) -> axiom_identity::IdentityContext {
        axiom_identity::IdentityContext {
            authenticated,
            agent_id: "agent-1".into(),
            client_id: "client-1".into(),
            cimd_uri: None,
            issuer: "https://issuer.example".into(),
            audience: vec!["mcp://prod-db".into()],
            scopes: vec!["mcp:read".into()],
            token_jti: "jti-1".into(),
            expires_at_unix: 2_000_000_000,
        }
    }

    #[tokio::test]
    async fn forwards_bearer_and_correlation_context_without_logging_it() {
        let verifier = Arc::new(MockVerifier {
            request: Mutex::new(None),
            result: Ok(identity(true)),
        });
        let adapter = Team3IdentityAdapter::new(verifier.clone());
        let result = adapter
            .verify(
                Some("Bearer test-secret-token"),
                "mcp://prod-db",
                "session-1",
                "request-1",
            )
            .await
            .unwrap();
        assert_eq!(result.agent_id, "agent-1");

        let request = verifier.request.lock().unwrap().clone().unwrap();
        assert_eq!(
            request.raw_auth_header.as_deref(),
            Some("Bearer test-secret-token")
        );
        assert_eq!(request.target_server, "mcp://prod-db");
        assert_eq!(request.mcp_session_id, "session-1");
        assert_eq!(request.request_id, "request-1");
        assert!(!format!("{request:?}").contains("test-secret-token"));
    }

    #[tokio::test]
    async fn preserves_typed_authentication_failures_and_rejects_unverified_success() {
        let failed = Arc::new(MockVerifier {
            request: Mutex::new(None),
            result: Err(AuthenticationFailure::new(
                FailureReason::AudienceMismatch,
                "audience mismatch",
            )),
        });
        let error = Team3IdentityAdapter::new(failed)
            .verify(None, "mcp://prod-db", "", "")
            .await
            .unwrap_err();
        assert!(matches!(
            error,
            IdentityError::Rejected {
                reason: FailureReason::AudienceMismatch,
                ..
            }
        ));

        let unauthenticated = Arc::new(MockVerifier {
            request: Mutex::new(None),
            result: Ok(identity(false)),
        });
        assert!(matches!(
            Team3IdentityAdapter::new(unauthenticated)
                .verify(None, "mcp://prod-db", "", "")
                .await,
            Err(IdentityError::Internal(_))
        ));
    }
}
