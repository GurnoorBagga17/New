# Axiom NHI — Complete Engineering & UI/UX Specification for All 12 Missing Next.js Routes (`apps/web`)

**Target Repository:** `c:\Users\Lenovo\Desktop\Axiom` (`GurnoorBagga17/New`)  
**Target Workspace:** `apps/web` (Next.js App Router, React 19, Strict TypeScript)  
**Mandatory Visual Theme:** **Enterprise Light-First Tactical Precision** (`rgb(248, 250, 252)` Alabaster Canvas, `rgb(255, 255, 255)` Surface Cards, `rgb(15, 23, 42)` Primary Ink, `rgb(2, 132, 199)` Brand Cyan-Blue, `rgb(79, 70, 229)` Brand Indigo, `rgb(5, 150, 105)` Emerald Allow, `rgb(220, 38, 38)` Crimson Deny)  
**Competitive Benchmark Targets:** [Token Security](https://www.token.security/), [Aembit](https://aembit.io/), and [Clutch Security](https://www.clutch.security/)

## 1. Complete Target Route Tree After Implementation (`33` Total Routes)

Your AI coding agent must build all 12 missing route groups below so `pnpm --filter @axiom/web build` compiles cleanly with `typescript.ignoreBuildErrors: false` and `python3 docs/architecture/scripts/check_frontend_colors.py` passes with **0 hardcoded `#hex` literals**:

```text
Route (app) — Target Production Build Output
┌ ○ /                                    (Existing: Hero 3D Enclave, Split Terminal, $0 Calculator)
├ ○ /_not-found                          (Existing: 404 Boundary)
├ ○ /about                               (NEW — Route 8B: Open-Core Mission, Architecture Principles & Team)
├ ƒ /api/auth/login                      (Existing: scrypt verification + session rotation)
├ ƒ /api/auth/logout                     (NEW — Route 9B: Server session revocation + clear HttpOnly cookie)
├ ƒ /api/auth/me                         (NEW — Route 9A: Verify active session, tenantId, role & CSRF token)
├ ƒ /api/auth/oidc                       (Existing: OAuth 2.0 / OIDC PKCE state + S256 challenge generator)
├ ƒ /api/auth/oidc/callback              (Existing: OIDC code exchange & session cookie issuance)
├ ƒ /api/auth/register                   (Existing: Tenant provisioning + scrypt password hashing)
├ ƒ /api/contact                         (Existing: Durable outbox + rate-limited lead dispatch)
├ ƒ /api/playground/evaluate             (Existing: Server-side Cedar AST & argument validator API)
├ ƒ /api/sbom/download                   (NEW — Route 11B: Serves signed CycloneDX 1.6 AI-BOM JSON)
├ ƒ /api/shadow-audit/analyze            (NEW — Route 11A: Evaluates uploaded/sample NHI & MCP manifest)
├ ○ /benchmarks                          (Existing: p50/p95/p99 latency & fail-closed chaos proof)
├ ○ /changelog                           (NEW — Route 8A: Gate G1–G4 release notes & SHA-256 artifact digests)
├ ○ /compare                             (NEW — Route 3: Head-to-head vs. Aembit, Clutch, Token & DIY)
├ ƒ /console                             (NEW — Route 4: Authenticated SaaS Control Plane & Operator Hub)
├ ○ /contact                             (Existing: Enterprise engineering & pilot scheduling)
├ ○ /docs                                (Existing: Technical reference & OAuth 2.1 sequence diagrams)
├ ○ /integrations                        (NEW — Route 1: 24-Connector Ecosystem & MCP Enforcement Catalog)
├ ○ /platform                            (NEW — Route 2: 4-Pillar Deep-Dive Architecture Showcase)
├ ○ /playground                          (Existing: Zero-install Cedar & MCP attack sandbox)
├ ○ /pricing                             (Existing: $0-Discovery guarantee & 4-tier commercial matrix)
├ ○ /privacy                             (Existing: GDPR/CCPA & zero-secret privacy policy)
├ ○ /resources                           (NEW — Route 6: OWASP NHI Top 10, MCP Top 10 & RFC Playbooks)
├ ○ /robots.txt                          (NEW — Route 12B: Search crawler rules excluding /api & /console)
├ ○ /security                            (Existing: Security architecture overview)
├ ○ /shadow-audit                        (NEW — Route 7: Self-Serve 30-Minute Shadow-NHI & Blast-Radius Audit)
├ ○ /sign-in                             (Update: Redirects to /console on successful authentication)
├ ○ /sign-up                             (Update: Redirects to /console on successful workspace creation)
├ ○ /sitemap.xml                         (NEW — Route 12A: XML sitemap of all public routes)
├ ○ /solutions                           (Existing: Industry & persona use cases)
├ ○ /terms                               (Existing: Apache-2.0 & commercial terms of service)
└ ○ /trust                               (NEW — Route 5: SOC 2 / ISO 27001 / GDPR Trust Center & AI-BOM)
```

## 2. Global Navigation, Footer & Color-Gate Rules (Mandatory Prerequisite)

1. **Zero Hardcoded Hex Colors (`check_frontend_colors.py` Gate):**
   - Never write `#F8FAFC`, `#FFFFFF`, `#0F172A`, `#0284C7`, or `#4F46E5` inside any `.tsx`, `.ts`, or `.css` file under `apps/web/`.
   - Always use CSS variables (`var(--bg-canvas)`, `var(--bg-surface-1)`, `var(--bg-surface-2)`, `var(--border-subtle)`, `var(--border-strong)`, `var(--text-primary)`, `var(--text-secondary)`, `var(--text-muted)`, `var(--brand-cyan)`, `var(--brand-indigo)`, `var(--state-enforce)`, `var(--state-deny)`, `var(--state-observe)`) or `rgb(...)` / Tailwind utility classes.
2. **Update `apps/web/app/components/SiteShell.tsx` Navigation & Footer:**
   - **Top Navbar Links:** `Platform` (`/platform`), `Integrations` (`/integrations`), `Compare` (`/compare`), `Playground` (`/playground`), `Benchmarks` (`/benchmarks`), `Pricing` (`/pricing`), `Docs` (`/docs`), and `Trust` (`/trust`).
   - **Right Navbar Actions:** Theme switcher (`Light` / `Dark`), `30-Min Shadow Audit` (`/shadow-audit`), `Sign In` (`/sign-in`), and `Console` (`/console`).
   - **Footer Columns:** Link all 12 new routes (`Platform`, `Integrations`, `Compare`, `Shadow Audit`, `Resources`, `Trust Center`, `Changelog`, `About`, `Security`, `Privacy`, `Terms`).

## 3. Detailed Specification for Each of the 12 Missing Routes

### Route 1: `/integrations` — Connector & MCP Enforcement Catalog (`apps/web/app/integrations/page.tsx`)

Outshines [Token Security Integrations](https://www.token.security/), [Clutch Security's 100+ Integrations](https://www.clutch.security/knowledge-hub/platform-identity-lineage-non-human-identities), and [Aembit Integrations](https://aembit.io/glossary/workload-identity-management/) by clearly distinguishing **Passive Read-Only Discovery (`$0`)** from **Inline Pre-Execution Runtime Gating (`<5ms`)**.

- **Interactive Category Filter Bar & Search Input:**
  - Filter buttons: `All (24)`, `MCP & AI Agent Runtimes (6)`, `Cloud IAM & Kubernetes (5)`, `Code, Git & CI/CD (4)`, `Secret Vaults & Identity (5)`, `SIEM, SOAR & Ticketing (4)`.
  - Live search input filtering by connector name, protocol (`OAuth 2.1 CIMD`, `RFC 8693`, `SPIFFE/SPIRE`, `OCSF v1.3`, `gRPC ExtMCP`), or OWASP control.
- **24-Connector Grid Cards (Each Card Must Display):**
  1. **Connector Name & Category Icon**: e.g., `PostgreSQL MCP Server`, `Filesystem & Git MCP`, `LangChain / LangGraph Agents`, `Anthropic Claude MCP Client`, `OpenAI Agents SDK`, `Cursor / Windsurf IDE MCP`, `AWS IAM & STS`, `Kubernetes (EKS / GKE / AKS)`, `Google Cloud WIF`, `Microsoft Entra ID / Azure AD`, `GitHub Enterprise & CODEOWNERS`, `GitLab CI/CD`, `GitHub Actions OIDC`, `Terraform / OpenTofu State`, `OpenBao (MPL-2.0 Dynamic Broker)`, `HashiCorp Vault Enterprise`, `AWS Secrets Manager`, `SPIFFE / SPIRE Workload Attestation`, `Okta Workforce & OIDC`, `SpiceDB Delegation Graph`, `Splunk HEC (OCSF / CEF)`, `Datadog Cloud SIEM`, `CrowdStrike Falcon SOAR`, `Slack Block Kit & Jira REST v3`.
  2. **Mode Badge**: `● INLINE ENFORCEMENT (<5ms)` (`var(--state-enforce)`) or `◎ READ-ONLY DISCOVERY ($0)` (`var(--brand-cyan)`).
  3. **Zero-Secret Guarantee Pill**: Shows how credentials are handled (`HMAC-SHA256 Fingerprinted Only` or `Ephemeral OpenBao Lease <= 300s`).
  4. **Interactive Config Preview Modal/Drawer**: Clicking any card opens its copyable YAML/TOML configuration snippet (e.g., `agentgateway.yaml` route snippet or `connectors/Cargo.toml` read-only IAM policy).

### Route 2: `/platform` — 4-Pillar Deep-Dive Architecture (`apps/web/app/platform/page.tsx`)

Outshines [Token Security Product](https://www.token.security/product), [Aembit IAM for Workloads](https://aembit.io/iam-for-workloads/), and [Clutch Security Discovery](https://www.clutch.security/nhi/discovery) by presenting an interactive architectural walkthrough of Axiom's four defensible moats.

- **Section 1 — Interactive 6-Stage Request Lifecycle Stepper:**
  - Users click through the 6 inline stages of an MCP `tools/call` request:
    1. `Stage 1: OAuth 2.1 + CIMD + RFC 8707 Audience Verification` (`identity/`)
    2. `Stage 2: Pre-Identity & Post-Identity ArcSwap Kill-Switch Check` (`observability/kill-switch/`)
    3. `Stage 3: Deterministic AST Argument Validation (SQL, Path, DNS-Pinned Egress, JCS Tool Pin, Intent Alignment)` (`validators/`)
    4. `Stage 4: Lock-Free Cedar Policy Evaluation (< 0.8ms p50)` (`services/extmcp/cedar/`)
    5. `Stage 5: SPIFFE-Attested OpenBao Ephemeral Credential Injection & RFC 8693 Token Exchange` (`secretless/`)
    6. `Stage 6: Pre-Redacted, SHA-256 Hash-Chained Audit Emission (fsync + OCSF)` (`observability/audit/`)
- **Section 2 — Deep-Dive Cards for the 4 Master Plan Pillars:**
  - **Pillar 1: Dual-Graph Architecture (`lineage-graph/` + `fleet-control/`)**: Explains why Axiom separates **PostgreSQL 16 Static Dependency Lineage** (*"Which production workloads break if this secret is revoked?"* via `v_shared_credential_siblings` and `simulate_revocation`) from **SpiceDB Real-Time Delegation** (*"Who owns this agent and can it invoke this tool right now?"*), keeping Postgres off the `<5ms` hot path via `ContextSync` gRPC (`proto/context_sync.proto`).
  - **Pillar 2: Argument-Level Runtime Gating (`validators/`)**: Interactive side-by-side comparison showing how broad OAuth scopes (`db:write`) allow `DROP TABLE users`, whereas Axiom's `sqlparser` AST classifier blocks destructive DDL while permitting `SELECT`.
  - **Pillar 3: Atomic Single-Use Approvals & Causal Revocation (`approvals/` + `observability/kill-switch/`)**: Visualizes `sha256(agent_id | target | tool | canonical_args)` payload binding and `InFlightCancellationRegistry` token aborting.
  - **Pillar 4: Safety-First Open-Core (`Apache-2.0`)**: Shows the exact boundary between the free Community runtime and commercial fleet tiers.

### Route 3: `/compare` — Head-to-Head Competitor Comparison Hub (`apps/web/app/compare/page.tsx`)

Captures high-intent evaluation searches similar to [Aembit vs. Google Cloud WIF](https://aembit.io/vendor/aembit-vs-google-cloud-workload-identity-federation/), [Aembit vs. DIY](https://aembit.io/blog/aembit-vs-diy-workload-identity-and-access-what-breaks-at-scale/), and [Opal vs. Clutch Security](https://www.opal.dev/compare/opal-vs-clutch).

- **Interactive Competitor Selector Tabs:**
  1. `Axiom NHI vs. Aembit`
  2. `Axiom NHI vs. Clutch Security`
  3. `Axiom NHI vs. Token Security`
  4. `Axiom NHI vs. Cyera (Oasis) / Cisco (Astrix) / SailPoint (Entro)`
  5. `Axiom NHI vs. DIY Envoy / Custom Proxy`
- **Detailed Feature-by-Feature Comparison Matrix Table (12 Rows):**
  - Compares: `Inline MCP Argument AST Validation (SQL/Path/SSRF)`, `JCS SHA-256 Tool-Definition Rug-Pull Pinning`, `Dual-Graph Architecture (Postgres Blast Radius + SpiceDB Causal Delegation)`, `Pre-Revocation Shared-Credential Sibling Simulation`, `SPIFFE + Binary SHA-256 Air-Gapped Workload Attestation`, `Atomic Payload-Hashed Human Approvals`, `Sub-50ms Kill Switch with In-Flight Cancellation`, `Open-Core Apache-2.0 Self-Hosted Runtime`, `Customer-VPC Air-Gapped Helm Deployment`, and `Pricing for Passive Discovery ($0 Forever vs. Per-NHI Tax)`.
- **Interactive "Why Post-Hoc Posture Fails" Timeline:** Contrasts a 45-minute cloud-log polling delay (where an AI agent drops a table at `T+0.2s` and the posture alert arrives at `T+45m`) against Axiom NHI blocking the call at `T+0.0014s` before the database ever sees the query.

### Route 4: `/console` — Authenticated Enterprise Control Plane (`apps/web/app/console/page.tsx` & `apps/web/middleware.ts`)

Solves the critical UX gap where users signing in at `/sign-in` or registering at `/sign-up` had no authenticated dashboard inside `apps/web`.

- **Next.js Route Protection (`apps/web/middleware.ts`):**
  - Inspects `req.cookies.get("axiom_session")` on `/console/:path*`.
  - If absent and `?demo=true` is not explicitly passed, redirects to `/sign-in?next=/console`.
- **Authenticated Top Operator Bar:**
  - Calls `GET /api/auth/me` on mount to display the verified operator email, `tenantId` badge, RBAC `role` (`security-admin`, `policy-admin`, `operator`, `auditor`), `Sign Out` button (`POST /api/auth/logout`), and a clearly labeled `Preview Demo Workspace` toggle when in evaluation mode.
- **6 Interactive Control-Plane Modules (Tabbed Workspace):**
  1. **Live MCP Traffic & Inspector**: Streams and filters audit decisions (`ALLOW`, `DENY`, `WOULD_DENY`), displays `prev_hash -> entry_hash` chain integrity, and opens the `460px` call inspector with zero-secret `vault://openbao/...` pills.
  2. **Dual-Graph Lineage & Pre-Revocation Simulator**: Interactive SVG Dual-Graph showing `HUMAN_OWNER` → `AI_AGENT` → `SHARED_CREDENTIAL` → `PRODUCTION_DB` with a **Simulate Revocation** button that highlights impacted sibling workloads (`v_shared_credential_siblings`) and recommends `OpenBao Dual-Secret Rotation`.
  3. **Cedar Policy Studio**: Live policy editor + MCP `tools/call` envelope dry-run runner wired to `POST /api/playground/evaluate` with instant `observe-only` vs. `enforce` route toggles.
  4. **OpenBao Secretless & Zero-Downtime Rotation**: Displays SPIFFE-attested active leases and triggers the 4-stage `ZeroDowntimeRotationJob` state machine (`DualSecretProvisioned` → `ConsumerReloadHeartbeats` → `GraceWindowVerified` → `LegacyCredentialRevoked`).
  5. **OWASP NHI Top 10 & MCP Top 10 Scorecard + Playbooks**: Displays all 20 deterministic controls (`NHI1`–`NHI10`, `MCP01`–`MCP10`) and one-click **Automated Remediation Playbooks** (`quarantine-anomalous-agent`, `auto-rotate-compromised-secret`, `sever-spicedb-delegation-chain`).
  6. **Emergency Kill Switch**: Two-step arm-and-confirm revocation control with target selector (`agent_id`, `session_id`, `tool_id`, `global`) and audit reason input.

### Route 5: `/trust` — Live Trust, Compliance & Signed AI-BOM Portal (`apps/web/app/trust/page.tsx`)

Counters [Clutch Security's SOC 2 / ISO 27001 & Zero-Knowledge positioning](https://www.clutch.security/knowledge-hub/platform-identity-lineage-non-human-identities) with transparent, verifiable cryptographic evidence.

- **Compliance Framework Cards & Control Matrix:**
  - Interactive filterable matrix mapping Axiom NHI's technical controls to **SOC 2 Type II (`CC6.1`, `CC6.2`, `CC6.6`, `CC7.2`, `CC7.3`, `CC8.1`)**, **ISO/IEC 27001:2022 (`A.5.15`, `A.8.2`, `A.8.15`, `A.8.24`)**, **GDPR / CCPA Data Residency**, and **EU AI Act Runtime Auditability**.
- **Downloadable Ed25519-Signed CycloneDX 1.6 AI-BOM Card:**
  - Displays the live component manifest (`axiom-extmcp-runtime`, `@axiom/gateway-ui`, `cedar-policy`, `sqlparser`), SHA-256 lockfile digests, and Ed25519 signature metadata, with a **Download Signed CycloneDX 1.6 SBOM (`JSON`)** button wired to `GET /api/sbom/download`.
- **Interactive Zero-Secret Redaction Verifier:**
  - Lets security auditors paste a sample log string containing canary AWS keys (`AKIA...`), GitHub PATs (`ghp_...`), Slack tokens (`xoxb-...`), or Bearer JWTs and see Axiom's pre-enqueue redactor scrub them to `[REDACTED_BY_AXIOM_ZERO_SECRET_GUARD]` in real time.

### Route 6: `/resources` — Technical Research, OWASP Guides & Playbooks (`apps/web/app/resources/page.tsx`)

Matches [Aembit Resource Hub](https://aembit.io/resource-hub/), [Token Security Guides](https://www.token.security/guides), and [Clutch Knowledge Hub](https://www.clutch.security/knowledge-hub/solution-lifecycle-management-non-human-identities).

- **Filterable Engineering Playbooks & Reference Guides (With Full In-Page Reader Drawer/Tabs):**
  1. *The Definitive Guide to OWASP NHI Top 10 (2025/2026) & Inline Cedar Remediation*
  2. *Securing Model Context Protocol (MCP) Servers Against Tool Poisoning, Rug Pulls & Prompt Injection (`OWASP MCP01–MCP10`)*
  3. *Implementing MCP OAuth 2.1: Client ID Metadata Documents (`CIMD`) & `RFC 8707` Resource Indicators*
  4. *Multi-Hop AI Agent Delegation with `IETF RFC 8693` Token Exchange & `SpiceDB` Causal Revocation*
  5. *Deploying Air-Gapped NHI Governance in Regulated Customer VPCs with Helm & `OpenBao`*
  6. *30-Day Design Partner Pilot Playbook: From `observe-only` Shadow Mode to `enforce` Guardrails*

### Route 7: `/shadow-audit` — 30-Minute Self-Serve Shadow-NHI & Blast-Radius Audit (`apps/web/app/shadow-audit/page.tsx`)

Operationalizes the Master Plan's **Gate G2 30-Minute Shadow Audit** onboarding wedge directly in the browser.

- **Interactive Input Modes:**
  - **Mode A: Load Preset Enterprise Scenario** (`FinTech Kubernetes + AWS IAM + 42 MCP Agents`, `Healthcare Air-Gapped Enclave`, or `SaaS CI/CD Sprawl`).
  - **Mode B: Paste Redacted IAM / K8s / MCP JSON Manifest** (validated by client + server zero-secret guard so raw keys are rejected).
- **Live Server Evaluation (`POST /api/shadow-audit/analyze`):**
  - Submits the manifest to `/api/shadow-audit/analyze` and renders:
    1. **Executive Posture Scorecard**: Total Discovered NHIs (`$0` discovery cost), Unowned Shadow NHIs (`owner_confidence < 0.50`), Shared-Credential Sibling Groups (`v_shared_credential_siblings`), and Overall Posture Score (`0–100`).
    2. **Prioritized Blast-Radius Findings Table**: Ranks identities by composite exposure score with exact `OWASP NHI1–NHI10` and `MCP01–MCP10` flags.
    3. **Generated Cedar Policy & OpenBao Remediation Bundle**: One-click copyable `.cedar` policy rules to close every discovered gap.

### Route 8: `/changelog` & `/about` (`apps/web/app/changelog/page.tsx` & `apps/web/app/about/page.tsx`)

- **`/changelog` (`apps/web/app/changelog/page.tsx`):**
  - Chronological engineering release log covering `v1.0.0` (**Gate G4 Fleet Governance & Full Audit Hardening**), `v0.9.0` (**Gate G3 OpenBao Secretless Broker, RFC 8693 & Atomic Approvals**), `v0.6.0` (**Gate G2 Postgres 16 Lineage Graph, CODEOWNERS Attribution & OWASP Engine**), and `v0.3.0` (**Gate G1 `agentgateway` + `ExtMCP` + `Cedar` `<5ms` Runtime Wedge**), complete with git commit references, test counts, and benchmark metrics.
- **`/about` (`apps/web/app/about/page.tsx`):**
  - Explains Axiom NHI's founding thesis (*"Discover every identity. Understand every relationship. Govern every action."*), the **Safety-First Open-Core (`Apache-2.0`)** pledge, architectural principles, and direct engineering contact channels.

### Routes 9 & 10: Session Introspection & Logout APIs (`apps/web/app/api/auth/me/route.ts` & `apps/web/app/api/auth/logout/route.ts`) + Auth Redirect Update

- **`GET /api/auth/me` (`apps/web/app/api/auth/me/route.ts`):**
  - Reads the `axiom_session` cookie, looks up the session in `sessionsById` (and checks expiration), and returns `{ authenticated: true, userId, tenantId, email, name, role, csrfToken }` or `{ authenticated: false }` with status `401`.
- **`POST /api/auth/logout` (`apps/web/app/api/auth/logout/route.ts`):**
  - Deletes the session from `sessionsById`, clears the `axiom_session` cookie (`maxAge: 0`), and returns `{ ok: true, loggedOut: true }`.
- **Update `/sign-in` and `/sign-up` (`apps/web/app/sign-in/page.tsx`, `apps/web/app/sign-up/page.tsx`):**
  - On successful login or registration, provide an immediate link/redirect (`router.push("/console")`) into the new `/console` workspace.

### Route 11: Shadow Audit Analyzer & Signed SBOM Download APIs (`apps/web/app/api/shadow-audit/analyze/route.ts` & `apps/web/app/api/sbom/download/route.ts`)

- **`POST /api/shadow-audit/analyze` (`apps/web/app/api/shadow-audit/analyze/route.ts`):**
  - Enforces a 64 KiB body cap and rejects any payload containing raw secrets (`AKIA...`, `ghp_...`, `xoxb-...`).
  - Evaluates the submitted entities and edges to compute `owner_confidence` (`CIMD 0.95`, `CODEOWNERS 0.85`, `IAM Tag 0.80`, `Unowned < 0.50`), identifies shared-credential sibling clusters, maps violations to `NHI1:2025`–`NHI10:2025` and `MCP01:2025`–`MCP10:2025`, and returns a structured JSON audit report plus tailored Cedar policy recommendations.
- **`GET /api/sbom/download` (`apps/web/app/api/sbom/download/route.ts`):**
  - Reads `docs/security/compliance/axiom-nhi-cyclonedx-1.6.sbom.json` (or generates the deterministic signed CycloneDX 1.6 manifest) and returns it with `Content-Disposition: attachment; filename="axiom-nhi-cyclonedx-1.6.sbom.json"`.

### Route 12: SEO Metadata Routes (`apps/web/app/sitemap.ts` & `apps/web/app/robots.ts`)

- **`apps/web/app/sitemap.ts`:** Exports Next.js `MetadataRoute.Sitemap` listing `/`, `/platform`, `/integrations`, `/compare`, `/shadow-audit`, `/playground`, `/benchmarks`, `/pricing`, `/resources`, `/docs`, `/trust`, `/security`, `/solutions`, `/changelog`, `/about`, `/contact`, `/privacy`, and `/terms`.
- **`apps/web/app/robots.ts`:** Exports Next.js `MetadataRoute.Robots` allowing `/` and disallowing `/api/` and `/console/` with `sitemap: "https://axiomnhi.dev/sitemap.xml"`.

## 4. Verification Commands Your AI Agent Must Run & Pass

After creating all 12 routes and updating `SiteShell.tsx`, `sign-in/page.tsx`, and `sign-up/page.tsx`, your AI agent must run and paste the output of these commands:

```bash
# 1. Verify zero hardcoded hex colors (#RRGGBB) or pure black (#000000) across all new route files
python3 docs/architecture/scripts/check_frontend_colors.py

# 2. Verify all 32 Light & Dark WCAG 2.1 AA contrast pairs
python3 docs/architecture/scripts/check_design_tokens.py

# 3. Run strict TypeScript typechecking and ESLint across all workspaces
pnpm --filter @axiom/web typecheck
pnpm --filter @axiom/web lint

# 4. Run Next.js production build and verify all 33 routes compile cleanly
pnpm --filter @axiom/web build

# 5. Verify initial JS bundle budgets (< 180 KiB gzip) and secret/SAST scan
python3 docs/architecture/scripts/check_frontend_budgets.py
python3 scripts/scan_secrets_and_sast.py
```
