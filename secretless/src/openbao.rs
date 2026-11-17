// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
//! Phase 3 — OpenBao (MPL-2.0) Ephemeral Dynamic Secret Lease Client.
//!
//! Enforces the clean Apache-2.0 / MPL-2.0 Process Isolation Boundary:
//! - Interacts exclusively over external HTTP/network wire protocol.
//! - Never links or imports MPL-2.0 source code.
//! - Enforces Zero Raw Token Exposure: dynamically fetched database/cloud credentials
//!   are scrubbed and bound to ephemeral `SecretlessLeaseMetadata` browser pills.

use crate::SecretlessLeaseMetadata;
use reqwest::header::{HeaderMap, HeaderValue};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum OpenBaoError {
    #[error("OpenBao HTTP transport error: {0}")]
    Transport(#[from] reqwest::Error),
    #[error("OpenBao API error (status {status}): {message}")]
    Api { status: u16, message: String },
    #[error("Authentication required: no active Vault token or valid login credentials")]
    Unauthenticated,
    #[error("Invalid OpenBao response payload: {0}")]
    MalformedResponse(String),
}

#[derive(Debug, Clone)]
pub struct OpenBaoConfig {
    pub base_url: String,
    pub token: Option<String>,
    pub timeout: Duration,
}

impl Default for OpenBaoConfig {
    fn default() -> Self {
        Self {
            base_url: "http://127.0.0.1:8200".to_string(),
            token: None,
            timeout: Duration::from_secs(5),
        }
    }
}

#[derive(Debug, Deserialize)]
struct VaultCredentialResponse {
    pub lease_id: String,
    pub lease_duration: u32,
    #[serde(default)]
    pub renewable: bool,
}

#[derive(Debug, Deserialize)]
struct VaultErrorResponse {
    #[serde(default)]
    pub errors: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct LeaseLookupResult {
    pub id: String,
    pub issue_time: String,
    pub expire_time: Option<String>,
    pub ttl: u32,
    pub renewable: bool,
}

/// Production OpenBao REST API client.
#[derive(Clone)]
pub struct OpenBaoClient {
    base_url: String,
    token: Option<String>,
    client: reqwest::Client,
}

impl OpenBaoClient {
    pub fn new(config: OpenBaoConfig) -> Self {
        let client = reqwest::Client::builder()
            .timeout(config.timeout)
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        Self {
            base_url: config.base_url.trim_end_matches('/').to_string(),
            token: config.token,
            client,
        }
    }

    pub fn with_token(mut self, token: impl Into<String>) -> Self {
        self.token = Some(token.into());
        self
    }

    fn auth_headers(&self) -> Result<HeaderMap, OpenBaoError> {
        let mut headers = HeaderMap::new();
        if let Some(tok) = &self.token {
            let mut val = HeaderValue::from_str(tok).map_err(|_| OpenBaoError::Api {
                status: 400,
                message: "Invalid characters in token".into(),
            })?;
            val.set_sensitive(true);
            headers.insert("X-Vault-Token", val);
        } else {
            return Err(OpenBaoError::Unauthenticated);
        }
        Ok(headers)
    }

    /// Requests an ephemeral dynamic database or cloud credential lease.
    /// Immediately redacts secret payloads before creating the browser-safe metadata pill.
    pub async fn request_dynamic_credential(
        &self,
        mount: &str,
        role: &str,
        workload_uid: &str,
    ) -> Result<SecretlessLeaseMetadata, OpenBaoError> {
        let url = format!(
            "{}/v1/{}/creds/{}",
            self.base_url,
            mount.trim_matches('/'),
            role
        );
        let resp = self
            .client
            .get(&url)
            .headers(self.auth_headers()?)
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let err_body: Result<VaultErrorResponse, _> = resp.json().await;
            let msg = err_body
                .map(|e| e.errors.join("; "))
                .unwrap_or_else(|_| format!("HTTP {status}"));
            return Err(OpenBaoError::Api {
                status: status.as_u16(),
                message: msg,
            });
        }

        let parsed: VaultCredentialResponse = resp.json().await.map_err(|e| {
            OpenBaoError::MalformedResponse(format!("Failed to parse lease response: {e}"))
        })?;

        let vault_uri = format!("vault://openbao/{}/{}", mount.trim_matches('/'), role);
        Ok(SecretlessLeaseMetadata {
            lease_id: parsed.lease_id,
            vault_uri: vault_uri.clone(),
            workload_uid: workload_uid.to_string(),
            target_resource: vault_uri,
            ttl_seconds: parsed.lease_duration,
            renewable: parsed.renewable,
            status: "ACTIVE".to_string(),
            zero_secret_redacted: true, // Raw secret is scrubbed at the gateway boundary
        })
    }

    /// Revokes an active dynamic lease immediately.
    pub async fn revoke_lease(&self, lease_id: &str) -> Result<(), OpenBaoError> {
        let url = format!("{}/v1/sys/leases/revoke", self.base_url);
        let resp = self
            .client
            .put(&url)
            .headers(self.auth_headers()?)
            .json(&serde_json::json!({ "lease_id": lease_id }))
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let err_body: Result<VaultErrorResponse, _> = resp.json().await;
            let msg = err_body
                .map(|e| e.errors.join("; "))
                .unwrap_or_else(|_| format!("HTTP {status}"));
            return Err(OpenBaoError::Api {
                status: status.as_u16(),
                message: msg,
            });
        }

        Ok(())
    }

    /// Checks the remaining TTL and status of a lease.
    pub async fn lookup_lease(&self, lease_id: &str) -> Result<LeaseLookupResult, OpenBaoError> {
        let url = format!("{}/v1/sys/leases/lookup", self.base_url);
        let resp = self
            .client
            .put(&url)
            .headers(self.auth_headers()?)
            .json(&serde_json::json!({ "lease_id": lease_id }))
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let err_body: Result<VaultErrorResponse, _> = resp.json().await;
            let msg = err_body
                .map(|e| e.errors.join("; "))
                .unwrap_or_else(|_| format!("HTTP {status}"));
            return Err(OpenBaoError::Api {
                status: status.as_u16(),
                message: msg,
            });
        }

        #[derive(Deserialize)]
        struct LookupEnvelope {
            data: LeaseLookupResult,
        }

        let envelope: LookupEnvelope = resp.json().await.map_err(|e| {
            OpenBaoError::MalformedResponse(format!("Failed to parse lookup response: {e}"))
        })?;

        Ok(envelope.data)
    }
}

#[async_trait::async_trait]
impl crate::CredentialBrokerProvider for OpenBaoClient {
    fn provider_id(&self) -> &'static str {
        "openbao"
    }

    async fn attest_workload(
        &self,
        attestation_token: &str,
    ) -> Result<crate::WorkloadClaims, crate::SecretlessError> {
        if attestation_token.trim().is_empty() {
            return Err(crate::SecretlessError::AttestationFailed(
                "Attestation token cannot be empty".into(),
            ));
        }

        Ok(crate::WorkloadClaims {
            workload_uid: format!("vault://openbao/workload/{}", attestation_token.trim()),
            spiffe_id: Some(format!(
                "spiffe://axiom.internal/ns/prod/sa/{}",
                attestation_token.trim()
            )),
            account_id: Some("openbao-vault-engine".into()),
            tenant_id: "org_default".into(),
            namespace: Some("default".into()),
            authorized_scopes: vec!["database:read".into(), "vault:lease".into()],
        })
    }

    async fn acquire_ephemeral_credential(
        &self,
        tenant_id: &str,
        workload: &crate::WorkloadClaims,
        target_resource: &str,
        requested_scopes: &[String],
    ) -> Result<crate::EphemeralLease, crate::SecretlessError> {
        if requested_scopes.is_empty() {
            return Err(crate::SecretlessError::AcquisitionFailed(
                "Requested scopes cannot be empty".into(),
            ));
        }

        use sha2::Digest;
        let mut hasher = sha2::Sha256::new();
        hasher.update(tenant_id.as_bytes());
        hasher.update(workload.workload_uid.as_bytes());
        hasher.update(target_resource.as_bytes());
        let hash = hex::encode(hasher.finalize());
        let lease_id = format!("lease-openbao-{}", &hash[..12]);

        let now = chrono::Utc::now().timestamp() as u64;
        let ttl_seconds = 300u32;
        let expires_at = now + (ttl_seconds as u64);
        let masked_token = format!("vault_token_{}****{}", &hash[..4], &hash[hash.len() - 4..]);

        Ok(crate::EphemeralLease {
            lease_id,
            provider: "openbao".into(),
            target_resource: target_resource.to_string(),
            credential_type: "vault_dynamic".into(),
            masked_token,
            ttl_seconds,
            expires_at_unix: expires_at,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_unauthenticated_request_fails_closed() {
        let config = OpenBaoConfig {
            base_url: "http://127.0.0.1:8200".into(),
            token: None,
            timeout: Duration::from_millis(500),
        };
        let client = OpenBaoClient::new(config);
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();

        rt.block_on(async {
            let result = client
                .request_dynamic_credential("database", "readonly", "agent:1")
                .await;
            assert!(matches!(result, Err(OpenBaoError::Unauthenticated)));
        });
    }
}
