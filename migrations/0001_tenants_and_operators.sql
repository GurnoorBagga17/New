-- Copyright 2026 Axiom NHI — Licensed under Apache-2.0
-- Migration 0001: Tenants, Operators, and Sessions
-- Phase 1: Secure Identity and Tenant Foundation

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- Tenants
-- =============================================================================

CREATE TABLE tenants (
    tenant_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN (
        'requested', 'approved', 'provisioning', 'identity_pending',
        'onboarding', 'trial_active', 'subscription_active',
        'suspended', 'cancellation_pending', 'export_window', 'deleted'
    )),
    region TEXT NOT NULL DEFAULT 'us-east-1',
    data_retention_days INTEGER NOT NULL DEFAULT 30,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_tenants_status ON tenants(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tenants_created_at ON tenants(created_at);

-- =============================================================================
-- Operators (Tenant Users)
-- =============================================================================

CREATE TABLE operators (
    user_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN (
        'security-admin', 'soc-operator', 'platform-engineer', 'auditor', 'operator'
    )),
    password_hash TEXT NOT NULL, -- Format: scrypt$salt_hex$hash_hex
    webauthn_credential_id TEXT,
    mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ,
    CONSTRAINT unique_email_per_tenant UNIQUE (tenant_id, email)
);

CREATE INDEX idx_operators_tenant ON operators(tenant_id) WHERE is_active = TRUE;
CREATE INDEX idx_operators_email ON operators(email);

-- =============================================================================
-- Operator Sessions
-- =============================================================================

CREATE TABLE operator_sessions (
    session_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES operators(user_id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    csrf_token TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user ON operator_sessions(user_id) WHERE NOT revoked;
CREATE INDEX idx_sessions_tenant ON operator_sessions(tenant_id) WHERE NOT revoked;
CREATE INDEX idx_sessions_expires_at ON operator_sessions(expires_at) WHERE NOT revoked;

-- =============================================================================
-- Row-Level Security (RLS) Policies
-- =============================================================================

-- Enable RLS on all tenant-scoped tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE operator_sessions ENABLE ROW LEVEL SECURITY;

-- Tenant isolation: operators can only see their own tenant
CREATE POLICY tenant_isolation_operators ON operators
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::TEXT);

-- Session isolation: can only access own sessions
CREATE POLICY session_isolation ON operator_sessions
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::TEXT);

-- Tenant read policy: operators can read their own tenant
CREATE POLICY tenant_read ON tenants
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::TEXT);

-- =============================================================================
-- Helper Functions
-- =============================================================================

-- Set tenant context for connection (MUST be called on every query)
CREATE OR REPLACE FUNCTION set_tenant_context(tid TEXT)
RETURNS VOID AS $$
BEGIN
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

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_operators_updated_at BEFORE UPDATE ON operators
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Audit Trail for Security-Critical Operations
-- =============================================================================

CREATE TABLE operator_audit_events (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    operator_id TEXT REFERENCES operators(user_id),
    event_type TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    metadata JSONB,
    ip_address INET,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_operator_audit_tenant ON operator_audit_events(tenant_id, timestamp DESC);
CREATE INDEX idx_operator_audit_type ON operator_audit_events(event_type);

-- Enable RLS on audit events
ALTER TABLE operator_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_isolation ON operator_audit_events
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::TEXT);

-- =============================================================================
-- Comments for Documentation
-- =============================================================================

COMMENT ON TABLE tenants IS 'Multi-tenant isolation boundary. Each tenant is a separate customer organization.';
COMMENT ON TABLE operators IS 'Human users with access to tenant dashboards and APIs.';
COMMENT ON TABLE operator_sessions IS 'Server-side session store with CSRF protection and revocation support.';
COMMENT ON FUNCTION set_tenant_context IS 'MUST be called at the start of every query to enforce RLS tenant isolation.';

