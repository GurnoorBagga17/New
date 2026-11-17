# Axiom NHI Master Codebase Audit & Intelligence Manifest

**Audit Timestamp:** 2026-11-17T00:50:00+05:30  
**Lead Auditor:** Principal Software & Cloud Security Architect  
**Audit Scope:** Full Polyglot Monorepo (`apps/`, `services/`, `packages/`, Rust Workspace Crates, `gateway/`, `deployments/`, `proto/`, `docs/`, `scripts/`, `tests/`)  
**Audit Methodology:** Source-code level forensic inspection (Zero speculation, verified evidence, line references, AST & schema validation)

---

## Audit Progress Tracking (100% COMPLETE)

| Module / Document | Status | Inspected Files | Discovered Routes / Objects | Verified Flows |
|---|---|---|---|---|
| **0. Audit Manifest & Progress** (`PROGRESS.md`) | **COMPLETE** | All Workspace Roots | Monorepo Topology | Initialized & Updated |
| **1. Master Navigation & Overview** (`README.md`) | **COMPLETE** | Monorepo Structure | System Topology | Multi-layered Architecture |
| **2. Product Understanding & Journey** (`PRODUCT_OVERVIEW.md`) | **COMPLETE** | Copy Decks, Spec Sheets, Routes | 14 Core Pages, Persona Workflows | Onboarding to Enforce Mode |
| **3. Repository Map & Inventory** (`REPOSITORY_MAP.md`) | **COMPLETE** | 18 Crates, 3 Apps, 2 Pkgs, Infra | 150+ Source Files | Cross-crate dependencies |
| **4. Frontend Architecture** (`FRONTEND_ARCHITECTURE.md`) | **COMPLETE** | `apps/web`, `apps/gateway-ui`, `apps/console`, `packages/ui` | 28 Routes, 45+ Components | Next.js 15 + Vite + Tailwind |
| **5. Backend Architecture & Crates** (`BACKEND_ARCHITECTURE.md`) | **COMPLETE** | 18 Rust Crates, gRPC, Axum | gRPC 9001, Axum 8787 | ArcSwap, Cedar Engine, Tokenless Broker |
| **6. Complete API Reference** (`API_REFERENCE.md`) | **COMPLETE** | Next.js API Routes, Axum HTTP Handlers, gRPC | 35+ Endpoints | Full Schema & Validation Specs |
| **7. Database & Data Architecture** (`DATABASE_ARCHITECTURE.md`) | **COMPLETE** | SQL Migrations, Structs, JSON Fixtures | PostgreSQL 16 schema, SpiceDB | Multi-tenant isolation, RLS |
| **8. Integration Architecture** (`INTEGRATION_ARCHITECTURE.md`) | **COMPLETE** | `connectors`, `identity`, `secretless`, `siem-soar` | AWS, GitHub, K8s, OpenBao, Slack | Discovery, Normalization, JIT Leases |
| **9. Identity Discovery & Normalization** (`IDENTITY_DISCOVERY.md`) | **COMPLETE** | `connectors/src/discovery.rs`, `identity/src` | CIMD, Fingerprinting, Canonical IDs | Node/Edge ingestion pipelines |
| **10. Graph, Lineage & Risk Engine** (`GRAPH_AND_RISK_ENGINE.md`) | **COMPLETE** | `lineage-graph`, `attribution`, `risk-engine` | Dijkstra/BFS Attack Paths, CVSS/Risk Math | Blast radius & Kill-chain analysis |
| **11. Runtime Security Architecture** (`RUNTIME_SECURITY.md`) | **COMPLETE** | `services/extmcp/*`, `validators`, `identity` | AWS Cedar v4, SQL AST, Path Traversal | <5ms Fail-closed inline gateway |
| **12. Auth, Multi-Tenancy & RBAC** (`AUTH_AND_TENANCY.md`) | **COMPLETE** | `identity`, `apps/web/middleware.ts`, `fleet-control` | RS256/ES256, OAuth 2.1 RFC 8707 | Workspace isolation & SpiceDB |
| **13. Infrastructure & Deployment** (`INFRASTRUCTURE_AND_DEPLOYMENT.md`) | **COMPLETE** | Helm charts, Dockerfiles, Compose | Docker, K8s, Air-gap, Envoy/AgentGateway | Production Topology & Runbooks |
| **14. Testing & Quality Verification** (`TESTING_AND_QUALITY.md`) | **COMPLETE** | Rust `cargo test`, Pytest, Playwright | Unit, Integration, Red-Team Fuzzing | Performance benchmarks (p50/p99) |
| **15. Security Forensic Audit** (`SECURITY_AUDIT.md`) | **COMPLETE** | SAST scans, Semgrep, Source Code | Cryptographic Hashes, Zero Raw Tokens | CVE & Threat Matrix |
| **16. Execution Flows & Sequences** (`EXECUTION_FLOWS.md`) | **COMPLETE** | End-to-end Call Chains | 12 Visual Mermaid Sequence Flows | Browser -> Control Plane -> Engine |
| **17. Implementation Status Matrix** (`IMPLEMENTATION_STATUS.md`) | **COMPLETE** | Every Subsystem & Component | Verified Reality vs Mock vs Planned | Truth-in-advertising scorecard |
| **18. Technical Debt & Issue Register** (`TECHNICAL_DEBT.md`) | **COMPLETE** | Monorepo-wide Codebase | 20+ Prioritized Defect & Gap Records | Production blockers & mitigations |
| **19. Product User Manual** (`USER_MANUAL.md`) | **COMPLETE** | Operators, Security Engineers | Step-by-step UI and CLI workflows | Objective -> Pre-reqs -> Execution |
| **20. Developer Onboarding** (`DEVELOPER_ONBOARDING.md`) | **COMPLETE** | Local setup, Dev loop, Debugging | Windows & Linux step-by-step guide | Zero to First Pull Request |
| **21. Architecture & Domain Glossary** (`GLOSSARY.md`) | **COMPLETE** | NHI, IAM, Cryptography, ExtMCP | 65+ Industry & Platform Definitions | Authoritative Terminology Standard |

---

## Monorepo High-Level Statistics

- **Rust Workspace Crates:** 18
- **TypeScript Applications:** 3 (`apps/web`, `apps/gateway-ui`, `apps/console`)
- **Shared TypeScript Packages:** 2 (`packages/ui`, `packages/cedar-editor`)
- **Protobuf Definitions:** 2 (`proto/ext_mcp.proto`, `proto/context_sync.proto`)
- **Dockerfiles / Compose Configs:** 4 (`deployments/docker/*`)
- **Helm Charts:** 1 (`deployments/helm/axiom-nhi`)
- **Database Migrations:** SQLx migrations in `lineage-graph/migrations/` (`0001_phase2_graph.sql`, `0002_tenant_rls.sql`, `0003_operator_auth_and_scim.sql`)
- **Total Documentation Files Produced:** 23 (Full Technical Knowledge Base + Enterprise Readiness Specification)

---

## Post-Audit Remediation & Hardening Updates (Phases 0 & 1 Applied)

Following the initial audit completion, the engineering team executed critical architectural hardening tasks from the Production Implementation Plan (`AXIOM_NHI_PRODUCTION_IMPLEMENTATION_PLAN.md`):

1. **Task 0.1 — Legacy Node Admin Deprecation:**
   - Deprecated `gateway/local-admin-api/server.cjs` with prominent runtime and file headers.
   - Authored `gateway/local-admin-api/README.md` directing all operators and developers to the native Rust unified admin engine (`services/extmcp/runtime/src/admin.rs` on port `8787`).
   - Updated `deployments/docker/README.md` to document the unified Rust runtime admin transport.

2. **Task 0.2 — Automatic Database Migrations on Boot:**
   - Modified `services/extmcp/runtime/src/main.rs` to automatically inspect `DATABASE_URL` upon engine boot, establish a connection pool via `axiom_lineage_graph::PostgresLineageGraph::connect`, and run all embedded migrations via `graph.run_migrations().await`.

3. **Task 0.3 — Gateway UI Proxy Alignment:**
   - Verified that `apps/gateway-ui/vite.config.ts` proxies `/v1` directly to `http://127.0.0.1:8787` with `AXIOM_ADMIN_TOKEN` authentication injection.

4. **Task 1.2 — Multi-Tenant Row-Level Security (RLS) Migration:**
   - Created `lineage-graph/migrations/0002_tenant_rls.sql` providing:
     - `tenant_id VARCHAR(64) NOT NULL DEFAULT 'default'` on `nhi_nodes` and `nhi_edges`.
     - Compound tenant indexes (`idx_nhi_nodes_tenant`, `idx_nhi_edges_tenant`).
     - PostgreSQL Row-Level Security (`ENABLE ROW LEVEL SECURITY`) with `tenant_isolation_nodes` and `tenant_isolation_edges` policies using `current_setting('app.current_tenant', true)`.

5. **Frontend Visibility & WCAG AAA Contrast Overhaul:**
   - Overhauled `apps/web/app/components/TerminalSimulator.tsx` to fix washed-out, illegible text:
     - Upgraded danger tags (`[VALIDATOR]`, `[CEDAR]`, `[INTERCEPT]`) and blocked arguments to high-contrast crimson (`#991b1b` on `#fee2e2`, text `#7f1d1d`, font-weight 600) with a 10:1 contrast ratio.
     - Enhanced JSON trace syntax highlighting with rich indigo keys (`#3730a3`), slate punctuation (`#475569`), and bold decision badges.
     - Replaced fragmented tabs with a clean segmented pill container and upgraded the Emergency Kill Switch trigger into a distinct danger action button.
   - Configured Tailwind CSS v4 `@source` paths in `packages/ui/src/theme.css` and added `@import "tailwindcss";` with `@source` in `apps/web/app/styles.css`.
   - Updated all simulator fallback classes in `apps/web/app/styles.css`.

---

## Enterprise Readiness & Competitive Gap Closure (Phases 1-5 100% Implemented)

Following the gap analysis in `enterprise_gap_closure_roadmap.md`, all 5 production enterprise gap closure phases were implemented, cross-compiled, and verified:

1. **Phase 1 (P0): Operator Auth & Multi-Tenancy Engine:**
   - Database Migration `lineage-graph/migrations/0003_operator_auth_and_scim.sql` deployed with `tenants`, `operators`, `operator_sessions`, compound tenant indices, and RLS policies.
   - Embedded into `PostgresLineageGraph` in `lineage-graph/src/postgres.rs` with `create_operator`, `get_operator_by_email`, `create_session`, `get_session`, and `revoke_session`.
   - Upgraded Next.js session store `apps/web/app/api/auth/store.ts` with production `pg.Pool` connection pooling and safe in-memory offline fallback for local tests.
   - Added WebAuthn step-up cryptographic signature verification (`verifyStepUpSignature`).
   - Enforced fail-closed production startup validation in `services/extmcp/runtime/src/main.rs` rejecting boot if dev bypass flags are set when `AXIOM_ENV=production`.

2. **Phase 2 (P0): Zero-Trust Control Plane (`:8787`):**
   - Added scoped operator JWT claims decoding (`OperatorClaims`) and RBAC endpoint gating in `services/extmcp/runtime/src/admin.rs`.
   - Added single-use 30-second ticket tokens via `POST /v1/local/events/ticket` consumed by `GET /v1/local/events/stream?ticket=<nonce>` to protect SSE streams from URL token exposure and browser credential leaks.
   - Enforced `security-admin` role for policy bundle mutations and secretless rotations, and `soc-operator` or `security-admin` for emergency revocations.
   - Enforced mandatory `X-Axiom-StepUp-Signature` on destructive endpoints in production.

3. **Phase 3 (P1): Universal Secretless Credential Broker:**
   - Extracted abstract `CredentialBrokerProvider` trait in `secretless/src/lib.rs`.
   - Implemented 5 enterprise credential broker providers:
     - OpenBao Dynamic Leases (`secretless/src/openbao.rs`).
     - AWS STS Web Identity (`secretless/src/aws_sts.rs` via `AssumeRoleWithWebIdentity`).
     - GCP STS Workload Identity Federation (`secretless/src/gcp_sts.rs`).
     - Azure Entra Workload Identity (`secretless/src/azure_entra.rs`).
     - RFC 8693 OAuth 2.0 SaaS Broker (`secretless/src/oauth2_client_credentials.rs`).
     - Vault API Key Injector (`secretless/src/api_key_vault_injector.rs`).

4. **Phase 4 (P1): Enterprise Connector Expansion:**
   - Expanded `axiom-connectors` in `connectors/src/enterprise.rs` with 8 production discovery connectors:
     - Azure Entra ID Service Principals & App Registrations.
     - Google Cloud Platform IAM Service Accounts & Keys.
     - Okta OAuth 2.0 Service Applications.
     - Snowflake User Key-Pair & Service Workloads.
     - Databricks Machine Workload Service Principals.
     - GitLab CI/CD Pipeline Triggers & Deploy Tokens.
     - AI Gateways & Proxy Agents (LangChain, Portkey, LiteLLM).
     - Terraform Cloud State Machine Outputs & Providers.
   - Strictly enforced the Zero-Secret invariant across all connectors via deterministic HMAC-SHA256 fingerprinting.

5. **Phase 5 (P2): Production Kubernetes Operator & Fleet Deployment:**
   - Created Kubernetes Custom Resource Definitions:
     - `deployments/kubernetes/crds/axiom_policy_bundle_crd.yaml` (`AxiomPolicyBundle`).
     - `deployments/kubernetes/crds/axiom_mcp_server_crd.yaml` (`AxiomMcpServer`).
   - Created production DaemonSet Helm template `deployments/helm/axiom-nhi/templates/daemonset-runtime.yaml` with SPIFFE CSI driver socket mounts (`/run/spire/sockets/agent.sock`) and health probes.
   - Created Mutating Admission Webhook configuration `deployments/helm/axiom-nhi/templates/mutating-webhook.yaml` for zero-touch agent sidecar injection.
