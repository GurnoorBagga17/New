-- Copyright 2026 Axiom NHI — Licensed under Apache-2.0
-- Migration 0004: Integrations, Connectors, and Discovery Jobs
-- Phase 3: Real Integrations with OAuth/Role Setup & Lineage Graph Integration

-- =============================================================================
-- Integrations (Core Provider Configurations)
-- =============================================================================

CREATE TABLE IF NOT EXISTS integrations (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    provider VARCHAR(32) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    credential_ref TEXT NOT NULL,
    external_id VARCHAR(128),
    status VARCHAR(32) NOT NULL DEFAULT 'connected',
    last_sync_at TIMESTAMPTZ,
    last_error TEXT,
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integrations_tenant ON integrations(tenant_id, provider);

-- =============================================================================
-- Sync Runs (Discovery Execution & Drift Metrics)
-- =============================================================================

CREATE TABLE IF NOT EXISTS sync_runs (
    id VARCHAR(64) PRIMARY KEY,
    integration_id VARCHAR(64) NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    status VARCHAR(32) NOT NULL DEFAULT 'running',
    nodes_seen INT NOT NULL DEFAULT 0,
    nodes_new INT NOT NULL DEFAULT 0,
    nodes_stale INT NOT NULL DEFAULT 0,
    error TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_tenant_integration ON sync_runs(tenant_id, integration_id, started_at DESC);

-- =============================================================================
-- Enhance nhi_nodes with integration link
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'nhi_nodes' AND column_name = 'integration_id'
    ) THEN
        ALTER TABLE nhi_nodes ADD COLUMN integration_id VARCHAR(64) REFERENCES integrations(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_nhi_nodes_integration ON nhi_nodes(tenant_id, integration_id);

-- =============================================================================
-- Integration Connections (Extended Provider Credentials)
-- =============================================================================

CREATE TABLE IF NOT EXISTS integration_connections (
    connection_id TEXT PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN (
        'aws_iam', 'kubernetes', 'github', 'slack', 'azure_entra',
        'gcp_iam', 'okta', 'snowflake', 'databricks', 'gitlab',
        'ai_gateways', 'terraform_state'
    )),
    display_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN (
        'pending_authorization', 'connected', 'error', 'disconnected'
    )),
    credential_ref TEXT, -- e.g., "vault://secret/data/tenant-123/aws-iam-role"
    external_id TEXT,    -- For AWS role assumption
    oauth_state_nonce TEXT, -- For OAuth flows
    permission_profile_version INTEGER NOT NULL DEFAULT 1,
    last_tested_at TIMESTAMPTZ,
    last_successful_sync_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_provider_per_tenant UNIQUE (tenant_id, provider, display_name)
);

CREATE INDEX IF NOT EXISTS idx_connections_tenant ON integration_connections(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_connections_provider ON integration_connections(provider);
CREATE INDEX IF NOT EXISTS idx_connections_last_sync ON integration_connections(last_successful_sync_at) WHERE status = 'connected';

DROP TRIGGER IF EXISTS update_connections_updated_at ON integration_connections;
CREATE TRIGGER update_connections_updated_at BEFORE UPDATE ON integration_connections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Connector Sync Jobs
-- =============================================================================

CREATE TABLE IF NOT EXISTS connector_sync_jobs (
    job_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    connection_id TEXT NOT NULL REFERENCES integration_connections(connection_id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN (
        'queued', 'leased', 'authenticating', 'fetching',
        'normalizing', 'persisting', 'completed', 'partial_success',
        'retry_wait', 'failed', 'canceled'
    )),
    cursor JSONB, -- Incremental sync checkpoint
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    records_seen INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    records_skipped INTEGER DEFAULT 0,
    error_category TEXT,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_jobs_tenant ON connector_sync_jobs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_connection ON connector_sync_jobs(connection_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_status ON connector_sync_jobs(status, created_at) WHERE status IN ('queued', 'leased');

-- =============================================================================
-- Sync Job Cursors (Idempotent Incremental Sync)
-- =============================================================================

CREATE TABLE IF NOT EXISTS connector_sync_cursors (
    cursor_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    connection_id TEXT NOT NULL REFERENCES integration_connections(connection_id) ON DELETE CASCADE,
    cursor_data JSONB NOT NULL,
    last_checkpoint_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_cursor_per_connection UNIQUE (connection_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_cursors_connection ON connector_sync_cursors(connection_id);

-- =============================================================================
-- Normalized Inventory Entities & Relationships (Auxiliary Staging)
-- =============================================================================

CREATE TABLE IF NOT EXISTS inventory_entities (
    entity_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    connection_id TEXT NOT NULL REFERENCES integration_connections(connection_id) ON DELETE CASCADE,
    entity_uid TEXT NOT NULL,
    entity_kind TEXT NOT NULL,
    source_connector TEXT NOT NULL,
    display_name TEXT NOT NULL,
    fingerprint_sha256 TEXT NOT NULL,
    created_at_unix BIGINT,
    last_used_unix BIGINT,
    raw_permissions JSONB,
    metadata_tags JSONB,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_stale BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT unique_entity_per_tenant UNIQUE (tenant_id, entity_uid)
);

CREATE INDEX IF NOT EXISTS idx_inventory_tenant ON inventory_entities(tenant_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_connection ON inventory_entities(connection_id);
CREATE INDEX IF NOT EXISTS idx_inventory_kind ON inventory_entities(entity_kind);
CREATE INDEX IF NOT EXISTS idx_inventory_fingerprint ON inventory_entities(fingerprint_sha256);
CREATE INDEX IF NOT EXISTS idx_inventory_stale ON inventory_entities(tenant_id, is_stale) WHERE is_stale = TRUE;

CREATE TABLE IF NOT EXISTS inventory_relationships (
    relationship_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    source_uid TEXT NOT NULL,
    target_uid TEXT NOT NULL,
    relation_type TEXT NOT NULL,
    observed_via TEXT NOT NULL,
    call_count_24h BIGINT DEFAULT 0,
    first_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_relationship UNIQUE (tenant_id, source_uid, target_uid, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_relationships_tenant ON inventory_relationships(tenant_id);
CREATE INDEX IF NOT EXISTS idx_relationships_source ON inventory_relationships(source_uid);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON inventory_relationships(target_uid);
CREATE INDEX IF NOT EXISTS idx_relationships_type ON inventory_relationships(relation_type);

-- =============================================================================
-- Row-Level Security (RLS) Policies (Strict Fail-Closed)
-- =============================================================================

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations FORCE ROW LEVEL SECURITY;
ALTER TABLE sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_connections FORCE ROW LEVEL SECURITY;
ALTER TABLE connector_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_sync_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE connector_sync_cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_sync_cursors FORCE ROW LEVEL SECURITY;
ALTER TABLE inventory_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_entities FORCE ROW LEVEL SECURITY;
ALTER TABLE inventory_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_relationships FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_integrations ON integrations;
CREATE POLICY tenant_isolation_integrations ON integrations
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)
        OR tenant_id = current_setting('app.current_tenant_id', true)
        OR current_setting('app.current_tenant', true) = 'system_admin'
    );

DROP POLICY IF EXISTS tenant_isolation_sync_runs ON sync_runs;
CREATE POLICY tenant_isolation_sync_runs ON sync_runs
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)
        OR tenant_id = current_setting('app.current_tenant_id', true)
        OR current_setting('app.current_tenant', true) = 'system_admin'
    );

DROP POLICY IF EXISTS connection_isolation ON integration_connections;
CREATE POLICY connection_isolation ON integration_connections
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)
        OR tenant_id = current_setting('app.current_tenant_id', true)
        OR current_setting('app.current_tenant', true) = 'system_admin'
    );

DROP POLICY IF EXISTS sync_job_isolation ON connector_sync_jobs;
CREATE POLICY sync_job_isolation ON connector_sync_jobs
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)
        OR tenant_id = current_setting('app.current_tenant_id', true)
        OR current_setting('app.current_tenant', true) = 'system_admin'
    );

DROP POLICY IF EXISTS sync_cursor_isolation ON connector_sync_cursors;
CREATE POLICY sync_cursor_isolation ON connector_sync_cursors
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)
        OR tenant_id = current_setting('app.current_tenant_id', true)
        OR current_setting('app.current_tenant', true) = 'system_admin'
    );

DROP POLICY IF EXISTS inventory_isolation ON inventory_entities;
CREATE POLICY inventory_isolation ON inventory_entities
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)
        OR tenant_id = current_setting('app.current_tenant_id', true)
        OR current_setting('app.current_tenant', true) = 'system_admin'
    );

DROP POLICY IF EXISTS relationship_isolation ON inventory_relationships;
CREATE POLICY relationship_isolation ON inventory_relationships
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)
        OR tenant_id = current_setting('app.current_tenant_id', true)
        OR current_setting('app.current_tenant', true) = 'system_admin'
    );

-- =============================================================================
-- Helper Functions
-- =============================================================================

CREATE OR REPLACE FUNCTION mark_stale_inventory()
RETURNS INTEGER AS $$
DECLARE
    affected_count INTEGER;
BEGIN
    UPDATE nhi_nodes
    SET is_stale = TRUE
    WHERE updated_at < NOW() - INTERVAL '48 hours'
      AND is_stale = FALSE;
    
    GET DIAGNOSTICS affected_count = ROW_COUNT;
    RETURN affected_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_connection_health(conn_id TEXT)
RETURNS TABLE (
    status TEXT,
    last_sync_age_minutes INTEGER,
    recent_failures INTEGER,
    health TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.status,
        (EXTRACT(EPOCH FROM (NOW() - c.last_successful_sync_at)) / 60)::INTEGER AS last_sync_age_minutes,
        (SELECT COUNT(*)::INTEGER FROM connector_sync_jobs j
         WHERE j.connection_id = conn_id
           AND j.status = 'failed'
           AND j.created_at > NOW() - INTERVAL '1 hour') AS recent_failures,
        CASE
            WHEN c.status != 'connected' THEN 'unhealthy'
            WHEN c.last_successful_sync_at < NOW() - INTERVAL '24 hours' THEN 'stale'
            WHEN (SELECT COUNT(*) FROM connector_sync_jobs j
                  WHERE j.connection_id = conn_id
                    AND j.status = 'failed'
                    AND j.created_at > NOW() - INTERVAL '1 hour') > 3 THEN 'degraded'
            ELSE 'healthy'
        END AS health
    FROM integration_connections c
    WHERE c.connection_id = conn_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
