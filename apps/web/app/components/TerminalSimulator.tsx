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
    setActiveIdx(3); // Switch to Kill Switch scenario
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
    <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xl shadow-slate-200/50 overflow-hidden flex flex-col" aria-label="Split Terminal and Policy Trace Simulator">
      {/* Top Window Bar */}
      <div className="px-5 py-3 bg-slate-50/80 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-2xs inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-2xs inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-2xs inline-block" />
          </div>
          <span className="text-xs font-bold text-slate-800 font-mono tracking-wide uppercase">
            Split Terminal &amp; Policy Trace Simulator
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {SCENARIOS.map((sc, i) => (
            <button
              key={sc.id}
              type="button"
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeIdx === i
                  ? "bg-white text-indigo-700 shadow-xs border border-indigo-200 ring-1 ring-indigo-200/50 font-bold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
              onClick={() => handleScenarioChange(i)}
            >
              {sc.name}
            </button>
          ))}
          {/* Interactive Trigger Emergency Kill Switch Button */}
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold text-white bg-rose-600 hover:bg-rose-700 transition-all cursor-pointer shadow-xs ml-2 border border-rose-700"
            onClick={handleTriggerKillSwitch}
            title="Simulate immediate cluster-wide revocation"
          >
            <span className="text-white text-sm leading-none">⏻</span>
            <span className="text-white">Trigger Emergency Kill Switch</span>
          </button>
        </div>
      </div>

      {/* Main Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200/80 bg-white min-h-[340px]">
        {/* LEFT COLUMN: Terminal */}
        <div className="lg:col-span-7 flex flex-col justify-between bg-slate-50/20 p-5">
          <div>
            <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-200/60 text-xs text-slate-500 font-mono">
              <span className="font-semibold text-slate-600">axiom-gateway : zsh</span>
              <button
                type="button"
                className="flex items-center gap-1 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer text-xs"
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

            <div className="font-mono text-[11px] leading-relaxed max-h-[220px] overflow-y-auto space-y-1.5 scrollbar-thin" ref={terminalScrollRef}>
              <div className="flex items-center gap-2 mb-2 pb-1 text-slate-800 font-semibold border-b border-slate-100">
                <span className="text-slate-400 select-none">~</span>
                <span className="text-emerald-600 font-bold select-none">$</span>
                <span className="text-slate-900">{scenario.command}</span>
              </div>

              {scenario.terminalLogs.slice(0, visibleCount).map((log, i) => {
                const tagStyles = {
                  danger: "text-rose-700 bg-rose-50 border border-rose-200 font-bold",
                  warn: "text-amber-800 bg-amber-50 border border-amber-200 font-bold",
                  success: "text-emerald-700 bg-emerald-50 border border-emerald-200 font-bold",
                  info: "text-sky-700 bg-sky-50 border border-sky-200 font-bold",
                }[log.tagType];

                const textStyles = {
                  danger: "text-rose-700 font-semibold",
                  warn: "text-amber-900 font-medium",
                  success: "text-emerald-800 font-medium",
                  info: "text-slate-800",
                }[log.tagType];

                return (
                  <div key={i} className="flex items-start gap-2 py-0.5 leading-snug">
                    <span className="text-slate-400 text-[10px] flex-shrink-0 select-none pt-0.5">{log.time}</span>
                    <span className={`px-1.5 py-0.2 rounded text-[10px] flex-shrink-0 ${tagStyles}`}>
                      [{log.tag}]
                    </span>
                    <span className={`flex-1 break-all ${textStyles}`}>
                      {log.text}
                    </span>
                  </div>
                );
              })}

              <div className="pt-1">
                <span className="w-1.5 h-3.5 bg-indigo-500 inline-block animate-pulse align-middle" />
              </div>
            </div>
          </div>

          {/* Quick status pill at terminal bottom */}
          <div className="flex items-center justify-between pt-3 mt-4 border-t border-slate-200/60">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold ${
              scenario.badgeType === "danger"
                ? "bg-rose-50 text-rose-700 border border-rose-200"
                : scenario.badgeType === "success"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-amber-50 text-amber-800 border border-amber-200"
            }`}>
              <span className="w-2 h-2 rounded-full bg-current" />
              <span>{scenario.badge}</span>
            </span>
            <span className="text-[11px] text-slate-500 font-mono">Fail-closed runtime boundary</span>
          </div>
        </div>

        {/* RIGHT COLUMN: Policy Trace / Cedar Guardrail */}
        <div className="lg:col-span-5 flex flex-col justify-between bg-white p-5">
          <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-200/60">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className={`text-xs font-mono transition-colors pb-0.5 cursor-pointer ${
                  activeTab === "json"
                    ? "text-indigo-600 font-bold border-b-2 border-indigo-600"
                    : "text-slate-500 hover:text-slate-800 font-medium"
                }`}
                onClick={() => setActiveTab("json")}
              >
                Runtime Trace JSON
              </button>
              <button
                type="button"
                className={`text-xs font-mono transition-colors pb-0.5 cursor-pointer ${
                  activeTab === "cedar"
                    ? "text-indigo-600 font-bold border-b-2 border-indigo-600"
                    : "text-slate-500 hover:text-slate-800 font-medium"
                }`}
                onClick={() => setActiveTab("cedar")}
              >
                Cedar Policy Rule
              </button>
            </div>
            {activeTab === "json" && (
              <button
                type="button"
                className="text-[11px] font-mono text-slate-500 hover:text-slate-800 px-2 py-0.5 rounded border border-slate-200 bg-slate-50/50 hover:bg-slate-100 transition-colors cursor-pointer"
                onClick={handleCopyJson}
              >
                {copied ? "Copied!" : "Copy JSON"}
              </button>
            )}
          </div>

          <div className="font-mono text-[11px] leading-relaxed overflow-x-auto flex-1 max-h-[250px] scrollbar-thin">
            {activeTab === "json" ? (
              <pre className="text-slate-800">
                <code>
                  {`{\n`}
                  <span className="text-indigo-600 font-medium">  "decision"</span>
                  <span className="text-slate-400">: </span>
                  <span className={`font-bold px-1.5 py-0.2 rounded ${
                    scenario.status === "stopped" || activeIdx === 3
                      ? "text-rose-700 bg-rose-50 border border-rose-200"
                      : scenario.status === "permitted"
                      ? "text-emerald-700 bg-emerald-50 border border-emerald-200"
                      : "text-amber-800 bg-amber-50 border border-amber-200"
                  }`}>
                    "{activeIdx === 3 ? "REVOKED" : scenario.status === "stopped" ? "DENY" : scenario.status === "permitted" ? "PERMIT" : "SUSPEND"}"
                  </span>
                  {`,\n`}
                  <span className="text-indigo-600 font-medium">  "latencyMs"</span>
                  <span className="text-slate-400">: </span>
                  <span className="text-amber-700 font-bold">{scenario.latency.replace("ms", "")}</span>
                  {`,\n`}
                  <span className="text-indigo-600 font-medium">  "permissionValidation"</span>
                  <span className="text-slate-400">: </span>
                  <span className={`font-bold px-1.5 py-0.2 rounded ${
                    scenario.status === "stopped" || activeIdx === 3
                      ? "text-rose-700 bg-rose-50 border border-rose-200"
                      : scenario.status === "permitted"
                      ? "text-emerald-700 bg-emerald-50 border border-emerald-200"
                      : "text-amber-800 bg-amber-50 border border-amber-200"
                  }`}>
                    "{activeIdx === 3 ? "revoked" : scenario.status}"
                  </span>
                  {`,\n`}
                  <span className="text-indigo-600 font-medium">  "interceptContext"</span>
                  <span className="text-slate-400">{": {\n"}</span>
                  {activeIdx === 0 && (
                    <>
                      <span className="text-indigo-600 font-medium">    "principal"</span>
                      <span className="text-slate-400">: </span>
                      <span className="text-emerald-700">"Agent::reporting-worker-4"</span>
                      {`,\n`}
                      <span className="text-indigo-600 font-medium">    "tool"</span>
                      <span className="text-slate-400">: </span>
                      <span className="text-emerald-700">"db.execute_query"</span>
                      {`,\n`}
                      <span className="text-indigo-600 font-medium">    "blockedArgument"</span>
                      <span className="text-slate-400">: </span>
                      <span className="text-rose-700 font-bold bg-rose-50 border border-rose-200 px-1 rounded">"DROP TABLE customer_records"</span>
                      {`,\n`}
                      <span className="text-indigo-600 font-medium">    "signatureMatched"</span>
                      <span className="text-slate-400">: </span>
                      <span className="text-emerald-700">"SQL_INJECTION_DESTRUCTIVE"</span>
                      {`,\n`}
                      <span className="text-indigo-600 font-medium">    "auditHash"</span>
                      <span className="text-slate-400">: </span>
                      <span className="text-emerald-700">"0x8f2d...9a12"</span>
                      {`\n`}
                    </>
                  )}
                  {activeIdx === 1 && (
                    <>
                      <span className="text-indigo-600 font-medium">    "principal"</span>
                      <span className="text-slate-400">: </span>
                      <span className="text-emerald-700">"Agent::analytics-bot"</span>
                      {`,\n`}
                      <span className="text-indigo-600 font-medium">    "tool"</span>
                      <span className="text-slate-400">: </span>
                      <span className="text-emerald-700">"warehouse.read"</span>
                      {`,\n`}
                      <span className="text-indigo-600 font-medium">    "ephemeralLeaseId"</span>
                      <span className="text-slate-400">: </span>
                      <span className="text-emerald-700">"bao-lease-8902-dynamic"</span>
                      {`,\n`}
                      <span className="text-indigo-600 font-medium">    "ttlSeconds"</span>
                      <span className="text-slate-400">: </span>
                      <span className="text-amber-700 font-bold">60</span>
                      {`,\n`}
                      <span className="text-indigo-600 font-medium">    "zeroSecretsExposedToClient"</span>
                      <span className="text-slate-400">: </span>
                      <span className="text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-1 rounded">true</span>
                      {`\n`}
                    </>
                  )}
                  {activeIdx === 2 && (
                    <>
                      <span className="text-indigo-600 font-medium">    "tool"</span>
                      <span className="text-slate-400">: </span>
                      <span className="text-emerald-700">"crm.update_lead"</span>
                      {`,\n`}
                      <span className="text-indigo-600 font-medium">    "reason"</span>
                      <span className="text-slate-400">: </span>
                      <span className="text-amber-800 font-bold bg-amber-50 border border-amber-200 px-1 rounded">"SCHEMA_HASH_DRIFT"</span>
                      {`,\n`}
                      <span className="text-indigo-600 font-medium">    "expectedHash"</span>
                      <span className="text-slate-400">: </span>
                      <span className="text-emerald-700">"sha256:3a7b4e..."</span>
                      {`,\n`}
                      <span className="text-indigo-600 font-medium">    "actionTaken"</span>
                      <span className="text-slate-400">: </span>
                      <span className="text-emerald-700">"QUARANTINE_PENDING_REVIEW"</span>
                      {`\n`}
                    </>
                  )}
                  {activeIdx === 3 && (
                    <>
                      <span className="text-indigo-600 font-medium">    "principal"</span>
                      <span className="text-slate-400">: </span>
                      <span className="text-emerald-700">"Agent::reporting-worker-4"</span>
                      {`,\n`}
                      <span className="text-indigo-600 font-medium">    "action"</span>
                      <span className="text-slate-400">: </span>
                      <span className="text-rose-700 font-bold bg-rose-50 border border-rose-200 px-1 rounded">"EMERGENCY_KILL_SWITCH"</span>
                      {`,\n`}
                      <span className="text-indigo-600 font-medium">    "delegationHopsSevered"</span>
                      <span className="text-slate-400">: </span>
                      <span className="text-amber-700 font-bold">3</span>
                      {`,\n`}
                      <span className="text-indigo-600 font-medium">    "downstreamBlockedToolCalls"</span>
                      <span className="text-slate-400">: </span>
                      <span className="text-amber-700 font-bold">14</span>
                      {`,\n`}
                      <span className="text-indigo-600 font-medium">    "openBaoLeasesRevoked"</span>
                      <span className="text-slate-400">: </span>
                      <span className="text-amber-700 font-bold">4</span>
                      {`,\n`}
                      <span className="text-indigo-600 font-medium">    "auditHash"</span>
                      <span className="text-slate-400">: </span>
                      <span className="text-emerald-700">"0x3e1a...7c89"</span>
                      {`\n`}
                    </>
                  )}
                  <span className="text-slate-400">{"  }\n"}</span>
                  {`}`}
                </code>
              </pre>
            ) : (
              <pre className="text-slate-800 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                <code>{scenario.cedarPolicy}</code>
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
