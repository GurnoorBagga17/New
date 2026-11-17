// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
//! Live PostgreSQL 16 Dependency Lineage Graph & Pre-Revocation Engine.
//!
//! Executes recursive CTE graph traversals (`simulate_revocation`) and
//! maintains the identity inventory database using connection-pooled `sqlx::PgPool`.

use crate::{
    GraphEdge, GraphNode, IntegrationRecord, OperatorRecord, OperatorSessionRecord,
    RevocationImpactSimulation, SyncRunRecord, TenantRecord,
};
use sqlx::{postgres::PgPoolOptions, PgPool, Row};
use thiserror::Error;

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

    /// Runs the Phase 2 schema migrations and installs the recursive CTE simulation function
    /// along with multi-tenant Row-Level Security (RLS) enforcement and operator auth/SCIM tables.
    pub async fn run_migrations(&self) -> Result<(), LineageDbError> {
        let ddl1 = include_str!("../migrations/0001_phase2_graph.sql");
        sqlx::raw_sql(ddl1).execute(&self.pool).await?;
        let ddl2 = include_str!("../migrations/0002_tenant_rls.sql");
        sqlx::raw_sql(ddl2).execute(&self.pool).await?;
        let ddl3 = include_str!("../migrations/0003_operator_auth_and_scim.sql");
        sqlx::raw_sql(ddl3).execute(&self.pool).await?;
        let ddl4 = include_str!("../migrations/0004_integrations_and_sync_runs.sql");
        sqlx::raw_sql(ddl4).execute(&self.pool).await?;
        let ddl5 = include_str!("../migrations/0005_harden_rls_fail_closed.sql");
        sqlx::raw_sql(ddl5).execute(&self.pool).await?;
        Ok(())
    }

    /// Fetches a tenant by tenant_id.
    pub async fn get_tenant(
        &self,
        tenant_id: &str,
    ) -> Result<Option<TenantRecord>, LineageDbError> {
        let row = sqlx::query(
            r#"
            SELECT tenant_id, organization_name, enforce_sso, sso_issuer_url
            FROM tenants
            WHERE tenant_id = $1
            "#,
        )
        .bind(tenant_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|r| TenantRecord {
            tenant_id: r.get("tenant_id"),
            organization_name: r.get("organization_name"),
            enforce_sso: r.get("enforce_sso"),
            sso_issuer_url: r.get("sso_issuer_url"),
        }))
    }

    /// Fetches an operator by email.
    pub async fn get_operator_by_email(
        &self,
        email: &str,
    ) -> Result<Option<OperatorRecord>, LineageDbError> {
        let row = sqlx::query(
            r#"
            SELECT user_id, tenant_id, email, display_name, role, is_active, webauthn_credential_id
            FROM operators
            WHERE email = $1
            "#,
        )
        .bind(email)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|r| OperatorRecord {
            user_id: r.get("user_id"),
            tenant_id: r.get("tenant_id"),
            email: r.get("email"),
            display_name: r.get("display_name"),
            role: r.get("role"),
            is_active: r.get("is_active"),
            webauthn_credential_id: r.get("webauthn_credential_id"),
        }))
    }

    /// Creates or updates an operator record.
    pub async fn create_operator(
        &self,
        op: &OperatorRecord,
        password_hash: Option<&str>,
    ) -> Result<(), LineageDbError> {
        sqlx::query(
            r#"
            INSERT INTO operators (user_id, tenant_id, email, display_name, role, password_hash, webauthn_credential_id, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (user_id) DO UPDATE SET
                display_name = EXCLUDED.display_name,
                role = EXCLUDED.role,
                password_hash = COALESCE(EXCLUDED.password_hash, operators.password_hash),
                webauthn_credential_id = COALESCE(EXCLUDED.webauthn_credential_id, operators.webauthn_credential_id),
                is_active = EXCLUDED.is_active;
            "#,
        )
        .bind(&op.user_id)
        .bind(&op.tenant_id)
        .bind(&op.email)
        .bind(&op.display_name)
        .bind(&op.role)
        .bind(password_hash)
        .bind(&op.webauthn_credential_id)
        .bind(op.is_active)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Creates a new operator session in PostgreSQL.
    #[allow(clippy::too_many_arguments)]
    pub async fn create_session(
        &self,
        session_id: &str,
        user_id: &str,
        tenant_id: &str,
        csrf_token: &str,
        ip_address: Option<&str>,
        user_agent: Option<&str>,
        expires_at: chrono::DateTime<chrono::Utc>,
    ) -> Result<(), LineageDbError> {
        sqlx::query(
            r#"
            INSERT INTO operator_sessions (session_id, user_id, tenant_id, csrf_token, ip_address, user_agent, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            "#,
        )
        .bind(session_id)
        .bind(user_id)
        .bind(tenant_id)
        .bind(csrf_token)
        .bind(ip_address)
        .bind(user_agent)
        .bind(expires_at)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Fetches an active session by session_id.
    pub async fn get_session(
        &self,
        session_id: &str,
    ) -> Result<Option<OperatorSessionRecord>, LineageDbError> {
        let row = sqlx::query(
            r#"
            SELECT session_id, user_id, tenant_id, csrf_token, expires_at, revoked
            FROM operator_sessions
            WHERE session_id = $1 AND revoked = FALSE AND expires_at > NOW()
            "#,
        )
        .bind(session_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|r| OperatorSessionRecord {
            session_id: r.get("session_id"),
            user_id: r.get("user_id"),
            tenant_id: r.get("tenant_id"),
            csrf_token: r.get("csrf_token"),
            expires_at: r.get("expires_at"),
            revoked: r.get("revoked"),
        }))
    }

    /// Revokes an operator session.
    pub async fn revoke_session(&self, session_id: &str) -> Result<(), LineageDbError> {
        sqlx::query(
            r#"
            UPDATE operator_sessions
            SET revoked = TRUE
            WHERE session_id = $1
            "#,
        )
        .bind(session_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Lists all nodes for the given tenant (or all if system_admin).
    pub async fn list_nodes(
        &self,
        tenant_id: Option<&str>,
    ) -> Result<Vec<GraphNode>, LineageDbError> {
        let tenant = tenant_id.unwrap_or("org_default");
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT set_config('app.current_tenant', $1, true)")
            .bind(tenant)
            .execute(&mut *tx)
            .await?;

        let rows = sqlx::query(
            r#"
            SELECT entity_uid, entity_kind, display_name, owner_email, blast_radius_score
            FROM nhi_nodes
            ORDER BY entity_uid;
            "#,
        )
        .fetch_all(&mut *tx)
        .await?;

        tx.commit().await?;

        let nodes = rows
            .into_iter()
            .map(|row| GraphNode {
                entity_uid: row.get("entity_uid"),
                entity_kind: row.get("entity_kind"),
                display_name: row.get("display_name"),
                owner_email: row.get("owner_email"),
                privilege_weight: row.get::<i16, _>("blast_radius_score") as u8,
            })
            .collect();

        Ok(nodes)
    }

    /// Lists all directed dependency edges for the given tenant (or all if system_admin).
    pub async fn list_edges(
        &self,
        tenant_id: Option<&str>,
    ) -> Result<Vec<GraphEdge>, LineageDbError> {
        let tenant = tenant_id.unwrap_or("org_default");
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT set_config('app.current_tenant', $1, true)")
            .bind(tenant)
            .execute(&mut *tx)
            .await?;

        let rows = sqlx::query(
            r#"
            SELECT source_uid, target_uid, relation_type, observed_via
            FROM nhi_edges
            ORDER BY source_uid, target_uid;
            "#,
        )
        .fetch_all(&mut *tx)
        .await?;

        tx.commit().await?;

        let edges = rows
            .into_iter()
            .map(|row| GraphEdge {
                source_uid: row.get("source_uid"),
                target_uid: row.get("target_uid"),
                relation_type: row.get("relation_type"),
                observed_via: row.get("observed_via"),
            })
            .collect();

        Ok(edges)
    }

    /// Inserts or updates an NHI node in the `nhi_nodes` table under `org_default`.
    pub async fn upsert_node(
        &self,
        node: &GraphNode,
        source_connector: &str,
        fingerprint_sha256: &str,
    ) -> Result<(), LineageDbError> {
        self.upsert_node_with_tenant(node, source_connector, fingerprint_sha256, "org_default")
            .await
    }

    /// Inserts or updates an NHI node with explicit tenant isolation and RLS session binding.
    pub async fn upsert_node_with_tenant(
        &self,
        node: &GraphNode,
        source_connector: &str,
        fingerprint_sha256: &str,
        tenant_id: &str,
    ) -> Result<(), LineageDbError> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT set_config('app.current_tenant', $1, true)")
            .bind(tenant_id)
            .execute(&mut *tx)
            .await?;

        sqlx::query(
            r#"
            INSERT INTO nhi_nodes (
                entity_uid, entity_kind, source_connector, display_name,
                fingerprint_sha256, owner_email, blast_radius_score, tenant_id, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            ON CONFLICT (entity_uid) DO UPDATE SET
                entity_kind = EXCLUDED.entity_kind,
                source_connector = EXCLUDED.source_connector,
                display_name = EXCLUDED.display_name,
                fingerprint_sha256 = EXCLUDED.fingerprint_sha256,
                owner_email = EXCLUDED.owner_email,
                blast_radius_score = EXCLUDED.blast_radius_score,
                tenant_id = EXCLUDED.tenant_id,
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
        .bind(tenant_id)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(())
    }

    /// Inserts or updates a directed dependency edge in `nhi_edges` under `org_default`.
    pub async fn upsert_edge(&self, edge: &GraphEdge) -> Result<(), LineageDbError> {
        self.upsert_edge_with_tenant(edge, "org_default").await
    }

    /// Inserts or updates a directed dependency edge with explicit tenant isolation and RLS session binding.
    pub async fn upsert_edge_with_tenant(
        &self,
        edge: &GraphEdge,
        tenant_id: &str,
    ) -> Result<(), LineageDbError> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT set_config('app.current_tenant', $1, true)")
            .bind(tenant_id)
            .execute(&mut *tx)
            .await?;

        sqlx::query(
            r#"
            INSERT INTO nhi_edges (
                source_uid, target_uid, relation_type, observed_via,
                tenant_id, first_seen_at, last_seen_at, call_count_24h
            )
            VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), 1)
            ON CONFLICT (source_uid, target_uid, relation_type) DO UPDATE SET
                tenant_id = EXCLUDED.tenant_id,
                last_seen_at = NOW(),
                call_count_24h = nhi_edges.call_count_24h + 1;
            "#,
        )
        .bind(&edge.source_uid)
        .bind(&edge.target_uid)
        .bind(&edge.relation_type)
        .bind(&edge.observed_via)
        .bind(tenant_id)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(())
    }

    /// Queries the recursive CTE function `simulate_revocation(p_target_uid)`
    /// directly on PostgreSQL to calculate affected agents, siblings, and blast radius.
    pub async fn simulate_revocation(
        &self,
        target_uid: &str,
    ) -> Result<RevocationImpactSimulation, LineageDbError> {
        self.simulate_revocation_with_tenant(target_uid, "org_default")
            .await
    }

    /// Queries the recursive CTE function with explicit tenant context.
    pub async fn simulate_revocation_with_tenant(
        &self,
        target_uid: &str,
        tenant_id: &str,
    ) -> Result<RevocationImpactSimulation, LineageDbError> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT set_config('app.current_tenant', $1, true)")
            .bind(tenant_id)
            .execute(&mut *tx)
            .await?;

        let rows = sqlx::query(
            r#"
            SELECT node_uid, distance, impact_type
            FROM simulate_revocation($1);
            "#,
        )
        .bind(target_uid)
        .fetch_all(&mut *tx)
        .await?;

        tx.commit().await?;

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
        let blast_radius_score =
            ((total_impacted as u32 * 20) + (shared_siblings.len() as u32 * 25)).min(100) as u8;

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

    /// Creates a new integration for a tenant.
    #[allow(clippy::too_many_arguments)]
    pub async fn create_integration(
        &self,
        id: &str,
        tenant_id: &str,
        provider: &str,
        display_name: &str,
        credential_ref: &str,
        external_id: Option<&str>,
        created_by: Option<&str>,
    ) -> Result<IntegrationRecord, LineageDbError> {
        let row = sqlx::query(
            r#"
            INSERT INTO integrations (id, tenant_id, provider, display_name, credential_ref, external_id, created_by, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'connected')
            RETURNING id, tenant_id, provider, display_name, credential_ref, external_id, status, last_sync_at, last_error, created_at
            "#,
        )
        .bind(id)
        .bind(tenant_id)
        .bind(provider)
        .bind(display_name)
        .bind(credential_ref)
        .bind(external_id)
        .bind(created_by)
        .fetch_one(&self.pool)
        .await?;

        Ok(IntegrationRecord {
            id: row.get("id"),
            tenant_id: row.get("tenant_id"),
            provider: row.get("provider"),
            display_name: row.get("display_name"),
            credential_ref: row.get("credential_ref"),
            external_id: row.get("external_id"),
            status: row.get("status"),
            last_sync_at: row.get("last_sync_at"),
            last_error: row.get("last_error"),
            created_at: row.get("created_at"),
        })
    }

    /// Lists all integrations for a tenant.
    pub async fn list_integrations(
        &self,
        tenant_id: &str,
    ) -> Result<Vec<IntegrationRecord>, LineageDbError> {
        let rows = sqlx::query(
            r#"
            SELECT id, tenant_id, provider, display_name, credential_ref, external_id, status, last_sync_at, last_error, created_at
            FROM integrations
            WHERE tenant_id = $1
            ORDER BY created_at DESC
            "#,
        )
        .bind(tenant_id)
        .fetch_all(&self.pool)
        .await?;

        let mut list = Vec::new();
        for row in rows {
            list.push(IntegrationRecord {
                id: row.get("id"),
                tenant_id: row.get("tenant_id"),
                provider: row.get("provider"),
                display_name: row.get("display_name"),
                credential_ref: row.get("credential_ref"),
                external_id: row.get("external_id"),
                status: row.get("status"),
                last_sync_at: row.get("last_sync_at"),
                last_error: row.get("last_error"),
                created_at: row.get("created_at"),
            });
        }
        Ok(list)
    }

    /// Gets a single integration by ID for a tenant.
    pub async fn get_integration(
        &self,
        tenant_id: &str,
        id: &str,
    ) -> Result<Option<IntegrationRecord>, LineageDbError> {
        let row = sqlx::query(
            r#"
            SELECT id, tenant_id, provider, display_name, credential_ref, external_id, status, last_sync_at, last_error, created_at
            FROM integrations
            WHERE tenant_id = $1 AND id = $2
            "#,
        )
        .bind(tenant_id)
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(|r| IntegrationRecord {
            id: r.get("id"),
            tenant_id: r.get("tenant_id"),
            provider: r.get("provider"),
            display_name: r.get("display_name"),
            credential_ref: r.get("credential_ref"),
            external_id: r.get("external_id"),
            status: r.get("status"),
            last_sync_at: r.get("last_sync_at"),
            last_error: r.get("last_error"),
            created_at: r.get("created_at"),
        }))
    }

    /// Updates an integration's status, last sync timestamp, and optional error.
    pub async fn update_integration_status(
        &self,
        tenant_id: &str,
        id: &str,
        status: &str,
        last_error: Option<&str>,
    ) -> Result<(), LineageDbError> {
        sqlx::query(
            r#"
            UPDATE integrations
            SET status = $3,
                last_sync_at = NOW(),
                last_error = $4,
                updated_at = NOW()
            WHERE tenant_id = $1 AND id = $2
            "#,
        )
        .bind(tenant_id)
        .bind(id)
        .bind(status)
        .bind(last_error)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Deletes an integration and marks associated discovered nodes as stale.
    pub async fn delete_integration(
        &self,
        tenant_id: &str,
        id: &str,
    ) -> Result<bool, LineageDbError> {
        // Mark nodes stale first
        sqlx::query(
            r#"
            UPDATE nhi_nodes
            SET is_stale = true
            WHERE tenant_id = $1 AND integration_id = $2
            "#,
        )
        .bind(tenant_id)
        .bind(id)
        .execute(&self.pool)
        .await?;

        let res = sqlx::query(
            r#"
            DELETE FROM integrations
            WHERE tenant_id = $1 AND id = $2
            "#,
        )
        .bind(tenant_id)
        .bind(id)
        .execute(&self.pool)
        .await?;

        Ok(res.rows_affected() > 0)
    }

    /// Records the start of a sync run.
    pub async fn create_sync_run(
        &self,
        id: &str,
        integration_id: &str,
        tenant_id: &str,
    ) -> Result<SyncRunRecord, LineageDbError> {
        let row = sqlx::query(
            r#"
            INSERT INTO sync_runs (id, integration_id, tenant_id, status)
            VALUES ($1, $2, $3, 'running')
            RETURNING id, integration_id, tenant_id, started_at, finished_at, status, nodes_seen, nodes_new, nodes_stale, error
            "#,
        )
        .bind(id)
        .bind(integration_id)
        .bind(tenant_id)
        .fetch_one(&self.pool)
        .await?;

        Ok(SyncRunRecord {
            id: row.get("id"),
            integration_id: row.get("integration_id"),
            tenant_id: row.get("tenant_id"),
            started_at: row.get("started_at"),
            finished_at: row.get("finished_at"),
            status: row.get("status"),
            nodes_seen: row.get("nodes_seen"),
            nodes_new: row.get("nodes_new"),
            nodes_stale: row.get("nodes_stale"),
            error: row.get("error"),
        })
    }

    /// Records the completion of a sync run.
    pub async fn complete_sync_run(
        &self,
        id: &str,
        status: &str,
        nodes_seen: i32,
        nodes_new: i32,
        nodes_stale: i32,
        error: Option<&str>,
    ) -> Result<(), LineageDbError> {
        sqlx::query(
            r#"
            UPDATE sync_runs
            SET status = $2,
                finished_at = NOW(),
                nodes_seen = $3,
                nodes_new = $4,
                nodes_stale = $5,
                error = $6
            WHERE id = $1
            "#,
        )
        .bind(id)
        .bind(status)
        .bind(nodes_seen)
        .bind(nodes_new)
        .bind(nodes_stale)
        .bind(error)
        .execute(&self.pool)
        .await?;

        Ok(())
    }
}
