/**
 * Test Suite: Gateway Interceptor & Runtime Modes
 * Team 1 Validation for Gate G1
 * 
 * Verifies the behavior matrix for Permit, Deny, Timeout (15ms), and Kill Switch
 * across both Observe-Only and Enforce modes.
 */

const assert = require('assert');
const { MockMcpBackend } = require('./mock_mcp_backend');
const { MockExtMcpServer } = require('./mock_extmcp');
const { GatewayMcpInterceptor } = require('./interceptor');

async function runTestSuite() {
  console.log('================================================================');
  console.log('RUNNING TEAM 1 GATEWAY TEST SUITE: MCP INTERCEPTION & ENFORCEMENT');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${name}`);
      console.error(`         ${err.stack || err.message}`);
      failed++;
    }
  }

  const backend = new MockMcpBackend();
  const extMcp = new MockExtMcpServer();

  function setupInterceptor(mode, options = {}) {
    backend.reset();
    extMcp.reset();
    return new GatewayMcpInterceptor({
      extMcpClient: extMcp,
      backendClient: backend,
      runtimeMode: mode,
      calloutTimeoutMs: options.calloutTimeoutMs || 15,
      killSwitchOverridesObserveOnly: options.killSwitchOverridesObserveOnly !== undefined
        ? options.killSwitchOverridesObserveOnly
        : true
    });
  }

  // ---------------------------------------------------------------------------
  // TEST GROUP 1: ENFORCE MODE
  // ---------------------------------------------------------------------------
  console.log('--- Group 1: Enforce Mode Verification ---');

  await test('Enforce Mode: Policy Permit allows call and executes backend', async () => {
    const gateway = setupInterceptor('enforce');
    extMcp.setBehavior('PERMIT');

    const request = {
      jsonrpc: '2.0',
      id: 'req-001',
      method: 'tools/call',
      params: { name: 'read_file', arguments: { path: '/safe/data.txt' } }
    };

    const response = await gateway.intercept(request, {
      'Authorization': 'Bearer test-token-123',
      'Mcp-Session-Id': 'sess-456'
    });

    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(backend.executedCalls.length, 1, 'Backend must execute on permit');
    assert.strictEqual(backend.executedCalls[0].toolName, 'read_file');
    assert.strictEqual(response.body.result.isError, undefined);
    assert.strictEqual(gateway.emittedAuditEvents.length, 1);
    assert.strictEqual(gateway.emittedAuditEvents[0].decision, 'ALLOW');
  });

  await test('Enforce Mode: Policy Deny on tools/call blocks backend and returns HTTP 200 with isError: true', async () => {
    const gateway = setupInterceptor('enforce');
    extMcp.setBehavior('DENY', { reason: 'Unauthorized access to table users' });

    const request = {
      jsonrpc: '2.0',
      id: 'req-002',
      method: 'tools/call',
      params: { name: 'execute_sql', arguments: { query: 'DROP TABLE users' } }
    };

    const response = await gateway.intercept(request, {
      'Authorization': 'Bearer rogue-token'
    });

    assert.strictEqual(response.statusCode, 200, 'tools/call error must return HTTP 200 for MCP agent runtime');
    assert.strictEqual(backend.executedCalls.length, 0, 'PROHIBITED SIDE-EFFECT MUST NEVER EXECUTE ON BACKEND');
    assert.strictEqual(response.body.result.isError, true);
    assert(response.body.result.content[0].text.includes('Unauthorized access to table users'));
    assert.strictEqual(gateway.emittedAuditEvents.length, 1);
    assert.strictEqual(gateway.emittedAuditEvents[0].decision, 'DENY');
  });

  await test('Enforce Mode: Policy Deny on non-tools/call returns JSON-RPC -32001', async () => {
    const gateway = setupInterceptor('enforce');
    extMcp.setBehavior('DENY', { reason: 'tools/list prohibited for this role' });

    const request = {
      jsonrpc: '2.0',
      id: 'req-003',
      method: 'tools/list',
      params: {}
    };

    const response = await gateway.intercept(request);

    assert.strictEqual(response.statusCode, 403);
    assert.strictEqual(backend.executedCalls.length, 0);
    assert.strictEqual(response.body.error.code, -32001);
    assert(response.body.error.message.includes('Policy Denial'));
    assert.strictEqual(gateway.emittedAuditEvents[0].decision, 'DENY');
  });

  await test('Enforce Mode: ExtMCP Timeout (>15ms) fails closed and blocks execution', async () => {
    const gateway = setupInterceptor('enforce', { calloutTimeoutMs: 15 });
    // ExtMCP delays by 50ms, triggering the 15ms deadline
    extMcp.setBehavior('TIMEOUT');

    const request = {
      jsonrpc: '2.0',
      id: 'req-004',
      method: 'tools/call',
      params: { name: 'execute_sql', arguments: { query: 'DELETE FROM accounts' } }
    };

    const response = await gateway.intercept(request);

    assert.strictEqual(backend.executedCalls.length, 0, 'Side effect must not execute when policy engine times out');
    assert.strictEqual(response.body.error.code, -32001);
    assert(response.body.error.message.includes('deadline exceeded'));
    assert.strictEqual(gateway.emittedAuditEvents[0].decision, 'DENY');
    assert.strictEqual(gateway.emittedAuditEvents[0].denial_reason, 'EXTMCP_TIMEOUT_FAIL_CLOSED');
  });

  await test('Enforce Mode: Active Kill Switch blocks immediately with -32001', async () => {
    const gateway = setupInterceptor('enforce');
    extMcp.setBehavior('KILL_SWITCH', { reason: 'Agent agent-compromised-007 is revoked' });

    const request = {
      jsonrpc: '2.0',
      id: 'req-005',
      method: 'tools/call',
      params: { name: 'execute_sql', arguments: { query: 'SELECT 1' } }
    };

    const response = await gateway.intercept(request);

    assert.strictEqual(backend.executedCalls.length, 0, 'Backend must not execute under active kill-switch');
    assert.strictEqual(response.statusCode, 403);
    assert.strictEqual(response.body.error.code, -32001);
    assert(response.body.error.message.includes('Emergency Revocation'));
    assert.strictEqual(gateway.emittedAuditEvents[0].kill_switch_active, true);
  });

  // ---------------------------------------------------------------------------
  // TEST GROUP 2: OBSERVE-ONLY MODE
  // ---------------------------------------------------------------------------
  console.log('\n--- Group 2: Observe-Only Mode Verification ---');

  await test('Observe-Only Mode: Policy Deny records shadow event but forwards to backend', async () => {
    const gateway = setupInterceptor('observe-only');
    extMcp.setBehavior('DENY', { reason: 'Shadow rule violation: sensitive table read' });

    const request = {
      jsonrpc: '2.0',
      id: 'req-006',
      method: 'tools/call',
      params: { name: 'read_file', arguments: { path: '/var/data/conf.json' } }
    };

    const response = await gateway.intercept(request);

    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(backend.executedCalls.length, 1, 'In observe-only, backend must execute despite policy denial');
    assert.strictEqual(response.body.result.isError, undefined, 'Client receives valid backend response');
    assert.strictEqual(gateway.emittedAuditEvents.length, 1);
    assert.strictEqual(gateway.emittedAuditEvents[0].decision, 'WOULD_DENY', 'Shadow audit must record WOULD_DENY');
    assert(gateway.emittedAuditEvents[0].denial_reason.includes('Shadow rule violation'));
  });

  await test('Observe-Only Mode: ExtMCP Timeout fails open, logs shadow event, forwards call', async () => {
    const gateway = setupInterceptor('observe-only', { calloutTimeoutMs: 15 });
    extMcp.setBehavior('TIMEOUT');

    const request = {
      jsonrpc: '2.0',
      id: 'req-007',
      method: 'tools/call',
      params: { name: 'read_file', arguments: { path: '/var/log.txt' } }
    };

    const response = await gateway.intercept(request);

    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(backend.executedCalls.length, 1, 'Observe-only fails open on timeout');
    assert.strictEqual(gateway.emittedAuditEvents[0].decision, 'WOULD_DENY');
    assert.strictEqual(gateway.emittedAuditEvents[0].denial_reason, 'EXTMCP_TIMEOUT_FAIL_OPEN');
  });

  await test('Observe-Only Mode: Active Kill Switch blocks if precedence is enabled (Option B)', async () => {
    const gateway = setupInterceptor('observe-only', { killSwitchOverridesObserveOnly: true });
    extMcp.setBehavior('KILL_SWITCH', { reason: 'Global freeze in progress' });

    const request = {
      jsonrpc: '2.0',
      id: 'req-008',
      method: 'tools/call',
      params: { name: 'read_file', arguments: { path: '/data' } }
    };

    const response = await gateway.intercept(request);

    assert.strictEqual(backend.executedCalls.length, 0, 'Kill-switch precedence must block even in observe-only');
    assert.strictEqual(response.statusCode, 403);
    assert.strictEqual(response.body.error.code, -32001);
    assert.strictEqual(gateway.emittedAuditEvents[0].decision, 'DENY');
    assert.strictEqual(gateway.emittedAuditEvents[0].kill_switch_active, true);
  });

  await test('Observe-Only Mode: Active Kill Switch forwards if strict shadow is configured (Option A)', async () => {
    const gateway = setupInterceptor('observe-only', { killSwitchOverridesObserveOnly: false });
    extMcp.setBehavior('KILL_SWITCH', { reason: 'Agent compromised' });

    const request = {
      jsonrpc: '2.0',
      id: 'req-009',
      method: 'tools/call',
      params: { name: 'read_file', arguments: { path: '/data' } }
    };

    const response = await gateway.intercept(request);

    assert.strictEqual(backend.executedCalls.length, 1, 'Strict shadow forwards call');
    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(gateway.emittedAuditEvents[0].decision, 'WOULD_DENY');
    assert.strictEqual(gateway.emittedAuditEvents[0].kill_switch_active, true);
  });

  // ---------------------------------------------------------------------------
  // TEST GROUP 3: SECURITY BOUNDARIES & PROTOCOL MAPPING
  // ---------------------------------------------------------------------------
  console.log('\n--- Group 3: Security Boundaries & Header Mapping ---');

  await test('Security Boundary: Raw bearer token is never logged or exposed in audit events', async () => {
    const gateway = setupInterceptor('enforce');
    extMcp.setBehavior('DENY', { reason: 'Access denied' });

    const secretToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.s3cr3t_p4yl04d';
    const request = {
      jsonrpc: '2.0',
      id: 'req-010',
      method: 'tools/call',
      params: { name: 'read_file', arguments: { path: '/etc/hosts' } }
    };

    const response = await gateway.intercept(request, {
      'Authorization': `Bearer ${secretToken}`
    });

    const auditEventJson = JSON.stringify(gateway.emittedAuditEvents[0]);
    const responseJson = JSON.stringify(response);

    assert(!auditEventJson.includes(secretToken), 'Bearer token must NEVER appear in audit telemetry');
    assert(!responseJson.includes(secretToken), 'Bearer token must NEVER leak in client error response');
  });

  await test('Protocol Mapping: Allowed headers and metadata context are passed to ExtMCP callout', async () => {
    const gateway = setupInterceptor('enforce');
    extMcp.setBehavior('PERMIT');

    const request = {
      jsonrpc: '2.0',
      id: 'req-011',
      method: 'tools/call',
      params: { name: 'test_tool', arguments: { x: 42 } }
    };

    const headers = {
      'Authorization': 'Bearer allowed-token',
      'Mcp-Session-Id': 'sess-uuid-789',
      'traceparent': '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      'X-Injected-Header': 'attacker-payload-must-be-dropped'
    };

    await gateway.intercept(request, headers);

    assert.strictEqual(extMcp.receivedCallouts.length, 1);
    const callout = extMcp.receivedCallouts[0];

    // Assert headers allow-listing
    const calloutHeaderKeys = callout.headers.map(h => h.key);
    assert(calloutHeaderKeys.includes('authorization'));
    assert(calloutHeaderKeys.includes('mcp-session-id'));
    assert(calloutHeaderKeys.includes('traceparent'));
    assert(!calloutHeaderKeys.includes('x-injected-header'), 'Unapproved headers must be filtered out');

    // Assert metadata context
    assert.strictEqual(callout.metadataContext.fields.runtime_mode.string_value, 'enforce');
    assert.strictEqual(callout.metadataContext.fields.trace_id.string_value, '4bf92f3577b34da6a3ce929d0e0e4736');
    assert(callout.metadataContext.fields.axiom_request_id.string_value.length > 0);
  });

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
