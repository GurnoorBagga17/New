// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
import { useState } from "react";

interface SiemDestination {
  id: string;
  name: string;
  targetType: "SPLUNK_HEC" | "MICROSOFT_SENTINEL" | "CROWDSTRIKE_SOAR" | "DATADOG_SIEM";
  endpoint: string;
  format: "OCSF_1_3" | "CEF_RFC_5424" | "RAW_JSON";
  eventsForwarded24h: number;
  deliverySuccessPercent: number;
  status: "ONLINE" | "CONNECTING" | "PAUSED";
}

interface SoarPlaybook {
  id: string;
  name: string;
  triggerCondition: string;
  action: string;
  executionCount: number;
  enabled: boolean;
}

const INITIAL_DESTINATIONS: SiemDestination[] = [
  {
    id: "siem-splunk",
    name: "Enterprise Splunk HEC Cluster",
    targetType: "SPLUNK_HEC",
    endpoint: "https://hec.splunk.internal:8088/services/collector",
    format: "CEF_RFC_5424",
    eventsForwarded24h: 1842019,
    deliverySuccessPercent: 99.99,
    status: "ONLINE",
  },
  {
    id: "siem-sentinel",
    name: "Microsoft Sentinel Workspace",
    targetType: "MICROSOFT_SENTINEL",
    endpoint: "https://law-axiom-prod.ods.opinsights.azure.com",
    format: "OCSF_1_3",
    eventsForwarded24h: 914200,
    deliverySuccessPercent: 100.0,
    status: "ONLINE",
  },
  {
    id: "siem-crowdstrike",
    name: "CrowdStrike Falcon SOAR",
    targetType: "CROWDSTRIKE_SOAR",
    endpoint: "https://api.crowdstrike.com/soar/v1/actions",
    format: "OCSF_1_3",
    eventsForwarded24h: 4210,
    deliverySuccessPercent: 100.0,
    status: "ONLINE",
  },
  {
    id: "siem-datadog",
    name: "Datadog Cloud SIEM Pipeline",
    targetType: "DATADOG_SIEM",
    endpoint: "https://http-intake.logs.datadoghq.com/api/v2/logs",
    format: "RAW_JSON",
    eventsForwarded24h: 3120400,
    deliverySuccessPercent: 99.98,
    status: "ONLINE",
  },
];

const INITIAL_PLAYBOOKS: SoarPlaybook[] = [
  {
    id: "pb-01",
    name: "Automated Workload Quarantine on 3x Policy Deny",
    triggerCondition: "3 consecutive Cedar policy DENY verdicts within 60s for single agent",
    action: "Trigger sub-100ms session revocation and isolate K8s network policy",
    executionCount: 2,
    enabled: true,
  },
  {
    id: "pb-02",
    name: "Immediate Dynamic Lease Revocation on PII Egress",
    triggerCondition: "Zero-Secret Scrubber detects unredacted SSN/Credit Card in egress payload",
    action: "Revoke OpenBao vault lease and notify SecOps on Slack #security-alerts",
    executionCount: 0,
    enabled: true,
  },
  {
    id: "pb-03",
    name: "Air-Gap Anomaly PagerDuty Alert",
    triggerCondition: "Any TCP SYN egress attempt detected in isolated bare metal cluster",
    action: "Page On-Call Principal Security Engineer immediately",
    executionCount: 0,
    enabled: true,
  },
];

const SAMPLE_CEF_RECORD =
  "CEF:0|AxiomNHI|RuntimeGateway|1.0|3003|Authorize Session|6|src=spiffe://axiom.internal/ns/prod/sa/autonomous-finops-agent dst=mcp://prod-db msg=Tool execute_sql decision=PERMIT latency_us=1420";

export function SiemSoarPage() {
  const [destinations] = useState<SiemDestination[]>(INITIAL_DESTINATIONS);
  const [playbooks, setPlaybooks] = useState<SoarPlaybook[]>(INITIAL_PLAYBOOKS);
  const [activeTab, setActiveTab] = useState<"DESTINATIONS" | "PLAYBOOKS" | "CEF_FEED">("DESTINATIONS");

  const togglePlaybook = (id: string) => {
    setPlaybooks((prev) =>
      prev.map((pb) => (pb.id === id ? { ...pb, enabled: !pb.enabled } : pb))
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-border-subtle pb-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-brand-orange">
              INCIDENT RESPONSE &bull; SIEM &amp; SOAR FORWARDERS
            </span>
            <span className="inline-flex items-center rounded-full border border-state-enforce/30 bg-state-enforce-tint px-2 py-0.5 font-mono text-[10px] text-state-enforce">
              RUST CRATE: siem-soar
            </span>
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-text-primary">
            SIEM &amp; SOAR Forwarding Pipelines
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Continuous streaming to Splunk HEC, Microsoft Sentinel, and CrowdStrike Falcon formatted in OCSF v1.3 and CEF, paired with automated SOAR quarantine playbooks.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex rounded-input border border-border-subtle bg-surface-1 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("DESTINATIONS")}
            className={`rounded px-3 py-1.5 font-mono text-xs transition ${
              activeTab === "DESTINATIONS"
                ? "bg-surface-2 font-semibold text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            Destinations ({destinations.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("PLAYBOOKS")}
            className={`rounded px-3 py-1.5 font-mono text-xs transition ${
              activeTab === "PLAYBOOKS"
                ? "bg-surface-2 font-semibold text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            SOAR Playbooks ({playbooks.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("CEF_FEED")}
            className={`rounded px-3 py-1.5 font-mono text-xs transition ${
              activeTab === "CEF_FEED"
                ? "bg-surface-2 font-semibold text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            Live CEF &bull; OCSF Feed
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-text-muted">Total Forwarded (24h)</p>
          <p className="mt-2 font-display text-2xl font-bold text-text-primary">5.88M</p>
          <p className="mt-1 text-xs text-text-muted">Events sent across all targets</p>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-state-enforce">Delivery Success Rate</p>
          <p className="mt-2 font-display text-2xl font-bold text-state-enforce">99.99%</p>
          <p className="mt-1 text-xs text-text-muted">Zero dropped event logs</p>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-brand-orange">Active SOAR Playbooks</p>
          <p className="mt-2 font-display text-2xl font-bold text-brand-orange">
            {playbooks.filter((p) => p.enabled).length} Enabled
          </p>
          <p className="mt-1 text-xs text-text-muted">Automated quarantine triggers</p>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-text-muted">Delivery Latency</p>
          <p className="mt-2 font-display text-2xl font-bold text-text-primary">42 ms</p>
          <p className="mt-1 text-xs text-text-muted">Asynchronous batch buffering</p>
        </div>
      </div>

      {/* Tab 1: Forwarder Destinations */}
      {activeTab === "DESTINATIONS" && (
        <div className="overflow-hidden rounded-card border border-border-subtle bg-surface-1">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border-subtle bg-surface-2 font-mono uppercase text-text-muted">
              <tr>
                <th className="p-3">Forwarder Target</th>
                <th className="p-3">Protocol Format</th>
                <th className="p-3">Ingestion Endpoint</th>
                <th className="p-3">Events (24h) &bull; Delivery</th>
                <th className="p-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {destinations.map((d) => (
                <tr key={d.id} className="transition hover:bg-surface-2/60">
                  <td className="p-3 font-semibold text-text-primary">
                    <div>{d.name}</div>
                    <div className="font-mono text-[10px] text-text-muted">{d.targetType}</div>
                  </td>
                  <td className="p-3">
                    <span className="rounded bg-surface-3 px-2 py-0.5 font-mono text-[10px] text-brand-orange">
                      {d.format}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-[11px] text-text-secondary truncate max-w-[260px]">
                    {d.endpoint}
                  </td>
                  <td className="p-3">
                    <div className="font-mono font-semibold text-text-primary">
                      {d.eventsForwarded24h.toLocaleString()}
                    </div>
                    <div className="font-mono text-[10px] text-state-enforce">
                      {d.deliverySuccessPercent}% success
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    <span className="rounded-full bg-state-enforce-tint px-2 py-0.5 font-mono text-[10px] font-bold text-state-enforce">
                      {d.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: SOAR Playbooks */}
      {activeTab === "PLAYBOOKS" && (
        <div className="space-y-4">
          <div className="rounded-card border border-border-subtle bg-surface-1 p-5 shadow-sm">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-brand-orange">
              SOAR INCIDENT REMEDIATION RUNBOOKS
            </span>
            <h2 className="mt-1 font-display text-lg font-bold text-text-primary">
              Automated Containment Actions
            </h2>
            <div className="mt-6 space-y-3">
              {playbooks.map((pb) => (
                <div
                  key={pb.id}
                  className="flex flex-col justify-between gap-4 rounded-card border border-border-subtle bg-surface-2 p-4 sm:flex-row sm:items-center"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-display font-semibold text-text-primary">{pb.name}</span>
                      <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
                        Triggered {pb.executionCount} times
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-xs text-text-muted">
                      IF: <span className="text-text-secondary">{pb.triggerCondition}</span>
                    </p>
                    <p className="font-mono text-xs text-brand-orange">
                      THEN: <span className="text-text-primary font-medium">{pb.action}</span>
                    </p>
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => togglePlaybook(pb.id)}
                      className={`rounded-input px-3 py-1.5 font-mono text-xs font-bold transition ${
                        pb.enabled
                          ? "border border-state-enforce/40 bg-state-enforce-tint text-state-enforce"
                          : "border border-border-subtle bg-surface-1 text-text-muted"
                      }`}
                    >
                      {pb.enabled ? "ENABLED" : "DISABLED"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Live CEF / OCSF Feed */}
      {activeTab === "CEF_FEED" && (
        <div className="rounded-card border border-border-subtle bg-surface-1 p-5 shadow-sm">
          <span className="font-mono text-xs font-semibold text-state-enforce">
            COMMON EVENT FORMAT (CEF) &bull; OCSF 1.3 LOG EMISSION SAMPLE
          </span>
          <pre className="mt-4 overflow-x-auto rounded-input bg-canvas p-4 font-mono text-xs text-text-secondary leading-relaxed">
            {SAMPLE_CEF_RECORD}
          </pre>
        </div>
      )}
    </div>
  );
}
