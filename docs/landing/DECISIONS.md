# Axiom NHI Landing Page Architecture Decisions (DECISIONS.md)

This log records every architecture and design decision, deviation, and human clarification made during the implementation of the Axiom Landing Page.

---

## Decision Log

### D-001: Completion of Phase 0 Audit
- **Date**: 2026-11-16
- **Context**: Phase 0 required auditing `apps/web/app/page.tsx`, bundle sizes, keyframes, claims, and mock behaviors before writing production code.
- **Decision**: Completed audit recorded in `docs/landing/AUDIT.md`. Found initial landing JS bundle at 130.2 KiB gzip (under the 180 KiB budget). Identified two unbacked claims (`45,000+ Req/s` and `30-Minute Shadow Audit`) that require human confirmation or target labeling.

### D-002: Transition to Sourced Claims Architecture (`claims.ts`)
- **Date**: 2026-11-16
- **Context**: Multiple components have scattered hardcoded numbers (`< 3.5ms`, `15ms`, `100%`, `45,000+`).
- **Decision**: Centralize all claims in `apps/web/app/data/claims.ts` with explicit `kind: 'measured' | 'target' | 'simulated'` tags and verification sources.

### D-003: Retirement of Hero Terminal in Favor of "The Gate"
- **Date**: 2026-11-16
- **Context**: Plan calls for visual differentiation ("The Gate" - a luminous vertical boundary line demonstrating real-time policy permits and denials).
- **Decision**: Replace `TerminalSimulator` and `EnclaveVisual` in the hero with `HeroGate.tsx`. Reuse terminal scenario logic within the Govern section or link to `/playground`.

### D-004: Replacing Marquee with Neutral "Works With" Strip
- **Date**: 2026-11-16
- **Context**: Marquee logos of big tech vendors imply customer endorsement.
- **Decision**: Replace infinite ticker with a clean, monochrome "Works with" integration strip.

### D-005: Claims Taxonomy & Sourcing Decisions
- **Date**: 2026-11-16
- **Context**: User confirmed choices on the 5 audited claims and the taxonomy structure.
- **Resolutions**:
  1. **Claim 1 (P99 < 5 ms)**: Relabeled as `kind: 'target'`, value `"< 5"`, unit `"ms"`. Matches README and aligns with `/benchmarks` statement withholding live stack numbers until fleet benchmarks run.
  2. **Claim 2 (Kill Switch Sub-50ms)**: Relabeled as `kind: 'target'`, value `"< 50"`, unit `"ms"`. `PERF-04` mock methodology test verifies the harness, while < 50ms remains fleet target.
  3. **Claim 3 (Throughput Per Node)**: Fully removed from `claims.ts` and all landing page components. Prevents buyer skepticism on unbacked figures.
  4. **Claim 4 (30-Minute Shadow Audit)**: Relabeled as `kind: 'target'`, value `"< 30"`, unit `"minutes"`.
  5. **Claim 5 (Agent-to-Human Ratio)**: Tagged as `kind: 'cited'`, value `"45x–82x"`, sourced from CyberArk 2022 (45:1) & 2025 (82:1) Identity Security Threat Landscape Reports. Wording: *"Surveys put machine identities at 45 to 82 times the number of humans."* Moved out of hero subheadline into a cited proof block.
  6. **Taxonomy Extension**: `ClaimKind` extended to `'measured' | 'verified' | 'target' | 'cited' | 'policy'`.
  7. **Fail-Closed Phrasing**: Reworded to *"Fails closed on timeout or evaluator outage (9 of 9 chaos scenarios pass)"* (`kind: 'verified'`).
  8. **Zero Lines Claim**: Moved from numeric KPI to architectural prose ("Drop-in MCP proxy").
  9. **Discovery Promise**: Tagged as `kind: 'policy'`.

### D-006: Implementation Plan Section 15 Architecture Answers
- **Date**: 2026-11-16
- **Context**: Answers to the seven mandatory architectural scope questions in Section 15 of the implementation plan.
- **Decisions**:
  1. **Benchmark Results**: No real-stack runtime benchmarks published yet; PERF mock tests establish methodology. Live results intentionally withheld per `/benchmarks`.
  2. **Shadow Audit Speed**: Labeled strictly as `target`.
  3. **GitHub Stars**: Suppressed. No star counter rendered. Repo link displayed without vanity count.
  4. **Customer Logos & Quotes**: Zero unverified logos, design partner claims, or fabricated testimonials. Replaced with generic protocol/tool icons ("Works with Anthropic, OpenAI, GitHub, AWS") in a monochrome integration strip.
  5. **Color & Brand Tokens**: Retain existing obsidian canvas (`#0B0F19`), surface layers, Gate luminous teal permit (`#10B981`), rose-red deny (`#F43F5E`), and cyan boundary (`#00E5FF`). All tokens verified against WCAG 2.1 AA (4.5:1 text, 3.0:1 borders).
  6. **Authentication Links**: Main navigation hides sign-up or explicitly badges Sign-In as `Demo`.
  7. **Legal Copy**: Render placeholder Terms of Service and Privacy Policy pages, explicitly badged for human legal review prior to production launch.

### D-007: Phase 2 Page Architecture & Section Composition
- **Date**: 2026-11-16
- **Context**: Rebuilding `apps/web/app/page.tsx` into the 13 ordered sections defined in Section 5 of the Implementation Plan.
- **Section Migration & Retirement Notes**:
  1. **Header (`SiteShell`)**: Retained slim navigation (Playground, Benchmarks, Docs, GitHub) with Deploy in 5 Min CTA.
  2. **Hero (`HeroGate`)**: Retired hero terminal and standalone isometric enclave from initial hero fold. Replaced with the interactive The Gate boundary demo cycling through 6 AST and Cedar scenarios, with visible Pause/Play toggle and reduced-motion static fallback.
  3. **Proof Strip (`ProofStrip`)**: 4 sourced metrics from `claims.ts` (< 5 ms P99 target, 15 ms fail-closed deadline, < 50 ms kill switch target, < 30 min shadow audit target) + 3 verification badges. Infinite brand marquee (`MarqueeLogos`) replaced with neutral, monochrome 'Works out of the box with' integration row to avoid implying unverified customer endorsement.
  4. **Story Lifecycle (`StoryScroll`)**: 3-stage sticky scroll (Discover, Understand, Govern) driven by IntersectionObserver on desktop, stacked on mobile. Step 1 embeds sample read-only identity discovery fixture (visibly labeled Demo environment).
  5. **Blast Radius (`BlastRadiusGraph`)**: Embedded directly in Story Step 2. Features deterministic 28-node graph layout, BFS reachability calculation, live sensitive asset counters, simulated token leak and one-click revocation.
  6. **Kill Switch (`KillSwitchDemo`)**: Embedded directly in Story Step 3. Demonstrates 5 distributed gateway replicas and sub-50 ms emergency fleet revocation with test call replay.
  7. **Audience Perspectives (`AudienceToggle`)**: 2-tab perspective (Security Leaders vs Platform Engineers), preserving URL hash state (`#security`, `#engineering`). Replaces legacy `ThesisSwitcher`.
  8. **Under the Hood (`UnderTheHood`)**: Accordion containing `EnclaveVisual`, `SaaSEcosystemPillars`, and standards compliance matrix (RFC 8707, SPIFFE, Cedar 3.x, OCSF 1.1).
  9. **Transparent Pricing (`MeteringCalculator`)**: Kept calculator with 3 inputs (agents, events, retention), explicit formula display, and prominent $0 Discovery Policy Guarantee.
  10. **Reproduce Benchmarks (`ReproduceBlock`)**: 3 copyable commands for docker quickstart, 9/9 chaos tests, and latency benchmark harness, plus target percentile teaser chart.
  11. **Frequently Asked Questions (`FaqAccordion`)**: Updated to 8 objection-handling questions from `landing.ts` copy deck.
  12. **Final CTA & Engineer Routing (`TalkToEngineerSection`)**: Preserved direct-to-engineer form with honeypot protection.
  13. **Footer (`SiteShell`)**: Maintained links, legal notices, and `CookieConsent`.
