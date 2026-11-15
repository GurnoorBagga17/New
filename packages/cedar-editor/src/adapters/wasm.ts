import type {
  DryRunInput,
  DryRunResult,
  EvaluatorAdapter,
  PolicyDiagnostic,
  PolicyVerdict,
  ValidatorResult,
} from "../types.js";
import { LOCAL_POLICY_CONTRACT_VERSION } from "../types.js";
import {
  failureResult,
  resolveRouteMode,
  resultFromDryRunResponse,
} from "./result.js";

/**
 * Shape Team 2's `@axiom/cedar-wasm` package is expected to expose.
 *
 * This is a proposal (see `docs/team2-wasm-interface-proposal.md`). The adapter
 * is the only file that needs to change if Team 2 ships a different API.
 */
export interface CedarWasmDryRunInput {
  readonly schema: string;
  readonly policies: readonly { readonly id: string; readonly source: string }[];
  readonly envelope: DryRunInput["envelope"];
}

export interface CedarWasmDryRunOutput {
  readonly valid: boolean;
  readonly errors?: readonly string[];
  readonly version_would_be?: string;
  readonly active_version?: string;
  readonly decision?: "PERMIT" | "DENY" | null;
  readonly display_verdict?: PolicyVerdict | null;
  readonly matched_policy_ids?: readonly string[];
  readonly reason?: string;
  readonly evaluation_latency_us?: number;
  readonly validator_results?: readonly ValidatorResult[];
  readonly diagnostics?: readonly PolicyDiagnostic[];
}

export interface CedarWasmModule {
  /** Semantic version of the compiled WASM wrapper, shown in the inspector. */
  readonly moduleVersion: string;
  dryRun(input: CedarWasmDryRunInput): CedarWasmDryRunOutput | Promise<CedarWasmDryRunOutput>;
}

export type CedarWasmModuleLoader = () => Promise<CedarWasmModule>;

/**
 * In-browser evaluator used by the public `/playground`.
 *
 * Activation is intentionally unsupported: a browser sandbox has no active
 * bundle to hot reload.
 */
export function createWasmAdapter(
  loadModule: CedarWasmModuleLoader,
): EvaluatorAdapter {
  let modulePromise: Promise<CedarWasmModule> | null = null;

  const getModule = (): Promise<CedarWasmModule> => {
    if (modulePromise === null) {
      modulePromise = loadModule().catch((error: unknown) => {
        modulePromise = null;
        throw error;
      });
    }
    return modulePromise;
  };

  return {
    id: "wasm",
    capabilities: { dryRun: true, clientSide: true, activation: false },
    contractVersion: LOCAL_POLICY_CONTRACT_VERSION,
    async dryRun(
      input: DryRunInput,
      options?: { readonly signal?: AbortSignal },
    ): Promise<DryRunResult> {
      if (options?.signal?.aborted === true) {
        return failureResult({
          status: "error",
          reason: "SIMULATION CANCELLED: the previous evaluation was superseded.",
          adapterId: "wasm",
        });
      }

      let module: CedarWasmModule;
      try {
        module = await getModule();
      } catch (error) {
        return failureResult({
          status: "unavailable",
          reason: `WASM UNAVAILABLE: @axiom/cedar-wasm failed to load (${describe(error)}). In-browser evaluation is unavailable; no policy decision was produced.`,
          adapterId: "wasm",
        });
      }

      try {
        const output = await module.dryRun({
          schema: input.schema,
          policies: input.policies.map((policy) => ({
            id: policy.id,
            source: policy.source,
          })),
          envelope: input.envelope,
        });
        const routeMode = resolveRouteMode(
          input.envelope.runtime_mode,
          input.envelope.target_server,
          input.routeModes,
        );
        return resultFromDryRunResponse(
          {
            valid: output.valid,
            ...(output.errors !== undefined
              ? { validation_errors: output.errors }
              : {}),
            ...(output.version_would_be !== undefined
              ? { version_would_be: output.version_would_be }
              : {}),
            ...(output.active_version !== undefined
              ? { active_version: output.active_version }
              : {}),
            ...(output.decision !== undefined ? { decision: output.decision } : {}),
            ...(output.display_verdict !== undefined
              ? { display_verdict: output.display_verdict }
              : {}),
            ...(output.matched_policy_ids !== undefined
              ? { matched_policy_ids: output.matched_policy_ids }
              : {}),
            ...(output.reason !== undefined ? { reason: output.reason } : {}),
            ...(output.evaluation_latency_us !== undefined
              ? { evaluation_latency_us: output.evaluation_latency_us }
              : {}),
            ...(output.validator_results !== undefined
              ? { validator_results: output.validator_results }
              : {}),
            ...(output.diagnostics !== undefined
              ? { diagnostics: output.diagnostics }
              : {}),
          },
          {
            adapterId: "wasm",
            routeMode,
            warnings:
              output.valid && output.decision === undefined
                ? ["WASM module returned valid=true without a decision."]
                : [],
          },
        );
      } catch (error) {
        return failureResult({
          status: "error",
          reason: `WASM EVALUATION FAILED: ${describe(error)}. No policy decision was produced.`,
          adapterId: "wasm",
        });
      }
    },
  };
}

function describe(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) return error.message;
  return "unknown error";
}
