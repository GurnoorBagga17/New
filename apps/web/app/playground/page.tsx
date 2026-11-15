"use client";

import React, { useState } from "react";
import Link from "next/link";
import { SiteShell } from "../components/SiteShell";

interface Preset {
  id: string;
  name: string;
  category: "attack" | "legitimate" | "anomaly";
  principal: string;
  tool: string;
  args: string;
  mode: "enforce" | "observe";
  verdict: "DENY" | "PERMIT" | "QUARANTINE";
  latencyMs: number;
  astThreat: string;
  cedarRule: string;
  merkleHash: string;
  summary: string;
}

const PRESETS: Preset[] = [
  {
    id: "sql-injection",
    name: "SQL Injection Exploit",
    category: "attack",
    principal: 'Agent::"autonomous-analyst-4"',
    tool: "db.execute_query",
    args: JSON.stringify({ query: "DROP TABLE customer_records; --", database: "prod_warehouse" }, null, 2),
    mode: "enforce",
    verdict: "DENY",
    latencyMs: 2.84,
    astThreat: "DESTRUCTIVE_DDL (DROP TABLE detected in AST statement list)",
    cedarRule: `forbid (
  principal in Group::"analyst_agents",
  action == Action::"db:execute",
  resource in Database::"production"
) when {
  context.ast.is_destructive == true
};`,
    merkleHash: "0x8f2d91a2bc4e7710adfe5601289cf32a",
    summary: "AST parser detected unescaped DDL statement embedded in autonomous tool arguments. The fail-closed Cedar policy rejected invocation in 2.84ms before any SQL connection was initiated.",
  },
  {
    id: "path-traversal",
    name: "Prompt Injection Path Traversal",
    category: "attack",
    principal: 'Agent::"support-summarizer"',
    tool: "filesystem.read_file",
    args: JSON.stringify({ path: "/var/run/secrets/kubernetes.io/serviceaccount/token" }, null, 2),
    mode: "enforce",
    verdict: "DENY",
    latencyMs: 1.95,
    astThreat: "PRIVILEGED_PATH_ESCAPE (Attempt to read root token mount)",
    cedarRule: `permit (
  principal,
  action == Action::"filesystem:read",
  resource
) when {
  resource.path.like("/app/sandbox/*")
};`,
    merkleHash: "0x3e17b8192a0094cd1b55928ea1109dc7",
    summary: "Agent attempted reading the Kubernetes service account token after an indirect prompt injection. Axiom's path canonicalizer trapped the sandbox escape and returned HTTP 403.",
  },
  {
    id: "ephemeral-secret",
    name: "Dynamic Ephemeral DB Lease",
    category: "legitimate",
    principal: 'Agent::"finance-reconciliation"',
    tool: "warehouse.select_aggregate",
    args: JSON.stringify({ table: "q4_settlements", region: "apac", max_rows: 500 }, null, 2),
    mode: "enforce",
    verdict: "PERMIT",
    latencyMs: 1.42,
    astThreat: "NONE (Read-only AST query, bounded result limit)",
    cedarRule: `permit (
  principal in Group::"finance_agents",
  action == Action::"warehouse:select",
  resource in Table::"q4_settlements"
) when {
  context.nhi.attested == true
};`,
    merkleHash: "0x91cfa30182bb1930ed45710283aa0021",
    summary: "Attestation token verified via RFC 8707 exchange. OpenBao generated a single-use 60s dynamic credential lease injected directly into the upstream connection. Zero static credentials stored on agent.",
  },
  {
    id: "unpinned-drift",
    name: "Unpinned MCP Tool Drift",
    category: "anomaly",
    principal: 'Agent::"crm-sync-bot"',
    tool: "hubspot.patch_contact",
    args: JSON.stringify({ contact_id: "usr_99812", properties: { email: "attacker@pwn.org", role: "admin" } }, null, 2),
    mode: "enforce",
    verdict: "QUARANTINE",
    latencyMs: 3.12,
    astThreat: "SCHEMA_HASH_MISMATCH (Expected sha256:4a12... received sha256:ff89...)",
    cedarRule: `forbid (
  principal,
  action,
  resource
) unless {
  context.tool.schema_hash == context.tool.pinned_hash
};`,
    merkleHash: "0x55aa9102ef713910cbe482910fa38192",
    summary: "The upstream tool server introduced new elevated privilege fields without security team cryptographic sign-off. Tool execution was quarantined pending human approval.",
  },
];

export default function PlaygroundPage() {
  const [selectedPreset, setSelectedPreset] = useState<Preset>(PRESETS[0]!);
  const [activeTab, setActiveTab] = useState<"ast" | "cedar" | "merkle">("ast");
  const [enforcementMode, setEnforcementMode] = useState<"enforce" | "observe">("enforce");
  const [isExecuting, setIsExecuting] = useState(false);
  const [customArgs, setCustomArgs] = useState(selectedPreset.args);
  const [evalLatency, setEvalLatency] = useState(selectedPreset.latencyMs);

  const handleSelectPreset = (preset: Preset) => {
    setSelectedPreset(preset);
    setCustomArgs(preset.args);
    setEvalLatency(preset.latencyMs);
    setIsExecuting(true);
    setTimeout(() => setIsExecuting(false), 240);
  };

  const handleTriggerEval = () => {
    setIsExecuting(true);
    // Simulate real-time jitter between 1.1ms and 3.4ms
    setTimeout(() => {
      setEvalLatency(Number((Math.random() * 1.8 + 1.2).toFixed(2)));
      setIsExecuting(false);
    }, 280);
  };

  // Determine effective verdict based on mode
  const effectiveVerdict =
    enforcementMode === "observe" && selectedPreset.verdict === "DENY"
      ? "WOULD DENY (OBSERVE MODE)"
      : selectedPreset.verdict;

  return (
    <SiteShell>
      <div className="playground-page wrap">
        {/* Header Section */}
        <header className="playground-header">
          <div className="playground-badge">
            <span className="live-dot" />
            <span>SIMULATION • SYNTHETIC SCENARIOS</span>
          </div>
          <h1>Model Context Protocol Security Playground</h1>
          <p className="playground-subtitle">
            Explore example MCP calls, policy paths, and observe-versus-enforce behavior. This playground uses local synthetic fixtures; outcomes and timings are not live runtime measurements.
          </p>
        </header>

        {/* Preset Strip */}
        <section className="preset-selector-strip" aria-label="Preset Scenarios">
          <span className="preset-strip-label">RUN PRE-PACKAGED THREAT SCENARIO:</span>
          <div className="preset-pills">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`preset-pill ${selectedPreset.id === preset.id ? "is-active" : ""}`}
                onClick={() => handleSelectPreset(preset)}
              >
                <span className={`pill-cat-dot cat-${preset.category}`} />
                <span className="preset-name">{preset.name}</span>
                <span className={`preset-badge badge-${preset.verdict.toLowerCase()}`}>
                  {preset.verdict}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Global Toolbar: Mode Switch & Run Button */}
        <div className="playground-toolbar">
          <div className="toolbar-left">
            <span className="toolbar-label">Gateway Policy Mode:</span>
            <div className="mode-toggle">
              <button
                type="button"
                className={`mode-btn ${enforcementMode === "enforce" ? "is-active" : ""}`}
                onClick={() => setEnforcementMode("enforce")}
              >
                <span className="mode-bullet bullet-enforce" />
                Enforce (Fail-Closed)
              </button>
              <button
                type="button"
                className={`mode-btn ${enforcementMode === "observe" ? "is-active" : ""}`}
                onClick={() => setEnforcementMode("observe")}
              >
                <span className="mode-bullet bullet-observe" />
                Observe (Shadow Audit)
              </button>
            </div>
          </div>

          <div className="toolbar-right">
            <button
              type="button"
              className="eval-trigger-button"
              onClick={handleTriggerEval}
              disabled={isExecuting}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>{isExecuting ? "Evaluating Policy..." : "Run Gateway Evaluation"}</span>
            </button>
          </div>
        </div>

        {/* Two-Column Interactive Workspace */}
        <div className="playground-workspace">
          {/* Left Column: Inbound MCP Request Composer */}
          <div className="workspace-card composer-card">
            <div className="workspace-card-header">
              <div className="header-title-group">
                <span className="terminal-dot dot-red" />
                <span className="terminal-dot dot-yellow" />
                <span className="terminal-dot dot-green" />
                <span className="card-title">Inbound MCP Request Payload</span>
              </div>
              <span className="protocol-tag">json-rpc 2.0 • tools/call</span>
            </div>

            <div className="composer-body">
              <div className="meta-field-group">
                <div className="meta-field">
                  <label>Principal (Autonomous Identity)</label>
                  <div className="field-value mono">{selectedPreset.principal}</div>
                </div>
                <div className="meta-field">
                  <label>RFC 8707 Attestation</label>
                  <div className="field-value verified-badge">
                    <span className="verified-check">✓</span> SPIFFE Verified
                  </div>
                </div>
              </div>

              <div className="meta-field">
                <label>Requested MCP Tool</label>
                <div className="field-value tool-badge">{selectedPreset.tool}</div>
              </div>

              <div className="meta-field">
                <label>Tool Invocation Arguments (JSON Payload)</label>
                <div className="code-editor-wrap">
                  <textarea
                    rows={8}
                    value={customArgs}
                    onChange={(e) => setCustomArgs(e.target.value)}
                    className="code-textarea"
                    spellCheck="false"
                  />
                </div>
              </div>
            </div>

            <div className="composer-footer">
              <span className="footer-note">
                AST argument parser actively analyzing parameters for injection patterns.
              </span>
            </div>
          </div>

          {/* Right Column: Inline Gateway Decision Stream */}
          <div className="workspace-card decision-card">
            <div className="workspace-card-header">
              <div className="header-title-group">
                <span className="card-title">Gateway Decision &amp; Audit Trace</span>
              </div>
              <div className="latency-badge">
                <span className="latency-pulse" />
                <span>P99 OVERHEAD: <b>{evalLatency}ms</b></span>
              </div>
            </div>

            <div className="decision-banner-wrap">
              <div
                className={`verdict-banner verdict-${
                  effectiveVerdict.includes("DENY")
                    ? "deny"
                    : effectiveVerdict === "PERMIT"
                    ? "permit"
                    : "quarantine"
                }`}
              >
                <div className="verdict-icon">
                  {effectiveVerdict.includes("DENY") ? "⛔" : effectiveVerdict === "PERMIT" ? "🛡️" : "⚠️"}
                </div>
                <div className="verdict-meta">
                  <span className="verdict-title">GATEWAY VERDICT: {effectiveVerdict}</span>
                  <p className="verdict-summary">{selectedPreset.summary}</p>
                </div>
              </div>
            </div>

            {/* Analysis Tabs */}
            <div className="analysis-tabs-bar">
              <button
                type="button"
                className={`analysis-tab-btn ${activeTab === "ast" ? "is-active" : ""}`}
                onClick={() => setActiveTab("ast")}
              >
                AST Argument Scan
              </button>
              <button
                type="button"
                className={`analysis-tab-btn ${activeTab === "cedar" ? "is-active" : ""}`}
                onClick={() => setActiveTab("cedar")}
              >
                Cedar Policy Match
              </button>
              <button
                type="button"
                className={`analysis-tab-btn ${activeTab === "merkle" ? "is-active" : ""}`}
                onClick={() => setActiveTab("merkle")}
              >
                Merkle Audit Lineage
              </button>
            </div>

            <div className="analysis-content">
              {activeTab === "ast" && (
                <div className="tab-pane ast-pane">
                  <div className="pane-row">
                    <span className="pane-label">AST Scan Outcome:</span>
                    <span className="pane-val danger-text">{selectedPreset.astThreat}</span>
                  </div>
                  <div className="pane-row">
                    <span className="pane-label">Sanitization Engine:</span>
                    <span className="pane-val">Rust AST Walker (AST-v0.4.2)</span>
                  </div>
                  <div className="pane-row">
                    <span className="pane-label">Action Taken:</span>
                    <span className="pane-val">
                      {enforcementMode === "enforce"
                        ? "HTTP 403 Forbidden sent to client; downstream tool skipped."
                        : "Alert log generated; tool call allowed in shadow audit mode."}
                    </span>
                  </div>
                </div>
              )}

              {activeTab === "cedar" && (
                <div className="tab-pane cedar-pane">
                  <pre className="cedar-code">
                    <code>{selectedPreset.cedarRule}</code>
                  </pre>
                </div>
              )}

              {activeTab === "merkle" && (
                <div className="tab-pane merkle-pane">
                  <div className="pane-row">
                    <span className="pane-label">Immutable Root Hash:</span>
                    <span className="pane-val mono-hash">{selectedPreset.merkleHash}</span>
                  </div>
                  <div className="pane-row">
                    <span className="pane-label">PII Masking:</span>
                    <span className="pane-val">Zero customer tokens logged to persistent disk</span>
                  </div>
                  <div className="pane-row">
                    <span className="pane-label">Tamper Resistance:</span>
                    <span className="pane-val">Cryptographically signed by Axiom Enclave</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Visual Pipeline Flow */}
        <section className="pipeline-flow-section">
          <div className="pipeline-flow-header">
            <h3>Inline Execution Pipeline Topology</h3>
            <p>Illustrative flow only. The integrated runtime measurement and verification sequence are not published yet.</p>
          </div>

          <div className="pipeline-nodes-grid">
            <div className="pipeline-node">
              <span className="node-step">01</span>
              <h4>MCP Client / Agent</h4>
              <p>Claude Desktop, LangChain, or custom autonomous runtime initiates <code>tools/call</code>.</p>
            </div>
            <div className="pipeline-connector">→</div>
            <div className="pipeline-node node-active">
              <span className="node-step">02</span>
              <h4>Identity &amp; AST Guard</h4>
              <p>RFC 8707 token exchange attestation and deep Abstract Syntax Tree argument sanitization.</p>
            </div>
            <div className="pipeline-connector">→</div>
            <div className="pipeline-node node-active">
              <span className="node-step">03</span>
              <h4>Cedar Policy Gate</h4>
              <p>Candidate policy evaluation is shown here as a synthetic example; runtime behavior remains subject to integration.</p>
            </div>
            <div className="pipeline-connector">→</div>
            <div className="pipeline-node">
              <span className="node-step">04</span>
              <h4>Target Resource</h4>
              <p>The example flow ends at a target resource; credential handling depends on the configured runtime.</p>
            </div>
          </div>
        </section>

        {/* Bottom CTA Banner */}
        <div className="playground-bottom-cta">
          <div>
            <h3>Ready to run Axiom Gateway locally?</h3>
            <p>Start inspecting your MCP tools in less than 5 minutes with Docker Compose.</p>
          </div>
          <div className="cta-actions">
            <Link href="/docs#quickstart" className="deploy-button">
              Get Started with Quickstart
            </Link>
            <Link href="/benchmarks" className="text-link-button">
              View Verified Benchmarks →
            </Link>
          </div>
        </div>
      </div>
    </SiteShell>
  );
}

