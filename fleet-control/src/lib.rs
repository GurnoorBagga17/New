// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
//! Phase 4 — Multi-Cluster Fleet Governance, SpiceDB Causal Delegation Revocation,
//! Least-Privilege Cloud IAM Rightsizing, Distributed Spend Circuit Breakers,
//! Signed AI-BOM Compliance Packs, and $0-Discovery Usage Metering Engine.

use std::collections::{HashMap, HashSet};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

// ---------------------------------------------------------------------------
// 1. SpiceDB Multi-Hop Delegation Graph & Causal Chain Revocation
// ---------------------------------------------------------------------------
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DelegationGrant {
    pub grant_id: String,
    pub parent_grant_id: Option<String>,
    pub delegator_id: String,
    pub delegatee_agent_id: String,
    pub session_id: String,
    pub active: bool,
}

#[derive(Default)]
pub struct SpiceDbDelegationGraph {
    grants: Vec<DelegationGrant>,
}

impl SpiceDbDelegationGraph {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add_grant(&mut self, grant: DelegationGrant) {
        self.grants.push(grant);
    }

    /// Causally revokes `root_grant_id` and all downstream child/sub-agent grants
    /// in the delegation chain without disrupting sibling sessions.
    pub fn revoke_causal_chain(&mut self, root_grant_id: &str) -> Vec<String> {
        let mut revoked_ids = Vec::new();
        let mut to_revoke = HashSet::new();
        to_revoke.insert(root_grant_id.to_owned());

        let mut changed = true;
        while changed {
            changed = false;
            for g in &mut self.grants {
                if g.active {
                    let matches_self = to_revoke.contains(&g.grant_id);
                    let matches_parent = g
                        .parent_grant_id
                        .as_ref()
                        .map(|p| to_revoke.contains(p))
                        .unwrap_or(false);
                    if matches_self || matches_parent {
                        g.active = false;
                        to_revoke.insert(g.grant_id.clone());
                        revoked_ids.push(g.grant_id.clone());
                        changed = true;
                    }
                }
            }
        }
        revoked_ids
    }
}

// ---------------------------------------------------------------------------
// 2. Least-Privilege Cloud IAM Rightsizing Engine
// ---------------------------------------------------------------------------
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct IamRightsizingRecommendation {
    pub entity_uid: String,
    pub declared_permissions: Vec<String>,
    pub observed_permissions_30d: Vec<String>,
    pub unused_permissions_removed: Vec<String>,
    pub privilege_reduction_percent: u8,
    pub least_privilege_policy_json: String,
}

pub fn generate_iam_rightsizing_diff(
    entity_uid: &str,
    declared: &[String],
    observed_30d: &[String],
    resource_arn: &str,
) -> IamRightsizingRecommendation {
    let observed_set: HashSet<&String> = observed_30d.iter().collect();
    let mut removed = Vec::new();
    for perm in declared {
        if perm.ends_with(":*") || !observed_set.contains(perm) {
            removed.push(perm.clone());
        }
    }
    let minimal: Vec<String> = if observed_30d.is_empty() {
        vec![]
    } else {
        observed_30d.to_vec()
    };

    let policy_doc = serde_json::json!({
        "Version": "2012-10-17",
        "Statement": [{
            "Sid": "AxiomLeastPrivilegeRightsized",
            "Effect": "Allow",
            "Action": minimal,
            "Resource": resource_arn
        }]
    });

    let reduction = if declared.is_empty() {
        0
    } else {
        ((removed.len() * 100) / declared.len().max(1)).min(99) as u8
    };

    IamRightsizingRecommendation {
        entity_uid: entity_uid.to_owned(),
        declared_permissions: declared.to_vec(),
        observed_permissions_30d: minimal,
        unused_permissions_removed: removed,
        privilege_reduction_percent: reduction,
        least_privilege_policy_json: serde_json::to_string_pretty(&policy_doc).unwrap_or_default(),
    }
}

// ---------------------------------------------------------------------------
// 3. Commercial Usage Metering Engine ($0 Discovery Guarantee)
// ---------------------------------------------------------------------------
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MeteredEntityRecord {
    pub entity_uid: String,
    pub is_ai_agent: bool,
    pub has_assigned_owner: bool,
    pub has_active_policy_or_secretless_or_rotation: bool,
    pub governed_calls_this_month: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MonthlyMeteringSummary {
    pub total_discovered_entities: u32,
    pub free_discovered_ungoverned_entities: u32,
    pub discovery_fee_usd: u32, // Strictly $0
    pub billable_governed_nhis: u32,
    pub billable_active_governed_agents: u32,
}

/// Implements Section 4 of the Master Plan:
/// - Discovery is Always Free ($0).
/// - An NHI is billable ONLY when it has an assigned owner AND at least one active
///   policy, secretless broker binding, or rotation schedule.
/// - An AI agent is billable ONLY in months when it executes governed calls under fleet controls.
pub fn compute_monthly_metering(records: &[MeteredEntityRecord]) -> MonthlyMeteringSummary {
    let mut billable_nhis = 0;
    let mut billable_agents = 0;

    for r in records {
        if r.is_ai_agent {
            if r.has_assigned_owner
                && r.has_active_policy_or_secretless_or_rotation
                && r.governed_calls_this_month > 0
            {
                billable_agents += 1;
            }
        } else if r.has_assigned_owner && r.has_active_policy_or_secretless_or_rotation {
            billable_nhis += 1;
        }
    }

    let total = records.len() as u32;
    let governed = billable_nhis + billable_agents;
    MonthlyMeteringSummary {
        total_discovered_entities: total,
        free_discovered_ungoverned_entities: total.saturating_sub(governed),
        discovery_fee_usd: 0,
        billable_governed_nhis: billable_nhis,
        billable_active_governed_agents: billable_agents,
    }
}

// ---------------------------------------------------------------------------
// 4. Signed AI-BOM (CycloneDX 1.6) & Regulatory Compliance Pack
// ---------------------------------------------------------------------------
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SignedAiBomManifest {
    pub bom_format: String,
    pub spec_version: String,
    pub tenant_id: String,
    pub generated_at_iso: String,
    pub models_and_agents: Vec<String>,
    pub mcp_tool_servers: Vec<String>,
    pub pinned_tool_hashes: HashMap<String, String>,
    pub compliance_frameworks: Vec<String>,
    pub content_sha256: String,
    pub ed25519_signature: String,
}

use ring::signature::{Ed25519KeyPair, KeyPair};
use ring::rand::SystemRandom;

pub fn generate_signed_ai_bom(
    tenant_id: &str,
    models_and_agents: Vec<String>,
    mcp_tool_servers: Vec<String>,
    pinned_tool_hashes: HashMap<String, String>,
) -> SignedAiBomManifest {
    let rng = SystemRandom::new();
    let pkcs8_bytes = match Ed25519KeyPair::generate_pkcs8(&rng) {
        Ok(pkcs8) => pkcs8,
        Err(_) => panic!("Failed to generate secure random Ed25519 keypair for AI-BOM"),
    };
    let key_pair = Ed25519KeyPair::from_pkcs8(pkcs8_bytes.as_ref())
        .expect("Valid generated PKCS#8 Ed25519 keypair");

    let mut hasher = Sha256::new();
    hasher.update(b"AXIOM_AI_BOM_CYCLONEDX_V1\x00");
    hasher.update((tenant_id.len() as u64).to_le_bytes());
    hasher.update(tenant_id.as_bytes());
    hasher.update(format!("{:?}|{:?}", models_and_agents, mcp_tool_servers).as_bytes());
    let digest = hex::encode(hasher.finalize());

    let sig = key_pair.sign(digest.as_bytes());
    let sig_hex = hex::encode(sig.as_ref());
    let pub_key_hex = hex::encode(key_pair.public_key().as_ref());

    SignedAiBomManifest {
        bom_format: "CycloneDX-AI-BOM".to_owned(),
        spec_version: "1.6".to_owned(),
        tenant_id: tenant_id.to_owned(),
        generated_at_iso: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
        models_and_agents,
        mcp_tool_servers,
        pinned_tool_hashes,
        compliance_frameworks: vec![
            "OWASP Top 10 for Non-Human Identities (2025)".to_owned(),
            "OWASP Top 10 for Large Language Model Applications & MCP".to_owned(),
            "EU AI Act Article 15 & 50 (Transparency & Cyber-Resilience)".to_owned(),
            "ISO/IEC 42001:2023 AI Management System Alignment".to_owned(),
            "NIST SP 800-207 Zero Trust Architecture".to_owned(),
        ],
        content_sha256: format!("sha256:{digest}"),
        ed25519_signature: format!("ed25519:pubkey={pub_key_hex}:sig={sig_hex}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ring::signature::UnparsedPublicKey;

    #[test]
    fn generates_cryptographically_valid_ed25519_signed_ai_bom() {
        let manifest = generate_signed_ai_bom(
            "tenant-corp-1",
            vec!["claude-3-5-sonnet".to_owned()],
            vec!["github-mcp".to_owned()],
            HashMap::new(),
        );

        assert_eq!(manifest.bom_format, "CycloneDX-AI-BOM");
        assert!(manifest.content_sha256.starts_with("sha256:"));
        assert!(manifest.ed25519_signature.starts_with("ed25519:pubkey="));

        let parts: Vec<&str> = manifest.ed25519_signature.split(':').collect();
        let pubkey_hex = parts[1].strip_prefix("pubkey=").unwrap();
        let sig_hex = parts[2].strip_prefix("sig=").unwrap();

        let pubkey_bytes = hex::decode(pubkey_hex).unwrap();
        let sig_bytes = hex::decode(sig_hex).unwrap();
        let digest = manifest.content_sha256.strip_prefix("sha256:").unwrap();

        let peer_public_key = UnparsedPublicKey::new(&ring::signature::ED25519, pubkey_bytes);
        assert!(peer_public_key.verify(digest.as_bytes(), &sig_bytes).is_ok());
    }
}

pub mod lifecycle;
pub mod spicedb;
