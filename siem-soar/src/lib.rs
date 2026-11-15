// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
//! Phase 3 — Enterprise SIEM & SOAR Streaming Pipeline (Splunk HEC, Microsoft Sentinel,
//! CrowdStrike Falcon SOAR, and OCSF v1.3 formatting).

use serde::{Deserialize, Serialize};

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

pub fn format_cef_record(event: &OcsfAuthorizationEvent) -> String {
    format!(
        "CEF:0|AxiomNHI|RuntimeGateway|1.0|{}|{}|{}|src={} dst={} msg=Tool {} decision={} latency_us={}",
        event.class_uid,
        event.activity_name,
        event.severity_id,
        event.actor_spiffe_id,
        event.target_resource,
        event.tool_name,
        event.decision,
        event.latency_us
    )
}
