// Copyright 2024 Axiom NHI — Licensed under Apache-2.0
//! Axiom NHI Phase 1 — emergency revocation ("kill switch") state.
//!
//! **Team:** Team 5 (Observability, Audit & Emergency Controls)
//! **Owner:** `@axiom-nhi/team-5-observability`
//! **Status:** Draft `0.1.0-draft` (Gate G1 first slice)
//!
//! # Mission
//!
//! Team 5 owns revocation *state*, not the request path. Team 2 owns the
//! decision orchestration and the gateway owns enforcement. This crate gives
//! both a small, typed, cheap-to-read surface:
//!
//! - [`model`]: target canonicalization, precedence, and the draft
//!   `RevocationState` mirror of the shared contract.
//! - [`store`]: the authoritative in-memory snapshot, with `ArcSwap` reads and
//!   a mutex only on the admin update path.
//! - [`sync`]: a cached reader for consumers plus the draft `RevocationChecker`
//!   seam that Team 2 should adopt instead of owning storage.
//! - [`persistence`]: append-and-rename snapshot persistence for restart
//!   survival.
//! - [`service`]: the admin API that validates commands and emits kill-switch
//!   audit records.
//!
//! # Security invariants
//!
//! 1. Revocation blocks **new** protected calls. It never cancels an
//!    already-running upstream tool call in Phase 1.
//! 2. Lookup is lock-free and allocation-light on the hot path. The only mutex
//!    is taken by admin updates.
//! 3. A malformed snapshot is rejected whole; it is never partially applied.
//! 4. Same-epoch snapshots move forward only. An epoch change is rejected unless
//!    the caller explicitly allows it, so a restarted authority cannot silently
//!    rewind revocation state.
//! 5. Enforce mode fails closed when required revocation state is unavailable.
//!    Observe-only mode records a shadow decision instead.
//!
//! # What this crate does not do
//!
//! - It does not implement HTTP/gRPC admin transport. [`service`] is an
//!   in-process API; transport is deferred pending the Team 0 protocol freeze.
//! - It does not cancel in-flight work, drive SIEM/SOAR, or keep Postgres
//!   history.
//! - It does not define the frozen wire contract. [`model::RevocationSnapshot`]
//!   and [`model::RevocationState`] are Team 5 drafts aligned to the Team 0
//!   playbook; see `INTERFACE_PROPOSAL.md` and `REVOCATION_API.md`.

pub mod model;
pub mod persistence;
pub mod service;
pub mod store;
pub mod sync;

pub use model::{
    EnforcementMode, RecommendedAction, RevocationAction, RevocationCommand, RevocationDecision,
    RevocationMatch, RevocationQuery, RevocationSnapshot, RevocationState, RevocationTarget,
    RevocationTargetKind, UpdateOutcome,
};
pub use persistence::{load_snapshot, save_snapshot};
pub use service::{AdminActionResult, AdminSource, KillSwitchService};
pub use store::{
    evaluate, InstallOutcome, RevocationStore, RevocationStoreConfig, RevocationStoreStatus,
};
pub use sync::{CachedRevocationReader, RevocationChecker, StaticRevocationChecker};

/// Errors produced by revocation validation, storage, sync, or persistence.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum RevocationError {
    /// A target identifier was empty, too long, or contained control characters.
    #[error("invalid revocation target: {0}")]
    InvalidTarget(String),
    /// A snapshot was internally inconsistent and was rejected whole.
    #[error("invalid revocation snapshot: {0}")]
    InvalidSnapshot(String),
    /// The admin reason was empty after trimming.
    #[error("revocation reason must not be empty")]
    EmptyReason,
    /// The admin reason exceeded the 2048-character bound.
    #[error("revocation reason exceeds 2048 characters")]
    ReasonTooLong,
    /// The admin reason contained control characters.
    #[error("invalid revocation reason: {0}")]
    ControlCharacter(String),
    /// Scheduling beyond the Phase 1 60-second window is unsupported.
    #[error("scheduled revocation beyond 60 seconds is not supported in Phase 1")]
    ScheduledNotSupported,
    /// A same-epoch snapshot did not move the version forward.
    #[error("snapshot is not newer than current state (current {current}, incoming {incoming})")]
    StaleSnapshot {
        /// Version currently installed.
        current: u64,
        /// Version that was offered.
        incoming: u64,
    },
    /// The offered snapshot came from a different authority epoch.
    #[error("snapshot epoch mismatch (current '{current}', incoming '{incoming}')")]
    EpochMismatch {
        /// Epoch currently installed.
        current: String,
        /// Epoch that was offered.
        incoming: String,
    },
    /// Reading or writing the snapshot file failed.
    #[error("revocation persistence error: {0}")]
    Persistence(String),
}
