# Phase 1 bootstrap and team handoff

**Status:** Bootstrap draft, 2026-11-14  
**Milestone:** Gate G1, 90-day runtime wedge  
**Source plans:** `Axiom_NHI___Final_Win_Master_Plan.pdf` and `axiom_nhi_phase_1_team_implementation_playbooks.md`

## What is set up

- Team ownership is recorded in `.github/CODEOWNERS`.
- Each implementation team has its planned directory tree and a short local handoff README.
- The integration flow and boundary conditions are summarized in [the runtime pipeline](runtime-pipeline.md).
- Shared API contracts are explicitly marked draft in `docs/api-contracts/README.md`.

This is a starting point for implementation teams, not a claim that the architecture or contract is frozen. Before consumers generate code or implement against an interface, Team 0 should review the decisions below with the affected leads and version the approved contract.

## First work for each team

| Team | Initial deliverable | Must agree with |
| --- | --- | --- |
| 1 — Gateway | Choose and pin the upstream agentgateway release; prove the MCP interception and ExtMCP callout shape in a minimal local config. | Team 0 protocol mapping; Team 2 callout behavior; Team 5 runtime mode and revocation behavior |
| 2 — Policy | Define the ExtMCP request orchestration boundary and Cedar schema/policy snapshot design. | Team 0 contract; Teams 3 and 4 adapters; Team 5 revocation API |
| 3 — Identity | Specify the verifier interface and claims-to-`IdentityContext` mapping. | Team 0 contract; Team 1 header handoff; Team 2 enforcement behavior |
| 4 — Validators | Specify pure validator entrypoints and normalized result/error semantics for SQL, path, egress, and tool pins. | Team 0 contract; Team 2 Cedar context; Team 1 socket enforcement handoff |
| 5 — Observability | Specify revocation read/update semantics, audit redaction, and non-blocking event delivery behavior. | Team 0 pipeline; Teams 1 and 2 integration points; Team 6 assertions |
| 6 — QA | Turn the threat cases and Gate G1 outcomes into an independent acceptance matrix. | All team contracts and observable decision semantics |

## Decisions to resolve before contract freeze

1. **ExtMCP protocol mapping:** The upstream protocol is a method-level request/response hook. It carries MCP method, target names, optional request params, selected headers, and response result; it does not directly carry all seven Axiom domain structs. Define how Axiom context travels through filtered headers and/or `metadata_context`, which gateway configuration populates.
2. **Request identity:** The playbook makes `mcp_session_id`, `trace_id`, and a generated `request_id` required, but does not define behavior when headers are absent, requests are notifications, or upstream multiplexing fans out.
3. **Observe-only semantics:** The gateway must forward when the policy denies or times out in observe-only, while still producing a distinct shadow decision. Define the ExtMCP response/error representation for a hypothetical denial that must not block.
4. **Decision model:** `WouldDeny` is listed in the shared `PolicyResponse`, while the pipeline says Team 2 returns Permit/Deny and Team 1 applies runtime mode. Choose one source of truth so policy evaluation does not depend on gateway mode accidentally.
5. **Kill switch:** **Resolved for Phase 1 primary-reason selection:** `global > mcp_server > agent > tool`. Every matching revocation blocks; precedence selects only the primary reported reason. The lookup is split into pre-identity (global/server/tool) and post-identity (agent) checks. Per-token `jti` revocation is deferred. Stale/unavailable-state and propagation behavior remain in Team 5's API contract and must be reviewed before freeze.
6. **Latency and deadlines:** The plans set a 15 ms gateway callout deadline and a `<5 ms` inline target. Agree whether the 5 ms target excludes the bounded timeout/failure path and publish p50/p95/p99 definitions.
7. **Tool methods:** The plan lists interception for `tools/call`, `tools/list`, `prompts/get`, and `resources/read`, but only `tools/call` is explicitly tied to the seven typed contracts. Define required method-specific fields and fail behavior.
8. **Upstream pin:** **Resolved:** agentgateway `v1.7.0`; the upstream ExtMCP source is checked in at `proto/ext_mcp.proto` and described in `gateway/agentgateway/UPSTREAM_PIN.md`.
9. **Audience resource identifier:** **Resolved for Phase 1:** each routed MCP server has one configured canonical resource URI; the gateway passes that URI to identity verification, and the JWT `aud` claim must contain an exact string match. Bare display names and URI suffix matching are invalid. The current gateway/runtime adapter still needs to supply this canonical value.

## Repository onboarding sequence

1. Confirm the GitHub organization and team slugs match `.github/CODEOWNERS`.
2. Confirm the community license and DCO/CLA mechanism before enabling external contribution checks.
3. Have Teams 1–5 review the contract decisions that affect their interface; have Team 6 review the acceptance semantics.
4. Record decisions as ADRs, bump the shared schema version, and only then mark contracts frozen.
5. Each team starts with a vertical, mockable slice in its owned directory and adds tests to its own suite; Team 6 owns cross-subsystem and adversarial acceptance tests.

## Out of scope for this bootstrap

This document records the initial bootstrap. Subsequent repository work has added component code, tests, and deployment drafts; see the [current audit](phase1-audit-report.md) for implementation status. Phase 2–4 work stays deferred as described in the source plans.
