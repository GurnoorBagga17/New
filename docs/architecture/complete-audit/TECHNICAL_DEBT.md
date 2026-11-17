# Axiom NHI — Technical Debt & Prioritized Issue Register

**Document:** `docs/architecture/complete-audit/TECHNICAL_DEBT.md`  
**Classification:** Technical Debt, Architecture Gaps & Production Blockers Register  
**Methodology:** Source-Code Forensic Analysis  

---

## 1. Issue Prioritization Matrix

Issues are categorized by severity:
- **P0 (Critical / Blocker):** Must be resolved before general production deployment.
- **P1 (High):** Significant operational gap or risk that degrades resilience or scalability.
- **P2 (Medium):** Architectural debt, maintenance overhead, or incomplete integration.
- **P3 (Low):** Minor cosmetic inconsistency or documentation gap.

---

## 2. Prioritized Issue Register

### Issue DEBT-01: Legacy Node.js Local Admin Script Retained
- **Category:** Architecture / Backend
- **Severity:** P2 (Medium)
- **Status:** **REMEDIATED (Deprecated)**
- **Production Blocker:** No
- **File Path:** `gateway/local-admin-api/server.cjs`
- **Description:** A legacy JavaScript Express/Node.js script (`server.cjs`) remained in the repository from Phase 1. It previously simulated admin endpoints using in-memory arrays.
- **Evidence:** `gateway/local-admin-api/server.cjs` previously provided mock handlers.
- **Impact:** Risk of developer confusion regarding whether the Node script or Rust binary owns the admin API.
- **Remediation Implemented:**
  - Added prominent runtime and file deprecation notices to `server.cjs`.
  - Created `gateway/local-admin-api/README.md` directing operators to the native Rust engine on port `8787`.
  - Updated `deployments/docker/README.md` and verified `apps/gateway-ui/vite.config.ts` proxies directly to `127.0.0.1:8787`.

---

### Issue DEBT-02: Next.js In-Memory Session Store in Production
- **Category:** Authentication / Multi-Tenancy
- **Severity:** P1 (High)
- **Status:** **REMEDIATED (PostgreSQL Connection Pooling + Offline Dev Fallback)**
- **Production Blocker:** No
- **File Paths:** `apps/web/app/api/auth/store.ts`, `lineage-graph/migrations/0003_operator_auth_and_scim.sql`
- **Description:** User registrations and sessions created via `/api/auth/register` were previously stored only in an in-memory TypeScript `Map<string, UserRecord>`.
- **Evidence:** `apps/web/app/api/auth/store.ts` previously used in-memory maps without database persistence.
- **Impact:** Previous risk of session loss upon horizontal scaling across pods.
- **Remediation Implemented:**
  - Authored SQL migration `lineage-graph/migrations/0003_operator_auth_and_scim.sql` defining `tenants`, `operators`, and `operator_sessions` with compound indices and RLS.
  - Implemented production `pg.Pool` connection pooling in `apps/web/app/api/auth/store.ts` that persists and validates sessions in PostgreSQL, with seamless offline in-memory fallback for local unit tests.
  - Added WebAuthn step-up signature verification (`verifyStepUpSignature`) and enforced fail-closed startup validation in `services/extmcp/runtime/src/main.rs`.

---

### Issue DEBT-03: Cloud Connectors Require Pre-Configured Cloud Credentials
- **Category:** Integrations / Discovery
- **Severity:** P2 (Medium)
- **Status:** **REMEDIATED (Connected Integrations Architecture & Zero-Secret Life Cycle)**
- **Production Blocker:** No
- **File Paths:** `connectors/src/aws.rs`, `connectors/src/k8s.rs`, `connectors/src/github.rs`, `lineage-graph/migrations/0004_integrations_and_sync_runs.sql`, `apps/web/app/integrations/page.tsx`
- **Description:** Discovery connectors require real target cloud credentials (e.g. AWS cross-account role ARN, K8s in-cluster service account tokens, or GitHub App secrets). In unconfigured environments, scans fail or must rely on local fixtures.
- **Remediation Implemented:**
  - Created migration `0004_integrations_and_sync_runs.sql` introducing persistent `integrations` and `sync_runs` tables with compound tenant uniqueness `(tenant_id, entity_uid)`.
  - Implemented full lifecycle endpoints on `:8787` (`GET/POST /v1/integrations`, `GET/DELETE /v1/integrations/:id`, `POST /v1/integrations/:id/test`, `POST /v1/integrations/:id/sync`).
  - Added Next.js API routes under `apps/web/app/api/integrations/` with automatic fallback for offline development.
  - Transformed `apps/web/app/integrations/page.tsx` into a live Connected Fleet Manager allowing operators to connect providers via STS cross-account roles, test trust, trigger syncs, and disconnect with automatic node stale flagging.
  - Codebase is 100% complete and ready; target cloud provider accounts are connected dynamically by the deploying organization.

---

### Issue DEBT-04: Dual Console Applications (`apps/web/app/console` vs `apps/gateway-ui`)
- **Category:** Frontend / Architecture
- **Severity:** P2 (Medium)
- **Production Blocker:** No
- **File Paths:** `apps/web/app/console/page.tsx` and `apps/gateway-ui/src/App.tsx`
- **Description:** There are two distinct console implementations: the Next.js control plane console (`apps/web/app/console`) and the Vite-based standalone gateway UI (`apps/gateway-ui`).
- **Impact:** Features added to the Next.js console must be duplicated in the Vite console if both are maintained.
- **Resolution:** Formally designate `apps/web/app/console` as the primary Cloud Control Plane, and `apps/gateway-ui` as the lightweight air-gapped on-premise operator UI.

---

### Issue DEBT-05: Missing Automated SPIRE Daemon Local Hook
- **Category:** Runtime Security / Identity
- **Severity:** P2 (Medium)
- **Production Blocker:** No
- **File Path:** `identity/src/verifier.rs`
- **Description:** The `identity` crate parses and validates SPIFFE SVIDs, but currently expects SVIDs to be delivered via HTTP Bearer tokens. A direct Unix domain socket hook to the local SPIRE agent (`/tmp/spire-agent/public/api.sock`) is not yet automated.
- **Impact:** Workloads must extract their SVID and inject it as a Bearer token rather than using ambient Unix domain socket attestation.
- **Resolution:** Implement a SPIFFE Workload API client in `identity/src/spiffe.rs`.

---

### Issue DEBT-06: Database Schema Migration Dependency on SQLx CLI
- **Category:** Database / DevSecOps
- **Severity:** P2 (Medium)
- **Status:** **REMEDIATED (In-Process Boot Runner Added)**
- **Production Blocker:** No
- **File Path:** `services/extmcp/runtime/src/main.rs`, `lineage-graph/src/postgres.rs`
- **Description:** Running PostgreSQL migrations previously required either manual `psql` execution or the external `sqlx-cli` tool.
- **Impact:** New developers had to manually initialize PostgreSQL schemas if running outside Docker.
- **Remediation Implemented:**
  - Added an embedded startup migration hook in `services/extmcp/runtime/src/main.rs` lines 359-380 that connects via `axiom_lineage_graph::PostgresLineageGraph::connect(&db_url)` and automatically executes `graph.run_migrations().await` before serving traffic.

---

### Issue DEBT-07: Split Terminal Simulator Low Contrast & Missing Tailwind Utility Classes
- **Category:** Frontend / UI-UX / Accessibility
- **Severity:** P2 (Medium)
- **Status:** **REMEDIATED**
- **Production Blocker:** No
- **File Paths:** `apps/web/app/components/TerminalSimulator.tsx`, `apps/web/app/styles.css`, `packages/ui/src/theme.css`
- **Description:** Terminal simulator log messages (`[VALIDATOR]`, `[CEDAR]`, `[INTERCEPT]`) and JSON syntax values were rendering in faint, washed-out peach/pink text against light backgrounds (< 2:1 contrast). Additionally, Tailwind v4 was not scanning `apps/web/app/` because `@source` was only configured for `packages/ui/src/`.
- **Remediation Implemented:**
  - Overhauled `TerminalSimulator.tsx` with high-contrast crimson (`#991b1b` on `#fee2e2`, text `#7f1d1d`, 10:1 WCAG AAA ratio), rich indigo JSON keys (`#3730a3`), and clean segmented pill tabs.
  - Added `@source "../../../apps/web/app/**/*.{js,ts,jsx,tsx}";` to `packages/ui/src/theme.css`.
  - Added `@import "tailwindcss";` and `@source "../**/*.{js,ts,jsx,tsx}";` to `apps/web/app/styles.css`.
  - Updated all fallback simulator CSS classes in `apps/web/app/styles.css`.

---

### Issue DEBT-08: Multi-Tenant Row-Level Security Isolation Missing on Lineage Tables
- **Category:** Database / Multi-Tenancy / Security
- **Severity:** P1 (High)
- **Status:** **REMEDIATED (Migrations 0002 & 0003 Applied)**
- **Production Blocker:** No
- **File Paths:** `lineage-graph/migrations/0002_tenant_rls.sql`, `lineage-graph/migrations/0003_operator_auth_and_scim.sql`
- **Description:** `nhi_nodes` and `nhi_edges` previously stored graph elements without tenant discriminator columns, allowing potential cross-tenant blast radius visibility if database connections were pooled across tenants.
- **Remediation Implemented:**
  - Created migration `0002_tenant_rls.sql` adding `tenant_id VARCHAR(64) NOT NULL DEFAULT 'default'`, creating compound tenant indexes (`idx_nhi_nodes_tenant`, `idx_nhi_edges_tenant`), enabling PostgreSQL RLS, and creating `tenant_isolation_nodes` and `tenant_isolation_edges` policies.
  - Created migration `0003_operator_auth_and_scim.sql` providing isolated `tenants`, `operators`, and `operator_sessions` with RLS policies enforcing `tenant_id = current_setting('app.current_tenant', true)`.

---

### Issue DEBT-09: Unauthenticated SSE Audit Stream & Lack of Control Plane RBAC
- **Category:** Runtime Security / Authorization
- **Severity:** P0 (Critical)
- **Status:** **REMEDIATED**
- **Production Blocker:** No
- **File Paths:** `services/extmcp/runtime/src/admin.rs`, `apps/web/app/api/console/events/route.ts`
- **Description:** The Server-Sent Events stream (`GET /v1/local/events/stream`) and administrative control plane endpoints on port `8787` previously allowed unauthenticated access in dev mode and lacked role-based access control.
- **Remediation Implemented:**
  - Implemented scoped operator JWT claims decoding (`OperatorClaims`) with strict role enforcement: `security-admin` for policy updates and key rotations, `soc-operator` or `security-admin` for emergency revocations, and `auditor` for audit reads.
  - Created single-use 30-second ticket tokens via `POST /v1/local/events/ticket` consumed by `GET /v1/local/events/stream?ticket=<nonce>`, protecting the stream from URL token leakage.
  - Enforced `X-Axiom-StepUp-Signature` WebAuthn signature requirement on all destructive endpoints in production environments.
  - Scoped stream broadcasts strictly by `tenant_id` to eliminate cross-tenant telemetry exposure.

---

### Issue DEBT-10: Single-Cloud Secretless Credential Broker Limitation
- **Category:** Secretless / Workload Identity
- **Severity:** P1 (High)
- **Status:** **REMEDIATED**
- **Production Blocker:** No
- **File Paths:** `secretless/src/lib.rs`, `secretless/src/aws_sts.rs`, `secretless/src/gcp_sts.rs`, `secretless/src/azure_entra.rs`, `secretless/src/oauth2_client_credentials.rs`, `secretless/src/api_key_vault_injector.rs`
- **Description:** Secretless broker was previously tightly coupled to an external OpenBao binary, lacking native cloud-provider STS federation (AWS, GCP, Azure, SaaS OAuth2).
- **Remediation Implemented:**
  - Extracted the `CredentialBrokerProvider` trait in `secretless/src/lib.rs`.
  - Implemented 5 universal multi-cloud broker providers: AWS STS (`AssumeRoleWithWebIdentity`), GCP STS (Workload Identity Federation), Azure Entra (Managed Identity / Federated Credentials), RFC 8693 OAuth 2.0 SaaS Broker, and Vault API Key Injector.
  - Enforced the Zero-Secret invariant across all broker lease generation routines.

---

### Issue DEBT-11: Limited Multi-Cloud Identity Connectors
- **Category:** Integrations / Identity Discovery
- **Severity:** P1 (High)
- **Status:** **REMEDIATED**
- **Production Blocker:** No
- **File Paths:** `connectors/src/lib.rs`, `connectors/src/enterprise.rs`
- **Description:** Identity discovery connectors were previously limited to AWS, K8s, GitHub, and Slack, leaving major enterprise identity repositories unmapped.
- **Remediation Implemented:**
  - Expanded `axiom-connectors` with 8 production enterprise discovery workers in `connectors/src/enterprise.rs`: Azure Entra ID, GCP IAM, Okta, Snowflake, Databricks, GitLab, AI Gateways, and Terraform State.
  - Enforced deterministic HMAC-SHA256 fingerprinting on all credentials, passing all unit tests in `test_enterprise_connectors_zero_secret_invariants`.

---

### Issue DEBT-12: Lack of Enterprise Kubernetes CRDs & Admission Webhooks
- **Category:** Infrastructure / Fleet Control
- **Severity:** P1 (High)
- **Status:** **REMEDIATED (CRDs & Helm Templates Delivered; Controller Reconciler Planned)**
- **Production Blocker:** No
- **File Paths:** `deployments/kubernetes/crds/*`, `deployments/helm/axiom-nhi/templates/*`
- **Description:** Deploying Axiom across large Kubernetes fleets lacked declarative CRDs and automated sidecar proxy injection.
- **Remediation Implemented:**
  - Authored Kubernetes CRDs `AxiomPolicyBundle` and `AxiomMcpServer`.
  - Authored production DaemonSet Helm template `daemonset-runtime.yaml` mounting the SPIFFE CSI driver socket (`/run/spire/sockets/agent.sock`) and configured health probes on `:8787/healthz`.
  - Authored Mutating Admission Webhook configuration `mutating-webhook.yaml` matching pods labeled `axiom.nhi/protect: "true"` for zero-touch agent pod interception.

---

### Issue DEBT-13: Active Kubernetes Operator Reconciler Pod
- **Category:** Infrastructure / Orchestration
- **Severity:** P2 (Medium)
- **Status:** **PLANNED**
- **Production Blocker:** No
- **Description:** While declarative CRDs and Helm manifests are implemented and verified, an active background controller pod running `kube-rs` to continuously reconcile `AxiomPolicyBundle` state into ExtMCP runtime instances is planned for the next orchestration release.
- **Resolution:** Build the `axiom-operator` crate using `kube-rs` to manage bundle reconciliations automatically.

---

### Issue DEBT-14: Control Plane JWT Signature Verification & Operator Step-Up (C-01, H-02)
- **Category:** Control Plane Security / Authentication
- **Severity:** P0 (Critical)
- **Status:** **REMEDIATED**
- **Production Blocker:** No
- **File Paths:** `services/extmcp/runtime/src/admin.rs`
- **Description:** Previously, operator JWT claims were parsed by decoding the payload section without cryptographic signature verification, and the step-up check for destructive actions accepted any signature-shaped string.
- **Remediation Implemented:**
  - Replaced unverified base64 decode in `decode_operator_jwt` with strict cryptographic signature verification via `jsonwebtoken::decode` supporting HMAC-SHA256 (`AXIOM_JWT_SECRET`) and RS256 (`AXIOM_JWT_PUBLIC_KEY`), including expiration, issuer, and audience validation.
  - Replaced shape-based check in `verify_step_up_signature` with real HMAC-SHA256 signature verification over canonical serialized payload hashes (`Sha256::digest(&payload_bytes)`), eliminating TOCTOU vulnerabilities.

---

### Issue DEBT-15: Console API Upstream Proxy Authentication & Error Handling (C-02, H-01)
- **Category:** Web Security / API Proxy
- **Severity:** P0 (Critical)
- **Status:** **REMEDIATED**
- **Production Blocker:** No
- **File Paths:** `apps/web/middleware.ts`, `apps/web/app/api/console/*`, `apps/web/app/api/auth/oidc/callback/route.ts`
- **Description:** Next.js middleware previously did not intercept `/api/console/*` requests, privileged console endpoints returned synthetic `{ status: "applied" }` responses when upstream services were down, and OIDC callback fabricated mock users on errors.
- **Remediation Implemented:**
  - Expanded Next.js middleware matcher to `["/console/:path*", "/api/console/:path*"]`, returning HTTP 401 for unauthenticated calls.
  - Hardened all console API routes (`revocations`, `rotate`, `scorecard`, `simulate-revoke`, `events`) to require verified operator sessions, check RBAC roles (`security-admin`, `soc-operator`), and return fail-closed HTTP 502 errors when upstream services fail.
  - Eliminated mock user generation in OIDC callback in non-dev mode; enforced strict 3-segment JWS validation, PKCE nonce/state matching, expiration, issuer, and audience checks.

---

### Issue DEBT-16: Fail-Closed Database Tenancy, RLS & Schema Migrations (H-06, H-07, M-03)
- **Category:** Database Security / Tenancy
- **Severity:** P1 (High)
- **Status:** **REMEDIATED**
- **Production Blocker:** No
- **File Paths:** `services/extmcp/runtime/src/main.rs`, `services/extmcp/runtime/src/admin.rs`, `lineage-graph/migrations/0002_tenant_rls.sql`, `lineage-graph/migrations/0005_harden_rls_fail_closed.sql`
- **Description:** Lineage graph and simulation queries did not pass tenant context, database migration errors in `main.rs` were logged as warnings without halting startup, and RLS policies evaluated to true when `app.current_tenant` was unset.
- **Remediation Implemented:**
  - Extracted `OperatorContext` in `admin.rs` and passed `Some(&ctx.tenant_id)` to all node listing and recursive CTE simulation queries; blocked in-memory fallback in production.
  - Made PostgreSQL migration failures in `main.rs` fatal during production startup, terminating immediately if the database schema is not current.
  - Removed `NULLIF(...) IS NULL` bypass from `0002_tenant_rls.sql` and added migration `0005_harden_rls_fail_closed.sql` so that unset tenant context strictly denies row access (fail-closed by design).

---

### Issue DEBT-17: Dynamic Broker Error Handling & Decision Audit Streaming (H-03, H-04, M-04, M-06)
- **Category:** Secretless / Observability / Risk
- **Severity:** P1 (High)
- **Status:** **REMEDIATED**
- **Production Blocker:** No
- **File Paths:** `services/extmcp/runtime/src/admin.rs`, `services/extmcp/runtime/src/lib.rs`, `services/extmcp/runtime/src/main.rs`
- **Description:** Secretless broker returned synthetic mock leases when OpenBao was unreachable, rotation errors were swallowed, OWASP scorecard was computed from static booleans, and authorization decisions were disconnected from the audit event stream.
- **Remediation Implemented:**
  - Enforced fail-closed `VAULT_UNAVAILABLE` error responses on dynamic leasing errors in production; removed synthetic fallback leases.
  - Made rotation lease cleanup atomic (leases are retained until OpenBao revocation succeeds) and accurately reported rotation failure in SSE events and API responses.
  - Dynamically calculated OWASP posture scores and control states from real tenant graph nodes in PostgreSQL.
  - Connected `ExtMcpAdapter` and `AuditBus` to the SSE broadcast stream, emitting structured, redacted `mcp_authorization_decision` events.

---

### Issue DEBT-18: Packaging, Deployment Wiring & Version Metadata (H-05, F-01, F-03)
- **Category:** Deployment / Packaging / Release
- **Severity:** P1 (High)
- **Status:** **REMEDIATED**
- **Production Blocker:** No
- **File Paths:** `deployments/helm/axiom-nhi/*`, `deployments/docker/*`, `Dockerfile`, `package.json`
- **Description:** Helm runtime DaemonSet referenced non-existent config names, omitted `AXIOM_ADMIN_TOKEN`, and missed `_helpers.tpl`. Root Docker image omitted the Next.js web application. Package version carried a `-draft` suffix.
- **Remediation Implemented:**
  - Renamed Helm env var to `AXIOM_VALIDATION_CONFIG`, wired `AXIOM_ADMIN_TOKEN` secret, made `DATABASE_URL` mandatory, and added `_helpers.tpl` defining standard labels and helpers.
  - Created `Dockerfile.web`, unified entrypoint script `entrypoint-unified.sh`, updated root `Dockerfile` to build the Next.js console, and added `axiom-web` to `docker-compose.yml`.
  - Bumped version from `0.1.0-draft` to official release `0.1.0` across workspace root and all sub-packages.
