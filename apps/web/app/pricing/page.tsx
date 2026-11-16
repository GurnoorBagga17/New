"use client";

import React, { useState } from "react";
import Link from "next/link";
import { SiteShell } from "../components/SiteShell";
import { MeteringCalculator } from "../components/MeteringCalculator";

interface PricingTier {
  id: string;
  name: string;
  badge: string;
  priceMonthly: string;
  priceAnnual: string;
  description: string;
  ctaText: string;
  ctaHref: string;
  ctaPrimary?: boolean;
  features: string[];
}

const PRICING_TIERS: PricingTier[] = [
  {
    id: "community",
    name: "Community",
    badge: "OPEN CORE • APACHE-2.0",
    priceMonthly: "$0",
    priceAnnual: "$0",
    description: "Full inline MCP security and zero-cost shadow discovery for individual developers and small teams.",
    ctaText: "Deploy Community ($0)",
    ctaHref: "/docs",
    features: [
      "$0 Discovery of all un-governed NHIs forever",
      "Inline MCP proxy with AST argument validation",
      "Sub-5ms local Cedar policy evaluation engine",
      "Up to 25 governed autonomous agent identities",
      "Single-node Docker compose runtime",
      "Local SQLite lineage and audit storage",
      "Community GitHub support & public discussions",
    ],
  },
  {
    id: "essentials",
    name: "Essentials",
    badge: "GROWING TEAMS",
    priceMonthly: "$499",
    priceAnnual: "$399",
    description: "Automated secretless leasing and multi-cloud identity discovery for mid-size engineering organizations.",
    ctaText: "Start 14-Day Free Trial",
    ctaHref: "/sign-up",
    ctaPrimary: true,
    features: [
      "Everything in Community, plus:",
      "Up to 250 governed agent & workload identities",
      "Automated OpenBao dynamic secretless leasing",
      "Multi-Cloud Discovery Connectors (AWS, K8s, GitHub)",
      "Automated AST SQL / Path / Egress allowlists",
      "Multi-tenant Operator UI with RBAC",
      "99.9% uptime SLA with email support",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    badge: "MISSION CRITICAL",
    priceMonthly: "$2,499",
    priceAnnual: "$1,999",
    description: "Sub-millisecond high-availability clusters with live SpiceDB delegation trees and SIEM streaming.",
    ctaText: "Request Enterprise POC",
    ctaHref: "/contact",
    features: [
      "Everything in Essentials, plus:",
      "Unlimited governed NHIs & agent fleets",
      "High-Availability clustered gateway replicas",
      "SpiceDB relation graph for live delegation tracking",
      "PostgreSQL lineage graph with < 0.1ms cache",
      "Sub-50ms fleet-wide causal emergency kill switch",
      "Streaming SIEM/SOAR integration (Splunk, Sentinel, Datadog)",
      "Dedicated Slack bridge & 1-hour P0 SLA",
    ],
  },
  {
    id: "sovereign",
    name: "Sovereign / Air-Gapped",
    badge: "DEFENSE & REGULATED",
    priceMonthly: "Custom",
    priceAnnual: "Custom",
    description: "100% self-hosted and air-gapped deployment for defense, intelligence, and regulated financial institutions.",
    ctaText: "Talk to Sovereign Team",
    ctaHref: "/contact",
    features: [
      "Everything in Enterprise, plus:",
      "100% air-gapped deployment (Zero outbound telemetry)",
      "FIPS 140-3 cryptographic module compatibility",
      "Hardware Security Module (HSM) root-of-trust",
      "Custom compliance audit packs (SOC 2, FedRAMP High, HIPAA)",
      "Full source code escrow access",
      "24/7/365 dedicated cleared engineering team",
    ],
  },
];

const COMPARISON_CATEGORIES = [
  {
    category: "Identity Discovery & Attestation",
    rows: [
      { name: "$0 Shadow NHI Discovery Pledge", community: "Unlimited", essentials: "Unlimited", enterprise: "Unlimited", sovereign: "Unlimited" },
      { name: "Governed Active Identities", community: "Up to 25", essentials: "Up to 250", enterprise: "Unlimited", sovereign: "Unlimited" },
      { name: "OAuth 2.1 CIMD & RFC 8707 Attestation", community: "✓", essentials: "✓", enterprise: "✓", sovereign: "✓" },
      { name: "SPIFFE / SPIRE Workload Attestation", community: "—", essentials: "✓", enterprise: "✓", sovereign: "✓" },
      { name: "Cloud Connectors (AWS, K8s, GitHub)", community: "Read-only CLI", essentials: "Automated cron", enterprise: "Continuous real-time", sovereign: "Air-gapped sync" },
    ],
  },
  {
    category: "Inline Runtime & Cedar Guardrails",
    rows: [
      { name: "Model Context Protocol (MCP) Proxy", community: "✓", essentials: "✓", enterprise: "✓", sovereign: "✓" },
      { name: "AST Argument Verifier (SQL/Path/SSRF)", community: "✓", essentials: "✓", enterprise: "✓", sovereign: "✓" },
      { name: "AWS Cedar 3.x Formal Verification", community: "Local engine", essentials: "Local engine", enterprise: "Clustered HA", sovereign: "Clustered HA" },
      { name: "P99 Inline Latency Target", community: "< 3.5ms", essentials: "< 2.0ms", enterprise: "< 1.5ms", sovereign: "< 1.0ms" },
      { name: "Fail-Closed Execution Invariant", community: "✓", essentials: "✓", enterprise: "✓", sovereign: "✓" },
    ],
  },
  {
    category: "Secretless Brokering & Revocation",
    rows: [
      { name: "Dynamic Ephemeral Leases (OpenBao)", community: "—", essentials: "✓", enterprise: "✓", sovereign: "✓" },
      { name: "Zero Raw Secret Exposure Invariant", community: "✓", essentials: "✓", enterprise: "✓", sovereign: "✓" },
      { name: "SpiceDB Live Relation Graph", community: "—", essentials: "—", enterprise: "✓", sovereign: "✓" },
      { name: "Fleet-Wide Causal Kill Switch", community: "Single node", essentials: "Single node", enterprise: "< 50ms cascade", sovereign: "< 50ms cascade" },
    ],
  },
  {
    category: "Compliance & Enterprise Support",
    rows: [
      { name: "OpenTelemetry Audit Spans", community: "Local stdout", essentials: "OTLP collector", enterprise: "SIEM streaming", sovereign: "Encrypted air-gapped" },
      { name: "Deployment Topology", community: "Single Docker", essentials: "Multi-VPC", enterprise: "Multi-Region HA", sovereign: "On-Prem / Bare-Metal" },
      { name: "Support Response Time", community: "Community", essentials: "Next Business Day", enterprise: "1-Hour P0 SLA", sovereign: "15-Minute P0 SLA" },
      { name: "SOC 2 Type II / ISO 27001 Package", community: "—", essentials: "Self-serve", enterprise: "Auditor-ready", sovereign: "FedRAMP High align" },
    ],
  },
];

export default function PricingPage() {
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("annual");

  return (
    <SiteShell>
      <div className="py-16 sm:py-24 bg-[var(--bg-canvas)] min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-semibold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 mb-4">
              <span>THE $0 DISCOVERY PLEDGE</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold font-sans tracking-tight text-[var(--text-primary)]">
              Transparent, Predictable Pricing for AI Agent Security
            </h1>
            <p className="mt-4 text-lg text-[var(--text-secondary)] leading-relaxed">
              Unlike legacy identity platforms, Axiom never taxes you for discovering shadow agents. Discover every identity for free. Pay only for the high-risk actions you govern inline.
            </p>

            {/* Billing Toggle */}
            <div className="mt-8 inline-flex items-center p-1 rounded-xl bg-[var(--bg-surface-1)] border border-[var(--border-subtle)] shadow-xs">
              <button
                type="button"
                onClick={() => setBillingPeriod("monthly")}
                className={`px-4 py-2 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
                  billingPeriod === "monthly"
                    ? "bg-[var(--bg-surface-2)] text-[var(--text-primary)] border border-[var(--border-strong)] shadow-xs"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                Monthly Billing
              </button>
              <button
                type="button"
                onClick={() => setBillingPeriod("annual")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
                  billingPeriod === "annual"
                    ? "bg-[var(--bg-surface-2)] text-[var(--text-primary)] border border-[var(--border-strong)] shadow-xs"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                <span>Annual Billing</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-800 font-bold">
                  SAVE 20%
                </span>
              </button>
            </div>
          </div>

          {/* Pricing Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-20">
            {PRICING_TIERS.map((tier) => (
              <div
                key={tier.id}
                className={`relative flex flex-col justify-between rounded-2xl p-6 sm:p-7 bg-[var(--bg-surface-1)] border transition-all ${
                  tier.ctaPrimary
                    ? "border-blue-500 shadow-md ring-1 ring-blue-500/20"
                    : "border-[var(--border-subtle)] shadow-xs hover:border-[var(--border-strong)]"
                }`}
              >
                {tier.ctaPrimary && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-blue-600 text-white shadow-xs">
                    Most Popular
                  </div>
                )}

                <div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    {tier.badge}
                  </span>
                  <h3 className="text-xl font-bold text-[var(--text-primary)] mt-1 mb-2">
                    {tier.name}
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] min-h-[48px] leading-relaxed mb-6">
                    {tier.description}
                  </p>

                  <div className="flex items-baseline gap-1 mb-6">
                    <span className="text-3xl sm:text-4xl font-mono font-bold text-[var(--text-primary)]">
                      {billingPeriod === "annual" ? tier.priceAnnual : tier.priceMonthly}
                    </span>
                    {tier.priceMonthly !== "Custom" && tier.priceMonthly !== "$0" && (
                      <span className="text-xs text-[var(--text-muted)] font-mono">/ month</span>
                    )}
                  </div>

                  <Link
                    href={tier.ctaHref}
                    className={`block w-full py-2.5 px-4 rounded-lg text-center text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      tier.ctaPrimary
                        ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                        : "bg-[var(--bg-surface-2)] text-[var(--text-primary)] hover:bg-[var(--border-subtle)] border border-[var(--border-subtle)]"
                    }`}
                  >
                    {tier.ctaText}
                  </Link>

                  <div className="mt-8 pt-6 border-t border-[var(--border-subtle)] space-y-3">
                    <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--text-muted)]">
                      Includes:
                    </p>
                    {tier.features.map((feat) => (
                      <div key={feat} className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
                        <span className="text-emerald-600 font-bold shrink-0 mt-0.5">✓</span>
                        <span className="leading-snug">{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Interactive Capacity Calculator Section */}
          <div className="mb-24">
            <MeteringCalculator />
          </div>

          {/* Detailed Feature Comparison Matrix */}
          <div className="bg-[var(--bg-surface-1)] border border-[var(--border-subtle)] rounded-2xl shadow-sm overflow-hidden mb-24">
            <div className="p-6 sm:p-8 border-b border-[var(--border-subtle)] bg-[var(--bg-surface-2)]">
              <h2 className="text-2xl font-bold text-[var(--text-primary)]">
                Complete Feature Comparison Matrix
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-1 font-mono">
                Architectural capabilities across Community, Essentials, Enterprise, and Sovereign tiers
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-1)] text-[var(--text-muted)] font-mono uppercase">
                    <th className="py-4 px-6 w-2/5">Capability</th>
                    <th className="py-4 px-4 w-1/8 font-bold text-[var(--text-primary)]">Community</th>
                    <th className="py-4 px-4 w-1/8 font-bold text-blue-600 bg-blue-50/40">Essentials</th>
                    <th className="py-4 px-4 w-1/8 font-bold text-[var(--text-primary)]">Enterprise</th>
                    <th className="py-4 px-4 w-1/8 font-bold text-[var(--text-primary)]">Sovereign</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {COMPARISON_CATEGORIES.map((cat) => (
                    <React.Fragment key={cat.category}>
                      <tr className="bg-[var(--bg-surface-2)] font-mono font-bold text-[var(--text-primary)] text-[11px] uppercase tracking-wider">
                        <td colSpan={5} className="py-3 px-6">
                          {cat.category}
                        </td>
                      </tr>
                      {cat.rows.map((row) => (
                        <tr key={row.name} className="hover:bg-[var(--bg-surface-2)] transition-colors">
                          <td className="py-3.5 px-6 font-medium text-[var(--text-primary)]">
                            {row.name}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-[var(--text-secondary)]">
                            {row.community}
                          </td>
                          <td className="py-3.5 px-4 font-mono font-semibold text-blue-700 bg-blue-50/20">
                            {row.essentials}
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-[var(--text-primary)]">
                            {row.enterprise}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-[var(--text-secondary)]">
                            {row.sovereign}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pricing FAQ */}
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="text-center mb-10">
              <h2 className="text-2xl font-bold text-[var(--text-primary)]">
                Frequently Asked Pricing Questions
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] space-y-2">
                <h3 className="font-bold text-sm text-[var(--text-primary)]">
                  What is the $0 Discovery Pledge?
                </h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  We believe no organization should be blind to their machine attack surface because of licensing barriers. Discovery scans of AWS IAM, Kubernetes, GitHub, and Slack are completely free forever, with zero seat taxes or volume caps.
                </p>
              </div>
              <div className="p-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] space-y-2">
                <h3 className="font-bold text-sm text-[var(--text-primary)]">
                  What counts as a &ldquo;Governed Identity&rdquo;?
                </h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  An identity is only considered governed when an active inline Cedar policy actively validates its tool calls or when Axiom dynamically mints ephemeral credentials on its behalf.
                </p>
              </div>
              <div className="p-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] space-y-2">
                <h3 className="font-bold text-sm text-[var(--text-primary)]">
                  Can we deploy in our own air-gapped environment?
                </h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Yes. Axiom NHI is open core under Apache-2.0 and can be deployed entirely inside your private VPC, Kubernetes cluster, or on-premise datacenter with zero external outbound network dependencies.
                </p>
              </div>
              <div className="p-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] space-y-2">
                <h3 className="font-bold text-sm text-[var(--text-primary)]">
                  How does the 14-day free trial work?
                </h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  You get immediate access to all Essentials and Enterprise capabilities without entering a credit card. At the end of 14 days, you can choose a paid plan or gracefully downgrade to Community with zero data loss.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
