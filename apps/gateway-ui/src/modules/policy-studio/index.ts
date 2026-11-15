/**
 * Module 1C public surface (Team 7C).
 */

export { PolicyStudioPage, default } from "./PolicyStudioPage.js";
export type { PolicyStudioPageProps } from "./PolicyStudioPage.js";
export {
  CANDIDATE_POLICY_ID,
  DEFAULT_STUDIO_ENVELOPE,
  buildEnvelopeFromDraft,
  createInitialPolicyStudioState,
  envelopeToDraft,
  findSecretBearingKey,
  isFormLocked,
  policyStudioReducer,
  selectActivationReadiness,
  selectGuidedFormView,
  selectPolicies,
  selectRouteModes,
} from "./policyStudioState.js";
export type {
  EnvelopeBuildResult,
  EnvelopeDraft,
  GuidedFormView,
  PolicyStudioAction,
  PolicyStudioInit,
  PolicyStudioState,
} from "./policyStudioState.js";
