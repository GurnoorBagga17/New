# Axiom NHI — Enterprise Readiness & Competitive Gap Closure Specification

**Document:** `docs/architecture/complete-audit/ENTERPRISE_READINESS_GAP_CLOSURE.md`  
**Classification:** Engineering Execution Plan & Architectural Hardening Roadmap  
**Target Competitors:** Token Security, Aembit, Astrix Security, Oasis Security  
**Objective:** Transition Axiom NHI from local/single-node evaluation readiness to Fortune 500 multi-cluster production readiness.

---

## Executive Summary & Priority Matrix

While Axiom NHI's **Inline Rust ExtMCP Data Plane (`<2ms` AST + Cedar v4 interception)** and **PostgreSQL 16 Recursive Blast-Radius Engine** outperform legacy agentless scanners, winning enterprise Proof-of-Concept (POC) evaluations requires closing five structural control-plane and ecosystem gaps.

| Priority | Gap Area | Current Implementation | Target Enterprise State | Primary Competitor Neutralized |
|---|---|---|---|---|
| **P0** | **Operator Auth & Tenancy** | `apps/web/app/api/auth/store.ts` (In-memory store) + Dev bypass | PostgreSQL-backed sessions, strict OIDC/SAML SSO, SCIM 2.0, WebAuthn MFA for Kill Switch | All (Table Stakes for CISO Sign-off) |
| **P0** | **Control Plane <-> Data Plane Security** | Loopback `:8787`, static `AXIOM_ADMIN_TOKEN`, unauthenticated SSE | SPIFFE/SPIRE mTLS, scoped operator JWTs, SpiceDB RBAC enforcement on `:8787` | Aembit / Astrix |
| **P1** | **Universal Secretless Brokering** | OpenBao dynamic leases (`secretless/src/openbao.rs`) | Native AWS STS, GCP Workload Identity, Azure Managed Identity & 3rd-party REST API injection | **Aembit** |
| **P1** | **Tier-1 Cloud & SaaS Connectors** | 5 Connectors (AWS IAM, K8s, GitHub, Slack, OpenBao) | +8 Enterprise Connectors (Entra ID, GCP IAM, Okta, Snowflake, Databricks, GitLab, Terraform, PagerDuty) | **Token Security & Astrix** |
| **P2** | **Fleet Deployment & K8s Operator** | Local JSON files (`identity.json`, `resources.json`) | Kubernetes CRDs (`AxiomPolicy`, `AxiomTarget`), Helm Chart, Mutating Admission Webhook | Aembit / Enterprise DevOps |

---

## Phase 1 (P0): Harden Human Operator Auth & Session Governance

### 1.1 The Problem
Currently, `apps/web/app/api/auth/store.ts` uses an in-memory session store for evaluation and local deployments, and `/api/playground/evaluate` runs unauthenticated. Enterprise security teams auditing Axiom will immediately flag in-memory state loss on container restarts and lack of hardware MFA on destructive actions (like the Emergency Kill Switch).

### 1.2 Database Migration (`0003_operator_auth_and_scim.sql`)
Create a new migration file at `lineage-graph/migrations/0003_operator_auth_and_scim.sql`:

```sql
CREATE TABLE IF NOT EXISTS tenants (
    tenant_id VARCHAR(64) PRIMARY KEY,
    organization_name TEXT NOT NULL,
    tenant_salt BYTEA NOT NULL, -- 256-bit isolated salt for HMAC-SHA256 fingerprinting
    sso_issuer_url TEXT,
    sso_client_id TEXT,
    enforce_sso BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operators (
    user_id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('security-admin', 'soc-operator', 'platform-engineer', 'auditor')),
    password_hash TEXT, -- Argon2id hash (nullable if SSO-only)
    webauthn_credential_id TEXT, -- Required for Kill-Switch & Policy Bundle activation
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operator_sessions (
    session_id VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES operators(user_id) ON DELETE CASCADE,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    csrf_token VARCHAR(64) NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_operator_sessions_lookup ON operator_sessions(session_id, revoked, expires_at);
ALTER TABLE operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE operator_sessions ENABLE ROW LEVEL SECURITY;
```

### 1.3 Codebase Changes Required
1. **Deprecate `apps/web/app/api/auth/store.ts`:**
   - Replace the in-memory `Map` with a PostgreSQL connection pool (or Prisma/Drizzle client connected to `DATABASE_URL`).
   - Enforce `Argon2id` password hashing for non-SSO accounts.
2. **Enforce RBAC Middleware (`apps/web/middleware.ts`):**
   - Block unauthenticated access to `/console` in production builds (`NODE_ENV === 'production'`).
   - Refuse startup in `services/extmcp/runtime/src/main.rs` if `AXIOM_ALLOW_ANONYMOUS_LOCAL=1` or `AXIOM_DEV_MODE=1` is set while `AXIOM_ENV=production`.
3. **Step-Up WebAuthn / Passkey Verification for Kill Switch:**
   - Require a cryptographic WebAuthn signature header (`X-Axiom-StepUp-Signature`) on `POST /v1/local/revocations` and `PUT /v1/local/policies/bundle`.

---

## Phase 2 (P0): Zero-Trust Control Plane (`:8787`) & Fleet mTLS

### 2.1 The Problem
In `services/extmcp/runtime/src/admin.rs`, the admin API relies on a single static `AXIOM_ADMIN_TOKEN` bearer secret, and `GET /v1/local/events/stream` is unauthenticated on `127.0.0.1:8787`. In an enterprise multi-VPC deployment, the Next.js Control Plane and remote ExtMCP gateways communicate across cluster boundaries.

### 2.2 Target Architecture
```
[Next.js Control Plane / Operator] 
       |
       | 1. Short-Lived Scoped Operator JWT (RS256/ES256) + mTLS (SPIFFE SVID)
       v
[Axum Admin Server (:8787)] ---> Verifies Client Cert & JWT Role (`security-admin` vs `auditor`)
       |
       +---> SpiceDB Permission Check (`/v1/permissions/checkPermission`)
```

### 2.3 Codebase Changes Required (`services/extmcp/runtime/src/admin.rs`)
1. **Replace Static Bearer Check with Scoped JWT + mTLS Middleware:**
   - Update `admin.rs` to validate short-lived JWTs signed by the Control Plane's OIDC keypair rather than just `constant_time_eq` against `AXIOM_ADMIN_TOKEN` (keep `AXIOM_ADMIN_TOKEN` strictly as a break-glass local CLI fallback).
   - Extract `tenant_id`, `user_id`, and `role` from the validated JWT claims.
2. **Role-Based Endpoint Guards:**
   - `auditor` role: Permitted to call `GET /v1/local/policies/version`, `GET /v1/lineage/graph`, `GET /v1/owasp/scorecard`, `GET /v1/local/events/stream`, and `POST /v1/lineage/simulate-revoke`.
   - `soc-operator` role: All `auditor` permissions + `POST /v1/local/revocations` and `POST /v1/local/sessions/:id/revoke`.
   - `security-admin` role: All permissions + `PUT /v1/local/policies/bundle` and `POST /v1/secretless/rotate`.
3. **Authenticate the SSE Stream (`GET /v1/local/events/stream`):**
   - Since browser `EventSource` does not support custom `Authorization` headers natively, implement short-lived, single-use **SSE Ticket Tokens** (`POST /v1/local/events/ticket` -> returns a 30-second nonce passed via `?ticket=<nonce>`), or switch the frontend SSE hook to `@microsoft/fetch-event-source` with Bearer headers and tenant filtering (`event.tenant_id == caller.tenant_id`).

---

## Phase 3 (P1): Neutralizing Aembit — Universal Secretless Credential Broker

### 3.1 The Problem
Aembit wins deals because it acts as a universal credential broker: a workload presents its native platform identity (AWS IAM Role, GCP Service Account, K8s Projected ServiceAccount Token), and Aembit injects credentials for Snowflake, Stripe, OpenAI, Anthropic, or internal databases without requiring the customer to migrate everything into OpenBao first. Currently, `secretless` (`secretless/src/openbao.rs`) is tightly coupled to OpenBao.

### 3.2 Refactoring `secretless` Crate (`secretless/src/lib.rs`)
Introduce a pluggable `SecretProvider` trait so OpenBao is one of several native credential brokers:

```rust
#[async_trait::async_trait]
pub trait CredentialBrokerProvider: Send + Sync {
    fn provider_id(&self) -> &'static str;
    
    /// Verify workload attestation (e.g., K8s SVID, AWS IMDSv2 / STS identity, GCP OIDC)
    async fn attest_workload(&self, attestation_token: &str) -> Result<WorkloadClaims, SecretlessError>;

    /// Mint or retrieve an ephemeral credential for the upstream MCP server or API
    async fn acquire_ephemeral_credential(
        &self,
        tenant_id: &str,
        workload: &WorkloadClaims,
        target_resource: &str,
        requested_scopes: &[String],
    ) -> Result<EphemeralLease, SecretlessError>;
}
```

### 3.3 New Broker Modules to Implement in `secretless/src/`
1. **`aws_sts.rs`:** Exchanges a workload OIDC token for temporary AWS IAM credentials (`AssumeRoleWithWebIdentity`) with inline session policies restricting actions to the exact Cedar-approved scope.
2. **`gcp_sts.rs`:** Implements Google Cloud Workload Identity Federation token exchange for short-lived GCP OAuth 2.0 access tokens.
3. **`azure_entra.rs`:** Implements Azure Managed Identity / Federated Credential token acquisition.
4. **`oauth2_client_credentials.rs`:** Generic OAuth 2.1 `client_credentials` and RFC 8693 token exchange broker for SaaS targets (Snowflake, Databricks, Salesforce, ServiceNow).
5. **`api_key_vault_injector.rs`:** For legacy 3rd-party APIs (e.g., OpenAI, Anthropic, Stripe) that only support static API keys, fetches the key from AWS Secrets Manager / Azure Key Vault / HashiCorp Vault / OpenBao in memory, injects it into the upstream HTTP/MCP request header at the Envoy/ExtMCP boundary, and strips it from all logs and agent responses.

---

## Phase 4 (P1): Neutralizing Token Security & Astrix — Enterprise Connector Expansion

### 4.1 The Problem
Token Security and Astrix win CISO mindshare during the initial "30-Minute Shadow AI & NHI Audit" by connecting to 50+ enterprise systems out of the box. Axiom currently lists 5 connectors (`aws_iam`, `kubernetes`, `github`, `slack`, `openbao`).

### 4.2 New Connectors to Build in `connectors/src/`

| Priority | Connector Module | API / Protocol Used | Entities Discovered (`nhi_nodes`) | Edges Discovered (`nhi_edges`) | OWASP Risks Detected |
|---|---|---|---|---|---|
| **1** | `azure_entra.rs` | Microsoft Graph API (`/servicePrincipals`, `/applications`) | Enterprise Apps, Service Principals, Managed Identities, Client Secrets | `OWNS` (App Owners), `GRANTS_ACCESS_TO` (AppRoleAssignments) | `NHI1` (Dormant SPs), `NHI3` (Expiring/Long-lived secrets), `NHI4` (`Directory.ReadWrite.All`) |
| **2** | `gcp_iam.rs` | GCP IAM Admin API v1 (`projects.serviceAccounts.keys`) | GCP Service Accounts, User-Managed Keys, Workload Identity Pools | `USES_CREDENTIAL`, `GRANTS_ACCESS_TO` (IAM Policy Bindings) | `NHI2`/`NHI3` (User-managed JSON keys >90d), `NHI4` (`roles/owner`, `roles/editor`) |
| **3** | `okta.rs` | Okta System Log & Apps API (`/api/v1/apps`, `/api/v1/tokens`) | API Services, OAuth2 Clients, Static Admin API Tokens | `OWNS` (Creator via System Log), `AUTHENTICATES_WITH` | `NHI1` (Offboarded admin tokens), `NHI10` (Human using machine token) |
| **4** | `snowflake.rs` | Snowflake SQL REST API (`SNOWFLAKE.ACCOUNT_USAGE.USERS`) | Service Users (`TYPE = 'SERVICE'`), Key-Pair Auth, OAuth Integrations | `USES_CREDENTIAL`, `GRANTS_ACCESS_TO` (Warehouse/Role Grants) | `NHI3` (Password auth without MFA/Keypair), `NHI4` (`ACCOUNTADMIN` role) |
| **5** | `databricks.rs` | Databricks SCIM & Token Management API (`/api/2.0/token-management/tokens`) | Service Principals, Personal Access Tokens (PATs) used by pipelines | `OWNS` (`created_by_username`), `CALLS_TOOL` (Unity Catalog) | `NHI3` (No-expiry PATs), `NHI9` (Shared PAT across notebooks) |
| **6** | `gitlab.rs` | GitLab REST/GraphQL (`/projects/:id/access_tokens`, `CODEOWNERS`) | Project/Group Access Tokens, Deploy Keys, CI/CD Runners | `OWNS` (`.gitlab/CODEOWNERS`), `USES_CREDENTIAL` | `NHI2` (CI variable exposure), `NHI4` (Maintainer/Owner token scope) |
| **7** | `ai_gateways.rs` | OpenAI / Anthropic / AWS Bedrock Admin APIs | Organization API Keys, Project Service Keys, Agent IDs | `OWNS` (Key creator), `CALLS_TOOL` | `MCP09` (Shadow AI keys), `NHI9` (Shared production LLM key) |
| **8** | `terraform_state.rs` | S3 / Terraform Cloud State Parser (`.tfstate` metadata) | Maps provisioned IAM roles/secrets back to exact Git `.tf` file & commit author | `OWNS` (Git Blame -> `attribution` engine) | Resolves `NHI1` Shadow NHI unowned status with `0.90+` confidence |

### 4.3 Connector Engineering Checklist
For every new connector added to `connectors/src/`:
1. **Enforce Zero-Secret Invariant:** Pass every discovered key ID or client secret metadata ID through `connectors::fingerprint_credential_id(tenant_salt, raw_id)` before constructing `DiscoveredNode`. Never deserialize or hold raw secret values in structs.
2. **Token-Bucket Rate Limiting:** Wrap all outbound HTTP calls in the existing `TokenBucket` rate limiter with exponential backoff + jitter on `HTTP 429 Too Many Requests`.
3. **Pagination & Streaming:** Use async stream paginators (`futures::stream::unfold`) so tenants with 50,000+ AWS IAM roles or Entra Service Principals do not spike memory in the discovery worker.

---

## Phase 5 (P2): Production Kubernetes Operator & Zero-Config Deployment

### 5.1 The Problem
Currently, configuring the Rust ExtMCP runtime requires passing file paths via environment variables (`AXIOM_IDENTITY_CONFIG=deployments/local/identity.json`, `AXIOM_RESOURCE_MAP_CONFIG=deployments/local/resources.json`, etc.). Enterprise platform engineering teams managing 50+ Kubernetes clusters require declarative GitOps (ArgoCD / Flux) and automatic sidecar injection.

### 5.2 Deliverables in `deployments/kubernetes/`
1. **Helm Chart (`deployments/helm/axiom-nhi/`):**
   - Deploys the `axiom-extmcp-runtime` DaemonSet or Sidecar proxy alongside Envoy/AgentGateway.
   - Configures readiness/liveness probes hitting `GET :8787/healthz`.
   - Mounts SPIFFE CSI driver socket for workload attestation.
2. **Kubernetes Custom Resource Definitions (CRDs):**
   - `AxiomPolicyBundle`: Allows platform teams to commit Cedar policies in Git (`kubectl apply -f policy.yaml`). A lightweight Kubernetes controller watches the CRD and invokes `PUT :8787/v1/local/policies/bundle` to atomically hot-swap policies across all pods.
   - `AxiomMcpServer`: Declares canonical resource URIs (`mcp://postgres-prod.internal`), RFC 8785 pinned tool schema hashes, and validation profiles (`sql.rs`, `filesystem.rs`, `egress.rs`).
3. **Mutating Admission Webhook:**
   - Watches pods labeled with `axiom.nhi/protect: "true"`.
   - Automatically injects the `axiom-extmcp-runtime` sidecar container and configures `iptables` or Envoy egress routing so all outbound MCP/database traffic is transparently intercepted on `:9001` without developer code changes.

---

## Phase 6: 60-Day Execution Sprint Plan

### Sprint 1 (Weeks 1–2): Control Plane Security & Auth Hardening
- [ ] Write and run `0003_operator_auth_and_scim.sql` migration.
- [ ] Replace `apps/web/app/api/auth/store.ts` with PostgreSQL-backed session storage.
- [ ] Add role-based JWT verification and mTLS support to `services/extmcp/runtime/src/admin.rs`.
- [ ] Authenticate `GET /v1/local/events/stream` and scope SSE broadcasts by `tenant_id`.
- [ ] Add WebAuthn step-up confirmation modal in `/console` before firing the Emergency Kill Switch.

### Sprint 2 (Weeks 3–4): Universal Secretless Broker (Beating Aembit)
- [ ] Extract `CredentialBrokerProvider` trait in `secretless/src/lib.rs`.
- [ ] Implement `aws_sts.rs` (`AssumeRoleWithWebIdentity`) and `gcp_sts.rs` in `secretless`.
- [ ] Implement generic OAuth 2.1 `client_credentials` + API Key header injection at the ExtMCP response/request boundary.
- [ ] Add integration tests verifying zero-secret leakage to the calling AI agent.

### Sprint 3 (Weeks 5–6): Enterprise Connectors (Beating Token Security & Astrix)
- [ ] Implement `azure_entra.rs` and `gcp_iam.rs` discovery connectors.
- [ ] Implement `okta.rs` and `snowflake.rs` discovery connectors.
- [ ] Implement `terraform_state.rs` to supercharge the `attribution` crate's `OwnershipAttributionEngine`.
- [ ] Update `/integrations` and `/shadow-audit` UI in `apps/web` to wire up live connection wizards for the new providers.

### Sprint 4 (Weeks 7–8): Kubernetes Operator, Benchmarks & Compliance Pack
- [ ] Package `deployments/helm/axiom-nhi` Helm chart and K8s CRD controller.
- [ ] Publish reproducible `k6` / `ghz` gRPC benchmark suite proving `<2ms` p99 latency at 10,000 RPS under `benchmarks/`.
- [ ] Generate Vanta/Drata-ready SOC 2 Type I evidence artifacts (automated Merkle audit log verification script + RBAC enforcement tests).

---

## Verification & Acceptance Criteria

Before marking this gap-closure milestone complete, all of the following automated gates must pass:

```bash
# 1. Zero warnings or errors across all 18+ Rust workspace crates
cargo clippy --workspace --all-targets -- -D warnings

# 2. All unit, AST validator, Cedar policy, and Postgres CTE tests pass
cargo test --workspace

# 3. Verify production runtime refuses to boot with anonymous/dev flags
AXIOM_ENV=production AXIOM_ALLOW_ANONYMOUS_LOCAL=1 cargo run -p extmcp-runtime
# Expected: Immediate non-zero exit with security configuration error

# 4. Frontend strict typecheck and production bundle build
pnpm --filter @axiom/web typecheck
pnpm --filter @axiom/web build
```