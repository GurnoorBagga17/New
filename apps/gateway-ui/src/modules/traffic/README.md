# Module 1B — Live MCP Traffic

**Status:** UI implementation present; backend transport and throughput acceptance are outstanding.  
**Contract:** current Rust audit DTO shape, version `0.1.0-draft`; not frozen.  
**Backend source:** `observability/audit/src/event.rs`.

## Behavior

- Same-origin `GET /v1/local/events/stream`, listening for SSE `audit` records and `ping` heartbeats. No route or SSE publisher is currently implemented in the backend.
- 2,000-event Zustand ring buffer; events are flushed in 16 ms batches. The table is virtualized with TanStack Virtual/Table.
- Connection, stale, and malformed-payload states are transport states. A disconnect does not imply the backend failed closed or blocked a tool call.
- Before buffering, the SSE hook rejects payloads matching the shared secret patterns and validates the required current `AuditEvent` fields. It does not log raw payloads or parser errors.
- The inspector uses only current audit DTO fields. CIMD, RFC 8707, normalized validator facts, and kill-switch action details remain absent until a reviewed producer/contract exists.
- A separate `kill_switch_action` fixture exists, but the current UI adapter does not consume it.

## Not yet proven

Virtualization and batching are implemented, but 500+ events/sec at 60 FPS and a <16 ms frame budget have not been measured. The production artifact passes the configured initial-JS budget and static air-gap scan; these do not replace browser/network or runtime throughput tests.

## Commands

From the repository root:

```powershell
pnpm --filter @axiom/gateway-ui test
pnpm --filter @axiom/gateway-ui build
python docs/architecture/scripts/check_gateway_ui_offline.py
```

The unit suite currently includes 17 shared secret-pattern/DOM/storage scanner tests. No live SSE integration test is possible until the backend route exists.
