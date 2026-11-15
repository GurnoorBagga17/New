// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
import { useState } from "react";

interface ApprovalTicket {
  ticketId: string;
  agentId: string;
  targetServer: string;
  toolName: string;
  canonicalArgumentsJson: string;
  payloadSha256: string;
  expiresInSecs: number;
  status: "PENDING" | "APPROVED" | "CONSUMED" | "DENIED";
  approver?: string;
}

const INITIAL_TICKETS: ApprovalTicket[] = [
  {
    ticketId: "HITL-8941",
    agentId: "autonomous-finops-agent",
    targetServer: "aws-iam-mcp",
    toolName: "iam_attach_role_policy",
    canonicalArgumentsJson: '{"policy_arn": "arn:aws:iam::aws:policy/AdministratorAccess", "role_name": "data-sync-worker"}',
    payloadSha256: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    expiresInSecs: 180,
    status: "PENDING",
  },
  {
    ticketId: "HITL-8942",
    agentId: "db-migration-bot",
    targetServer: "postgres-mcp",
    toolName: "execute_sql_migration",
    canonicalArgumentsJson: '{"query": "DROP TABLE legacy_session_tokens CASCADE;"}',
    payloadSha256: "sha256:a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0",
    expiresInSecs: 45,
    status: "PENDING",
  },
  {
    ticketId: "HITL-8939",
    agentId: "k8s-auto-remediation-worker",
    targetServer: "kubernetes-mcp",
    toolName: "restart_deployment",
    canonicalArgumentsJson: '{"deployment": "ingress-controller", "namespace": "kube-system"}',
    payloadSha256: "sha256:9f8e7d6c5b4a31201928374655647382910abcdef1234567890abcdef1234567",
    expiresInSecs: 0,
    status: "CONSUMED",
    approver: "lead-sre@company.com",
  },
];

export function ApprovalsPage() {
  const [tickets, setTickets] = useState<ApprovalTicket[]>(INITIAL_TICKETS);

  const handleApprove = (ticketId: string) => {
    setTickets((prev) =>
      prev.map((t) =>
        t.ticketId === ticketId
          ? { ...t, status: "APPROVED", approver: "security-operator@axiom-nhi.local" }
          : t,
      ),
    );
  };

  const handleDeny = (ticketId: string) => {
    setTickets((prev) =>
      prev.map((t) =>
        t.ticketId === ticketId
          ? { ...t, status: "DENIED", approver: "security-operator@axiom-nhi.local" }
          : t,
      ),
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4">
          <p className="font-mono text-xs uppercase tracking-wider text-text-muted">Pending Break-Glass Queue</p>
          <p className="mt-1 font-display text-2xl font-bold text-brand-orange">
            {tickets.filter((t) => t.status === "PENDING").length}
          </p>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4">
          <p className="font-mono text-xs uppercase tracking-wider text-text-muted">Atomic Single-Use Enforced</p>
          <p className="mt-1 font-display text-2xl font-bold text-state-enforce">100%</p>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4">
          <p className="font-mono text-xs uppercase tracking-wider text-text-muted">Tamper Proof Verification</p>
          <p className="mt-1 font-display text-2xl font-bold text-state-enforce">SHA-256 Pinned</p>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4">
          <p className="font-mono text-xs uppercase tracking-wider text-text-muted">Slack Block Kit Sync</p>
          <p className="mt-1 font-display text-2xl font-bold text-text-primary">Live Connected</p>
        </div>
      </div>

      {/* Tickets List */}
      <div className="rounded-card border border-border-subtle bg-surface-1 p-5 space-y-4">
        <div className="border-b border-border-subtle pb-3">
          <h3 className="font-display text-sm font-bold text-text-primary">Human-in-the-Loop (HITL) Authorization Requests</h3>
          <p className="font-mono text-[11px] text-text-muted">
            High-privilege MCP tool calls quarantined by Cedar policies awaiting human operator verification.
          </p>
        </div>

        <div className="space-y-4">
          {tickets.map((ticket) => (
            <div
              key={ticket.ticketId}
              className={`rounded-lg border p-4 transition ${
                ticket.status === "PENDING"
                  ? "border-brand-orange/40 bg-surface-2/60"
                  : ticket.status === "APPROVED"
                  ? "border-state-enforce/40 bg-surface-2/40"
                  : "border-border-subtle bg-surface-1/80 opacity-75"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-text-primary">{ticket.ticketId}</span>
                  <span className="font-mono text-[11px] text-brand-cyan">{ticket.agentId}</span>
                </div>
                <div className="flex items-center gap-2">
                  {ticket.expiresInSecs > 0 && ticket.status === "PENDING" && (
                    <span className="font-mono text-[11px] text-state-pending">Expires in {ticket.expiresInSecs}s</span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                      ticket.status === "PENDING"
                        ? "bg-state-pending/15 text-state-pending border border-state-pending/30"
                        : ticket.status === "APPROVED"
                        ? "bg-state-enforce/15 text-state-enforce border border-state-enforce/30"
                        : ticket.status === "CONSUMED"
                        ? "bg-surface-3 text-text-muted border border-border-subtle"
                        : "bg-state-deny/15 text-state-deny border border-state-deny/30"
                    }`}
                  >
                    {ticket.status}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-3 text-xs">
                <div>
                  <span className="font-mono text-[10px] text-text-muted uppercase">Target MCP Server & Tool:</span>
                  <p className="font-semibold text-text-primary">{ticket.targetServer} &bull; <code>{ticket.toolName}</code></p>
                </div>
                <div>
                  <span className="font-mono text-[10px] text-text-muted uppercase">Cryptographic Integrity Hash:</span>
                  <p className="font-mono text-[10px] text-text-secondary truncate">{ticket.payloadSha256}</p>
                </div>
              </div>

              <div className="rounded bg-surface-3/80 p-2.5 font-mono text-xs text-text-primary border border-border-subtle">
                <span className="text-[10px] text-text-muted uppercase block mb-1">Payload to be Executed:</span>
                <code>{ticket.canonicalArgumentsJson}</code>
              </div>

              {ticket.status === "PENDING" && (
                <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-border-subtle">
                  <button
                    type="button"
                    onClick={() => handleDeny(ticket.ticketId)}
                    className="rounded px-3 py-1.5 text-xs font-semibold text-state-deny border border-state-deny/30 hover:bg-state-deny/10 transition"
                  >
                    Reject & Quarantine
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApprove(ticket.ticketId)}
                    className="rounded bg-state-enforce px-4 py-1.5 text-xs font-bold text-bg-canvas hover:bg-state-enforce/90 transition shadow-sm"
                  >
                    Authorize Single-Use Execution &rarr;
                  </button>
                </div>
              )}

              {ticket.approver && (
                <div className="mt-3 text-[11px] font-mono text-text-muted">
                  Reviewed by: <span className="text-text-secondary">{ticket.approver}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
