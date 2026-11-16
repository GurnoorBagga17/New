"use client";

import React, { useState } from "react";
import Link from "next/link";
import { SiteShell } from "../components/SiteShell";

interface SolutionItem {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  description: string;
  protocols: string[];
  capabilities: { icon: string; title: string; desc: string }[];
  diagramTitle: string;
  codeSnippet: string;
}

const SOLUTIONS: SolutionItem[] = [
  {
    id: "mcp-runtime",
    badge: "SOLUTION 01 • AGENTIC RUNTIME",
    title: "Inline Model Context Protocol (MCP) Security",
    subtitle: "Deterministic guardrails for Claude, Cursor, LangChain, and autonomous coding agents.",
    description: "AI agents executing MCP tools can easily be prompted or hallucinated into destructive actions—such as dropping production tables, traversing the root filesystem, or exfiltrating cloud metadata via SSRF. Axiom proxies MCP JSON-RPC messages inline, parses arguments via strict AST validators, and verifies intent in under 5ms using formal Cedar policies before packets reach resources.",
    protocols: ["JSON-RPC 2.0", "AWS Cedar 3.x", "SQL AST Verifier", "Path Canonicalizer"],
    capabilities: [
      {
        icon: "🛡️",
        title: "Destructive DDL & SQL Injection Block",
        desc: "AST parser checks SQL statements for DROP, TRUNCATE, and ALTER TABLE statements regardless of agent prompt tampering.",
      },
      {
        icon: "📁",
        title: "Filesystem Path Traversal Containment",
        desc: "Strict canonicalization prevents directory traversal attacks (../../etc/shadow) outside sandboxed runtime directories.",
      },
      {
        icon: "🌐",
        title: "SSRF & Cloud Metadata Protection",
        desc: "Egress domain allowlisting blocks requests to AWS/GCP instance metadata endpoints (169.254.169.254).",
      },
    ],
    diagramTitle: "MCP INLINE PROXY VERIFICATION",
    codeSnippet: `forbid (
  principal in Group::"autonomous_agents",
  action == Action::"database:execute",
  resource in Database::"production"
) when {
  context.ast.is_destructive == true ||
  context.ast.statement_type in ["DROP", "TRUNCATE"]
};`,
  },
  {
    id: "secretless-broker",
    badge: "SOLUTION 02 • WORKLOAD IAM",
    title: "Zero-Standing-Privilege Secretless Brokering",
    subtitle: "Dynamic ephemeral credential injection via OpenBao and AWS STS.",
    description: "Static API keys and long-lived service account tokens are the #1 attack vector in non-human identity breaches. Axiom injects single-use, dynamic credentials from OpenBao (MPL-2.0 boundary) and STS directly into verified tool calls at the wire level—ensuring clients and autonomous agents never handle raw credentials.",
    protocols: ["OpenBao Dynamic Engine", "RFC 8707 Token Exchange", "SPIFFE / SPIRE", "AWS STS AssumeRole"],
    capabilities: [
      {
        icon: "🔑",
        title: "Zero Raw Secret Exposure Invariant",
        desc: "Clients receive scoped execution handles. Raw database passwords and AWS keys are injected on-the-fly and never logged.",
      },
      {
        icon: "⏱️",
        title: "Short-Lived Dynamic TTLs (15–60s)",
        desc: "Credentials expire automatically within minutes, eliminating the risk of token exfiltration or long-term replay attacks.",
      },
      {
        icon: "🔄",
        title: "Automated JIT Vault Leasing",
        desc: "Integrates with OpenBao, HashiCorp Vault, and cloud secret managers for automated Just-In-Time lease rotation.",
      },
    ],
    diagramTitle: "DYNAMIC SECRETLESS LEASE INJECTION",
    codeSnippet: `permit (
  principal in Group::"verified_read_agents",
  action == Action::"warehouse:select",
  resource in Table::"q3_metrics"
) when {
  context.nhi.attested == true &&
  context.openbao.lease_ttl <= 60
};`,
  },
  {
    id: "nhi-posture",
    badge: "SOLUTION 03 • IDENTITY GOVERNANCE",
    title: "Non-Human Identity Posture Management (NHI-SPM)",
    subtitle: "Complete shadow agent discovery, human sponsorship, and $0 discovery pledge.",
    description: "Most enterprises have 10x to 50x more non-human identities than human employees—spanning dormant GitHub personal access tokens, orphaned Kubernetes service accounts, and unmonitored AWS IAM roles. Axiom scans your entire estate in read-only mode to build a unified catalog with attributed human owners.",
    protocols: ["AWS IAM SDK", "Kube Client", "GitHub Octocrab", "OWASP NHI Top 10"],
    capabilities: [
      {
        icon: "🔍",
        title: "$0 Unlimited Shadow Discovery",
        desc: "Discover every service account, agent, and bot for free forever. No per-seat taxes or scan volume restrictions.",
      },
      {
        icon: "👤",
        title: "Automatic Human Sponsorship Attribution",
        desc: "Correlates git commit history, PR authorship, and Slack activity to automatically assign a human owner to every workload.",
      },
      {
        icon: "⚠️",
        title: "Dormant & Stale Key Identification",
        desc: "Flags credentials untouched for > 90 days and un-rotated secrets violating compliance standards.",
      },
    ],
    diagramTitle: "SHADOW NHI DISCOVERY & ATTRIBUTION",
    codeSnippet: `// Discovered Workload Metadata
{
  "identity": "agent:reporting-worker-4",
  "human_sponsor": "eng-lead@company.com",
  "confidence": 0.98,
  "sources": ["CODEOWNERS", "CIMD_OIDC", "PR_ACTIVITY"],
  "dormant_credentials_count": 0
}`,
  },
  {
    id: "causal-killswitch",
    badge: "SOLUTION 04 • BLAST RADIUS & REVOCATION",
    title: "Causal Blast Radius & Instant Kill Switch",
    subtitle: "SpiceDB machine-to-machine delegation graphs with < 50ms fleet revocation.",
    description: "When an agent or service account is compromised, traditional revocation takes hours and risks bringing down unintended downstream dependencies. Axiom models relationships in SpiceDB, letting you simulate revocations before execution and dispatch cryptographic kill signals that propagate across distributed gateway replicas in milliseconds.",
    protocols: ["SpiceDB Relation Tuples", "RFC 8693 Token Exchange", "Fail-Closed Gateway", "SHA-256 Signatures"],
    capabilities: [
      {
        icon: "⚡",
        title: "Sub-50ms Fleet-Wide Propagation",
        desc: "Revocation signals dispatch to all distributed gateway instances, severing access across AWS, K8s, and cloud databases instantly.",
      },
      {
        icon: "🕸️",
        title: "What-If Revocation Simulation",
        desc: "Preview transitive blast-radius impact before executing a kill switch to ensure zero unexpected business outages.",
      },
      {
        icon: "🔒",
        title: "Two-Step Cryptographic Arming",
        desc: "Requires explicit operator arming and SHA-256 action payload signing to prevent accidental production disruptions.",
      },
    ],
    diagramTitle: "SPICEDB DELEGATION SEVERANCE",
    codeSnippet: `// Immediate Revocation Signal
forbid (
  principal == Agent::"compromised-worker-1",
  action,
  resource
) when {
  context.emergency.kill_switch_active == true
};`,
  },
];

export default function SolutionsPage() {
  const [activeTab, setActiveTab] = useState<string>("mcp-runtime");
  const activeSolution = SOLUTIONS.find((s) => s.id === activeTab) || SOLUTIONS[0]!;

  return (
    <SiteShell>
      <div className="py-16 sm:py-24 bg-[var(--bg-canvas)] min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-semibold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 mb-4">
              <span>ENTERPRISE SOLUTIONS &amp; ARCHITECTURE</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold font-sans tracking-tight text-[var(--text-primary)]">
              Comprehensive Runtime Security for Non-Human Identities
            </h1>
            <p className="mt-4 text-lg text-[var(--text-secondary)] leading-relaxed">
              Explore how Axiom secures the full lifecycle of AI agents and machine workloads—from initial discovery and AST validation to dynamic secret leasing and instant kill switches.
            </p>

            {/* Solution Selector Tabs */}
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              {SOLUTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveTab(s.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-mono font-bold tracking-wider uppercase transition-all cursor-pointer ${
                    activeTab === s.id
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-[var(--bg-surface-1)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:bg-[var(--bg-surface-2)]"
                  }`}
                >
                  {s.title.split(" ")[0]} {s.title.split(" ")[1]}
                </button>
              ))}
            </div>
          </div>

          {/* Active Solution Hero Card */}
          <div className="bg-[var(--bg-surface-1)] border border-[var(--border-subtle)] rounded-2xl p-6 sm:p-12 shadow-sm mb-16">
            <div className="max-w-4xl">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-blue-600">
                {activeSolution.badge}
              </span>
              <h2 className="text-3xl sm:text-4xl font-bold text-[var(--text-primary)] mt-2 mb-3">
                {activeSolution.title}
              </h2>
              <p className="text-base text-blue-700 font-medium mb-4">
                {activeSolution.subtitle}
              </p>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-6">
                {activeSolution.description}
              </p>

              {/* Supported Protocols Strip */}
              <div className="flex flex-wrap items-center gap-2 mb-8">
                <span className="text-xs font-mono font-bold uppercase text-[var(--text-muted)] mr-2">
                  Protocols &amp; Engines:
                </span>
                {activeSolution.protocols.map((proto) => (
                  <span
                    key={proto}
                    className="px-2.5 py-1 rounded-md text-xs font-mono font-semibold bg-[var(--bg-surface-2)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                  >
                    {proto}
                  </span>
                ))}
              </div>
            </div>

            {/* 3 Capabilities Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-8 border-t border-[var(--border-subtle)]">
              {activeSolution.capabilities.map((cap) => (
                <div key={cap.title} className="p-5 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-2">
                  <div className="text-2xl">{cap.icon}</div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">
                    {cap.title}
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    {cap.desc}
                  </p>
                </div>
              ))}
            </div>

            {/* Code / Policy Rule Preview Box */}
            <div className="mt-8 rounded-xl bg-slate-900 border border-slate-800 p-5 text-slate-100 font-mono text-xs overflow-x-auto">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800 text-slate-400">
                <span className="font-bold uppercase tracking-wider">{activeSolution.diagramTitle}</span>
                <span className="text-[11px] text-emerald-400">Deterministic Enforcement</span>
              </div>
              <pre className="leading-relaxed">
                <code>{activeSolution.codeSnippet}</code>
              </pre>
            </div>
          </div>

          {/* Bottom CTA Strip */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-8 sm:p-12 text-white shadow-lg text-center max-w-4xl mx-auto space-y-6">
            <h2 className="text-2xl sm:text-3xl font-bold">
              Ready to implement inline security in your environment?
            </h2>
            <p className="text-sm text-blue-100 max-w-xl mx-auto">
              Test Axiom locally via Docker compose in under 5 minutes or talk to our security engineering team for a personalized architecture walkthrough.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
              <Link
                href="/docs"
                className="px-6 py-3 rounded-lg text-xs font-mono font-bold uppercase tracking-wider bg-white text-blue-700 hover:bg-blue-50 transition-colors shadow-sm"
              >
                Docker Quickstart →
              </Link>
              <Link
                href="/contact"
                className="px-6 py-3 rounded-lg text-xs font-mono font-bold uppercase tracking-wider bg-blue-800/80 text-white hover:bg-blue-900 border border-blue-400/30 transition-colors"
              >
                Schedule Architecture Review
              </Link>
            </div>
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
