// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
/**
 * Tenant Isolation Security Test Suite
 * 
 * Architecture requirement (Section 8.3):
 * "Every API call must derive tenant and operator from validated session.
 *  Never trust client-supplied tenant_id."
 * 
 * These tests verify that tenant A cannot:
 * - Read tenant B's integrations, policies, audit events, or inventory
 * - Update tenant B's configurations
 * - Impersonate tenant B's operators
 * - Cross tenant boundaries through SQL injection
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import pg from 'pg';
import crypto from 'crypto';

// Test configuration
const DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://localhost/axiom_test';
const API_BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000';

let dbPool: pg.Pool;

// Test tenant and operator fixtures
const TENANT_A = {
  tenant_id: 'tenant-alpha-test',
  display_name: 'Tenant Alpha Corp',
  status: 'subscription_active',
};

const TENANT_B = {
  tenant_id: 'tenant-bravo-test',
  display_name: 'Tenant Bravo Inc',
  status: 'subscription_active',
};

const OPERATOR_A = {
  user_id: 'user-alice-alpha',
  tenant_id: TENANT_A.tenant_id,
  email: 'alice@alpha.com',
  display_name: 'Alice Alpha',
  role: 'security-admin',
  password: 'test-password-alice',
};

const OPERATOR_B = {
  user_id: 'user-bob-bravo',
  tenant_id: TENANT_B.tenant_id,
  email: 'bob@bravo.com',
  display_name: 'Bob Bravo',
  role: 'security-admin',
  password: 'test-password-bob',
};

let sessionA: string;
let sessionB: string;

// Helper: Hash password using scrypt
function hashPassword(password: string, saltHex?: string): { saltHex: string; hashHex: string } {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64);
  return {
    saltHex: salt.toString('hex'),
    hashHex: derived.toString('hex'),
  };
}

// Helper: Create session for operator
async function createTestSession(operator: typeof OPERATOR_A): Promise<string> {
  const sessionId = crypto.randomBytes(32).toString('hex');
  const csrfToken = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 3600 * 1000);

  await dbPool.query(
    `INSERT INTO operator_sessions (session_id, user_id, tenant_id, csrf_token, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [sessionId, operator.user_id, operator.tenant_id, csrfToken, expiresAt]
  );

  return sessionId;
}

// Helper: API request with session
async function apiRequest(path: string, session: string, options: RequestInit = {}) {
  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Cookie': `axiom_session=${session}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

beforeAll(async () => {
  // 1. Connect to test database
  dbPool = new pg.Pool({
    connectionString: DATABASE_URL,
    max: 5,
  });

  // 2. Clean up any existing test data
  await dbPool.query(`DELETE FROM tenants WHERE tenant_id LIKE 'tenant-%-test'`);

  // 3. Create test tenants
  await dbPool.query(
    `INSERT INTO tenants (tenant_id, display_name, status) VALUES ($1, $2, $3)`,
    [TENANT_A.tenant_id, TENANT_A.display_name, TENANT_A.status]
  );
  await dbPool.query(
    `INSERT INTO tenants (tenant_id, display_name, status) VALUES ($1, $2, $3)`,
    [TENANT_B.tenant_id, TENANT_B.display_name, TENANT_B.status]
  );

  // 4. Create test operators
  const hashA = hashPassword(OPERATOR_A.password);
  const passwordHashA = `scrypt$${hashA.saltHex}$${hashA.hashHex}`;
  await dbPool.query(
    `INSERT INTO operators (user_id, tenant_id, email, display_name, role, password_hash, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE)`,
    [OPERATOR_A.user_id, OPERATOR_A.tenant_id, OPERATOR_A.email, OPERATOR_A.display_name, OPERATOR_A.role, passwordHashA]
  );

  const hashB = hashPassword(OPERATOR_B.password);
  const passwordHashB = `scrypt$${hashB.saltHex}$${hashB.hashHex}`;
  await dbPool.query(
    `INSERT INTO operators (user_id, tenant_id, email, display_name, role, password_hash, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE)`,
    [OPERATOR_B.user_id, OPERATOR_B.tenant_id, OPERATOR_B.email, OPERATOR_B.display_name, OPERATOR_B.role, passwordHashB]
  );

  // 5. Create test sessions
  sessionA = await createTestSession(OPERATOR_A);
  sessionB = await createTestSession(OPERATOR_B);

  // 6. Create test integration for tenant B (target for cross-tenant access attempts)
  await dbPool.query(
    `INSERT INTO integration_connections (connection_id, tenant_id, provider, display_name, status)
     VALUES ($1, $2, 'aws_iam', 'Tenant B AWS Integration', 'connected')`,
    ['intg-bravo-aws-001', TENANT_B.tenant_id]
  );
});

afterAll(async () => {
  // Clean up test data
  await dbPool.query(`DELETE FROM tenants WHERE tenant_id LIKE 'tenant-%-test'`);
  await dbPool.end();
});

describe('Tenant Isolation: Integration Access', () => {
  test('tenant A cannot read tenant B integrations via API', async () => {
    const response = await apiRequest('/api/integrations', sessionA);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    
    // Should only see tenant A's integrations
    expect(data.integrations).toEqual(expect.any(Array));
    const hasTenantBIntegration = data.integrations.some(
      (i: any) => i.connection_id === 'intg-bravo-aws-001'
    );
    expect(hasTenantBIntegration).toBe(false);
  });

  test('tenant A cannot read specific tenant B integration by ID', async () => {
    const response = await apiRequest('/api/integrations/intg-bravo-aws-001', sessionA);
    
    // Should return 404 (not 403) to avoid enumeration
    expect(response.status).toBe(404);
  });

  test('tenant A cannot update tenant B integration', async () => {
    const response = await apiRequest('/api/integrations/intg-bravo-aws-001', sessionA, {
      method: 'PATCH',
      body: JSON.stringify({ display_name: 'Hacked Integration' }),
    });
    
    expect(response.status).toBe(404);
  });

  test('tenant A cannot delete tenant B integration', async () => {
    const response = await apiRequest('/api/integrations/intg-bravo-aws-001', sessionA, {
      method: 'DELETE',
    });
    
    expect(response.status).toBe(404);
  });
});

describe('Tenant Isolation: Database RLS', () => {
  test('RLS prevents tenant A from reading tenant B integrations directly', async () => {
    const client = await dbPool.connect();
    try {
      // Set tenant context to tenant A
      await client.query(`SELECT set_tenant_context($1)`, [TENANT_A.tenant_id]);
      
      // Try to query all integrations (RLS should filter)
      const result = await client.query(
        `SELECT connection_id, tenant_id FROM integration_connections`
      );
      
      // Should only see tenant A's integrations
      const hasTenantBData = result.rows.some(row => row.tenant_id === TENANT_B.tenant_id);
      expect(hasTenantBData).toBe(false);
    } finally {
      client.release();
    }
  });

  test('RLS prevents tenant context bypass via explicit WHERE clause', async () => {
    const client = await dbPool.connect();
    try {
      // Set tenant context to tenant A
      await client.query(`SELECT set_tenant_context($1)`, [TENANT_A.tenant_id]);
      
      // Try to explicitly query tenant B's data
      const result = await client.query(
        `SELECT connection_id FROM integration_connections WHERE tenant_id = $1`,
        [TENANT_B.tenant_id]
      );
      
      // RLS should block this even with explicit WHERE clause
      expect(result.rows.length).toBe(0);
    } finally {
      client.release();
    }
  });

  test('missing tenant context denies all access', async () => {
    const client = await dbPool.connect();
    try {
      // Don't set tenant context (or set to empty)
      await client.query(`SELECT set_config('app.current_tenant_id', '', TRUE)`);
      
      // Try to query integrations
      const result = await client.query(
        `SELECT connection_id FROM integration_connections`
      );
      
      // Should return no rows without tenant context
      expect(result.rows.length).toBe(0);
    } finally {
      client.release();
    }
  });
});

describe('Tenant Isolation: SQL Injection Attempts', () => {
  test('SQL injection via tenant_id parameter blocked by parameterization', async () => {
    const maliciousInput = `'; DROP TABLE integration_connections; --`;
    
    const client = await dbPool.connect();
    try {
      // Parameterized queries should safely escape the input
      await client.query(`SELECT set_tenant_context($1)`, [maliciousInput]);
      
      const result = await client.query(
        `SELECT connection_id FROM integration_connections`
      );
      
      // Table should still exist and query should succeed (with 0 rows)
      expect(result).toBeDefined();
      expect(result.rows.length).toBe(0);
      
      // Verify table still exists
      const tableCheck = await client.query(
        `SELECT COUNT(*) FROM integration_connections WHERE tenant_id = $1`,
        [TENANT_B.tenant_id]
      );
      expect(tableCheck.rows[0].count).toBeGreaterThanOrEqual(1);
    } finally {
      client.release();
    }
  });

  test('UNION-based SQL injection blocked by RLS', async () => {
    const client = await dbPool.connect();
    try {
      await client.query(`SELECT set_tenant_context($1)`, [TENANT_A.tenant_id]);
      
      // Attempt UNION to bypass RLS
      const maliciousQuery = `
        SELECT connection_id FROM integration_connections
        UNION
        SELECT connection_id FROM integration_connections WHERE tenant_id = '${TENANT_B.tenant_id}'
      `;
      
      const result = await client.query(maliciousQuery);
      
      // RLS should still apply to the second part of UNION
      const hasTenantBData = result.rows.some(
        row => row.connection_id === 'intg-bravo-aws-001'
      );
      expect(hasTenantBData).toBe(false);
    } finally {
      client.release();
    }
  });
});

describe('Tenant Isolation: Session and Operator', () => {
  test('tenant A session cannot be used to access tenant B dashboard', async () => {
    const response = await apiRequest('/api/console/scorecard', sessionA);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    
    // Scorecard should show tenant A's data, not tenant B's
    expect(data.tenant_id).toBe(TENANT_A.tenant_id);
    expect(data.tenant_id).not.toBe(TENANT_B.tenant_id);
  });

  test('operator cannot modify their own tenant_id claim', async () => {
    // Attempt to create a new session with manipulated tenant_id
    const maliciousSessionId = crypto.randomBytes(32).toString('hex');
    const csrfToken = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 3600 * 1000);
    
    // Try to insert session linking operator A to tenant B
    await expect(
      dbPool.query(
        `INSERT INTO operator_sessions (session_id, user_id, tenant_id, csrf_token, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [maliciousSessionId, OPERATOR_A.user_id, TENANT_B.tenant_id, csrfToken, expiresAt]
      )
    ).rejects.toThrow(); // Should fail foreign key constraint
  });

  test('operator cannot read sessions from other tenants', async () => {
    const client = await dbPool.connect();
    try {
      await client.query(`SELECT set_tenant_context($1)`, [TENANT_A.tenant_id]);
      
      const result = await client.query(
        `SELECT session_id, tenant_id FROM operator_sessions`
      );
      
      // Should only see tenant A sessions
      const hasTenantBSessions = result.rows.some(row => row.tenant_id === TENANT_B.tenant_id);
      expect(hasTenantBSessions).toBe(false);
    } finally {
      client.release();
    }
  });
});

describe('Tenant Isolation: Inventory and Lineage', () => {
  test('tenant A cannot read tenant B discovered inventory', async () => {
    // First, create test inventory for tenant B
    await dbPool.query(
      `INSERT INTO inventory_entities (tenant_id, connection_id, entity_uid, entity_kind, source_connector, display_name, fingerprint_sha256)
       VALUES ($1, 'intg-bravo-aws-001', 'aws:iam::999999999999:role/SecretRole', 'aws_iam_role', 'aws_iam', 'SecretRole', 'fingerprint-123')`,
      [TENANT_B.tenant_id]
    );
    
    const client = await dbPool.connect();
    try {
      await client.query(`SELECT set_tenant_context($1)`, [TENANT_A.tenant_id]);
      
      const result = await client.query(
        `SELECT entity_uid FROM inventory_entities WHERE entity_kind = 'aws_iam_role'`
      );
      
      // Should not see tenant B's SecretRole
      const hasSecretRole = result.rows.some(row => row.entity_uid.includes('SecretRole'));
      expect(hasSecretRole).toBe(false);
    } finally {
      client.release();
    }
  });

  test('tenant A cannot query tenant B lineage relationships', async () => {
    const client = await dbPool.connect();
    try {
      await client.query(`SELECT set_tenant_context($1)`, [TENANT_A.tenant_id]);
      
      const result = await client.query(
        `SELECT source_uid, target_uid FROM inventory_relationships`
      );
      
      // Should return no rows for tenant A (or only tenant A's relationships)
      const hasTenantBRelationships = result.rows.some(
        row => row.source_uid && row.source_uid.includes('bravo')
      );
      expect(hasTenantBRelationships).toBe(false);
    } finally {
      client.release();
    }
  });
});

describe('Tenant Isolation: Audit Events', () => {
  test('tenant A cannot read tenant B audit events', async () => {
    // Create test audit event for tenant B
    await dbPool.query(
      `INSERT INTO operator_audit_events (tenant_id, operator_id, event_type, resource_type, resource_id)
       VALUES ($1, $2, 'integration.connected', 'integration', 'intg-bravo-aws-001')`,
      [TENANT_B.tenant_id, OPERATOR_B.user_id]
    );
    
    const client = await dbPool.connect();
    try {
      await client.query(`SELECT set_tenant_context($1)`, [TENANT_A.tenant_id]);
      
      const result = await client.query(
        `SELECT event_id, tenant_id, resource_id FROM operator_audit_events`
      );
      
      // Should not see tenant B's audit events
      const hasTenantBEvents = result.rows.some(row => row.tenant_id === TENANT_B.tenant_id);
      expect(hasTenantBEvents).toBe(false);
    } finally {
      client.release();
    }
  });
});

describe('Tenant Isolation: Cross-Tenant Enumeration', () => {
  test('404 vs 403 prevents tenant enumeration', async () => {
    // Try to access non-existent integration
    const nonExistentResponse = await apiRequest('/api/integrations/intg-nonexistent', sessionA);
    
    // Try to access tenant B's integration
    const crossTenantResponse = await apiRequest('/api/integrations/intg-bravo-aws-001', sessionA);
    
    // Both should return 404 to prevent enumeration
    expect(nonExistentResponse.status).toBe(404);
    expect(crossTenantResponse.status).toBe(404);
    
    // Response bodies should not leak existence information
    const nonExistentBody = await nonExistentResponse.json();
    const crossTenantBody = await crossTenantResponse.json();
    
    expect(nonExistentBody.error).toBeDefined();
    expect(crossTenantBody.error).toBeDefined();
    // Should not distinguish "not found" from "forbidden"
  });
});

