// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
//! Team 4 — Postgres 16 Lineage Graph & Pre-Revocation Blast-Radius Simulator.
//!
//! Reconciles static discovery edges (Team 1) with live runtime OTel edges (Team 5)
//! and executes recursive traversal to identify every dependent agent, workload,
//! and shared-credential sibling (`NHI9:2025`) before a secret or server is revoked.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};

pub mod postgres;
pub use postgres::{LineageDbError, PostgresLineageGraph};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct IntegrationRecord {
    pub id: String,
    pub tenant_id: String,
    pub provider: String,
    pub display_name: String,
    pub credential_ref: String,
    pub external_id: Option<String>,
    pub status: String,
    pub last_sync_at: Option<chrono::DateTime<chrono::Utc>>,
    pub last_error: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SyncRunRecord {
    pub id: String,
    pub integration_id: String,
    pub tenant_id: String,
    pub started_at: chrono::DateTime<chrono::Utc>,
    pub finished_at: Option<chrono::DateTime<chrono::Utc>>,
    pub status: String,
    pub nodes_seen: i32,
    pub nodes_new: i32,
    pub nodes_stale: i32,
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TenantRecord {
    pub tenant_id: String,
    pub organization_name: String,
    pub enforce_sso: bool,
    pub sso_issuer_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OperatorRecord {
    pub user_id: String,
    pub tenant_id: String,
    pub email: String,
    pub display_name: String,
    pub role: String,
    pub is_active: bool,
    pub webauthn_credential_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OperatorSessionRecord {
    pub session_id: String,
    pub user_id: String,
    pub tenant_id: String,
    pub csrf_token: String,
    pub expires_at: chrono::DateTime<chrono::Utc>,
    pub revoked: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GraphNode {
    pub entity_uid: String,
    pub entity_kind: String,
    pub display_name: String,
    pub owner_email: Option<String>,
    pub privilege_weight: u8, // 10 = Read, 25 = Write, 45 = Destructive/Admin
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GraphEdge {
    pub source_uid: String,
    pub target_uid: String,
    pub relation_type: String,
    pub observed_via: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RevocationImpactSimulation {
    pub target_uid: String,
    pub safe_to_revoke_immediately: bool,
    pub directly_affected_agents: Vec<String>,
    pub transitively_affected_workloads: Vec<String>,
    pub shared_credential_siblings: Vec<String>,
    pub blast_radius_score: u8,
    pub recommended_action: String,
}

#[derive(Default)]
pub struct LineageGraphEngine {
    nodes: HashMap<String, GraphNode>,
    edges: Vec<GraphEdge>,
}

impl LineageGraphEngine {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn upsert_node(&mut self, node: GraphNode) {
        self.nodes.insert(node.entity_uid.clone(), node);
    }

    pub fn upsert_edge(&mut self, edge: GraphEdge) {
        if !self.edges.iter().any(|e| {
            e.source_uid == edge.source_uid
                && e.target_uid == edge.target_uid
                && e.relation_type == edge.relation_type
        }) {
            self.edges.push(edge);
        }
    }

    pub fn nodes(&self) -> &HashMap<String, GraphNode> {
        &self.nodes
    }

    pub fn edges(&self) -> &[GraphEdge] {
        &self.edges
    }

    /// Simulates revoking `target_uid` using breadth-first dependency & sibling traversal.
    pub fn simulate_revocation(&self, target_uid: &str) -> RevocationImpactSimulation {
        let mut direct_agents = Vec::new();
        let mut transitive_workloads = Vec::new();
        let mut siblings = Vec::new();
        let mut visited = HashSet::new();
        let mut queue = VecDeque::new();

        // Find direct callers/dependents of target_uid
        for edge in &self.edges {
            if edge.target_uid == target_uid {
                direct_agents.push(edge.source_uid.clone());
                visited.insert(edge.source_uid.clone());
                queue.push_back(edge.source_uid.clone());
            }
        }

        // If target_uid is a shared secret/credential, multiple callers are siblings (NHI9:2025)
        if direct_agents.len() > 1 {
            siblings = direct_agents.clone();
        }

        // Traverse upstream callers that depend on the directly affected nodes
        while let Some(current) = queue.pop_front() {
            for edge in &self.edges {
                if edge.target_uid == current && !visited.contains(&edge.source_uid) {
                    visited.insert(edge.source_uid.clone());
                    transitive_workloads.push(edge.source_uid.clone());
                    queue.push_back(edge.source_uid.clone());
                }
            }
        }

        // Compute downstream blast radius if target_uid initiates calls
        let mut downstream_weight: u32 = 0;
        for edge in &self.edges {
            if edge.source_uid == target_uid {
                if let Some(target_node) = self.nodes.get(&edge.target_uid) {
                    downstream_weight += u32::from(target_node.privilege_weight);
                } else {
                    downstream_weight += 15;
                }
            }
        }

        let total_dependents = (direct_agents.len() + transitive_workloads.len()) as u32;
        let raw_score = (downstream_weight + total_dependents * 18).min(100) as u8;
        let safe = siblings.is_empty() && transitive_workloads.is_empty();

        let recommended_action = if safe {
            "Safe for immediate causal session revocation via `axiom kill`.".to_owned()
        } else {
            format!(
                "Shared credential impact detected across {} sibling workload(s). Issue scoped RFC 8693 session revocation or run Phase 3 dual-secret rotation before revoking underlying credential.",
                siblings.len()
            )
        };

        RevocationImpactSimulation {
            target_uid: target_uid.to_owned(),
            safe_to_revoke_immediately: safe,
            directly_affected_agents: direct_agents,
            transitively_affected_workloads: transitive_workloads,
            shared_credential_siblings: siblings,
            blast_radius_score: raw_score,
            recommended_action,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_isolated_leaf_node_revocation_is_safe() {
        let mut engine = LineageGraphEngine::new();
        engine.upsert_node(GraphNode {
            entity_uid: "agent:analyst-1".into(),
            entity_kind: "Agent".into(),
            display_name: "Analyst Agent".into(),
            owner_email: Some("alice@company.com".into()),
            privilege_weight: 10,
        });

        let sim = engine.simulate_revocation("agent:analyst-1");
        assert!(sim.safe_to_revoke_immediately);
        assert_eq!(sim.directly_affected_agents.len(), 0);
        assert_eq!(sim.shared_credential_siblings.len(), 0);
    }

    #[test]
    fn test_shared_credential_revocation_detects_siblings_and_transitive_dependents() {
        let mut engine = LineageGraphEngine::new();

        // Database secret shared by two agents
        engine.upsert_node(GraphNode {
            entity_uid: "secret:prod-db-creds".into(),
            entity_kind: "Secret".into(),
            display_name: "Production DB Password".into(),
            owner_email: Some("db-team@company.com".into()),
            privilege_weight: 45,
        });

        // Agent 1 uses secret
        engine.upsert_edge(GraphEdge {
            source_uid: "agent:service-a".into(),
            target_uid: "secret:prod-db-creds".into(),
            relation_type: "reads_secret".into(),
            observed_via: "otel".into(),
        });

        // Agent 2 uses same secret (sibling workload)
        engine.upsert_edge(GraphEdge {
            source_uid: "agent:service-b".into(),
            target_uid: "secret:prod-db-creds".into(),
            relation_type: "reads_secret".into(),
            observed_via: "otel".into(),
        });

        // Upstream orchestrator depends on Agent 1 (transitive dependency)
        engine.upsert_edge(GraphEdge {
            source_uid: "workload:orchestrator".into(),
            target_uid: "agent:service-a".into(),
            relation_type: "invokes_agent".into(),
            observed_via: "static".into(),
        });

        let sim = engine.simulate_revocation("secret:prod-db-creds");

        // Revoking the shared secret affects both services directly
        assert_eq!(sim.directly_affected_agents.len(), 2);
        assert!(sim
            .directly_affected_agents
            .contains(&"agent:service-a".to_owned()));
        assert!(sim
            .directly_affected_agents
            .contains(&"agent:service-b".to_owned()));

        // Sibling workloads detected (NHI9:2025 violation)
        assert_eq!(sim.shared_credential_siblings.len(), 2);

        // Transitive caller identified
        assert_eq!(sim.transitively_affected_workloads.len(), 1);
        assert_eq!(
            sim.transitively_affected_workloads[0],
            "workload:orchestrator"
        );

        // High blast radius, not safe to revoke immediately without rotation
        assert!(!sim.safe_to_revoke_immediately);
        assert!(sim.blast_radius_score > 50);
        assert!(sim
            .recommended_action
            .contains("Shared credential impact detected"));
    }

    #[test]
    fn test_cycle_does_not_infinite_loop() {
        let mut engine = LineageGraphEngine::new();
        engine.upsert_edge(GraphEdge {
            source_uid: "node:a".into(),
            target_uid: "node:b".into(),
            relation_type: "depends_on".into(),
            observed_via: "otel".into(),
        });
        engine.upsert_edge(GraphEdge {
            source_uid: "node:b".into(),
            target_uid: "node:a".into(),
            relation_type: "depends_on".into(),
            observed_via: "otel".into(),
        });

        let sim = engine.simulate_revocation("node:b");
        assert!(sim.directly_affected_agents.contains(&"node:a".to_owned()));
    }
}
