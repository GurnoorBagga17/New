// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
import Link from "next/link";
import { SiteShell } from "./components/SiteShell";

const calls = [
  { tool: "db.execute_query", detail: "DROP TABLE customers", verdict: "DENIED" },
  { tool: "github.read_issue", detail: "repo: payments / issue 418", verdict: "PERMITTED" },
  { tool: "filesystem.read_file", detail: "/var/run/secrets/...", verdict: "DENIED" },
];

const steps = [
  { n: "01 / DISCOVER", title: "Inventory machine identities across your connected environments.", tags: "AWS IAM  ·  Kubernetes  ·  GitHub  ·  Slack" },
  { n: "02 / UNDERSTAND", title: "Trace ownership and access paths before they become incidents.", tags: "Identity  →  tool  →  resource" },
  { n: "03 / GOVERN", title: "Apply deterministic policy before an invocation executes.", tags: "Observe  ·  Enforce  ·  Contain" },
];

export default function HomePage() {
  return <SiteShell>
    <div className="axiom-home">
      <section className="axiom-hero">
        <div className="axiom-hero-copy">
          <p className="eyebrow">OPEN CORE RUNTIME SECURITY FOR AI AGENTS</p>
          <h1>Discover every agent.<br />Govern every action.</h1>
          <p className="axiom-lede">Axiom maps non-human identities, reveals what they can reach, and evaluates each MCP tool call at the runtime boundary.</p>
          <div className="axiom-actions"><Link className="axiom-button primary" href="/playground">Explore the playground</Link><Link className="axiom-button" href="/docs">Read the docs</Link></div>
          <p className="axiom-meta">OPEN CORE <span>·</span> SELF HOSTED <span>·</span> DESIGNED FOR AI-AGENT ENVIRONMENTS</p>
        </div>
        <div className="axiom-gate-card">
          <div className="axiom-card-kicker"><span>A TOOL CALL MEETS THE GATE</span><i>SYNTHETIC FIXTURE</i></div>
          <div className="axiom-gate-axis">INBOUND MCP REQUEST <span>AXIOM</span></div>
          {calls.map((call, i) => <div className="axiom-call-row" key={call.tool}><small>0{i + 1}</small><div><b>{call.tool}</b><code>{call.detail}</code></div><strong className={call.verdict === "DENIED" ? "deny" : "permit"}>{call.verdict}</strong></div>)}
        </div>
      </section>

      <section className="axiom-section">
        <p className="eyebrow">ONE CONTROL PLANE, THREE JOBS</p>
        <h2>See the identity. Understand the access. Set the boundary.</h2>
        <div className="axiom-step-grid">{steps.map(step => <article className="axiom-step" key={step.n}><p className="eyebrow orange">{step.n}</p><h3>{step.title}</h3><p className="axiom-step-tags">{step.tags}</p></article>)}</div>
      </section>

      <section className="axiom-guardrails">
        <div><p className="eyebrow">RUNTIME GUARDRAILS</p><h2>Policy before execution.<br />Evidence after every decision.</h2><p>Route agent calls through a local gateway, inspect the decision path, and keep a redacted audit trail.</p></div>
        <div className="axiom-process">{[["01", "Parse the request", "Inspect structured arguments before execution."], ["02", "Evaluate policy", "Match principal, action, resource, and context."], ["03", "Record the verdict", "Keep a decision trail for review."]].map(([n, title, desc]) => <div key={n}><b>{n}</b><span><strong>{title}</strong><small>{desc}</small></span></div>)}</div>
      </section>

      <section className="axiom-quickstart"><div><p className="eyebrow">START WITH A LOCAL DEMO</p><h2>Try Axiom on your own machine.</h2><p>Explore synthetic scenarios, then follow the deployment guide for your environment.</p></div><code>$ docker compose up axiom-gateway</code></section>
    </div>
  </SiteShell>;
}
