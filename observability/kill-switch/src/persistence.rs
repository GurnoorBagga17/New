// Copyright 2024 Axiom NHI — Licensed under Apache-2.0
//! Snapshot persistence for restart survival.
//!
//! Phase 1 keeps revocation state in memory and writes the whole snapshot to a
//! single JSON file. This is deliberately not a database: it is a small,
//! reviewable recovery mechanism, not history or reporting.
//!
//! # Write strategy
//!
//! The snapshot is written to a sibling temporary file, flushed, synced, and
//! renamed over the target. On Unix the temporary file is created `0600`. On
//! Windows `std::fs::rename` does not replace an existing file, so the target is
//! removed immediately before the rename; that window is documented rather than
//! hidden. In both cases a crash can lose the last update, but a torn or
//! partially written snapshot must not be loaded — [`load_snapshot`] validates
//! before returning.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::model::RevocationSnapshot;
use crate::RevocationError;

/// Save a snapshot to `path` using a temporary file and rename.
pub fn save_snapshot(
    path: impl AsRef<Path>,
    snapshot: &RevocationSnapshot,
) -> Result<(), RevocationError> {
    snapshot.validate()?;
    let path = path.as_ref();
    let temporary = temporary_path(path);

    let serialized = serde_json::to_vec_pretty(snapshot)
        .map_err(|error| RevocationError::Persistence(format!("serialize snapshot: {error}")))?;

    write_temporary(&temporary, &serialized)?;

    if let Err(first_error) = fs::rename(&temporary, path) {
        // Windows cannot rename over an existing file. Remove and retry once;
        // report the original error if removal also fails.
        let removal = fs::remove_file(path);
        let second = fs::rename(&temporary, path);
        if let Err(second_error) = second {
            let _ = fs::remove_file(&temporary);
            let detail = match removal {
                Ok(()) => format!("rename snapshot: {second_error}"),
                Err(remove_error) => {
                    format!("rename snapshot: {second_error}; remove target: {remove_error}")
                }
            };
            return Err(RevocationError::Persistence(detail));
        }
        tracing::debug!(
            error = %first_error,
            path = %path.display(),
            "snapshot rename required a remove-then-rename fallback"
        );
    }

    Ok(())
}

/// Load and validate a snapshot.
///
/// Returns [`RevocationError::Persistence`] when the file is missing or
/// unreadable, and [`RevocationError::InvalidSnapshot`] when the contents do
/// not validate.
pub fn load_snapshot(path: impl AsRef<Path>) -> Result<RevocationSnapshot, RevocationError> {
    let path = path.as_ref();
    let bytes = fs::read(path).map_err(|error| {
        RevocationError::Persistence(format!("read {}: {error}", path.display()))
    })?;
    let snapshot: RevocationSnapshot = serde_json::from_slice(&bytes).map_err(|error| {
        RevocationError::Persistence(format!("parse {}: {error}", path.display()))
    })?;
    snapshot.validate()?;
    Ok(snapshot)
}

fn temporary_path(path: &Path) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let mut name = path
        .file_name()
        .map(|name| name.to_os_string())
        .unwrap_or_default();
    name.push(format!(".tmp-{}-{nanos}", std::process::id()));
    path.with_file_name(name)
}

fn write_temporary(path: &Path, bytes: &[u8]) -> Result<(), RevocationError> {
    let mut options = OpenOptions::new();
    options.create(true).write(true).truncate(true);

    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }

    let mut file = options.open(path).map_err(|error| {
        RevocationError::Persistence(format!("create {}: {error}", path.display()))
    })?;
    file.write_all(bytes)
        .and_then(|_| file.write_all(b"\n"))
        .and_then(|_| file.sync_all())
        .map_err(|error| {
            let _ = fs::remove_file(path);
            RevocationError::Persistence(format!("write {}: {error}", path.display()))
        })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{RevocationTarget, RevocationTargetKind};

    fn temp_path() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!(
            "axiom-kill-switch-snapshot-{}-{nanos}.json",
            std::process::id()
        ))
    }

    fn populated_snapshot() -> RevocationSnapshot {
        let mut snapshot = RevocationSnapshot::empty("epoch-test", 1_700_000_000_000);
        snapshot.version = 3;
        let agent = RevocationTarget::agent("agent-a").unwrap();
        snapshot.entries.insert(
            agent.canonical_key(),
            agent.to_state(true, 2, 1_699_999_999_000, "compromised credential"),
        );
        let tool = RevocationTarget::tool("server/a", "tool b").unwrap();
        snapshot.entries.insert(
            tool.canonical_key(),
            tool.to_state(true, 3, 1_699_999_999_500, "unsafe tool"),
        );
        snapshot
    }

    #[test]
    fn save_and_load_roundtrip() {
        let path = temp_path();
        let snapshot = populated_snapshot();
        save_snapshot(&path, &snapshot).unwrap();

        let loaded = load_snapshot(&path).unwrap();
        assert_eq!(loaded, snapshot);
        assert_eq!(loaded.epoch, "epoch-test");
        assert_eq!(loaded.version, 3);
        assert_eq!(loaded.entry_count(), 2);

        let _ = fs::remove_file(path);
    }

    #[test]
    fn save_rejects_invalid_snapshot() {
        let path = temp_path();
        let mut snapshot = RevocationSnapshot::empty("epoch-test", 0);
        snapshot.version = 1;
        let agent = RevocationTarget::agent("agent-a").unwrap();
        snapshot
            .entries
            .insert("wrong-key".to_string(), agent.to_state(true, 1, 0, "x"));
        assert!(matches!(
            save_snapshot(&path, &snapshot),
            Err(RevocationError::InvalidSnapshot(_))
        ));
        assert!(!path.exists());
    }

    #[test]
    fn load_missing_file_is_a_persistence_error() {
        let path = temp_path();
        assert!(matches!(
            load_snapshot(&path),
            Err(RevocationError::Persistence(_))
        ));
    }

    #[test]
    fn load_corrupt_file_is_a_persistence_error() {
        let path = temp_path();
        fs::write(&path, b"{not json").unwrap();
        assert!(matches!(
            load_snapshot(&path),
            Err(RevocationError::Persistence(_))
        ));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn load_rejects_snapshot_with_wrong_entry_key() {
        let path = temp_path();
        let target = RevocationTarget::agent("agent-a").unwrap();
        let mut snapshot = RevocationSnapshot::empty("epoch-test", 0);
        snapshot.version = 1;
        snapshot
            .entries
            .insert("wrong-key".to_string(), target.to_state(true, 1, 0, "x"));
        fs::write(&path, serde_json::to_vec(&snapshot).unwrap()).unwrap();

        assert!(matches!(
            load_snapshot(&path),
            Err(RevocationError::InvalidSnapshot(_))
        ));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn tool_target_survives_serialization() {
        let snapshot = populated_snapshot();
        let path = temp_path();
        save_snapshot(&path, &snapshot).unwrap();
        let loaded = load_snapshot(&path).unwrap();

        let tool_key = crate::model::tool_key("server/a", "tool b");
        let entry = loaded.get(&tool_key).unwrap();
        assert_eq!(entry.target_kind, RevocationTargetKind::Tool);
        assert_eq!(entry.target_id, "server%2Fa/tool b");

        let _ = fs::remove_file(path);
    }
}
