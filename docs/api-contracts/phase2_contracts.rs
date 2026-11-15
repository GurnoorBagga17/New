// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
//! Frozen Phase 2 Data Contracts (`phase2_contracts.rs`)
//! Shared across Team 1 (Connectors), Team 2 (Risk & Policy), Team 3 (Attribution),
//! Team 4 (Postgres Lineage Graph), and Team 5 (Alerting & Shadow Audit).

use std::collections::HashMap;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EntityKind {
    AwsIamRole,
    AwsAccessKey,
    K8sServiceAccount,
    GithubApp,
    SlackBot,
    McpServer,
    AiAgent,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RelationType {
    AuthenticatesWith,
    AssumesRole,
    InvokesMcpTool,
    ReadsSecret,
    MountedInPod,
    DelegatesTo,
}

/// 1. DiscoveredEntity (Emitted by Team 1 Connectors -> Consumed by Team 3 & Team 4)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiscoveredEntity {
    pub entity_uid: String,
    pub entity_kind: EntityKind,
    pub source_connector: String,
    pub display_name: String,
    /// Cryptographic HMAC-SHA256 of credential identifier (NEVER raw secret value)
    pub fingerprint_sha256: String,
    pub created_at_unix: Option<i64>,
    pub last_used_unix: Option<i64>,
    pub raw_permissions: Vec<String>,
    pub metadata_tags: HashMap<String, String>,
}

/// 2. DiscoveredEdge (Emitted by Team 1 Connectors & Team 5 OTel Stream -> Consumed by Team 4 Graph)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiscoveredEdge {
    pub source_uid: String,
    pub target_uid: String,
    pub relation_type: RelationType,
    pub observed_via: String,
    pub first_seen_unix: i64,
    pub last_seen_unix: i64,
    pub call_count_24h: u64,
}

/// 3. OwnershipAttribution (Produced by Team 3 -> Stored in Team 4 Graph & Consumed by Team 2/5)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OwnershipAttribution {
    pub entity_uid: String,
    pub primary_owner_email: Option<String>,
    pub owning_team: Option<String>,
    pub confidence_score: f32,
    pub evidence_sources: Vec<String>,
}

/// 4. RiskScorecard (Produced by Team 2 & Team 4 -> Consumed by Team 2 Cedar Cache & Team 5 Alerts)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RiskScorecard {
    pub entity_uid: String,
    pub exposure_score: u8,
    pub blast_radius_score: u8,
    pub composite_severity: String,
    pub owasp_nhi_findings: Vec<String>,
    pub owasp_mcp_findings: Vec<String>,
    pub dependent_workloads_count: u32,
}

/// 5. RevocationImpactReport (Produced by Team 4 -> Consumed by Team 5 CLI/Alerts before revocation)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RevocationImpactReport {
    pub target_uid: String,
    pub safe_to_revoke_immediately: bool,
    pub directly_affected_agents: Vec<String>,
    pub transitively_affected_workloads: Vec<String>,
    pub shared_credential_siblings: Vec<String>,
    pub recommended_action: String,
}

/// 6. EntityContextSnapshot (Pushed from Team 4 Postgres to Team 2 ExtMCP `ArcSwap` cache via ContextSync)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EntityContextSnapshot {
    pub entity_uid: String,
    pub has_owner: bool,
    pub owner_team: String,
    pub blast_radius_score: u8,
    pub exposure_score: u8,
    pub is_shadow_nhi: bool,
    pub owasp_flags: Vec<String>,
}
