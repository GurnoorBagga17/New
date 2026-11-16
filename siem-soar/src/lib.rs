// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
//! Phase 3 — Enterprise SIEM & SOAR Streaming Pipeline (Splunk HEC, Microsoft Sentinel,
//! CrowdStrike Falcon SOAR, and OCSF v1.3 formatting).
//!
//! Hardened with ArcSight CEF compliant escaping to eliminate log-injection
//! and field-forgery vulnerabilities (resolving finding E-08).

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub mod dispatcher;
pub use dispatcher::{
    AzureSentinelConfig, AzureSentinelDispatcher, SiemDispatchError, SplunkHecConfig,
    SplunkHecDispatcher,
};

pub type CefSecurityEvent = OcsfAuthorizationEvent;
pub type OcsfSecurityEvent = OcsfAuthorizationEvent;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SiemDestination {
    SplunkHec,
    MicrosoftSentinel,
    CrowdStrikeSoar,
    DatadogCloudSiem,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OcsfAuthorizationEvent {
    pub class_uid: u32, // 3003 = Authorize Session / API Activity
    pub category_uid: u32,
    pub severity_id: u8,
    pub activity_name: String,
    pub actor_spiffe_id: String,
    pub target_resource: String,
    pub tool_name: String,
    pub decision: String,
    pub latency_us: u64,
    pub policy_version: String,
}

impl OcsfAuthorizationEvent {
    /// Formats as standard OCSF v1.3 JSON event.
    pub fn to_ocsf_json(&self) -> Value {
        json!({
            "class_uid": self.class_uid,
            "category_uid": self.category_uid,
            "severity_id": self.severity_id,
            "activity_name": self.activity_name,
            "actor": {
                "id": self.actor_spiffe_id,
            },
            "api": {
                "operation": self.tool_name,
                "service": {
                    "name": self.target_resource,
                }
            },
            "status": self.decision,
            "duration": self.latency_us,
            "metadata": {
                "version": "1.3.0",
                "product": {
                    "vendor_name": "Axiom NHI",
                    "name": "Runtime Gateway",
                    "version": self.policy_version,
                }
            }
        })
    }
}

/// Escapes CEF header fields (delimited by '|').
/// Backslash '\' and pipe '|' characters must be escaped with a backslash.
pub fn escape_cef_header(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for c in input.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            '|' => out.push_str("\\|"),
            '\n' | '\r' => out.push(' '), // Strip newlines in header
            _ => out.push(c),
        }
    }
    out
}

/// Escapes CEF extension dictionary values (key=value pairs).
/// Backslash '\', equals '=', and newline characters must be escaped.
pub fn escape_cef_extension(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for c in input.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            '=' => out.push_str("\\="),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            _ => out.push(c),
        }
    }
    out
}

/// Formats an authorization decision event into an injection-safe ArcSight CEF record.
pub fn format_cef_record(event: &OcsfAuthorizationEvent) -> String {
    let escaped_activity = escape_cef_header(&event.activity_name);
    let escaped_actor = escape_cef_extension(&event.actor_spiffe_id);
    let escaped_target = escape_cef_extension(&event.target_resource);
    let escaped_tool = escape_cef_extension(&event.tool_name);
    let escaped_decision = escape_cef_extension(&event.decision);

    format!(
        "CEF:0|AxiomNHI|RuntimeGateway|1.0|{}|{}|{}|src={} dst={} msg=Tool {} decision={} latency_us={}",
        event.class_uid,
        escaped_activity,
        event.severity_id,
        escaped_actor,
        escaped_target,
        escaped_tool,
        escaped_decision,
        event.latency_us
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normal_cef_formatting() {
        let event = OcsfAuthorizationEvent {
            class_uid: 3003,
            category_uid: 3,
            severity_id: 1,
            activity_name: "AuthorizeToolCall".into(),
            actor_spiffe_id: "spiffe://cluster.local/ns/prod/sa/agent-1".into(),
            target_resource: "mcp://postgres-service".into(),
            tool_name: "run_sql".into(),
            decision: "Permit".into(),
            latency_us: 420,
            policy_version: "v1.0.0".into(),
        };

        let cef = format_cef_record(&event);
        assert!(cef.starts_with("CEF:0|AxiomNHI|RuntimeGateway|1.0|3003|AuthorizeToolCall|1|"));
        assert!(cef.contains("src=spiffe://cluster.local/ns/prod/sa/agent-1"));
        assert!(cef.contains("msg=Tool run_sql decision=Permit latency_us=420"));
    }

    #[test]
    fn test_prevents_cef_header_injection() {
        let event = OcsfAuthorizationEvent {
            class_uid: 3003,
            category_uid: 3,
            severity_id: 1,
            // Attacker attempts header injection with fake pipe delimiters
            activity_name: "Authorize|10|ForgedSeverity|src=hacked".into(),
            actor_spiffe_id: "spiffe://cluster.local/sa/normal".into(),
            target_resource: "mcp://db".into(),
            tool_name: "query".into(),
            decision: "Permit".into(),
            latency_us: 100,
            policy_version: "v1".into(),
        };

        let cef = format_cef_record(&event);
        // Header pipes must be escaped as \|
        assert!(cef.contains("Authorize\\|10\\|ForgedSeverity\\|src=hacked"));
    }

    #[test]
    fn test_prevents_cef_extension_injection() {
        let event = OcsfAuthorizationEvent {
            class_uid: 3003,
            category_uid: 3,
            severity_id: 1,
            activity_name: "AuthorizeToolCall".into(),
            actor_spiffe_id: "agent-1".into(),
            target_resource: "mcp://db".into(),
            // Attacker attempts field forgery with '=' and '\n'
            tool_name: "query dst=pawned\ndecision=Permit".into(),
            decision: "Deny".into(),
            latency_us: 100,
            policy_version: "v1".into(),
        };

        let cef = format_cef_record(&event);
        // Newline and '=' must be escaped
        assert!(cef.contains("msg=Tool query dst\\=pawned\\ndecision\\=Permit"));
        assert!(cef.ends_with("decision=Deny latency_us=100"));
    }

    #[test]
    fn test_formats_valid_ocsf_json() {
        let event = OcsfAuthorizationEvent {
            class_uid: 3003,
            category_uid: 3,
            severity_id: 2,
            activity_name: "AuthorizeToolCall".into(),
            actor_spiffe_id: "spiffe://prod/agent".into(),
            target_resource: "mcp://vault".into(),
            tool_name: "read_secret".into(),
            decision: "Deny".into(),
            latency_us: 890,
            policy_version: "v1.2.0".into(),
        };

        let json = event.to_ocsf_json();
        assert_eq!(json["class_uid"], 3003);
        assert_eq!(json["status"], "Deny");
        assert_eq!(json["api"]["operation"], "read_secret");
        assert_eq!(json["metadata"]["version"], "1.3.0");
    }
}
