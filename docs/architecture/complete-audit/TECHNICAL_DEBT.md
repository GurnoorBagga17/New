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
- **Production Blocker:** Yes (for multi-instance Cloud deployments)
- **File Path:** `apps/web/app/api/auth/store.ts`
- **Description:** User registrations and sessions created via `/api/auth/register` are stored in an in-memory TypeScript `Map<string, UserRecord>`.
- **Evidence:** `apps/web/app/api/auth/store.ts:16`: `const users = new Map<string, UserRecord>();`.
- **Impact:** If the Next.js application scales horizontally across multiple Vercel or Kubernetes pods, session state is not shared, resulting in session loss.
- **Resolution:** Swap the in-memory store for a Redis session cache or Supabase Auth provider when deploying outside single-instance dev environments.

---

### Issue DEBT-03: Cloud Connectors Require Pre-Configured Cloud Credentials
- **Category:** Integrations / Discovery
- **Severity:** P2 (Medium)
- **Production Blocker:** No
- **File Path:** `connectors/src/aws.rs`, `connectors/src/k8s.rs`, `connectors/src/github.rs`
- **Description:** The discovery workers require valid AWS IAM STS credentials (`AWS_ACCESS_KEY_ID`), Kubernetes in-cluster service account tokens, or GitHub App secrets. In environments without these credentials configured, discovery scans fail with authentication errors.
- **Impact:** Local testing without cloud access must rely on synthetic seed fixtures in `deployments/local/`.
- **Resolution:** Add offline synthetic mock fixtures in the connector trait for zero-cloud integration testing.

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
- **Status:** **IN PROGRESS (Phase 1 Migration Added)**
- **Production Blocker:** Yes (for enterprise multi-tenant shared database deployments)
- **File Path:** `lineage-graph/migrations/0002_tenant_rls.sql`
- **Description:** `nhi_nodes` and `nhi_edges` previously stored graph elements without tenant discriminator columns, allowing potential cross-tenant blast radius visibility if database connections were pooled across tenants.
- **Remediation Implemented:**
  - Created migration `0002_tenant_rls.sql` adding `tenant_id VARCHAR(64) NOT NULL DEFAULT 'default'`, creating compound tenant indexes (`idx_nhi_nodes_tenant`, `idx_nhi_edges_tenant`), enabling PostgreSQL RLS, and creating `tenant_isolation_nodes` and `tenant_isolation_edges` policies.
