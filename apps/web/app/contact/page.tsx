"use client";

import React, { useState } from "react";
import Link from "next/link";
import { SiteShell } from "../components/SiteShell";

export default function ContactPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    agentCount: "50-250",
    challenge: "mcp-security",
    message: "",
  });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.email.includes("@")) {
      setStatus("error");
      setErrorMessage("Please enter a valid work email address.");
      return;
    }

    setStatus("loading");
    setErrorMessage(null);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit request");
      }

      setTicketId(data.ticketId || "AXM-ENG-8492");
      setStatus("success");
    } catch (err: unknown) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Submission failed. Please try again.");
    }
  };

  return (
    <SiteShell>
      <div className="py-16 sm:py-24 bg-[var(--bg-canvas)] min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Page Heading */}
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-semibold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 mb-4">
              <span>TALK TO A PRINCIPAL SECURITY ARCHITECT</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold font-sans tracking-tight text-[var(--text-primary)]">
              Let&apos;s Secure Your Non-Human Identities
            </h1>
            <p className="mt-4 text-lg text-[var(--text-secondary)] leading-relaxed">
              Whether you are governing 20 autonomous AI agents or 20,000 multi-cloud service accounts, our core engineering team will walk you through deployment, policy authoring, and VPC architecture.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            {/* Left 7 Columns: Interactive Inquiry & Architecture Request Form */}
            <div className="lg:col-span-7 bg-[var(--bg-surface-1)] border border-[var(--border-subtle)] rounded-2xl p-6 sm:p-10 shadow-sm">
              {status === "success" ? (
                <div className="text-center py-12 space-y-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto text-2xl font-bold">
                    ✓
                  </div>
                  <h2 className="text-2xl font-bold text-[var(--text-primary)]">
                    Inquiry Received — Architect Assigned
                  </h2>
                  <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto">
                    Your request ticket <span className="font-mono font-bold text-blue-600">{ticketId}</span> has been dispatched to our engineering on-call rotation. We will reply within 1 business hour.
                  </p>
                  <div className="pt-6">
                    <button
                      type="button"
                      onClick={() => {
                        setStatus("idle");
                        setTicketId(null);
                      }}
                      className="px-6 py-2.5 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                    >
                      Submit Another Inquiry
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="border-b border-[var(--border-subtle)] pb-4 mb-6">
                    <h2 className="text-xl font-bold text-[var(--text-primary)]">
                      Technical Architecture &amp; Demo Request
                    </h2>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      Direct engineering access. Zero aggressive sales cadences.
                    </p>
                  </div>

                  {status === "error" && (
                    <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono">
                      {errorMessage}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-xs font-mono font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
                        Your Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="Ada Lovelace"
                        className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-mono font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
                        Work Email *
                      </label>
                      <input
                        type="email"
                        required
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        placeholder="ada@company.com"
                        className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-xs font-mono font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
                        Company Name
                      </label>
                      <input
                        type="text"
                        value={form.company}
                        onChange={(e) => setForm({ ...form, company: e.target.value })}
                        placeholder="Anthropic, Cursor, FinTech..."
                        className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-mono font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
                        Active NHIs / Agent Fleet Size
                      </label>
                      <select
                        value={form.agentCount}
                        onChange={(e) => setForm({ ...form, agentCount: e.target.value })}
                        className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="1-50">1 – 50 Agents / NHIs</option>
                        <option value="50-250">50 – 250 Agents / NHIs</option>
                        <option value="250-1000">250 – 1,000 Agents / NHIs</option>
                        <option value="1000+">1,000+ Enterprise Scale</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-mono font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
                      Primary Architectural Focus
                    </label>
                    <select
                      value={form.challenge}
                      onChange={(e) => setForm({ ...form, challenge: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="mcp-security">MCP Tool Interception &amp; AST Guardrails (SQL/SSRF/Path)</option>
                      <option value="secretless-broker">Zero-Secret Dynamic Leases (OpenBao / HashiCorp Vault)</option>
                      <option value="kill-switch">Fleet-Wide Causal Kill Switch &amp; Blast Radius</option>
                      <option value="discovery">Complete $0 Shadow Audit &amp; Multi-Cloud Discovery</option>
                      <option value="air-gapped">Air-Gapped Sovereign Deployment</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-mono font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
                      Environment Details or Specific Use Case
                    </label>
                    <textarea
                      rows={4}
                      value={form.message}
                      onChange={(e) => setForm({ ...form, message: e.target.value })}
                      placeholder="e.g. We have Claude Code agents invoking postgres MCP tools against production databases and need inline fail-closed guardrails..."
                      className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className="w-full py-3 px-6 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
                  >
                    {status === "loading" ? "Dispatching to Security Architect..." : "Schedule 30-Min Architecture Session →"}
                  </button>
                  <p className="text-[11px] text-center text-[var(--text-muted)]">
                    Protected by Axiom Zero-Secret Invariant. We never share customer data.
                  </p>
                </form>
              )}
            </div>

            {/* Right 5 Columns: Enterprise Support Details & Trust Center */}
            <div className="lg:col-span-5 space-y-6">
              {/* Direct Booking Card */}
              <div className="bg-[var(--bg-surface-1)] border border-[var(--border-subtle)] rounded-2xl p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center font-bold">
                    ⚡
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[var(--text-primary)]">
                      Instant Self-Serve Deployment
                    </h3>
                    <p className="text-xs text-[var(--text-muted)]">
                      No meetings required to get started
                    </p>
                  </div>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Run our Docker compose stack locally or in staging with one command. Fully functional Apache-2.0 runtime with SQLite/Postgres and OpenBao.
                </p>
                <div className="bg-[var(--bg-canvas)] p-3 rounded-lg border border-[var(--border-subtle)] font-mono text-xs text-[var(--text-primary)]">
                  docker compose up axiom-gateway
                </div>
                <Link
                  href="/docs"
                  className="inline-flex items-center text-xs font-mono font-bold text-blue-600 hover:text-blue-800 transition-colors"
                >
                  Read Quickstart Docs →
                </Link>
              </div>

              {/* SLA & Response Guarantees */}
              <div className="bg-[var(--bg-surface-1)] border border-[var(--border-subtle)] rounded-2xl p-6 shadow-sm space-y-3">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Enterprise Support Commitments
                </h3>
                <div className="space-y-3 pt-2 text-xs text-[var(--text-secondary)] font-mono">
                  <div className="flex justify-between items-center border-b border-[var(--border-subtle)] pb-2">
                    <span>Critical P0 Security Incident</span>
                    <span className="font-bold text-rose-600">&lt; 15 Minutes SLA</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-[var(--border-subtle)] pb-2">
                    <span>Architecture Review Response</span>
                    <span className="font-bold text-[var(--text-primary)]">&lt; 1 Business Hour</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-[var(--border-subtle)] pb-2">
                    <span>Vulnerability Report (Security)</span>
                    <span className="font-bold text-emerald-600">&lt; 30 Minutes ACK</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Dedicated Slack / Teams Channel</span>
                    <span className="font-bold text-[var(--text-primary)]">Enterprise Tier</span>
                  </div>
                </div>
              </div>

              {/* Responsible Security Disclosure Card */}
              <div className="bg-[var(--bg-surface-1)] border border-[var(--border-subtle)] rounded-2xl p-6 shadow-sm space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    Vulnerability Disclosure &amp; PGP
                  </h3>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  We maintain a safe-harbor bug bounty program for ethical security researchers. Send encrypted disclosures to:
                </p>
                <div className="font-mono text-xs text-blue-600">
                  security@axiomnhi.dev
                </div>
                <p className="text-[11px] text-[var(--text-muted)] font-mono">
                  PGP Fingerprint: 4F2A 99D1 0E7C 334B A812 60FF
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
