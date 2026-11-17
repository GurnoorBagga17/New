// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
/**
 * Audit Event Emission
 * 
 * CRITICAL: Add audit calls to every mutation.
 * Retrofitting audit later is painful and error-prone.
 */

import pg from 'pg';

export interface AuditEvent {
  tenant_id: string;
  event_type: string;
  actor: string; // user_id or 'system'
  resource_type?: string;
  resource_id?: string;
  metadata?: Record<string, any>;
  ip_address?: string;
  timestamp?: Date;
}

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool && process.env.DATABASE_URL) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30000,
    });
  }
  return pool!;
}

/**
 * Emit an audit event asynchronously.
 * 
 * In production, this should use a queue (Redis, SQS) to avoid
 * blocking request handling. For MVP, we write directly to the database.
 * 
 * IMPORTANT: Do not fail the request if audit fails. Log the error and continue.
 */
export async function emitAuditEvent(event: AuditEvent): Promise<void> {
  const timestamp = event.timestamp || new Date();

  // Always log to console for development
  if (process.env.NODE_ENV !== 'production') {
    console.log('[AUDIT]', JSON.stringify({
      ...event,
      timestamp: timestamp.toISOString(),
    }, null, 2));
  }

  // Write to database
  try {
    const dbPool = getPool();
    if (!dbPool) {
      console.warn('Audit event not persisted: DATABASE_URL not set');
      return;
    }

    await dbPool.query(
      `INSERT INTO operator_audit_events (
        tenant_id, event_type, operator_id, resource_type, resource_id, metadata, ip_address, timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        event.tenant_id,
        event.event_type,
        event.actor === 'system' ? null : event.actor,
        event.resource_type || null,
        event.resource_id || null,
        event.metadata ? JSON.stringify(event.metadata) : null,
        event.ip_address || null,
        timestamp,
      ]
    );
  } catch (err) {
    // CRITICAL: Do not fail the request if audit fails
    console.error('Failed to emit audit event:', err);
    console.error('Event:', event);
    
    // TODO: In production, send to dead-letter queue for replay
    // TODO: Alert operations team if audit is consistently failing
  }
}

/**
 * Helper: Extract IP address from Next.js request
 */
export function getClientIp(headers: Headers): string | undefined {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip') || undefined;
}

/**
 * Common audit event types (for consistency)
 */
export const AuditEventTypes = {
  // Authentication
  AUTH_LOGIN_SUCCESS: 'auth.login.success',
  AUTH_LOGIN_FAILURE: 'auth.login.failure',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_MFA_ENROLLED: 'auth.mfa.enrolled',
  AUTH_PASSWORD_CHANGED: 'auth.password.changed',
  
  // Integrations
  INTEGRATION_CREATED: 'integration.created',
  INTEGRATION_TESTED: 'integration.tested',
  INTEGRATION_SYNCED: 'integration.synced',
  INTEGRATION_DISCONNECTED: 'integration.disconnected',
  
  // Policy
  POLICY_CREATED: 'policy.created',
  POLICY_UPDATED: 'policy.updated',
  POLICY_ACTIVATED: 'policy.activated',
  POLICY_DEACTIVATED: 'policy.deactivated',
  
  // Runtime
  RUNTIME_ENROLLED: 'runtime.enrolled',
  RUNTIME_POLICY_UPDATED: 'runtime.policy.updated',
  RUNTIME_DECISION: 'runtime.decision', // Allow/deny decisions
  
  // Billing
  BILLING_CHECKOUT_STARTED: 'billing.checkout.started',
  BILLING_SUBSCRIPTION_ACTIVATED: 'billing.subscription.activated',
  BILLING_SUBSCRIPTION_CANCELED: 'billing.subscription.canceled',
  
  // Remediation
  REMEDIATION_EXECUTED: 'remediation.executed',
  REMEDIATION_ROLLED_BACK: 'remediation.rolled_back',
  
  // Administrative
  OPERATOR_INVITED: 'operator.invited',
  OPERATOR_REMOVED: 'operator.removed',
  OPERATOR_ROLE_CHANGED: 'operator.role.changed',
} as const;
