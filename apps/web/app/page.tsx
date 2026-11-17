// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
import { SiteShell } from "./components/SiteShell";
import { HeroGate } from "./components/HeroGate";
import { ProofStrip } from "./components/ProofStrip";
import { MarqueeLogos } from "./components/MarqueeLogos";
import { StoryScroll } from "./components/StoryScroll";
import { TerminalSimulator } from "./components/TerminalSimulator";
import { AudienceToggle } from "./components/AudienceToggle";
import { UnderTheHood } from "./components/UnderTheHood";
import { CompetitorComparison } from "./components/CompetitorComparison";
import { MeteringCalculator } from "./components/MeteringCalculator";
import { ReproduceBlock } from "./components/ReproduceBlock";
import { FaqAccordion } from "./components/FaqAccordion";
import { TalkToEngineerSection } from "./components/TalkToEngineerSection";

/**
 * Axiom NHI Production Landing Page
 *
 * Ordered Composition:
 * 1. Header (SiteShell)
 * 2. Hero with Live Gate Demo (HeroGate)
 * 3. Proof Strip with Sourced Numbers & Verification Badges (ProofStrip)
 * 4. Animated Ecosystem Logo Marquee (MarqueeLogos)
 * 5. Story Scroll: Discover, Understand, Govern (StoryScroll)
 * 6. Interactive Blast Radius Simulation (embedded in Story Step 2)
 * 7. Fleet Emergency Revocation Demo (embedded in Story Step 3)
 * 8. Live Split Terminal & Policy Trace Simulator (TerminalSimulator)
 * 9. Audience Toggle: Security Leaders vs Platform Engineers (AudienceToggle)
 * 10. Under the Hood: 30° Isometric Enclave & Protocols (UnderTheHood)
 * 11. Head-to-Head Competitor Comparison Matrix (CompetitorComparison)
 * 12. Transparent Pricing & $0 Discovery Calculator (MeteringCalculator)
 * 13. Reproduce Benchmarks Block (ReproduceBlock)
 * 14. Frequently Asked Questions (FaqAccordion)
 * 15. Final CTA & Engineer Routing (TalkToEngineerSection)
 * 16. Footer & Legal Disclosures (SiteShell)
 */
export default function HomePage() {
  return (
    <SiteShell>
      {/* 2. Hero Section: Outcome Headline & Interactive Gate */}
      <HeroGate />

      {/* 3. Proof Strip: 4 Sourced Metrics, 3 Badges, Works-With Strip */}
      <ProofStrip />

      {/* 4. Animated Integration Ecosystem Marquee */}
      <MarqueeLogos />

      {/* 5-7. Story Lifecycle: Discover (01), Understand (02 / Blast Radius), Govern (03 / Kill Switch) */}
      <StoryScroll />

      {/* 8. Interactive Split Terminal & Cedar Policy Studio */}
      <section className="py-16 bg-[var(--bg-canvas)] border-t border-[var(--border-subtle)]" aria-label="Interactive Terminal and Policy Simulator">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-10">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
              LIVE RUNTIME EVALUATION BENCH
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold font-sans tracking-tight text-[var(--text-primary)] mt-3">
              Test ExtMCP &amp; Cedar Guardrails in Real Time
            </h2>
            <p className="mt-3 text-base text-[var(--text-secondary)]">
              Simulate live agent tool invocations, watch fail-closed Cedar policy decisions in sub-1.5ms (&lt; 5ms total gateway overhead), or trigger an instant cluster-wide emergency kill switch.
            </p>
          </div>
          <TerminalSimulator />
        </div>
      </section>

      {/* 9. Audience Perspectives: For Security Leaders vs Platform Engineers */}
      <AudienceToggle />

      {/* 10. Under the Hood: Enclaves, Dynamic Leasing & RFC Standards */}
      <UnderTheHood />

      {/* 11. Head-to-Head Competitor Architectural Matrix */}
      <CompetitorComparison />

      {/* 12. Pricing: $0 Discovery Policy & Capacity Calculator */}
      <MeteringCalculator />

      {/* 13. Reproduce Benchmarks & Quickstart */}
      <ReproduceBlock />

      {/* 14. Frequently Asked Questions */}
      <FaqAccordion />

      {/* 15. Final Call-to-Action & Contact Engineer */}
      <TalkToEngineerSection />
    </SiteShell>
  );
}
