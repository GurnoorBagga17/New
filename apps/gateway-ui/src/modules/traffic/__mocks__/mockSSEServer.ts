/**
 * Module 1B: Dev-Only Synthetic Load Generator (B6)
 * Team 7B: Mock SSE server emitting 500+ events/sec
 * 
 * Usage: Enable in dev mode to test frame budget without backend
 * Disabled by default once real endpoint works
 */

import type { AuditEvent, AuditDecision, AuditRuntimeMode } from '../types';

interface MockSSEServerOptions {
  eventsPerSecond?: number;
  mixedDecisions?: boolean;
  includeFailures?: boolean;
}

const AGENT_IDS = [
  'finance-agent-prod',
  'analytics-agent-staging',
  'data-export-agent',
  'reporting-agent',
  'anonymous',
];

const SERVERS = [
  'mcp://prod-db',
  'mcp://analytics',
  'mcp://data-warehouse',
  'mcp://reporting',
];

const TOOLS = [
  'execute_sql',
  'read_file',
  'http_request',
  'list_tables',
  'export_data',
];

const DECISIONS: AuditDecision[] = ['ALLOW', 'DENY', 'WOULD_DENY'];

const RUNTIME_MODES: AuditRuntimeMode[] = ['enforce', 'observe-only'];

const POLICY_VERSIONS = [
  'a1b2c3d4e5f67890',
  'f9e8d7c6b5a43210',
  '1234567890abcdef',
];

const VALIDATOR_SUMMARIES = [
  ['sql: SELECT verified, readonly=true'],
  ['sql: DELETE detected, destructive=true', 'policy: forbid matched'],
  ['path: ../../etc/passwd traversal detected'],
  ['egress: 169.254.169.254 metadata blocked'],
  ['tool-pin: SHA-256 mismatch detected'],
];

const DENIAL_REASONS = [
  'FAIL-CLOSED: Unauthorized destructive SQL operation',
  'Path traversal detected: normalized path escapes boundary',
  'ExtMCP policy service unreachable (timeout 15ms)',
  'Kill switch active: agent revoked',
  'Tool definition SHA-256 mismatch (rug pull detected)',
];

function randomItem<T>(arr: T[]): T {
  const item = arr[Math.floor(Math.random() * arr.length)];
  if (!item) throw new Error('Empty array');
  return item;
}

function generateMockEvent(): AuditEvent {
  const decision = randomItem(DECISIONS);
  const mode = randomItem(RUNTIME_MODES);
  const killSwitch = Math.random() < 0.05; // 5% kill switch events
  const isDenial = decision === 'DENY' || killSwitch;
  
  // Latency distribution:
  // - 70% under 3ms (fast path)
  // - 20% 3-5ms (acceptable)
  // - 10% over 5ms (slow/timeout)
  let latencyUs: number;
  const rand = Math.random();
  if (rand < 0.7) {
    latencyUs = Math.floor(Math.random() * 3000); // 0-3ms
  } else if (rand < 0.9) {
    latencyUs = 3000 + Math.floor(Math.random() * 2000); // 3-5ms
  } else {
    latencyUs = 5000 + Math.floor(Math.random() * 10000); // 5-15ms
  }
  
  return {
    timestamp_rfc3339: new Date().toISOString(),
    request_id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    trace_id: `trace-${Math.random().toString(36).slice(2, 14)}`,
    agent_id: randomItem(AGENT_IDS),
    target_server: randomItem(SERVERS),
    tool_name: randomItem(TOOLS),
    runtime_mode: mode,
    decision: killSwitch ? 'DENY' : decision,
    policy_version: randomItem(POLICY_VERSIONS),
    denial_reason: isDenial ? randomItem(DENIAL_REASONS) : null,
    validator_summary: isDenial ? randomItem(VALIDATOR_SUMMARIES) : [],
    kill_switch_active: killSwitch,
    latency_us: latencyUs,
  };
}

export class MockSSEServer {
  private intervalId: number | null = null;
  private listeners: Set<(event: AuditEvent) => void> = new Set();
  private eventsPerSecond: number;
  
  constructor(options: MockSSEServerOptions = {}) {
    this.eventsPerSecond = options.eventsPerSecond || 500;
  }
  
  start() {
    if (this.intervalId !== null) return;
    
    // Calculate interval to achieve target events/sec
    // Emit in batches for more realistic burst behavior
    const batchSize = 10;
    const intervalMs = (1000 / this.eventsPerSecond) * batchSize;
    
    this.intervalId = window.setInterval(() => {
      // Emit batch of events
      for (let i = 0; i < batchSize; i++) {
        const event = generateMockEvent();
        this.emit(event);
      }
    }, intervalMs);
    
    console.log(
      `[MockSSEServer] Started: ${this.eventsPerSecond} events/sec (batch size: ${batchSize})`,
    );
  }
  
  stop() {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[MockSSEServer] Stopped');
    }
  }
  
  addEventListener(listener: (event: AuditEvent) => void) {
    this.listeners.add(listener);
  }
  
  removeEventListener(listener: (event: AuditEvent) => void) {
    this.listeners.delete(listener);
  }
  
  private emit(event: AuditEvent) {
    this.listeners.forEach((listener) => listener(event));
  }
  
  // Simulate specific failure scenarios
  emitFailClosedTimeout() {
    const event = generateMockEvent();
    event.decision = 'DENY';
    event.denial_reason = 'FAIL-CLOSED: ExtMCP policy service unreachable (timeout 15ms)';
    event.latency_us = 15000; // 15ms timeout
    this.emit(event);
  }
  
  emitKillSwitch(agentId: string) {
    const event = generateMockEvent();
    event.agent_id = agentId;
    event.decision = 'DENY';
    event.kill_switch_active = true;
    event.denial_reason = `Kill switch active: agent ${agentId} revoked`;
    this.emit(event);
  }
  
  emitBurst(count: number) {
    for (let i = 0; i < count; i++) {
      this.emit(generateMockEvent());
    }
  }
}

// Singleton instance for easy access
let mockServerInstance: MockSSEServer | null = null;

export function getMockSSEServer(options?: MockSSEServerOptions): MockSSEServer {
  if (!mockServerInstance) {
    mockServerInstance = new MockSSEServer(options);
  }
  return mockServerInstance;
}

export function startMockSSEServer(options?: MockSSEServerOptions) {
  const server = getMockSSEServer(options);
  server.start();
  return server;
}

export function stopMockSSEServer() {
  if (mockServerInstance) {
    mockServerInstance.stop();
  }
}
