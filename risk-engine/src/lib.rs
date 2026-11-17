// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
//! Team 2 & Team 4 — Standards-Grounded OWASP NHI Top 10 (2025) & OWASP MCP Top 10 (2025)
//! Deterministic Risk Evaluators.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum FindingSeverity {
    Info,
    Low,
    Medium,
    High,
    Critical,
}

impl FindingSeverity {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Info => "INFO",
            Self::Low => "LOW",
            Self::Medium => "MEDIUM",
            Self::High => "HIGH",
            Self::Critical => "CRITICAL",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DetailedRiskFinding {
    pub control_id: String,
    pub title: String,
    pub severity: FindingSeverity,
    pub description: String,
    pub remediation: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EntitySecurityTelemetry {
    pub entity_uid: String,
    pub has_active_owner: bool,
    pub dormant_days: u32,
    pub secret_referenced_in_plaintext_config: bool,
    pub is_third_party_over_scoped: bool,
    pub uses_static_key_without_oauth21: bool,
    pub has_wildcard_permissions: bool,
    pub k8s_automount_cluster_admin: bool,
    pub secret_age_days: u32,
    pub shared_across_dev_and_prod: bool,
    pub shared_by_multiple_workloads: bool,
    pub invoked_from_human_interactive_ip: bool,
    // MCP-specific signals
    pub mcp_token_in_query_or_long_lived: bool,
    pub mcp_scope_creep_detected: bool,
    pub mcp_tool_pin_mismatch: bool,
    pub mcp_unpinned_supply_chain_package: bool,
    pub mcp_command_or_sql_injection_attempt: bool,
    pub mcp_prompt_injection_context_leak: bool,
    pub mcp_missing_rfc8707_audience: bool,
    pub mcp_missing_otel_audit_stream: bool,
    pub mcp_is_unregistered_shadow_server: bool,
    pub mcp_cross_tenant_context_shared: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EvaluatedRiskScorecard {
    pub entity_uid: String,
    pub detailed_findings: Vec<DetailedRiskFinding>,
    pub owasp_nhi_findings: Vec<String>,
    pub owasp_mcp_findings: Vec<String>,
    pub exposure_score: u8,
    pub blast_radius_score: u8,
    pub composite_severity: String,
}

/// Evaluates all 10 OWASP NHI Top 10 (2025) controls (`NHI1:2025` .. `NHI10:2025`)
/// and all 10 OWASP MCP Top 10 (2025) controls (`MCP01:2025` .. `MCP10:2025`).
pub fn evaluate_entity_risk(
    telemetry: &EntitySecurityTelemetry,
    blast_radius_score: u8,
) -> EvaluatedRiskScorecard {
    let mut detailed = Vec::new();
    let mut nhi = Vec::new();

    if !telemetry.has_active_owner || telemetry.dormant_days > 90 {
        let f = DetailedRiskFinding {
            control_id: "NHI1:2025".into(),
            title: "Improper Offboarding / Dormant NHI".into(),
            severity: FindingSeverity::High,
            description:
                "Entity has departed or unverified owner, or has been dormant for >90 days.".into(),
            remediation: "Revoke credentials or assign to an active identity provider owner."
                .into(),
        };
        nhi.push(format!("{}: {}", f.control_id, f.title));
        detailed.push(f);
    }
    if telemetry.secret_referenced_in_plaintext_config {
        let f = DetailedRiskFinding {
            control_id: "NHI2:2025".into(),
            title: "Secret Leakage in Plaintext Configuration".into(),
            severity: FindingSeverity::Critical,
            description: "Static API keys or tokens found in repository configs or env files."
                .into(),
            remediation: "Rotate secret immediately and migrate to dynamic OpenBao lease broker."
                .into(),
        };
        nhi.push(format!("{}: {}", f.control_id, f.title));
        detailed.push(f);
    }
    if telemetry.is_third_party_over_scoped {
        let f = DetailedRiskFinding {
            control_id: "NHI3:2025".into(),
            title: "Vulnerable Third-Party NHI".into(),
            severity: FindingSeverity::High,
            description:
                "Third-party OAuth integration holds administrative or destructive scopes.".into(),
            remediation: "Attenuate OAuth scopes to read-only least-privilege.".into(),
        };
        nhi.push(format!("{}: {}", f.control_id, f.title));
        detailed.push(f);
    }
    if telemetry.uses_static_key_without_oauth21 {
        let f = DetailedRiskFinding {
            control_id: "NHI4:2025".into(),
            title: "Insecure Authentication (Missing OAuth 2.1)".into(),
            severity: FindingSeverity::Medium,
            description: "Workload uses static bearer tokens without RFC 8707 or mTLS binding."
                .into(),
            remediation: "Adopt OAuth 2.1 ephemeral tokens with short TTLs.".into(),
        };
        nhi.push(format!("{}: {}", f.control_id, f.title));
        detailed.push(f);
    }
    if telemetry.has_wildcard_permissions {
        let f = DetailedRiskFinding {
            control_id: "NHI5:2025".into(),
            title: "Overprivileged NHI (Wildcard Actions)".into(),
            severity: FindingSeverity::High,
            description: "IAM policy contains wildcard actions (*:*) granting excessive reach."
                .into(),
            remediation:
                "Replace wildcard actions with right-sized Cedar least-privilege policies.".into(),
        };
        nhi.push(format!("{}: {}", f.control_id, f.title));
        detailed.push(f);
    }
    if telemetry.k8s_automount_cluster_admin {
        let f = DetailedRiskFinding {
            control_id: "NHI6:2025".into(),
            title: "Insecure Cloud Deployment (Cluster Admin Bound)".into(),
            severity: FindingSeverity::Critical,
            description: "K8s service account with cluster-admin rights automounts default token."
                .into(),
            remediation: "Disable automountServiceAccountToken and narrow RBAC role bindings."
                .into(),
        };
        nhi.push(format!("{}: {}", f.control_id, f.title));
        detailed.push(f);
    }
    if telemetry.secret_age_days > 90 {
        let f = DetailedRiskFinding {
            control_id: "NHI7:2025".into(),
            title: "Long-Lived Secrets Exceeding 90-Day Policy".into(),
            severity: FindingSeverity::Medium,
            description: "Static credentials have not rotated in over 90 days.".into(),
            remediation:
                "Execute zero-downtime rotation job or switch to ephemeral dynamic secrets.".into(),
        };
        nhi.push(format!("{}: {}", f.control_id, f.title));
        detailed.push(f);
    }
    if telemetry.shared_across_dev_and_prod {
        let f = DetailedRiskFinding {
            control_id: "NHI8:2025".into(),
            title: "Cross-Environment Isolation Failure".into(),
            severity: FindingSeverity::High,
            description: "Credential is used simultaneously across development and production."
                .into(),
            remediation: "Issue distinct isolated credentials per environment boundary.".into(),
        };
        nhi.push(format!("{}: {}", f.control_id, f.title));
        detailed.push(f);
    }
    if telemetry.shared_by_multiple_workloads {
        let f = DetailedRiskFinding {
            control_id: "NHI9:2025".into(),
            title: "NHI Credential Reuse Across Workloads".into(),
            severity: FindingSeverity::High,
            description: "Same credential fingerprint detected across multiple disjoint workloads."
                .into(),
            remediation: "Enforce 1:1 workload-to-identity binding with SPIFFE SVIDs.".into(),
        };
        nhi.push(format!("{}: {}", f.control_id, f.title));
        detailed.push(f);
    }
    if telemetry.invoked_from_human_interactive_ip {
        let f = DetailedRiskFinding {
            control_id: "NHI10:2025".into(),
            title: "Human Interactive Use of NHI Token".into(),
            severity: FindingSeverity::Medium,
            description:
                "Non-human service identity invoked from an interactive developer IP address."
                    .into(),
            remediation: "Require human SSO for interactive sessions; restrict NHI to VPC subnets."
                .into(),
        };
        nhi.push(format!("{}: {}", f.control_id, f.title));
        detailed.push(f);
    }

    let mut mcp = Vec::new();
    if telemetry.mcp_token_in_query_or_long_lived {
        let f = DetailedRiskFinding {
            control_id: "MCP01:2025".into(),
            title: "Token Mismanagement & Secret Exposure".into(),
            severity: FindingSeverity::High,
            description: "MCP token exposed in query string or headers without rotation.".into(),
            remediation: "Use Authorization bearer headers with short TTLs.".into(),
        };
        mcp.push(format!("{}: {}", f.control_id, f.title));
        detailed.push(f);
    }
    if telemetry.mcp_scope_creep_detected {
        let f = DetailedRiskFinding {
            control_id: "MCP02:2025".into(),
            title: "Privilege Escalation via Scope Creep".into(),
            severity: FindingSeverity::High,
            description: "Agent requested tool capabilities outside attested bounds.".into(),
            remediation: "Enforce Cedar least-privilege boundary and RFC 8693 attenuation.".into(),
        };
        mcp.push(format!("{}: {}", f.control_id, f.title));
        detailed.push(f);
    }
    if telemetry.mcp_tool_pin_mismatch {
        let f = DetailedRiskFinding {
            control_id: "MCP03:2025".into(),
            title: "Tool Poisoning / Definition Tampering".into(),
            severity: FindingSeverity::Critical,
            description:
                "Live MCP tool schema hash differs from approved RFC 8785 golden definition.".into(),
            remediation: "Quarantine tool server and re-verify tool definitions.".into(),
        };
        mcp.push(format!("{}: {}", f.control_id, f.title));
        detailed.push(f);
    }
    if telemetry.mcp_unpinned_supply_chain_package {
        let f = DetailedRiskFinding {
            control_id: "MCP04:2025".into(),
            title: "Software Supply Chain Risks".into(),
            severity: FindingSeverity::High,
            description: "MCP server package uses floating or unpinned dependencies.".into(),
            remediation: "Pin package versions to immutable digest hashes.".into(),
        };
        mcp.push(format!("{}: {}", f.control_id, f.title));
        detailed.push(f);
    }
    if telemetry.mcp_command_or_sql_injection_attempt {
        let f = DetailedRiskFinding {
            control_id: "MCP05:2025".into(),
            title: "Command or SQL Injection via Tool Arguments".into(),
            severity: FindingSeverity::Critical,
            description: "Destructive DDL, unescaped SQL syntax, or command injection detected."
                .into(),
            remediation: "Enforce strict AST validator and parameterized queries.".into(),
        };
        mcp.push(format!("{}: {}", f.control_id, f.title));
        detailed.push(f);
    }
    if telemetry.mcp_prompt_injection_context_leak {
        let f = DetailedRiskFinding {
            control_id: "MCP06:2025".into(),
            title: "Context Leakage via Prompt Injection".into(),
            severity: FindingSeverity::High,
            description: "Untrusted prompt output attempted to exfiltrate private context.".into(),
            remediation: "Sanitize prompt inputs and enforce egress network allowlists.".into(),
        };
        mcp.push(format!("{}: {}", f.control_id, f.title));
        detailed.push(f);
    }
    if telemetry.mcp_missing_rfc8707_audience {
        let f = DetailedRiskFinding {
            control_id: "MCP07:2025".into(),
            title: "Insufficient Authorization (Missing RFC 8707)".into(),
            severity: FindingSeverity::Medium,
            description: "Tool token lacks explicit resource indicator audience binding.".into(),
            remediation: "Require RFC 8707 audience parameter on all tool call tokens.".into(),
        };
        mcp.push(format!("{}: {}", f.control_id, f.title));
        detailed.push(f);
    }
    if telemetry.mcp_missing_otel_audit_stream {
        let f = DetailedRiskFinding {
            control_id: "MCP08:2025".into(),
            title: "Lack of Audit & Telemetry".into(),
            severity: FindingSeverity::Medium,
            description: "MCP tool executions bypass deterministic audit logging.".into(),
            remediation: "Route all executions through Axiom inline OpenTelemetry audit bus."
                .into(),
        };
        mcp.push(format!("{}: {}", f.control_id, f.title));
        detailed.push(f);
    }
    if telemetry.mcp_is_unregistered_shadow_server {
        let f = DetailedRiskFinding {
            control_id: "MCP09:2025".into(),
            title: "Shadow / Unregistered MCP Server".into(),
            severity: FindingSeverity::Critical,
            description: "Workload attempted connection to unapproved external MCP server.".into(),
            remediation: "Block connection and register server through fleet governance catalog."
                .into(),
        };
        mcp.push(format!("{}: {}", f.control_id, f.title));
        detailed.push(f);
    }
    if telemetry.mcp_cross_tenant_context_shared {
        let f = DetailedRiskFinding {
            control_id: "MCP10:2025".into(),
            title: "Cross-Tenant Context Over-Sharing".into(),
            severity: FindingSeverity::Critical,
            description: "Multi-tenant boundary violated in memory or context store.".into(),
            remediation: "Isolate tenant namespaces and purge shared memory buffers.".into(),
        };
        mcp.push(format!("{}: {}", f.control_id, f.title));
        detailed.push(f);
    }

    // Coherent scoring:
    let max_finding_severity = detailed
        .iter()
        .map(|f| f.severity)
        .max()
        .unwrap_or(FindingSeverity::Low);
    let total_weight: u32 = detailed
        .iter()
        .map(|f| match f.severity {
            FindingSeverity::Critical => 30,
            FindingSeverity::High => 18,
            FindingSeverity::Medium => 8,
            FindingSeverity::Low | FindingSeverity::Info => 3,
        })
        .sum();

    let exposure_score = (total_weight.min(100)) as u8;
    let exposure_or_owner = if !telemetry.has_active_owner {
        exposure_score.max(75)
    } else {
        exposure_score
    };

    // Composite combines exposure and blast radius, but respects minimum severity floor from critical findings
    let raw_composite =
        ((u16::from(exposure_or_owner) * 6 + u16::from(blast_radius_score) * 4) / 10) as u8;

    let composite_severity = match max_finding_severity {
        FindingSeverity::Critical if exposure_or_owner >= 50 || blast_radius_score >= 40 => {
            "CRITICAL"
        }
        FindingSeverity::Critical => "HIGH",
        FindingSeverity::High if raw_composite >= 50 || exposure_or_owner >= 60 => "HIGH",
        FindingSeverity::High => "MEDIUM",
        FindingSeverity::Medium if raw_composite >= 40 => "MEDIUM",
        FindingSeverity::Medium => "LOW",
        _ => "LOW",
    };

    EvaluatedRiskScorecard {
        entity_uid: telemetry.entity_uid.clone(),
        detailed_findings: detailed,
        owasp_nhi_findings: nhi,
        owasp_mcp_findings: mcp,
        exposure_score: exposure_or_owner,
        blast_radius_score,
        composite_severity: composite_severity.to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_all_10_violations_yield_critical_or_high() {
        let telemetry = EntitySecurityTelemetry {
            entity_uid: "test-violator".into(),
            has_active_owner: false,
            dormant_days: 120,
            secret_referenced_in_plaintext_config: true,
            is_third_party_over_scoped: true,
            uses_static_key_without_oauth21: true,
            has_wildcard_permissions: true,
            k8s_automount_cluster_admin: true,
            secret_age_days: 150,
            shared_across_dev_and_prod: true,
            shared_by_multiple_workloads: true,
            invoked_from_human_interactive_ip: true,
            mcp_token_in_query_or_long_lived: false,
            mcp_scope_creep_detected: false,
            mcp_tool_pin_mismatch: false,
            mcp_unpinned_supply_chain_package: false,
            mcp_command_or_sql_injection_attempt: false,
            mcp_prompt_injection_context_leak: false,
            mcp_missing_rfc8707_audience: false,
            mcp_missing_otel_audit_stream: false,
            mcp_is_unregistered_shadow_server: false,
            mcp_cross_tenant_context_shared: false,
        };

        // Even with blast radius 0, multiple critical/high findings MUST NOT be MEDIUM!
        let card = evaluate_entity_risk(&telemetry, 0);
        assert_eq!(card.composite_severity, "CRITICAL");
        assert_eq!(card.exposure_score, 100);
        assert!(!card.detailed_findings.is_empty());
    }

    #[test]
    fn test_clean_entity_evaluates_to_low() {
        let telemetry = EntitySecurityTelemetry {
            entity_uid: "clean-agent".into(),
            has_active_owner: true,
            dormant_days: 2,
            secret_referenced_in_plaintext_config: false,
            is_third_party_over_scoped: false,
            uses_static_key_without_oauth21: false,
            has_wildcard_permissions: false,
            k8s_automount_cluster_admin: false,
            secret_age_days: 5,
            shared_across_dev_and_prod: false,
            shared_by_multiple_workloads: false,
            invoked_from_human_interactive_ip: false,
            mcp_token_in_query_or_long_lived: false,
            mcp_scope_creep_detected: false,
            mcp_tool_pin_mismatch: false,
            mcp_unpinned_supply_chain_package: false,
            mcp_command_or_sql_injection_attempt: false,
            mcp_prompt_injection_context_leak: false,
            mcp_missing_rfc8707_audience: false,
            mcp_missing_otel_audit_stream: false,
            mcp_is_unregistered_shadow_server: false,
            mcp_cross_tenant_context_shared: false,
        };
        let card = evaluate_entity_risk(&telemetry, 10);
        assert_eq!(card.composite_severity, "LOW");
        assert_eq!(card.exposure_score, 0);
        assert!(card.detailed_findings.is_empty());
    }
}
