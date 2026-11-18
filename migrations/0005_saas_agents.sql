-- Copyright 2026 Axiom NHI - Licensed under Apache-2.0
-- Migration 0005: Hybrid SaaS control plane - agents, enrollment, policy, audit
--
-- Scope: the vendor-hosted control plane stores tenancy, agent identity,
-- signed policy versions and metadata-only audit. The customer-side agent
-- keeps enforcement local; nothing in this schema requires an inbound
-- connection to the customer network.
--
-- Design notes:
-- * Secrets and enrollment tokens are stored ONLY as SHA-256 hashes.
-- * Policy bundles are content-addressed and Ed25519 signed; the agent refuses
--   unsigned or hash-mismatched bundles.
-- * Audit rows are metadata only (decision, tool name, latency, payload hash).
--   Raw prompts, arguments and credentials must never be inserted here.
-- * `saas_audit_events` is a hot, append-only table. Production installs
--   should convert it to monthly range partitions on `occurred_at` once volume
--   justifies it; the columns and primary key are already compatible.

-- =============================================================================
-- Enrollment tokens (single use, short lived, tenant bound)
-- =============================================================================

CREATE TABLE IF NOT EXISTS saas_enrollment_tokens (
    token_hash TEXT PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    created_by TEXT NOT NULL,
    max_agents INTEGER NOT NULL DEFAULT 3 CHECK (max_agents > 0),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    agent_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT enrollment_consumption_is_atomic
        CHECK ((consumed_at IS NULL) = (agent_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_saas_enrollment_tenant ON saas_enrollment_tokens(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saas_enrollment_pending
    ON saas_enrollment_tokens(expires_at)
    WHERE consumed_at IS NULL;

COMMENT ON TABLE saas_enrollment_tokens IS
    'One-time bootstrap tokens. The plaintext token is returned once and never stored.';

-- =============================================================================
-- Agents (one row per deployed supervisor)
-- =============================================================================

CREATE TABLE IF NOT EXISTS saas_agents (
    agent_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    environment TEXT NOT NULL DEFAULT 'production',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'online', 'offline', 'revoked'
    )),
    agent_version TEXT,
    labels JSONB NOT NULL DEFAULT '{}'::JSONB,
    secret_hash TEXT NOT NULL CHECK (secret_hash ~ '^[0-9a-f]{64}$'),
    cert_fingerprint TEXT,
    cert_serial TEXT,
    cert_expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    revocation_reason TEXT,
    last_seen_at TIMESTAMPTZ,
    policy_version BIGINT NOT NULL DEFAULT 0,
    decisions_total BIGINT NOT NULL DEFAULT 0,
    denies_total BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_agent_name_per_tenant UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_saas_agents_tenant_status ON saas_agents(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_saas_agents_stale ON saas_agents(last_seen_at)
    WHERE status = 'online';
CREATE INDEX IF NOT EXISTS idx_saas_agents_cert_serial ON saas_agents(cert_serial)
    WHERE cert_serial IS NOT NULL;

DROP TRIGGER IF EXISTS update_saas_agents_updated_at ON saas_agents;
CREATE TRIGGER update_saas_agents_updated_at BEFORE UPDATE ON saas_agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE saas_agents IS
    'Registered customer-side agents. Status is derived from channel presence, not from a customer-supplied field.';

-- =============================================================================
-- Signed policy bundles (append-only version history)
-- =============================================================================

CREATE TABLE IF NOT EXISTS saas_policy_bundles (
    bundle_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    version BIGINT NOT NULL CHECK (version > 0),
    cedar_source TEXT NOT NULL,
    sha256 TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    signature TEXT NOT NULL CHECK (signature ~ '^[0-9a-f]{128}$'),
    signing_key_id TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    withdrawn_at TIMESTAMPTZ,
    CONSTRAINT unique_policy_version_per_tenant UNIQUE (tenant_id, version)
);

CREATE INDEX IF NOT EXISTS idx_saas_bundles_tenant_version
    ON saas_policy_bundles(tenant_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_saas_bundles_sha256
    ON saas_policy_bundles(sha256);

COMMENT ON TABLE saas_policy_bundles IS
    'Ed25519-signed Cedar policy revisions. Agents verify sha256 + signature against control plane public key before activating.';

-- =============================================================================
-- Ingested audit events (metadata only, customer network private data excluded)
-- =============================================================================

CREATE TABLE IF NOT EXISTS saas_audit_events (
    event_id UUID DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES saas_agents(agent_id) ON DELETE CASCADE,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decision TEXT NOT NULL CHECK (decision IN ('permit', 'deny', 'challenge')),
    tool_name TEXT NOT NULL,
    duration_micros INTEGER NOT NULL CHECK (duration_micros >= 0),
    payload_sha256 TEXT NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
    policy_version BIGINT NOT NULL,
    rule_id TEXT,
    PRIMARY KEY (event_id, occurred_at)
);

CREATE INDEX IF NOT EXISTS idx_saas_audit_tenant_time
    ON saas_audit_events(tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_saas_audit_agent_time
    ON saas_audit_events(agent_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_saas_audit_decision
    ON saas_audit_events(tenant_id, decision, occurred_at DESC);

COMMENT ON TABLE saas_audit_events IS
    'Metadata-only audit stream. Payloads are SHA-256 bound only; raw arguments stay in customer VPC ring buffer.';

-- =============================================================================
-- Row Level Security (RLS) Policies (Strict Fail-Closed)
-- =============================================================================

ALTER TABLE saas_enrollment_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_enrollment_tokens FORCE ROW LEVEL SECURITY;
ALTER TABLE saas_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_agents FORCE ROW LEVEL SECURITY;
ALTER TABLE saas_policy_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_policy_bundles FORCE ROW LEVEL SECURITY;
ALTER TABLE saas_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_audit_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saas_enrollment_tokens_tenant_isolation ON saas_enrollment_tokens;
CREATE POLICY saas_enrollment_tokens_tenant_isolation ON saas_enrollment_tokens
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)
        OR tenant_id = current_setting('app.current_tenant_id', true)
        OR current_setting('app.current_tenant', true) = 'system_admin'
    );

DROP POLICY IF EXISTS saas_agents_tenant_isolation ON saas_agents;
CREATE POLICY saas_agents_tenant_isolation ON saas_agents
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)
        OR tenant_id = current_setting('app.current_tenant_id', true)
        OR current_setting('app.current_tenant', true) = 'system_admin'
    );

DROP POLICY IF EXISTS saas_policy_bundles_tenant_isolation ON saas_policy_bundles;
CREATE POLICY saas_policy_bundles_tenant_isolation ON saas_policy_bundles
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)
        OR tenant_id = current_setting('app.current_tenant_id', true)
        OR current_setting('app.current_tenant', true) = 'system_admin'
    );

DROP POLICY IF EXISTS saas_audit_events_tenant_isolation ON saas_audit_events;
CREATE POLICY saas_audit_events_tenant_isolation ON saas_audit_events
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)
        OR tenant_id = current_setting('app.current_tenant_id', true)
        OR current_setting('app.current_tenant', true) = 'system_admin'
    );
