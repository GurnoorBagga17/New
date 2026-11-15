# Axiom shared and local API contracts

**Contract status: DRAFT / PROPOSAL — not frozen and not all implemented.**  
**Current schema label:** `0.1.0-draft`  
**Audit date:** 2026-11-15

## Read this before integrating

The endpoint paths in the Phase 1 plan are not present in the backend repository. `gateway/` contains agentgateway configuration and mock interception code, not `/v1/local/*` handlers. Team 2 policy methods and Team 5 revocation methods are in-process Rust APIs. There is no audit SSE publisher. The [backend reconciliation ADR](../architecture/decisions/001-local-admin-api-contract-gap.md) records exact implemented DTO shapes and endpoint mismatches.

The OpenAPI and example requests/responses here are **proposals for interface review and mock-only frontend development**. Every endpoint has `x-axiom-implementation-status: proposal-not-implemented`. Do not use them to claim wire compatibility or mark contracts frozen. The `current-*` schemas and TypeScript interfaces represent actual Rust DTOs; proposal DTOs are separately named.

## Files

- `local-admin-api.openapi.yaml` — draft surface for the four planned loopback routes, with implementation status on each operation.
- `types.ts` — current Rust DTOs plus separately named draft transport types and the proposed UI projection.
- `schemas/` — JSON Schemas for existing audit, policy and revocation structures; proposed endpoint schemas are called out explicitly.
- `fixtures/` — fake, non-secret proposal fixtures for every route and an SSE stream. These are not responses captured from a running service.
- `secret-patterns.json` — fake canary values and patterns for shared redaction/DOM/network tests.
- `mock-sse-server-spec.md` — disabled-by-default development SSE mock requirements.

## Current verified shapes

- `AuditEvent` is the decision event in `observability/audit/src/event.rs`; it reports `latency_us`, not `latency_ms`, and currently has no CIMD, audience-match, or detailed validator attributes.
- `KillSwitchAuditEvent` is a separate event shape. No wire union exists.
- Team 2 `ValidationReport` is only `{ valid, errors, version_would_be }`; it does not contain a simulated `PolicyResponse` or `ValidatorResult`.
- Team 2 `PolicyVersionInfo` is `{ version, loaded_at_unix, policy_count }`; reload loads server-side files.
- Team 5 `RevocationState` supports `global`, `mcp_server`, `agent`, `tool`; it has no session kind. The admin service is in-process and its `AdminActionResult` is not a serialized HTTP response.

## Freeze checklist

- [ ] Teams 1, 2, 4, 5 agree route semantics, ownership, request/response shapes and error envelope.
- [ ] Teams 3, 4, 5 decide what redacted identity/validator facts may enter the decision stream.
- [ ] Teams 1, 2, 5, 6 resolve observe-only vs. emergency revocation (D3) and confirm actual gateway behavior.
- [ ] Resolve IDs, actor identity, session target support, request correlation, SSE replay/backpressure and version preconditions.
- [ ] Validate every schema/fixture against a live route and add Team 6 compatibility tests.
- [ ] Obtain downstream Team 1–8 review, version any contract change, and then remove `proposal-not-implemented` only for proven routes.

No endpoint or schema in this folder should be described as frozen until every checklist item relevant to it has evidence and owner review.
