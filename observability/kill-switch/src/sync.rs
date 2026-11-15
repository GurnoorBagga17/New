// Copyright 2024 Axiom NHI — Licensed under Apache-2.0
//! Consumer-side cached reader and local `RevocationChecker` seam.
//!
//! Team 2's `ExtMCP` pipeline must not own revocation storage. Instead it
//! depends on a small trait with two calls:
//!
//! 1. a pre-identity check for `global`, `mcp_server`, and `tool` targets, and
//! 2. a post-identity check that adds `agent` targets.
//!
//! Team 2 now uses matching pre-identity and post-identity methods. The shared
//! API contract is still draft, so this module remains a local integration seam
//! rather than a versioned network contract.

use std::sync::Arc;

use axiom_audit::Clock;

use crate::model::{RevocationDecision, RevocationQuery, RevocationSnapshot};
use crate::store::{InstallOutcome, RevocationStore, RevocationStoreConfig, RevocationStoreStatus};
use crate::RevocationError;

/// Local seam between the revocation owner and the policy orchestrator.
///
/// **Status:** Implemented by the Team 2 orchestration seam; shared contract
/// freeze remains pending.
pub trait RevocationChecker: Send + Sync {
    /// Check targets that are known before identity verification:
    /// `global`, `mcp_server`, and `tool`.
    ///
    /// `tool_name` is `None` for MCP methods that are not tool calls.
    fn check_pre_identity(
        &self,
        target_server: &str,
        tool_name: Option<&str>,
    ) -> RevocationDecision;

    /// Check every target, including `agent`.
    ///
    /// Must only be called after Team 3 returns a verified `IdentityContext`.
    fn check_post_identity(
        &self,
        agent_id: &str,
        target_server: &str,
        tool_name: Option<&str>,
    ) -> RevocationDecision;
}

/// Consumer-side reader that holds the last snapshot received from the
/// authority.
///
/// The reader starts *unloaded*; lookups return
/// [`RevocationDecision::Unavailable`] until [`CachedRevocationReader::install`]
/// succeeds. That makes the enforce-mode fail-closed path explicit instead of
/// silently treating "no data yet" as "nothing is revoked".
#[derive(Debug)]
pub struct CachedRevocationReader {
    store: RevocationStore,
}

impl CachedRevocationReader {
    /// Create an unloaded reader with the given freshness bound.
    pub fn new(config: RevocationStoreConfig, clock: Arc<dyn Clock>) -> Self {
        Self {
            store: RevocationStore::cached(config, clock),
        }
    }

    /// Create a reader with a default freshness bound of 30 seconds.
    pub fn with_default_freshness(clock: Arc<dyn Clock>) -> Self {
        Self::new(RevocationStoreConfig::default(), clock)
    }

    /// Install a snapshot received from the authority.
    ///
    /// Same-epoch snapshots must increase the version; an epoch change requires
    /// `allow_epoch_change`.
    pub fn install(
        &self,
        snapshot: RevocationSnapshot,
        allow_epoch_change: bool,
    ) -> Result<InstallOutcome, RevocationError> {
        self.store.install_snapshot(snapshot, allow_epoch_change)
    }

    /// Evaluate a query against the cached snapshot.
    pub fn lookup(&self, query: &RevocationQuery<'_>) -> RevocationDecision {
        self.store.lookup(query)
    }

    /// Current reader status.
    pub fn status(&self) -> RevocationStoreStatus {
        self.store.status()
    }

    /// Whether a snapshot has been installed.
    pub fn is_loaded(&self) -> bool {
        self.store.is_loaded()
    }
}

impl RevocationChecker for CachedRevocationReader {
    fn check_pre_identity(
        &self,
        target_server: &str,
        tool_name: Option<&str>,
    ) -> RevocationDecision {
        self.lookup(&RevocationQuery::pre_identity(
            target_server,
            tool_name.unwrap_or(""),
        ))
    }

    fn check_post_identity(
        &self,
        agent_id: &str,
        target_server: &str,
        tool_name: Option<&str>,
    ) -> RevocationDecision {
        self.lookup(&RevocationQuery::post_identity(
            agent_id,
            target_server,
            tool_name.unwrap_or(""),
        ))
    }
}

impl RevocationChecker for RevocationStore {
    fn check_pre_identity(
        &self,
        target_server: &str,
        tool_name: Option<&str>,
    ) -> RevocationDecision {
        self.lookup(&RevocationQuery::pre_identity(
            target_server,
            tool_name.unwrap_or(""),
        ))
    }

    fn check_post_identity(
        &self,
        agent_id: &str,
        target_server: &str,
        tool_name: Option<&str>,
    ) -> RevocationDecision {
        self.lookup(&RevocationQuery::post_identity(
            agent_id,
            target_server,
            tool_name.unwrap_or(""),
        ))
    }
}

/// Deterministic checker for tests and for wiring the pipeline before the
/// authority is available.
///
/// This is a mock boundary, not a production fallback. Constructing it with
/// [`StaticRevocationChecker::unavailable`] lets a test prove that enforce mode
/// fails closed.
#[derive(Debug, Clone)]
pub struct StaticRevocationChecker {
    decision: RevocationDecision,
}

impl StaticRevocationChecker {
    /// Always return the supplied decision.
    pub fn new(decision: RevocationDecision) -> Self {
        Self { decision }
    }

    /// Always report a fresh, empty snapshot.
    pub fn allow(version: u64) -> Self {
        Self::new(RevocationDecision::Active {
            epoch: "static".to_string(),
            state_version: version,
            evaluated_at_unix_ms: 0,
        })
    }

    /// Always report a match on `target`.
    pub fn revoked(target: crate::model::RevocationTarget, version: u64) -> Self {
        let primary = crate::model::RevocationMatch {
            target,
            state_version: version,
            effective_unix_ms: 0,
            reason: "static test revocation".to_string(),
        };
        Self::new(RevocationDecision::Revoked {
            epoch: "static".to_string(),
            state_version: version,
            evaluated_at_unix_ms: 0,
            matches: vec![primary.clone()],
            primary,
        })
    }

    /// Always report unavailable state.
    pub fn unavailable(reason: impl Into<String>) -> Self {
        Self::new(RevocationDecision::Unavailable {
            reason: reason.into(),
        })
    }

    /// The configured decision.
    pub fn decision(&self) -> &RevocationDecision {
        &self.decision
    }
}

impl RevocationChecker for StaticRevocationChecker {
    fn check_pre_identity(
        &self,
        _target_server: &str,
        _tool_name: Option<&str>,
    ) -> RevocationDecision {
        self.decision.clone()
    }

    fn check_post_identity(
        &self,
        _agent_id: &str,
        _target_server: &str,
        _tool_name: Option<&str>,
    ) -> RevocationDecision {
        self.decision.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{
        EnforcementMode, RecommendedAction, RevocationAction, RevocationCommand, RevocationTarget,
    };
    use axiom_audit::FixedClock;

    fn clock() -> Arc<dyn Clock> {
        Arc::new(FixedClock::new(
            1_700_000_000_000,
            "2023-11-14T22:13:20.000Z",
        ))
    }

    #[test]
    fn unloaded_reader_is_unavailable_and_fails_closed() {
        let reader = CachedRevocationReader::with_default_freshness(clock());
        assert!(!reader.is_loaded());

        let pre = reader.check_pre_identity("server-a", Some("tool-a"));
        assert!(matches!(pre, RevocationDecision::Unavailable { .. }));
        let post = reader.check_post_identity("agent-a", "server-a", Some("tool-a"));
        assert!(matches!(post, RevocationDecision::Unavailable { .. }));

        assert_eq!(
            post.recommended_action(EnforcementMode::Enforce, true, true),
            RecommendedAction::Block
        );
        assert_eq!(
            post.recommended_action(EnforcementMode::ObserveOnly, true, false),
            RecommendedAction::AllowWithShadow
        );
    }

    #[test]
    fn installed_kill_switch_blocks_pre_identity_calls() {
        let authority = RevocationStore::new(clock());
        authority
            .apply(&RevocationCommand::new(
                RevocationTarget::global(),
                RevocationAction::Revoke,
                "freeze",
            ))
            .unwrap();

        let reader = CachedRevocationReader::with_default_freshness(clock());
        reader
            .install((*authority.current_snapshot()).clone(), true)
            .unwrap();

        let decision = reader.check_pre_identity("server-a", None);
        assert!(decision.is_revoked());
        assert_eq!(
            decision.recommended_action(EnforcementMode::Enforce, true, true),
            RecommendedAction::Block
        );
    }

    #[test]
    fn installed_agent_revocation_needs_post_identity() {
        let authority = RevocationStore::new(clock());
        authority
            .apply(&RevocationCommand::new(
                RevocationTarget::agent("agent-a").unwrap(),
                RevocationAction::Revoke,
                "revoke",
            ))
            .unwrap();

        let reader = CachedRevocationReader::with_default_freshness(clock());
        reader
            .install((*authority.current_snapshot()).clone(), true)
            .unwrap();

        assert!(!reader
            .check_pre_identity("server-a", Some("tool-a"))
            .is_revoked());
        assert!(reader
            .check_post_identity("agent-a", "server-a", Some("tool-a"))
            .is_revoked());
    }

    #[test]
    fn static_checker_is_configurable() {
        let allow = StaticRevocationChecker::allow(3);
        assert!(!allow
            .check_pre_identity("server-a", Some("tool-a"))
            .is_revoked());

        let revoked = StaticRevocationChecker::revoked(RevocationTarget::global(), 4);
        assert!(revoked
            .check_post_identity("agent-a", "server-a", Some("tool-a"))
            .is_revoked());

        let unavailable = StaticRevocationChecker::unavailable("state backend down");
        assert!(matches!(
            unavailable.decision(),
            RevocationDecision::Unavailable { .. }
        ));
    }
}
