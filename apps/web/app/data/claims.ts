// Copyright 2026 Axiom NHI — Licensed under Apache-2.0

export type ClaimKind = 'measured' | 'verified' | 'target' | 'cited' | 'policy';

export interface Claim {
  readonly id: string;
  readonly label: string;
  readonly value: number | string;
  readonly unit?: string;
  readonly kind: ClaimKind;
  readonly source: string;
  readonly verifiedBy?: string;
  readonly description?: string;
}

export const CLAIMS: Record<string, Claim> = {
  inlineLatency: {
    id: "inlineLatency",
    label: "Inline Evaluation Overhead",
    value: "< 5",
    unit: "ms",
    kind: "target",
    source: "README.md & gateway/ latency targets",
    verifiedBy: "Target threshold (production benchmark results withheld)",
    description: "P99 gateway inline policy enforcement overhead target.",
  },
  failClosedDeadline: {
    id: "failClosedDeadline",
    label: "Fail-Closed Timeout",
    value: "15",
    unit: "ms",
    kind: "verified",
    source: "gateway/mcp-interceptor/interceptor.js",
    verifiedBy: "python tests/run_tests.py (test_chaos02_extmcp_timeout_fails_closed)",
    description: "Hard deadline beyond which in-flight ExtMCP calls abort and fail closed.",
  },
  failClosedGuarantee: {
    id: "failClosedGuarantee",
    label: "Fail-Closed Enforcement",
    value: "9 of 9",
    unit: "scenarios",
    kind: "verified",
    source: "tests/failure-injection/test_fail_closed.py",
    verifiedBy: "pytest tests/failure-injection",
    description: "Fails closed on timeout or evaluator outage (9 of 9 chaos scenarios pass).",
  },
  killSwitchPropagation: {
    id: "killSwitchPropagation",
    label: "Kill Switch Propagation",
    value: "< 50",
    unit: "ms",
    kind: "target",
    source: "tests/performance/test_latency_benchmarks.py (PERF-04 target)",
    verifiedBy: "Target threshold (PERF-04 methodology test)",
    description: "Target fleet-wide revocation propagation time from admin write to first blocked request.",
  },
  shadowAuditDuration: {
    id: "shadowAuditDuration",
    label: "Read-Only Discovery Scan",
    value: "< 30",
    unit: "minutes",
    kind: "target",
    source: "connectors/ (Token-bucket rate limiter for 10k NHIs in <10m)",
    description: "Target duration to scan AWS IAM, K8s, GitHub, and Slack for shadow agents.",
  },
  discoveryCost: {
    id: "discoveryCost",
    label: "Discovery & Inventory Cost",
    value: "$0",
    kind: "policy",
    source: "Commercial policy (read-only inventory is always free)",
    verifiedBy: "Commercial guarantee",
    description: "Guaranteed $0 discovery promise: read-only inventory is always free.",
  },
  agentHumanRatio: {
    id: "agentHumanRatio",
    label: "NHI-to-Human Ratio",
    value: "45x–82x",
    kind: "cited",
    source: "CyberArk 2022 (45:1) & 2025 (82:1) Identity Security Threat Landscape Reports",
    description: "Surveys put machine identities at 45 to 82 times the number of humans.",
  },
};

export function getClaim(id: keyof typeof CLAIMS): Claim {
  const claim = CLAIMS[id];
  if (!claim) {
    throw new Error(`Missing required claim for id: ${String(id)}`);
  }
  return claim;
}

export function getAllClaims(): Claim[] {
  return Object.values(CLAIMS);
}
