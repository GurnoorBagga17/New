# Axiom NHI — Zero-Trust Forensic Codebase Audit & Real-Integration Engineering Spec

**Target Repository:** `c:\Users\Lenovo\Desktop\Axiom` (`GurnoorBagga17/New`)  
**Reference Specification:** `Axiom_NHI___Final_Win_Master_Plan.pdf` (Phases 1–4, Gates G1–G4)  
**Role Assigned to AI Agent:** Principal Security Systems Auditor & Staff Distributed Systems Engineer  
**Audit Posture:** **Strict Zero-Trust Verification.** Assume every previous "100% Passed" engineering report is false until proven by live network sockets, real database transactions, real gRPC/HTTP wire calls, and executed end-to-end tests.

## 1. Why the Previous Engineering Report Cannot Be Trusted (Red Flags to Investigate Immediately)

You are receiving this specification because the previous engineering summary claimed **"100% Production Ready across all 4 Phases"** while exhibiting classic signs of **"In-Memory / Mock Theater"**:

1. **`cargo test --workspace --no-run` Was Used Instead of Running All Tests:** Compiling test binaries with `--no-run` only proves that Rust syntax and types check. It does not prove that services start, listen on sockets, connect to PostgreSQL/OpenBao/SpiceDB, or pass integration tests.
2. **In-Memory Structs Masquerading as External Integrations:** Several Rust crates (`connectors/`, `lineage-graph/`, `secretless/`, `approvals/`, `alerts/`, `siem-soar/`, `fleet-control/`) must be inspected to determine whether they actually perform network/database I/O or merely manipulate in-memory `Vec`, `HashMap`, or `BTreeSet` structures and return formatted strings.
3. **Split-Brain Control Plane vs. Data Plane:** You must check whether `gateway/local-admin-api/server.cjs` (Node.js) and `services/extmcp/runtime/src/main.rs` (Rust) are two completely disconnected processes holding separate in-memory state, meaning policy activations or kill-switch revocations in the UI never actually reach the Rust `ExtMCP` gRPC server.
4. **Architecture Misattribution in the Previous Report:** The previous report claimed *"SpiceDB Delegation Graph (`identity/`)"*, whereas `identity/` only contains JWT/JWKS/CIMD/RFC 8707 modules and SpiceDB logic was placed in `fleet-control/`.
5. **Ephemeral In-Memory Web Authentication:** You must verify whether `/api/auth/register`, `/api/auth/login`, and `/api/auth/oidc` in `apps/web` persist accounts, tenants, and sessions in PostgreSQL or in an in-memory JavaScript `Map` that wipes all customer accounts on process restart.

## 2. Mandatory Rules for Your Review & Engineering Output

When executing this review, you **MUST** obey these six rules:

1. **No In-Memory Stubs Count as "Implemented":** If a crate or route is supposed to talk to PostgreSQL, OpenBao, SpiceDB, AWS IAM, Kubernetes, GitHub, Slack, Jira, or an OIDC Identity Provider, and it instead uses an in-memory `Vec`/`HashMap`/`Map` or hardcoded JSON, you **MUST** classify it as **`[FAKE / IN-MEMORY STUB]`**, never `[PRODUCTION READY]`.
2. **Cite Exact File Paths and Line Ranges:** Every finding must cite the exact file path and line numbers (`path/to/file.rs:L15-L64`) and quote the offending code or missing network/DB client.
3. **Classify Every Subsystem Using Only These 4 Verdicts:**
   - **`[REAL & LIVE-WIRED]`**: Real network/DB/IPC client, real error handling, real persistence, and verified by an executed integration test.
   - **`[DISCONNECTED ISLAND]`**: Real logic exists inside the module, but it is not wired to the live server/gateway/database pipeline.
   - **`[FAKE / IN-MEMORY STUB]`**: Pretends to implement a connector, database, broker, or integration using in-memory data structures or static strings with zero real I/O.
   - **`[MISSING]`**: Does not exist in the codebase.
4. **Verify Actual Execution (Never Use `--no-run`):** You must run `cargo test --workspace` (without `--no-run`), run all Node/Python/Playwright tests, and report the actual stdout/stderr of every test binary.
5. **Fix Every Fake, Stubbed, or Disconnected Component:** After outputting the forensic audit report, you must engineer the real database, gRPC, HTTP, OAuth, and connector implementations specified in Section 4.
6. **Preserve Enterprise Light Theme (`#F8FAFC` / `#FFFFFF`):** Keep the frontend strictly aligned with the Enterprise Light Theme and WCAG 2.1 AA contrast tokens.

## 3. Forensic Audit Checklist: 10 Subsystems You Must Inspect Line by Line

### 3.1 Server Architecture & Control-Plane-to-Runtime Wiring (`gateway/` & `services/extmcp/`)

Inspect `services/extmcp/runtime/src/main.rs`, `services/extmcp/policy-api/src/lib.rs`, `gateway/local-admin-api/server.cjs`, `gateway/mcp-interceptor/interceptor.js`, and `gateway/agentgateway/agentgateway.yaml`.

| Check ID | Forensic Question to Answer with Code Evidence | What to Look For in the Code |
| :--- | :--- | :--- |
| **SRV-01** | Does `services/extmcp/runtime` actually compile and run a real `tonic` gRPC server implementing `ExtMcp.CheckRequest` on port `9001`? | Check `services/extmcp/runtime/src/main.rs` and `lib.rs`. Does `main.rs` bind a TCP listener and serve the generated protobuf service from `proto/ext_mcp.proto`? |
| **SRV-02** | When `PUT /v1/local/policies/bundle` or `POST /v1/local/policies/dry-run` is called by `apps/gateway-ui`, does it call the Rust `CedarPolicyEngine` / `SnapshotManager`, or does `gateway/local-admin-api/server.cjs` just update a JavaScript variable inside Node.js? | Check `gateway/local-admin-api/server.cjs`. If `server.cjs` does not communicate with the Rust `axiom-extmcp-runtime` process (or if the Rust runtime does not host the `/v1/local/*` HTTP/SSE routes directly via `axum`/`hyper`), flag this as a **P0 Split-Brain Control Plane**. |
| **SRV-03** | When `POST /v1/local/sessions/:id/revoke` is called in the UI, does it update the Rust `RevocationStore` (`ArcSwap`) inside `axiom-extmcp-runtime`? | Trace the exact network/IPC path from the HTTP revoke endpoint to `observability/kill-switch/src/store.rs`. If they are in separate processes with no shared IPC/gRPC/Redis/Unix socket link, revoking an agent in the UI will **not** stop the Rust `ExtMCP` server from permitting calls! |
| **SRV-04** | Does `gateway/agentgateway/agentgateway.yaml` configure an explicit `15ms` timeout on the `ExtMCP` gRPC callout? | Inspect `gateway/agentgateway/agentgateway.yaml` and `agentgateway-observe-only.yaml` for explicit callout timeout and `failClosed: true` directives. |
| **SRV-05** | Is the Local Admin API bound to `127.0.0.1` / Unix socket with mandatory authentication and RBAC on every route? | Check `server.cjs` (or the Rust admin server) for bind address, `AXIOM_ALLOWED_ORIGINS` CORS enforcement, rate limiting, and RBAC token verification. |

### 3.2 Real Database Persistence (`lineage-graph/`, `observability/audit/`, `apps/web/`)

Inspect `Cargo.toml`, `lineage-graph/Cargo.toml`, `lineage-graph/src/lib.rs`, `lineage-graph/migrations/0001_phase2_graph.sql`, and `apps/web/app/api/auth/store.ts`.

| Check ID | Forensic Question to Answer with Code Evidence | What to Look For in the Code |
| :--- | :--- | :--- |
| **DB-01** | Does `lineage-graph/Cargo.toml` even depend on `sqlx` or `tokio-postgres`, and does `lineage-graph/src/lib.rs` execute real SQL against PostgreSQL 16? | Open `lineage-graph/Cargo.toml` and `lineage-graph/src/lib.rs`. Check if `LineageGraphEngine` is just an in-memory Rust struct iterating over a `Vec` in RAM instead of executing `INSERT INTO nhi_nodes`, `INSERT INTO nhi_edges`, and `SELECT * FROM simulate_revocation` via `sqlx::PgPool`! |
| **DB-02** | Are the SQL migrations (`0001_phase2_graph.sql`, `0002_phase3_and_4_governance.sql`) automatically executed against a real PostgreSQL instance on startup and in CI? | Check if any Rust binary or startup script actually connects to `DATABASE_URL` and applies the `.sql` files to a real PostgreSQL database. |
| **DB-03** | Where does `apps/web` store registered users, tenants, sessions, and contact leads? | Inspect `apps/web/app/api/auth/store.ts`, `register/route.ts`, `login/route.ts`, and `contact/route.ts`. If `usersByEmail` and `sessionsById` are in-memory JavaScript `Map` objects, every user account and workspace is lost whenever Next.js restarts! |

### 3.3 OAuth 2.1, OIDC PKCE, JWKS & CIMD Network Resolution (`identity/` & `apps/web/`)

Inspect `identity/Cargo.toml`, `identity/src/oauth/jwt_validator.rs`, `identity/src/oauth/jwks_cache.rs`, `identity/src/cimd/mod.rs`, `identity/src/resource_indicators/validator.rs`, and `apps/web/app/api/auth/oidc/`.

| Check ID | Forensic Question to Answer with Code Evidence | What to Look For in the Code |
| :--- | :--- | :--- |
| **AUTH-01** | Does `identity/src/oauth/jwks_cache.rs` fetch live JWKS keys over HTTPS from configured OAuth/OIDC issuers with key-rotation (`kid` miss) refresh? | Check if `jwks_cache.rs` has a real HTTP client (`reqwest` / `hyper`) or only accepts static in-memory JSON fixtures. |
| **AUTH-02** | Does `identity/src/cimd/mod.rs` perform a real HTTPS `GET` request with DNS-pinned IP validation to fetch Client ID Metadata Documents, and does `jwt_validator.rs` call it? | Check `identity/src/cimd/mod.rs` and `identity/src/oauth/jwt_validator.rs`. Does `jwt_validator.rs` actually call `cimd_validator.resolve_or_fetch(&client_id).await` and verify the client's JWKS/issuer bindings, or does it just check URL syntax without fetching the document over HTTPS? |
| **AUTH-03** | Is there a complete OAuth 2.0 / OIDC callback route (`/api/auth/oidc/callback/route.ts`) in `apps/web` that exchanges the authorization `code` + `code_verifier` at the IdP token endpoint and verifies the ID token signature? | Check `apps/web/app/api/auth/oidc/`. Initiating a redirect to `/authorize` (`oidc/route.ts`) without a `/api/auth/oidc/callback/route.ts` token-exchange handler means OIDC login can never complete! |

### 3.4 Cloud & SaaS Discovery Connectors (`connectors/` & `attribution/`)

Inspect `connectors/Cargo.toml`, `connectors/src/lib.rs`, `connectors/src/saas_oauth.rs`, and `attribution/src/lib.rs`.

| Check ID | Forensic Question to Answer with Code Evidence | What to Look For in the Code |
| :--- | :--- | :--- |
| **CON-01** | Does `connectors/src/lib.rs` contain real API clients for **AWS IAM**, **Kubernetes**, **GitHub**, and **Slack**, or is it a stub? | Inspect `connectors/Cargo.toml` and `connectors/src/lib.rs`. Check if there are real HTTP/SDK calls to AWS IAM (`ListRoles`, `ListUsers`, `ListAccessKeys`), Kubernetes (`/apis/rbac.authorization.k8s.io/v1/clusterrolebindings`, `/api/v1/serviceaccounts`), GitHub (`/repos/{owner}/{repo}/actions/secrets`, `/orgs/{org}/installations`), and Slack (`auth.test`, `apps.permissions.info`), or if `connectors/src/lib.rs` has zero network dependencies! |
| **CON-02** | Does `attribution/src/lib.rs` actually fetch and parse `.github/CODEOWNERS`, Git commit blame, and cloud resource tags from real repos/APIs, and persist `OwnershipAttribution` scores into PostgreSQL `nhi_nodes`? | Inspect `attribution/src/lib.rs` and trace how `connectors` → `attribution` → `lineage-graph` are wired together in a runnable binary or background worker. |

### 3.5 OpenBao Secretless Broker, Workload Attestation & RFC 8693 Token Exchange (`secretless/`)

Inspect `secretless/Cargo.toml` and `secretless/src/lib.rs`.

| Check ID | Forensic Question to Answer with Code Evidence | What to Look For in the Code |
| :--- | :--- | :--- |
| **SEC-01** | Does `secretless/src/lib.rs` make real HTTP API requests to an **OpenBao** server (`http://127.0.0.1:8200/v1/...`) to lease dynamic credentials and revoke expired leases? | Check `secretless/Cargo.toml` and `secretless/src/lib.rs`. If `SecretlessLeaseMetadata::new_redacted` or `issue_attested_openbao_lease` only constructs a Rust struct in memory without calling OpenBao's HTTP REST API, flag it as **`[FAKE / IN-MEMORY STUB]`**. |
| **SEC-02** | Does `exchange_rfc8693_token` in `secretless/src/lib.rs` cryptographically verify the incoming `subject_token` JWT and sign a real, short-lived (`<= 300s`), scope-attenuated RS256/ES256/EdDSA JWT containing the RFC 8693 `act` (actor chain) claim? | Inspect `exchange_rfc8693_token` in `secretless/src/lib.rs`. Checking `requested_scopes.is_subset()` on strings without verifying and minting a real cryptographic JWT is a mock, not RFC 8693 token exchange! |
| **SEC-03** | Does `ZeroDowntimeRotationJob` actually provision a secondary credential in the upstream target/OpenBao, monitor live consumer heartbeats, and revoke the primary credential via API? | Inspect `ZeroDowntimeRotationJob` in `secretless/src/lib.rs` for real state machine persistence and upstream provider hooks. |

### 3.6 SpiceDB Delegation Graph & Fleet Control Plane (`fleet-control/`)

Inspect `fleet-control/Cargo.toml` and `fleet-control/src/lib.rs`.

| Check ID | Forensic Question to Answer with Code Evidence | What to Look For in the Code |
| :--- | :--- | :--- |
| **FLT-01** | Does `SpiceDbDelegationGraph` in `fleet-control/src/lib.rs` communicate with a real **SpiceDB** server over gRPC (`50051`), or is it an in-memory Rust `Vec`/`BTreeSet`? | Inspect `fleet-control/Cargo.toml` and `fleet-control/src/lib.rs`. If `SpiceDbDelegationGraph` is just an in-memory vector of `(parent, child)` tuples with no gRPC/HTTP client talking to `spicedb-delegation:50051`, flag it as **`[FAKE / IN-MEMORY STUB]`**. |
| **FLT-02** | Does `generate_signed_ai_bom` use real **Ed25519** cryptographic signing (`ed25519-dalek` or `ring`), or does it compute a SHA-256 hash of a string prefix (`"ed25519-..."`) and call it an Ed25519 signature? | Check `fleet-control/src/lib.rs` and `scripts/generate_sbom.py`! A SHA-256 digest is **not** an Ed25519 asymmetric digital signature! |

### 3.7 Argument Validators & Inline Security Controls (`validators/`)

Inspect `validators/src/sql.rs`, `validators/src/filesystem.rs`, `validators/src/egress.rs`, `validators/src/tool_pin.rs`, `validators/src/intent.rs`, and `validators/src/adapter.rs`.

| Check ID | Forensic Question to Answer with Code Evidence | What to Look For in the Code |
| :--- | :--- | :--- |
| **VAL-01** | Is `validators/src/intent.rs` wired into `validators/src/adapter.rs` and `services/extmcp/runtime/src/main.rs` so that every `CheckRequest` actually evaluates intent alignment? | Check `validators/src/adapter.rs` and `services/extmcp/runtime/src/main.rs`. If `intent.rs` was added as a standalone file in `validators/src/` but is never called by `adapter.rs` or `ExtMCP`, it is a **`[DISCONNECTED ISLAND]`**! |
| **VAL-02** | Are `EgressValidator::validate_and_pin` and `open_confined_readonly` wired into the runtime enforcement path? | Check where `validate_and_pin` and `open_confined_readonly` are called outside their own unit tests. |

### 3.8 Atomic Approvals, Alerting & SIEM/SOAR Streaming (`approvals/`, `alerts/`, `siem-soar/`)

Inspect `approvals/src/lib.rs`, `alerts/src/lib.rs`, and `siem-soar/src/lib.rs`.

| Check ID | Forensic Question to Answer with Code Evidence | What to Look For in the Code |
| :--- | :--- | :--- |
| **INT-01** | Does `approvals/src/lib.rs` verify Slack's `X-Slack-Signature` (`v0=HMAC-SHA256(signing_secret, "v0:" + timestamp + ":" + body)`) and send interactive Block Kit messages via Slack's API? | Inspect `approvals/src/lib.rs`. Check if there is any HTTP webhook handler or Slack signature verifier, or only an in-memory `HashMap` of `ApprovalTicket`s. |
| **INT-02** | Does `alerts/src/lib.rs` send real HTTP `POST` requests to Slack Incoming Webhooks and Jira REST API v3 (`/rest/api/3/issue`)? | Inspect `alerts/src/lib.rs` for real HTTP dispatch vs. in-memory deduplication only. |
| **INT-03** | Does `siem-soar/src/lib.rs` stream OCSF v1.3 and CEF events over HTTP/TLS to Splunk HEC, Datadog, or Microsoft Sentinel? | Inspect `siem-soar/src/lib.rs` for a real asynchronous HTTP batch shipper vs. a 40-line struct formatter. |

### 3.9 Observability, Hash-Chained Audit Writer & Kill Switch (`observability/`)

Inspect `observability/audit/src/writer.rs`, `observability/audit/src/event.rs`, `observability/kill-switch/src/service.rs`, and `observability/opentelemetry/src/lib.rs`.

| Check ID | Forensic Question to Answer with Code Evidence | What to Look For in the Code |
| :--- | :--- | :--- |
| **OBS-01** | Does `run_file_writer` in `observability/audit/src/writer.rs` actually use `append_hash_chained_record` in its main loop, or was `append_hash_chained_record` added at the bottom of `writer.rs` as a dead helper function that `run_file_writer` never calls?! | Inspect `observability/audit/src/writer.rs` lines 60–140! If `run_file_writer` still writes unchained `record.to_json_line()` while `append_hash_chained_record` is only called by its own unit test, flag this as a **`[DISCONNECTED ISLAND]`**! |
| **OBS-02** | Does `compute_chain_digest_hex` in `observability/audit/src/writer.rs` use real `sha2::Sha256`, or a custom FNV-1a bitwise loop labeled as SHA-256? | Inspect `compute_chain_digest_hex` in `observability/audit/src/writer.rs`! It **must** use real `sha2::Sha256` from the `sha2` crate, never a homemade hash loop! |
| **OBS-03** | Does `KillSwitchService::execute` in `observability/kill-switch/src/service.rs` actually invoke `InFlightCancellationRegistry::cancel_target` when a revocation command runs, or is `InFlightCancellationRegistry` sitting unused at the bottom of `service.rs`? | Inspect `observability/kill-switch/src/service.rs`! Verify that `KillSwitchService` holds `Arc<InFlightCancellationRegistry>` and calls `cancel_target` inside its live revocation method! |

### 3.10 Frontend Applications (`apps/gateway-ui/`, `apps/web/`, `apps/console/`)

Inspect `apps/gateway-ui/src/`, `apps/web/app/`, and `apps/console/src/`.

| Check ID | Forensic Question to Answer with Code Evidence | What to Look For in the Code |
| :--- | :--- | :--- |
| **UI-01** | Does `apps/console/src/App.tsx` fetch live data from the backend APIs (`/v1/lineage/graph`, `/v1/owasp/scorecard`, `/v1/secretless/leases`, `/v1/fleet/clusters`), or are all arrays hardcoded constants at the top of `App.tsx`? | Inspect `apps/console/src/App.tsx` for real `fetch()` hooks vs. static hardcoded mock arrays. |
| **UI-02** | Does `apps/web/app/playground/page.tsx` evaluate policies using the real backend/WASM evaluator, or hardcoded client-side conditional strings? | Inspect `apps/web/app/playground/page.tsx` and `apps/web/app/benchmarks/page.tsx`. |

## 4. Mandatory Engineering Remediations You Must Implement After Auditing

Do **not** stop at writing the audit report. Immediately after producing the audit table in your response, you must fix every `[FAKE / IN-MEMORY STUB]` and `[DISCONNECTED ISLAND]` in the codebase:

1. **Unify the Control Plane & Runtime (`services/extmcp/runtime` + `gateway/local-admin-api`)**:
   - Wire the `/v1/local/*` and `/v1/*` HTTP/SSE admin routes directly into the Rust runtime (or connect `server.cjs` to the Rust `axiom-extmcp-runtime` daemon via gRPC/HTTP/Unix-socket) so that policy dry-runs (`POST /v1/local/policies/dry-run`), bundle activations (`PUT /v1/local/policies/bundle`), and session revocations (`POST /v1/local/sessions/:id/revoke`) directly read and mutate the live Rust `PolicySnapshotStore` (`ArcSwap`) and `RevocationStore` (`ArcSwap`).
2. **Wire Real PostgreSQL (`sqlx` / `tokio-postgres`) into `lineage-graph`, `approvals`, and `apps/web`**:
   - Add `sqlx` (with `postgres`, `runtime-tokio`, `tls-rustls`) to `lineage-graph/Cargo.toml` and implement real async database methods (`upsert_discovered_node`, `upsert_discovered_edge`, `query_shared_credential_siblings`, `execute_simulate_revocation_cte`) against `0001_phase2_graph.sql` and `0002_phase3_and_4_governance.sql`.
   - Connect `apps/web/app/api/auth/*` and `/api/contact` to persistent database tables (with SQLite/Postgres auto-migration fallback for local dev) so users, tenants, sessions, OIDC PKCE states, and leads survive server restarts.
   - Add the missing `/api/auth/oidc/callback/route.ts` endpoint that performs the OAuth 2.0 `authorization_code` + `code_verifier` token exchange and verifies the ID token JWKS signature.
3. **Wire Real HTTP/gRPC Clients into `connectors`, `secretless`, `alerts`, `siem-soar`, and `fleet-control`**:
   - **`connectors/`**: Add `reqwest` (with `rustls-tls`) to `connectors/Cargo.toml` and implement real HTTP/REST discovery clients for AWS IAM (SigV4 `ListUsers`/`ListRoles`/`ListAccessKeys`), Kubernetes API (`/api/v1/namespaces/{ns}/serviceaccounts`, `/apis/rbac.authorization.k8s.io/v1/clusterrolebindings`), GitHub REST API (`/orgs/{org}/installations`, `/repos/{owner}/{repo}/contents/.github/CODEOWNERS`), and Slack Web API (`https://slack.com/api/apps.permissions.info`), while keeping trait-based mock injection strictly for offline unit tests.
   - **`secretless/`**: Implement a real `OpenBaoHttpClient` calling OpenBao's REST API (`POST /v1/auth/jwt/login`, `GET /v1/database/creds/{role}`, `PUT /v1/sys/leases/revoke`) and real cryptographic JWT signing (`jsonwebtoken` crate with RS256/ES256/EdDSA) for RFC 8693 `exchange_rfc8693_token`.
   - **`fleet-control/` & `scripts/generate_sbom.py`**: Implement a real SpiceDB gRPC/HTTP client (`v1.PermissionsService/CheckPermission`, `WriteRelationships`, `DeleteRelationships`) and use real **Ed25519** asymmetric keypair signing (`ed25519-dalek` in Rust and `cryptography` / OpenSSL Ed25519 in Python) for `generate_signed_ai_bom`.
   - **`approvals/`, `alerts/`, `siem-soar/`**: Implement real HMAC-SHA256 `X-Slack-Signature` verification in `approvals/`, real Slack Block Kit & Jira REST v3 HTTP dispatchers in `alerts/`, and a real async HTTP batch shipper for Splunk HEC / Datadog / Sentinel in `siem-soar/`.
4. **Eliminate All Disconnected Islands in `observability/` and `validators/`**:
   - In `observability/audit/src/writer.rs`: Replace the custom FNV-like loop in `compute_chain_digest_hex` with real `sha2::Sha256`, and wire `prev_hash -> entry_hash` chaining directly into the main `run_file_writer` loop so every event written by the background thread is cryptographically chained and `fsync`ed.
   - In `observability/kill-switch/src/service.rs`: Wire `InFlightCancellationRegistry` directly into `KillSwitchService` so executing a `Revoke` command automatically cancels all active `CancellationToken`s for that target.
   - In `validators/src/adapter.rs`: Wire `validators::intent::verify_intent_alignment` and `EgressValidator::validate_and_pin` into the live `ProductionValidatorAdapter` pipeline so `axiom-extmcp-runtime` enforces them on every `CheckRequest`.

## 5. Required Verification Proof Before You Claim Completion

You may **NOT** declare the task complete until you run and paste the full, unedited terminal output of all six verification gates below:

```bash
# 1. Execute ALL Rust workspace unit & integration tests (NEVER use --no-run)
cargo test --workspace --all-targets

# 2. Enforce strict Rust clippy lints across all targets
cargo clippy --workspace --all-targets -- -D warnings

# 3. Execute the 19 Node Gateway MCP Interceptor tests
node gateway/mcp-interceptor/interceptor.test.js

# 4. Execute the full Python security, chaos, and integration suite (with >= 85% coverage gate)
python3 tests/run_tests.py

# 5. Execute the live HTTP keep-alive scale & 60 FPS benchmark harness
python3 tests/performance/benchmark_scale_and_ui.py

# 6. Execute all Frontend & Architecture quality gates
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
python3 docs/architecture/scripts/check_design_tokens.py
python3 docs/architecture/scripts/check_frontend_colors.py
python3 docs/architecture/scripts/validate_api_contract_fixtures.py
python3 scripts/scan_secrets_and_sast.py
python3 scripts/generate_sbom.py
```
