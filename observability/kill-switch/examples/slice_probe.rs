// Copyright 2024 Axiom NHI — Licensed under Apache-2.0
//! In-process latency probe for the Team 5 slice.
//!
//! This is **not** a Gate G1 benchmark and its output is not acceptance
//! evidence. It measures three things on one machine in one process:
//!
//! 1. revocation lookup cost (pre- and post-identity),
//! 2. audit enqueue cost with a queue that has capacity, and
//! 3. the hand-off from an authority update to a consumer observing it.
//!
//! End-to-end gateway latency and cross-process propagation need the Team 6
//! harness described in `../../../MEASUREMENT.md`.
//!
//! Run:
//!
//! ```text
//! cargo run \
//!   -p axiom-kill-switch --example slice_probe --release
//! ```

use std::hint::black_box;
use std::sync::Arc;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use axiom_audit::{
    AuditBus, AuditBusConfig, AuditDecision, AuditEventInput, AuditRecord, AuditRuntimeMode, Clock,
    FixedClock,
};
use axiom_kill_switch::{
    CachedRevocationReader, RevocationAction, RevocationChecker, RevocationCommand,
    RevocationStore, RevocationStoreConfig, RevocationTarget,
};
use axiom_telemetry::{LatencySummary, PropagationProbe};

const LOOKUP_SAMPLES: usize = 200_000;
const ENQUEUE_SAMPLES: usize = 100_000;
const HANDOFF_SAMPLES: usize = 2_000;

fn unix_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn clock() -> Arc<dyn Clock> {
    Arc::new(FixedClock::new(
        1_700_000_000_000,
        "2023-11-14T22:13:20.000Z",
    ))
}

fn report(label: &str, samples: &[u64], unit: &str) {
    match LatencySummary::from_samples(samples) {
        Some(summary) => println!(
            "{label:<28} n={:<7} min={:<7} p50={:<7} p95={:<7} p99={:<7} max={:<7} ({unit})",
            summary.count, summary.min, summary.p50, summary.p95, summary.p99, summary.max
        ),
        None => println!("{label:<28} no samples"),
    }
}

fn main() {
    println!(
        "slice_probe: os={} arch={} profile={}",
        std::env::consts::OS,
        std::env::consts::ARCH,
        if cfg!(debug_assertions) {
            "debug"
        } else {
            "release"
        }
    );

    let authority = Arc::new(RevocationStore::new(clock()));
    for target in [
        RevocationTarget::global(),
        RevocationTarget::server("server-a").expect("server"),
        RevocationTarget::agent("agent-a").expect("agent"),
        RevocationTarget::tool("server-a", "tool-a").expect("tool"),
    ] {
        authority
            .apply(&RevocationCommand::new(
                target,
                RevocationAction::Revoke,
                "probe seed",
            ))
            .expect("seed revocation");
    }

    let reader = CachedRevocationReader::new(RevocationStoreConfig::cached(u64::MAX), clock());
    reader
        .install((*authority.current_snapshot()).clone(), true)
        .expect("initial snapshot install");

    // Warm up the allocator, regex-free lookup path, and branch predictor.
    for _ in 0..10_000 {
        black_box(reader.check_pre_identity("server-a", Some("tool-a")));
        black_box(reader.check_post_identity("agent-a", "server-a", Some("tool-a")));
    }

    let mut pre_samples = Vec::with_capacity(LOOKUP_SAMPLES);
    let mut post_samples = Vec::with_capacity(LOOKUP_SAMPLES);
    let mut pre_version_sum = 0u64;
    let mut post_version_sum = 0u64;

    for _ in 0..LOOKUP_SAMPLES {
        let started = Instant::now();
        let decision = reader.check_pre_identity("server-a", Some("tool-a"));
        pre_samples.push(started.elapsed().as_nanos() as u64);
        pre_version_sum = pre_version_sum.wrapping_add(decision.state_version().unwrap_or(0));

        let started = Instant::now();
        let decision = reader.check_post_identity("agent-a", "server-a", Some("tool-a"));
        post_samples.push(started.elapsed().as_nanos() as u64);
        post_version_sum = post_version_sum.wrapping_add(decision.state_version().unwrap_or(0));
    }

    println!();
    report("revocation.pre_identity", &pre_samples, "ns");
    report("revocation.post_identity", &post_samples, "ns");
    println!(
        "revocation.checksum      pre_versions={pre_version_sum} post_versions={post_version_sum}"
    );

    // Audit enqueue with enough capacity that every record is accepted. The
    // drop path is covered by unit tests; here we measure the success path.
    let bus = AuditBus::new(AuditBusConfig {
        critical_capacity: ENQUEUE_SAMPLES + 1,
        routine_capacity: 1,
    })
    .expect("audit bus");
    let emitter = bus.emitter();
    let fixed = FixedClock::new(1_700_000_000_000, "2023-11-14T22:13:20.000Z");
    let record = AuditRecord::Decision(
        AuditEventInput {
            request_id: "probe-request".to_string(),
            trace_id: "4bf92f3577b34da6a3ce929d0e0e4736".to_string(),
            agent_id: "finance-agent".to_string(),
            target_server: "server-a".to_string(),
            tool_name: "execute_sql".to_string(),
            runtime_mode: AuditRuntimeMode::Enforce,
            decision: AuditDecision::Deny,
            policy_version: "probe".to_string(),
            denial_reason: Some("probe denial".to_string()),
            validator_summary: vec!["sql:verbs=SELECT;readonly=true".to_string()],
            kill_switch_active: false,
            latency_us: 0,
        }
        .build(&fixed),
    );

    let mut enqueue_samples = Vec::with_capacity(ENQUEUE_SAMPLES);
    for _ in 0..ENQUEUE_SAMPLES {
        let started = Instant::now();
        let outcome = emitter.try_emit(record.clone());
        enqueue_samples.push(started.elapsed().as_nanos() as u64);
        debug_assert!(outcome.is_enqueued());
    }

    println!();
    report("audit.enqueue", &enqueue_samples, "ns");
    println!(
        "audit.enqueue_depth     depth={} scheduled={}",
        bus.stats().current_depth,
        bus.stats().total_enqueued()
    );

    // Hand-off: admin apply -> consumer install -> consumer read. This is the
    // in-process analogue of the propagation path; a cross-process transport is
    // not implemented in Phase 1.
    let probe = PropagationProbe::new();
    let target = RevocationTarget::agent("agent-a").expect("agent");
    let mut handoff_samples = Vec::with_capacity(HANDOFF_SAMPLES);
    let mut propagation_ms = Vec::with_capacity(HANDOFF_SAMPLES);

    for index in 0..HANDOFF_SAMPLES {
        let action = if index % 2 == 0 {
            RevocationAction::Revoke
        } else {
            RevocationAction::Clear
        };

        let started = Instant::now();
        let outcome = authority
            .apply(&RevocationCommand::new(
                target.clone(),
                action,
                "probe toggle",
            ))
            .expect("apply toggle");
        let applied_version = outcome.version();
        probe.mark_update(applied_version, unix_ms());

        let snapshot = authority.current_snapshot();
        reader
            .install((*snapshot).clone(), false)
            .expect("install snapshot");
        let decision = reader.check_post_identity("agent-a", "server-a", Some("tool-a"));
        handoff_samples.push(started.elapsed().as_nanos() as u64);

        debug_assert_eq!(decision.state_version(), Some(applied_version));
        if let Some(sample) = probe.mark_visible(applied_version, unix_ms()) {
            propagation_ms.push(sample.delay_ms);
        }
    }

    println!();
    report("revocation.handoff", &handoff_samples, "ns");
    report("revocation.propagation_ms", &propagation_ms, "ms");
    println!("note: in-process only; this is not a cross-process or end-to-end measurement.");
}
