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
Created migration file at `lineage-graph/migrations/0003_operator_auth_and_scim.sql`:

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

### 1.3 Codebase Changes Implemented
1. **Upgraded `apps/web/app/api/auth/store.ts`:**
   - PostgreSQL connection pool integration via `pg.Pool` with connection pooling to `DATABASE_URL`.
   - Dual-persistence with memory/disk caching fallback for offline developer evaluation.
   - Cryptographic step-up signature verification helper `verifyStepUpSignature` for destructive actions.
2. **Enforced RBAC Middleware (`apps/web/middleware.ts`):**
   - Strictly blocks unauthenticated access to `/console` in production builds (`NODE_ENV === 'production' || AXIOM_ENV === 'production'`).
   - Refuses startup in `services/extmcp/runtime/src/main.rs` if `AXIOM_ALLOW_ANONYMOUS_LOCAL=1` or `AXIOM_DEV_MODE=1` is set while `AXIOM_ENV=production`.
3. **Step-Up WebAuthn / Passkey Verification for Kill Switch:**
   - Evaluates cryptographic WebAuthn signature header (`X-Axiom-StepUp-Signature`) on `POST /v1/local/revocations` and `PUT /v1/local/policies/bundle`.

---

## Phase 2 (P0): Zero-Trust Control Plane (`:8787`) & Fleet mTLS

### 2.1 The Problem
In `services/extmcp/runtime/src/admin.rs`, the admin API originally relied on a single static `AXIOM_ADMIN_TOKEN` bearer secret, and `GET /v1/local/events/stream` was unauthenticated on `127.0.0.1:8787`. In an enterprise multi-VPC deployment, the Next.js Control Plane and remote ExtMCP gateways communicate across cluster boundaries.

### 2.2 Target Architecture
```
[Next.js Control Plane / Operator] 
       |
       | 1. Short-Lived Scoped Operator JWT (RS256/ES256) + Single-Use SSE Ticket Nonce
       v
[Axum Admin Server (:8787)] ---> Verifies JWT Role (`security-admin` vs `auditor` vs `soc-operator`)
       |
       +---> Scoped Event Broadcast by Tenant ID
```

### 2.3 Codebase Changes Implemented (`services/extmcp/runtime/src/admin.rs`)
1. **Scoped JWT & Operator Context Extraction:**
   - Implemented `OperatorClaims` parser decoding JWT claims (`sub`, `tenant_id`, `role`, `exp`).
   - Retained `AXIOM_ADMIN_TOKEN` constant-time comparison strictly as a break-glass local CLI fallback.
2. **Role-Based Endpoint Guards:**
   - `auditor` role: Permitted to call `GET /v1/local/policies/version`, `GET /v1/lineage/graph`, `GET /v1/owasp/scorecard`, `GET /v1/local/events/stream`, and `POST /v1/lineage/simulate-revoke`.
   - `soc-operator` role: All `auditor` permissions + `POST /v1/local/revocations` and `POST /v1/local/sessions/:id/revoke`.
   - `security-admin` role: All permissions + `PUT /v1/local/policies/bundle` and `POST /v1/secretless/rotate`.
3. **Authenticated Single-Use SSE Stream (`GET /v1/local/events/stream`):**
   - Implemented `POST /v1/local/events/ticket` returning a 30-second single-use nonce.
   - `GET /v1/local/events/stream` consumes ticket nonce or Bearer JWT, and scopes stream broadcasts strictly by `tenant_id`.
   - Next.js console proxy (`apps/web/app/api/console/events/route.ts`) requests ticket nonce prior to opening upstream stream.

---

## Phase 3 (P1): Universal Secretless Credential Broker

### 3.1 The Problem
Aembit acts as a universal credential broker: a workload presents its native platform identity (AWS IAM Role, GCP Service Account, K8s Projected ServiceAccount Token), and the broker injects credentials for Snowflake, Stripe, OpenAI, Anthropic, or internal databases.

### 3.2 Pluggable `CredentialBrokerProvider` Trait (`secretless/src/lib.rs`)
Introduced pluggable `CredentialBrokerProvider` trait:

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

### 3.3 New Broker Modules Implemented in `secretless/src/`
1. **`openbao.rs`:** Implemented `CredentialBrokerProvider` for `OpenBaoClient`.
2. **`aws_sts.rs`:** Exchanges workload OIDC tokens for temporary AWS IAM credentials (`AssumeRoleWithWebIdentity`) with inline session policies.
3. **`gcp_sts.rs`:** Google Cloud Workload Identity Federation token exchange for short-lived GCP OAuth 2.0 access tokens.
4. **`azure_entra.rs`:** Azure Managed Identity / Federated Credential token acquisition.
5. **`oauth2_client_credentials.rs`:** Generic OAuth 2.1 `client_credentials` and RFC 8693 token exchange broker for SaaS targets (Snowflake, Databricks, Salesforce).
6. **`api_key_vault_injector.rs`:** Ephemeral API key envelope injector for legacy 3rd-party APIs (OpenAI, Anthropic, Stripe) with zero raw token exposure.

---

## Phase 4 (P1): Enterprise Connector Expansion

### 4.1 Implemented Connectors in `connectors/src/enterprise.rs`

| Priority | Connector Module | API / Protocol Used | Entities Discovered (`nhi_nodes`) | Edges Discovered (`nhi_edges`) | OWASP Risks Detected |
|---|---|---|---|---|---|
| **1** | `AzureEntraDiscoveryWorker` | Microsoft Graph API (`/servicePrincipals`, `/applications`) | Enterprise Apps, Service Principals, Managed Identities, Client Secrets | `OWNS`, `GRANTS_ACCESS_TO` | `NHI1` (Dormant SPs), `NHI3` (Expiring secrets), `NHI4` (`Directory.ReadWrite.All`) |
| **2** | `GcpIamDiscoveryWorker` | GCP IAM Admin API v1 (`projects.serviceAccounts.keys`) | GCP Service Accounts, User-Managed Keys, Workload Identity Pools | `USES_CREDENTIAL`, `GRANTS_ACCESS_TO` | `NHI2`/`NHI3` (User-managed JSON keys >90d), `NHI4` (`roles/owner`) |
| **3** | `OktaDiscoveryWorker` | Okta System Log & Apps API (`/api/v1/apps`, `/api/v1/tokens`) | API Services, OAuth2 Clients, Static Admin API Tokens | `OWNS`, `AUTHENTICATES_WITH` | `NHI1` (Offboarded admin tokens), `NHI10` (Human using machine token) |
| **4** | `SnowflakeDiscoveryWorker` | Snowflake SQL REST API (`SNOWFLAKE.ACCOUNT_USAGE.USERS`) | Service Users (`TYPE = 'SERVICE'`), Key-Pair Auth, OAuth Integrations | `USES_CREDENTIAL`, `GRANTS_ACCESS_TO` | `NHI3` (Password auth without Keypair), `NHI4` (`ACCOUNTADMIN` role) |
| **5** | `DatabricksDiscoveryWorker` | Databricks SCIM & Token Management API (`/api/2.0/token-management/tokens`) | Service Principals, Personal Access Tokens (PATs) | `OWNS`, `CALLS_TOOL` | `NHI3` (No-expiry PATs), `NHI9` (Shared PAT across notebooks) |
| **6** | `GitlabDiscoveryWorker` | GitLab REST/GraphQL (`/projects/:id/access_tokens`, `CODEOWNERS`) | Project/Group Access Tokens, Deploy Keys, CI/CD Runners | `OWNS`, `USES_CREDENTIAL` | `NHI2` (CI variable exposure), `NHI4` (Maintainer/Owner token scope) |
| **7** | `AiGatewaysDiscoveryWorker` | OpenAI / Anthropic / AWS Bedrock Admin APIs | Organization API Keys, Project Service Keys, Agent IDs | `OWNS`, `CALLS_TOOL` | `MCP09` (Shadow AI keys), `NHI9` (Shared production LLM key) |
| **8** | `TerraformStateDiscoveryWorker` | S3 / Terraform Cloud State Parser (`.tfstate` metadata) | Maps provisioned IAM roles/secrets back to exact Git `.tf` file & commit author | `OWNS` (`Git Blame` -> attribution engine) | Resolves `NHI1` Shadow NHI unowned status with `0.90+` confidence |

---

## Phase 5 (P2): Production Kubernetes Operator & Zero-Config Deployment

### 5.1 Deliverables in `deployments/kubernetes/` & `deployments/helm/`
1. **CRD `deployments/kubernetes/crds/axiom_policy_bundle_crd.yaml`:**
   - Defines `AxiomPolicyBundle` custom resource for GitOps Cedar policy rollouts.
2. **CRD `deployments/kubernetes/crds/axiom_mcp_server_crd.yaml`:**
   - Defines `AxiomMcpServer` custom resource for canonical resource URIs, RFC 8785 pinned tool schema hashes, and secretless broker configuration.
3. **Helm Template `deployments/helm/axiom-nhi/templates/daemonset-runtime.yaml`:**
   - Deploys `axiom-extmcp-runtime` with health checks on `:8787/healthz`, gRPC on `:9001`, and SPIFFE CSI driver socket volume mounts.
4. **Helm Template `deployments/helm/axiom-nhi/templates/mutating-webhook.yaml`:**
   - Automated sidecar injector for pods labeled with `axiom.nhi/protect: "true"`.

---

## Verification & Acceptance Criteria Execution

All automated criteria have passed:
1. `cargo clippy --workspace --all-targets -- -D warnings`: 0 warnings, 0 errors.
2. `cargo test --workspace`: All unit, AST validator, Cedar policy, Postgres CTE, and connector tests pass.
3. `pnpm run typecheck`: Strict TypeScript checking passes across all monorepo workspaces.
