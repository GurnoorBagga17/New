-- Copyright 2026 Axiom NHI — Licensed under Apache-2.0
-- Migration 0001: Tenants, Operators, and Sessions
-- Phase 1: Secure Identity and Tenant Foundation

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- Tenants
-- =============================================================================

CREATE TABLE IF NOT EXISTS tenants (
    tenant_id VARCHAR(64) PRIMARY KEY,
    display_name TEXT NOT NULL,
    organization_name TEXT NOT NULL,
    tenant_salt BYTEA NOT NULL, -- 256-bit isolated salt for HMAC-SHA256 fingerprinting
    status TEXT NOT NULL DEFAULT 'subscription_active' CHECK (status IN (
        'requested', 'approved', 'provisioning', 'identity_pending',
        'onboarding', 'trial_active', 'subscription_active',
        'suspended', 'cancellation_pending', 'export_window', 'deleted'
    )),
    region TEXT NOT NULL DEFAULT 'us-east-1',
    data_retention_days INTEGER NOT NULL DEFAULT 30,
    sso_issuer_url TEXT,
    sso_client_id TEXT,
    enforce_sso BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tenants_created_at ON tenants(created_at);

-- =============================================================================
-- Operators (Tenant Users)
-- =============================================================================

CREATE TABLE IF NOT EXISTS operators (
    user_id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN (
        'security-admin', 'soc-operator', 'platform-engineer', 'auditor', 'operator'
    )),
    password_hash TEXT, -- Format: scrypt$salt_hex$hash_hex or Argon2id (nullable if SSO-only)
    webauthn_credential_id TEXT, -- Required for Kill-Switch & Policy Bundle activation
    mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_operators_tenant ON operators(tenant_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_operators_email ON operators(email);

-- =============================================================================
-- Operator Sessions
-- =============================================================================

CREATE TABLE IF NOT EXISTS operator_sessions (
    session_id VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES operators(user_id) ON DELETE CASCADE,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    csrf_token VARCHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operator_sessions_lookup ON operator_sessions(session_id, revoked, expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON operator_sessions(user_id) WHERE NOT revoked;
CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON operator_sessions(tenant_id) WHERE NOT revoked;
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON operator_sessions(expires_at) WHERE NOT revoked;

-- =============================================================================
-- Operator Audit Events
-- =============================================================================

CREATE TABLE IF NOT EXISTS operator_audit_events (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    operator_id VARCHAR(64) REFERENCES operators(user_id),
    event_type TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    metadata JSONB,
    ip_address TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operator_audit_tenant ON operator_audit_events(tenant_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_operator_audit_type ON operator_audit_events(event_type);

-- =============================================================================
-- Helper Functions & Triggers
-- =============================================================================

-- Set tenant context for connection (supports both app.current_tenant and app.current_tenant_id)
CREATE OR REPLACE FUNCTION set_tenant_context(tid TEXT)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_tenant', tid, TRUE);
    PERFORM set_config('app.current_tenant_id', tid, TRUE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_tenants_updated_at ON tenants;
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_operators_updated_at ON operators;
CREATE TRIGGER update_operators_updated_at BEFORE UPDATE ON operators
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Row-Level Security (RLS) Policies (Strict Fail-Closed)
-- =============================================================================

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE operators FORCE ROW LEVEL SECURITY;
ALTER TABLE operator_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE operator_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE operator_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE operator_audit_events FORCE ROW LEVEL SECURITY;

-- Tenant Isolation Policies
DROP POLICY IF EXISTS tenant_read ON tenants;
CREATE POLICY tenant_read ON tenants
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)
        OR tenant_id = current_setting('app.current_tenant_id', true)
        OR current_setting('app.current_tenant', true) = 'system_admin'
    );

DROP POLICY IF EXISTS tenant_isolation_operators ON operators;
CREATE POLICY tenant_isolation_operators ON operators
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)
        OR tenant_id = current_setting('app.current_tenant_id', true)
        OR current_setting('app.current_tenant', true) = 'system_admin'
    );

DROP POLICY IF EXISTS tenant_isolation_sessions ON operator_sessions;
CREATE POLICY tenant_isolation_sessions ON operator_sessions
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)
        OR tenant_id = current_setting('app.current_tenant_id', true)
        OR current_setting('app.current_tenant', true) = 'system_admin'
    );

DROP POLICY IF EXISTS audit_isolation ON operator_audit_events;
CREATE POLICY audit_isolation ON operator_audit_events
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)
        OR tenant_id = current_setting('app.current_tenant_id', true)
        OR current_setting('app.current_tenant', true) = 'system_admin'
    );

-- Seed default tenant if not exists
INSERT INTO tenants (tenant_id, display_name, organization_name, tenant_salt)
VALUES ('org_default', 'Default Organization', 'Default Organization', decode('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f', 'hex'))
ON CONFLICT (tenant_id) DO NOTHING;
