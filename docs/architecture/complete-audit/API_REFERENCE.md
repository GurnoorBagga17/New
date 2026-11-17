# Axiom NHI — Complete API Reference & Endpoint Catalog

**Document:** `docs/architecture/complete-audit/API_REFERENCE.md`  
**Classification:** Complete API Contract & Wire Protocol Specification  
**Services Covered:** Next.js API Routes (`apps/web`), Rust Axum Admin API (`services/extmcp/runtime`), gRPC Wire Protocols (`proto/`)  

---

## 1. Master API Inventory Table

| Method | Endpoint | Service Layer | Source Location & Handler | Auth Required | Purpose | Status |
|---|---|---|---|---|---|---|
| `GET` | `/healthz` | Rust Axum (:8787) | `services/extmcp/runtime/src/admin.rs:165` | None | Engine liveness and health probe | **COMPLETE** |
| `GET` | `/v1/local/policies/version` | Rust Axum (:8787) | `src/admin.rs:223` `policy_version` | Bearer Token | Returns active Cedar policy SHA-256 version | **COMPLETE** |
| `POST` | `/v1/local/policies/dry-run` | Rust Axum (:8787) | `src/admin.rs:232` `policy_dry_run` | Bearer Token | Evaluates tool call against Cedar AST & SQL validator | **COMPLETE** |
| `PUT` | `/v1/local/policies/bundle` | Rust Axum (:8787) | `src/admin.rs:374` `activate_bundle` | `security-admin` + Step-Up | Atomic lock-free hot-swap of active Cedar bundle | **COMPLETE** |
| `GET` | `/v1/local/revocations` | Rust Axum (:8787) | `src/admin.rs:479` `list_revocations` | Bearer Token | Lists all active revocation records | **COMPLETE** |
| `POST` | `/v1/local/revocations` | Rust Axum (:8787) | `src/admin.rs:488` `update_revocation` | `soc-operator` / `security-admin` + Step-Up | Inserts sub-50ms revocation (agent, tool, server, session) | **COMPLETE** |
| `POST` | `/v1/local/sessions/:id/revoke` | Rust Axum (:8787) | `src/admin.rs:528` `revoke_session_direct`| `soc-operator` / `security-admin` + Step-Up | Directly revokes specific MCP session | **COMPLETE** |
| `POST` | `/v1/local/events/ticket` | Rust Axum (:8787) | `src/admin.rs:605` `generate_stream_ticket`| Operator Bearer Token | Issues single-use 30s ticket nonce for SSE streaming | **COMPLETE** |
| `GET` | `/v1/local/events/stream` | Rust Axum (:8787) | `src/admin.rs:547` `event_stream` | Single-use Ticket / Bearer | SSE stream of real-time audit decisions (tenant-scoped) | **COMPLETE** |
| `GET` | `/v1/lineage/graph` | Rust Axum (:8787) | `src/admin.rs:568` `get_lineage_graph` | Bearer Token | Returns full node/edge dependency topology | **COMPLETE** |
| `POST` | `/v1/lineage/simulate-revoke` | Rust Axum (:8787) | `src/admin.rs:582` `simulate_revocation` | Bearer Token | BFS simulation of revocation blast-radius and siblings | **COMPLETE** |
| `GET` | `/v1/owasp/scorecard` | Rust Axum (:8787) | `src/admin.rs:608` `get_owasp_scorecard` | Bearer Token | OWASP NHI Top 10 & MCP Top 10 compliance state | **COMPLETE** |
| `GET` | `/v1/secretless/leases` | Rust Axum (:8787) | `src/admin.rs:649` `list_secretless_leases` | Bearer Token | Lists active dynamic OpenBao leases (redacted) | **COMPLETE** |
| `POST` | `/v1/secretless/attest-and-lease`| Rust Axum (:8787) | `src/admin.rs:664` `attest_and_lease` | Bearer Token | Attests workload and issues dynamic secret lease | **COMPLETE** |
| `POST` | `/v1/secretless/rotate` | Rust Axum (:8787) | `src/admin.rs:687` `trigger_secretless_rotation`| `security-admin` + Step-Up | Triggers zero-downtime rotation of static secrets | **COMPLETE** |
| `POST` | `/api/playground/evaluate` | Next.js API Route | `apps/web/app/api/playground/evaluate/route.ts` | None | Web proxy to Rust dry-run with local fallback | **COMPLETE** |
| `GET` | `/api/sbom/download` | Next.js API Route | `apps/web/app/api/sbom/download/route.ts` | None | Streams verified CycloneDX 1.6 SBOM JSON | **COMPLETE** |
| `POST` | `/api/shadow-audit/analyze` | Next.js API Route | `apps/web/app/api/shadow-audit/analyze/route.ts` | None | Computes shadow AI risk sprawl and exposure score | **COMPLETE** |
| `POST` | `/api/auth/register` | Next.js API Route | `apps/web/app/api/auth/register/route.ts` | None | Creates tenant workspace and operator account | **COMPLETE** |
| `POST` | `/api/auth/login` | Next.js API Route | `apps/web/app/api/auth/login/route.ts` | None | Validates operator credentials & sets session cookie | **COMPLETE** |
| `POST` | `/api/auth/logout` | Next.js API Route | `apps/web/app/api/auth/logout/route.ts` | Session Cookie | Clears operator session cookie | **COMPLETE** |
| `GET` | `/api/auth/me` | Next.js API Route | `apps/web/app/api/auth/me/route.ts` | Session Cookie | Returns current operator profile and tenant ID | **COMPLETE** |
| `POST` | `/api/contact` | Next.js API Route | `apps/web/app/api/contact/route.ts` | None | Processes enterprise contact and demo requests | **COMPLETE** |
| `gRPC` | `ExtMcp/CheckRequest` | Tonic gRPC (:9001) | `services/extmcp/runtime/src/lib.rs` | OAuth 2.1 Bearer | Evaluates tool call request against Cedar and AST | **COMPLETE** |
| `gRPC` | `ExtMcp/CheckResponse`| Tonic gRPC (:9001) | `services/extmcp/runtime/src/lib.rs` | Internal | Mutates or filters upstream MCP tool responses | **COMPLETE** |

---

## 2. Detailed Endpoint Specifications

### 2.1 Policy Dry-Run Evaluation
- **Endpoint:** `POST /v1/local/policies/dry-run`
- **Location:** `services/extmcp/runtime/src/admin.rs:232` (`policy_dry_run`)
- **Authentication:** Bearer token required in `Authorization` header. Bypassed in dev mode when `AXIOM_ALLOW_ANONYMOUS_LOCAL=1`.
- **Purpose:** Executes formal Cedar v4 policy evaluation combined with `sqlparser` AST parsing against candidate tool calls before activating them in production.
- **Request Body Schema:**
  ```json
  {
    "policy_text": "permit (principal in Axiom::AgentRole::\"analyst\", action == Axiom::Action::\"execute_query\", resource == Axiom::Resource::\"customer_db\") when { context.ast_verb in [\"SELECT\"] };",
    "sample_requests": [
      {
        "principal_uid": "agent::reporting-worker-4",
        "tool_name": "db.execute_query",
        "raw_arguments": {
          "query": "SELECT id, name FROM customer_records LIMIT 50"
        }
      }
    ]
  }
  ```
- **Execution Flow:**
  1. Axum middleware validates admin bearer token using constant-time comparison (`constant_time_eq`).
  2. Cedar parser verifies policy syntax and validates against schema (`AXIOM_SCHEMA_SRC`).
  3. If tool arguments contain SQL, `axiom_validators::sql::analyze` parses the query AST.
  4. Detects destructive verbs (`DROP`, `TRUNCATE`, `ALTER`) or stacked queries.
  5. Computes SHA-256 Merkle hash over canonical payload.
  6. Returns evaluation verdict and diagnostics.
- **Success Response (200 OK):**
  ```json
  {
    "valid": true,
    "candidate_version": "sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
    "verdict": "PERMIT",
    "ast_threat": "NONE",
    "latency_us": 240,
    "evaluated_samples": 1,
    "diagnostics": [
      {
        "sample_index": 0,
        "decision": "PERMIT",
        "reason": "permitted by 1 policy"
      }
    ]
  }
  ```
- **Error Response (400 Bad Request):**
  ```json
  {
    "code": "POLICY_PARSE_FAILED",
    "message": "policy parse error: unexpected token at line 3 column 12"
  }
  ```

---

### 2.2 Live Policy Bundle Activation (Atomic Hot-Swap)
- **Endpoint:** `PUT /v1/local/policies/bundle`
- **Location:** `services/extmcp/runtime/src/admin.rs:374` (`activate_bundle`)
- **Authentication:** Bearer token required.
- **Purpose:** Atomically installs a new Cedar policy bundle in the running process using lock-free `ArcSwap`, updating both the gRPC runtime (:9001) and HTTP admin service (:8787) simultaneously.
- **Request Body Schema:**
  ```json
  {
    "policies": [
      {
        "source": "permit (principal, action, resource);"
      }
    ],
    "schema": ""
  }
  ```
- **Execution Flow:**
  1. Validates candidate bundle against Cedar schema in strict mode.
  2. Computes deterministic SHA-256 version over sorted policies.
  3. Writes candidate bundle to temporary file on disk; atomic rename ensures persistence resilience across host restarts.
  4. Calls `state.policies.swap(candidate)`, atomically updating the active pointer in the live runtime.
  5. Broadcasts `policy_bundle_activated` event to all active SSE subscribers.
- **Success Response (200 OK):**
  ```json
  {
    "activated": true,
    "version": "sha256:a1b2c3d4...",
    "loaded_at_unix": 1731801600,
    "policy_count": 4,
    "active": {
      "version": "sha256:a1b2c3d4...",
      "loaded_at_unix": 1731801600,
      "policy_count": 4
    }
  }
  ```

---

### 2.3 Emergency Kill-Switch Revocation
- **Endpoint:** `POST /v1/local/revocations`
- **Location:** `services/extmcp/runtime/src/admin.rs:488` (`update_revocation`)
- **Authentication:** Bearer token required.
- **Purpose:** Triggers immediate, sub-50ms revocation of an agent, tool, target server, or session across the inline data plane.
- **Request Body Schema:**
  ```json
  {
    "action": "revoke",
    "target_kind": "agent",
    "target_id": "agent::reporting-worker-4",
    "reason": "Suspected prompt injection during payroll tool execution"
  }
  ```
- **Execution Flow:**
  1. Validates `target_kind` (`global`, `agent`, `tool`, `server`, `session`).
  2. Constructs canonical `RevocationTarget`.
  3. `KillSwitchService` inserts revocation entry into `RevocationStore`.
  4. Flushes snapshot to `data/axiom/revocations.snapshot.json`.
  5. Broadcasts `emergency_kill_switch_triggered` SSE frame.
- **Success Response (200 OK):**
  ```json
  {
    "revoked": true,
    "target": "agent::reporting-worker-4",
    "target_kind": "agent",
    "state_version": 2,
    "reason": "Suspected prompt injection during payroll tool execution"
  }
  ```

---

### 2.4 Stream Authentication Ticket Issuance
- **Endpoint:** `POST /v1/local/events/ticket`
- **Location:** `services/extmcp/runtime/src/admin.rs:605` (`generate_stream_ticket`)
- **Authentication:** Operator Bearer Token (or `AXIOM_ADMIN_TOKEN`).
- **Purpose:** Generates a high-entropy, 30-second single-use ticket nonce that allows the frontend browser console to open a Server-Sent Events (SSE) telemetry connection without exposing long-lived bearer tokens or passwords in browser URLs.
- **Success Response (200 OK):**
  ```json
  {
    "ticket": "9f8a3c...d4e1",
    "expires_in_secs": 30
  }
  ```

---

### 2.5 Real-Time Audit Event Stream (Server-Sent Events)
- **Endpoint:** `GET /v1/local/events/stream`
- **Location:** `services/extmcp/runtime/src/admin.rs:547` (`event_stream`)
- **Authentication:** Single-use ticket nonce query parameter (`?ticket=<nonce>`) or Bearer JWT / admin token header.
- **Purpose:** Streams live audit records and security decision telemetry directly to connected operator consoles.
- **Tenant Scoping:** Events are strictly filtered by the operator's `tenant_id`, guaranteeing complete cross-tenant telemetry isolation.
- **Consumption Model:** Consuming a ticket nonce immediately burns it from memory, preventing replay attacks.
- **Response Headers:** `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`.
- **Event Payload Schema (JSON frame):**
  ```json
  {
    "id": "tx-901",
    "timestamp": "14:26:01.233",
    "principal": "agent::reporting-worker-4",
    "tool": "db.execute_query",
    "decision": "DENY",
    "latencyMs": 1.4,
    "prevHash": "0x3a1b...88f1",
    "entryHash": "0x8f2d...9a12",
    "secretRef": "vault://openbao/database/creds/analyst",
    "blockedReason": "AST scan matched DEST_DDL (DROP TABLE). Policy deny_drop_table enforced."
  }
  ```

---

### 2.6 Pre-Revocation Blast-Radius Simulation
- **Endpoint:** `POST /v1/lineage/simulate-revoke`
- **Location:** `services/extmcp/runtime/src/admin.rs:582` (`simulate_revocation`)
- **Authentication:** Bearer token required (`soc-operator` or `security-admin`).
- **Purpose:** Models dependency impact before an operator triggers a revocation, calculating directly affected agents, transitive workloads, and shared-credential siblings (`NHI9:2025`).
- **Request Body Schema:**
  ```json
  {
    "target_uid": "secret::pg_analyst_rw"
  }
  ```
- **Success Response (200 OK):**
  ```json
  {
    "target_uid": "secret::pg_analyst_rw",
    "safe_to_revoke_immediately": false,
    "directly_affected_agents": [
      "agent::reporting-worker-4",
      "agent::payroll-bot-1"
    ],
    "transitively_affected_workloads": [],
    "shared_credential_siblings": [
      "agent::reporting-worker-4",
      "agent::payroll-bot-1"
    ],
    "blast_radius_score": 75,
    "recommended_action": "REJECT_REVOCATION_SHARED_CREDENTIAL"
  }
  ```

---

### 2.6 Next.js Evaluation Proxy Route
- **Endpoint:** `POST /api/playground/evaluate`
- **Location:** `apps/web/app/api/playground/evaluate/route.ts`
- **Authentication:** None.
- **Purpose:** Forwards playground and console dry-run requests to the upstream Rust runtime on `:8787`, with an automatic fallback to an in-process deterministic zero-trust engine if the Rust runtime is offline.
- **Request Body Schema:**
  ```json
  {
    "principal": "agent::finance-analyst",
    "tool": "db.execute_query",
    "args": "{\"query\": \"DROP TABLE customer_records\"}",
    "mode": "enforce",
    "cedarRule": "permit(...) when { context.ast_verb in [\"SELECT\"] };"
  }
  ```
- **Success Response (200 OK):**
  ```json
  {
    "verdict": "DENY",
    "effectiveVerdict": "DENY",
    "latencyMs": 0.31,
    "astThreat": "DESTRUCTIVE_DDL (DROP/TRUNCATE or stacked statement detected in AST)",
    "merkleHash": "0x8f2d4e12...",
    "summary": "AST parser detected destructive SQL statements embedded in autonomous tool arguments. Rejected before SQL connection dispatch.",
    "upstreamSource": "live-extmcp-engine"
  }
  ```
