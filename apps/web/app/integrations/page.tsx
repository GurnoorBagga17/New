// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";

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
    id: "aws-iam-sts",
    name: "AWS IAM & STS",
    category: "cloud",
    categoryLabel: "Cloud IAM & Kubernetes",
    mode: "discovery",
    modeLabel: "READ-ONLY DISCOVERY",
    latency: "Passive ($0)",
    protocol: "AWS STS AssumeRoleWithWebIdentity",
    zeroSecretGuarantee: "HMAC-SHA256 Fingerprinted Only",
    owaspControls: ["OWASP NHI3", "OWASP NHI7"],
    description: "Passive inventory of all IAM Roles, Machine Users, and cross-account Trust Policies. Calculates static blast radius at zero query cost.",
    configSnippet: `# terraform read-only discovery policy
resource "aws_iam_role" "axiom_discovery" {
  name = "AxiomNHIDiscoveryRole"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Action = "sts:AssumeRole", Effect = "Allow", Principal = { AWS = "arn:aws:iam::123456789012:role/AxiomHost" } }]
  })
}`,
  },
  {
    id: "kubernetes-spiffe",
    name: "Kubernetes (EKS / GKE / AKS)",
    category: "cloud",
    categoryLabel: "Cloud IAM & Kubernetes",
    mode: "inline",
    modeLabel: "INLINE ENFORCEMENT",
    latency: "< 1.2ms",
    protocol: "SPIFFE / SPIRE Workload Attestation",
    zeroSecretGuarantee: "Ephemeral OpenBao Lease <= 300s",
    owaspControls: ["OWASP NHI4", "OWASP NHI8"],
    description: "Attests Kubernetes Pod service accounts cryptographically using x509 SVIDs before allowing MCP tool communication.",
    configSnippet: `# helm values.yaml
spire:
  enabled: true
  trustDomain: "axiom.k8s.local"
  workloadAttestation:
    k8s_psat:
      cluster: "prod-us-east-1"`,
  },
  {
    id: "google-cloud-wif",
    name: "Google Cloud WIF",
    category: "cloud",
    categoryLabel: "Cloud IAM & Kubernetes",
    mode: "discovery",
    modeLabel: "READ-ONLY DISCOVERY",
    latency: "Passive ($0)",
    protocol: "OIDC Federation",
    zeroSecretGuarantee: "HMAC-SHA256 Fingerprinted Only",
    owaspControls: ["OWASP NHI1", "OWASP NHI3"],
    description: "Maps Google Cloud Workload Identity Pools, Service Account Keys, and IAM bindings across multi-cloud infrastructure.",
    configSnippet: `# gcp provider configuration
provider "google" {
  project = "axiom-governance-prod"
  impersonate_service_account = "axiom-auditor@axiom-governance-prod.iam.gserviceaccount.com"
}`,
  },
  {
    id: "microsoft-entra",
    name: "Microsoft Entra ID / Azure AD",
    category: "cloud",
    categoryLabel: "Cloud IAM & Kubernetes",
    mode: "discovery",
    modeLabel: "READ-ONLY DISCOVERY",
    latency: "Passive ($0)",
    protocol: "Microsoft Graph API",
    zeroSecretGuarantee: "HMAC-SHA256 Fingerprinted Only",
    owaspControls: ["OWASP NHI2", "OWASP NHI6"],
    description: "Continuous posture assessment for Enterprise App Registrations, Service Principals, and client certificates.",
    configSnippet: `# azure app registration
az ad app credential reset \\
  --id "00000000-0000-0000-0000-000000000000" \\
  --append --display-name "AxiomReadAudit"`,
  },
  {
    id: "spiffe-spire",
    name: "SPIFFE / SPIRE Attestation Engine",
    category: "cloud",
    categoryLabel: "Cloud IAM & Kubernetes",
    mode: "inline",
    modeLabel: "INLINE ENFORCEMENT",
    latency: "< 0.8ms",
    protocol: "x509 SVID Workload Attestation",
    zeroSecretGuarantee: "HMAC-SHA256 Fingerprinted Only",
    owaspControls: ["OWASP NHI4", "OWASP NHI9"],
    description: "Binary sha256 checksum and cgroup path attestation for Linux host processes before issuing ephemeral access tokens.",
    configSnippet: `# spire-agent.conf
agent {
  data_dir = "/run/spire/data"
  log_level = "INFO"
  server_address = "spire-server.internal"
  server_port = "8081"
  trust_domain = "axiom.prod"
}`,
  },
  {
    id: "github-enterprise",
    name: "GitHub Enterprise & CODEOWNERS",
    category: "code",
    categoryLabel: "Code, Git & CI/CD",
    mode: "discovery",
    modeLabel: "READ-ONLY DISCOVERY",
    latency: "Passive ($0)",
    protocol: "GitHub App REST & GraphQL",
    zeroSecretGuarantee: "HMAC-SHA256 Fingerprinted Only",
    owaspControls: ["OWASP NHI2", "OWASP NHI10"],
    description: "Extracts Human Owner attribution from CODEOWNERS files to achieve >= 0.85 owner confidence on machine identities.",
    configSnippet: `# axiom-connectors.toml
[github]
app_id = 981240
installation_id = 4591024
repositories = ["*"]
parse_codeowners = true
owner_confidence_boost = 0.85`,
  },
  {
    id: "gitlab-cicd",
    name: "GitLab CI/CD",
    category: "code",
    categoryLabel: "Code, Git & CI/CD",
    mode: "discovery",
    modeLabel: "READ-ONLY DISCOVERY",
    latency: "Passive ($0)",
    protocol: "GitLab REST API v4",
    zeroSecretGuarantee: "HMAC-SHA256 Fingerprinted Only",
    owaspControls: ["OWASP NHI3", "OWASP NHI6"],
    description: "Detects orphaned Project Access Tokens, Group Deploy Keys, and Runner registrations with unrotated credentials.",
    configSnippet: `# gitlab sync config
[gitlab]
base_url = "https://gitlab.enterprise.internal"
scan_scopes = ["deploy_keys", "project_access_tokens", "ci_variables"]
read_only = true`,
  },
  {
    id: "github-actions-oidc",
    name: "GitHub Actions OIDC",
    category: "code",
    categoryLabel: "Code, Git & CI/CD",
    mode: "inline",
    modeLabel: "INLINE ENFORCEMENT",
    latency: "< 2.9ms",
    protocol: "RFC 8707 Resource Indicators",
    zeroSecretGuarantee: "Ephemeral OpenBao Lease <= 300s",
    owaspControls: ["OWASP NHI1", "OWASP NHI4"],
    description: "Cryptographically binds GHA workflow identity tokens to exact repository refs, PR numbers, and environment scopes.",
    configSnippet: `# .github/workflows/deploy.yml
- name: Axiom Exchange
  uses: axiom-nhi/exchange-action@v1
  with:
    gateway-url: "https://gateway.axiom.internal:9090"
    role-arn: "arn:aws:iam::123456789012:role/DeployRole"`,
  },
  {
    id: "terraform-opentofu",
    name: "Terraform / OpenTofu State",
    category: "code",
    categoryLabel: "Code, Git & CI/CD",
    mode: "discovery",
    modeLabel: "READ-ONLY DISCOVERY",
    latency: "Passive ($0)",
    protocol: "S3 / GCS State Parser",
    zeroSecretGuarantee: "HMAC-SHA256 Fingerprinted Only",
    owaspControls: ["OWASP NHI5", "OWASP NHI7"],
    description: "Parses remote state files to discover non-human IAM resources before deployment, flagging unmanaged keys.",
    configSnippet: `# terraform backend reader
[terraform]
backend = "s3"
bucket = "terraform-state-prod"
prefix = "environments/us-east-1/"
region = "us-east-1"`,
  },
  {
    id: "openbao-broker",
    name: "OpenBao (MPL-2.0 Dynamic Broker)",
    category: "vault",
    categoryLabel: "Secret Vaults & Identity",
    mode: "inline",
    modeLabel: "INLINE ENFORCEMENT",
    latency: "< 1.5ms",
    protocol: "Native OpenBao REST / Transit",
    zeroSecretGuarantee: "Ephemeral OpenBao Lease <= 300s",
    owaspControls: ["OWASP NHI5", "OWASP NHI8"],
    description: "Dynamic secret engine broker running in clean container isolation. Emits disposable credentials injected at gateway egress.",
    configSnippet: `# openbao broker policy
path "database/creds/readonly-analyst" {
  capabilities = ["read"]
  min_wrapping_ttl = "60s"
  max_wrapping_ttl = "300s"
}`,
  },
  {
    id: "hashicorp-vault",
    name: "HashiCorp Vault Enterprise",
    category: "vault",
    categoryLabel: "Secret Vaults & Identity",
    mode: "inline",
    modeLabel: "INLINE ENFORCEMENT",
    latency: "< 1.9ms",
    protocol: "Vault Transit & KV v2",
    zeroSecretGuarantee: "Ephemeral OpenBao Lease <= 300s",
    owaspControls: ["OWASP NHI5", "OWASP NHI8"],
    description: "Namespace-aware dynamic credential issuance with automated revocation triggers linked to Axiom Kill Switch.",
    configSnippet: `# vault-agent.hcl
auto_auth {
  method "approle" {
    mount_path = "auth/approle"
    config = {
      role_id_file_path = "/etc/vault/role-id"
      secret_id_file_path = "/etc/vault/secret-id"
    }
  }
}`,
  },
  {
    id: "aws-secrets-manager",
    name: "AWS Secrets Manager",
    category: "vault",
    categoryLabel: "Secret Vaults & Identity",
    mode: "discovery",
    modeLabel: "READ-ONLY DISCOVERY",
    latency: "Passive ($0)",
    protocol: "AWS Secrets Manager Read",
    zeroSecretGuarantee: "HMAC-SHA256 Fingerprinted Only",
    owaspControls: ["OWASP NHI3", "OWASP NHI5"],
    description: "Scans secret metadata, rotation intervals, and consumer resource ARNs without reading secret string contents.",
    configSnippet: `# iam read metadata only
Statement = [{
  Effect = "Allow"
  Action = ["secretsmanager:ListSecrets", "secretsmanager:DescribeSecret"]
  Resource = "*"
}]`,
  },
  {
    id: "okta-workforce",
    name: "Okta Workforce & OIDC",
    category: "vault",
    categoryLabel: "Secret Vaults & Identity",
    mode: "discovery",
    modeLabel: "READ-ONLY DISCOVERY",
    latency: "Passive ($0)",
    protocol: "OIDC / OAuth 2.0 PKCE",
    zeroSecretGuarantee: "HMAC-SHA256 Fingerprinted Only",
    owaspControls: ["OWASP NHI2", "OWASP NHI6"],
    description: "Federates human operator sessions with machine identity ownership graphs for instant audit attribution.",
    configSnippet: `# okta oidc configuration
[auth.oidc]
issuer = "https://company.okta.com"
client_id = "0oa98214klz0192"
redirect_uri = "https://axiomnhi.dev/api/auth/oidc/callback"`,
  },
  {
    id: "spicedb-graph",
    name: "SpiceDB Delegation Graph",
    category: "vault",
    categoryLabel: "Secret Vaults & Identity",
    mode: "inline",
    modeLabel: "INLINE ENFORCEMENT",
    latency: "< 0.9ms",
    protocol: "gRPC ContextSync / Zanzibar",
    zeroSecretGuarantee: "HMAC-SHA256 Fingerprinted Only",
    owaspControls: ["OWASP NHI4", "OWASP NHI9"],
    description: "Sub-millisecond Zanzibar graph checks ('Can Agent X invoke Tool Y under Delegation Z right now?').",
    configSnippet: `# schema.zed
definition user {}
definition agent {
  relation owner: user
  relation delegate: agent
  permission invoke_tool = owner + delegate->invoke_tool
}`,
  },
  {
    id: "splunk-hec",
    name: "Splunk HEC (OCSF / CEF)",
    category: "siem",
    categoryLabel: "SIEM, SOAR & Ticketing",
    mode: "inline",
    modeLabel: "INLINE ENFORCEMENT",
    latency: "< 1.1ms",
    protocol: "OCSF v1.3 JSON over TLS",
    zeroSecretGuarantee: "HMAC-SHA256 Fingerprinted Only",
    owaspControls: ["OWASP NHI6", "OWASP NHI10"],
    description: "Asynchronous zero-loss audit log streaming to Splunk HTTP Event Collector with pre-enqueue HMAC secret scrubbing.",
    configSnippet: `# splunk_hec.conf
[audit.splunk]
hec_url = "https://splunk-hec.corp:8088/services/collector/raw"
channel = "axiom-audit-stream"
schema_version = "ocsf-1.3.0"
batch_size = 500`,
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
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeModalConnector, setActiveModalConnector] = useState<Connector | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState<boolean>(false);

  const filteredConnectors = useMemo(() => {
    return CONNECTORS.filter((c) => {
      const matchesCategory =
        selectedCategory === "all" || c.category === selectedCategory;
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
      {/* Header Banner */}
      <div className="max-w-7xl mx-auto text-center mb-12">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200/80 text-blue-700 text-xs font-semibold uppercase tracking-wider mb-4">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" />
            <path d="m4.93 4.93 4.24 4.24M14.83 9.17l4.24-4.24M14.83 14.83l4.24 4.24M9.17 14.83l-4.24 4.24" />
          </svg>
          24 Certified Connectors
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight font-sans">
          Integrate Axiom NHI with Your Entire Stack
        </h1>
        <p className="mt-4 text-base sm:text-lg text-slate-600 max-w-3xl mx-auto leading-relaxed">
          Zero-risk passive discovery meets inline pre-execution tool gating. Connect your AI agent runtimes, cloud workload IAM, codebases, secret vaults, and SIEM pipelines in minutes.
        </p>

        {/* Highlight Stats Bar */}
        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <span className="text-2xl font-black text-slate-900 font-mono">24</span>
            <p className="text-xs text-slate-500 font-medium mt-1">Ecosystem Connectors</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <span className="text-2xl font-black text-emerald-600 font-mono">&lt; 5ms</span>
            <p className="text-xs text-slate-500 font-medium mt-1">Inline Wire Latency</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <span className="text-2xl font-black text-sky-600 font-mono">$0</span>
            <p className="text-xs text-slate-500 font-medium mt-1">Passive Discovery Cost</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
            <span className="text-2xl font-black text-indigo-600 font-mono">0</span>
            <p className="text-xs text-slate-500 font-medium mt-1">Raw Secrets Stored</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto">
        {/* Search & Category Filter */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 mb-8 shadow-xs">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative flex-1">
              <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, protocol (e.g. CIMD, SPIFFE, OCSF), or OWASP control..."
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-900 placeholder-slate-400 transition-all"
              />
            </div>

            {/* Mode Legend */}
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

          {/* Category Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pt-4 mt-4 border-t border-slate-100 scrollbar-none">
            {[
              { id: "all", label: "All (24)" },
              { id: "mcp", label: "MCP & AI Agent Runtimes (6)" },
              { id: "cloud", label: "Cloud IAM & Kubernetes (5)" },
              { id: "code", label: "Code, Git & CI/CD (4)" },
              { id: "vault", label: "Secret Vaults & Identity (5)" },
              { id: "siem", label: "SIEM, SOAR & Ticketing (4)" },
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

        {/* 24-Connector Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredConnectors.map((c) => (
            <div
              key={c.id}
              className="bg-white border border-slate-200/90 hover:border-slate-300 rounded-2xl p-6 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
            >
              <div>
                {/* Top Badge & Category */}
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

                {/* Connector Title */}
                <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                  {c.name}
                </h3>

                {/* Description */}
                <p className="mt-2 text-xs text-slate-600 leading-relaxed min-h-[48px]">
                  {c.description}
                </p>

                {/* Protocol Pill */}
                <div className="mt-3.5 flex items-center gap-2 text-[11px] font-mono text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5">
                  <span className="text-slate-400">Protocol:</span>
                  <span className="font-semibold text-slate-700">{c.protocol}</span>
                </div>

                {/* Zero-Secret Guarantee Pill */}
                <div className="mt-2 flex items-center gap-1.5 text-[10.5px] font-medium text-emerald-700 bg-emerald-50/70 border border-emerald-100 rounded-md px-2 py-1">
                  <svg className="w-3 h-3 text-emerald-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  <span>{c.zeroSecretGuarantee}</span>
                </div>

                {/* OWASP Tags */}
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

              {/* Bottom Action: Open Configuration Snippet */}
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

      {/* Config Preview Modal */}
      {activeModalConnector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
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

            {/* Modal Body */}
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

              {/* Code Box */}
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

            {/* Modal Footer */}
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
