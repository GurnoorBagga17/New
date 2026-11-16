//! Oasis Competitor Parity: Automated NHI Lifecycle Governance, Stale Identity
//! Deprovisioning & Posture Scoring Engine.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct NhiLifecycleRecord {
    pub entity_uid: String,
    pub inactive_days: u32,
    pub owner_active_in_idp: bool,
    pub has_ephemeral_attestation: bool,
    pub blast_radius_score: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LifecycleGovernanceDecision {
    pub entity_uid: String,
    pub action: String,
    pub posture_score: u8,
    pub reason: String,
}

pub fn evaluate_nhi_lifecycle(record: &NhiLifecycleRecord) -> LifecycleGovernanceDecision {
    if !record.owner_active_in_idp {
        return LifecycleGovernanceDecision {
            entity_uid: record.entity_uid.clone(),
            action: "QUARANTINE_ORPHANED_NHI".into(),
            posture_score: 15,
            reason: "Human owner departed organization in IdP; orphaned NHI quarantined".into(),
        };
    }
    if record.inactive_days >= 90 {
        return LifecycleGovernanceDecision {
            entity_uid: record.entity_uid.clone(),
            action: "AUTO_DEPROVISION_STALE_NHI".into(),
            posture_score: 35,
            reason: format!("NHI inactive for {} days (>= 90d threshold)", record.inactive_days),
        };
    }
    let base_score: u8 = if record.has_ephemeral_attestation { 95 } else { 70 };
    LifecycleGovernanceDecision {
        entity_uid: record.entity_uid.clone(),
        action: "MAINTAIN_ACTIVE_LEASE".into(),
        posture_score: base_score.saturating_sub(record.blast_radius_score / 10),
        reason: "Active NHI within lifecycle policy bounds".into(),
    }
}
