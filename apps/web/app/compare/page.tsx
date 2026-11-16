// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
"use client";

import React, { useState } from "react";
import Link from "next/link";

interface Competitor {
  id: string;
  name: string;
  tagline: string;
  architectureType: string;
  latency: string;
  openSource: boolean;
  strengths: string[];
  weaknesses: string[];
  verdictSummary: string;
}

const COMPETITORS: Competitor[] = [
  {
    id: "aembit",
    name: "Aembit",
    tagline: "Workload IAM & Access Proxy",
    architectureType: "Centralized SaaS Proxy / Agent Envoy",
    latency: "15ms - 45ms",
    openSource: false,
    strengths: [
      "Good support for traditional human-to-workload SSO",
      "OAuth client credential brokering",
      "Salesforce & enterprise SaaS connectors",
    ],
    weaknesses: [
      "No Model Context Protocol (MCP) or JSON-RPC tool awareness",
      "No inline SQL or filesystem AST argument validation",
      "Closed proprietary cloud service with high egress latency",
      "No dual-graph static blast radius or simulation views",
    ],
    verdictSummary:
      "Aembit functions as an enterprise workload proxy, but lacks AI agent protocol understanding. It cannot prevent an agent from executing destructive SQL queries or reading local SSH keys.",
  },
  {
    id: "clutch",
    name: "Clutch Security",
    tagline: "NHI Posture & Discovery Platform",
    architectureType: "Post-Hoc Cloud Log Polling & Static Scanner",
    latency: "15m - 60m (Polling)",
    openSource: false,
    strengths: [
      "Broad SaaS connector catalog for metadata reading",
      "Identifies unused API tokens in GitHub and AWS",
      "Executive posture reporting scorecards",
    ],
    weaknesses: [
      "Zero inline runtime protection (cannot block tool calls)",
      "Alerts arrive 45 minutes after data exfiltration has occurred",
      "Per-NHI license tax creates perverse incentive against full discovery",
      "Proprietary SaaS requires exporting sensitive audit data",
    ],
    verdictSummary:
      "Clutch provides retrospective inventory scanning. If a rogue AI agent executes an unauthorized tool call, Clutch will tell you about the disaster 45 minutes later.",
  },
  {
    id: "token",
    name: "Token Security",
    tagline: "Machine Identity Discovery & Risk",
    architectureType: "Agentless Read-Only Posture Scanner",
    latency: "Post-Hoc (Hourly/Daily)",
    openSource: false,
    strengths: [
      "Strong machine identity visualization dashboards",
      "Maps service account permissions across AWS/GCP",
      "Clean UI for IAM risk attribution",
    ],
    weaknesses: [
      "Purely passive observation with no inline enforcement gateway",
      "No sub-50ms kill switch to halt rogue agent execution",
      "No secretless JIT credential brokering or dynamic rotation",
      "No cryptographic argument verification or payload binding",
    ],
    verdictSummary:
      "Token Security is an agentless discovery platform. Axiom NHI provides 100% of Token's discovery capabilities for $0, while adding sub-5ms inline prevention.",
  },
  {
    id: "cyera-astrix",
    name: "Cyera (Oasis) / Cisco (Astrix)",
    tagline: "Enterprise DSPM & Identity Security",
    architectureType: "Asynchronous Snapshot Analysis",
    latency: "Hours to Days",
    openSource: false,
    strengths: [
      "Deep data discovery across databases and S3 buckets",
      "Enterprise compliance reporting for auditors",
      "Large organizational vendor support",
    ],
    weaknesses: [
      "Completely blind to runtime AI agent execution and MCP calls",
      "No in-line proxy or sidecar capability",
      "Very heavy enterprise implementation cycles (months)",
      "Extremely expensive multi-year contracts with per-asset pricing",
    ],
    verdictSummary:
      "Legacy DSPM and posture tools operate at rest. Axiom NHI operates in motion, intercepting agent actions before they execute.",
  },
  {
    id: "diy-envoy",
    name: "DIY Custom Envoy / Open Policy Agent",
    tagline: "Internal Homegrown Proxy Stack",
    architectureType: "Self-Managed Kubernetes Envoy + OPA Sidecars",
    latency: "6ms - 18ms",
    openSource: true,
    strengths: [
      "Full internal control of source code",
      "No vendor lock-in",
      "Runs inside self-managed Kubernetes infrastructure",
    ],
    weaknesses: [
      "Enormous maintenance burden (months of custom WASM filters)",
      "OPA Rego policies lack Cedar's sub-millisecond formal verification",
      "No built-in dual-graph lineage or pre-revocation blast simulation",
      "No turnkey zero-secret OpenBao dynamic secret injection",
    ],
    verdictSummary:
      "Building a homegrown proxy requires maintaining hundreds of lines of brittle WASM and Rego rules. Axiom provides a pre-built Apache-2.0 engine optimized for agent workloads.",
  },
];

interface MatrixRow {
  feature: string;
  category: string;
  axiom: string;
  axiomPass: boolean;
  aembit: string;
  clutch: string;
  token: string;
  diy: string;
}

const COMPARISON_MATRIX: MatrixRow[] = [
  {
    feature: "Inline MCP Argument AST Validation (SQL / Path / SSRF)",
    category: "Runtime Defense",
    axiom: "Full AST Inspection (< 1.2ms)",
    axiomPass: true,
    aembit: "No (HTTP only)",
    clutch: "None (Passive)",
    token: "None (Passive)",
    diy: "Custom WASM (Slow)",
  },
  {
    feature: "JCS SHA-256 Tool Rug-Pull Pinning",
    category: "Runtime Defense",
    axiom: "Deterministic RFC 8785 Pinning",
    axiomPass: true,
    aembit: "No",
    clutch: "No",
    token: "No",
    diy: "Manual",
  },
  {
    feature: "Dual-Graph Architecture (Postgres + SpiceDB)",
    category: "Identity & Lineage",
    axiom: "Sub-ms Causal + Static Lineage",
    axiomPass: true,
    aembit: "Proprietary Graph",
    clutch: "Static Only",
    token: "Static Only",
    diy: "No",
  },
  {
    feature: "Pre-Revocation Sibling Simulation (v_shared_credential_siblings)",
    category: "Identity & Lineage",
    axiom: "Built-in SQL & CLI Simulation",
    axiomPass: true,
    aembit: "No",
    clutch: "Partial (Heuristic)",
    token: "Partial (Heuristic)",
    diy: "No",
  },
  {
    feature: "SPIFFE + Binary SHA-256 Workload Attestation",
    category: "Workload Attestation",
    axiom: "Native SPIRE & Linux cgroup",
    axiomPass: true,
    aembit: "Proprietary Agent",
    clutch: "No",
    token: "No",
    diy: "Custom SPIRE",
  },
  {
    feature: "Atomic Payload-Hashed Human Approvals",
    category: "Runtime Defense",
    axiom: "sha256(agent|target|tool|args)",
    axiomPass: true,
    aembit: "Coarse URL Approval",
    clutch: "No",
    token: "No",
    diy: "No",
  },
  {
    feature: "Sub-50ms Kill Switch with In-Flight Cancellation",
    category: "Emergency Controls",
    axiom: "Lock-Free ArcSwap Fleet Halt",
    axiomPass: true,
    aembit: "Seconds to Minutes",
    clutch: "No (Passive)",
    token: "No (Passive)",
    diy: "Pod Restarts",
  },
  {
    feature: "Open-Core Apache-2.0 Self-Hosted Runtime",
    category: "Deployment & Trust",
    axiom: "100% Free Open Core",
    axiomPass: true,
    aembit: "Closed Source SaaS",
    clutch: "Closed Source SaaS",
    token: "Closed Source SaaS",
    diy: "Open Source DIY",
  },
  {
    feature: "Customer-VPC Air-Gapped Helm Deployment",
    category: "Deployment & Trust",
    axiom: "Native Kubernetes Helm Chart",
    axiomPass: true,
    aembit: "Hybrid Proxy",
    clutch: "SaaS Only",
    token: "SaaS Only",
    diy: "Custom Helm",
  },
  {
    feature: "Zero Raw Secret Storage (Dynamic JIT Brokering)",
    category: "Secret Brokering",
    axiom: "OpenBao <= 300s Ephemeral Leases",
    axiomPass: true,
    aembit: "Vault Integration",
    clutch: "Scans Only",
    token: "Scans Only",
    diy: "Vault Sidecar",
  },
  {
    feature: "Wire Latency Overhead SLA",
    category: "Performance",
    axiom: "< 5ms P99 Wire Latency",
    axiomPass: true,
    aembit: "15ms - 45ms",
    clutch: "N/A (45m Polling)",
    token: "N/A (Daily)",
    diy: "10ms - 25ms",
  },
  {
    feature: "Pricing for Passive Discovery",
    category: "Commercial Terms",
    axiom: "$0 Forever (Community Core)",
    axiomPass: true,
    aembit: "High Per-Workload Fee",
    clutch: "Per-NHI Tax",
    token: "Per-Asset Tax",
    diy: "Eng Staffing Cost",
  },
];

export default function ComparePage() {
  const [selectedCompetitor, setSelectedCompetitor] = useState<string>("aembit");
  const comp = COMPETITORS.find((c) => c.id === selectedCompetitor) ?? COMPETITORS[0]!;

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      {/* Compare Header */}
      <div className="max-w-7xl mx-auto text-center mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200/80 text-blue-700 text-xs font-semibold uppercase tracking-wider mb-4">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          Head-to-Head Architecture
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight font-sans">
          Axiom NHI vs. Alternative Approaches
        </h1>
        <p className="mt-4 text-base sm:text-lg text-slate-600 max-w-3xl mx-auto leading-relaxed">
          See why security teams choose Axiom over passive discovery tools (Clutch, Token) and traditional network proxies (Aembit, DIY Envoy) for AI agent and machine identity governance.
        </p>
      </div>

      <div className="max-w-7xl mx-auto space-y-16">
        {/* ====================================================================
           SECTION 1: Why Post-Hoc Posture Fails Interactive Timeline
           ==================================================================== */}
        <section className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-10 shadow-xs">
          <div className="max-w-3xl mx-auto text-center mb-10">
            <span className="text-xs font-bold text-rose-600 uppercase tracking-wider font-mono">
              THE POSTURE DELUSION
            </span>
            <h2 className="text-2xl font-bold text-slate-900 mt-1">
              Why Post-Hoc Cloud Posture Fails Autonomous AI
            </h2>
            <p className="text-sm text-slate-600 mt-2">
              Autonomous agents execute dangerous tool calls in milliseconds. A polling alert that arrives 45 minutes later is an autopsy, not security.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Timeline A: Legacy Post-Hoc Scanner */}
            <div className="border border-rose-200 bg-rose-50/30 rounded-2xl p-6 relative">
              <div className="flex items-center justify-between pb-3 border-b border-rose-200/60 mb-4">
                <span className="text-xs font-bold font-mono text-rose-700 uppercase">
                  Legacy Scanner (Clutch / Token / DSPM)
                </span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                  Data Loss Occurred
                </span>
              </div>

              <div className="space-y-4 text-xs">
                <div className="flex items-start gap-3">
                  <span className="font-mono font-bold text-slate-500 w-16 flex-shrink-0">T + 0.0s</span>
                  <div>
                    <strong className="text-slate-900">Agent Injected:</strong> Prompt injection tricks worker into calling <code>db.execute_query(&quot;DROP TABLE customers&quot;)</code>.
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="font-mono font-bold text-slate-500 w-16 flex-shrink-0">T + 0.2s</span>
                  <div>
                    <strong className="text-rose-700">Database Executes Query:</strong> Table is permanently dropped. Static tokens are unrotated.
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="font-mono font-bold text-slate-500 w-16 flex-shrink-0">T + 15.0m</span>
                  <div>
                    <strong className="text-slate-700">CloudTrail Sync:</strong> Cloud provider flushes logs to S3 bucket.
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="font-mono font-bold text-rose-700 w-16 flex-shrink-0">T + 45.0m</span>
                  <div>
                    <strong className="text-rose-700">Slack Alert Fires:</strong> Posture dashboard creates high-severity ticket. <em>Too late.</em>
                  </div>
                </div>
              </div>
            </div>

            {/* Timeline B: Axiom NHI Inline Runtime Gate */}
            <div className="border border-emerald-200 bg-emerald-50/30 rounded-2xl p-6 relative">
              <div className="flex items-center justify-between pb-3 border-b border-emerald-200/60 mb-4">
                <span className="text-xs font-bold font-mono text-emerald-700 uppercase">
                  Axiom NHI Inline Enforcement Gate
                </span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  Attack Thwarted
                </span>
              </div>

              <div className="space-y-4 text-xs">
                <div className="flex items-start gap-3">
                  <span className="font-mono font-bold text-slate-500 w-16 flex-shrink-0">T + 0.0s</span>
                  <div>
                    <strong className="text-slate-900">Agent Injected:</strong> Worker attempts <code>db.execute_query(&quot;DROP TABLE customers&quot;)</code>.
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="font-mono font-bold text-emerald-700 w-16 flex-shrink-0">T + 0.8ms</span>
                  <div>
                    <strong className="text-emerald-700">AST Intercept:</strong> <code>sqlparser-rs</code> identifies <code>DEST_DDL (DROP TABLE)</code>.
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="font-mono font-bold text-emerald-700 w-16 flex-shrink-0">T + 1.4ms</span>
                  <div>
                    <strong className="text-emerald-700">Cedar Policy Evaluated:</strong> Policy <code>deny_drop_table</code> returns fail-closed 403 Forbidden.
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="font-mono font-bold text-emerald-700 w-16 flex-shrink-0">T + 3.1ms</span>
                  <div>
                    <strong className="text-slate-900">Safe Return:</strong> Call aborted before reaching database. Signed audit entry written.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ====================================================================
           SECTION 2: Competitor Selector Tabs & Detailed Breakdown
           ==================================================================== */}
        <section className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-10 shadow-xs">
          <div className="mb-6">
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider font-mono">
              COMPETITIVE ANALYSIS
            </span>
            <h2 className="text-2xl font-bold text-slate-900 mt-1">
              Select an Alternative to Compare
            </h2>
          </div>

          {/* Competitor Selector Buttons */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-8 border-b border-slate-100 scrollbar-none">
            {COMPETITORS.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCompetitor(c.id)}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                  selectedCompetitor === c.id
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                }`}
              >
                Axiom vs. {c.name}
              </button>
            ))}
          </div>

          {/* Deep-Dive Card */}
          <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-xl font-bold text-slate-900">
                  Axiom NHI vs. {comp.name}
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Category: {comp.tagline} &bull; Architecture: {comp.architectureType}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-white border border-slate-200 text-slate-700">
                  Latency: {comp.latency}
                </span>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                  comp.openSource ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-800"
                }`}>
                  {comp.openSource ? "Open Source" : "Proprietary"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              {/* Where Competitor Falls Short */}
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <span className="text-xs font-bold text-rose-600 uppercase tracking-wider">
                  Where {comp.name} Falls Short:
                </span>
                <ul className="mt-3 space-y-2">
                  {comp.weaknesses.map((w, idx) => (
                    <li key={idx} className="text-xs text-slate-600 flex items-start gap-2">
                      <span className="text-rose-500 font-bold">✕</span>
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Where Axiom Excels */}
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
                  Why Axiom NHI Wins:
                </span>
                <ul className="mt-3 space-y-2">
                  <li className="text-xs text-slate-600 flex items-start gap-2">
                    <span className="text-emerald-600 font-bold">✓</span>
                    <span><strong>Sub-5ms Inline Gating:</strong> Blocks attacks before code execution.</span>
                  </li>
                  <li className="text-xs text-slate-600 flex items-start gap-2">
                    <span className="text-emerald-600 font-bold">✓</span>
                    <span><strong>Deep AST Analysis:</strong> Validates full SQL and filesystem arguments.</span>
                  </li>
                  <li className="text-xs text-slate-600 flex items-start gap-2">
                    <span className="text-emerald-600 font-bold">✓</span>
                    <span><strong>100% Free Open Core:</strong> $0 passive discovery with no per-NHI tax.</span>
                  </li>
                  <li className="text-xs text-slate-600 flex items-start gap-2">
                    <span className="text-emerald-600 font-bold">✓</span>
                    <span><strong>Dual-Graph Lineage:</strong> Prevents breaking dependent sibling workloads.</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-6 p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl text-xs text-slate-700 leading-relaxed">
              <strong>Architectural Verdict:</strong> {comp.verdictSummary}
            </div>
          </div>
        </section>

        {/* ====================================================================
           SECTION 3: 12-Row Feature-by-Feature Matrix Table
           ==================================================================== */}
        <section className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-10 shadow-xs">
          <div className="mb-6">
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider font-mono">
              FEATURE MATRIX
            </span>
            <h2 className="text-2xl font-bold text-slate-900 mt-1">
              Complete 12-Point Technical Comparison
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Side-by-side architectural capabilities across all major machine identity solutions.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-mono uppercase text-[10.5px]">
                  <th className="py-3 px-4 font-bold">Technical Capability</th>
                  <th className="py-3 px-4 font-bold bg-indigo-50/70 text-indigo-900">Axiom NHI</th>
                  <th className="py-3 px-4 font-bold">Aembit</th>
                  <th className="py-3 px-4 font-bold">Clutch</th>
                  <th className="py-3 px-4 font-bold">Token</th>
                  <th className="py-3 px-4 font-bold">DIY Stack</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {COMPARISON_MATRIX.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      <div>{row.feature}</div>
                      <span className="text-[10px] text-slate-400 font-mono font-normal">
                        {row.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold text-emerald-700 bg-indigo-50/30">
                      <div className="flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px]">
                          ✓
                        </span>
                        <span>{row.axiom}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{row.aembit}</td>
                    <td className="py-3 px-4 text-slate-600">{row.clutch}</td>
                    <td className="py-3 px-4 text-slate-600">{row.token}</td>
                    <td className="py-3 px-4 text-slate-600">{row.diy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-8 text-center">
            <Link
              href="/shadow-audit"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors shadow-xs"
            >
              Run Free 30-Min Shadow Audit &rarr;
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
