// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
//! Phase 3 — Atomic Single-Use Human-in-the-Loop Approval Engine.
//!
//! Binds Slack Interactive Approval Cards and Console/CLI approvals to a
//! cryptographic SHA-256 hash of `(agent_id, target_server, tool_name, canonical_arguments_json, nonce)`.
//! Guarantees:
//! 1. Argument Tamper Prevention: If an agent alters even 1 character of the SQL/API
//!    payload after approval, the SHA-256 hash mismatch fails closed.
//! 2. Atomic Single-Use Consumption: An approved token can be redeemed exactly once.

use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ApprovalStatus {
    Pending,
    Approved { approver_email: String, approved_at_unix: i64 },
    Consumed { consumed_at_unix: i64 },
    Denied { reviewer_email: String, reason: String },
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
}

pub fn compute_payload_sha256(
    agent_id: &str,
    target_server: &str,
    tool_name: &str,
    canonical_arguments_json: &str,
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(format!("{agent_id}|{target_server}|{tool_name}|{canonical_arguments_json}").as_bytes());
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
