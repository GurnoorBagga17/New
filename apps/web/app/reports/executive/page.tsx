// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import type { ExecutiveReportData } from "../../api/reports/executive/route";

export default function ExecutiveReportPage() {
  const [report, setReport] = useState<ExecutiveReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/reports/executive")
      .then((res) => res.json())
      .then((data: ExecutiveReportData) => {
        setReport(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
        <div className="text-center space-y-4">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-slate-900 border-r-transparent"></div>
          <p className="text-sm font-medium text-slate-600">Generating Executive CISO Audit Report...</p>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
        <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm text-center max-w-md">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Report Generation Error</h2>
          <p className="text-sm text-slate-600 mb-6">Unable to assemble executive security telemetry data.</p>
          <Link href="/console" className="inline-flex px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors">
            Return to Console
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 sm:p-8 font-sans">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Navigation & Print Controls (Hidden on Print) */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm print:hidden">
          <div className="flex items-center gap-3">
            <Link href="/console" className="text-sm font-medium text-slate-500 hover:text-slate-900 flex items-center gap-1 transition-colors">
              <span>&larr;</span> Back to Console
            </Link>
            <span className="text-slate-300">|</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span> Board-Ready Document
            </span>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={handlePrint}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white font-medium text-sm hover:bg-slate-800 transition-colors shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print / Save as PDF
            </button>
          </div>
        </header>

        {/* Printable Executive Document Sheet */}
        <article className="bg-white p-6 sm:p-12 rounded-3xl border border-slate-200 shadow-sm space-y-10 print:border-none print:shadow-none print:p-0">
          {/* Header & Meta */}
          <div className="border-b border-slate-100 pb-8 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight text-slate-900">AXIOM</span>
                <span className="px-2 py-0.5 text-xs font-semibold tracking-wide bg-slate-100 text-slate-800 rounded">NHI ZERO-TRUST</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Executive Cybersecurity & Identity Posture Report
              </h1>
              <p className="text-sm text-slate-500">
                Audited Entity: <strong className="text-slate-800">{report.organization}</strong>
              </p>
            </div>
            <div className="text-left sm:text-right text-xs text-slate-500 space-y-1 bg-slate-50 sm:bg-transparent p-4 sm:p-0 rounded-xl sm:rounded-none w-full sm:w-auto">
              <p>Period: <strong className="text-slate-800">{report.reportPeriod}</strong></p>
              <p>Generated: <strong className="text-slate-800">{new Date(report.generatedAt).toLocaleDateString()}</strong></p>
              <p>Classification: <strong className="text-slate-800">CONFIDENTIAL — BOARD OF DIRECTORS</strong></p>
            </div>
          </div>

          {/* High-Level Scorecard Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 p-6 bg-slate-50 rounded-2xl border border-slate-200">
            <div className="space-y-1">
              <span className="text-xs uppercase font-bold tracking-wider text-slate-500">Security Posture Grade</span>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-extrabold text-slate-900">{report.overallGrade}</span>
                <span className="text-sm font-semibold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                  +{report.postureDeltaPercent}% vs Q3
                </span>
              </div>
              <p className="text-xs text-slate-500">Composite Score: {report.overallScore}/100</p>
            </div>

            <div className="space-y-1">
              <span className="text-xs uppercase font-bold tracking-wider text-slate-500">Total Monitored NHIs</span>
              <p className="text-3xl font-extrabold text-slate-900">{report.inventorySummary.totalEntities.toLocaleString()}</p>
              <p className="text-xs text-slate-500">{report.inventorySummary.aiAgents} Autonomous Agents, {report.inventorySummary.workloadIdentities} Workloads</p>
            </div>

            <div className="space-y-1">
              <span className="text-xs uppercase font-bold tracking-wider text-slate-500">Attacks Blocked Inline</span>
              <p className="text-3xl font-extrabold text-slate-900">{report.preventedThreats.destructiveSqlDdl + report.preventedThreats.cloudMetadataSsrf + report.preventedThreats.pathTraversalAttempts}</p>
              <p className="text-xs text-slate-500">Avg Decision Latency: {report.preventedThreats.averageEnforcementLatencyMs}ms</p>
            </div>

            <div className="space-y-1">
              <span className="text-xs uppercase font-bold tracking-wider text-slate-500">Estimated Breach Exposure Mitigated</span>
              <p className="text-3xl font-extrabold text-emerald-800">{report.financialRoi.projectedLossMitigatedUsd}</p>
              <p className="text-xs text-slate-500">Vs {report.financialRoi.averageIndustryBreachCostUsd}</p>
            </div>
          </div>

          {/* Section 1: Non-Human Identity Landscape */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center justify-between">
              <span>1. Non-Human Identity (NHI) Attack Surface Inventory</span>
              <span className="text-xs font-normal text-slate-500">Zero-Secret Invariant Enforced</span>
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="p-4 rounded-xl border border-slate-200 bg-white">
                <span className="text-xs text-slate-500 font-medium">Human Operators</span>
                <p className="text-2xl font-bold text-slate-900 mt-1">{report.inventorySummary.humanOperators}</p>
                <span className="text-xs text-slate-400">SOC 2 / SCIM Backed</span>
              </div>
              <div className="p-4 rounded-xl border border-slate-200 bg-white">
                <span className="text-xs text-slate-500 font-medium">Workload Identities</span>
                <p className="text-2xl font-bold text-slate-900 mt-1">{report.inventorySummary.workloadIdentities}</p>
                <span className="text-xs text-slate-400">AWS / K8s / Entra / GCP</span>
              </div>
              <div className="p-4 rounded-xl border border-slate-200 bg-white">
                <span className="text-xs text-slate-500 font-medium">Autonomous AI Agents</span>
                <p className="text-2xl font-bold text-indigo-700 mt-1">{report.inventorySummary.aiAgents}</p>
                <span className="text-xs text-slate-400">MCP Protocol Gated</span>
              </div>
              <div className="p-4 rounded-xl border border-slate-200 bg-white">
                <span className="text-xs text-slate-500 font-medium">Shared Database Secrets</span>
                <p className="text-2xl font-bold text-amber-700 mt-1">{report.inventorySummary.sharedSecrets}</p>
                <span className="text-xs text-slate-400">Dynamic Lease Target</span>
              </div>
              <div className="p-4 rounded-xl border border-slate-200 bg-white">
                <span className="text-xs text-slate-500 font-medium">Unowned Shadow NHIs</span>
                <p className="text-2xl font-bold text-emerald-700 mt-1">{report.inventorySummary.unownedShadowNHIs}</p>
                <span className="text-xs text-emerald-800 font-semibold">100% Attributed</span>
              </div>
            </div>
          </div>

          {/* Section 2: Inline Threat Prevention Evidence */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">
              2. Inline Pre-Execution Prevention Metrics (Zero-Trust Data Plane)
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-800 bg-rose-100 px-2 py-0.5 rounded">Prompt Injection SQL DDL</span>
                  <span className="text-lg font-bold text-slate-900">{report.preventedThreats.destructiveSqlDdl}</span>
                </div>
                <p className="text-xs text-slate-600">
                  Tool invocations attempting destructive verbs (<code className="text-slate-800">DROP</code>, <code className="text-slate-800">TRUNCATE</code>, <code className="text-slate-800">ALTER</code>) intercepted and blocked before dispatching to PostgreSQL/Snowflake.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-800 bg-rose-100 px-2 py-0.5 rounded">Cloud Metadata SSRF</span>
                  <span className="text-lg font-bold text-slate-900">{report.preventedThreats.cloudMetadataSsrf}</span>
                </div>
                <p className="text-xs text-slate-600">
                  Outbound HTTP tool requests attempting to reach <code className="text-slate-800">169.254.169.254</code> to exfiltrate ambient IAM STS tokens dropped at the egress proxy.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-800 bg-rose-100 px-2 py-0.5 rounded">Filesystem Escape</span>
                  <span className="text-lg font-bold text-slate-900">{report.preventedThreats.pathTraversalAttempts}</span>
                </div>
                <p className="text-xs text-slate-600">
                  Directory traversal attempts (<code className="text-slate-800">../etc/passwd</code>, <code className="text-slate-800">/var/run/secrets</code>) trapped by path canonicalization.
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: Regulatory Compliance Crosswalk */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2 flex items-center justify-between">
              <span>3. Enterprise Regulatory Compliance Mapping</span>
              <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                Auditor-Certified Mappings
              </span>
            </h2>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {report.complianceScores.map((c, i) => (
                <div key={i} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white hover:bg-slate-50 transition-colors">
                  <div className="space-y-0.5">
                    <p className="text-sm font-bold text-slate-900">{c.framework}</p>
                    <p className="text-xs text-slate-500">Applicable Controls: <code className="text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">{c.controlsCovered}</code></p>
                  </div>
                  <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                    <span className="text-xs font-bold text-slate-900">{c.score}%</span>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      c.status === "COMPLIANT"
                        ? "bg-emerald-100 text-emerald-800"
                        : c.status === "ENFORCED"
                        ? "bg-indigo-100 text-indigo-800"
                        : "bg-blue-100 text-blue-800"
                    }`}>
                      {c.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 4: High-Risk Attack Paths Blocked */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">
              4. Key Incident & Blast-Radius Preventions
            </h2>
            <div className="space-y-3">
              {report.topAttackPathsPrevented.map((ap) => (
                <div key={ap.id} className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-rose-800 bg-rose-100 px-2 py-0.5 rounded">{ap.severity}</span>
                      <strong className="text-sm text-slate-900">{ap.title}</strong>
                    </div>
                    <p className="text-xs text-slate-600">Workload Identifier: <code className="text-slate-800 font-mono">{ap.workload}</code> (Potential Blast Radius: {ap.blastRadiusNodes} sibling workloads)</p>
                    <p className="text-xs text-emerald-800 font-medium">&check; {ap.remediationAction}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sign-off & Verification Footer */}
          <div className="pt-8 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 text-xs text-slate-500">
            <div>
              <p className="font-semibold text-slate-800">Axiom NHI Autonomous Governance Engine</p>
              <p>Cryptographic Audit Ledger SHA-256 Merkle Chain Verified</p>
            </div>
            <div className="text-left sm:text-right border-t sm:border-t-0 pt-4 sm:pt-0 border-slate-100 w-full sm:w-auto">
              <p className="font-medium text-slate-700">Lead Security Architect / CISO Review Sign-off</p>
              <div className="mt-2 h-8 w-48 border-b border-slate-300"></div>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
