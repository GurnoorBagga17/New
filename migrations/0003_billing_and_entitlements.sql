-- Copyright 2026 Axiom NHI — Licensed under Apache-2.0
-- Migration 0003: Billing, Subscriptions, and Entitlements
-- Phase 2: Billing and Provisioning Foundation

-- =============================================================================
-- Subscriptions
-- =============================================================================

CREATE TABLE IF NOT EXISTS subscriptions (
    tenant_id VARCHAR(64) PRIMARY KEY REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    stripe_customer_id TEXT NOT NULL,
    stripe_subscription_id TEXT UNIQUE,
    status TEXT NOT NULL CHECK (status IN (
        'active', 'past_due', 'canceled', 'incomplete', 'trialing'
    )),
    plan_id TEXT NOT NULL CHECK (plan_id IN ('eval', 'team', 'enterprise')),
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_period_end ON subscriptions(current_period_end) WHERE status = 'active';

DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Billing Webhook Events (Idempotency)
-- =============================================================================

CREATE TABLE IF NOT EXISTS billing_webhook_events (
    event_id TEXT PRIMARY KEY, -- Stripe event ID
    event_type TEXT NOT NULL,
    raw_payload JSONB NOT NULL,
    processed BOOLEAN NOT NULL DEFAULT FALSE,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON billing_webhook_events(processed, received_at);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON billing_webhook_events(event_type);

COMMENT ON TABLE billing_webhook_events IS 'Idempotent webhook event storage. Unique constraint on event_id prevents duplicate processing.';

-- =============================================================================
-- Tenant Entitlements (Server-Authoritative Feature Flags)
-- =============================================================================

CREATE TABLE IF NOT EXISTS tenant_entitlements (
    entitlement_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    plan_id TEXT NOT NULL,
    status TEXT NOT NULL,
    features JSONB NOT NULL, -- e.g., {"connector.aws": true, "runtime.enforcement": true}
    limits JSONB NOT NULL,   -- e.g., {"operators": 10, "connections": 5}
    version INTEGER NOT NULL DEFAULT 1,
    effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    superseded_at TIMESTAMPTZ,
    CONSTRAINT unique_tenant_active_entitlement UNIQUE (tenant_id) WHERE superseded_at IS NULL
);

CREATE INDEX IF NOT EXISTS idx_entitlements_tenant_active ON tenant_entitlements(tenant_id) WHERE superseded_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_entitlements_version ON tenant_entitlements(tenant_id, version DESC);

-- Enable RLS on entitlements and subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_entitlements FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscription_isolation ON subscriptions;
CREATE POLICY subscription_isolation ON subscriptions
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)
        OR tenant_id = current_setting('app.current_tenant_id', true)
        OR current_setting('app.current_tenant', true) = 'system_admin'
    );

DROP POLICY IF EXISTS entitlement_isolation ON tenant_entitlements;
CREATE POLICY entitlement_isolation ON tenant_entitlements
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)
        OR tenant_id = current_setting('app.current_tenant_id', true)
        OR current_setting('app.current_tenant', true) = 'system_admin'
    );

-- =============================================================================
-- Entitlement Helper Functions
-- =============================================================================

-- Get current active entitlement for a tenant
CREATE OR REPLACE FUNCTION get_tenant_entitlement(tid TEXT)
RETURNS TABLE (
    plan_id TEXT,
    status TEXT,
    features JSONB,
    limits JSONB,
    version INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT e.plan_id, e.status, e.features, e.limits, e.version
    FROM tenant_entitlements e
    WHERE e.tenant_id = tid AND e.superseded_at IS NULL
    ORDER BY e.version DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if a tenant has a specific feature enabled
CREATE OR REPLACE FUNCTION tenant_has_feature(tid TEXT, feature_key TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    entitlement RECORD;
BEGIN
    SELECT * INTO entitlement FROM get_tenant_entitlement(tid);
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    RETURN COALESCE((entitlement.features->>feature_key)::BOOLEAN, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if a tenant is within usage limits
CREATE OR REPLACE FUNCTION tenant_within_limit(tid TEXT, limit_key TEXT, current_usage INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    entitlement RECORD;
    limit_value INTEGER;
BEGIN
    SELECT * INTO entitlement FROM get_tenant_entitlement(tid);
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    limit_value := (entitlement.limits->>limit_key)::INTEGER;
    
    IF limit_value IS NULL THEN
        RETURN TRUE; -- No limit set
    END IF;
    
    RETURN current_usage < limit_value;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Billing Audit Trail
-- =============================================================================

CREATE TABLE IF NOT EXISTS billing_audit_events (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    old_plan_id TEXT,
    new_plan_id TEXT,
    old_status TEXT,
    new_status TEXT,
    metadata JSONB,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_audit_tenant ON billing_audit_events(tenant_id, timestamp DESC);

ALTER TABLE billing_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_audit_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_audit_isolation ON billing_audit_events;
CREATE POLICY billing_audit_isolation ON billing_audit_events
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)
        OR tenant_id = current_setting('app.current_tenant_id', true)
        OR current_setting('app.current_tenant', true) = 'system_admin'
    );

-- =============================================================================
-- Trigger: Audit Subscription Changes
-- =============================================================================

CREATE OR REPLACE FUNCTION audit_subscription_change()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        INSERT INTO billing_audit_events (
            tenant_id, event_type, old_plan_id, new_plan_id, old_status, new_status
        ) VALUES (
            NEW.tenant_id, 'subscription.updated',
            OLD.plan_id, NEW.plan_id, OLD.status, NEW.status
        );
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO billing_audit_events (
            tenant_id, event_type, new_plan_id, new_status
        ) VALUES (
            NEW.tenant_id, 'subscription.created', NEW.plan_id, NEW.status
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_subscription_changes ON subscriptions;
CREATE TRIGGER audit_subscription_changes
    AFTER INSERT OR UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION audit_subscription_change();
