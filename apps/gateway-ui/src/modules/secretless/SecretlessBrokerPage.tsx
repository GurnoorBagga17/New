// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
import { useState, useEffect } from "react";

interface SecretlessLease {
  leaseId: string;
  vaultUri: string;
  workloadUid: string;
  targetResource: string;
  ttlSeconds: number;
  maxTtlSeconds: number;
  renewable: boolean;
  status: "ACTIVE" | "ROTATING" | "REVOKED";
  secretType: "DATABASE_DYNAMIC_ROLE" | "AWS_STS_ASSUME_ROLE" | "OAUTH_REFRESH_TOKEN";
}

const INITIAL_LEASES: SecretlessLease[] = [
  {
    leaseId: "openbao/lease/mysql/creds/finops-agent/0196d1f0-a1b2",
    vaultUri: "vault://openbao.internal/v1/database/creds/finops_ephemeral_role",
    workloadUid: "spiffe://axiom.internal/ns/prod/sa/autonomous-finops-agent",
    targetResource: "mcp://prod-db",
    ttlSeconds: 248,
    maxTtlSeconds: 300,
    renewable: true,
    status: "ACTIVE",
    secretType: "DATABASE_DYNAMIC_ROLE",
  },
  {
    leaseId: "openbao/lease/aws/sts/github-bot/0196d1f0-c3d4",
    vaultUri: "vault://openbao.internal/v1/aws/sts/devex_ci_role",
    workloadUid: "spiffe://axiom.internal/ns/ci/sa/github-pr-review-bot",
    targetResource: "mcp://aws-iam-proxy",
    ttlSeconds: 142,
    maxTtlSeconds: 300,
    renewable: true,
    status: "ACTIVE",
    secretType: "AWS_STS_ASSUME_ROLE",
  },
  {
    leaseId: "openbao/lease/database/k8s-remediation/0196d1f0-e5f6",
    vaultUri: "vault://openbao.internal/v1/database/creds/k8s_ops_role",
    workloadUid: "spiffe://axiom.internal/ns/ops/sa/k8s-auto-remediation-worker",
    targetResource: "mcp://kubernetes-mcp",
    ttlSeconds: 418,
    maxTtlSeconds: 600,
    renewable: false,
    status: "ACTIVE",
    secretType: "DATABASE_DYNAMIC_ROLE",
  },
  {
    leaseId: "openbao/lease/oauth/bi-collector/0196d1f0-7788",
    vaultUri: "vault://openbao.internal/v1/secret/oauth/tokens/bi_collector",
    workloadUid: "spiffe://axiom.internal/ns/analytics/sa/bi-reporting-collector",
    targetResource: "mcp://postgres-mcp",
    ttlSeconds: 18,
    maxTtlSeconds: 300,
    renewable: true,
    status: "ROTATING",
    secretType: "OAUTH_REFRESH_TOKEN",
  },
];

const RFC8693_CHAIN_SAMPLE = {
  subject_token_jti: "0196d1f0-7c40-7d6a-8c7b-21c55a8f1001",
  actor_agent_spiffe_id: "spiffe://axiom.internal/ns/prod/sa/subagent-sql-executor",
  parent_delegator_id: "spiffe://axiom.internal/ns/prod/sa/autonomous-finops-agent",
  requested_resource_indicator: "mcp://prod-db",
  requested_scopes: ["sql:select"],
  parent_granted_scopes: ["sql:select", "iam:get-role"],
  act_chain: [
    "user:alex.mercer@corp.internal",
    "spiffe://axiom.internal/ns/prod/sa/autonomous-finops-agent",
    "spiffe://axiom.internal/ns/prod/sa/subagent-sql-executor",
  ],
  attenuation_status: "VALID_SUBSET_NO_ESCALATION",
};

export function SecretlessBrokerPage() {
  const [leases, setLeases] = useState<SecretlessLease[]>(INITIAL_LEASES);
  const [activeTab, setActiveTab] = useState<"LEASES" | "RFC8693" | "ROTATION_MACHINE">("LEASES");
  const [rotationStep, setRotationStep] = useState<number>(1);

  // Live countdown timer for dynamic leases
  useEffect(() => {
    const timer = setInterval(() => {
      setLeases((prev) =>
        prev.map((lease) => {
          if (lease.status !== "ACTIVE" && lease.status !== "ROTATING") return lease;
          const nextTtl = lease.ttlSeconds <= 1 ? lease.maxTtlSeconds : lease.ttlSeconds - 1;
          const nextStatus = nextTtl < 30 ? "ROTATING" : "ACTIVE";
          return {
            ...lease,
            ttlSeconds: nextTtl,
            status: nextStatus,
          };
        })
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleRevoke = (leaseId: string) => {
    setLeases((prev) =>
      prev.map((l) => (l.leaseId === leaseId ? { ...l, status: "REVOKED", ttlSeconds: 0 } : l))
    );
  };

  const handleRenew = (leaseId: string) => {
    setLeases((prev) =>
      prev.map((l) =>
        l.leaseId === leaseId ? { ...l, ttlSeconds: l.maxTtlSeconds, status: "ACTIVE" } : l
      )
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-border-subtle pb-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-brand-orange">
              ZERO-STATIC-SECRETS &bull; OPENBAO VAULT BROKER
            </span>
            <span className="inline-flex items-center rounded-full border border-state-enforce/30 bg-state-enforce-tint px-2 py-0.5 font-mono text-[10px] text-state-enforce">
              RUST CRATE: secretless
            </span>
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-text-primary">
            Secretless Ephemeral Credential Broker
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Enforces the Zero-Secret Browser Boundary: workloads receive dynamic OpenBao leases (&le;300s TTL) and RFC 8693 attenuated delegation tokens. Static keys never touch browser memory or disk.
          </p>
        </div>

        {/* Tab switchers */}
        <div className="flex rounded-input border border-border-subtle bg-surface-1 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("LEASES")}
            className={`rounded px-3 py-1.5 font-mono text-xs transition ${
              activeTab === "LEASES"
                ? "bg-surface-2 font-semibold text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            Dynamic Leases ({leases.filter((l) => l.status !== "REVOKED").length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("RFC8693")}
            className={`rounded px-3 py-1.5 font-mono text-xs transition ${
              activeTab === "RFC8693"
                ? "bg-surface-2 font-semibold text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            RFC 8693 Delegation Tree
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("ROTATION_MACHINE")}
            className={`rounded px-3 py-1.5 font-mono text-xs transition ${
              activeTab === "ROTATION_MACHINE"
                ? "bg-surface-2 font-semibold text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            Zero-Downtime Rotation
          </button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-text-muted">Zero-Secret Boundary</p>
          <p className="mt-2 font-display text-xl font-bold text-state-enforce">100% PROTECTED</p>
          <p className="mt-1 text-xs text-text-muted">0 Static API keys in browser</p>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-brand-orange">Active Ephemeral Leases</p>
          <p className="mt-2 font-display text-2xl font-bold text-brand-orange">
            {leases.filter((l) => l.status === "ACTIVE").length}
          </p>
          <p className="mt-1 text-xs text-text-muted">Auto-revoked on workload exit</p>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-state-pending">Auto-Rotating (&lt;30s TTL)</p>
          <p className="mt-2 font-display text-2xl font-bold text-state-pending">
            {leases.filter((l) => l.status === "ROTATING").length}
          </p>
          <p className="mt-1 text-xs text-text-muted">Dual-secret rotation engaged</p>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-text-muted">Max Ephemeral Ceiling</p>
          <p className="mt-2 font-display text-2xl font-bold text-text-primary">300s</p>
          <p className="mt-1 text-xs text-text-muted">Hard ceiling per RFC 8693 contract</p>
        </div>
      </div>

      {/* Tab 1: Dynamic Leases Table */}
      {activeTab === "LEASES" && (
        <div className="overflow-hidden rounded-card border border-border-subtle bg-surface-1">
          <div className="border-b border-border-subtle bg-surface-2 p-3 font-mono text-xs text-text-muted">
            LIVE OPENBAO EPHEMERAL LEASE MONITOR &bull; TICKING REAL-TIME
          </div>
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border-subtle bg-surface-2 font-mono uppercase text-text-muted">
              <tr>
                <th className="p-3">Workload / Agent</th>
                <th className="p-3">Vault Dynamic URI Pill</th>
                <th className="p-3">Target Resource</th>
                <th className="p-3">TTL Countdown</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {leases.map((lease) => {
                const percent = Math.round((lease.ttlSeconds / lease.maxTtlSeconds) * 100);
                return (
                  <tr key={lease.leaseId} className="transition hover:bg-surface-2/60">
                    <td className="p-3">
                      <div className="font-mono font-semibold text-text-primary">
                        {lease.workloadUid.split("/").pop()}
                      </div>
                      <div className="max-w-[200px] truncate font-mono text-[10px] text-text-muted">
                        {lease.workloadUid}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-3 px-2.5 py-1 font-mono text-[11px] text-brand-orange">
                        <span className="size-1.5 rounded-full bg-brand-orange animate-pulse" />
                        <span className="truncate max-w-[240px]">{lease.vaultUri}</span>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="font-mono text-xs text-text-secondary">
                        {lease.targetResource}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="w-32">
                        <div className="flex justify-between font-mono text-[10px] text-text-muted">
                          <span>{lease.ttlSeconds}s</span>
                          <span>{percent}%</span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                          <div
                            className={`h-full transition-all duration-1000 ${
                              percent > 40
                                ? "bg-state-enforce"
                                : percent > 15
                                ? "bg-state-pending"
                                : "bg-state-deny"
                            }`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <span
                        className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                          lease.status === "ACTIVE"
                            ? "bg-state-enforce-tint text-state-enforce"
                            : lease.status === "ROTATING"
                            ? "bg-state-pending-tint text-state-pending animate-pulse"
                            : "bg-state-deny-tint text-state-deny"
                        }`}
                      >
                        {lease.status}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {lease.renewable && lease.status !== "REVOKED" && (
                          <button
                            type="button"
                            onClick={() => handleRenew(lease.leaseId)}
                            className="rounded border border-border-subtle bg-surface-2 px-2 py-1 font-mono text-[10px] font-semibold text-text-primary transition hover:bg-surface-3"
                          >
                            RENEW
                          </button>
                        )}
                        {lease.status !== "REVOKED" && (
                          <button
                            type="button"
                            onClick={() => handleRevoke(lease.leaseId)}
                            className="rounded border border-state-deny/40 bg-state-deny-tint px-2 py-1 font-mono text-[10px] font-semibold text-state-deny transition hover:bg-state-deny hover:text-white"
                          >
                            REVOKE
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: RFC 8693 Multi-Hop Token Exchange Tree */}
      {activeTab === "RFC8693" && (
        <div className="space-y-4">
          <div className="rounded-card border border-border-subtle bg-surface-1 p-5 shadow-sm">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-state-enforce">
              IETF RFC 8693 &bull; ACT DELEGATION CHAIN
            </span>
            <h2 className="mt-1 font-display text-lg font-bold text-text-primary">
              Multi-Hop Subagent Delegation &amp; Scope Attenuation
            </h2>
            <p className="mt-1 text-xs text-text-secondary">
              When an autonomous agent delegates work to a specialized subagent, Axiom issues an RFC 8693 token exchange. The child token inherits strictly attenuated scopes (never broader than the parent).
            </p>

            {/* Tree Flow Visualizer */}
            <div className="mt-6 rounded-card border border-border-subtle bg-canvas p-6">
              <div className="flex flex-col items-center gap-4 md:flex-row md:justify-between">
                {/* Node 1: User */}
                <div className="flex flex-col items-center rounded-card border border-border-subtle bg-surface-1 p-4 text-center">
                  <div className="font-mono text-xs text-text-muted">INITIAL PRINCIPAL</div>
                  <div className="mt-1 font-mono font-bold text-text-primary">alex.mercer@corp.internal</div>
                  <span className="mt-2 rounded bg-surface-3 px-2 py-0.5 font-mono text-[10px] text-text-secondary">
                    Human Okta SSO
                  </span>
                </div>

                <div className="font-mono text-lg text-brand-orange">&rarr; delegated &rarr;</div>

                {/* Node 2: Autonomous Agent */}
                <div className="flex flex-col items-center rounded-card border border-border-subtle bg-surface-1 p-4 text-center">
                  <div className="font-mono text-xs text-text-muted">PARENT DELEGATOR</div>
                  <div className="mt-1 font-mono font-bold text-text-primary">autonomous-finops-agent</div>
                  <div className="mt-1 flex gap-1">
                    <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-brand-orange">
                      sql:select
                    </span>
                    <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-brand-orange">
                      iam:get-role
                    </span>
                  </div>
                </div>

                <div className="font-mono text-lg text-brand-orange">&rarr; RFC 8693 &rarr;</div>

                {/* Node 3: Specialized Subagent */}
                <div className="flex flex-col items-center rounded-card border border-state-enforce/50 bg-surface-1 p-4 text-center shadow-sm">
                  <div className="font-mono text-xs text-state-enforce">ATTENUATED SUBAGENT</div>
                  <div className="mt-1 font-mono font-bold text-text-primary">subagent-sql-executor</div>
                  <div className="mt-1">
                    <span className="rounded bg-state-enforce-tint px-2 py-0.5 font-mono text-[10px] font-bold text-state-enforce">
                      sql:select only
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-6 border-t border-border-subtle pt-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-text-muted">SCOPE ATTENUATION INTEGRITY:</span>
                  <span className="font-mono font-bold text-state-enforce">
                    &check; PASS: No Privilege Escalation (Requested &#8838; Granted)
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-card border border-border-subtle bg-canvas p-4">
              <pre className="overflow-x-auto font-mono text-xs text-text-secondary">
                {JSON.stringify(RFC8693_CHAIN_SAMPLE, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Zero-Downtime Dual-Secret Rotation */}
      {activeTab === "ROTATION_MACHINE" && (
        <div className="space-y-4">
          <div className="rounded-card border border-border-subtle bg-surface-1 p-5 shadow-sm">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-brand-orange">
              ZERO-DOWNTIME STATIC SECRET TRANSITION
            </span>
            <h2 className="mt-1 font-display text-lg font-bold text-text-primary">
              Dual-Secret Overlap State Machine
            </h2>
            <p className="mt-1 text-xs text-text-secondary">
              Gradually transitions legacy static API tokens into ephemeral OpenBao leases without dropping ongoing agent connections.
            </p>

            {/* Stepper Visualizer */}
            <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-4">
              {[
                { step: 1, title: "1. Primary Active", desc: "Secret A active, Secret B pending generation." },
                { step: 2, title: "2. Dual-Verification", desc: "Both secrets valid. Gateway accepts either." },
                { step: 3, title: "3. Primary Swap", desc: "Secret B promoted to primary. Secret A in grace period." },
                { step: 4, title: "4. Retired & Revoked", desc: "Secret A permanently revoked in OpenBao." },
              ].map((s) => (
                <div
                  key={s.step}
                  onClick={() => setRotationStep(s.step)}
                  className={`cursor-pointer rounded-card border p-4 transition ${
                    rotationStep === s.step
                      ? "border-brand-orange bg-surface-2 shadow-sm"
                      : "border-border-subtle bg-surface-1 opacity-70 hover:opacity-100"
                  }`}
                >
                  <div className="font-mono text-xs font-bold text-brand-orange">{s.title}</div>
                  <p className="mt-2 text-xs text-text-secondary">{s.desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-card border border-border-subtle bg-canvas p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-text-primary">
                  CURRENT ROTATION STATE: STEP {rotationStep} OF 4
                </span>
                <button
                  type="button"
                  onClick={() => setRotationStep((prev) => (prev % 4) + 1)}
                  className="rounded-input border border-border-subtle bg-surface-2 px-3 py-1.5 font-mono text-xs font-semibold text-brand-orange transition hover:bg-surface-3"
                >
                  Advance Step &rarr;
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
