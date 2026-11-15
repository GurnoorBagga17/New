import { compileGuidedPolicy, readFormMarker } from "./compile.js";
import {
  normalizeGuidedPolicyForm,
  type GuidedPolicyFormState,
} from "./model.js";

export type DivergenceReason =
  | "missing-marker"
  | "invalid-marker"
  | "source-edited"
  | "form-invalid";

export interface GuidedPolicyInspection {
  /** The form state embedded in the text, if the marker is readable. */
  readonly markerState: GuidedPolicyFormState | null;
  /** True when the editor text is not exactly what the form would generate. */
  readonly diverged: boolean;
  readonly reason: DivergenceReason | null;
}

/**
 * Compare editor text with the form state.
 *
 * A code edit (including a body edit after the marker) marks the form
 * `diverged`; the UI must not silently overwrite operator code.
 */
export function inspectGuidedPolicy(
  source: string,
  formState: GuidedPolicyFormState,
): GuidedPolicyInspection {
  const marker = readFormMarker(source);
  const generated = compileGuidedPolicy(formState);
  const normalizedForm = normalizeGuidedPolicyForm(formState);

  if (marker === null) {
    return {
      markerState: null,
      diverged: true,
      reason: "missing-marker",
    };
  }

  if (!generated.ok) {
    return {
      markerState: marker.state,
      diverged: true,
      reason: "form-invalid",
    };
  }

  if (source === generated.source) {
    return { markerState: marker.state, diverged: false, reason: null };
  }

  // Distinguish "operator edited the body" from "marker payload is from a
  // different form state" (e.g. pasted policy).
  const markerMatchesForm =
    JSON.stringify(normalizeGuidedPolicyForm(marker.state)) ===
    JSON.stringify(normalizedForm);
  return {
    markerState: marker.state,
    diverged: true,
    reason: markerMatchesForm ? "source-edited" : "invalid-marker",
  };
}

export interface LoadedGuidedPolicy {
  readonly state: GuidedPolicyFormState;
  /** True when the loaded text has edits beyond the marker state. */
  readonly diverged: boolean;
}

/**
 * Explicit operator action: load the embedded form state back from code.
 * Returns `null` when no valid marker exists; the UI then keeps the form
 * disabled and labels the policy `CUSTOM`.
 */
export function loadGuidedPolicyFromSource(
  source: string,
): LoadedGuidedPolicy | null {
  const marker = readFormMarker(source);
  if (marker === null) return null;
  const generated = compileGuidedPolicy(marker.state);
  return {
    state: marker.state,
    diverged: !generated.ok || generated.source !== source,
  };
}

/**
 * Return the text that should be written when the operator explicitly chooses
 * "Regenerate from form". This is the only path that overwrites code.
 */
export function regenerateFromForm(
  state: GuidedPolicyFormState,
): { readonly ok: true; readonly source: string } | { readonly ok: false; readonly messages: readonly string[] } {
  const result = compileGuidedPolicy(state);
  if (result.ok) return result;
  return { ok: false, messages: result.errors.map((issue) => issue.message) };
}
