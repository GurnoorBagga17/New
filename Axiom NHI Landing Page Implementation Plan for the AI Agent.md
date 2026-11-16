# Axiom NHI Landing Page: Implementation Plan for the AI Agent

Target: apps/web (Next.js) in GurnoorBagga17/New. Goal: a landing page that out-proves Token Security by letting visitors try the product, check the numbers, and understand the value in five seconds.

## 0. How to use this plan

- Read the whole plan before changing anything. Execute phases in order; each phase ends with an acceptance checklist that must pass before the next begins.
- Scope is apps/web only (plus the frontend budget scripts under docs/architecture/scripts if a budget entry must be added). Do not modify gateway, services, identity, validators or any Rust crate.
- Commit after every task using conventional commits (feat, fix, perf, test, docs, chore). Keep each commit small enough to review.
- When the plan says ask the human, stop and ask. Do not invent the answer.
- This plan was written without access to the contents of page.tsx and styles.css, so Phase 0 is mandatory and may change later tasks. Record every deviation in docs/landing/DECISIONS.md.

## 1. Mission and success criteria

Mission: within five seconds a visitor must understand that Axiom governs what AI agents and machine identities can do, see it work, and have a one-click way to try it.

| Metric | Target |
| --- | --- |
| Largest Contentful Paint (mobile, throttled) | under 2.0 s |
| Cumulative Layout Shift | under 0.05 |
| Initial JS on the landing route | not above the current budget in check\_frontend\_budgets.py; never raise the budget to make a build pass |
| Lighthouse accessibility | 95 or higher |
| Contrast | WCAG 2.1 AA, verified by check\_frontend\_colors.py |
| Hero demo | visible and animating within 1 s on desktop, static first frame in server HTML |
| Claims with a source | 100 percent |

## 2. Non-negotiable rules

1. No fabricated social proof: no invented customer logos, testimonials, awards, user counts or GitHub star counts.
2. Every number on the page comes from apps/web/app/data/claims.ts. Each entry is labelled measured, target or simulated, and the label is shown to the visitor.
3. Respect prefers-reduced-motion everywhere. Every animation needs a static equivalent that carries the same information.
4. Server-render meaningful HTML first. The hero headline, subheadline, CTAs and first demo frame must exist without JavaScript.
5. Approved new dependencies only: framer-motion (or motion), d3-force (layout math only, no d3 DOM), and zod for form validation if not already present. Ask before adding anything else.
6. Do not break existing routes: /playground, /docs, /benchmarks, /sign-in, /sign-up, /api/contact and /api/auth/\*.
7. Never ship a feature that looks real but is a mock. Anything mocked is labelled Demo in the UI.
8. Run the quality gates (section 11) at the end of every phase, not only at the end.

## 3. Phase 0: Audit (no product code changes)

Create docs/landing/AUDIT.md containing:

1. Section inventory of app/page.tsx: each section, its component, whether it is a client or server component, and approximate line count.
2. Output of the production build with per-route JS size; CSS file size; a list of every animation and keyframe in styles.css.
3. Lighthouse (mobile) and axe results for the current landing page as the before baseline.
4. A claims table: every numeric or absolute claim on the page (under 5 ms, 15 ms fail-closed deadline, under 50 ms kill-switch propagation, under 30 minute shadow audit, 0 dollar discovery, test counts) with columns: claim, where shown, source of truth in the repo, test or benchmark that backs it. Flag every claim with no backing.
5. A list of mock or demo behaviour: the mock OIDC route, the in-memory auth store, any fake SLA ticker values, any hard-coded metrics.
6. Where the numbers on /benchmarks come from (hard-coded or generated).

Acceptance: AUDIT.md exists, baseline numbers are recorded, unbacked claims are listed. Stop and ask the human how to treat each unbacked claim (back it, relabel it as a target, or remove it).

## 4. Phase 1: Foundations (tokens, content, data, motion)

### 4.1 Visual identity: The Gate

The current look (obsidian, glassmorphism, glow gradients, grid mesh) is the default look of AI-security sites. Keep the dark base but give it one ownable idea: the Gate, a thin vertical luminous line that every visual references.

- Permit color: cool teal-green. Deny color: warm red-orange. Neutral: graphite scale. The Gate accent is used sparingly.
- Define everything as CSS variables in styles.css; run check\_design\_tokens.py and check\_frontend\_colors.py after every change.
- Limit blur or backdrop-filter to two elements per viewport. Prefer flat surfaces with 1 px borders.
- Fonts via next/font: one display face and one monospace, self-hosted, subsetted, font-display swap.

### 4.2 Content file

Move all copy into app/content/landing.ts so wording can change without touching components. Use this copy deck as the starting point:

- Eyebrow: Open-core runtime security for AI agents
- H1: Every AI agent is an identity. Govern what it can do in under 5 ms.
- Subheadline: Axiom finds every AI agent and machine identity in your environment, maps what each one can reach, and blocks unsafe tool calls inline, before they run.
- Primary CTA: Try the playground. Secondary CTA: a copyable install command. Tertiary text link: Talk to an engineer.
- Micro-proof under the CTAs: Apache-2.0 open core. Reproducible benchmarks. Runs in your VPC or air-gapped.
- Step 1, Discover: Find every agent in 30 minutes. A read-only scan of AWS IAM, Kubernetes, GitHub and Slack produces a shadow audit of agents, owners and access.
- Step 2, Understand: See the blast radius before the incident. Follow any token to everything it can reach, then see what revoking it cuts off.
- Step 3, Govern: Enforce intent at wire speed. Every tool call is evaluated against policy inline, fails closed, and can be killed fleet-wide in milliseconds.

If the human has not confirmed the 30 minute and sub-5 ms claims against real measurements, mark them as target in the UI.

### 4.3 Claims data

Create app/data/claims.ts with the type below, and make both the landing page and /benchmarks read from it.

```ts
export type Claim = {
  id: string;
  label: string;
  value: number | string;
  unit?: string;
  kind: 'measured' | 'target' | 'simulated';
  source: string;      // file path, test name or command that backs it
  verifiedBy?: string; // e.g. 'python3 tests/run_tests.py'
};
```

Add a unit test that fails if any claim lacks a source.

### 4.4 Motion utilities

Create app/lib/motion.ts: a reduced-motion hook wrapper, shared easing curves and durations, and an in-view hook based on IntersectionObserver.

Acceptance: tokens pass both check scripts, copy lives in landing.ts, claims.ts exists with tests, and the only visible change is fonts and tokens.

## 5. Phase 2: Page architecture

Rebuild app/page.tsx as a short, ordered composition. Merge, move or delete sections as shown.

| # | Section | Purpose | Component | Render |
| --- | --- | --- | --- | --- |
| 1 | Header | Slim nav: Product, Playground, Benchmarks, Docs, GitHub, one CTA | SiteShell | server shell, client mobile menu |
| 2 | Hero | Outcome headline plus live gate demo | HeroGate | server text, client demo |
| 3 | Proof strip | Four sourced numbers and three badges | ProofStrip | server |
| 4 | Story | Discover, Understand, Govern sticky scroll | StoryScroll | client |
| 5 | Blast radius | Interactive graph inside step 2 | BlastRadiusGraph | client, lazy |
| 6 | Kill switch | Fleet kill demo inside step 3 | KillSwitchDemo | client, lazy |
| 7 | Audience | Security leaders vs Engineers | AudienceToggle | client |
| 8 | Under the hood | Enclave diagram, ecosystem pillars, architecture | UnderTheHood | client, lazy |
| 9 | Pricing | 0 dollar discovery calculator | MeteringCalculator | client, lazy |
| 10 | Reproduce | Install command and how to run the tests | ReproduceBlock | server plus QuickCopyCommand |
| 11 | FAQ | Eight objection-handling answers | FaqAccordion | client |
| 12 | Final CTA | Playground, install, talk to engineer | TalkToEngineerSection | client |
| 13 | Footer and cookie | Legal, links | SiteShell, CookieConsent | mixed |

Changes to existing components:

- Move the live SLA ticker out of the header. Show its content in the proof strip only if the data is real; otherwise delete it.
- MarqueeLogos becomes a static Works with row naming supported tools in text or neutral monochrome marks. No marquee, and nothing that implies customers.
- ThesisSwitcher content moves into AudienceToggle or into Under the hood.
- TerminalSimulator is retired from the hero (replaced by HeroGate) and reused inside the Govern step or behind the playground link.
- InterceptSimulator is merged into the Govern step so two demos do not compete.

Acceptance: the page composes in the order above, no section is deleted without a note in DECISIONS.md, the build passes, and all old routes still work.

## 6. Phase 3: Hero (HeroGate)

Layout: two columns on desktop (copy left, demo right); stacked on mobile with the demo below the CTAs. Reserve a fixed height for the demo to avoid layout shift.

Behaviour:

- A tool call card travels from the left to the Gate line. Permit: the card passes through and turns teal with a check. Deny: the card stops at the Gate, fades and turns red with the reason.
- Cycle through six scenarios tied to the real validators: SQL AST (drop table denied), Path (traversal denied), Egress SSRF (link-local address denied), Tool Pinning (unpinned tool version denied), and two permitted calls with the granted scope shown (for example GitHub read).
- Each result shows tool, verdict, policy reason and latency. Latency is labelled simulated unless it comes from claims.ts as measured.
- A Run this in the playground link deep-links to /playground?scenario=ID. Implement that query parameter in the playground so it preloads the scenario.
- Provide a visible Pause and Play button (WCAG 2.2.2). Pause automatically on hover and keyboard focus.
- Server-render the first scenario frame in HTML; hydrate to start the cycle.

Performance and accessibility:

- Animate only transform and opacity. No canvas, video or WebGL.
- role=img with a descriptive aria-label for the animation, plus a visually hidden polite live region announcing each verdict, rate-limited to one per 4 seconds.
- Reduced motion: show a static three-row list (permit, deny, deny), with no travelling cards.

Starter structure (adapt, do not paste blindly):

```tsx
'use client';
// scenarios come from content/landing.ts, latency from data/claims.ts
// reduced motion -> render <StaticVerdictList/>
// else: index state + setInterval 2400 ms, paused by hover, focus or the button
// AnimatePresence mode='wait' keyed by scenario id
```

Acceptance: hero text and first frame are visible with JavaScript disabled; LCP is under target; a keyboard user can pause the demo; axe reports no violations in the hero.

## 7. Phase 4: Story scroll

- Desktop: two columns. The left column holds three step blocks of text; the right column is a sticky panel (position sticky, below the header) that swaps its visual as each step enters the viewport. Drive the active step with IntersectionObserver, not a scroll-event listener.
- Mobile and reduced motion: no sticky behaviour; each step shows its own visual inline, stacked.
- Add a progress rail with three labelled dots that also work as anchor links (#discover, #understand, #govern).
- Step 1 visual (Discover): identities appear in a list with type icon, owner and an attribution confidence chip. Use a clearly labelled sample fixture (Sample environment, not customer data).
- Step 2 visual: BlastRadiusGraph (Phase 5).
- Step 3 visual: a Cedar policy snippet beside the intercept result and the KillSwitchDemo (Phase 6).

Acceptance: steps switch correctly when scrolling up and down, anchors work, no layout jump, and no horizontal scroll at 320 px width.

## 8. Phase 5: BlastRadiusGraph (signature interaction)

Goal: the visitor marks a token as leaked, sees everything it can reach, then revokes it and watches the reach collapse. This mirrors the simulate\_revocation behaviour of the lineage-graph module.

Data model (app/components/blast/graph.fixture.ts):

```ts
type NodeKind = 'agent' | 'service-account' | 'token' | 'secret' | 'resource';
type GNode = { id: string; kind: NodeKind; label: string; sensitive?: boolean };
type GEdge = { from: string; to: string; rel: 'uses' | 'assumes' | 'grants' | 'reads' };
```

Implementation rules:

- 25 to 40 nodes maximum. Render with SVG. Use d3-force for layout math only; run a fixed number of ticks synchronously on mount with a fixed seed so the layout is stable and never jitters. Precompute positions at build time if simple.
- Clicking or pressing Enter on a token node opens a small popover with Mark as leaked. Marking runs a breadth-first search along outgoing edges and highlights reachable nodes with a staggered reveal (40 ms per hop).
- Counters: Reachable resources N and Sensitive M, updated live.
- Revoke button: edges from the token fade out and the reachable set returns to neutral; counters drop to 0; the message reads Revoked in X ms (simulated) unless a measured value exists. A Reset button restores the initial state.
- Accessibility: every node is focusable with an aria-label; a visually hidden table lists reachable resources after marking; changes are announced through an aria-live region. Reduced motion: apply states instantly.
- Load with next/dynamic only when the section is near the viewport.

Acceptance: keyboard-only completion of mark, revoke and reset; counters verified by a unit test of the BFS function; identical layout on every load; the bundle impact of d3-force is recorded in the PR.

## 9. Phase 6: KillSwitchDemo

- Five gateway replica nodes in a row plus one agent node. A Kill agent button triggers propagation: each replica turns from permit to blocked with a timestamp offset.
- Display the propagation time. Use the measured value from claims.ts if one exists; otherwise show the under 50 ms figure and label it target.
- After the kill, a replay of the agent's tool call shows denied by kill switch on every replica.
- Keyboard accessible, reduced-motion safe, with a Reset button.

Acceptance: the demo runs end to end with keyboard only, there are no console errors, and the label matches the claim kind.

## 10. Phase 7: Proof, audience, depth, pricing, FAQ

Proof strip: four numbers from claims.ts (for example inline evaluation latency, fail-closed deadline, kill-switch propagation, shadow audit time), each with its kind label and a link to how it is produced. Three badges: Apache-2.0 open core; OWASP NHI Top 10 and MCP Top 10 coverage (link to the rule list in risk-engine); WCAG 2.1 AA tokens verified in CI.

Benchmarks teaser: a small P50, P95 and P99 chart drawn with inline SVG from the same data as /benchmarks, plus a Reproduce it yourself block using QuickCopyCommand with the exact commands from the README.

AudienceToggle: two tabs, For security leaders (risk, audit, compliance, AI-BOM, SIEM export, spend controls) and For engineers (inline latency, Cedar policies, gateway install, validators, open source). Default is security leaders. Save the selection in the URL hash.

Under the hood: an accordion that lazy-loads EnclaveVisual, SaaSEcosystemPillars and an architecture diagram. All jargon (Cedar, SPIFFE, TPM 2.0, Nitro Enclaves, OCSF, RFC 8693, SpiceDB, OpenBao) lives here or in tooltips, never in the hero.

Pricing: keep MeteringCalculator but reduce it to three inputs, show the formula used, and state clearly what is free under 0 dollar discovery.

FAQ (eight questions): How is this different from prompt guardrails? What happens if Axiom is down or slow (it fails closed at the 15 ms deadline)? Is it open source, and what is not? Can it run air-gapped? What data do you store? Which systems does discovery read, and is it read-only? How do approvals work? How do I try it without talking to sales?

Acceptance: every figure traces to claims.ts; tabs, accordion and FAQ are keyboard accessible; no jargon term appears above the Story section.

## 11. Phase 8: Engineering quality

Performance:

- Lazy-load every below-the-fold client component with next/dynamic and an in-view trigger. Keep only the hero and header in the initial bundle.
- No image heavier than 100 KB; prefer inline SVG. Preload only the display font.
- Record before and after numbers in docs/landing/RESULTS.md.

SEO and metadata:

- Title, description, canonical, OpenGraph and Twitter tags in layout.tsx; generate the OG image with next/og using the headline and the Gate motif.
- JSON-LD SoftwareApplication, plus sitemap.ts and robots.ts.

Security of the site itself (this is a security product):

- Review the headers in next.config.ts and add a strict Content-Security-Policy with a nonce, X-Content-Type-Options, Referrer-Policy and frame-ancestors none. No inline eval.
- /api/contact: validate with zod, add a honeypot field and basic rate limiting, return generic errors, never echo input, and keep all secrets server-side.
- Mock auth: sign-in and sign-up must either be clearly labelled Demo with a visible banner or be hidden from the landing navigation until real. Do not advertise enterprise SSO while the OIDC route is a mock. Document the in-memory store as non-production.
- Analytics only after consent through the existing CookieConsent component; no third-party scripts before consent.

Testing (Playwright, config already at the repo root):

1. Hero renders headline, CTAs and first demo frame with JavaScript disabled.
2. Reduced-motion emulation shows static equivalents and no running animations.
3. Keyboard-only flow through the nav, hero pause button, story anchors, blast-radius graph, kill switch, audience tabs and FAQ.
4. Every CTA link resolves to a working route.
5. No console errors or failed network requests on load.
6. axe accessibility scan with zero serious or critical violations.
7. Visual snapshots at 360, 768 and 1440 px widths.
8. Unit tests: BFS reachability, and every claim has a source.

Quality gates to run at the end of every phase:

```
pnpm lint && pnpm build
python3 docs/architecture/scripts/check_design_tokens.py
python3 docs/architecture/scripts/check_frontend_budgets.py
python3 docs/architecture/scripts/check_frontend_colors.py
python3 docs/architecture/scripts/check_frontend_workspace.py
pnpm exec playwright test
```

## 12. Phase 9: Rollout

- Ship behind a flag (NEXT\_PUBLIC\_LANDING\_V2) or at a /v2 route until the Definition of Done is met, then swap.
- Compare before and after Lighthouse results in RESULTS.md.
- Update the apps/web README with how to run the demos and how claims.ts works.
- Record a short screen capture of the hero, blast radius and kill switch for the repository README.

## 13. Ordered task list

| ID | Task | Files |
| --- | --- | --- |
| T01 | Write AUDIT.md with baselines and claims table | docs/landing/AUDIT.md |
| T02 | Resolve unbacked claims with the human | docs/landing/DECISIONS.md |
| T03 | Gate design tokens, fonts via next/font | app/styles.css, app/layout.tsx |
| T04 | Content file with the copy deck | app/content/landing.ts |
| T05 | Claims data and source-required unit test | app/data/claims.ts |
| T06 | Motion utilities | app/lib/motion.ts |
| T07 | Slim header, remove SLA ticker | components/SiteShell.tsx |
| T08 | HeroGate with static fallback | components/hero/HeroGate.tsx |
| T09 | Playground scenario deep-link | app/playground/page.tsx |
| T10 | ProofStrip and badges | components/ProofStrip.tsx |
| T11 | StoryScroll shell with observer and rail | components/story/StoryScroll.tsx |
| T12 | Discover visual with sample fixture | components/story/DiscoverPanel.tsx |
| T13 | Graph fixture and BFS with unit tests | components/blast/graph.fixture.ts |
| T14 | BlastRadiusGraph SVG and interactions | components/blast/BlastRadiusGraph.tsx |
| T15 | KillSwitchDemo | components/KillSwitchDemo.tsx |
| T16 | Merge InterceptSimulator into the Govern step | components/story/GovernPanel.tsx |
| T17 | AudienceToggle | components/AudienceToggle.tsx |
| T18 | UnderTheHood accordion with lazy loading | components/UnderTheHood.tsx |
| T19 | Simplify MeteringCalculator | components/MeteringCalculator.tsx |
| T20 | ReproduceBlock and benchmarks teaser | components/ReproduceBlock.tsx |
| T21 | FAQ rewrite | components/FaqAccordion.tsx |
| T22 | Replace marquee with a static Works with row | components/MarqueeLogos.tsx |
| T23 | Compose app/page.tsx in the new order | app/page.tsx |
| T24 | Metadata, OG image, JSON-LD, sitemap, robots | app/layout.tsx, app/sitemap.ts |
| T25 | CSP and security headers review | next.config.ts |
| T26 | Contact route hardening | app/api/contact/route.ts |
| T27 | Label or hide mock auth | sign-in, sign-up, auth routes |
| T28 | Playwright and axe suites | e2e tests folder |
| T29 | Performance pass and RESULTS.md | docs/landing/RESULTS.md |
| T30 | Flag swap, README update, capture | apps/web/README.md |

## 14. Definition of done

- Every acceptance checklist in this plan passes and all quality gates are green.
- Lighthouse mobile performance and accessibility meet the targets in section 1.
- A visitor with JavaScript disabled still sees the full headline, subheadline, CTAs, proof strip text and FAQ.
- No claim lacks a source and a kind label; no fabricated proof exists anywhere on the page.
- All pre-existing routes work and mocks are labelled.
- DECISIONS.md and RESULTS.md are complete.

## 15. Questions the agent must ask the human

1. Where do real benchmark results live, and which headline numbers are measured today?
2. Is the 30 minute shadow audit a measured result or a target?
3. May the page show the live GitHub star count and repository link, and will the repo be public at launch?
4. Are there real design partners, awards or quotes that may be shown, with written permission?
5. Final product name styling, logo and brand colors, if they differ from the current tokens.
6. Should sign-in and sign-up stay visible at launch or be hidden until real?
7. Legal copy: privacy policy, terms and the cookie wording.
