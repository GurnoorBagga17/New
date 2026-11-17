"use client";

import React from "react";
import Link from "next/link";
import { SiteShell } from "../components/SiteShell";

const SECURITY_INVARIANTS = [
  {
    num: "01",
    title: "Fail-Closed by Design",
    desc: "Any evaluation failure, timeout, unhandled exception, or unexpected JSON-RPC envelope MUST reject the operation immediately. No fallback defaults to permit.",
    badge: "GATEWAY INVARIANT",
  },
  {
    num: "02",
    title: "Zero Raw Token Exposure",
    desc: "Secrets and dynamic credentials never appear in raw text in logs, audit traces, error messages, or client-side storage. OpenBao dynamic leases are injected on-the-fly at egress.",
    badge: "CRYPTOGRAPHIC INVARIANT",
  },
  {
    num: "03",
    title: "Cryptographic Payload Binding",
    desc: "Human-in-the-loop approvals sign a canonical SHA-256 / BLAKE3 hash of the serialized action payload, verified before execution to eliminate Time-of-Check to Time-of-Use (TOCTOU) risks.",
    badge: "APPROVAL INVARIANT",
  },
  {
    num: "04",
    title: "Clean Licensing Isolation",
    desc: "Axiom is licensed under Apache-2.0. OpenBao (MPL-2.0) executes as an unmodified binary in its own process/container boundary via external network APIs—never linked into Axiom crates.",
    badge: "LICENSE INVARIANT",
  },
  {
    num: "05",
    title: "Deterministic OpenTelemetry Audit",
    desc: "Every policy evaluation, identity delegation, and secret access generates a cryptographically hashed OpenTelemetry trace span with complete identity attribution.",
    badge: "AUDIT INVARIANT",
  },
];

const COMPLIANCE_FRAMEWORKS = [
  { name: "SOC 2 Type II", status: "Readiness / Continuous Monitoring", icon: "🛡️" },
  { name: "ISO / IEC 27001:2022", status: "Controls Aligned", icon: "🔒" },
  { name: "OWASP NHI & MCP Top 10", status: "100% Rule Coverage", icon: "📋" },
  { name: "NIST SP 800-207 (Zero Trust)", status: "Architecture Aligned", icon: "🏛️" },
  { name: "FedRAMP High Baseline", status: "Sovereign Deploy Compatible", icon: "🇺🇸" },
  { name: "GDPR / CCPA / CPRA", status: "Zero PII Retention Verified", icon: "🇪🇺" },
];

export default function SecurityPage() {
  return (
    <SiteShell>
      <div className="py-16 sm:py-24 bg-[var(--bg-canvas)] min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-semibold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 mb-4">
              <span>AXIOM TRUST &amp; SECURITY CENTER</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold font-sans tracking-tight text-[var(--text-primary)]">
              Security Built on Formal Invariants, Not Marketing Promises
            </h1>
            <p className="mt-4 text-lg text-[var(--text-secondary)] leading-relaxed">
              When securing autonomous AI agents and non-human identities, probabilistic security is unacceptable. Axiom enforces mathematically verified Cedar policies, cryptographic payload signatures, and fail-closed runtime boundaries.
            </p>
          </div>

          {/* 5 Core Invariants */}
          <div className="mb-20">
            <div className="border-b border-[var(--border-subtle)] pb-4 mb-8">
              <h2 className="text-2xl font-bold text-[var(--text-primary)]">
                The 5 Non-Negotiable Architectural Invariants
              </h2>
              <p className="text-xs text-[var(--text-muted)] font-mono mt-1">
                Hardcoded guarantees baked into every line of Axiom gateway code
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {SECURITY_INVARIANTS.map((inv) => (
                <div
                  key={inv.num}
                  className="p-6 rounded-2xl bg-[var(--bg-surface-1)] border border-[var(--border-subtle)] shadow-xs space-y-3 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-2xl font-mono font-bold text-blue-600">{inv.num}</span>
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[var(--bg-surface-2)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                        {inv.badge}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-[var(--text-primary)] mb-2">
                      {inv.title}
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      {inv.desc}
                    </p>
                  </div>
                  <div className="pt-4 border-t border-[var(--border-subtle)] flex items-center gap-1.5 text-[11px] font-mono text-emerald-600">
                    <span>✓</span>
                    <span>Enforced in CI &amp; Rust Kernel</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Compliance & Standards Grid */}
          <div className="mb-20 bg-[var(--bg-surface-1)] border border-[var(--border-subtle)] rounded-2xl p-8 sm:p-10 shadow-sm">
            <div className="border-b border-[var(--border-subtle)] pb-4 mb-6">
              <h2 className="text-xl font-bold text-[var(--text-primary)]">
                Enterprise Compliance &amp; Standards Alignment
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {COMPLIANCE_FRAMEWORKS.map((fw) => (
                <div
                  key={fw.name}
                  className="flex items-center gap-3 p-4 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)]"
                >
                  <span className="text-2xl">{fw.icon}</span>
                  <div>
                    <h3 className="text-xs font-bold text-[var(--text-primary)]">{fw.name}</h3>
                    <p className="text-[11px] font-mono text-emerald-600">{fw.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Security Whitepaper & Pen Test Request */}
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-8 sm:p-12 text-white shadow-lg flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="space-y-2 max-w-xl">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-blue-400">
                AUDITOR-READY REPORTS
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold">
                Request Our Third-Party Penetration Test &amp; Architecture Audit
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Receive our complete SOC 2 readiness report, red-team penetration test report, and Cedar formal verification proofs under NDA.
              </p>
            </div>
            <div className="shrink-0">
              <Link
                href="/contact"
                className="px-6 py-3 rounded-lg text-xs font-mono font-bold uppercase tracking-wider bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-md block text-center"
              >
                Request Security Packet →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
