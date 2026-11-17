-- Copyright 2026 Axiom NHI — Licensed under Apache-2.0
-- Migration 0003: Integrations, Connectors, and Discovery Jobs
-- Phase 3: Real Integrations with OAuth/Role Setup

-- =============================================================================
-- Integration Connections
-- =============================================================================

CREATE TABLE integration_connections (
    connection_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN (
        'aws_iam', 'kubernetes', 'github', 'slack', 'azure_entra',
        'gcp_iam', 'okta', 'snowflake', 'databricks', 'gitlab',
        'ai_gateways', 'terraform_state'
    )),
    display_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN (
        'pending_authorization', 'connected', 'error', 'disconnected'
    )),
    -- Credentials stored as encrypted references, NOT plaintext
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

CREATE INDEX idx_connections_tenant ON integration_connections(tenant_id, status);
CREATE INDEX idx_connections_provider ON integration_connections(provider);
CREATE INDEX idx_connections_last_sync ON integration_connections(last_successful_sync_at) WHERE status = 'connected';

CREATE TRIGGER update_connections_updated_at BEFORE UPDATE ON integration_connections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS on integration connections
ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY connection_isolation ON integration_connections
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::TEXT);

-- =============================================================================
-- Connector Sync Jobs
-- =============================================================================

CREATE TABLE connector_sync_jobs (
    job_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
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

CREATE INDEX idx_sync_jobs_tenant ON connector_sync_jobs(tenant_id, created_at DESC);
CREATE INDEX idx_sync_jobs_connection ON connector_sync_jobs(connection_id, created_at DESC);
CREATE INDEX idx_sync_jobs_status ON connector_sync_jobs(status, created_at) WHERE status IN ('queued', 'leased');

-- Enable RLS on sync jobs
ALTER TABLE connector_sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY sync_job_isolation ON connector_sync_jobs
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::TEXT);

-- =============================================================================
-- Sync Job Cursors (Idempotent Incremental Sync)
-- =============================================================================

CREATE TABLE connector_sync_cursors (
    cursor_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    connection_id TEXT NOT NULL REFERENCES integration_connections(connection_id) ON DELETE CASCADE,
    cursor_data JSONB NOT NULL,
    last_checkpoint_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_cursor_per_connection UNIQUE (connection_id)
);

CREATE INDEX idx_sync_cursors_connection ON connector_sync_cursors(connection_id);

-- Enable RLS on sync cursors
ALTER TABLE connector_sync_cursors ENABLE ROW LEVEL SECURITY;

CREATE POLICY sync_cursor_isolation ON connector_sync_cursors
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::TEXT);

-- =============================================================================
-- Discovered Inventory (Normalized Identity Entities)
-- =============================================================================

CREATE TABLE inventory_entities (
    entity_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    connection_id TEXT NOT NULL REFERENCES integration_connections(connection_id) ON DELETE CASCADE,
    entity_uid TEXT NOT NULL, -- e.g., "aws:iam::123456789012:role/AdminRole"
    entity_kind TEXT NOT NULL, -- e.g., "aws_iam_role", "k8s_service_account"
    source_connector TEXT NOT NULL,
    display_name TEXT NOT NULL,
    fingerprint_sha256 TEXT NOT NULL, -- HMAC-SHA256 with tenant salt
    created_at_unix BIGINT,
    last_used_unix BIGINT,
    raw_permissions JSONB, -- Array of permission strings
    metadata_tags JSONB,   -- Provider-specific metadata
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_stale BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT unique_entity_per_tenant UNIQUE (tenant_id, entity_uid)
);

CREATE INDEX idx_inventory_tenant ON inventory_entities(tenant_id, last_seen_at DESC);
CREATE INDEX idx_inventory_connection ON inventory_entities(connection_id);
CREATE INDEX idx_inventory_kind ON inventory_entities(entity_kind);
CREATE INDEX idx_inventory_fingerprint ON inventory_entities(fingerprint_sha256);
CREATE INDEX idx_inventory_stale ON inventory_entities(tenant_id, is_stale) WHERE is_stale = TRUE;

-- Enable RLS on inventory
ALTER TABLE inventory_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY inventory_isolation ON inventory_entities
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::TEXT);

-- =============================================================================
-- Inventory Relationships (Lineage Graph Edges)
-- =============================================================================

CREATE TABLE inventory_relationships (
    relationship_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    source_uid TEXT NOT NULL,
    target_uid TEXT NOT NULL,
    relation_type TEXT NOT NULL, -- e.g., "OWNS", "USES", "GRANTS", "DELEGATES"
    observed_via TEXT NOT NULL,  -- Provenance: how we discovered this relationship
    call_count_24h BIGINT DEFAULT 0,
    first_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_relationship UNIQUE (tenant_id, source_uid, target_uid, relation_type)
);

CREATE INDEX idx_relationships_tenant ON inventory_relationships(tenant_id);
CREATE INDEX idx_relationships_source ON inventory_relationships(source_uid);
CREATE INDEX idx_relationships_target ON inventory_relationships(target_uid);
CREATE INDEX idx_relationships_type ON inventory_relationships(relation_type);

-- Enable RLS on relationships
ALTER TABLE inventory_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY relationship_isolation ON inventory_relationships
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::TEXT);

-- =============================================================================
-- Integration Helper Functions
-- =============================================================================

-- Mark stale inventory when sync is overdue
CREATE OR REPLACE FUNCTION mark_stale_inventory()
RETURNS INTEGER AS $$
DECLARE
    affected_count INTEGER;
BEGIN
    -- Mark entities as stale if not verified in last 48 hours
    UPDATE inventory_entities
    SET is_stale = TRUE
    WHERE last_verified_at < NOW() - INTERVAL '48 hours'
      AND is_stale = FALSE;
    
    GET DIAGNOSTICS affected_count = ROW_COUNT;
    RETURN affected_count;
END;
$$ LANGUAGE plpgsql;

-- Get connection health status
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
        EXTRACT(EPOCH FROM (NOW() - c.last_successful_sync_at)) / 60 AS last_sync_age_minutes,
        (SELECT COUNT(*) FROM connector_sync_jobs j
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

-- =============================================================================
-- Scheduled Job: Mark Stale Inventory
-- =============================================================================

-- This would typically be called by a cron job or scheduled task
CREATE OR REPLACE FUNCTION scheduled_mark_stale_inventory()
RETURNS VOID AS $$
BEGIN
    PERFORM mark_stale_inventory();
    
    -- Log the maintenance operation
    INSERT INTO operator_audit_events (
        tenant_id, operator_id, event_type, metadata
    )
    SELECT DISTINCT tenant_id, NULL, 'inventory.stale_marked', jsonb_build_object('timestamp', NOW())
    FROM inventory_entities
    WHERE is_stale = TRUE;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE integration_connections IS 'Provider connections with OAuth/role credentials (encrypted references only).';
COMMENT ON TABLE connector_sync_jobs IS 'Discovery job lifecycle with cursor support for incremental sync.';
COMMENT ON TABLE inventory_entities IS 'Normalized identity inventory with provenance and freshness tracking.';
COMMENT ON TABLE inventory_relationships IS 'Lineage graph edges for blast-radius simulation.';
COMMENT ON FUNCTION mark_stale_inventory IS 'Background job to mark inventory not verified in 48 hours as stale.';

