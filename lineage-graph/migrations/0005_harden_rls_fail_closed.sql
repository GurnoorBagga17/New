-- Axiom NHI — Migration 0005: Harden Row-Level Security (RLS) to Fail-Closed
-- Eliminates NULLIF bypass: an unset or empty app.current_tenant strictly denies row access.

DROP POLICY IF EXISTS tenant_isolation_nodes ON nhi_nodes;
CREATE POLICY tenant_isolation_nodes ON nhi_nodes
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)
        OR current_setting('app.current_tenant', true) = 'system_admin'
    );

DROP POLICY IF EXISTS tenant_isolation_edges ON nhi_edges;
CREATE POLICY tenant_isolation_edges ON nhi_edges
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)
        OR current_setting('app.current_tenant', true) = 'system_admin'
    );
