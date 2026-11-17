-- Axiom NHI Phase 1 — Migration 0003: Operator Auth, Multi-Tenancy & SCIM 2.0 Governance
-- Enforces PostgreSQL-backed sessions, tenant isolation, operator roles, and WebAuthn credentials.

CREATE TABLE IF NOT EXISTS tenants (
    tenant_id VARCHAR(64) PRIMARY KEY,
    organization_name TEXT NOT NULL,
    tenant_salt BYTEA NOT NULL, -- 256-bit isolated salt for HMAC-SHA256 fingerprinting
    sso_issuer_url TEXT,
    sso_client_id TEXT,
    enforce_sso BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operators (
    user_id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('security-admin', 'soc-operator', 'platform-engineer', 'auditor')),
    password_hash TEXT, -- Argon2id hash (nullable if SSO-only)
    webauthn_credential_id TEXT, -- Required for Kill-Switch & Policy Bundle activation
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operator_sessions (
    session_id VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES operators(user_id) ON DELETE CASCADE,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    csrf_token VARCHAR(64) NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operator_sessions_lookup ON operator_sessions(session_id, revoked, expires_at);
CREATE INDEX IF NOT EXISTS idx_operators_tenant ON operators(tenant_id);
CREATE INDEX IF NOT EXISTS idx_operators_email ON operators(email);

ALTER TABLE operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE operators FORCE ROW LEVEL SECURITY;
ALTER TABLE operator_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE operator_sessions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_operators ON operators;
CREATE POLICY tenant_isolation_operators ON operators
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)
        OR NULLIF(current_setting('app.current_tenant', true), '') IS NULL
        OR current_setting('app.current_tenant', true) = 'system_admin'
    );

DROP POLICY IF EXISTS tenant_isolation_sessions ON operator_sessions;
CREATE POLICY tenant_isolation_sessions ON operator_sessions
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)
        OR NULLIF(current_setting('app.current_tenant', true), '') IS NULL
        OR current_setting('app.current_tenant', true) = 'system_admin'
    );

-- Seed default tenant if not exists
INSERT INTO tenants (tenant_id, organization_name, tenant_salt)
VALUES ('org_default', 'Default Organization', decode('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f', 'hex'))
ON CONFLICT (tenant_id) DO NOTHING;
