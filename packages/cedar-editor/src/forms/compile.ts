import {
  isGuidedPolicyFormState,
  normalizeGuidedPolicyForm,
  stableStringify,
  validateGuidedPolicyForm,
  type FormValidationIssue,
  type GuidedPolicyFormState,
} from "./model.js";

export const FORM_MARKER_PREFIX = "// @axiom:form-v1 ";

export type CompileGuidedPolicyResult =
  | { readonly ok: true; readonly source: string }
  | { readonly ok: false; readonly errors: readonly FormValidationIssue[] };

/** Escape a value as a Cedar string literal, refusing control characters. */
function cedarString(value: string): string {
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(
      `Cannot generate a Cedar string literal containing control characters: ${JSON.stringify(value)}`,
    );
  }
  return JSON.stringify(value);
}

function pathCondition(prefix: string): string {
  if (prefix === "/") {
    return 'context.normalized_path.startsWith("/")';
  }
  return `(context.normalized_path == ${cedarString(prefix)} || context.normalized_path.startsWith(${cedarString(`${prefix}/`)}))`;
}

function egressCondition(host: string, includeSubdomains: boolean): string {
  const normalized = host.trim().toLowerCase();
  if (!includeSubdomains) {
    return `context.egress_domain == ${cedarString(normalized)}`;
  }
  return `(context.egress_domain == ${cedarString(normalized)} || context.egress_domain.endsWith(${cedarString(`.${normalized}`)}))`;
}

/**
 * Compile the guided form to a deterministic Cedar policy document.
 *
 * Generated conditions read only Team 4's structured facts:
 * - `context.sql_verbs` (`Set<String>`) with `containsAll`
 * - `context.normalized_path` (normalised by the backend)
 * - `context.egress_domain` (normalised by the backend)
 *
 * The browser never parses raw SQL, paths, or URLs to make the decision.
 */
export function compileGuidedPolicy(
  input: GuidedPolicyFormState,
): CompileGuidedPolicyResult {
  const state = normalizeGuidedPolicyForm(input);
  const issues = validateGuidedPolicyForm(state);
  if (issues.length > 0) return { ok: false, errors: issues };

  const conditions: string[] = ["context.validator_passed == true"];

  if (state.sql.enabled) {
    const verbSet = `[${state.sql.allowedVerbs.map((verb) => cedarString(verb)).join(", ")}]`;
    conditions.push(
      "context.sql_validation_present == true",
      "context.sql_statement_count > 0",
      `${verbSet}.containsAll(context.sql_verbs)`,
    );
  }

  if (state.path.enabled) {
    conditions.push(
      "context.path_traversal_detected == false",
      `(${state.path.prefixes.map(pathCondition).join(" ||\n     ")})`,
    );
  }

  if (state.egress.enabled) {
    conditions.push(
      "context.egress_is_private_ip == false",
      `(${state.egress.hosts
        .map((rule) => egressCondition(rule.host, rule.includeSubdomains))
        .join(" ||\n     ")})`,
    );
  }

  conditions.push("context.tool_pin_verified == true");

  const marker = `${FORM_MARKER_PREFIX}${encodeURIComponent(stableStringify(state))}`;
  const source = [
    marker,
    "// Axiom NHI Phase 1 — generated from the guided policy form. Review the diff before activation.",
    "// The form reads this marker. Editing the policy body diverges the form instead of overwriting code.",
    "permit (",
    "    principal is Axiom::Agent,",
    '    action == Axiom::Action::"tools/call",',
    "    resource is Axiom::Tool",
    ")",
    "when {",
    `    ${conditions.join(" &&\n    ")}`,
    "};",
    "",
  ].join("\n");

  return { ok: true, source };
}

/** Parse the marker payload from a generated policy document. */
export function readFormMarker(
  source: string,
): { readonly state: GuidedPolicyFormState; readonly marker: string } | null {
  const match = new RegExp(
    `^${FORM_MARKER_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\S+)$`,
    "m",
  ).exec(source);
  if (match === null || match[1] === undefined) return null;
  try {
    const decoded: unknown = JSON.parse(decodeURIComponent(match[1]));
    if (!isGuidedPolicyFormState(decoded)) return null;
    const state = normalizeGuidedPolicyForm(decoded);
    return { state, marker: match[0] };
  } catch {
    return null;
  }
}
