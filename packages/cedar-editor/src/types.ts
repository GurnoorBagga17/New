/**
 * Public domain types for `@axiom/cedar-editor`.
 *
 * These types are the single result shape consumed by:
 * - `apps/gateway-ui/src/modules/policy-studio` (Module 1C)
 * - the public `/playground` (Team 8) using the same editor API with the WASM adapter
 *
 * Contract status: `0.1.0-draft`. The `/v1/local/policies/dry-run` wire schema
 * is not frozen by Team 0 yet. See `docs/team0-contract-proposal.md`.
 */

/** Stable identifier for the wire contract this package was written against. */
export const LOCAL_POLICY_CONTRACT_VERSION = "0.1.0-draft";

/** Cedar schema version mirrored from `services/extmcp/cedar/src/schema.rs`. */
export const AXIOM_CEDAR_SCHEMA_VERSION = "0.1.0-draft";

/** Runtime mode assigned per route by the gateway. */
export type RouteMode = "observe" | "enforce";

/** Binary decision returned by the Cedar engine (`Decision` in Rust). */
export type PolicyDecision = "PERMIT" | "DENY";

/**
 * Presentation verdict.
 *
 * `WOULD_DENY` is derived from `DENY` + an observe-only route mode. Team 0
 * decision D4 ("WouldDeny source of truth") is still open; when the backend
 * starts returning an explicit verdict we prefer `display_verdict` and mark the
 * source as `backend`.
 */
export type PolicyVerdict = "ALLOW" | "WOULD_DENY" | "DENY";

/** Error categories mirrored from `ErrorCategory` in the Rust authorization crate. */
export type PolicyErrorCategory =
  | "REVOKED"
  | "AUTHENTICATION_FAILURE"
  | "VALIDATOR_FAILURE"
  | "POLICY_ENGINE_ERROR"
  | "INTERNAL_ERROR";

/** A candidate policy document. `id` is a UI-local stable name, not a server id. */
export interface CandidatePolicySource {
  readonly id: string;
  readonly source: string;
}

/** MCP `tools/call` envelope fields consumed by a dry-run evaluation. */
export interface DryRunEnvelope {
  readonly mcp_method: "tools/call";
  /** Configured canonical MCP resource URI, e.g. `mcp://demo/analytics`. */
  readonly target_server: string;
  readonly tool_name: string;
  readonly raw_arguments: Readonly<Record<string, unknown>>;
  /** Fake or redacted metadata only. Never an Authorization header or token. */
  readonly agent: {
    readonly agent_id: string;
    readonly client_id: string;
    readonly cimd_uri?: string;
    readonly issuer?: string;
    readonly scopes?: readonly string[];
    readonly authenticated?: boolean;
  };
  readonly runtime_mode?: RouteMode;
}

/** Structured validator facts, mirroring the Rust `ValidatorResult` shape. */
export interface ValidatorResult {
  readonly validator_id: string;
  readonly passed: boolean;
  readonly violation_code: string | null;
  readonly reason: string | null;
  readonly sql_verbs: readonly string[];
  readonly sql_tables: readonly string[];
  readonly sql_is_readonly: boolean;
  readonly sql_statement_count: number;
  readonly normalized_path: string | null;
  readonly path_traversal_detected: boolean;
  readonly egress_domain: string | null;
  readonly egress_is_private_ip: boolean;
  readonly tool_pin_sha256: string | null;
  readonly tool_pin_verified: boolean;
}

/** A policy-validation diagnostic. Line/column are 1-based when present. */
export interface PolicyDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly policy_id?: string;
  readonly line?: number;
  readonly column?: number;
  readonly end_line?: number;
  readonly end_column?: number;
}

/** Normalised validator facts for rendering. No client-side SQL/path parsing. */
export interface ValidatorFacts {
  readonly sql: {
    readonly present: boolean;
    readonly verbs: readonly string[];
    readonly tables: readonly string[];
    readonly isReadonly: boolean | null;
    readonly statementCount: number;
  };
  readonly path: {
    readonly normalizedPath: string | null;
    readonly traversalDetected: boolean;
  };
  readonly egress: {
    readonly domain: string | null;
    readonly privateIp: boolean;
  };
  readonly toolPin: {
    readonly sha256: string | null;
    readonly verified: boolean | null;
  };
  readonly aggregate: {
    readonly passed: boolean;
    readonly count: number;
  };
  readonly raw: readonly ValidatorResult[];
}

/** Failure taxonomy of an evaluation attempt. */
export type DryRunStatus =
  | "ok"
  | "invalid"
  | "timeout"
  | "unavailable"
  | "contract_mismatch"
  | "error";

/**
 * The single result type returned by every {@link EvaluatorAdapter}.
 *
 * A consumer must be able to render the same UI whether the result came from
 * the backend, the WASM module, or a marked mock fixture.
 */
export interface DryRunResult {
  readonly status: DryRunStatus;
  readonly verdict: PolicyVerdict | null;
  /** `backend` when the server sent `display_verdict`; `derived` otherwise. */
  readonly verdictSource: "backend" | "derived" | "none";
  readonly decision: PolicyDecision | null;
  readonly matchedPolicyIds: readonly string[];
  readonly reason: string;
  /** Candidate SHA-256 reported by the evaluator, if any. */
  readonly candidateVersion: string | null;
  /** Active bundle SHA-256 reported by the evaluator, if any. */
  readonly activeVersion: string | null;
  /** Cedar engine time in microseconds, as reported by the evaluator. */
  readonly evaluationLatencyUs: number | null;
  readonly errorCategory: PolicyErrorCategory | null;
  readonly validatorFacts: ValidatorFacts;
  /** Policy errors rendered verbatim. */
  readonly diagnostics: readonly PolicyDiagnostic[];
  /** Blast radius is display-only and only shown when the backend returns it. */
  readonly affectedRoutes: readonly string[];
  readonly affectedTools: readonly string[];
  /** Non-fatal wire-shape warnings. A non-empty list is a Team 0 action item. */
  readonly contractWarnings: readonly string[];
  /** True when a mock fixture produced this result. Never a benchmark. */
  readonly simulated: boolean;
  /** Evaluator identifier for the inspector footer. */
  readonly adapterId: EvaluatorId;
  /** Redacted request correlation id for support; never includes arguments. */
  readonly correlationId: string;
}

/** Identifiers of the supported evaluator implementations. */
export type EvaluatorId = "backend-dry-run" | "wasm" | "mock";

/** Per-route mode selection included in a bundle activation request. */
export interface RouteModeSelection {
  readonly routeId: string;
  readonly mode: RouteMode;
}

/** Input shared by every evaluator implementation. */
export interface DryRunInput {
  readonly policies: readonly CandidatePolicySource[];
  /** `axiom.cedarschema` source. */
  readonly schema: string;
  readonly envelope: DryRunEnvelope;
  /** Current per-route modes, for verdict derivation. */
  readonly routeModes: readonly RouteModeSelection[];
}

/** Bundle activation input. */
export interface BundleActivationInput {
  readonly policies: readonly CandidatePolicySource[];
  readonly schema: string;
  readonly routeModes: readonly RouteModeSelection[];
  /** Optimistic concurrency token: the candidate version the operator reviewed. */
  readonly expectedCandidateVersion: string | null;
}

/** Active bundle metadata, mirroring Rust `PolicyVersionInfo`. */
export interface ActiveBundleInfo {
  readonly version: string;
  readonly policyCount: number;
  readonly loadedAtUnix: number;
}

/** Result of a bundle hot reload. */
export interface BundleActivationResult {
  readonly activated: boolean;
  readonly active: ActiveBundleInfo | null;
  /** Server validation errors, verbatim. Never rewritten by the UI. */
  readonly errors: readonly string[];
  readonly diagnostics: readonly PolicyDiagnostic[];
  readonly affectedRoutes: readonly string[];
  readonly affectedTools: readonly string[];
  readonly contractWarnings: readonly string[];
  readonly simulated: boolean;
}

/** Options accepted by every adapter call. */
export interface AdapterCallOptions {
  readonly signal?: AbortSignal;
}

/**
 * Pluggable evaluator API. Both implementations must return the same shape.
 */
export interface EvaluatorAdapter {
  readonly id: EvaluatorId;
  readonly capabilities: {
    readonly dryRun: true;
    /** True only for in-browser evaluation. */
    readonly clientSide: boolean;
    readonly activation: boolean;
  };
  readonly contractVersion: string;
  dryRun(input: DryRunInput, options?: AdapterCallOptions): Promise<DryRunResult>;
  /** Implemented only when `capabilities.activation` is true. */
  activateBundle?(
    input: BundleActivationInput,
    options?: AdapterCallOptions,
  ): Promise<BundleActivationResult>;
}
