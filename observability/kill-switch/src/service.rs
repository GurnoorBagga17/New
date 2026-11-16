// Copyright 2024 Axiom NHI — Licensed under Apache-2.0
//! In-process admin API for emergency revocation.
//!
//! One admin call does three things, in this order:
//!
//! 1. validate the command against the current clock;
//! 2. apply it to the [`RevocationStore`] (state is live when this returns);
//! 3. build and enqueue a redacted kill-switch audit record.
//!
//! The audit enqueue uses the same bounded, non-blocking bus as decision
//! auditing. Kill-switch records are always critical priority, so they are not
//! shed while routine `ALLOW` records are under pressure. If the critical queue
//! is full, the record is counted as dropped; the admin action still succeeds.
//!
//! # Scope
//!
//! This is an in-process API. Phase 1 does not define an admin wire protocol;
//! Team 0 must decide the transport (CLI, unix socket, loopback HTTP) before
//! Team 6 can test it end to end. See `REVOCATION_API.md`.

use std::path::PathBuf;
use std::sync::Arc;

use axiom_audit::{AuditRecord, AuditSink, Clock, KillSwitchAuditInput, Redactor};

use crate::model::{
    RevocationAction, RevocationCommand, RevocationDecision, RevocationQuery, RevocationTarget,
    UpdateOutcome,
};
use crate::persistence::save_snapshot;
use crate::store::RevocationStore;
use crate::sync::RevocationChecker;
use crate::RevocationError;

/// Admin channel that produced a kill-switch action.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AdminSource {
    /// Local operator CLI.
    Cli,
    /// Local unix-domain socket (not implemented in this slice).
    UnixSocket,
    /// Loopback-only HTTP admin endpoint (not implemented in this slice).
    LoopbackHttp,
    /// Integration test or harness.
    Test,
}

impl AdminSource {
    /// Contract string for the audit record.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Cli => "cli",
            Self::UnixSocket => "unix_socket",
            Self::LoopbackHttp => "loopback_http",
            Self::Test => "test",
        }
    }
}

/// Result of an admin command.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AdminActionResult {
    /// Whether the target changed state.
    pub outcome: UpdateOutcome,
    /// Whether the kill-switch audit record was enqueued.
    pub audit_enqueued: bool,
    /// Persistence result when the service owns a snapshot path.
    pub persisted: Option<bool>,
}

/// Kill-switch admin service.
///
/// The service borrows an authoritative [`RevocationStore`]. It does not own
/// request-path enforcement and does not cancel in-flight upstream calls.
pub struct KillSwitchService {
    store: Arc<RevocationStore>,
    audit: Option<Arc<dyn AuditSink>>,
    redactor: Redactor,
    snapshot_path: Option<PathBuf>,
    cancellations: Arc<InFlightCancellationRegistry>,
}

impl std::fmt::Debug for KillSwitchService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("KillSwitchService")
            .field("store", &self.store)
            .field("audit", &self.audit.is_some())
            .field("snapshot_path", &self.snapshot_path)
            .field("cancellations", &self.cancellations)
            .finish()
    }
}

impl KillSwitchService {
    /// Create a service around an authoritative store.
    pub fn new(store: Arc<RevocationStore>) -> Self {
        Self {
            store,
            audit: None,
            redactor: Redactor::new(),
            snapshot_path: None,
            cancellations: Arc::new(InFlightCancellationRegistry::new()),
        }
    }

    /// Attach a shared cancellation registry for cancelling in-flight requests upon revocation (AX-010).
    pub fn with_cancellations(mut self, cancellations: Arc<InFlightCancellationRegistry>) -> Self {
        self.cancellations = cancellations;
        self
    }

    /// Access the in-flight cancellation registry.
    pub fn cancellations(&self) -> &Arc<InFlightCancellationRegistry> {
        &self.cancellations
    }

    /// Attach the audit sink used for kill-switch records.
    pub fn with_audit(mut self, sink: Arc<dyn AuditSink>) -> Self {
        self.audit = Some(sink);
        self
    }

    /// Persist the current snapshot to `path` after every successful change.
    ///
    /// Persistence failure does not roll back live state; it is reported in
    /// [`AdminActionResult::persisted`] and logged.
    pub fn with_persistence(mut self, path: impl Into<PathBuf>) -> Self {
        self.snapshot_path = Some(path.into());
        self
    }

    /// Underlying store.
    pub fn store(&self) -> &Arc<RevocationStore> {
        &self.store
    }

    /// Revoke a target.
    pub fn revoke(
        &self,
        target: RevocationTarget,
        reason: impl Into<String>,
        actor: &str,
        source: AdminSource,
    ) -> Result<AdminActionResult, RevocationError> {
        self.apply(
            RevocationCommand::new(target, RevocationAction::Revoke, reason),
            actor,
            source,
            None,
        )
    }

    /// Clear a revocation.
    pub fn clear(
        &self,
        target: RevocationTarget,
        reason: impl Into<String>,
        actor: &str,
        source: AdminSource,
    ) -> Result<AdminActionResult, RevocationError> {
        self.apply(
            RevocationCommand::new(target, RevocationAction::Clear, reason),
            actor,
            source,
            None,
        )
    }

    /// Apply a full command, with an optional correlation ID for the audit
    /// record.
    ///
    /// A rejected command still produces a kill-switch audit record with
    /// `outcome = "rejected"` so failed attempts are visible.
    pub fn apply(
        &self,
        command: RevocationCommand,
        actor: &str,
        source: AdminSource,
        request_id: Option<String>,
    ) -> Result<AdminActionResult, RevocationError> {
        let now = self.store.clock().now_unix_ms();
        let redacted_reason = self.redactor.redact(&command.reason);
        let target_kind = command.target.kind().as_contract_str().to_string();
        let target_id = command.target.id().to_string();
        let previous_version = self.store.current_version();

        let result = match command.validate(now) {
            Ok(()) => {
                let mut sanitized = command.clone();
                sanitized.reason = redacted_reason.clone();
                self.store.apply(&sanitized)
            }
            Err(error) => Err(error),
        };

        let (outcome_label, state_version) = match &result {
            Ok(outcome) => (outcome.outcome_label(), outcome.version()),
            Err(_) => ("rejected", previous_version),
        };

        let audit_enqueued = self.emit_audit(KillSwitchAuditInput {
            action: command.action.as_str().to_string(),
            target_kind,
            target_id,
            actor: actor.to_string(),
            reason: redacted_reason,
            previous_state_version: previous_version,
            state_version,
            outcome: outcome_label.to_string(),
            source: source.as_str().to_string(),
            request_id,
        });

        let result = result?;

        // Immediately cancel any in-flight requests running for this revoked target (AX-010).
        if command.action == RevocationAction::Revoke {
            self.cancellations.cancel_target(&command.target.canonical_key());
            self.cancellations.cancel_target(command.target.id());
        }

        let persisted = match &self.snapshot_path {
            None => None,
            Some(path) => {
                let snapshot = self.store.current_snapshot();
                match save_snapshot(path, &snapshot) {
                    Ok(()) => Some(true),
                    Err(error) => {
                        tracing::error!(
                            error = %error,
                            path = %path.display(),
                            version = result.version(),
                            "failed to persist revocation snapshot; live state is unchanged"
                        );
                        Some(false)
                    }
                }
            }
        };

        Ok(AdminActionResult {
            outcome: result,
            audit_enqueued,
            persisted,
        })
    }

    /// Evaluate a revocation query against the current snapshot.
    pub fn lookup(&self, query: &RevocationQuery<'_>) -> RevocationDecision {
        self.store.lookup(query)
    }

    fn emit_audit(&self, input: KillSwitchAuditInput) -> bool {
        let Some(sink) = &self.audit else {
            return false;
        };
        let clock: &dyn Clock = self.store.clock().as_ref();
        let record = AuditRecord::KillSwitchAction(input.build(clock));
        match sink.try_emit(record) {
            axiom_audit::EmitOutcome::Enqueued { .. } => true,
            outcome => {
                tracing::warn!(?outcome, "kill-switch audit record was not enqueued");
                false
            }
        }
    }
}

impl RevocationChecker for KillSwitchService {
    fn check_pre_identity(
        &self,
        target_server: &str,
        tool_name: Option<&str>,
    ) -> RevocationDecision {
        self.store.check_pre_identity(target_server, tool_name)
    }

    fn check_post_identity(
        &self,
        agent_id: &str,
        target_server: &str,
        tool_name: Option<&str>,
    ) -> RevocationDecision {
        self.store
            .check_post_identity(agent_id, target_server, tool_name)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{EnforcementMode, RecommendedAction, RevocationTargetKind};
    use axiom_audit::{AuditBus, AuditBusConfig, FixedClock};
    use std::fs;

    const SENTINEL: &str = "SYNTHETIC_KILL_SWITCH_SENTINEL";

    fn clock() -> Arc<dyn Clock> {
        Arc::new(FixedClock::new(
            1_700_000_000_000,
            "2023-11-14T22:13:20.000Z",
        ))
    }

    fn service_with_audit() -> (KillSwitchService, AuditBus) {
        let store = Arc::new(RevocationStore::new(clock()));
        let bus = AuditBus::new(AuditBusConfig::default()).unwrap();
        let service = KillSwitchService::new(store).with_audit(Arc::new(bus.emitter()));
        (service, bus)
    }

    #[test]
    fn revoke_emits_critical_audit_and_bumps_version() {
        let (service, bus) = service_with_audit();
        let result = service
            .revoke(
                RevocationTarget::global(),
                "emergency freeze",
                "operator-1",
                AdminSource::Cli,
            )
            .unwrap();

        assert_eq!(result.outcome.version(), 1);
        assert_eq!(result.outcome.previous_version(), 0);
        assert!(result.audit_enqueued);
        assert_eq!(result.persisted, None);

        let record = bus.try_recv().expect("audit record");
        assert!(record.is_critical());
        match record {
            AuditRecord::KillSwitchAction(event) => {
                assert_eq!(event.event_type, "kill_switch_action");
                assert_eq!(event.action, "revoke");
                assert_eq!(event.target_kind, "global");
                assert_eq!(event.outcome, "applied");
                assert_eq!(event.source, "cli");
                assert_eq!(event.previous_state_version, 0);
                assert_eq!(event.state_version, 1);
                assert_eq!(event.actor, "operator-1");
            }
            other => panic!("unexpected record: {other:?}"),
        }
    }

    #[test]
    fn rejected_command_is_audited_and_leaves_state_unchanged() {
        let (service, bus) = service_with_audit();
        let result = service.apply(
            RevocationCommand::new(RevocationTarget::global(), RevocationAction::Revoke, "   "),
            "operator-1",
            AdminSource::Cli,
            Some("req-1".to_string()),
        );

        assert!(matches!(result, Err(RevocationError::EmptyReason)));
        assert_eq!(service.store().current_version(), 0);

        match bus.try_recv().expect("audit record") {
            AuditRecord::KillSwitchAction(event) => {
                assert_eq!(event.outcome, "rejected");
                assert_eq!(event.target_kind, "global");
                assert_eq!(event.state_version, 0);
                assert_eq!(event.request_id.as_deref(), Some("req-1"));
            }
            other => panic!("unexpected record: {other:?}"),
        }
    }

    #[test]
    fn clear_is_audited_and_restores_traffic() {
        let (service, bus) = service_with_audit();
        let target = RevocationTarget::agent("agent-a").unwrap();
        service
            .revoke(target.clone(), "revoke", "operator-1", AdminSource::Cli)
            .unwrap();
        let result = service
            .clear(target, "restore", "operator-1", AdminSource::Cli)
            .unwrap();

        assert_eq!(result.outcome.version(), 2);
        assert!(!service
            .check_post_identity("agent-a", "server-a", Some("tool-a"))
            .is_revoked());

        let records = bus.drain();
        assert_eq!(records.len(), 2);
        match &records[1] {
            AuditRecord::KillSwitchAction(event) => {
                assert_eq!(event.action, "clear");
                assert_eq!(event.target_kind, "agent");
            }
            other => panic!("unexpected record: {other:?}"),
        }
    }

    #[test]
    fn reason_is_redacted_before_storage_and_audit() {
        let (service, bus) = service_with_audit();
        service
            .revoke(
                RevocationTarget::agent("agent-a").unwrap(),
                format!("compromised Bearer {SENTINEL}"),
                "operator@example.com",
                AdminSource::Cli,
            )
            .unwrap();

        let snapshot = service.store().current_snapshot();
        let serialized = serde_json::to_string(&*snapshot).unwrap();
        assert!(!serialized.contains(SENTINEL), "snapshot: {serialized}");

        let record = bus.try_recv().unwrap();
        let json = record.to_json_line().unwrap();
        assert!(!json.contains(SENTINEL), "record: {json}");
    }

    #[test]
    fn no_audit_sink_means_no_audit_and_no_failure() {
        let store = Arc::new(RevocationStore::new(clock()));
        let service = KillSwitchService::new(store);
        let result = service
            .revoke(
                RevocationTarget::server("server-a").unwrap(),
                "maintenance",
                "operator-1",
                AdminSource::Cli,
            )
            .unwrap();
        assert!(!result.audit_enqueued);
        assert!(service
            .check_pre_identity("server-a", Some("tool-a"))
            .is_revoked());
    }

    #[test]
    fn persistence_writes_the_new_version() {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        let path = std::env::temp_dir().join(format!(
            "axiom-kill-switch-service-{}-{nanos}.json",
            std::process::id()
        ));

        let store = Arc::new(RevocationStore::new(clock()));
        let service = KillSwitchService::new(store).with_persistence(&path);
        let result = service
            .revoke(
                RevocationTarget::global(),
                "freeze",
                "operator-1",
                AdminSource::Cli,
            )
            .unwrap();
        assert_eq!(result.persisted, Some(true));

        let loaded = crate::persistence::load_snapshot(&path).unwrap();
        assert_eq!(loaded.version, 1);
        assert_eq!(loaded.active_entries().count(), 1);

        let _ = fs::remove_file(path);
    }

    #[test]
    fn recommendation_matrix_for_revoked_state() {
        let (service, _bus) = service_with_audit();
        service
            .revoke(
                RevocationTarget::global(),
                "freeze",
                "operator-1",
                AdminSource::Cli,
            )
            .unwrap();
        let decision = service.check_pre_identity("server-a", Some("tool-a"));
        assert_eq!(
            decision.primary_match().unwrap().target.kind(),
            RevocationTargetKind::Global
        );
        assert_eq!(
            decision.recommended_action(EnforcementMode::ObserveOnly, true, true),
            RecommendedAction::Block
        );
    }
}


// ---------------------------------------------------------------------------
// AX-010 Remediation: In-Flight Request Cancellation & Durable Receipt
// ---------------------------------------------------------------------------

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

/// Cooperative cancellation handle attached to an in-flight tool execution.
#[derive(Debug, Default)]
pub struct CancellationToken {
    cancelled: AtomicBool,
}

impl CancellationToken {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            cancelled: AtomicBool::new(false),
        })
    }

    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }
}

/// Tracks in-flight tool executions by target key so an emergency kill-switch
/// revocation immediately signals cancellation to running calls (AX-010).
#[derive(Debug, Default)]
pub struct InFlightCancellationRegistry {
    active: Mutex<HashMap<String, Vec<Arc<CancellationToken>>>>,
}

impl InFlightCancellationRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register(&self, target_id: impl Into<String>) -> Arc<CancellationToken> {
        let token = CancellationToken::new();
        let mut guard = self.active.lock().expect("in-flight registry lock");
        guard.entry(target_id.into()).or_default().push(token.clone());
        token
    }

    pub fn cancel_target(&self, target_id: &str) -> usize {
        let mut guard = self.active.lock().expect("in-flight registry lock");
        let Some(tokens) = guard.remove(target_id) else {
            return 0;
        };
        for token in &tokens {
            token.cancel();
        }
        tokens.len()
    }
}

/// Detailed revocation durability and propagation receipt (AX-010).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DurableRevocationReceipt {
    pub applied_in_memory: bool,
    pub persisted: bool,
    pub in_flight_cancelled: usize,
    pub audit_durable: bool,
}

impl DurableRevocationReceipt {
    pub fn is_completely_durable(&self) -> bool {
        self.applied_in_memory && self.persisted && self.audit_durable
    }
}

#[cfg(test)]
mod ax010_tests {
    use super::*;

    #[test]
    fn cancels_in_flight_calls_on_revocation() {
        let registry = InFlightCancellationRegistry::new();
        let t1 = registry.register("finance-agent");
        let t2 = registry.register("finance-agent");
        assert!(!t1.is_cancelled());

        let cancelled = registry.cancel_target("finance-agent");
        assert_eq!(cancelled, 2);
        assert!(t1.is_cancelled());
        assert!(t2.is_cancelled());
    }
}
