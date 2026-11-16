// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
//! Phase 3 — OpenBao Secretless Broker, IETF RFC 8693 Multi-Hop Token Exchange,
//! and Zero-Downtime Static Secret Rotation Orchestrator.
//!
//! Enforces the Zero-Secret Browser Boundary: browser clients receive only
//! `SecretlessLeaseMetadata` pills (`vault://openbao/... • TTL • Lease Active`),
//! never raw secret values.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;

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
}

/// IETF RFC 8693 OAuth 2.0/2.1 Token Exchange Request & Multi-Hop `act` Delegation Chain.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Rfc8693TokenExchangeRequest {
    pub subject_token_jti: String,
    pub actor_agent_spiffe_id: String,
    pub parent_delegator_id: String,
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
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum TokenExchangeError {
    #[error("RFC 8693 scope escalation denied: requested scope '{0}' is not a subset of parent scopes")]
    ScopeEscalation(String),
    #[error("RFC 8707 resource indicator invalid: '{0}' must be a canonical URI")]
    InvalidResourceIndicator(String),
    #[error("TTL exceeds maximum ephemeral agent ceiling (300s): requested {0}s")]
    TtlExceedsCeiling(u32),
}

/// Executes an RFC 8693 Token Exchange with strict scope attenuation (no privilege escalation)
/// and RFC 8707 audience binding.
pub fn exchange_rfc8693_token(
    req: &Rfc8693TokenExchangeRequest,
) -> Result<Rfc8693ExchangedTokenMetadata, TokenExchangeError> {
    if !req.requested_resource_indicator.starts_with("mcp://")
        && !req.requested_resource_indicator.starts_with("https://")
    {
        return Err(TokenExchangeError::InvalidResourceIndicator(
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

    let mut hasher = Sha256::new();
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
    let jti = format!("jti-rfc8693-{}", &hex::encode(hasher.finalize())[..16]);

    Ok(Rfc8693ExchangedTokenMetadata {
        issued_token_jti: jti,
        subject_spiffe_id: req.actor_agent_spiffe_id.clone(),
        act_chain: vec![
            req.parent_delegator_id.clone(),
            req.actor_agent_spiffe_id.clone(),
        ],
        bound_audience: req.requested_resource_indicator.clone(),
        attenuated_scopes: req.requested_scopes.clone(),
        expires_in_seconds: req.requested_ttl_seconds,
        token_type: "urn:ietf:params:oauth:token-type:access_token".to_owned(),
    })
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ZeroDowntimeRotationJob {
    pub credential_uid: String,
    pub total_dependent_workloads: u32,
    pub reloaded_workloads: u32,
    pub error_spike_detected: bool,
    pub phase: RotationPhase,
}

impl ZeroDowntimeRotationJob {
    pub fn new(credential_uid: impl Into<String>, total_dependent_workloads: u32) -> Self {
        Self {
            credential_uid: credential_uid.into(),
            total_dependent_workloads,
            reloaded_workloads: 0,
            error_spike_detected: false,
            phase: RotationPhase::DualSecretProvisioned,
        }
    }

    pub fn record_consumer_heartbeat(&mut self, count: u32) {
        if self.error_spike_detected {
            self.phase = RotationPhase::RolledBack {
                reason: "Auth error spike detected on new secret; rolled back to primary credential".to_owned(),
            };
            return;
        }
        self.reloaded_workloads = (self.reloaded_workloads + count).min(self.total_dependent_workloads);
        if self.reloaded_workloads < self.total_dependent_workloads {
            self.phase = RotationPhase::ConsumerReloadHeartbeats {
                verified_consumers: self.reloaded_workloads,
                total_consumers: self.total_dependent_workloads,
            };
        } else {
            self.phase = RotationPhase::GraceWindowVerified;
        }
    }

    pub fn finalize_legacy_revocation(&mut self) -> Result<(), String> {
        if self.phase != RotationPhase::GraceWindowVerified {
            return Err("Cannot revoke legacy credential before 100% of dependent workloads confirm reload heartbeats".to_owned());
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
}

pub mod multi_vault;
