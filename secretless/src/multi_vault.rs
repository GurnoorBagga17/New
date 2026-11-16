//! Entro Competitor Parity: Multi-Vault Secret Hygiene & Cross-Vault Sprawl Scanner.
//! Audits secret metadata (never raw values) across OpenBao, HashiCorp Vault,
//! AWS Secrets Manager, GCP Secret Manager, and Azure Key Vault.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct VaultSecretMetadata {
    pub secret_uid: String,
    pub vault_provider: String,
    pub fingerprint_hmac: String,
    pub rotation_age_days: u32,
    pub max_allowed_age_days: u32,
    pub duplicated_across_vaults: usize,
    pub leaked_in_git_history: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MultiVaultPostureReport {
    pub total_scanned: usize,
    pub stale_secrets: Vec<String>,
    pub cross_vault_duplicates: Vec<String>,
    pub git_exposed_secrets: Vec<String>,
    pub hygiene_score: u8,
}

pub fn evaluate_multi_vault_posture(items: &[VaultSecretMetadata]) -> MultiVaultPostureReport {
    let mut stale = Vec::new();
    let mut duplicates = Vec::new();
    let mut exposed = Vec::new();

    for item in items {
        if item.rotation_age_days > item.max_allowed_age_days {
            stale.push(item.secret_uid.clone());
        }
        if item.duplicated_across_vaults > 1 {
            duplicates.push(item.secret_uid.clone());
        }
        if item.leaked_in_git_history {
            exposed.push(item.secret_uid.clone());
        }
    }

    let penalty = (stale.len() * 10 + duplicates.len() * 10 + exposed.len() * 35).min(100);
    MultiVaultPostureReport {
        total_scanned: items.len(),
        stale_secrets: stale,
        cross_vault_duplicates: duplicates,
        git_exposed_secrets: exposed,
        hygiene_score: (100 - penalty) as u8,
    }
}
