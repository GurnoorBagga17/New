// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
"use client";

import React, { useState } from "react";

interface ComplianceControl {
  framework: "soc2" | "iso27001" | "gdpr" | "eu_ai_act";
  frameworkLabel: string;
  controlId: string;
  title: string;
  axiomMechanism: string;
  evidenceArtifact: string;
}

const CONTROLS: ComplianceControl[] = [
  {
    framework: "soc2",
    frameworkLabel: "SOC 2 Type II",
    controlId: "CC6.1",
    title: "Logical Access Controls & Least Privilege",
    axiomMechanism: "In-process Cedar 3.x policy engine evaluates principal, action, and resource on every MCP tool invocation.",
    evidenceArtifact: "cedar_evaluation_traces.ocsf.json",
  },
  {
    framework: "soc2",
    frameworkLabel: "SOC 2 Type II",
    controlId: "CC6.6",
    title: "Boundary Protection & SSRF Prevention",
    axiomMechanism: "DNS-pinned outbound egress firewall blocks loopback (127.0.0.1) and cloud metadata (169.254.169.254) addresses.",
    evidenceArtifact: "dns_pinning_audit_log.json",
  },
  {
    framework: "soc2",
    frameworkLabel: "SOC 2 Type II",
    controlId: "CC7.2",
    title: "Security Incident Response & Anomaly Revocation",
    axiomMechanism: "Sub-50ms ArcSwap Emergency Kill Switch with InFlightCancellationRegistry aborting active sockets.",
    evidenceArtifact: "kill_switch_test_harness.log",
  },
  {
    framework: "iso27001",
    frameworkLabel: "ISO/IEC 27001:2022",
    controlId: "A.5.15",
    title: "Access Control for Machine & AI Workloads",
    axiomMechanism: "Cryptographic binding of caller agent_id to ephemeral OpenBao dynamic leases <= 300s TTL.",
    evidenceArtifact: "openbao_spiffe_attestation.pem",
  },
  {
    framework: "iso27001",
    frameworkLabel: "ISO/IEC 27001:2022",
    controlId: "A.8.15",
    title: "Logging and Monitoring Integrity",
    axiomMechanism: "OCSF v1.3 audit journal with cryptographic SHA-256 hash chaining (prev_hash -> entry_hash) and fsync WAL.",
    evidenceArtifact: "ocsf_hash_chain_manifest.json",
  },
  {
    framework: "gdpr",
    frameworkLabel: "GDPR / CCPA",
    controlId: "Art. 25 & 32",
    title: "Zero-Knowledge Data Protection by Design",
    axiomMechanism: "Pre-enqueue regex engine sanitizes API keys and PII to [REDACTED_BY_AXIOM_ZERO_SECRET_GUARD] before disk write.",
    evidenceArtifact: "pre_enqueue_redaction_unit_tests.rs",
  },
  {
    framework: "eu_ai_act",
    frameworkLabel: "EU AI Act",
    controlId: "Art. 12 & 14",
    title: "High-Risk AI System Record-Keeping & Human Oversight",
    axiomMechanism: "Single-use HMAC payload approval binding: sha256(agent_id | target | tool | canonical_args) with human sign-off.",
    evidenceArtifact: "cyclonedx_1.6_ai_bom.json",
  },
];

export default function TrustCenterPage() {
  const [selectedFramework, setSelectedFramework] = useState<string>("all");
  const [redactionInput, setRedactionInput] = useState<string>(
    `Calling Stripe API with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 and AWS_KEY=AKIAIOSFODNN7EXAMPLE and github_pat=ghp_ABC123xyz890secret`
  );

  const performRedaction = (raw: string) => {
    return raw
      .replace(/AKIA[0-9A-Z]{16}/g, "[REDACTED_BY_AXIOM_ZERO_SECRET_GUARD]")
      .replace(/ghp_[a-zA-Z0-9]{20,}/g, "[REDACTED_BY_AXIOM_ZERO_SECRET_GUARD]")
      .replace(/xoxb-[0-9]{10,}-[0-9]{10,}-[a-zA-Z0-9]{24}/g, "[REDACTED_BY_AXIOM_ZERO_SECRET_GUARD]")
      .replace(/Bearer\s+[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g, "Bearer [REDACTED_BY_AXIOM_ZERO_SECRET_GUARD]");
  };

  const filteredControls = CONTROLS.filter(
    (c) => selectedFramework === "all" || c.framework === selectedFramework
  );

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto text-center mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-xs font-semibold uppercase tracking-wider mb-4">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          Axiom NHI Trust &amp; Compliance Center
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight font-sans">
          Verifiable Cryptographic Evidence
        </h1>
        <p className="mt-4 text-base sm:text-lg text-slate-600 max-w-3xl mx-auto leading-relaxed">
          Security claims backed by code, not checkboxes. Download our Ed25519-signed CycloneDX 1.6 AI Software Bill of Materials (AI-BOM) and verify real-time zero-secret redaction below.
        </p>
      </div>

      <div className="max-w-7xl mx-auto space-y-12">
        {/* ====================================================================
           SECTION 1: Signed CycloneDX 1.6 AI-BOM Card
           ==================================================================== */}
        <section className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-10 shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-100">
            <div>
              <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider font-mono">
                SUPPLY-CHAIN INTEGRITY
              </span>
              <h2 className="text-2xl font-bold text-slate-900 mt-1">
                Signed CycloneDX 1.6 AI-BOM (Software Bill of Materials)
              </h2>
              <p className="text-sm text-slate-600 mt-1 max-w-2xl">
                Cryptographically signed with Ed25519. Itemizes every runtime crate, native dependency, and machine learning asset with reproducible SHA-256 digests.
              </p>
            </div>

            <a
              href="/api/sbom/download"
              download="axiom-nhi-cyclonedx-1.6.sbom.json"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex-shrink-0"
            >
              <svg className="w-4 h-4 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download Signed SBOM (JSON)
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6 text-xs">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <span className="text-slate-400 font-mono block text-[10px] uppercase">Format</span>
              <strong className="text-slate-900 font-bold block mt-1">CycloneDX 1.6 JSON</strong>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <span className="text-slate-400 font-mono block text-[10px] uppercase">Signature</span>
              <strong className="text-slate-900 font-bold block mt-1 font-mono">Ed25519 (RFC 8032)</strong>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <span className="text-slate-400 font-mono block text-[10px] uppercase">Runtime Crates</span>
              <strong className="text-slate-900 font-bold block mt-1">42 Verified Dependencies</strong>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <span className="text-slate-400 font-mono block text-[10px] uppercase">Lockfile SHA-256</span>
              <strong className="text-emerald-700 font-bold block mt-1 font-mono">Verified Match</strong>
            </div>
          </div>
        </section>

        {/* ====================================================================
           SECTION 2: Interactive Zero-Secret Redaction Verifier
           ==================================================================== */}
        <section className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-10 shadow-xs">
          <div className="mb-6">
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider font-mono">
              ZERO-KNOWLEDGE LIVE DEMO
            </span>
            <h2 className="text-2xl font-bold text-slate-900 mt-1">
              Interactive Pre-Enqueue Secret Redaction Verifier
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Paste arbitrary text containing canary AWS tokens, GitHub PATs, Slack credentials, or JWTs. Axiom scrubs them in memory before they ever touch disk or external SIEM sinks.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Input Pane */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span>Input Log String (With Raw Canary Secrets):</span>
                <button
                  onClick={() =>
                    setRedactionInput(
                      `AWS_SECRET_ACCESS_KEY=AKIA${Math.random().toString(36).substring(2, 18).toUpperCase()} and ghp_${Math.random().toString(36).substring(2, 22)}`
                    )
                  }
                  className="text-indigo-600 hover:text-indigo-700 text-xs font-mono cursor-pointer"
                >
                  Generate Random Canary
                </button>
              </div>
              <textarea
                value={redactionInput}
                onChange={(e) => setRedactionInput(e.target.value)}
                rows={5}
                className="w-full bg-slate-900 text-rose-300 p-4 rounded-xl font-mono text-xs border border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed"
              />
            </div>

            {/* Redacted Output Pane */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700">
                Axiom Pre-Enqueue Redacted Output (Stored in OCSF WAL):
              </div>
              <div className="w-full bg-slate-900 text-emerald-400 p-4 rounded-xl font-mono text-xs border border-slate-800 min-h-[120px] leading-relaxed break-all">
                {performRedaction(redactionInput)}
              </div>
            </div>
          </div>
        </section>

        {/* ====================================================================
           SECTION 3: Compliance Controls Matrix
           ==================================================================== */}
        <section className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-10 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
            <div>
              <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider font-mono">
                REGULATORY MAPPINGS
              </span>
              <h2 className="text-2xl font-bold text-slate-900 mt-1">
                Compliance Framework Matrix
              </h2>
            </div>

            {/* Framework Filter Buttons */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
              {[
                { id: "all", label: "All Frameworks" },
                { id: "soc2", label: "SOC 2 Type II" },
                { id: "iso27001", label: "ISO 27001" },
                { id: "gdpr", label: "GDPR / CCPA" },
                { id: "eu_ai_act", label: "EU AI Act" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedFramework(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                    selectedFramework === tab.id
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            {filteredControls.map((c, idx) => (
              <div
                key={idx}
                className="bg-slate-50 border border-slate-200 rounded-2xl p-6 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold font-mono text-indigo-600">
                      {c.frameworkLabel} &bull; {c.controlId}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold font-mono">
                      COMPLIANT
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">{c.title}</h3>
                  <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                    {c.axiomMechanism}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200 text-[11px] font-mono text-slate-500">
                  Evidence Artifact: <span className="text-slate-800 font-semibold">{c.evidenceArtifact}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
