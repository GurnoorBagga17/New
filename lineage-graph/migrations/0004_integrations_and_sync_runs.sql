-- Migration: 0004_integrations_and_sync_runs.sql
-- Subsystem: Connectors, Integrations & Tenant-Safe Node Storage
-- Author: Axiom Core Engineering

-- 1. Integrations Table: stores configured cloud and SaaS discovery providers
CREATE TABLE IF NOT EXISTS integrations (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
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

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_integrations ON integrations
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant', true))
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true));

-- 2. Sync Runs Table: records execution history and audit metrics for every discovery scan
CREATE TABLE IF NOT EXISTS sync_runs (
    id VARCHAR(64) PRIMARY KEY,
    integration_id VARCHAR(64) NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    status VARCHAR(32) NOT NULL DEFAULT 'running',
    nodes_seen INT NOT NULL DEFAULT 0,
    nodes_new INT NOT NULL DEFAULT 0,
    nodes_stale INT NOT NULL DEFAULT 0,
    error TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_tenant_integration ON sync_runs(tenant_id, integration_id, started_at DESC);

ALTER TABLE sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_sync_runs ON sync_runs
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant', true))
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true));

-- 3. Enhance nhi_nodes with integration link, staleness tracking, and tenant-safe compound uniqueness
ALTER TABLE nhi_nodes ADD COLUMN IF NOT EXISTS integration_id VARCHAR(64) REFERENCES integrations(id) ON DELETE SET NULL;
ALTER TABLE nhi_nodes ADD COLUMN IF NOT EXISTS is_stale BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_nhi_nodes_stale ON nhi_nodes(tenant_id, is_stale);
CREATE INDEX IF NOT EXISTS idx_nhi_nodes_integration ON nhi_nodes(tenant_id, integration_id);

-- Enforce compound uniqueness (tenant_id, entity_uid) to prevent cross-tenant collision
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_nhi_nodes_tenant_entity'
    ) THEN
        ALTER TABLE nhi_nodes ADD CONSTRAINT uq_nhi_nodes_tenant_entity UNIQUE (tenant_id, entity_uid);
    END IF;
END $$;
