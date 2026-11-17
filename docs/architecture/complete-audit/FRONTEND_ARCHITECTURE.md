# Axiom NHI — Complete Frontend Architecture & Route Inventory

**Document:** `docs/architecture/complete-audit/FRONTEND_ARCHITECTURE.md`  
**Classification:** Deep-Dive Frontend Engineering Specification  
**Applications Covered:** `apps/web` (Next.js 15 App Router), `apps/gateway-ui` (Vite / React), `packages/ui`  

---

## 1. Frontend Architectural Overview

The Axiom NHI frontend architecture is organized around two complementary applications:
1. **Cloud Control Plane (`apps/web`):** Built on **Next.js 15.1** and **React 19**, utilizing the Next.js App Router, React Server Components (RSC), and Client Components (`"use client"`). It provides the primary public marketing ecosystem, an interactive attack simulation `/playground`, the live operator `/console`, and 12 enterprise SaaS routes.
2. **Operator Gateway UI (`apps/gateway-ui`):** A standalone **Vite 5 / React 18/19** single-page application built for air-gapped, on-premises, or local VPC operator consoles. It uses **Zustand** for state management and connects directly to the local ExtMCP runtime via Server-Sent Events (SSE).

### 1.1 Technology Stack & Tooling

| Layer | `apps/web` (Control Plane) | `apps/gateway-ui` (Operator UI) |
|---|---|---|
| **Framework** | Next.js 15.1.x | Vite 5.4.x + React 18/19 |
| **Language** | TypeScript 5.9.3 (Strict Mode) | TypeScript 5.9.3 (Strict Mode) |
| **Styling** | Tailwind CSS v4 + Design Tokens (`styles.css`) | Tailwind CSS v4 + `@axiom/ui` |
| **Icons** | Custom Inline SVG System (`Icons.tsx`), Lucide React | Custom SVG System (`components/Icons.tsx`) |
| **Animations** | CSS Keyframe Animations & Transitions | `motion/react` (Framer Motion) |
| **State Management** | React `useState`, `useEffect`, Server-Sent Events | Zustand (`trafficStore.ts`), React Context |
| **Data Fetching** | Native Fetch API + `EventSource` (SSE) | Native Fetch API + `useSSEConnection` hook |
| **Color & Theme System**| Zero `#hex` rule: 100% CSS variable design tokens | Pure CSS variable design tokens |

---

## 2. Design System & Theme Management

Both applications adhere strictly to the **Axiom Design Token Specification** defined in `apps/web/app/styles.css` and `docs/architecture/generated/tokens.css`.
Hardcoded `#hex` color values are strictly prohibited across all components and verified via automated linters.

### 2.1 Core CSS Variable Tokens

```css
:root {
  /* Surface & Background */
  --bg-primary: rgb(255, 255, 255);
  --bg-secondary: rgb(248, 250, 252);     /* Slate-50 */
  --bg-tertiary: rgb(241, 245, 249);      /* Slate-100 */
  --card-bg: rgb(255, 255, 255);
  --card-border: rgba(226, 232, 240, 0.8);/* Slate-200 */

  /* Text & Foreground */
  --text-primary: rgb(15, 23, 42);        /* Slate-900 */
  --text-secondary: rgb(71, 85, 105);     /* Slate-600 */
  --text-muted: rgb(148, 163, 184);       /* Slate-400 */
  --brand-primary: rgb(79, 70, 229);      /* Indigo-600 */

  /* Decision States (WCAG AAA Solid Variables) */
  --state-permit: rgb(22, 101, 52);       /* Green-800 */
  --state-permit-bg: rgb(240, 253, 244);   /* Green-50 */
  --state-deny: rgb(190, 18, 60);         /* Rose-700 */
  --state-deny-bg: rgb(255, 241, 242);     /* Rose-50 */
  --state-enforce: rgb(67, 56, 202);      /* Indigo-700 */
  --state-enforce-bg: rgb(238, 242, 255);  /* Indigo-50 */
}
```

---

## 3. Complete Route Inventory (`apps/web`)

The following table documents every page and API route discovered in `apps/web`:

| Route Path | Type | File Location | Purpose | Key Components | Auth Required | Status |
|---|---|---|---|---|---|---|
| `/` | Page (SSR+Client) | `app/page.tsx` | Main enterprise landing page | `SiteShell`, `HeroGate`, `TerminalSimulator`, `MarqueeLogos`, `EnclaveVisual` | No | **COMPLETE** |
| `/console` | Page (Client) | `app/console/page.tsx` | Cloud Control Plane SOC dashboard | Live Traffic Table, Cedar Studio, Kill Switch, Blast Radius | Yes (Demo Bypass in Dev) | **COMPLETE** |
| `/playground` | Page (Client) | `app/playground/page.tsx` | Interactive attack simulation sandbox | Attack Selector, Cedar Rule Editor, Payload Inspector | No | **COMPLETE** |
| `/shadow-audit` | Page (Client) | `app/shadow-audit/page.tsx` | 30-Min Shadow AI Audit intake | Audit Wizard, Sprawl Estimator, Telemetry Upload | No | **COMPLETE** |
| `/platform` | Page (SSR) | `app/platform/page.tsx` | 4-Layer architectural breakdown | Layer Diagrams, Technical Specs, Performance KPIs | No | **COMPLETE** |
| `/solutions` | Page (SSR) | `app/solutions/page.tsx` | Enterprise use cases (Autonomous Agents) | Solution Cards, Threat Matrix, Enterprise Testimonials | No | **COMPLETE** |
| `/integrations` | Page (SSR) | `app/integrations/page.tsx` | Multi-cloud discovery catalog | Connector Directory (AWS, K8s, GitHub, Slack, OpenBao) | No | **COMPLETE** |
| `/pricing` | Page (SSR) | `app/pricing/page.tsx` | Transparent tiered pricing model | Community $0, Enterprise, Custom Calculator | No | **COMPLETE** |
| `/compare` | Page (SSR) | `app/compare/page.tsx` | Competitor comparison matrix | `CompetitorComparison` vs Aembit, Astrix, Oasis, Cyera | No | **COMPLETE** |
| `/trust` | Page (SSR) | `app/trust/page.tsx` | Enterprise trust & zero-secret guarantees | Security Whitepaper Links, SOC2/ISO Commitments | No | **COMPLETE** |
| `/security` | Page (SSR) | `app/security/page.tsx` | OWASP NHI Top 10 & MCP Top 10 breakdown | Control Catalog, Technical Mitigation Mapping | No | **COMPLETE** |
| `/privacy` | Page (SSR) | `app/privacy/page.tsx` | Privacy policy & data protection terms | Data Flow Disclosures, Zero Plaintext Storage Terms | No | **COMPLETE** |
| `/terms` | Page (SSR) | `app/terms/page.tsx` | Enterprise SaaS Terms of Service | License Bounds, Service Level Agreements (99.99%) | No | **COMPLETE** |
| `/contact` | Page (Client) | `app/contact/page.tsx` | Enterprise intake & demo request form | Contact Form, Scheduling Calendar Link | No | **COMPLETE** |
| `/changelog` | Page (SSR) | `app/changelog/page.tsx` | Chronological release logs | Semantic Version History (v1.0.0, v0.9.x) | No | **COMPLETE** |
| `/resources` | Page (SSR) | `app/resources/page.tsx` | Whitepapers, benchmarks, guides | Resource Cards, PDF Download Links | No | **COMPLETE** |
| `/about` | Page (SSR) | `app/about/page.tsx` | Company mission, leadership, open-core | Team Bios, Company Vision, Open Source Ethos | No | **COMPLETE** |
| `/docs` | Page (SSR) | `app/docs/page.tsx` | Developer docs & CLI reference | Quickstart, Docker Runbooks, Architecture Specs | No | **COMPLETE** |
| `/sign-in` | Page (Client) | `app/sign-in/page.tsx` | Authentication login page | SSO Buttons, Email/Password Fields | No | **COMPLETE** |
| `/sign-up` | Page (Client) | `app/sign-up/page.tsx` | User registration page | Organization Creation Form, Tenant Initialization | No | **COMPLETE** |
| `/api/auth/register` | API Route | `app/api/auth/register/route.ts` | Handles account registration | In-memory session store / Supabase forwarder | No | **COMPLETE** |
| `/api/auth/login` | API Route | `app/api/auth/login/route.ts` | Authenticates credentials | Validates password, issues `axm_session` cookie | No | **COMPLETE** |
| `/api/auth/logout` | API Route | `app/api/auth/logout/route.ts` | Clears operator session | Expired cookie deletion | Yes | **COMPLETE** |
| `/api/auth/me` | API Route | `app/api/auth/me/route.ts` | Returns active session profile | Token verification, operator metadata return | Yes | **COMPLETE** |
| `/api/playground/evaluate` | API Route | `app/api/playground/evaluate/route.ts` | Evaluates tool call against Rust engine | Proxies to `:8787/v1/local/policies/dry-run` | No | **COMPLETE** |
| `/api/sbom/download` | API Route | `app/api/sbom/download/route.ts` | Downloads CycloneDX 1.6 SBOM | Streams `axiom-nhi-cyclonedx-1.6.sbom.json` | No | **COMPLETE** |
| `/api/shadow-audit/analyze` | API Route | `app/api/shadow-audit/analyze/route.ts` | Computes shadow AI risk score | Mathematical calculation of unmanaged sprawl | No | **COMPLETE** |
| `/api/contact` | API Route | `app/api/contact/route.ts` | Processes contact inquiries | Logs lead to database/webhook | No | **COMPLETE** |

---

## 4. Key Component Deep-Dive

### 4.1 `HeroGate.tsx` (`apps/web/app/components/HeroGate.tsx`)
- **Purpose:** The primary hero conversion element on the homepage. Rebuilt with a neomorphic light-theme aesthetic matching modern cybersecurity standards.
- **Key Features:**
  - High-contrast, pure white text (`rgb(255, 255, 255)`) primary CTA pill button ("Try the Playground &rarr;").
  - Tactical secondary CTA ("Talk to an Engineer") with inline SVG headset icon.
  - Three value proposition badges (`Agentic-First Security`, `Real-Time Protection`, `Built for Enterprise`) using dedicated SVGs.
  - **Right-Side Interactive Governance Gateway Card:**
    - Live macOS-style window header with glowing `● Online ⌵` status badge.
    - KPI 1: *Identity Overview* showing `2,847` AI Agents with a trend sparkline.
    - KPI 2: *Security Status* showing `All Safe` with a green checkmark badge.
    - KPI 3: *Response Time* showing `5 ms` with dynamic dancing equalizer bars.
    - Split bottom preview panels: *Detected Threats* (threat tags with hover state) and *Core Policy* (Cedar rule syntax snippet).

### 4.2 `TerminalSimulator.tsx` (`apps/web/app/components/TerminalSimulator.tsx`)
- **Purpose:** Interactive live runtime evaluation bench demonstrating inline threat interception, Cedar guardrails, and cluster-wide emergency kill switch execution.
- **Key Architectural & UI Polish Updates:**
  - **WCAG AAA Contrast Overhaul:** Eliminated washed-out, low-opacity text (`--state-deny-tint`). Danger tags (`[VALIDATOR]`, `[CEDAR]`, `[INTERCEPT]`) render as solid crimson badges (`#fee2e2`, text `#991b1b`, border `#fca5a5`) with deep red log text (`#7f1d1d`, font-weight 600) achieving a 10:1 contrast ratio against the light terminal canvas.
  - **Syntax-Highlighted JSON Trace Studio:** Right pane renders JSON keys in rich indigo (`#3730a3`), punctuation in slate-600 (`#475569`), latencies in amber (`#b45309`), decision verdicts in bold badge pills (`#991b1b` on `#fee2e2` for `DENY`/`REVOKED`), and dangerous arguments in prominent red badges (`"DROP TABLE customer_records"`).
  - **Segmented Control Tabs:** Replaced disjointed tab rows with an enterprise-grade segmented pill track (`#e2e8f0`). The active scenario elevates with crisp white background, dark slate text (`#0f172a`, font-weight 700), and soft shadow.
  - **Distinct Action Button for Kill Switch:** "Trigger Emergency Kill Switch" is isolated as a dedicated danger action button (`#dc2626` hover `#b91c1c`) with white power icon `⏻` and monospace font, instantly switching to the causal cascade isolation scenario.
  - **Tailwind v4 Build Configuration:** Configured `@source "../../../apps/web/app/**/*.{js,ts,jsx,tsx}";` in `packages/ui/src/theme.css` and added `@import "tailwindcss";` with `@source` in `apps/web/app/styles.css` to guarantee all utility classes compile into the production bundle. Explicit inline fallback styles prevent any CSS caching anomalies.

### 4.3 `SiteShell.tsx` (`apps/web/app/components/SiteShell.tsx`)
- **Purpose:** Master global navigation header and footer wrapper.
- **Key Features:**
  - Sticky glassmorphic navbar with proper spacing (`gap-4`) separating navigation links from primary action buttons.
  - Quick action buttons: `30-Min Shadow Audit`, `Sign In`, and `Console &rarr;`.
  - Comprehensive footer with links to all 12 enterprise routes, compliance badges (SOC2 Type II, ISO 27001), and live status indicator.

---

## 5. Page Execution Flows

### 5.1 `/console` Operator Dashboard Execution Flow
1. **Initial Mount:**
   - Component issues `GET /api/auth/me`. If authenticated, sets `operator` state. If unauthenticated and running in dev mode (`AXIOM_DEV_MODE=1`), provides default evaluator profile to prevent lockout.
2. **SSE Stream Connection:**
   - Initializes `new EventSource("http://127.0.0.1:8787/v1/local/events/stream")`.
   - On incoming message: parses `AuditEvent` JSON, calculates decision pill (`ALLOW` vs `DENY`), and prepends the record to `trafficData` state (capped at 50 records).
3. **OWASP Scorecard Sync:**
   - Issues `GET http://127.0.0.1:8787/v1/owasp/scorecard`. Populates the 8 core enforced controls.
4. **User Action: Cedar Policy Simulation:**
   - Operator edits Cedar policy text and clicks "Dry Run".
   - Component posts payload to `/api/playground/evaluate`, which invokes the Rust runtime's `policy_dry_run` handler.
   - Updates output state with formatted JSON response showing AST verb checks and latency.
5. **User Action: Emergency Kill Switch:**
   - Operator selects target agent (`agent::reporting-worker-4`) and clicks "Trigger Emergency Kill Switch".
   - Issues `POST http://127.0.0.1:8787/v1/local/revocations` with payload `{ target_kind: "agent", target_id: "..." }`.
   - On response: updates local revocation state, arms indicator, and displays confirmation toast.

### 5.2 `/playground` Attack Sandbox Execution Flow
1. **User selects attack preset** (e.g. "Destructive SQL DDL (`DROP TABLE`)").
2. **Playground populates:**
   - Principal: `agent::data-analyst`
   - Tool: `db.execute_query`
   - Arguments: `{"query": "DROP TABLE customer_records"}`
   - Cedar Rule: `permit(...) when { context.ast_verb in ["SELECT"] };`
3. **User clicks "Run Security Gate":**
   - Sends `POST /api/playground/evaluate`.
   - Next.js route proxies to `http://127.0.0.1:8787/v1/local/policies/dry-run`.
   - If ExtMCP engine is online: returns live Rust AST decision in <1ms (`upstreamSource: "live-extmcp-engine"`).
   - If ExtMCP engine is offline: falls back to local deterministic zero-trust engine in Next.js (`upstreamSource: "local-eval-engine"`).
4. **UI displays:**
   - Big Red Verdict Pill: `DENY`
   - Latency: `0.31 ms`
   - Detected Threat: `DESTRUCTIVE_DDL (DROP/TRUNCATE detected in AST)`
   - Cryptographic Hash: `0x8f2d...9a12`
