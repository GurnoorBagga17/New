/**
 * `@axiom/cedar-editor` — Cedar editor core, evaluator adapters, and guided
 * policy form compiler.
 *
 * React components live in the `@axiom/cedar-editor/studio` entry so the public
 * `/playground` can import only what it needs. Monaco is never part of the
 * initial chunk: it is imported by the lazy `CedarEditor` implementation.
 */

export * from "./types.js";

export {
  DRY_RUN_PATH,
  BUNDLE_PATH,
  ContractMismatchError,
  assertDryRunResponse,
  assertActivationResponse,
} from "./contracts/local-policy-api.js";
export type {
  DryRunRequestBody,
  DryRunResponseBody,
  BundleRequestBody,
  BundleResponseBody,
  ShapeCheck,
} from "./contracts/local-policy-api.js";

export {
  parseToolCallEnvelope,
  SAMPLE_TOOLS_CALL_TEXT,
} from "./contracts/envelope.js";
export type { ParsedToolCall, EnvelopeParseResult } from "./contracts/envelope.js";

export { createBackendDryRunAdapter } from "./adapters/backend-dry-run.js";
export type { BackendAdapterOptions } from "./adapters/backend-dry-run.js";
export { createWasmAdapter } from "./adapters/wasm.js";
export type {
  CedarWasmModule,
  CedarWasmModuleLoader,
  CedarWasmDryRunInput,
  CedarWasmDryRunOutput,
} from "./adapters/wasm.js";
export { createMockAdapter } from "./adapters/mock.js";
export type {
  MockAdapterOptions,
  MockScenario,
  MockActivationScenario,
} from "./adapters/mock.js";
export {
  emptyValidatorFacts,
  failureResult,
  normalizeValidatorResults,
  resolveRouteMode,
  resolveVerdict,
} from "./adapters/result.js";

export {
  SQL_VERBS,
  DESTRUCTIVE_SQL_VERBS,
  DEFAULT_GUIDED_POLICY_FORM,
  normalizeGuidedPolicyForm,
  stableStringify,
  validateEgressHost,
  validatePathPrefix,
  validateGuidedPolicyForm,
  isGuidedPolicyFormState,
} from "./forms/model.js";
export type {
  SqlVerb,
  EgressHostRule,
  GuidedPolicyFormState,
  FormValidationIssue,
} from "./forms/model.js";
export {
  compileGuidedPolicy,
  readFormMarker,
  FORM_MARKER_PREFIX,
} from "./forms/compile.js";
export type { CompileGuidedPolicyResult } from "./forms/compile.js";
export {
  inspectGuidedPolicy,
  loadGuidedPolicyFromSource,
  regenerateFromForm,
} from "./forms/roundtrip.js";
export type { GuidedPolicyInspection, LoadedGuidedPolicy } from "./forms/roundtrip.js";
export { diffLines } from "./forms/diff.js";
export type { DiffLine, LineDiff } from "./forms/diff.js";

export {
  AXIOM_SCHEMA_SOURCE,
  AXIOM_NAMESPACE,
  CEDAR_KEYWORDS,
  CEDAR_ENTITY_TYPES,
  CEDAR_ACTIONS,
  CEDAR_SET_METHODS,
  CEDAR_STRING_METHODS,
  STARTER_POLICY,
  contextAttributesFor,
} from "./schema/axiom-cedarschema.js";
export type { ContextAttribute, FactSource } from "./schema/axiom-cedarschema.js";
export { analyzeCedarText } from "./schema/editor-diagnostics.js";
export type { EditorDiagnostic } from "./schema/editor-diagnostics.js";

export {
  MissingDesignTokensError,
  REQUIRED_CSS_VARIABLES,
  tokenMapFromTokensJson,
  installDesignTokens,
  readDesignTokensFromDocument,
  createCedarMonacoTheme,
} from "./theme/tokens.js";
export type {
  DesignTokensJson,
  DesignTokenMap,
  MonacoThemeData,
  ThemeMode,
} from "./theme/tokens.js";

export { useDryRun } from "./hooks/useDryRun.js";
export type { DryRunState, UseDryRunApi } from "./hooks/useDryRun.js";

export {
  SPRING_TACTILE,
  SPRING_DRAWER,
  EASE_TELEMETRY,
} from "./motion.js";
