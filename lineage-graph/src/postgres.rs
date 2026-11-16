// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
//! Live PostgreSQL 16 Dependency Lineage Graph & Pre-Revocation Engine.
//!
//! Executes recursive CTE graph traversals (`simulate_revocation`) and
//! maintains the identity inventory database using connection-pooled `sqlx::PgPool`.

use sqlx::{postgres::PgPoolOptions, PgPool, Row};
use thiserror::Error;
use crate::{GraphEdge, GraphNode, RevocationImpactSimulation};

#[derive(Debug, Error)]
pub enum LineageDbError {
    #[error("Database error: {0}")]
    Sqlx(#[from] sqlx::Error),
    #[error("Schema migration error: {0}")]
    Migration(String),
}

/// Production PostgreSQL Lineage Graph backed by `sqlx::PgPool`.
#[derive(Clone, Debug)]
pub struct PostgresLineageGraph {
    pool: PgPool,
}

impl PostgresLineageGraph {
    /// Creates a new PostgresLineageGraph connected to the specified PostgreSQL connection string.
    pub async fn connect(database_url: &str) -> Result<Self, LineageDbError> {
        let pool = PgPoolOptions::new()
            .max_connections(20)
            .min_connections(2)
            .acquire_timeout(std::time::Duration::from_secs(5))
            .connect(database_url)
            .await?;
        Ok(Self { pool })
    }

    /// Wraps an existing `PgPool`.
    pub fn from_pool(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Returns a reference to the underlying connection pool.
    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    /// Runs the Phase 2 schema migrations and installs the recursive CTE simulation function.
    pub async fn run_migrations(&self) -> Result<(), LineageDbError> {
        let ddl = include_str!("../migrations/0001_phase2_graph.sql");
        sqlx::raw_sql(ddl).execute(&self.pool).await?;
        Ok(())
    }

    /// Inserts or updates an NHI node in the `nhi_nodes` table.
    pub async fn upsert_node(
        &self,
        node: &GraphNode,
        source_connector: &str,
        fingerprint_sha256: &str,
    ) -> Result<(), LineageDbError> {
        sqlx::query(
            r#"
            INSERT INTO nhi_nodes (
                entity_uid, entity_kind, source_connector, display_name,
                fingerprint_sha256, owner_email, blast_radius_score, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            ON CONFLICT (entity_uid) DO UPDATE SET
                entity_kind = EXCLUDED.entity_kind,
                source_connector = EXCLUDED.source_connector,
                display_name = EXCLUDED.display_name,
                fingerprint_sha256 = EXCLUDED.fingerprint_sha256,
                owner_email = EXCLUDED.owner_email,
                blast_radius_score = EXCLUDED.blast_radius_score,
                updated_at = NOW();
            "#,
        )
        .bind(&node.entity_uid)
        .bind(&node.entity_kind)
        .bind(source_connector)
        .bind(&node.display_name)
        .bind(fingerprint_sha256)
        .bind(&node.owner_email)
        .bind(node.privilege_weight as i16)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Inserts or updates a directed dependency edge in `nhi_edges`.
    pub async fn upsert_edge(&self, edge: &GraphEdge) -> Result<(), LineageDbError> {
        sqlx::query(
            r#"
            INSERT INTO nhi_edges (
                source_uid, target_uid, relation_type, observed_via,
                first_seen_at, last_seen_at, call_count_24h
            )
            VALUES ($1, $2, $3, $4, NOW(), NOW(), 1)
            ON CONFLICT (source_uid, target_uid, relation_type) DO UPDATE SET
                last_seen_at = NOW(),
                call_count_24h = nhi_edges.call_count_24h + 1;
            "#,
        )
        .bind(&edge.source_uid)
        .bind(&edge.target_uid)
        .bind(&edge.relation_type)
        .bind(&edge.observed_via)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Queries the recursive CTE function `simulate_revocation(p_target_uid)`
    /// directly on PostgreSQL to calculate affected agents, siblings, and blast radius.
    pub async fn simulate_revocation(
        &self,
        target_uid: &str,
    ) -> Result<RevocationImpactSimulation, LineageDbError> {
        let rows = sqlx::query(
            r#"
            SELECT node_uid, distance, impact_type
            FROM simulate_revocation($1);
            "#,
        )
        .bind(target_uid)
        .fetch_all(&self.pool)
        .await?;

        let mut directly_affected = Vec::new();
        let mut transitively_affected = Vec::new();
        let mut shared_siblings = Vec::new();

        for row in rows {
            let node_uid: String = row.get("node_uid");
            let impact_type: String = row.get("impact_type");

            match impact_type.as_str() {
                "directly_affected" => directly_affected.push(node_uid),
                "shared_credential_sibling" => {
                    directly_affected.push(node_uid.clone());
                    shared_siblings.push(node_uid);
                }
                "transitively_affected" => transitively_affected.push(node_uid),
                _ => {}
            }
        }

        let total_impacted = directly_affected.len() + transitively_affected.len();
        let safe_to_revoke = total_impacted == 0;
        let blast_radius_score = ((total_impacted as u32 * 20) + (shared_siblings.len() as u32 * 25)).min(100) as u8;

        let recommended_action = if safe_to_revoke {
            "Safe for immediate causal session revocation via `axiom kill`.".to_owned()
        } else if !shared_siblings.is_empty() {
            format!(
                "Shared credential impact detected across {} sibling workload(s). Issue scoped RFC 8693 session revocation before revoking underlying secret.",
                shared_siblings.len()
            )
        } else {
            format!(
                "Direct impact on {} agent(s) and {} transitive workload(s).",
                directly_affected.len(),
                transitively_affected.len()
            )
        };

        Ok(RevocationImpactSimulation {
            target_uid: target_uid.to_owned(),
            safe_to_revoke_immediately: safe_to_revoke,
            directly_affected_agents: directly_affected,
            transitively_affected_workloads: transitively_affected,
            shared_credential_siblings: shared_siblings,
            blast_radius_score,
            recommended_action,
        })
    }
}
