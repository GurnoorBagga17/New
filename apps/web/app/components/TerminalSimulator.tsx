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
  {
    id: "kill-switch",
    name: "Emergency Kill Switch",
    badge: "REVOKED • 0.1ms",
    badgeType: "danger",
    command: "axiom kill-switch --principal Agent::\"reporting-worker-4\" --cascade",
    latency: "0.1ms",
    terminalLogs: [
      { time: "14:26:04.001", tag: "KILL_SWITCH", tagType: "danger", text: "Cryptographic revocation signal dispatched for Agent::\"reporting-worker-4\"" },
      { time: "14:26:04.002", tag: "SPICEDB", tagType: "danger", text: "Severed 3 delegation hops in SpiceDB relation graph • Latency: 0.08ms" },
      { time: "14:26:04.003", tag: "OPENBAO", tagType: "warn", text: "Revoked 4 dynamic database leases (TTL forced to 0s)" },
      { time: "14:26:04.004", tag: "EXTMCP", tagType: "danger", text: "Fail-closed circuit tripped: 14 downstream tool calls blocked instantly" },
    ],
    traceJson: {
      decision: "REVOKED",
      latencyMs: 0.12,
      permissionValidation: "stopped",
      interceptContext: {
        principal: "Agent::\"reporting-worker-4\"",
        action: "EMERGENCY_KILL_SWITCH",
        reason: "CAUSAL_CASCADE_ISOLATION",
        delegationHopsSevered: 3,
        downstreamBlockedToolCalls: 14,
        openBaoLeasesRevoked: 4,
        auditHash: "0x3e1a...7c89",
      },
    },
    cedarPolicy: `forbid (
  principal == Agent::"reporting-worker-4",
  action,
  resource
) when {
  context.emergency.kill_switch_active == true
};`,
    status: "stopped",
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

  const handleTriggerKillSwitch = () => {
    setActiveIdx(3);
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
    <div
      className="rounded-2xl border border-slate-300/90 bg-white shadow-xl shadow-slate-200/50 overflow-hidden flex flex-col"
      style={{ backgroundColor: "#ffffff", borderColor: "#cbd5e1" }}
      aria-label="Split Terminal and Policy Trace Simulator"
    >
      {/* Top Window Bar */}
      <div
        className="px-4 sm:px-5 py-3 border-b flex flex-wrap items-center justify-between gap-3"
        style={{ backgroundColor: "#f8fafc", borderColor: "#e2e8f0" }}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: "#ef4444" }} />
            <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: "#f59e0b" }} />
            <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: "#10b981" }} />
          </div>
          <span
            className="text-xs font-bold font-mono tracking-wide uppercase"
            style={{ color: "#0f172a" }}
          >
            Split Terminal &amp; Policy Trace Simulator
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Scenario Tab Buttons */}
          <div
            className="inline-flex items-center p-1 rounded-lg gap-1 border"
            style={{ backgroundColor: "#e2e8f0", borderColor: "#cbd5e1" }}
          >
            {SCENARIOS.map((sc, i) => {
              const isActive = activeIdx === i;
              return (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => handleScenarioChange(i)}
                  className="px-3 py-1.5 rounded-md text-xs font-mono transition-all cursor-pointer"
                  style={{
                    backgroundColor: isActive ? "#ffffff" : "transparent",
                    color: isActive ? "#0f172a" : "#475569",
                    fontWeight: isActive ? 700 : 500,
                    boxShadow: isActive ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
                  }}
                >
                  {sc.name}
                </button>
              );
            })}
          </div>

          {/* Trigger Emergency Kill Switch Action Button */}
          <button
            type="button"
            onClick={handleTriggerKillSwitch}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold text-white transition-all cursor-pointer shadow-sm border"
            style={{
              backgroundColor: "#dc2626",
              borderColor: "#b91c1c",
              color: "#ffffff",
            }}
            title="Simulate immediate cluster-wide revocation"
          >
            <span className="text-sm leading-none" style={{ color: "#ffffff" }}>⏻</span>
            <span style={{ color: "#ffffff" }}>Trigger Emergency Kill Switch</span>
          </button>
        </div>
      </div>

      {/* Main Split Grid */}
      <div
        className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x min-h-[340px]"
        style={{ borderColor: "#e2e8f0" }}
      >
        {/* LEFT COLUMN: Terminal */}
        <div
          className="lg:col-span-7 flex flex-col justify-between p-5"
          style={{ backgroundColor: "#f8fafc" }}
        >
          <div>
            <div
              className="flex items-center justify-between pb-2.5 mb-3 border-b text-xs font-mono"
              style={{ borderColor: "#e2e8f0" }}
            >
              <span className="font-bold" style={{ color: "#334155" }}>axiom-gateway : zsh</span>
              <button
                type="button"
                className="flex items-center gap-1 transition-colors cursor-pointer text-xs font-medium"
                style={{ color: "#475569" }}
                onClick={() => {
                  setIsReplaying(true);
                  setVisibleCount(1);
                }}
                title="Re-run simulation"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
                <span>Replay</span>
              </button>
            </div>

            <div
              className="font-mono text-xs leading-relaxed max-h-[230px] overflow-y-auto space-y-1.5"
              ref={terminalScrollRef}
            >
              <div
                className="flex items-center gap-2 mb-2 pb-1 font-semibold border-b"
                style={{ borderColor: "#e2e8f0" }}
              >
                <span className="select-none font-bold" style={{ color: "#64748b" }}>~</span>
                <span className="select-none font-bold" style={{ color: "#16a34a" }}>$</span>
                <span className="font-bold" style={{ color: "#0f172a" }}>{scenario.command}</span>
              </div>

              {scenario.terminalLogs.slice(0, visibleCount).map((log, i) => {
                const tagConfig = {
                  danger: { bg: "#fee2e2", color: "#991b1b", border: "#fca5a5" },
                  warn: { bg: "#fef3c7", color: "#92400e", border: "#fcd34d" },
                  success: { bg: "#dcfce7", color: "#166534", border: "#86efac" },
                  info: { bg: "#e0f2fe", color: "#075985", border: "#7dd3fc" },
                }[log.tagType];

                const textConfig = {
                  danger: { color: "#7f1d1d", fontWeight: 600 },
                  warn: { color: "#78350f", fontWeight: 500 },
                  success: { color: "#14532d", fontWeight: 500 },
                  info: { color: "#1e293b", fontWeight: 400 },
                }[log.tagType];

                return (
                  <div key={i} className="flex items-start gap-2 py-0.5 leading-snug">
                    <span
                      className="text-[10px] flex-shrink-0 select-none pt-0.5"
                      style={{ color: "#64748b" }}
                    >
                      {log.time}
                    </span>
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] flex-shrink-0 font-bold border"
                      style={{
                        backgroundColor: tagConfig.bg,
                        color: tagConfig.color,
                        borderColor: tagConfig.border,
                      }}
                    >
                      [{log.tag}]
                    </span>
                    <span
                      className="flex-1 break-all"
                      style={{
                        color: textConfig.color,
                        fontWeight: textConfig.fontWeight,
                      }}
                    >
                      {log.text}
                    </span>
                  </div>
                );
              })}

              <div className="pt-1">
                <span
                  className="w-2 h-4 inline-block animate-pulse align-middle"
                  style={{ backgroundColor: "#4f46e5" }}
                />
              </div>
            </div>
          </div>

          {/* Quick status pill at terminal bottom */}
          <div
            className="flex items-center justify-between pt-3 mt-4 border-t"
            style={{ borderColor: "#e2e8f0" }}
          >
            {scenario.badgeType === "danger" ? (
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold border"
                style={{
                  backgroundColor: "#fee2e2",
                  color: "#991b1b",
                  borderColor: "#fca5a5",
                }}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#dc2626" }} />
                <span>{scenario.badge}</span>
              </span>
            ) : scenario.badgeType === "success" ? (
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold border"
                style={{
                  backgroundColor: "#dcfce7",
                  color: "#166534",
                  borderColor: "#86efac",
                }}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#16a34a" }} />
                <span>{scenario.badge}</span>
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold border"
                style={{
                  backgroundColor: "#fef3c7",
                  color: "#92400e",
                  borderColor: "#fcd34d",
                }}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#d97706" }} />
                <span>{scenario.badge}</span>
              </span>
            )}
            <span className="text-xs font-mono font-medium" style={{ color: "#475569" }}>
              Fail-closed runtime boundary
            </span>
          </div>
        </div>

        {/* RIGHT COLUMN: Policy Trace / Cedar Guardrail */}
        <div
          className="lg:col-span-5 flex flex-col justify-between p-5"
          style={{ backgroundColor: "#ffffff" }}
        >
          <div
            className="flex items-center justify-between pb-2.5 mb-3 border-b"
            style={{ borderColor: "#e2e8f0" }}
          >
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="text-xs font-mono transition-colors pb-0.5 cursor-pointer"
                style={{
                  color: activeTab === "json" ? "#4338ca" : "#64748b",
                  fontWeight: activeTab === "json" ? 700 : 500,
                  borderBottom: activeTab === "json" ? "2px solid #4338ca" : "2px solid transparent",
                }}
                onClick={() => setActiveTab("json")}
              >
                Runtime Trace JSON
              </button>
              <button
                type="button"
                className="text-xs font-mono transition-colors pb-0.5 cursor-pointer"
                style={{
                  color: activeTab === "cedar" ? "#4338ca" : "#64748b",
                  fontWeight: activeTab === "cedar" ? 700 : 500,
                  borderBottom: activeTab === "cedar" ? "2px solid #4338ca" : "2px solid transparent",
                }}
                onClick={() => setActiveTab("cedar")}
              >
                Cedar Policy Rule
              </button>
            </div>
            {activeTab === "json" && (
              <button
                type="button"
                className="text-xs font-mono px-2.5 py-0.5 rounded border transition-colors cursor-pointer font-medium"
                style={{
                  color: "#334155",
                  backgroundColor: "#f8fafc",
                  borderColor: "#cbd5e1",
                }}
                onClick={handleCopyJson}
              >
                {copied ? "Copied!" : "Copy JSON"}
              </button>
            )}
          </div>

          <div className="font-mono text-xs leading-relaxed overflow-x-auto flex-1 max-h-[250px]">
            {activeTab === "json" ? (
              <pre style={{ margin: 0, color: "#1e293b" }}>
                <code>
                  {`{\n`}
                  <span style={{ color: "#3730a3", fontWeight: 600 }}>  "decision"</span>
                  <span style={{ color: "#475569" }}>: </span>
                  <span
                    className="font-bold px-2 py-0.5 rounded border"
                    style={{
                      backgroundColor:
                        scenario.status === "stopped" || activeIdx === 3
                          ? "#fee2e2"
                          : scenario.status === "permitted"
                          ? "#dcfce7"
                          : "#fef3c7",
                      color:
                        scenario.status === "stopped" || activeIdx === 3
                          ? "#991b1b"
                          : scenario.status === "permitted"
                          ? "#166534"
                          : "#92400e",
                      borderColor:
                        scenario.status === "stopped" || activeIdx === 3
                          ? "#fca5a5"
                          : scenario.status === "permitted"
                          ? "#86efac"
                          : "#fcd34d",
                    }}
                  >
                    "{activeIdx === 3 ? "REVOKED" : scenario.status === "stopped" ? "DENY" : scenario.status === "permitted" ? "PERMIT" : "SUSPEND"}"
                  </span>
                  {`,\n`}
                  <span style={{ color: "#3730a3", fontWeight: 600 }}>  "latencyMs"</span>
                  <span style={{ color: "#475569" }}>: </span>
                  <span style={{ color: "#b45309", fontWeight: 700 }}>{scenario.latency.replace("ms", "")}</span>
                  {`,\n`}
                  <span style={{ color: "#3730a3", fontWeight: 600 }}>  "permissionValidation"</span>
                  <span style={{ color: "#475569" }}>: </span>
                  <span
                    className="font-bold px-2 py-0.5 rounded border"
                    style={{
                      backgroundColor:
                        scenario.status === "stopped" || activeIdx === 3
                          ? "#fee2e2"
                          : scenario.status === "permitted"
                          ? "#dcfce7"
                          : "#fef3c7",
                      color:
                        scenario.status === "stopped" || activeIdx === 3
                          ? "#991b1b"
                          : scenario.status === "permitted"
                          ? "#166534"
                          : "#92400e",
                      borderColor:
                        scenario.status === "stopped" || activeIdx === 3
                          ? "#fca5a5"
                          : scenario.status === "permitted"
                          ? "#86efac"
                          : "#fcd34d",
                    }}
                  >
                    "{activeIdx === 3 ? "revoked" : scenario.status}"
                  </span>
                  {`,\n`}
                  <span style={{ color: "#3730a3", fontWeight: 600 }}>  "interceptContext"</span>
                  <span style={{ color: "#475569" }}>{": {\n"}</span>
                  {activeIdx === 0 && (
                    <>
                      <span style={{ color: "#3730a3", fontWeight: 600 }}>    "principal"</span>
                      <span style={{ color: "#475569" }}>: </span>
                      <span style={{ color: "#166534", fontWeight: 500 }}>"Agent::reporting-worker-4"</span>
                      {`,\n`}
                      <span style={{ color: "#3730a3", fontWeight: 600 }}>    "tool"</span>
                      <span style={{ color: "#475569" }}>: </span>
                      <span style={{ color: "#166534", fontWeight: 500 }}>"db.execute_query"</span>
                      {`,\n`}
                      <span style={{ color: "#3730a3", fontWeight: 600 }}>    "blockedArgument"</span>
                      <span style={{ color: "#475569" }}>: </span>
                      <span
                        className="font-bold px-1.5 py-0.5 rounded border"
                        style={{
                          backgroundColor: "#fee2e2",
                          color: "#991b1b",
                          borderColor: "#fca5a5",
                        }}
                      >
                        "DROP TABLE customer_records"
                      </span>
                      {`,\n`}
                      <span style={{ color: "#3730a3", fontWeight: 600 }}>    "signatureMatched"</span>
                      <span style={{ color: "#475569" }}>: </span>
                      <span style={{ color: "#166534", fontWeight: 500 }}>"SQL_INJECTION_DESTRUCTIVE"</span>
                      {`,\n`}
                      <span style={{ color: "#3730a3", fontWeight: 600 }}>    "auditHash"</span>
                      <span style={{ color: "#475569" }}>: </span>
                      <span style={{ color: "#166534", fontWeight: 500 }}>"0x8f2d...9a12"</span>
                      {`\n`}
                    </>
                  )}
                  {activeIdx === 1 && (
                    <>
                      <span style={{ color: "#3730a3", fontWeight: 600 }}>    "principal"</span>
                      <span style={{ color: "#475569" }}>: </span>
                      <span style={{ color: "#166534", fontWeight: 500 }}>"Agent::analytics-bot"</span>
                      {`,\n`}
                      <span style={{ color: "#3730a3", fontWeight: 600 }}>    "tool"</span>
                      <span style={{ color: "#475569" }}>: </span>
                      <span style={{ color: "#166534", fontWeight: 500 }}>"warehouse.read"</span>
                      {`,\n`}
                      <span style={{ color: "#3730a3", fontWeight: 600 }}>    "ephemeralLeaseId"</span>
                      <span style={{ color: "#475569" }}>: </span>
                      <span style={{ color: "#166534", fontWeight: 500 }}>"bao-lease-8902-dynamic"</span>
                      {`,\n`}
                      <span style={{ color: "#3730a3", fontWeight: 600 }}>    "ttlSeconds"</span>
                      <span style={{ color: "#475569" }}>: </span>
                      <span style={{ color: "#b45309", fontWeight: 700 }}>60</span>
                      {`,\n`}
                      <span style={{ color: "#3730a3", fontWeight: 600 }}>    "zeroSecretsExposedToClient"</span>
                      <span style={{ color: "#475569" }}>: </span>
                      <span
                        className="font-bold px-1.5 py-0.5 rounded border"
                        style={{
                          backgroundColor: "#dcfce7",
                          color: "#166534",
                          borderColor: "#86efac",
                        }}
                      >
                        true
                      </span>
                      {`\n`}
                    </>
                  )}
                  {activeIdx === 2 && (
                    <>
                      <span style={{ color: "#3730a3", fontWeight: 600 }}>    "tool"</span>
                      <span style={{ color: "#475569" }}>: </span>
                      <span style={{ color: "#166534", fontWeight: 500 }}>"crm.update_lead"</span>
                      {`,\n`}
                      <span style={{ color: "#3730a3", fontWeight: 600 }}>    "reason"</span>
                      <span style={{ color: "#475569" }}>: </span>
                      <span
                        className="font-bold px-1.5 py-0.5 rounded border"
                        style={{
                          backgroundColor: "#fef3c7",
                          color: "#92400e",
                          borderColor: "#fcd34d",
                        }}
                      >
                        "SCHEMA_HASH_DRIFT"
                      </span>
                      {`,\n`}
                      <span style={{ color: "#3730a3", fontWeight: 600 }}>    "expectedHash"</span>
                      <span style={{ color: "#475569" }}>: </span>
                      <span style={{ color: "#166534", fontWeight: 500 }}>"sha256:3a7b4e..."</span>
                      {`,\n`}
                      <span style={{ color: "#3730a3", fontWeight: 600 }}>    "actionTaken"</span>
                      <span style={{ color: "#475569" }}>: </span>
                      <span style={{ color: "#166534", fontWeight: 500 }}>"QUARANTINE_PENDING_REVIEW"</span>
                      {`\n`}
                    </>
                  )}
                  {activeIdx === 3 && (
                    <>
                      <span style={{ color: "#3730a3", fontWeight: 600 }}>    "principal"</span>
                      <span style={{ color: "#475569" }}>: </span>
                      <span style={{ color: "#166534", fontWeight: 500 }}>"Agent::reporting-worker-4"</span>
                      {`,\n`}
                      <span style={{ color: "#3730a3", fontWeight: 600 }}>    "action"</span>
                      <span style={{ color: "#475569" }}>: </span>
                      <span
                        className="font-bold px-1.5 py-0.5 rounded border"
                        style={{
                          backgroundColor: "#fee2e2",
                          color: "#991b1b",
                          borderColor: "#fca5a5",
                        }}
                      >
                        "EMERGENCY_KILL_SWITCH"
                      </span>
                      {`,\n`}
                      <span style={{ color: "#3730a3", fontWeight: 600 }}>    "delegationHopsSevered"</span>
                      <span style={{ color: "#475569" }}>: </span>
                      <span style={{ color: "#b45309", fontWeight: 700 }}>3</span>
                      {`,\n`}
                      <span style={{ color: "#3730a3", fontWeight: 600 }}>    "downstreamBlockedToolCalls"</span>
                      <span style={{ color: "#475569" }}>: </span>
                      <span style={{ color: "#b45309", fontWeight: 700 }}>14</span>
                      {`,\n`}
                      <span style={{ color: "#3730a3", fontWeight: 600 }}>    "openBaoLeasesRevoked"</span>
                      <span style={{ color: "#475569" }}>: </span>
                      <span style={{ color: "#b45309", fontWeight: 700 }}>4</span>
                      {`,\n`}
                      <span style={{ color: "#3730a3", fontWeight: 600 }}>    "auditHash"</span>
                      <span style={{ color: "#475569" }}>: </span>
                      <span style={{ color: "#166534", fontWeight: 500 }}>"0x3e1a...7c89"</span>
                      {`\n`}
                    </>
                  )}
                  <span style={{ color: "#475569" }}>{"  }\n"}</span>
                  {`}`}
                </code>
              </pre>
            ) : (
              <pre
                className="font-mono text-xs leading-relaxed whitespace-pre-wrap"
                style={{ margin: 0, color: "#0f172a" }}
              >
                <code>{scenario.cedarPolicy}</code>
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
