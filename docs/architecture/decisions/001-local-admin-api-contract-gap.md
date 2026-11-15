# ADR 001: Local admin API contract status

**Status:** Proposed; not frozen.  
**Date:** 2026-11-15  
**Owners:** Team 0 (contract), Teams 1, 2, 5 (implementation), Team 6 (compatibility tests)

## Context

The combined frontend plan describes four `localhost:8080/v1/local/*` endpoints as though they are available to `apps/gateway-ui`. Repository inspection found no route handlers or SSE publisher in `gateway/`, `services/extmcp/`, or `observability/`. The only gateway code in this area is the agentgateway config and mock interceptor; Team 2 and Team 5 expose in-process Rust APIs.

The contracts directory previously contained only a README declaring the schema draft and not frozen. Accordingly, the OpenAPI and fixtures added with this ADR are **proposal/mock artifacts**, not evidence of reachable routes.

## Verified backend shapes

| Capability | Current in-process API / payload | Missing wire behavior |
|---|---|---|
| Decision audit | `axiom_audit::AuditEvent`: `timestamp_rfc3339`, `request_id`, `trace_id`, `agent_id`, `target_server`, `tool_name`, `runtime_mode`, `decision`, `policy_version`, optional `denial_reason`, `validator_summary`, `kill_switch_active`, `latency_us` | No local SSE route/publisher. Does not contain `cimd_uri`, `rfc8707_aud_matched`, per-call extracted validator details, active policy name, or `latency_ms`. |
| Kill-switch audit | Separate `KillSwitchAuditEvent`: `event_type`, timestamp, action, target kind/id, actor, redacted reason, previous/current versions, outcome, source, optional request ID | No union/SSE contract connects this shape to `AuditEvent`. |
| Policy dry-run | `PolicyApiServer::validate_policy_candidate(sources, schema)` returns `ValidationReport { valid, errors, version_would_be }` | In-process only; it validates Cedar syntax/schema. It does not evaluate a sample MCP request, return `ValidatorResult`/`PolicyResponse`, or expose REST. |
| Policy reload | `PolicyApiServer::trigger_reload()` loads server-side `.cedar` files and returns `PolicyVersionInfo { version, loaded_at_unix, policy_count }` | In-process only; no uploaded bundle, route mode update, HTTP response, or endpoint. |
| Revocation | `KillSwitchService::revoke/clear/apply` accepts a typed command; `RevocationState` has target kind/id, revoked flag, version, effective time, reason | In-process only; no REST route. Existing kinds are `global`, `mcp_server`, `agent`, and `tool`; `session_id` is not a target kind. `AdminActionResult` is not a serialized HTTP DTO. |

## Decision / recommendation

1. Keep the planned endpoint paths as draft targets, with `x-axiom-status: proposal-not-implemented` in the OpenAPI document.
2. Keep verified Rust DTO schemas separate from proposed transport request/response schemas. Do not project absent identity/validator fields into the existing `AuditEvent` type.
3. Treat `events/stream` as a discriminated audit stream proposal (`decision` and `kill_switch_action` event shapes) only after Teams 1 and 5 agree on ordering, replay IDs, backpressure, heartbeats, and connection-loss semantics.
4. Teams 1/2/4 must agree on whether policy dry-run only validates a candidate bundle or also evaluates a sample MCP call and emits validator/policy results. The current in-process implementation supports validation only.
5. Teams 1/2 must agree on whether bundle changes accept policy text, reload server files, change route mode, or all three. The current API only reloads server files.
6. Teams 1/2/5 must decide whether the revoke route is specifically an agent session action or a generic target command. The current backend has no session target and no actor/authentication contract for a browser-triggered revocation.
7. Teams 3/5 must propose a source for the requested identity and validator details (`cimd_uri`, RFC 8707 match, tool pin and extracted argument facts); these are not in current decision audit events.

## Consequences

- Draft OpenAPI, TypeScript declarations, schemas, and fixtures are suitable for interface review and UI mock development only. Production clients must remain behind a typed API adapter until a backend route is implemented and tested.
- Existing in-process DTOs remain the ground truth for current payload fields.
- Team 6 needs live-route compatibility tests before any endpoint can be marked implemented/frozen.
- No Gate G1 API availability claim can be made from Rust library tests or mock gateway tests.

## Review requested

Teams 1, 2, 3, 4, 5, 6, 7, and 8: review the exact gaps and proposed route semantics before Team 0 freezes a version. The architecture decisions README contains the outstanding cross-team queue.
