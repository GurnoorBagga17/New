# Phase 1 team kickoff prompt

Copy the **Shared kickoff** section and append exactly one **Team assignment** block before giving it to a team. Send each team only its own assignment. Team 0 retains the shared contract and architecture decisions.

## Shared kickoff

```text
You are working as Team [TEAM NUMBER] on Axiom NHI Phase 1. Your goal is to prepare and deliver your team's first useful, reviewable implementation slice for Gate G1, the 90-day MCP runtime security wedge.

Start by reading these repository files:
- README.md
- axiom_nhi_phase_1_team_implementation_playbooks.md
- docs/architecture/phase1-bootstrap.md
- docs/architecture/runtime-pipeline.md
- docs/api-contracts/README.md
- your team's README.md and any files under your owned directories

Working rules:
1. Work in your team's CODEOWNERS paths. Do not edit another team's implementation area. Coordinate cross-team needs through an interface proposal and name the affected owners.
2. Treat shared APIs as draft v0.1.0-draft. Do not claim they are frozen, generate production bindings from them, or silently invent incompatible payloads. Identify the exact contract changes you need and why; Team 0 will coordinate downstream review and versioning before freeze.
3. Resolve implementation details with reversible choices where possible. If an unresolved contract decision blocks safe integration, keep progressing on independent work and report the blocker with options and a recommendation.
4. Keep Phase 1 limited to the MCP runtime wedge: gateway, identity, validation, Cedar authorization, audit/telemetry, emergency revocation, and QA. Do not add Phase 2 discovery/graph connectors, Phase 3 token exchange/approval workflows, or Phase 4 fleet dashboards.
5. Preserve the security boundaries: raw bearer tokens and secrets never enter logs or fixtures; validators report facts rather than authorization policy; policy code consumes structured facts rather than parsing raw SQL/paths; enforce mode fails closed on unavailable required decisions; audit I/O stays off the inline path; revocation blocks new calls and does not cancel already-running upstream work.
6. Keep work small and reviewable. Add or update tests for behavior you implement in your owned area. Do not report a test or benchmark as passing unless you ran it and can provide the command and result.

First inspect the repository and report briefly:
- What exists already in your owned paths.
- The smallest valuable first slice you will deliver and its acceptance criteria.
- Dependencies and interface assumptions, including contract changes needed from Team 0 or other teams.
- Failure behavior and security concerns for that slice.
- Files you plan to create or change.

Then implement the independent, in-scope parts of that slice in your owned paths. Keep any part that depends on an unapproved shared-contract change behind a clearly marked draft or mock boundary. At the end, summarize files changed, commands run and their results, unresolved decisions, and the next owner/action. Do not edit shared contracts or protocol files unless you are Team 0 or have an approved cross-team change.
```

## Team assignments

Append only the block matching the recipient team.

### Team 1 — MCP gateway and runtime infrastructure

```text
TEAM ASSIGNMENT — Team 1
Own: gateway/ and deployments/docker/.
Mission: Package agentgateway as the MCP interception and enforcement boundary. Support the planned stdio and Streamable HTTP transports; route relevant MCP methods through ExtMCP; support observe-only and enforce modes; provide the outbound egress enforcement boundary; prepare Docker packaging.

First slice:
- Select and record a specific upstream agentgateway release and its matching ExtMCP protocol source revision.
- Create a minimal local configuration/prototype for one MCP backend and the remote ExtMCP request hook. Do not invent Axiom fields in the upstream proto; report how gateway context can be conveyed using supported metadata and selected headers.
- Define the gateway behavior matrix for permit, deny, timeout/unavailable, and active kill switch in both runtime modes. Flag the observe-only versus emergency-kill-switch conflict for Team 0.
- Identify how a hard 15 ms callout deadline is configured and how it relates to the successful-path <5 ms target.
- Keep JWT verification, argument parsing, Cedar rules, and audit file writing in their owning teams.
Acceptance: version/source pin documented; a minimal config validates or runs against a mock MCP backend and mock ExtMCP; behavior and remaining blockers are documented. Do not claim full Docker deployment is ready from a mock-only slice.
```

### Team 2 — ExtMCP policy engine and authorization

```text
TEAM ASSIGNMENT — Team 2
Own: services/extmcp/authorization/, services/extmcp/cedar/, and services/extmcp/policy-api/.
Mission: Orchestrate revocation, identity, validation, and deterministic Cedar authorization behind the ExtMCP service boundary.

First slice:
- Propose the internal CheckRequest pipeline and typed seams for Teams 3, 4, and 5 without reimplementing their responsibilities.
- Draft the Cedar entity/action/resource schema and a minimal policy snapshot lifecycle, including deterministic policy versioning and error behavior.
- Specify whether policy evaluation returns only Permit/Deny and the gateway derives WouldDeny in observe-only, or whether WouldDeny is part of the policy response. Recommend one model and explain how it handles policy errors and callout timeouts.
- Define what inputs you need from the Axiom domain contract and the upstream ExtMCP hook; do not assume the upstream wire message already contains all seven Axiom structs.
- Do not parse SQL or paths, verify JWTs, own revocation storage, or emit audit logs here.
Acceptance: mockable policy orchestration and schema proposal, with explicit missing-context and policy-load failure semantics. Hold wire integration that depends on Team 0's unapproved mapping.
```

### Team 3 — Identity and authentication

```text
TEAM ASSIGNMENT — Team 3
Own: identity/oauth/, identity/cimd/, and identity/resource-indicators/.
Mission: Verify MCP client identity and target audience and produce the agreed IdentityContext for Team 2.

First slice:
- Define an IdentityVerifier interface, typed success/failure results, and a claims-to-IdentityContext mapping.
- Document bearer-header handling, JWT signature/expiry/nbf checks, bounded clock skew, JWKS caching, audience/resource binding, and the planned CIMD lookup/cache boundary.
- Identify gateway inputs required and propose safe behavior when the bearer header, session, target server, required claims, or network dependency is missing.
- Identify SSRF protections needed for remote metadata/JWKS fetches and how secrets or token contents stay out of logs.
- Do not decide tool permissions, interpret validator facts, implement RFC 8693 exchange, or add cloud IAM connectors.
Acceptance: interface and failure matrix reviewed with Teams 1 and 2; an independently mockable identity slice in the owned paths. Clearly mark any unapproved contract dependency.
```

### Team 4 — Argument security and tool integrity

```text
TEAM ASSIGNMENT — Team 4
Own: validators/sql/, validators/filesystem/, validators/egress/, and validators/tool-pinning/.
Mission: Provide deterministic, preferably pure validation functions that return factual normalized results for Team 2 and socket constraints for Team 1.

First slice:
- Propose function inputs/outputs and violation semantics for SQL AST classification, filesystem path normalization, egress destination checks, and RFC 8785/JCS tool-definition pins.
- Choose an initial vertical slice that can be isolated and mock-tested; document its supported input shape and known limits.
- Define how egress validation communicates resolved IP pins and redirect constraints to Team 1 so enforcement occurs at connection time.
- Keep allow/deny authorization policy in Team 2. Do not intercept HTTP directly or use fragile regexes as a substitute for parsers/canonicalization.
- Identify contract fields you need beyond the draft ValidatorResult, with proposed types and reasons.
Acceptance: pure entrypoint/interface proposal plus one focused validator slice and a security regression corpus plan. Do not claim broad adversarial coverage without evidence.
```

### Team 5 — Observability, audit, and emergency controls

```text
TEAM ASSIGNMENT — Team 5
Own: observability/opentelemetry/, observability/audit/, and observability/kill-switch/.
Mission: Propagate trace context, emit redacted audit events asynchronously, and provide fast revocation state for Team 2 and the gateway.

First slice:
- Define the revocation lookup/update API, key precedence (agent, tool, server, global), state versioning, stale/unavailable behavior, and expected propagation measurement.
- Specify bounded, non-blocking audit delivery and redaction rules for bearer credentials, secrets, PII, and sensitive tool arguments.
- Define how kill-switch actions are audited and how the state reaches the ExtMCP decision path without making Team 2 own storage.
- Surface the open question of whether kill-switch denial overrides observe-only behavior; give a clear recommendation for Team 0.
- Keep Phase 1 local controls only; no SIEM/SOAR, Slack workflow, Postgres history, or mid-flight cancellation.
Acceptance: API/event proposal, failure and redaction matrix, and a mockable initial slice. Report how latency and propagation will be measured without claiming an unrun result.
```

### Team 6 — QA, reliability, and security testing

```text
TEAM ASSIGNMENT — Team 6
Own: tests/integration/, tests/security/, tests/performance/, and tests/failure-injection/.
Mission: Independently verify Gate G1 behavior across normal requests, adversarial inputs, and infrastructure failures.

First slice:
- Create an acceptance matrix separating observe-only and enforce outcomes for permit, deny, identity failure, validator failure, ExtMCP timeout/unavailable, policy-load failure, and kill switch.
- Define assertions over parsed MCP/JSON-RPC payloads, whether the backend side effect executed, and corresponding redacted AuditEvent. HTTP 200 alone is not a sufficient denial assertion.
- Plan attack cases for stacked/CTE SQL, path and symlink escape, private-IP SSRF, DNS rebinding, and tool-definition mutation.
- Define reproducible p50/p95/p99 measurements and separate successful-path latency from timeout/failure paths. Define kill-switch propagation measurement and clean-host deployment acceptance.
- Do not fix product bugs in implementation directories; file a reproducible failing test and assign it to the owning team.
Acceptance: reviewed Gate G1 matrix, mock fixtures or harness plan, and explicit dependencies on the draft contracts. Keep assertions adaptable until Team 0 freezes decision semantics.
```

## Sending checklist for Team 0

- Confirm the recipient team and current CODEOWNERS aliases.
- Include the shared kickoff text and only that team's assignment block.
- Ask each team to identify cross-team contract needs early; collect the answers before freezing `0.1.0`.
- Record decisions in `docs/architecture/decisions/`, notify downstream owners, and version the contracts before asking consumers to integrate against a frozen interface.
