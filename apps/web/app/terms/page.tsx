"use client";

import React from "react";
import Link from "next/link";
import { SiteShell } from "../components/SiteShell";

export default function TermsPage() {
  return (
    <SiteShell>
      <div className="py-16 sm:py-24 bg-[var(--bg-canvas)] min-h-screen">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-12 border-b border-[var(--border-subtle)] pb-8">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-blue-600">
              LEGAL &amp; COMPLIANCE
            </span>
            <h1 className="text-3xl sm:text-4xl font-bold font-sans tracking-tight text-[var(--text-primary)] mt-2">
              Axiom NHI Terms of Service
            </h1>
            <p className="mt-3 text-sm font-mono text-[var(--text-muted)]">
              Last Updated: November 16, 2026 • Effective Immediately
            </p>
          </div>

          <div className="prose prose-slate max-w-none text-sm text-[var(--text-secondary)] space-y-8 leading-relaxed">
            <section className="space-y-3">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                1. Acceptance of Terms &amp; Scope of Service
              </h2>
              <p>
                By accessing or using the Axiom Non-Human Identity (NHI) platform, including the open-core gateway runtime, web console, documentation, and APIs (collectively, the &ldquo;Services&rdquo;), you agree to be bound by these Terms of Service. If you are accepting these terms on behalf of a company or other legal entity, you represent and warrant that you have full authority to bind that entity.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                2. Open Core Licensing &amp; Clean Boundaries (Apache-2.0)
              </h2>
              <p>
                The core Axiom NHI runtime gateway, Cedar policy evaluator, CLI, and client libraries are licensed under the Apache Software License, Version 2.0. Clean process boundaries are strictly maintained: external cryptographic components such as OpenBao (MPL-2.0) execute in isolated containers or distinct process boundaries via standard network protocols without linking source code into Axiom Rust crates.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                3. Zero-Secret Invariant &amp; Customer Data Ownership
              </h2>
              <p>
                Axiom adheres to the <strong>Zero Raw Token Exposure Invariant</strong>. Axiom does not store, log, or persist unencrypted customer credentials, database passwords, or static cloud keys. Ephemeral credentials negotiated via OpenBao dynamic engines are minted just-in-time and expire automatically upon TTL completion. Customers retain full ownership and intellectual property rights in and to all customer data and custom Cedar policy rules.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                4. Service Level Agreement (SLA) &amp; Fail-Closed Design
              </h2>
              <p>
                For Enterprise and Sovereign hosted tiers, Axiom commits to a <strong>99.99% Monthly Uptime Percentage</strong>. By design, all Axiom policy gates operate on a <strong>Fail-Closed</strong> principle: in the event of an unhandled exception, network partition, or evaluator timeout, tool execution is denied immediately to prevent unauthorized data access.
              </p>
              <div className="bg-[var(--bg-surface-1)] border border-[var(--border-subtle)] rounded-xl p-4 font-mono text-xs space-y-2">
                <div className="flex justify-between font-bold text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-1">
                  <span>Monthly Uptime</span>
                  <span>Service Credit</span>
                </div>
                <div className="flex justify-between">
                  <span>&lt; 99.99% but &ge; 99.9%</span>
                  <span>10% Credit</span>
                </div>
                <div className="flex justify-between">
                  <span>&lt; 99.9% but &ge; 99.0%</span>
                  <span>25% Credit</span>
                </div>
                <div className="flex justify-between">
                  <span>&lt; 99.0%</span>
                  <span>50% Credit</span>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                5. The $0 Discovery Pledge
              </h2>
              <p>
                Axiom guarantees that read-only discovery of un-governed machine identities, service accounts, and shadow AI agents is provided free of charge without volume caps or seat taxes. Fees apply exclusively to active inline Cedar policy validations and dynamic secret leasing as specified on our <Link href="/pricing" className="text-blue-600 underline">Pricing Page</Link>.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                6. Contact &amp; Legal Notices
              </h2>
              <p>
                For legal inquiries, notices, or formal communications, contact our legal counsel at <span className="font-mono text-blue-600">legal@axiomnhi.dev</span> or via our <Link href="/contact" className="text-blue-600 underline">Contact Page</Link>.
              </p>
            </section>
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
