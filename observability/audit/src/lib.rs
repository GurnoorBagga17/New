// Copyright 2024 Axiom NHI — Licensed under Apache-2.0
//! Axiom NHI Phase 1 — redacted, bounded, non-blocking audit delivery.
//!
//! **Team:** Team 5 (Observability, Audit & Emergency Controls)
//! **Owner:** `@axiom-nhi/team-5-observability`
//! **Status:** Draft `0.1.0-draft` (Gate G1 first slice)
//!
//! # Design
//!
//! The inline request path only builds and enqueues an [`event::AuditEvent`].
//! File and network I/O run on a dedicated writer thread. Enqueue is a bounded
//! `try_send`; it never blocks and never performs I/O:
//!
//! ```text
//! request path ── build + redact ── try_send ──► bounded critical queue ─┐
//!                                                    bounded routine queue ─┴─► writer thread ─► JSONL / OTLP
//! ```
//!
//! Two queues let a full routine queue shed `ALLOW` records without dropping
//! `DENY`, `WOULD_DENY`, or kill-switch records. When a critical queue is also
//! full, the record is dropped and counted; the request path is never stalled.
//!
//! # Security boundaries
//! - Raw bearer tokens, authorization headers, secrets, private keys, and
//!   credential-like baggage are redacted before enqueue.
//! - Raw tool arguments are never accepted by [`event::AuditEventInput`]. Only
//!   canonical validator summaries are accepted.
//! - PII in free-text reasons and summaries is redacted; stable identity fields
//!   such as `agent_id` are treated as audit metadata and only credential
//!   patterns are stripped from them.
//! - Redaction is bounded in input size and recursion depth so hostile input
//!   cannot turn audit construction into an unbounded CPU cost.
//!
//! # What this crate does not do
//! - It does not define the final shared audit schema. [`event::AuditEvent`]
//!   mirrors the Team 0 draft; [`event::KillSwitchAuditEvent`] is a Team 5
//!   proposal for admin-action auditing. Both remain draft.
//! - It does not ship an OTLP exporter. The writer seam is documented in
//!   `AUDIT_REDACTION.md`; local JSONL is the Phase 1 deliverable.

pub mod bus;
pub mod event;
pub mod redact;
pub mod writer;

pub use bus::{
    AuditBus, AuditBusConfig, AuditBusStatsSnapshot, AuditEmitter, AuditPriority, AuditSink,
    AuditSubscriber, EmitOutcome, ReceiverOutcome,
};
pub use event::{
    AuditDecision, AuditEvent, AuditEventInput, AuditRecord, AuditRuntimeMode, Clock, FixedClock,
    KillSwitchAuditEvent, KillSwitchAuditInput, SystemClock, AUDIT_SCHEMA_VERSION,
};
pub use redact::{RedactionOutcome, Redactor};
pub use writer::{spawn_file_writer, AuditWriterConfig, AuditWriterStats, WriterHandle};
