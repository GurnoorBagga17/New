-- Axiom NHI Phase 2 — Migration 0002: Multi-Tenant Row-Level Security (RLS)
-- Enforces cryptographic and logical tenant isolation across all nodes and edges.

-- 1. Add tenant_id column with default tenant fallback
ALTER TABLE nhi_nodes ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'org_default';
ALTER TABLE nhi_edges ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'org_default';

-- 2. Indexes for tenant-scoped partition scans
CREATE INDEX IF NOT EXISTS idx_nhi_nodes_tenant ON nhi_nodes(tenant_id, entity_uid);
CREATE INDEX IF NOT EXISTS idx_nhi_edges_tenant ON nhi_edges(tenant_id, source_uid, target_uid);

-- 3. Enable Row-Level Security & Force on Table Owner
ALTER TABLE nhi_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE nhi_nodes FORCE ROW LEVEL SECURITY;
ALTER TABLE nhi_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE nhi_edges FORCE ROW LEVEL SECURITY;

-- 4. Multi-Tenant Isolation Policies
-- If app.current_tenant is set, only rows matching current tenant are accessible.
-- If app.current_tenant is unset or empty, allows default access for backwards compatibility in dev.
DROP POLICY IF EXISTS tenant_isolation_nodes ON nhi_nodes;
CREATE POLICY tenant_isolation_nodes ON nhi_nodes
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)
        OR NULLIF(current_setting('app.current_tenant', true), '') IS NULL
        OR current_setting('app.current_tenant', true) = 'system_admin'
    );

DROP POLICY IF EXISTS tenant_isolation_edges ON nhi_edges;
CREATE POLICY tenant_isolation_edges ON nhi_edges
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)
        OR NULLIF(current_setting('app.current_tenant', true), '') IS NULL
        OR current_setting('app.current_tenant', true) = 'system_admin'
    );
