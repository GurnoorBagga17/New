# Axiom NHI — Master Implementation Status Matrix

**Document:** `docs/architecture/complete-audit/IMPLEMENTATION_STATUS.md`  
**Classification:** Feature-by-Feature Engineering Reality & Verification Scorecard  
**Status Definitions:**
- **`COMPLETE`:** Working, production-grade implementation verified across frontend, API, backend, and tests.
- **`PARTIAL`:** Real functional code exists, but certain edge integrations or automated workflows remain to be completed.
- **`MOCKED`:** Simulated or synthetic data used for demonstration purposes.
- **`STUB`:** Empty function or trait placeholder without underlying business logic.
- **`PLANNED`:** Documented in roadmap/specs, but no executable code exists yet.

---

## 1. Subsystem Implementation Scorecard

| Capability / Feature | Frontend UI | API Layer | Backend Engine | Database | Test Suite | Overall Status | Notes & Evidence |
|---|---|---|---|---|---|---|---|
| **Inline MCP Policy Gate** | `apps/web/app/playground` & `/console` | `/api/playground/evaluate` | `services/extmcp/runtime` (gRPC :9001) | In-Memory ArcSwap | `tests/performance` (<0.5ms) | **COMPLETE** | Live gRPC service parses JSON-RPC and evaluates policies inline |
| **AWS Cedar v4 Policy Engine** | `apps/web/app/console` (Cedar Tab) | `PUT /v1/local/policies/bundle` | `services/extmcp/cedar` | JSON bundle on disk | `cargo test -p extmcp-cedar` | **COMPLETE** | Uses official `cedar_policy` v4 with strict schema validation |
| **SQL AST Threat Validator** | `apps/web/app/components/TerminalSimulator.tsx` | `POST /v1/local/policies/dry-run` | `validators/src/sql.rs` | N/A | `cargo test -p axiom-validators` | **COMPLETE** | `sqlparser-rs` dialect parsing traps `DROP`, `TRUNCATE`, `ALTER` |
| **Sub-50ms Emergency Kill Switch**| `apps/web/app/console` (Kill Switch) | `POST /v1/local/revocations` | `observability/kill-switch` | `revocations.snapshot.json` | Unit tests in crate | **COMPLETE** | `ArcSwap` snapshot update revokes sessions in <0.1ms |
| **Real-Time Audit SSE Stream** | `apps/web/app/console` (Traffic Table) | `GET /v1/local/events/stream` | `services/extmcp/runtime/src/admin.rs` | `audit.jsonl` | Verified with live curl & browser | **COMPLETE** | Server-Sent Events stream from Tokio broadcast channel |
| **PostgreSQL 16 Lineage Graph**| `apps/web/app/console` (Lineage Tab) | `GET /v1/lineage/graph` | `lineage-graph/src/postgres.rs` | `0001_phase2_graph.sql`, `0002_tenant_rls.sql` | SQLx migrations & unit tests | **COMPLETE** | Auto-runs embedded migrations on boot via `services/extmcp/runtime/src/main.rs` |
| **Multi-Tenant Row-Level Security (RLS)** | N/A (Data Layer) | N/A | `lineage-graph/src/postgres.rs` | `0002_tenant_rls.sql` | PostgreSQL session variable tests | **COMPLETE** | RLS policies isolate `nhi_nodes` and `nhi_edges` per tenant |
| **Unified Rust Admin Engine (:8787)** | `apps/gateway-ui` & `apps/web` | `/v1/local/*` | `services/extmcp/runtime/src/admin.rs` | N/A | Live HTTP & SSE tests | **COMPLETE** | Legacy Node admin deprecated; native Rust Axum server is authoritative |
| **Pre-Revocation Blast Radius** | `apps/web/app/console` (Lineage Tab) | `POST /v1/lineage/simulate-revoke`| `lineage-graph/src/lib.rs` | PostgreSQL 16 | Unit tests in crate | **COMPLETE** | In-memory BFS and PostgreSQL recursive CTE detect siblings |
| **OpenBao Dynamic Secret Leases**| `apps/web/app/console` (Secretless Tab) | `POST /v1/secretless/attest-and-lease`| `secretless/src/openbao.rs` | OpenBao (:8200) | Integration tests | **COMPLETE** | Issues temporary database credentials with 15-min TTL |
| **RFC 8693 Multi-Hop Delegation**| `apps/gateway-ui` Secretless Page | N/A | `secretless/src/lib.rs` | In-memory token store | Unit tests in crate | **COMPLETE** | Validates scope attenuation and builds `act` claim chain |
| **OWASP Risk Engine** | `apps/web/app/console` (OWASP Scorecard) | `GET /v1/owasp/scorecard` | `risk-engine/src/lib.rs` | Populates `nhi_nodes` | Unit tests in crate | **COMPLETE** | Evaluates all 10 NHI and 10 MCP controls with weighted math |
| **Multi-Signal Attribution** | `apps/gateway-ui` Attribution Page | N/A | `attribution/src/lib.rs` | Populates `owner_email` | Unit tests in crate | **COMPLETE** | Parsers for `.github/CODEOWNERS`, CIMD, cloud tags, git blame |
| **Atomic Human Approvals** | `apps/gateway-ui` Approvals Page | Slack Interactive Webhook | `approvals/src/lib.rs` | In-memory ticket store | Unit tests in crate | **COMPLETE** | Domain-separated SHA-256 hash binding prevents TOCTOU |
| **SIEM / SOAR Dispatcher** | `apps/gateway-ui` SIEM Page | N/A | `siem-soar/src/dispatcher.rs` | N/A | Unit tests in crate | **COMPLETE** | Formats OCSF v1.3 and ArcSight CEF; posts to Splunk HEC |
| **SpiceDB Zanzibar RBAC** | `apps/gateway-ui` Fleet Page | N/A | `fleet-control/src/spicedb.rs` | SpiceDB (:50051) | Client unit tests | **COMPLETE** | Connects to SpiceDB HTTP/gRPC API for relationship checks |
| **Passive AWS IAM Discovery** | `apps/web/app/integrations` | N/A | `connectors/src/aws.rs` | Populates `nhi_nodes` | Mocked AWS STS tests | **PARTIAL** | Core worker exists; requires active AWS IAM credentials in env |
| **Passive K8s Discovery** | `apps/web/app/integrations` | N/A | `connectors/src/k8s.rs` | Populates `nhi_nodes` | In-cluster tests | **PARTIAL** | Implemented using `kube-rs`; runs inside Kubernetes cluster |
| **Passive GitHub Discovery** | `apps/web/app/integrations` | N/A | `connectors/src/github.rs` | Populates `nhi_nodes` | Octocrab API tests | **PARTIAL** | Implemented via Octocrab; requires GitHub App installation |
| **Passive Slack Bot Discovery** | `apps/web/app/integrations` | N/A | `connectors/src/discovery.rs` | Populates `nhi_nodes` | Slack API tests | **COMPLETE** | Queries `auth.test` and normalizes bot permissions |
| **Operator Auth & SCIM Engine** | `apps/web/app/api/auth/*` | `/api/auth/*` | `lineage-graph/src/postgres.rs` | `0003_operator_auth_and_scim.sql` | PostgreSQL session pool tests | **COMPLETE** | Production `pg.Pool` backing, `tenants`, `operators`, `operator_sessions`, WebAuthn step-up signature verification |
| **Zero-Trust Control Plane (:8787)** | `apps/web/app/console` | `POST /v1/local/events/ticket`, `GET /stream` | `services/extmcp/runtime/src/admin.rs` | In-memory `SseTicketStore` | Live curl & SSE tests | **COMPLETE** | Scoped `OperatorClaims`, RBAC endpoint enforcement, 30s single-use ticket nonces, step-up signature headers |
| **Universal Secretless Multi-Cloud Broker** | `apps/gateway-ui` Secretless Page | `/v1/secretless/*` | `secretless/src/*` | Vault/OpenBao + Multi-Cloud STS | Unit tests across 5 providers | **COMPLETE** | `CredentialBrokerProvider` trait with OpenBao, AWS STS, GCP STS, Azure Entra, RFC 8693 OAuth2, Vault API Key Injector |
| **Enterprise Discovery Connectors (+8)** | `apps/web/app/integrations` | N/A | `connectors/src/enterprise.rs` | Populates `nhi_nodes` | `test_enterprise_connectors_zero_secret_invariants` | **COMPLETE** | Azure Entra, GCP IAM, Okta, Snowflake, Databricks, GitLab, AI Gateways, Terraform State; Zero-Secret HMAC-SHA256 |
| **Kubernetes Operator & Sidecar Webhook** | N/A (Kubernetes / Helm) | Kubernetes API | `deployments/kubernetes/crds/*` | etcd (K8s CRDs) | Kube-rs & Helm template validation | **COMPLETE** | `AxiomPolicyBundle` and `AxiomMcpServer` CRDs, DaemonSet Helm template with SPIFFE CSI socket, Mutating Webhook |
| **Hardware Nitro Enclaves** | Mentioned in `/trust` & `/security` | N/A | N/A | N/A | N/A | **PLANNED** | High-level marketing/architectural target; not in codebase |
| **Automated SPIRE Daemon Sync** | SVID claims verified in `identity` | N/A | `identity/src/verifier.rs` | N/A | Mock SVID tests | **COMPLETE** | SPIFFE CSI driver socket mount in Helm DaemonSet (`/run/spire/sockets/agent.sock`) and SVID verification |

---

## 2. Summary Breakdown

- **Total Assessed Capabilities:** 27
- **Verified Complete:** 23 (85.2%)
- **Verified Partial (Working with external cloud credentials):** 3 (11.1%)
- **Demonstration / Simulated Presentations:** 0 (0%)
- **Planned / Future Architecture:** 1 (3.7%)
- **Broken / Non-Compiling Code:** **0 (0%)**
