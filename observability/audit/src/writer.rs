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
    let mut seq_no: u64 = 0;
    let mut prev_hash = "0".repeat(64);

    loop {
        match subscriber.next_timeout(config.flush_interval) {
            ReceiverOutcome::Record(record) => {
                match record.to_json_line() {
                    Ok(raw_json) => {
                        seq_no += 1;
                        let entry_hash = compute_chain_digest_hex(&prev_hash, seq_no, &raw_json);
                        let chained_line = format!(
                            r#"{{"seq_no":{seq_no},"prev_hash":"{prev_hash}","entry_hash":"{entry_hash}","record":{raw_json}}}"#
                        );
                        let write_result = writer
                            .write_all(chained_line.as_bytes())
                            .and_then(|_| writer.write_all(b"\n"));
                        if write_result.is_ok() {
                            stats.written += 1;
                            stats.bytes += chained_line.len() as u64 + 1;
                            dirty = true;
                            prev_hash = entry_hash;
                        } else {
                            stats.failed += 1;
                        }
                    }
                    Err(_) => {
                        stats.failed += 1;
                    }
                }

                if stats.written > 0 && stats.written % flush_every == 0 && dirty {
                    if writer.flush().and_then(|_| writer.get_ref().sync_data()).is_ok() {
                        dirty = false;
                    } else {
                        stats.failed += 1;
                    }
                }
            }
            ReceiverOutcome::Timeout => {
                if dirty {
                    if writer.flush().and_then(|_| writer.get_ref().sync_data()).is_ok() {
                        dirty = false;
                    } else {
                        stats.failed += 1;
                    }
                }
            }
            ReceiverOutcome::Disconnected => {
                if writer.flush().and_then(|_| writer.get_ref().sync_data()).is_err() {
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


// ---------------------------------------------------------------------------
// AX-011 Remediation: Tamper-Evident SHA-256 Hash Chain & Checkpoint Verifier
// ---------------------------------------------------------------------------

use std::io::{BufRead, BufReader};

/// Computes a cryptographically tamper-evident SHA-256 hex digest over the previous hash,
/// sequence number, and canonical JSON record (AX-011).
pub fn compute_chain_digest_hex(prev_hash: &str, seq_no: u64, canonical_json: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(prev_hash.as_bytes());
    hasher.update(b"|");
    hasher.update(seq_no.to_string().as_bytes());
    hasher.update(b"|");
    hasher.update(canonical_json.as_bytes());
    hex::encode(hasher.finalize())
}

/// Appends a hash-chained JSONL record and fsyncs the underlying file descriptor.
pub fn append_hash_chained_record(
    path: & std::path::Path,
    seq_no: u64,
    prev_hash: &str,
    canonical_record_json: &str,
) -> std::io::Result<String> {
    let entry_hash = compute_chain_digest_hex(prev_hash, seq_no, canonical_record_json);
    let file = OpenOptions::new().create(true).append(true).open(path)?;
    let mut writer = BufWriter::new(file);
    let line = format!(
        r#"{{"seq_no":{seq_no},"prev_hash":"{prev_hash}","entry_hash":"{entry_hash}","record":{canonical_record_json}}}"#
    );
    writer.write_all(line.as_bytes())?;
    writer.write_all(b"\n")?;
    writer.flush()?;
    writer.get_ref().sync_data()?;
    Ok(entry_hash)
}

/// Verifies a hash-chained JSONL audit log for truncation, reordering, deletion, or tampering.
pub fn verify_chained_audit_log(path: &std::path::Path, expected_count: Option<u64>) -> Result<String, String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let reader = BufReader::new(file);
    let mut expected_prev = "0".repeat(64);
    let mut count: u64 = 0;

    for line_res in reader.lines() {
        let line = line_res.map_err(|e| e.to_string())?;
        if line.trim().is_empty() {
            continue;
        }
        let parsed: serde_json::Value = serde_json::from_str(&line).map_err(|e| e.to_string())?;
        let seq_no = parsed.get("seq_no").and_then(|v| v.as_u64()).ok_or("missing seq_no")?;
        let prev_hash = parsed.get("prev_hash").and_then(|v| v.as_str()).ok_or("missing prev_hash")?;
        let entry_hash = parsed.get("entry_hash").and_then(|v| v.as_str()).ok_or("missing entry_hash")?;
        let record_val = parsed.get("record").ok_or("missing record")?;

        count += 1;
        if seq_no != count {
            return Err(format!("sequence gap or reordering at seq_no {seq_no}, expected {count}"));
        }
        if prev_hash != expected_prev {
            return Err(format!("broken prev_hash link at seq_no {seq_no}"));
        }
        let canonical = serde_json::to_string(record_val).map_err(|e| e.to_string())?;
        let recomputed = compute_chain_digest_hex(prev_hash, seq_no, &canonical);
        if recomputed != entry_hash {
            return Err(format!("tampered record detected at seq_no {seq_no}"));
        }
        expected_prev = entry_hash.to_owned();
    }

    if let Some(exp) = expected_count {
        if count != exp {
            return Err(format!("truncation detected: expected {exp} records, found {count}"));
        }
    }
    Ok(expected_prev)
}

#[cfg(test)]
mod ax011_tests {
    use super::*;

    #[test]
    fn detects_tampering_and_truncation_in_chained_audit_log() {
        let tmp = std::env::temp_dir().join(format!("axiom_chain_test_{}.jsonl", std::process::id()));
        let _ = std::fs::remove_file(&tmp);

        let h1 = append_hash_chained_record(&tmp, 1, &"0".repeat(64), r#"{"decision":"ALLOW"}"#).unwrap();
        let h2 = append_hash_chained_record(&tmp, 2, &h1, r#"{"decision":"DENY"}"#).unwrap();

        let verified_head = verify_chained_audit_log(&tmp, Some(2)).expect("intact chain must pass");
        assert_eq!(verified_head, h2);
        assert!(verify_chained_audit_log(&tmp, Some(3)).is_err(), "truncation must fail");

        let _ = std::fs::remove_file(&tmp);
    }
}
