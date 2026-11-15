// Copyright 2024 Axiom NHI — Licensed under Apache-2.0
//! Authoritative revocation snapshot and lock-free lookup.
//!
//! The store keeps exactly one [`RevocationSnapshot`] behind an
//! [`arc_swap::ArcSwap`]. Request-path readers clone an `Arc`; admin updates
//! clone the snapshot, mutate the copy, validate it, and swap it in while
//! holding a short mutex so two concurrent admins cannot lose an update.
//!
//! # Staleness and unavailability
//!
//! The authoritative store is always considered fresh. A consumer that receives
//! snapshots from elsewhere (see [`crate::sync::CachedRevocationReader`]) starts
//! *unloaded* and applies a freshness bound. Both use the same
//! [`evaluate`] function so a match, a stale snapshot, and an unavailable
//! snapshot mean the same thing everywhere.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use arc_swap::ArcSwap;
use axiom_audit::Clock;

use crate::model::{
    agent_key, global_key, server_key, tool_key, RevocationAction, RevocationCommand,
    RevocationDecision, RevocationMatch, RevocationQuery, RevocationSnapshot, RevocationTarget,
    UpdateOutcome,
};
use crate::RevocationError;

/// Store configuration.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RevocationStoreConfig {
    /// Maximum age of the last successful refresh before lookups are reported
    /// as stale. `u64::MAX` disables the staleness check.
    pub max_staleness_ms: u64,
}

impl Default for RevocationStoreConfig {
    fn default() -> Self {
        Self {
            max_staleness_ms: 30_000,
        }
    }
}

impl RevocationStoreConfig {
    /// Configuration for the local authority: it is never stale by definition.
    pub const AUTHORITATIVE: Self = Self {
        max_staleness_ms: u64::MAX,
    };

    /// Create a cached-reader configuration with the given freshness bound.
    pub fn cached(max_staleness_ms: u64) -> Self {
        Self { max_staleness_ms }
    }
}

/// Outcome of installing a snapshot from a sync source.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InstallOutcome {
    /// The snapshot replaced the previous one.
    Installed {
        /// Version that was installed before this call.
        previous_version: u64,
        /// Version now installed.
        version: u64,
    },
    /// The offered snapshot was not newer than the installed one.
    AlreadyLatest {
        /// Version still installed.
        version: u64,
    },
}

impl InstallOutcome {
    /// Version now installed.
    pub fn version(&self) -> u64 {
        match self {
            Self::Installed { version, .. } | Self::AlreadyLatest { version } => *version,
        }
    }
}

/// Point-in-time view of the store, suitable for an admin status endpoint.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RevocationStoreStatus {
    /// Snapshot epoch.
    pub epoch: String,
    /// Snapshot version.
    pub version: u64,
    /// Number of stored entries, including clear tombstones.
    pub entries: usize,
    /// Number of entries with `revoked = true`.
    pub active_entries: usize,
    /// Whether any snapshot has been installed.
    pub loaded: bool,
    /// Age of the last successful refresh, when loaded.
    pub age_ms: Option<u64>,
    /// Configured freshness bound.
    pub max_staleness_ms: u64,
}

struct StoreState {
    snapshot: Arc<RevocationSnapshot>,
    refreshed_at: Option<Instant>,
}

/// Authoritative or cached revocation store.
pub struct RevocationStore {
    state: ArcSwap<StoreState>,
    update_lock: Mutex<()>,
    config: RevocationStoreConfig,
    clock: Arc<dyn Clock>,
}

impl RevocationStore {
    /// Create a loaded authority with an empty snapshot.
    ///
    /// The generated epoch identifies this process instance. Pass
    /// [`RevocationStore::with_epoch`] when restarting from persisted state so
    /// the epoch and version survive the restart.
    pub fn new(clock: Arc<dyn Clock>) -> Self {
        let now = clock.now_unix_ms();
        let snapshot = RevocationSnapshot::empty(generate_epoch(now), now);
        Self::from_loaded_snapshot(snapshot, RevocationStoreConfig::AUTHORITATIVE, clock)
    }

    /// Create a loaded authority with an explicit epoch and version.
    pub fn with_epoch(epoch: impl Into<String>, version: u64, clock: Arc<dyn Clock>) -> Self {
        let now = clock.now_unix_ms();
        let mut snapshot = RevocationSnapshot::empty(epoch, now);
        snapshot.version = version;
        Self::from_loaded_snapshot(snapshot, RevocationStoreConfig::AUTHORITATIVE, clock)
    }

    /// Create a loaded authority from an existing snapshot.
    ///
    /// The snapshot is validated before the store is constructed.
    pub fn from_snapshot(
        snapshot: RevocationSnapshot,
        clock: Arc<dyn Clock>,
    ) -> Result<Self, RevocationError> {
        snapshot.validate()?;
        Ok(Self::from_loaded_snapshot(
            snapshot,
            RevocationStoreConfig::AUTHORITATIVE,
            clock,
        ))
    }

    /// Create a consumer-side store that has not received a snapshot yet.
    ///
    /// Lookups return [`RevocationDecision::Unavailable`] until
    /// [`RevocationStore::install_snapshot`] succeeds.
    pub fn cached(config: RevocationStoreConfig, clock: Arc<dyn Clock>) -> Self {
        let now = clock.now_unix_ms();
        Self {
            state: ArcSwap::from_pointee(StoreState {
                snapshot: Arc::new(RevocationSnapshot::empty(generate_epoch(now), now)),
                refreshed_at: None,
            }),
            update_lock: Mutex::new(()),
            config,
            clock,
        }
    }

    fn from_loaded_snapshot(
        snapshot: RevocationSnapshot,
        config: RevocationStoreConfig,
        clock: Arc<dyn Clock>,
    ) -> Self {
        Self {
            state: ArcSwap::from_pointee(StoreState {
                snapshot: Arc::new(snapshot),
                refreshed_at: Some(Instant::now()),
            }),
            update_lock: Mutex::new(()),
            config,
            clock,
        }
    }

    /// Configuration in use.
    pub fn config(&self) -> RevocationStoreConfig {
        self.config
    }

    /// Clock in use. Useful for the service layer so timestamps agree.
    pub fn clock(&self) -> &Arc<dyn Clock> {
        &self.clock
    }

    /// Current snapshot. Cheap: clones an `Arc`.
    pub fn current_snapshot(&self) -> Arc<RevocationSnapshot> {
        self.state.load().snapshot.clone()
    }

    /// Current snapshot version.
    pub fn current_version(&self) -> u64 {
        self.state.load().snapshot.version
    }

    /// Whether a snapshot has been installed.
    pub fn is_loaded(&self) -> bool {
        self.state.load().refreshed_at.is_some()
    }

    /// Point-in-time status.
    pub fn status(&self) -> RevocationStoreStatus {
        let state = self.state.load();
        let snapshot = &state.snapshot;
        RevocationStoreStatus {
            epoch: snapshot.epoch.clone(),
            version: snapshot.version,
            entries: snapshot.entry_count(),
            active_entries: snapshot.active_entries().count(),
            loaded: state.refreshed_at.is_some(),
            age_ms: state
                .refreshed_at
                .map(|at| duration_ms(at.elapsed().as_millis())),
            max_staleness_ms: self.config.max_staleness_ms,
        }
    }

    /// Evaluate a query against the current snapshot.
    ///
    /// This never blocks on the admin update path: the reader takes a
    /// consistent `Arc` and the writer swaps atomically.
    pub fn lookup(&self, query: &RevocationQuery<'_>) -> RevocationDecision {
        let state = self.state.load();
        let Some(refreshed_at) = state.refreshed_at else {
            return RevocationDecision::Unavailable {
                reason: "revocation state has not been installed".to_string(),
            };
        };

        evaluate(
            &state.snapshot,
            query,
            self.clock.now_unix_ms(),
            duration_ms(refreshed_at.elapsed().as_millis()),
            self.config.max_staleness_ms,
        )
    }

    /// Apply an admin command and return the new version.
    ///
    /// The update path takes a mutex, clones the snapshot, mutates the copy,
    /// validates it, and swaps. Validation happens before the swap so a
    /// rejected update leaves the live state untouched.
    pub fn apply(&self, command: &RevocationCommand) -> Result<UpdateOutcome, RevocationError> {
        let now = self.clock.now_unix_ms();
        command.validate(now)?;

        let _guard = self
            .update_lock
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        let current = self.state.load();
        let mut next = (*current.snapshot).clone();

        let key = command.target.canonical_key();
        let desired = matches!(command.action, RevocationAction::Revoke);

        if let Some(existing) = next.entries.get(&key) {
            if existing.revoked == desired {
                return Ok(UpdateOutcome::AlreadyInDesiredState {
                    version: next.version,
                    revoked: existing.revoked,
                });
            }
        }

        let previous_version = next.version;
        next.version = next.version.saturating_add(1);
        next.generated_at_unix_ms = now;

        let effective_unix_ms = command.effective_unix_ms.unwrap_or(now);
        next.entries.insert(
            key,
            command
                .target
                .to_state(desired, next.version, effective_unix_ms, &command.reason),
        );
        next.validate()?;

        let version = next.version;
        self.state.store(Arc::new(StoreState {
            snapshot: Arc::new(next),
            refreshed_at: Some(Instant::now()),
        }));

        Ok(UpdateOutcome::Applied {
            previous_version,
            version,
        })
    }

    /// Install a snapshot received from a sync source or from disk.
    ///
    /// Rules:
    /// - the snapshot must validate;
    /// - a same-epoch snapshot must have a strictly higher version;
    /// - an epoch change is rejected unless `allow_epoch_change` is set, and a
    ///   warning is logged when it is.
    pub fn install_snapshot(
        &self,
        snapshot: RevocationSnapshot,
        allow_epoch_change: bool,
    ) -> Result<InstallOutcome, RevocationError> {
        snapshot.validate()?;

        let _guard = self
            .update_lock
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        let current = self.state.load();

        // The first snapshot installed into an unloaded reader defines the
        // epoch; there is no prior state to rewind.
        if current.refreshed_at.is_some() {
            if current.snapshot.epoch != snapshot.epoch {
                if !allow_epoch_change {
                    return Err(RevocationError::EpochMismatch {
                        current: current.snapshot.epoch.clone(),
                        incoming: snapshot.epoch.clone(),
                    });
                }
                tracing::warn!(
                    previous_epoch = %current.snapshot.epoch,
                    incoming_epoch = %snapshot.epoch,
                    "revocation snapshot epoch changed; accepting because allow_epoch_change was set"
                );
            } else if snapshot.version <= current.snapshot.version {
                return Ok(InstallOutcome::AlreadyLatest {
                    version: current.snapshot.version,
                });
            }
        }

        let previous_version = current.snapshot.version;
        let version = snapshot.version;
        self.state.store(Arc::new(StoreState {
            snapshot: Arc::new(snapshot),
            refreshed_at: Some(Instant::now()),
        }));

        Ok(InstallOutcome::Installed {
            previous_version,
            version,
        })
    }
}

impl std::fmt::Debug for RevocationStore {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let status = self.status();
        f.debug_struct("RevocationStore")
            .field("epoch", &status.epoch)
            .field("version", &status.version)
            .field("entries", &status.entries)
            .field("loaded", &status.loaded)
            .field("max_staleness_ms", &status.max_staleness_ms)
            .finish()
    }
}

/// Evaluate a query against a snapshot.
///
/// This is the single source of truth for match precedence. All matching
/// entries are returned, ordered by `RevocationTargetKind::precedence_rank`
/// (`global` > `mcp_server` > `agent` > `tool`), then by target id so the order
/// is deterministic.
pub fn evaluate(
    snapshot: &RevocationSnapshot,
    query: &RevocationQuery<'_>,
    now_unix_ms: i64,
    age_ms: u64,
    max_staleness_ms: u64,
) -> RevocationDecision {
    let mut matches = collect_matches(snapshot, query);
    matches.sort_by(|left, right| {
        left.target
            .kind()
            .precedence_rank()
            .cmp(&right.target.kind().precedence_rank())
            .then_with(|| left.target.id().cmp(right.target.id()))
    });

    let epoch = snapshot.epoch.clone();
    let state_version = snapshot.version;
    let primary = matches.first().cloned();

    if age_ms > max_staleness_ms {
        return RevocationDecision::Stale {
            epoch,
            state_version,
            age_ms,
            max_staleness_ms,
            matches,
            primary,
        };
    }

    match primary {
        Some(primary) => RevocationDecision::Revoked {
            epoch,
            state_version,
            evaluated_at_unix_ms: now_unix_ms,
            matches,
            primary,
        },
        None => RevocationDecision::Active {
            epoch,
            state_version,
            evaluated_at_unix_ms: now_unix_ms,
        },
    }
}

fn collect_matches(
    snapshot: &RevocationSnapshot,
    query: &RevocationQuery<'_>,
) -> Vec<RevocationMatch> {
    let mut matches = Vec::new();

    let mut consider = |key: String| {
        let Some(entry) = snapshot.get(&key) else {
            return;
        };
        if !entry.revoked {
            return;
        }
        // Snapshots are validated on install, so this reconstruction should
        // always succeed. If it ever does not, skip the entry rather than
        // panic on the request path.
        if let Ok(target) =
            RevocationTarget::from_contract(entry.target_kind, entry.target_id.clone())
        {
            matches.push(RevocationMatch {
                target,
                state_version: entry.state_version,
                effective_unix_ms: entry.effective_unix_ms,
                reason: entry.reason.clone(),
            });
        }
    };

    consider(global_key());

    if !query.target_server.trim().is_empty() {
        consider(server_key(query.target_server));
    }

    if let Some(agent_id) = query.agent_id {
        if !agent_id.trim().is_empty() {
            consider(agent_key(agent_id));
        }
    }

    if !query.target_server.trim().is_empty() && !query.tool_name.trim().is_empty() {
        consider(tool_key(query.target_server, query.tool_name));
    }

    matches
}

fn duration_ms(value: u128) -> u64 {
    if value > u64::MAX as u128 {
        u64::MAX
    } else {
        value as u64
    }
}

fn generate_epoch(now_unix_ms: i64) -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    format!(
        "local-{}-{}-{}",
        std::process::id(),
        now_unix_ms,
        COUNTER.fetch_add(1, Ordering::Relaxed)
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::RevocationTargetKind;
    use axiom_audit::FixedClock;
    use std::sync::Arc;

    fn clock() -> Arc<dyn Clock> {
        Arc::new(FixedClock::new(
            1_700_000_000_000,
            "2023-11-14T22:13:20.000Z",
        ))
    }

    fn store() -> RevocationStore {
        RevocationStore::new(clock())
    }

    #[test]
    fn empty_store_is_active() {
        let store = store();
        let decision = store.lookup(&RevocationQuery::pre_identity("server-a", "tool-a"));
        match decision {
            RevocationDecision::Active { state_version, .. } => assert_eq!(state_version, 0),
            other => panic!("unexpected decision: {other:?}"),
        }
    }

    #[test]
    fn global_revocation_matches_every_request() {
        let store = store();
        let outcome = store
            .apply(&RevocationCommand::new(
                RevocationTarget::global(),
                RevocationAction::Revoke,
                "emergency freeze",
            ))
            .unwrap();
        assert_eq!(outcome.version(), 1);

        let decision = store.lookup(&RevocationQuery::pre_identity("anything", "anything"));
        assert!(decision.is_revoked());
        let primary = decision.primary_match().unwrap();
        assert_eq!(primary.target.kind(), RevocationTargetKind::Global);
    }

    #[test]
    fn agent_revocations_only_match_post_identity() {
        let store = store();
        store
            .apply(&RevocationCommand::new(
                RevocationTarget::agent("agent-a").unwrap(),
                RevocationAction::Revoke,
                "stolen credential",
            ))
            .unwrap();

        let pre = store.lookup(&RevocationQuery::pre_identity("server-a", "tool-a"));
        assert!(!pre.is_revoked());

        let post = store.lookup(&RevocationQuery::post_identity(
            "agent-a", "server-a", "tool-a",
        ));
        assert!(post.is_revoked());
    }

    #[test]
    fn precedence_is_global_then_server_then_agent_then_tool() {
        let store = store();
        store
            .apply(&RevocationCommand::new(
                RevocationTarget::agent("agent-a").unwrap(),
                RevocationAction::Revoke,
                "agent",
            ))
            .unwrap();
        store
            .apply(&RevocationCommand::new(
                RevocationTarget::tool("server-a", "tool-a").unwrap(),
                RevocationAction::Revoke,
                "tool",
            ))
            .unwrap();
        store
            .apply(&RevocationCommand::new(
                RevocationTarget::server("server-a").unwrap(),
                RevocationAction::Revoke,
                "server",
            ))
            .unwrap();
        store
            .apply(&RevocationCommand::new(
                RevocationTarget::global(),
                RevocationAction::Revoke,
                "global",
            ))
            .unwrap();

        let decision = store.lookup(&RevocationQuery::post_identity(
            "agent-a", "server-a", "tool-a",
        ));
        assert_eq!(decision.matches().len(), 4);
        let ordered: Vec<RevocationTargetKind> = decision
            .matches()
            .iter()
            .map(|entry| entry.target.kind())
            .collect();
        assert_eq!(
            ordered,
            vec![
                RevocationTargetKind::Global,
                RevocationTargetKind::McpServer,
                RevocationTargetKind::Agent,
                RevocationTargetKind::Tool,
            ]
        );
        assert_eq!(
            decision.primary_match().unwrap().target.kind(),
            RevocationTargetKind::Global
        );
    }

    #[test]
    fn apply_is_idempotent_without_a_version_bump() {
        let store = store();
        let command = RevocationCommand::new(
            RevocationTarget::agent("agent-a").unwrap(),
            RevocationAction::Revoke,
            "test",
        );
        let first = store.apply(&command).unwrap();
        assert_eq!(first.version(), 1);
        let second = store.apply(&command).unwrap();
        match second {
            UpdateOutcome::AlreadyInDesiredState { version, revoked } => {
                assert_eq!(version, 1);
                assert!(revoked);
            }
            other => panic!("unexpected outcome: {other:?}"),
        }
        assert_eq!(store.current_version(), 1);
    }

    #[test]
    fn clear_produces_a_tombstone_and_allows_requests_again() {
        let store = store();
        let target = RevocationTarget::agent("agent-a").unwrap();
        store
            .apply(&RevocationCommand::new(
                target.clone(),
                RevocationAction::Revoke,
                "revoke",
            ))
            .unwrap();
        store
            .apply(&RevocationCommand::new(
                target,
                RevocationAction::Clear,
                "restore",
            ))
            .unwrap();

        let decision = store.lookup(&RevocationQuery::post_identity(
            "agent-a", "server-a", "tool-a",
        ));
        assert!(!decision.is_revoked());
        let status = store.status();
        assert_eq!(status.version, 2);
        assert_eq!(status.entries, 1);
        assert_eq!(status.active_entries, 0);
    }

    #[test]
    fn invalid_command_does_not_change_state() {
        let store = store();
        let result = store.apply(&RevocationCommand::new(
            RevocationTarget::global(),
            RevocationAction::Revoke,
            " ",
        ));
        assert!(matches!(result, Err(RevocationError::EmptyReason)));
        assert_eq!(store.current_version(), 0);
    }

    #[test]
    fn unloaded_cached_store_reports_unavailable() {
        let store = RevocationStore::cached(RevocationStoreConfig::default(), clock());
        assert!(!store.is_loaded());
        let decision = store.lookup(&RevocationQuery::pre_identity("server-a", "tool-a"));
        assert!(matches!(decision, RevocationDecision::Unavailable { .. }));
    }

    #[test]
    fn cached_reader_marks_old_snapshots_stale() {
        let store = RevocationStore::cached(RevocationStoreConfig::cached(1_000), clock());
        let snapshot = RevocationSnapshot::empty("authority-1", 0);
        store.install_snapshot(snapshot, false).unwrap();

        // Exercise `evaluate` directly so the assertion does not depend on
        // wall-clock timing.
        let snapshot = store.current_snapshot();
        let decision = evaluate(
            &snapshot,
            &RevocationQuery::pre_identity("server-a", "tool-a"),
            0,
            5_000,
            1_000,
        );
        match decision {
            RevocationDecision::Stale {
                age_ms,
                max_staleness_ms,
                ..
            } => {
                assert_eq!(age_ms, 5_000);
                assert_eq!(max_staleness_ms, 1_000);
            }
            other => panic!("unexpected decision: {other:?}"),
        }
    }

    #[test]
    fn first_install_into_an_unloaded_reader_sets_the_epoch() {
        let store = RevocationStore::cached(RevocationStoreConfig::default(), clock());
        let snapshot = RevocationSnapshot::empty("authority-1", 0);
        store.install_snapshot(snapshot, false).unwrap();
        assert!(store.is_loaded());
        assert_eq!(store.current_snapshot().epoch, "authority-1");
    }

    #[test]
    fn same_epoch_requires_a_newer_version() {
        let store = store();
        let epoch = store.current_snapshot().epoch.clone();

        let mut newer = RevocationSnapshot::empty(epoch.clone(), 0);
        newer.version = 5;
        store.install_snapshot(newer, false).unwrap();

        let mut older = RevocationSnapshot::empty(epoch, 0);
        older.version = 4;
        match store.install_snapshot(older, false).unwrap() {
            InstallOutcome::AlreadyLatest { version } => assert_eq!(version, 5),
            other => panic!("unexpected outcome: {other:?}"),
        }
    }

    #[test]
    fn epoch_change_is_rejected_by_default() {
        let store = store();
        let snapshot = RevocationSnapshot::empty("other-authority", 0);
        let result = store.install_snapshot(snapshot, false);
        assert!(matches!(result, Err(RevocationError::EpochMismatch { .. })));

        let snapshot = RevocationSnapshot::empty("other-authority", 0);
        let outcome = store.install_snapshot(snapshot, true).unwrap();
        assert!(matches!(outcome, InstallOutcome::Installed { .. }));
        assert_eq!(store.current_snapshot().epoch, "other-authority");
    }

    #[test]
    fn malformed_snapshot_is_rejected_without_partial_application() {
        let store = store();
        let mut snapshot = RevocationSnapshot::empty("epoch-x", 0);
        snapshot.version = 1;
        let target = RevocationTarget::agent("agent-a").unwrap();
        snapshot.entries.insert(
            "mismatched-key".to_string(),
            target.to_state(true, 1, 0, "test"),
        );
        assert!(store.install_snapshot(snapshot, true).is_err());
        assert_eq!(store.current_version(), 0);
        assert!(!store.is_loaded() || store.status().active_entries == 0);
    }

    #[test]
    fn server_and_tool_targets_are_scoped() {
        let store = store();
        store
            .apply(&RevocationCommand::new(
                RevocationTarget::tool("server-a", "tool-a").unwrap(),
                RevocationAction::Revoke,
                "tool",
            ))
            .unwrap();

        assert!(store
            .lookup(&RevocationQuery::pre_identity("server-a", "tool-a"))
            .is_revoked());
        assert!(!store
            .lookup(&RevocationQuery::pre_identity("server-a", "tool-b"))
            .is_revoked());
        assert!(!store
            .lookup(&RevocationQuery::pre_identity("server-b", "tool-a"))
            .is_revoked());
    }

    #[test]
    fn concurrent_reads_are_consistent_with_the_latest_write() {
        let store = Arc::new(store());
        let reader = {
            let store = Arc::clone(&store);
            std::thread::spawn(move || {
                store.lookup(&RevocationQuery::pre_identity("server-a", "tool-a"))
            })
        };
        store
            .apply(&RevocationCommand::new(
                RevocationTarget::global(),
                RevocationAction::Revoke,
                "global",
            ))
            .unwrap();
        let observed = reader.join().unwrap();
        // Either the pre-update or post-update snapshot is acceptable; a
        // partially applied snapshot is not.
        assert!(observed.state_version().is_some());
        assert!(store
            .lookup(&RevocationQuery::pre_identity("server-a", "tool-a"))
            .is_revoked());
    }
}
