# Axiom NHI — Pre-Production Problems Report

**Repository:** `GurnoorBagga17/New` (commit `5402451`, single-commit history)
**Audit date:** 16 Nov 2026
**Scope:** Entire repository — Rust workspace (18 crates), Node gateway code, Python test harness, Next.js marketing site, Vite gateway UI, console, shared packages, Docker/Helm, CI, docs
**Benchmarked against:** Token Security, Aembit, Clutch Security, Oasis Security, Astrix Security, Entro Security

---

## 0. How this audit was done (and its limits)

I cloned the repo and read the source directly, then **ran the toolchains** rather than trusting the README:

| Command (on a clean copy) | Result |
|---|---|
| `cargo test --workspace` | **FAILS TO COMPILE** (`extmcp-runtime`) |
| `cargo check -p extmcp-runtime --bin extmcp-runtime` (non-test build) | **FAILS** — same errors; the production binary does not build |
| `cargo test --workspace --exclude extmcp-runtime` | 1 failure (`axiom-validators`), 9 enterprise crates have **0 tests** |
| `python3 tests/run_tests.py` | 58 passed, 1 skipped — **but all against a Python mock** (see §9) |
| `node gateway/mcp-interceptor/interceptor.test.js` | 11 passed — against mock ExtMCP/backend |
| `pnpm install --frozen-lockfile && pnpm run typecheck` | Pass |
| `pnpm run lint` | **FAIL** (1 error) |
| `pnpm run test` | 25 tests pass (3 test files in the whole frontend) |
| `pnpm run build` | Pass |
| `check_gateway_ui_offline.py` | **FAIL** |
| `check_frontend_colors.py` | **FAIL** (289 lines of violations) |

**Not reviewed line by line** (time-boxed; treat as unaudited, not as clean): `observability/audit/src/redact.rs` and `event.rs`, `observability/kill-switch/src/{model,store,service}.rs`, `observability/opentelemetry/src/trace_context.rs`, `services/extmcp/policy-api`, `packages/cedar-editor`, individual `apps/gateway-ui` pages other than kill-switch/traffic, `apps/console/src/App.tsx` (2,164 lines, skimmed for data sources only), and `apps/web/app/styles.css` (5,844 lines).

Severity scale: **Critical** = blocks launch / false security or legal claim · **High** = serious defect or major gap · **Medium** = should fix before GA · **Low** = polish / hardening.

---

## 1. Executive verdict

**Axiom NHI is not ready for production, a customer pilot, or a competitive demo against the six vendors named.** The honest picture:

1. **The one component that matters most does not compile.** The ExtMCP runtime (`services/extmcp/runtime`) — the inline authorization service the Docker image builds — fails with 4 compiler errors. `docker build` of `Dockerfile.extmcp` will fail.
2. **The "full-stack Phases 1–4" in the README are mostly not implemented.** The nine "Enterprise Control Plane" crates total roughly **1,200 lines of Rust with zero network/DB dependencies, zero Rust tests**, and no calls to AWS, Kubernetes, GitHub, Slack, OpenBao, SpiceDB, Postgres, Splunk, Sentinel, or Jira. Workspace dependencies for `sqlx`, `aws-sdk-*`, `kube`, `octocrab`, `petgraph` are declared in `Cargo.toml` and used by nothing.
3. **The audit, kill-switch, and telemetry crates are well-built but wired to nothing.** No crate depends on `axiom-audit`, `axiom-kill-switch`, or `axiom-telemetry`. The running runtime emits **no audit events**, has **no live kill switch**, and its `tracing` logs go nowhere (no subscriber).
4. **The "control plane" is a mock.** `gateway/local-admin-api/server.cjs` returns hard-coded JSON (e.g. a permanent `fleet_posture_score: 96`), has no authentication, `CORS: *`, binds `0.0.0.0`, and lets any caller replace the policy bundle.
5. **The UI reports success it did not achieve.** The kill-switch page shows "Sub-100ms kill confirmed" even if the request failed; the traffic stream silently switches to a mock event generator and labels it "connected"; sign-in is a `setTimeout` redirect to `localhost:5173`.
6. **Marketing makes claims the code cannot support** — "SOC 2 Type II", "FIPS 140-3 … attestation enforced", "immutable Merkle audit trails", "Ed25519-signed AI-BOM" — none are true today. This is a legal and sales-credibility risk, not just an engineering gap.
7. **Tests mostly prove the mocks work.** 0 of the 58 Python tests execute any Rust or Node product code; 9 of them assert constants against themselves.

**What is genuinely good** (so you know what to protect): JWT validation hardening, JWKS fetch with DNS pinning and no redirects, AST-based SQL read-only classification, RFC 8785 tool-definition hashing, fail-closed pipeline design, bounded/non-blocking audit bus, atomic fsync'd kill-switch snapshots. See §12.

**Strategic read:** the defensible wedge is *inline MCP/agent runtime enforcement*. Everything the competitors lead with (discovery breadth, secret rotation, lifecycle, posture, compliance) is exactly where this repo has README text but no code. Ship the wedge to production quality first; mark the rest as roadmap.

---

## 2. Launch blockers (top 20)

| # | Severity | Problem | Section |
|---|---|---|---|
| 1 | Critical | Production binary `extmcp-runtime` does not compile | B-01 |
| 2 | Critical | ExtMCP revocation snapshot self-expires ≤300 s after start → every request denied | R-01 |
| 3 | Critical | Audit / kill-switch / OTel crates not wired; runtime has no audit, no live revocation | R-02 |
| 4 | Critical | Tool-pinning compares configuration to configuration, never the live tool definition | R-03 |
| 5 | Critical | Approval engine lets a consumed ticket be re-approved and re-used (single-use broken) | E-07 |
| 6 | Critical | "Signed" AI-BOM signature is a fake string; timestamp hard-coded | E-09 |
| 7 | Critical | False compliance claims (SOC 2 Type II, FIPS 140-3, Merkle audit, HIPAA) | L-01 |
| 8 | Critical | Admin API: unauthenticated, `CORS *`, `0.0.0.0`, can replace policy / flip to observe-only | G-01 |
| 9 | Critical | Kill-switch UI shows success when the revoke call failed; "Restore" is UI-only | F-01, F-02 |
| 10 | Critical | UI silently falls back to mock traffic and shows "connected" | F-03 |
| 11 | High | Default policy bundle only permits SQL tools; `tools/list` etc. are denied | P-01 |
| 12 | High | Air-gapped / private IdP deployments cannot validate tokens (JWKS SSRF guard rejects private IPs) | I-06 |
| 13 | High | Helm chart deploys only the upstream gateway: no ExtMCP, no config, no Service, no probes | D-01 |
| 14 | High | No TLS/mTLS on ExtMCP gRPC; binds `0.0.0.0` | R-05 |
| 15 | High | Enterprise connectors/lineage/secretless/SIEM/fleet are in-memory stubs | E-01…E-09 |
| 16 | High | CI is red on 4 gates and never runs `cargo test`, Python tests, or Node tests | C-01 |
| 17 | High | No multi-tenancy, RBAC, SSO/SCIM anywhere | X-01 |
| 18 | High | CEF/SIEM output has no escaping (log injection into customer SIEM) | E-08 |
| 19 | High | Enterprise crates are labelled Apache-2.0, contradicting the open-core boundary; no LICENSE file | L-03 |
| 20 | High | Performance claims (<5 ms, 15 ms, <50 ms) are unmeasured | T-03 |

---

## 3. README claims vs. reality

| README claim | Status | Evidence |
|---|---|---|
| `< 5ms` inline ExtMCP evaluation | **Unproven** | Only mock benchmarks; egress validator does un-timed DNS inline (V-02) |
| `15ms` fail-closed deadline | **Prototype only** | Implemented in `interceptor.js` (not on the Docker/Helm path); upstream gateway config uses `failureMode: failClosed` but was never run (see `UPSTREAM_PIN.md`) |
| `< 50ms` kill-switch propagation | **Not implemented** | Kill-switch crate unused; runtime reads a static file at startup (R-01) |
| OAuth 2.1, JWKS, CIMD SSRF-safe cache, RFC 8707 | **Partial** | JWT + JWKS + RFC 8707 real; **CIMD is not fetched or verified** (`cimd_uri: None`, jwt_validator.rs:161) |
| Validators: SQL AST, Path, Egress SSRF, Tool Pinning | **Partial** | SQL/path/egress real; tool pinning does not pin live definitions (R-03) |
| `observability/` audit, kill-switch, OTel | **Built, not wired** | No dependents; OTel crate has no exporter |
| Connectors: AWS IAM, K8s, GitHub, Slack | **Stub** | 2 pure normalizer fns; no API calls; GitHub/Slack have no code |
| HMAC-SHA256 credential fingerprinting | **Misleading** | HMACs the *entity UID*, not credential material (E-01) |
| Attribution engine | **Stub** | Pure function over caller-supplied booleans |
| Lineage graph, "recursive CTE `simulate_revocation`" | **Missing** | In-memory `Vec`; SQL file has **no recursive CTE** (only a self-join view) and is never executed |
| Risk engine: OWASP NHI/MCP Top 10 | **Stub** | Boolean flags over a pre-computed struct; nothing computes the telemetry |
| 30-Minute Shadow Audit, Slack Block Kit, Jira | **Missing** | Only a dedup `HashMap` and a summary struct |
| OpenBao secretless lease broker | **Missing** | No OpenBao client |
| RFC 8693 multi-hop token exchange | **Stub** | Pure function; verifies nothing; not multi-hop |
| Zero-downtime dual-secret rotation | **Stub** | State machine with logic bugs (E-07) |
| Atomic single-use SHA-256 approvals (Slack & CLI) | **Broken** | Re-approval bug; no Slack code (E-07) |
| SIEM: Splunk HEC / Sentinel / CrowdStrike / OCSF 1.3 / CEF | **Stub** | One unescaped CEF `format!` |
| SpiceDB delegation graph | **Missing** | `Vec` scan; no SpiceDB client |
| Multi-cluster canary rollout, spend circuit breakers | **Missing** | Mentioned only in a module doc comment |
| Ed25519-signed CycloneDX 1.6 AI-BOM | **Fake** | Signature is `format!("ed25519:axiom-enclave-sig:{}", …)` |
| `$0`-Discovery metering | **Partial** | A pure counting function; no persistence or tamper resistance |
| Air-gapped Helm chart | **Missing** | One Deployment + one NetworkPolicy; JWKS guard blocks private IdPs |
| "58 tests", "11 tests" | **Misleading** | Mocks only (§9) |
| WCAG 2.1 AA, bundle budget, air-gap gates | **Failing** | 2 of the gate scripts fail today |

---

## 4. Build, release, and repository hygiene

### B-01 · Critical · Production runtime does not compile
- **Where:** `services/extmcp/runtime/src/main.rs:18` and `:356`; `validators/src/lib.rs:8`
- **Problem:** `main.rs` imports `axiom_validators::adapter::{EgressArgumentSpec, PathArgumentSpec, ToolValidationProfile}`, but `validators/src/lib.rs` declares `mod adapter;` (private) and only re-exports `ToolValidationProfile`. Second error: `PolicySnapshotStore` does not implement `extmcp_authorization::PolicyEngine` (only `CedarPolicyEngine` does, `cedar/src/lib.rs:250`).
- **Impact:** `cargo build -p extmcp-runtime` (exactly what `Dockerfile.extmcp` runs) fails. The core product cannot be built, run, or deployed. It also means ExtMCP's own tests cannot run.
- **Fix:** `pub mod adapter;` (or re-export the two spec structs); implement `PolicyEngine for PolicySnapshotStore` (delegating to the current snapshot via `ArcSwap`). Add `cargo build --release --locked` to CI.

### B-02 · High · A validator unit test fails on Linux
- **Where:** `validators/src/filesystem.rs:103` (`accepts_and_normalizes_path_inside_root`)
- **Problem:** asserts `ends_with("data\\report.txt")` — a Windows path separator. Fails on Linux (the CI and Docker platform).
- **Fix:** compare with `Path::ends_with(Path::new("data").join("report.txt"))`.

### B-03 · High · Frontend lint fails
- **Where:** `apps/gateway-ui/src/modules/traffic/hooks/useSSEConnection.ts:209` — `'err' is defined but never used` (error) plus a `react-hooks/exhaustive-deps` warning at `:228`.
- **Impact:** `pnpm run lint` exits 1; CI step fails.

### B-04 · High · Architecture gates fail
- `check_gateway_ui_offline.py` fails: shipped bundles contain external URL references (`http://openbao-vault.internal:8200`, `//axiom.internal/`, `//openbao.internal/` in Deployments/Secretless/Identity/Observability/Alerts pages) — direct contradiction of the "air-gapped, zero external requests" claim.
- `check_frontend_colors.py` fails with 289 lines of hard-coded colours (`SecretlessBrokerPage.tsx:367`, `playground/page.tsx:307,406,414,422`, …), contradicting the design-token governance claim.

### B-05 · Medium · Dead code in the identity crate
- `cargo check` emits dead-code warnings for the whole CIMD module (`identity/src/cimd/mod.rs:23,45,59,64,131`; `cache.rs:14,21,27,34`). Combined with the CI `-D warnings` clippy gate, CI fails on this too. It also confirms CIMD is not used by the verifier.

### B-06 · Medium · Version chaos
Cargo workspace/Helm `1.0.0`; `package.json`, all frontend packages and `identity` crate `0.1.0-draft`; Docker label `0.1.0-draft`; gateway interceptor `v0.1.0-draft`; "DRAFT: requires Team 0 sign-off" comments throughout (`cedar/src/schema.rs`, `authorization/src/context.rs`, `lib.rs:632`). Pick one versioning scheme and a real release process.

### B-07 · Medium · Internal org structure baked into code
Comments reference "Team 0…Team 8" in source, Cargo authors (`team3@axiom-nhi.dev`), CODEOWNERS teams (`@axiom-nhi/team-*`), and test docs. For an open-core repo this leaks internal structure and makes ownership meaningless (those GitHub teams likely don't exist). Replace with real maintainers/modules.

### B-08 · Low · Single-commit history
History is squashed to one commit by "Team 7A Frontend Systems". Fine for a private repo; for an open-source launch or customer due diligence, you lose provenance. Also all enterprise work appears authored by a frontend team identity.

### B-09 · Low · Unused workspace dependencies
`Cargo.toml:30-53` (`[workspace.dependencies]`) declares `sqlx`, `aws-config`, `aws-sdk-iam`, `aws-sdk-sts`, `kube`, `k8s-openapi`, `octocrab`, `petgraph`, `cron`, and `tokio` — verified that no member crate inherits any of them via `workspace = true`. They add false confidence and supply-chain surface in the lock file (`Cargo.lock` is 86 KB). Remove until used.

---

## 5. Backend — ExtMCP runtime core

### R-01 · Critical · Revocation snapshot expires ≤5 minutes after startup; no refresh
- **Where:** `services/extmcp/runtime/src/main.rs:98-178, 108-127, 134-138`
- **Problem:** `ConfiguredRevocationChecker` is built once from a JSON file. `expires_at_unix_ms = now + freshness_ttl_seconds` (max 300) is computed at construction and never updated. After that, `check_target` returns `Revoked { "revocation snapshot is stale" }` for **every** request.
- **Impact:** the service self-DoS-es ~5 minutes after each start unless restarted; there is also no way to push a revocation without a restart. Contradicts the `<50 ms` kill-switch claim.
- **Fix:** wire `axiom_kill_switch::RevocationStore` (which already has freshness/versioning, `sync.rs`) behind `ArcSwap`, add an authenticated sync channel (gRPC stream or poll), and keep the file only as a boot-time fallback.

### R-02 · Critical · Observability + kill-switch crates are not connected
- **Where:** `services/extmcp/runtime/Cargo.toml` (no `axiom-audit`, `axiom-kill-switch`, `axiom-telemetry`); no workspace crate depends on them.
- **Impact:** zero audit trail of decisions, no `DENY/WOULD_DENY/ALLOW` records, no trace propagation. Observe-only mode (a core selling point: "shadow denies") records nothing, so customers cannot see what *would* have been blocked.
- **Fix:** inject an `AuditBus` into `CheckPipeline`, emit one record per decision (with policy version, matched policy ids, validator summary, latency), add a file/OTLP/SIEM sink.

### R-03 · Critical · "Tool pinning" never checks the live tool
- **Where:** `validators/src/adapter.rs:51, 76`
- **Problem:** `tool_pin::verify(&profile.tool_definition, &profile.expected_tool_sha256)` hashes the tool definition **from the same trusted config file** and compares it to the digest **from the same config file**. The tool definition returned by the real MCP server (`tools/list`) is never fetched or compared. A server that mutates its tool description (rug-pull / tool poisoning) is not detected.
- **Impact:** MCP03 (Tool Poisoning) — one of the headline features — is not delivered. The risk engine and policy treat `tool_pin_verified == true` as meaningful when it is vacuously true.
- **Fix:** capture `tools/list` responses (requires response-phase inspection, R-04), hash the canonical live definition, compare to the pin, and cache per server/session; alert on drift; support pin approval workflow.

### R-04 · High · No response-side inspection
- **Where:** `services/extmcp/runtime/src/lib.rs:248-255` (`check_response` always `Pass`); `gateway/agentgateway/agentgateway.yaml:30-34` (only `request` phase configured).
- **Impact:** no DLP on tool results, no prompt-injection scanning of returned content, no `tools/list` poisoning detection, no PII/secret redaction. Competitors (Astrix, Aembit, Clutch) market guardrails on agent actions and tool use.

### R-05 · High · gRPC server has no TLS/mTLS and binds `0.0.0.0`
- **Where:** `runtime/src/lib.rs:78-83`; `main.rs:271-273`; `runtime/Cargo.toml` (`tonic` features = `["transport"]` only — no TLS feature).
- **Impact:** the authorization decision service is reachable by anything on the network and can be probed; the gateway↔ExtMCP channel is plaintext, carrying `Authorization` headers (bearer tokens).
- **Fix:** enable tonic TLS, require mTLS with SPIFFE/cert pinning for the gateway, default bind to loopback/pod IP.

### R-06 · High · No logging, health, metrics, or graceful shutdown
- `main.rs` uses `println!`; no `tracing-subscriber` anywhere in the runtime, so every `warn!/error!/debug!` in `authorization/src/lib.rs` (e.g. "cedar engine error — failing closed") is **discarded**. No gRPC health service (needed for Helm probes), no Prometheus/OTLP metrics, no SIGTERM handling (`adapter.serve` has no shutdown signal).

### R-07 · High · No policy hot-reload path
- `policy-api` crate has no dependents; `main.rs:350` loads `DEFAULT_POLICY_BUNDLE` compiled into the binary. The comment in `cedar/src/schema.rs` ("Operators may add or override policies on disk") is not implemented. Customers cannot change policy without rebuilding the binary. `policy-api` has no authentication/authorization concept at all.

### R-08 · Medium · Runtime mode naming is inconsistent
`parse_mode` (`main.rs:196-203`) accepts only `enforce` / `observe`. Interceptor, behaviour matrix, and docs use `observe-only`; the adapter also tolerates `observe_only` in metadata. `AXIOM_RUNTIME_MODE=observe-only` aborts startup. Standardise one spelling.

### R-09 · Medium · `enforce_revocation_in_observe` is hard-coded
`main.rs:358` passes `true`. The D3 decision (kill switch overrides observe-only) is a product decision that must be configurable and documented.

### R-10 · Medium · Weak request correlation
`runtime/src/lib.rs:36,149-161`: fallback request id is `extmcp-<process-local counter>` — resets on restart, collides across replicas. Use UUIDv7. Client-supplied `x-request-id` is honoured (up to 128 chars) without charset validation → log/trace injection risk once audit is wired.

### R-11 · Medium · Single-target only, uninspected methods
`lib.rs:107-114` rejects anything except exactly one service name (multi-backend federation/aggregation unsupported). `agentgateway.yaml:30-34` lists four methods (`tools/call`, `tools/list`, `prompts/get`, `resources/read`) — an allow-list of *inspected* methods. Other MCP methods (`resources/subscribe`, `completion/complete`, `sampling/*`, `logging/setLevel`, tasks, etc.) may bypass the processor depending on upstream semantics (needs verification against agentgateway v1.7.0). Prefer default-deny.

### R-12 · Medium · Unescaped Cedar entity-UID construction
`authorization/src/lib.rs:635-637` builds `Axiom::Tool::"{server}/{tool}"` with `format!`; `tool_name` is client-controlled (`runtime/lib.rs:129-133` checks only non-empty). Today a stray quote fails parsing and denies (fail-closed), but a crafted name causes per-request errors and the pattern is fragile. Use `EntityUid::from_type_name_and_id` with proper escaping.

### R-13 · Low · Denial reasons lose structure
`runtime/lib.rs:221,266` returns the constant `"authorization denied"`. The interceptor's kill-switch detection (`interceptor.js:225`, `REVOCATION_ACTIVE`) therefore never matches the real service. Return a stable machine-readable code (e.g. JSON `mcp_error` with `reason_code`).

---

## 6. Backend — Identity, validators, policy

### Identity (`identity/`)

**I-01 · High · CIMD is not implemented.** `jwt_validator.rs:161` hard-codes `cimd_uri: None`; `verifier.rs:77` documents "CIMD fetching is not implemented". `CimdValidator` only validates caller-supplied JSON (`cimd/mod.rs:107-123`) and no code path fetches a document. The README's "CIMD SSRF-safe cache" and `cimd_uri` Cedar attribute are therefore empty.

**I-02 · High · CIMD SSRF check is incomplete (for when it is used).** `cimd/mod.rs:75-104` checks only IP **literals** and a few hostname suffixes; hostnames that *resolve* to private IPs pass. IPv4-mapped IPv6 (`::ffff:127.0.0.1`) is not unmapped (`is_non_global_ip`, `:131-148`), and ranges such as `192.0.0.0/24`, `198.18.0.0/15`, `224/4` are missing compared to the (better) egress validator. Reuse the JWKS pinned-DNS fetch logic.

**I-03 · High · No replay or per-token revocation.** `token_jti` is extracted (`jwt_validator.rs:112`) and placed in Cedar context but nothing checks it: no jti cache, and `RevocationChecker` (`authorization/src/lib.rs:327-340`) has no `jti` parameter despite the doc "used for per-token revocation checks". A stolen valid token is replayable until `exp`; there is no cap on maximum token lifetime.

**I-04 · High · No sender-constrained tokens.** No DPoP, mTLS-bound (`cnf`) or token-binding support. Bearer-only is the weakest posture and falls short of the "OAuth 2.1" positioning for agentic workloads. Also no `typ: at+jwt` (RFC 9068) check.

**I-05 · Medium · Provider interoperability.** `jwt_validator.rs:30-32` requires a `client_id` claim and models `scope`/`scp` as `Option<String>`. Providers commonly use `azp`/`cid`/`appid` for the client and emit `scp` as a **JSON array** (e.g. Okta) — serde would fail to deserialize and the token is rejected as `InvalidToken`. Add claim mapping per issuer and accept string-or-array scopes. (Code-reading finding; not exercised against live IdPs.)

**I-06 · High · Air-gapped / private IdP deployments cannot work.** `jwks_cache.rs:236-270, 312` rejects any JWKS endpoint resolving to a non-global address (good SSRF protection). But the Helm default is `airGappedMode: true` and typical air-gapped/regulated customers run Keycloak/ADFS/Ping on **private IPs**. There is no per-issuer allow-list of private CIDRs, so the verifier refuses to start (warm-up fails after 5 attempts, `main.rs:314-337`). Add an explicit, per-issuer `allow_private_network` with CIDR scoping.

**I-07 · Medium · Hot-path panics on lock poison.** `jwks_cache.rs:127,139,155,162,195,208,225` use `.expect("… lock poisoned")`. One panic while holding a lock converts into a panic on every later request. Handle `PoisonError` (fail closed with an error), or use `parking_lot`/`ArcSwap`.

**I-08 · Medium · Fixed 5-minute JWKS TTL; no `Cache-Control`; no stale-if-error.** `main.rs:312` hard-codes 300 s. A compromised IdP key stays trusted up to 5 min; an IdP outage past TTL denies everything. Honour `Cache-Control`, add stale-while-revalidate with a bound.

**I-09 · Medium · Algorithm allow-list includes RS256 with 2048-bit minimum only by length check** (`jwt_validator.rs:230-232`, `modulus.len() >= 256`). Acceptable, but add PS256/ES384, and require `kid`-scoped `alg` binding in config.

### Validators (`validators/`)

**V-01 · High · SSRF validation is a TOCTOU, by design.** `egress.rs` resolves DNS at validation time; the actual egress happens later in the MCP server with its own resolver. DNS rebinding bypasses the check. The crate doc admits this (`lib.rs:1-5`) but the product (and `tests/security/test_attack_cases.py` DNS-01) presents it as "blocked". Either enforce at the socket layer (egress proxy that connects to the *validated* IP) or reword claims.

**V-02 · High · Inline DNS without timeout.** `egress.rs:64` awaits `lookup_host` with no timeout, called inline per request (`adapter.rs:181-183`). A slow resolver blows the `<5 ms` budget and the 15 ms deadline, turning DNS latency into a fail-closed outage. Add a timeout, a TTL cache, and do resolution off the hot path.

**V-03 · Medium · IPv6 transition prefixes.** `egress.rs:122-135` accepts all of `2000::/3`, including 6to4 (`2002::/16`) and Teredo (`2001::/32`) which can embed private IPv4 addresses. Exclude them or decode embedded IPv4.

**V-04 · Medium · Allow-list matches any subdomain** (`egress.rs:84-91`). If an operator allows `github.io` or `herokuapp.com`, attacker-controlled subdomains pass. Document and support exact-host entries.

**V-05 · Medium · SQL dialect defaults to Generic.** `main.rs:205-213` (`""` → `Generic`). A statement the generic parser reads as read-only may be parsed differently by the real database (parser differential). Require an explicit dialect per profile. Also only the single configured argument is analysed (`adapter.rs:101-133`) — other arguments (e.g. `params`, `schema`, `options`) are unchecked.

**V-06 · Medium · Missing profile = deny, but profiles are static.** Every tool must be hand-registered with a pinned definition and digest in JSON; there is no discovery/learning mode or UI workflow, which makes onboarding a customer with 40 MCP servers impractical.

**V-07 · Low · Path validator caveats.** TOCTOU acknowledged (`filesystem.rs:208-211`); backslashes are rewritten to `/` on Unix (`decode_path`), mis-handling legitimate filenames; no max path length.

### Policy (`services/extmcp/cedar`, `authorization`)

**P-01 · High · Default bundle denies everything except SQL tools.** `cedar/src/schema.rs` `DEFAULT_POLICY_BUNDLE` has exactly one `permit`: `tools/call` AND `sql_validation_present` AND `sql_statement_count > 0` AND `sql_is_readonly` AND `tool_pin_verified`. Filesystem, HTTP, GitHub, Slack, or any non-SQL tool is denied by default. No `permit` exists for `tools/list`, `prompts/get`, or `resources/read`, so in enforce mode agents can't even list tools. A customer's first request will be blocked.

**P-02 · Medium · Schema/resource mismatch for non-`tools/call`.** The schema declares `resource: [McpServer]` for `tools/list` etc. but the pipeline builds `Axiom::Tool::"<server>/"` for every method (`authorization/src/lib.rs:637`). Even with a permit policy these would fail schema validation.

**P-03 · Low · `DENY_DESTRUCTIVE_SQL` verb list incomplete** (omits `INSERT`, `UPDATE`, `CREATE`, `MERGE`, `COPY`, `CALL`, `SET`, `REVOKE`). Safe today only because the permit requires `sql_is_readonly`; as defence-in-depth it should be complete.

**P-04 · Medium · No policy testing/simulation product.** No per-tenant policy sets, no versioned rollout/rollback, no signed policy bundles, no policy-as-code CI integration — all areas where Aembit sells conditional access.

---

## 7. Observability crates (built but unwired)

| ID | Sev | Problem |
|---|---|---|
| O-01 | High | **Audit writer is not durable or tamper-evident.** `observability/audit/src/writer.rs:66-130` uses `BufWriter` + `flush()` (OS buffer only) — no `fsync`, no rotation, no size cap, no hash chain. Yet `apps/web/app/docs/page.tsx:257` and `SaaSEcosystemPillars.tsx:191` advertise a "tamper-evident cryptographic Merkle tree". There is **no Merkle/hash-chain code** in the repo. |
| O-02 | Medium | **Audit queue drops records under load.** `bus.rs` uses bounded `try_send` (1,024 critical / 8,192 routine). Drops are counted but never surfaced; for a security audit trail, critical-record loss needs a spill-to-disk or backpressure strategy and an alert. |
| O-03 | Medium | **No transport.** Audit sink is a local JSONL file only — no OTLP, syslog, Kafka, S3, or SIEM exporter. |
| O-04 | High | **Kill-switch "authority" does not exist.** `kill-switch/src/sync.rs` accepts snapshots "received from the authority" but nothing sends them; no transport, no authentication of the sync channel. Persistence (`persistence.rs`) is good (0600, fsync, rename) except Windows remove-then-rename gap. |
| O-05 | Medium | **OTel crate has no exporter.** `axiom-telemetry` depends only on `getrandom`; it provides W3C trace-context and measurement helpers, not OpenTelemetry export. "OpenTelemetry" in the README is overstated. |
| O-06 | Low | Revocation targets (`global/mcp_server/agent/tool`) have no `session` kind, while the UI/admin API revoke by *session id* (documented in ADR-001 but unresolved). |

---

## 8. Gateway layer (Node)

### G-01 · Critical · `local-admin-api/server.cjs` is an unauthenticated mock "control plane"
- **Where:** `gateway/local-admin-api/server.cjs`
- No authentication/authorisation on any route. `Access-Control-Allow-Origin: *` (`:56-58`). Listens on `0.0.0.0` (`:345`). No TLS. No request-body size limit (`:101-103`) → memory DoS.
- `PUT /v1/local/policies/bundle` (`:139-162`) accepts **any array of strings** as the active policy bundle (no Cedar parse), and lets any caller set `runtime_mode: "observe_only"` — i.e. disable enforcement.
- `POST …/policies/dry-run` "validates" by checking that each string merely *contains* the substring `permit` or `forbid` (`:124`) — no Cedar parsing.
- `POST …/sessions/:id/revoke` writes into an in-memory `Map` and SSE-broadcasts (`:166-204`); it does **not** call the kill-switch or runtime. `revoked_by` is whatever the caller sends.
- Everything else is canned data: lineage graph (`:207-225`), `simulate-revoke` always `SAFE_FOR_REVOCATION` (`:228-242`), OWASP scorecard `fleet_posture_score: 96` (`:245-259`), secretless leases (`:262-281`), approvals (`:283-298`, returns `'ed25519-sig-bound-decision-' + random` without signing or touching the approvals crate), fleet clusters with fake latencies (`:300-313`), AI-BOM (`:315-330`).
- SSE (`:69-97`): one hard-coded sample event, no heartbeat, unbounded client set, no auth (EventSource cannot send `Authorization`).
- ADR-001 itself states these routes are "proposal/mock artifacts", while the README lists the file as a Phase 1 deliverable and the file header calls itself the "Enterprise Control Plane".
- **Fix:** replace with a real Rust (axum/tonic) admin service: mTLS or OIDC auth, RBAC, audit of admin actions, wired to the kill-switch store, policy-api, lineage/risk services. Until then, never expose this file outside a developer laptop and delete it from the Docker/compose path.

### G-02 · High · `interceptor.js` is not on the real path and fails open on unexpected responses
- Not used by Docker/Helm (they use agentgateway + ExtMCP directly), so its tests (11/11) say nothing about production.
- `:223` only denies when `extMcpResult.result.error` exists; any other shape (`undefined`, `{}`, `{result:{}}`, upstream schema change) falls through to **CASE 3 → ALLOW** (`:297-313`). Fail-closed code must treat "not an explicit Pass" as deny.
- `:225` `authError.message.includes(...)` throws `TypeError` if `message` is undefined → unhandled rejection.
- `:34,108` `emittedAuditEvents` is an **unbounded array** (memory leak).
- `:114-136` the 15 ms `Promise.race` does not cancel the in-flight callout (resource leak under load).
- No timeout on `backendClient.handleRequest`; JSON-RPC batch arrays and notifications unhandled (`:141-147` reads `.method` of an array → `undefined`).
- Kill-switch detection string never matches the real service (R-13).

### G-03 · Medium · Gateway config gaps (`agentgateway.yaml`)
Plain HTTP listener (`:8080`) and plain-HTTP backend (`http://mcp-backend:8000/mcp`); no authentication on the gateway itself, no rate limiting, no max body size, no CORS policy, no response-phase processor. `UPSTREAM_PIN.md` itself says the config was only *schema-validated* and "image startup, actual gRPC behavior, auth/header handling, timeouts, and backend interoperability still require a runtime check" — never done.

---

## 9. Testing and verification quality

### T-01 · Critical · Python "58 tests" do not test the product
- 50 of 59 tests run through `MockGateway`/`MockExtMcp`/`MockIdentityVerifier` in `tests/integration/helpers/mock_stack.py` — a Python re-implementation of the pipeline ("DRAFT BOUNDARY: … configurable stubs"). They prove the mock matches the spec, not that the Rust service does.
- The 9 tests in `tests/integration/test_phases_2_to_4_masterplan.py` assert **constants against themselves** (e.g. `owned_score = 0.95; assert owned_score >= 0.50`). They never import or invoke the Rust crates.
- Perf tests label themselves "(mock, simulated)": timeout path is "simulated instantly… no real 15 ms wait"; kill-switch propagation is "synchronous dict mutation". Output printed: `TIMEOUT_PATH (mock, simulated) p50=10.8µs`.
- `tests/pytest.py` is a hand-rolled pytest **shim** that shadows the real `pytest` (because `tests/` is inserted at `sys.path[0]`, `run_tests.py:11-12`), so even with `requirements-dev.txt` installed the real pytest is never used. Rename it and use real pytest.

### T-02 · High · Real Rust test coverage is lopsided
- 0 tests in all nine enterprise crates (`alerts, approvals, attribution, connectors, fleet-control, lineage-graph, risk-engine, secretless, siem-soar`).
- `extmcp-runtime` (the binary and gRPC adapter) cannot compile, so its tests don't run; the adapter has one trivial test.
- Observed totals: audit 29, identity 25+10+4, kill-switch 41+3, telemetry 16, validators 20/21 (1 failing), authorization 17, cedar 15, policy-api 8.
- No fuzzing (SQL/path/URL/JWT parsers are ideal targets), no property tests, no coverage measurement, no real end-to-end test of gateway → ExtMCP → backend.

### T-03 · High · Performance and security SLOs are unmeasured
The `<5 ms` inline, `15 ms` deadline, and `<50 ms` kill-switch numbers are asserted in README and Helm values (`inlineBudgetMs: 5`, `calloutTimeoutMs: 15`) but never measured against the real binary. The marketing `/benchmarks` page honestly says "No runtime benchmark results are published yet" — which contradicts the performance claims elsewhere on the site.

### T-04 · Medium · Frontend tests are minimal
25 tests in 3 files (secret scrubber, audit export, cedar-editor contracts). `apps/web` has 0 tests; `apps/console` has **no build, typecheck, lint, or test** (its `package.json` has no scripts or dependencies, so Turbo skips it). No e2e (Playwright), no accessibility tests, no visual regression, no contract tests against a real backend.

### T-05 · Medium · Security regression tests are mock-based
`tests/security/test_attack_cases.py` DNS-01/DNS-02 ("rebinding after validation blocked", "301 redirect blocked") pass against the mock; the file's own notes admit full prevention "requires Team 1 to enforce at the TCP socket layer".

---

## 10. Enterprise control-plane crates (Phases 2–4)

> All nine crates: no network I/O, no persistence, no async, no tests, all state in `HashMap`/`Vec`.

### E-01 · High · `connectors` — no discovery exists
- `connectors/src/lib.rs`: `DiscoveryOrchestrator` has two pure normalizers (`normalize_aws_role`, `normalize_k8s_service_account`). No AWS/K8s/GitHub/Slack API calls; `ConnectorKind::{Github,Slack}` have no implementation; `RateLimitPolicy` is a struct with no limiter.
- `:130-131` K8s service accounts get **hard-coded** `created_at = 1_755_000_000`, `last_used = 1_763_200_000` — fabricated values that make dormancy/age rules (NHI1, NHI7) wrong for every K8s identity.
- `fingerprint_credential_id` (`:47-51`) HMACs the **entity UID** (`:100,129`), not credential material or key IDs. Shared-secret detection (NHI9) across systems depends on fingerprinting the *same secret value/key id seen in different places*; this design cannot do that.
- `raw_permissions` is whatever string list the caller supplies — no parsing of IAM policy/trust documents, no wildcard/cross-account/OIDC-provider analysis. Tenant salt is raw `Vec<u8>` with no key management/zeroisation.

### E-02 · High · `lineage-graph` — not a graph database, not Postgres-backed
- `lineage-graph/src/lib.rs`: `Vec<GraphEdge>`; `upsert_edge` is an O(E) linear scan per insert (`:55-61`) → O(E²) ingest; each BFS step scans all edges (`:73,88,99`) → O(V·E). Will not scale to millions of identities.
- The SQL migration is never executed (no `sqlx` use, no migration runner). It contains **no recursive CTE** (the only "recursive" text is a comment at line 37); it defines a self-join view.
- Schema: no `tenant_id` anywhere, `entity_uid` is a global primary key (cross-tenant collisions, no row-level security); `ON DELETE CASCADE` on both edge FKs destroys lineage history on node removal; edges require nodes to pre-exist (ordering constraint for ingest); `call_count_24h` as a stored counter needs windowing; no audit columns.
- Logic: `safe_to_revoke_immediately = siblings.is_empty() && transitive.is_empty()` (`:111`) — a credential with exactly **one** dependent agent is reported "safe" even though revoking breaks that agent. In cyclic graphs the target can appear in its own transitive set (`visited` doesn't include `target_uid`). Blast score uses magic numbers (`*18`, `+15`).

### E-03 · Medium · `attribution`
`parse_codeowners` stores a `HashMap` (`:36-52`), losing order — CODEOWNERS is **last-match-wins** and uses gitignore-style globs; none implemented. The "git blame <180 days" rule is only a comment. `cloud_owner_tag` is used as an e-mail (`:79`); fallback team `"@platform-sec"` hard-coded (`:80`). The IdP-active check is a caller-supplied boolean. Confidence scores are hard-coded constants with no calibration.

### E-04 · Medium · `risk-engine`
Boolean flags over a pre-computed `EntitySecurityTelemetry` struct — **nothing computes that telemetry**. Thresholds fixed (90 days). Scoring is mathematically incoherent: an entity violating **all 10** NHI controls with `blast_radius_score = 0` gets `exposure=100`, `composite=(100+0)/2=50` → **MEDIUM** (`:114-126`). No per-finding severity, evidence, remediation text, exceptions/suppression, or history.

### E-05 · Medium · `alerts`
Only `AlertDeduplicator` (in-memory, unbounded `HashMap`, lost on restart → alert storms after redeploy) and a `ShadowAuditSummary` struct. No Slack Block Kit or Jira client, no "30-minute audit generator". The fingerprint includes `severity`, so severity flapping defeats dedup.

### E-06 · High · `secretless` — no OpenBao, and the exchange verifies nothing
- No OpenBao/Vault client; "zero-secret browser pills" is a metadata struct.
- `exchange_rfc8693_token` (`:61-105`) never validates the subject token — it receives `subject_token_jti` as a plain string and `parent_granted_scopes` from the caller. The "issued" `jti` is a truncated (64-bit) SHA-256 of the inputs (`:80-91`) — deterministic, not unique; the same request yields the same jti. `act_chain` is a fixed 2-element vector, not a multi-hop chain extending an existing `act`. "Canonical URI" check is `starts_with("https://")` (accepts `https://`, userinfo, etc.). Empty `requested_scopes` allowed.
- **Rotation state machine bugs:** `total_dependent_workloads = 0` ⇒ first heartbeat immediately reaches `GraceWindowVerified` (`:145-152`), then `finalize_legacy_revocation` revokes the old credential with **zero consumers verified** — dangerous when the lineage graph is incomplete. Heartbeats are additive counts (`count: u32`), not per-workload IDs, so duplicates inflate progress. No grace-window *time* element despite the name. `error_spike_detected` is a public settable field; no cleanup of the new secret on rollback.

### E-07 · Critical · `approvals` — single-use can be defeated
- **Re-approval bug:** `approve_ticket` (`approvals/src/lib.rs:106-132`) checks only expiry and payload hash, then unconditionally sets `status = Approved`. A ticket already `Consumed` (or `Denied`) can be set back to `Approved` and consumed again within its expiry window. The "atomic single-use" guarantee fails.
- **Hash ambiguity:** `compute_payload_sha256` concatenates `agent|server|tool|args` with `|` and no length prefix (`:51-60`) — `("a|b","c")` and `("a","b|c")` collide. The module doc promises a `nonce` in the hash; the function has none. "Canonical" JSON is whatever string the caller passes (no RFC 8785 here, although `validators` has `serde_jcs`).
- "Atomic" only means `&mut self` exclusivity; no persistence, no locking story for multi-replica, no `deny_ticket` method although `Denied` exists, no approver authentication or requester≠approver separation, no Slack signature verification (timestamp window / HMAC compare) — **no Slack code at all**. Hash comparison is not constant-time.

### E-08 · High · `siem-soar` — CEF output is injectable and incomplete
`siem-soar/src/lib.rs:29-41`: a single `format!` building CEF with **no escaping** of `|`, `\`, `=`, or newlines. `tool_name`, `actor_spiffe_id`, `target_resource` originate from MCP clients (attacker-influenced), so an agent can forge extra CEF fields/events in the customer's SIEM. There is no OCSF serializer despite the type name, no timestamp (`rt=`), no HTTP senders for Splunk HEC/Sentinel/CrowdStrike/Datadog, no batching/retry/dead-letter, no credential handling or TLS config.

### E-09 · Critical · `fleet-control` — fake signature, hard-coded date, missing features
- `generate_signed_ai_bom` (`fleet-control/src/lib.rs:197-225`): the "Ed25519 signature" is `format!("ed25519:axiom-enclave-sig:{}", &digest[..32])` — no key, no signing. `generated_at_iso` is the literal `"2026-11-15T18:00:00Z"` (`:212`). The digest covers only tenant + agents + servers using Rust `{:?}` Debug formatting (non-canonical, can change between compiler versions) and **excludes** `pinned_tool_hashes` and the compliance list. `bom_format: "CycloneDX-AI-BOM"` is not a valid CycloneDX document (`bomFormat: "CycloneDX"`, `components`, …). It embeds a hard-coded list claiming "SOC 2 Type II", "ISO/IEC 42001", "EU AI Act Article 15 & 50". A customer or auditor receiving this artefact would believe it is signed and attested when it is neither.
- `SpiceDbDelegationGraph` (`:23-66`) is a `Vec` fixpoint scan (O(n²)), no SpiceDB.
- Rightsizing (`:81-124`): treats any `:*` permission as removable even if observed; emits `"Action": []` (invalid IAM) when no usage observed; single `Resource` string; no rollback/canary → can generate policies that break workloads.
- The README's "multi-cluster canary rollout manager" and "distributed spend circuit breakers" appear only in a doc comment — no code.
- Metering (`:129-178`): pure function; no persistence, idempotency, signing, or tamper evidence — unsuitable for billing.

---

## 11. Frontend

### 11.1 Module reality check

| Area | Data source |
|---|---|
| gateway-ui **Traffic** | SSE to `/v1/local/events/stream` (served only by the mock server); **falls back to a mock generator** |
| gateway-ui **Kill switch / Audit explorer** | `fetch` to mock revoke route; local state otherwise |
| gateway-ui **Policy studio** | Local + mock adapter (`packages/cedar-editor/src/adapters/mock.ts`); a same-origin `/v1/local/*` backend dry-run adapter exists (`backend-dry-run.ts`, not reviewed in depth), but the only server for those routes is the mock admin API |
| gateway-ui **Alerts, Approvals, Attribution, Connectors, Deployments, Fleet, Identity, Lineage, Observability, Risk, Secretless, SIEM** | **Static / hard-coded** — the whole frontend has only 4 network call sites |
| `apps/console` (2,164-line `App.tsx`) | **Entirely static** data (workloads, traffic, audit logs, Cedar text); not built or typechecked by any pipeline |
| `apps/web` sign-in / sign-up | **Fake** (both use `setTimeout` + redirect to `http://localhost:5173`; `sign-up/page.tsx:19-23,109`) |
| `apps/web` playground / simulators | Scripted simulations |
| `apps/web` contact form | Real endpoint, weak (see F-08) |

### F-01 · Critical · Kill-switch UI reports success regardless of outcome
`apps/gateway-ui/src/modules/killswitch/KillSwitchPage.tsx:92-105`: the `fetch` result is never checked (`res.ok` ignored) and the `catch` is empty ("Local fallback"). The UI then adds an `ACTIVE_BLOCK` record and shows "Revocation enacted… **Sub-100ms kill confirmed.**" In an incident, an operator would believe a compromised agent was contained when nothing happened. Same pattern in `killswitch-audit/AuditExplorer.tsx:184`. `operatorEmail` (`:38`) is free text the user can edit and is sent as `revoked_by` — the audit actor is spoofable.

### F-02 · High · "Restore" does not talk to the backend
`KillSwitchPage.tsx:109-114,290`: `handleRestore` flips local state only. The UI shows a workload as RESTORED while the backend (if any) still blocks it — or vice versa.

### F-03 · Critical · Silent mock fallback labelled "connected"
`apps/gateway-ui/src/modules/traffic/hooks/useSSEConnection.ts:185-200, 208-220`: on `onerror` and on `catch`, the hook sets `state: 'connected'` and starts `MockSSEServer` (15 events/s) — "Seamless fallback to Live Telemetry Replay Simulator so UI is always interactive & live". Fake traffic, fake agents and fake decisions are presented as live telemetry in a security console. The `__mocks__` module also ships in the production bundle. Production builds must show a disconnected/error state, and mock injection must be dev-only (`import.meta.env.DEV`).

### F-04 · High · No authentication, session, tenant, or RBAC in any UI
- `apps/web/app/sign-in/page.tsx:11-23, 90-100`: password never sent anywhere; `setTimeout` then `window.location.href = "http://localhost:5173"`. The "Okta SAML 2.0 / OIDC" button is another timer + the same redirect. Sign-up similar.
- The gateway UI/console have no login, no role model, no tenant switcher, no per-user audit identity. SSE `EventSource` cannot send auth headers (needs cookie auth or fetch-based stream).

### F-05 · High · Fabricated metrics shown as truth
Hard-coded posture "96", blast scores, lease counts, cluster p99 latencies, "x calls/24h" come from the mock server and static arrays. Fine for a clearly-labelled demo; not for a product page that says "live". Add a visible "DEMO DATA" state and remove fake numbers from production builds.

### F-06 · High · `next build` ignores TypeScript errors
`apps/web/next.config.ts:7` `typescript.ignoreBuildErrors: true` (also `experimental.cpus: 1`). `apps/web` currently typechecks, but this setting disables the safety net permanently.

### F-07 · Medium · No security headers
`next.config.ts` defines no `headers()`: no CSP, `X-Frame-Options`/`frame-ancestors`, HSTS, `Referrer-Policy`, `Permissions-Policy`. The gateway UI (Vite) is served with none either — critical for a console that issues revocations (clickjacking). `EnclaveVisual.tsx:270` uses `dangerouslySetInnerHTML` with locally built SVG (low risk now; keep it constant-only).

### F-08 · High · Contact API is abuse-prone and lies to the user
`apps/web/app/api/contact/route.ts`: no rate limiting, CAPTCHA/Turnstile, honeypot, length limits, or origin check; email validity is `includes("@")`; `Math.random()` ticket IDs (`:17`) collide; `message`/`name` are pasted into Slack mrkdwn unsanitised (`<!channel>` / link injection); Resend/Slack failures are swallowed and the endpoint **still returns `ok: true`** with "Security engineering team notified. **Response scheduled under 15 minutes.**" — leads can be silently lost and the SLA promise is fabricated. Invalid JSON returns 500. Collects PII with no privacy notice.

### F-09 · Medium · Resilience and scale
SSE store is bounded (2,000, good) but there is no auth, no replay (`Last-Event-ID`), no backpressure UI, and the gateway-ui bundle ships a **~2.7 MB (696 KB gzip) Monaco `setup` chunk** (`dist/assets/setup-*.js`); the bundle-budget gate passes only because it measures the initial JS (147 KiB), not the policy-studio route. The only React error boundary in the tree wraps the Cedar editor (`packages/cedar-editor/src/components/CedarEditor.tsx:119`) — none at the app or route level, so a render error in any other page blanks the console. No i18n library is present in any package.

### F-10 · Medium · Accessibility and design-system drift
137 `aria-`/`role` usages across the codebase but only 3 `prefers-reduced-motion` references; no automated a11y tests; 289 hard-coded colour violations (B-04); marketing CSS is a single 5,844-line file. The token-contrast gate passes (32 pairs) but covers tokens, not rendered pages.

### F-11 · Medium · Marketing site essentials missing
No privacy policy, terms, DPA, cookie policy page (a consent banner exists and writes a `Secure` cookie), `robots.txt`, sitemap, OG image, favicon/`public/` directory, `not-found`/`error` pages, analytics, or structured data. The docs page is a single route.

### F-12 · Medium · Product UI gaps vs competitors
No identity **inventory** table with filters/saved views, no **ownership workflow** (assign/attest/escalate), no **remediation** actions (rotate/disable/decommission with approval), no **posture trend** over time, no compliance reports/export, no integrations setup wizard, no notifications centre, no onboarding, no API-key management, no user/tenant admin.

### F-13 · Low · Hard-coded `localhost` URLs
`sign-in/page.tsx:22,98` → `http://localhost:5173`; `vite.config.ts` proxies `/v1` to `http://localhost:8787`. Use configuration; fail visibly if the backend is absent.

---

## 12. Deployment and infrastructure

### D-01 · High · Helm chart does not deploy a working system
`deployments/helm/axiom-nhi/` has one template (45 lines): a gateway `Deployment` and a `NetworkPolicy`. Missing: ExtMCP Deployment, Service(s), Ingress/Gateway API, ConfigMaps/Secrets, ServiceAccount/RBAC, probes, resources/limits, PodDisruptionBudget, HPA, anti-affinity, Postgres/OpenBao/SpiceDB templates (values exist, templates don't), migrations Job. The Deployment uses the **upstream** image (`values.yaml:8-10` `ghcr.io/agentgateway/agentgateway:v1.7.0`) with no config mount, so the pod is a gateway with **no Axiom enforcement**. `edition: "ultimate"` is a free-text value with no gating.

### D-02 · High · NetworkPolicy breaks DNS and leaves ingress open
Egress allows only `podSelector: {}` (same-namespace pods): no rule for kube-dns, so name resolution fails; no ingress rules/`policyTypes: Ingress`. With `airGappedMode: true` as default, ExtMCP's JWKS fetch to an external IdP is also blocked (and see I-06 for private IdPs).

### D-03 · High · No pod hardening
No `securityContext` (runAsNonRoot, readOnlyRootFilesystem, dropped capabilities, seccomp), no `automountServiceAccountToken: false`, no resource limits, no PSA labels. `Dockerfile.agentgateway` has no `USER` (relies on upstream image); neither Dockerfile has a `HEALTHCHECK`; images are tagged not digest-pinned (`rust:1.85-bookworm`, `debian:bookworm-slim`); `Dockerfile.extmcp:11` `COPY . .` copies the whole repo into the builder layer.

### D-04 · High · `docker compose up` fails out of the box
Compose mounts `deployments/docker/config` at `/etc/axiom`, but that directory contains only `*.example.json`; the service requires `identity.json`, `validation-profiles.json`, `resources.json`, `revocations.json` (`main.rs` uses `required_path`) and exits. (It also can't build — B-01.) The compose "backend" is a Node mock that mounts the whole repo read-only.

### D-05 · Medium · No Postgres/OpenBao/SpiceDB reality
Helm values enable them (`postgresLineage`, `openbao`, `spicedb`), but no code connects to any of them. No backup/DR, no migration strategy (`CREATE TABLE IF NOT EXISTS` only), no HA design for stateful components, no secrets-management story for the config files that carry trust anchors.

### D-06 · Medium · Air-gap claim unverified
`check_gateway_ui_offline.py` fails (B-04); Helm defaults claim air-gap while images come from `ghcr.io`; no image-mirroring or offline bundle instructions; no SBOM/provenance for images.

---

## 13. CI/CD and supply chain

### C-01 · High · CI is red and checks the wrong things
`.github/workflows/phase1-frontend-gates.yml`:
- `cargo clippy --workspace --all-targets -- -D warnings` **fails** (compile errors, dead-code warnings).
- `pnpm run lint` fails; `check_gateway_ui_offline.py` and `check_frontend_colors.py` fail.
- **Not run at all:** `cargo test`, `cargo fmt --check`, `cargo build --release`, `python3 tests/run_tests.py`, Node interceptor tests, `docker build`, `helm lint/template`, `cargo audit`/`cargo deny`, `npm audit`/`pnpm audit`, CodeQL/Semgrep, secret scanning (gitleaks), SBOM generation, licence checks, image scanning (Trivy/Grype), image signing (cosign), release workflow.
- Actions are pinned by tag (`@v4`/`@v5`), not commit SHA; no `timeout-minutes`, no `concurrency`; no Dependabot/Renovate.

### C-02 · Medium · CODEOWNERS covers only part of the repo
Covers docs, gateway, extmcp, identity, validators, observability, tests. **No owners** for `apps/`, `packages/`, `connectors/`, `attribution/`, `lineage-graph/`, `risk-engine/`, `alerts/`, `secretless/`, `approvals/`, `siem-soar/`, `fleet-control/`, `deployments/helm/`, `.github/`. Owners are non-existent teams (B-07). The security-critical approvals/secretless code has no required reviewer.

### C-03 · Medium · Dependency posture
Wide `^` ranges in `package.json` files (lockfile mitigates), `reqwest`/`jsonwebtoken`/`sqlparser`/`cedar-policy` need an advisory watch (`cargo audit`), Monaco bundle is large, no SBOM. Test private key `identity/tests/fixtures/identity_test_private.pem` is committed (explicitly allow-listed in `.gitignore`; correct for a fixture, but add a secret-scanner allow-list entry so it doesn't generate noise or mask real findings).

---

## 14. Legal, compliance, licensing, and trust

### L-01 · Critical · Unsupported compliance and security claims
| Claim | Location | Reality |
|---|---|---|
| "SOC 2 Type II", "HIPAA Ready", "ISO 27001 Aligned" badges | `apps/web/app/components/TalkToEngineerSection.tsx:88-90` | No audit, no controls evidence in repo |
| "**FIPS 140-3 and SOC 2 Type II attestation enforced**" | `apps/web/app/sign-in/page.tsx:115` | Code uses `ring`/`rustls`, not a FIPS-validated module; no attestation |
| "immutable Merkle audit trails", "tamper-evident cryptographic Merkle tree … **complete SOC 2 and HIPAA compliance with zero data leakage risk**" | `SaaSEcosystemPillars.tsx:191`, `docs/page.tsx:257-259` | No Merkle/hash-chain code exists (O-01) |
| "Ed25519-signed AI-BOM" | README, `server.cjs`, `fleet-control` | Not signed (E-09) |
| "Response scheduled under 15 minutes" | `api/contact/route.ts` | No such process |
Competitors in this space publish real attestations (per the roundup cited below: Entro, Oasis, Clutch list SOC 2/ISO 27001; Token Security lists ISO 27001 with a trust centre). Enterprise buyers send security questionnaires; unverifiable claims lose deals and can create false-advertising and contractual-misrepresentation exposure. **Remove or reword every claim until an auditor has issued the report.** "HIPAA compliant/ready" is not a certification.

### L-02 · High · No LICENSE/NOTICE/SECURITY/CONTRIBUTING/CHANGELOG
The repo declares Apache-2.0 in manifests but has no `LICENSE` or `NOTICE` file (root has none). Without it the code is, in practice, "all rights reserved". Also missing: `SECURITY.md` (vulnerability disclosure — essential for a security vendor), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, third-party licence inventory (OpenBao MPL-2.0, Monaco MIT, fonts OFL).

### L-03 · High · Open-core boundary contradicts the licence headers
README defines an Apache-2.0 community runtime and a separate **Enterprise Control Plane** (`connectors/`, `attribution/`, `lineage-graph/`, `risk-engine/`, `alerts/`, `secretless/`, `approvals/`, `siem-soar/`, `fleet-control/`, `apps/console/`, Helm). But those crates' headers say "Licensed under Apache-2.0" (e.g. `connectors/src/lib.rs:1`, `secretless/src/lib.rs:1`, `fleet-control/src/lib.rs:1`) and the workspace licence is Apache-2.0 for all. If published as-is, you grant everyone the commercial tier. Decide the boundary, use a separate licence (BSL/ELv2/commercial) or private repo for enterprise code, and document it.

### L-04 · Medium · Privacy and data handling
Contact form collects name/email/company/message with no privacy notice, retention policy, or DPA; third-party processors (Resend, Slack) undeclared; cookie banner exists but no cookie policy; no data-residency or retention design for audit logs, PII redaction rules unreviewed (`redact.rs`), no GDPR DSR process.

### L-05 · Medium · Brand and identity consistency
Mixed domains in code: `axiomnhi.io` (`Cargo.toml`), `axiomnhi.dev` (contact route sender/recipient), `axiom-nhi.dev` (identity crate authors), `github.com/axiom-nhi/axiom-nhi` (footer link) vs the actual repo owner. Verify domain ownership and run a trademark clearance for "Axiom" in the security/identity class before launch.

### L-06 · Low · Security documentation is a stub
`docs/security/README.md` is 13 lines: no threat model (STRIDE/abuse cases), data-flow diagrams, key management, trust boundaries, incident-response plan, vulnerability policy, pen-test plan, or customer-facing security whitepaper.

---

## 15. Missing production capabilities (vs. the six competitors)

### X-01 · High · Platform fundamentals absent
Multi-tenancy (tenant isolation in storage, config, policy, audit), RBAC/ABAC for operators, SSO (SAML/OIDC) and SCIM, API keys/service accounts for the control plane, a public REST/gRPC API with versioning, Terraform provider/SDKs, HA/clustering, backups/DR, data retention, rate limiting/quotas, usage metering/billing, status page/SLOs/runbooks, support tooling.

### X-02 · Competitor capability gap

Competitor capabilities below come from a third-party roundup ([Expert Insights — Top NHI management solutions](https://expertinsights.com/identity-and-access-management/top-nhi-management-solutions)); verify against each vendor's own documentation before using them in sales material.

| Capability | Competitor baseline (per roundup) | Axiom NHI today |
|---|---|---|
| **Discovery breadth** | Astrix: AWS, GCP, Azure, M365, Google Workspace, Slack, Jira, Salesforce, GitHub, Snowflake, Databricks, Kubernetes. Oasis: IdPs, vaults (HashiCorp, Azure Key Vault, AWS KMS), SaaS/data platforms, AI services. Entro: clouds, code, CI/CD, on-prem, collaboration tools. Clutch: agentless, one-click deployment | **None working.** 2 normalizer functions |
| **AI agent / MCP discovery** | Astrix: agents + MCP servers; Token Security: agents; Clutch: discovers agents, guardrails on permissions/tools | No discovery of shadow MCP servers/agents; only inline enforcement for pre-registered tools |
| **Secret rotation** | Aembit: automated rotation + short-lived credentials; Oasis: "safe" rotation that avoids breaking dependents; Clutch: automated rotation workflows; Astrix: centralised secret management | Rotation state-machine stub with bugs; no vault integrations |
| **Lifecycle / ownership** | Token: enforces ownership, auto-decommissions orphans; Entro: ownership attribution, creation→retirement; Clutch: ownership, expiry, access reviews | Pure attribution function; no workflows, tickets, reviews, or decommissioning |
| **Workload IAM / secretless** | Aembit: policy-based access, no-code auth injection at proxy, eliminates standing credentials; Astrix: JIT scoped access | Gateway enforces *allow/deny*; no credential brokering/injection |
| **Posture & risk** | Entro: continuous checks for over-privileged, idle, orphaned tokens; Token: permissions drift, identity graph with blast radius; Clutch: risk by scope/blast radius | Boolean OWASP flags over pre-computed inputs; incoherent scoring (E-04) |
| **Threat detection (ITDR)** | Astrix: agentic threat detection; Entro: NHI detection engine; Clutch: anomalous behaviour; Oasis: anomaly detection + remediation | None (no behavioural baselines, no anomaly engine) |
| **Compliance evidence** | Entro: SOC 2 Type II + ISO 27001; Oasis/Clutch: SOC 2 + ISO 27001; Token: ISO 27001 + public trust centre | **No attestations**; unsupported claims (L-01) |
| **Agent authorisation for MCP** | Aembit: MCP authorization policies and identity-based conditional access; Astrix: Agent Control Plane | **Closest overlap and your real wedge** — but runtime doesn't build, no audit, tool pinning ineffective |
| **Integrations/ecosystem** | Wide SIEM/ITSM/IdP/vault connectors | None working |
| **Delivery model** | Mostly SaaS, agentless onboarding in minutes | Self-hosted only, hand-written JSON config per tool |

**Positioning implication:** you cannot out-breadth six funded vendors on discovery in the near term. The differentiated, credible story is *"open, inspectable, inline MCP/agent runtime authorisation with Cedar policy and validator-grounded facts"* — and that story currently fails on build, audit, tool-pinning, and operability. Fix those, then add discovery depth incrementally.

---

## 16. Prioritised remediation roadmap

Effort key: **S** ≤ 3 days · **M** ≤ 2 weeks · **L** ≤ 6 weeks · **XL** > 6 weeks (single engineer, rough).

### P0 — Do before anyone outside the team sees it (≈ 3–5 weeks)
1. **B-01, B-02, B-03, B-05** — make it compile, green tests, green lint/clippy (S).
2. **Fix CI (C-01)**: add `cargo build/test/fmt`, Python and Node tests, `cargo audit/deny`, gitleaks, CodeQL, `docker build`, `helm lint` (S–M).
3. **L-01 / L-02 / L-03** — delete or reword unsupported claims; add LICENSE/NOTICE/SECURITY.md; decide open-core licence split (S).
4. **R-01, R-02, R-06** — wire kill-switch store + audit bus + tracing into the runtime; durable audit sink; fix 5-minute self-expiry (M).
5. **R-03, R-04** — real tool pinning against live `tools/list`; add response-phase hook (L).
6. **E-07** approvals re-approval/hash bugs; **E-09** remove fake signature or implement real Ed25519 with key management; **E-08** CEF escaping (S–M).
7. **G-01 / F-01 / F-02 / F-03 / F-04** — replace mock admin API with an authenticated service or gate it dev-only; make the UI truthful (errors visible, no mock fallback in prod, real restore) (M–L).
8. **P-01** — ship a usable default policy pack (tools/list, resources, prompts, generic tools, deny-by-default with explicit exceptions) (M).

### P1 — Before a design-partner pilot (≈ 6–10 weeks)
- **R-05** TLS/mTLS; **I-03/I-04** replay + DPoP/mTLS-bound tokens; **I-05/I-06** IdP interoperability and private-IdP support; **I-08** JWKS caching semantics; **V-01/V-02** egress pinning or socket-layer enforcement, DNS timeout/cache.
- Real Helm chart (ExtMCP, Services, probes, securityContext, NetworkPolicy with DNS, PDB, HPA, config/secret handling) and a working `docker compose` (**D-01…D-04**).
- Real end-to-end tests against the built stack (gateway → ExtMCP → backend), with measured latency percentiles (**T-01…T-03**), fuzzing for SQL/URL/path/JWT parsing.
- Multi-tenant data model and RBAC/SSO for the control plane (**X-01**); persistence for approvals/alerts/rotation/lineage in Postgres with migrations.
- Auth, rate limiting, abuse protection and privacy notice for the website (**F-07, F-08, F-11, L-04**).

### P2 — Toward GA (≈ 3–6 months)
- Real connectors, starting with the competitors' common core: AWS IAM, GitHub, Kubernetes, Okta/Entra, HashiCorp Vault/AWS Secrets Manager; actual lineage store and scalable graph queries (**E-01, E-02**).
- Risk engine fed by real telemetry with defensible scoring; ownership workflows and remediation actions (**E-03, E-04, F-12**).
- Secret-rotation orchestration against real vaults with safe-rollout semantics (**E-06**), SIEM/SOAR shippers with retries/DLQ (**E-08**).
- Operational readiness: SLOs, dashboards, runbooks, backup/DR, upgrade path, SBOM + signed images + provenance.
- Start SOC 2 Type I → Type II; threat model; third-party pen test (**L-06**).

### P3 — Competitive parity
Agentless discovery breadth, shadow MCP/agent discovery on endpoints, ITDR/anomaly detection, JIT access and credential injection, compliance reporting packs, marketplace/integration ecosystem, SaaS delivery option.

---

## 17. What is already good (keep and build on)

- **JWT validation** (`jwt_validator.rs`): algorithm allow-list, mandatory `kid`, JWK/`alg` consistency, public-only keys, exact RFC 8707 audience match with a regression test for suffix-matching attacks, bounded token size.
- **JWKS fetching** (`jwks_cache.rs`): resolves DNS, rejects non-public addresses, pins `reqwest` to the checked IPs (`resolve_to_addrs`), disables redirects and ambient proxies, caps response size and DNS results, throttles unknown-`kid` refreshes, rejects symmetric/private JWK material.
- **SQL classifier** (`sql.rs`): real AST parsing (not regex), treats locks, `INTO`, data-modifying CTEs, table functions and non-allow-listed functions as non-read-only, dialect support.
- **Tool-definition hashing** with RFC 8785 JCS and constant-time compare (`tool_pin.rs`) — the primitive is right; it just needs the live definition (R-03).
- **Pipeline design**: revocation → identity → validators → Cedar with fail-closed handling at every stage; secrets never logged; Cedar receives structured facts, not raw SQL/paths.
- **Audit bus design**: bounded priority channels, non-blocking producers, redaction layer, drop counters.
- **Kill-switch persistence**: 0600 temp file, `sync_all`, atomic rename, versioned snapshots with freshness semantics.
- **Honest internal docs**: ADR-001 and `UPSTREAM_PIN.md` candidly record what isn't implemented — the problem is that README, website, and mock server contradict them.
- **Frontend foundations**: TypeScript `strict` + `noUncheckedIndexedAccess`, only 1 `ts-ignore`/`any`/`eslint-disable` in the tree, design tokens with contrast gate, virtualised traffic table, bounded SSE buffer, secret scrubber with tests, the `/benchmarks` page that refuses to publish unmeasured numbers.

---

## 18. Suggested first week

1. Day 1: fix B-01/B-02/B-03; get `cargo test --workspace` and `pnpm lint` green; add them to CI.
2. Day 2: purge false claims (L-01); add LICENSE/SECURITY.md; decide the enterprise licence split.
3. Day 3: make the kill-switch UI honest (F-01/F-02/F-03); put the mock admin API behind `NODE_ENV=development` with loud warnings.
4. Day 4–5: wire audit + kill-switch + tracing into `extmcp-runtime`; fix R-01; write one real end-to-end test that boots the binary and asserts a deny.

*End of report.*
