//! Policy API — snapshot lifecycle management and in-process admin interface.
//!
//! This crate provides:
//! - [`PolicyLoader`]: loads `.cedar` policy files from disk
//! - [`SnapshotManager`]: manages live and candidate snapshots
//! - [`PolicyApiServer`]: typed in-process admin API (future gRPC wrapper)
//!
//! # What this crate does NOT do
//! - Does not expose a network server (gRPC wiring is deferred pending Team 0
//!   protocol freeze — open decision D7)
//! - Does not parse SQL, verify JWTs, or emit audit logs
//! - Does not modify Cedar policies directly — that is an operator action
//!
//! DRAFT: Wire integration depends on Team 0 contract and protocol freeze.

use std::{
    path::{Path, PathBuf},
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use extmcp_cedar::{load_snapshot, PolicySnapshot, PolicySnapshotStore, SnapshotError};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tracing::{debug, info, warn};

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/// Errors from the policy loading and management layer.
#[derive(Debug, Error)]
pub enum LoadError {
    /// A required file could not be read from disk.
    #[error("I/O error reading '{path}': {source}")]
    Io {
        path: String,
        source: std::io::Error,
    },
    /// No `.cedar` policy files were found in the policy directory.
    #[error("no .cedar files found in directory '{0}'")]
    NoPolicyFiles(String),
    /// The Cedar snapshot failed to load or validate.
    #[error("snapshot error: {0}")]
    Snapshot(#[from] SnapshotError),
}

/// Errors from the policy API layer.
#[derive(Debug, Error)]
pub enum ApiError {
    /// The underlying load or snapshot operation failed.
    #[error("load error: {0}")]
    Load(#[from] LoadError),
    /// The in-process API is not yet connected to a live store.
    #[error("no snapshot store available")]
    NoStore,
}

// ---------------------------------------------------------------------------
// PolicyVersionInfo — public API type
// ---------------------------------------------------------------------------

/// Information about the currently-active policy snapshot.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PolicyVersionInfo {
    /// SHA-256 version of the active policy bundle.
    pub version: String,
    /// Unix timestamp (seconds) when the snapshot was loaded.
    pub loaded_at_unix: i64,
    /// Number of Cedar policies in the snapshot.
    pub policy_count: usize,
}

// ---------------------------------------------------------------------------
// ValidationReport — returned from dry-run validation
// ---------------------------------------------------------------------------

/// Result of a dry-run policy validation (candidate, not installed).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationReport {
    /// Whether the candidate policy bundle is valid.
    pub valid: bool,
    /// Validation errors, if any.
    pub errors: Vec<String>,
    /// The version the bundle would have if installed.
    pub version_would_be: String,
}

// ---------------------------------------------------------------------------
// PolicyLoader
// ---------------------------------------------------------------------------

/// Loads Cedar policy files from a directory and a schema from a file path.
///
/// All files with the `.cedar` extension in `policy_dir` are read and combined.
/// Files are sorted by name for deterministic bundle ordering.
pub struct PolicyLoader {
    /// Directory containing `.cedar` policy files.
    policy_dir: PathBuf,
    /// Path to the `.cedarschema` file.
    schema_path: PathBuf,
}

impl PolicyLoader {
    /// Create a new [`PolicyLoader`].
    pub fn new(policy_dir: impl Into<PathBuf>, schema_path: impl Into<PathBuf>) -> Self {
        Self {
            policy_dir: policy_dir.into(),
            schema_path: schema_path.into(),
        }
    }

    /// Read all `.cedar` files and the schema, then produce a validated snapshot.
    pub fn load(&self) -> Result<PolicySnapshot, LoadError> {
        let schema_src = self.read_file(&self.schema_path)?;

        // Collect and sort .cedar files for determinism
        let mut cedar_files: Vec<PathBuf> = std::fs::read_dir(&self.policy_dir)
            .map_err(|e| LoadError::Io {
                path: self.policy_dir.display().to_string(),
                source: e,
            })?
            .filter_map(|entry| {
                let entry = entry.ok()?;
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) == Some("cedar") {
                    Some(path)
                } else {
                    None
                }
            })
            .collect();

        cedar_files.sort();

        if cedar_files.is_empty() {
            return Err(LoadError::NoPolicyFiles(
                self.policy_dir.display().to_string(),
            ));
        }

        debug!(
            count = cedar_files.len(),
            dir = %self.policy_dir.display(),
            "loading cedar policy files"
        );

        let policy_strings: Vec<String> = cedar_files
            .iter()
            .map(|p| self.read_file(p))
            .collect::<Result<_, _>>()?;

        let policy_srcs: Vec<&str> = policy_strings.iter().map(|s| s.as_str()).collect();

        let snapshot = load_snapshot(&policy_srcs, &schema_src)?;
        info!(
            version = %snapshot.version,
            policy_count = snapshot.policy_count,
            "policy snapshot loaded from disk"
        );
        Ok(snapshot)
    }

    fn read_file(&self, path: &Path) -> Result<String, LoadError> {
        std::fs::read_to_string(path).map_err(|e| LoadError::Io {
            path: path.display().to_string(),
            source: e,
        })
    }
}

// ---------------------------------------------------------------------------
// SnapshotManager
// ---------------------------------------------------------------------------

/// Manages the live policy snapshot and supports atomic hot-reload.
pub struct SnapshotManager {
    store: Arc<PolicySnapshotStore>,
    loader: Arc<PolicyLoader>,
}

impl SnapshotManager {
    /// Create a new [`SnapshotManager`] with an already-loaded initial snapshot.
    pub fn new(store: Arc<PolicySnapshotStore>, loader: Arc<PolicyLoader>) -> Self {
        Self { store, loader }
    }

    /// Return information about the currently-active policy snapshot.
    pub fn current_version(&self) -> PolicyVersionInfo {
        let guard = self.store.load();
        let loaded_at_unix = guard.loaded_at_unix;

        PolicyVersionInfo {
            version: guard.version.clone(),
            policy_count: guard.policy_count,
            loaded_at_unix,
        }
    }

    /// Reload policy files from disk and atomically install the new snapshot.
    ///
    /// If loading fails, the existing live snapshot is unchanged and an error
    /// is returned. This preserves availability during bad deployments.
    pub fn reload(&self) -> Result<PolicyVersionInfo, LoadError> {
        let new_snapshot = self.loader.load()?;
        let new_version = new_snapshot.version.clone();
        let policy_count = new_snapshot.policy_count;
        self.store.swap(new_snapshot);
        info!(version = %new_version, "policy snapshot hot-reloaded");
        Ok(PolicyVersionInfo {
            version: new_version,
            policy_count,
            loaded_at_unix: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64,
        })
    }

    /// Validate a candidate policy bundle without installing it.
    ///
    /// Returns a [`ValidationReport`] describing whether the candidate is valid
    /// and what version it would have. Use this for dry-run checks before deploy.
    pub fn validate_candidate(
        &self,
        policy_sources: &[&str],
        schema_src: &str,
    ) -> ValidationReport {
        match load_snapshot(policy_sources, schema_src) {
            Ok(snap) => ValidationReport {
                valid: true,
                errors: vec![],
                version_would_be: snap.version,
            },
            Err(e) => {
                warn!("candidate policy validation failed: {e}");
                ValidationReport {
                    valid: false,
                    errors: vec![e.to_string()],
                    version_would_be: String::new(),
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// PolicyApiServer — in-process admin API
// ---------------------------------------------------------------------------

/// In-process admin interface for policy management.
///
/// # Wire integration
/// DRAFT: gRPC server wiring is deferred pending Team 0 protocol freeze.
/// A future `extmcp-grpc` crate will wrap this struct's methods.
/// See open decision D7.
pub struct PolicyApiServer {
    snapshot_manager: Arc<SnapshotManager>,
    // DRAFT: future gRPC server handle goes here
}

impl PolicyApiServer {
    /// Create a new [`PolicyApiServer`].
    pub fn new(snapshot_manager: Arc<SnapshotManager>) -> Self {
        Self { snapshot_manager }
    }

    /// Return information about the currently-active policy version.
    pub async fn get_active_version(&self) -> PolicyVersionInfo {
        self.snapshot_manager.current_version()
    }

    /// Trigger a hot-reload from the policy directory.
    ///
    /// Returns the new version on success. If loading fails, the live snapshot
    /// is unchanged and an `ApiError` is returned.
    pub async fn trigger_reload(&self) -> Result<PolicyVersionInfo, ApiError> {
        self.snapshot_manager.reload().map_err(ApiError::Load)
    }

    /// Validate a candidate policy bundle without installing it.
    ///
    /// This is safe to call at any time — it does not affect the live snapshot.
    pub async fn validate_policy_candidate(
        &self,
        sources: Vec<String>,
        schema: String,
    ) -> Result<ValidationReport, ApiError> {
        let source_refs: Vec<&str> = sources.iter().map(|s| s.as_str()).collect();
        Ok(self
            .snapshot_manager
            .validate_candidate(&source_refs, &schema))
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use extmcp_cedar::schema::{AXIOM_SCHEMA_SRC, DENY_DESTRUCTIVE_SQL, PERMIT_READONLY_SQL};
    use extmcp_cedar::{load_snapshot, PolicySnapshotStore};

    fn make_store() -> Arc<PolicySnapshotStore> {
        let snap = load_snapshot(&[PERMIT_READONLY_SQL], AXIOM_SCHEMA_SRC)
            .expect("test snapshot must load");
        Arc::new(PolicySnapshotStore::new(snap))
    }

    fn make_manager() -> (Arc<PolicySnapshotStore>, SnapshotManager) {
        let store = make_store();
        // We'll test reload by calling validate_candidate directly in some tests
        // and by swapping the store manually in hot-reload tests.
        let loader = Arc::new(PolicyLoader::new(
            std::env::temp_dir(), // won't be used in validate_candidate tests
            std::env::temp_dir().join("dummy.cedarschema"),
        ));
        (store.clone(), SnapshotManager { store, loader })
    }

    // --- validate_candidate tests ---

    #[tokio::test]
    async fn test_validate_candidate_valid_policy() {
        let (_store, manager) = make_manager();
        let report = manager.validate_candidate(&[PERMIT_READONLY_SQL], AXIOM_SCHEMA_SRC);
        assert!(
            report.valid,
            "valid policy must report valid: {:?}",
            report.errors
        );
        assert!(report.errors.is_empty());
        assert!(!report.version_would_be.is_empty());
    }

    #[tokio::test]
    async fn test_validate_candidate_invalid_cedar_syntax() {
        let (_, manager) = make_manager();
        let report = manager.validate_candidate(&["this is not cedar!!"], AXIOM_SCHEMA_SRC);
        assert!(!report.valid, "invalid syntax must report not valid");
        assert!(!report.errors.is_empty(), "errors must be reported");
        assert!(report.version_would_be.is_empty());
    }

    #[tokio::test]
    async fn test_validate_candidate_does_not_panic_on_bad_schema() {
        let (_, manager) = make_manager();
        // Should return ValidationReport with valid=false, not panic
        let report =
            manager.validate_candidate(&[PERMIT_READONLY_SQL], "{ this is not a cedar schema }");
        assert!(!report.valid);
        assert!(!report.errors.is_empty());
    }

    #[tokio::test]
    async fn test_validate_candidate_empty_bundle() {
        let (_, manager) = make_manager();
        let report = manager.validate_candidate(&[], AXIOM_SCHEMA_SRC);
        assert!(!report.valid);
        assert!(!report.errors.is_empty());
    }

    // --- PolicyApiServer tests ---

    #[tokio::test]
    async fn test_api_validate_policy_candidate_valid() {
        let (_store, manager) = make_manager();
        let server = PolicyApiServer::new(Arc::new(manager));

        let result = server
            .validate_policy_candidate(
                vec![PERMIT_READONLY_SQL.to_string()],
                AXIOM_SCHEMA_SRC.to_string(),
            )
            .await;

        assert!(result.is_ok());
        let report = result.unwrap();
        assert!(report.valid);
        assert!(report.errors.is_empty());
    }

    #[tokio::test]
    async fn test_api_validate_policy_candidate_invalid_does_not_panic() {
        let (_store, manager) = make_manager();
        let server = PolicyApiServer::new(Arc::new(manager));

        let result = server
            .validate_policy_candidate(
                vec!["THIS IS GARBAGE CEDAR".to_string()],
                AXIOM_SCHEMA_SRC.to_string(),
            )
            .await;

        assert!(result.is_ok()); // ApiError is not returned for validation failure
        let report = result.unwrap();
        assert!(!report.valid);
        assert!(!report.errors.is_empty());
    }

    #[tokio::test]
    async fn test_hot_reload_atomically_updates_version() {
        // Simulate a reload by swapping snapshots directly on the store
        let store = make_store();
        let v1 = store.current_version();

        let snap2 = load_snapshot(
            &[PERMIT_READONLY_SQL, DENY_DESTRUCTIVE_SQL],
            AXIOM_SCHEMA_SRC,
        )
        .expect("second snapshot must load");
        let v2 = snap2.version.clone();
        store.swap(snap2);

        assert_ne!(v1, v2, "version must change after swap");
        assert_eq!(
            store.current_version(),
            v2,
            "store must reflect new version"
        );
    }

    #[tokio::test]
    async fn test_get_active_version_returns_current() {
        let store = make_store();
        let v = store.current_version();
        let loader = Arc::new(PolicyLoader::new(
            std::env::temp_dir(),
            std::env::temp_dir().join("dummy.cedarschema"),
        ));
        let manager = Arc::new(SnapshotManager::new(store.clone(), loader));
        let server = PolicyApiServer::new(manager.clone());

        let info = server.get_active_version().await;
        assert_eq!(info.version, v);
        assert!(info.policy_count > 0);
    }
}
