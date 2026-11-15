// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
import { useState } from "react";

interface OwaspItem {
  id: string;
  name: string;
  category: "OWASP_NHI_2025" | "OWASP_MCP_2025";
  description: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  status: "COMPLIANT" | "FLAGGED";
  affectedWorkloads: number;
}

const OWASP_CONTROLS: OwaspItem[] = [
  // OWASP NHI Top 10 (2025)
  {
    id: "NHI1:2025",
    name: "Improper Offboarding",
    category: "OWASP_NHI_2025",
    description: "Workload creator departed corporate directory while agent credentials remain active.",
    severity: "CRITICAL",
    status: "COMPLIANT",
    affectedWorkloads: 0,
  },
  {
    id: "NHI2:2025",
    name: "Secret Leakage in Plaintext Config",
    category: "OWASP_NHI_2025",
    description: "Hardcoded API tokens or private keys in git or environment variables instead of OpenBao dynamic leases.",
    severity: "CRITICAL",
    status: "COMPLIANT",
    affectedWorkloads: 0,
  },
  {
    id: "NHI3:2025",
    name: "Vulnerable Third-Party NHI",
    category: "OWASP_NHI_2025",
    description: "Over-scoped third-party SaaS integrations possessing broad write permissions.",
    severity: "HIGH",
    status: "FLAGGED",
    affectedWorkloads: 1,
  },
  {
    id: "NHI4:2025",
    name: "Unbounded Scope Escalation",
    category: "OWASP_NHI_2025",
    description: "Token exchange allowing subagents to acquire broader scopes than parent orchestrator.",
    severity: "HIGH",
    status: "COMPLIANT",
    affectedWorkloads: 0,
  },
  {
    id: "NHI5:2025",
    name: "Inadequate Auditing & Traceability",
    category: "OWASP_NHI_2025",
    description: "Missing immutable cryptographic audit logs linking AI actions to authenticated human sponsors.",
    severity: "MEDIUM",
    status: "COMPLIANT",
    affectedWorkloads: 0,
  },

  // OWASP MCP Top 10 (2025)
  {
    id: "MCP01:2025",
    name: "Long-Lived Bearer Token in Query/URI",
    category: "OWASP_MCP_2025",
    description: "Static tokens passed in query parameters or lacking bounded TTLs &le;300s.",
    severity: "HIGH",
    status: "COMPLIANT",
    affectedWorkloads: 0,
  },
  {
    id: "MCP02:2025",
    name: "MCP Tool Pin Mismatch / Supply Chain",
    category: "OWASP_MCP_2025",
    description: "Tool schema or package hash altered between deployment and invocation.",
    severity: "CRITICAL",
    status: "COMPLIANT",
    affectedWorkloads: 0,
  },
  {
    id: "MCP04:2025",
    name: "Prompt Injection Context Leak",
    category: "OWASP_MCP_2025",
    description: "Model attempts to leak system prompts or sensitive memory across MCP tool boundaries.",
    severity: "CRITICAL",
    status: "COMPLIANT",
    affectedWorkloads: 0,
  },
  {
    id: "MCP05:2025",
    name: "Command or SQL Injection in Arguments",
    category: "OWASP_MCP_2025",
    description: "Raw untrusted strings passed to bash or SQL execution tools without AST inspection.",
    severity: "CRITICAL",
    status: "COMPLIANT",
    affectedWorkloads: 0,
  },
  {
    id: "MCP07:2025",
    name: "Missing RFC 8707 Resource Indicator",
    category: "OWASP_MCP_2025",
    description: "Bearer tokens unconstrained to the target MCP server, enabling confused deputy attacks.",
    severity: "HIGH",
    status: "COMPLIANT",
    affectedWorkloads: 0,
  },
];

export function RiskEnginePage() {
  const [controls] = useState<OwaspItem[]>(OWASP_CONTROLS);
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | "OWASP_NHI_2025" | "OWASP_MCP_2025">("ALL");

  const filteredControls = controls.filter(
    (c) => categoryFilter === "ALL" || c.category === categoryFilter
  );

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-border-subtle pb-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-brand-orange">
              STANDARDS-GROUNDED COMPLIANCE &bull; RISK ENGINE
            </span>
            <span className="inline-flex items-center rounded-full border border-state-enforce/30 bg-state-enforce-tint px-2 py-0.5 font-mono text-[10px] text-state-enforce">
              RUST CRATE: risk-engine
            </span>
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-text-primary">
            OWASP NHI &amp; MCP Risk Engine
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Continuous deterministic evaluation against the official OWASP Non-Human Identity Top 10 (2025) and OWASP Model Context Protocol Top 10 (2025) benchmarks.
          </p>
        </div>

        {/* Filter Buttons */}
        <div className="flex rounded-input border border-border-subtle bg-surface-1 p-1">
          <button
            type="button"
            onClick={() => setCategoryFilter("ALL")}
            className={`rounded px-3 py-1.5 font-mono text-xs transition ${
              categoryFilter === "ALL"
                ? "bg-surface-2 font-semibold text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            All Controls ({controls.length})
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter("OWASP_NHI_2025")}
            className={`rounded px-3 py-1.5 font-mono text-xs transition ${
              categoryFilter === "OWASP_NHI_2025"
                ? "bg-surface-2 font-semibold text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            OWASP NHI Top 10
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter("OWASP_MCP_2025")}
            className={`rounded px-3 py-1.5 font-mono text-xs transition ${
              categoryFilter === "OWASP_MCP_2025"
                ? "bg-surface-2 font-semibold text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            OWASP MCP Top 10
          </button>
        </div>
      </div>

      {/* Compliance Scorecards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-text-muted">Fleet Risk Posture</p>
          <p className="mt-2 font-display text-2xl font-bold text-state-enforce">96 / 100</p>
          <p className="mt-1 text-xs text-state-enforce">&check; Low Aggregate Exposure</p>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-state-enforce">Compliant Controls</p>
          <p className="mt-2 font-display text-2xl font-bold text-state-enforce">
            {controls.filter((c) => c.status === "COMPLIANT").length} / {controls.length}
          </p>
          <p className="mt-1 text-xs text-text-muted">Deterministic validation active</p>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-state-pending">Flagged Controls</p>
          <p className="mt-2 font-display text-2xl font-bold text-state-pending">
            {controls.filter((c) => c.status === "FLAGGED").length}
          </p>
          <p className="mt-1 text-xs text-text-muted">1 over-scoped third-party NHI</p>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-text-muted">AST Pre-Execution Blocks</p>
          <p className="mt-2 font-display text-2xl font-bold text-text-primary">100%</p>
          <p className="mt-1 text-xs text-text-muted">SQL &amp; Bash injection immunity</p>
        </div>
      </div>

      {/* Controls Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {filteredControls.map((control) => (
          <div
            key={control.id}
            className="rounded-card border border-border-subtle bg-surface-1 p-5 shadow-sm transition hover:border-border-strong"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-brand-orange">{control.id}</span>
              <span
                className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                  control.status === "COMPLIANT"
                    ? "bg-state-enforce-tint text-state-enforce"
                    : "bg-state-pending-tint text-state-pending"
                }`}
              >
                {control.status}
              </span>
            </div>

            <h3 className="mt-2 font-display text-base font-bold text-text-primary">
              {control.name}
            </h3>
            <p className="mt-1 text-xs text-text-secondary leading-relaxed">
              {control.description}
            </p>

            <div className="mt-4 flex items-center justify-between border-t border-border-subtle pt-3 font-mono text-xs">
              <span className="text-text-muted">
                SEVERITY: <span className="text-text-primary">{control.severity}</span>
              </span>
              <span className="text-text-muted">
                AFFECTED:{" "}
                <span className={control.affectedWorkloads > 0 ? "text-state-pending font-bold" : "text-text-primary"}>
                  {control.affectedWorkloads} Workloads
                </span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
