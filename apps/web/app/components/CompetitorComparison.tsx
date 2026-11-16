"use client";

import React, { useState } from "react";
import Link from "next/link";

type StatusType = "check" | "partial" | "cross";

interface FeatureRow {
  capability: string;
  category: "Runtime" | "Discovery" | "Architecture" | "Commercial";
  axiom: { status: StatusType; label: string; highlight?: boolean };
  aembit: { status: StatusType; label: string };
  tokenSecurity: { status: StatusType; label: string };
  cyberark: { status: StatusType; label: string };
}

const COMPARISON_DATA: FeatureRow[] = [
  {
    capability: "Inline Model Context Protocol (MCP) AST Interception",
    category: "Runtime",
    axiom: { status: "check", label: "Sub-5ms inline AST parsing & SQL/Path guard", highlight: true },
    aembit: { status: "cross", label: "No MCP or LLM tool AST inspection" },
    tokenSecurity: { status: "cross", label: "Posture-only (Out-of-band scan only)" },
    cyberark: { status: "cross", label: "No native MCP proxy support" },
  },
  {
    capability: "Sub-Millisecond Cedar Policy Engine",
    category: "Runtime",
    axiom: { status: "check", label: "< 1.5ms P99 deterministic formal verification", highlight: true },
    aembit: { status: "partial", label: "Conditional access (35–60ms proxy latency)" },
    tokenSecurity: { status: "cross", label: "No inline policy enforcement engine" },
    cyberark: { status: "partial", label: "Opaque vault check (120ms+ latency)" },
  },
  {
    capability: "Zero-Secret Ephemeral Leases (OpenBao / Vault)",
    category: "Architecture",
    axiom: { status: "check", label: "Dynamic single-use leases injected just-in-time", highlight: true },
    aembit: { status: "check", label: "Credential injection for workloads" },
    tokenSecurity: { status: "cross", label: "Inventory only; cannot inject or rotate" },
    cyberark: { status: "partial", label: "Static PAM password checkout" },
  },
  {
    capability: "Machine-to-Machine Causal Graph (SpiceDB)",
    category: "Architecture",
    axiom: { status: "check", label: "Live RFC 8693 delegation tree & blast-radius graph", highlight: true },
    aembit: { status: "partial", label: "Point-to-point policy pairing" },
    tokenSecurity: { status: "check", label: "Static cloud inventory graph" },
    cyberark: { status: "cross", label: "Relational DB permissions table" },
  },
  {
    capability: "Fleet-Wide Emergency Kill Switch",
    category: "Runtime",
    axiom: { status: "check", label: "< 50ms cascade propagation across all nodes", highlight: true },
    aembit: { status: "partial", label: "Policy de-provisioning (~5–10s)" },
    tokenSecurity: { status: "cross", label: "No real-time revocation capability" },
    cyberark: { status: "cross", label: "Requires manual administrative intervention" },
  },
  {
    capability: "Shadow Audit & NHI Discovery Pricing",
    category: "Commercial",
    axiom: { status: "check", label: "$0 Discovery Pledge — Free Forever", highlight: true },
    aembit: { status: "partial", label: "Per-workload enterprise license" },
    tokenSecurity: { status: "cross", label: "Seat tax & expensive NHI licensing" },
    cyberark: { status: "cross", label: "High minimum annual contract value" },
  },
  {
    capability: "Air-Gapped & Sovereign Deployment",
    category: "Architecture",
    axiom: { status: "check", label: "100% self-hosted, zero outbound telemetry", highlight: true },
    aembit: { status: "partial", label: "Hybrid SaaS control plane required" },
    tokenSecurity: { status: "cross", label: "Cloud SaaS only; no air-gapped mode" },
    cyberark: { status: "check", label: "On-premise deployment available" },
  },
];

export function CompetitorComparison() {
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  const categories = ["All", "Runtime", "Architecture", "Commercial"];

  const filteredRows = selectedCategory === "All"
    ? COMPARISON_DATA
    : COMPARISON_DATA.filter((r) => r.category === selectedCategory);

  return (
    <section className="py-20 border-t border-[var(--border-subtle)] bg-[var(--bg-canvas)]" aria-label="Competitive Architectural Comparison">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-semibold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 mb-4">
            <span>HEAD-TO-HEAD ARCHITECTURE</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold font-sans tracking-tight text-[var(--text-primary)]">
            Why Enterprise Security Teams Choose Axiom NHI
          </h2>
          <p className="mt-4 text-base sm:text-lg text-[var(--text-secondary)] leading-relaxed">
            See how Axiom’s sub-millisecond inline runtime engine compares to legacy PAM and out-of-band posture scanners like Aembit and Token Security.
          </p>

          {/* Filter Pills */}
          <div className="mt-6 inline-flex p-1 rounded-xl bg-[var(--bg-surface-1)] border border-[var(--border-subtle)] shadow-xs">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
                  selectedCategory === cat
                    ? "bg-[var(--bg-surface-2)] text-[var(--text-primary)] border border-[var(--border-strong)] shadow-xs"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Responsive Table Card */}
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-2)]">
                  <th className="py-4 px-6 text-xs font-mono font-bold uppercase tracking-wider text-[var(--text-secondary)] w-2/5">
                    Security &amp; Architectural Capability
                  </th>
                  <th className="py-4 px-6 text-xs font-mono font-bold uppercase tracking-wider text-blue-700 bg-blue-50/60 border-x border-blue-200 w-1/4">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                      <span>AXIOM NHI (INLINE)</span>
                    </div>
                  </th>
                  <th className="py-4 px-5 text-xs font-mono font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Aembit (Workload IAM)
                  </th>
                  <th className="py-4 px-5 text-xs font-mono font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Token Security (Posture)
                  </th>
                  <th className="py-4 px-5 text-xs font-mono font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    CyberArk (Legacy PAM)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] text-sm">
                {filteredRows.map((row) => (
                  <tr key={row.capability} className="hover:bg-[var(--bg-surface-2)] transition-colors">
                    <td className="py-4 px-6 font-medium text-[var(--text-primary)]">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-[var(--bg-surface-2)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
                          {row.category}
                        </span>
                        <span>{row.capability}</span>
                      </div>
                    </td>

                    {/* Axiom Column */}
                    <td className="py-4 px-6 bg-blue-50/30 border-x border-blue-100 font-semibold text-slate-900">
                      <div className="flex items-start gap-2">
                        <span className="text-emerald-600 text-base mt-0.5">✓</span>
                        <span className="text-xs leading-relaxed">{row.axiom.label}</span>
                      </div>
                    </td>

                    {/* Aembit Column */}
                    <td className="py-4 px-5 text-[var(--text-secondary)]">
                      <div className="flex items-start gap-2">
                        <span className={row.aembit.status === "check" ? "text-emerald-600" : row.aembit.status === "partial" ? "text-amber-500" : "text-slate-400"}>
                          {row.aembit.status === "check" ? "✓" : row.aembit.status === "partial" ? "◎" : "✕"}
                        </span>
                        <span className="text-xs text-[var(--text-muted)] leading-relaxed">{row.aembit.label}</span>
                      </div>
                    </td>

                    {/* Token Security Column */}
                    <td className="py-4 px-5 text-[var(--text-secondary)]">
                      <div className="flex items-start gap-2">
                        <span className={row.tokenSecurity.status === "check" ? "text-emerald-600" : row.tokenSecurity.status === "partial" ? "text-amber-500" : "text-slate-400"}>
                          {row.tokenSecurity.status === "check" ? "✓" : row.tokenSecurity.status === "partial" ? "◎" : "✕"}
                        </span>
                        <span className="text-xs text-[var(--text-muted)] leading-relaxed">{row.tokenSecurity.label}</span>
                      </div>
                    </td>

                    {/* CyberArk Column */}
                    <td className="py-4 px-5 text-[var(--text-secondary)]">
                      <div className="flex items-start gap-2">
                        <span className={row.cyberark.status === "check" ? "text-emerald-600" : row.cyberark.status === "partial" ? "text-amber-500" : "text-slate-400"}>
                          {row.cyberark.status === "check" ? "✓" : row.cyberark.status === "partial" ? "◎" : "✕"}
                        </span>
                        <span className="text-xs text-[var(--text-muted)] leading-relaxed">{row.cyberark.label}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Bottom Footnote & CTA */}
          <div className="p-4 bg-[var(--bg-surface-2)] border-t border-[var(--border-subtle)] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-[var(--text-secondary)]">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-emerald-700 font-bold">✓ Native Supported</span>
              <span className="flex items-center gap-1 text-amber-700 font-bold">◎ Partial / Out-of-Band</span>
              <span className="flex items-center gap-1 text-slate-500 font-bold">✕ Not Supported</span>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/pricing" className="text-blue-600 hover:text-blue-800 font-bold transition-colors">
                View Pricing &amp; $0 Discovery Pledge →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
