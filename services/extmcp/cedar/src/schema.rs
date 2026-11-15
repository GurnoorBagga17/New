//! Cedar schema constants and policy template strings for Axiom NHI Phase 1.
//!
//! This module defines:
//! - [`AXIOM_SCHEMA_SRC`]: the canonical Cedar schema source
//! - Policy template constants used in the default policy bundle
//!
//! # Phase 1 scope
//! Entity types cover Agent, Client, McpServer, Tool.
//! Actions cover the four MCP methods intercepted by Team 1.
//! Context attributes mirror the flat JSON produced by
//! [`extmcp_authorization::context::build_cedar_context`].
//!
//! DRAFT: Schema requires Team 0 sign-off before freeze.
//! The `tools/list`, `resources/read`, and `prompts/get` actions are proposed
//! here but their context attribute requirements are not fully specified.
//! See open decision D8.

/// Canonical Cedar schema for Axiom NHI Phase 1.
///
/// DRAFT: v0.1.0-draft — not frozen. Requires Team 0 approval.
pub const AXIOM_SCHEMA_SRC: &str = r#"
namespace Axiom {
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
                // Identity facts (Team 3)
                "authenticated":           Bool,
                "agent_id":                String,
                "client_id":               String,
                "cimd_uri":                String,
                "issuer":                  String,
                "scopes":                  Set<String>,
                "token_jti":               String,

                // SQL validator facts (Team 4)
                "sql_verbs":               Set<String>,
                "sql_tables":              Set<String>,
                "sql_is_readonly":         Bool,
                "sql_statement_count":     Long,

                // Filesystem validator facts (Team 4)
                "normalized_path":         String,
                "path_traversal_detected": Bool,

                // Egress validator facts (Team 4)
                "egress_domain":           String,
                "egress_is_private_ip":    Bool,

                // Tool-pin validator facts (Team 4)
                "tool_pin_sha256":         String,
                "tool_pin_verified":       Bool,

                // Aggregate
                "validator_passed":        Bool,
                "validator_count":         Long,
                "sql_validation_present":  Bool,

                // Runtime mode — DRAFT: audit-only; policies SHOULD NOT branch on this.
                "runtime_mode":            String,
            }
        };

    // DRAFT: tools/list, resources/read, prompts/get action context is not
    // fully specified. See open decision D8. Minimal placeholders below.
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
"#;

// ---------------------------------------------------------------------------
// Default policy templates
// ---------------------------------------------------------------------------

/// Permits `tools/call` when all validators passed and SQL is read-only.
///
/// This is the baseline permissive policy for read-only SQL tools.
pub const PERMIT_READONLY_SQL: &str = r#"
// PERMIT_READONLY_SQL: allow tools/call when SQL analysis shows read-only access
// and all validators passed.
permit (
    principal is Axiom::Agent,
    action == Axiom::Action::"tools/call",
    resource is Axiom::Tool
)
when {
    context.authenticated == true &&
    context.sql_validation_present == true &&
    context.sql_statement_count > 0 &&
    context.sql_is_readonly == true &&
    context.validator_passed == true &&
    context.validator_count > 0 &&
    context.tool_pin_verified == true &&
    context.path_traversal_detected == false &&
    context.egress_is_private_ip == false
};
"#;

/// Forbids `tools/call` when destructive SQL verbs are present.
///
/// Destructive verbs: DELETE, DROP, TRUNCATE, ALTER, GRANT, EXECUTE.
/// Cedar `Set.contains()` checks are deterministic over structured data.
/// No regex or string parsing is performed here.
pub const DENY_DESTRUCTIVE_SQL: &str = r#"
// DENY_DESTRUCTIVE_SQL: forbid tools/call when any destructive SQL verb is detected.
// Cedar evaluates the Set produced by Team 4's SQL AST parser — no raw SQL here.
forbid (
    principal is Axiom::Agent,
    action == Axiom::Action::"tools/call",
    resource is Axiom::Tool
)
when {
    context.sql_verbs.contains("DELETE") ||
    context.sql_verbs.contains("DROP") ||
    context.sql_verbs.contains("TRUNCATE") ||
    context.sql_verbs.contains("ALTER") ||
    context.sql_verbs.contains("GRANT") ||
    context.sql_verbs.contains("EXECUTE")
};
"#;

/// Forbids `tools/call` when a path traversal was detected by Team 4.
pub const DENY_PATH_TRAVERSAL: &str = r#"
// DENY_PATH_TRAVERSAL: forbid tools/call when Team 4 detected a path traversal.
// Cedar evaluates the boolean fact — it does not parse file paths directly.
forbid (
    principal is Axiom::Agent,
    action == Axiom::Action::"tools/call",
    resource is Axiom::Tool
)
when {
    context.path_traversal_detected == true
};
"#;

/// Forbids `tools/call` when the egress target is a private/RFC-1918 IP.
pub const DENY_PRIVATE_EGRESS: &str = r#"
// DENY_PRIVATE_EGRESS: forbid tools/call when the egress target resolves to
// a private IP address (SSRF prevention).
// Cedar evaluates the boolean fact — it does not resolve DNS or parse IPs.
forbid (
    principal is Axiom::Agent,
    action == Axiom::Action::"tools/call",
    resource is Axiom::Tool
)
when {
    context.egress_is_private_ip == true
};
"#;

/// Forbids `tools/call` when the tool definition pin was not verified.
///
/// Missing pins are unverified and fail closed.
pub const DENY_UNVERIFIED_TOOL_PIN: &str = r#"
// DENY_UNVERIFIED_TOOL_PIN: forbid tools/call when a tool pin was expected
// but not verified (rug-pull / tool-poisoning prevention).
forbid (
    principal is Axiom::Agent,
    action == Axiom::Action::"tools/call",
    resource is Axiom::Tool
)
when {
    context.tool_pin_verified == false
};
"#;

/// All default policy sources bundled together.
///
/// This slice is the starting point for the default policy bundle loaded at
/// startup. Operators may add or override policies on disk.
pub const DEFAULT_POLICY_BUNDLE: &[&str] = &[
    PERMIT_READONLY_SQL,
    DENY_DESTRUCTIVE_SQL,
    DENY_PATH_TRAVERSAL,
    DENY_PRIVATE_EGRESS,
    DENY_UNVERIFIED_TOOL_PIN,
];
