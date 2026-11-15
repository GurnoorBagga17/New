# Architecture decision records

Record decisions that affect multiple teams here. Each ADR should include status, context, decision, consequences, affected teams, and contract/version impact.

Initial ADRs to write before freezing shared contracts:

1. Upstream agentgateway and ExtMCP protocol revision.
2. Axiom context transport from gateway to ExtMCP.
3. Observe-only decision and timeout semantics, including kill-switch precedence.
4. Shared schema representation, serialization, and compatibility/version policy.
5. Request ID, trace ID, session, and multi-target fanout behavior.

## Current proposals

- [ADR 001 — Local admin API contract status](001-local-admin-api-contract-gap.md): records the missing `/v1/local/*` handlers, verified in-process payloads, and cross-team decisions required before freezing frontend contracts.
- [ADR 002 — Frontend verdict and safety semantics](002-frontend-verdict-and-safety-semantics.md): proposed badge mapping, unknown-state fallback, timeout copy, and unresolved emergency-revocation precedence.
- [ADR 003 — Token contrast and delivery](003-token-contrast-and-delivery.md): documents contrast-driven palette changes and the review boundary for generated token outputs.
