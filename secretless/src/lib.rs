// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
//! Phase 3 — OpenBao Secretless Broker, IETF RFC 8693 Multi-Hop Token Exchange,
//! and Zero-Downtime Static Secret Rotation Orchestrator.
//!
//! Enforces the Zero-Secret Browser Boundary: browser clients receive only
//! `SecretlessLeaseMetadata` pills (`vault://openbao/... • TTL • Lease Active`),
//! never raw secret values.

use std::collections::HashSet;
use std::time::{Duration, Instant};
use ring::rand::SecureRandom;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;

pub mod openbao;
pub mod aws_sts;
pub mod gcp_sts;
pub mod azure_entra;
pub mod oauth2_client_credentials;
pub mod api_key_vault_injector;

pub use openbao::{OpenBaoClient, OpenBaoConfig, OpenBaoError};
pub use aws_sts::AwsStsBroker;
pub use gcp_sts::GcpStsBroker;
pub use azure_entra::AzureEntraBroker;
pub use oauth2_client_credentials::OAuth2ClientCredentialsBroker;
pub use api_key_vault_injector::ApiKeyVaultInjector;

/// Workload claims resulting from workload attestation (SVID, OIDC, STS).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorkloadClaims {
    pub workload_uid: String,
    pub spiffe_id: Option<String>,
    pub account_id: Option<String>,
    pub tenant_id: String,
    pub namespace: Option<String>,
    pub authorized_scopes: Vec<String>,
}

/// Ephemeral credential lease for an upstream resource or API.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EphemeralLease {
    pub lease_id: String,
    pub provider: String,
    pub target_resource: String,
    pub credential_type: String,
    pub masked_token: String,
    pub ttl_seconds: u32,
    pub expires_at_unix: u64,
}

#[derive(Debug, Error)]
pub enum SecretlessError {
    #[error("Attestation failed: {0}")]
    AttestationFailed(String),
    #[error("Acquisition failed: {0}")]
    AcquisitionFailed(String),
    #[error("Scope escalation denied: {0}")]
    ScopeEscalation(String),
    #[error("Provider error: {0}")]
    Provider(String),
    #[error("IO error: {0}")]
    Io(String),
}

/// Universal Pluggable Credential Broker Provider trait.
/// Allows OpenBao, AWS STS, GCP STS, Azure Entra, and SaaS OAuth2 brokers to be used interchangeably.
#[async_trait::async_trait]
pub trait CredentialBrokerProvider: Send + Sync {
    fn provider_id(&self) -> &'static str;

    /// Verify workload attestation (e.g., K8s SVID, AWS IMDSv2 / STS identity, GCP OIDC)
    async fn attest_workload(&self, attestation_token: &str) -> Result<WorkloadClaims, SecretlessError>;

    /// Mint or retrieve an ephemeral credential for the upstream MCP server or API
    async fn acquire_ephemeral_credential(
        &self,
        tenant_id: &str,
        workload: &WorkloadClaims,
        target_resource: &str,
        requested_scopes: &[String],
    ) -> Result<EphemeralLease, SecretlessError>;
}

/// Browser-safe metadata pill for an ephemeral OpenBao dynamic secret lease.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SecretlessLeaseMetadata {
    pub lease_id: String,
    #[serde(rename = "vault_URI", alias = "vault_uri")]
    pub vault_uri: String,
    pub workload_uid: String,
    pub target_resource: String,
    pub ttl_seconds: u32,
    pub renewable: bool,
    pub status: String,
    #[serde(default)]
    pub zero_secret_redacted: bool,
}

impl SecretlessLeaseMetadata {
    pub fn new_redacted(lease_id: &str, vault_uri: &str, ttl_seconds: u32) -> Self {
        Self {
            lease_id: lease_id.to_string(),
            vault_uri: vault_uri.to_string(),
            workload_uid: "workload-attested".to_string(),
            target_resource: vault_uri.to_string(),
            ttl_seconds,
            renewable: false,
            status: "ACTIVE".to_string(),
            zero_secret_redacted: true,
        }
    }
}

/// IETF RFC 8693 OAuth 2.0/2.1 Token Exchange Request & Multi-Hop `act` Delegation Chain.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Rfc8693TokenExchangeRequest {
    pub subject_token_jti: String,
    pub actor_agent_spiffe_id: String,
    pub parent_delegator_id: String,
    #[serde(default)]
    pub parent_act_chain: Vec<String>,
    pub requested_resource_indicator: String, // RFC 8707 audience URI
    pub requested_scopes: Vec<String>,
    pub parent_granted_scopes: Vec<String>,
    pub requested_ttl_seconds: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Rfc8693ExchangedTokenMetadata {
    pub issued_token_jti: String,
    pub subject_spiffe_id: String,
    pub act_chain: Vec<String>,
    pub bound_audience: String,
    pub attenuated_scopes: Vec<String>,
    pub expires_in_seconds: u32,
    pub token_type: String,
    #[serde(default)]
    pub signed_jwt: Option<String>,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum TokenExchangeError {
    #[error("RFC 8693 requested scopes cannot be empty")]
    EmptyScopes,
    #[error("RFC 8693 scope escalation denied: requested scope '{0}' is not a subset of parent scopes")]
    ScopeEscalation(String),
    #[error("RFC 8707 resource indicator invalid: '{0}' must be a canonical URI (mcp:// or https://)")]
    InvalidResourceIndicator(String),
    #[error("RFC 8707 resource indicator cannot contain userinfo credentials: '{0}'")]
    UserinfoForbidden(String),
    #[error("TTL exceeds maximum ephemeral agent ceiling (300s): requested {0}s")]
    TtlExceedsCeiling(u32),
}

/// Executes an RFC 8693 Token Exchange with strict scope attenuation (no privilege escalation),
/// RFC 8707 audience binding, and multi-hop delegation chain construction.
pub fn exchange_rfc8693_token(
    req: &Rfc8693TokenExchangeRequest,
) -> Result<Rfc8693ExchangedTokenMetadata, TokenExchangeError> {
    if req.requested_scopes.is_empty() {
        return Err(TokenExchangeError::EmptyScopes);
    }
    if !req.requested_resource_indicator.starts_with("mcp://")
        && !req.requested_resource_indicator.starts_with("https://")
    {
        return Err(TokenExchangeError::InvalidResourceIndicator(
            req.requested_resource_indicator.clone(),
        ));
    }
    // Block userinfo (e.g. https://user:pass@host)
    if req.requested_resource_indicator.contains('@') {
        return Err(TokenExchangeError::UserinfoForbidden(
            req.requested_resource_indicator.clone(),
        ));
    }
    if req.requested_ttl_seconds > 300 {
        return Err(TokenExchangeError::TtlExceedsCeiling(req.requested_ttl_seconds));
    }
    for scope in &req.requested_scopes {
        if !req.parent_granted_scopes.contains(scope) {
            return Err(TokenExchangeError::ScopeEscalation(scope.clone()));
        }
    }

    // Build multi-hop delegation act chain
    let mut act_chain = req.parent_act_chain.clone();
    if act_chain.is_empty() {
        act_chain.push(req.parent_delegator_id.clone());
    }
    act_chain.push(req.actor_agent_spiffe_id.clone());

    // Compute unique JTI with entropy
    let mut entropy = [0u8; 16];
    let _ = ring::rand::SystemRandom::new().fill(&mut entropy);
    let mut hasher = Sha256::new();
    hasher.update(entropy);
    hasher.update(
        format!(
            "{}|{}|{}|{}",
            req.subject_token_jti,
            req.actor_agent_spiffe_id,
            req.requested_resource_indicator,
            req.requested_scopes.join(",")
        )
        .as_bytes(),
    );
    let jti = format!("jti-rfc8693-{}", &hex::encode(hasher.finalize())[..24]);

    Ok(Rfc8693ExchangedTokenMetadata {
        issued_token_jti: jti,
        subject_spiffe_id: req.actor_agent_spiffe_id.clone(),
        act_chain,
        bound_audience: req.requested_resource_indicator.clone(),
        attenuated_scopes: req.requested_scopes.clone(),
        expires_in_seconds: req.requested_ttl_seconds,
        token_type: "urn:ietf:params:oauth:token-type:access_token".to_owned(),
        signed_jwt: None,
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Rfc8693JwtClaims {
    pub iss: String,
    pub sub: String,
    pub aud: String,
    pub exp: u64,
    pub iat: u64,
    pub jti: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub act: Option<serde_json::Value>,
    pub scope: String,
}

/// Mints a cryptographically signed RFC 8693 JWT containing the nested `act` delegation chain (SEC-02).
pub fn mint_rfc8693_signed_jwt(
    metadata: &Rfc8693ExchangedTokenMetadata,
    issuer: &str,
    signing_key_secret: &[u8],
) -> Result<String, String> {
    use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let act_val = if metadata.act_chain.len() > 1 {
        let mut cur = serde_json::json!({ "sub": metadata.act_chain[0] });
        for parent in metadata.act_chain.iter().skip(1) {
            cur = serde_json::json!({ "sub": parent, "act": cur });
        }
        Some(cur)
    } else {
        None
    };

    let claims = Rfc8693JwtClaims {
        iss: issuer.to_string(),
        sub: metadata.subject_spiffe_id.clone(),
        aud: metadata.bound_audience.clone(),
        exp: now + metadata.expires_in_seconds as u64,
        iat: now,
        jti: metadata.issued_token_jti.clone(),
        act: act_val,
        scope: metadata.attenuated_scopes.join(" "),
    };

    let key = EncodingKey::from_secret(signing_key_secret);
    encode(&Header::new(Algorithm::HS256), &claims, &key).map_err(|e| e.to_string())
}

/// Phase 3 Zero-Downtime Static Secret Rotation State Machine.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum RotationPhase {
    Idle,
    DualSecretProvisioned,
    ConsumerReloadHeartbeats { verified_consumers: u32, total_consumers: u32 },
    GraceWindowVerified,
    LegacyCredentialRevoked,
    RolledBack { reason: String },
}

#[derive(Debug, Clone)]
pub struct ZeroDowntimeRotationJob {
    pub credential_uid: String,
    pub total_dependent_workloads: u32,
    pub verified_workloads: HashSet<String>,
    pub error_spike_detected: bool,
    pub phase: RotationPhase,
    pub grace_window_duration: Duration,
    pub grace_window_entered_at: Option<Instant>,
    pub cleanup_new_secret_on_rollback: bool,
}

impl ZeroDowntimeRotationJob {
    pub fn new(credential_uid: impl Into<String>, total_dependent_workloads: u32) -> Self {
        Self {
            credential_uid: credential_uid.into(),
            total_dependent_workloads,
            verified_workloads: HashSet::new(),
            error_spike_detected: false,
            phase: RotationPhase::DualSecretProvisioned,
            grace_window_duration: Duration::from_secs(60),
            grace_window_entered_at: None,
            cleanup_new_secret_on_rollback: false,
        }
    }

    /// Records a heartbeat from a specific verified workload.
    /// Deduplicates duplicate heartbeats so counts cannot be artificially inflated.
    pub fn record_workload_heartbeat(&mut self, workload_uid: &str) {
        if self.error_spike_detected {
            self.trigger_rollback("Auth error spike detected on new secret; rolled back to primary credential");
            return;
        }

        if self.total_dependent_workloads == 0 {
            // Unmapped or zero workloads cannot be safely auto-promoted without manual review
            return;
        }

        self.verified_workloads.insert(workload_uid.to_string());
        let verified_count = self.verified_workloads.len() as u32;

        if verified_count < self.total_dependent_workloads {
            self.phase = RotationPhase::ConsumerReloadHeartbeats {
                verified_consumers: verified_count,
                total_consumers: self.total_dependent_workloads,
            };
        } else {
            if self.grace_window_entered_at.is_none() {
                self.grace_window_entered_at = Some(Instant::now());
            }
            self.phase = RotationPhase::GraceWindowVerified;
        }
    }

    pub fn trigger_rollback(&mut self, reason: &str) {
        self.error_spike_detected = true;
        self.cleanup_new_secret_on_rollback = true;
        self.phase = RotationPhase::RolledBack {
            reason: reason.to_string(),
        };
    }

    pub fn finalize_legacy_revocation(&mut self) -> Result<(), String> {
        if self.total_dependent_workloads == 0 {
            return Err("Cannot revoke legacy credential: 0 dependent workloads registered (lineage graph incomplete)".to_owned());
        }
        if self.phase != RotationPhase::GraceWindowVerified {
            return Err("Cannot revoke legacy credential before 100% of unique dependent workloads confirm reload heartbeats".to_owned());
        }
        if let Some(entered) = self.grace_window_entered_at {
            if entered.elapsed() < self.grace_window_duration {
                let remaining = self.grace_window_duration.saturating_sub(entered.elapsed());
                return Err(format!(
                    "Grace window still active: {}s remaining before safe revocation",
                    remaining.as_secs()
                ));
            }
        }
        self.phase = RotationPhase::LegacyCredentialRevoked;
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// P2 Killer Differentiator: Air-Gapped Workload-Attested Secretless Access
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WorkloadAttestationClaim {
    pub spiffe_id: String,
    pub binary_sha256: String,
    pub k8s_namespace: String,
    pub k8s_service_account: String,
    pub air_gapped_vpc_verified: bool,
}

pub fn issue_attested_openbao_lease(
    claim: &WorkloadAttestationClaim,
    trusted_binary_digests: &[&str],
    vault_path: &str,
    requested_ttl_secs: u64,
) -> Result<SecretlessLeaseMetadata, String> {
    if !claim.spiffe_id.starts_with("spiffe://") {
        return Err("UNTRUSTED_SPIFFE_ID: must start with spiffe://".into());
    }
    if !claim.air_gapped_vpc_verified {
        return Err("ATTESTATION_FAILED: workload is not inside verified air-gapped VPC enclave".into());
    }
    if !trusted_binary_digests.contains(&claim.binary_sha256.as_str()) {
        return Err(format!(
            "BINARY_ATTESTATION_MISMATCH: workload digest {} is not in approved golden manifest",
            claim.binary_sha256
        ));
    }
    let bounded_ttl = requested_ttl_secs.min(300);
    Ok(SecretlessLeaseMetadata::new_redacted(
        &format!("lease-attested-{}", &claim.binary_sha256[..8]),
        vault_path,
        bounded_ttl as u32,
    ))
}

#[cfg(test)]
mod attestation_tests {
    use super::*;

    #[test]
    fn issues_lease_only_for_attested_airgapped_workload() {
        let claim = WorkloadAttestationClaim {
            spiffe_id: "spiffe://axiom.internal/ns/prod/sa/finance-agent".into(),
            binary_sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855".into(),
            k8s_namespace: "prod".into(),
            k8s_service_account: "finance-agent".into(),
            air_gapped_vpc_verified: true,
        };
        let lease = issue_attested_openbao_lease(
            &claim,
            &["e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
            "vault://openbao/prod-db/readonly",
            240,
        )
        .expect("attested workload must receive lease");
        assert!(lease.zero_secret_redacted);
        assert_eq!(lease.ttl_seconds, 240);
    }

    #[test]
    fn test_rfc8693_token_exchange_validations() {
        let base_req = Rfc8693TokenExchangeRequest {
            subject_token_jti: "jti-parent-123".into(),
            actor_agent_spiffe_id: "spiffe://axiom.internal/agent/analyst".into(),
            parent_delegator_id: "spiffe://axiom.internal/agent/coordinator".into(),
            parent_act_chain: vec!["spiffe://axiom.internal/agent/root".into(), "spiffe://axiom.internal/agent/coordinator".into()],
            requested_resource_indicator: "https://api.github.com".into(),
            requested_scopes: vec!["repo:read".into()],
            parent_granted_scopes: vec!["repo:read".into(), "repo:write".into()],
            requested_ttl_seconds: 120,
        };

        // Valid exchange
        let res = exchange_rfc8693_token(&base_req).expect("valid token exchange");
        assert_eq!(res.act_chain.len(), 3);
        assert_eq!(res.act_chain[2], "spiffe://axiom.internal/agent/analyst");
        assert_eq!(res.attenuated_scopes, vec!["repo:read"]);

        // Empty scopes rejected
        let mut empty_scopes = base_req.clone();
        empty_scopes.requested_scopes = vec![];
        assert_eq!(exchange_rfc8693_token(&empty_scopes), Err(TokenExchangeError::EmptyScopes));

        // Scope escalation rejected
        let mut escalated = base_req.clone();
        escalated.requested_scopes = vec!["admin:org".into()];
        assert_eq!(
            exchange_rfc8693_token(&escalated),
            Err(TokenExchangeError::ScopeEscalation("admin:org".into()))
        );

        // Userinfo in URI rejected
        let mut userinfo_uri = base_req.clone();
        userinfo_uri.requested_resource_indicator = "https://user:password@api.internal.com".into();
        assert_eq!(
            exchange_rfc8693_token(&userinfo_uri),
            Err(TokenExchangeError::UserinfoForbidden("https://user:password@api.internal.com".into()))
        );
    }

    #[test]
    fn test_zero_downtime_rotation_state_machine() {
        let mut job = ZeroDowntimeRotationJob::new("cred:db:user-prod", 2);
        job.grace_window_duration = Duration::from_millis(50);

        // Zero workloads cannot auto-revoke
        let mut zero_job = ZeroDowntimeRotationJob::new("cred:db:unmapped", 0);
        assert!(zero_job.finalize_legacy_revocation().is_err());

        // Heartbeats from duplicate workload IDs should not inflate progress
        job.record_workload_heartbeat("workload-k8s-pod-1");
        job.record_workload_heartbeat("workload-k8s-pod-1");
        assert_eq!(job.verified_workloads.len(), 1);
        match &job.phase {
            RotationPhase::ConsumerReloadHeartbeats { verified_consumers, .. } => {
                assert_eq!(*verified_consumers, 1);
            }
            _ => panic!("Expected ConsumerReloadHeartbeats phase"),
        }

        // Add second unique workload
        job.record_workload_heartbeat("workload-k8s-pod-2");
        assert_eq!(job.phase, RotationPhase::GraceWindowVerified);

        // Before grace window elapses, revocation must be blocked
        assert!(job.finalize_legacy_revocation().is_err());

        // Wait for grace window
        std::thread::sleep(Duration::from_millis(60));
        assert!(job.finalize_legacy_revocation().is_ok());
        assert_eq!(job.phase, RotationPhase::LegacyCredentialRevoked);
    }

    #[test]
    fn test_rotation_error_spike_triggers_rollback() {
        let mut job = ZeroDowntimeRotationJob::new("cred:api:stripe", 3);
        job.record_workload_heartbeat("workload-1");
        job.trigger_rollback("High error rate (500s) on new key");

        assert!(job.error_spike_detected);
        assert!(job.cleanup_new_secret_on_rollback);
        match &job.phase {
            RotationPhase::RolledBack { reason } => {
                assert!(reason.contains("High error rate"));
            }
            _ => panic!("Expected RolledBack phase"),
        }
    }
}

pub mod multi_vault;
