# Axiom NHI — Monorepo Architecture & Repository Map

**Document:** `docs/architecture/complete-audit/REPOSITORY_MAP.md`  
**Classification:** Forensic Monorepo Structure & Module Ownership Specification  
**Monorepo License:** Apache-2.0  
**Build Systems:** Cargo (Rust Workspace), pnpm 9 + Turbo (TypeScript Workspace)  

---

## 1. Monorepo Structural Overview

The Axiom NHI codebase is structured as a **polyglot monorepo** containing 18 Rust workspace crates, 3 TypeScript/React applications, 2 shared TypeScript packages, protobuf definitions, Docker/Helm deployment manifests, and Python security/performance test harnesses:

```
Axiom/
├── Cargo.toml                    # Master Rust workspace definition (18 member crates)
├── Cargo.lock                    # Immutable dependency lockfile for Rust
├── package.json                  # Master npm/pnpm monorepo script coordinator
├── pnpm-workspace.yaml           # pnpm workspace configuration (apps/*, packages/*)
├── turbo.json                    # Turborepo task pipeline (dev, build, lint, typecheck, test)
├── tsconfig.base.json            # Base TypeScript compiler options
├── .env.mcp.example              # Environment variables template for ExtMCP runtime
├── .gitignore                    # Comprehensive ignore rules (ignores target/, .next/, data/)
│
├── apps/                         # User-facing frontend web applications
│   ├── web/                      # Production Next.js 15 / React 19 web app (Cloud Control Plane)
│   ├── gateway-ui/               # Standalone Vite / React operator UI for local gateway
│   └── console/                  # React / Vite enterprise console
│
├── packages/                     # Shared TypeScript libraries
│   ├── ui/                       # Design system tokens and primitive UI components
│   └── cedar-editor/             # Monaco-based Cedar policy editing package
│
├── services/extmcp/              # Core ExtMCP Policy and Runtime Services
│   ├── runtime/                  # Main Rust runtime: gRPC :9001 + Axum HTTP/SSE :8787
│   ├── cedar/                    # Cedar v4.x formal authorization engine with ArcSwap
│   ├── policy-api/               # Snapshot management and candidate validation
│   └── authorization/            # Core authorization traits, pipeline, and decision types
│
├── identity/                     # OAuth 2.1, JWT/JWKS verifier, CIMD cache, RFC 8707 audience
├── validators/                   # sqlparser-rs AST, filesystem sandbox, SSRF egress, tool pin
├── connectors/                   # AWS IAM, K8s, GitHub, Slack read-only discovery workers
├── attribution/                  # Multi-signal ownership attribution (CODEOWNERS, CIMD, git blame)
├── lineage-graph/                # PostgreSQL 16 dependency graph, recursive CTE blast-radius
├── risk-engine/                  # OWASP NHI Top 10 & MCP Top 10 risk calculation engine
├── alerts/                       # Real-time alert threshold engine and notification router
├── secretless/                   # OpenBao dynamic credential broker & RFC 8693 token exchange
├── approvals/                    # Atomic single-use human approvals with SHA-256 payload binding
├── siem-soar/                    # Splunk HEC, Azure Sentinel, and OCSF v1.3 / CEF event dispatcher
├── fleet-control/                # Multi-cluster fleet synchronization & SpiceDB Zanzibar RBAC
├── observability/                # Observability subsystem
│   ├── audit/                    # Non-blocking off-path file writer with SHA-256 Merkle chaining
│   ├── kill-switch/              # Sub-50ms atomic revocation service and snapshot persistence
│   └── opentelemetry/            # OpenTelemetry trace and metrics exporter
│
├── gateway/                      # Envoy / AgentGateway interception configs
│   ├── agentgateway/             # Envoy-based MCP proxy configs (observe vs enforce)
│   ├── local-admin-api/          # Node.js local admin server (historical / dev mock)
│   └── mcp-interceptor/          # Stdio JSON-RPC interception hook
│
├── proto/                        # Protocol Buffer service definitions
│   ├── ext_mcp.proto             # Envoy ext_authz style MCP gRPC contract
│   └── context_sync.proto        # In-memory entity snapshot cache push contract
│
├── deployments/                  # Production and local deployment infrastructure
│   ├── docker/                   # Dockerfiles (ExtMCP, AgentGateway, Gateway-UI) and compose
│   ├── local/                    # Runtime JSON fixtures (identity, resources, revocations, validation)
│   ├── helm/                     # Kubernetes Helm chart for enterprise VPC deployment
│   └── observability/            # Prometheus alert rules, Grafana dashboard, OTel collector
│
├── scripts/                      # DevOps, security, and SBOM utility scripts
│   ├── generate_sbom.py          # CycloneDX 1.6 SBOM generator for Rust and npm deps
│   └── scan_secrets_and_sast.py  # Local SAST and secret leakage scanner
│
├── tests/                        # Comprehensive automated testing suites
│   ├── performance/              # k6 and Python benchmark harnesses (<5ms latency tests)
│   ├── failure-injection/        # Chaos resilience and fail-closed timeout injection
│   ├── security/                 # Red-team adversarial fuzzing tests
│   └── integration/              # Multi-service integration tests
│
└── docs/                         # Architecture documentation and specs
```

---

## 2. Comprehensive Directory & File Inventory

### 2.1 Applications (`apps/`)

#### `apps/web` (Next.js 15 App Router)
- **What it does:** Hosts the public web presence, the interactive `/playground`, the operator `/console`, the `/shadow-audit` analyzer, and 12 dedicated enterprise marketing/legal pages.
- **Why it exists:** Provides the primary cloud control plane and customer-facing interface.
- **Subsystem Owner:** Team 7A (Frontend Systems) & Cloud Control Plane.
- **Dependencies:** React 19, Tailwind CSS v4, Lucide React, `apps/web/app/api/*`.
- **Status:** **ACTIVE & IN USE.**

| Sub-path | Key Files | Purpose | Status |
|---|---|---|---|
| `app/page.tsx` | `HeroGate.tsx`, `TerminalSimulator.tsx` | Enterprise landing page with neomorphic hero and live terminal | Active |
| `app/console/` | `page.tsx` | Live SOC control plane wired to Rust ExtMCP via SSE & REST | Active |
| `app/playground/` | `page.tsx` | Interactive sandbox for testing Cedar rules and prompt attacks | Active |
| `app/shadow-audit/`| `page.tsx` | Free 30-minute shadow AI discovery and assessment intake | Active |
| `app/platform/` | `page.tsx` | Deep architectural breakdown of the 4-layer governance stack | Active |
| `app/solutions/` | `page.tsx` | Enterprise use cases (Autonomous Agents, GenAI Copilots) | Active |
| `app/integrations/`| `page.tsx` | Cloud catalog (AWS IAM, K8s, GitHub, Slack, OpenBao, Splunk) | Active |
| `app/pricing/` | `page.tsx` | Transparent tiered pricing (Community $0, Enterprise, Custom) | Active |
| `app/compare/` | `page.tsx`, `CompetitorComparison.tsx` | Direct comparison against Aembit, Astrix, Oasis, and Cyera | Active |
| `app/trust/` | `page.tsx` | Security architecture, fail-closed guarantees, zero-secret invariant | Active |
| `app/security/` | `page.tsx` | OWASP NHI Top 10 and MCP Top 10 technical controls breakdown | Active |
| `app/privacy/` | `page.tsx` | GDPR, CCPA, zero-plaintext storage privacy policy | Active |
| `app/terms/` | `page.tsx` | Enterprise terms of service and SLA guarantees | Active |
| `app/contact/` | `page.tsx` | Contact intake and enterprise evaluation request form | Active |
| `app/changelog/` | `page.tsx` | Chronological release logs and feature announcements | Active |
| `app/resources/` | `page.tsx` | Whitepapers, benchmark reports, and security runbooks | Active |
| `app/about/` | `page.tsx` | Company mission, founding story, leadership, and open-core ethos | Active |
| `app/docs/` | `page.tsx` | Developer quickstart, CLI guides, and deployment runbooks | Active |
| `app/sign-in/`, `app/sign-up/` | `page.tsx` | Customer authentication and session initialization | Active |
| `app/api/auth/` | `login`, `register`, `me`, `logout`, `oidc` | In-memory & OIDC session management | Active |
| `app/api/playground/` | `evaluate/route.ts` | Upstream proxy to Rust ExtMCP dry-run with local fallback | Active |
| `app/api/sbom/` | `download/route.ts` | Streams real CycloneDX 1.6 SBOM JSON to browser | Active |
| `app/api/shadow-audit/` | `analyze/route.ts` | Deterministic shadow AI risk and sprawl calculator | Active |
| `app/styles.css` | Design tokens | WCAG AAA compliant tokens, neomorphic card styles, zero hex colors | Active |

#### `apps/gateway-ui` (Vite + React)
- **What it does:** Standalone operator console designed to run locally alongside Docker deployments.
- **Why it exists:** Provides an air-gapped, zero-cloud administrative UI for internal VPCs.
- **Subsystem Owner:** Team 7 (Operator UI).
- **Dependencies:** React 18/19, Vite, Tailwind CSS, Motion.
- **Status:** **ACTIVE & OPERATIONAL.**

#### `apps/console` (Vite + React)
- **What it does:** Supplementary console dashboard.
- **Status:** Functional prototype (largely unified into `apps/web/app/console`).

---

### 2.2 Shared TypeScript Packages (`packages/`)

- `packages/ui`: Shared design tokens, buttons, inputs, dialogs, badges, and card primitives.
- `packages/cedar-editor`: Monaco-based editor with syntax highlighting and validation for AWS Cedar policies.

---

### 2.3 Core Rust Workspace Crates (18 Members)

#### 1. `services/extmcp/runtime`
- **Location:** `services/extmcp/runtime/`
- **Entry Points:** `src/main.rs`, `src/admin.rs`
- **Responsibilities:** Runs the gRPC server (:9001) for Envoy/agentgateway and the Axum HTTP/SSE server (:8787) for control plane administration.
- **Dependencies:** `extmcp_cedar`, `extmcp_authorization`, `axiom_identity`, `axiom_validators`, `axiom_kill_switch`, `axiom_audit`, `axiom_lineage_graph`, `axiom_secretless`, `axum`, `tonic`, `tokio`.
- **Status:** **ACTIVE (Core Execution Hub).**

#### 2. `services/extmcp/cedar`
- **Location:** `services/extmcp/cedar/`
- **Responsibilities:** Evaluates Cedar policies using `cedar_policy` v4. Stores snapshots in `ArcSwap` for lock-free hot reload.
- **Status:** **ACTIVE.**

#### 3. `services/extmcp/policy-api`
- **Location:** `services/extmcp/policy-api/`
- **Responsibilities:** Validates candidate policy bundles and manages schema migrations.
- **Status:** **ACTIVE.**

#### 4. `services/extmcp/authorization`
- **Location:** `services/extmcp/authorization/`
- **Responsibilities:** Defines core traits (`CheckPipeline`, `PolicyEngine`, `Decision`).
- **Status:** **ACTIVE.**

#### 5. `identity`
- **Location:** `identity/`
- **Responsibilities:** OAuth 2.1 JWT validation, JWKS caching with bounded clock skew (≤30s), RFC 8707 audience binding, and CIMD metadata resolution.
- **Status:** **ACTIVE.**

#### 6. `validators`
- **Location:** `validators/`
- **Responsibilities:**
  - `sql.rs`: Parses SQL AST with `sqlparser-rs` to block destructive DDL (`DROP`, `TRUNCATE`, `ALTER`) and stacked queries.
  - `filesystem.rs`: Canonicalizes paths to prevent `../` traversal and token mount leakage.
  - `egress.rs`: Enforces DNS-pinned hostname allowlists and blocks private IP / cloud metadata SSRF (`169.254.169.254`).
  - `tool_pin.rs`: Computes RFC 8785 canonical JSON SHA-256 hashes of tool schemas to prevent definition rug-pulls.
- **Status:** **ACTIVE.**

#### 7. `connectors`
- **Location:** `connectors/`
- **Responsibilities:** Read-only passive discovery across AWS IAM, Kubernetes, GitHub, and Slack. Enforces HMAC-SHA256 fingerprinting.
- **Status:** **ACTIVE.**

#### 8. `attribution`
- **Location:** `attribution/`
- **Responsibilities:** Automated multi-signal human ownership attribution using `.github/CODEOWNERS`, CIMD, cloud tags, and git blame.
- **Status:** **ACTIVE.**

#### 9. `lineage-graph`
- **Location:** `lineage-graph/`
- **Responsibilities:** Stores node/edge graphs in PostgreSQL 16; executes recursive CTEs to simulate revocation blast radiuses. Includes embedded migrations (`0001_phase2_graph.sql`, `0002_tenant_rls.sql`) with multi-tenant row-level security (RLS) policies.
- **Status:** **ACTIVE.**

#### 10. `risk-engine`
- **Location:** `risk-engine/`
- **Responsibilities:** Computes exposure, blast radius, and composite severity scores for OWASP NHI Top 10 and MCP Top 10.
- **Status:** **ACTIVE.**

#### 11. `alerts`
- **Location:** `alerts/`
- **Responsibilities:** Tracks risk threshold violations and dispatches alert notifications.
- **Status:** **ACTIVE.**

#### 12. `secretless`
- **Location:** `secretless/`
- **Responsibilities:** Manages OpenBao dynamic secret leases and executes IETF RFC 8693 multi-hop token exchanges with scope attenuation.
- **Status:** **ACTIVE.**

#### 13. `approvals`
- **Location:** `approvals/`
- **Responsibilities:** Manages atomic, single-use human-in-the-loop approvals bound to length-prefixed SHA-256 payload hashes.
- **Status:** **ACTIVE.**

#### 14. `siem-soar`
- **Location:** `siem-soar/`
- **Responsibilities:** Streams audit logs to Splunk HEC and Azure Sentinel using OCSF v1.3 and ArcSight CEF formats.
- **Status:** **ACTIVE.**

#### 15. `fleet-control`
- **Location:** `fleet-control/`
- **Responsibilities:** Multi-cluster synchronization, SpiceDB Zanzibar RBAC checks, and IAM rightsizing.
- **Status:** **ACTIVE.**

#### 16. `observability/audit`
- **Location:** `observability/audit/`
- **Responsibilities:** Non-blocking bounded queue event bus with off-path writer and SHA-256 Merkle hash chaining.
- **Status:** **ACTIVE.**

#### 17. `observability/kill-switch`
- **Location:** `observability/kill-switch/`
- **Responsibilities:** Atomic `ArcSwap` revocation store and snapshot persistence for sub-50ms session and agent revocation.
- **Status:** **ACTIVE.**

#### 18. `observability/opentelemetry`
- **Location:** `observability/opentelemetry/`
- **Responsibilities:** Emits OpenTelemetry trace spans with complete identity attribution.
- **Status:** **ACTIVE.**

---

### 2.4 Infrastructure & Deployments (`deployments/`)

- `deployments/docker/Dockerfile.extmcp`: Multi-stage Rust build producing a minimal scratch/distroless runtime binary.
- `deployments/docker/Dockerfile.agentgateway`: Envoy proxy compiled with MCP filter hooks.
- `deployments/docker/Dockerfile.gateway-ui`: Node/Vite build packaged in Nginx alpine.
- `deployments/docker/docker-compose.yml`: Local multi-container stack (ExtMCP, AgentGateway, OpenBao, Gateway-UI).
- `deployments/local/`: JSON configuration fixtures (`identity.json`, `resources.json`, `revocations.json`, `validation.json`).
- `deployments/helm/axiom-nhi/`: Production Kubernetes deployment with ExternalSecrets, StatefulSets, and air-gap support.

---

### 2.5 Protobuf Definitions (`proto/`)

- `proto/ext_mcp.proto`: Envoy ext_authz style MCP wire protocol defining `CheckRequest` and `CheckResponse`.
- `proto/context_sync.proto`: Pushes precomputed PostgreSQL lineage snapshots to in-memory runtime caches.

---

### 2.6 Active vs. Legacy / Unused Code Assessment

| Path | Primary Nature | Status | Recommendation |
|---|---|---|---|
| `gateway/local-admin-api/server.cjs` | Node.js mock admin server | **DEPRECATED / RETIRED** | Replaced by native Rust unified admin engine (`services/extmcp/runtime/src/admin.rs` on port `8787`). Deprecation header added; documented in `gateway/local-admin-api/README.md`. |
| `apps/console/` | Vite dashboard | **SECONDARY** | Superseded by `apps/web/app/console`, but functional. |
| `data/axiom-dev/` | Local SQLite/JSON runtime storage | **LOCAL DEV ONLY** | Gitignored; stores local revocation snapshots and audit logs. |
