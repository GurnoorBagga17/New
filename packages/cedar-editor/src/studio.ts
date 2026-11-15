/**
 * `@axiom/cedar-editor/studio` — React UI for the policy studio and playground.
 *
 * Importing this entry also loads the package stylesheet, which only consumes
 * `--*` design-token custom properties.
 */
import "./styles.css";

export { CedarEditor } from "./components/CedarEditor.js";
export type { CedarEditorProps } from "./components/CedarEditor.js";
export { DryRunPanel } from "./components/DryRunPanel.js";
export type { DryRunPanelProps } from "./components/DryRunPanel.js";
export { GuidedPolicyForm } from "./components/GuidedPolicyForm.js";
export type { GuidedPolicyFormProps } from "./components/GuidedPolicyForm.js";
export { PolicyDiff } from "./components/PolicyDiff.js";
export type { PolicyDiffProps } from "./components/PolicyDiff.js";
export { RouteModePanel } from "./components/RouteModePanel.js";
export type {
  RouteModePanelProps,
  StudioRoute,
} from "./components/RouteModePanel.js";
export { ActivationPanel } from "./components/ActivationPanel.js";
export type { ActivationPanelProps } from "./components/ActivationPanel.js";
export { VerdictBadge, ModeBadge } from "./components/VerdictBadge.js";
export type { VerdictBadgeProps, ModeBadgeProps } from "./components/VerdictBadge.js";
export {
  AlertIcon,
  BeakerIcon,
  CheckIcon,
  ClockIcon,
  DenyIcon,
  EyeIcon,
  PlusIcon,
  ShieldIcon,
  TrashIcon,
} from "./components/icons.js";

export { useDryRun } from "./hooks/useDryRun.js";
export type { DryRunState, UseDryRunApi } from "./hooks/useDryRun.js";
