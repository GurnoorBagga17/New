// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
import { useState } from "react";

interface Connector {
  id: string;
  name: string;
  kind: "AWS IAM" | "Kubernetes" | "GitHub App" | "Slack Bot" | "Postgres" | "Snowflake";
  apiScope: string;
  entitiesDiscovered: number;
  lastSyncAgo: string;
  status: "ONLINE" | "SYNCING" | "IDLE";
  zeroSecretVerified: boolean;
}

const INITIAL_CONNECTORS: Connector[] = [
  {
    id: "conn-aws",
    name: "Production AWS Multi-Account",
    kind: "AWS IAM",
    apiScope: "IAMReadOnlyAccess (Zero-Secret)",
    entitiesDiscovered: 184,
    lastSyncAgo: "4m ago",
    status: "ONLINE",
    zeroSecretVerified: true,
  },
  {
    id: "conn-k8s",
    name: "EKS Cluster us-east-1",
    kind: "Kubernetes",
    apiScope: "metadata get/list/watch",
    entitiesDiscovered: 92,
    lastSyncAgo: "2m ago",
    status: "ONLINE",
    zeroSecretVerified: true,
  },
  {
    id: "conn-github",
    name: "Enterprise GitHub Org",
    kind: "GitHub App",
    apiScope: "Metadata read-only",
    entitiesDiscovered: 41,
    lastSyncAgo: "12m ago",
    status: "ONLINE",
    zeroSecretVerified: true,
  },
  {
    id: "conn-slack",
    name: "Corporate Slack Workspace",
    kind: "Slack Bot",
    apiScope: "bots:read, channels:read",
    entitiesDiscovered: 15,
    lastSyncAgo: "18m ago",
    status: "ONLINE",
    zeroSecretVerified: true,
  },
  {
    id: "conn-pg",
    name: "PostgreSQL Ledger Cluster",
    kind: "Postgres",
    apiScope: "information_schema read",
    entitiesDiscovered: 28,
    lastSyncAgo: "22m ago",
    status: "IDLE",
    zeroSecretVerified: true,
  },
  {
    id: "conn-snowflake",
    name: "Snowflake Enterprise Lakehouse",
    kind: "Snowflake",
    apiScope: "ACCOUNTADMIN metadata view",
    entitiesDiscovered: 63,
    lastSyncAgo: "8m ago",
    status: "ONLINE",
    zeroSecretVerified: true,
  },
];

export function ConnectorsPage() {
  const [connectors, setConnectors] = useState<Connector[]>(INITIAL_CONNECTORS);
  const [isScanning, setIsScanning] = useState(false);

  const triggerScan = () => {
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      setConnectors((prev) =>
        prev.map((c) => ({
          ...c,
          lastSyncAgo: "Just now",
          entitiesDiscovered: c.entitiesDiscovered + Math.floor(Math.random() * 3),
        })),
      );
    }, 1200);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4">
          <p className="font-mono text-xs uppercase tracking-wider text-text-muted">Configured Connectors</p>
          <p className="mt-1 font-display text-2xl font-bold text-text-primary">{connectors.length}</p>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4">
          <p className="font-mono text-xs uppercase tracking-wider text-text-muted">Total Discovered NHIs</p>
          <p className="mt-1 font-display text-2xl font-bold text-brand-cyan">
            {connectors.reduce((acc, c) => acc + c.entitiesDiscovered, 0)}
          </p>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4">
          <p className="font-mono text-xs uppercase tracking-wider text-text-muted">Zero-Secret Invariant</p>
          <p className="mt-1 font-display text-2xl font-bold text-state-enforce">HMAC-SHA256 Pinned</p>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4">
          <p className="font-mono text-xs uppercase tracking-wider text-text-muted">Discovery Engine Cost</p>
          <p className="mt-1 font-display text-2xl font-bold text-state-enforce">$0.00 Forever</p>
        </div>
      </div>

      {/* Connectors Table & Actions */}
      <div className="rounded-card border border-border-subtle bg-surface-1 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3">
          <div>
            <h3 className="font-display text-sm font-bold text-text-primary">Non-Human Identity Discovery Connectors</h3>
            <p className="font-mono text-[11px] text-text-muted">
              Passive, strictly read-only connectors scanning cloud providers, SaaS platforms, and internal clusters.
            </p>
          </div>
          <button
            type="button"
            disabled={isScanning}
            onClick={triggerScan}
            className="rounded bg-brand-orange px-3.5 py-1.5 text-xs font-bold text-bg-canvas hover:bg-brand-orange/90 transition shadow-sm"
          >
            {isScanning ? "Scanning Fleet..." : "Trigger Discovery Scan &rarr;"}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border-subtle bg-surface-2/60 font-mono text-[11px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="py-3 pl-4 pr-3">Connector Name</th>
                <th className="px-3 py-3">Platform Kind</th>
                <th className="px-3 py-3">Read-Only Scope</th>
                <th className="px-3 py-3">Discovered Identities</th>
                <th className="px-3 py-3">Last Sync</th>
                <th className="px-3 py-3">Zero-Secret Status</th>
                <th className="py-3 pl-3 pr-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {connectors.map((c) => (
                <tr key={c.id} className="hover:bg-surface-2/40 transition">
                  <td className="py-3 pl-4 pr-3 font-semibold text-text-primary">{c.name}</td>
                  <td className="px-3 py-3">
                    <span className="rounded bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-text-secondary border border-border-subtle">
                      {c.kind}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-mono text-[11px] text-text-secondary">{c.apiScope}</td>
                  <td className="px-3 py-3 font-mono font-bold text-text-primary">{c.entitiesDiscovered}</td>
                  <td className="px-3 py-3 font-mono text-text-muted">{c.lastSyncAgo}</td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] text-state-enforce">
                      &check; HMAC Fingerprint Only
                    </span>
                  </td>
                  <td className="py-3 pl-3 pr-4 text-right">
                    <span className="inline-flex items-center rounded-full bg-state-enforce/15 border border-state-enforce/30 px-2 py-0.5 font-mono text-[10px] font-bold text-state-enforce">
                      {c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
