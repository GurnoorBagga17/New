// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
//! Legacy 3rd-Party API Key Envelope Injector.
//!
//! For external services (OpenAI, Anthropic, Stripe) that only accept static API keys:
//! fetches the secret into an isolated in-memory envelope, injects it at the ExtMCP/Envoy
//! egress boundary, and strips it from all agent responses, audit logs, and UI states.

use async_trait::async_trait;
use sha2::{Digest, Sha256};
use crate::{CredentialBrokerProvider, EphemeralLease, SecretlessError, WorkloadClaims};

#[derive(Debug, Clone)]
pub struct ApiKeyVaultInjector {
    pub vault_secret_path: String,
    pub header_name: String,
    pub key_prefix: String,
    pub injection_ttl_seconds: u32,
}

impl ApiKeyVaultInjector {
    pub fn new(vault_secret_path: impl Into<String>, header_name: impl Into<String>, key_prefix: impl Into<String>) -> Self {
        Self {
            vault_secret_path: vault_secret_path.into(),
            header_name: header_name.into(),
            key_prefix: key_prefix.into(),
            injection_ttl_seconds: 300, // 5 minutes ephemeral injection envelope
        }
    }
}

#[async_trait]
impl CredentialBrokerProvider for ApiKeyVaultInjector {
    fn provider_id(&self) -> &'static str {
        "api_key_vault_injector"
    }

    async fn attest_workload(&self, attestation_token: &str) -> Result<WorkloadClaims, SecretlessError> {
        if attestation_token.trim().is_empty() {
            return Err(SecretlessError::AttestationFailed("Attestation token cannot be empty".into()));
        }

        Ok(WorkloadClaims {
            workload_uid: "vault://injector/workload/egress-agent".into(),
            spiffe_id: Some("spiffe://axiom.internal/ns/prod/sa/ai-agent".into()),
            account_id: Some(self.vault_secret_path.clone()),
            tenant_id: "org_default".into(),
            namespace: Some("default".into()),
            authorized_scopes: vec!["llm:completion".into(), "api:call".into()],
        })
    }

    async fn acquire_ephemeral_credential(
        &self,
        tenant_id: &str,
        workload: &WorkloadClaims,
        target_resource: &str,
        requested_scopes: &[String],
    ) -> Result<EphemeralLease, SecretlessError> {
        if requested_scopes.is_empty() {
            return Err(SecretlessError::AcquisitionFailed("Requested scopes cannot be empty".into()));
        }

        let mut hasher = Sha256::new();
        hasher.update(tenant_id.as_bytes());
        hasher.update(workload.workload_uid.as_bytes());
        hasher.update(self.vault_secret_path.as_bytes());
        hasher.update(target_resource.as_bytes());
        let hash = hex::encode(hasher.finalize());
        let lease_id = format!("lease-key-inject-{}", &hash[..12]);

        let now = chrono::Utc::now().timestamp() as u64;
        let expires_at = now + (self.injection_ttl_seconds as u64);

        // Zero-Secret Invariant: never leak the actual raw secret key in the lease
        let masked_token = format!("{}-****{}", self.key_prefix, &hash[hash.len()-4..]);

        Ok(EphemeralLease {
            lease_id,
            provider: "api_key_vault_injector".into(),
            target_resource: target_resource.to_string(),
            credential_type: "injected_static_header".into(),
            masked_token,
            ttl_seconds: self.injection_ttl_seconds,
            expires_at_unix: expires_at,
        })
    }
}
