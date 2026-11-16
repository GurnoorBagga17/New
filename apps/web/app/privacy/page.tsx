"use client";

import React from "react";
import Link from "next/link";
import { SiteShell } from "../components/SiteShell";

export default function PrivacyPage() {
  return (
    <SiteShell>
      <div className="py-16 sm:py-24 bg-[var(--bg-canvas)] min-h-screen">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-12 border-b border-[var(--border-subtle)] pb-8">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-600">
              PRIVACY &amp; DATA PROTECTION
            </span>
            <h1 className="text-3xl sm:text-4xl font-bold font-sans tracking-tight text-[var(--text-primary)] mt-2">
              Axiom NHI Privacy Policy
            </h1>
            <p className="mt-3 text-sm font-mono text-[var(--text-muted)]">
              Effective: November 16, 2026 • GDPR &amp; CCPA / CPRA Compliant
            </p>
          </div>

          <div className="prose prose-slate max-w-none text-sm text-[var(--text-secondary)] space-y-8 leading-relaxed">
            <section className="space-y-3">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                1. Our Privacy Commitment &amp; Architectural Invariants
              </h2>
              <p>
                Axiom is built for enterprise security environments where data sovereignty is paramount. We operate under a fundamental architectural commitment: <strong>We do not collect, monetize, or train AI models on customer payloads, database contents, or sensitive credentials.</strong>
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                2. Information We Collect
              </h2>
              <div className="space-y-2">
                <p>
                  <strong>A. Operational &amp; Attestation Metadata:</strong> When your environment uses Axiom, we process identity metadata (e.g. agent names, service account identifiers, tool schema digests, policy verdict hashes) necessary to render the lineage graph and verify policy rules.
                </p>
                <p>
                  <strong>B. Account &amp; Billing Data:</strong> Name, work email address, company name, and encrypted authentication tokens required to administer your tenant.
                </p>
                <p>
                  <strong>C. What We Never Collect:</strong> Raw database query results, unredacted tool arguments containing PII, raw passwords, or private encryption keys. All audit logs scrub secrets using deterministic regex and high-entropy scanners before emission.
                </p>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                3. Data Processing &amp; Subprocessors
              </h2>
              <p>
                Axiom utilizes a minimal set of audited enterprise subprocessors to deliver hosted infrastructure:
              </p>
              <div className="bg-[var(--bg-surface-1)] border border-[var(--border-subtle)] rounded-xl p-4 font-mono text-xs space-y-2">
                <div className="grid grid-cols-3 font-bold text-[var(--text-primary)] border-b border-[var(--border-subtle)] pb-1">
                  <span>Subprocessor</span>
                  <span>Purpose</span>
                  <span>Data Location</span>
                </div>
                <div className="grid grid-cols-3">
                  <span>AWS Nitro Enclaves</span>
                  <span>Isolated Runtime Gate</span>
                  <span>US-East / EU-Central</span>
                </div>
                <div className="grid grid-cols-3">
                  <span>PostgreSQL Managed</span>
                  <span>Encrypted Lineage Graph</span>
                  <span>Customer Selected VPC</span>
                </div>
                <div className="grid grid-cols-3">
                  <span>OpenTelemetry Collector</span>
                  <span>Audit Spans Streaming</span>
                  <span>Customer SIEM Endpoint</span>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                4. Air-Gapped Deployments (Zero Outbound Telemetry)
              </h2>
              <p>
                For organizations operating in regulated or sovereign environments, Axiom can be deployed 100% on-premise or in private air-gapped VPCs. In this mode, telemetry collection is completely disabled and zero data leaves your firewall.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                5. Your Rights &amp; Data Deletion
              </h2>
              <p>
                Under GDPR and CCPA, you have the right to request access to, correction of, or permanent deletion of your account and metadata. To submit a data deletion request, contact our Privacy Officer at <span className="font-mono text-blue-600">privacy@axiomnhi.dev</span> or visit our <Link href="/contact" className="text-blue-600 underline">Contact Page</Link>.
              </p>
            </section>
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
