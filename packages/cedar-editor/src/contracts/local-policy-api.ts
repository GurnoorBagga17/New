/**
 * PROPOSED wire types for `POST /v1/local/policies/dry-run` and
 * `PUT /v1/local/policies/bundle`.
 *
 * Status: **proposal, not frozen.** Team 0 owns `docs/api-contracts/`; the
 * repository currently only marks the contract `0.1.0-draft` and does not
 * publish JSON schemas. These shapes are derived from the concrete Rust
 * structs that exist today:
 *
 * - `services/extmcp/policy-api/src/lib.rs`  (`ValidationReport`, `PolicyVersionInfo`)
 * - `services/extmcp/authorization/src/lib.rs` (`ValidatorResult`, `PolicyResponse`, `Decision`, `ErrorCategory`)
 * - `services/extmcp/cedar/src/schema.rs` (`axiom.cedarschema`, default policy ids)
 *
 * The UI never reads a field that is not listed here. If the real backend
 * differs, {@link assertDryRunResponse} and {@link assertActivationResponse}
 * surface a `CONTRACT_MISMATCH` with the offending field path; the fix belongs
 * in `src/contracts/local-policy-api.ts` only.
 */

export const DRY_RUN_PATH = "/v1/local/policies/dry-run";
export const BUNDLE_PATH = "/v1/local/policies/bundle";

import type {
  ActiveBundleInfo,
  PolicyDecision,
  PolicyDiagnostic,
  PolicyErrorCategory,
  PolicyVerdict,
  RouteMode,
  ValidatorResult,
} from "../types.js";

/** Request body proposal. */
export interface DryRunRequestBody {
  readonly schema_version: string;
  readonly policies: readonly { readonly id: string; readonly source: string }[];
  readonly schema: string;
  readonly envelope: {
    readonly mcp_method: "tools/call";
    readonly target_server: string;
    readonly tool_name: string;
    readonly raw_arguments: Readonly<Record<string, unknown>>;
    readonly agent: {
      readonly agent_id: string;
      readonly client_id: string;
      readonly cimd_uri?: string;
      readonly issuer?: string;
      readonly scopes?: readonly string[];
      readonly authenticated?: boolean;
    };
    readonly runtime_mode?: RouteMode;
  };
}

/** Response body proposal. */
export interface DryRunResponseBody {
  readonly schema_version?: string;
  readonly valid: boolean;
  /** From `ValidationReport.errors` (`Vec<String>`, verbatim). */
  readonly validation_errors?: readonly string[];
  /** Candidate SHA-256 (`ValidationReport.version_would_be`). */
  readonly version_would_be?: string;
  /** Active bundle SHA-256, if the endpoint reports it. */
  readonly active_version?: string;
  /** From `PolicyResponse.decision`. */
  readonly decision?: PolicyDecision | null;
  /** Optional explicit display verdict. Preferred when present. */
  readonly display_verdict?: PolicyVerdict | null;
  readonly matched_policy_ids?: readonly string[];
  readonly reason?: string;
  readonly evaluation_latency_us?: number;
  readonly error_category?: PolicyErrorCategory | null;
  /** From `ValidatorResult[]`. */
  readonly validator_results?: readonly ValidatorResult[];
  /** Structured diagnostics; `validation_errors` remain the verbatim channel. */
  readonly diagnostics?: readonly PolicyDiagnostic[];
  /** Blast radius is optional: only render it when the server sends it. */
  readonly affected_routes?: readonly string[];
  readonly affected_tools?: readonly string[];
}

/** Bundle activation request body proposal. */
export interface BundleRequestBody {
  readonly schema_version: string;
  readonly policies: readonly { readonly id: string; readonly source: string }[];
  readonly schema: string;
  readonly routes: readonly { readonly route_id: string; readonly mode: RouteMode }[];
  /** Optimistic concurrency: reject if the live bundle moved. */
  readonly expected_candidate_version: string | null;
}

/** Bundle activation response body proposal. */
export interface BundleResponseBody {
  readonly activated: boolean;
  readonly active?: ActiveBundleInfo;
  /** Server validation errors, verbatim. */
  readonly errors?: readonly string[];
  readonly diagnostics?: readonly PolicyDiagnostic[];
  readonly affected_routes?: readonly string[];
  readonly affected_tools?: readonly string[];
}

/** Thrown when the backend payload cannot be mapped without guessing. */
export class ContractMismatchError extends Error {
  override readonly name = "ContractMismatchError";

  constructor(
    readonly endpoint: string,
    readonly fieldPath: string,
    readonly detail: string,
    readonly payloadExcerpt: string,
  ) {
    super(`${endpoint}: contract mismatch at '${fieldPath}': ${detail}`);
  }
}

export interface ShapeCheck<T> {
  readonly value: T;
  readonly warnings: readonly string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const excerpt = (payload: unknown): string => {
  let text: string;
  try {
    text = JSON.stringify(payload) ?? String(payload);
  } catch {
    text = String(payload);
  }
  return text.length > 512 ? `${text.slice(0, 512)}…` : text;
};

const requireRecord = (
  endpoint: string,
  payload: unknown,
  fieldPath: string,
): Record<string, unknown> => {
  if (!isRecord(payload)) {
    throw new ContractMismatchError(
      endpoint,
      fieldPath,
      "expected a JSON object",
      excerpt(payload),
    );
  }
  return payload;
};

const optionalString = (
  record: Record<string, unknown>,
  key: string,
  warnings: string[],
): string | undefined => {
  const value = record[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    warnings.push(`'${key}' should be a string; received ${typeof value}`);
    return undefined;
  }
  return value;
};

const optionalBoolean = (
  record: Record<string, unknown>,
  key: string,
  warnings: string[],
): boolean | undefined => {
  const value = record[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") {
    warnings.push(`'${key}' should be a boolean; received ${typeof value}`);
    return undefined;
  }
  return value;
};

const optionalNumber = (
  record: Record<string, unknown>,
  key: string,
  warnings: string[],
): number | undefined => {
  const value = record[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    warnings.push(`'${key}' should be a finite number; received ${typeof value}`);
    return undefined;
  }
  return value;
};

const stringArray = (
  record: Record<string, unknown>,
  key: string,
  warnings: string[],
): readonly string[] => {
  const value = record[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    warnings.push(`'${key}' should be an array of strings`);
    return [];
  }
  return value as string[];
};

/**
 * Validate the dry-run response without silently coercing unknown shapes.
 *
 * `valid` is the only required field because it is the only one that exists in
 * the concrete Rust `ValidationReport`. Missing optional fields become
 * warnings, never invented values.
 */
export function assertDryRunResponse(
  payload: unknown,
): ShapeCheck<DryRunResponseBody> {
  const warnings: string[] = [];
  const record = requireRecord(DRY_RUN_PATH, payload, "$");

  if (typeof record["valid"] !== "boolean") {
    throw new ContractMismatchError(
      DRY_RUN_PATH,
      "$.valid",
      "expected a boolean (ValidationReport.valid)",
      excerpt(payload),
    );
  }

  const decision = record["decision"];
  if (
    decision !== undefined &&
    decision !== null &&
    decision !== "PERMIT" &&
    decision !== "DENY"
  ) {
    throw new ContractMismatchError(
      DRY_RUN_PATH,
      "$.decision",
      "expected 'PERMIT' | 'DENY' | null",
      excerpt(payload),
    );
  }

  const displayVerdict = record["display_verdict"];
  if (
    displayVerdict !== undefined &&
    displayVerdict !== null &&
    displayVerdict !== "ALLOW" &&
    displayVerdict !== "WOULD_DENY" &&
    displayVerdict !== "DENY"
  ) {
    throw new ContractMismatchError(
      DRY_RUN_PATH,
      "$.display_verdict",
      "expected 'ALLOW' | 'WOULD_DENY' | 'DENY' | null",
      excerpt(payload),
    );
  }

  const rawValidators = record["validator_results"];
  const validatorResults: ValidatorResult[] = [];
  if (rawValidators !== undefined && rawValidators !== null) {
    if (!Array.isArray(rawValidators)) {
      warnings.push("'validator_results' should be an array");
    } else {
      rawValidators.forEach((entry, index) => {
        const mapped = mapValidatorResult(entry, warnings, index);
        if (mapped !== null) validatorResults.push(mapped);
      });
    }
  }

  const rawDiagnostics = record["diagnostics"];
  const diagnostics: PolicyDiagnostic[] = [];
  if (rawDiagnostics !== undefined && rawDiagnostics !== null) {
    if (!Array.isArray(rawDiagnostics)) {
      warnings.push("'diagnostics' should be an array");
    } else {
      rawDiagnostics.forEach((entry, index) => {
        if (!isRecord(entry) || typeof entry["message"] !== "string") {
          warnings.push(`'diagnostics[${index}]' is missing a string message`);
          return;
        }
        diagnostics.push({
          code:
            typeof entry["code"] === "string" ? entry["code"] : "POLICY_ERROR",
          message: entry["message"],
          ...(typeof entry["policy_id"] === "string"
            ? { policy_id: entry["policy_id"] }
            : {}),
          ...(typeof entry["line"] === "number" ? { line: entry["line"] } : {}),
          ...(typeof entry["column"] === "number"
            ? { column: entry["column"] }
            : {}),
          ...(typeof entry["end_line"] === "number"
            ? { end_line: entry["end_line"] }
            : {}),
          ...(typeof entry["end_column"] === "number"
            ? { end_column: entry["end_column"] }
            : {}),
        });
      });
    }
  }

  const schemaVersion = optionalString(record, "schema_version", warnings);
  const versionWouldBe = optionalString(record, "version_would_be", warnings);
  const activeVersion = optionalString(record, "active_version", warnings);
  const reason = optionalString(record, "reason", warnings);
  const latency = optionalNumber(record, "evaluation_latency_us", warnings);

  const parsed: DryRunResponseBody = {
    valid: record["valid"],
    ...(schemaVersion !== undefined ? { schema_version: schemaVersion } : {}),
    ...(record["validation_errors"] !== undefined
      ? { validation_errors: stringArray(record, "validation_errors", warnings) }
      : {}),
    ...(versionWouldBe !== undefined
      ? { version_would_be: versionWouldBe }
      : {}),
    ...(activeVersion !== undefined ? { active_version: activeVersion } : {}),
    ...(decision === undefined
      ? {}
      : { decision: decision as PolicyDecision | null }),
    ...(displayVerdict === undefined
      ? {}
      : { display_verdict: displayVerdict as PolicyVerdict | null }),
    ...(record["matched_policy_ids"] !== undefined
      ? { matched_policy_ids: stringArray(record, "matched_policy_ids", warnings) }
      : {}),
    ...(reason !== undefined ? { reason } : {}),
    ...(latency !== undefined ? { evaluation_latency_us: latency } : {}),
    ...(record["error_category"] === undefined
      ? {}
      : {
          error_category: record["error_category"] as PolicyErrorCategory | null,
        }),
    ...(record["validator_results"] !== undefined
      ? { validator_results: validatorResults }
      : {}),
    ...(record["diagnostics"] !== undefined ? { diagnostics } : {}),
    ...(record["affected_routes"] !== undefined
      ? { affected_routes: stringArray(record, "affected_routes", warnings) }
      : {}),
    ...(record["affected_tools"] !== undefined
      ? { affected_tools: stringArray(record, "affected_tools", warnings) }
      : {}),
  };

  return { value: parsed, warnings };
}

function mapValidatorResult(
  entry: unknown,
  warnings: string[],
  index: number,
): ValidatorResult | null {
  if (!isRecord(entry)) {
    warnings.push(`'validator_results[${index}]' is not an object`);
    return null;
  }
  if (typeof entry["validator_id"] !== "string") {
    warnings.push(
      `'validator_results[${index}].validator_id' should be a string`,
    );
    return null;
  }
  if (typeof entry["passed"] !== "boolean") {
    warnings.push(`'validator_results[${index}].passed' should be a boolean`);
    return null;
  }

  const local: string[] = [];
  const mapped: ValidatorResult = {
    validator_id: entry["validator_id"],
    passed: entry["passed"],
    violation_code: optionalString(entry, "violation_code", local) ?? null,
    reason: optionalString(entry, "reason", local) ?? null,
    sql_verbs: stringArray(entry, "sql_verbs", local),
    sql_tables: stringArray(entry, "sql_tables", local),
    sql_is_readonly: optionalBoolean(entry, "sql_is_readonly", local) ?? false,
    sql_statement_count:
      optionalNumber(entry, "sql_statement_count", local) ?? 0,
    normalized_path: optionalString(entry, "normalized_path", local) ?? null,
    path_traversal_detected:
      optionalBoolean(entry, "path_traversal_detected", local) ?? false,
    egress_domain: optionalString(entry, "egress_domain", local) ?? null,
    egress_is_private_ip:
      optionalBoolean(entry, "egress_is_private_ip", local) ?? false,
    tool_pin_sha256: optionalString(entry, "tool_pin_sha256", local) ?? null,
    tool_pin_verified:
      optionalBoolean(entry, "tool_pin_verified", local) ?? false,
  };
  warnings.push(...local.map((line) => `validator_results[${index}]: ${line}`));
  return mapped;
}

/** Validate a bundle activation response. `activated` is required. */
export function assertActivationResponse(
  payload: unknown,
): ShapeCheck<BundleResponseBody> {
  const warnings: string[] = [];
  const record = requireRecord(BUNDLE_PATH, payload, "$");

  if (typeof record["activated"] !== "boolean") {
    throw new ContractMismatchError(
      BUNDLE_PATH,
      "$.activated",
      "expected a boolean",
      excerpt(payload),
    );
  }

  let active: ActiveBundleInfo | undefined;
  if (record["active"] !== undefined && record["active"] !== null) {
    if (!isRecord(record["active"])) {
      warnings.push("'active' should be an object");
    } else {
      const activeRecord = record["active"];
      if (
        typeof activeRecord["version"] !== "string" ||
        typeof activeRecord["policy_count"] !== "number" ||
        typeof activeRecord["loaded_at_unix"] !== "number"
      ) {
        warnings.push(
          "'active' must include string version, number policy_count and number loaded_at_unix (PolicyVersionInfo)",
        );
      } else {
        active = {
          version: activeRecord["version"],
          policyCount: activeRecord["policy_count"],
          loadedAtUnix: activeRecord["loaded_at_unix"],
        };
      }
    }
  }

  return {
    value: {
      activated: record["activated"],
      ...(active !== undefined ? { active } : {}),
      ...(record["errors"] !== undefined
        ? { errors: stringArray(record, "errors", warnings) }
        : {}),
      ...(record["diagnostics"] !== undefined && Array.isArray(record["diagnostics"])
        ? {
            diagnostics: record["diagnostics"].flatMap((entry) => {
              if (!isRecord(entry) || typeof entry["message"] !== "string") {
                warnings.push("'diagnostics' entry is missing a string message");
                return [];
              }
              return [
                {
                  code:
                    typeof entry["code"] === "string"
                      ? entry["code"]
                      : "POLICY_ERROR",
                  message: entry["message"],
                  ...(typeof entry["policy_id"] === "string"
                    ? { policy_id: entry["policy_id"] }
                    : {}),
                  ...(typeof entry["line"] === "number"
                    ? { line: entry["line"] }
                    : {}),
                  ...(typeof entry["column"] === "number"
                    ? { column: entry["column"] }
                    : {}),
                } satisfies PolicyDiagnostic,
              ];
            }),
          }
        : {}),
      ...(record["affected_routes"] !== undefined
        ? { affected_routes: stringArray(record, "affected_routes", warnings) }
        : {}),
      ...(record["affected_tools"] !== undefined
        ? { affected_tools: stringArray(record, "affected_tools", warnings) }
        : {}),
    },
    warnings,
  };
}
