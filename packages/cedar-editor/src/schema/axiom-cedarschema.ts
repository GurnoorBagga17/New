/**
 * Cedar schema mirror and editor metadata.
 *
 * Source of truth: `services/extmcp/cedar/src/schema.rs` (`AXIOM_SCHEMA_SRC`,
 * Team 2, version `0.1.0-draft`). This file is the editor-side mirror used for
 * completions and documentation only. It must be updated in the same change as
 * the Rust schema; the package test suite asserts the action/attribute lists.
 *
 * The schema is not a security boundary: the Rust service validates the schema
 * and policies on every dry-run and bundle activation.
 */

export const AXIOM_SCHEMA_SOURCE = `namespace Axiom {
    entity Agent = {
        "client_id": String,
        "issuer": String,
    };

    entity Client;

    entity McpServer;

    entity Tool in [McpServer];

    action "tools/call"
        appliesTo {
            principal: [Agent],
            resource: [Tool],
            context: {
                "authenticated":           Bool,
                "agent_id":                String,
                "client_id":               String,
                "cimd_uri":                String,
                "issuer":                  String,
                "scopes":                  Set<String>,
                "token_jti":               String,

                "sql_verbs":               Set<String>,
                "sql_tables":              Set<String>,
                "sql_is_readonly":         Bool,
                "sql_statement_count":     Long,

                "normalized_path":         String,
                "path_traversal_detected": Bool,

                "egress_domain":           String,
                "egress_is_private_ip":    Bool,

                "tool_pin_sha256":         String,
                "tool_pin_verified":       Bool,

                "validator_passed":        Bool,
                "validator_count":         Long,
                "sql_validation_present":  Bool,

                "runtime_mode":            String,
            }
        };

    action "tools/list"
        appliesTo {
            principal: [Agent],
            resource: [McpServer],
            context: {
                "authenticated": Bool,
                "agent_id":      String,
                "runtime_mode":  String,
            }
        };

    action "resources/read"
        appliesTo {
            principal: [Agent],
            resource: [McpServer],
            context: {
                "authenticated": Bool,
                "agent_id":      String,
                "runtime_mode":  String,
            }
        };

    action "prompts/get"
        appliesTo {
            principal: [Agent],
            resource: [McpServer],
            context: {
                "authenticated": Bool,
                "agent_id":      String,
                "runtime_mode":  String,
            }
        };
}
`;

export type FactSource =
  | "identity"
  | "sql"
  | "filesystem"
  | "egress"
  | "tool-pin"
  | "aggregate"
  | "runtime";

export interface ContextAttribute {
  readonly name: string;
  readonly type: "Bool" | "String" | "Long" | "Set<String>";
  readonly source: FactSource;
  readonly documentation: string;
}

const CONTEXT_ATTRIBUTES: readonly ContextAttribute[] = [
  {
    name: "authenticated",
    type: "Bool",
    source: "identity",
    documentation: "Team 3: credential passed cryptographic verification.",
  },
  {
    name: "agent_id",
    type: "String",
    source: "identity",
    documentation: "Stable verified agent identifier.",
  },
  {
    name: "client_id",
    type: "String",
    source: "identity",
    documentation: "OAuth 2.1 client identifier.",
  },
  {
    name: "cimd_uri",
    type: "String",
    source: "identity",
    documentation: "Client ID Metadata Document URI, or an empty string.",
  },
  {
    name: "issuer",
    type: "String",
    source: "identity",
    documentation: "Token issuer URI.",
  },
  {
    name: "scopes",
    type: "Set<String>",
    source: "identity",
    documentation: "Granted OAuth 2.1 scopes.",
  },
  {
    name: "token_jti",
    type: "String",
    source: "identity",
    documentation: "JWT ID for correlation. Never the raw token.",
  },
  {
    name: "sql_verbs",
    type: "Set<String>",
    source: "sql",
    documentation:
      "Team 4 SQL AST facts, e.g. SELECT, DELETE. The browser never parses SQL.",
  },
  {
    name: "sql_tables",
    type: "Set<String>",
    source: "sql",
    documentation: "Table names extracted by Team 4's SQL AST parser.",
  },
  {
    name: "sql_is_readonly",
    type: "Bool",
    source: "sql",
    documentation: "True only when every statement is read-only.",
  },
  {
    name: "sql_statement_count",
    type: "Long",
    source: "sql",
    documentation: "Number of parsed SQL statements.",
  },
  {
    name: "normalized_path",
    type: "String",
    source: "filesystem",
    documentation: "Path normalised by Team 4; never parsed in the browser.",
  },
  {
    name: "path_traversal_detected",
    type: "Bool",
    source: "filesystem",
    documentation: "Team 4 detected traversal or a null byte.",
  },
  {
    name: "egress_domain",
    type: "String",
    source: "egress",
    documentation: "Normalised outbound hostname.",
  },
  {
    name: "egress_is_private_ip",
    type: "Bool",
    source: "egress",
    documentation: "True for RFC 1918, loopback, link-local or metadata IPs.",
  },
  {
    name: "tool_pin_sha256",
    type: "String",
    source: "tool-pin",
    documentation: "SHA-256 of the pinned tools/list definition.",
  },
  {
    name: "tool_pin_verified",
    type: "Bool",
    source: "tool-pin",
    documentation: "False when a pin was expected but did not match.",
  },
  {
    name: "validator_passed",
    type: "Bool",
    source: "aggregate",
    documentation: "True only when every validator passed.",
  },
  {
    name: "validator_count",
    type: "Long",
    source: "aggregate",
    documentation: "Number of validator results supplied.",
  },
  {
    name: "sql_validation_present",
    type: "Bool",
    source: "aggregate",
    documentation: "True when SQL validation evidence was present.",
  },
  {
    name: "runtime_mode",
    type: "String",
    source: "runtime",
    documentation:
      "Audit-only: 'observe' or 'enforce'. Policies SHOULD NOT branch on it.",
  },
];

export const CEDAR_KEYWORDS = [
  "permit",
  "forbid",
  "when",
  "unless",
  "principal",
  "action",
  "resource",
  "context",
  "is",
  "in",
  "if",
  "then",
  "else",
  "true",
  "false",
  "has",
  "like",
  "namespace",
  "entity",
  "appliesTo",
] as const;

export const CEDAR_ENTITY_TYPES = [
  "Agent",
  "Client",
  "McpServer",
  "Tool",
] as const;

export const CEDAR_ACTIONS = [
  "tools/call",
  "tools/list",
  "resources/read",
  "prompts/get",
] as const;

export const CEDAR_SET_METHODS = [
  "contains",
  "containsAll",
  "containsAny",
  "isEmpty",
] as const;

export const CEDAR_STRING_METHODS = ["startsWith", "endsWith"] as const;

export const AXIOM_NAMESPACE = "Axiom";

/** Context attributes for the default `tools/call` action. */
export function contextAttributesFor(action: string): readonly ContextAttribute[] {
  if (action === "tools/call") return CONTEXT_ATTRIBUTES;
  return CONTEXT_ATTRIBUTES.filter((attribute) =>
    ["authenticated", "agent_id", "runtime_mode"].includes(attribute.name),
  );
}

/** Default placeholder document shown before the guided form generates one. */
export const STARTER_POLICY = `// Axiom NHI Phase 1 — candidate policy.
// Generate a policy from the guided form, or write Cedar directly.
permit (
    principal is Axiom::Agent,
    action == Axiom::Action::"tools/call",
    resource is Axiom::Tool
)
when {
    context.authenticated == true &&
    context.validator_passed == true &&
    context.tool_pin_verified == true
};
`;
