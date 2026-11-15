import React, { useState, useEffect, useMemo } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Activity,
  Lock,
  Unlock,
  Key,
  Terminal,
  FileCode,
  Play,
  Pause,
  Zap,
  AlertOctagon,
  Search,
  Filter,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  Cpu,
  Database,
  Cloud,
  Bot,
  GitBranch,
  RefreshCw,
  Eye,
  EyeOff,
  Sliders,
  ChevronRight,
  Copy,
  Check,
  Sparkles,
  Layers,
  Server,
  Globe,
  FileText,
  BarChart3,
  Clock,
  Flame,
  Radio,
  ExternalLink
} from 'lucide-react';

// ============================================================================
// DESIGN TOKENS & ENTERPRISE LIGHT THEME CONSTANTS (tokens.json aligned)
// ============================================================================
const INITIAL_WORKLOADS = [
  {
    id: 'nhi-01',
    name: 'autonomous-finops-agent',
    type: 'AI Agent (LangGraph)',
    icon: 'Bot',
    spiffeId: 'spiffe://axiom.internal/ns/prod/sa/autonomous-finops-agent',
    attestation: 'AWS Nitro Enclave Attested (PCR0: 9f8e...3a1b)',
    owner: 'FinOps Platform Team (@sec-finops)',
    ttlSeconds: 258,
    blastRadius: 14,
    status: 'ACTIVE',
    scrubberRules: ['AWS_SECRET_ACCESS_KEY', 'STRIPE_LIVE_KEY', 'SSN_PII'],
    connectedBroker: 'axiom-enclave-us-east-1a',
    targets: ['res-openai', 'res-snowflake', 'res-aws'],
    requestsPerMin: 420,
    policyId: 'pol-ai-guardrail-01'
  },
  {
    id: 'nhi-02',
    name: 'payments-settlement-worker',
    type: 'K8s Microservice',
    icon: 'Server',
    spiffeId: 'spiffe://axiom.internal/ns/payments/sa/settlement-v4',
    attestation: 'K8s Projected ServiceAccount + TPM 2.0',
    owner: 'Core Ledger Eng (@payments-core)',
    ttlSeconds: 112,
    blastRadius: 8,
    status: 'ACTIVE',
    scrubberRules: ['PAN_CREDIT_CARD', 'BEARER_JWT', 'STRIPE_LIVE_KEY'],
    connectedBroker: 'axiom-enclave-us-east-1a',
    targets: ['res-stripe', 'res-postgres'],
    requestsPerMin: 1890,
    policyId: 'pol-pci-strict-02'
  },
  {
    id: 'nhi-03',
    name: 'gh-actions-deploy-runner',
    type: 'CI/CD Ephemeral Runner',
    icon: 'GitBranch',
    spiffeId: 'spiffe://axiom.internal/ns/ci/sa/github-oidc-runner-882',
    attestation: 'GitHub Actions OIDC (repo: axiom/infra:ref:refs/heads/main)',
    owner: 'Platform SRE (@sre-infra)',
    ttlSeconds: 45,
    blastRadius: 22,
    status: 'ACTIVE',
    scrubberRules: ['GITHUB_PAT', 'AWS_SESSION_TOKEN', 'PRIVATE_KEY_PEM'],
    connectedBroker: 'axiom-enclave-us-east-1a',
    targets: ['res-aws', 'res-postgres'],
    requestsPerMin: 64,
    policyId: 'pol-cicd-jit-03'
  },
  {
    id: 'nhi-04',
    name: 'customer-support-rag-bot',
    type: 'AI Agent (Claude 3.7 Sonnet)',
    icon: 'Bot',
    spiffeId: 'spiffe://axiom.internal/ns/cx/sa/support-rag-indexer',
    attestation: 'AWS Nitro Enclave Attested (PCR0: 4c2d...88e1)',
    owner: 'AI Product Eng (@cx-ai)',
    ttlSeconds: 189,
    blastRadius: 68,
    status: 'WARNING',
    scrubberRules: ['CUSTOMER_EMAIL', 'SSN_PII', 'OPENAI_API_KEY', 'BEARER_JWT'],
    connectedBroker: 'axiom-enclave-us-east-1a',
    targets: ['res-openai', 'res-snowflake', 'res-postgres'],
    requestsPerMin: 730,
    policyId: 'pol-ai-guardrail-01'
  }
];

const TARGET_RESOURCES = [
  {
    id: 'res-openai',
    name: 'OpenAI Frontier API',
    category: 'LLM Provider',
    endpoint: 'api.openai.com/v1/chat/completions',
    authInjected: 'Zero-Knowledge Ephemeral Bearer (Vault-less)',
    encryption: 'mTLS 1.3 + Enclave Memory Isolation',
    status: 'PROTECTED'
  },
  {
    id: 'res-snowflake',
    name: 'Snowflake Analytics Prod',
    category: 'Data Cloud',
    endpoint: 'axiom-prod.us-east-1.snowflakecomputing.com',
    authInjected: 'Short-Lived OAuth2 Token (TTL 5m)',
    encryption: 'mTLS 1.3 + Column-Level PII Redaction',
    status: 'PROTECTED'
  },
  {
    id: 'res-aws',
    name: 'AWS S3 & STS Prod',
    category: 'Cloud Infra',
    endpoint: 'sts.us-east-1.amazonaws.com',
    authInjected: 'SPIFFE SVID -> STS AssumeRoleWithWebIdentity',
    encryption: 'AWS Nitro Attested Channel',
    status: 'PROTECTED'
  },
  {
    id: 'res-stripe',
    name: 'Stripe Settlement API',
    category: 'FinTech SaaS',
    endpoint: 'api.stripe.com/v1/payouts',
    authInjected: 'Scoped Restricted Key (Injected at Egress)',
    encryption: 'TLS 1.3 + Payload Secret Scrubber',
    status: 'PROTECTED'
  },
  {
    id: 'res-postgres',
    name: 'Aurora Postgres Core',
    category: 'Production DB',
    endpoint: 'pg-core-01.cluster.axiom.internal:5432',
    authInjected: 'RDS IAM Ephemeral Auth Token',
    encryption: 'Wire-Speed SQL AST Guard',
    status: 'PROTECTED'
  }
];

const INITIAL_TRAFFIC_EVENTS = [
  {
    id: 'evt-99412',
    timestamp: '14:22:09.418',
    spiffeId: 'spiffe://axiom.internal/ns/cx/sa/support-rag-indexer',
    workloadName: 'customer-support-rag-bot',
    action: 'POST /v1/chat/completions',
    resource: 'api.openai.com',
    verdict: 'REDACT',
    latencyMs: 0.41,
    redactedCount: 3,
    policyMatched: 'pol-ai-guardrail-01',
    auditHash: 'sha256:8f9d2a1c4b7e60219c3f8b1a5d2e9f0c4a',
    rawPayload: `{
  "model": "gpt-4o",
  "messages": [
    {
      "role": "user",
      "content": "Summarize billing for SSN 412-88-9012 using key sk-proj-99a8b7c6d5e4f3 and AWS AKIAIOSFODNN7EXAMPLE"
    }
  ]
}`,
    scrubbedPayload: `{
  "model": "gpt-4o",
  "messages": [
    {
      "role": "user",
      "content": "Summarize billing for SSN [AXIOM_REDACTED:SSN_PII] using key [AXIOM_REDACTED:OPENAI_KEY] and AWS [AXIOM_REDACTED:AWS_AKIA]"
    }
  ]
}`,
    redactedTypes: ['SSN_PII', 'OPENAI_KEY', 'AWS_AKIA']
  },
  {
    id: 'evt-99411',
    timestamp: '14:22:08.902',
    spiffeId: 'spiffe://axiom.internal/ns/payments/sa/settlement-v4',
    workloadName: 'payments-settlement-worker',
    action: 'POST /v1/payouts',
    resource: 'api.stripe.com',
    verdict: 'PERMIT',
    latencyMs: 0.34,
    redactedCount: 0,
    policyMatched: 'pol-pci-strict-02',
    auditHash: 'sha256:3c1e7b9a2d4f80126e5a9c8b7d1f2e3a9b',
    rawPayload: `{
  "amount": 485000,
  "currency": "usd",
  "destination": "acct_1N9k2L8x9912",
  "idempotency_key": "idem-88219-xc"
}`,
    scrubbedPayload: `{
  "amount": 485000,
  "currency": "usd",
  "destination": "acct_1N9k2L8x9912",
  "idempotency_key": "idem-88219-xc"
}`,
    redactedTypes: []
  },
  {
    id: 'evt-99410',
    timestamp: '14:22:07.115',
    spiffeId: 'spiffe://axiom.internal/ns/cx/sa/support-rag-indexer',
    workloadName: 'customer-support-rag-bot',
    action: 'DROP TABLE customer_ledgers',
    resource: 'pg-core-01.cluster.axiom.internal',
    verdict: 'DENY',
    latencyMs: 0.19,
    redactedCount: 1,
    policyMatched: 'forbid-destructive-sql-00',
    auditHash: 'sha256:7a4b9e2f1c8d30459b2e1a6f8c4d7e9a1f',
    rawPayload: `{
  "query": "DROP TABLE customer_ledgers CASCADE;",
  "auth_header": "Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.secret"
}`,
    scrubbedPayload: `{
  "query": "[BLOCKED BY AXIOM CEDAR ENGINE: DESTRUCTIVE_DDL]",
  "auth_header": "Bearer [AXIOM_REDACTED:BEARER_JWT]"
}`,
    redactedTypes: ['BEARER_JWT']
  },
  {
    id: 'evt-99409',
    timestamp: '14:22:05.604',
    spiffeId: 'spiffe://axiom.internal/ns/prod/sa/autonomous-finops-agent',
    workloadName: 'autonomous-finops-agent',
    action: 'STS::AssumeRoleWithWebIdentity',
    resource: 'sts.us-east-1.amazonaws.com',
    verdict: 'PERMIT',
    latencyMs: 0.39,
    redactedCount: 0,
    policyMatched: 'pol-ai-guardrail-01',
    auditHash: 'sha256:1d8f3c6a9b2e50741a9c3e8b5d2f0a4c6e',
    rawPayload: `{
  "RoleArn": "arn:aws:iam::992817263512:role/AxiomFinOpsReadOnly",
  "RoleSessionName": "axiom-jit-finops-291",
  "DurationSeconds": 900
}`,
    scrubbedPayload: `{
  "RoleArn": "arn:aws:iam::992817263512:role/AxiomFinOpsReadOnly",
  "RoleSessionName": "axiom-jit-finops-291",
  "DurationSeconds": 900
}`,
    redactedTypes: []
  },
  {
    id: 'evt-99408',
    timestamp: '14:22:03.229',
    spiffeId: 'spiffe://axiom.internal/ns/ci/sa/github-oidc-runner-882',
    workloadName: 'gh-actions-deploy-runner',
    action: 'SELECT * FROM prod_analytics.users',
    resource: 'axiom-prod.snowflakecomputing.com',
    verdict: 'REDACT',
    latencyMs: 0.44,
    redactedCount: 2,
    policyMatched: 'pol-cicd-jit-03',
    auditHash: 'sha256:5e2a8c1f9d4b60317c8e2a4f6b9d1e3c5a',
    rawPayload: `{
  "statement": "SELECT email, api_token FROM users WHERE token='ghp_8921739812739812739812a'",
  "runner_token": "AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
}`,
    scrubbedPayload: `{
  "statement": "SELECT email, api_token FROM users WHERE token='[AXIOM_REDACTED:GITHUB_PAT]'",
  "runner_token": "AWS_SECRET_ACCESS_KEY=[AXIOM_REDACTED:AWS_SECRET]"
}`,
    redactedTypes: ['GITHUB_PAT', 'AWS_SECRET']
  }
];

const INITIAL_AUDIT_LOGS = [
  {
    id: 'aud-801',
    timestamp: '2025-05-14T14:22:07.115Z',
    actor: 'axiom-enclave-us-east-1a (Auto-Guard)',
    eventType: 'CEDAR_POLICY_DENY',
    targetSpiffe: 'spiffe://axiom.internal/ns/cx/sa/support-rag-indexer',
    reason: 'Attempted destructive DDL (DROP TABLE) outside permitted read-only RAG scope.',
    signature: 'ed25519:9a8f7c6b5e4d3a2f1c0b9e8d7a6f5c4b',
    severity: 'CRITICAL'
  },
  {
    id: 'aud-800',
    timestamp: '2025-05-14T14:20:41.009Z',
    actor: 'sec-ops@axiom.io (Hardware YubiKey)',
    eventType: 'POLICY_BUNDLE_PROMOTED',
    targetSpiffe: 'global://policy-bundle/v42.8.0',
    reason: 'Promoted Cedar Policy pol-ai-guardrail-01 after 10,000 dry-run replay checks.',
    signature: 'ed25519:3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c',
    severity: 'INFO'
  },
  {
    id: 'aud-799',
    timestamp: '2025-05-14T14:15:12.884Z',
    actor: 'axiom-scrubber-engine',
    eventType: 'SECRET_LEAK_PREVENTED',
    targetSpiffe: 'spiffe://axiom.internal/ns/prod/sa/autonomous-finops-agent',
    reason: 'Scrubbed 3 high-entropy credentials (AWS_AKIA, OPENAI_KEY, SSN) before egress to api.openai.com.',
    signature: 'ed25519:7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f',
    severity: 'HIGH'
  }
];

const DEFAULT_CEDAR_POLICY = `// Axiom NHI — Wire-Speed Cedar Policy Studio (v42.8)
// Evaluates inside AWS Nitro Enclave in < 0.25ms p99

@id("pol-ai-guardrail-01")
permit (
  principal is Axiom::Agent,
  action in [
    Axiom::Action::"InvokeModel",
    Axiom::Action::"AssumeRoleWithWebIdentity"
  ],
  resource in Axiom::ResourceGroup::"ApprovedFrontierModels"
)
when {
  principal.attestation_verified == true &&
  principal.ttl_remaining_sec > 0 &&
  context.token_budget <= 4096 &&
  context.scrubber_active == true &&
  !context.contains_unredacted_pii
};

@id("forbid-destructive-sql-00")
forbid (
  principal,
  action in [
    Axiom::Action::"DropTable",
    Axiom::Action::"ExportRawCustomerTable"
  ],
  resource
)
unless {
  context.breakglass_hardware_mfa == true
};`;

// ============================================================================
// HELPER COMPONENTS (VerdictBadge, Pill, Section Header)
// ============================================================================
function VerdictBadge({ verdict, size = 'sm' }) {
  const styles = {
    PERMIT: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    DENY: 'bg-rose-50 text-rose-700 border-rose-200',
    REDACT: 'bg-amber-50 text-amber-700 border-amber-200',
    REVOKED: 'bg-rose-100 text-rose-800 border-rose-300'
  };
  const icons = {
    PERMIT: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />,
    DENY: <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />,
    REDACT: <EyeOff className="w-3.5 h-3.5 text-amber-600 shrink-0" />,
    REVOKED: <AlertOctagon className="w-3.5 h-3.5 text-rose-700 shrink-0" />
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono font-semibold border rounded-full ${
        size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-xs'
      } ${styles[verdict] || styles.PERMIT}`}
    >
      {icons[verdict] || icons.PERMIT}
      {verdict}
    </span>
  );
}

// ============================================================================
// MAIN APPLICATION COMPONENT
// ============================================================================
export default function App() {
  // Global Mode Switcher: 'console' (apps/gateway-ui) vs 'marketing' (apps/web)
  const [appMode, setAppMode] = useState('console');

  // Product Console Navigation Tab
  const [activeTab, setActiveTab] = useState('topology');

  // State for Workloads & Kill-Switch
  const [workloads, setWorkloads] = useState(INITIAL_WORKLOADS);
  const [selectedWorkloadId, setSelectedWorkloadId] = useState('nhi-01');
  const [globalKillSwitchActive, setGlobalKillSwitchActive] = useState(false);

  // State for Live Traffic & Secret Scrubber
  const [trafficEvents, setTrafficEvents] = useState(INITIAL_TRAFFIC_EVENTS);
  const [isStreaming, setIsStreaming] = useState(true);
  const [verdictFilter, setVerdictFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEvent, setSelectedEvent] = useState(INITIAL_TRAFFIC_EVENTS[0]);

  // State for Cedar Policy Studio & Dry-Run
  const [cedarCode, setCedarCode] = useState(DEFAULT_CEDAR_POLICY);
  const [routeMode, setRouteMode] = useState('ENFORCE'); // SHADOW | ENFORCE
  const [tokenBudgetLimit, setTokenBudgetLimit] = useState(4096);
  const [requireAttestation, setRequireAttestation] = useState(true);
  const [blockPiiEgress, setBlockPiiEgress] = useState(true);
  const [isRunningDryRun, setIsRunningDryRun] = useState(false);
  const [dryRunResult, setDryRunResult] = useState({
    totalReplayed: 10000,
    permitted: 9412,
    redacted: 486,
    denied: 102,
    newlyBlocked: 19,
    p99EvalMs: 0.21,
    bundleVersion: 'v42.8.0-rc1',
    promoted: false
  });

  // State for Audit Ledger
  const [auditLogs, setAuditLogs] = useState(INITIAL_AUDIT_LOGS);
  const [exportToast, setExportToast] = useState(null);

  // State for Marketing Showcase (apps/web)
  const [interceptStage, setInterceptStage] = useState('SCRUBBED'); // RAW | SCRUBBED | BLOCKED
  const [calcMicroservices, setCalcMicroservices] = useState(45);
  const [calcAiAgents, setCalcAiAgents] = useState(18);
  const [calcRps, setCalcRps] = useState(2500);
  const [copiedCli, setCopiedCli] = useState(false);

  // Countdown timer for ephemeral TTLs & simulated live traffic
  useEffect(() => {
    const timer = setInterval(() => {
      setWorkloads((prev) =>
        prev.map((w) => {
          if (w.status === 'REVOKED') return w;
          const nextTtl = w.ttlSeconds <= 1 ? 300 : w.ttlSeconds - 1;
          return { ...w, ttlSeconds: nextTtl };
        })
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Simulated SSE Traffic Generator
  useEffect(() => {
    if (!isStreaming || globalKillSwitchActive) return;
    const interval = setInterval(() => {
      const sampleTemplates = [
        {
          spiffeId: 'spiffe://axiom.internal/ns/prod/sa/autonomous-finops-agent',
          workloadName: 'autonomous-finops-agent',
          action: 'POST /v1/chat/completions',
          resource: 'api.openai.com',
          verdict: 'REDACT',
          latencyMs: +(0.31 + Math.random() * 0.15).toFixed(2),
          redactedCount: 2,
          policyMatched: 'pol-ai-guardrail-01',
          rawPayload: `{\n  "model": "gpt-4o",\n  "prompt": "Analyze AWS bill for key AKIAIOSFODNN7EXAMPLE and Bearer eyJhbGciOiJIUzI1NiJ9"\n}`,
          scrubbedPayload: `{\n  "model": "gpt-4o",\n  "prompt": "Analyze AWS bill for key [AXIOM_REDACTED:AWS_AKIA] and Bearer [AXIOM_REDACTED:JWT]"\n}`,
          redactedTypes: ['AWS_AKIA', 'JWT']
        },
        {
          spiffeId: 'spiffe://axiom.internal/ns/payments/sa/settlement-v4',
          workloadName: 'payments-settlement-worker',
          action: 'POST /v1/payouts',
          resource: 'api.stripe.com',
          verdict: 'PERMIT',
          latencyMs: +(0.28 + Math.random() * 0.12).toFixed(2),
          redactedCount: 0,
          policyMatched: 'pol-pci-strict-02',
          rawPayload: `{\n  "amount": 129000,\n  "currency": "usd",\n  "merchant_id": "acct_9918273"\n}`,
          scrubbedPayload: `{\n  "amount": 129000,\n  "currency": "usd",\n  "merchant_id": "acct_9918273"\n}`,
          redactedTypes: []
        },
        {
          spiffeId: 'spiffe://axiom.internal/ns/cx/sa/support-rag-indexer',
          workloadName: 'customer-support-rag-bot',
          action: 'SELECT * FROM raw_pii_vault',
          resource: 'axiom-prod.snowflakecomputing.com',
          verdict: 'DENY',
          latencyMs: +(0.18 + Math.random() * 0.09).toFixed(2),
          redactedCount: 1,
          policyMatched: 'forbid-destructive-sql-00',
          rawPayload: `{\n  "sql": "SELECT ssn, credit_card FROM raw_pii_vault LIMIT 5000",\n  "session_secret": "sk-live-098123098123"\n}`,
          scrubbedPayload: `{\n  "sql": "[BLOCKED: UNAUTHORIZED_TABLE_ACCESS]",\n  "session_secret": "[AXIOM_REDACTED:SECRET_KEY]"\n}`,
          redactedTypes: ['SECRET_KEY']
        }
      ];

      const pick = sampleTemplates[Math.floor(Math.random() * sampleTemplates.length)];
      const now = new Date();
      const timeStr =
        now.toTimeString().split(' ')[0] +
        '.' +
        String(now.getMilliseconds()).padStart(3, '0');
      const newEvt = {
        ...pick,
        id: `evt-${Math.floor(10000 + Math.random() * 89999)}`,
        timestamp: timeStr,
        auditHash: `sha256:${Math.random().toString(16).substring(2, 18)}a9f2c4e1`
      };

      setTrafficEvents((prev) => [newEvt, ...prev.slice(0, 29)]);
    }, 3200);

    return () => clearInterval(interval);
  }, [isStreaming, globalKillSwitchActive]);

  // Burst traffic generator button
  const triggerTrafficBurst = () => {
    const now = new Date();
    const timeStr =
      now.toTimeString().split(' ')[0] +
      '.' +
      String(now.getMilliseconds()).padStart(3, '0');
    const burstEvent = {
      id: `evt-${Math.floor(10000 + Math.random() * 89999)}`,
      timestamp: timeStr,
      spiffeId: 'spiffe://axiom.internal/ns/prod/sa/autonomous-finops-agent',
      workloadName: 'autonomous-finops-agent',
      action: 'POST /v1/chat/completions (Burst)',
      resource: 'api.openai.com',
      verdict: 'REDACT',
      latencyMs: 0.36,
      redactedCount: 3,
      policyMatched: 'pol-ai-guardrail-01',
      auditHash: `sha256:burst${Math.random().toString(16).substring(2, 16)}`,
      rawPayload: `{\n  "model": "claude-3-7-sonnet",\n  "messages": [{"role": "user", "content": "Leak check: sk-proj-881273981273, AKIA9988776655, SSN 991-00-1122"}]\n}`,
      scrubbedPayload: `{\n  "model": "claude-3-7-sonnet",\n  "messages": [{"role": "user", "content": "Leak check: [AXIOM_REDACTED:OPENAI_KEY], [AXIOM_REDACTED:AWS_AKIA], SSN [AXIOM_REDACTED:SSN_PII]"}]\n}`,
      redactedTypes: ['OPENAI_KEY', 'AWS_AKIA', 'SSN_PII']
    };
    setTrafficEvents((prev) => [burstEvent, ...prev]);
    setSelectedEvent(burstEvent);
  };

  // Isolate / Revoke a specific workload
  const handleRevokeWorkload = (workloadId) => {
    const target = workloads.find((w) => w.id === workloadId);
    if (!target) return;

    const isCurrentlyRevoked = target.status === 'REVOKED';
    setWorkloads((prev) =>
      prev.map((w) =>
        w.id === workloadId
          ? {
              ...w,
              status: isCurrentlyRevoked ? 'ACTIVE' : 'REVOKED',
              ttlSeconds: isCurrentlyRevoked ? 300 : 0,
              requestsPerMin: isCurrentlyRevoked ? 350 : 0
            }
          : w
      )
    );

    const newLog = {
      id: `aud-${Math.floor(802 + Math.random() * 900)}`,
      timestamp: new Date().toISOString(),
      actor: 'sec-admin@axiom.io (Console Kill-Switch)',
      eventType: isCurrentlyRevoked ? 'WORKLOAD_RESTORED' : 'WORKLOAD_SVID_REVOKED',
      targetSpiffe: target.spiffeId,
      reason: isCurrentlyRevoked
        ? `Re-attested SPIFFE SVID for ${target.name} via Nitro Enclave.`
        : `Emergency zero-trust isolation triggered for ${target.name}. All active tokens terminated in 0.14ms.`,
      signature: `ed25519:${Math.random().toString(16).substring(2, 26)}`,
      severity: isCurrentlyRevoked ? 'INFO' : 'CRITICAL'
    };
    setAuditLogs((prev) => [newLog, ...prev]);
  };

  // Toggle Global Emergency Kill-Switch
  const handleGlobalKillSwitch = () => {
    const nextState = !globalKillSwitchActive;
    setGlobalKillSwitchActive(nextState);
    setWorkloads((prev) =>
      prev.map((w) => ({
        ...w,
        status: nextState ? 'REVOKED' : 'ACTIVE',
        ttlSeconds: nextState ? 0 : 240
      }))
    );

    const newLog = {
      id: `aud-${Math.floor(900 + Math.random() * 900)}`,
      timestamp: new Date().toISOString(),
      actor: 'GLOBAL_KILLSWITCH_HARDWARE_TOKEN',
      eventType: nextState ? 'GLOBAL_ENCLAVE_LOCKDOWN' : 'GLOBAL_ENCLAVE_RESTORED',
      targetSpiffe: 'spiffe://axiom.internal/*',
      reason: nextState
        ? 'Global Emergency Kill-Switch engaged. All egress credentials and AI agent sessions frozen.'
        : 'Global Enclave Lockdown lifted. Ephemeral SPIFFE rotation resumed.',
      signature: `ed25519:global${Math.random().toString(16).substring(2, 22)}`,
      severity: 'CRITICAL'
    };
    setAuditLogs((prev) => [newLog, ...prev]);
  };

  // Guided Policy Builder Sync
  const handleGuidedPolicyChange = (newBudget, newAttest, newPii) => {
    setTokenBudgetLimit(newBudget);
    setRequireAttestation(newAttest);
    setBlockPiiEgress(newPii);

    const updatedCode = `// Axiom NHI — Wire-Speed Cedar Policy Studio (v42.8)
// Evaluates inside AWS Nitro Enclave in < 0.25ms p99

@id("pol-ai-guardrail-01")
permit (
  principal is Axiom::Agent,
  action in [
    Axiom::Action::"InvokeModel",
    Axiom::Action::"AssumeRoleWithWebIdentity"
  ],
  resource in Axiom::ResourceGroup::"ApprovedFrontierModels"
)
when {
  principal.attestation_verified == ${newAttest} &&
  principal.ttl_remaining_sec > 0 &&
  context.token_budget <= ${newBudget} &&
  context.scrubber_active == true${newPii ? ' &&\n  !context.contains_unredacted_pii' : ''}
};

@id("forbid-destructive-sql-00")
forbid (
  principal,
  action in [
    Axiom::Action::"DropTable",
    Axiom::Action::"ExportRawCustomerTable"
  ],
  resource
)
unless {
  context.breakglass_hardware_mfa == true
};`;
    setCedarCode(updatedCode);
  };

  // Run Dry-Run Replay Simulation
  const handleRunDryRun = () => {
    setIsRunningDryRun(true);
    setTimeout(() => {
      const budgetFactor = Math.max(0, Math.round((8192 - tokenBudgetLimit) / 120));
      const newlyBlocked =
        budgetFactor + (requireAttestation ? 14 : 2) + (blockPiiEgress ? 28 : 0);
      const denied = 85 + newlyBlocked;
      const redacted = blockPiiEgress ? 512 : 120;
      const permitted = 10000 - denied - redacted;

      setDryRunResult({
        totalReplayed: 10000,
        permitted,
        redacted,
        denied,
        newlyBlocked,
        p99EvalMs: +(0.18 + Math.random() * 0.06).toFixed(2),
        bundleVersion: `v42.8.${Math.floor(1 + Math.random() * 9)}`,
        promoted: false
      });
      setIsRunningDryRun(false);
    }, 450);
  };

  // Promote Policy Bundle
  const handlePromotePolicy = () => {
    setDryRunResult((prev) => ({ ...prev, promoted: true }));
    const newLog = {
      id: `aud-${Math.floor(900 + Math.random() * 900)}`,
      timestamp: new Date().toISOString(),
      actor: 'policy-studio@axiom.io',
      eventType: 'CEDAR_BUNDLE_HOT_SWAPPED',
      targetSpiffe: `global://policy-bundle/${dryRunResult.bundleVersion}`,
      reason: `Hot-swapped Cedar policy bundle in ${routeMode} mode with zero dropped connections.`,
      signature: `ed25519:cedar${Math.random().toString(16).substring(2, 22)}`,
      severity: 'INFO'
    };
    setAuditLogs((prev) => [newLog, ...prev]);
  };

  // Export Audit Events (JSON / CSV)
  const handleExportAudit = (format) => {
    const dataStr =
      format === 'JSON'
        ? JSON.stringify(auditLogs, null, 2)
        : 'ID,Timestamp,Actor,EventType,TargetSPIFFE,Severity,Signature\n' +
          auditLogs
            .map(
              (l) =>
                `"${l.id}","${l.timestamp}","${l.actor}","${l.eventType}","${l.targetSpiffe}","${l.severity}","${l.signature}"`
            )
            .join('\n');

    const blob = new Blob([dataStr], {
      type: format === 'JSON' ? 'application/json' : 'text/csv'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `axiom-nhi-audit-ledger.${format.toLowerCase()}`;
    a.click();
    URL.revokeObjectURL(url);

    setExportToast(`Exported ${auditLogs.length} cryptographically signed events as ${format}`);
    setTimeout(() => setExportToast(null), 3500);
  };

  const selectedWorkload = useMemo(
    () => workloads.find((w) => w.id === selectedWorkloadId) || workloads[0],
    [workloads, selectedWorkloadId]
  );

  const filteredTraffic = useMemo(() => {
    return trafficEvents.filter((evt) => {
      const matchesVerdict =
        verdictFilter === 'ALL' || evt.verdict === verdictFilter;
      const matchesSearch =
        !searchQuery ||
        evt.workloadName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        evt.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
        evt.resource.toLowerCase().includes(searchQuery.toLowerCase()) ||
        evt.spiffeId.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesVerdict && matchesSearch;
    });
  }, [trafficEvents, verdictFilter, searchQuery]);

  // Format seconds as MMm SSs
  const formatTtl = (sec) => {
    if (sec <= 0) return '00m 00s (EXPIRED)';
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}m ${s}s`;
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* ===================================================================
          GLOBAL TOP ARCHITECTURE BAR (Switches between gateway-ui & apps/web)
         =================================================================== */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 lg:px-6 h-14 flex items-center justify-between shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-slate-900 text-base">
                AXIOM <span className="text-blue-600">NHI</span>
              </span>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                v2.4 LIGHT-ENTERPRISE
              </span>
            </div>
            <p className="text-[11px] text-slate-500 hidden md:block">
              Zero-Standing-Privilege Non-Human Identity & AI Agent Security Broker
            </p>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200/80">
          <button
            onClick={() => setAppMode('console')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              appMode === 'console'
                ? 'bg-white text-blue-600 shadow-sm border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Product Console</span>
            <span className="hidden sm:inline font-mono text-[10px] px-1.5 py-0.2 bg-blue-50 text-blue-700 rounded">
              gateway-ui
            </span>
          </button>
          <button
            onClick={() => setAppMode('marketing')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              appMode === 'marketing'
                ? 'bg-white text-blue-600 shadow-sm border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Architecture & ROI Showcase</span>
            <span className="hidden sm:inline font-mono text-[10px] px-1.5 py-0.2 bg-slate-200/70 text-slate-700 rounded">
              apps/web
            </span>
          </button>
        </div>

        {/* Live Telemetry Status Bar */}
        <div className="hidden xl:flex items-center gap-3">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            NITRO-ENCLAVE-ACTIVE
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-xs font-mono">
            <Zap className="w-3.5 h-3.5 text-blue-600" />
            0.38ms p99
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-800 text-xs font-mono">
            <Shield className="w-3.5 h-3.5 text-blue-600" />
            SCRUBBER: 0 LEAKS
          </div>
        </div>
      </header>

      {/* ===================================================================
          MODE 1: PRODUCT CONSOLE (apps/gateway-ui)
         =================================================================== */}
      {appMode === 'console' ? (
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Left Navigation Sidebar */}
          <aside className="w-full lg:w-64 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col justify-between shrink-0">
            <div className="p-4 space-y-1">
              <div className="px-2 pb-2 text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold">
                Gateway Control Plane
              </div>

              <button
                onClick={() => setActiveTab('topology')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'topology'
                    ? 'bg-blue-50/90 text-blue-700 border border-blue-200 shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Layers className="w-4 h-4" />
                  <span>NHI Topology & Lineage</span>
                </div>
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600">
                  {workloads.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('traffic')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'traffic'
                    ? 'bg-blue-50/90 text-blue-700 border border-blue-200 shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Activity className="w-4 h-4" />
                  <span>Live Traffic & Scrubber</span>
                </div>
                <span className="flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  SSE
                </span>
              </button>

              <button
                onClick={() => setActiveTab('policy')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'policy'
                    ? 'bg-blue-50/90 text-blue-700 border border-blue-200 shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <FileCode className="w-4 h-4" />
                  <span>Cedar Policy Studio</span>
                </div>
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-700">
                  WASM
                </span>
              </button>

              <button
                onClick={() => setActiveTab('killswitch')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === 'killswitch'
                    ? 'bg-blue-50/90 text-blue-700 border border-blue-200 shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <AlertOctagon className="w-4 h-4 text-rose-600" />
                  <span>Kill-Switch & Audit</span>
                </div>
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-700">
                  {auditLogs.length}
                </span>
              </button>
            </div>

            {/* Emergency Kill-Switch Box in Sidebar */}
            <div className="p-4 border-t border-slate-200 bg-slate-50/60 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-rose-600" />
                  Hardware Kill-Switch
                </span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                    globalKillSwitchActive
                      ? 'bg-rose-100 text-rose-800 border border-rose-300'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}
                >
                  {globalKillSwitchActive ? 'LOCKED DOWN' : 'ARMED'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Instantly revoke all active SPIFFE SVIDs and freeze egress across all AI agents.
              </p>
              <button
                onClick={handleGlobalKillSwitch}
                className={`w-full py-2 px-3 rounded-lg font-mono text-xs font-semibold border transition-all flex items-center justify-center gap-2 shadow-xs ${
                  globalKillSwitchActive
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700'
                    : 'bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border-rose-300'
                }`}
              >
                <AlertOctagon className="w-3.5 h-3.5" />
                {globalKillSwitchActive
                  ? 'RESTORE ENCLAVE EGRESS'
                  : 'ENGAGE GLOBAL KILL-SWITCH'}
              </button>
            </div>
          </aside>

          {/* Main Workspace Container */}
          <main className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6">
            {/* Global Kill-Switch Banner if active */}
            {globalKillSwitchActive && (
              <div className="bg-rose-50 border-2 border-rose-300 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-rose-600 text-white flex items-center justify-center shrink-0">
                    <AlertOctagon className="w-6 h-6 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-rose-950">
                      GLOBAL EMERGENCY KILL-SWITCH ENGAGED — ZERO EGRESS PERMITTED
                    </h3>
                    <p className="text-xs text-rose-700 font-mono">
                      All ephemeral tokens revoked across 4 workloads. Sub-ms hardware enforcement active.
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleGlobalKillSwitch}
                  className="px-4 py-2 rounded-lg bg-white hover:bg-rose-100 text-rose-800 border border-rose-300 text-xs font-mono font-semibold shrink-0"
                >
                  Release Lockdown
                </button>
              </div>
            )}

            {/* Top KPI Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
                <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                  <span>Governed Non-Human Identities</span>
                  <Bot className="w-4 h-4 text-blue-600" />
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono text-slate-900">
                    1,428
                  </span>
                  <span className="text-xs font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    0 Static Keys
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  100% ephemeral SPIFFE SVIDs attested via Nitro
                </p>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
                <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                  <span>Cedar Policy Eval Latency</span>
                  <Zap className="w-4 h-4 text-indigo-600" />
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono text-slate-900">
                    0.38ms
                  </span>
                  <span className="text-xs font-mono text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                    p99 Wire-Speed
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  24.6x faster than legacy external sidecar vaults
                </p>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
                <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                  <span>Secrets & PII Scrubbed (24h)</span>
                  <EyeOff className="w-4 h-4 text-amber-600" />
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono text-slate-900">
                    14,920
                  </span>
                  <span className="text-xs font-mono text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                    0 Egress Leaks
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  AWS keys, JWTs, Stripe tokens & SSNs redacted inline
                </p>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
                <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                  <span>Cryptographic Audit Ledger</span>
                  <Lock className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono text-slate-900">
                    Ed25519
                  </span>
                  <span className="text-xs font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    VERIFIED
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Tamper-evident hash chain for SOC2 & PCI-DSS 4.0
                </p>
              </div>
            </div>

            {/* ===============================================================
                TAB 1: NHI TOPOLOGY & LINEAGE GRAPH (Clutch + Aembit Killer)
               =============================================================== */}
            {activeTab === 'topology' && (
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                {/* Interactive 3-Tier Identity Graph */}
                <div className="xl:col-span-8 bg-white rounded-xl border border-slate-200 shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50/50">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-blue-600" />
                        Live Non-Human Identity Topology & Credential Broker Graph
                      </h2>
                      <p className="text-xs text-slate-500">
                        Click any Workload or AI Agent node to inspect SPIFFE attestation, TTL countdown, and blast radius.
                      </p>
                    </div>
                    <span className="text-[11px] font-mono px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-700">
                      Zero Standing Privileges: ENFORCED
                    </span>
                  </div>

                  {/* 3-Column Visual Topology Canvas */}
                  <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-6 relative bg-[radial-gradient(#CBD5E1_1px,transparent_1px)] [background-size:16px_16px]">
                    {/* Column 1: Non-Human Identities */}
                    <div className="space-y-3">
                      <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500 bg-white/90 px-2.5 py-1 rounded border border-slate-200 inline-block">
                        1. Workloads & AI Agents
                      </div>
                      {workloads.map((wl) => {
                        const isSelected = wl.id === selectedWorkload.id;
                        const isRevoked = wl.status === 'REVOKED';
                        return (
                          <div
                            key={wl.id}
                            onClick={() => setSelectedWorkloadId(wl.id)}
                            className={`p-3.5 rounded-xl border transition-all cursor-pointer bg-white ${
                              isSelected
                                ? 'border-blue-600 ring-2 ring-blue-500/15 shadow-md'
                                : 'border-slate-200 hover:border-slate-300 shadow-xs'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <div
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                                    isRevoked
                                      ? 'bg-rose-50 border-rose-200 text-rose-600'
                                      : wl.type.includes('AI')
                                      ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                                      : 'bg-blue-50 border-blue-200 text-blue-600'
                                  }`}
                                >
                                  {wl.icon === 'Bot' && <Bot className="w-4 h-4" />}
                                  {wl.icon === 'Server' && <Server className="w-4 h-4" />}
                                  {wl.icon === 'GitBranch' && <GitBranch className="w-4 h-4" />}
                                </div>
                                <div>
                                  <div className="text-xs font-bold text-slate-900">
                                    {wl.name}
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    {wl.type}
                                  </div>
                                </div>
                              </div>
                              <span
                                className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${
                                  isRevoked
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : wl.status === 'WARNING'
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}
                              >
                                {wl.status}
                              </span>
                            </div>

                            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] font-mono">
                              <span className="text-slate-500 flex items-center gap-1">
                                <Clock className="w-3 h-3 text-blue-600" />
                                TTL: {formatTtl(wl.ttlSeconds)}
                              </span>
                              <span className="text-slate-700 font-semibold">
                                {wl.requestsPerMin} req/m
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Column 2: Axiom Nitro Enclave Broker */}
                    <div className="flex flex-col justify-center space-y-4">
                      <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500 bg-white/90 px-2.5 py-1 rounded border border-slate-200 inline-block self-center">
                        2. Axiom Enclave Broker
                      </div>

                      <div className="p-5 rounded-2xl bg-gradient-to-b from-white to-slate-50 border-2 border-blue-600 shadow-lg space-y-4 relative">
                        <div className="flex items-center justify-between">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-600 text-white">
                            AWS NITRO ENCLAVE
                          </span>
                          <span className="text-xs font-mono text-emerald-700 font-semibold">
                            0.38ms p99
                          </span>
                        </div>

                        <div>
                          <h3 className="text-sm font-bold text-slate-900">
                            axiom-enclave-us-east-1a
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Mutual TLS Termination + JIT Token Injection
                          </p>
                        </div>

                        <div className="space-y-2 text-xs">
                          <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200 flex items-center justify-between">
                            <span className="font-medium text-emerald-950 flex items-center gap-1.5">
                              <Key className="w-3.5 h-3.5 text-emerald-600" />
                              JIT Credential Broker
                            </span>
                            <span className="font-mono text-[10px] text-emerald-700 font-semibold">
                              VAULT-LESS
                            </span>
                          </div>

                          <div className="p-2.5 rounded-lg bg-indigo-50/70 border border-indigo-200 flex items-center justify-between">
                            <span className="font-medium text-indigo-950 flex items-center gap-1.5">
                              <FileCode className="w-3.5 h-3.5 text-indigo-600" />
                              Cedar Policy Engine
                            </span>
                            <span className="font-mono text-[10px] text-indigo-700 font-semibold">
                              {selectedWorkload.policyId}
                            </span>
                          </div>

                          <div className="p-2.5 rounded-lg bg-amber-50/80 border border-amber-200 flex items-center justify-between">
                            <span className="font-medium text-amber-950 flex items-center gap-1.5">
                              <EyeOff className="w-3.5 h-3.5 text-amber-600" />
                              Secret & PII Scrubber
                            </span>
                            <span className="font-mono text-[10px] text-amber-800 font-semibold">
                              {selectedWorkload.scrubberRules.length} RULES
                            </span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] font-mono text-slate-500">
                          <span>Active Focus:</span>
                          <span className="text-blue-600 font-semibold truncate max-w-[150px]">
                            {selectedWorkload.name}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Column 3: Target Cloud / SaaS / LLM Resources */}
                    <div className="space-y-3">
                      <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500 bg-white/90 px-2.5 py-1 rounded border border-slate-200 inline-block">
                        3. Target Cloud & LLM APIs
                      </div>

                      {TARGET_RESOURCES.map((res) => {
                        const isConnected = selectedWorkload.targets.includes(res.id);
                        return (
                          <div
                            key={res.id}
                            className={`p-3.5 rounded-xl border transition-all bg-white ${
                              isConnected
                                ? 'border-emerald-500/80 bg-emerald-50/10 shadow-sm'
                                : 'border-slate-200 opacity-55'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Cloud
                                  className={`w-4 h-4 ${
                                    isConnected ? 'text-emerald-600' : 'text-slate-400'
                                  }`}
                                />
                                <span className="text-xs font-bold text-slate-900">
                                  {res.name}
                                </span>
                              </div>
                              <span
                                className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                                  isConnected
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold'
                                    : 'bg-slate-100 text-slate-500 border-slate-200'
                                }`}
                              >
                                {isConnected ? 'JIT AUTHORIZED' : 'NO ROUTE'}
                              </span>
                            </div>
                            <div className="mt-1.5 text-[11px] font-mono text-slate-500 truncate">
                              {res.endpoint}
                            </div>
                            <div className="mt-2 text-[11px] text-slate-600 bg-slate-50 px-2 py-1 rounded border border-slate-200/70">
                              {res.authInjected}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Right Context Drawer: Identity Lineage & Attestation */}
                <div className="xl:col-span-4 bg-white rounded-xl border border-slate-200 shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5 space-y-5">
                  <div className="flex items-start justify-between border-b border-slate-200 pb-4">
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-blue-600">
                        Identity Lineage Inspector
                      </span>
                      <h3 className="text-base font-bold text-slate-900 mt-0.5">
                        {selectedWorkload.name}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {selectedWorkload.owner}
                      </p>
                    </div>
                    <VerdictBadge
                      verdict={
                        selectedWorkload.status === 'REVOKED' ? 'REVOKED' : 'PERMIT'
                      }
                    />
                  </div>

                  {/* SPIFFE ID Box */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5 text-blue-600" />
                      Cryptographic SPIFFE SVID
                    </label>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 font-mono text-xs text-slate-800 break-all">
                      {selectedWorkload.spiffeId}
                    </div>
                  </div>

                  {/* Hardware Attestation & TTL */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[11px] text-slate-500">
                        Ephemeral SVID TTL
                      </div>
                      <div className="text-sm font-bold font-mono text-blue-700 mt-1">
                        {formatTtl(selectedWorkload.ttlSeconds)}
                      </div>
                      <div className="text-[10px] text-emerald-700 mt-0.5">
                        Auto-rotates via Enclave
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[11px] text-slate-500">
                        Blast Radius Score
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className={`text-sm font-bold font-mono ${
                            selectedWorkload.blastRadius > 50
                              ? 'text-amber-600'
                              : 'text-emerald-600'
                          }`}
                        >
                          {selectedWorkload.blastRadius} / 100
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono">
                          LOW RISK
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        Scoped to {selectedWorkload.targets.length} endpoints
                      </div>
                    </div>
                  </div>

                  {/* Attestation Chain */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700">
                      Workload Attestation Evidence
                    </label>
                    <div className="p-2.5 rounded-lg bg-blue-50/50 border border-blue-200 text-xs font-mono text-blue-950">
                      {selectedWorkload.attestation}
                    </div>
                  </div>

                  {/* Active Secret Scrubber Rules */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                      <span>Inline Secret Scrubber Rules</span>
                      <span className="text-[11px] font-mono text-amber-700">
                        Wire-Speed Regex + Entropy
                      </span>
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedWorkload.scrubberRules.map((rule) => (
                        <span
                          key={rule}
                          className="px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-800 font-mono text-xs font-medium"
                        >
                          REDACTED::{rule}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* 1-Click Isolate / Revoke Workload Action */}
                  <div className="pt-3 border-t border-slate-200">
                    <button
                      onClick={() => handleRevokeWorkload(selectedWorkload.id)}
                      className={`w-full py-2.5 px-4 rounded-lg font-mono text-xs font-semibold border transition-all flex items-center justify-center gap-2 ${
                        selectedWorkload.status === 'REVOKED'
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700'
                          : 'bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border-rose-300'
                      }`}
                    >
                      <AlertOctagon className="w-4 h-4" />
                      {selectedWorkload.status === 'REVOKED'
                        ? 'RESTORE WORKLOAD SVID & EGRESS'
                        : 'ISOLATE / REVOKE WORKLOAD IMMEDIATELY'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ===============================================================
                TAB 2: LIVE TRAFFIC & SECRET SCRUBBER STREAM (modules/traffic)
               =============================================================== */}
            {activeTab === 'traffic' && (
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                {/* Left 7 Cols: Live Traffic Stream Table */}
                <div className="xl:col-span-7 bg-white rounded-xl border border-slate-200 shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden">
                  {/* Controls Bar */}
                  <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setIsStreaming(!isStreaming)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          isStreaming
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {isStreaming ? (
                          <>
                            <Pause className="w-3.5 h-3.5" />
                            <span>Live SSE Active</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5" />
                            <span>Stream Paused</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={triggerTrafficBurst}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-all"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Simulate Leak & Scrub Burst</span>
                      </button>
                    </div>

                    {/* Filter Pills */}
                    <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200">
                      {['ALL', 'PERMIT', 'REDACT', 'DENY'].map((v) => (
                        <button
                          key={v}
                          onClick={() => setVerdictFilter(v)}
                          className={`px-2.5 py-1 rounded text-xs font-mono font-semibold transition-all ${
                            verdictFilter === v
                              ? 'bg-slate-900 text-white'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Search Input */}
                  <div className="px-4 py-2.5 border-b border-slate-200 bg-white flex items-center gap-2">
                    <Search className="w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Filter by SPIFFE ID, workload (autonomous-finops-agent), action, or target resource..."
                      className="w-full text-xs text-slate-800 placeholder-slate-400 focus:outline-none font-mono"
                    />
                  </div>

                  {/* High-Density Enterprise Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-mono uppercase text-slate-500">
                          <th className="py-2.5 px-3">Timestamp</th>
                          <th className="py-2.5 px-3">Workload / Agent</th>
                          <th className="py-2.5 px-3">Action & Target</th>
                          <th className="py-2.5 px-3">Verdict</th>
                          <th className="py-2.5 px-3 text-right">Latency</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-xs">
                        {filteredTraffic.map((evt) => {
                          const isSelected = selectedEvent?.id === evt.id;
                          return (
                            <tr
                              key={evt.id}
                              onClick={() => setSelectedEvent(evt)}
                              className={`cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-blue-50/70'
                                  : 'hover:bg-slate-50/80'
                              }`}
                            >
                              <td className="py-3 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                                {evt.timestamp}
                              </td>
                              <td className="py-3 px-3">
                                <div className="font-semibold text-slate-900">
                                  {evt.workloadName}
                                </div>
                                <div className="font-mono text-[10px] text-slate-500 truncate max-w-[180px]">
                                  {evt.spiffeId}
                                </div>
                              </td>
                              <td className="py-3 px-3">
                                <div className="font-mono text-[11px] font-medium text-slate-800">
                                  {evt.action}
                                </div>
                                <div className="font-mono text-[10px] text-blue-600">
                                  {evt.resource}
                                </div>
                              </td>
                              <td className="py-3 px-3 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  <VerdictBadge verdict={evt.verdict} />
                                  {evt.redactedCount > 0 && (
                                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-mono text-[10px] font-bold">
                                      -{evt.redactedCount} secrets
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-3 text-right font-mono text-xs text-slate-700 whitespace-nowrap">
                                {evt.latencyMs}ms
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Right 5 Cols: InspectorDrawer.tsx (Side-by-Side Raw vs Scrubbed Payload) */}
                <div className="xl:col-span-5 bg-white rounded-xl border border-slate-200 shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-blue-600">
                        InspectorDrawer.tsx — Payload Diff
                      </span>
                      <h3 className="text-sm font-bold text-slate-900 mt-0.5">
                        Event {selectedEvent?.id} • {selectedEvent?.workloadName}
                      </h3>
                    </div>
                    {selectedEvent && <VerdictBadge verdict={selectedEvent.verdict} />}
                  </div>

                  {/* Metadata Pills */}
                  <div className="grid grid-cols-2 gap-2.5 text-xs font-mono">
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[10px] text-slate-500 block">
                        Matched Cedar Policy
                      </span>
                      <span className="text-slate-900 font-semibold">
                        {selectedEvent?.policyMatched}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[10px] text-slate-500 block">
                        Enclave Eval Latency
                      </span>
                      <span className="text-emerald-700 font-semibold">
                        {selectedEvent?.latencyMs}ms (Sub-ms SLA)
                      </span>
                    </div>
                  </div>

                  {/* Side-by-Side Payload Comparison */}
                  <div className="space-y-3">
                    <div className="rounded-lg border border-rose-200 bg-rose-50/30 overflow-hidden">
                      <div className="px-3 py-1.5 bg-rose-50 border-b border-rose-200 flex items-center justify-between text-xs">
                        <span className="font-semibold text-rose-900 flex items-center gap-1.5">
                          <Eye className="w-3.5 h-3.5 text-rose-600" />
                          1. Raw Outbound Workload Payload (Pre-Enclave)
                        </span>
                        <span className="font-mono text-[10px] text-rose-700">
                          CONTAINS SENSITIVE TOKENS
                        </span>
                      </div>
                      <pre className="p-3 text-[11px] font-mono text-slate-800 overflow-x-auto leading-relaxed">
                        {selectedEvent?.rawPayload}
                      </pre>
                    </div>

                    <div className="rounded-lg border border-emerald-300 bg-emerald-50/30 overflow-hidden">
                      <div className="px-3 py-1.5 bg-emerald-50 border-b border-emerald-200 flex items-center justify-between text-xs">
                        <span className="font-semibold text-emerald-950 flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                          2. Axiom Scrubbed Egress Payload (Sent to Target)
                        </span>
                        <span className="font-mono text-[10px] text-emerald-800 font-bold">
                          ZERO-LEAK GUARANTEED
                        </span>
                      </div>
                      <pre className="p-3 text-[11px] font-mono text-slate-900 overflow-x-auto leading-relaxed">
                        {selectedEvent?.scrubbedPayload}
                      </pre>
                    </div>
                  </div>

                  {/* Cryptographic Audit Hash */}
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-500">Audit Hash:</span>
                    <span className="text-slate-800 truncate max-w-[260px]">
                      {selectedEvent?.auditHash}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ===============================================================
                TAB 3: CEDAR POLICY STUDIO & DRY-RUN SIMULATOR
               =============================================================== */}
            {activeTab === 'policy' && (
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                {/* Left 7 Cols: Guided Policy Builder + Light-Mode Cedar Editor */}
                <div className="xl:col-span-7 bg-white rounded-xl border border-slate-200 shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden space-y-5 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-4">
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-indigo-600">
                        packages/cedar-editor • WASM Validator
                      </span>
                      <h2 className="text-base font-bold text-slate-900">
                        Cedar Policy Studio & Guardrail Compiler
                      </h2>
                    </div>

                    {/* Route Mode Toggle */}
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
                      <button
                        onClick={() => setRouteMode('SHADOW')}
                        className={`px-2.5 py-1 rounded text-xs font-mono font-semibold transition-all ${
                          routeMode === 'SHADOW'
                            ? 'bg-amber-500 text-white shadow-xs'
                            : 'text-slate-600'
                        }`}
                      >
                        SHADOW AUDIT
                      </button>
                      <button
                        onClick={() => setRouteMode('ENFORCE')}
                        className={`px-2.5 py-1 rounded text-xs font-mono font-semibold transition-all ${
                          routeMode === 'ENFORCE'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-600'
                        }`}
                      >
                        ENFORCE INLINE
                      </button>
                    </div>
                  </div>

                  {/* Interactive Guided Policy Controls */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
                    <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-blue-600" />
                      Guided Guardrail Parameters (Auto-compiles to Cedar AST below)
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="text-[11px] font-medium text-slate-600 block">
                          Max AI Token Budget / Call
                        </label>
                        <input
                          type="range"
                          min="1024"
                          max="8192"
                          step="512"
                          value={tokenBudgetLimit}
                          onChange={(e) =>
                            handleGuidedPolicyChange(
                              Number(e.target.value),
                              requireAttestation,
                              blockPiiEgress
                            )
                          }
                          className="w-full mt-2 accent-blue-600"
                        />
                        <div className="text-xs font-mono font-bold text-blue-700 mt-1">
                          {tokenBudgetLimit} tokens
                        </div>
                      </div>

                      <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white border border-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={requireAttestation}
                          onChange={(e) =>
                            handleGuidedPolicyChange(
                              tokenBudgetLimit,
                              e.target.checked,
                              blockPiiEgress
                            )
                          }
                          className="mt-0.5 accent-blue-600"
                        />
                        <div>
                          <div className="text-xs font-semibold text-slate-800">
                            Require Nitro Attestation
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Verify cryptographic PCR0 hash
                          </div>
                        </div>
                      </label>

                      <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white border border-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={blockPiiEgress}
                          onChange={(e) =>
                            handleGuidedPolicyChange(
                              tokenBudgetLimit,
                              requireAttestation,
                              e.target.checked
                            )
                          }
                          className="mt-0.5 accent-blue-600"
                        />
                        <div>
                          <div className="text-xs font-semibold text-slate-800">
                            Block Unredacted PII
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Enforce Secret Scrubber on prompts
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Crisp Light-Theme Syntax-Highlighted Cedar Editor */}
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-xs font-mono text-slate-600">
                      <span>policies/ai-agent-guardrails.cedar</span>
                      <span className="text-emerald-700 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> AST Schema Valid
                      </span>
                    </div>
                    <textarea
                      value={cedarCode}
                      onChange={(e) => setCedarCode(e.target.value)}
                      rows={16}
                      className="w-full p-4 bg-[#FFFFFF] text-slate-900 font-mono text-xs leading-relaxed focus:outline-none"
                    />
                  </div>
                </div>

                {/* Right 5 Cols: Blast-Radius Dry-Run Simulator (DryRunPanel.tsx) */}
                <div className="xl:col-span-5 bg-white rounded-xl border border-slate-200 shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5 space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-blue-600">
                        DryRunPanel.tsx • Blast-Radius Simulator
                      </span>
                      <h3 className="text-base font-bold text-slate-900">
                        Historical Traffic Replay (10,000 reqs)
                      </h3>
                    </div>
                    <button
                      onClick={handleRunDryRun}
                      disabled={isRunningDryRun}
                      className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-mono text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${
                          isRunningDryRun ? 'animate-spin' : ''
                        }`}
                      />
                      <span>{isRunningDryRun ? 'Replaying...' : 'Run Dry-Run'}</span>
                    </button>
                  </div>

                  {/* Dry-Run Verdict Breakdown */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200">
                      <div className="text-[11px] font-mono text-emerald-800">
                        PERMITTED
                      </div>
                      <div className="text-xl font-bold font-mono text-emerald-950 mt-1">
                        {dryRunResult.permitted.toLocaleString()}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200">
                      <div className="text-[11px] font-mono text-amber-800">
                        SCRUBBED
                      </div>
                      <div className="text-xl font-bold font-mono text-amber-950 mt-1">
                        {dryRunResult.redacted.toLocaleString()}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-200">
                      <div className="text-[11px] font-mono text-rose-800">
                        DENIED
                      </div>
                      <div className="text-xl font-bold font-mono text-rose-950 mt-1">
                        {dryRunResult.denied.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Policy Diff Impact */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">
                        Blast-Radius Delta vs Active Bundle:
                      </span>
                      <span className="font-mono font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                        +{dryRunResult.newlyBlocked} newly blocked calls
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Replaying <span className="font-mono font-semibold">10,000</span> production requests with token limit{' '}
                      <span className="font-mono font-semibold">{tokenBudgetLimit}</span> evaluated in{' '}
                      <span className="font-mono font-semibold text-emerald-700">
                        {dryRunResult.p99EvalMs}ms p99
                      </span>{' '}
                      with zero false positives on settlement workloads.
                    </p>
                  </div>

                  {/* Promote Policy Bundle Button */}
                  <button
                    onClick={handlePromotePolicy}
                    className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-blue-600 text-white font-mono text-xs font-semibold transition-all flex items-center justify-center gap-2 shadow-sm"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      {dryRunResult.promoted
                        ? `BUNDLE ${dryRunResult.bundleVersion} PROMOTED TO ENCLAVES`
                        : `PROMOTE POLICY BUNDLE (${dryRunResult.bundleVersion})`}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* ===============================================================
                TAB 4: KILL-SWITCH & CRYPTOGRAPHIC AUDIT EXPLORER
               =============================================================== */}
            {activeTab === 'killswitch' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl border border-slate-200 shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-rose-600">
                        modules/killswitch-audit • Immutable Ed25519 Ledger
                      </span>
                      <h2 className="text-base font-bold text-slate-900">
                        Instant Session Revocation & Cryptographic Audit Explorer
                      </h2>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleExportAudit('JSON')}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 text-xs font-mono font-semibold flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Export JSON
                      </button>
                      <button
                        onClick={() => handleExportAudit('CSV')}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-mono font-semibold flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Export CSV
                      </button>
                    </div>
                  </div>

                  {exportToast && (
                    <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-mono flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      {exportToast}
                    </div>
                  )}

                  {/* Audit Events Table */}
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-mono uppercase text-slate-500">
                          <th className="py-2.5 px-3">Event ID & Time</th>
                          <th className="py-2.5 px-3">Event Type</th>
                          <th className="py-2.5 px-3">Target SPIFFE / Resource</th>
                          <th className="py-2.5 px-3">Reason & Context</th>
                          <th className="py-2.5 px-3">Ed25519 Signature</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-xs">
                        {auditLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-slate-50/80">
                            <td className="py-3 px-3 font-mono text-[11px]">
                              <div className="font-bold text-slate-900">{log.id}</div>
                              <div className="text-slate-500">{log.timestamp}</div>
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold border ${
                                  log.severity === 'CRITICAL'
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : log.severity === 'HIGH'
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : 'bg-blue-50 text-blue-700 border-blue-200'
                                }`}
                              >
                                {log.eventType}
                              </span>
                            </td>
                            <td className="py-3 px-3 font-mono text-[11px] text-slate-800">
                              {log.targetSpiffe}
                            </td>
                            <td className="py-3 px-3 text-slate-600 max-w-md">
                              {log.reason}
                            </td>
                            <td className="py-3 px-3 font-mono text-[11px] text-emerald-700">
                              {log.signature}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      ) : (
        /* ===================================================================
           MODE 2: EXECUTIVE MARKETING & ARCHITECTURE SHOWCASE (apps/web)
           =================================================================== */
        <div className="flex-1 overflow-y-auto">
          {/* Light Editorial Hero Section */}
          <section className="bg-white border-b border-slate-200 py-14 px-4 lg:px-8">
            <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
              <div className="lg:col-span-6 space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-mono font-semibold">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>BEYOND STATIC VAULTS & LEGACY NHI GOVERNANCE</span>
                </div>

                <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 leading-[1.12]">
                  Eliminate Standing Credentials.{' '}
                  <span className="text-blue-600">
                    Govern Every AI Agent & Workload
                  </span>{' '}
                  at Wire Speed.
                </h1>

                <p className="text-base text-slate-600 leading-relaxed">
                  Aembit and Clutch show you where credentials live.{' '}
                  <strong className="text-slate-900">Axiom NHI</strong> eliminates them
                  entirely—brokering zero-knowledge SPIFFE identities inside AWS Nitro
                  Enclaves, evaluating Cedar policies in{' '}
                  <span className="font-mono text-blue-700 font-semibold">0.38ms</span>,
                  and scrubbing leaked secrets from outbound LLM prompts in real time.
                </p>

                {/* Quick Copy CLI Command + Switch to Console */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    onClick={() => setAppMode('console')}
                    className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm flex items-center gap-2 shadow-sm transition-all"
                  >
                    <span>Launch Live Gateway Console</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <div className="flex items-center bg-slate-100 border border-slate-200 rounded-xl px-3.5 py-2.5 font-mono text-xs text-slate-800">
                    <span>curl -sSf https://sh.axiom.security | sh</span>
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(
                          'curl -sSf https://sh.axiom.security | sh'
                        );
                        setCopiedCli(true);
                        setTimeout(() => setCopiedCli(false), 2000);
                      }}
                      className="ml-3 text-slate-500 hover:text-blue-600"
                    >
                      {copiedCli ? (
                        <Check className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Interactive Enclave Intercept Simulator (EnclaveVisual.tsx) */}
              <div className="lg:col-span-6 bg-[#F8FAFC] rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold uppercase text-blue-600">
                    Interactive Enclave Intercept Simulator
                  </span>
                  <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200">
                    {['RAW', 'SCRUBBED', 'BLOCKED'].map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setInterceptStage(mode)}
                        className={`px-2.5 py-1 rounded text-[11px] font-mono font-semibold transition-all ${
                          interceptStage === mode
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-500">
                      Source: spiffe://axiom/sa/autonomous-finops-agent
                    </span>
                    <VerdictBadge
                      verdict={
                        interceptStage === 'BLOCKED'
                          ? 'DENY'
                          : interceptStage === 'SCRUBBED'
                          ? 'REDACT'
                          : 'PERMIT'
                      }
                    />
                  </div>

                  <pre className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 font-mono text-xs text-slate-800 overflow-x-auto">
                    {interceptStage === 'RAW' &&
                      `POST https://api.openai.com/v1/chat/completions\nAuthorization: [STATIC_KEY_EXPOSED_IN_ENV]\n{\n  "prompt": "Customer SSN 412-88-9012 AWS Key AKIAIOSFODNN7EXAMPLE"\n}`}
                    {interceptStage === 'SCRUBBED' &&
                      `POST https://api.openai.com/v1/chat/completions\nAuthorization: Bearer [AXIOM_JIT_EPHEMERAL_SVID_TTL_240S]\n{\n  "prompt": "Customer SSN [REDACTED:PII] AWS Key [REDACTED:AWS_AKIA]"\n}`}
                    {interceptStage === 'BLOCKED' &&
                      `[AXIOM NITRO ENCLAVE INTERCEPT — 0.21ms]\nCedar Verdict: DENY (Policy: forbid-unattested-egress)\nReason: Workload PCR0 attestation mismatch. Token revoked.`}
                  </pre>
                </div>
              </div>
            </div>
          </section>

          {/* Competitive Benchmark & Interactive ROI Calculator */}
          <section className="py-12 px-4 lg:px-8 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Benchmark Comparison Table */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <h2 className="text-lg font-bold text-slate-900">
                Architectural Benchmark: Axiom NHI vs. Aembit & Clutch Security
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 font-mono text-slate-500">
                      <th className="py-3 px-3">Capability</th>
                      <th className="py-3 px-3 text-blue-700 font-bold">Axiom NHI</th>
                      <th className="py-3 px-3">Aembit / Clutch</th>
                      <th className="py-3 px-3">Legacy Vaults</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      <td className="py-3 px-3 font-semibold">Egress Eval Latency</td>
                      <td className="py-3 px-3 font-mono font-bold text-emerald-700">
                        0.38ms p99 (Nitro)
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-600">4.5ms – 12ms</td>
                      <td className="py-3 px-3 font-mono text-slate-500">18ms+</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-3 font-semibold">
                        Inline AI Prompt Secret Scrubbing
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-emerald-700">
                        Built-In Wire-Speed
                      </td>
                      <td className="py-3 px-3 text-slate-500">No payload scrubbing</td>
                      <td className="py-3 px-3 text-slate-500">None</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-3 font-semibold">Policy Engine</td>
                      <td className="py-3 px-3 font-mono font-bold text-blue-700">
                        Formal Cedar AST + Replay
                      </td>
                      <td className="py-3 px-3 text-slate-600">Basic RBAC / UI Rules</td>
                      <td className="py-3 px-3 text-slate-500">Static HCL</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-3 font-semibold">
                        Hardware Enclave Attestation
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-emerald-700">
                        AWS Nitro + SPIFFE SVID
                      </td>
                      <td className="py-3 px-3 text-slate-600">Cloud IAM API Poll</td>
                      <td className="py-3 px-3 text-slate-500">Long-lived AppRole</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Metering & ROI Calculator (MeteringCalculator.tsx) */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
              <div>
                <span className="text-[10px] font-mono uppercase font-bold text-blue-600">
                  MeteringCalculator.tsx
                </span>
                <h2 className="text-lg font-bold text-slate-900">
                  Zero-Standing-Privilege ROI Calculator
                </h2>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs font-medium">
                    <span>Production Microservices & Workloads</span>
                    <span className="font-mono font-bold text-blue-600">
                      {calcMicroservices}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="500"
                    value={calcMicroservices}
                    onChange={(e) => setCalcMicroservices(Number(e.target.value))}
                    className="w-full mt-1.5 accent-blue-600"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-medium">
                    <span>Autonomous AI Agents & RAG Pipelines</span>
                    <span className="font-mono font-bold text-indigo-600">
                      {calcAiAgents}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="2"
                    max="200"
                    value={calcAiAgents}
                    onChange={(e) => setCalcAiAgents(Number(e.target.value))}
                    className="w-full mt-1.5 accent-indigo-600"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-medium">
                    <span>Peak Egress API Calls / Sec</span>
                    <span className="font-mono font-bold text-emerald-600">
                      {calcRps.toLocaleString()} RPS
                    </span>
                  </div>
                  <input
                    type="range"
                    min="500"
                    max="25000"
                    step="500"
                    value={calcRps}
                    onChange={(e) => setCalcRps(Number(e.target.value))}
                    className="w-full mt-1.5 accent-emerald-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200">
                  <div className="text-[11px] text-blue-800">
                    Static Secrets Eliminated
                  </div>
                  <div className="text-xl font-bold font-mono text-blue-950 mt-1">
                    {(calcMicroservices * 14 + calcAiAgents * 9).toLocaleString()}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
                  <div className="text-[11px] text-emerald-800">
                    Eng Rotation Hours Saved/Yr
                  </div>
                  <div className="text-xl font-bold font-mono text-emerald-950 mt-1">
                    {(calcMicroservices * 28 + calcAiAgents * 45).toLocaleString()} hrs
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}