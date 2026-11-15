import type { Metadata } from "next";
import { SiteShell } from "../components/SiteShell";

export const metadata: Metadata = {
  title: "Benchmarks · Axiom NHI",
  description: "Benchmark publication status and reproducible measurement plan for Axiom NHI.",
};

const plannedMeasures = [
  { title: "Policy path latency", detail: "Report p50, p95, and p99 for internal policy evaluation separately from gateway callout time." },
  { title: "Fail-closed behavior", detail: "Record timeout and unavailable-service outcomes with the workload and test environment." },
  { title: "Revocation propagation", detail: "Measure propagation from revoke request to the runtime decision boundary." },
];

export default function BenchmarksPage() {
  return (
    <SiteShell>
      <section className="benchmark-hub wrap" aria-labelledby="benchmark-title">
        <header className="benchmark-hub__header">
          <p className="eyebrow">EVIDENCE HUB · PHASE 1</p>
          <h1 id="benchmark-title">Performance claims need reproducible evidence.</h1>
          <p className="benchmark-hub__lede">
            This page will publish measurements only when an integrated runtime run and its result artifact are available.
          </p>
        </header>

        <section className="benchmark-hub__status" aria-labelledby="benchmark-status-title">
          <span className="benchmark-hub__status-icon" aria-hidden="true">◷</span>
          <div>
            <p className="eyebrow">STATUS · NO SIGNED RESULT ARTIFACT</p>
            <h2 id="benchmark-status-title">No runtime benchmark results are published yet.</h2>
            <p>
              Latency, throughput, and failure-rate values are intentionally withheld. Build outputs and local simulations do not represent runtime benchmark results.
            </p>
          </div>
        </section>

        <div className="benchmark-hub__grid">
          {plannedMeasures.map((measure, index) => (
            <article className="benchmark-hub__card" key={measure.title}>
              <span className="benchmark-hub__index">0{index + 1}</span>
              <p className="eyebrow">PLANNED MEASUREMENT</p>
              <h3>{measure.title}</h3>
              <p>{measure.detail}</p>
            </article>
          ))}
        </div>
      </section>
    </SiteShell>
  );
}
