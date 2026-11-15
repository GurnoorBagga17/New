# Axiom NHI — Phase 1 Team Implementation Playbooks & Strict Scope Boundaries (Days 1–90)

**Target Milestone**: Gate G1 (90-Day Runtime Wedge MVP — Apache-2.0 Open Core)  
**Golden Rule of Phase 1**: Every team owns one well-defined subsystem in the `axiom-nhi` monorepo, exposes a typed contract owned by Team 0, and **never duplicates or re-implements another team's responsibility**.

---

## 0. Monorepo CODEOWNERS & Strict Directory Boundaries

To prevent scope bleed and cross-team conflicts, enforce this `.github/CODEOWNERS` layout from Day 1. No team may merge changes outside its assigned directory without explicit sign-off from Team 0 and the owning team:

```text
# .github/CODEOWNERS — Strict Phase 1 Ownership Boundaries
/docs/architecture/           @axiom-nhi/team-0-arch
/docs/api-contracts/          @axiom-nhi/team-0-arch
/docs/security/               @axiom-nhi/team-0-arch @axiom-nhi/team-6-qa
/proto/                       @axiom-nhi/team-0-arch

/gateway/                     @axiom-nhi/team-1-gateway
/deployments/docker/          @axiom-nhi/team-1-gateway @axiom-nhi/team-0-arch

/services/extmcp/             @axiom-nhi/team-2-policy

/identity/                    @axiom-nhi/team-3-identity

/validators/                  @axiom-nhi/team-4-validators

/observability/               @axiom-nhi/team-5-observability

/tests/                       @axiom-nhi/team-6-qa
```

---

## 1. Shared Data Contracts (Frozen by Team 0 in Week 1)

All seven teams integrate against these seven canonical Rust/JSON contracts in `/docs/api-contracts/`. No team is permitted to invent custom ad-hoc payloads between subsystems:

```rust
// 1. RuntimeRequest (Emitted by Team 1 -> Consumed by Team 2, 3, 4, 5)
pub struct RuntimeRequest {
    pub request_id: String,          // UUIDv7 generated at gateway ingress
    pub trace_id: String,            // W3C traceparent ID
    pub mcp_session_id: String,      // MCP session header
    pub mcp_method: String,          // e.g., "tools/call", "tools/list", "resources/read"
    pub target_server: String,       // Configured canonical MCP resource URI; exact JWT aud match
    pub tool_name: String,           // Resolved tool name
    pub raw_arguments: serde_json::Value,
    pub runtime_mode: RuntimeMode,   // ObserveOnly | Enforce
    pub raw_auth_header: Option<String>,
}

// 2. IdentityContext (Produced by Team 3 -> Consumed by Team 2 & Team 5)
pub struct IdentityContext {
    pub authenticated: bool,
    pub agent_id: String,            // JWT `sub`
    pub client_id: String,           // OAuth 2.1 `client_id`
    pub cimd_uri: Option<String>,    // Verified Client ID Metadata Document URI
    pub issuer: String,              // JWT `iss`
    pub audience: Vec<String>,       // Validated against RFC 8707 `resource` indicator
    pub scopes: Vec<String>,         // Parsed OAuth scopes
    pub token_jti: String,           // Unique token ID for revocation matching
    pub expires_at_unix: i64,        // Verified `exp`
}

// 3. ValidatorResult (Produced by Team 4 -> Consumed by Team 2 & Team 5)
pub struct ValidatorResult {
    pub validator_id: String,        // "sql" | "filesystem" | "egress" | "tool-pinning"
    pub passed: bool,
    pub violation_code: Option<String>,
    pub reason: Option<String>,
    // Normalized attributes injected into Cedar `context`:
    pub sql_verbs: Vec<String>,
    pub sql_tables: Vec<String>,
    pub sql_is_readonly: bool,
    pub sql_statement_count: u32,
    pub normalized_path: Option<String>,
    pub path_traversal_detected: bool,
    pub egress_domain: Option<String>,
    pub egress_is_private_ip: bool,
    pub tool_pin_sha256: Option<String>,
    pub tool_pin_verified: bool,
}

// 4. PolicyRequest & 5. PolicyResponse (Owned by Team 2)
pub struct PolicyRequest {
    pub principal_uid: String,       // e.g., Axiom::Agent::"finance-agent"
    pub action_uid: String,          // e.g., Axiom::Action::"tools/call"
    pub resource_uid: String,        // e.g., Axiom::Tool::"prod-db/execute_sql"
    pub context_json: serde_json::Value, // Merged IdentityContext + ValidatorResult + RuntimeMode
}

pub struct PolicyResponse {
    pub decision: Decision,          // Permit | Deny | WouldDeny (in observe-only)
    pub policy_version: String,      // SHA-256 of active Cedar policy bundle
    pub matched_policy_ids: Vec<String>,
    pub reason: String,
    pub evaluation_latency_us: u64,
}

// 6. AuditEvent & 7. RevocationState (Owned by Team 5)
pub struct AuditEvent {
    pub timestamp_rfc3339: String,
    pub request_id: String,
    pub trace_id: String,
    pub agent_id: String,
    pub target_server: String,
    pub tool_name: String,
    pub runtime_mode: String,
    pub decision: String,            // "ALLOW" | "DENY" | "WOULD_DENY"
    pub policy_version: String,
    pub denial_reason: Option<String>,
    pub validator_summary: Vec<String>,
    pub kill_switch_active: bool,
    pub latency_us: u64,
}

pub struct RevocationState {
    pub target_kind: String,         // "agent" | "tool" | "mcp_server" | "global"
    pub target_id: String,
    pub revoked: bool,
    pub state_version: u64,
    pub effective_unix_ms: i64,
    pub reason: String,
}
```

---

## Team 0 — Architecture & Engineering Integration Playbook

**Directory Ownership**: `/docs/architecture/`, `/docs/api-contracts/`, `/docs/security/`, `/proto/`  
**Staffing Profile**: 1 Technical Lead / Chief Architect  
**Mission**: Ensure all six implementation teams build compatible subsystems that operate as a single deterministic runtime security product within a `< 5ms` inline latency budget.

### Detailed Work Breakdown
1. **Freeze Shared Contracts (Days 1–5)**: Publish `extmcp.proto` ([agentgateway Remote Guardrails](https://agentgateway.dev/docs/standalone/latest/documentation/mcp/guardrails/setup/)) and the 7 shared data structs in `/docs/api-contracts/` before Teams 1–5 start parallel coding.
2. **Define the End-to-End Pipeline Order (Days 1–7)**: Enforce the non-negotiable execution sequence:
   - Step 1: Kill-switch check (Team 5 state read) -> Step 2: Identity verification (Team 3) -> Step 3: Argument & tool-pin validation (Team 4) -> Step 4: Cedar authorization (Team 2) -> Step 5: Gateway enforcement/forwarding (Team 1) -> Step 6: Asynchronous/non-blocking OTel + local JSONL audit emission (Team 5).
3. **Establish Timeout & Fail-Closed Standards (Days 5–10)**: Because upstream [agentgateway](https://agentgateway.dev/docs/standalone/latest/documentation/mcp/guardrails/setup/) has **no default callout deadline** on `ExtMCP`, mandate a hard `15ms` gRPC deadline at the gateway boundary and deterministic `failClosed` behavior whenever `enforce` mode is active.
4. **Maintain ADRs & Lead Integration Reviews (Days 1–90)**: Run twice-weekly cross-team contract reviews and weekly security architecture reviews with T2, T4, and T6.

### Strict Scope Boundary (What Team 0 Must NOT Do)
- **DO NOT** write feature implementation code inside `/gateway/`, `/services/extmcp/`, `/identity/`, `/validators/`, or `/observability/`.
- **DO NOT** merge changes to `/proto/` or `/docs/api-contracts/` without notifying all downstream team leads and bumping the schema version.
- **DO NOT** allow Phase 2–4 scope creep (Postgres dependency graphs, AWS/K8s/GitHub discovery connectors, RFC 8693 token exchange, or multi-cluster UI dashboards) into Phase 1 PRs.

---

## Team 1 — MCP Gateway & Runtime Infrastructure Playbook

**Directory Ownership**: `/gateway/agentgateway/`, `/gateway/mcp-interceptor/`, `/gateway/runtime-modes/`, `/deployments/docker/`  
**Staffing Profile**: 2 Engineers (Rust/Go, MCP protocol, HTTP/2 & gRPC networking, Docker)  
**Mission**: Deliver the hardened [agentgateway](https://github.com/agentgateway/agentgateway) distribution that intercepts every MCP request/response, normalizes context, calls `ExtMCP` over `h2c`, enforces `observe-only` vs. `enforce` mode, and enforces outbound network egress blocks at the proxy execution boundary.

### Detailed Work Breakdown (`G1.1` – `G1.10`)
- **`G1.1` & `G1.2` (`agentgateway` Distribution & MCP Protocol)**: Package upstream [agentgateway](https://github.com/agentgateway/agentgateway) with Axiom's static configuration schema supporting MCP `stdio` and Streamable HTTP/SSE transports (`MCP-Protocol-Version: 2025-03-26`).
- **`G1.3` & `G1.4` (Interception & Request Normalization)**: Intercept `tools/call`, `tools/list`, `prompts/get`, and `resources/read`. Extract `Mcp-Session-Id`, `Authorization` bearer headers, resolved target backend name, tool name, and JSON-RPC `params` into `RuntimeRequest`.
- **`G1.5` (`ExtMCP` Callout Connectivity)**: Configure the `mcpGuardrails` remote processor over persistent cleartext HTTP/2 (`h2c`) to `services/extmcp` (`localhost:9001`) with explicit connection pooling and a strict `15ms` callout timeout ([Guardrail processors](https://agentgateway.dev/docs/standalone/main/documentation/mcp/guardrails/processors/)).
- **`G1.6` & `G1.7` (Runtime Mode Management & Forwarding)**:
  - In `observe-only` mode: Never block traffic—even if `ExtMCP` returns a policy denial or times out, log the shadow event and forward the call to the MCP server with zero production disruption.
  - In `enforce` mode: Forward permitted calls; for denied `tools/call` requests, return HTTP 200 with `isError: true` and the rejection message (or JSON-RPC `-32001` for non-`tools/call` methods and kill-switch aborts) per [agentgateway Error Codes](https://agentgateway.dev/docs/standalone/main/documentation/mcp/guardrails/processors/).
- **`G1.8` (Network Egress Execution Boundary & Error Handling)**: Act as the outbound egress proxy for MCP tool servers so that Team 4's egress domain/IP decisions are enforced at the actual network socket/DNS resolution boundary (preventing DNS rebinding after validation).
- **`G1.9` & `G1.10` (Gateway Configuration & Docker Packaging)**: Deliver a single-command `docker compose up` deployment in `/deployments/docker/` that boots the entire Phase 1 stack in under 60 seconds.

### Strict Scope Boundary (What Team 1 Must NOT Do)
- **DO NOT** parse JWTs, fetch Client ID Metadata Documents (CIMD), or verify RFC 8707 `resource` indicators inside `/gateway/`—simply extract the raw `Authorization` header and session metadata and pass them to **Team 3**.
- **DO NOT** write SQL regexes, path traversal checks, or Cedar policy rules inside `agentgateway` CEL expressions (keep CEL strictly to zero-hop structural sanity checks like missing `mcp.params.name`; **Team 4** and **Team 2** own argument validation and policy evaluation).
- **DO NOT** build custom audit log file writers—delegate structured audit emission to **Team 5**.

### 30 / 60 / 90-Day Deliverables
- **Day 30**: Working `agentgateway` container intercepting `tools/call` and `tools/list`, calling `ExtMCP` skeleton, and switching cleanly between `observe-only` and `enforce` modes.
- **Day 60**: Hardened timeout handling (`15ms` deadline), deterministic `failClosed` behavior when `ExtMCP` is unreachable, and network-level outbound egress enforcement.
- **Day 90**: Production-hardened Docker Compose distribution deployed across 5 design-partner environments with zero `observe-only` disruptions.

---

## Team 2 — Policy Engine & Authorization Playbook

**Directory Ownership**: `/services/extmcp/authorization/`, `/services/extmcp/cedar/`, `/services/extmcp/policy-api/`  
**Staffing Profile**: 2 Engineers (Rust, [`cedar-policy`](https://crates.io/crates/cedar-policy), gRPC/`tonic`, authorization engineering)  
**Mission**: Own the `ExtMCP` gRPC callout server (`CheckRequest` and `CheckResponse`) and the deterministic [Cedar](https://github.com/cedar-policy/cedar) authorization engine that combines Team 3's `IdentityContext` and Team 4's `ValidatorResult` to render sub-millisecond `Permit` or `Deny` decisions.

### Detailed Work Breakdown (`P2.1` – `P2.10`)
- **`P2.1` & `P2.2` (Cedar Engine & Schema)**: Embed [`cedar-policy` v4.14.1](https://crates.io/crates/cedar-policy) in Rust. Define the canonical `axiom.cedarschema` with entity types `Axiom::Agent`, `Axiom::Client`, `Axiom::McpServer`, `Axiom::Tool`, and action `Axiom::Action::"tools/call"`.
- **`P2.3`, `P2.4` & `P2.5` (Agent, Tool & Argument-Aware Evaluation)**: Orchestrate the `CheckRequest` pipeline inside `/services/extmcp/`:
  1. Query Team 5's in-memory revocation table first (short-circuit `Deny` in `< 50µs` if revoked).
  2. Call Team 3's `identity` library to obtain `IdentityContext`.
  3. Call Team 4's `validators` library to obtain `ValidatorResult` (SQL verbs/tables, canonical path, egress domain, tool pin verification).
  4. Construct the Cedar `Entities` and `Context` JSON and invoke `Authorizer::is_authorized()`.
- **`P2.6` & `P2.8` (Policy Management & Versioned Snapshots)**: Load `.cedar` policy bundles from disk, validate them against `axiom.cedarschema` at startup and hot-reload via `ArcSwap`, computing a deterministic SHA-256 `policy_version` for every snapshot.
- **`P2.7` & `P2.9` (Decision Responses & Fail-Closed Enforcement)**: Return `Permit` or `Deny` (with matched `forbid` policy IDs) to Team 1. If policy bundles fail to parse, schema validation fails, or any required context attribute is missing in `enforce` mode, deterministically return `Deny`.
- **`P2.10` (Policy Test Suite)**: Maintain 100% unit test coverage over all default Cedar policy templates (read-only SQL, destructive SQL block, path confinement, egress allowlist, untrusted tool pin).

### Strict Scope Boundary (What Team 2 Must NOT Do)
- **DO NOT** write SQL parsers, string-matching regexes on raw SQL queries, or filesystem `..` normalizers inside `.cedar` policies or `/services/extmcp/`—Cedar must only evaluate structured boolean/set attributes (`context.sql_verbs`, `context.path_traversal_detected`) produced by **Team 4**.
- **DO NOT** verify JWT cryptographic signatures or fetch OIDC/CIMD keys—call **Team 3's** `IdentityVerifier` trait.
- **DO NOT** build CLI commands or write directly to OTel/disk—pass `PolicyResponse` to **Team 5's** telemetry hook.

### 30 / 60 / 90-Day Deliverables
- **Day 30**: `tonic` `ExtMCP` server running on port `9001` with embedded `cedar-policy` evaluating basic agent-to-tool rules and blocking unauthorized `DROP TABLE` calls via Team 4's prototype.
- **Day 60**: Full integration with Team 3 (`IdentityContext`), Team 4 (`ValidatorResult` + `CheckResponse` tool pinning), and Team 5 (kill-switch short-circuit + audit hook) with hot-reloadable versioned policy bundles.
- **Day 90**: Lock-free in-memory evaluation tuned to `< 1ms` p99 inside `ExtMCP`, verified by Team 6's benchmark harness.

---

## Team 3 — Identity & Authentication Playbook

**Directory Ownership**: `/identity/oauth/`, `/identity/cimd/`, `/identity/resource-indicators/`  
**Staffing Profile**: 1–2 Engineers (OAuth 2.1, OIDC, JWT cryptography, API security, Rust/Go)  
**Mission**: Authenticate every MCP client/agent request using the [MCP OAuth 2.1 Authorization Specification](https://modelcontextprotocol.io/specification/draft/basic/authorization), Client ID Metadata Documents (CIMD), and [IETF RFC 8707 Resource Indicators](https://www.rfc-editor.org/info/rfc8707/), producing a tamper-proof `IdentityContext` for Team 2.

### Detailed Work Breakdown (`I3.1` – `I3.10`)
- **`I3.1`, `I3.5` & `I3.9` (MCP OAuth 2.1 & Token Validation)**: Validate `Authorization: Bearer <token>` headers on every request (rejecting tokens passed in URL query strings per OAuth 2.1 Section 5.2). Verify JWS cryptographic signatures against cached JWKS endpoints, enforce `exp` and `nbf` timestamps with bounded clock skew (`<= 30s`), and reject malformed tokens.
- **`I3.2` & `I3.4` (Client ID Metadata Documents — CIMD)**: Support URL-formatted `client_id` values per [MCP Client Registration](https://blog.modelcontextprotocol.io/posts/client_registration/). Fetch, validate, and cache the JSON metadata document hosted at the `client_id` HTTPS URL (enforcing SSRF protections and strict TLS verification) to bind ephemeral agents to verified client metadata without manual dynamic client registration sprawl.
- **`I3.3` & `I3.6` (RFC 8707 Resource Indicators & Audience Binding)**: Enforce [RFC 8707](https://www.rfc-editor.org/info/rfc8707/) audience restriction so an access token issued for `mcp://analytics-server` is deterministically rejected if replayed against `mcp://prod-db-server`. Compare the JWT `aud` claim against the canonical URI of the target MCP server.
- **`I3.7` & `I3.8` (Scope Validation & Session Identity Context)**: Parse OAuth scopes, bind identity claims (`sub`, `client_id`, `cimd_uri`, `iss`, `aud`, `jti`) to the MCP session, and output the canonical `IdentityContext` struct.
- **`I3.10` (Authentication Security Testing)**: Provide unit tests covering expired tokens, wrong `aud` replay (confused deputy attack), unsigned `alg: none` JWTs, and tampered CIMD documents.

### Strict Scope Boundary (What Team 3 Must NOT Do)
- **DO NOT** build [IETF RFC 8693 Token Exchange](https://datatracker.ietf.org/doc/html/rfc8693) or automated multi-hop delegation chains in Phase 1—that is explicitly deferred to **Phase 3**.
- **DO NOT** decide whether an authenticated agent is allowed to call a specific tool or run a `DELETE` query—Team 3 proves *who the caller is* and *which MCP server the token targets* (`IdentityContext`); **Team 2** decides what actions they may take.
- **DO NOT** build cloud IAM discovery connectors (AWS IAM, Kubernetes service accounts, GitHub apps)—those belong to **Phase 2**.

### 30 / 60 / 90-Day Deliverables
- **Day 30**: OAuth 2.1 JWT signature/expiry verification and basic `IdentityContext` extraction wired into the request pipeline.
- **Day 60**: Full CIMD metadata resolution with in-memory TTL caching and strict RFC 8707 `resource`/`aud` confused-deputy protection.
- **Day 90**: Security-reviewed authentication crate with zero network stalls on cached JWKS/CIMD lookups during burst benchmarks.

---

## Team 4 — Argument Security & Tool Integrity Playbook

**Directory Ownership**: `/validators/sql/`, `/validators/filesystem/`, `/validators/egress/`, `/validators/tool-pinning/`  
**Staffing Profile**: 2 Engineers (AppSec, Rust/Python, AST parsers, cryptography, network/filesystem security)  
**Mission**: Inspect and canonicalize untrusted MCP tool arguments and upstream `tools/list` definitions using deterministic parsers—never fragile regexes—and return `ValidatorResult` to Team 2.

### Detailed Work Breakdown (`A4.1` – `A4.10`)
- **`A4.1` & `A4.2` (SQL Argument Validator & Classification — `/validators/sql/`)**:
  - Parse SQL arguments into an AST using [`sqlparser`](https://crates.io/crates/sqlparser).
  - Classify statements into `Read` (`SELECT`, `SHOW`, `EXPLAIN`), `Write` (`INSERT`, `UPDATE`, `COPY`), and `Destructive`/`Admin` (`DELETE`, `DROP`, `TRUNCATE`, `ALTER`, `GRANT`, `EXECUTE`).
  - Detect and flag stacked queries (`statements.len() > 1`), comment-injected payloads (`/*!50000 DROP...*/`), hex/char encoding tricks, and CTE-wrapped destructive writes (`WITH del AS (DELETE FROM...) SELECT 1`).
- **`A4.3`, `A4.4` & `A4.5` (Filesystem Path Validator — `/validators/filesystem/`)**:
  - Decode URL/percent/Unicode encodings (including double-encoding `%252e%252e%252f`), reject null bytes (`\0`), normalize lexical `..` and `.` segments, resolve local symlinks (`std::fs::canonicalize` where applicable), and verify the resolved path remains strictly inside the configured root directory boundary.
- **`A4.6` & `A4.7` (Network Egress Validator — `/validators/egress/`)**:
  - Parse outbound URLs, validate against domain allowlists/denylists (enforcing strict dot-boundary matching so `evil-example.com` never matches `example.com`), reject IP literals and RFC 1918 / loopback / link-local metadata addresses (`169.254.169.254`, `127.0.0.1`, `::1`), and pass pre-resolved IP pins to Team 1's egress proxy to block DNS rebinding and unauthorized HTTP `301`/`302` redirects.
- **`A4.8` & `A4.9` (MCP Tool-Definition Pinning & Tampering Detection — `/validators/tool-pinning/`)**:
  - Canonicalize each tool object in `tools/list` (`name`, `description`, `inputSchema`) using RFC 8785 JSON Canonicalization Scheme (JCS), compute its SHA-256 digest, and compare against the approved pin manifest. Flag any mid-session tool description mutation ("rug pull") or argument schema drift.
- **`A4.10` (Security Regression Suite)**: Maintain a corpus of 100+ adversarial SQLi, path traversal, SSRF, DNS rebinding, and tool-poisoning payloads.

### Strict Scope Boundary (What Team 4 Must NOT Do)
- **DO NOT** hardcode policy decisions (such as "agent X can run `DELETE` but agent Y cannot") inside `/validators/`—Team 4 outputs factual classifications (`sql_verbs: ["DELETE"]`, `sql_is_readonly: false`) in `ValidatorResult`, and **Team 2's** Cedar engine evaluates whether that agent has permission.
- **DO NOT** intercept raw HTTP traffic directly—expose pure, stateless Rust validation functions called by Team 2 (and pass egress socket constraints to Team 1).

### 30 / 60 / 90-Day Deliverables
- **Day 30**: Working `sqlparser` AST classifier, lexical path normalizer, domain parser, and SHA-256 tool-definition hasher.
- **Day 60**: Hardened handling for obfuscated SQL comments/CTEs, symlink escapes, double-encoded paths, DNS rebinding hooks with Team 1, and automated `tools/list` pin enforcement.
- **Day 90**: Zero false positives across all 5 design-partner shadow deployments and 100% block rate on Team 6's adversarial attack suite.

---

## Team 5 — Observability, Audit & Emergency Controls Playbook

**Directory Ownership**: `/observability/opentelemetry/`, `/observability/audit/`, `/observability/kill-switch/`  
**Staffing Profile**: 1–2 Engineers (OpenTelemetry, Rust/Go, low-latency state synchronization, CLI/API design)  
**Mission**: Make every security decision traceable via [OpenTelemetry](https://docs.rs/opentelemetry) and tamper-evident local logs while providing a sub-second CLI/API emergency kill switch.

### Detailed Work Breakdown (`O5.1` – `O5.10`)
- **`O5.1`, `O5.2` & `O5.3` (OTel Instrumentation & Tracing)**: Instrument the request pipeline with [`opentelemetry`](https://crates.io/crates/opentelemetry) and `tracing-opentelemetry`, propagating W3C `trace_id` across `agentgateway` and `ExtMCP`.
- **`O5.4`, `O5.5` & `O5.6` (Audit Event Schema, OTLP Export & Local Storage)**:
  - Emit structured `AuditEvent` records asynchronously (via a bounded lock-free ring buffer so disk/network I/O never adds latency to the inline `CheckRequest` path) to both an OTLP collector and a local append-only JSONL file (`/var/log/axiom/audit.jsonl`).
  - Enforce automatic redaction so raw bearer tokens, secrets, and sensitive PII payload values are never written to logs.
- **`O5.7`, `O5.8`, `O5.9` & `O5.10` (Kill-Switch CLI, API & Sub-Second Propagation)**:
  - Build `axiom kill` CLI and local admin HTTP/Unix-socket API supporting four revocation granularities:
    1. `axiom kill agent <agent_id>` (disable a compromised agent)
    2. `axiom kill tool <server>/<tool_name>` (disable a vulnerable tool)
    3. `axiom kill server <server_name>` (disable an entire MCP server)
    4. `axiom kill global --all` (emergency gateway freeze)
  - Propagate `RevocationState` into an in-memory `ArcSwap` table shared with Team 2's `ExtMCP` server in `< 50ms`, ensuring all subsequent protected calls are rejected in `< 1ms` and generating an explicit `KILL_SWITCH_TRIGGERED` audit record.

### Strict Scope Boundary (What Team 5 Must NOT Do)
- **DO NOT** build enterprise SIEM/SOAR webhook connectors, Slack interactive approval workflows, or Postgres historical graph storage in Phase 1—those belong to **Phases 2 and 3**.
- **DO NOT** attempt mid-flight database query cancellation on already-executing upstream tool calls—the Phase 1 kill-switch boundary strictly blocks *new* protected calls at the gateway/ExtMCP boundary.
- **DO NOT** modify Cedar policies to perform revocations—keep kill-switch state in the dedicated high-speed `RevocationState` table checked *before* Cedar evaluation.

### 30 / 60 / 90-Day Deliverables
- **Day 30**: Structured `AuditEvent` JSONL logger, OTel trace propagation, and kill-switch state store design.
- **Day 60**: Working `axiom kill` CLI and local REST/Unix API with immediate in-memory revocation propagation and secret redaction filters.
- **Day 90**: Verified sub-second (`< 100ms` end-to-end) emergency revocation under load, audited by Team 6.

---

## Team 6 — QA, Reliability & Security Testing Playbook

**Directory Ownership**: `/tests/integration/`, `/tests/security/`, `/tests/performance/`, `/tests/failure-injection/`  
**Staffing Profile**: 2 Engineers (Security testing, chaos engineering, performance benchmarking, automation)  
**Mission**: Independently verify that the integrated Axiom NHI runtime behaves deterministically under normal load, adversarial prompt-injection attacks, and infrastructure failures, and publish the open Gate G1 benchmark suite.

### Detailed Work Breakdown (`Q6.1` – `Q6.10`)
- **`Q6.1`, `Q6.2` & `Q6.3` (Functional, OAuth & Cedar Test Suites)**: Automated integration tests verifying MCP handshake (`initialize`, `tools/list`, `tools/call`), OAuth 2.1 + CIMD + RFC 8707 token rejection on expired/wrong-audience tokens, and deterministic Cedar permit/deny matrix coverage.
- **`Q6.4` (Adversarial Argument Attack Suite)**: Automated red-team runner replaying stacked SQLi (`SELECT 1; DROP TABLE users`), CTE destructive writes, `../../etc/passwd` and symlink escapes, SSRF (`http://169.254.169.254/latest/meta-data/`), DNS rebinding, and mid-session MCP tool description rug-pulls.
- **`Q6.5` & `Q6.6` (Fail-Closed Chaos Testing & Observe-Only Verification)**:
  - Chaos harness that kills or pauses (`SIGSTOP` / `docker pause`) the `ExtMCP` container and corrupts policy files during active traffic, asserting that 100% of calls fail closed in `enforce` mode and 0% of legitimate calls fail in `observe-only` mode.
- **`Q6.7` & `Q6.8` (Kill-Switch & Open Latency Benchmark Harness)**:
  - Publish the reproducible open-source benchmark suite measuring p50, p95, and p99 `ExtMCP` authorization overhead across concurrent agent bursts and measuring exact millisecond delay from `axiom kill` invocation to the first blocked packet.
- **`Q6.9` & `Q6.10` (Docker Packaging & Design-Partner Sign-Off Evidence)**: Validate clean 15-minute onboarding on clean Linux/macOS Docker hosts and collect Gate G1 validation evidence across the 5 design partners.

### Strict Scope Boundary (What Team 6 Must NOT Do)
- **DO NOT** fix bugs directly inside `/gateway/`, `/services/extmcp/`, `/identity/`, `/validators/`, or `/observability/`—file reproducible failing regression tests in `/tests/` and assign the fix to the owning team (Teams 1–5).
- **DO NOT** grade tests by simple `HTTP 200` status codes—because MCP `tools/call` policy denials return HTTP 200 with `isError: true` in the JSON-RPC body ([agentgateway Error Codes](https://agentgateway.dev/docs/standalone/main/documentation/mcp/guardrails/processors/)), every security assertion must inspect the parsed JSON-RPC response payload, confirm the upstream MCP server never executed the side effect, and verify the emitted `AuditEvent` in `/var/log/axiom/audit.jsonl`.

### 30 / 60 / 90-Day Deliverables
- **Day 30**: CI pipeline running automated MCP mock fixtures and initial SQL/path security tests on every PR.
- **Day 60**: Full chaos-injection (`failClosed`) suite, adversarial attack harness, and baseline latency benchmarks.
- **Day 90**: Published open-source p50/p95/p99 benchmark report, sub-second kill-switch verification report, and signed Gate G1 release evidence for all 5 design partners.
