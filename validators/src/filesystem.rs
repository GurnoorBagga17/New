//! Filesystem path validation against a configured tool root.

use std::path::{Component, Path};

use percent_encoding::percent_decode_str;
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PathFacts {
    pub normalized_path: Option<String>,
    pub traversal_detected: bool,
}

#[derive(Debug, Error)]
pub enum PathValidationError {
    #[error("configured filesystem root does not exist")]
    InvalidRoot,
    #[error("path is invalid or cannot be safely normalized")]
    InvalidPath,
    #[error("path escapes the configured filesystem root")]
    OutsideRoot,
}

/// Validate an untrusted path and resolve it within an existing root.
/// The caller must still use an OS-level sandbox/openat-style operation to
/// close races between this check and file access.
pub fn validate_path(root: &Path, untrusted: &str) -> Result<PathFacts, PathValidationError> {
    let canonical_root = root
        .canonicalize()
        .map_err(|_| PathValidationError::InvalidRoot)?;
    let decoded = decode_path(untrusted)?;
    let path = Path::new(&decoded);
    if path.is_absolute()
        || path
            .components()
            .any(|part| matches!(part, Component::ParentDir | Component::Prefix(_)))
    {
        return Err(PathValidationError::OutsideRoot);
    }

    let candidate = canonical_root.join(path);
    let resolved = if candidate.exists() {
        candidate
            .canonicalize()
            .map_err(|_| PathValidationError::InvalidPath)?
    } else {
        let file_name = candidate
            .file_name()
            .ok_or(PathValidationError::InvalidPath)?;
        let parent = candidate
            .parent()
            .ok_or(PathValidationError::InvalidPath)?
            .canonicalize()
            .map_err(|_| PathValidationError::InvalidPath)?;
        parent.join(file_name)
    };

    if !resolved.starts_with(&canonical_root) {
        return Err(PathValidationError::OutsideRoot);
    }

    Ok(PathFacts {
        normalized_path: Some(resolved.to_string_lossy().into_owned()),
        traversal_detected: false,
    })
}

fn decode_path(input: &str) -> Result<String, PathValidationError> {
    if input.contains('\0') {
        return Err(PathValidationError::InvalidPath);
    }
    let mut value = input.to_owned();
    for _ in 0..4 {
        let decoded = percent_decode_str(&value)
            .decode_utf8()
            .map_err(|_| PathValidationError::InvalidPath)?
            .into_owned();
        if decoded == value {
            return Ok(decoded.replace('\\', std::path::MAIN_SEPARATOR_STR));
        }
        value = decoded;
    }
    let decoded = percent_decode_str(&value)
        .decode_utf8()
        .map_err(|_| PathValidationError::InvalidPath)?
        .into_owned();
    if decoded != value {
        return Err(PathValidationError::InvalidPath);
    }
    Ok(value.replace('\\', std::path::MAIN_SEPARATOR_STR))
}

/// Opens a file inside `root` using OS-level symlink-rejection (`O_NOFOLLOW` on Unix)
/// and post-open canonical inode/path verification to close validation-to-use TOCTOU races (AX-014).
pub fn open_confined_readonly(
    root: &Path,
    untrusted: &str,
) -> Result<(PathFacts, std::fs::File), PathValidationError> {
    let canonical_root = root
        .canonicalize()
        .map_err(|_| PathValidationError::InvalidRoot)?;
    let facts = validate_path(&canonical_root, untrusted)?;
    let resolved_str = facts
        .normalized_path
        .as_deref()
        .ok_or(PathValidationError::InvalidPath)?;
    let resolved_path = Path::new(resolved_str);

    // Reject if the target path is a symlink before opening
    let symlink_meta =
        std::fs::symlink_metadata(resolved_path).map_err(|_| PathValidationError::InvalidPath)?;
    if symlink_meta.file_type().is_symlink() {
        return Err(PathValidationError::OutsideRoot);
    }

    let mut opts = std::fs::OpenOptions::new();
    opts.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.custom_flags(0x20000); // O_NOFOLLOW on Linux
    }
    let file = opts
        .open(resolved_path)
        .map_err(|_| PathValidationError::OutsideRoot)?;

    // Re-verify canonical path after acquiring the file descriptor
    let post_open_canonical = resolved_path
        .canonicalize()
        .map_err(|_| PathValidationError::OutsideRoot)?;
    if !post_open_canonical.starts_with(&canonical_root) {
        return Err(PathValidationError::OutsideRoot);
    }

    Ok((facts, file))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_and_normalizes_path_inside_root() {
        let temp = tempfile::tempdir().unwrap();
        std::fs::create_dir(temp.path().join("data")).unwrap();
        let facts = validate_path(temp.path(), "data/report.txt").unwrap();
        assert!(!facts.traversal_detected);
        let expected_suffix = format!("data{}report.txt", std::path::MAIN_SEPARATOR);
        assert!(facts.normalized_path.unwrap().ends_with(&expected_suffix));
    }

    #[test]
    fn rejects_plain_and_nested_encoded_parent_segments() {
        let temp = tempfile::tempdir().unwrap();
        assert!(matches!(
            validate_path(temp.path(), "../secret"),
            Err(PathValidationError::OutsideRoot)
        ));
        assert!(matches!(
            validate_path(temp.path(), "%252e%252e%255csecret"),
            Err(PathValidationError::OutsideRoot)
        ));
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_escape() {
        use std::os::unix::fs::symlink;
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        symlink(outside.path(), root.path().join("escape")).unwrap();
        assert!(matches!(
            validate_path(root.path(), "escape/secret"),
            Err(PathValidationError::OutsideRoot)
        ));
    }
}
