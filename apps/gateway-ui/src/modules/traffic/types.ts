/**
 * Module 1B: Live MCP Traffic & ExtMCP Callout Inspector
 * Team 7B Types - Mirroring backend AuditEvent contract
 * 
 * Contract status: 0.1.0-draft (not frozen by Team 0)
 * Backend source: /observability/audit/src/event.rs
 */

/** Decision value - mirrors Rust AuditDecision enum */
export type AuditDecision = 'ALLOW' | 'DENY' | 'WOULD_DENY';

/** Runtime mode - mirrors Rust AuditRuntimeMode enum */
export type AuditRuntimeMode = 'enforce' | 'observe-only';

/**
 * Audit event from GET /v1/local/events/stream (SSE)
 * Mirrors the Rust AuditEvent struct field-for-field.
 */
export interface AuditEvent {
  /** UTC timestamp in RFC 3339 format with milliseconds */
  timestamp_rfc3339: string;
  /** Request correlation identifier from gateway */
  request_id: string;
  /** W3C trace ID */
  trace_id: string;
  /** Authenticated agent identifier or "anonymous" */
  agent_id: string;
  /** Target MCP server name */
  target_server: string;
  /** Tool name or empty string */
  tool_name: string;
  /** "enforce" | "observe-only" */
  runtime_mode: string;
  /** "ALLOW" | "DENY" | "WOULD_DENY" */
  decision: string;
  /** Active Cedar policy bundle SHA-256 */
  policy_version: string;
  /** Redacted denial reason if any */
  denial_reason: string | null;
  /** Redacted canonical validator summaries */
  validator_summary: string[];
  /** Whether kill-switch revocation matched */
  kill_switch_active: boolean;
  /** Pipeline latency in microseconds */
  latency_us: number;
}

/**
 * Expanded identity context for inspector drawer
 * Derived from backend IdentityContext
 */
export interface IdentityContext {
  authenticated: boolean;
  agent_id: string;
  client_id: string;
  cimd_uri: string | null;
  issuer: string;
  audience: string[];
  scopes: string[];
  token_jti: string;
  expires_at_unix: number;
  /** RFC 8707 audience match indicator */
  rfc8707_aud_matched?: boolean;
}

/**
 * SSE connection states
 */
export type SSEConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'stale'
  | 'paused'
  | 'error';

/**
 * SSE connection status for UI display
 */
export interface SSEStatus {
  state: SSEConnectionState;
  /** Human-readable failure reason */
  error?: string;
  /** Reconnect attempt count */
  retryCount?: number;
  /** Next retry timestamp */
  nextRetryAt?: number;
  /** Last successful message timestamp */
  lastMessageAt?: number;
}

/**
 * Ring buffer statistics
 */
export interface BufferStats {
  /** Total events received since connection */
  totalReceived: number;
  /** Current buffer size */
  currentSize: number;
  /** Maximum buffer capacity */
  maxCapacity: number;
  /** Number of dropped events (overflow) */
  droppedCount: number;
  /** Events per second (rolling average) */
  eventsPerSecond: number;
}

/**
 * Verdict display mapping per tokens.json semantics
 */
export const VERDICT_DISPLAY_MAP: Record<string, string> = {
  ALLOW: 'ALLOW',
  WOULD_DENY: 'OBSERVE',
  DENY: 'DENY',
  REVOKED: 'REVOKED',
  PENDING: 'PENDING',
};

/**
 * Verdict to semantic color mapping
 */
export const VERDICT_COLOR_MAP: Record<string, string> = {
  ALLOW: 'state-enforce',
  WOULD_DENY: 'state-observe',
  DENY: 'state-deny',
  REVOKED: 'state-revoked',
  PENDING: 'state-pending',
};
