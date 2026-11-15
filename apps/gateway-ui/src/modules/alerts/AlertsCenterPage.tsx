// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
import { useState } from "react";

interface SecurityAlert {
  id: string;
  entityUid: string;
  findingCode: string;
  title: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  detectedAtUnix: number;
  outboundChannel: "Slack #sec-alerts" | "Jira REST v3" | "PagerDuty Sev-1";
  dedupSuppressed: boolean;
}

const INITIAL_ALERTS: SecurityAlert[] = [
  {
    id: "alt-01",
    entityUid: "spiffe://axiom.internal/ns/dev/sa/unauthorized-shadow-agent",
    findingCode: "NHI-01",
    title: "Shadow AI Agent attempting tools/call on unapproved DB MCP server",
    severity: "CRITICAL",
    detectedAtUnix: Date.now() - 1000 * 60 * 4,
    outboundChannel: "PagerDuty Sev-1",
    dedupSuppressed: false,
  },
  {
    id: "alt-02",
    entityUid: "aws-iam-mcp",
    findingCode: "NHI-07",
    title: "Excessive Cloud IAM Permissions detected on production execution path",
    severity: "HIGH",
    detectedAtUnix: Date.now() - 1000 * 60 * 18,
    outboundChannel: "Slack #sec-alerts",
    dedupSuppressed: false,
  },
  {
    id: "alt-03",
    entityUid: "spiffe://axiom.internal/ns/ci/sa/github-pr-review-bot",
    findingCode: "MCP-02",
    title: "AST SQL parameter scrubber blocked prompt injection keyword",
    severity: "MEDIUM",
    detectedAtUnix: Date.now() - 1000 * 60 * 45,
    outboundChannel: "Jira REST v3",
    dedupSuppressed: true,
  },
  {
    id: "alt-04",
    entityUid: "res-snowflake-db",
    findingCode: "NHI-03",
    title: "Unowned Static Service Account Key accessed by autonomous runtime",
    severity: "HIGH",
    detectedAtUnix: Date.now() - 1000 * 60 * 85,
    outboundChannel: "Slack #sec-alerts",
    dedupSuppressed: false,
  },
];

export function AlertsCenterPage() {
  const [alerts] = useState<SecurityAlert[]>(INITIAL_ALERTS);

  return (
    <div className="space-y-6">
      {/* 30-Minute Automated Shadow-NHI Audit Report Card */}
      <div className="rounded-card border border-brand-orange/30 bg-gradient-to-r from-surface-1 via-surface-1 to-surface-2 p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-brand-orange font-bold">
              30-Minute Automated Discovery Scan
            </span>
            <h2 className="font-display text-lg font-bold text-text-primary">
              Shadow-NHI &amp; Autonomous Agent Audit Report
            </h2>
          </div>
          <div className="rounded bg-state-enforce/15 px-3 py-1 font-mono text-xs font-bold text-state-enforce border border-state-enforce/30">
            DISCOVERY ENGINE: $0.00 USD
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-xs font-mono">
          <div>
            <span className="text-text-muted">Total Discovered NHIs:</span>
            <p className="text-lg font-bold text-text-primary">48 Entities</p>
          </div>
          <div>
            <span className="text-text-muted">Shadow AI Endpoints:</span>
            <p className="text-lg font-bold text-state-deny">3 Shadow</p>
          </div>
          <div>
            <span className="text-text-muted">Static Leaked Secrets:</span>
            <p className="text-lg font-bold text-brand-orange">7 Credentials</p>
          </div>
          <div>
            <span className="text-text-muted">Cedar Remediation Rules:</span>
            <p className="text-lg font-bold text-state-enforce">5 Generated</p>
          </div>
        </div>
      </div>

      {/* Active Alerts List */}
      <div className="rounded-card border border-border-subtle bg-surface-1 p-5 space-y-4">
        <div className="border-b border-border-subtle pb-3">
          <h3 className="font-display text-sm font-bold text-text-primary">Real-Time Threat &amp; Anomaly Stream</h3>
          <p className="font-mono text-[11px] text-text-muted">
            Fingerprint deduplicated incident alerts routed to Slack, Jira REST v3, and PagerDuty.
          </p>
        </div>

        <div className="space-y-3">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`rounded-lg border p-4 transition ${
                alert.severity === "CRITICAL"
                  ? "border-state-deny/40 bg-state-deny/5"
                  : alert.severity === "HIGH"
                  ? "border-brand-orange/40 bg-brand-orange/5"
                  : "border-border-subtle bg-surface-2/40"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold ${
                      alert.severity === "CRITICAL"
                        ? "bg-state-deny text-bg-canvas"
                        : alert.severity === "HIGH"
                        ? "bg-brand-orange text-bg-canvas"
                        : "bg-surface-3 text-text-secondary"
                    }`}
                  >
                    {alert.severity}
                  </span>
                  <span className="font-mono text-xs font-semibold text-text-primary">{alert.findingCode}</span>
                  <span className="font-display text-xs font-semibold text-text-primary">{alert.title}</span>
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <span className="rounded bg-surface-2 px-2 py-0.5 text-text-secondary border border-border-subtle">
                    {alert.outboundChannel}
                  </span>
                  {alert.dedupSuppressed && (
                    <span className="rounded bg-surface-3 px-2 py-0.5 text-text-muted">
                      Dedup Suppressed
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-2 font-mono text-[11px] text-text-muted truncate">
                Target Entity: <span className="text-text-secondary">{alert.entityUid}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
