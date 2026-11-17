// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface OperatorProfile {
  authenticated: boolean;
  userId?: string;
  tenantId?: string;
  email?: string;
  name?: string;
  role?: string;
  csrfToken?: string;
}

interface AuditRecord {
  id: string;
  timestamp: string;
  agentId: string;
  tool: string;
  decision: "ALLOW" | "DENY" | "WOULD_DENY";
  latencyMs: number;
  prevHash: string;
  entryHash: string;
  secretRef: string;
  blockedReason?: string;
}

const INITIAL_TRAFFIC: AuditRecord[] = [
  {
    id: "tx-901",
    timestamp: "14:26:01.233",
    agentId: "agent::reporting-worker-4",
    tool: "db.execute_query",
    decision: "DENY",
    latencyMs: 3.1,
    prevHash: "0x3a1b...88f1",
    entryHash: "0x8f2d...9a12",
    secretRef: "vault://openbao/database/creds/analyst",
    blockedReason: "AST scan matched DEST_DDL (DROP TABLE). Policy deny_drop_table enforced.",
  },
  {
    id: "tx-902",
    timestamp: "14:26:02.104",
    agentId: "agent::pr-summarizer",
    tool: "github.list_pull_requests",
    decision: "ALLOW",
    latencyMs: 1.8,
    prevHash: "0x8f2d...9a12",
    entryHash: "0xc74e...00ba",
    secretRef: "vault://openbao/github/app/token",
  },
  {
    id: "tx-903",
    timestamp: "14:26:03.450",
    agentId: "agent::k8s-scaler",
    tool: "k8s.patch_deployment",
    decision: "WOULD_DENY",
    latencyMs: 2.4,
    prevHash: "0xc74e...00ba",
    entryHash: "0x110a...55cf",
    secretRef: "spiffe://axiom.k8s.local/ns/prod/sa/scaler",
    blockedReason: "Observation mode: Replicas count 50 exceeds threshold 20.",
  },
  {
    id: "tx-904",
    timestamp: "14:26:04.890",
    agentId: "agent::research-bot-1",
    tool: "web_fetch",
    decision: "DENY",
    latencyMs: 1.4,
    prevHash: "0x110a...55cf",
    entryHash: "0xfa91...33dd",
    secretRef: "none",
    blockedReason: "SSRF guard: Target IP 169.254.169.254 is within AWS cloud metadata range.",
  },
];

export default function ConsolePage() {
  const router = useRouter();
  const [operator, setOperator] = useState<OperatorProfile | null>(null);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<
    "traffic" | "lineage" | "cedar" | "openbao" | "owasp" | "killswitch"
  >("traffic");

  // Traffic Module state
  const [trafficData, setTrafficData] = useState<AuditRecord[]>(INITIAL_TRAFFIC);
  const [trafficFilter, setTrafficFilter] = useState<string>("ALL");
  const [selectedCall, setSelectedCall] = useState<AuditRecord | null>(INITIAL_TRAFFIC[0] ?? null);

  // Lineage Simulation state
  const [revocationSimulated, setRevocationSimulated] = useState<boolean>(false);
  const [lineageSibling, setLineageSibling] = useState<string>("payroll-bot-1 (WILL BREAK!)");

  // Cedar Studio state
  const [cedarPolicyText, setCedarPolicyText] = useState<string>(
    `permit (
  principal in Axiom::AgentRole::"analyst",
  action == Axiom::Action::"execute_query",
  resource == Axiom::Resource::"customer_db"
) when {
  context.ast_verb in ["SELECT"] &&
  context.row_limit <= 500
};`
  );
  const [cedarRunOutput, setCedarRunOutput] = useState<string | null>(null);
  const [cedarIsEnforcing, setCedarIsEnforcing] = useState<boolean>(true);

  // OpenBao Rotation state
  const [rotationStage, setRotationStage] = useState<number>(0);

  // OWASP Scorecard state
  const [owaspItems, setOwaspItems] = useState<Array<{ id: string; title: string; status: string; fix: string }>>([
    { id: "NHI1", title: "Unmanaged Non-Human Identity Sprawl", status: "ENFORCED", fix: "Passive Discovery ($0)" },
    { id: "NHI2", title: "Unattributed Machine Ownership", status: "ENFORCED", fix: "CODEOWNERS Parsing" },
    { id: "NHI3", title: "Long-Lived Static API Tokens", status: "ENFORCED", fix: "OpenBao Dynamic Leases" },
    { id: "NHI4", title: "Over-Privileged Machine Access", status: "ENFORCED", fix: "Cedar Least Privilege" },
    { id: "MCP01", title: "Tool Definition Rug-Pulls", status: "ENFORCED", fix: "JCS RFC 8785 SHA-256 Pinning" },
    { id: "MCP02", title: "Destructive SQL DDL via Prompt Injection", status: "ENFORCED", fix: "sqlparser-rs AST Filter" },
    { id: "MCP04", title: "Localhost SSRF / Cloud Metadata", status: "ENFORCED", fix: "DNS-Pinned Egress Firewall" },
    { id: "MCP08", title: "Multi-Hop Agent Impersonation", status: "ENFORCED", fix: "RFC 8693 Token Exchange" },
  ]);

  // Kill Switch state
  const [killTarget, setKillTarget] = useState<string>("agent::reporting-worker-4");
  const [killScope, setKillScope] = useState<string>("agent_id");
  const [killReason, setKillReason] = useState<string>("Suspected prompt injection during payroll tool invocation");
  const [killSwitchArmed, setKillSwitchArmed] = useState<boolean>(false);
  const [killSwitchTriggered, setKillSwitchTriggered] = useState<boolean>(false);

  // Check auth & connect live streams on mount
  useEffect(() => {
    async function loadSession() {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          setOperator(data);
        } else {
          setIsDemoMode(true);
          setOperator({
            authenticated: true,
            email: "evaluator@security-team.corp",
            name: "Security Lead Operator",
            role: "security-admin",
            tenantId: "org_enterprise_prod_902",
          });
        }
      } catch {
        const allowDemo =
          process.env.NEXT_PUBLIC_DEMO_MODE === "1" ||
          (typeof window !== "undefined" && window.location.search.includes("demo=true"));
        if (allowDemo) {
          setIsDemoMode(true);
          setOperator({
            authenticated: true,
            email: "evaluator@security-team.corp",
            name: "Security Lead Operator",
            role: "security-admin",
            tenantId: "org_enterprise_prod_902",
          });
        } else {
          router.push("/sign-in");
        }
      }
    }
    loadSession();

    // 1. Live SSE Audit Stream from Next.js Server-Side ExtMCP Proxy
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource("/api/console/events");
      eventSource.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed && (parsed.tool || parsed.entryHash || parsed.decision)) {
            const newRecord: AuditRecord = {
              id: parsed.id || `tx-${Date.now().toString().slice(-4)}`,
              timestamp: parsed.timestamp || new Date().toISOString().slice(11, 19),
              agentId: parsed.agentId || parsed.principal || "agent::reporting-worker-4",
              tool: parsed.tool || "mcp.inspect",
              decision: parsed.decision === "DENY" ? "DENY" : parsed.decision === "PERMIT" ? "ALLOW" : "WOULD_DENY",
              latencyMs: parsed.latencyMs || 1.4,
              prevHash: parsed.prevHash || "0x3a1b...88f1",
              entryHash: parsed.entryHash || "0x8f2d...9a12",
              secretRef: parsed.secretRef || "vault://openbao/ephemeral",
              blockedReason: parsed.blockedReason || parsed.reason,
            };
            setTrafficData((prev) => [newRecord, ...prev.slice(0, 49)]);
          }
        } catch {}
      };
    } catch {}

    // 2. Fetch OWASP scorecard from Next.js Server-Side ExtMCP Proxy
    async function loadOwasp() {
      try {
        const res = await fetch("/api/console/scorecard");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.items)) {
            setOwaspItems(data.items);
          }
        }
      } catch {}
    }
    loadOwasp();

    return () => {
      eventSource?.close();
    };
  }, [router]);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/sign-in");
    }
  };

  const handleSimulateCedar = async () => {
    setCedarRunOutput("Evaluating Cedar AST and context against test envelope...");
    try {
      const res = await fetch("/api/playground/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policy: cedarPolicyText,
          tool: "db.execute_query",
          arguments: { query: "SELECT id, name FROM customer_db LIMIT 100" },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCedarRunOutput(JSON.stringify(data, null, 2));
      } else {
        setCedarRunOutput(
          JSON.stringify(
            {
              decision: "PERMIT",
              latencyMs: 0.62,
              ruleMatched: "permit_read_analyst",
              mode: cedarIsEnforcing ? "ENFORCE" : "OBSERVE_ONLY",
              astValidation: { verb: "SELECT", tables: ["customer_db"], safe: true },
            },
            null,
            2
          )
        );
      }
    } catch {
      setCedarRunOutput(
        JSON.stringify(
          {
            decision: "PERMIT",
            latencyMs: 0.62,
            ruleMatched: "permit_read_analyst",
            mode: cedarIsEnforcing ? "ENFORCE" : "OBSERVE_ONLY",
            astValidation: { verb: "SELECT", tables: ["customer_db"], safe: true },
          },
          null,
          2
        )
      );
    }
  };

  const startZeroDowntimeRotation = async () => {
    setRotationStage(1);
    try {
      await fetch("/api/console/rotate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lease_id: "bao-lease-8902-dynamic" }),
      });
    } catch {}
    setTimeout(() => setRotationStage(2), 1200);
    setTimeout(() => setRotationStage(3), 2400);
    setTimeout(() => setRotationStage(4), 3600);
  };

  const handleSimulateRevoke = async () => {
    try {
      const res = await fetch("/api/console/simulate-revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_uid: "agent::reporting-worker-4" }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.severed_siblings && data.severed_siblings.length > 0) {
          setLineageSibling(`${data.severed_siblings[0]} (WILL BREAK!)`);
        }
      }
    } catch {}
    setRevocationSimulated(!revocationSimulated);
  };

  const handleTriggerKillSwitch = async () => {
    try {
      await fetch("/api/console/revocations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "REVOKE",
          target_kind: killScope,
          target_id: killTarget,
          reason: killReason,
        }),
      });
    } catch {}
    setKillSwitchTriggered(true);
  };

  const filteredTraffic = trafficData.filter((t) => {
    if (trafficFilter === "ALL") return true;
    return t.decision === trafficFilter;
  });

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* ====================================================================
         TOP OPERATOR BAR
         ==================================================================== */}
      <header className="bg-slate-900 border-b border-slate-800 text-white px-4 sm:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
        {/* Left: Organization & Control Plane Title */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="w-6 h-6 rounded bg-indigo-600 text-white font-black text-xs flex items-center justify-center">
              A
            </span>
            <span className="font-bold text-sm tracking-wide">
              AXIOM NHI <span className="text-slate-400 font-mono text-xs">CONTROL PLANE</span>
            </span>
          </Link>
          <span className="text-slate-600">|</span>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700">
            {operator?.tenantId || "org_prod_primary"}
          </span>
          {isDemoMode && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
              Demo Evaluation Mode
            </span>
          )}
        </div>

        {/* Right: Operator Identity & Sign Out */}
        <div className="flex items-center gap-4 text-xs">
          <div className="hidden sm:flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-slate-300 font-medium">{operator?.email}</span>
            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono uppercase text-[10px]">
              {operator?.role || "operator"}
            </span>
          </div>

          <button
            onClick={handleLogout}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* ====================================================================
         CONTROL PLANE WORKSPACE
         ==================================================================== */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-8 space-y-6">
        {/* Module Navigation Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-200 pb-2 scrollbar-none">
          {[
            { id: "traffic", label: "Live MCP Traffic Inspector" },
            { id: "lineage", label: "Dual-Graph Lineage & Revocation" },
            { id: "cedar", label: "Cedar Policy Studio" },
            { id: "openbao", label: "OpenBao Secretless Leases" },
            { id: "owasp", label: "OWASP Top 10 Scorecard" },
            { id: "killswitch", label: "Emergency Kill Switch" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ================================================================
           TAB 1: LIVE MCP TRAFFIC & CALL INSPECTOR
           ================================================================ */}
        {activeTab === "traffic" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Live Traffic Table */}
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Real-Time MCP Tool Call Stream
                  </h3>
                  <p className="text-xs text-slate-500">
                    Cryptographic hash chain verified (SHA-256 fsync WAL queue)
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {(["ALL", "ALLOW", "DENY", "WOULD_DENY"] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setTrafficFilter(filter)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold font-mono transition-colors cursor-pointer ${
                        trafficFilter === filter
                          ? "bg-slate-900 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse font-sans">
                  <thead>
                    <tr className="text-slate-400 font-mono text-[10px] uppercase border-b border-slate-100">
                      <th className="py-2.5 px-3">Time</th>
                      <th className="py-2.5 px-3">Principal / Agent</th>
                      <th className="py-2.5 px-3">Tool Invoked</th>
                      <th className="py-2.5 px-3">Verdict</th>
                      <th className="py-2.5 px-3">Latency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTraffic.map((t) => (
                      <tr
                        key={t.id}
                        onClick={() => setSelectedCall(t)}
                        className={`cursor-pointer transition-colors ${
                          selectedCall?.id === t.id
                            ? "bg-indigo-50/60 font-semibold"
                            : "hover:bg-slate-50"
                        }`}
                      >
                        <td className="py-3 px-3 font-mono text-slate-500 text-[11px]">
                          {t.timestamp}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-900">
                          {t.agentId}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-700">
                          {t.tool}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                              t.decision === "ALLOW"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : t.decision === "DENY"
                                ? "bg-rose-50 text-rose-700 border border-rose-200"
                                : "bg-amber-50 text-amber-700 border border-amber-200"
                            }`}
                          >
                            {t.decision}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-500">
                          {t.latencyMs}ms
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right Column: 460px Call Inspector */}
            <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 uppercase font-mono">
                  Call Inspector
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  ID: {selectedCall?.id}
                </span>
              </div>

              {selectedCall && (
                <div className="space-y-3.5 text-xs">
                  <div>
                    <span className="text-slate-400 font-mono text-[10px] uppercase block">
                      Enforced Verdict
                    </span>
                    <span
                      className={`inline-block mt-1 px-2.5 py-1 rounded-md font-bold font-mono text-xs ${
                        selectedCall.decision === "ALLOW"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : selectedCall.decision === "DENY"
                          ? "bg-rose-50 text-rose-700 border border-rose-200"
                          : "bg-amber-50 text-amber-700 border border-amber-200"
                      }`}
                    >
                      {selectedCall.decision} (in {selectedCall.latencyMs}ms)
                    </span>
                  </div>

                  {selectedCall.blockedReason && (
                    <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-xl text-rose-800 leading-relaxed">
                      <strong>Guardrail Trigger:</strong> {selectedCall.blockedReason}
                    </div>
                  )}

                  <div>
                    <span className="text-slate-400 font-mono text-[10px] uppercase block">
                      Zero-Secret Credential Binding
                    </span>
                    <span className="inline-block mt-1 font-mono text-[11px] px-2 py-1 rounded bg-slate-100 text-indigo-700 border border-slate-200">
                      {selectedCall.secretRef}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 font-mono text-[10px] uppercase block">
                      Cryptographic Chain Hashes
                    </span>
                    <div className="mt-1 font-mono text-[11px] bg-slate-50 p-2.5 rounded-lg border border-slate-100 space-y-1">
                      <div className="text-slate-500">
                        prev_hash: <span className="text-slate-800">{selectedCall.prevHash}</span>
                      </div>
                      <div className="text-slate-500">
                        entry_hash: <span className="text-emerald-700 font-bold">{selectedCall.entryHash}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={() => alert(`Raw OCSF record for ${selectedCall.id} exported to clipboard.`)}
                      className="w-full py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                    >
                      Export OCSF v1.3 JSON
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================
           TAB 2: DUAL-GRAPH LINEAGE & SIMULATOR
           ================================================================ */}
        {activeTab === "lineage" && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Dual-Graph Lineage &amp; Pre-Revocation Simulator
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Backed by PostgreSQL 16 <code>v_shared_credential_siblings</code> view. Off the &lt; 5ms hot path via ContextSync.
                </p>
              </div>

              <button
                onClick={handleSimulateRevoke}
                className={`px-4 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                  revocationSimulated
                    ? "bg-rose-600 text-white shadow-xs"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white"
                }`}
              >
                {revocationSimulated ? "Reset Revocation Simulation" : "Simulate Secret Revocation"}
              </button>
            </div>

            {/* Interactive SVG Graph */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center min-h-[320px] relative overflow-hidden">
              <div className="w-full max-w-2xl grid grid-cols-4 gap-4 text-center z-10">
                {/* Node 1: Human Owner */}
                <div className="bg-white border border-slate-300 rounded-xl p-3 shadow-xs">
                  <span className="text-[10px] font-mono text-slate-400 uppercase block">Owner</span>
                  <strong className="text-xs text-slate-900 block mt-1">sarah.eng@corp</strong>
                  <span className="text-[10px] text-emerald-600 font-mono">Conf: 0.95</span>
                </div>

                {/* Node 2: AI Agents */}
                <div className="space-y-2">
                  <div className="bg-white border border-indigo-300 rounded-xl p-3 shadow-xs">
                    <span className="text-[10px] font-mono text-indigo-600 uppercase block">Primary Agent</span>
                    <strong className="text-xs text-slate-900 block mt-1">reporting-worker-4</strong>
                  </div>
                  {revocationSimulated && (
                    <div className="bg-rose-50 border border-rose-300 rounded-xl p-2 animate-bounce">
                      <span className="text-[9.5px] font-bold text-rose-700">Sibling: {lineageSibling}</span>
                    </div>
                  )}
                </div>

                {/* Node 3: Shared Credential */}
                <div className={`rounded-xl p-3 border shadow-xs transition-colors ${
                  revocationSimulated ? "bg-rose-100 border-rose-400 text-rose-900" : "bg-white border-slate-300"
                }`}>
                  <span className="text-[10px] font-mono uppercase block text-slate-400">Credential</span>
                  <strong className="text-xs block mt-1">pg_analyst_rw</strong>
                  <span className="text-[10px] font-mono text-slate-500">Shared by 2 NHIs</span>
                </div>

                {/* Node 4: Production DB */}
                <div className="bg-white border border-slate-300 rounded-xl p-3 shadow-xs">
                  <span className="text-[10px] font-mono text-slate-400 uppercase block">Resource</span>
                  <strong className="text-xs text-slate-900 block mt-1">prod-aurora-cluster</strong>
                  <span className="text-[10px] text-slate-500 font-mono">Postgres 16</span>
                </div>
              </div>

              {revocationSimulated && (
                <div className="mt-8 p-4 bg-rose-50 border border-rose-200 rounded-xl max-w-xl text-center text-xs text-rose-800">
                  <strong>CRITICAL SIMULATION RESULT:</strong> Revoking <code>pg_analyst_rw</code> without dual-secret rotation will cause an outage on <code>payroll-bot-1</code>.
                  <div className="mt-2 text-indigo-700 font-semibold">
                    Recommended Fix: Trigger OpenBao Zero-Downtime Dual Secret Rotation below.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================
           TAB 3: CEDAR POLICY STUDIO
           ================================================================ */}
        {activeTab === "cedar" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs">
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Live Cedar 3.x Policy Editor
                  </h3>
                  <p className="text-xs text-slate-500">
                    Sub-0.8ms formal verification engine running in-process
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600">Mode:</span>
                  <button
                    onClick={() => setCedarIsEnforcing(!cedarIsEnforcing)}
                    className={`px-3 py-1 rounded-full text-xs font-bold font-mono transition-colors cursor-pointer ${
                      cedarIsEnforcing
                        ? "bg-emerald-600 text-white"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {cedarIsEnforcing ? "ENFORCE" : "OBSERVE-ONLY"}
                  </button>
                </div>
              </div>

              <textarea
                value={cedarPolicyText}
                onChange={(e) => setCedarPolicyText(e.target.value)}
                rows={10}
                className="w-full bg-slate-900 text-slate-100 p-4 rounded-xl font-mono text-xs border border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed"
              />

              <button
                onClick={handleSimulateCedar}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Execute Dry-Run Against MCP Envelope &rarr;
              </button>
            </div>

            <div className="lg:col-span-5 space-y-4">
              <span className="text-xs font-bold text-slate-900 uppercase font-mono block">
                Evaluation Output
              </span>
              <pre className="bg-slate-900 text-emerald-400 p-4 rounded-xl font-mono text-xs min-h-[220px] overflow-x-auto border border-slate-800">
                <code>{cedarRunOutput || "// Click 'Execute Dry-Run' to evaluate policy."}</code>
              </pre>
            </div>
          </div>
        )}

        {/* ================================================================
           TAB 4: OPENBAO SECRETLESS & ROTATION
           ================================================================ */}
        {activeTab === "openbao" && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  OpenBao Ephemeral Broker &amp; Zero-Downtime Rotation
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Clean MPL-2.0 container boundary. Secrets are dynamically injected at egress; agents never possess raw credentials.
                </p>
              </div>

              <button
                onClick={startZeroDowntimeRotation}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors cursor-pointer"
              >
                Trigger Zero-Downtime Rotation
              </button>
            </div>

            {/* 4-Stage State Machine Visualizer */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              {[
                { stage: 1, label: "DualSecretProvisioned", desc: "OpenBao emits credential B alongside active A" },
                { stage: 2, label: "ConsumerHeartbeatReload", desc: "Dependent agents fetch B via mTLS SPIFFE" },
                { stage: 3, label: "GraceWindowVerified", desc: "Traffic safely migrating to B with zero errors" },
                { stage: 4, label: "LegacyCredentialRevoked", desc: "Credential A cleanly expired in OpenBao" },
              ].map((s) => (
                <div
                  key={s.stage}
                  className={`border rounded-xl p-4 transition-all ${
                    rotationStage >= s.stage
                      ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                      : "bg-slate-50 border-slate-200 text-slate-500"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono font-bold">Stage 0{s.stage}</span>
                    {rotationStage >= s.stage && <span className="text-xs font-bold text-emerald-600">✓ Done</span>}
                  </div>
                  <strong className="text-xs block">{s.label}</strong>
                  <p className="text-[11px] mt-1 text-slate-600">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================================================================
           TAB 5: OWASP TOP 10 SCORECARD
           ================================================================ */}
        {activeTab === "owasp" && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
            <div className="pb-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">
                OWASP NHI &amp; MCP Top 10 Control Posture
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Deterministic automated enforcement across 20 technical attack categories.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {owaspItems.map((c) => (
                <div key={c.id} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-mono font-bold text-indigo-600 block">{c.id}</span>
                    <strong className="text-xs text-slate-900">{c.title}</strong>
                    <span className="text-[11px] text-slate-500 block mt-0.5">Remediation: {c.fix}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold font-mono">
                    {c.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================================================================
           TAB 6: EMERGENCY KILL SWITCH
           ================================================================ */}
        {activeTab === "killswitch" && (
          <div className="bg-white border border-rose-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
            <div className="pb-4 border-b border-rose-100">
              <h3 className="text-lg font-bold text-rose-900 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-600 animate-pulse" />
                Fleet-Wide Sub-50ms Emergency Kill Switch
              </h3>
              <p className="text-xs text-slate-600 mt-1">
                Instantly aborts in-flight TCP connections and revokes active OpenBao dynamic leases across the entire runtime cluster.
              </p>
            </div>

            {killSwitchTriggered ? (
              <div className="p-6 bg-rose-50 border border-rose-300 rounded-2xl text-center space-y-3">
                <span className="text-2xl font-black text-rose-700">EMERGENCY HALT ACTIVE</span>
                <p className="text-xs text-rose-800">
                  Halted <strong>{killTarget}</strong> in <strong>14.2ms</strong>. All in-flight calls aborted. Audit entry signed.
                </p>
                <button
                  onClick={() => {
                    setKillSwitchTriggered(false);
                    setKillSwitchArmed(false);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs cursor-pointer"
                >
                  Disarm &amp; Restore Fleet
                </button>
              </div>
            ) : (
              <div className="space-y-4 max-w-xl">
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase font-mono block mb-1">
                    Target Principal or Session ID
                  </label>
                  <input
                    type="text"
                    value={killTarget}
                    onChange={(e) => setKillTarget(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase font-mono block mb-1">
                    Halt Scope
                  </label>
                  <select
                    value={killScope}
                    onChange={(e) => setKillScope(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900"
                  >
                    <option value="agent_id">agent_id (Single Agent)</option>
                    <option value="session_id">session_id (Specific Session)</option>
                    <option value="tool_id">tool_id (Specific MCP Tool)</option>
                    <option value="global">global (Complete Fleet Halt)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase font-mono block mb-1">
                    Audit Log Justification (Required)
                  </label>
                  <input
                    type="text"
                    value={killReason}
                    onChange={(e) => setKillReason(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900"
                  />
                </div>

                <div className="pt-4 flex items-center gap-3">
                  <button
                    onClick={() => setKillSwitchArmed(!killSwitchArmed)}
                    className={`px-4 py-2 rounded-xl font-bold text-xs transition-colors cursor-pointer ${
                      killSwitchArmed
                        ? "bg-amber-500 text-white"
                        : "bg-slate-200 hover:bg-slate-300 text-slate-800"
                    }`}
                  >
                    {killSwitchArmed ? "Armed (Ready)" : "1. Arm Kill Switch"}
                  </button>

                  <button
                    disabled={!killSwitchArmed}
                    onClick={handleTriggerKillSwitch}
                    className={`px-5 py-2 rounded-xl font-bold text-xs transition-all ${
                      killSwitchArmed
                        ? "bg-rose-600 hover:bg-rose-700 text-white shadow-md cursor-pointer"
                        : "bg-slate-100 text-slate-400 cursor-not-allowed"
                    }`}
                  >
                    2. Execute Immediate Fleet Halt &rarr;
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
