// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
//! Bounded FIFO audit ring for the customer-side agent.
//!
//! This is the disk guard required by the offline contract: a disconnected
//! agent must **never** fill the customer's volume. Segments are bounded per
//! file and the whole ring is capped by `AXIOM_AUDIT_MAX_BYTES` (default
//! 500 MB). When the cap is reached the oldest segment is dropped.
//!
//! Delivery is at-least-once. `take_batch` atomically moves segment files into
//! `inflight/`, `ack` deletes them after a successful send, and `requeue`
//! returns them on failure (or after a crash, on next start). Duplicates are
//! possible by design and the control plane deduplicates on `event_id`.

use std::collections::VecDeque;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use anyhow::{Context, Result};
use axiom_agent_protocol::AuditEventEnvelope;

/// Rotate a segment once it grows past this size. With a 500 MB cap this
/// bounds individual files to ~8 MB, so eviction never has to touch a huge
/// file and startup scans stay cheap.
const SEGMENT_TARGET_BYTES: u64 = 8 * 1024 * 1024;

pub const DEFAULT_MAX_BYTES: u64 = 500 * 1024 * 1024;

#[derive(Debug)]
pub struct AuditBatch {
    pub events: Vec<AuditEventEnvelope>,
    files: Vec<PathBuf>,
    pub bytes: u64,
    pub skipped_lines: usize,
}

#[derive(Debug, Default)]
struct RingState {
    segments: VecDeque<Segment>,
    current_seq: u64,
    current_size: u64,
    total_bytes: u64,
}

#[derive(Debug, Clone)]
struct Segment {
    seq: u64,
    path: PathBuf,
    size: u64,
}

pub struct AuditRing {
    #[allow(dead_code)]
    root: PathBuf,
    segments_dir: PathBuf,
    inflight_dir: PathBuf,
    max_bytes: u64,
    state: Mutex<RingState>,
}

impl AuditRing {
    pub fn open(dir: impl AsRef<Path>, max_bytes: u64) -> Result<Self> {
        anyhow::ensure!(max_bytes > 0, "AXIOM_AUDIT_MAX_BYTES must be positive");

        let root = dir.as_ref().to_path_buf();
        let segments_dir = root.join("segments");
        let inflight_dir = root.join("inflight");
        fs::create_dir_all(&segments_dir)
            .with_context(|| format!("create audit dir {}", segments_dir.display()))?;
        fs::create_dir_all(&inflight_dir)
            .with_context(|| format!("create audit dir {}", inflight_dir.display()))?;

        // Recover batches whose send was interrupted by a crash.
        for entry in fs::read_dir(&inflight_dir)? {
            let entry = entry?;
            if entry.file_type()?.is_file() {
                let destination = segments_dir.join(entry.file_name());
                let _ = fs::rename(entry.path(), destination);
            }
        }

        let mut segments: Vec<Segment> = fs::read_dir(&segments_dir)?
            .filter_map(|entry| entry.ok())
            .filter_map(|entry| {
                let metadata = entry.metadata().ok()?;
                if !metadata.is_file() {
                    return None;
                }
                let name = entry.file_name();
                let seq = parse_seq(name.to_str()?)?;
                Some(Segment {
                    seq,
                    path: entry.path(),
                    size: metadata.len(),
                })
            })
            .collect();
        segments.sort_by_key(|segment| segment.seq);

        let current = segments.last().cloned();
        let total_bytes = segments.iter().map(|segment| segment.size).sum();
        let state = RingState {
            current_seq: current.as_ref().map(|segment| segment.seq).unwrap_or(0),
            current_size: current.as_ref().map(|segment| segment.size).unwrap_or(0),
            total_bytes,
            segments: segments.into(),
        };

        Ok(Self {
            root,
            segments_dir,
            inflight_dir,
            max_bytes,
            state: Mutex::new(state),
        })
    }

    #[allow(dead_code)]
    pub fn max_bytes(&self) -> u64 {
        self.max_bytes
    }

    #[allow(dead_code)]
    pub fn root(&self) -> &Path {
        &self.root
    }

    #[allow(dead_code)]
    pub fn total_bytes(&self) -> u64 {
        self.lock().total_bytes
    }

    pub fn is_empty(&self) -> bool {
        self.lock().segments.is_empty()
    }

    /// Consume JSONL files dropped by the local runtime into `spool_dir`.
    ///
    /// The runtime should write each file atomically (temp file + rename) so a
    /// partially written file is never ingested. Files are removed after a
    /// read; malformed lines are skipped and counted.
    pub fn ingest_spool(&self, spool_dir: &Path) -> Result<usize> {
        if !spool_dir.exists() {
            return Ok(0);
        }

        let mut files: Vec<PathBuf> = fs::read_dir(spool_dir)?
            .filter_map(|entry| entry.ok())
            .filter(|entry| {
                entry
                    .path()
                    .extension()
                    .map(|ext| ext == "jsonl")
                    .unwrap_or(false)
            })
            .map(|entry| entry.path())
            .collect();
        files.sort();

        let mut ingested = 0;
        for path in files {
            let file = match fs::File::open(&path) {
                Ok(file) => file,
                Err(error) => {
                    tracing::warn!(%error, path = %path.display(), "cannot open audit spool file");
                    continue;
                }
            };
            for line in BufReader::new(file).lines() {
                let line = match line {
                    Ok(line) if line.trim().is_empty() => continue,
                    Ok(line) => line,
                    Err(error) => {
                        tracing::warn!(%error, path = %path.display(), "cannot read audit spool line");
                        break;
                    }
                };
                match serde_json::from_str::<AuditEventEnvelope>(&line) {
                    Ok(event) => {
                        if self.append(&event)? {
                            ingested += 1;
                        }
                    }
                    Err(error) => {
                        tracing::warn!(%error, path = %path.display(), "skipping malformed spool record");
                    }
                }
            }
            remove_file(&path)?;
        }

        if ingested > 0 {
            tracing::debug!(ingested, "runtime audit spool ingested");
        }
        Ok(ingested)
    }

    /// Append one audit event. Returns `false` when the ring had to drop the
    /// event because the configured cap is smaller than a single record.
    pub fn append(&self, event: &AuditEventEnvelope) -> Result<bool> {
        let line = serde_json::to_vec(event).context("encode audit event")?;
        let mut line = line;
        line.push(b'\n');
        let line_len = line.len() as u64;

        let mut state = self.lock();

        // Rotate first so the previous file becomes evictable.
        if state.current_seq == 0 || state.current_size + line_len > SEGMENT_TARGET_BYTES {
            self.rotate(&mut state)?;
        }

        // Evict oldest-first until the new record fits. The segment currently
        // being written is never evicted; if even that is not enough, the
        // record is dropped rather than exceeding the disk budget.
        while state.total_bytes + line_len > self.max_bytes {
            let current_seq = state.current_seq;
            let Some(index) = state
                .segments
                .iter()
                .position(|segment| segment.seq != current_seq)
            else {
                tracing::error!(
                    cap = self.max_bytes,
                    "audit ring cap is smaller than a single record; dropping event"
                );
                return Ok(false);
            };
            let evicted = state
                .segments
                .remove(index)
                .expect("index came from position");
            remove_file(&evicted.path)?;
            state.total_bytes = state.total_bytes.saturating_sub(evicted.size);
            tracing::warn!(
                seq = evicted.seq,
                bytes = evicted.size,
                "audit ring at capacity; dropped oldest segment"
            );
        }

        let path = self.segment_path(state.current_seq);
        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .with_context(|| format!("open audit segment {}", path.display()))?;
        file.write_all(&line)
            .with_context(|| format!("append audit segment {}", path.display()))?;

        state.current_size += line_len;
        state.total_bytes += line_len;
        let current_seq = state.current_seq;
        let current_size = state.current_size;
        if let Some(segment) = state
            .segments
            .iter_mut()
            .find(|segment| segment.seq == current_seq)
        {
            segment.size = current_size;
        }
        Ok(true)
    }

    /// Move the oldest segments into `inflight/` and return their events.
    ///
    /// Whole segments are moved so acknowledging a batch can never discard
    /// events that were not shipped. `max_bytes` bounds one batch well below
    /// the WebSocket frame limit.
    pub fn take_batch(&self, max_bytes: u64) -> Result<AuditBatch> {
        let mut state = self.lock();
        let mut files = Vec::new();
        let mut moved = Vec::new();
        let mut bytes = 0u64;

        while let Some(segment) = state.segments.front() {
            if !files.is_empty() && (files.len() >= 8 || bytes + segment.size > max_bytes) {
                break;
            }
            if segment.seq == state.current_seq && state.current_size > 0 {
                // Seal the active segment so it can be shipped and deleted.
                state.current_seq += 1;
                state.current_size = 0;
            }
            let Some(segment) = state.segments.pop_front() else {
                break;
            };
            bytes += segment.size;
            files.push(segment.path.clone());
            moved.push(segment);
        }

        for segment in &moved {
            let destination = self.inflight_dir.join(
                segment
                    .path
                    .file_name()
                    .context("segment path has no file name")?,
            );
            fs::rename(&segment.path, &destination).with_context(|| {
                format!(
                    "move audit segment {} into inflight",
                    segment.path.display()
                )
            })?;
        }

        let mut events = Vec::new();
        let mut skipped_lines = 0;
        for segment in &moved {
            let path = self.inflight_dir.join(
                segment
                    .path
                    .file_name()
                    .context("segment path has no file name")?,
            );
            let file = fs::File::open(&path)
                .with_context(|| format!("open inflight segment {}", path.display()))?;
            for line in BufReader::new(file).lines() {
                let line = match line {
                    Ok(line) if line.trim().is_empty() => continue,
                    Ok(line) => line,
                    Err(_) => {
                        skipped_lines += 1;
                        continue;
                    }
                };
                match serde_json::from_str::<AuditEventEnvelope>(&line) {
                    Ok(event) => events.push(event),
                    Err(_) => skipped_lines += 1,
                }
            }
        }

        Ok(AuditBatch {
            events,
            files,
            bytes,
            skipped_lines,
        })
    }

    /// Delete shipped segments. Called only after the control plane accepted
    /// the batch (or after a permanent rejection we choose not to retry).
    pub fn ack(&self, batch: &AuditBatch) -> Result<()> {
        let mut state = self.lock();
        for file in &batch.files {
            let inflight = self
                .inflight_dir
                .join(file.file_name().context("segment path has no file name")?);
            remove_file(&inflight)?;
        }
        state.total_bytes = state.total_bytes.saturating_sub(batch.bytes);
        Ok(())
    }

    /// Return segments to the queue after a failed send.
    pub fn requeue(&self, batch: &AuditBatch) -> Result<()> {
        let mut state = self.lock();
        let mut restored = Vec::new();
        for file in &batch.files {
            let name = file.file_name().context("segment path has no file name")?;
            let inflight = self.inflight_dir.join(name);
            let destination = self.segments_dir.join(name);
            match fs::rename(&inflight, &destination) {
                Ok(()) => {
                    let size = fs::metadata(&destination).map(|m| m.len()).unwrap_or(0);
                    restored.push(Segment {
                        seq: parse_seq(name.to_string_lossy().as_ref()).unwrap_or(0),
                        path: destination,
                        size,
                    });
                }
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(error).context("requeue audit segment"),
            }
        }
        restored.sort_by_key(|segment| segment.seq);
        for segment in restored {
            state.segments.push_front(segment);
        }
        state
            .segments
            .make_contiguous()
            .sort_by_key(|segment| segment.seq);
        Ok(())
    }

    fn rotate(&self, state: &mut RingState) -> Result<()> {
        state.current_seq += 1;
        state.current_size = 0;
        let path = self.segment_path(state.current_seq);
        fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .with_context(|| format!("create audit segment {}", path.display()))?;
        state.segments.push_back(Segment {
            seq: state.current_seq,
            path,
            size: 0,
        });
        Ok(())
    }

    fn segment_path(&self, seq: u64) -> PathBuf {
        self.segments_dir.join(format!("audit-{seq:010}.jsonl"))
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, RingState> {
        self.state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

fn parse_seq(name: &str) -> Option<u64> {
    let stem = name.strip_prefix("audit-")?.strip_suffix(".jsonl")?;
    stem.parse().ok()
}

fn remove_file(path: &Path) -> Result<()> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error).with_context(|| format!("remove {}", path.display())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use uuid::Uuid;

    fn event(decision: &str) -> AuditEventEnvelope {
        AuditEventEnvelope {
            event_id: Uuid::new_v4(),
            occurred_at: Utc::now(),
            decision: decision.into(),
            tool: Some("read_file".into()),
            latency_ms: Some(0.8),
            payload_hash: None,
            prev_hash: None,
            entry_hash: None,
        }
    }

    #[test]
    fn batches_are_shipped_once_and_acked() {
        let dir = tempfile::tempdir().unwrap();
        let ring = AuditRing::open(dir.path(), DEFAULT_MAX_BYTES).unwrap();
        for _ in 0..5 {
            assert!(ring.append(&event("allow")).unwrap());
        }

        let batch = ring.take_batch(1_000_000).unwrap();
        assert_eq!(batch.events.len(), 5);
        // Inflight files are invisible to a second batch.
        let second = ring.take_batch(1_000_000).unwrap();
        assert!(second.events.is_empty());

        ring.ack(&batch).unwrap();
        assert_eq!(ring.total_bytes(), 0);
    }

    #[test]
    fn failed_send_is_requeued_and_replayed() {
        let dir = tempfile::tempdir().unwrap();
        let ring = AuditRing::open(dir.path(), DEFAULT_MAX_BYTES).unwrap();
        for _ in 0..3 {
            ring.append(&event("deny")).unwrap();
        }

        let batch = ring.take_batch(1_000_000).unwrap();
        assert_eq!(batch.events.len(), 3);
        ring.requeue(&batch).unwrap();

        let replay = ring.take_batch(1_000_000).unwrap();
        assert_eq!(replay.events.len(), 3);
        ring.ack(&replay).unwrap();
    }

    #[test]
    fn disk_cap_is_never_exceeded() {
        let dir = tempfile::tempdir().unwrap();
        let cap = 8 * 1024;
        let ring = AuditRing::open(dir.path(), cap).unwrap();

        for _ in 0..500 {
            ring.append(&event("allow")).unwrap();
        }

        assert!(
            ring.total_bytes() <= cap,
            "ring grew to {} bytes with a {} byte cap",
            ring.total_bytes(),
            cap
        );
        assert!(!ring.is_empty(), "ring should retain the newest events");
    }

    #[test]
    fn inflight_segments_are_recovered_after_crash() {
        let dir = tempfile::tempdir().unwrap();
        {
            let ring = AuditRing::open(dir.path(), DEFAULT_MAX_BYTES).unwrap();
            ring.append(&event("allow")).unwrap();
            let _batch = ring.take_batch(1_000_000).unwrap();
            // Simulate a crash before ack: `_batch` is dropped, files stay in
            // inflight/.
        }

        let ring = AuditRing::open(dir.path(), DEFAULT_MAX_BYTES).unwrap();
        let batch = ring.take_batch(1_000_000).unwrap();
        assert_eq!(batch.events.len(), 1);
    }
}
