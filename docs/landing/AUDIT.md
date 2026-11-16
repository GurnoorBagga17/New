# Axiom NHI Landing Page Audit (Phase 0)

Audit Date: 2026-11-16
Target: `apps/web` (Next.js 16.4.6)
Commit Reference: `c3db37a`

---

## 1. Section Inventory of `apps/web/app/page.tsx`

| # | Section | Component File | Client/Server | Approx Lines | Key Responsibilities |
|---|---|---|---|---|---|
| 1 | Global Header | `app/components/SiteShell.tsx` | Server shell + Client nav | 170 | Sticky navbar, SLA ticker, product links, mobile drawer, CTA |
| 2 | Hero Section | Inline `page.tsx` + `EnclaveVisual.tsx` + `QuickCopyCommand.tsx` | Mixed (Server copy, Client interactive) | 55 + 230 + 55 | Outcome headline, 45:1 machine ratio claim, 1-click Docker copy command, 3D SVG isometric enclave visual |
| 3 | Ecosystem Marquee | `app/components/MarqueeLogos.tsx` | Client | 70 | Scrolling vendor & protocol marks (AWS, K8s, GitHub, Slack, OpenAI, Anthropic) |
| 4 | Interactive Demos | `app/components/TerminalSimulator.tsx` + `app/components/MeteringCalculator.tsx` | Client | 380 + 170 | Interactive scenario CLI terminal (SQL block, secret lease, SSRF block) + ROI dual-slider calculator |
| 5 | Governance Pillars | `app/components/SaaSEcosystemPillars.tsx` | Client | 170 | Tabbed feature cards: Attestation, AST Guard, Secretless Broker, Lineage Graph |
| 6 | KPI Benchmark Strip | Inline `page.tsx` | Server | 20 | 4 static KPI cards: `< 3.5ms` P99 overhead, `100%` Fail-closed, `0 Lines` code changes, `45,000+` req/s |
| 7 | Bento Architecture | Inline `page.tsx` | Server | 45 | 4 capability cards: RFC 8707/SPIFFE, AST Syntax Guard, Cedar Policy Gate, Merkle Audit |
| 8 | FAQ Accordion | `app/components/FaqAccordion.tsx` | Client | 120 | 5 expandable FAQ cards covering gateway deployment, latency, air-gap, and pricing |
| 9 | Talk to Engineer | `app/components/TalkToEngineerSection.tsx` | Client | 240 | Interactive booking/contact drawer modal with form fields |
| 10 | Closing CTA Card | Inline `page.tsx` | Server | 45 | Deploy in 5 Min button, Playground link, quickstart.sh terminal code preview |
| 11 | Global Footer | `app/components/SiteShell.tsx` + `CookieConsent.tsx` | Mixed | ~80 | Legal notices, navigation links, GDPR cookie consent banner |

---

## 2. Production Build, Asset Size, Lighthouse & Accessibility Baseline

- **Build Output** (`next build --webpack`):
  - Initial JS on Landing Route (`/`): **53.9 KB** (Route-specific) / **130.2 KiB** gzip total transfer.
  - Budget Limit in `check_frontend_budgets.py`: **180.0 KiB** gzip (`PASS: 130.2 KiB / 180 KiB`).
  - Total `.next/static` assets: **1,452.8 KB**.
  - Compiled CSS bundle: **75.2 KB** (`5913bd2f085c1419.css`).
  - Raw `apps/web/app/styles.css`: **117.2 KB** (5,845 lines).

### Baseline Lighthouse Audit (Mobile Emulation, Moto G Power / Slow 4G):
- **Performance**: **72 / 100** (Primary detractors: 117 KB unpurged global CSS, CPU blocking during terminal simulator mount, unoptimized svg renders)
- **Accessibility**: **88 / 100** (Color contrast warnings on secondary text tokens, missing keyboard-trap handlers in modals, non-descriptive icon buttons)
- **Best Practices**: **92 / 100** (Passing HTTPS and doctype; flagged console warnings from local mock listeners)
- **SEO**: **90 / 100** (Missing canonical URL tag, structured data JSON-LD graph pending)

### Baseline axe-core Automated Accessibility Scan:
- **3 Contrast Violations**: Muted text on `--bg-surface-2` fell below 4.5:1 in dark mode prior to token harmonization.
- **2 Missing ARIA attributes**: Terminal simulator scenario switchers lacked `aria-pressed` / `role="tab"`.
- **Target for Phase 1 & 2**: Reach 100% WCAG 2.1 AA token compliance (enforced by `check_frontend_colors.py`) and zero axe critical/serious violations.

### Keyframe Animations in `app/styles.css`:
1. `@keyframes livePulse`: Blinking live status green dot.
2. `@keyframes fadeInPop`: Modal dialog and pill fade-in.
3. `@keyframes enc-float`: Floating 3D isometric enclave container.
4. `@keyframes enc-orbit-spin`: Continuous orbital ring rotation.
5. `@keyframes enc-ring-wave`: Radar wave sonar emission.
6. `@keyframes enc-flow`: Data packet flow across network traces.
7. `@keyframes enc-pulse`: Central cryptographic core pulse.
8. `@keyframes enc-attack`: Red adversary attack projectile.
9. `@keyframes enc-blocked`: Shield deflection impact ripple.
10. `@keyframes cursorBlink`: Terminal CLI blinking block cursor.
11. `@keyframes marqueeLoop`: Horizontal infinite brand ticker 1.
12. `@keyframes marqueeScroll`: Horizontal infinite brand ticker 2.
13. `@keyframes fadeIn`: Generic element opacity transition.
14. `@keyframes cookieFadeIn`: Slide-up animation for privacy banner.

---

## 3. Claims Sourcing Table

| Claim | Location on Page | Repo Source of Truth | Verification Test / Evidence | Kind / Status |
|---|---|---|---|---|
| **P99 < 5ms Overhead** | Hero strip, KPI grid, Bento #3 | `tests/performance/test_latency_benchmarks.py` (`PERF-01`) | `test_successful_path_p99` (Mock P99 = 14.9µs–31.6µs); real runtime withheld per `/benchmarks` | **target** (Target < 5ms aligned with README) |
| **15ms Fail-Closed Deadline** | Planned hero/copy | `gateway/mcp-interceptor/interceptor.js` | `test_chaos02_extmcp_timeout_fails_closed` in `tests/failure-injection/test_fail_closed.py` | **verified** |
| **Fail-Closed on Outage/Timeout** | Hero strip, KPI grid | `gateway/mcp-interceptor/interceptor.js` | 9 of 9 chaos scenarios pass (`test_fail_closed.py`) | **verified** ("Fails closed on timeout or evaluator outage (9 of 9 chaos scenarios pass)") |
| **Sub-50ms Kill Switch** | Planned proof strip | `tests/performance/test_latency_benchmarks.py` (`PERF-04`) | `test_kill_switch_propagation_methodology` (Mock P99 = 117µs) | **target** (< 50ms fleet target) |
| **Drop-in MCP Proxy** | Hero strip, Bento | `gateway/` architecture | Drop-in MCP reverse proxy (moved to prose; 0 lines claim retired) | **verified** (Architectural invariant) |
| **45,000+ Req/s Per Node** | *Removed* | None | *Deleted per human choice* | **REMOVED** |
| **30-Minute Shadow Audit** | Plan copy deck | `connectors/` rate-limited scan | `tests/integration/test_phases_2_to_4_masterplan.py` | **target** (< 30 min target) |
| **$0 Discovery Promise** | Metering calculator, Plan copy | `tests/integration/test_phases_2_to_4_masterplan.py` | `test_zero_dollar_discovery_metering_architecture` | **policy** (Commercial commitment) |
| **45x–82x Agent/Human Ratio** | Proof / Why Now section | CyberArk 2022 (45:1) & 2025 (82:1) Identity Security Threat Landscape Reports | Published industry survey reports | **cited** ("Surveys put machine identities at 45 to 82 times the number of humans.") |

---

## 4. Mock & Demo Behavior Inventory

1. **Mock OIDC Route** (`apps/web/app/api/auth/oidc/route.ts`):
   - Mocks enterprise SSO callback returning a static test JWT payload. Must be labelled Demo.
2. **In-Memory User & Session Store** (`apps/web/app/api/auth/store.ts`):
   - Transient volatile `Map` that resets on server restart. Non-production demo store.
3. **Live SLA Ticker** (`apps/web/app/components/SiteShell.tsx`):
   - Hardcoded `99.999% SLA` and `0.0ms` jitter simulation ticker in navbar. Needs removal per Phase 2.
4. **Terminal Simulator Logs** (`apps/web/app/components/TerminalSimulator.tsx`):
   - Pre-computed static scenarios (`sql-block`, `secret-lease`, `ssrf-block`).
5. **Marquee Brand Marks** (`apps/web/app/components/MarqueeLogos.tsx`):
   - Displays enterprise vendor icons (AWS, GitHub, Slack) that could imply customer endorsements. Must be replaced with neutral "Works with" marks.
6. **Benchmarks Hub** (`apps/web/app/benchmarks/page.tsx`):
   - Correctly states: *"No runtime benchmark results are published yet. Latency, throughput, and failure-rate values are intentionally withheld."*

---

## 5. Audit Conclusions & Phase 0 Sign-Off Gate

- All page sections, assets, keyframes, and claims have been inventoried.
- 2 unbacked claims identified: `45,000+ Req/s Per Node` and `30-Minute Shadow Audit`.
- Next step per plan: Human alignment on unbacked claims and Section 15 questions before executing Phase 1.
