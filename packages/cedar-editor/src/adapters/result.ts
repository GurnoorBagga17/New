import type {
  DryRunResult,
  DryRunStatus,
  EvaluatorId,
  PolicyDecision,
  PolicyDiagnostic,
  PolicyErrorCategory,
  PolicyVerdict,
  RouteMode,
  ValidatorFacts,
  ValidatorResult,
} from "../types.js";
import type { DryRunResponseBody } from "../contracts/local-policy-api.js";
import { LOCAL_POLICY_CONTRACT_VERSION } from "../types.js";

/** Empty facts object used for empty/error states. */
export function emptyValidatorFacts(): ValidatorFacts {
  return {
    sql: {
      present: false,
      verbs: [],
      tables: [],
      isReadonly: null,
      statementCount: 0,
    },
    path: { normalizedPath: null, traversalDetected: false },
    egress: { domain: null, privateIp: false },
    toolPin: { sha256: null, verified: null },
    aggregate: { passed: false, count: 0 },
    raw: [],
  };
}

/** Aggregate Team 4's `ValidatorResult[]` for display. No policy logic here. */
export function normalizeValidatorResults(
  results: readonly ValidatorResult[],
): ValidatorFacts {
  if (results.length === 0) return emptyValidatorFacts();

  const verbs = new Set<string>();
  const tables = new Set<string>();
  let sqlPresent = false;
  let isReadonly: boolean | null = null;
  let statementCount = 0;
  let normalizedPath: string | null = null;
  let traversalDetected = false;
  let egressDomain: string | null = null;
  let privateIp = false;
  let pinSha: string | null = null;
  let pinVerified: boolean | null = null;
  let allPassed = true;

  for (const result of results) {
    if (!result.passed) allPassed = false;
    if (result.sql_statement_count > 0 || result.sql_verbs.length > 0) {
      sqlPresent = true;
    }
    result.sql_verbs.forEach((verb) => verbs.add(verb));
    result.sql_tables.forEach((table) => tables.add(table));
    if (result.validator_id === "sql") {
      isReadonly =
        isReadonly === null
          ? result.sql_is_readonly
          : isReadonly && result.sql_is_readonly;
    }
    statementCount = Math.min(
      Number.MAX_SAFE_INTEGER,
      statementCount + result.sql_statement_count,
    );
    if (result.normalized_path !== null) normalizedPath = result.normalized_path;
    if (result.path_traversal_detected) traversalDetected = true;
    if (result.egress_domain !== null) egressDomain = result.egress_domain;
    if (result.egress_is_private_ip) privateIp = true;
    if (result.validator_id === "tool-pinning") {
      if (result.tool_pin_sha256 !== null) pinSha = result.tool_pin_sha256;
      pinVerified =
        pinVerified === null
          ? result.tool_pin_verified
          : pinVerified && result.tool_pin_verified;
    }
  }

  return {
    sql: {
      present: sqlPresent,
      verbs: [...verbs].sort(),
      tables: [...tables].sort(),
      isReadonly,
      statementCount,
    },
    path: { normalizedPath, traversalDetected },
    egress: { domain: egressDomain, privateIp },
    toolPin: { sha256: pinSha, verified: pinVerified },
    aggregate: { passed: allPassed, count: results.length },
    raw: results,
  };
}

/**
 * Resolve the route mode used to interpret a binary decision.
 *
 * Order: explicit envelope mode, then the route selected by canonical target
 * server URI, then fail-closed `enforce` for presentation only. The runtime
 * decision itself always comes from the evaluator.
 */
export function resolveRouteMode(
  explicitMode: RouteMode | undefined,
  targetServer: string,
  routeModes: readonly { readonly routeId: string; readonly mode: RouteMode }[],
): RouteMode {
  if (explicitMode !== undefined) return explicitMode;
  const match = routeModes.find((route) => route.routeId === targetServer);
  return match?.mode ?? "enforce";
}

export interface VerdictResolution {
  readonly verdict: PolicyVerdict | null;
  readonly source: "backend" | "derived" | "none";
}

/** Map a binary Cedar decision to the presentation verdict. */
export function resolveVerdict(
  decision: PolicyDecision | null,
  displayVerdict: PolicyVerdict | null | undefined,
  mode: RouteMode,
): VerdictResolution {
  if (displayVerdict !== undefined && displayVerdict !== null) {
    return { verdict: displayVerdict, source: "backend" };
  }
  if (decision === null) return { verdict: null, source: "none" };
  if (decision === "PERMIT") return { verdict: "ALLOW", source: "derived" };
  return {
    verdict: mode === "observe" ? "WOULD_DENY" : "DENY",
    source: "derived",
  };
}

/** A correlation id for support. Does not encode arguments or identity. */
let correlationCounter = 0;
export function newCorrelationId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return `dryrun-${cryptoApi.randomUUID()}`;
  }
  correlationCounter += 1;
  return `dryrun-local-${correlationCounter}`;
}

const diagnosticsFromBody = (
  body: DryRunResponseBody,
): readonly PolicyDiagnostic[] => {
  const fromValidation = (body.validation_errors ?? []).map((message) => ({
    code: "VALIDATION_ERROR",
    message,
  }));
  const structured = body.diagnostics ?? [];
  // Prefer structured diagnostics, then append verbatim messages that are not
  // already represented so nothing is silently dropped.
  const seen = new Set(structured.map((entry) => entry.message));
  return [
    ...structured,
    ...fromValidation.filter((entry) => !seen.has(entry.message)),
  ];
};

/** Build a successful/invalid result from a mapped wire response. */
export function resultFromDryRunResponse(
  body: DryRunResponseBody,
  context: {
    readonly adapterId: EvaluatorId;
    readonly routeMode: RouteMode;
    readonly warnings: readonly string[];
    readonly simulated?: boolean;
  },
): DryRunResult {
  const diagnostics = diagnosticsFromBody(body);
  const base = {
    matchedPolicyIds: body.matched_policy_ids ?? [],
    reason: body.reason ?? "",
    candidateVersion: body.version_would_be ?? null,
    activeVersion: body.active_version ?? null,
    evaluationLatencyUs: body.evaluation_latency_us ?? null,
    errorCategory: body.error_category ?? null,
    validatorFacts: normalizeValidatorResults(body.validator_results ?? []),
    diagnostics,
    affectedRoutes: body.affected_routes ?? [],
    affectedTools: body.affected_tools ?? [],
    contractWarnings: [...context.warnings],
    simulated: context.simulated ?? false,
    adapterId: context.adapterId,
    correlationId: newCorrelationId(),
  } as const;

  if (!body.valid) {
    return {
      ...base,
      status: "invalid",
      verdict: null,
      verdictSource: "none",
      decision: null,
      reason:
        base.reason.length > 0
          ? base.reason
          : "The candidate policy bundle did not validate. No decision was evaluated.",
    };
  }

  const decision = body.decision ?? null;
  if (decision === null) {
    const warnings = [
      ...base.contractWarnings,
      "Response has valid=true and no decision; expected PolicyResponse.decision.",
    ];
    return {
      ...base,
      status: "error",
      verdict: null,
      verdictSource: "none",
      decision: null,
      reason:
        "INCOMPLETE RESPONSE: the evaluator validated the bundle but returned no PERMIT/DENY decision. No verdict is displayed.",
      contractWarnings: warnings,
    };
  }

  const resolved = resolveVerdict(
    decision,
    body.display_verdict,
    context.routeMode,
  );
  const warnings = [...base.contractWarnings];
  if (resolved.source === "derived" && body.display_verdict === undefined) {
    warnings.push(
      "display_verdict absent; verdict derived from binary decision + route mode (Team 0 D4 pending).",
    );
  }

  return {
    ...base,
    status: "ok",
    verdict: resolved.verdict,
    verdictSource: resolved.source,
    decision,
    reason: base.reason.length > 0 ? base.reason : "Evaluator returned no reason string.",
    contractWarnings: warnings,
  };
}

/** Build a failure result with exact, deterministic micro-copy. */
export function failureResult(context: {
  readonly status: Extract<
    DryRunStatus,
    "timeout" | "unavailable" | "error" | "contract_mismatch"
  >;
  readonly reason: string;
  readonly adapterId: EvaluatorId;
  readonly warnings?: readonly string[];
  readonly simulated?: boolean;
  readonly activeVersion?: string | null;
  readonly candidateVersion?: string | null;
  readonly errorCategory?: PolicyErrorCategory | null;
}): DryRunResult {
  return {
    status: context.status,
    verdict: null,
    verdictSource: "none",
    decision: null,
    matchedPolicyIds: [],
    reason: context.reason,
    candidateVersion: context.candidateVersion ?? null,
    activeVersion: context.activeVersion ?? null,
    evaluationLatencyUs: null,
    errorCategory: context.errorCategory ?? null,
    validatorFacts: emptyValidatorFacts(),
    diagnostics: [],
    affectedRoutes: [],
    affectedTools: [],
    contractWarnings: context.warnings ?? [],
    simulated: context.simulated ?? false,
    adapterId: context.adapterId,
    correlationId: newCorrelationId(),
  };
}

export { LOCAL_POLICY_CONTRACT_VERSION };
