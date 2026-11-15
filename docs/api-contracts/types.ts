/**
 * Axiom contract declarations.
 * Current* types mirror Rust source. Draft* types model a proposal only and
 * MUST NOT be treated as a live /v1/local API until backend review/implementation.
 */

export type RuntimeMode = 'enforce' | 'observe';
export type AuditRuntimeMode = 'enforce' | 'observe-only';
export type PipelineDecision = 'PERMIT' | 'DENY';
export type AuditDecision = 'ALLOW' | 'DENY' | 'WOULD_DENY';
export type CurrentRevocationTargetKind = 'global' | 'mcp_server' | 'agent' | 'tool';

/** Exact current Team 2 RuntimeRequest. Never serialize raw_auth_header to audit/UI. */
export interface CurrentRuntimeRequest {
  request_id: string;
  trace_id: string;
  mcp_session_id: string;
  mcp_method: string;
  target_server: string;
  tool_name: string;
  raw_arguments: unknown;
  runtime_mode: RuntimeMode;
  raw_auth_header: string | null;
}

/** Exact current Team 3 IdentityContext; rfc8707_aud_matched is not present. */
export interface CurrentIdentityContext {
  authenticated: boolean;
  agent_id: string;
  client_id: string;
  cimd_uri: string | null;
  issuer: string;
  audience: string[];
  scopes: string[];
  token_jti: string;
  expires_at_unix: number;
}

/** Exact shape of observability/audit/src/event.rs::AuditEvent. */
export interface CurrentAuditEvent {
  timestamp_rfc3339: string;
  request_id: string;
  trace_id: string;
  agent_id: string;
  target_server: string;
  tool_name: string;
  runtime_mode: string;
  decision: string;
  policy_version: string;
  denial_reason: string | null;
  validator_summary: string[];
  kill_switch_active: boolean;
  latency_us: number;
}

/** Exact separate shape of observability/audit/src/event.rs::KillSwitchAuditEvent. */
export interface CurrentKillSwitchAuditEvent {
  event_type: 'kill_switch_action';
  timestamp_rfc3339: string;
  action: 'revoke' | 'clear';
  target_kind: CurrentRevocationTargetKind;
  target_id: string;
  actor: string;
  reason: string;
  previous_state_version: number;
  state_version: number;
  outcome: string;
  source: 'cli' | 'unix_socket' | 'loopback_http' | 'test';
  request_id: string | null;
}

/** Exact shape of services/extmcp/policy-api/src/lib.rs::ValidationReport. */
export interface CurrentValidationReport {
  valid: boolean;
  errors: string[];
  version_would_be: string;
}

/** Exact shape of PolicyVersionInfo. */
export interface CurrentPolicyVersionInfo {
  version: string;
  loaded_at_unix: number;
  policy_count: number;
}

/** Exact shape of observability/kill-switch/src/model.rs::RevocationState. */
export interface CurrentRevocationState {
  target_kind: CurrentRevocationTargetKind;
  target_id: string;
  revoked: boolean;
  state_version: number;
  effective_unix_ms: number;
  reason: string;
}

/** Exact current Team 2 ValidatorResult shape. */
export interface CurrentValidatorResult {
  validator_id: string;
  passed: boolean;
  violation_code: string | null;
  reason: string | null;
  sql_verbs: string[];
  sql_tables: string[];
  sql_is_readonly: boolean;
  sql_statement_count: number;
  normalized_path: string | null;
  path_traversal_detected: boolean;
  egress_domain: string | null;
  egress_is_private_ip: boolean;
  tool_pin_sha256: string | null;
  tool_pin_verified: boolean;
}

/** Exact current Team 2 PolicyResponse. */
export interface CurrentPolicyResponse {
  decision: PipelineDecision;
  policy_version: string;
  matched_policy_ids: string[];
  reason: string;
  evaluation_latency_us: number;
  error_category: 'REVOKED' | 'AUTHENTICATION_FAILURE' | 'VALIDATOR_FAILURE' | 'POLICY_ENGINE_ERROR' | 'INTERNAL_ERROR' | null;
}

export interface CurrentPolicyRequest {
  principal_uid: string;
  action_uid: string;
  resource_uid: string;
  context_json: Record<string, unknown>;
}

export interface CurrentRevocationSnapshot {
  epoch: string;
  version: number;
  generated_at_unix_ms: number;
  entries: Record<string, CurrentRevocationState>;
}

/**
 * Proposed transport for PolicyApiServer::validate_policy_candidate.
 * This proposal covers syntax/schema validation only, not MCP call simulation.
 */
export interface DraftDryRunRequest {
  sources: string[];
  schema: string;
}

/** Proposed replacement for server-file reload; not implemented. */
export interface DraftPolicyBundleRequest {
  sources: string[];
  schema: string;
  route_modes: Record<string, 'observe-only' | 'enforce'>;
}

/** Proposed local revoke request; session_id support needs a backend contract change. */
export interface DraftRevokeRequest {
  target_kind: 'agent_id' | 'session_id' | 'tool_id';
  reason: string;
  actor?: string;
}

export interface DraftRevokeResponse {
  status: 'applied' | 'already_in_desired_state';
  state_version: number;
  audit_enqueued: boolean;
}

/**
 * Requested inspector projection, not a current Rust or wire event type.
 * Backend owners must confirm which identity/validator data is safe and available.
 */
export interface DraftFrontendEventProjection extends CurrentAuditEvent {
  identity: {
    cimd_uri: string | null;
    rfc8707_aud_matched: boolean | null;
  };
  active_policy: string | null;
  latency_ms: number;
  extracted: {
    sql_verbs: string[];
    sql_tables: string[];
    normalized_path: string | null;
    egress_domain: string | null;
    tool_pin_sha256: string | null;
    tool_pin_verified: boolean | null;
  };
}
