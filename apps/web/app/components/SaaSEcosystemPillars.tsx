"use client";

import React, { useState } from "react";

export function SaaSEcosystemPillars() {
  const [activeTab, setActiveTab] = useState<"ciso" | "dev">("ciso");
  return (
    <section className="saas-pillars-section" id="how-it-works">
      <div className="wrap">
        <div className="problem-comparison-box">
          <div className="problem-header">
            <span className="problem-pill">THE NON-HUMAN IDENTITY PROBLEM</span>
            <h2>Workloads outnumber humans 45-to-1.<br />Traditional IAM only protects humans.</h2>
            <p>Your employees have Okta, Single Sign-On, and 2-Factor Authentication. Your autonomous AI agents, MCP tools, and background workloads have permanent, unmonitored API keys.</p>
          </div>
          <div className="comparison-cards-grid">
            <div className="contrast-card card-human">
              <div className="contrast-card-header"><span className="contrast-badge">TRADITIONAL IAM (OKTA, ENTRA)</span><h3>Human User Perimeter</h3></div>
              <ul className="contrast-list"><li><span className="icon-check">✓</span> 1 Human on 1 Managed Laptop</li><li><span className="icon-check">✓</span> Authenticated via Biometrics / Push MFA</li><li><span className="icon-check">✓</span> Bounded by explicit business hours and manual clicks</li><li><span className="icon-check">✓</span> Access revoked instantly when employee departs</li></ul>
              <div className="contrast-footer"><span className="footer-status status-safe">Well Protected</span></div>
            </div>
            <div className="contrast-card card-agent">
              <div className="contrast-card-header"><span className="contrast-badge badge-warning">THE UNGOVERNED SURFACE</span><h3>AI Agent &amp; Workload Perimeter</h3></div>
              <ul className="contrast-list"><li><span className="icon-cross">✗</span> 45+ autonomous tool calls per second across microservices</li><li><span className="icon-cross">✗</span> Uses permanent static API keys and bearer tokens</li><li><span className="icon-cross">✗</span> Vulnerable to prompt injection, AST tampering &amp; tool drift</li><li><span className="icon-cross">✗</span> 82% of enterprise breaches now involve compromised non-human identities</li></ul>
              <div className="contrast-footer"><span className="footer-status status-danger">High Risk &amp; Blind Spot</span></div>
            </div>
          </div>
        </div>
        <div className="three-pillars-wrap">
          <div className="pillars-intro"><p className="eyebrow">CONTINUOUS LIFECYCLE GOVERNANCE</p><h2>How Axiom Secures Every Autonomous Agent</h2><p className="pillars-subtext">Axiom acts as a transparent, inline zero-trust decision proxy. No code changes to your AI tools, no latency penalty.</p></div>
          <div className="pillars-grid">
            <div className="pillar-card"><div className="pillar-step-badge">STAGE 01</div><div className="pillar-icon">👁️</div><h3>Continuous Discovery</h3><p>Automatically inventory every autonomous agent, subagent, and MCP tool running in your ecosystem. Map identity lineage and identify over-privileged static bearer tokens in passive shadow-observe mode.</p><div className="pillar-meta"><span>✓ 100% Shadow Audit</span><span>✓ Zero Code Changes</span></div></div>
            <div className="pillar-card pillar-card-active"><div className="pillar-step-badge">STAGE 02</div><div className="pillar-icon">🛡️</div><h3>Inline AST &amp; Cedar Guard</h3><p>Intercept calls at machine speed (&lt;3.5ms). Deep AST parsers sanitize arguments against destructive DDL, SSRF, and file traversal, while Cedar policies enforce mathematically verifiable boundaries.</p><div className="pillar-meta"><span>✓ Fail-Closed Protection</span><span>✓ P99 &lt; 3.5ms Overhead</span></div></div>
            <div className="pillar-card"><div className="pillar-step-badge">STAGE 03</div><div className="pillar-icon">🔑</div><h3>Just-In-Time Secret Leases</h3><p>Eliminate hardcoded secrets forever. Upon policy approval, OpenBao mints dynamic, single-use credentials with 60-second TTLs injected directly into the upstream connection.</p><div className="pillar-meta"><span>✓ Zero Static Secrets</span><span>✓ Ephemeral Dynamic TTL</span></div></div>
          </div>
        </div>
        <div className="persona-switcher-box">
          <div className="persona-nav"><span className="persona-lead">WHY LEADING TEAMS CHOOSE AXIOM:</span><div className="persona-tabs">
            <button type="button" className={`persona-tab ${activeTab === "ciso" ? "is-active" : ""}`} onClick={() => setActiveTab("ciso")}>For CISOs &amp; Security Leaders</button>
            <button type="button" className={`persona-tab ${activeTab === "dev" ? "is-active" : ""}`} onClick={() => setActiveTab("dev")}>For AI Engineers &amp; Platform Teams</button>
          </div></div>
          <div className="persona-content-display">
            {activeTab === "ciso" ? <div className="persona-pane"><div className="pane-main"><h3>Enterprise-grade risk reduction without slowing AI innovation.</h3><p>Enable engineering teams to ship autonomous agent features with complete peace of mind. Axiom enforces cryptographic least privilege, eliminates leaked credential exposure, and provides automated, audit-ready compliance evidence.</p><div className="persona-bullets"><div className="bullet-col"><h4>Continuous Compliance Ready</h4><p>Satisfy SOC 2, HIPAA, ISO 27001, and NIST AI RMF with immutable Merkle audit trails.</p></div><div className="bullet-col"><h4>Deterministic Kill-Switch</h4><p>Instantly revoke misbehaving agent sub-trees cluster-wide with a single cryptographic signature.</p></div></div></div><div className="pane-stat"><span className="stat-num">100%</span><span className="stat-label">Fail-Closed Guarantee</span><p className="stat-sub">Network partition or policy timeout halts unverified execution automatically.</p></div></div> : <div className="persona-pane"><div className="pane-main"><h3>Drop-in proxy for Claude Desktop, LangGraph, and Cursor.</h3><p>No rewrites. No custom SDK bloat. Run Axiom as a lightweight local sidecar or Docker container. Author readable, declarative Cedar policies as code and test them in an offline playground.</p><div className="persona-bullets"><div className="bullet-col"><h4>Sub-Millisecond Rust Core</h4><p>Ultra-low P99 tail latency ensures zero perceptible delay on streaming LLM responses.</p></div><div className="bullet-col"><h4>Standard MCP Spec</h4><p>Full support for Model Context Protocol JSON-RPC frames, SSE streaming, and OAuth 2.1 RFC 8707.</p></div></div></div><div className="pane-stat"><span className="stat-num">&lt; 3.5ms</span><span className="stat-label">P99 Gateway Overhead</span><p className="stat-sub">Engineered with Rust, zero-copy deserialization, and in-memory Cedar WASM.</p></div></div>}
          </div>
        </div>
      </div>
    </section>
  );
}
