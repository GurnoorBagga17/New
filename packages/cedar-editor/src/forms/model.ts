/**
 * Guided policy form model (Module 1C C4).
 *
 * The form only collects structured input and compiles it to Cedar text. It
 * never evaluates SQL, paths, or URLs; the backend or WASM evaluator owns all
 * policy decisions and returns the validator facts.
 */

export const SQL_VERBS = [
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "DROP",
  "TRUNCATE",
  "ALTER",
] as const;

export type SqlVerb = (typeof SQL_VERBS)[number];

/** Destructive verbs highlighted in the form copy. */
export const DESTRUCTIVE_SQL_VERBS: readonly SqlVerb[] = [
  "DELETE",
  "DROP",
  "TRUNCATE",
  "ALTER",
];

export interface EgressHostRule {
  readonly host: string;
  readonly includeSubdomains: boolean;
}

export interface GuidedPolicyFormState {
  readonly sql: {
    readonly enabled: boolean;
    readonly allowedVerbs: readonly SqlVerb[];
  };
  readonly path: {
    readonly enabled: boolean;
    readonly prefixes: readonly string[];
  };
  readonly egress: {
    readonly enabled: boolean;
    readonly hosts: readonly EgressHostRule[];
  };
}

export interface FormValidationIssue {
  readonly field: "sql" | "path" | "egress" | "form";
  readonly message: string;
}

export const DEFAULT_GUIDED_POLICY_FORM: GuidedPolicyFormState = {
  sql: { enabled: true, allowedVerbs: ["SELECT"] },
  path: { enabled: false, prefixes: ["/srv/axiom-mock/data"] },
  egress: { enabled: false, hosts: [{ host: "api.mock.invalid", includeSubdomains: false }] },
};

const HOST_LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

function isIpLiteral(host: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

/** Structural host validation only; eligibility is the egress validator's job. */
export function validateEgressHost(host: string): string | null {
  const normalized = host.trim().toLowerCase();
  if (normalized.length === 0) return "Host is empty.";
  if (normalized.includes("/") || normalized.includes("?") || normalized.includes("@")) {
    return "Host must not include a scheme, path, query, or userinfo.";
  }
  if (normalized.startsWith("*.")) {
    return "Use the include-subdomains option instead of a wildcard.";
  }
  if (isIpLiteral(normalized)) {
    return "IP literals are rejected by the egress validator. Use a DNS hostname.";
  }
  const labels = normalized.split(".");
  if (labels.length < 2) return "Host must be a fully qualified domain name.";
  if (labels.some((label) => !HOST_LABEL.test(label))) {
    return "Host contains an invalid DNS label.";
  }
  return null;
}

/** Structural path-prefix validation for the form input. */
export function validatePathPrefix(prefix: string): string | null {
  if (!prefix.startsWith("/")) return "Path prefix must be absolute (start with '/').";
  if (prefix.includes("\u0000")) return "Path prefix must not contain a null byte.";
  if (prefix.length > 1 && prefix.endsWith("/")) {
    return "Remove the trailing slash; the generated policy adds the boundary.";
  }
  const segments = prefix.split("/");
  if (segments.some((segment) => segment === "..")) {
    return "Path prefix must not contain '..' traversal segments.";
  }
  return null;
}

/** Validate the whole form before compiling. */
export function validateGuidedPolicyForm(
  state: GuidedPolicyFormState,
): readonly FormValidationIssue[] {
  const issues: FormValidationIssue[] = [];

  if (!state.sql.enabled && !state.path.enabled && !state.egress.enabled) {
    issues.push({
      field: "form",
      message: "Enable at least one guardrail rule before generating a policy.",
    });
  }

  if (state.sql.enabled) {
    if (state.sql.allowedVerbs.length === 0) {
      issues.push({
        field: "sql",
        message: "Select at least one SQL verb for the allowlist.",
      });
    }
  }

  if (state.path.enabled) {
    if (state.path.prefixes.length === 0) {
      issues.push({
        field: "path",
        message: "Add at least one root directory prefix.",
      });
    }
    const seen = new Set<string>();
    for (const prefix of state.path.prefixes) {
      const error = validatePathPrefix(prefix);
      if (error !== null) {
        issues.push({ field: "path", message: `${error} Received '${prefix}'.` });
      }
      if (seen.has(prefix)) {
        issues.push({ field: "path", message: `Duplicate path prefix '${prefix}'.` });
      }
      seen.add(prefix);
    }
  }

  if (state.egress.enabled) {
    if (state.egress.hosts.length === 0) {
      issues.push({
        field: "egress",
        message: "Add at least one outbound HTTP egress host.",
      });
    }
    const seen = new Set<string>();
    for (const rule of state.egress.hosts) {
      const error = validateEgressHost(rule.host);
      if (error !== null) {
        issues.push({
          field: "egress",
          message: `${error} Received '${rule.host}'.`,
        });
      }
      const normalized = rule.host.trim().toLowerCase();
      if (seen.has(normalized)) {
        issues.push({
          field: "egress",
          message: `Duplicate egress host '${normalized}'.`,
        });
      }
      seen.add(normalized);
    }
  }

  return issues;
}

/** Normalise a form state for stable generation and marker comparison. */
export function normalizeGuidedPolicyForm(
  state: GuidedPolicyFormState,
): GuidedPolicyFormState {
  const verbOrder = new Map<SqlVerb, number>(
    SQL_VERBS.map((verb, index) => [verb, index]),
  );
  return {
    sql: {
      enabled: state.sql.enabled,
      allowedVerbs: [...new Set(state.sql.allowedVerbs)].sort(
        (a, b) => (verbOrder.get(a) ?? 99) - (verbOrder.get(b) ?? 99),
      ),
    },
    path: {
      enabled: state.path.enabled,
      prefixes: [...new Set(state.path.prefixes.map((prefix) => prefix.trim()))],
    },
    egress: {
      enabled: state.egress.enabled,
      hosts: dedupeHosts(state.egress.hosts),
    },
  };
}

function dedupeHosts(hosts: readonly EgressHostRule[]): EgressHostRule[] {
  const seen = new Map<string, EgressHostRule>();
  for (const rule of hosts) {
    const host = rule.host.trim().toLowerCase();
    const existing = seen.get(host);
    if (existing === undefined) {
      seen.set(host, { host, includeSubdomains: rule.includeSubdomains });
    } else if (rule.includeSubdomains) {
      seen.set(host, { host, includeSubdomains: true });
    }
  }
  return [...seen.values()];
}

/**
 * Stable JSON used inside the marker comment.
 * Object keys are sorted; arrays keep operator intent order.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

/** Type guard for the persisted marker payload. */
export function isGuidedPolicyFormState(
  value: unknown,
): value is GuidedPolicyFormState {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const sql = record["sql"];
  const path = record["path"];
  const egress = record["egress"];
  if (typeof sql !== "object" || sql === null) return false;
  if (typeof path !== "object" || path === null) return false;
  if (typeof egress !== "object" || egress === null) return false;

  const sqlRecord = sql as Record<string, unknown>;
  const pathRecord = path as Record<string, unknown>;
  const egressRecord = egress as Record<string, unknown>;

  if (typeof sqlRecord["enabled"] !== "boolean") return false;
  if (!Array.isArray(sqlRecord["allowedVerbs"])) return false;
  if (
    !sqlRecord["allowedVerbs"].every(
      (verb) =>
        typeof verb === "string" &&
        (SQL_VERBS as readonly string[]).includes(verb),
    )
  ) {
    return false;
  }

  if (typeof pathRecord["enabled"] !== "boolean") return false;
  if (
    !Array.isArray(pathRecord["prefixes"]) ||
    !pathRecord["prefixes"].every((prefix) => typeof prefix === "string")
  ) {
    return false;
  }

  if (typeof egressRecord["enabled"] !== "boolean") return false;
  if (!Array.isArray(egressRecord["hosts"])) return false;
  return egressRecord["hosts"].every((entry) => {
    if (typeof entry !== "object" || entry === null) return false;
    const rule = entry as Record<string, unknown>;
    return (
      typeof rule["host"] === "string" &&
      typeof rule["includeSubdomains"] === "boolean"
    );
  });
}
