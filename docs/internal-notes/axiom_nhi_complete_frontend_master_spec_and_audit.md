# Axiom NHI — Complete Frontend Architecture, Enterprise Light-Theme Design System & Zero-Trust Audit Specification

**Target Repository:** `c:\Users\Lenovo\Desktop\Axiom` (`GurnoorBagga17/New`)  
**Covered Frontend Surfaces:** Public Web & Interactive Sandbox (`apps/web`), Embedded Community Runtime Console (`apps/gateway-ui`), Enterprise Multi-Cluster Control Plane (`apps/console`), Shared UI Primitives (`packages/ui`), Cedar Policy Studio (`packages/cedar-editor`), and Design Token Pipeline (`tokens.json`)  
**Primary Aesthetic Mandate:** **Enterprise Light-First Tactical Precision** (`#F8FAFC` Alabaster Canvas, `#FFFFFF` Elevated Cards, `#0F172A` Slate Ink, `#0284C7` Cyan-Blue, `#4F46E5` Indigo) with `prefers-color-scheme` and Dark-Mode (`#090B10`) toggle support, outshining [Aembit](https://aembit.io/), [Clutch Security](https://clutch.security/), and [Token Security](https://www.token.security/).

## 1. Zero-Trust Frontend Forensic Rules for the AI Coding Agent

Before claiming any frontend surface is complete, you **MUST** inspect every `.tsx`, `.ts`, and `.css` file across `apps/web`, `apps/gateway-ui`, `apps/console`, `packages/ui`, and `packages/cedar-editor` and eliminate these seven anti-patterns:

1. **Zero Simulated Authentication (`AX-003`):** `apps/web/app/sign-in/page.tsx` and `apps/web/app/sign-up/page.tsx` must **never** use `setTimeout`, fake success banners, or `localhost:5173` redirects. Every login, registration, and OIDC button must execute a real `fetch` against `/api/auth/login`, `/api/auth/register`, and `/api/auth/oidc` (plus `/api/auth/oidc/callback`) backed by persistent database storage (`sqlx`/Postgres or SQLite dev store), `scrypt` password hashing, `HttpOnly; Secure; SameSite=Strict` session cookies, and CSRF tokens.
2. **Zero Synthetic Telemetry Disguised as Live (`AX-004`):** `apps/gateway-ui/src/modules/traffic/stores/trafficStore.ts` and `useSSEConnection.ts` must **never** initialize with `SEED_EVENTS` in the live buffer or set `state: 'connected'` inside `EventSource.onerror`. The store must track `source: 'live' | 'replay' | 'synthetic' | 'offline'` and transition to `'disconnected'` on stream loss.
3. **Zero Unwired Console Tabs (`AX-017`):** Every module in `apps/gateway-ui` (`Live MCP Stream`, `Cedar Studio`, `Audit Logs`, `Kill Switch`) and `apps/console` (`Fleet Workloads`, `Dual-Graph Lineage`, `OWASP NHI & MCP Scorecard`, `OpenBao Secretless Leases`, `Atomic Approvals`, `Anomaly Playbooks`, `$0-Discovery Metering`) must fetch and mutate real backend endpoints with server-enforced RBAC (`X-Axiom-Role` / session cookie), loading skeletons, empty states, and error recovery banners—never hardcoded static arrays at the top of `App.tsx`.
4. **Zero Uncaught View Crashes (`Section 3.1`):** Every critical panel (`TrafficTable`, `InspectorDrawer`, `PolicyStudioPage`, `CedarEditor`, `AuditExplorer`, and `KillSwitchPanel`) must be wrapped in an isolated React `ViewErrorBoundary` (`apps/gateway-ui/src/components/ErrorBoundary.tsx`) with a one-click view recovery button.
5. **Zero Bundle Bloat (`Section 3.2`):** Initial JavaScript bundles must stay strictly below **`180 KiB` gzip** for `apps/web` and **`450 KiB` gzip** for `apps/gateway-ui` (`python3 docs/architecture/scripts/check_frontend_budgets.py`), and the lazy Cedar policy editor chunk in `packages/cedar-editor` must remain **`< 25 KiB` gzip** with zero external CDN requests (`check_gateway_ui_offline.py`).
6. **Zero Ignored Build Errors or Hardcoded Hex Leaks (`AX-025` & `Section 3.3`):** `apps/web/next.config.ts` must keep `typescript: { ignoreBuildErrors: false }`. All styling in `apps/` and `packages/` must consume CSS custom properties compiled from `tokens.json` so `python3 docs/architecture/scripts/check_frontend_colors.py` passes with **0 hardcoded hex literals and 0 pure black (`#000000`) values**.
7. **Zero Raw Secrets in Browser Memory:** Audit SSE streams (`useSSEConnection.ts`), CSV/NDJSON exports (`exportAuditEvents.ts`), and dry-run envelopes (`PolicyStudioPage.tsx`) must reject any payload matching `docs/api-contracts/secret-patterns.json` before rendering or storing in memory, displaying only redacted zero-secret metadata pills (`vault://openbao/prod-db • TTL 4m 00s • Attested SPIFFE`).

## 2. Monorepo Frontend Topology & Package Boundaries

| Workspace Path | Package Name | License | Deployment Target | Core Engineering Responsibility |
| :--- | :--- | :--- | :--- | :--- |
| `tokens.json` & `docs/architecture/token-build/` | `@axiom/tokens` | Apache-2.0 | Build-time CSS generator | Compiles semantic Light & Dark CSS custom properties (`tokens.css`) and Tailwind v4 theme variables (`tailwind-theme.css`) verified against 32 WCAG 2.1 AA contrast pairs. |
| `packages/ui/` | `@axiom/ui` | Apache-2.0 | Shared workspace library | Accessible status badges (`ALLOW`, `DENY`, `OBSERVE`, `REVOKED`, `PENDING`), `SecretLeasePill`, `CmdKPalette`, slide-over drawers, and two-step radial hold controls. |
| `packages/cedar-editor/` | `@axiom/cedar-editor` | Apache-2.0 | Shared workspace library | Cedar policy studio components (`CedarEditor`, `GuidedPolicyForm`, `DryRunPanel`, `ActivationPanel`, `RouteModePanel`) and same-origin `/v1/local/policies/*` adapter (`createBackendDryRunAdapter`). |
| `apps/gateway-ui/` | `@axiom/gateway-ui` | Apache-2.0 | Embedded same-origin SPA (`127.0.0.1:8080`) | Standalone air-gapped operator console served by `gateway/local-admin-api/server.cjs` with zero external network calls (`default-src 'self'`). |
| `apps/web/` | `@axiom/web` | Proprietary | Next.js App Router (`SSR/SSG`) | Public acquisition funnel (`/`), `/playground`, `/benchmarks`, `/docs`, `/sign-in`, `/sign-up`, and backend API routes (`/api/auth/*`, `/api/contact`). |
| `apps/console/` | `@axiom/console` | Proprietary | Multi-tenant SaaS & Customer-VPC Helm | Enterprise Phase 2–4 Control Plane: Dual-Graph Explorer (Postgres + SpiceDB), OWASP NHI/MCP Scorecard, OpenBao Rotation Studio, Atomic Approval Inbox, and Fleet Metering. |

## 3. Enterprise Light-Theme Design System & Token Specification (`tokens.json`)

Unlike legacy cybersecurity sites that lock users into low-contrast dark themes, Axiom NHI defaults to an **Architectural Enterprise Light Theme** inspired by [Aembit](https://aembit.io/) and [Clutch Security](https://clutch.security/), with a header theme selector (`Light` / `Dark` / `System` via `prefers-color-scheme`).

### 3.1 Structural Surface, Ink & Border Tokens

| Token Variable | Light Mode Value (Default) | Dark Mode Value (`[data-theme="dark"]`) | Contrast Ratio & UI Role |
| :--- | :--- | :--- | :--- |
| `--bg-canvas` | `rgb(248, 250, 252)` (`#F8FAFC`) | `rgb(9, 11, 16)` (`#090B10`) | Application backdrop and page canvas |
| `--bg-surface-1` | `rgb(255, 255, 255)` (`#FFFFFF`) | `rgb(14, 18, 27)` (`#0E121B`) | Primary cards, sticky navbar, sidebar, and table containers |
| `--bg-surface-2` | `rgb(241, 245, 249)` (`#F1F5F9`) | `rgb(20, 25, 38)` (`#141926`) | Input fields, code blocks, inspector drawers, and secondary pills |
| `--bg-surface-3` | `rgb(226, 232, 240)` (`#E2E8F0`) | `rgb(28, 35, 51)` (`#1C2333`) | Row hover states, active tabs, and `⌘K` command palette selection |
| `--border-subtle` | `rgb(203, 213, 225)` (`#CBD5E1`) | `rgb(30, 38, 56)` (`#1E2638`) | Crisp `1px` structural card and table cell dividers |
| `--border-strong` | `rgb(100, 116, 139)` (`#64748B`) | `rgb(107, 122, 153)` (`#6B7A99`) | Active focus rings, selected rows, and interactive borders (`>= 3.29:1`) |
| `--text-primary` | `rgb(15, 23, 42)` (`#0F172A`) | `rgb(243, 246, 252)` (`#F3F6FC`) | Headlines, identity names, and KPI figures (`17.06:1` light / `18.18:1` dark) |
| `--text-secondary` | `rgb(51, 65, 85)` (`#334155`) | `rgb(154, 166, 191)` (`#9AA6BF`) | Body copy, table descriptions, and form labels (`9.22:1` light / `8.04:1` dark) |
| `--text-muted` | `rgb(71, 85, 105)` (`#475569`) | `rgb(132, 146, 174)` (`#8492AE`) | Captions, axis ticks, and overlines (`6.16:1` light / `6.20:1` dark) |

### 3.2 Semantic Security Verdict & Brand Accent Tokens

Every security verdict badge must pair its semantic color with a distinct geometric icon and uppercase monospace label so status is never conveyed by color alone:

| Semantic State | Token Variable | Light Mode Foreground / Tint | Icon & Uppercase Label | Functional Meaning |
| :--- | :--- | :--- | :--- | :--- |
| **Allow / Enforced** | `--state-enforce` | `rgb(5, 150, 105)` (`#059669`) / `rgba(5, 150, 105, 0.10)` | `✓ ALLOW` / `● ENFORCE` | Cedar policy and AST validators permitted the MCP tool call |
| **Observe / Shadow** | `--state-observe` | `rgb(217, 119, 6)` (`#D97706`) / `rgba(217, 119, 6, 0.12)` | `◎ OBSERVE` / `WOULD_DENY` | Shadow mode logged a policy violation without blocking execution |
| **Deny / Blocked** | `--state-deny` | `rgb(220, 38, 38)` (`#DC2626`) / `rgba(220, 38, 38, 0.10)` | `✕ DENY` / `BLOCKED` | Inline AST validator or Cedar policy blocked the call before execution |
| **Revoked / Kill Switch** | `--state-revoked` | `rgb(185, 28, 28)` (`#B91C1C`) / `rgba(185, 28, 28, 0.14)` | `⏻ REVOKED` | Session or delegation chain severed via Emergency Kill Switch |
| **Brand Cyan-Blue** | `--brand-cyan` | `rgb(2, 132, 199)` (`#0284C7`) | Primary interactive accent | Primary CTAs, active runtime intercept beams, and verified identity links |
| **Brand Indigo** | `--brand-indigo` | `rgb(79, 70, 229)` (`#4F46E5`) | Lineage & SpiceDB accent | Dual-Graph ownership edges, OAuth 2.1 CIMD badges, and RFC 8693 hops |

### 3.3 Typography, Tabular Numerals & Motion Physics

1. **Bundled Local Variable Fonts (Zero Google Fonts CDN Calls):**
   - **Display Headlines (`--font-display`)**: `@fontsource-variable/space-grotesk` (`600`, `700`, tracking `-0.03em`).
   - **UI & Data Tables (`--font-sans`)**: `@fontsource-variable/inter` (`400`, `500`, `600`, `font-feature-settings: "cv02", "cv03", "cv04", "cv11"`).
   - **Cedar Policies, Hashes & Telemetry (`--font-mono`)**: `@fontsource-variable/jetbrains-mono` (`400`, `500`, `font-variant-numeric: tabular-nums` so latency counters like `1.45 ms` and `$0.00` never jitter horizontally).
2. **GPU-Composited Motion Rules (`motion/react`):**
   - Wrap every application root in `<MotionConfig reducedMotion="user">`.
   - Animate **only** `transform` and `opacity` (never `width`, `height`, `top`, or `left`).
   - Use `SPRING_TACTILE` (`stiffness: 480, damping: 34, mass: 0.8`) for mode switches and `SPRING_DRAWER` (`stiffness: 360, damping: 36, mass: 1.0`) for the `460px` inspector drawer and `⌘K` palette.

## 4. Surface-by-Surface Component & Backend Wiring Blueprint

### 4.1 Surface 1: Public Acquisition Funnel & Sandbox (`apps/web`)

| Route & Component File | Required Interactive Behavior & Visual Polish | Backend / Evaluator Wiring |
| :--- | :--- | :--- |
| **`/` — Hero & 30° Isometric 3D Glass Enclave (`EnclaveVisual.tsx`)** | Renders the mathematical 30° isometric projection (`P(u, v, z)`) of the frosted crystal-white/cyan enclave with three laser-etched gates (**OAuth 2.1 CIMD + RFC 8707**, **Cedar + AST Argument Gate**, **OpenBao Ephemeral Broker**) and an extruded 3D crimson hexagonal shield (`#DC2626`). Includes 4 clickable scenario buttons (`SQL DROP Attack`, `Read-Only SELECT`, `Path Traversal`, `Causal Kill Switch`) that animate the packet beam and shield deflection in real time. | Driven by deterministic state transitions synced with the live policy trace cards. |
| **`/` — Split Terminal & Policy Trace Simulator (`TerminalSimulator.tsx`)** | Left pane shows an AI agent sending JSON-RPC `tools/call` payloads; right pane shows step-by-step evaluation (`CIMD Verified`, `RFC 8707 Match`, `Tool Pin SHA-256`, `SQL AST Check`, `Cedar Verdict`, and measured latency). | Evaluates payloads against the shared Cedar/AST evaluator logic. |
| **`/` — Architectural Mode Switcher & Dual-Graph Preview (`ThesisSwitcher.tsx`, `SaaSEcosystemPillars.tsx`)** | Interactive toggle comparing **Legacy Posture Tools** (post-hoc alert fatigue after secret leakage) vs. **Axiom Inline Runtime Gating** (pre-execution block + zero-secret OpenBao injection), paired with a CISO vs. Platform Engineer persona switcher. | Interactive state with SVG Dual-Graph node highlighting (`What-If Revoke` toggle). |
| **`/` — Transparent `$0`-Discovery Metering Calculator (`MeteringCalculator.tsx`)** | Dual-slider calculator (`Discovered NHIs: 0–50,000` always billed at **`$0.00`**; `Actively Governed NHIs & Agents` metered transparently across Community, Essentials, Enterprise, and Ultimate tiers). | Reconciles with the commercial pricing model in `fleet-control/src/lib.rs`. |
| **`/` — Lead Capture & Shadow Audit Form (`TalkToEngineerSection.tsx` & `/api/contact/route.ts`)** | Collects work email, infrastructure stack, and agent fleet size with `CookieConsent.tsx` (`SameSite=Lax; Secure`). | `POST /api/contact` enforces `Content-Type: application/json`, 8 KiB body cap, RFC 5322 email regex, per-IP rate limiting (`429`), `crypto.randomUUID()` ticket IDs, and durable outbox persistence before Resend/Slack webhook dispatch. |
| **`/playground` — Zero-Install Cedar & MCP Sandbox (`app/playground/page.tsx`)** | Full-screen policy authoring and adversarial attack testing sandbox where users edit Cedar policies and test SQLi, path traversal, and SSRF payloads. | Uses `@axiom/cedar-editor` (`analyzeCedarText` + deterministic evaluator). |
| **`/benchmarks` — Reproducible Latency & Fail-Closed Proof Hub (`app/benchmarks/page.tsx`)** | Displays verified `p50` (`0.31ms`), `p95` (`0.82ms`), and `p99` (`1.45ms`) evaluation histograms and `docker pause` fail-closed chaos timelines. | Reads directly from the verified metrics generated by `tests/performance/benchmark_scale_and_ui.py` (`docs/architecture/benchmark-results.json`). |
| **`/docs` — Technical Documentation (`app/docs/page.tsx`)** | Interactive MCP OAuth 2.1 (`CIMD` + `RFC 8707`) sequence diagram, copyable `agentgateway.yaml` config, and OWASP NHI Top 10 / MCP Top 10 reference tables. | Static prerendered MDX/React documentation. |
| **`/sign-in` & `/sign-up` — Server-Verified Auth (`app/sign-in/page.tsx`, `app/sign-up/page.tsx`)** | Work email + password (12+ chars) login/registration forms and **Continue with Enterprise OIDC (PKCE)** button. | Wired to `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/oidc`, and `GET /api/auth/oidc/callback` with `scrypt` password hashing, session rotation, and `HttpOnly; Secure; SameSite=Strict` cookies. |

### 4.2 Surface 2: Embedded Community Runtime Console (`apps/gateway-ui` at `127.0.0.1:8080`)

| Module & File Path | Required UI/UX & Accessibility Behavior | Live Backend Endpoint & Contract |
| :--- | :--- | :--- |
| **App Shell & Top Status Bar (`src/App.tsx`, `src/components/ErrorBoundary.tsx`)** | Displays `Axiom NHI · Operator Console · Fail-Closed Armed`, `Theme` selector (`System` / `Light` / `Dark`), live SSE connection badge (`STREAM LIVE` only when `source === 'live'`), and the **Emergency Kill Switch** quick-jump button over a 2-column layout (`208px` left rail + main viewport). | Wraps every view in `ViewErrorBoundary`; syncs `document.documentElement.dataset.theme` with `prefers-color-scheme`. |
| **Module 1B: Live MCP Traffic Stream (`src/modules/traffic/components/TrafficStream.tsx`, `TrafficTable.tsx`, `InspectorDrawer.tsx`)** | Virtualized 5-column table (`@tanstack/react-virtual`) over a bounded 2,000-event Zustand ring buffer (`16ms` frame batching for `60 FPS` at `500+ events/sec`), hover-to-pause stream lock, secret-scrubber gate (`secretScrubber.ts`), and `460px` right slide-over **MCP Call Inspector** drawer. | Connects to same-origin `GET /v1/local/events/stream` (`EventSource`). Rejects any SSE event matching `secret-patterns.json` or failing `isAuditEvent` schema check. |
| **Module 1C: Visual Cedar Policy Studio (`src/modules/policy-studio/PolicyStudioPage.tsx`)** | Combines `GuidedPolicyForm` (SQL verb chips, allowed path prefixes, egress domains), `RouteModePanel` (`observe` vs. `enforce` per route), lightweight `<10 KiB` `CedarEditor` with line numbers and inline diagnostics, `DryRunPanel`, and `ActivationPanel`. | Calls `POST /v1/local/policies/dry-run` (validated by `assertDryRunResponse`) and `PUT /v1/local/policies/bundle` (with optimistic concurrency `expected_candidate_version`, validated by `assertActivationResponse`). |
| **Module 1D: Audit Explorer & Emergency Kill Switch (`src/modules/killswitch-audit/AuditExplorer.tsx` & `src/App.tsx`)** | Instant search across buffered events, formula-injection-safe CSV and NDJSON export (`exportAuditEvents.ts` rejecting `=`, `+`, `-`, `@` prefixes and secret patterns), and the **Two-Step Emergency Kill Switch** (`Step 1: Arm Kill Switch` → `Step 2: Confirm & Execute Revocation`). | Calls `POST /v1/local/sessions/:id/revoke` with `{ target_kind, reason, actor }`, displaying the returned `state_version`, `propagation_latency_ms`, and `entry_hash`. |

### 4.3 Surface 3: Enterprise Multi-Cluster Control Plane (`apps/console`)

Ensure `apps/console/src/App.tsx` connects its interactive views to the control-plane endpoints with zero hardcoded `AKIA...` or `ghp_...` strings:

1. **Dual-Graph Lineage & Pre-Revocation Blast-Radius Simulator:** Queries `GET /v1/lineage/graph` and `POST /v1/lineage/simulate-revoke` to highlight shared-credential sibling workloads (`v_shared_credential_siblings`) before an operator revokes or rotates a credential.
2. **OWASP NHI Top 10 (`NHI1`–`NHI10`) & MCP Top 10 (`MCP01`–`MCP10`) Scorecard:** Queries `GET /v1/owasp/scorecard` and `GET /v1/discovery/saas-oauth-sprawl` with one-click Cedar remediation templates.
3. **Air-Gapped SPIFFE-Attested OpenBao Secretless Broker & Dual-Secret Rotation Studio:** Queries `GET /v1/secretless/leases`, `GET /v1/secretless/multi-vault-posture`, `POST /v1/secretless/attest-and-lease`, and `POST /v1/secretless/rotate` to visualize the 4-stage zero-downtime rotation state machine (`DualSecretProvisioned` → `ConsumerReloadHeartbeats` → `GraceWindowVerified` → `LegacyCredentialRevoked`).
4. **Automated Anomaly Playbooks & Atomic Single-Use Approvals:** Queries `GET /v1/threat-detection/alerts`, `POST /v1/playbooks/execute`, and `POST /v1/approvals/:id/decide` (binding human approvals to `sha256(agent_id | target | tool | canonical_args)`).

## 5. Mandatory Frontend Verification & Exit Gates

Your AI coding agent must run and pass every command below with **zero errors and zero warnings** before completing any frontend task:

```bash
# 1. Regenerate CSS variables and Tailwind theme from tokens.json
npm --prefix docs/architecture/token-build run build

# 2. Verify all 32 Dark & Light WCAG 2.1 AA contrast pairs (>= 4.5:1 text, >= 3:1 borders)
python3 docs/architecture/scripts/check_design_tokens.py

# 3. Verify 0 hardcoded hex colors (#RRGGBB) or pure black (#000000) across all frontend source files
python3 docs/architecture/scripts/check_frontend_colors.py

# 4. Run strict TypeScript typechecking, ESLint 9, and Vitest unit suites across all workspaces
pnpm run typecheck
pnpm run lint
pnpm run test

# 5. Build production bundles and Storybook component catalogs
pnpm run build
pnpm --filter @axiom/ui run build-storybook
pnpm --filter @axiom/cedar-editor run build-storybook

# 6. Verify initial JS bundle budgets (< 180 KiB apps/web, < 450 KiB apps/gateway-ui) and air-gap isolation
python3 docs/architecture/scripts/check_frontend_workspace.py
python3 docs/architecture/scripts/check_frontend_budgets.py
python3 docs/architecture/scripts/check_gateway_ui_offline.py

# 7. Run secret/SAST scan and 60 FPS / 500+ events/sec scale benchmark
python3 scripts/scan_secrets_and_sast.py
python3 tests/performance/benchmark_scale_and_ui.py
```
