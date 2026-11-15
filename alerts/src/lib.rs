// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
//! Team 5 — Automated 30-Minute Shadow-NHI Audit Report Generator &
//! Deduplicated Slack Block Kit / Jira REST v3 Alerting.

use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ShadowAuditSummary {
    pub tenant_name: String,
    pub onboarding_duration_seconds: u32,
    pub total_discovered_nhis: u32,
    pub total_discovered_mcp_servers: u32,
    pub total_discovered_ai_agents: u32,
    pub actively_governed_count: u32,
    pub discovery_cost_usd: u32, // Always $0 per Master Plan Section 4
    pub shadow_mcp_endpoints: Vec<String>,
    pub unowned_credentials: Vec<String>,
    pub shared_static_secrets: Vec<String>,
    pub recommended_cedar_remediations: Vec<String>,
}

/// Deduplicates outbound Slack/Jira alerts within a suppression window using SHA-256 fingerprints.
pub struct AlertDeduplicator {
    suppression_window_secs: i64,
    last_sent_by_fingerprint: HashMap<String, i64>,
}

impl AlertDeduplicator {
    pub fn new(suppression_window_secs: i64) -> Self {
        Self {
            suppression_window_secs,
            last_sent_by_fingerprint: HashMap::new(),
        }
    }

    pub fn compute_fingerprint(entity_uid: &str, finding_code: &str, severity: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(format!("{entity_uid}|{finding_code}|{severity}").as_bytes());
        hex::encode(hasher.finalize())
    }

    pub fn should_dispatch(&mut self, entity_uid: &str, finding_code: &str, severity: &str, now_unix: i64) -> bool {
        let fp = Self::compute_fingerprint(entity_uid, finding_code, severity);
        if let Some(&last_ts) = self.last_sent_by_fingerprint.get(&fp) {
            if now_unix - last_ts < self.suppression_window_secs {
                return false;
            }
        }
        self.last_sent_by_fingerprint.insert(fp, now_unix);
        true
    }
}
