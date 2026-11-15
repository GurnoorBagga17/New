// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
//! Team 4 — Postgres 16 Lineage Graph & Pre-Revocation Blast-Radius Simulator.
//!
//! Reconciles static discovery edges (Team 1) with live runtime OTel edges (Team 5)
//! and executes recursive traversal to identify every dependent agent, workload,
//! and shared-credential sibling (`NHI9:2025`) before a secret or server is revoked.

use std::collections::{HashMap, HashSet, VecDeque};
use serde::{Deserialize, Serialize};

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
