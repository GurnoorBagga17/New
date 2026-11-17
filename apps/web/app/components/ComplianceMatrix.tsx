// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
"use client";

import React, { useState } from "react";

export interface ComplianceControl {
  framework: "SOC 2" | "ISO 27001" | "NIST CSF" | "DORA";
  controlId: string;
  name: string;
  domain: string;
  status: "ENFORCED_INLINE" | "CONTINUOUS_AUDIT" | "COMPLIANT";
  axiomMechanism: string;
  cedarPolicyRef: string;
  auditEvidence: string;
}

const COMPLIANCE_CONTROLS: ComplianceControl[] = [
  {
    framework: "SOC 2",
    controlId: "CC6.1",
    name: "Logical Access Controls over Autonomous Workloads",
    domain: "Access Control",
    status: "ENFORCED_INLINE",
    axiomMechanism: "AWS Cedar v4 lock-free engine evaluates principal, action, and resource on every MCP tool call (<2ms).",
    cedarPolicyRef: "permit (principal in Axiom::AgentRole, action == Axiom::Action::execute, resource == ...)",
    auditEvidence: "audit.jsonl SHA-256 Merkle chain entry generated for every permit/deny decision.",
  },
  {
    framework: "SOC 2",
    controlId: "CC6.2",
    name: "User Access Registration & Identity De-provisioning",
    domain: "Identity Management",
    status: "CONTINUOUS_AUDIT",
    axiomMechanism: "Passive discovery cross-references Okta/IdP employee status to flag orphaned shadow NHIs within 15 minutes.",
    cedarPolicyRef: "deny (principal in Axiom::OrphanedNHI) when { true };",
    auditEvidence: "0003_operator_auth_and_scim.sql table operators linked with SCIM external_id.",
  },
  {
    framework: "SOC 2",
    controlId: "CC6.3",
    name: "Revocation of Logical Access & Least Privilege",
    domain: "Revocation & Blast Radius",
    status: "ENFORCED_INLINE",
    axiomMechanism: "Sub-50ms emergency kill switch revokes compromised agent tokens globally via ArcSwap memory pointer swap.",
    cedarPolicyRef: "revocations.snapshot.json global/agent-specific blacklist filter.",
    auditEvidence: "POST /v1/local/revocations decision frame dispatched over SSE channel.",
  },
  {
    framework: "SOC 2",
    controlId: "CC6.8",
    name: "Data Protection, Encryption & Key Management",
    domain: "Secretless Brokering",
    status: "ENFORCED_INLINE",
    axiomMechanism: "Dynamic secret broker issues temporary sub-15-minute database credentials; zero raw tokens in agent memory.",
    cedarPolicyRef: "openbao://database/creds/analyst + AWS STS AssumeRoleWithWebIdentity.",
    auditEvidence: "Zero-secret HMAC-SHA256 salted fingerprinting across all credentials.",
  },
  {
    framework: "ISO 27001",
    controlId: "A.5.15",
    name: "Access Control for Machine & AI Workloads",
    domain: "Organizational Controls",
    status: "ENFORCED_INLINE",
    axiomMechanism: "Strict role-based least privilege enforced via Cedar policies and RFC 8707 canonical resource audience checks.",
    cedarPolicyRef: "identity/src/resource_indicators.rs audience indicator validation.",
    auditEvidence: "RFC 8707 audience check logs stored in Merkle append-only audit trail.",
  },
  {
    framework: "ISO 27001",
    controlId: "A.5.17",
    name: "Authentication Information & Credential Security",
    domain: "Credential Security",
    status: "COMPLIANT",
    axiomMechanism: "Tokens validated against cached JWKS with RS256/ES256 cryptographic verification and <= 30s clock skew.",
    cedarPolicyRef: "identity/src/oauth/jwt_validator.rs JWKS cache.",
    auditEvidence: "Token validation span emitted over OpenTelemetry trace bus.",
  },
  {
    framework: "ISO 27001",
    controlId: "A.8.20",
    name: "Network Security & Outbound Data Exfiltration",
    domain: "Technological Controls",
    status: "ENFORCED_INLINE",
    axiomMechanism: "Egress firewall drops SSRF requests to cloud metadata (169.254.169.254) and internal RFC 1918 subnets.",
    cedarPolicyRef: "validators/src/egress.rs DNS-pinned egress allowlisting.",
    auditEvidence: "Egress AST scan record with IP destination blocked reason.",
  },
  {
    framework: "NIST CSF",
    controlId: "PR.AA-01",
    name: "Identities and Credentials are Managed for Workloads",
    domain: "Identity Management",
    status: "CONTINUOUS_AUDIT",
    axiomMechanism: "Continuous passive discovery across AWS, GCP, Azure, K8s, GitHub, Snowflake, and AI gateways.",
    cedarPolicyRef: "connectors/src/enterprise.rs discovery loop.",
    auditEvidence: "nhi_nodes database table storing full canonical inventory.",
  },
  {
    framework: "DORA",
    controlId: "Article 9",
    name: "Protection and Prevention of ICT Systems",
    domain: "Operational Resilience",
    status: "ENFORCED_INLINE",
    axiomMechanism: "Real-time SQL AST parsing blocks destructive DDL (DROP, TRUNCATE) before queries reach critical databases.",
    cedarPolicyRef: "validators/src/sql.rs sqlparser-rs AST inspector.",
    auditEvidence: "AST threat scan verdict in ExtMcp CheckResponse payload.",
  },
  {
    framework: "DORA",
    controlId: "Article 28",
    name: "Managing ICT Third-Party & Sub-Task Delegation Risk",
    domain: "Third-Party Risk",
    status: "ENFORCED_INLINE",
    axiomMechanism: "IETF RFC 8693 token exchange guarantees scope attenuation across multi-agent delegation chains.",
    cedarPolicyRef: "secretless/src/lib.rs exchange_rfc8693_token act chain validation.",
    auditEvidence: "Actor claim chain recorded in audit event: ['agent::parent', 'agent::child'].",
  },
];

export default function ComplianceMatrix() {
  const [activeFramework, setActiveFramework] = useState<"ALL" | "SOC 2" | "ISO 27001" | "NIST CSF" | "DORA">("ALL");
  const [selectedControl, setSelectedControl] = useState<ComplianceControl | null>(COMPLIANCE_CONTROLS[0] ?? null);

  const filtered = activeFramework === "ALL"
    ? COMPLIANCE_CONTROLS
    : COMPLIANCE_CONTROLS.filter((c) => c.framework === activeFramework);

  const handleExportEvidence = () => {
    const csvContent = "data:text/csv;charset=utf-8," + [
      "Framework,Control ID,Name,Status,Mechanism,Audit Evidence",
      ...COMPLIANCE_CONTROLS.map(c => `"${c.framework}","${c.controlId}","${c.name}","${c.status}","${c.axiomMechanism}","${c.auditEvidence}"`)
    ].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "Axiom_Compliance_Audit_Evidence.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 bg-white rounded-2xl border border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">Regulatory & Security Compliance Crosswalk</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
              100% Policy-Backed
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Continuous compliance mapping against enterprise audit frameworks. Every control backed by inline Cedar or AST enforcement.
          </p>
        </div>
        <button
          onClick={handleExportEvidence}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors shadow-sm whitespace-nowrap"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export Auditor Evidence (CSV)
        </button>
      </div>

      {/* Framework Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {(["ALL", "SOC 2", "ISO 27001", "NIST CSF", "DORA"] as const).map((fw) => (
          <button
            key={fw}
            onClick={() => setActiveFramework(fw)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
              activeFramework === fw
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {fw === "ALL" ? "All Frameworks" : fw}
          </button>
        ))}
      </div>

      {/* Grid: Control List + Evidence Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Control List (7 Cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
          {filtered.map((control) => (
            <button
              key={`${control.framework}-${control.controlId}`}
              onClick={() => setSelectedControl(control)}
              className={`w-full text-left p-4 transition-colors flex items-start justify-between gap-3 ${
                selectedControl?.controlId === control.controlId
                  ? "bg-indigo-50/60"
                  : "hover:bg-slate-50"
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-mono">
                    {control.framework} {control.controlId}
                  </span>
                  <span className="text-xs font-medium text-slate-500">{control.domain}</span>
                </div>
                <p className="text-sm font-semibold text-slate-900">{control.name}</p>
              </div>
              <div>
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold whitespace-nowrap ${
                  control.status === "ENFORCED_INLINE"
                    ? "bg-indigo-100 text-indigo-800"
                    : control.status === "CONTINUOUS_AUDIT"
                    ? "bg-blue-100 text-blue-800"
                    : "bg-emerald-100 text-emerald-800"
                }`}>
                  {control.status.replace("_", " ")}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Evidence Inspector (5 Cols) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
          {selectedControl ? (
            <>
              <div className="border-b border-slate-100 pb-4">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Control Specification</span>
                <h3 className="text-base font-bold text-slate-900 mt-1">
                  {selectedControl.framework} {selectedControl.controlId} — {selectedControl.name}
                </h3>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Axiom Enforcement Mechanism</span>
                <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200 leading-relaxed">
                  {selectedControl.axiomMechanism}
                </p>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Cedar Policy / Code Reference</span>
                <pre className="text-xs font-mono bg-slate-900 text-slate-100 p-3 rounded-xl overflow-x-auto">
                  {selectedControl.cedarPolicyRef}
                </pre>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Auditor Cryptographic Evidence</span>
                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-900 flex items-start gap-2">
                  <span className="text-emerald-700 font-bold">&check;</span>
                  <p>{selectedControl.auditEvidence}</p>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500 text-center py-12">Select a control to inspect audit evidence.</p>
          )}
        </div>
      </div>
    </div>
  );
}
