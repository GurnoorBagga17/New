/**
 * Module 1C — policy studio state (Team 7C).
 *
 * The reducer is the only place that decides what may become the displayed
 * *active* or *candidate* bundle. Two invariants are enforced here, not in JSX:
 *
 * 1. A candidate SHA-256 exists only after a successful dry-run of the current
 *    source. Any edit clears it, so a stale SHA can never be activated.
 * 2. A rejected / failed hot reload never changes `activeVersion`.
 *
 * Form edits never overwrite diverged operator code; the UI has to ask for an
 * explicit `form/regenerated` action first.
 */

import {
  DEFAULT_GUIDED_POLICY_FORM,
  STARTER_POLICY,
  compileGuidedPolicy,
  inspectGuidedPolicy,
  loadGuidedPolicyFromSource,
  normalizeGuidedPolicyForm,
  validateGuidedPolicyForm,
  type BundleActivationResult,
  type CandidatePolicySource,
  type DryRunEnvelope,
  type DryRunResult,
  type DryRunStatus,
  type FormValidationIssue,
  type GuidedPolicyFormState,
  type RouteMode,
  type RouteModeSelection,
} from "@axiom/cedar-editor";
import type { StudioRoute } from "@axiom/cedar-editor/studio";

/** Stable local policy id used for the single candidate document. */
export const CANDIDATE_POLICY_ID = "candidate";

/** Default envelope used only when the host does not supply one. */
export const DEFAULT_STUDIO_ENVELOPE: DryRunEnvelope = {
  mcp_method: "tools/call",
  target_server: "mcp://demo/analytics",
  tool_name: "execute_sql",
  raw_arguments: { query: "SELECT * FROM orders_mock" },
  agent: {
    agent_id: "agent-demo-001",
    client_id: "client-demo-001",
    authenticated: true,
  },
};

export interface PolicyStudioState {
  readonly candidateSource: string;
  /** Source of the bundle that is currently live; used as the diff baseline. */
  readonly baselineSource: string;
  readonly formState: GuidedPolicyFormState;
  readonly envelope: DryRunEnvelope;
  readonly routes: readonly StudioRoute[];
  readonly activeVersion: string | null;
  /** Only set by a dry-run whose status is `ok`. */
  readonly candidateVersion: string | null;
  readonly lastDryRunStatus: DryRunStatus | null;
  readonly dryRunResult: DryRunResult | null;
  readonly dryRunning: boolean;
  readonly activationResult: BundleActivationResult | null;
  readonly activating: boolean;
}

export type PolicyStudioAction =
  | { readonly type: "source/edited"; readonly source: string }
  | { readonly type: "form/applied"; readonly form: GuidedPolicyFormState }
  | { readonly type: "form/loaded-from-code" }
  | { readonly type: "form/regenerated" }
  | { readonly type: "route/mode"; readonly routeId: string; readonly mode: RouteMode }
  | { readonly type: "review/cleared" }
  | { readonly type: "dry-run/started"; readonly envelope: DryRunEnvelope }
  | { readonly type: "dry-run/settled"; readonly result: DryRunResult }
  | { readonly type: "activation/started" }
  | { readonly type: "activation/settled"; readonly result: BundleActivationResult }
  | { readonly type: "activation/dismissed" };

export interface PolicyStudioInit {
  readonly routes?: readonly StudioRoute[];
  readonly initialSource?: string;
  readonly baselineSource?: string;
  readonly initialForm?: GuidedPolicyFormState;
  readonly initialEnvelope?: DryRunEnvelope;
  readonly activeVersion?: string | null;
}

export function createInitialPolicyStudioState(
  init: PolicyStudioInit = {},
): PolicyStudioState {
  const initialSource = init.initialSource ?? STARTER_POLICY;
  return {
    candidateSource: initialSource,
    baselineSource: init.baselineSource ?? initialSource,
    formState: normalizeGuidedPolicyForm(
      init.initialForm ?? DEFAULT_GUIDED_POLICY_FORM,
    ),
    envelope: init.initialEnvelope ?? DEFAULT_STUDIO_ENVELOPE,
    routes: init.routes ?? [],
    activeVersion: init.activeVersion ?? null,
    candidateVersion: null,
    lastDryRunStatus: null,
    dryRunResult: null,
    dryRunning: false,
    activationResult: null,
    activating: false,
  };
}

/**
 * Any change to the candidate policy invalidates the reviewed SHA-256 and the
 * activation review. `dryRunning` is left untouched so an in-flight request can
 * still settle; the page aborts it before dispatching an edit.
 */
function invalidateReview(state: PolicyStudioState): PolicyStudioState {
  return {
    ...state,
    candidateVersion: null,
    lastDryRunStatus: null,
    dryRunResult: null,
    activationResult: null,
  };
}

export function policyStudioReducer(
  state: PolicyStudioState,
  action: PolicyStudioAction,
): PolicyStudioState {
  switch (action.type) {
    case "source/edited": {
      if (action.source === state.candidateSource) return state;
      return { ...invalidateReview(state), candidateSource: action.source };
    }

    case "form/applied": {
      // Guard: never overwrite diverged operator code from the form.
      if (isFormLocked(state)) return state;
      const form = normalizeGuidedPolicyForm(action.form);
      const compiled = compileGuidedPolicy(form);
      if (!compiled.ok) {
        // Keep the last generated source; the issues panel explains why the
        // form cannot generate a policy yet.
        return { ...invalidateReview(state), formState: form };
      }
      if (compiled.source === state.candidateSource) {
        return { ...state, formState: form };
      }
      return {
        ...invalidateReview(state),
        formState: form,
        candidateSource: compiled.source,
      };
    }

    case "form/loaded-from-code": {
      const loaded = loadGuidedPolicyFromSource(state.candidateSource);
      if (loaded === null) return state;
      return { ...invalidateReview(state), formState: loaded.state };
    }

    case "form/regenerated": {
      const compiled = compileGuidedPolicy(state.formState);
      if (!compiled.ok) return state;
      if (compiled.source === state.candidateSource) {
        return { ...state, activationResult: null };
      }
      return {
        ...invalidateReview(state),
        candidateSource: compiled.source,
      };
    }

    case "route/mode": {
      let changed = false;
      const routes = state.routes.map((route) => {
        if (route.routeId !== action.routeId || route.mode === action.mode) {
          return route;
        }
        changed = true;
        return { ...route, mode: action.mode };
      });
      if (!changed) return state;
      return { ...state, routes, activationResult: null };
    }

    case "review/cleared":
      return invalidateReview(state);

    case "dry-run/started":
      return {
        ...invalidateReview(state),
        envelope: action.envelope,
        dryRunning: true,
        dryRunResult: null,
        candidateVersion: null,
        lastDryRunStatus: null,
        activationResult: null,
      };

    case "dry-run/settled": {
      const ok = action.result.status === "ok";
      return {
        ...state,
        dryRunning: false,
        dryRunResult: action.result,
        lastDryRunStatus: action.result.status,
        candidateVersion: ok ? action.result.candidateVersion : null,
      };
    }

    case "activation/started":
      return { ...state, activating: true, activationResult: null };

    case "activation/settled": {
      if (!action.result.activated) {
        // Failed hot reload: keep the displayed active version untouched.
        return { ...state, activating: false, activationResult: action.result };
      }
      return {
        ...state,
        activating: false,
        activationResult: action.result,
        activeVersion: action.result.active?.version ?? state.activeVersion,
        baselineSource: state.candidateSource,
      };
    }

    case "activation/dismissed":
      return { ...state, activationResult: null };

    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

export interface GuidedFormView {
  readonly diverged: boolean;
  readonly markerAvailable: boolean;
  readonly issues: readonly FormValidationIssue[];
}

/** Divergence plus form issues, if any, for the guided form panel. */
export function selectGuidedFormView(state: PolicyStudioState): GuidedFormView {
  const inspection = inspectGuidedPolicy(state.candidateSource, state.formState);
  const issues = validateGuidedPolicyForm(state.formState);
  return {
    // An invalid form is mid-edit, not diverged: the operator must be able to
    // keep fixing the fields. Only a code edit or unreadable marker locks it.
    diverged: inspection.diverged && inspection.reason !== "form-invalid",
    markerAvailable: inspection.markerState !== null,
    issues,
  };
}

/** True when form editing would overwrite operator-authored code. */
export function isFormLocked(state: PolicyStudioState): boolean {
  return selectGuidedFormView(state).diverged;
}

export function selectPolicies(
  state: PolicyStudioState,
): readonly CandidatePolicySource[] {
  return [{ id: CANDIDATE_POLICY_ID, source: state.candidateSource }];
}

export function selectRouteModes(
  state: PolicyStudioState,
): readonly RouteModeSelection[] {
  return state.routes.map((route) => ({
    routeId: route.routeId,
    mode: route.mode,
  }));
}

/** Activation is only offered for a reviewed, successfully evaluated bundle. */
export function selectActivationReadiness(state: PolicyStudioState): {
  readonly ready: boolean;
  readonly reason: string | null;
} {
  if (state.dryRunning || state.activating) {
    return { ready: false, reason: "A request is already in flight." };
  }
  if (state.lastDryRunStatus === null) {
    return {
      ready: false,
      reason: "Run Simulate Dry Run before activation.",
    };
  }
  if (state.lastDryRunStatus === "invalid") {
    return {
      ready: false,
      reason: "The candidate did not validate; activation is blocked.",
    };
  }
  if (state.lastDryRunStatus !== "ok") {
    return {
      ready: false,
      reason: `The last simulation status was '${state.lastDryRunStatus}'; activation is blocked.`,
    };
  }
  if (state.candidateVersion === null) {
    return {
      ready: false,
      reason: "The dry-run did not return a candidate SHA-256 to pin.",
    };
  }
  return { ready: true, reason: null };
}

/* ------------------------------------------------------------------------- */
/* Envelope draft + zero-secret guard                                         */
/* ------------------------------------------------------------------------- */

export interface EnvelopeDraft {
  readonly targetServer: string;
  readonly toolName: string;
  readonly agentId: string;
  readonly clientId: string;
  readonly runtimeMode: "" | RouteMode;
  readonly argumentsJson: string;
}

export function envelopeToDraft(envelope: DryRunEnvelope): EnvelopeDraft {
  return {
    targetServer: envelope.target_server,
    toolName: envelope.tool_name,
    agentId: envelope.agent.agent_id,
    clientId: envelope.agent.client_id,
    runtimeMode: envelope.runtime_mode ?? "",
    argumentsJson: JSON.stringify(envelope.raw_arguments, null, 2),
  };
}

/** Keys that must never reach a dry-run request body or the DOM. */
const SECRET_KEY_PATTERN =
  /(authorization|cookie|set-cookie|password|passwd|secret|api[-_]?key|access[-_]?token|refresh[-_]?token|bearer|private[-_]?key|credential)/i;

export function findSecretBearingKey(
  value: unknown,
  path = "$",
): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findSecretBearingKey(value[index], `${path}[${index}]`);
      if (found !== null) return found;
    }
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(key)) return `${path}.${key}`;
    const found = findSecretBearingKey(entry, `${path}.${key}`);
    if (found !== null) return found;
  }
  return null;
}

export type EnvelopeBuildResult =
  | { readonly ok: true; readonly envelope: DryRunEnvelope }
  | { readonly ok: false; readonly error: string };

/**
 * Build a dry-run envelope from the operator's draft.
 *
 * All error copy is static and never echoes the submitted value, so a pasted
 * credential cannot leak into the page, a log, or a support ticket.
 */
export function buildEnvelopeFromDraft(draft: EnvelopeDraft): EnvelopeBuildResult {
  const targetServer = draft.targetServer.trim();
  const toolName = draft.toolName.trim();
  const agentId = draft.agentId.trim();
  const clientId = draft.clientId.trim();
  if (targetServer.length === 0 || toolName.length === 0) {
    return {
      ok: false,
      error: "ENVELOPE INCOMPLETE: target_server and tool_name are required.",
    };
  }
  if (agentId.length === 0 || clientId.length === 0) {
    return {
      ok: false,
      error: "ENVELOPE INCOMPLETE: agent_id and client_id are required.",
    };
  }

  let rawArguments: unknown;
  try {
    rawArguments = JSON.parse(draft.argumentsJson);
  } catch {
    return {
      ok: false,
      error: "ENVELOPE INVALID: raw arguments must be valid JSON.",
    };
  }
  if (
    typeof rawArguments !== "object" ||
    rawArguments === null ||
    Array.isArray(rawArguments)
  ) {
    return {
      ok: false,
      error: "ENVELOPE INVALID: raw arguments must be a JSON object.",
    };
  }

  const secretPath = findSecretBearingKey(rawArguments);
  if (secretPath !== null) {
    return {
      ok: false,
      error: `ZERO-SECRET INVARIANT: argument field '${secretPath}' looks secret-bearing. Remove it; dry-run envelopes carry redacted facts only.`,
    };
  }

  return {
    ok: true,
    envelope: {
      mcp_method: "tools/call",
      target_server: targetServer,
      tool_name: toolName,
      raw_arguments: rawArguments as Record<string, unknown>,
      agent: {
        agent_id: agentId,
        client_id: clientId,
        authenticated: true,
      },
      ...(draft.runtimeMode === ""
        ? {}
        : { runtime_mode: draft.runtimeMode }),
    },
  };
}
