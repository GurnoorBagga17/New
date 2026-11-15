// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
import { useState } from "react";

interface GraphNode {
  id: string;
  name: string;
  kind: "ai_agent" | "mcp_server" | "aws_iam_role" | "k8s_service_account" | "database" | "github_app";
  blastScore: number;
  owner: string;
  upstreamCount: number;
  downstreamCount: number;
  owaspFindings: string[];
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relation: "authenticates_with" | "invokes_mcp_tool" | "reads_secret" | "assumes_role";
  calls24h: number;
}

const NODES: GraphNode[] = [
  {
    id: "node-agent-1",
    name: "autonomous-finops-agent",
    kind: "ai_agent",
    blastScore: 14,
    owner: "FinOps Core (@sec-finops)",
    upstreamCount: 1,
    downstreamCount: 3,
    owaspFindings: ["NHI-04: Ambient Session Replay", "MCP-02: AST SQL Parameter Blindness"],
  },
  {
    id: "node-mcp-1",
    name: "aws-iam-mcp",
    kind: "mcp_server",
    blastScore: 32,
    owner: "Infra Platform (@infra-platform)",
    upstreamCount: 2,
    downstreamCount: 4,
    owaspFindings: ["NHI-01: Static Long-Lived Key", "NHI-07: Excessive Cloud IAM Permissions"],
  },
  {
    id: "node-db-1",
    name: "production-snowflake-cluster",
    kind: "database",
    blastScore: 78,
    owner: "Data Governance (@data-sec)",
    upstreamCount: 3,
    downstreamCount: 0,
    owaspFindings: ["NHI-03: PII Database Ingestion", "MCP-05: Missing Ephemeral Credential Vault"],
  },
  {
    id: "node-agent-2",
    name: "github-pr-review-bot",
    kind: "ai_agent",
    blastScore: 8,
    owner: "DevEx (@devex)",
    upstreamCount: 1,
    downstreamCount: 2,
    owaspFindings: [],
  },
  {
    id: "node-mcp-2",
    name: "github-app-mcp",
    kind: "github_app",
    blastScore: 18,
    owner: "Security Ops (@secops)",
    upstreamCount: 1,
    downstreamCount: 1,
    owaspFindings: ["NHI-02: Unbounded Repo Scope"],
  },
];

const EDGES: GraphEdge[] = [
  { id: "e1", source: "autonomous-finops-agent", target: "aws-iam-mcp", relation: "invokes_mcp_tool", calls24h: 1420 },
  { id: "e2", source: "aws-iam-mcp", target: "production-snowflake-cluster", relation: "reads_secret", calls24h: 380 },
  { id: "e3", source: "github-pr-review-bot", target: "github-app-mcp", relation: "invokes_mcp_tool", calls24h: 96 },
];

export function LineageGraphPage() {
  const [selectedNode, setSelectedNode] = useState<GraphNode>(NODES[0]!);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4">
          <p className="font-mono text-xs uppercase tracking-wider text-text-muted">Dual-Graph Nodes</p>
          <p className="mt-1 font-display text-2xl font-bold text-text-primary">{NODES.length}</p>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4">
          <p className="font-mono text-xs uppercase tracking-wider text-text-muted">Observed Causal Edges</p>
          <p className="mt-1 font-display text-2xl font-bold text-brand-cyan">{EDGES.length}</p>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4">
          <p className="font-mono text-xs uppercase tracking-wider text-text-muted">Max Target Blast Score</p>
          <p className="mt-1 font-display text-2xl font-bold text-state-deny">78 / 100</p>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4">
          <p className="font-mono text-xs uppercase tracking-wider text-text-muted">Causal DAG Traversal Latency</p>
          <p className="mt-1 font-display text-2xl font-bold text-state-enforce">1.4ms (p99)</p>
        </div>
      </div>

      {/* Main Graph Visualization & Blast Radius Inspector */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Interactive Topology DAG */}
        <div className="lg:col-span-2 rounded-card border border-border-subtle bg-surface-1 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-border-subtle pb-3">
            <div>
              <h3 className="font-display text-sm font-bold text-text-primary">Execution Lineage & Blast Radius Topology</h3>
              <p className="font-mono text-[11px] text-text-muted">Select an entity to calculate downstream blast radius.</p>
            </div>
            <span className="rounded bg-state-enforce/10 px-2 py-0.5 font-mono text-[10px] text-state-enforce border border-state-enforce/30">
              Postgres Graph Synchronized
            </span>
          </div>

          <div className="relative min-h-[380px] rounded-lg border border-border-subtle bg-surface-2/40 p-4 overflow-hidden">
            {/* Visual Node Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
              {/* Agents Column */}
              <div className="space-y-4">
                <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted block text-center">Autonomous Agents</span>
                {NODES.filter((n) => n.kind === "ai_agent").map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => setSelectedNode(node)}
                    className={`w-full text-left rounded-lg p-3 border transition ${
                      selectedNode.id === node.id
                        ? "border-brand-orange bg-surface-1 shadow-md"
                        : "border-border-subtle bg-surface-1/70 hover:border-border-strong"
                    }`}
                  >
                    <div className="font-semibold text-xs text-text-primary">{node.name}</div>
                    <div className="font-mono text-[10px] text-text-muted mt-1">Blast Score: {node.blastScore}</div>
                  </button>
                ))}
              </div>

              {/* Connectors / MCP Tools Column */}
              <div className="space-y-4">
                <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted block text-center">ExtMCP Gateways</span>
                {NODES.filter((n) => n.kind === "mcp_server" || n.kind === "github_app").map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => setSelectedNode(node)}
                    className={`w-full text-left rounded-lg p-3 border transition ${
                      selectedNode.id === node.id
                        ? "border-brand-cyan bg-surface-1 shadow-md"
                        : "border-border-subtle bg-surface-1/70 hover:border-border-strong"
                    }`}
                  >
                    <div className="font-semibold text-xs text-text-primary">{node.name}</div>
                    <div className="font-mono text-[10px] text-text-muted mt-1">Blast Score: {node.blastScore}</div>
                  </button>
                ))}
              </div>

              {/* Cloud Targets Column */}
              <div className="space-y-4">
                <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted block text-center">Crown Jewel Resources</span>
                {NODES.filter((n) => n.kind === "database").map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => setSelectedNode(node)}
                    className={`w-full text-left rounded-lg p-3 border transition ${
                      selectedNode.id === node.id
                        ? "border-state-deny bg-surface-1 shadow-md"
                        : "border-border-subtle bg-surface-1/70 hover:border-border-strong"
                    }`}
                  >
                    <div className="font-semibold text-xs text-text-primary">{node.name}</div>
                    <div className="font-mono text-[10px] text-state-deny mt-1">Blast Score: {node.blastScore}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Causal Edges List */}
            <div className="mt-8 border-t border-border-subtle pt-4">
              <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted block mb-2">Active Causal Execution Edges (Last 24h)</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {EDGES.map((edge) => (
                  <div key={edge.id} className="rounded border border-border-subtle bg-surface-1 p-2 text-[11px] font-mono">
                    <div className="text-text-primary truncate">{edge.source} &rarr; {edge.target}</div>
                    <div className="text-text-muted text-[10px]">{edge.relation} &bull; {edge.calls24h} calls</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Col: Blast Radius Inspector Card */}
        <div className="rounded-card border border-border-subtle bg-surface-1 p-5 space-y-4">
          <div className="border-b border-border-subtle pb-3">
            <h3 className="font-display text-sm font-bold text-text-primary">Blast Radius Scorecard</h3>
            <p className="font-mono text-xs text-brand-orange mt-0.5">{selectedNode.name}</p>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <span className="font-mono text-[10px] text-text-muted uppercase">Entity Classification:</span>
              <p className="font-semibold text-text-primary">{selectedNode.kind.toUpperCase()}</p>
            </div>
            <div>
              <span className="font-mono text-[10px] text-text-muted uppercase">Attributed Owner:</span>
              <p className="text-text-secondary">{selectedNode.owner}</p>
            </div>
            <div>
              <span className="font-mono text-[10px] text-text-muted uppercase">Blast Radius Metric:</span>
              <div className="flex items-center gap-2 mt-1">
                <div className="h-2 w-full rounded-full bg-surface-3 overflow-hidden">
                  <div
                    className={`h-full ${selectedNode.blastScore > 50 ? "bg-state-deny" : selectedNode.blastScore > 20 ? "bg-brand-orange" : "bg-state-enforce"}`}
                    style={{ width: `${selectedNode.blastScore}%` }}
                  />
                </div>
                <span className="font-mono font-bold text-text-primary">{selectedNode.blastScore}/100</span>
              </div>
            </div>
            <div>
              <span className="font-mono text-[10px] text-text-muted uppercase">OWASP NHI / MCP Findings:</span>
              {selectedNode.owaspFindings.length > 0 ? (
                <div className="mt-1 space-y-1">
                  {selectedNode.owaspFindings.map((finding) => (
                    <div key={finding} className="rounded bg-state-deny/10 border border-state-deny/30 p-1.5 font-mono text-[10px] text-state-deny">
                      {finding}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-state-enforce font-mono text-[11px] mt-1">&check; No active vulnerabilities detected.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
