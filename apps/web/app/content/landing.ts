/**
 * Axiom NHI Landing Page Copy Deck
 * Single source of truth for all public marketing, technical explanation,
 * and FAQ copy. Sourced numbers and target claims are linked to app/data/claims.ts.
 */

export interface HeroCopy {
  eyebrow: string;
  headline: string;
  subheadline: string;
  ctaPrimary: {
    label: string;
    href: string;
  };
  ctaSecondary: {
    label: string;
    command: string;
  };
  ctaTertiary: {
    label: string;
    href: string;
  };
  microProof: string[];
}

export interface GateScenario {
  id: string;
  name: string;
  tool: string;
  verdict: 'permit' | 'deny';
  badge: string;
  reason: string;
  payloadSummary: string;
  latencyDisplay: string;
  latencyKind: 'target' | 'measured' | 'simulated';
  validator: string;
  agentId?: string;
  targetResource?: string;
  cedarRule?: string;
}

export interface StoryStep {
  id: 'discover' | 'understand' | 'govern';
  stepNumber: string;
  title: string;
  tagline: string;
  description: string;
  anchor: string;
  highlightClaim?: {
    id: string;
    note: string;
  };
  keyPoints: string[];
}

export interface AudienceTab {
  id: 'security' | 'engineering';
  label: string;
  heading: string;
  summary: string;
  features: Array<{
    title: string;
    description: string;
    spec?: string;
  }>;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export const HERO_COPY: HeroCopy = {
  eyebrow: "Open-core runtime security for AI agents",
  headline: "Every AI agent is an identity. Govern what it can do in under 5 ms.",
  subheadline:
    "Axiom finds every AI agent and machine identity in your environment, maps what each one can reach, and blocks unsafe tool calls inline, before they run.",
  ctaPrimary: {
    label: "Try the playground",
    href: "/playground",
  },
  ctaSecondary: {
    label: "Install gateway",
    command: "curl -fsSL https://get.axiom.security/gateway.sh | sh",
  },
  ctaTertiary: {
    label: "Talk to an engineer",
    href: "#talk-to-engineer",
  },
  microProof: [
    "Apache-2.0 open core",
    "Reproducible benchmarks",
    "Runs in your VPC or air-gapped",
  ],
};

export const GATE_SCENARIOS: GateScenario[] = [
  {
    id: "sql-ast-drop",
    name: "SQL Injection Guard",
    tool: "postgres_query",
    verdict: "deny",
    badge: "BLOCKED · SQL AST",
    reason: "Destructive DDL verb 'DROP TABLE' blocked by AST validator",
    payloadSummary: "DROP TABLE production_customers CASCADE;",
    latencyDisplay: "< 5 ms",
    latencyKind: "target",
    validator: "Axiom AST SQL Validator",
    agentId: "autonomous-finops-agent",
    targetResource: "mcp://prod-db (PostgreSQL)",
    cedarRule: 'forbid (principal is Axiom::Agent, action == "execute_sql") when { context.sql_verb == "DROP" };',
  },
  {
    id: "ssrf-egress",
    name: "Cloud Metadata SSRF",
    tool: "http_fetch",
    verdict: "deny",
    badge: "BLOCKED · SSRF GUARD",
    reason: "Cloud metadata endpoint (169.254.169.254) egress blocked inline",
    payloadSummary: "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
    latencyDisplay: "< 5 ms",
    latencyKind: "target",
    validator: "Axiom Egress DNS & IP Firewall",
    agentId: "web-researcher-bot",
    targetResource: "http://169.254.169.254",
    cedarRule: 'forbid (principal, action, resource) when { context.dest_ip in ["169.254.169.254", "127.0.0.1"] };',
  },
  {
    id: "path-traversal",
    name: "Filesystem Sandbox",
    tool: "read_file",
    verdict: "deny",
    badge: "BLOCKED · PATH GUARD",
    reason: "Directory escape attempt outside sandbox boundary (/etc/passwd)",
    payloadSummary: "../../etc/passwd",
    latencyDisplay: "< 5 ms",
    latencyKind: "target",
    validator: "Axiom Path Sanitizer & Sandbox",
    agentId: "code-review-worker",
    targetResource: "mcp://local-filesystem",
    cedarRule: 'forbid (principal, action == "read_file") when { context.path.contains("..") || context.path.startsWith("/etc") };',
  },
  {
    id: "tool-pinning",
    name: "Cryptographic Tool Pin",
    tool: "bash_exec",
    verdict: "deny",
    badge: "BLOCKED · UNPINNED TOOL",
    reason: "SHA-256 binary hash mismatch for unapproved executable version",
    payloadSummary: "tools/call: bash_exec@v2.4.1 (expected pin: v2.4.0-hardened)",
    latencyDisplay: "< 5 ms",
    latencyKind: "target",
    validator: "Axiom Cryptographic Tool Pinning Gate",
    agentId: "devops-remediation-runner",
    targetResource: "mcp://system-bash",
    cedarRule: 'permit (principal, action, resource) when { context.tool_binary_sha256 == resource.expected_sha256 };',
  },
  {
    id: "github-read",
    name: "Scoped GitHub Read",
    tool: "github_list_pull_requests",
    verdict: "permit",
    badge: "PERMITTED · READ SCOPE",
    reason: "Agent identity matches repository read scope (repo:axiom-nhi/core:pull:read)",
    payloadSummary: "{ owner: 'axiom-nhi', repo: 'core', state: 'open' }",
    latencyDisplay: "< 5 ms",
    latencyKind: "target",
    validator: "Cedar 3.x Scoped RBAC Engine",
    agentId: "pr-summarizer-agent",
    targetResource: "mcp://github-api",
    cedarRule: 'permit (principal is Axiom::Agent, action == "pull:read", resource is Axiom::Repo);',
  },
  {
    id: "s3-audit-read",
    name: "Scoped S3 Read",
    tool: "s3_get_object",
    verdict: "permit",
    badge: "PERMITTED · AUDIT SCOPE",
    reason: "Attestation matches read-only telemetry bucket with time-bound dynamic token",
    payloadSummary: "s3://axiom-telemetry-us-east-1/audits/2026/11/report.parquet",
    latencyDisplay: "< 5 ms",
    latencyKind: "target",
    validator: "Cedar 3.x & Ephemeral Vault Broker",
    agentId: "compliance-exporter",
    targetResource: "s3://axiom-telemetry-us-east-1",
    cedarRule: 'permit (principal has spiffe_tag, action == "s3:GetObject", resource in Axiom::Bucket::"telemetry");',
  },
];

export const STORY_STEPS: StoryStep[] = [
  {
    id: "discover",
    stepNumber: "01",
    title: "Discover",
    tagline: "Find every agent in 30 minutes.",
    description:
      "A read-only scan of AWS IAM, Kubernetes, GitHub, and Slack produces a complete shadow audit of agents, human owners, tool grants, and dormant keys.",
    anchor: "#discover",
    highlightClaim: {
      id: "shadowAuditDuration",
      note: "Target shadow audit discovery scan time.",
    },
    keyPoints: [
      "Zero-privilege read-only connectors",
      "Automatic agent attribution and human sponsorship",
      "$0 discovery pledge with no seat tax",
    ],
  },
  {
    id: "understand",
    stepNumber: "02",
    title: "Understand",
    tagline: "See the blast radius before the incident.",
    description:
      "Follow any machine token or API key to every resource it can reach. Interactively simulate revocations and witness the collapse of dangerous transitive permissions in real time.",
    anchor: "#understand",
    highlightClaim: {
      id: "agentHumanRatio",
      note: "CyberArk Threat Landscape surveys estimate 45:1 to 82:1 machine-to-human identities.",
    },
    keyPoints: [
      "Transitive reachability and lineage graphs",
      "One-click simulated blast radius and credential revocation",
      "OWASP Machine Identity and MCP Top 10 exposure analysis",
    ],
  },
  {
    id: "govern",
    stepNumber: "03",
    title: "Govern",
    tagline: "Enforce intent at wire speed.",
    description:
      "Every tool call is evaluated against formal Cedar policies inline at the gateway. Fails closed on evaluator timeout, with sub-50 ms fleet-wide emergency revocation.",
    anchor: "#govern",
    highlightClaim: {
      id: "inlineLatency",
      note: "Target P99 inline authorization overhead under 5 ms.",
    },
    keyPoints: [
      "Deterministic Cedar policy engine running locally",
      "Fails closed on timeout or evaluator outage (9 of 9 chaos scenarios pass)",
      "Instant fleet kill-switch propagating in milliseconds",
    ],
  },
];

export const AUDIENCE_TABS: AudienceTab[] = [
  {
    id: "security",
    label: "For Security Leaders",
    heading: "Governance, blast-radius containment, and proof of compliance",
    summary:
      "Axiom gives CISOs, SecOps, and compliance officers continuous visibility into autonomous agent sprawl without slowing down engineering velocity.",
    features: [
      {
        title: "Autonomous Agent AI-BOM",
        description: "Continuous inventory of every model, tool, plugin, and secret accessible by enterprise agents.",
        spec: "OWASP Machine Identity & MCP Top 10",
      },
      {
        title: "Deterministic Fail-Closed Boundary",
        description: "If the policy evaluator is unreachable or exceeds the 15 ms deadline, requests are rejected by default.",
        spec: "9 of 9 Chaos Scenarios Verified",
      },
      {
        title: "Audit & SIEM Export",
        description: "Stream high-fidelity JSON-RPC audit logs directly into Splunk, Datadog, or OpenTelemetry collectors.",
        spec: "OCSF 1.1 Compliant Event Schema",
      },
      {
        title: "Fleet Emergency Halt",
        description: "A single API call or physical emergency switch drops credentials across every active gateway node.",
        spec: "Fleet Target < 50 ms",
      },
    ],
  },
  {
    id: "engineering",
    label: "For Platform & AI Engineers",
    heading: "Drop-in reverse proxy with zero agent code changes",
    summary:
      "Engineers maintain developer freedom while routing MCP and REST agent tool calls through a lightweight, high-performance gateway.",
    features: [
      {
        title: "Zero Agent Code Changes",
        description: "Simply point your MCP client or framework (LangChain, CrewAI, AutoGen) at the Axiom gateway endpoint.",
        spec: "Drop-in MCP stdio & SSE Proxy",
      },
      {
        title: "Sub-5 ms Target Overhead",
        description: "Policy evaluations compile into optimized Cedar ASTs to ensure minimal latency impact on agent loops.",
        spec: "Wire-Speed Execution Target",
      },
      {
        title: "Declarative Cedar Policies",
        description: "Write intuitive, auditable authorization rules in AWS Cedar policy syntax with full unit test fixtures.",
        spec: "Formal Cedar 3.x Verification",
      },
      {
        title: "Local Offline Execution",
        description: "Runs air-gapped in Docker, Kubernetes, or sovereign VPC enclaves with zero cloud call-homes.",
        spec: "100% Sovereign & Open Core",
      },
    ],
  },
];

export const WORKS_WITH_INTEGRATIONS = [
  { name: "Anthropic Claude", kind: "AI Model & MCP Client" },
  { name: "OpenAI ChatGPT", kind: "Function Calling & Responses" },
  { name: "Model Context Protocol", kind: "Anthropic MCP Standard" },
  { name: "GitHub", kind: "SCM & App Credentials" },
  { name: "AWS IAM & KMS", kind: "Cloud Workload Identity" },
  { name: "Kubernetes SPIRE", kind: "SPIFFE Workload Attestation" },
  { name: "Slack", kind: "Enterprise Workspace Apps" },
];

export const PRICING_COPY = {
  heading: "Predictable, fair pricing. Never a seat tax on AI.",
  subheading: "Axiom believes finding what you have should always be free.",
  formulaTitle: "Simple Capacity-Based Tiering",
  formulaEquation: "Total Cost = $0 Discovery + (Active Managed Agents × Verified Tool Call Volume)",
  freeTier: {
    title: "Discovery & Shadow Audit",
    price: "$0",
    badge: "Policy Guarantee",
    features: [
      "Unlimited read-only connector scans",
      "Full shadow AI inventory & attribution map",
      "Transitive blast radius lineage analysis",
      "OWASP NHI risk engine findings",
      "100% Free forever · No credit card required",
    ],
  },
  teamTier: {
    title: "Runtime Gateway",
    price: "Usage-Based",
    badge: "Open-Core + Cloud",
    features: [
      "Inline policy enforcement gateway",
      "Sub-5 ms Cedar rule evaluation engine",
      "Sub-50 ms fleet emergency kill switch",
      "Secretless broker & short-lived leases",
      "Full local Docker/K8s air-gap support",
    ],
  },
};

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: "vs-guardrails",
    question: "How is this different from prompt guardrails and LLM firewalls?",
    answer:
      "Prompt guardrails inspect natural language input and output for toxic text or prompt injections. They do nothing to prevent a compromised agent with an AWS key from executing `aws s3 rm --recursive`. Axiom operates at the operating system and protocol boundary: it governs actual machine tool calls, verifying cryptographic identity, syntax ASTs, egress IP ranges, and least-privilege authorizations before byte execution.",
  },
  {
    id: "fail-closed",
    question: "What happens if Axiom is down or slow?",
    answer:
      "Axiom strictly fails closed. If the policy evaluator crashes, drops a connection, or exceeds its 15 ms execution deadline, the gateway intercepts the call and returns an explicit RPC error to the agent. This guarantee is verified across 9 automated chaos scenarios in our integration test suite.",
  },
  {
    id: "open-core",
    question: "Is Axiom open source, and what is proprietary?",
    answer:
      "The core runtime gateway, the Cedar policy engine evaluator, the syntax AST validators, and the CLI are open source under the Apache-2.0 license. Enterprise modules—such as multi-tenant RBAC, enterprise SSO integrations, sovereign compliance connectors, and automated SIEM dispatchers—are available under an enterprise commercial license.",
  },
  {
    id: "air-gap",
    question: "Can Axiom run completely air-gapped?",
    answer:
      "Yes. The entire Axiom runtime—including the policy evaluator, Monaco policy studio, AST parsers, and local SQLite/PostgreSQL audit stores—runs self-contained within your VPC, private Kubernetes cluster, or on-prem hardware. It makes zero outbound network calls and requires no connection to external SaaS backends.",
  },
  {
    id: "data-storage",
    question: "What sensitive data does Axiom store?",
    answer:
      "Axiom stores zero LLM conversational context or prompt transcripts. The gateway captures only metadata required for policy evaluation: caller identity, tool identifier, sanitized parameter keys, timestamp, and verdict. Any secrets passed through the Secretless Broker are leased Ephemerally and never logged to disk.",
  },
  {
    id: "discovery-safety",
    question: "Which systems does discovery read, and is it read-only?",
    answer:
      "Discovery connects to cloud and developer environments including AWS IAM, Kubernetes RBAC, GitHub App installations, and Slack integrations. All connectors utilize strictly scoped, read-only permissions (such as `iam:List*` and `github:apps:read`). Axiom never requires write privileges for discovery.",
  },
  {
    id: "human-approvals",
    question: "How do human-in-the-loop approvals work?",
    answer:
      "When a tool call matches a Cedar policy rule requiring human elevation (e.g. production DB migrations or financial disbursements), the gateway pauses execution and sends an interactive approval request to Slack, Microsoft Teams, or PagerDuty. Execution resumes only after a signed human authorization token is verified.",
  },
  {
    id: "self-serve",
    question: "How do I try Axiom without talking to sales?",
    answer:
      "You can launch the interactive in-browser Playground right now to test real Cedar policies against synthetic attack vectors, or run our single-command Docker quickstart locally in under five minutes.",
  },
];
