// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
//! Slack Block Kit Interactive Approval Card Generator.
//!
//! Renders Slack interactive blocks cryptographically bound to the ticket's
//! SHA-256 payload hash. When a security reviewer clicks "Approve" or "Deny",
//! Slack delivers the button's action payload containing `payload_sha256` back
//! to Axiom's webhook to prevent argument tampering (TOCTOU attacks).

use crate::PendingApprovalTicket;
use serde_json::{json, Value};

pub struct SlackApprovalCardBuilder;

impl SlackApprovalCardBuilder {
    /// Renders a complete Slack Block Kit message payload for a pending approval ticket.
    pub fn build_interactive_card(ticket: &PendingApprovalTicket, channel: Option<&str>) -> Value {
        let mut message = json!({
            "text": format!("🚨 Axiom NHI Approval Request: {}", ticket.tool_name),
            "blocks": [
                {
                    "type": "header",
                    "text": {
                        "type": "plain_text",
                        "text": "🚨 Axiom NHI — Sensitive Action Approval Required",
                        "emoji": true
                    }
                },
                {
                    "type": "section",
                    "fields": [
                        {
                            "type": "mrkdwn",
                            "text": format!("*Agent Principal:*\n`{}`", ticket.agent_id)
                        },
                        {
                            "type": "mrkdwn",
                            "text": format!("*Target Server:*\n`{}`", ticket.target_server)
                        },
                        {
                            "type": "mrkdwn",
                            "text": format!("*Tool:*\n`{}`", ticket.tool_name)
                        },
                        {
                            "type": "mrkdwn",
                            "text": format!("*Expires Unix:*\n`{}`", ticket.expires_at_unix)
                        }
                    ]
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": format!("*Canonical Execution Arguments:*\n```{arguments}```", arguments = ticket.canonical_arguments_json)
                    }
                },
                {
                    "type": "context",
                    "elements": [
                        {
                            "type": "mrkdwn",
                            "text": format!("🔒 *Cryptographic Binding:* `{}`", ticket.payload_sha256)
                        }
                    ]
                },
                {
                    "type": "actions",
                    "block_id": format!("axiom_approval_actions:{}", ticket.ticket_id),
                    "elements": [
                        {
                            "type": "button",
                            "text": {
                                "type": "plain_text",
                                "text": "Approve Action",
                                "emoji": true
                            },
                            "style": "primary",
                            "action_id": "axiom_approve_action",
                            "value": json!({
                                "ticket_id": ticket.ticket_id,
                                "expected_payload_sha256": ticket.payload_sha256,
                            }).to_string()
                        },
                        {
                            "type": "button",
                            "text": {
                                "type": "plain_text",
                                "text": "Deny / Halt",
                                "emoji": true
                            },
                            "style": "danger",
                            "action_id": "axiom_deny_action",
                            "value": json!({
                                "ticket_id": ticket.ticket_id,
                            }).to_string()
                        }
                    ]
                }
            ]
        });

        if let Some(ch) = channel {
            message["channel"] = json!(ch);
        }

        message
    }

    /// Verifies Slack's HMAC-SHA256 signature (`X-Slack-Signature`) to prevent webhook forgery (INT-01).
    pub fn verify_slack_signature(
        signing_secret: &str,
        timestamp: &str,
        body: &str,
        expected_signature: &str,
    ) -> bool {
        use hmac::{Hmac, Mac};
        use sha2::Sha256;

        type HmacSha256 = Hmac<Sha256>;

        let Ok(mut mac) = HmacSha256::new_from_slice(signing_secret.as_bytes()) else {
            return false;
        };

        let basestring = format!("v0:{timestamp}:{body}");
        mac.update(basestring.as_bytes());
        let computed_hex = format!("v0={}", hex::encode(mac.finalize().into_bytes()));

        // Constant-time comparison
        if computed_hex.len() != expected_signature.len() {
            return false;
        }

        let mut diff = 0u8;
        for (a, b) in computed_hex.bytes().zip(expected_signature.bytes()) {
            diff |= a ^ b;
        }
        diff == 0
    }

    /// Dispatches an interactive Slack Block Kit approval card to an incoming webhook or channel endpoint.
    pub async fn dispatch_slack_approval_card(
        webhook_url: &str,
        card: &Value,
    ) -> Result<(), String> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .map_err(|e| e.to_string())?;

        let res = client
            .post(webhook_url)
            .json(card)
            .send()
            .await
            .map_err(|e| format!("HTTP transport error: {e}"))?;

        if !res.status().is_success() {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            return Err(format!("Slack API error HTTP {status}: {text}"));
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ApprovalStatus;

    #[test]
    fn generates_valid_slack_block_kit_with_bound_hash() {
        let ticket = PendingApprovalTicket {
            ticket_id: "ticket-101".into(),
            agent_id: "agent-sales-bot".into(),
            target_server: "mcp://salesforce".into(),
            tool_name: "update_opportunity".into(),
            canonical_arguments_json: "{\"amount\":50000}".into(),
            payload_sha256: "sha256:4a6f7b...".into(),
            expires_at_unix: 1770000000,
            status: ApprovalStatus::Pending,
        };

        let card =
            SlackApprovalCardBuilder::build_interactive_card(&ticket, Some("#security-approvals"));
        assert_eq!(card["channel"], "#security-approvals");

        let blocks = card["blocks"].as_array().expect("Blocks must be an array");
        assert_eq!(blocks.len(), 5);

        // Verify primary approve button carries ticket_id and payload_sha256
        let actions = &blocks[4];
        let approve_btn = &actions["elements"][0];
        assert_eq!(approve_btn["action_id"], "axiom_approve_action");
        assert_eq!(approve_btn["style"], "primary");

        let btn_val: Value = serde_json::from_str(approve_btn["value"].as_str().unwrap()).unwrap();
        assert_eq!(btn_val["ticket_id"], "ticket-101");
        assert_eq!(btn_val["expected_payload_sha256"], "sha256:4a6f7b...");
    }

    #[test]
    fn test_verify_slack_signature_valid_and_invalid() {
        use hmac::{Hmac, Mac};
        use sha2::Sha256;
        type HmacSha256 = Hmac<Sha256>;

        let secret = "test_signing_secret_12345";
        let timestamp = "1700000000";
        let body = "payload=test_body";

        let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).unwrap();
        mac.update(format!("v0:{timestamp}:{body}").as_bytes());
        let valid_sig = format!("v0={}", hex::encode(mac.finalize().into_bytes()));

        assert!(SlackApprovalCardBuilder::verify_slack_signature(
            secret, timestamp, body, &valid_sig
        ));
        assert!(!SlackApprovalCardBuilder::verify_slack_signature(
            "wrong_secret",
            timestamp,
            body,
            &valid_sig
        ));
        assert!(!SlackApprovalCardBuilder::verify_slack_signature(
            secret,
            "1700000001",
            body,
            &valid_sig
        ));
        assert!(!SlackApprovalCardBuilder::verify_slack_signature(
            secret,
            timestamp,
            "tampered_body",
            &valid_sig
        ));
    }
}
