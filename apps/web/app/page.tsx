import Link from "next/link";
import { SiteShell } from "./components/SiteShell";
import { QuickCopyCommand } from "./components/QuickCopyCommand";
import { EnclaveVisual } from "./components/EnclaveVisual";
import { TerminalSimulator } from "./components/TerminalSimulator";
import { MeteringCalculator } from "./components/MeteringCalculator";
import { MarqueeLogos } from "./components/MarqueeLogos";
import { SaaSEcosystemPillars } from "./components/SaaSEcosystemPillars";
import { FaqAccordion } from "./components/FaqAccordion";
import { TalkToEngineerSection } from "./components/TalkToEngineerSection";

const capabilities = [
  {
    number: "01",
    badge: "RFC 8707 & SPIFFE",
    title: "Cryptographic Identity Binding",
    body: "Bind every autonomous tool call to a verified non-human identity (NHI). Eliminate static bearer tokens and prevent lateral privilege escalation across agent runtimes.",
    gradient: "from-cyan-500/10 to-transparent",
  },
  {
    number: "02",
    badge: "AST Syntax Guard",
    title: "Deep AST Argument Inspection",
    body: "Parse and sanitize tool invocation arguments pre-execution. Block destructive DDL, SQL injections, SSRF vectors, and prompt injections before they reach backend APIs.",
    gradient: "from-indigo-500/10 to-transparent",
  },
  {
    number: "03",
    badge: "Sub-ms Cedar Engine",
    title: "Deterministic Cedar Policy Gate",
    body: "Evaluate fine-grained, mathematically verifiable Cedar policies fail-closed in under 3.5ms. Every parameter is checked against least-privilege boundary rules.",
    gradient: "from-violet-500/10 to-transparent",
  },
  {
    number: "04",
    badge: "Merkle-Tree Audit",
    title: "Zero-Knowledge Forensic Trail",
    body: "Generate immutable, tamper-evident cryptographic audit logs with automatic PII masking. Prove regulatory and compliance posture with zero data leakage.",
    gradient: "from-emerald-500/10 to-transparent",
  },
];

const kpiMetrics = [
  { value: "< 3.5ms", label: "P99 Gateway Overhead", subtext: "Zero perceptible delay on tool execution" },
  { value: "100%", label: "Fail-Closed Guarantee", subtext: "Network partition halts unverified requests" },
  { value: "0 Lines", label: "Agent Code Changes", subtext: "Drop-in standard MCP proxy architecture" },
  { value: "45,000+", label: "Req/s Per Node", subtext: "Rust-native high-throughput event pipeline" },
];

export default function HomePage() {
  return (
    <SiteShell>
      {/* ================= HERO SECTION ================= */}
      <section className="hero-section">
        <div className="wrap hero-layout">
          {/* Left Column: Headlines & Quickstart */}
          <div className="hero-content">
            <div className="hero-live-badge">
              <span className="live-dot" />
              <span>THE ZERO-TRUST GATEWAY FOR NON-HUMAN IDENTITIES (NHIs)</span>
            </div>

            <h1 className="hero-headline">
              Discover every<br />
              identity. Govern<br />
              every action.
            </h1>

            <p className="hero-subheadline">
              Autonomous AI agents and cloud workloads now outnumber humans 45-to-1.
              Axiom provides real-time identity binding, deep AST argument inspection,
              and dynamic credential leasing at machine speed.
            </p>

            <div className="hero-command-area">
              <QuickCopyCommand command="docker compose up axiom-gateway" />
            </div>

            <div className="hero-meta-strip">
              <span className="meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Zero Code Changes
              </span>
              <span className="meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                P99 &lt; 3.5ms Overhead
              </span>
              <span className="meta-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                100% Fail-Closed
              </span>
            </div>
          </div>

          {/* Right Column: 3D Isometric Enclave Visual */}
          <div className="hero-visual-wrapper">
            <EnclaveVisual />
          </div>
        </div>
      </section>

      {/* ================= MARQUEE RUNTIME ECOSYSTEM ================= */}
      <MarqueeLogos />

      {/* ================= DUAL INTERACTIVE CARDS SECTION ================= */}
      <section className="interactive-cards-section" id="simulation">
        <div className="wrap interactive-cards-grid">
          {/* Card 1: Split Terminal & Policy Trace Simulator */}
          <TerminalSimulator />

          {/* Card 2: Dual-Slider Metering Calculator */}
          <MeteringCalculator />
        </div>
      </section>

        {/* ================= THE NHI PROBLEM & GOVERNANCE PILLARS ================= */}
        <SaaSEcosystemPillars />

      {/* ================= KPI PERFORMANCE BENCHMARK STRIP ================= */}
      <section className="kpi-section">
        <div className="wrap kpi-grid">
          {kpiMetrics.map((kpi) => (
            <div key={kpi.label} className="kpi-card">
              <span className="kpi-value">{kpi.value}</span>
              <h3 className="kpi-label">{kpi.label}</h3>
              <p className="kpi-subtext">{kpi.subtext}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ================= BENTO ENTERPRISE CAPABILITIES ================= */}
      <section className="section wrap" id="runtime">
        <div className="section-heading">
          <p className="eyebrow">DEFENSE-IN-DEPTH ARCHITECTURE</p>
          <h2>One unified inline decision boundary.</h2>
          <p>
            Autonomous agents act at microsecond velocity. Axiom unifies cryptographic identity attestation,
            deep syntax-tree validation, and dynamic credential leasing into a single fail-closed proxy.
          </p>
        </div>

        <div className="bento-grid">
          {capabilities.map((item) => (
            <article className="bento-card" key={item.number}>
              <div className="bento-header">
                <span className="bento-badge">{item.badge}</span>
                <span className="bento-number">{item.number}</span>
              </div>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              <div className="bento-footer">
                <Link href="/docs#ast-guard" className="bento-link">
                  Explore Architecture <span aria-hidden="true">↗</span>
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

        {/* ================= FREQUENTLY ASKED QUESTIONS ================= */}
        <FaqAccordion />

        {/* ================= TALK DIRECTLY TO AN ENGINEER ================= */}
        <TalkToEngineerSection />

      {/* ================= ENTERPRISE CLOSING CTA ================= */}
      <section className="closing-section">
        <div className="wrap closing-card">
          <div className="closing-content">
            <span className="announcement-pill">READY TO ELIMINATE STATIC TOKENS</span>
            <h2>
              Take control of every non-human identity in your cluster.
            </h2>
            <p>
              Deploy Axiom Gateway locally with Docker or explore the live interactive policy playground.
              Zero code changes to your existing MCP tools.
            </p>
            <div className="closing-actions">
              <Link className="deploy-button" href="/docs#quickstart">
                Deploy in 5 Min
              </Link>
              <Link className="text-link-button" href="/playground">
                Explore Playground <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
          <div className="closing-code-preview">
            <div className="code-window-header">
              <span className="dot dot-red" />
              <span className="dot dot-yellow" />
              <span className="dot dot-green" />
              <small>quickstart.sh</small>
            </div>
            <pre>
              <code>
                {`# 1. Pull and start inline proxy\n`}
                <span className="cmd-prompt">$ </span>
                <span className="cmd-code">docker compose up axiom-gateway</span>
                {`\n\n# 2. Point MCP client to local gateway\n`}
                <span className="cmd-prompt">$ </span>
                <span className="cmd-code">export MCP_GATEWAY_URL="http://localhost:9090"</span>
                {`\n\n# 3. Observe real-time shadow audit\n`}
                <span className="cmd-prompt">$ </span>
                <span className="cmd-code">axiom telemetry tail --follow</span>
              </code>
            </pre>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
