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

### D-005: Unbacked & Target Claims Resolution Matrix (Human Alignment Pending)
- **Date**: 2026-11-16
- **Context**: Section 15 and AUDIT.md require human choice on each unbacked or target claim before Phase 1.
- **Claims Pending Choice**:
  1. **Claim 1: P99 < 3.5ms Overhead**
     - Option A: Back it with a benchmark (`tests/performance/test_latency_benchmarks.py`)
     - Option B: Relabel as `target` in `claims.ts` and show visitor target tag
     - Option C: Remove numeric latency claim
  2. **Claim 2: Sub-50ms Kill Switch Fleet Propagation**
     - Option A: Back it with test (`PERF-04`)
     - Option B: Relabel as `target` in `claims.ts`
     - Option C: Remove numeric ms claim
  3. **Claim 3: 45,000+ Req/s Throughput Per Node**
     - Option A: Back it with load-test benchmark
     - Option B: Relabel as `target`
     - Option C: Remove claim entirely from KPI strip
  4. **Claim 4: 30-Minute Shadow Audit Scan**
     - Option A: Back with connector rate-limiter test
     - Option B: Relabel as `target`
     - Option C: Remove 30-minute phrasing
  5. **Claim 5: 45:1 NHI-to-Human Ratio**
     - Option A: Back with external report citation (Entro/CyberArk 2024)
     - Option B: Relabel as `simulated` / `estimate`
     - Option C: Remove from hero copy
