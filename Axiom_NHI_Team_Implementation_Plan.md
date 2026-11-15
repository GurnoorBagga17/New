# Axiom NHI — Team Implementation Plan

**Purpose:** Convert the strategic Master Plan into an executable, evidence-based delivery plan for engineering, product, QA, security, and go-to-market teams.

**Planning baseline:** Re-baseline at approval as **Week 0**. Estimates below are relative, since team capacity, staffing, partner availability, and prior work completion have not been confirmed. The current repository audit says Gate G1 is not passed. Existing source files, tests, fixtures, mock services, and deployment manifests are not counted as shipped capabilities until they pass the acceptance criteria in this plan.

**North-star decision:** Deliver and validate one narrow, reliable MCP runtime-security wedge before expanding into the broader NHI control plane. Keep G2–G4 work behind explicit gates.

## 1. Executive delivery decision

The first release objective is **G1: a deployable runtime security gateway** that can observe safely, enforce deterministically, validate caller identity and tool arguments, emit redacted audit events, and revoke access promptly. Today the repository has a substantial frontend and component-level code, but no verified production request path assembled across gateway, ExtMCP, identity, validators, policy, audit, and revocation. Local admin API routes are still proposal-only, and the Docker Compose topology is not a runnable full stack.

Therefore:

1. Spend the first 90-day delivery window closing G1, not expanding feature breadth.
2. Freeze shared interfaces and runtime semantics before teams implement against them.
3. Make Team 6 independent of implementation teams for acceptance, adversarial, chaos, and performance evidence.
4. Advance to each subsequent phase only after the preceding gate has a signed evidence packet and an explicit go decision.
5. Keep product, legal, partner, and commercial work active in parallel where it does not create engineering scope churn.

## 2. Outcome and scope

### G1 — Runtime wedge MVP (Weeks 1–12)

**In scope:** single-cluster deployment; agentgateway MCP interception; ExtMCP policy callout; observe-only and enforce modes; Cedar policy evaluation; OAuth/JWT/JWKS and RFC 8707 audience validation; SQL, filesystem, egress, and tool-pinning validators; kill switch; redacted audit export/stream; local operator interface; one-command local deployment; live integration, attack, failure, latency, browser, and pilot evidence.

**Out of scope until G1:** multi-cluster control plane, broad cloud identity discovery, automated IAM rightsizing, commercial metering, managed secret lifecycle, fleet-wide delegation, compliance pack claims, and general enterprise-scale architecture. Phase 2–4 component code may be reviewed and retained, but it does not displace G1 capacity.

### G2 — Identity lineage and blast-radius intelligence (Months 3–6)

Read-only AWS IAM, Kubernetes, GitHub, and Slack discovery; tenant-scoped credential fingerprinting; ownership attribution; Postgres dependency graph; pre-revocation blast-radius simulation; risk mappings; shadow-NHI audit report and alerts.

### G3 — Secretless lifecycle and enterprise hardening (Months 6–9)

OpenBao lease integration; RFC 8693 token exchange with scope attenuation and audience binding; dual-secret rotation; payload-bound single-use approvals; SIEM/SOAR streaming; independent security assessment and remediation.

### G4 — Fleet governance and commercial scale (Months 9–18)

SpiceDB-backed delegation and causal revocation; multi-cluster canary control; IAM rightsizing recommendations; spend safeguards; verifiable signed AI-BOM and compliance evidence; customer-VPC/air-gapped Helm deployment; repeatable onboarding, pricing, and support motion.

## 3. Team ownership and decision rights

Use current team labels from the repository playbooks. A named person should be assigned as accountable lead for each row in Week 0. Team 0 owns cross-team architecture decisions; it does not implement other teams’ subsystems. Team 6 owns independent acceptance and can block a gate on missing evidence.

| Team | Accountable area | Primary ownership | Gate participation |
|---|---|---|---|
| **0 — Architecture / integration** | Chief architect / technical lead | Versioned contracts, ADRs, pipeline semantics, dependency map, cross-team integration, release architecture | All gates; owns decision log |
| **1 — Gateway / runtime infrastructure** | Gateway lead | agentgateway pin/configuration, MCP interception, ExtMCP callout and timeout, mode behavior, egress enforcement boundary, Docker deployment | G1 lead; G2–G4 deployment integration |
| **2 — Policy / ExtMCP** | Authorization lead | ExtMCP service, identity/validator orchestration, Cedar schema and policies, policy bundle load/reload, dry-run and policy APIs | G1 lead; policy services in G2–G4 |
| **3 — Identity** | Identity lead | OAuth/JWT/JWKS verification, CIMD-safe resolution/cache, RFC 8707 audience binding, identity context | G1; RFC 8693 in G3 |
| **4 — Validators / tool integrity** | AppSec lead | SQL AST, path, egress, tool-definition pinning; normalization and adversarial unit cases | G1; connector enforcement support later |
| **5 — Observability / revocation** | Reliability lead | Kill-switch state/read/update APIs, propagation, audit redaction and persistence, SSE, traces/metrics | G1; SIEM/SOAR in G3 |
| **6 — QA / security assurance** | Independent QA lead | Acceptance matrix, live-stack tests, attack suite, chaos/failure injection, performance and release evidence | Independent gate sign-off |
| **7 — Gateway UI / policy editor** | Frontend lead | Traffic stream, policy studio, audit explorer/export, local operator workflows, browser safety/performance | G1 operator usability; later control-plane UX |
| **8 — Public web / developer experience** | Developer experience lead | Landing page, quickstart, docs, benchmarks, accessibility and web performance | G1 documentation/demo; ongoing |
| **Product / GTM / Legal** | Product owner, partner lead, counsel | ICP and use cases, design partners, pilot protocol, pricing research, trademarks/domains, license/provenance, support readiness | G1 pilots; G2–G4 commercial gates |

**Decision rule:** Interface or policy-semantics changes require Team 0 review and affected-team approval. Security semantics require Team 6 review. A gate is not passed by feature owner self-attestation.

## 4. Delivery cadence and controls

- **Weekly planning:** team leads commit to a small set of observable outcomes and update blockers/dependencies.
- **Twice-weekly integration review:** Teams 0–6 resolve interface and runtime issues; Teams 7–8 join when their contracts or product behavior are affected.
- **Weekly security review:** Teams 0, 2, 3, 4, 5, and 6 review threat cases, trust boundaries, and unresolved risk.
- **End-of-sprint demo:** show behavior running in the integrated stack, not isolated screenshots or mocks.
- **Release evidence ledger:** Team 6 maintains the gate checklist, commands, environment/configuration, raw result locations, owner, date, and pass/fail decision.
- **Risk register:** every risk has an owner, likelihood, impact, mitigation, and trigger. Escalate any risk that threatens a gate within one working day.
- **Scope rule:** no Phase 2–4 feature enters G1 unless it is necessary for G1 acceptance and Team 0 approves the scope change.

Suggested sprint length: two weeks. No sprint is “done” until code is integrated, locally reproducible, reviewed by the code owner, and covered by the level of test appropriate to its contract.

## 5. G1 execution plan — Weeks 1–12

### Workstream A — Baseline, architecture, and contracts (Weeks 1–2)

**Owner:** Team 0; contributors: Teams 1–6; QA review: Team 6.

1. Inventory every G1 requirement against current code. Mark each item `implemented and integrated`, `component only`, `proposal/mock`, or `missing`.
2. Reconcile the Master Plan, bootstrap notes, phase playbooks, test matrix, OpenAPI, fixtures, code, and current audit. Resolve contradictory targets and mark superseded values.
3. Freeze versioned contracts for RuntimeRequest, IdentityContext, ValidatorResult, PolicyRequest/Response, AuditEvent, RevocationState, ExtMCP metadata mapping, local REST/SSE routes, and errors.
4. Resolve and record ADRs for observe-only behavior, kill-switch precedence and availability, `WouldDeny` representation, non-`tools/call` errors, request/trace/session IDs, canonical resource URI, and latency measurement boundaries.
5. Publish the end-to-end sequence and failure behavior: revocation check; identity; validators; Cedar; gateway decision; async audit.
6. Establish CODEOWNERS and schema versioning; document backward compatibility and the process for contract changes.

**Exit criteria:** all consumer teams approve contracts; no unresolved decision changes the meaning of permit/deny, revocation, observe-only, or audit; Team 6 signs off the G1 acceptance matrix; every G1 requirement has one owner and evidence method.

### Workstream B — Assemble the runtime vertical slice (Weeks 2–6)

**Owner:** Team 1 integration lead; feature owners: Teams 1–5.

- **Team 1:** pin and package agentgateway; prove interception for in-scope MCP methods; normalize target, method, tool, session, and correlation fields; call ExtMCP over the selected transport; enforce a hard 15 ms callout deadline; implement mode-correct forwarding/denial; enforce egress at the actual outbound socket/DNS boundary; produce a runnable Compose profile.
- **Team 2:** make the ExtMCP request path invoke the real identity and validator adapters, build Cedar context, load/validate policies, make deterministic decisions, and expose policy dry-run/bundle routes. Enforce-deny on missing required context or corrupt policy. Keep transport mode handling at the agreed boundary.
- **Team 3:** complete issuer/JWKS configuration and reload behavior; verify signature, expiry, issuer, client, and exact audience; harden CIMD fetch/cache against SSRF, redirect, DNS rebinding, and unsafe cache behavior; return a typed failure without leaking credentials.
- **Team 4:** replace any placeholder checks with vetted parsers/canonicalizers; implement SQL AST classification, path confinement, egress destination validation, and tool pinning; define validator failure behavior and normalized structured results.
- **Team 5:** provide atomic revocation read/update interfaces with state versioning; emit redacted audit asynchronously; implement local audit persistence and SSE/admin transport; define degraded-state behavior and measure propagation.
- **Teams 7–8:** wire UI against frozen local API contracts; label simulations and unavailable operations honestly; add operator-facing mode and stream status; complete quickstart and API docs only against working routes.

**Exit criteria:** from a clean checkout, one documented command starts the integrated stack; a real MCP request traverses gateway → ExtMCP → identity/validators/policy → mock backend; live audit is produced; no subsystem is substituted by an in-memory test-only mock in the release path.

### Workstream C — G1 behavior, security, and reliability (Weeks 5–9)

**Owners:** Team 6 independent verification; subsystem fixes owned by Teams 1–5.

1. Execute the full acceptance matrix in the integrated stack for observe-only and enforce modes.
2. Prove a denied request cannot reach the backend and that HTTP 200 alone never counts as a successful denial assertion.
3. Inject ExtMCP timeout/unavailability, corrupt policy, identity/JWKS failure, audit sink failure, revocation store failure, restart, and network partition.
4. Verify observe-only forwards legitimate traffic and records shadow decisions; verify enforce mode fails closed for required security failures.
5. Attack JWT audience binding, CIMD SSRF/redirect/rebinding, SQL AST parsing, path traversal/symlinks, DNS rebinding, tool-definition changes, duplicate headers, malformed JSON-RPC, and secret leakage.
6. Scan every audit/event/error/log path for bearer token, JWT, raw secret, and credential leakage. Confirm denial responses do not disclose policy internals or sensitive arguments.
7. Benchmark separately: successful authorization evaluation, gateway callout overhead, deny path, 15 ms timeout path, and kill-switch propagation. Publish environment, sample size, p50/p95/p99, load, and raw results.
8. Add resource limits, readiness/liveness checks, TLS/mTLS deployment guidance, configuration validation, migration/rollback procedure, and safe upgrade behavior.

**Exit criteria:** no open critical/high exploitable findings without a signed exception; all release-blocking acceptance and failure cases pass; observed metrics satisfy approved SLOs under documented test conditions; Team 6 signs the report.

### Workstream D — Operator UI, docs, packaging, and release candidate (Weeks 7–10)

**Owners:** Teams 1, 5, 7, 8; Team 6 verifies.

- Wire traffic, policy dry-run, audit search/export, and kill-switch controls to live APIs. Remove mock fallbacks from release configuration or make them visibly demo-only.
- Verify accessible keyboard operation, contrast across rendered components, reduced motion, responsive layouts, and browser Core Web Vitals with a documented tool/browser matrix.
- Optimize the large Monaco editor setup chunk before relying on the editor in constrained or air-gapped environments.
- Build and inspect offline/air-gap behavior using browser network traces, not only static string scans.
- Produce install, upgrade, rollback, backup/restore, configuration, troubleshooting, security, privacy, and data-retention docs.
- Create a signed release candidate with SBOM, provenance, license notices, dependency audit, image digests, and rollback artifacts.

### Workstream E — Design-partner pilot and G1 gate (Weeks 9–12)

**Owners:** Product/GTM and Team 1 deployment; Team 6 independent evidence; Teams 0–5 on call.

Run the plan’s 30-day partner protocol: observe-only deployment; shadow audit; limited enforce guardrails on agreed high-risk tools; red-team/tabletop and close. Target five partners, but do not manufacture a pass if fewer are available. Record environment, success/failure cases, false-positive disruptions, latency, security findings, operator feedback, deployment time, and willingness-to-pay evidence. Obtain written consent for any telemetry or case-study use.

**G1 go/no-go meeting:** Product, Team 0, Team 6, security lead, and release owner review the gate packet. Passing requires the G1 exit criteria below. If any criterion fails, decide whether to remediate, narrow the supported deployment profile, or keep the product in private preview. Do not market unverified SLOs or enterprise claims.

## 6. G1 acceptance checklist

Team 6 owns the definitive matrix and evidence links. Proposed thresholds below follow the current plans and audit; Team 0 must resolve inconsistencies and freeze them before benchmark work begins.

| Area | Acceptance evidence | Gate condition |
|---|---|---|
| Integrated deployment | Clean checkout, documented configuration, reproducible one-command startup, health/readiness, upgrade and rollback | No idle placeholder services in the supported profile |
| MCP routing | Live calls for every supported method/transport; correct backend selection; request correlation | No bypass path around policy decision for protected calls |
| Observe-only | 100% of valid baseline calls forwarded during policy denial, timeout, and policy load failure; shadow outcomes visible | Zero production disruption in agreed pilot baseline; emergency revocation behavior explicitly frozen |
| Enforce | Permit succeeds; deny, identity failure, validator failure, invalid policy, timeout, and revocation block before backend side effect | Every matrix case passes on live stack |
| Authorization latency | Reproducible successful-path and internal evaluation p50/p95/p99 report | Approved `<5 ms` metric is met with precise measurement boundaries |
| Callout deadline | Delayed/unavailable ExtMCP tests prove bounded 15 ms gateway deadline | No unbounded request wait; fail behavior matches mode |
| Revocation | Concurrent active calls and propagation benchmark with state version evidence | Agreed sub-second target met; target must be frozen (Master Plan and repo audit currently differ) |
| Audit and privacy | Redaction attack suite, durable local audit, stream reconnect/replay behavior, export checks | Zero raw credentials in all tested emitted fields and UI exports |
| Identity and validators | Security cases and supported profile test results | All supported cases pass; limitations documented |
| UI and web | Live API smoke tests, accessibility review, browser performance evidence | No critical operator errors; claims supported by measured results |
| Partner proof | Pilot reports and customer-approved outcomes | Plan target: five design partners; deviations disclosed and approved |
| Supply chain/legal | License/provenance/SBOM/dependency scan; trademark/domain review; contribution mechanism | Release owner and counsel sign off |

## 7. G2–G4 gated implementation plans

### G2 — Months 3–6: Lineage and blast radius

**Start condition:** G1 passed, or a deliberately narrow supported runtime profile is approved in writing with remaining risks disclosed.

**Sequence:**

1. **Connector foundation (Team 1/connector owners):** read-only AWS IAM, Kubernetes, GitHub, Slack; per-tenant least-privilege scopes; pagination/rate limits; idempotent sync; retries; connector health and revocation of connector credentials.
2. **Credential safety and entity model (Teams 0/3/4):** canonical NHI identity schema; tenant-keyed/HMAC credential fingerprints; never persist raw secret values; data retention and deletion contract.
3. **Attribution and graph (Teams 2/connector owners):** provenance-weighted owner signals; Postgres schema/migrations; idempotent ingestion; lineage edge semantics; temporal freshness and stale-data markers.
4. **Blast-radius and risk (Teams 2/6):** pre-revocation impact simulation with shared-credential siblings; deterministic OWASP mapping with versioned references; false-positive and completeness evaluation.
5. **Workflow and alerting (Teams 5/7/8):** 30-minute shadow audit job; clear evidence and owner actions; Slack/Jira deduplication; alert delivery and failure recovery.

**G2 exit criteria:** connectors pass read-only permission review; tenant isolation and deletion are verified; a representative customer inventory completes in 30 minutes; ownership attribution confidence is calibrated against reviewed samples; lineage correctly identifies shared dependencies; simulation produces no hidden sibling impact in test corpus; customer security owner approves the report and workflow.

### G3 — Months 6–9: Secretless lifecycle and hardening

**Sequence:**

1. Define supported OpenBao versions, auth methods, lease policies, storage/network boundaries, and operator ownership.
2. Implement lease broker with browser-safe metadata only; test logs, traces, errors, backups, crash dumps, and UI for secret leakage.
3. Implement RFC 8693 exchange with cryptographically verified subject tokens, audience/resource binding, actor-chain validation, strict scope attenuation, TTL ceiling, replay handling, and key rotation.
4. Implement dual-secret rotation with consumer inventory, heartbeats, grace window, rollback trigger, and auditable final revocation.
5. Implement atomic single-use approval binding to canonical exact payload, actor, expiry, tenant, and nonce; test race/replay/tampering.
6. Add OCSF/CEF streaming connectors and delivery guarantees for selected SIEM/SOAR systems.
7. Commission independent penetration test; remediate and retest all critical/high findings.

**G3 exit criteria:** no raw secret crosses the browser boundary; token exchange and rotation are exercised against supported real services; approvals are race-safe and replay-resistant; SIEM/SOAR delivery and deduplication are measured; no unresolved critical findings; at least three design partners convert to paid annual contracts per the Master Plan.

### G4 — Months 9–18: Fleet and commercial scale

**Sequence:**

1. Integrate a real SpiceDB service and define schema, consistency model, tenant boundaries, authorization cache invalidation, and causal revocation semantics.
2. Implement multi-cluster inventory and canary rollout with pause/rollback controls and signed configuration bundles.
3. Treat IAM rightsizing as a recommendation/diff workflow first; validate against observed permission windows, wildcards, resource scoping, and customer approval before any write path.
4. Implement distributed spend circuit breakers with explicit budgets, race conditions, partition behavior, and audited overrides.
5. Produce a CycloneDX-compliant AI-BOM with canonical payload serialization and real Ed25519 signing/verification backed by managed keys. Placeholder signatures or timestamps are not acceptable evidence of signed artifacts.
6. Validate regulatory mapping and evidence generation with qualified security/legal reviewers; present it as evidence support, not certification.
7. Build and test a customer-VPC/air-gapped Helm deployment including images, charts, dependencies, upgrades, network policies, backups, and disaster recovery.
8. Run repeated onboarding trials; measure time-to-value, operator effort, support volume, expansion, gross margin, and sales-cycle predictability.

**G4 exit criteria:** production-grade multi-cluster rollout and causal revocation are demonstrated; recommendation safety is reviewed; signed artifacts verify independently; air-gapped install/upgrade/rollback is reproducible; at least three customer onboarding cycles meet approved time and reliability targets; repeatable sales and fleet expansion evidence is documented.

## 8. Product, partner, and legal work in parallel

| Owner | Deliverable | Target window | Evidence |
|---|---|---|---|
| Product | ICP, top 3 use cases, supported deployment profile, non-goals, buyer/user map | Weeks 1–2 | Reviewed one-page product brief and interview notes |
| Product + Team 6 | Pilot protocol, baseline, success metrics, data handling, rollback/stop conditions | Weeks 1–3 | Partner-ready protocol and test plan |
| GTM | Recruit 25 qualified prospects and secure first 5 pilot candidates | Weeks 2–8 | CRM pipeline and written pilot acceptance |
| Legal | Trademark/domain clearance; Apache-2.0 boundary; OpenBao license review; contributor CLA/DCO decision | Weeks 1–6 | Written counsel review and repo contribution controls |
| Security | Threat model, data flow, retention, incident response, vulnerability intake | Weeks 1–6 | Approved security pack and owner roster |
| Product + Finance | Discovery-free pricing experiments; billable unit definitions; packaging validation | G2 onward | Interview evidence and paid conversion data, not calculator output alone |
| Support/Operations | Escalation, release notes, supported versions, backup/restore, incident communications | Weeks 7–12 | Operational runbook and on-call rehearsal |

## 9. Release engineering and quality policy

- Every supported release is built from a clean, reviewed revision and has a version, changelog, SBOM, provenance, and artifact checksums.
- CI runs formatting, lint, typecheck, unit/component suites, contract/fixture checks, Rust checks, frontend budget/accessibility gates, and security/dependency scans.
- Team 6 adds live-stack integration, failure-injection, adversarial, and performance jobs. Mock-only tests cannot substitute for these jobs.
- Promotion path: local integration → CI candidate → isolated staging → partner pilot → production release. Each stage uses the same versioned images and configuration schema.
- Keep observe-only as the default onboarding mode. Enforce mode requires explicit configuration and documented recovery steps.
- Version policy bundles and contracts; support rollback to the last known good policy/runtime combination.
- Publish only measured product claims. Label simulations, target values, and draft APIs clearly.
- Do not enable external contribution or promise license boundaries until provenance, third-party notices, trademark/domain review, and CLA/DCO decisions are complete.

## 10. Top risks and mitigations

| Risk | Impact | Mitigation / trigger |
|---|---|---|
| Teams build against inconsistent draft contracts | Integration rework and unsafe semantics | Freeze schemas and ADRs in Weeks 1–2; Team 0 blocks divergent interfaces |
| Runtime components remain libraries/prototypes | Product appears complete but cannot enforce real traffic | Prioritize full vertical slice; Compose must start actual services and pass live MCP traffic |
| Fail-closed behavior causes production disruption | Pilot damage and trust loss | Observe-only rollout, explicit emergency override semantics, fault injection, one-command rollback |
| Egress checks validate one DNS result but connect to another | SSRF and network boundary bypass | Enforce the resolved destination at connect time; adversarial DNS-rebinding test |
| Revocation SLA is ambiguous or missed | Continued access after compromise | Freeze target and measurement method; test concurrent calls and state propagation |
| Secrets leak through logs, traces, UI, or error payloads | Credential compromise | Data classification, canary secrets, end-to-end scans, redaction at source, short retention |
| Phase 2–4 breadth distracts from MVP | G1 slips without customer proof | Explicit scope freeze; require product and architecture approval for exceptions |
| Sales/pricing assumptions lack evidence | Poor conversion or pricing model | Design-partner interviews and paid pilot/annual conversion evidence before scaling |
| Supply-chain or IP issue blocks release | Legal/reputation risk | Complete license/provenance audit, trademark/domain and contribution review before public launch |
| Repository provenance is unclear | Cannot tell reviewed source from generated/untracked input | Establish a clean baseline, stage intended deliverables coherently, run CI on a reviewed commit |

## 11. Operating metrics

Report weekly with definition, sample size, environment, owner, and trend. Keep targets separate from verified results.

**Runtime/security:** successful authorization p50/p95/p99; gateway overhead; callout timeout rate; deny correctness; backend side effects prevented; revocation propagation; audit loss/lag; secret-scan findings; observe-only disruption rate.

**Reliability/deployment:** clean install success; time to healthy stack; rollback time; restart recovery; connector freshness; policy reload success; release defect and incident counts.

**Product/UX:** time to first observed MCP server; operator task success; false-positive resolution time; accessibility defects; Web LCP/INP; telemetry events/sec and frame time.

**Commercial:** qualified pilots, pilot completion, conversion to paid, annual contract value, deployment/onboarding effort, support load, renewal/expansion evidence.

## 12. First 10 working days

1. **Day 1:** name accountable leads and release owner; confirm supported G1 deployment and initial customer profile.
2. **Day 2:** Team 0 publishes the current implementation inventory and open decision log; freeze Phase 2–4 feature work outside approved maintenance.
3. **Day 3:** Team 6 reviews and updates the G1 acceptance matrix against the current contracts and actual runtime behavior.
4. **Days 3–5:** Teams 0–5 agree and version the contracts, pipeline order, observe-only, kill-switch, timeout, and error semantics.
5. **Days 5–7:** Team 1 produces the smallest runnable gateway + ExtMCP + mock backend vertical slice; Team 2–5 connect real subsystem adapters in sequence.
6. **Days 6–8:** Product/GTМ start partner interviews and book pilot candidates; Legal starts IP, license, and contribution review.
7. **Days 8–10:** Team 6 executes the first live permit/deny/timeout/revocation cases; leads re-estimate the 90-day plan from observed integration velocity.
8. **Day 10 review:** publish a green/amber/red dependency board, updated forecast, and explicit decision whether the G1 target remains achievable.

## 13. Gate decision template

For each gate, the owner submits a concise packet containing:

1. Scope and supported configurations.
2. Acceptance matrix with pass/fail and evidence links.
3. Build/release identifiers and environment details.
4. Performance, reliability, security, and customer results with methods and sample sizes.
5. Known limitations, residual risks, and approved exceptions with expiry dates.
6. Rollback and incident plan.
7. Sign-offs: feature owners, Team 0, Team 6, security, product, and release owner.

**Gate outcomes:** `Pass`, `Pass with explicitly bounded exception`, or `Fail`. “Mostly ready,” a successful local build, component-level unit tests, a mock demo, or the existence of a plan is not a gate outcome.

## 14. Source-of-truth references

- Strategic goals and commercial model: `Axiom_NHI___Final_Win_Master_Plan.pdf`
- Phase 1 ownership and scope: `axiom_nhi_phase_1_team_implementation_playbooks.md`
- Phase 2 architecture and owners: `axiom_nhi_phase_2_engineering_blueprint_and_team_playbooks.md`
- Current code/readiness snapshot: `docs/architecture/phase1-audit-report.md`
- Contract decisions and bootstrap status: `docs/architecture/phase1-bootstrap.md`
- G1 QA approach: `tests/README.md`, `tests/integration/gate_g1_acceptance_matrix.md`
- Deployment prototype limitations: `deployments/docker/README.md`

When these references disagree, Team 0 records the resolution in a versioned ADR and Team 6 updates the acceptance evidence before implementation continues.
