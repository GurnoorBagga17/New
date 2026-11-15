// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
import { useState } from "react";

interface ClusterDeployment {
  id: string;
  name: string;
  environment: "PRODUCTION" | "STAGING" | "AIR_GAPPED_ONPREM";
  region: string;
  helmRelease: string;
  helmVersion: string;
  replicas: { desired: number; ready: number; available: number };
  envoySidecars: number;
  airGapped: boolean;
  canarySplitPercent: number;
  status: "HEALTHY" | "CANARY_ROLLOUT" | "DEGRADED";
  p99LatencyMs: number;
  lastDeployed: string;
}

const INITIAL_CLUSTERS: ClusterDeployment[] = [
  {
    id: "cluster-eks-prod",
    name: "aws-us-east-1-prod-eks",
    environment: "PRODUCTION",
    region: "us-east-1",
    helmRelease: "axiom-gateway-prod",
    helmVersion: "v1.4.2",
    replicas: { desired: 8, ready: 8, available: 8 },
    envoySidecars: 48,
    airGapped: false,
    canarySplitPercent: 10,
    status: "CANARY_ROLLOUT",
    p99LatencyMs: 3.4,
    lastDeployed: "42m ago",
  },
  {
    id: "cluster-gke-eu",
    name: "gcp-europe-west1-prod-gke",
    environment: "PRODUCTION",
    region: "europe-west1",
    helmRelease: "axiom-gateway-eu",
    helmVersion: "v1.4.1",
    replicas: { desired: 6, ready: 6, available: 6 },
    envoySidecars: 32,
    airGapped: false,
    canarySplitPercent: 0,
    status: "HEALTHY",
    p99LatencyMs: 2.8,
    lastDeployed: "3d ago",
  },
  {
    id: "cluster-baremetal-airgap",
    name: "onprem-chicago-colo-01 (Air-Gapped)",
    environment: "AIR_GAPPED_ONPREM",
    region: "chicago-dc2",
    helmRelease: "axiom-airgap-isolated",
    helmVersion: "v1.4.2",
    replicas: { desired: 4, ready: 4, available: 4 },
    envoySidecars: 16,
    airGapped: true,
    canarySplitPercent: 0,
    status: "HEALTHY",
    p99LatencyMs: 1.1,
    lastDeployed: "6h ago",
  },
];

export function DeploymentsPage() {
  const [clusters, setClusters] = useState<ClusterDeployment[]>(INITIAL_CLUSTERS);
  const [selectedCluster, setSelectedCluster] = useState<ClusterDeployment>(INITIAL_CLUSTERS[0]!);
  const [activeTab, setActiveTab] = useState<"TOPOLOGY" | "HELM_VALUES" | "AIRGAP_AUDIT">("TOPOLOGY");
  const [canarySlider, setCanarySlider] = useState<number>(10);

  const handlePromoteCanary = (clusterId: string) => {
    setClusters((prev) =>
      prev.map((c) =>
        c.id === clusterId
          ? { ...c, canarySplitPercent: 0, helmVersion: "v1.4.2", status: "HEALTHY" }
          : c
      )
    );
    alert("Canary 100% promoted across production cluster.");
  };

  const handleRollback = (clusterId: string) => {
    setClusters((prev) =>
      prev.map((c) =>
        c.id === clusterId
          ? { ...c, canarySplitPercent: 0, helmVersion: "v1.4.1", status: "HEALTHY" }
          : c
      )
    );
    alert("Rollback executed. Target routed back to stable release.");
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-border-subtle pb-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-brand-orange">
              OPERATIONS &bull; PRODUCTION RUNTIME TOPOLOGY
            </span>
            <span className="inline-flex items-center rounded-full border border-state-enforce/30 bg-state-enforce-tint px-2 py-0.5 font-mono text-[10px] text-state-enforce">
              MODULE: deployments
            </span>
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-text-primary">
            Deployments &amp; Air-Gap Operations
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Multi-cluster Helm chart orchestration, isolated air-gapped bare metal validation, and automated canary gate rollouts.
          </p>
        </div>

        {/* Tab switchers */}
        <div className="flex rounded-input border border-border-subtle bg-surface-1 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("TOPOLOGY")}
            className={`rounded px-3 py-1.5 font-mono text-xs transition ${
              activeTab === "TOPOLOGY"
                ? "bg-surface-2 font-semibold text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            Cluster Topology ({clusters.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("HELM_VALUES")}
            className={`rounded px-3 py-1.5 font-mono text-xs transition ${
              activeTab === "HELM_VALUES"
                ? "bg-surface-2 font-semibold text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            Helm Chart Spec
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("AIRGAP_AUDIT")}
            className={`rounded px-3 py-1.5 font-mono text-xs transition ${
              activeTab === "AIRGAP_AUDIT"
                ? "bg-surface-2 font-semibold text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            Air-Gap Zero-Egress Status
          </button>
        </div>
      </div>

      {/* Cluster Metrics */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-text-muted">Managed Clusters</p>
          <p className="mt-2 font-display text-2xl font-bold text-text-primary">{clusters.length}</p>
          <p className="mt-1 text-xs text-text-muted">AWS, GCP &amp; Bare Metal On-Prem</p>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-state-enforce">Envoy Proxy Sidecars</p>
          <p className="mt-2 font-display text-2xl font-bold text-state-enforce">
            {clusters.reduce((acc, c) => acc + c.envoySidecars, 0)} Active
          </p>
          <p className="mt-1 text-xs text-text-muted">Injecting wire-speed Cedar guardrails</p>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-brand-orange">Air-Gapped Enclaves</p>
          <p className="mt-2 font-display text-2xl font-bold text-brand-orange">1 Isolated</p>
          <p className="mt-1 text-xs text-text-muted">0 Egress connections permitted</p>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-text-muted">Fleet P99 Latency</p>
          <p className="mt-2 font-display text-2xl font-bold text-text-primary">2.4ms</p>
          <p className="mt-1 text-xs text-state-enforce">&check; Well under 5.0ms SLA target</p>
        </div>
      </div>

      {/* Tab 1: Topology Table & Cluster Inspector */}
      {activeTab === "TOPOLOGY" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-8">
            <div className="overflow-hidden rounded-card border border-border-subtle bg-surface-1">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border-subtle bg-surface-2 font-mono uppercase text-text-muted">
                  <tr>
                    <th className="p-3">Cluster &bull; Region</th>
                    <th className="p-3">Release &bull; Version</th>
                    <th className="p-3">Replicas &bull; Sidecars</th>
                    <th className="p-3">Canary Split</th>
                    <th className="p-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {clusters.map((c) => {
                    const isSelected = selectedCluster.id === c.id;
                    return (
                      <tr
                        key={c.id}
                        onClick={() => setSelectedCluster(c)}
                        className={`cursor-pointer transition hover:bg-surface-2/60 ${
                          isSelected ? "bg-surface-2" : ""
                        }`}
                      >
                        <td className="p-3">
                          <div className="font-mono font-semibold text-text-primary">{c.name}</div>
                          <div className="font-mono text-[10px] text-text-muted">
                            {c.region} &bull; {c.environment}
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="font-mono text-text-primary">{c.helmRelease}</span>
                          <span className="ml-2 rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-brand-orange">
                            {c.helmVersion}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="font-mono text-text-primary">
                            {c.replicas.ready}/{c.replicas.desired} Pods Ready
                          </div>
                          <div className="font-mono text-[10px] text-text-muted">
                            {c.envoySidecars} Envoy Proxies
                          </div>
                        </td>
                        <td className="p-3">
                          {c.canarySplitPercent > 0 ? (
                            <div className="inline-flex items-center gap-1 rounded bg-state-pending-tint px-2 py-0.5 font-mono text-[10px] font-semibold text-state-pending">
                              <span className="size-1.5 rounded-full bg-state-pending animate-pulse" />
                              {c.canarySplitPercent}% CANARY
                            </div>
                          ) : (
                            <span className="font-mono text-[10px] text-text-muted">100% STABLE</span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <span
                            className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                              c.status === "HEALTHY"
                                ? "bg-state-enforce-tint text-state-enforce"
                                : "bg-state-pending-tint text-state-pending"
                            }`}
                          >
                            {c.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cluster Inspector & Canary Controls */}
          <div className="space-y-4 lg:col-span-4">
            <div className="rounded-card border border-border-subtle bg-surface-1 p-5 shadow-sm">
              <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-muted">
                DEPLOYMENT CONTROLLER
              </span>
              <h2 className="mt-2 font-display text-lg font-bold text-text-primary">
                {selectedCluster.name}
              </h2>

              <div className="mt-4 space-y-3 divide-y divide-border-subtle text-xs">
                <div className="pt-2">
                  <p className="font-mono uppercase text-text-muted">Environment Type</p>
                  <p className="mt-1 font-mono text-text-primary">
                    {selectedCluster.environment} {selectedCluster.airGapped && "(ISOLATED AIR-GAP)"}
                  </p>
                </div>
                <div className="pt-2">
                  <p className="font-mono uppercase text-text-muted">P99 Wire Latency</p>
                  <p className="mt-1 font-mono text-sm font-bold text-state-enforce">
                    {selectedCluster.p99LatencyMs} ms
                  </p>
                </div>
                <div className="pt-2">
                  <p className="font-mono uppercase text-text-muted">Canary Traffic Weight</p>
                  <div className="mt-2 space-y-2">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={canarySlider}
                      onChange={(e) => setCanarySlider(Number(e.target.value))}
                      className="w-full accent-brand-orange"
                    />
                    <div className="flex justify-between font-mono text-xs text-text-muted">
                      <span>Stable: {100 - canarySlider}%</span>
                      <span className="font-bold text-brand-orange">Canary: {canarySlider}%</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => handlePromoteCanary(selectedCluster.id)}
                  className="w-full rounded-input border border-state-enforce/40 bg-state-enforce-tint py-2 font-mono text-xs font-semibold text-state-enforce transition hover:bg-state-enforce hover:text-white"
                >
                  Promote Canary (100% Release)
                </button>
                <button
                  type="button"
                  onClick={() => handleRollback(selectedCluster.id)}
                  className="w-full rounded-input border border-state-deny/40 bg-state-deny-tint py-2 font-mono text-xs font-semibold text-state-deny transition hover:bg-state-deny hover:text-white"
                >
                  Emergency Rollback to v1.4.1
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Helm Values */}
      {activeTab === "HELM_VALUES" && (
        <div className="rounded-card border border-border-subtle bg-surface-1 p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-border-subtle pb-3">
            <span className="font-mono text-xs font-semibold text-brand-orange">
              deployments/helm/axiom-nhi/values.yaml
            </span>
            <span className="font-mono text-xs text-text-muted">Production Values Profile</span>
          </div>
          <pre className="mt-4 overflow-x-auto rounded-input bg-canvas p-4 font-mono text-xs text-text-secondary leading-relaxed">
{`gateway:
  replicaCount: 8
  image:
    repository: ghcr.io/axiom-nhi/agentgateway
    tag: v1.4.2
    pullPolicy: IfNotPresent
  resources:
    limits:
      cpu: 4000m
      memory: 4Gi
    requests:
      cpu: 1000m
      memory: 1Gi
  env:
    - name: AXIOM_RUNTIME_MODE
      value: "enforce"
    - name: AXIOM_POLICY_BUNDLE_PATH
      value: "/etc/axiom/policies/cedar.bundle"
    - name: OPENBAO_VAULT_ADDR
      value: "http://openbao-vault.internal:8200"
    - name: SPIFFE_TRUST_DOMAIN
      value: "axiom.internal"
  airgap:
    enabled: false
    ocspOfflineCacheTtlSeconds: 86400`}
          </pre>
        </div>
      )}

      {/* Tab 3: Air-Gap Audit */}
      {activeTab === "AIRGAP_AUDIT" && (
        <div className="space-y-4">
          <div className="rounded-card border border-border-subtle bg-surface-1 p-5 shadow-sm">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-state-enforce">
              AIR-GAP COMPLIANCE VERIFICATION
            </span>
            <h2 className="mt-1 font-display text-lg font-bold text-text-primary">
              Strict Isolated On-Premises Guardrails
            </h2>
            <p className="mt-1 text-xs text-text-secondary">
              Axiom Gateway running in air-gap mode functions with zero outbound internet connectivity. All CRLs, OCSP responses, JWKS public keys, and Cedar policy bundles are validated from local offline bundles.
            </p>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-card border border-border-subtle bg-surface-2 p-4">
                <span className="font-mono text-xs text-text-muted">CRL / OCSP OFFLINE CACHE</span>
                <p className="mt-2 font-mono text-sm font-bold text-state-enforce">&check; 100% CACHED</p>
                <p className="mt-1 text-xs text-text-muted">Valid for next 18 hours</p>
              </div>
              <div className="rounded-card border border-border-subtle bg-surface-2 p-4">
                <span className="font-mono text-xs text-text-muted">OUTBOUND EGRESS ATTEMPTS</span>
                <p className="mt-2 font-mono text-sm font-bold text-state-enforce">0 BLOCKED (0 LEAKS)</p>
                <p className="mt-1 text-xs text-text-muted">Calico eBPF zero-egress policy active</p>
              </div>
              <div className="rounded-card border border-border-subtle bg-surface-2 p-4">
                <span className="font-mono text-xs text-text-muted">LOCAL CEDAR ENGINE</span>
                <p className="mt-2 font-mono text-sm font-bold text-state-enforce">&check; IN-MEMORY DETERMINISTIC</p>
                <p className="mt-1 text-xs text-text-muted">Wire-speed 0.8ms local evaluation</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
