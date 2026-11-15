// Copyright 2024 Axiom NHI — Licensed under Apache-2.0
//! Off-path audit writer.
//!
//! The writer owns all file I/O. It drains the bounded queues, appends one JSON
//! object per line, and flushes on a count or time threshold. The inline
//! request path never touches this module.

use std::fs::OpenOptions;
use std::io::{BufWriter, Write};
use std::path::PathBuf;
use std::thread::{self, JoinHandle};
use std::time::Duration;

use crate::bus::{AuditSubscriber, ReceiverOutcome};

/// Writer configuration.
#[derive(Debug, Clone)]
pub struct AuditWriterConfig {
    /// Append-only JSONL path.
    pub path: PathBuf,
    /// Flush after this many written records.
    pub flush_every: usize,
    /// Flush after this idle interval.
    pub flush_interval: Duration,
}

impl AuditWriterConfig {
    /// Create a configuration with conservative defaults.
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self {
            path: path.into(),
            flush_every: 64,
            flush_interval: Duration::from_millis(100),
        }
    }
}

/// Writer statistics returned when the writer stops.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct AuditWriterStats {
    /// Records written successfully.
    pub written: u64,
    /// Records or flush operations that failed.
    pub failed: u64,
    /// Bytes written, including newlines.
    pub bytes: u64,
}

/// Handle to a running writer thread.
pub struct WriterHandle {
    join: JoinHandle<AuditWriterStats>,
}

impl WriterHandle {
    /// Wait for the writer to drain and stop.
    pub fn join(self) -> thread::Result<AuditWriterStats> {
        self.join.join()
    }
}

/// Open the target file and run the writer loop on the current thread.
///
/// This is useful for tests and for callers that already own a dedicated
/// thread. File-open errors are returned; per-record write errors are counted
/// in [`AuditWriterStats::failed`] so one bad record cannot stop the stream.
pub fn run_file_writer(
    subscriber: AuditSubscriber,
    config: &AuditWriterConfig,
) -> std::io::Result<AuditWriterStats> {
    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&config.path)?;
    let mut writer = BufWriter::new(file);
    let mut stats = AuditWriterStats::default();
    let mut dirty = false;
    let flush_every = config.flush_every.max(1) as u64;

    loop {
        match subscriber.next_timeout(config.flush_interval) {
            ReceiverOutcome::Record(record) => {
                match record.to_json_line() {
                    Ok(line) => {
                        let write_result = writer
                            .write_all(line.as_bytes())
                            .and_then(|_| writer.write_all(b"\n"));
                        if write_result.is_ok() {
                            stats.written += 1;
                            stats.bytes += line.len() as u64 + 1;
                            dirty = true;
                        } else {
                            stats.failed += 1;
                        }
                    }
                    Err(_) => {
                        stats.failed += 1;
                    }
                }

                if stats.written > 0 && stats.written % flush_every == 0 && dirty {
                    if writer.flush().is_ok() {
                        dirty = false;
                    } else {
                        stats.failed += 1;
                    }
                }
            }
            ReceiverOutcome::Timeout => {
                if dirty {
                    if writer.flush().is_ok() {
                        dirty = false;
                    } else {
                        stats.failed += 1;
                    }
                }
            }
            ReceiverOutcome::Disconnected => {
                if writer.flush().is_err() {
                    stats.failed += 1;
                }
                break;
            }
        }
    }

    Ok(stats)
}

/// Open the target file and spawn a dedicated writer thread.
///
/// The file is opened before the thread starts so permission/path errors are
/// returned to the caller synchronously.
pub fn spawn_file_writer(
    subscriber: AuditSubscriber,
    config: AuditWriterConfig,
) -> std::io::Result<WriterHandle> {
    // Fail fast on an unusable path before returning a handle.
    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&config.path)?;
    drop(file);

    let join = thread::Builder::new()
        .name("axiom-audit-writer".to_string())
        .spawn(move || {
            run_file_writer(subscriber, &config).unwrap_or(AuditWriterStats {
                written: 0,
                failed: 1,
                bytes: 0,
            })
        })?;

    Ok(WriterHandle { join })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bus::{AuditBus, AuditBusConfig};
    use crate::event::{AuditDecision, AuditEventInput, AuditRuntimeMode, FixedClock};
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    // Synthetic sentinel only; not a valid credential.
    const SENTINEL: &str = "SYNTHETIC_WRITER_SENTINEL";

    fn clock() -> FixedClock {
        FixedClock::new(0, "1970-01-01T00:00:00.000Z")
    }

    fn decision(decision: AuditDecision, reason: Option<&str>) -> crate::event::AuditRecord {
        crate::event::AuditRecord::Decision(
            AuditEventInput {
                request_id: "req".to_string(),
                trace_id: "trace".to_string(),
                agent_id: "agent".to_string(),
                target_server: "server".to_string(),
                tool_name: "tool".to_string(),
                runtime_mode: AuditRuntimeMode::Enforce,
                decision,
                policy_version: "v1".to_string(),
                denial_reason: reason.map(str::to_string),
                validator_summary: vec![],
                kill_switch_active: false,
                latency_us: 1,
            }
            .build(&clock()),
        )
    }

    fn temp_path() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!(
            "axiom-audit-writer-{}-{}.jsonl",
            std::process::id(),
            nanos
        ))
    }

    #[test]
    fn writer_appends_json_lines_and_redacts() {
        let path = temp_path();
        let bus = AuditBus::new(AuditBusConfig::default()).unwrap();
        let subscriber = bus.subscribe();
        let handle = spawn_file_writer(subscriber, AuditWriterConfig::new(path.clone())).unwrap();

        let emitter = bus.emitter();
        emitter.try_emit(decision(AuditDecision::Allow, None));
        emitter.try_emit(decision(
            AuditDecision::Deny,
            Some(&format!("blocked Bearer {SENTINEL}")),
        ));
        drop(emitter);
        drop(bus);

        let stats = handle.join().expect("writer thread");
        assert_eq!(stats.written, 2);
        assert_eq!(stats.failed, 0);

        let contents = fs::read_to_string(&path).expect("read audit file");
        let lines: Vec<&str> = contents.lines().collect();
        assert_eq!(lines.len(), 2);
        assert!(!contents.contains(SENTINEL), "contents: {contents}");
        assert!(contents.contains("\"decision\":\"ALLOW\""));
        assert!(contents.contains("\"decision\":\"DENY\""));
        for line in lines {
            let value: serde_json::Value = serde_json::from_str(line).unwrap();
            assert!(value.is_object());
        }

        let _ = fs::remove_file(path);
    }

    #[test]
    fn run_file_writer_returns_after_disconnect() {
        let path = temp_path();
        let bus = AuditBus::new(AuditBusConfig::default()).unwrap();
        let subscriber = bus.subscribe();
        let emitter = bus.emitter();
        emitter.try_emit(decision(AuditDecision::Deny, None));
        drop(emitter);
        drop(bus);

        let stats = run_file_writer(subscriber, &AuditWriterConfig::new(path.clone())).unwrap();
        assert_eq!(stats.written, 1);
        let _ = fs::remove_file(path);
    }
}
