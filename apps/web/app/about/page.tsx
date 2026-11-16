// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
"use client";

import React from "react";
import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
      {/* Header */}
      <div className="max-w-7xl mx-auto text-center mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-200/80 text-indigo-700 text-xs font-semibold uppercase tracking-wider mb-4">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          Our Mission &amp; Principles
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight">
          Building the Security Layer for Autonomous AI Workloads
        </h1>
        <p className="mt-4 text-base sm:text-lg text-slate-600 max-w-3xl mx-auto leading-relaxed">
          &ldquo;Discover every identity. Understand every relationship. Govern every action.&rdquo;
        </p>
      </div>

      <div className="max-w-4xl mx-auto space-y-12">
        {/* Founding Thesis Card */}
        <div className="bg-white border border-slate-200 rounded-3xl p-8 sm:p-10 shadow-xs space-y-4">
          <span className="text-xs font-bold font-mono text-indigo-600 uppercase tracking-wider">
            FOUNDING THESIS
          </span>
          <h2 className="text-2xl font-bold text-slate-900">
            Why We Started Axiom NHI
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            In 2024 and 2025, the software industry underwent an irreversible transition from human-driven API requests to autonomous, multi-agent LLM systems. Protocols like the <strong>Model Context Protocol (MCP)</strong> transformed models into agents capable of executing code, querying production databases, and deploying cloud infrastructure.
          </p>
          <p className="text-sm text-slate-600 leading-relaxed">
            Yet, enterprise security stacks remained designed for humans behind Okta logins or coarse network firewalls. When an AI agent is compromised by prompt injection, an OAuth token with <code>db:write</code> permits it to delete the company database.
          </p>
          <p className="text-sm text-slate-600 leading-relaxed">
            We built Axiom NHI to solve this fundamental gap: an <strong>in-line, sub-5ms governance gateway</strong> that validates arguments deterministically, brokers disposable zero-secret credentials, and halts rogue execution before damage occurs.
          </p>
        </div>

        {/* Five Architectural Principles */}
        <div className="space-y-6">
          <div className="text-center">
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider font-mono">
              ENGINEERING PILLARS
            </span>
            <h2 className="text-2xl font-bold text-slate-900 mt-1">
              Five Non-Negotiable Security Principles
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
              <span className="text-xs font-bold text-rose-600 font-mono">01. FAIL-CLOSED BY DESIGN</span>
              <h3 className="text-base font-bold text-slate-900 mt-1">Default Deny Everywhere</h3>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                Any policy timeout, schema mismatch, or unhandled exception immediately denies the tool invocation. We never implement fallbacks that default to permit.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
              <span className="text-xs font-bold text-indigo-600 font-mono">02. CLEAN LICENSING BOUNDARIES</span>
              <h3 className="text-base font-bold text-slate-900 mt-1">100% Apache-2.0 Open Core</h3>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                Axiom NHI is licensed under Apache-2.0. OpenBao (MPL-2.0) runs as an unmodified external binary in its own container boundary, interacting solely over network protocols.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
              <span className="text-xs font-bold text-emerald-600 font-mono">03. ZERO RAW TOKEN EXPOSURE</span>
              <h3 className="text-base font-bold text-slate-900 mt-1">Secretless Brokering</h3>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                Ephemeral tokens and database passwords never appear in cleartext in logs, traces, or unencrypted storage. Credentials are dynamically injected at egress.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
              <span className="text-xs font-bold text-purple-600 font-mono">04. CRYPTOGRAPHIC INTEGRITY</span>
              <h3 className="text-base font-bold text-slate-900 mt-1">Payload-Hashed Approvals</h3>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                Human-in-the-loop approvals sign a SHA-256 hash of the canonical serialized action payload, eliminating Time-of-Check to Time-of-Use (TOCTOU) exploits.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs md:col-span-2">
              <span className="text-xs font-bold text-sky-600 font-mono">05. DETERMINISTIC AUDITABILITY</span>
              <h3 className="text-base font-bold text-slate-900 mt-1">SHA-256 Chained OCSF Logs</h3>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                Every policy evaluation, secret lease, and identity delegation generates an OpenTelemetry span and an immutable, hash-chained OCSF audit record with zero-drop fsync queues.
              </p>
            </div>
          </div>
        </div>

        {/* Contact & Community Channels */}
        <div className="bg-slate-900 text-white rounded-3xl p-8 sm:p-10 shadow-xl text-center space-y-4">
          <h2 className="text-2xl font-bold">Connect with Our Engineering Team</h2>
          <p className="text-slate-300 text-sm max-w-xl mx-auto">
            Axiom NHI is maintained by systems and security engineers who believe machine identity governance must be fast, verifiable, and open-source.
          </p>
          <div className="pt-4 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/contact"
              className="px-6 py-3 rounded-full bg-white text-slate-900 text-xs font-bold hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Schedule Engineering Briefing &rarr;
            </Link>
            <a
              href="https://github.com/GurnoorBagga17/New"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 rounded-full bg-slate-800 text-white text-xs font-semibold border border-slate-700 hover:bg-slate-700 transition-colors"
            >
              GitHub Repository
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
