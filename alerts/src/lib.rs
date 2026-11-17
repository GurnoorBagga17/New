// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
//! Team 5 — Automated 30-Minute Shadow-NHI Audit Report Generator &
//! Deduplicated Slack Block Kit / Jira REST v3 Alerting.

use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::HashMap;

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
    pub critical_findings_count: usize,
    pub recommended_cedar_remediations: Vec<String>,
}

/// Deduplicates outbound Slack/Jira alerts within a suppression window.
/// Note: The fingerprint intentionally excludes severity so that severity flapping
/// does not trigger alert storms (E-05).
pub struct AlertDeduplicator {
    suppression_window_secs: i64,
    max_capacity: usize,
    last_sent_by_fingerprint: HashMap<String, i64>,
}

impl AlertDeduplicator {
    pub fn new(suppression_window_secs: i64) -> Self {
        Self {
            suppression_window_secs,
            max_capacity: 10_000,
            last_sent_by_fingerprint: HashMap::new(),
        }
    }

    /// Computes fingerprint over (entity_uid, finding_code) exclusively.
    pub fn compute_fingerprint(entity_uid: &str, finding_code: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(format!("{entity_uid}|{finding_code}").as_bytes());
        hex::encode(hasher.finalize())
    }

    pub fn should_dispatch(&mut self, entity_uid: &str, finding_code: &str, now_unix: i64) -> bool {
        let fp = Self::compute_fingerprint(entity_uid, finding_code);
        if let Some(&last_ts) = self.last_sent_by_fingerprint.get(&fp) {
            if now_unix - last_ts < self.suppression_window_secs {
                return false;
            }
        }

        // Bounded capacity prune
        if self.last_sent_by_fingerprint.len() >= self.max_capacity {
            let cutoff = now_unix - self.suppression_window_secs;
            self.last_sent_by_fingerprint
                .retain(|_, &mut ts| ts >= cutoff);
        }

        self.last_sent_by_fingerprint.insert(fp, now_unix);
        true
    }
}

/// Formats a Slack Block Kit interactive security alert.
pub fn build_slack_alert_payload(
    entity_uid: &str,
    control_id: &str,
    severity: &str,
    description: &str,
    remediation_url: &str,
) -> serde_json::Value {
    let emoji = match severity {
        "CRITICAL" => "🚨",
        "HIGH" => "⚠️",
        _ => "ℹ️",
    };

    json!({
        "blocks": [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": format!("{emoji} Axiom NHI Alert: {control_id} [{severity}]"),
                    "emoji": true
                }
            },
            {
                "type": "section",
                "fields": [
                    { "type": "mrkdwn", "text": format!("*Entity UID:*\n`{entity_uid}`") },
                    { "type": "mrkdwn", "text": format!("*Severity:*\n*{severity}*") }
                ]
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": format!("*Details:*\n{description}")
                }
            },
            {
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": { "type": "plain_text", "text": "Remediate in Console" },
                        "style": "primary",
                        "url": remediation_url
                    },
                    {
                        "type": "button",
                        "text": { "type": "plain_text", "text": "Quarantine / Revoke" },
                        "style": "danger",
                        "value": format!("revoke:{entity_uid}")
                    }
                ]
            }
        ]
    })
}

/// Formats a Jira Cloud REST API v3 Issue creation payload.
pub fn build_jira_issue_payload(
    project_key: &str,
    entity_uid: &str,
    control_id: &str,
    severity: &str,
    description: &str,
) -> serde_json::Value {
    json!({
        "fields": {
            "project": { "key": project_key },
            "summary": format!("[Axiom NHI] {control_id} on {entity_uid}"),
            "issuetype": { "name": "Security Incident" },
            "priority": { "name": if severity == "CRITICAL" { "Highest" } else { "High" } },
            "description": {
                "type": "doc",
                "version": 1,
                "content": [
                    {
                        "type": "paragraph",
                        "content": [
                            { "type": "text", "text": description }
                        ]
                    }
                ]
            },
            "labels": ["axiom-nhi", "auto-generated", control_id]
        }
    })
}

/// Dispatches an interactive Slack Block Kit alert to an incoming webhook URL.
pub async fn dispatch_slack_alert(
    webhook_url: &str,
    payload: &serde_json::Value,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .post(webhook_url)
        .json(payload)
        .send()
        .await
        .map_err(|e| format!("Slack transport error: {e}"))?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("Slack webhook returned HTTP {status}: {text}"));
    }
    Ok(())
}

/// Dispatches a new Jira Cloud incident issue via Jira REST API v3.
pub async fn dispatch_jira_issue(
    jira_base_url: &str,
    user_email: &str,
    api_token: &str,
    payload: &serde_json::Value,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;

    let endpoint = format!("{}/rest/api/3/issue", jira_base_url.trim_end_matches('/'));
    let res = client
        .post(&endpoint)
        .basic_auth(user_email, Some(api_token))
        .json(payload)
        .send()
        .await
        .map_err(|e| format!("Jira transport error: {e}"))?;

    let status = res.status();
    if !status.is_success() {
        let text = res.text().await.unwrap_or_default();
        return Err(format!("Jira REST v3 error HTTP {status}: {text}"));
    }

    let json_resp: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let key = json_resp
        .get("key")
        .and_then(|k| k.as_str())
        .unwrap_or("UNKNOWN-KEY")
        .to_string();
    Ok(key)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RemediationPlaybook {
    AutoRotateCompromisedSecret,
    QuarantineAnomalousAgent,
    SeverSpiceDbDelegationChain,
    EnforceStepUpHumanApproval,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlaybookExecutionReceipt {
    pub entity_id: String,
    pub playbook: RemediationPlaybook,
    pub auto_revoked: bool,
    pub dual_secret_rotation_triggered: bool,
}

pub fn trigger_automated_playbook(
    entity_id: &str,
    anomaly_score: u8,
    shared_credential_siblings: usize,
) -> PlaybookExecutionReceipt {
    if anomaly_score >= 85 && shared_credential_siblings > 0 {
        PlaybookExecutionReceipt {
            entity_id: entity_id.to_string(),
            playbook: RemediationPlaybook::AutoRotateCompromisedSecret,
            auto_revoked: false,
            dual_secret_rotation_triggered: true,
        }
    } else {
        PlaybookExecutionReceipt {
            entity_id: entity_id.to_string(),
            playbook: RemediationPlaybook::QuarantineAnomalousAgent,
            auto_revoked: true,
            dual_secret_rotation_triggered: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dedup_ignores_severity_flapping() {
        let mut dedup = AlertDeduplicator::new(300);
        let now = 1700000000;

        // First alert dispatched
        assert!(dedup.should_dispatch("agent:123", "MCP05:2025", now));

        // Flapping from HIGH to CRITICAL 10 seconds later must be suppressed!
        assert!(!dedup.should_dispatch("agent:123", "MCP05:2025", now + 10));

        // Different finding code is NOT suppressed
        assert!(dedup.should_dispatch("agent:123", "NHI1:2025", now + 10));

        // After window expires (301s), it is allowed again
        assert!(dedup.should_dispatch("agent:123", "MCP05:2025", now + 301));
    }

    #[test]
    fn test_slack_and_jira_payload_generation() {
        let slack = build_slack_alert_payload(
            "aws:iam::123:role/AgentRole",
            "NHI2:2025",
            "CRITICAL",
            "Plaintext secret discovered",
            "https://console.axiom.security/findings/123",
        );
        assert_eq!(slack["blocks"][0]["type"], "header");

        let jira = build_jira_issue_payload(
            "SEC",
            "aws:iam::123:role/AgentRole",
            "NHI2:2025",
            "CRITICAL",
            "Plaintext secret discovered",
        );
        assert_eq!(jira["fields"]["project"]["key"], "SEC");
        assert_eq!(jira["fields"]["priority"]["name"], "Highest");
    }
}
