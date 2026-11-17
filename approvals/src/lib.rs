// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
//! Phase 3 — Atomic Single-Use Human-in-the-Loop Approval Engine.
//!
//! Binds Slack Interactive Approval Cards and Console/CLI approvals to a
//! cryptographic SHA-256 hash of `(agent_id, target_server, tool_name, canonical_arguments_json, nonce)`.
//! Guarantees:
//! 1. Argument Tamper Prevention: If an agent alters even 1 character of the SQL/API
//!    payload after approval, the SHA-256 hash mismatch fails closed.
//! 2. Atomic Single-Use Consumption: An approved token can be redeemed exactly once.
//! 3. Re-Approval Prevention: Tickets cannot be re-approved after consumption, expiration, or denial.
//! 4. Delimiter-Free Canonical Hashing: Uses length-prefixed domain-separated canonical hashing
//!    to eliminate delimiter-injection collision vulnerabilities.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use thiserror::Error;

pub mod slack;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ApprovalStatus {
    Pending,
    Approved {
        approver_email: String,
        approved_at_unix: i64,
    },
    Consumed {
        consumed_at_unix: i64,
    },
    Denied {
        reviewer_email: String,
        reason: String,
    },
    Expired,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PendingApprovalTicket {
    pub ticket_id: String,
    pub agent_id: String,
    pub target_server: String,
    pub tool_name: String,
    pub canonical_arguments_json: String,
    pub payload_sha256: String,
    pub expires_at_unix: i64,
    pub status: ApprovalStatus,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ApprovalError {
    #[error("approval ticket '{0}' not found")]
    NotFound(String),
    #[error("approval ticket expired at {0}")]
    Expired(i64),
    #[error("payload hash mismatch: approved '{expected}', attempted execution with '{actual}'")]
    PayloadTampered { expected: String, actual: String },
    #[error("atomic single-use violation: ticket '{0}' was already consumed")]
    AlreadyConsumed(String),
    #[error("ticket is not in Approved state")]
    NotApproved,
    #[error("ticket '{0}' is not in Pending state (already approved)")]
    AlreadyApproved(String),
    #[error("ticket '{0}' is not in Pending state (already denied)")]
    AlreadyDenied(String),
}

/// Computes length-prefixed domain-separated SHA-256 hash over all payload components.
/// Eliminates delimiter-injection vulnerabilities (e.g. '|' embedded in agent_id or arguments).
pub fn compute_payload_sha256(
    agent_id: &str,
    target_server: &str,
    tool_name: &str,
    canonical_arguments_json: &str,
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"AXIOM_APPROVAL_PAYLOAD_V1\x00");
    for field in [agent_id, target_server, tool_name, canonical_arguments_json] {
        hasher.update((field.len() as u64).to_le_bytes());
        hasher.update(field.as_bytes());
    }
    format!("sha256:{}", hex::encode(hasher.finalize()))
}

#[derive(Default)]
pub struct AtomicApprovalStore {
    tickets: HashMap<String, PendingApprovalTicket>,
}

impl AtomicApprovalStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn create_ticket(
        &mut self,
        ticket_id: impl Into<String>,
        agent_id: impl Into<String>,
        target_server: impl Into<String>,
        tool_name: impl Into<String>,
        canonical_arguments_json: impl Into<String>,
        expires_at_unix: i64,
    ) -> PendingApprovalTicket {
        let ticket_id = ticket_id.into();
        let agent_id = agent_id.into();
        let target_server = target_server.into();
        let tool_name = tool_name.into();
        let canonical_arguments_json = canonical_arguments_json.into();
        let payload_sha256 = compute_payload_sha256(
            &agent_id,
            &target_server,
            &tool_name,
            &canonical_arguments_json,
        );
        let ticket = PendingApprovalTicket {
            ticket_id: ticket_id.clone(),
            agent_id,
            target_server,
            tool_name,
            canonical_arguments_json,
            payload_sha256,
            expires_at_unix,
            status: ApprovalStatus::Pending,
        };
        self.tickets.insert(ticket_id, ticket.clone());
        ticket
    }

    pub fn approve_ticket(
        &mut self,
        ticket_id: &str,
        approver_email: impl Into<String>,
        expected_payload_sha256: &str,
        now_unix: i64,
    ) -> Result<PendingApprovalTicket, ApprovalError> {
        let ticket = self
            .tickets
            .get_mut(ticket_id)
            .ok_or_else(|| ApprovalError::NotFound(ticket_id.to_owned()))?;

        if now_unix >= ticket.expires_at_unix {
            ticket.status = ApprovalStatus::Expired;
            return Err(ApprovalError::Expired(ticket.expires_at_unix));
        }

        match &ticket.status {
            ApprovalStatus::Pending => {}
            ApprovalStatus::Consumed { .. } => {
                return Err(ApprovalError::AlreadyConsumed(ticket_id.to_owned()));
            }
            ApprovalStatus::Expired => {
                return Err(ApprovalError::Expired(ticket.expires_at_unix));
            }
            ApprovalStatus::Approved { .. } => {
                return Err(ApprovalError::AlreadyApproved(ticket_id.to_owned()));
            }
            ApprovalStatus::Denied { .. } => {
                return Err(ApprovalError::AlreadyDenied(ticket_id.to_owned()));
            }
        }

        if ticket.payload_sha256 != expected_payload_sha256 {
            return Err(ApprovalError::PayloadTampered {
                expected: ticket.payload_sha256.clone(),
                actual: expected_payload_sha256.to_owned(),
            });
        }
        ticket.status = ApprovalStatus::Approved {
            approver_email: approver_email.into(),
            approved_at_unix: now_unix,
        };
        Ok(ticket.clone())
    }

    /// Redeems an approved ticket exactly once, verifying that the runtime tool call
    /// arguments match the exact SHA-256 hash signed by the human approver.
    pub fn consume_atomic(
        &mut self,
        ticket_id: &str,
        agent_id: &str,
        target_server: &str,
        tool_name: &str,
        runtime_arguments_json: &str,
        now_unix: i64,
    ) -> Result<(), ApprovalError> {
        let ticket = self
            .tickets
            .get_mut(ticket_id)
            .ok_or_else(|| ApprovalError::NotFound(ticket_id.to_owned()))?;

        if now_unix >= ticket.expires_at_unix {
            ticket.status = ApprovalStatus::Expired;
            return Err(ApprovalError::Expired(ticket.expires_at_unix));
        }

        match &ticket.status {
            ApprovalStatus::Consumed { .. } => {
                return Err(ApprovalError::AlreadyConsumed(ticket_id.to_owned()));
            }
            ApprovalStatus::Approved { .. } => {}
            _ => return Err(ApprovalError::NotApproved),
        }

        let runtime_hash =
            compute_payload_sha256(agent_id, target_server, tool_name, runtime_arguments_json);
        if runtime_hash != ticket.payload_sha256 {
            return Err(ApprovalError::PayloadTampered {
                expected: ticket.payload_sha256.clone(),
                actual: runtime_hash,
            });
        }

        ticket.status = ApprovalStatus::Consumed {
            consumed_at_unix: now_unix,
        };
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cannot_reapprove_consumed_ticket() {
        let mut store = AtomicApprovalStore::new();
        let ticket = store.create_ticket("t-1", "agent-1", "pg", "query", "{\"q\":1}", 1000);
        let hash = ticket.payload_sha256.clone();

        let approved = store.approve_ticket("t-1", "admin@axiom.security", &hash, 500);
        assert!(approved.is_ok());

        let consumed = store.consume_atomic("t-1", "agent-1", "pg", "query", "{\"q\":1}", 550);
        assert!(consumed.is_ok());

        // Attempting to re-approve the consumed ticket must fail closed!
        let reapprove = store.approve_ticket("t-1", "attacker@axiom.security", &hash, 600);
        assert!(matches!(reapprove, Err(ApprovalError::AlreadyConsumed(_))));

        // Attempting to consume again must also fail closed!
        let re_consume = store.consume_atomic("t-1", "agent-1", "pg", "query", "{\"q\":1}", 650);
        assert!(matches!(re_consume, Err(ApprovalError::AlreadyConsumed(_))));
    }

    #[test]
    fn prevents_hash_delimiter_collision() {
        let h1 = compute_payload_sha256("agent|server", "prod", "tool", "{}");
        let h2 = compute_payload_sha256("agent", "server|prod", "tool", "{}");
        assert_ne!(
            h1, h2,
            "Length-prefixed hashing prevents delimiter collision attacks"
        );
    }

    #[test]
    fn detects_tampered_payload_on_approval_and_consumption() {
        let mut store = AtomicApprovalStore::new();
        let ticket = store.create_ticket(
            "t-2",
            "agent-2",
            "pg",
            "query",
            "{\"q\":\"SELECT 1\"}",
            1000,
        );

        // Approving with altered hash fails
        let err = store.approve_ticket("t-2", "admin@axiom.security", "sha256:badhash", 500);
        assert!(matches!(err, Err(ApprovalError::PayloadTampered { .. })));

        // Approving with valid hash succeeds
        store
            .approve_ticket("t-2", "admin@axiom.security", &ticket.payload_sha256, 500)
            .unwrap();

        // Consuming with altered payload fails
        let tampered_consume = store.consume_atomic(
            "t-2",
            "agent-2",
            "pg",
            "query",
            "{\"q\":\"DROP TABLE users\"}",
            550,
        );
        assert!(matches!(
            tampered_consume,
            Err(ApprovalError::PayloadTampered { .. })
        ));
    }
}
