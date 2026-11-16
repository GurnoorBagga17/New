# Axiom NHI — Complete UI/UX Visual Design, Light-Theme Aesthetics, 3D Graphics & Micro-Interaction Audit Prompt

**Target Repository:** `c:\Users\Lenovo\Desktop\Axiom` (`GurnoorBagga17/New`)  
**Role Assigned to AI Agent:** Principal Design Systems Architect, Staff Creative Technologist & Senior UI/UX Auditor  
**Visual Benchmark Competitors:** [Aembit](https://aembit.io/), [Clutch Security](https://clutch.security/), and [Token Security](https://www.token.security/)  
**Mandatory Visual Theme:** **Enterprise Light-First Tactical Precision** (`#F8FAFC` Alabaster Canvas, `#FFFFFF` Pure Surface Cards, `#0F172A` Slate Ink, `#0284C7` Cyan-Blue, `#4F46E5` Indigo, `#059669` Emerald Allow, `#DC2626` Crimson Deny) with instant `Light / Dark / System` theme switching.

## 1. Mission: Expose & Eliminate Every "AI-Generated UI" Flaw

You are tasked with conducting a ruthless, pixel-by-pixel **Visual Design & UI/UX Audit** across all three frontend surfaces (`apps/web`, `apps/gateway-ui`, and `apps/console`) and shared design packages (`tokens.json`, `packages/ui`, `packages/cedar-editor`).

Enterprise security buyers immediately spot generic AI-generated templates. You must inspect every screen and eliminate these eight visual anti-patterns:

1. **Muddy Drop Shadows Instead of Architectural Hairlines:** Enterprise platforms like [Aembit](https://aembit.io/) and [Clutch Security](https://clutch.security/) never use blurry, heavy `box-shadow` blobs. Elevation must come from stepped surface luminance (`--bg-canvas` → `--bg-surface-1` → `--bg-surface-2`), crisp `1px solid var(--border-subtle)` borders, and subtle top-edge specular highlights.
2. **Dark-Mode Leftovers on a Light-Theme Canvas:** Check every component (`EnclaveVisual.tsx`, `TerminalSimulator.tsx`, `InterceptSimulator.tsx`, `ThesisSwitcher.tsx`, `MeteringCalculator.tsx`, `SaaSEcosystemPillars.tsx`, `apps/gateway-ui`, `apps/console`) for dark navy fills (`rgb(7, 9, 14)` or `rgb(17, 24, 39)`) or low-contrast muted text that looks washed out on `#F8FAFC` / `#FFFFFF`.
3. **Jittery Non-Tabular Numbers:** Every live counter (`1.45 ms`, `1,500+ events/sec`, `$0.00`, `TTL 04:12`, `SHA-256` hashes) must enforce `font-family: var(--font-mono)` and `font-variant-numeric: tabular-nums` so digits never shift horizontally during live updates.
4. **Color-Only Status Indicators:** Never use a bare colored dot or text color alone to represent security state. Every status badge must pair a **semantic tint + `1px` border + geometric icon + uppercase monospace label** (`✓ ALLOW`, `✕ DENY`, `◎ OBSERVE`, `⏻ REVOKED`).
5. **Flat Diagrams Masquerading as 3D Architecture:** The hero visual (`EnclaveVisual.tsx`) must be a true **30° isometric 3D glass-box projection (`P(u, v, z)`)** with frosted crystal-white/cyan panes, animated packet beams, concentric orbiting rings, and an extruded 3D crimson hexagonal shield (`#DC2626`) with interactive attack triggers—never a flat 2D flowchart.
6. **Inconsistent Border Radii, Spacing & Alignment Axes:** Sibling cards in a grid must share identical baseline alignment, internal padding (`20px` or `24px`), and strict token radii (`6px` for inputs/badges, `10px` for cards/panels, `14px` for modals/drawers).
7. **Cluttered Tables Without Progressive Disclosure:** Data tables (`TrafficTable.tsx`, `AuditExplorer.tsx`) must display 5 clean, scannable columns (`Timestamp`, `Agent Identity`, `Target & Tool`, `Verdict`, `Latency`) and defer deep JSON-RPC envelopes, OAuth 2.1 CIMD claims, and Cedar policy traces to the `460px` slide-over `InspectorDrawer.tsx`.
8. **Janky Layout Animations:** Never animate `height`, `width`, `top`, or `left`. All transitions must use GPU-composited `transform` and `opacity` with spring physics (`SPRING_TACTILE` and `SPRING_DRAWER`) wrapped in `<MotionConfig reducedMotion="user">`.

## 2. Mandatory 8-Point Visual Audit Checklist (Inspect & Report File-by-File)

For each of the 8 dimensions below, inspect the exact files listed, grade the current implementation from `1.0` to `10.0`, cite exact line numbers (`file.tsx:L20-L55`) where visual flaws exist, and fix them in code.

### 2.1 Color System, Light-First Luminance & WCAG 2.1 AA Contrast (`tokens.json`, `tokens.css`, `styles.css`)

Inspect `tokens.json`, `docs/architecture/generated/tokens.css`, `apps/web/app/styles.css`, `apps/gateway-ui/src/styles/tokens.css`, and `packages/ui/src/theme.css`.

| Audit Check | Required Visual Standard | Verification Method |
| :--- | :--- | :--- |
| **CLR-01: Light-First Default Canvas** | `apps/web/app/layout.tsx` and `apps/gateway-ui/src/App.tsx` default to Light Mode (`--bg-canvas: rgb(248, 250, 252)`, `--bg-surface-1: rgb(255, 255, 255)`, `--bg-surface-2: rgb(241, 245, 249)`), while supporting `System` (`prefers-color-scheme`) and `Dark` mode via `data-theme`. | Inspect root `<html>` attributes, `:root` CSS variables, and theme toggle state. |
| **CLR-02: Zero Hardcoded Hex Literals** | Zero `#RRGGBB` or `#000000` literals exist in any `.tsx`, `.ts`, or `.css` file under `apps/` or `packages/`. All colors reference CSS custom properties (`var(--*)`) or token-derived `rgb(...)` values. | Run `python3 docs/architecture/scripts/check_frontend_colors.py` (`0` violations across all files). |
| **CLR-03: 32-Pair WCAG 2.1 AA Contrast Gate** | Every text token (`--text-primary`, `--text-secondary`, `--text-muted`) achieves `>= 4.5:1` contrast and `--border-strong` achieves `>= 3.0:1` across all 4 surface layers (`canvas`, `surface-1`, `surface-2`, `surface-3`) in both Light and Dark modes. | Run `python3 docs/architecture/scripts/check_design_tokens.py` (`32/32 PASS`). |

### 2.2 Typography, Font Pairing & Micro-Copy Precision

Inspect `apps/web/app/layout.tsx`, `apps/gateway-ui/package.json`, `apps/web/app/styles.css`, and all page headings/tables.

| Typographic Role | Required Font Family & OpenType Settings | Desktop Scale / Line Height / Tracking | Where to Audit |
| :--- | :--- | :--- | :--- |
| **Hero Display (`H1`)** | `Space Grotesk Variable` (`700`) | `52px–56px` (`3.25rem–3.5rem`) / `1.06` / `-0.035em` | `apps/web/app/page.tsx` hero headline |
| **Section Header (`H2`)** | `Space Grotesk Variable` (`600`–`700`) | `32px–36px` (`2.0rem–2.25rem`) / `1.15` / `-0.025em` | Landing page sections, `/benchmarks`, `/playground`, `/docs` |
| **Module / Card Title (`H3`)** | `Inter Variable` or `Space Grotesk` (`600`) | `18px–20px` (`1.125rem–1.25rem`) / `1.3` / `-0.015em` | Console headers, bento cards, drawer titles |
| **Body & Table Cells** | `Inter Variable` (`400`, `500`, `font-feature-settings: "cv02", "cv03", "cv04", "cv11"`) | `14px` (`0.875rem`) / `1.5` / `normal` | All descriptions, form controls, and table rows |
| **Overlines & Badges** | `JetBrains Mono Variable` (`500`–`600`, uppercase) | `10px–11px` (`0.625rem–0.6875rem`) / `1.2` / `+0.12em` | Section eyebrow labels, column headers, verdict badges |
| **Code, Hashes & Telemetry** | `JetBrains Mono Variable` (`400`–`500`, `font-variant-numeric: tabular-nums`) | `12px–13px` (`0.75rem–0.8125rem`) / `1.55` / `0em` | Cedar policies, JSON-RPC payloads, latency readouts, `$0.00` calculator |

### 2.3 Hero 30° Isometric 3D Glass-Box Enclave (`apps/web/app/components/EnclaveVisual.tsx`)

Inspect `apps/web/app/components/EnclaveVisual.tsx` line by line and verify all six visual elements:

1. **Mathematical 30° Isometric Projection (`P(u, v, z)`):** Uses true isometric coordinate math (`cos(30°)`, `sin(30°)`) on a crisp perspective architectural grid with subtle radial spotlight masking.
2. **Crystal-Light Frosted Glass Gates:** The three inline security gates (**Gate 1: OAuth 2.1 CIMD & RFC 8707**, **Gate 2: Cedar + SQL/Path/Egress AST**, **Gate 3: OpenBao Ephemeral Lease**) use high-contrast frosted crystal-white/cyan fills (`rgba(255, 255, 255, 0.88)` with `#0284C7` / `#4F46E5` laser-etched rims) so they pop against the `#F8FAFC` light canvas.
3. **Extruded 3D Crimson Hexagonal Shield (`#DC2626`):** When an attack scenario is active (`SQL DROP TABLE`, `../../etc/passwd`, `SSRF 169.254.169.254`), the incoming packet beam strikes the 3D crimson shield, triggering a damped shockwave ring and displaying `BLOCKED FAIL-CLOSED • 1.4ms`.
4. **Emerald Approved Stream & Zero-Secret Lease Injection (`#059669`):** When the `Read-Only SELECT` scenario is selected, the packet beam passes cleanly through all three gates in Emerald (`#059669`), displaying `vault://openbao/prod-db • TTL 240s`.
5. **Interactive 4-Scenario Control Strip:** Four tactile pill buttons below the 3D enclave let visitors switch live between `1. SQL DROP Injection (DENY)`, `2. Read-Only SELECT (ALLOW)`, `3. Path Traversal (DENY)`, and `4. Causal Kill Switch (REVOKED)`.
6. **Hardware/Accessibility Fallback:** Honors `prefers-reduced-motion` by rendering a crisp static isometric state without continuous orbital loops when reduced motion is requested.

### 2.4 Dual-Graph Visual Encoding (`Postgres Lineage` + `SpiceDB Delegation`)

Inspect `apps/web/app/components/SaaSEcosystemPillars.tsx`, `ThesisSwitcher.tsx`, and `apps/console/src/App.tsx`.

| Graph Element | Required Visual Shape & Color Token | Interaction & State Behavior |
| :--- | :--- | :--- |
| **Human Owner Node** | Circular node (`rx="999"`) with Indigo border (`--brand-indigo` `#4F46E5`) and confidence badge (`0.95 CODEOWNERS + CIMD`) | Clicking highlights all downstream owned AI agents and service accounts. |
| **Autonomous AI Agent Node** | Hexagonal polygon node with Violet/Indigo accent (`#4F46E5` / `#7C3AED`) | Displays active session status, tool call velocity, and blast-radius score badge. |
| **Shared Credential / Lease Node** | Diamond / Pill node with Amber warning (`#D97706`) if static/shared or Emerald (`#059669`) if OpenBao ephemeral | Hovering reveals `v_shared_credential_siblings` (all workloads sharing the same HMAC-SHA256 fingerprint). |
| **Production Resource / MCP Server** | Chamfered rectangle (`rx="8"`) with criticality badge (`P0 PROD DB`) | Shows active runtime mode (`ENFORCE` vs `OBSERVE`) and pinned SHA-256 tool schema digest. |
| **Static vs. Live Delegation Edges** | Solid `1.5px` slate lines for Postgres static dependencies; animated dashed (`stroke-dasharray: 4 4`) Indigo lines for live RFC 8693 SpiceDB delegations | Toggling **"Simulate Revocation / What-If Kill Switch"** highlights collateral sibling workloads in Amber/Crimson and dims unaffected nodes to `20%` opacity. |

### 2.5 Public Landing Page (`/`) Section Rhythm, Bento Grid & Conversion UX

Inspect `apps/web/app/page.tsx` and all components in `apps/web/app/components/`:

1. **Sticky Glass Header (`SiteShell.tsx`):** `64px` height, `backdrop-filter: blur(12px)`, `1px solid var(--border-subtle)`, custom interlocking geometric prism logo, navigation links (`Product`, `Playground`, `Benchmarks`, `Docs`), Light/Dark theme toggle, `Sign In` link, and primary `Start Free ($0 Discovery)` CTA.
2. **Hero Split-Screen (`12-Column Grid`):** Left 6 columns hold the eyebrow badge (`INLINE RUNTIME SECURITY FOR AI AGENTS & NHIs`), `H1` headline (`Discover every identity. Govern every action.`), concise subheadline, copyable `docker compose up axiom-gateway` CLI bar (`QuickCopyCommand.tsx`), and trust metadata strip (`Apache-2.0 Open Core • < 1.5ms P99 • Zero-Secret Browser Invariant`); right 6 columns hold the interactive 30° isometric `EnclaveVisual`.
3. **4-Pillar Bento Grid (`page.tsx`):** Four balanced architectural cards with monospace index numbers (`01`–`04`), protocol badges (`RFC 8707 & CIMD`, `AST Syntax Guard`, `Sub-ms Cedar Engine`, `SHA-256 Hash Chain`), and uniform internal padding (`24px`).
4. **Split Terminal & Cedar Trace Simulator (`TerminalSimulator.tsx`):** Side-by-side interactive terminal (left) and step-by-step ExtMCP + Cedar evaluation trace (right) with scenario tabs and an interactive **Trigger Emergency Kill Switch** button.
5. **Transparent `$0`-Discovery Pricing & Metering Calculator (`MeteringCalculator.tsx`):** Interactive dual sliders proving **Discovered Un-Governed NHIs = `$0.00` Forever**, alongside the 4-tier comparison cards (`Community $0`, `Essentials`, `Enterprise`, `Ultimate`).

### 2.6 Operator Console (`apps/gateway-ui`) & Enterprise Console (`apps/console`) Ergonomics

Inspect `apps/gateway-ui/src/App.tsx`, `TrafficStream.tsx`, `TrafficTable.tsx`, `InspectorDrawer.tsx`, `PolicyStudioPage.tsx`, and `AuditExplorer.tsx`:

1. **Zero Horizontal Overflow & Responsive 3-Pane Workspace:** Left navigation rail (`64px` collapsed icon rail on tablet, `208px` labeled rail on desktop), fluid center table (`min-w-0`), and `460px` slide-over right inspector drawer.
2. **Hover-to-Pause Telemetry Stream:** Hovering over any row in `TrafficTable.tsx` pauses viewport auto-scrolling and displays a floating `STREAM PAUSED (BUFFERING IN BACKGROUND) — CLICK TO RESUME` pill so operators never lose their clicked row during a `500+ events/sec` burst.
3. **Zero-Secret Lease Pills in Inspector Drawer:** Credentials are rendered exclusively as structured metadata pills (`vault://openbao/prod-db • TTL 4m 00s • Attested SPIFFE`) with a lock icon and monospace badge—never raw tokens.
4. **Two-Step Safety Confirmation on Destructive Controls:** The Emergency Kill Switch requires explicit `Step 1: Arm Kill Switch` before enabling `Step 2: Confirm & Execute Revocation`, preventing accidental one-click production outages.

## 3. Head-to-Head Competitor Visual Scorecard (Must Score >= 9.5/10 on Every Criterion)

Your audit report must include this exact comparison table grading Axiom NHI's current frontend against [Aembit](https://aembit.io/), [Clutch Security](https://clutch.security/), and [Token Security](https://www.token.security/) before and after your visual fixes:

| Visual & UX Criterion | [Aembit](https://aembit.io/) Benchmark | [Clutch Security](https://clutch.security/) Benchmark | [Token Security](https://www.token.security/) Benchmark | Axiom NHI Target Standard |
| :--- | :--- | :--- | :--- | :--- |
| **Light-Mode Executive Clarity** | Clean white/slate enterprise cards | High-contrast light posture visuals | Modern SaaS cards with bold accents | `#F8FAFC` canvas + `#FFFFFF` cards + `17.06:1` slate ink + zero dark-mode bleed |
| **Hero Technical Proof** | Static workload-to-workload diagram | Static identity lineage illustration | Marketing hero graphics | Interactive 30° isometric 3D Glass Enclave (`EnclaveVisual.tsx`) with 4 live attack deflections |
| **Interactive Product Sandbox** | Docs & request-demo gate | Guided tour screenshots | Request-demo gate | Live Split Terminal + Cedar AST Studio (`/playground`) running directly in the browser |
| **Lineage & Blast-Radius UX** | Access policy mapping list | Strong visual lineage graph | Identity inventory catalog | Unified Dual-Graph (Postgres static dependencies + SpiceDB live RFC 8693 hops + `What-If Revoke` simulator) |
| **Pricing & Value Transparency** | Contact sales | Contact sales | Contact sales | Interactive `$0`-Discovery Metering Calculator proving un-governed discovery is free forever |

## 4. Required Output Format & Verification Commands for the AI Agent

1. **Step 1 — Output the Visual Audit Table:** List every file inspected across `apps/web`, `apps/gateway-ui`, `apps/console`, `packages/ui`, and `packages/cedar-editor`, citing exact line numbers of any visual, contrast, alignment, typography, 3D geometry, or responsive layout defects.
2. **Step 2 — Patch Every Visual Defect in Code:** Edit the `.tsx` and `.css` files directly using design tokens (`var(--*)` / `rgb(...)`—never hardcoded `#hex` strings).
3. **Step 3 — Run & Paste the Output of All Visual & Frontend Quality Gates:**

```bash
# 1. Compile design tokens and verify all 32 Light & Dark WCAG 2.1 AA contrast pairs
npm --prefix docs/architecture/token-build run build
python3 docs/architecture/scripts/check_design_tokens.py

# 2. Verify zero hardcoded hex colors (#RRGGBB) or pure black (#000000) across all frontend files
python3 docs/architecture/scripts/check_frontend_colors.py

# 3. Run TypeScript, ESLint, Vitest unit tests, and production builds
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build

# 4. Verify initial JS bundle budgets and air-gapped zero-external-URL compliance
python3 docs/architecture/scripts/check_frontend_budgets.py
python3 docs/architecture/scripts/check_gateway_ui_offline.py
```
