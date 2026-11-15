// Copyright 2024 Axiom NHI — Licensed under Apache-2.0
//! Stable metric names and percentile helpers for Gate G1 measurement.
//!
//! Names are defined here so Team 5 emits and Team 6 asserts the same
//! instruments. Units follow the OpenTelemetry convention of seconds for
//! durations; the values in audit events remain microseconds.

use std::collections::HashMap;
use std::sync::Mutex;

/// Metric and unit names shared by Team 5 and Team 6.
pub mod names {
    /// Revocation lookup duration. Unit: seconds.
    pub const REVOCATION_LOOKUP_DURATION: &str = "axiom.revocation.lookup.duration";
    /// Current revocation snapshot version. Unit: 1.
    pub const REVOCATION_STATE_VERSION: &str = "axiom.revocation.state.version";
    /// Update-to-visible delay for revocation state. Unit: seconds.
    pub const REVOCATION_PROPAGATION_DELAY: &str = "axiom.revocation.propagation.delay";
    /// Count of lookups served from a stale snapshot. Unit: 1.
    pub const REVOCATION_STALE_TOTAL: &str = "axiom.revocation.stale.total";
    /// Count of lookups that could not read any revocation state. Unit: 1.
    pub const REVOCATION_UNAVAILABLE_TOTAL: &str = "axiom.revocation.unavailable.total";
    /// Audit enqueue duration on the inline path. Unit: seconds.
    pub const AUDIT_ENQUEUE_DURATION: &str = "axiom.audit.enqueue.duration";
    /// Current bounded audit queue depth. Unit: 1.
    pub const AUDIT_QUEUE_DEPTH: &str = "axiom.audit.queue.depth";
    /// Audit records dropped because a queue was full or disconnected. Unit: 1.
    pub const AUDIT_DROPPED_TOTAL: &str = "axiom.audit.dropped.total";
    /// Audit writer batch duration (off the inline path). Unit: seconds.
    pub const AUDIT_WRITE_DURATION: &str = "axiom.audit.write.duration";
    /// Number of values changed by the redactor. Unit: 1.
    pub const AUDIT_REDACTIONS_TOTAL: &str = "axiom.audit.redactions.total";
    /// OTLP export failures. Unit: 1.
    pub const AUDIT_EXPORT_FAILURES_TOTAL: &str = "axiom.audit.export.failures.total";
    /// Malformed `traceparent` values encountered. Unit: 1.
    pub const TRACE_PARSE_FAILURES_TOTAL: &str = "axiom.trace.parse.failures.total";
}

/// A compact latency summary using nearest-rank percentiles.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LatencySummary {
    /// Number of samples.
    pub count: usize,
    /// Smallest sample.
    pub min: u64,
    /// 50th percentile.
    pub p50: u64,
    /// 95th percentile.
    pub p95: u64,
    /// 99th percentile.
    pub p99: u64,
    /// Largest sample.
    pub max: u64,
}

impl LatencySummary {
    /// Build a summary from raw non-negative samples.
    ///
    /// Returns `None` for an empty sample set so callers cannot accidentally
    /// report a zero-latency result based on no measurements.
    pub fn from_samples(samples: &[u64]) -> Option<Self> {
        if samples.is_empty() {
            return None;
        }
        let mut sorted = samples.to_vec();
        sorted.sort_unstable();
        Some(Self {
            count: sorted.len(),
            min: sorted[0],
            p50: percentile(&sorted, 50),
            p95: percentile(&sorted, 95),
            p99: percentile(&sorted, 99),
            max: sorted[sorted.len() - 1],
        })
    }
}

/// Nearest-rank percentile over an already-sorted slice.
///
/// `p` is clamped to `1..=100`. For a single sample all percentiles equal it.
pub fn percentile(sorted: &[u64], p: u8) -> u64 {
    assert!(
        !sorted.is_empty(),
        "percentile requires at least one sample"
    );
    let p = p.clamp(1, 100) as usize;
    let rank = (p * sorted.len()).div_ceil(100);
    sorted[rank.saturating_sub(1).min(sorted.len() - 1)]
}

/// A single update-to-visible observation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PropagationSample {
    /// Revocation snapshot version that became visible.
    pub version: u64,
    /// Milliseconds from the update mark to the visibility mark.
    pub delay_ms: u64,
}

/// Records update and visibility timestamps for revocation propagation.
///
/// This is a measurement helper, not a synchronization primitive. Producers
/// call [`PropagationProbe::mark_update`] when a new snapshot is committed and
/// consumers call [`PropagationProbe::mark_visible`] when they observe it. The
/// probe does not store the revocation state itself.
#[derive(Debug, Default)]
pub struct PropagationProbe {
    pending: Mutex<HashMap<u64, i64>>,
}

impl PropagationProbe {
    /// Create an empty probe.
    pub fn new() -> Self {
        Self::default()
    }

    /// Record that `version` was committed at `now_unix_ms`.
    pub fn mark_update(&self, version: u64, now_unix_ms: i64) {
        let mut pending = self
            .pending
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        pending.insert(version, now_unix_ms);
    }

    /// Record that `version` became visible at `now_unix_ms`.
    ///
    /// Returns `None` when the version was not previously marked.
    pub fn mark_visible(&self, version: u64, now_unix_ms: i64) -> Option<PropagationSample> {
        let mut pending = self
            .pending
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let started = pending.remove(&version)?;
        let delay_ms = now_unix_ms.saturating_sub(started).max(0) as u64;
        Some(PropagationSample { version, delay_ms })
    }

    /// Number of updates still waiting to be observed.
    pub fn pending_updates(&self) -> usize {
        self.pending
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percentile_uses_nearest_rank() {
        let samples = [1, 2, 3, 4, 5];
        assert_eq!(percentile(&samples, 50), 3);
        assert_eq!(percentile(&samples, 95), 5);
        assert_eq!(percentile(&samples, 99), 5);
        assert_eq!(percentile(&samples, 100), 5);
        assert_eq!(percentile(&samples, 0), 1);
    }

    #[test]
    fn summary_reports_expected_fields() {
        let summary = LatencySummary::from_samples(&[5, 1, 3, 2, 4]).unwrap();
        assert_eq!(summary.count, 5);
        assert_eq!(summary.min, 1);
        assert_eq!(summary.p50, 3);
        assert_eq!(summary.p95, 5);
        assert_eq!(summary.p99, 5);
        assert_eq!(summary.max, 5);
    }

    #[test]
    fn empty_summary_is_none() {
        assert!(LatencySummary::from_samples(&[]).is_none());
    }

    #[test]
    fn propagation_probe_measures_delay() {
        let probe = PropagationProbe::new();
        probe.mark_update(7, 1_000);
        assert_eq!(probe.pending_updates(), 1);
        let sample = probe.mark_visible(7, 1_042).unwrap();
        assert_eq!(sample.version, 7);
        assert_eq!(sample.delay_ms, 42);
        assert_eq!(probe.pending_updates(), 0);
        assert!(probe.mark_visible(7, 2_000).is_none());
    }

    #[test]
    fn propagation_probe_does_not_underflow_on_clock_regression() {
        let probe = PropagationProbe::new();
        probe.mark_update(1, 5_000);
        let sample = probe.mark_visible(1, 4_000).unwrap();
        assert_eq!(sample.delay_ms, 0);
    }
}
