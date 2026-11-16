// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
import { SiteShell } from "./components/SiteShell";
import { HeroGate } from "./components/HeroGate";
import { ProofStrip } from "./components/ProofStrip";
import { StoryScroll } from "./components/StoryScroll";
import { AudienceToggle } from "./components/AudienceToggle";
import { UnderTheHood } from "./components/UnderTheHood";
import { MeteringCalculator } from "./components/MeteringCalculator";
import { ReproduceBlock } from "./components/ReproduceBlock";
import { FaqAccordion } from "./components/FaqAccordion";
import { TalkToEngineerSection } from "./components/TalkToEngineerSection";

/**
 * Axiom NHI Production Landing Page
 *
 * Ordered Composition (Section 5 of Implementation Plan):
 * 1. Header (SiteShell)
 * 2. Hero with Live Gate Demo (HeroGate)
 * 3. Proof Strip with Sourced Numbers & Works-With Ecosystem (ProofStrip)
 * 4. Story Scroll: Discover, Understand, Govern (StoryScroll)
 * 5. Interactive Blast Radius Simulation (embedded in Story Step 2)
 * 6. Fleet Emergency Revocation Demo (embedded in Story Step 3)
 * 7. Audience Toggle: Security Leaders vs Platform Engineers (AudienceToggle)
 * 8. Under the Hood: Enclave Architecture & Standards (UnderTheHood)
 * 9. Transparent Pricing & $0 Discovery Calculator (MeteringCalculator)
 * 10. Reproduce Benchmarks Block (ReproduceBlock)
 * 11. Frequently Asked Questions (FaqAccordion)
 * 12. Final CTA & Engineer Routing (TalkToEngineerSection)
 * 13. Footer & Legal Disclosures (SiteShell)
 */
export default function HomePage() {
  return (
    <SiteShell>
      {/* 2. Hero Section: Outcome Headline & Interactive Gate */}
      <HeroGate />

      {/* 3. Proof Strip: 4 Sourced Metrics, 3 Badges, Works-With Strip */}
      <ProofStrip />

      {/* 4-6. Story Lifecycle: Discover (01), Understand (02 / Blast Radius), Govern (03 / Kill Switch) */}
      <StoryScroll />

      {/* 7. Audience Perspectives: For Security Leaders vs Platform Engineers */}
      <AudienceToggle />

      {/* 8. Under the Hood: Enclaves, Dynamic Leasing & RFC Standards */}
      <UnderTheHood />

      {/* 9. Pricing: $0 Discovery Policy & Capacity Calculator */}
      <MeteringCalculator />

      {/* 10. Reproduce Benchmarks & Quickstart */}
      <ReproduceBlock />

      {/* 11. Frequently Asked Questions */}
      <FaqAccordion />

      {/* 12. Final Call-to-Action & Contact Engineer */}
      <TalkToEngineerSection />
    </SiteShell>
  );
}
