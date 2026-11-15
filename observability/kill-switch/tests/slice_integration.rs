// Copyright 2024 Axiom NHI — Licensed under Apache-2.0
//! End-to-end test for the Team 5 slice using only Team 5's public API.
//!
//! It plays both roles that will exist in the integrated system:
//!
//! - the operator/authority process (store + admin service + audit bus), and
//! - the policy process (a `CachedRevocationReader` standing in for Team 2's
//!   adapter).
//!
//! No other team's crate is needed, which keeps this a mockable boundary rather
//! than an integration claim.

use std::sync::Arc;

use axiom_audit::{AuditBus, AuditBusConfig, AuditRecord, Clock, FixedClock};
use axiom_kill_switch::{
    load_snapshot, save_snapshot, AdminSource, CachedRevocationReader, EnforcementMode,
    KillSwitchService, RecommendedAction, RevocationAction, RevocationChecker, RevocationCommand,
    RevocationDecision, RevocationStore, RevocationTarget, StaticRevocationChecker,
};
use axiom_telemetry::PropagationProbe;

fn clock() -> Arc<dyn Clock> {
    Arc::new(FixedClock::new(
        1_700_000_000_000,
        "2023-11-14T22:13:20.000Z",
    ))
}

fn temp_path() -> std::path::PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    std::env::temp_dir().join(format!(
        "axiom-slice-integration-{}-{nanos}.json",
        std::process::id()
    ))
}

fn sync(reader: &CachedRevocationReader, authority: &RevocationStore) {
    reader
        .install((*authority.current_snapshot()).clone(), false)
        .expect("install snapshot");
}

#[test]
fn operator_action_reaches_the_decision_path_and_survives_restart() {
    let authority = Arc::new(RevocationStore::new(clock()));
    let bus = AuditBus::new(AuditBusConfig::default()).expect("audit bus");
    let service =
        KillSwitchService::new(Arc::clone(&authority)).with_audit(Arc::new(bus.emitter()));

    // Stand-in for Team 2's process-local reader.
    let reader = CachedRevocationReader::with_default_freshness(clock());
    reader
        .install((*authority.current_snapshot()).clone(), true)
        .expect("initial install");

    // Baseline: nothing revoked.
    assert!(!reader
        .check_pre_identity("server-a", Some("tool-a"))
        .is_revoked());
    assert!(!reader
        .check_post_identity("agent-a", "server-a", Some("tool-a"))
        .is_revoked());

    // Operator revokes one agent.
    let result = service
        .revoke(
            RevocationTarget::agent("agent-a").expect("agent"),
            "credential leak",
            "operator-1",
            AdminSource::Cli,
        )
        .expect("revoke");
    assert_eq!(result.outcome.version(), 1);
    assert!(result.audit_enqueued);

    match bus.try_recv().expect("admin audit record") {
        AuditRecord::KillSwitchAction(event) => {
            assert_eq!(event.event_type, "kill_switch_action");
            assert_eq!(event.target_kind, "agent");
            assert_eq!(event.target_id, "agent-a");
            assert_eq!(event.outcome, "applied");
            assert_eq!(event.state_version, 1);
        }
        other => panic!("unexpected record: {other:?}"),
    }

    // Consumer syncs and sees the agent revocation only after identity.
    sync(&reader, &authority);
    assert!(!reader
        .check_pre_identity("server-a", Some("tool-a"))
        .is_revoked());
    let post = reader.check_post_identity("agent-a", "server-a", Some("tool-a"));
    assert!(post.is_revoked());
    assert_eq!(
        post.recommended_action(EnforcementMode::Enforce, true, true),
        RecommendedAction::Block
    );

    // Even in observe-only, the recommended default blocks an active revocation.
    assert_eq!(
        post.recommended_action(EnforcementMode::ObserveOnly, true, true),
        RecommendedAction::Block
    );
    // If Team 0 chooses the opposite default, it becomes a shadow denial.
    assert_eq!(
        post.recommended_action(EnforcementMode::ObserveOnly, false, true),
        RecommendedAction::AllowWithShadow
    );

    // Operator clears the revocation; traffic is allowed again.
    service
        .clear(
            RevocationTarget::agent("agent-a").expect("agent"),
            "restored after investigation",
            "operator-1",
            AdminSource::Cli,
        )
        .expect("clear");
    sync(&reader, &authority);
    assert!(!reader
        .check_post_identity("agent-a", "server-a", Some("tool-a"))
        .is_revoked());

    // A global freeze blocks before identity and reports the primary reason.
    service
        .revoke(
            RevocationTarget::global(),
            "emergency freeze",
            "operator-1",
            AdminSource::Cli,
        )
        .expect("global revoke");
    sync(&reader, &authority);
    let global = reader.check_pre_identity("server-a", Some("tool-a"));
    assert!(global.is_revoked());
    assert_eq!(
        global.primary_match().expect("primary").reason,
        "emergency freeze"
    );

    // Restart survival: persist, load, and construct a new authority.
    let path = temp_path();
    let snapshot = authority.current_snapshot();
    save_snapshot(&path, snapshot.as_ref()).expect("save snapshot");
    let loaded = load_snapshot(&path).expect("load snapshot");
    assert_eq!(loaded.version, snapshot.version);
    let restored = RevocationStore::from_snapshot(loaded, clock()).expect("restore store");
    assert!(restored
        .lookup(&axiom_kill_switch::RevocationQuery::pre_identity(
            "server-a", "tool-a"
        ))
        .is_revoked());
    let _ = std::fs::remove_file(path);
}

#[test]
fn propagation_probe_observes_the_new_version() {
    let authority = Arc::new(RevocationStore::new(clock()));
    let reader = CachedRevocationReader::with_default_freshness(clock());
    reader
        .install((*authority.current_snapshot()).clone(), true)
        .expect("initial install");

    let probe = PropagationProbe::new();

    for index in 0..10 {
        let command = RevocationCommand::new(
            RevocationTarget::agent("agent-a").expect("agent"),
            if index % 2 == 0 {
                RevocationAction::Revoke
            } else {
                RevocationAction::Clear
            },
            "probe",
        );
        let outcome = authority.apply(&command).expect("apply");
        probe.mark_update(outcome.version(), 1_700_000_000_000 + index);
        sync(&reader, &authority);
        let decision = reader.check_post_identity("agent-a", "server-a", Some("tool-a"));
        assert_eq!(decision.state_version(), Some(outcome.version()));
        let sample = probe
            .mark_visible(outcome.version(), 1_700_000_000_000 + index)
            .expect("visible");
        assert_eq!(sample.version, outcome.version());
        assert_eq!(sample.delay_ms, 0);
    }

    assert_eq!(probe.pending_updates(), 0);
}

#[test]
fn unavailable_state_fails_closed_in_enforce_and_shadows_in_observe_only() {
    let checker = StaticRevocationChecker::unavailable("reader not loaded");
    let decision = checker.check_post_identity("agent-a", "server-a", Some("tool-a"));

    assert!(matches!(decision, RevocationDecision::Unavailable { .. }));
    assert_eq!(
        decision.recommended_action(EnforcementMode::Enforce, true, true),
        RecommendedAction::Block
    );
    assert_eq!(
        decision.recommended_action(EnforcementMode::ObserveOnly, true, true),
        RecommendedAction::AllowWithShadow
    );
}
