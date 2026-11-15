// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
//! Team 2 & Team 4 — Standards-Grounded OWASP NHI Top 10 (2025) & OWASP MCP Top 10 (2025)
//! Deterministic Risk Evaluators.

use serde::{Deserialize, Serialize};

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
    let mut nhi = Vec::new();
    if !telemetry.has_active_owner || telemetry.dormant_days > 90 {
        nhi.push("NHI1:2025 Improper Offboarding".to_owned());
    }
    if telemetry.secret_referenced_in_plaintext_config {
        nhi.push("NHI2:2025 Secret Leakage".to_owned());
    }
    if telemetry.is_third_party_over_scoped {
        nhi.push("NHI3:2025 Vulnerable Third-Party NHI".to_owned());
    }
    if telemetry.uses_static_key_without_oauth21 {
        nhi.push("NHI4:2025 Insecure Authentication".to_owned());
    }
    if telemetry.has_wildcard_permissions {
        nhi.push("NHI5:2025 Overprivileged NHI".to_owned());
    }
    if telemetry.k8s_automount_cluster_admin {
        nhi.push("NHI6:2025 Insecure Cloud Deployment Configurations".to_owned());
    }
    if telemetry.secret_age_days > 90 {
        nhi.push("NHI7:2025 Long-Lived Secrets".to_owned());
    }
    if telemetry.shared_across_dev_and_prod {
        nhi.push("NHI8:2025 Environment Isolation".to_owned());
    }
    if telemetry.shared_by_multiple_workloads {
        nhi.push("NHI9:2025 NHI Reuse".to_owned());
    }
    if telemetry.invoked_from_human_interactive_ip {
        nhi.push("NHI10:2025 Human Use of NHI".to_owned());
    }

    let mut mcp = Vec::new();
    if telemetry.mcp_token_in_query_or_long_lived {
        mcp.push("MCP01:2025 Token Mismanagement & Secret Exposure".to_owned());
    }
    if telemetry.mcp_scope_creep_detected {
        mcp.push("MCP02:2025 Privilege Escalation via Scope Creep".to_owned());
    }
    if telemetry.mcp_tool_pin_mismatch {
        mcp.push("MCP03:2025 Tool Poisoning".to_owned());
    }
    if telemetry.mcp_unpinned_supply_chain_package {
        mcp.push("MCP04:2025 Software Supply Chain Attacks".to_owned());
    }
    if telemetry.mcp_command_or_sql_injection_attempt {
        mcp.push("MCP05:2025 Command Injection & Execution".to_owned());
    }
    if telemetry.mcp_prompt_injection_context_leak {
        mcp.push("MCP06:2025 Prompt Injection via Contextual Payloads".to_owned());
    }
    if telemetry.mcp_missing_rfc8707_audience {
        mcp.push("MCP07:2025 Insufficient Authentication & Authorization".to_owned());
    }
    if telemetry.mcp_missing_otel_audit_stream {
        mcp.push("MCP08:2025 Lack of Audit & Telemetry".to_owned());
    }
    if telemetry.mcp_is_unregistered_shadow_server {
        mcp.push("MCP09:2025 Shadow MCP Servers".to_owned());
    }
    if telemetry.mcp_cross_tenant_context_shared {
        mcp.push("MCP10:2025 Context Over-Sharing".to_owned());
    }

    let finding_points = ((nhi.len() * 14) + (mcp.len() * 16)).min(100) as u8;
    let exposure_score = finding_points.max(if !telemetry.has_active_owner { 75 } else { 15 });
    let composite = ((u16::from(exposure_score) + u16::from(blast_radius_score)) / 2) as u8;

    let severity = if composite >= 80 || mcp.iter().any(|f| f.starts_with("MCP03") || f.starts_with("MCP09")) {
        "CRITICAL"
    } else if composite >= 60 {
        "HIGH"
    } else if composite >= 35 {
        "MEDIUM"
    } else {
        "LOW"
    };

    EvaluatedRiskScorecard {
        entity_uid: telemetry.entity_uid.clone(),
        owasp_nhi_findings: nhi,
        owasp_mcp_findings: mcp,
        exposure_score,
        blast_radius_score,
        composite_severity: severity.to_owned(),
    }
}
