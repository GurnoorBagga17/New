// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
"use client";

import React from "react";

interface ReleaseNote {
  version: string;
  gate: string;
  date: string;
  title: string;
  gitRef: string;
  testCount: string;
  benchmark: string;
  highlights: string[];
}

const RELEASES: ReleaseNote[] = [
  {
    version: "v1.0.0",
    gate: "Gate G4",
    date: "March 2026",
    title: "Production Fleet Governance & Cryptographic Audit Hardening",
    gitRef: "commit 4a9f82d",
    testCount: "1,420 unit + integration tests (100% pass)",
    benchmark: "P99 wire latency < 3.8ms at 10,000 rps",
    highlights: [
      "Sub-50ms Lock-Free ArcSwap Fleet Kill Switch with InFlightCancellationRegistry",
      "OCSF v1.3 audit streaming with pre-enqueue canary secret scrubbing",
      "Cryptographic SHA-256 hash chaining on all tamper-evident WAL journals",
      "Automated Helm charts for air-gapped customer VPC installations",
    ],
  },
  {
    version: "v0.9.0",
    gate: "Gate G3",
    date: "February 2026",
    title: "OpenBao Dynamic Secretless Broker & Atomic Approvals",
    gitRef: "commit b38c11e",
    testCount: "980 tests passing",
    benchmark: "OpenBao dynamic lease injection < 1.5ms overhead",
    highlights: [
      "Clean MPL-2.0 container boundary separation for OpenBao dynamic broker",
      "Zero-downtime dual-secret rotation state machine (ZeroDowntimeRotationJob)",
      "RFC 8693 token exchange for multi-hop agent delegation graphs",
      "Atomic payload-hashed approvals: sha256(agent_id | target | tool | args)",
    ],
  },
  {
    version: "v0.6.0",
    gate: "Gate G2",
    date: "January 2026",
    title: "PostgreSQL 16 Lineage Graph & 30-Minute Shadow Audit",
    gitRef: "commit 7c029fa",
    testCount: "640 tests passing",
    benchmark: "Blast radius simulation < 45ms across 10,000 NHIs",
    highlights: [
      "Static dependency lineage graph via PostgreSQL 16 v_shared_credential_siblings",
      "ContextSync gRPC synchronization keeping Postgres off the < 5ms hot wire path",
      "GitHub Enterprise CODEOWNERS parser for >= 0.85 owner confidence attribution",
      "Self-serve 30-minute shadow audit web and CLI engine",
    ],
  },
  {
    version: "v0.3.0",
    gate: "Gate G1",
    date: "December 2025",
    title: "Inline ExtMCP Runtime Wedge & Cedar Policy Engine",
    gitRef: "commit 10d48aa",
    testCount: "320 tests passing",
    benchmark: "In-memory Cedar policy evaluation < 0.8ms p50",
    highlights: [
      "Native compiled Rust 1.84 ExtMCP reverse proxy gateway",
      "Deterministic sqlparser-rs AST scan blocking destructive DDL queries",
      "JCS RFC 8785 SHA-256 tool-definition hash pinning to stop rug-pulls",
      "Strict fail-closed runtime defaults on network/timeout errors",
    ],
  },
];

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
      {/* Header */}
      <div className="max-w-7xl mx-auto text-center mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200/80 text-blue-700 text-xs font-semibold uppercase tracking-wider mb-4">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          Engineering Releases
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight">
          Axiom NHI Changelog
        </h1>
        <p className="mt-4 text-base sm:text-lg text-slate-600 max-w-3xl mx-auto leading-relaxed">
          Chronological release notes across Gates G1 through G4. Every milestone includes reproducible benchmarks, commit digests, and test coverage metrics.
        </p>
      </div>

      <div className="max-w-4xl mx-auto space-y-10">
        {RELEASES.map((rel) => (
          <div
            key={rel.version}
            className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs hover:shadow-md transition-shadow"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <span className="text-xl font-black text-slate-900 font-mono">
                  {rel.version}
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-mono font-bold text-xs border border-indigo-200">
                  {rel.gate}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 font-mono">
                <span>{rel.date}</span>
                <span>&bull;</span>
                <span className="text-slate-700 font-semibold">{rel.gitRef}</span>
              </div>
            </div>

            <div className="mt-4">
              <h2 className="text-lg font-bold text-slate-900">{rel.title}</h2>

              {/* Benchmarks & Test Metrics */}
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-mono">
                <span className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
                  ✓ {rel.testCount}
                </span>
                <span className="px-2.5 py-1 rounded-md bg-sky-50 text-sky-800 border border-sky-200 font-semibold">
                  ⚡ {rel.benchmark}
                </span>
              </div>

              {/* Release Highlights */}
              <ul className="mt-4 space-y-2 text-xs sm:text-sm text-slate-600">
                {rel.highlights.map((h, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <span className="text-indigo-600 font-bold mt-0.5">&bull;</span>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
