"use client";

import React, { useState, useEffect, useRef } from "react";

interface Scenario {
  id: string;
  name: string;
  badge: string;
  badgeType: "danger" | "success" | "warning";
  command: string;
  latency: string;
  terminalLogs: { time: string; tag: string; tagType: "info" | "warn" | "danger" | "success"; text: string }[];
  traceJson: object;
  cedarPolicy: string;
  status: "stopped" | "permitted" | "quarantined";
}

const SCENARIOS: Scenario[] = [
  {
    id: "sql-block",
    name: "SQL Injection Intercept",
    badge: "BLOCKED • 3.1ms",
    badgeType: "danger",
    command: "docker compose up axiom-gateway",
    latency: "3.1ms",
    terminalLogs: [
      { time: "14:26:01.104", tag: "GATEWAY", tagType: "info", text: "axiom-gateway v0.4.2 listening on :9090 (mcp-proxy)" },
      { time: "14:26:01.118", tag: "SESSION", tagType: "info", text: "Client connected: Agent::\"reporting-worker-4\"" },
      { time: "14:26:01.230", tag: "TOOL_CALL", tagType: "warn", text: "Intercepted tools/call -> db.execute_query" },
      { time: "14:26:01.231", tag: "VALIDATOR", tagType: "danger", text: "AST scan matched pattern: DESTRUCTIVE_DDL (DROP TABLE)" },
      { time: "14:26:01.232", tag: "CEDAR", tagType: "danger", text: "Policy 'deny_drop_table' matched -> Decision: DENY" },
      { time: "14:26:01.233", tag: "INTERCEPT", tagType: "danger", text: "BLOCKED in 3.1ms • Fail-closed HTTP 403 returned to agent" },
    ],
    traceJson: {
      decision: "DENY",
      latencyMs: 3.12,
      permissionValidation: "stopped",
      interceptContext: {
        principal: "Agent::\"reporting-worker-4\"",
        tool: "db.execute_query",
        blockedArgument: "DROP TABLE customer_records",
        signatureMatched: "SQL_INJECTION_DESTRUCTIVE",
        auditHash: "0x8f2d...9a12",
      },
    },
    cedarPolicy: `forbid (
  principal in Group::"analyst_agents",
  action == Action::"database:execute",
  resource in Database::"production"
) when {
  context.ast.is_destructive == true
};`,
    status: "stopped",
  },
  {
    id: "secret-lease",
    name: "Ephemeral DB Secret Lease",
    badge: "PERMITTED • 1.8ms",
    badgeType: "success",
    command: "axiom eval --tool warehouse.read",
    latency: "1.8ms",
    terminalLogs: [
      { time: "14:26:02.040", tag: "GATEWAY", tagType: "info", text: "Verified NHI attestation via RFC 8707 token exchange" },
      { time: "14:26:02.041", tag: "CEDAR", tagType: "success", text: "Policy 'allow_ephemeral_reads' matched -> Decision: PERMIT" },
      { time: "14:26:02.042", tag: "OPENBAO", tagType: "info", text: "Minted single-use dynamic credential lease (TTL: 60s)" },
      { time: "14:26:02.043", tag: "PROXY", tagType: "success", text: "Executed query with injected lease • Latency: 1.8ms" },
    ],
    traceJson: {
      decision: "PERMIT",
      latencyMs: 1.84,
      permissionValidation: "permitted",
      interceptContext: {
        principal: "Agent::\"analytics-bot\"",
        tool: "warehouse.read",
        ephemeralLeaseId: "bao-lease-8902-dynamic",
        ttlSeconds: 60,
        zeroSecretsExposedToClient: true,
      },
    },
    cedarPolicy: `permit (
  principal in Group::"verified_read_agents",
  action == Action::"warehouse:select",
  resource in Table::"q3_aggregates"
) when {
  context.nhi.attested == true
};`,
    status: "permitted",
  },
  {
    id: "tool-drift",
    name: "Unpinned MCP Tool Drift",
    badge: "QUARANTINED • 2.4ms",
    badgeType: "warning",
    command: "axiom verify --manifest mcp.json",
    latency: "2.4ms",
    terminalLogs: [
      { time: "14:26:03.110", tag: "MCP_GATE", tagType: "warn", text: "Catalog tool 'crm.update_lead' schema mismatch detected" },
      { time: "14:26:03.111", tag: "PIN_CHECK", tagType: "danger", text: "Expected SHA256: 3a7b... Got: 9f12... (unpinned upstream)" },
      { time: "14:26:03.112", tag: "GUARDRAIL", tagType: "warn", text: "Invocation suspended • Admin signature required" },
      { time: "14:26:03.113", tag: "QUARANTINE", tagType: "warn", text: "Quarantined tool definition in 2.4ms" },
    ],
    traceJson: {
      decision: "SUSPEND_APPROVAL_REQUIRED",
      latencyMs: 2.41,
      permissionValidation: "quarantined",
      interceptContext: {
        tool: "crm.update_lead",
        reason: "SCHEMA_HASH_DRIFT",
        expectedHash: "sha256:3a7b4e...",
        actualHash: "sha256:9f12c8...",
        actionTaken: "QUARANTINE_PENDING_REVIEW",
      },
    },
    cedarPolicy: `forbid (
  principal,
  action,
  resource
) unless {
  context.tool.schema_hash == context.tool.pinned_hash
};`,
    status: "quarantined",
  },
];

export function TerminalSimulator() {
  const defaultScenario = SCENARIOS[0]!;
  const [activeIdx, setActiveIdx] = useState(0);
  const [activeTab, setActiveTab] = useState<"json" | "cedar">("json");
  const [visibleCount, setVisibleCount] = useState(defaultScenario.terminalLogs.length);
  const [isReplaying, setIsReplaying] = useState(false);
  const [copied, setCopied] = useState(false);
  const terminalScrollRef = useRef<HTMLDivElement>(null);

  const scenario = SCENARIOS[activeIdx] ?? defaultScenario;

  const handleScenarioChange = (idx: number) => {
    setActiveIdx(idx);
    setIsReplaying(true);
    setVisibleCount(1);
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(scenario.traceJson, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Replay typewriter stream
  useEffect(() => {
    if (!isReplaying) return;
    if (visibleCount < scenario.terminalLogs.length) {
      const timer = setTimeout(() => {
        setVisibleCount((prev) => prev + 1);
      }, 160);
      return () => clearTimeout(timer);
    } else {
      setIsReplaying(false);
    }
  }, [isReplaying, visibleCount, scenario.terminalLogs.length]);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalScrollRef.current) {
      terminalScrollRef.current.scrollTop = terminalScrollRef.current.scrollHeight;
    }
  }, [visibleCount]);

  return (
    <div className="simulator-card split-terminal-card" aria-label="Split Terminal and Policy Trace Simulator">
      {/* Top Window Bar */}
      <div className="simulator-card-header">
        <div className="terminal-header-left">
          <div className="window-dots" aria-hidden="true">
            <span className="dot dot-red" />
            <span className="dot dot-yellow" />
            <span className="dot dot-green" />
          </div>
          <span className="card-title">Split Terminal &amp; Policy Trace Simulator</span>
        </div>
        <div className="header-scenario-tabs">
          {SCENARIOS.map((sc, i) => (
            <button
              key={sc.id}
              type="button"
              className={`scenario-nav-btn ${activeIdx === i ? "is-active" : ""}`}
              onClick={() => handleScenarioChange(i)}
            >
              {sc.name}
            </button>
          ))}
        </div>
      </div>

      {/* Main Split Grid */}
      <div className="split-terminal-body">
        {/* LEFT COLUMN: Terminal */}
        <div className="terminal-pane">
          <div className="terminal-meta-bar">
            <span className="terminal-shell-tag">axiom-gateway : zsh</span>
            <button
              type="button"
              className="terminal-replay-btn"
              onClick={() => {
                setIsReplaying(true);
                setVisibleCount(1);
              }}
              title="Re-run simulation"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              <span>Replay</span>
            </button>
          </div>

          <div className="terminal-content" ref={terminalScrollRef}>
            <div className="terminal-command-intro">
              <span className="prompt-tilde">~</span>
              <span className="prompt-dollar">$</span>
              <span className="prompt-cmd">{scenario.command}</span>
            </div>

            {scenario.terminalLogs.slice(0, visibleCount).map((log, i) => (
              <div key={i} className={`terminal-log-row log-${log.tagType}`}>
                <span className="log-time">{log.time}</span>
                <span className={`log-tag tag-${log.tagType}`}>[{log.tag}]</span>
                <span className="log-text">{log.text}</span>
              </div>
            ))}

            <div className="terminal-cursor-row">
              <span className="terminal-cursor" />
            </div>
          </div>

          {/* Quick status pill at terminal bottom */}
          <div className="terminal-bottom-status">
            <span className={`status-pill pill-${scenario.badgeType}`}>
              <span className="status-dot" />
              {scenario.badge}
            </span>
            <span className="status-note">Fail-closed runtime boundary</span>
          </div>
        </div>

        {/* RIGHT COLUMN: Policy Trace / Cedar Guardrail */}
        <div className="trace-pane">
          <div className="trace-tabs-bar">
            <div className="trace-view-toggle">
              <button
                type="button"
                className={`trace-tab-btn ${activeTab === "json" ? "is-active" : ""}`}
                onClick={() => setActiveTab("json")}
              >
                Runtime Trace JSON
              </button>
              <button
                type="button"
                className={`trace-tab-btn ${activeTab === "cedar" ? "is-active" : ""}`}
                onClick={() => setActiveTab("cedar")}
              >
                Cedar Policy Rule
              </button>
            </div>
            {activeTab === "json" && (
              <button type="button" className="copy-trace-btn" onClick={handleCopyJson}>
                {copied ? "Copied!" : "Copy JSON"}
              </button>
            )}
          </div>

          <div className="trace-code-viewer">
            {activeTab === "json" ? (
              <pre className="json-syntax">
                <code>
                  {`{\n`}
                  <span className="json-key">  "decision"</span>
                  <span className="json-colon">: </span>
                  <span className={`json-val ${scenario.status === "stopped" ? "json-danger" : scenario.status === "permitted" ? "json-success" : "json-warn"}`}>
                    "{scenario.status === "stopped" ? "DENY" : scenario.status === "permitted" ? "PERMIT" : "SUSPEND"}"
                  </span>
                  {`,\n`}
                  <span className="json-key">  "latencyMs"</span>
                  <span className="json-colon">: </span>
                  <span className="json-number">{scenario.latency.replace("ms", "")}</span>
                  {`,\n`}
                  <span className="json-key">  "permissionValidation"</span>
                  <span className="json-colon">: </span>
                  <span className={`json-val ${scenario.status === "stopped" ? "json-danger" : scenario.status === "permitted" ? "json-success" : "json-warn"}`}>
                    "{scenario.status}"
                  </span>
                  {`,\n`}
                  <span className="json-key">  "interceptContext"</span>
                  <span className="json-colon">{": {\n"}</span>
                  {activeIdx === 0 && (
                    <>
                      <span className="json-key">    "principal"</span>
                      <span className="json-colon">: </span>
                      <span className="json-string">"Agent::reporting-worker-4"</span>
                      {`,\n`}
                      <span className="json-key">    "tool"</span>
                      <span className="json-colon">: </span>
                      <span className="json-string">"db.execute_query"</span>
                      {`,\n`}
                      <span className="json-key">    "blockedArgument"</span>
                      <span className="json-colon">: </span>
                      <span className="json-danger">"DROP TABLE customer_records"</span>
                      {`,\n`}
                      <span className="json-key">    "signatureMatched"</span>
                      <span className="json-colon">: </span>
                      <span className="json-string">"SQL_INJECTION_DESTRUCTIVE"</span>
                      {`,\n`}
                      <span className="json-key">    "auditHash"</span>
                      <span className="json-colon">: </span>
                      <span className="json-string">"0x8f2d...9a12"</span>
                      {`\n`}
                    </>
                  )}
                  {activeIdx === 1 && (
                    <>
                      <span className="json-key">    "principal"</span>
                      <span className="json-colon">: </span>
                      <span className="json-string">"Agent::analytics-bot"</span>
                      {`,\n`}
                      <span className="json-key">    "tool"</span>
                      <span className="json-colon">: </span>
                      <span className="json-string">"warehouse.read"</span>
                      {`,\n`}
                      <span className="json-key">    "ephemeralLeaseId"</span>
                      <span className="json-colon">: </span>
                      <span className="json-string">"bao-lease-8902-dynamic"</span>
                      {`,\n`}
                      <span className="json-key">    "ttlSeconds"</span>
                      <span className="json-colon">: </span>
                      <span className="json-number">60</span>
                      {`,\n`}
                      <span className="json-key">    "zeroSecretsExposedToClient"</span>
                      <span className="json-colon">: </span>
                      <span className="json-success">true</span>
                      {`\n`}
                    </>
                  )}
                  {activeIdx === 2 && (
                    <>
                      <span className="json-key">    "tool"</span>
                      <span className="json-colon">: </span>
                      <span className="json-string">"crm.update_lead"</span>
                      {`,\n`}
                      <span className="json-key">    "reason"</span>
                      <span className="json-colon">: </span>
                      <span className="json-warn">"SCHEMA_HASH_DRIFT"</span>
                      {`,\n`}
                      <span className="json-key">    "expectedHash"</span>
                      <span className="json-colon">: </span>
                      <span className="json-string">"sha256:3a7b4e..."</span>
                      {`,\n`}
                      <span className="json-key">    "actionTaken"</span>
                      <span className="json-colon">: </span>
                      <span className="json-string">"QUARANTINE_PENDING_REVIEW"</span>
                      {`\n`}
                    </>
                  )}
                  <span className="json-colon">{"  }\n"}</span>
                  {`}`}
                </code>
              </pre>
            ) : (
              <pre className="cedar-syntax">
                <code>{scenario.cedarPolicy}</code>
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
