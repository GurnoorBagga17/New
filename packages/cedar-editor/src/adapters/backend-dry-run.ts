import type {
  BundleActivationInput,
  BundleActivationResult,
  DryRunInput,
  DryRunResult,
  EvaluatorAdapter,
} from "../types.js";
import {
  BUNDLE_PATH,
  ContractMismatchError,
  DRY_RUN_PATH,
  assertActivationResponse,
  assertDryRunResponse,
  type BundleRequestBody,
  type DryRunRequestBody,
} from "../contracts/local-policy-api.js";
import { LOCAL_POLICY_CONTRACT_VERSION } from "../types.js";
import {
  failureResult,
  newCorrelationId,
  resolveRouteMode,
  resultFromDryRunResponse,
} from "./result.js";

export interface BackendAdapterOptions {
  /**
   * Same-origin path prefix. Defaults to `""`. Absolute URLs are rejected so
   * `apps/gateway-ui` can never be pointed at a non-loopback origin.
   */
  readonly basePath?: string;
  readonly fetchImpl?: typeof fetch;
  /** Request-level budget; the backend owns the 15 ms ExtMCP callout. */
  readonly requestTimeoutMs?: number;
  readonly maxResponseBytes?: number;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 3_000;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

function assertSameOriginPath(path: string): void {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error(
      `BackendAdapter basePath must be a same-origin absolute path beginning with a single '/'. Received '${path}'.`,
    );
  }
}

function timeoutError(): DOMException {
  return new DOMException("Request budget elapsed", "TimeoutError");
}

/**
 * Backend dry-run adapter for `apps/gateway-ui`.
 *
 * - same-origin `/v1/local/*` only
 * - `credentials: "same-origin"`, `cache: "no-store"`
 * - never touches localStorage/sessionStorage
 * - never sends or logs an Authorization header
 */
export function createBackendDryRunAdapter(
  options: BackendAdapterOptions = {},
): EvaluatorAdapter {
  const basePath = options.basePath ?? "";
  if (basePath.length > 0) assertSameOriginPath(basePath);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const requestTimeoutMs =
    options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;

  const post = async (
    path: string,
    method: "POST" | "PUT",
    body: unknown,
    signal: AbortSignal | undefined,
  ): Promise<{ response: Response; payload: unknown }> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(timeoutError()), requestTimeoutMs);
    const onAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const response = await fetchImpl(`${basePath}${path}`, {
        method,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
        credentials: "same-origin",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
      const lengthHeader = response.headers.get("content-length");
      if (lengthHeader !== null && Number(lengthHeader) > maxResponseBytes) {
        throw new ContractMismatchError(
          path,
          "$",
          `response exceeds ${maxResponseBytes} bytes`,
          `<content-length ${lengthHeader}>`,
        );
      }
      const text = await response.text();
      if (text.length > maxResponseBytes) {
        throw new ContractMismatchError(
          path,
          "$",
          `response exceeds ${maxResponseBytes} bytes`,
          text.slice(0, 512),
        );
      }
      let payload: unknown = null;
      if (text.trim().length > 0) {
        try {
          payload = JSON.parse(text);
        } catch {
          throw new ContractMismatchError(
            path,
            "$",
            "expected a JSON response body",
            text,
          );
        }
      }
      return { response, payload };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  };

  const dryRun = async (
    input: DryRunInput,
    callOptions?: { readonly signal?: AbortSignal },
  ): Promise<DryRunResult> => {
    if (!input.envelope.target_server.trim() || !input.envelope.tool_name.trim()) {
      return failureResult({
        status: "error",
        reason:
          "INVALID DRY-RUN INPUT: target_server and tool_name are required. No request was sent.",
        adapterId: "backend-dry-run",
      });
    }
    if (input.policies.length === 0) {
      return failureResult({
        status: "error",
        reason:
          "INVALID DRY-RUN INPUT: at least one candidate policy is required. No request was sent.",
        adapterId: "backend-dry-run",
      });
    }

    const body: DryRunRequestBody = {
      schema_version: LOCAL_POLICY_CONTRACT_VERSION,
      policies: input.policies.map((policy) => ({
        id: policy.id,
        source: policy.source,
      })),
      schema: input.schema,
      envelope: {
        mcp_method: "tools/call",
        target_server: input.envelope.target_server,
        tool_name: input.envelope.tool_name,
        raw_arguments: input.envelope.raw_arguments,
        agent: input.envelope.agent,
        ...(input.envelope.runtime_mode !== undefined
          ? { runtime_mode: input.envelope.runtime_mode }
          : {}),
      },
    };

    const routeMode = resolveRouteMode(
      input.envelope.runtime_mode,
      input.envelope.target_server,
      input.routeModes,
    );

    try {
      const { response, payload } = await post(
        DRY_RUN_PATH,
        "POST",
        body,
        callOptions?.signal,
      );

      // A validation rejection may still be a valid ValidationReport body.
      if (
        !response.ok &&
        !(typeof payload === "object" && payload !== null && "valid" in payload)
      ) {
        const errors = extractErrors(payload);
        const status =
          response.status === 408 || response.status === 504
            ? "timeout"
            : response.status === 502 || response.status === 503
              ? "unavailable"
              : "error";
        return failureResult({
          status,
          reason:
            status === "timeout"
              ? `FAIL-CLOSED: ${DRY_RUN_PATH} timed out (HTTP ${response.status}) — no policy decision returned.`
              : status === "unavailable"
                ? `FAIL-CLOSED: ${DRY_RUN_PATH} unavailable (HTTP ${response.status}) — no policy decision returned.`
                : `DRY-RUN FAILED: ${DRY_RUN_PATH} returned HTTP ${response.status} — no policy decision returned.`,
          adapterId: "backend-dry-run",
          warnings: errors,
        });
      }

      const checked = assertDryRunResponse(payload);
      return resultFromDryRunResponse(checked.value, {
        adapterId: "backend-dry-run",
        routeMode,
        warnings: checked.warnings,
      });
    } catch (error) {
      if (error instanceof ContractMismatchError) {
        return failureResult({
          status: "contract_mismatch",
          reason: `CONTRACT MISMATCH: ${error.message}. The response was not rendered. Report this payload to Team 0.`,
          adapterId: "backend-dry-run",
          warnings: [error.payloadExcerpt],
        });
      }
      if (isAbortLike(error)) {
        const callerAborted = callOptions?.signal?.aborted === true;
        return failureResult({
          status: callerAborted ? "error" : "timeout",
          reason: callerAborted
            ? "SIMULATION CANCELLED: the previous evaluation was superseded by a newer request."
            : `FAIL-CLOSED: ${DRY_RUN_PATH} did not respond within ${requestTimeoutMs} ms — no policy decision returned.`,
          adapterId: "backend-dry-run",
        });
      }
      return failureResult({
        status: "unavailable",
        reason: `FAIL-CLOSED: ${DRY_RUN_PATH} unreachable (${describeNetworkError(error)}) — no policy decision returned.`,
        adapterId: "backend-dry-run",
      });
    }
  };

  const activateBundle = async (
    input: BundleActivationInput,
    callOptions?: { readonly signal?: AbortSignal },
  ): Promise<BundleActivationResult> => {
    const body: BundleRequestBody = {
      schema_version: LOCAL_POLICY_CONTRACT_VERSION,
      policies: input.policies.map((policy) => ({
        id: policy.id,
        source: policy.source,
      })),
      schema: input.schema,
      routes: input.routeModes.map((route) => ({
        route_id: route.routeId,
        mode: route.mode,
      })),
      expected_candidate_version: input.expectedCandidateVersion,
    };

    try {
      const { response, payload } = await post(
        BUNDLE_PATH,
        "PUT",
        body,
        callOptions?.signal,
      );
      if (!response.ok) {
        const errors = extractErrors(payload);
        return {
          activated: false,
          active: null,
          errors:
            errors.length > 0
              ? errors
              : [
                  `HOT RELOAD REJECTED: ${BUNDLE_PATH} returned HTTP ${response.status}.`,
                ],
          diagnostics: [],
          affectedRoutes: [],
          affectedTools: [],
          contractWarnings: [],
          simulated: false,
        };
      }
      const checked = assertActivationResponse(payload);
      return {
        activated: checked.value.activated,
        active: checked.value.active ?? null,
        errors: checked.value.errors ?? [],
        diagnostics: checked.value.diagnostics ?? [],
        affectedRoutes: checked.value.affected_routes ?? [],
        affectedTools: checked.value.affected_tools ?? [],
        contractWarnings: checked.warnings,
        simulated: false,
      };
    } catch (error) {
      if (error instanceof ContractMismatchError) {
        return {
          activated: false,
          active: null,
          errors: [
            `CONTRACT MISMATCH: ${error.message}. The live bundle was not changed.`,
          ],
          diagnostics: [],
          affectedRoutes: [],
          affectedTools: [],
          contractWarnings: [error.payloadExcerpt],
          simulated: false,
        };
      }
      return {
        activated: false,
        active: null,
        errors: [
          isAbortLike(error)
            ? `HOT RELOAD TIMEOUT: ${BUNDLE_PATH} did not respond within ${requestTimeoutMs} ms. The live bundle was not changed.`
            : `HOT RELOAD FAILED: ${BUNDLE_PATH} unreachable (${describeNetworkError(error)}). The live bundle was not changed.`,
        ],
        diagnostics: [],
        affectedRoutes: [],
        affectedTools: [],
        contractWarnings: [],
        simulated: false,
      };
    }
  };

  return {
    id: "backend-dry-run",
    capabilities: { dryRun: true, clientSide: false, activation: true },
    contractVersion: LOCAL_POLICY_CONTRACT_VERSION,
    dryRun,
    activateBundle,
  };
}

/** Exposed for adapter contract tests. */
export function correlationForTest(): string {
  return newCorrelationId();
}

function extractErrors(payload: unknown): string[] {
  if (typeof payload !== "object" || payload === null) return [];
  const record = payload as Record<string, unknown>;
  const candidates = ["errors", "validation_errors", "message"];
  for (const key of candidates) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return [value];
    if (Array.isArray(value)) {
      const messages = value.filter(
        (entry): entry is string => typeof entry === "string",
      );
      if (messages.length > 0) return messages;
    }
  }
  return [];
}

function isAbortLike(error: unknown): boolean {
  return (
    (error instanceof DOMException &&
      (error.name === "AbortError" || error.name === "TimeoutError")) ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function describeNetworkError(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return "network error";
}
