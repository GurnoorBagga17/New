// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
"use client";

import React, { useState } from "react";
import Link from "next/link";

interface LifecycleStage {
  step: number;
  id: string;
  name: string;
  subname: string;
  crate: string;
  latencyBudget: string;
  description: string;
  technicalDetails: string[];
  codePreview: string;
}

const LIFECYCLE_STAGES: LifecycleStage[] = [
  {
    step: 1,
    id: "stage-1-cimd",
    name: "OAuth 2.1 CIMD & Audience",
    subname: "Client ID Metadata Document Verification",
    crate: "identity/src/cimd.rs",
    latencyBudget: "< 0.4ms",
    description: "Verifies client identity via Client ID Metadata Documents (CIMD) over TLS, enforcing strict RFC 8707 resource indicators so tokens cannot be reused across disparate tool clusters.",
    technicalDetails: [
      "HTTPS fetch with DNS-pinned IP cache to prevent loopback SSRF",
      "Ed25519 signature validation against upstream OIDC JWKS",
      "Cryptographic binding of caller agent_id to session context",
    ],
    codePreview: `// identity/src/cimd.rs
pub async fn verify_cimd_audience(
    client_id: &Url,
    target_resource: &str,
) -> Result<ValidatedPrincipal, IdentityError> {
    let metadata = fetch_pinned_metadata(client_id).await?;
    metadata.assert_audience(target_resource)?;
    Ok(metadata.into_principal())
}`,
  },
  {
    step: 2,
    id: "stage-2-killswitch",
    name: "Dual-Stage ArcSwap Kill Switch",
    subname: "Lock-Free Sub-50ms Global & Targeted Halt",
    crate: "observability/kill-switch/src/registry.rs",
    latencyBudget: "< 0.05ms (Lock-Free)",
    description: "Atomic lock-free memory barrier check performed before identity lookup and after policy evaluation. Instantly aborts fleet operations in under 50ms upon revocation event.",
    technicalDetails: [
      "ArcSwap atomic pointer read: Zero lock contention on hot path",
      "Supports 4 scopes: global, tenant, agent_id, and session_id",
      "Causal link to InFlightCancellationRegistry aborting TCP sockets",
    ],
    codePreview: `// kill-switch/src/registry.rs
pub fn check_kill_switch(&self, principal: &Principal) -> Result<(), DenyReason> {
    let snapshot = self.registry.load();
    if snapshot.is_halted(principal) {
        metrics::counter!("kill_switch_blocked_total").increment(1);
        return Err(DenyReason::EmergencyHaltTriggered);
    }
    Ok(())
}`,
  },
  {
    step: 3,
    id: "stage-3-validators",
    name: "Deterministic AST Validation",
    subname: "Deep SQL, Path, DNS, and JCS Inspection",
    crate: "validators/src/ast.rs",
    latencyBudget: "< 1.2ms",
    description: "Inspects JSON-RPC tool parameters before execution. Analyzes full Abstract Syntax Trees for SQL verbs, filesystem path traversal, and tool definition hash pinning.",
    technicalDetails: [
      "sqlparser-rs AST scan: Disallows DROP, ALTER, TRUNCATE on read-only flows",
      "Canonical path resolution prevents ../ escapes and symlink jailbreaks",
      "JCS (RFC 8785) SHA-256 fingerprinting stops tool definition rug-pulls",
    ],
    codePreview: `// validators/src/ast.rs
pub fn validate_tool_args(tool: &str, args: &Value) -> Result<(), ValidationError> {
    match tool {
        "db.execute_query" => SqlAstValidator::forbid_ddl(args["query"].as_str()?),
        "fs.read_file" => PathValidator::assert_sandbox(args["path"].as_str()?),
        _ => JcsValidator::verify_tool_hash(tool, args),
    }
}`,
  },
  {
    step: 4,
    id: "stage-4-cedar",
    name: "Lock-Free Cedar Policy Engine",
    subname: "Sub-Millisecond Formal Authorization",
    crate: "services/extmcp/cedar/src/evaluator.rs",
    latencyBudget: "< 0.8ms (p50)",
    description: "Evaluates Cedar 3.x policy rules in-process with zero network I/O. Decides permit or forbid based on authenticated principal, action, resource, and evaluated AST attributes.",
    technicalDetails: [
      "In-memory Cedar entity store synchronized via ContextSync gRPC",
      "Strict fail-closed default: Any syntax or context error returns 403",
      "Zero allocations on happy authorization path",
    ],
    codePreview: `// services/extmcp/cedar/src/evaluator.rs
pub fn evaluate_policy(request: &CedarRequest) -> PolicyVerdict {
    let response = self.engine.is_authorized(
        &request.principal,
        &request.action,
        &request.resource,
        &request.context,
    );
    match response.decision() {
        Decision::Allow => PolicyVerdict::Permit,
        Decision::Deny => PolicyVerdict::Deny(response.diagnostics()),
    }
}`,
  },
  {
    step: 5,
    id: "stage-5-secretless",
    name: "OpenBao Ephemeral Credential Broker",
    subname: "SPIFFE-Attested JIT Secret Injection",
    crate: "secretless/src/openbao_broker.rs",
    latencyBudget: "< 1.5ms",
    description: "The agent never sees the database password or API token. Axiom retrieves dynamic, short-lived credentials from OpenBao and injects them directly at gateway egress.",
    technicalDetails: [
      "Dynamic secret leases capped at <= 300 seconds TTL",
      "Mutual TLS with SPIFFE x509 SVID workload attestation",
      "Zero-downtime dual-secret rotation state machine",
    ],
    codePreview: `// secretless/src/openbao_broker.rs
pub async fn inject_egress_credentials(
    &self,
    req: &mut UpstreamRequest,
    role: &str,
) -> Result<LeaseId, BrokerError> {
    let lease = self.openbao_client.get_dynamic_creds(role, 300).await?;
    req.headers.insert("Authorization", lease.bearer_token());
    Ok(lease.id)
}`,
  },
  {
    step: 6,
    id: "stage-6-audit",
    name: "Cryptographic OCSF Audit Emission",
    subname: "SHA-256 Hash-Chained Zero-Secret Journal",
    crate: "observability/audit/src/ocsf_writer.rs",
    latencyBudget: "< 0.5ms (Pre-Enqueue)",
    description: "Emits structured Open Cybersecurity Schema Framework (OCSF) records with cryptographic hash chaining (prev_hash -> entry_hash) and automatic pre-enqueue secret scrubbing.",
    technicalDetails: [
      "Pre-enqueue regex guard scrubs API keys (AKIA..., ghp_..., xoxb-...)",
      "Strict fsync WAL queue with zero-drop backpressure handling",
      "Direct streaming to Splunk HEC, Datadog SIEM, and local storage",
    ],
    codePreview: `// observability/audit/src/ocsf_writer.rs
pub fn emit_audit_span(record: &mut AuditRecord) -> Result<(), AuditError> {
    self.scrub_canary_secrets(record);
    record.entry_hash = sha256_chain(&self.prev_hash, record);
    self.wal_sender.send_strict_fsync(record)
}`,
  },
];

export default function PlatformPage() {
  const [activeStep, setActiveStep] = useState<number>(1);
  const currentStage = LIFECYCLE_STAGES[activeStep - 1] ?? LIFECYCLE_STAGES[0]!;

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      {/* Platform Hero */}
      <div className="max-w-7xl mx-auto text-center mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-200/80 text-indigo-700 text-xs font-semibold uppercase tracking-wider mb-4">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          Axiom NHI Core Architecture
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight font-sans">
          The 4-Pillar Platform Built for Inline AI Runtime Governance
        </h1>
        <p className="mt-4 text-base sm:text-lg text-slate-600 max-w-3xl mx-auto leading-relaxed">
          Traditional IAM was designed for humans behind web browsers. Axiom NHI is engineered from the bare-metal up to govern non-human agents invoking high-velocity tools in under 5 milliseconds.
        </p>
      </div>

      <div className="max-w-7xl mx-auto space-y-16">
        {/* ====================================================================
           SECTION 1: Interactive 6-Stage Request Lifecycle Stepper
           ==================================================================== */}
        <section className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-10 shadow-xs">
          <div className="mb-8">
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider font-mono">
              INLINE REQUEST PIPELINE
            </span>
            <h2 className="text-2xl font-bold text-slate-900 mt-1">
              What Happens in the Sub-5ms Wire Window
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Click through the 6 stages every MCP <code>tools/call</code> traverses before reaching downstream infrastructure.
            </p>
          </div>

          {/* Stepper Navigation Buttons */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-8">
            {LIFECYCLE_STAGES.map((s) => {
              const isSelected = activeStep === s.step;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveStep(s.step)}
                  className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? "bg-indigo-50/80 border-indigo-300 ring-2 ring-indigo-500/20 shadow-xs"
                      : "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] font-mono font-bold ${isSelected ? "text-indigo-700" : "text-slate-400"}`}>
                      Stage {s.step}
                    </span>
                    <span className="text-[10px] font-mono font-semibold text-slate-500">
                      {s.latencyBudget}
                    </span>
                  </div>
                  <p className={`text-xs font-bold mt-1 line-clamp-1 ${isSelected ? "text-slate-900" : "text-slate-700"}`}>
                    {s.name}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Active Stage Detailed Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start bg-slate-50/60 border border-slate-200/80 rounded-2xl p-6">
            {/* Left Column: Stage Explanation */}
            <div className="lg:col-span-6 space-y-4">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white font-mono font-bold text-sm flex items-center justify-center shadow-xs">
                  {currentStage.step}
                </span>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {currentStage.name}
                  </h3>
                  <span className="text-xs font-mono text-slate-500">
                    {currentStage.crate}
                  </span>
                </div>
              </div>

              <p className="text-sm text-slate-600 leading-relaxed">
                {currentStage.description}
              </p>

              <div className="space-y-2 pt-2">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Technical Guarantees:
                </span>
                <ul className="space-y-1.5">
                  {currentStage.technicalDetails.map((detail, idx) => (
                    <li key={idx} className="text-xs text-slate-600 flex items-start gap-2">
                      <span className="text-emerald-600 font-bold">✓</span>
                      <span>{detail}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-3 flex items-center gap-3 text-xs font-mono text-slate-500">
                <span>Latency SLA:</span>
                <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                  {currentStage.latencyBudget}
                </span>
              </div>
            </div>

            {/* Right Column: Code Implementation Preview */}
            <div className="lg:col-span-6">
              <div className="flex items-center justify-between pb-2 text-xs font-mono text-slate-500 border-b border-slate-200 mb-2">
                <span>{currentStage.crate}</span>
                <span className="text-emerald-600 font-semibold">Compiled Rust 1.84</span>
              </div>
              <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed border border-slate-800">
                <code>{currentStage.codePreview}</code>
              </pre>
            </div>
          </div>
        </section>

        {/* ====================================================================
           SECTION 2: Deep-Dive Cards for the 4 Master Plan Pillars
           ==================================================================== */}
        <section className="space-y-8">
          <div className="text-center max-w-3xl mx-auto">
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider font-mono">
              THE FOUR MOATS
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">
              Engineered to Eliminate AI Security Vulnerabilities
            </h2>
            <p className="text-sm text-slate-600 mt-2">
              Why Axiom NHI outperforms traditional post-hoc posture tools and point proxies.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Pillar 1: Dual-Graph Architecture */}
            <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-xs hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-base mb-5 border border-blue-100">
                01
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                Dual-Graph Architecture (PostgreSQL 16 + SpiceDB)
              </h3>
              <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                PostgreSQL powers the <strong>Static Dependency Lineage Graph</strong> (answering <em>&ldquo;Which production workloads break if this secret is revoked?&rdquo;</em> via <code>v_shared_credential_siblings</code> and <code>simulate_revocation</code>).
              </p>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Meanwhile, SpiceDB powers the <strong>Real-Time Causal Delegation Graph</strong> (answering <em>&ldquo;Can Agent X invoke Tool Y right now?&rdquo;</em>). Crucially, PostgreSQL is completely off the &lt; 5ms hot wire path, synchronized lock-free via gRPC <code>ContextSync</code>.
              </p>
              <div className="mt-5 p-3.5 bg-slate-50 rounded-xl border border-slate-100 text-xs font-mono text-slate-700">
                <span className="text-slate-400">Lineage Query:</span> SELECT * FROM v_shared_credential_siblings WHERE secret_id = $1;
              </div>
            </div>

            {/* Pillar 2: Argument-Level Runtime Gating */}
            <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-xs hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-base mb-5 border border-emerald-100">
                02
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                Argument-Level Runtime Gating (AST Classifiers)
              </h3>
              <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                Network firewalls and OAuth scopes only understand coarse endpoints (e.g. <code>db:write</code>). If an autonomous AI agent is tricked by prompt injection into running <code>DROP TABLE customers</code>, OAuth blindly approves it.
              </p>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Axiom inspects the serialized payload inside the wire boundary. Our <code>sqlparser-rs</code> AST analyzer blocks destructive DDL, canonicalizes filesystem paths, and pins outbound HTTP egress to approved IP ranges in &lt; 1.2ms.
              </p>
              <div className="mt-5 p-3.5 bg-slate-50 rounded-xl border border-slate-100 text-xs font-mono text-slate-700">
                <span className="text-rose-600 font-bold">BLOCK:</span> DROP TABLE (DEST_DDL) | <span className="text-emerald-600 font-bold">ALLOW:</span> SELECT * WHERE org = $1
              </div>
            </div>

            {/* Pillar 3: Atomic Single-Use Approvals */}
            <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-xs hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-base mb-5 border border-purple-100">
                03
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                Atomic Approvals &amp; Sub-50ms Kill Switch
              </h3>
              <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                When an agent attempts a sensitive tool invocation requiring human approval, Axiom signs an immutable hash <code>sha256(agent_id | target | tool | canonical_args)</code>.
              </p>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                This cryptographic binding prevents Time-of-Check to Time-of-Use (TOCTOU) exploits. If an emergency halt is triggered, our <code>InFlightCancellationRegistry</code> severs active TCP streams and cancels open leases within 50ms.
              </p>
              <div className="mt-5 p-3.5 bg-slate-50 rounded-xl border border-slate-100 text-xs font-mono text-slate-700">
                <span className="text-indigo-600">Payload Hash:</span> sha256(agent-1|db.exec|DROP...) -&gt; 0x8f2d...9a12
              </div>
            </div>

            {/* Pillar 4: Safety-First Open-Core */}
            <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-xs hover:shadow-md transition-shadow">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-base mb-5 border border-amber-100">
                04
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                Safety-First Open-Core (Apache-2.0 Guarantee)
              </h3>
              <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                Security primitives should never be locked behind proprietary black boxes. The Axiom inline runtime gateway, Cedar policy engine, AST validators, and CLI are 100% open-source under Apache-2.0.
              </p>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                OpenBao (MPL-2.0) runs in clean external container isolation with zero source-linking, ensuring enterprise compliance with strict software supply-chain standards.
              </p>
              <div className="mt-5 p-3.5 bg-slate-50 rounded-xl border border-slate-100 text-xs font-mono text-slate-700">
                <span className="text-emerald-700 font-bold">100% Apache-2.0:</span> Self-host in your VPC or run air-gapped on Kubernetes.
              </div>
            </div>
          </div>
        </section>

        {/* Bottom CTA Card */}
        <section className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-3xl p-8 sm:p-12 text-center shadow-xl">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Ready to test Axiom NHI in your environment?
          </h2>
          <p className="mt-3 text-slate-300 max-w-2xl mx-auto text-sm sm:text-base">
            Run our 30-minute self-serve shadow audit or spin up a local gateway container with a single command.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/shadow-audit"
              className="px-6 py-3 rounded-full bg-white text-slate-900 hover:bg-slate-100 text-sm font-bold shadow-md transition-colors"
            >
              Start 30-Min Shadow Audit &rarr;
            </Link>
            <Link
              href="/playground"
              className="px-6 py-3 rounded-full bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 text-sm font-semibold transition-colors"
            >
              Test in Playground
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
