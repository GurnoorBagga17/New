# Axiom NHI Gateway UI

Standalone React console source for the embedded Community Runtime Console. It is built for same-origin serving by the gateway; this repository does not currently wire a production binary/container to serve the bundle or implement the four planned `/v1/local/*` routes.

## Current modules

- **Module 1B — Traffic:** virtualized audit-event table, bounded 2,000-event buffer, 16 ms batching, inspector drawer, reconnect status, and shared-pattern/schema checks before SSE events enter UI state. The browser adapter targets `/v1/local/events/stream`; the route is not implemented here.
- **Module 1C — Policy Studio:** available from the console navigation and lazy-loaded. Dry-run and activation use the proposed same-origin API adapter; no live route exists in the backend yet. Responses must not be described as live policy decisions until integrated.
- **Module 1D — Audit explorer:** filter the current bounded event buffer and export redacted CSV or NDJSON. Export rejects secret-pattern matches and protects CSV cells from formula injection. The planned two-step revoke action remains unavailable because the backend route and session/actor semantics are not implemented; no revoke request is sent.

The current decision audit DTO is defined in [`docs/api-contracts/types.ts`](../../docs/api-contracts/types.ts). It does not include CIMD URI, RFC 8707 match, normalized validator facts, or the separate kill-switch action event. Those fields are intentionally not fabricated in the inspector. All four HTTP/SSE proposals remain marked `proposal-not-implemented`.

## Design and security

- Tailwind CSS v4 and variables generated from the root `tokens.json`; local variable WOFF2 fonts are bundled.
- `MotionConfig reducedMotion="user"`; animated properties are limited to transform and opacity.
- CSP keeps scripts, connections, and assets same-origin. A static build scan rejects external URL/request references, with exact allowlisted inert documentation and SVG namespace strings.
- Audit SSE payloads that match the shared secret-pattern list or fail the current Rust DTO shape are rejected before buffering. Parser/payload contents are not logged.
- No raw secret values belong in fixtures, DOM, storage, browser logs, clipboard, or audit events.

## Local commands

From the repository root:

```powershell
pnpm --filter @axiom/gateway-ui dev
pnpm --filter @axiom/gateway-ui typecheck
pnpm --filter @axiom/gateway-ui lint
pnpm --filter @axiom/gateway-ui test
pnpm --filter @axiom/gateway-ui build
python docs/architecture/scripts/check_frontend_budgets.py
python docs/architecture/scripts/check_gateway_ui_offline.py
```

Current local results are recorded in [`docs/architecture/phase1-audit-report.md`](../../docs/architecture/phase1-audit-report.md). The initial JS budget passes; the separately lazy-loaded Monaco setup chunk is about 695.8 KiB gzip and needs optimization for constrained first-use conditions. No 500 events/sec or 60 FPS result has been measured.
