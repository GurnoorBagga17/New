-- Copyright 2026 Axiom NHI - Licensed under Apache-2.0
-- Migration 0004: Hybrid SaaS control plane - agents, enrollment, policy, audit
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

CREATE TABLE saas_enrollment_tokens (
    token_hash TEXT PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    created_by TEXT NOT NULL,
    max_agents INTEGER NOT NULL DEFAULT 3 CHECK (max_agents > 0),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    agent_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT enrollment_consumption_is_atomic
        CHECK ((consumed_at IS NULL) = (agent_id IS NULL))
);

CREATE INDEX idx_saas_enrollment_tenant ON saas_enrollment_tokens(tenant_id, created_at DESC);
CREATE INDEX idx_saas_enrollment_pending
    ON saas_enrollment_tokens(expires_at)
    WHERE consumed_at IS NULL;

COMMENT ON TABLE saas_enrollment_tokens IS
    'One-time bootstrap tokens. The plaintext token is returned once and never stored.';

-- =============================================================================
-- Agents (one row per deployed supervisor)
-- =============================================================================

CREATE TABLE saas_agents (
    agent_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    environment TEXT NOT NULL DEFAULT 'production',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'online', 'offline', 'revoked'
    )),
    agent_version TEXT,
    labels JSONB NOT NULL DEFAULT '{}'::JSONB,
    -- MVP: per-agent bearer secret. Phase 2 replaces this with a client
    -- certificate issued by the private CA; the hash column stays as a
    -- fallback for older agents during rotation.
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

CREATE INDEX idx_saas_agents_tenant_status ON saas_agents(tenant_id, status);
CREATE INDEX idx_saas_agents_stale ON saas_agents(last_seen_at)
    WHERE status = 'online';
CREATE INDEX idx_saas_agents_cert_serial ON saas_agents(cert_serial)
    WHERE cert_serial IS NOT NULL;

COMMENT ON TABLE saas_agents IS
    'Registered customer-side agents. Status is derived from channel presence, not from a customer-supplied field.';

-- =============================================================================
-- Signed policy bundles (append-only version history)
-- =============================================================================

CREATE TABLE saas_policy_bundles (
    bundle_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
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

CREATE INDEX idx_saas_policy_latest ON saas_policy_bundles(tenant_id, version DESC);
CREATE INDEX idx_saas_policy_active
    ON saas_policy_bundles(tenant_id)
    WHERE withdrawn_at IS NULL;

COMMENT ON COLUMN saas_policy_bundles.signature IS
    'Hex Ed25519 signature over the canonical payload in axiom-agent-protocol::policy_signing_payload.';

-- =============================================================================
-- Heartbeats (latest state per agent)
-- =============================================================================

CREATE TABLE saas_agent_heartbeats (
    agent_id UUID PRIMARY KEY REFERENCES saas_agents(agent_id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    seq BIGINT NOT NULL CHECK (seq > 0),
    sent_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    policy_version BIGINT,
    decisions_total BIGINT,
    denies_total BIGINT
);

CREATE INDEX idx_saas_heartbeats_tenant ON saas_agent_heartbeats(tenant_id, received_at DESC);

-- =============================================================================
-- Metadata-only audit events
-- =============================================================================

CREATE TABLE saas_audit_events (
    event_id UUID PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES saas_agents(agent_id) ON DELETE CASCADE,
    occurred_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decision TEXT NOT NULL,
    tool TEXT,
    latency_ms NUMERIC(10, 3) CHECK (latency_ms IS NULL OR latency_ms >= 0),
    payload_hash TEXT,
    prev_hash TEXT,
    entry_hash TEXT
);

CREATE INDEX idx_saas_audit_tenant_time ON saas_audit_events(tenant_id, occurred_at DESC);
CREATE INDEX idx_saas_audit_agent_time ON saas_audit_events(agent_id, occurred_at DESC);
CREATE INDEX idx_saas_audit_decision ON saas_audit_events(tenant_id, decision, occurred_at DESC);

COMMENT ON TABLE saas_audit_events IS
    'Append-only metadata audit. `event_id` is the dedupe key for at-least-once agent delivery.';

-- =============================================================================
-- Kill switch / emergency control history
-- =============================================================================

CREATE TABLE saas_kill_switch_events (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    scope TEXT NOT NULL,
    reason TEXT NOT NULL,
    issued_by TEXT NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cleared_at TIMESTAMPTZ,
    cleared_by TEXT
);

CREATE INDEX idx_saas_kill_switch_active ON saas_kill_switch_events(issued_at DESC)
    WHERE cleared_at IS NULL;

-- =============================================================================
-- Row-Level Security
-- =============================================================================

ALTER TABLE saas_enrollment_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_policy_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_agent_heartbeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_kill_switch_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY enrollment_tenant_isolation ON saas_enrollment_tokens
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::TEXT);

CREATE POLICY agent_tenant_isolation ON saas_agents
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::TEXT);

CREATE POLICY policy_tenant_isolation ON saas_policy_bundles
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::TEXT);

CREATE POLICY heartbeat_tenant_isolation ON saas_agent_heartbeats
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::TEXT);

CREATE POLICY audit_tenant_isolation ON saas_audit_events
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::TEXT);

-- Global kills (tenant_id IS NULL) are readable by every tenant's operator so
-- the console can explain why calls are being denied.
CREATE POLICY kill_switch_tenant_isolation ON saas_kill_switch_events
    USING (
        tenant_id IS NULL
        OR tenant_id = current_setting('app.current_tenant_id', TRUE)::TEXT
    );

-- =============================================================================
-- Triggers
-- =============================================================================

CREATE TRIGGER update_saas_agents_updated_at BEFORE UPDATE ON saas_agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Helper: whether a tenant may enroll another agent
-- =============================================================================

CREATE OR REPLACE FUNCTION tenant_can_enroll_agent(tid TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    active_agents INTEGER;
BEGIN
    IF NOT tenant_has_feature(tid, 'runtime.enforcement') THEN
        RETURN FALSE;
    END IF;

    SELECT COUNT(*) INTO active_agents
    FROM saas_agents
    WHERE tenant_id = tid AND status <> 'revoked';

    RETURN tenant_within_limit(tid, 'agents', active_agents);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION tenant_can_enroll_agent(TEXT) IS
    'Entitlement gate for POST /v1/agents/enroll and enrollment-token minting.';
