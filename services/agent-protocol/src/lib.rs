// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
//! Shared wire contract for the Axiom hybrid SaaS architecture.
//!
//! The vendor hosts the control plane. The customer runs a thin agent that
//! dials **outbound** over TLS 443 and speaks the envelope implemented here.
//! Version 1 uses JSON over WebSocket because strict corporate egress proxies
//! routinely inspect and block non-standard ALPN/HTTP2 behaviour; the same
//! envelope can be carried by gRPC or gRPC-Web later without changing the
//! domain types.
//!
//! Security invariants:
//! - The agent is always the client; the control plane never dials in.
//! - Audit payloads contain metadata and hashes, never raw tool arguments.
//! - Policy bundles are content-addressed (`sha256`) and signed (Ed25519).
//! - Every message carries a monotonically increasing `seq` where ordering
//!   matters so the receiver can detect loss and duplicates.

use std::collections::BTreeMap;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

/// Increment when the envelope changes in a backwards-incompatible way.
pub const PROTOCOL_VERSION: u32 = 1;

/// Default heartbeat cadence requested by the control plane.
pub const DEFAULT_HEARTBEAT_SECONDS: u64 = 10;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentStatus {
    Pending,
    Online,
    Offline,
    Revoked,
}

/// A signed, content-addressed policy snapshot.
///
/// `signature` is the hex-encoded Ed25519 signature over
/// [`policy_signing_payload`]. The agent must reject a bundle whose signature
/// does not verify against the pinned control-plane public key.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PolicyBundle {
    pub bundle_id: Uuid,
    pub tenant_id: String,
    pub version: u64,
    pub sha256: String,
    pub cedar_source: String,
    pub signature: String,
    pub issued_at: DateTime<Utc>,
}

/// Canonical bytes covered by the policy signature.
///
/// Both the control plane and the agent call this function, so the signed
/// representation cannot drift between implementations. Timestamps are
/// expressed as Unix milliseconds to avoid RFC3339 precision differences.
#[derive(Serialize)]
struct SigningPayload<'a> {
    bundle_id: &'a str,
    tenant_id: &'a str,
    version: u64,
    sha256: &'a str,
    issued_at_unix_ms: i64,
}

pub fn policy_signing_payload(bundle: &PolicyBundle) -> Vec<u8> {
    serde_json::to_vec(&SigningPayload {
        bundle_id: &bundle.bundle_id.to_string(),
        tenant_id: &bundle.tenant_id,
        version: bundle.version,
        sha256: &bundle.sha256,
        issued_at_unix_ms: bundle.issued_at.timestamp_millis(),
    })
    .expect("policy signing payload is always serialisable")
}

/// Revocation snapshot pushed to agents. Mirrors the runtime's local file
/// format closely enough that the supervisor can translate it without a
/// second schema.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct RevocationState {
    pub version: u64,
    pub global: bool,
    #[serde(default)]
    pub servers: Vec<String>,
    #[serde(default)]
    pub tools: Vec<String>,
    #[serde(default)]
    pub agents: Vec<String>,
}

/// Metadata-only audit record. Raw prompts, tool arguments, and credentials
/// are deliberately absent.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AuditEventEnvelope {
    pub event_id: Uuid,
    pub occurred_at: DateTime<Utc>,
    pub decision: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub latency_ms: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub payload_hash: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prev_hash: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entry_hash: Option<String>,
}

/// Messages sent by the agent to the control plane.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AgentMessage {
    Hello {
        protocol_version: u32,
        agent_id: Uuid,
        agent_version: String,
        #[serde(default)]
        labels: BTreeMap<String, String>,
    },
    Heartbeat {
        seq: u64,
        sent_at: DateTime<Utc>,
        policy_version: u64,
        decisions_total: u64,
        denies_total: u64,
    },
    PolicyAck {
        seq: u64,
        version: u64,
        applied: bool,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        error: Option<String>,
    },
    AuditBatch {
        seq: u64,
        events: Vec<AuditEventEnvelope>,
    },
    KillSwitchAck {
        seq: u64,
        received_at: DateTime<Utc>,
    },
}

/// Messages sent by the control plane to the agent.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ControlMessage {
    HelloAck {
        protocol_version: u32,
        server_time: DateTime<Utc>,
        heartbeat_interval_seconds: u64,
    },
    Policy(PolicyBundle),
    KillSwitch {
        scope: String,
        reason: String,
        issued_at: DateTime<Utc>,
    },
    Revocations {
        state: RevocationState,
    },
}

pub fn sha256_hex(input: &str) -> String {
    let digest = Sha256::digest(input.as_bytes());
    hex::encode(digest)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bundle() -> PolicyBundle {
        PolicyBundle {
            bundle_id: Uuid::nil(),
            tenant_id: "tenant-a".into(),
            version: 7,
            sha256: sha256_hex("permit(principal, action, resource);"),
            cedar_source: "permit(principal, action, resource);".into(),
            signature: String::new(),
            issued_at: DateTime::from_timestamp_millis(1_700_000_000_000).unwrap(),
        }
    }

    #[test]
    fn signing_payload_is_stable() {
        let b = bundle();
        let first = policy_signing_payload(&b);
        let second = policy_signing_payload(&b);
        assert_eq!(first, second);

        let parsed: serde_json::Value = serde_json::from_slice(&first).unwrap();
        assert_eq!(parsed["tenant_id"], "tenant-a");
        assert_eq!(parsed["version"], 7);
        assert_eq!(parsed["issued_at_unix_ms"], 1_700_000_000_000i64);
        assert_eq!(
            parsed["sha256"],
            sha256_hex("permit(principal, action, resource);")
        );
    }

    #[test]
    fn messages_round_trip() {
        let msg = AgentMessage::Heartbeat {
            seq: 3,
            sent_at: Utc::now(),
            policy_version: 2,
            decisions_total: 10,
            denies_total: 1,
        };
        let encoded = serde_json::to_string(&msg).unwrap();
        let decoded: AgentMessage = serde_json::from_str(&encoded).unwrap();
        assert_eq!(msg, decoded);
    }
}
