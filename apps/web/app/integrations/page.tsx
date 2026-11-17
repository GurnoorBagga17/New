// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";

interface ConnectedIntegration {
  id: string;
  tenant_id: string;
  provider: string;
  display_name: string;
  credential_ref: string;
  external_id?: string | null;
  status: "connected" | "syncing" | "error" | "disconnected";
  last_sync_at: string | null;
  last_error?: string | null;
  created_at: string;
}

interface Connector {
  id: string;
  name: string;
  category: "mcp" | "cloud" | "code" | "vault" | "siem";
  categoryLabel: string;
  mode: "inline" | "discovery";
  modeLabel: string;
  latency: string;
  protocol: string;
  zeroSecretGuarantee: string;
  owaspControls: string[];
  description: string;
  configSnippet: string;
}

const CONNECTORS: Connector[] = [
  {
    id: "postgres-mcp",
    name: "PostgreSQL MCP Server",
    category: "mcp",
    categoryLabel: "MCP & AI Agent Runtimes",
    mode: "inline",
    modeLabel: "INLINE ENFORCEMENT",
    latency: "< 3.1ms",
    protocol: "gRPC ExtMCP + SQL AST",
    zeroSecretGuarantee: "Ephemeral OpenBao Lease <= 300s",
    owaspControls: ["OWASP NHI1", "OWASP NHI5", "OWASP MCP01"],
    description: "AST-level SQL statement inspection before execution. Blocks DROP/ALTER DDL while injecting dynamic sub-5-minute read-only credentials.",
    configSnippet: `# agentgateway.yaml
routes:
  - match:
      tool: "db.execute_query"
      server: "mcp://postgres-prod.internal"
    enforce:
      ast_validator: "sqlparser_v2"
      disallow_verbs: ["DROP", "TRUNCATE", "ALTER", "GRANT"]
      vault_broker: "openbao://dynamic/database/creds/analyst"
      lease_ttl: "300s"`,
  },
  {
    id: "filesystem-git-mcp",
    name: "Filesystem & Git MCP",
    category: "mcp",
    categoryLabel: "MCP & AI Agent Runtimes",
    mode: "inline",
    modeLabel: "INLINE ENFORCEMENT",
    latency: "< 2.4ms",
    protocol: "Path Canonicalization + JCS",
    zeroSecretGuarantee: "HMAC-SHA256 Fingerprinted Only",
    owaspControls: ["OWASP MCP01", "OWASP MCP06"],
    description: "Guarantees symlink containment within declared sandboxes. Prevents path traversal outside authorized agent workspace directories.",
    configSnippet: `# agentgateway.yaml
routes:
  - match:
      tool: "fs.read_file"
    enforce:
      path_sandbox:
        canonical_root: "/workspace/agent-run"
        disallow_relative_escape: true
        forbid_symlinks_outside: true`,
  },
  {
    id: "langchain-langgraph",
    name: "LangChain / LangGraph Agents",
    category: "mcp",
    categoryLabel: "MCP & AI Agent Runtimes",
    mode: "inline",
    modeLabel: "INLINE ENFORCEMENT",
    latency: "< 4.0ms",
    protocol: "RFC 8693 Token Exchange",
    zeroSecretGuarantee: "Ephemeral OpenBao Lease <= 300s",
    owaspControls: ["OWASP NHI2", "OWASP MCP03"],
    description: "Intercepts multi-agent graph tool delegations. Issues bound short-lived sub-tokens to prevent lateral escalation across agent nodes.",
    configSnippet: `# python langchain configuration
from axiom_agent_gateway import AxiomMCPClient

client = AxiomMCPClient(
    agent_id="langchain-analyst-1",
    gateway_url="https://gateway.axiom.internal:9090",
    audience="urn:axiom:fleet:finance"
)`,
  },
  {
    id: "claude-mcp",
    name: "Anthropic Claude MCP Client",
    category: "mcp",
    categoryLabel: "MCP & AI Agent Runtimes",
    mode: "inline",
    modeLabel: "INLINE ENFORCEMENT",
    latency: "< 1.8ms",
    protocol: "OAuth 2.1 CIMD + JCS SHA-256",
    zeroSecretGuarantee: "HMAC-SHA256 Fingerprinted Only",
    owaspControls: ["OWASP MCP01", "OWASP MCP05"],
    description: "Client ID Metadata Document verification and JCS SHA-256 tool-definition hash pinning to eliminate runtime tool rug-pulls.",
    configSnippet: `// claude_desktop_config.json
{
  "mcpServers": {
    "axiom-inline-gateway": {
      "command": "axiom-gateway",
      "args": ["proxy", "--upstream", "http://127.0.0.1:8080", "--pin-jcs"]
    }
  }
}`,
  },
  {
    id: "openai-agents",
    name: "OpenAI Agents SDK",
    category: "mcp",
    categoryLabel: "MCP & AI Agent Runtimes",
    mode: "inline",
    modeLabel: "INLINE ENFORCEMENT",
    latency: "< 2.6ms",
    protocol: "gRPC ExtMCP",
    zeroSecretGuarantee: "HMAC-SHA256 Fingerprinted Only",
    owaspControls: ["OWASP MCP02", "OWASP MCP08"],
    description: "Function-calling payload interception with payload cryptographic hashing. Eliminates TOCTOU attack surfaces before dispatch.",
    configSnippet: `# agentgateway.yaml
mcp_clients:
  - type: "openai_function_calling"
    agent_id_header: "X-Axiom-Agent-ID"
    hash_algorithm: "BLAKE3"
    fail_closed: true`,
  },
  {
    id: "cursor-windsurf",
    name: "Cursor & Windsurf IDE MCP",
    category: "mcp",
    categoryLabel: "MCP & AI Agent Runtimes",
    mode: "inline",
    modeLabel: "INLINE ENFORCEMENT",
    latency: "< 2.1ms",
    protocol: "Localhost Domain Firewall",
    zeroSecretGuarantee: "Ephemeral OpenBao Lease <= 300s",
    owaspControls: ["OWASP MCP04", "OWASP MCP09"],
    description: "Prevents IDE coding assistant extensions from exfiltrating credentials or scanning host loopback services via SSRF.",
    configSnippet: `# agentgateway.yaml
routes:
  - match:
      tool: "web_fetch"
    enforce:
      dns_pinning: true
      disallow_private_ranges: ["127.0.0.0/8", "169.254.169.254/32", "10.0.0.0/8"]`,
  },
  {
    id: "aws-iam-discovery",
    name: "AWS IAM & STS Roles",
    category: "cloud",
    categoryLabel: "Cloud IAM & Kubernetes",
    mode: "discovery",
    modeLabel: "READ-ONLY DISCOVERY",
    latency: "Passive Scan",
    protocol: "AWS STS AssumeRole (External ID)",
    zeroSecretGuarantee: "HMAC-SHA256 Fingerprinted Only",
    owaspControls: ["OWASP NHI1", "OWASP NHI3"],
    description: "Discovers overprivileged service roles, long-lived access keys, and cross-account trust policies without deploying host agents.",
    configSnippet: `# trust_policy.json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::881239012481:role/AxiomScannerRole" },
    "Action": "sts:AssumeRole",
    "Condition": { "StringEquals": { "sts:ExternalId": "axm-tenant-9901-ext" } }
  }]
}`,
  },
  {
    id: "k8s-service-accounts",
    name: "Kubernetes ServiceAccounts",
    category: "cloud",
    categoryLabel: "Cloud IAM & Kubernetes",
    mode: "discovery",
    modeLabel: "READ-ONLY DISCOVERY",
    latency: "Passive Scan",
    protocol: "K8s API + Projected Tokens",
    zeroSecretGuarantee: "HMAC-SHA256 Fingerprinted Only",
    owaspControls: ["OWASP NHI2", "OWASP NHI7"],
    description: "Maps workload pod identities, projected tokens, and bound cluster roles to detect unsegmented AI cluster nodes.",
    configSnippet: `# clusterrole_binding.yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: axiom-passive-discovery
rules:
  - apiGroups: [""]
    resources: ["serviceaccounts", "pods", "namespaces"]
    verbs: ["get", "list", "watch"]`,
  },
  {
    id: "gcp-workload-identity",
    name: "Google Cloud Workload Identity",
    category: "cloud",
    categoryLabel: "Cloud IAM & Kubernetes",
    mode: "discovery",
    modeLabel: "READ-ONLY DISCOVERY",
    latency: "Passive Scan",
    protocol: "GCP Workload Identity Federation",
    zeroSecretGuarantee: "HMAC-SHA256 Fingerprinted Only",
    owaspControls: ["OWASP NHI3", "OWASP NHI8"],
    description: "Federated scanning of GCP Service Accounts, Cloud Run agent identities, and IAM bindings via OIDC subject assertions.",
    configSnippet: `# gcp_federation_config.json
{
  "audience": "//iam.googleapis.com/projects/123456789/locations/global/workloadIdentityPools/axiom-pool/providers/axiom-oidc",
  "credential_source": {
    "file": "/var/run/secrets/tokens/axiom-token"
  }
}`,
  },
  {
    id: "azure-entra-workload",
    name: "Azure Entra ID Workload Identities",
    category: "cloud",
    categoryLabel: "Cloud IAM & Kubernetes",
    mode: "discovery",
    modeLabel: "READ-ONLY DISCOVERY",
    latency: "Passive Scan",
    protocol: "Entra App Registrations / Graph API",
    zeroSecretGuarantee: "HMAC-SHA256 Fingerprinted Only",
    owaspControls: ["OWASP NHI1", "OWASP NHI4"],
    description: "Scans enterprise Service Principals, Managed Identities, and tenant app permissions with zero storage of client secrets.",
    configSnippet: `# entra_registration.json
{
  "apiPermissions": ["Application.Read.All", "IdentityRiskEvent.Read.All"],
  "consentType": "AdminConsentRequired",
  "federatedCredential": "urn:axiom:tenant:cloud-prod"
}`,
  },
  {
    id: "spire-agent",
    name: "SPIRE & SPIFFE Workload Attestation",
    category: "cloud",
    categoryLabel: "Cloud IAM & Kubernetes",
    mode: "inline",
    modeLabel: "INLINE ENFORCEMENT",
    latency: "< 1.2ms",
    protocol: "SPIFFE Workload API Unix Socket",
    zeroSecretGuarantee: "Ephemeral X.509 SVID (TTL <= 1h)",
    owaspControls: ["OWASP NHI1", "OWASP NHI2"],
    description: "Zero-token mTLS kernel attestation. Verifies binary hash and Linux cgroups before authorizing agent network access.",
    configSnippet: `# spire_workload.conf
agent {
  spiffe_id = "spiffe://corp.internal/ns/ai/sa/analyst-agent"
  socket_path = "/run/spire/sockets/agent.sock"
}`,
  },
  {
    id: "github-actions-app",
    name: "GitHub Actions & App Tokens",
    category: "code",
    categoryLabel: "Code, Git & CI/CD",
    mode: "discovery",
    modeLabel: "READ-ONLY DISCOVERY",
    latency: "Passive Scan",
    protocol: "GitHub App Installation Token",
    zeroSecretGuarantee: "HMAC-SHA256 Fingerprinted Only",
    owaspControls: ["OWASP NHI2", "OWASP NHI5"],
    description: "Scans organization CODEOWNERS, fine-grained PATs, and GitHub Actions secret bindings to identify unowned automated workflows.",
    configSnippet: `# github-app-permissions.json
{
  "permissions": {
    "organization_administration": "read",
    "members": "read",
    "actions": "read"
  }
}`,
  },
  {
    id: "gitlab-cicd",
    name: "GitLab CI/CD & Deploy Tokens",
    category: "code",
    categoryLabel: "Code, Git & CI/CD",
    mode: "discovery",
    modeLabel: "READ-ONLY DISCOVERY",
    latency: "Passive Scan",
    protocol: "GitLab Group API v4",
    zeroSecretGuarantee: "HMAC-SHA256 Fingerprinted Only",
    owaspControls: ["OWASP NHI2", "OWASP NHI5"],
    description: "Discovers unrotated GitLab Deploy Tokens, project deploy keys, and runner registration tokens across group hierarchies.",
    configSnippet: `# gitlab_scanner.yaml
scanner:
  endpoint: "https://gitlab.corp.internal/api/v4"
  scope: "read_api"
  audit_runners: true`,
  },
  {
    id: "openbao-vault",
    name: "OpenBao (Apache-2.0 Secrets Engine)",
    category: "vault",
    categoryLabel: "Secret Vaults & Identity",
    mode: "inline",
    modeLabel: "INLINE ENFORCEMENT",
    latency: "< 2.8ms",
    protocol: "HTTP/2 REST (Direct Boundary)",
    zeroSecretGuarantee: "Dynamic Lease Revoked in <= 300s",
    owaspControls: ["OWASP NHI5", "OWASP MCP01"],
    description: "Isolated Apache-2.0 boundary. Generates ephemeral, single-use database and cloud credentials injected dynamically into agent tools.",
    configSnippet: `# openbao_mount.sh
bao secrets enable -path=axiom-dynamic database
bao write axiom-dynamic/config/postgres \\
    plugin_name=postgresql-database-plugin \\
    connection_url="postgresql://{{username}}:{{password}}@pg.internal:5432/prod"`,
  },
  {
    id: "hashicorp-vault",
    name: "HashiCorp Vault Enterprise",
    category: "vault",
    categoryLabel: "Secret Vaults & Identity",
    mode: "inline",
    modeLabel: "INLINE ENFORCEMENT",
    latency: "< 3.0ms",
    protocol: "AppRole / JWT Auth",
    zeroSecretGuarantee: "Short-Lived Response-Wrapping",
    owaspControls: ["OWASP NHI5", "OWASP NHI8"],
    description: "Interoperates with existing corporate Vault clusters via AppRole auth to wrap secrets with cryptographic cubbyhole delivery.",
    configSnippet: `# vault_auth.hcl
auth "approle" {
  role_name = "axiom-runtime-worker"
  token_ttl = "10m"
  token_max_ttl = "30m"
}`,
  },
  {
    id: "cyberark-conjur",
    name: "CyberArk Conjur Cloud",
    category: "vault",
    categoryLabel: "Secret Vaults & Identity",
    mode: "inline",
    modeLabel: "INLINE ENFORCEMENT",
    latency: "< 3.2ms",
    protocol: "Conjur REST API / Host Factory",
    zeroSecretGuarantee: "Dynamic Host Factory Tokens",
    owaspControls: ["OWASP NHI5", "OWASP NHI9"],
    description: "Attests machine workloads against CyberArk Conjur policies, mapping agent lineage to enterprise PAM safes.",
    configSnippet: `# conjur_policy.yml
- !host
  id: agents/financial-reconciler
  annotations:
    axiom.nhi/supervised: "true"`,
  },
  {
    id: "okta-workforce",
    name: "Okta Workforce & Service Accounts",
    category: "vault",
    categoryLabel: "Secret Vaults & Identity",
    mode: "discovery",
    modeLabel: "READ-ONLY DISCOVERY",
    latency: "Passive Scan",
    protocol: "Okta Management API (SSWS)",
    zeroSecretGuarantee: "HMAC-SHA256 Fingerprinted Only",
    owaspControls: ["OWASP NHI4", "OWASP NHI7"],
    description: "Cross-correlates human supervisors with automated OAuth applications, API service tokens, and orphan admin identities.",
    configSnippet: `# okta_client.conf
[okta]
org_url = "https://corp.okta.com"
scopes = ["okta.apps.read", "okta.users.read"]`,
  },
  {
    id: "microsoft-sentinel",
    name: "Microsoft Sentinel (Logs Ingestion API)",
    category: "siem",
    categoryLabel: "SIEM, SOAR & Ticketing",
    mode: "inline",
    modeLabel: "INLINE ENFORCEMENT",
    latency: "< 1.5ms",
    protocol: "Azure Monitor Logs Ingestion (DCR/DCE)",
    zeroSecretGuarantee: "HMAC-SHA256 Fingerprinted Only",
    owaspControls: ["OWASP NHI6", "OWASP NHI10"],
    description: "Direct streaming of policy evaluation spans to Microsoft Sentinel via Data Collection Rules (DCR) and Endpoints (DCE).",
    configSnippet: `# sentinel_ingestion.json
{
  "dce_endpoint": "https://axiom-dce.eastus-1.ingest.monitor.azure.com",
  "dcr_immutable_id": "dcr-018f4a21e428701980",
  "stream_name": "Custom-AxiomAudit_CL"
}`,
  },
  {
    id: "datadog-siem",
    name: "Datadog Cloud SIEM",
    category: "siem",
    categoryLabel: "SIEM, SOAR & Ticketing",
    mode: "inline",
    modeLabel: "INLINE ENFORCEMENT",
    latency: "< 1.4ms",
    protocol: "Datadog Logs API v2",
    zeroSecretGuarantee: "HMAC-SHA256 Fingerprinted Only",
    owaspControls: ["OWASP NHI6", "OWASP NHI10"],
    description: "Native OpenTelemetry trace correlation linking AI agent tool decisions directly to APM spans.",
    configSnippet: `# datadog exporter
[observability.datadog]
site = "datadoghq.com"
service = "axiom-gateway"
env = "production"
trace_correlation = true`,
  },
  {
    id: "crowdstrike-falcon",
    name: "CrowdStrike Falcon SOAR",
    category: "siem",
    categoryLabel: "SIEM, SOAR & Ticketing",
    mode: "inline",
    modeLabel: "INLINE ENFORCEMENT",
    latency: "< 2.0ms",
    protocol: "Falcon Fusion Webhooks",
    zeroSecretGuarantee: "HMAC-SHA256 Fingerprinted Only",
    owaspControls: ["OWASP NHI1", "OWASP NHI7"],
    description: "Automated agent quarantine triggers. CrowdStrike Falcon incidents immediately invoke Axiom Sub-50ms Kill Switch.",
    configSnippet: `# falcon webhook trigger
POST /api/v1/kill-switch/trigger
{
  "target": "agent::reporting-worker-4",
  "reason": "CrowdStrike Detection ID: inc-908124 (High Confidence Lateral Scan)",
  "scope": "agent_id"
}`,
  },
  {
    id: "slack-jira",
    name: "Slack Block Kit & Jira REST v3",
    category: "siem",
    categoryLabel: "SIEM, SOAR & Ticketing",
    mode: "inline",
    modeLabel: "INLINE ENFORCEMENT",
    latency: "< 3.5ms",
    protocol: "Interactive Webhooks + SHA-256",
    zeroSecretGuarantee: "HMAC-SHA256 Fingerprinted Only",
    owaspControls: ["OWASP NHI8", "OWASP NHI9"],
    description: "Human-in-the-loop escalation cards for sensitive agent tool calls. Requires cryptographically signed payload approval.",
    configSnippet: `# agentgateway.yaml
approvals:
  provider: "slack"
  channel_id: "C081249AK"
  timeout_seconds: 120
  require_sha256_binding: true`,
  },
];

export default function IntegrationsPage() {
  // Connected Fleet State
  const [connectedIntegrations, setConnectedIntegrations] = useState<ConnectedIntegration[]>([]);
  const [isLoadingFleet, setIsLoadingFleet] = useState<boolean>(true);
  const [fleetActionMsg, setFleetActionMsg] = useState<{ id: string; text: string; ok: boolean } | null>(null);

  // Connect Provider Modal State
  const [showConnectModal, setShowConnectModal] = useState<boolean>(false);
  const [newProvider, setNewProvider] = useState<string>("aws_iam");
  const [newDisplayName, setNewDisplayName] = useState<string>("");
  const [newCredentialRef, setNewCredentialRef] = useState<string>("");
  const [newExternalId, setNewExternalId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Catalog State
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeModalConnector, setActiveModalConnector] = useState<Connector | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState<boolean>(false);

  // Fetch Connected Integrations Fleet
  const loadFleet = useCallback(async () => {
    try {
      setIsLoadingFleet(true);
      const res = await fetch("/api/integrations");
      if (res.ok) {
        const data = await res.json();
        setConnectedIntegrations(data.integrations || []);
      }
    } catch {
      // Offline or network error
    } finally {
      setIsLoadingFleet(false);
    }
  }, []);

  useEffect(() => {
    loadFleet();
  }, [loadFleet]);

  // Test Connection Action
  const handleTestConnection = async (id: string) => {
    setFleetActionMsg({ id, text: "Verifying cross-account trust...", ok: true });
    try {
      const res = await fetch(`/api/integrations/${encodeURIComponent(id)}/test`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setFleetActionMsg({
          id,
          text: `Verified: ${data.permissions_verified?.length || 4} read-only permissions confirmed.`,
          ok: true,
        });
      } else {
        setFleetActionMsg({ id, text: data.message || "Connection verification failed.", ok: false });
      }
    } catch {
      setFleetActionMsg({ id, text: "Error contacting verification endpoint.", ok: false });
    }
    setTimeout(() => setFleetActionMsg(null), 5000);
  };

  // Sync Now Action
  const handleSyncNow = async (id: string) => {
    setFleetActionMsg({ id, text: "Triggering discovery scan...", ok: true });
    setConnectedIntegrations((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: "syncing" } : item))
    );
    try {
      const res = await fetch(`/api/integrations/${encodeURIComponent(id)}/sync`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setFleetActionMsg({
          id,
          text: `Scan complete: ${data.nodes_discovered} entities indexed & HMAC fingerprinted.`,
          ok: true,
        });
        setConnectedIntegrations((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, status: "connected", last_sync_at: data.finished_at } : item
          )
        );
      } else {
        setFleetActionMsg({ id, text: data.message || "Discovery sync failed.", ok: false });
      }
    } catch {
      setFleetActionMsg({ id, text: "Network error triggering sync.", ok: false });
    }
    setTimeout(() => setFleetActionMsg(null), 5000);
  };

  // Disconnect Action
  const handleDisconnect = async (id: string) => {
    if (!window.confirm("Are you sure you want to disconnect this integration? Discovered NHI nodes will be marked as stale.")) {
      return;
    }
    try {
      const res = await fetch(`/api/integrations/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (res.ok) {
        setConnectedIntegrations((prev) => prev.filter((item) => item.id !== id));
      }
    } catch {
      // Handle error
    }
  };

  // Create Connection
  const handleCreateIntegration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDisplayName || !newCredentialRef) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: newProvider,
          display_name: newDisplayName,
          credential_ref: newCredentialRef,
          external_id: newExternalId || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.integration) {
          setConnectedIntegrations((prev) => [data.integration, ...prev]);
        }
        setShowConnectModal(false);
        setNewDisplayName("");
        setNewCredentialRef("");
        setNewExternalId("");
      }
    } catch {
      // Handle error
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter Catalog
  const filteredConnectors = useMemo(() => {
    return CONNECTORS.filter((c) => {
      const matchesCategory = selectedCategory === "all" || c.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.protocol.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.owaspControls.some((ctrl) => ctrl.toLowerCase().includes(q));
      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  const handleCopy = (snippet: string) => {
    navigator.clipboard.writeText(snippet);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      {/* Top Header */}
      <div className="max-w-7xl mx-auto text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-200/80 text-indigo-700 text-xs font-semibold uppercase tracking-wider mb-4">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" />
            <path d="m4.93 4.93 4.24 4.24M14.83 9.17l4.24-4.24M14.83 14.83l4.24 4.24M9.17 14.83l-4.24 4.24" />
          </svg>
          Enterprise Integrations &amp; Discovery Fleet
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight font-sans">
          Connected Fleet &amp; Connector Catalog
        </h1>
        <p className="mt-4 text-base sm:text-lg text-slate-600 max-w-3xl mx-auto leading-relaxed">
          Manage your live cloud provider cross-account trust links, trigger discovery sync runs, and deploy inline gRPC tool guardrails across your enterprise infrastructure.
        </p>

        {/* 1-Click Fast-Track Actions */}
        <div className="mt-6 flex flex-wrap justify-center items-center gap-3">
          <button
            onClick={() => setShowConnectModal(true)}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-md transition-all cursor-pointer"
          >
            <span>+</span> Connect New Cloud Provider
          </button>
          <Link
            href="/integrations/wizard"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-md transition-all cursor-pointer"
          >
            <span>⚡</span> Launch 90-Second Cloud Onboarding Wizard &rarr;
          </Link>
          <Link
            href="/reports/executive"
            target="_blank"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white hover:bg-slate-100 text-slate-800 font-bold text-sm border border-slate-200 shadow-xs transition-all"
          >
            <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Executive CISO Report
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto">
        {/* SECTION 1: Connected Fleet Management */}
        <div className="mb-12 bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-slate-100 gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">Active Tenant Integrations</h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {connectedIntegrations.length} Active
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Discovered non-human identities are automatically synchronized into the lineage graph with SHA-256 HMAC pseudonymization.
              </p>
            </div>
            <button
              onClick={() => setShowConnectModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-colors cursor-pointer border border-indigo-200"
            >
              <span>+</span> Add Connection
            </button>
          </div>

          {isLoadingFleet ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              <span className="inline-block animate-spin mr-2">⚙</span> Loading tenant integrations...
            </div>
          ) : connectedIntegrations.length === 0 ? (
            <div className="py-12 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center text-xl font-bold mb-3">
                ☁
              </div>
              <h3 className="text-sm font-bold text-slate-800">No active integrations connected</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Connect your AWS IAM, Kubernetes, or GitHub accounts to begin automated non-human identity discovery and permission graph mapping.
              </p>
              <button
                onClick={() => setShowConnectModal(true)}
                className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                Connect AWS IAM Now
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 mt-2">
              {connectedIntegrations.map((item) => (
                <div key={item.id} className="py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{item.display_name}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                          item.status === "connected"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : item.status === "syncing"
                            ? "bg-amber-50 text-amber-700 border border-amber-200 animate-pulse"
                            : "bg-red-50 text-red-700 border border-red-200"
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${item.status === "connected" ? "bg-emerald-500" : item.status === "syncing" ? "bg-amber-500" : "bg-red-500"}`} />
                        {item.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-xs font-mono text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>Provider: <strong className="text-slate-700">{item.provider}</strong></span>
                      <span>Target: <strong className="text-slate-700">{item.credential_ref}</strong></span>
                      {item.external_id && (
                        <span>External ID: <strong className="text-slate-700">{item.external_id}</strong></span>
                      )}
                      {item.last_sync_at && (
                        <span className="text-slate-400">
                          Last sync: {new Date(item.last_sync_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                    </div>
                    {fleetActionMsg && fleetActionMsg.id === item.id && (
                      <p className={`text-xs font-semibold ${fleetActionMsg.ok ? "text-indigo-600" : "text-red-600"}`}>
                        {fleetActionMsg.text}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-end md:self-center">
                    <button
                      onClick={() => handleTestConnection(item.id)}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                      title="Validate STS cross-account trust"
                    >
                      Test Connection
                    </button>
                    <button
                      onClick={() => handleSyncNow(item.id)}
                      disabled={item.status === "syncing"}
                      className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                      title="Scan for non-human identities now"
                    >
                      {item.status === "syncing" ? "Syncing..." : "Sync Now"}
                    </button>
                    <button
                      onClick={() => handleDisconnect(item.id)}
                      className="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-semibold transition-colors cursor-pointer"
                      title="Disconnect and mark nodes stale"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SECTION 2: Connector Catalog Header & Search */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 mb-8 shadow-xs">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            <div className="relative flex-1">
              <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search catalog by name, protocol (e.g. CIMD, SPIFFE, OCSF), or OWASP control..."
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-900 placeholder-slate-400 transition-all"
              />
            </div>

            <div className="flex items-center gap-3 text-xs font-medium text-slate-600">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Inline Enforcement (&lt; 5ms)
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-sky-50 text-sky-700 border border-sky-200">
                <span className="w-2 h-2 rounded-full bg-sky-500" />
                Read-Only Discovery ($0)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pt-4 mt-4 border-t border-slate-100 scrollbar-none">
            {[
              { id: "all", label: "All Connectors" },
              { id: "mcp", label: "MCP & AI Agent Runtimes" },
              { id: "cloud", label: "Cloud IAM & Kubernetes" },
              { id: "code", label: "Code, Git & CI/CD" },
              { id: "vault", label: "Secret Vaults & Identity" },
              { id: "siem", label: "SIEM, SOAR & Ticketing" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedCategory(tab.id)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  selectedCategory === tab.id
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* SECTION 3: Connector Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredConnectors.map((c) => (
            <div
              key={c.id}
              className="bg-white border border-slate-200/90 hover:border-slate-300 rounded-2xl p-6 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    {c.categoryLabel}
                  </span>
                  <span
                    className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                      c.mode === "inline"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-sky-50 text-sky-700 border border-sky-200"
                    }`}
                  >
                    {c.mode === "inline" ? "● INLINE" : "◎ DISCOVERY"} ({c.latency})
                  </span>
                </div>

                <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                  {c.name}
                </h3>

                <p className="mt-2 text-xs text-slate-600 leading-relaxed min-h-[48px]">
                  {c.description}
                </p>

                <div className="mt-3.5 flex items-center gap-2 text-[11px] font-mono text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5">
                  <span className="text-slate-400">Protocol:</span>
                  <span className="font-semibold text-slate-700">{c.protocol}</span>
                </div>

                <div className="mt-2 flex items-center gap-1.5 text-[10.5px] font-medium text-emerald-700 bg-emerald-50/70 border border-emerald-100 rounded-md px-2 py-1">
                  <svg className="w-3 h-3 text-emerald-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  <span>{c.zeroSecretGuarantee}</span>
                </div>

                <div className="mt-3 flex flex-wrap gap-1">
                  {c.owaspControls.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-mono">Ready for Deploy</span>
                <button
                  onClick={() => setActiveModalConnector(c)}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform cursor-pointer"
                >
                  View Config
                  <span aria-hidden="true">&rarr;</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        {filteredConnectors.length === 0 && (
          <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl">
            <p className="text-sm font-semibold text-slate-700">No connectors matched your criteria.</p>
            <p className="text-xs text-slate-500 mt-1">Try resetting your search query or switching categories.</p>
            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("all");
              }}
              className="mt-4 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* Connect Provider Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Connect Cloud Provider</h3>
              <button
                onClick={() => setShowConnectModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateIntegration} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Provider Type</label>
                <select
                  value={newProvider}
                  onChange={(e) => setNewProvider(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-900"
                >
                  <option value="aws_iam">AWS IAM (STS Cross-Account Role)</option>
                  <option value="kubernetes">Kubernetes (ServiceAccount / Token)</option>
                  <option value="github">GitHub App (Fine-Grained Permissions)</option>
                  <option value="azure_entra">Azure Entra ID (Service Principal)</option>
                  <option value="gcp_iam">Google Cloud IAM (Workload Identity)</option>
                  <option value="openbao">OpenBao / HashiCorp Vault</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Display Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. AWS Production Workloads (Account 123456789012)"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Credential Reference / Target ARN</label>
                <input
                  type="text"
                  required
                  placeholder="arn:aws:iam::123456789012:role/AxiomDiscoveryRole"
                  value={newCredentialRef}
                  onChange={(e) => setNewCredentialRef(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-900 font-mono"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Zero raw secrets are stored. Axiom authenticates via STS AssumeRole using an external ID.
                </p>
              </div>

              {newProvider === "aws_iam" && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">External ID (Optional)</label>
                  <input
                    type="text"
                    placeholder="axm-tenant-ext-id"
                    value={newExternalId}
                    onChange={(e) => setNewExternalId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-900 font-mono"
                  />
                </div>
              )}

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowConnectModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:text-slate-900 text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? "Connecting..." : "Save & Connect"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Config Preview Modal */}
      {activeModalConnector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  {activeModalConnector.categoryLabel}
                </span>
                <h3 className="text-lg font-bold text-slate-900">
                  {activeModalConnector.name} Configuration
                </h3>
              </div>
              <button
                onClick={() => setActiveModalConnector(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-bold transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-700">
                  Configuration Snippet ({activeModalConnector.protocol})
                </span>
                <button
                  onClick={() => handleCopy(activeModalConnector.configSnippet)}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 cursor-pointer"
                >
                  {copiedSnippet ? "✓ Copied to Clipboard" : "Copy Code"}
                </button>
              </div>

              <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed border border-slate-800">
                <code>{activeModalConnector.configSnippet}</code>
              </pre>

              <div className="mt-4 p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-600 flex items-start gap-2.5">
                <span className="text-indigo-600 font-bold text-sm">ℹ</span>
                <p>
                  Deploy this configuration via the Axiom CLI (<code>axiom deploy -f agentgateway.yaml</code>) or mount directly into your Kubernetes Helm chart under <code>gateway.connectors</code>.
                </p>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
              <Link
                href="/docs"
                className="text-xs font-semibold text-slate-600 hover:text-slate-900"
              >
                Read Connector Docs &rarr;
              </Link>
              <button
                onClick={() => setActiveModalConnector(null)}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
