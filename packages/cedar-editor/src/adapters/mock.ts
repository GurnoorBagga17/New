import type {
  BundleActivationInput,
  BundleActivationResult,
  DryRunInput,
  DryRunResult,
  EvaluatorAdapter,
  ValidatorResult,
} from "../types.js";
import { LOCAL_POLICY_CONTRACT_VERSION, AXIOM_CEDAR_SCHEMA_VERSION } from "../types.js";
import type { DryRunResponseBody } from "../contracts/local-policy-api.js";
import {
  failureResult,
  resolveRouteMode,
  resultFromDryRunResponse,
} from "./result.js";

/** Scenarios available to the mock. Marked `simulated` in every result. */
export type MockScenario =
  | "allow"
  | "would-deny"
  | "deny"
  | "invalid"
  | "timeout"
  | "unavailable"
  | "contract-mismatch";

export type MockActivationScenario = "success" | "rejected" | "unavailable";

export interface MockAdapterOptions {
  readonly scenario?: MockScenario;
  readonly activationScenario?: MockActivationScenario;
  /** Optional deterministic delay. Fixtures are never benchmark evidence. */
  readonly delayMs?: number;
}

const ACTIVE_VERSION = `mock-active-bundle-${AXIOM_CEDAR_SCHEMA_VERSION}`;
const CANDIDATE_VERSION = `mock-candidate-bundle-${AXIOM_CEDAR_SCHEMA_VERSION}`;

function validatorResults(
  scenario: MockScenario,
): readonly ValidatorResult[] {
  const sql: ValidatorResult = {
    validator_id: "sql",
    passed: scenario !== "deny" && scenario !== "would-deny",
    violation_code:
      scenario === "deny" || scenario === "would-deny"
        ? "DESTRUCTIVE_SQL"
        : null,
    reason:
      scenario === "deny" || scenario === "would-deny"
        ? "Statement class DELETE is not in the configured allowlist."
        : null,
    sql_verbs: scenario === "deny" || scenario === "would-deny" ? ["DELETE"] : ["SELECT"],
    sql_tables: ["orders_mock"],
    sql_is_readonly: scenario !== "deny" && scenario !== "would-deny",
    sql_statement_count: 1,
    normalized_path: null,
    path_traversal_detected: false,
    egress_domain: null,
    egress_is_private_ip: false,
    tool_pin_sha256: null,
    tool_pin_verified: true,
  };
  const path: ValidatorResult = {
    validator_id: "filesystem",
    passed: true,
    violation_code: null,
    reason: null,
    sql_verbs: [],
    sql_tables: [],
    sql_is_readonly: false,
    sql_statement_count: 0,
    normalized_path: "/srv/axiom-mock/data/reports",
    path_traversal_detected: false,
    egress_domain: null,
    egress_is_private_ip: false,
    tool_pin_sha256: null,
    tool_pin_verified: true,
  };
  const egress: ValidatorResult = {
    validator_id: "egress",
    passed: true,
    violation_code: null,
    reason: null,
    sql_verbs: [],
    sql_tables: [],
    sql_is_readonly: false,
    sql_statement_count: 0,
    normalized_path: null,
    path_traversal_detected: false,
    egress_domain: "api.mock.invalid",
    egress_is_private_ip: false,
    tool_pin_sha256: null,
    tool_pin_verified: true,
  };
  const pin: ValidatorResult = {
    validator_id: "tool-pinning",
    passed: true,
    violation_code: null,
    reason: null,
    sql_verbs: [],
    sql_tables: [],
    sql_is_readonly: false,
    sql_statement_count: 0,
    normalized_path: null,
    path_traversal_detected: false,
    egress_domain: null,
    egress_is_private_ip: false,
    tool_pin_sha256: "MOCK-TOOL-PIN-NOT-A-REAL-DIGEST",
    tool_pin_verified: true,
  };
  return [sql, path, egress, pin];
}

function bodyForScenario(
  scenario: MockScenario,
  input: DryRunInput,
): DryRunResponseBody {
  const routeMode = resolveRouteMode(
    input.envelope.runtime_mode,
    input.envelope.target_server,
    input.routeModes,
  );
  const deny = scenario === "deny" || scenario === "would-deny";
  const body: DryRunResponseBody = {
    schema_version: LOCAL_POLICY_CONTRACT_VERSION,
    valid: scenario !== "invalid",
    version_would_be: CANDIDATE_VERSION,
    active_version: ACTIVE_VERSION,
    decision:
      scenario === "invalid" ? null : deny ? "DENY" : "PERMIT",
    matched_policy_ids: deny
      ? ["DENY_DESTRUCTIVE_SQL_MOCK"]
      : ["PERMIT_READONLY_SQL_MOCK"],
    reason: deny
      ? "SQL verb DELETE is not in the allowed verb set for route mcp://demo/analytics."
      : "All required validator evidence passed and the SQL verb set is within the allowlist.",
    error_category: null,
    validator_results: validatorResults(scenario),
    affected_routes: deny ? ["mcp://demo/analytics"] : [],
    affected_tools: deny ? ["execute_sql"] : [],
  };
  if (scenario === "invalid") {
    return {
      ...body,
      validation_errors: [
        "policy at line 7: unexpected token 'whe' (mock validation fixture)",
      ],
      matched_policy_ids: [],
      reason: "Mock fixture: candidate bundle did not validate.",
      affected_routes: [],
      affected_tools: [],
    };
  }
  if (scenario === "would-deny" && routeMode === "observe") {
    // The backend returns a binary DENY; D4 (explicit WouldDeny) is pending.
    return body;
  }
  return body;
}

/**
 * Deterministic mock evaluator for tests and Storybook.
 *
 * It is never selected implicitly. Every result carries `simulated: true`, and
 * the UI must label it `SIMULATED FIXTURE — not a benchmark`.
 */
export function createMockAdapter(
  options: MockAdapterOptions = {},
): EvaluatorAdapter {
  const scenario = options.scenario ?? "allow";
  const activationScenario = options.activationScenario ?? "success";
  const delayMs = options.delayMs ?? 0;

  const wait = async (signal: AbortSignal | undefined): Promise<boolean> => {
    if (delayMs <= 0) return signal?.aborted !== true;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, delayMs);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
    return signal?.aborted !== true;
  };

  return {
    id: "mock",
    capabilities: { dryRun: true, clientSide: true, activation: true },
    contractVersion: LOCAL_POLICY_CONTRACT_VERSION,
    async dryRun(
      input: DryRunInput,
      callOptions?: { readonly signal?: AbortSignal },
    ): Promise<DryRunResult> {
      const completed = await wait(callOptions?.signal);
      if (!completed) {
        return failureResult({
          status: "error",
          reason: "SIMULATION CANCELLED: the previous evaluation was superseded.",
          adapterId: "mock",
          simulated: true,
        });
      }

      if (scenario === "timeout") {
        return failureResult({
          status: "timeout",
          reason:
            "FAIL-CLOSED: ExtMCP policy service unreachable (timeout 15ms) — tool call blocked. [SIMULATED FIXTURE]",
          adapterId: "mock",
          simulated: true,
        });
      }
      if (scenario === "unavailable") {
        return failureResult({
          status: "unavailable",
          reason:
            "FAIL-CLOSED: /v1/local/policies/dry-run unavailable (HTTP 503) — no policy decision returned. [SIMULATED FIXTURE]",
          adapterId: "mock",
          simulated: true,
        });
      }
      if (scenario === "contract-mismatch") {
        return failureResult({
          status: "contract_mismatch",
          reason:
            "CONTRACT MISMATCH: $.valid expected a boolean. The response was not rendered. [SIMULATED FIXTURE]",
          adapterId: "mock",
          simulated: true,
          warnings: ['{"decision":"PERMIT","valid":"yes"}'],
        });
      }

      const routeMode = resolveRouteMode(
        input.envelope.runtime_mode,
        input.envelope.target_server,
        input.routeModes,
      );
      return resultFromDryRunResponse(bodyForScenario(scenario, input), {
        adapterId: "mock",
        routeMode,
        warnings: [
          "MOCK ADAPTER: payload is a typed fixture, not a backend response.",
        ],
        simulated: true,
      });
    },
    async activateBundle(
      input: BundleActivationInput,
      callOptions?: { readonly signal?: AbortSignal },
    ): Promise<BundleActivationResult> {
      const completed = await wait(callOptions?.signal);
      if (!completed) {
        return {
          activated: false,
          active: null,
          errors: ["SIMULATION CANCELLED: activation request was superseded."],
          diagnostics: [],
          affectedRoutes: [],
          affectedTools: [],
          contractWarnings: [],
          simulated: true,
        };
      }

      if (activationScenario === "rejected") {
        return {
          activated: false,
          active: null,
          errors: [
            "bundle rejected at line 12: policy set has no permit for action tools/call (mock server error)",
          ],
          diagnostics: [],
          affectedRoutes: [],
          affectedTools: [],
          contractWarnings: [],
          simulated: true,
        };
      }
      if (activationScenario === "unavailable") {
        return {
          activated: false,
          active: null,
          errors: [
            "HOT RELOAD FAILED: /v1/local/policies/bundle unreachable (mock network error). The live bundle was not changed.",
          ],
          diagnostics: [],
          affectedRoutes: [],
          affectedTools: [],
          contractWarnings: [],
          simulated: true,
        };
      }
      return {
        activated: true,
        active: {
          version: input.expectedCandidateVersion ?? CANDIDATE_VERSION,
          policyCount: input.policies.length,
          loadedAtUnix: 1_700_000_000,
        },
        errors: [],
        diagnostics: [],
        affectedRoutes: input.routeModes.map((route) => route.routeId),
        affectedTools: [],
        contractWarnings: [
          "MOCK ADAPTER: activation payload is a typed fixture.",
        ],
        simulated: true,
      };
    },
  };
}
