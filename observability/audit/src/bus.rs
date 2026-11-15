// Copyright 2024 Axiom NHI — Licensed under Apache-2.0
//! Bounded, non-blocking audit delivery.
//!
//! Two bounded channels separate routine `ALLOW` events from critical
//! `DENY`/`WOULD_DENY`/kill-switch events. Producers use `try_send`; a full
//! queue returns [`EmitOutcome::DroppedFull`] and increments a counter instead
//! of blocking the request path.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use crossbeam_channel::{bounded, Receiver, Select, SelectTimeoutError, Sender, TrySendError};
use thiserror::Error;

use crate::event::AuditRecord;

/// Delivery priority for an audit record.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum AuditPriority {
    /// Denials, shadow denials, and kill-switch actions.
    Critical,
    /// Permits and other routine records.
    Routine,
}

/// Queue capacities. Both must be greater than zero.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AuditBusConfig {
    /// Capacity of the critical queue.
    pub critical_capacity: usize,
    /// Capacity of the routine queue.
    pub routine_capacity: usize,
}

impl Default for AuditBusConfig {
    fn default() -> Self {
        Self {
            critical_capacity: 1_024,
            routine_capacity: 8_192,
        }
    }
}

impl AuditBusConfig {
    /// Validate the configuration.
    pub fn validate(&self) -> Result<(), BusConfigError> {
        if self.critical_capacity == 0 || self.routine_capacity == 0 {
            return Err(BusConfigError::ZeroCapacity);
        }
        Ok(())
    }
}

/// Configuration error.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
pub enum BusConfigError {
    /// A queue capacity was zero.
    #[error("audit queue capacity must be greater than zero")]
    ZeroCapacity,
}

/// Outcome of a non-blocking enqueue attempt.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EmitOutcome {
    /// The record was placed on a queue.
    Enqueued {
        /// Queue that accepted the record.
        priority: AuditPriority,
    },
    /// The queue was full; the record was dropped and counted.
    DroppedFull {
        /// Queue that was full.
        priority: AuditPriority,
    },
    /// The writer side is gone.
    Disconnected,
}

impl EmitOutcome {
    /// Whether the record was enqueued.
    pub fn is_enqueued(&self) -> bool {
        matches!(self, Self::Enqueued { .. })
    }
}

/// Point-in-time bus statistics.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct AuditBusStatsSnapshot {
    /// Critical records enqueued.
    pub critical_enqueued: u64,
    /// Routine records enqueued.
    pub routine_enqueued: u64,
    /// Critical records dropped because the queue was full.
    pub critical_dropped: u64,
    /// Routine records dropped because the queue was full.
    pub routine_dropped: u64,
    /// Enqueue attempts that found the writer disconnected.
    pub disconnected: u64,
    /// Current queued record count.
    pub current_depth: usize,
}

impl AuditBusStatsSnapshot {
    /// Total enqueued records.
    pub fn total_enqueued(&self) -> u64 {
        self.critical_enqueued + self.routine_enqueued
    }

    /// Total dropped records.
    pub fn total_dropped(&self) -> u64 {
        self.critical_dropped + self.routine_dropped
    }
}

#[derive(Debug, Default)]
struct AuditBusStats {
    critical_enqueued: AtomicU64,
    routine_enqueued: AtomicU64,
    critical_dropped: AtomicU64,
    routine_dropped: AtomicU64,
    disconnected: AtomicU64,
}

/// Sink seam implemented by the bus and by test/mock sinks.
pub trait AuditSink: Send + Sync {
    /// Attempt to enqueue a record without blocking.
    fn try_emit(&self, record: AuditRecord) -> EmitOutcome;
}

/// Cloneable producer handle.
#[derive(Debug, Clone)]
pub struct AuditEmitter {
    critical_tx: Sender<AuditRecord>,
    routine_tx: Sender<AuditRecord>,
    stats: Arc<AuditBusStats>,
}

impl AuditEmitter {
    /// Enqueue a record using its inherent priority.
    pub fn try_emit(&self, record: AuditRecord) -> EmitOutcome {
        let priority = if record.is_critical() {
            AuditPriority::Critical
        } else {
            AuditPriority::Routine
        };

        let result = match priority {
            AuditPriority::Critical => self.critical_tx.try_send(record),
            AuditPriority::Routine => self.routine_tx.try_send(record),
        };

        match result {
            Ok(()) => {
                match priority {
                    AuditPriority::Critical => {
                        self.stats.critical_enqueued.fetch_add(1, Ordering::Relaxed);
                    }
                    AuditPriority::Routine => {
                        self.stats.routine_enqueued.fetch_add(1, Ordering::Relaxed);
                    }
                }
                EmitOutcome::Enqueued { priority }
            }
            Err(TrySendError::Full(_)) => {
                match priority {
                    AuditPriority::Critical => {
                        self.stats.critical_dropped.fetch_add(1, Ordering::Relaxed);
                    }
                    AuditPriority::Routine => {
                        self.stats.routine_dropped.fetch_add(1, Ordering::Relaxed);
                    }
                }
                EmitOutcome::DroppedFull { priority }
            }
            Err(TrySendError::Disconnected(_)) => {
                self.stats.disconnected.fetch_add(1, Ordering::Relaxed);
                EmitOutcome::Disconnected
            }
        }
    }

    fn snapshot(&self) -> AuditBusStatsSnapshot {
        AuditBusStatsSnapshot {
            critical_enqueued: self.stats.critical_enqueued.load(Ordering::Relaxed),
            routine_enqueued: self.stats.routine_enqueued.load(Ordering::Relaxed),
            critical_dropped: self.stats.critical_dropped.load(Ordering::Relaxed),
            routine_dropped: self.stats.routine_dropped.load(Ordering::Relaxed),
            disconnected: self.stats.disconnected.load(Ordering::Relaxed),
            current_depth: self.critical_tx.len() + self.routine_tx.len(),
        }
    }
}

impl AuditSink for AuditEmitter {
    fn try_emit(&self, record: AuditRecord) -> EmitOutcome {
        AuditEmitter::try_emit(self, record)
    }
}

/// Consumer view of the audit queues.
#[derive(Debug, Clone)]
pub struct AuditSubscriber {
    critical_rx: Receiver<AuditRecord>,
    routine_rx: Receiver<AuditRecord>,
}

impl AuditSubscriber {
    /// Non-blocking receive, critical queue first.
    pub fn try_recv(&self) -> Option<AuditRecord> {
        self.critical_rx
            .try_recv()
            .ok()
            .or_else(|| self.routine_rx.try_recv().ok())
    }

    /// Wait up to `timeout` for a record, preferring the critical queue.
    pub fn next_timeout(&self, timeout: Duration) -> ReceiverOutcome {
        if let Ok(record) = self.critical_rx.try_recv() {
            return ReceiverOutcome::Record(record);
        }
        if let Ok(record) = self.routine_rx.try_recv() {
            return ReceiverOutcome::Record(record);
        }

        let mut select = Select::new();
        let critical = select.recv(&self.critical_rx);
        let routine = select.recv(&self.routine_rx);

        match select.select_timeout(timeout) {
            Ok(operation) => {
                let index = operation.index();
                let result = if index == critical {
                    operation.recv(&self.critical_rx)
                } else {
                    debug_assert_eq!(index, routine);
                    operation.recv(&self.routine_rx)
                };
                match result {
                    Ok(record) => ReceiverOutcome::Record(record),
                    Err(_) => ReceiverOutcome::Disconnected,
                }
            }
            Err(SelectTimeoutError) => ReceiverOutcome::Timeout,
        }
    }

    /// Drain all immediately available records, critical first.
    pub fn drain(&self) -> Vec<AuditRecord> {
        let mut records = Vec::new();
        while let Some(record) = self.try_recv() {
            records.push(record);
        }
        records
    }
}

/// Result of waiting for a record.
///
/// `AuditRecord` is a large value because it mirrors the shared contract. This
/// enum is only used on the writer/consumer side, never on the inline request
/// path, so the size difference is accepted rather than boxing on every receive.
#[allow(clippy::large_enum_variant)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReceiverOutcome {
    /// A record was received.
    Record(AuditRecord),
    /// The timeout elapsed with no record.
    Timeout,
    /// All producers are gone and the queues are empty.
    Disconnected,
}

/// Bounded audit bus.
pub struct AuditBus {
    emitter: AuditEmitter,
    subscriber: AuditSubscriber,
}

impl AuditBus {
    /// Create a bus with the given capacities.
    pub fn new(config: AuditBusConfig) -> Result<Self, BusConfigError> {
        config.validate()?;
        let (critical_tx, critical_rx) = bounded(config.critical_capacity);
        let (routine_tx, routine_rx) = bounded(config.routine_capacity);
        let stats = Arc::new(AuditBusStats::default());
        Ok(Self {
            emitter: AuditEmitter {
                critical_tx,
                routine_tx,
                stats,
            },
            subscriber: AuditSubscriber {
                critical_rx,
                routine_rx,
            },
        })
    }

    /// Cloneable producer handle.
    pub fn emitter(&self) -> AuditEmitter {
        self.emitter.clone()
    }

    /// Cloneable consumer handle.
    pub fn subscribe(&self) -> AuditSubscriber {
        self.subscriber.clone()
    }

    /// Current statistics.
    pub fn stats(&self) -> AuditBusStatsSnapshot {
        self.emitter.snapshot()
    }

    /// Non-blocking receive, critical queue first.
    pub fn try_recv(&self) -> Option<AuditRecord> {
        self.subscriber.try_recv()
    }

    /// Drain all immediately available records, critical first.
    pub fn drain(&self) -> Vec<AuditRecord> {
        self.subscriber.drain()
    }
}

impl AuditSink for AuditBus {
    fn try_emit(&self, record: AuditRecord) -> EmitOutcome {
        self.emitter.try_emit(record)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event::{AuditDecision, AuditEventInput, AuditRuntimeMode, FixedClock};

    fn clock() -> FixedClock {
        FixedClock::new(0, "1970-01-01T00:00:00.000Z")
    }

    fn decision(decision: AuditDecision) -> AuditRecord {
        AuditRecord::Decision(
            AuditEventInput {
                request_id: "req".to_string(),
                trace_id: "trace".to_string(),
                agent_id: "agent".to_string(),
                target_server: "server".to_string(),
                tool_name: "tool".to_string(),
                runtime_mode: AuditRuntimeMode::Enforce,
                decision,
                policy_version: "v1".to_string(),
                denial_reason: None,
                validator_summary: vec![],
                kill_switch_active: false,
                latency_us: 1,
            }
            .build(&clock()),
        )
    }

    #[test]
    fn rejects_zero_capacity() {
        let result = AuditBus::new(AuditBusConfig {
            critical_capacity: 0,
            routine_capacity: 1,
        });
        assert!(matches!(result, Err(BusConfigError::ZeroCapacity)));
    }

    #[test]
    fn routine_overflow_drops_without_blocking() {
        let bus = AuditBus::new(AuditBusConfig {
            critical_capacity: 4,
            routine_capacity: 2,
        })
        .unwrap();
        assert!(bus.try_emit(decision(AuditDecision::Allow)).is_enqueued());
        assert!(bus.try_emit(decision(AuditDecision::Allow)).is_enqueued());
        assert_eq!(
            bus.try_emit(decision(AuditDecision::Allow)),
            EmitOutcome::DroppedFull {
                priority: AuditPriority::Routine
            }
        );
        let stats = bus.stats();
        assert_eq!(stats.routine_enqueued, 2);
        assert_eq!(stats.routine_dropped, 1);
        assert_eq!(stats.critical_dropped, 0);
    }

    #[test]
    fn critical_overflow_is_counted_separately() {
        let bus = AuditBus::new(AuditBusConfig {
            critical_capacity: 1,
            routine_capacity: 4,
        })
        .unwrap();
        assert!(bus.try_emit(decision(AuditDecision::Deny)).is_enqueued());
        assert_eq!(
            bus.try_emit(decision(AuditDecision::Deny)),
            EmitOutcome::DroppedFull {
                priority: AuditPriority::Critical
            }
        );
        let stats = bus.stats();
        assert_eq!(stats.critical_enqueued, 1);
        assert_eq!(stats.critical_dropped, 1);
    }

    #[test]
    fn critical_records_are_received_before_routine_records() {
        let bus = AuditBus::new(AuditBusConfig {
            critical_capacity: 4,
            routine_capacity: 4,
        })
        .unwrap();
        bus.try_emit(decision(AuditDecision::Allow));
        bus.try_emit(decision(AuditDecision::Deny));

        let first = bus.try_recv().unwrap();
        match first {
            AuditRecord::Decision(event) => assert_eq!(event.decision, "DENY"),
            _ => panic!("expected decision record"),
        }
        let second = bus.try_recv().unwrap();
        match second {
            AuditRecord::Decision(event) => assert_eq!(event.decision, "ALLOW"),
            _ => panic!("expected decision record"),
        }
        assert!(bus.try_recv().is_none());
    }

    #[test]
    fn subscriber_receives_and_drains() {
        let bus = AuditBus::new(AuditBusConfig::default()).unwrap();
        let subscriber = bus.subscribe();
        bus.try_emit(decision(AuditDecision::Allow));
        bus.try_emit(decision(AuditDecision::WouldDeny));
        let records = subscriber.drain();
        assert_eq!(records.len(), 2);
    }

    #[test]
    fn disconnected_writer_is_reported() {
        let bus = AuditBus::new(AuditBusConfig::default()).unwrap();
        let emitter = bus.emitter();
        drop(bus);
        assert_eq!(
            emitter.try_emit(decision(AuditDecision::Deny)),
            EmitOutcome::Disconnected
        );
        let stats = emitter.snapshot();
        assert_eq!(stats.disconnected, 1);
    }

    #[test]
    fn next_timeout_returns_timeout_then_record() {
        let bus = AuditBus::new(AuditBusConfig::default()).unwrap();
        let subscriber = bus.subscribe();
        assert_eq!(
            subscriber.next_timeout(Duration::from_millis(1)),
            ReceiverOutcome::Timeout
        );
        bus.try_emit(decision(AuditDecision::Deny));
        match subscriber.next_timeout(Duration::from_millis(10)) {
            ReceiverOutcome::Record(AuditRecord::Decision(event)) => {
                assert_eq!(event.decision, "DENY");
            }
            other => panic!("unexpected outcome: {other:?}"),
        }
    }
}
