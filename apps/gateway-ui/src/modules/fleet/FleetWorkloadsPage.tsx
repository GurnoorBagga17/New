// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
import { useState } from "react";

interface FleetAgent {
  id: string;
  name: string;
  framework: "LangGraph" | "Claude Desktop" | "AutoGen" | "CrewAI" | "K8s Microservice";
  spiffeId: string;
  attestation: string;
  ownerTeam: string;
  leaseTtlSecs: number;
  blastRadius: number;
  status: "ACTIVE" | "QUARANTINED" | "EXPIRED";
  mcpServers: string[];
  scrubberRules: string[];
}

const INITIAL_AGENTS: FleetAgent[] = [
  {
    id: "agent-01",
    name: "autonomous-finops-agent",
    framework: "LangGraph",
    spiffeId: "spiffe://axiom.internal/ns/prod/sa/autonomous-finops-agent",
    attestation: "AWS Nitro Enclave (PCR0: 9f8e...3a1b)",
    ownerTeam: "FinOps Core (@sec-finops)",
    leaseTtlSecs: 248,
    blastRadius: 14,
    status: "ACTIVE",
    mcpServers: ["aws-iam-mcp", "snowflake-lake-mcp"],
    scrubberRules: ["AWS_SECRET_KEY", "STRIPE_LIVE_KEY", "PII_SSN"],
  },
  {
    id: "agent-02",
    name: "github-pr-review-bot",
    framework: "Claude Desktop",
    spiffeId: "spiffe://axiom.internal/ns/ci/sa/github-pr-review-bot",
    attestation: "Hardware TPM 2.0 Attested",
    ownerTeam: "Developer Experience (@devex)",
    leaseTtlSecs: 89,
    blastRadius: 6,
    status: "ACTIVE",
    mcpServers: ["github-mcp", "jira-mcp"],
    scrubberRules: ["GITHUB_PAT", "BEARER_TOKEN"],
  },
  {
    id: "agent-03",
    name: "k8s-auto-remediation-worker",
    framework: "AutoGen",
    spiffeId: "spiffe://axiom.internal/ns/ops/sa/k8s-auto-remediation-worker",
    attestation: "SPIFFE X.509 SVID + eBPF Verified",
    ownerTeam: "SRE Reliability (@sre-team)",
    leaseTtlSecs: 412,
    blastRadius: 28,
    status: "ACTIVE",
    mcpServers: ["kubernetes-mcp", "datadog-mcp"],
    scrubberRules: ["KUBE_CONFIG", "VAULT_TOKEN"],
  },
  {
    id: "agent-04",
    name: "bi-reporting-collector",
    framework: "CrewAI",
    spiffeId: "spiffe://axiom.internal/ns/analytics/sa/bi-reporting-collector",
    attestation: "Cloud HSM Ed25519 PoP",
    ownerTeam: "Data Analytics (@data-eng)",
    leaseTtlSecs: 0,
    blastRadius: 19,
    status: "EXPIRED",
    mcpServers: ["postgres-mcp", "slack-mcp"],
    scrubberRules: ["DB_PASSWORD", "PRIVATE_KEY"],
  },
  {
    id: "agent-05",
    name: "unauthorized-shadow-agent",
    framework: "LangGraph",
    spiffeId: "spiffe://axiom.internal/ns/dev/sa/unauthorized-shadow-agent",
    attestation: "Unverified / Self-Signed",
    ownerTeam: "Unowned (Shadow NHI)",
    leaseTtlSecs: 0,
    blastRadius: 42,
    status: "QUARANTINED",
    mcpServers: ["production-db-mcp"],
    scrubberRules: ["ALL_SECRETS"],
  },
];

export function FleetWorkloadsPage() {
  const [agents, setAgents] = useState<FleetAgent[]>(INITIAL_AGENTS);
  const [filterFramework, setFilterFramework] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");
  const [selectedAgent, setSelectedAgent] = useState<FleetAgent | null>(null);

  const filtered = agents.filter((a) => {
    if (filterFramework !== "ALL" && a.framework !== filterFramework) return false;
    if (search && !a.name.toLowerCase().includes(search.toLowerCase()) && !a.spiffeId.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const toggleQuarantine = (id: string) => {
    setAgents((prev) =>
      prev.map((a) => {
        if (a.id === id) {
          const newStatus = a.status === "QUARANTINED" ? "ACTIVE" : "QUARANTINED";
          return { ...a, status: newStatus };
        }
        return a;
      }),
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div><p className="font-mono text-[10px] uppercase tracking-wider text-brand-cyan">SAMPLE INVENTORY</p><h1 className="mt-1 font-display text-2xl font-bold text-text-primary">Fleet workloads</h1><p className="mt-1 text-xs text-text-secondary">Review sample workload ownership, attestation, and reachability fields.</p></div>
        <span className="rounded-full border border-brand-cyan/40 bg-brand-cyan/5 px-3 py-1 font-mono text-[9px] text-brand-cyan">SYNTHETIC FIXTURES</span>
      </div>
      {/* Top Banner Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4">
          <p className="font-mono text-xs uppercase tracking-wider text-text-muted">Identities · sample</p>
          <p className="mt-1 font-display text-2xl font-bold text-text-primary">
            {agents.filter((a) => a.status === "ACTIVE").length} <span className="text-sm font-normal text-text-secondary">/ {agents.length}</span>
          </p>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4">
          <p className="font-mono text-xs uppercase tracking-wider text-text-muted">Active · fixture state</p>
          <p className="mt-1 font-display text-2xl font-bold text-state-enforce">
            {agents.filter((a) => a.attestation.includes("Nitro") || a.attestation.includes("TPM")).length}
          </p>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4">
          <p className="font-mono text-xs uppercase tracking-wider text-text-muted">Quarantined / Shadow</p>
          <p className="mt-1 font-display text-2xl font-bold text-state-deny">
            {agents.filter((a) => a.status === "QUARANTINED").length}
          </p>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4">
          <p className="font-mono text-xs uppercase tracking-wider text-text-muted">Avg Blast Radius</p>
          <p className="mt-1 font-display text-2xl font-bold text-brand-orange">
            {Math.round(agents.reduce((acc, a) => acc + a.blastRadius, 0) / agents.length)} / 100
          </p>
        </div>
      </div>
      <p className="text-[11px] text-text-muted">Inventory rows are design fixtures. Connector scans and owner attribution are not live in this preview; row controls change only local sample state.</p>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border-subtle bg-surface-1 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs uppercase text-text-muted">Framework:</span>
          {["ALL", "LangGraph", "Claude Desktop", "AutoGen", "CrewAI"].map((fw) => (
            <button
              key={fw}
              type="button"
              onClick={() => setFilterFramework(fw)}
              className={`rounded-input px-2.5 py-1 text-xs font-semibold transition ${filterFramework === fw ? "bg-brand-orange text-bg-canvas" : "bg-surface-2 text-text-secondary hover:text-text-primary"}`}
            >
              {fw}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter agent or SPIFFE ID..."
          className="rounded-input border border-border-subtle bg-surface-2 px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-brand-orange focus:outline-none"
        />
      </div>

      {/* Agents Table */}
      <div className="overflow-x-auto rounded-card border border-border-subtle bg-surface-1 shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border-subtle bg-surface-2/60 font-mono text-[11px] uppercase tracking-wider text-text-muted">
            <tr>
              <th className="py-3 pl-4 pr-3">Autonomous Agent</th>
              <th className="px-3 py-3">Attestation & Identity</th>
              <th className="px-3 py-3">Team Attribution</th>
              <th className="px-3 py-3">TTL Lease</th>
              <th className="px-3 py-3">Blast Radius</th>
              <th className="px-3 py-3">Status</th>
              <th className="py-3 pl-3 pr-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {filtered.map((agent) => (
              <tr key={agent.id} className="hover:bg-surface-2/40 transition">
                <td className="py-3 pl-4 pr-3">
                  <div className="font-semibold text-text-primary">{agent.name}</div>
                  <div className="font-mono text-[10px] text-text-muted">{agent.framework} &bull; {agent.mcpServers.join(", ")}</div>
                </td>
                <td className="px-3 py-3">
                  <div className="font-mono text-[11px] text-text-secondary truncate max-w-xs">{agent.spiffeId}</div>
                  <div className="text-[10px] text-brand-cyan">{agent.attestation}</div>
                </td>
                <td className="px-3 py-3">
                  <span className="text-text-secondary">{agent.ownerTeam}</span>
                </td>
                <td className="px-3 py-3 font-mono">
                  {agent.leaseTtlSecs > 0 ? (
                    <span className="text-state-enforce">{agent.leaseTtlSecs}s</span>
                  ) : (
                    <span className="text-text-muted">Expired</span>
                  )}
                </td>
                <td className="px-3 py-3 font-mono">
                  <span className={`font-semibold ${agent.blastRadius > 25 ? "text-state-deny" : agent.blastRadius > 10 ? "text-brand-orange" : "text-state-enforce"}`}>
                    {agent.blastRadius}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      agent.status === "ACTIVE"
                        ? "bg-state-enforce/15 text-state-enforce border border-state-enforce/30"
                        : agent.status === "QUARANTINED"
                        ? "bg-state-deny/15 text-state-deny border border-state-deny/30"
                        : "bg-surface-3 text-text-muted border border-border-subtle"
                    }`}
                  >
                    {agent.status}
                  </span>
                </td>
                <td className="py-3 pl-3 pr-4 text-right">
                  <div className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedAgent(agent)}
                      className="rounded border border-border-subtle bg-surface-2 px-2 py-1 text-[11px] font-semibold text-text-secondary hover:text-text-primary"
                    >
                      Details
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleQuarantine(agent.id)}
                      className={`rounded px-2 py-1 text-[11px] font-semibold transition ${
                        agent.status === "QUARANTINED"
                          ? "bg-state-enforce/20 text-state-enforce hover:bg-state-enforce/30"
                          : "bg-state-deny/20 text-state-deny hover:bg-state-deny/30"
                      }`}
                    >
                      {agent.status === "QUARANTINED" ? "Unquarantine" : "Quarantine"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Selected Agent Modal */}
      {selectedAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl rounded-card border border-border-subtle bg-surface-1 p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-text-primary">{selectedAgent.name}</h3>
                <p className="font-mono text-xs text-text-muted">{selectedAgent.spiffeId}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAgent(null)}
                className="text-text-muted hover:text-text-primary text-sm font-bold"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="font-mono text-text-muted uppercase">Framework Architecture:</span>
                <p className="text-text-primary font-semibold">{selectedAgent.framework} with Cedar Guard Boundary</p>
              </div>
              <div>
                <span className="font-mono text-text-muted uppercase">Hardware Enclave Proof:</span>
                <p className="font-mono text-brand-cyan">{selectedAgent.attestation}</p>
              </div>
              <div>
                <span className="font-mono text-text-muted uppercase">Active AST Parameter Scrubbers:</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {selectedAgent.scrubberRules.map((rule) => (
                    <span key={rule} className="rounded bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-text-secondary border border-border-subtle">
                      {rule}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <span className="font-mono text-text-muted uppercase">Connected MCP Servers:</span>
                <p className="font-mono text-text-primary">{selectedAgent.mcpServers.join(", ")}</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-border-subtle">
              <button
                type="button"
                onClick={() => setSelectedAgent(null)}
                className="rounded-input border border-border-subtle px-3 py-1.5 text-xs font-semibold text-text-secondary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
