// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
"use client";

import React, { useState } from "react";
import Link from "next/link";

interface Playbook {
  id: string;
  category: "owasp" | "mcp" | "standards" | "deployment";
  categoryLabel: string;
  title: string;
  readTime: string;
  summary: string;
  contentMarkdown: string;
  recommendedRules: string[];
}

const PLAYBOOKS: Playbook[] = [
  {
    id: "owasp-nhi-guide",
    category: "owasp",
    categoryLabel: "OWASP Standard",
    title: "The Definitive Guide to OWASP NHI Top 10 (2025/2026) & Inline Cedar Remediation",
    readTime: "12 min read",
    summary:
      "A comprehensive architectural breakdown of the 10 most critical Non-Human Identity vulnerabilities—from credential sprawl and shared sibling keys to unmanaged shadow agents—with exact Cedar 3.x policy remediations.",
    contentMarkdown: `### 1. The Shifting Threat Landscape
As autonomous agent swarms proliferate across cloud environments, static secrets and broad OAuth tokens become ticking time bombs. The OWASP Non-Human Identity Top 10 documents the exact attack vectors exploited by lateral movement scripts.

### 2. Core Vulnerabilities & Cedar Mitigations
- **NHI1: Unmanaged Sprawl:** Discovered through $0 passive inventory across AWS STS and GitHub.
- **NHI2: Unattributed Machine Ownership:** Solved via CODEOWNERS parsing and Cedar principal binding.
- **NHI3: Long-Lived Static Tokens:** Eliminated via dynamic OpenBao leases <= 300s TTL.

\`\`\`cedar
// Enforce least privilege on agent queries
permit (
  principal in Axiom::Role::"analyst_bot",
  action == Axiom::Action::"read",
  resource == Axiom::Table::"analytics"
) when {
  context.ast_verb == "SELECT"
};
\`\`\`
`,
    recommendedRules: [
      'permit(principal in Axiom::Role::"auditor", action == "read", resource);',
      'forbid(principal, action, resource) when { context.ast_verb in ["DROP", "TRUNCATE"] };',
    ],
  },
  {
    id: "mcp-security-top-10",
    category: "mcp",
    categoryLabel: "MCP Architecture",
    title: "Securing Model Context Protocol (MCP) Against Tool Poisoning & Rug Pulls",
    readTime: "9 min read",
    summary:
      "How to protect Anthropic Claude Desktop, Cursor, and custom agent runtimes against MCP01–MCP10 vulnerabilities using RFC 8785 JSON Canonicalization Scheme (JCS) hash pinning.",
    contentMarkdown: `### The Tool Definition Rug-Pull Attack
In a Model Context Protocol architecture, downstream MCP servers publish tool schemas dynamically. An adversary compromising an upstream tool server can alter input descriptions to deceive the LLM into invoking destructive endpoints.

### Defense-in-Depth via Axiom JCS Pinning
Axiom intercepts \`tools/list\` responses and computes an RFC 8785 canonical SHA-256 hash. If any parameter description changes at runtime without administrative re-authorization, Axiom denies execution fail-closed.
`,
    recommendedRules: [
      'forbid(principal, action == "tools/call", resource) when { context.jcs_tool_hash_drift == true };',
    ],
  },
  {
    id: "oauth-cimd-rfc8707",
    category: "standards",
    categoryLabel: "IETF Standards",
    title: "Implementing MCP OAuth 2.1: Client ID Metadata Documents (CIMD) & RFC 8707",
    readTime: "11 min read",
    summary:
      "Deep dive into the emerging IETF OAuth 2.1 specification for machine identities. How Client ID Metadata Documents eliminate static client secret registration and bind tokens to precise audience indicators.",
    contentMarkdown: `### Why Static Client Secrets Fail
Managing client secrets for hundreds of ephemeral agent containers creates secret sprawling. OAuth 2.1 CIMD uses HTTPS URL identifiers where the client publishes its public key set and metadata document.

### RFC 8707 Resource Indicators
Tokens issued for \`mcp://database.internal\` cannot be replayed against \`mcp://filesystem.internal\`. Axiom validates audience indicators in under 0.4ms.
`,
    recommendedRules: [
      'permit(principal, action, resource) when { context.audience == resource.uri };',
    ],
  },
  {
    id: "rfc-8693-token-exchange",
    category: "standards",
    categoryLabel: "IETF Standards",
    title: "Multi-Hop AI Agent Delegation with IETF RFC 8693 & SpiceDB Causal Revocation",
    readTime: "14 min read",
    summary:
      "When Agent A delegates a sub-task to Agent B, how do you prevent confused deputy attacks? Learn how RFC 8693 token exchange and Zanzibar graph relationships provide sub-millisecond delegation security.",
    contentMarkdown: `### The Confused Deputy in Multi-Agent Graphs
In frameworks like LangGraph and AutoGen, a supervisor agent delegates work to specialized sub-agents. If the sub-agent inherits the supervisor's full permissions, any prompt injection escalates privilege across the entire workflow.

### Downscoping via RFC 8693
Axiom exchanges the supervisor's token for an ephemeral downstream token scoped strictly to the delegated tool.
`,
    recommendedRules: [
      'permit(principal, action, resource) when { context.delegation_depth <= 2 && context.is_spiffe_attested == true };',
    ],
  },
  {
    id: "air-gapped-helm-guide",
    category: "deployment",
    categoryLabel: "Enterprise Infrastructure",
    title: "Deploying Air-Gapped NHI Governance in Regulated Customer VPCs with Helm & OpenBao",
    readTime: "15 min read",
    summary:
      "Step-by-step production runbook for deploying Axiom NHI inside isolated Kubernetes clusters without public internet access. Includes OpenBao MPL-2.0 container hardening and SPIFFE SPIRE setup.",
    contentMarkdown: `### Zero-Egress Air-Gapped Architecture
Regulated enterprises (financial institutions, defense contractors, healthcare networks) cannot route internal AI agent traffic through multi-tenant cloud proxies. Axiom runs 100% locally inside customer VPCs.

### OpenBao Container Isolation
Axiom coordinates with OpenBao over local Unix domain sockets or internal mTLS mesh, ensuring strict Apache-2.0 to MPL-2.0 boundary separation.
`,
    recommendedRules: [
      'forbid(principal, action, resource) when { context.egress_domain != "internal.cluster.local" };',
    ],
  },
  {
    id: "pilot-playbook-30-days",
    category: "deployment",
    categoryLabel: "Executive Playbook",
    title: "30-Day Design Partner Pilot Playbook: From observe-only to enforce Guardrails",
    readTime: "8 min read",
    summary:
      "A structured 4-week implementation roadmap for enterprise security teams: Week 1 passive discovery, Week 2 blast radius simulation, Week 3 observe-only shadow testing, and Week 4 inline enforcement.",
    contentMarkdown: `### Week-by-Week Rollout Strategy
- **Week 1 (Passive Discovery):** Deploy read-only connectors for $0. Map all shadow machine accounts.
- **Week 2 (Lineage Mapping):** Run \`v_shared_credential_siblings\` queries to identify risky shared keys.
- **Week 3 (Shadow Mode):** Route MCP traffic in \`observe-only\` mode to audit would-deny violations.
- **Week 4 (Active Enforcement):** Flip high-confidence Cedar rules to \`enforce\` mode with sub-50ms kill switch armed.
`,
    recommendedRules: [
      'permit(principal, action, resource); // Week 3 Observe Mode baseline',
    ],
  },
];

export default function ResourcesPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [activePlaybook, setActivePlaybook] = useState<Playbook | null>(null);

  const filteredPlaybooks = PLAYBOOKS.filter(
    (p) => selectedCategory === "all" || p.category === selectedCategory
  );

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto text-center mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-200/80 text-indigo-700 text-xs font-semibold uppercase tracking-wider mb-4">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
            <path d="M6 6h10" />
            <path d="M6 10h10" />
          </svg>
          Axiom NHI Knowledge Base
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight font-sans">
          Engineering Playbooks &amp; Standards
        </h1>
        <p className="mt-4 text-base sm:text-lg text-slate-600 max-w-3xl mx-auto leading-relaxed">
          In-depth technical guides on Model Context Protocol security, OWASP NHI Top 10 remediation, RFC 8693 multi-hop delegation, and air-gapped VPC deployment.
        </p>
      </div>

      <div className="max-w-7xl mx-auto">
        {/* Category Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-8 border-b border-slate-200 scrollbar-none">
          {[
            { id: "all", label: "All Guides (6)" },
            { id: "owasp", label: "OWASP Standards" },
            { id: "mcp", label: "MCP Protocol" },
            { id: "standards", label: "IETF RFCs" },
            { id: "deployment", label: "Enterprise Deployment" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedCategory(tab.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                selectedCategory === tab.id
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Playbooks Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPlaybooks.map((p) => (
            <div
              key={p.id}
              className="bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-6 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                    {p.categoryLabel}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    {p.readTime}
                  </span>
                </div>

                <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors leading-snug">
                  {p.title}
                </h3>

                <p className="mt-2.5 text-xs text-slate-600 leading-relaxed min-h-[54px]">
                  {p.summary}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-mono">Full Markdown</span>
                <button
                  onClick={() => setActivePlaybook(p)}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform cursor-pointer"
                >
                  Read Playbook
                  <span aria-hidden="true">&rarr;</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* In-Page Reader Drawer */}
      {activePlaybook && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-950/40 backdrop-blur-xs">
          <div className="bg-white border-l border-slate-200 w-full max-w-2xl h-full p-6 sm:p-8 overflow-y-auto shadow-2xl relative animate-in slide-in-from-right duration-200 flex flex-col justify-between">
            <div>
              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div>
                  <span className="text-xs font-bold font-mono text-indigo-600 uppercase">
                    {activePlaybook.categoryLabel} &bull; {activePlaybook.readTime}
                  </span>
                  <h2 className="text-xl font-bold text-slate-900 mt-1">
                    {activePlaybook.title}
                  </h2>
                </div>
                <button
                  onClick={() => setActivePlaybook(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-bold transition-colors cursor-pointer"
                  aria-label="Close drawer"
                >
                  ✕
                </button>
              </div>

              {/* Drawer Body Markdown */}
              <div className="mt-6 space-y-4 text-xs sm:text-sm text-slate-700 leading-relaxed font-sans">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <strong>Executive Summary:</strong> {activePlaybook.summary}
                </div>

                <div className="whitespace-pre-line font-mono text-xs bg-slate-900 text-slate-100 p-4 rounded-xl border border-slate-800 overflow-x-auto leading-relaxed">
                  {activePlaybook.contentMarkdown}
                </div>

                <div className="pt-2">
                  <span className="text-xs font-bold text-slate-900 uppercase font-mono block mb-2">
                    Recommended Cedar 3.x Guardrails:
                  </span>
                  <div className="space-y-1.5 font-mono text-xs">
                    {activePlaybook.recommendedRules.map((rule, idx) => (
                      <div key={idx} className="p-2.5 bg-slate-100 border border-slate-200 rounded-lg text-slate-800">
                        <code>{rule}</code>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between">
              <Link
                href="/playground"
                className="text-xs font-bold text-indigo-600 hover:text-indigo-700"
              >
                Test Rules in Playground &rarr;
              </Link>
              <button
                onClick={() => setActivePlaybook(null)}
                className="px-5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer"
              >
                Close Reader
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
