// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
//! On-disk, last-known-good agent state.
//!
//! The control plane is allowed to be unavailable. What is not allowed is
//! silently enforcing nothing. This cache is the offline contract:
//!
//! - `policy.json` holds the last **signature-verified** bundle.
//! - `policy.cedar` is the same policy in the form the runtime consumes.
//! - `revocations.json` and `kill-switch.json` mirror the emergency state.
//! - `fail-closed.json` is written as soon as policy state is missing or older
//!   than the configured freshness window. The local runtime treats that
//!   marker as *deny*, not *allow*.
//!
//! Every write is atomic (temp file + rename) so a crash mid-write can never
//! leave a half-parsed policy on disk.

use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};
use axiom_agent_protocol::{policy_signing_payload, sha256_hex, PolicyBundle, RevocationState};
use chrono::{DateTime, Utc};
use ring::signature::{UnparsedPublicKey, ED25519};
use serde::{Deserialize, Serialize};

pub const POLICY_FILE: &str = "policy.json";
pub const POLICY_SOURCE_FILE: &str = "policy.cedar";
pub const REVOCATIONS_FILE: &str = "revocations.json";
pub const KILL_SWITCH_FILE: &str = "kill-switch.json";
pub const FAIL_CLOSED_FILE: &str = "fail-closed.json";
pub const IDENTITY_FILE: &str = "agent.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentIdentity {
    pub agent_id: uuid::Uuid,
    pub tenant_id: String,
    pub agent_secret: String,
    pub public_key: String,
    pub control_plane_url: String,
    pub heartbeat_interval_seconds: u64,
    pub enrolled_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredPolicy {
    pub received_at: DateTime<Utc>,
    pub bundle: PolicyBundle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredKillSwitch {
    pub scope: String,
    pub reason: String,
    pub issued_at: DateTime<Utc>,
    pub received_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FailClosedMarker {
    pub reason: String,
    pub since: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PolicyFreshness {
    /// Policy verified and within the freshness window.
    Fresh,
    /// Policy exists but is older than the allowed offline window.
    Stale,
    /// No policy has ever been received.
    Missing,
}

pub struct AgentCache {
    dir: PathBuf,
    public_key: Vec<u8>,
}

impl AgentCache {
    pub fn new(dir: impl AsRef<Path>, public_key_hex: &str) -> Result<Self> {
        let dir = dir.as_ref().to_path_buf();
        fs::create_dir_all(&dir)
            .with_context(|| format!("create agent config dir {}", dir.display()))?;
        let public_key = hex::decode(public_key_hex)
            .context("AXIOM_CONTROL_PLANE_PUBLIC_KEY is not valid hex")?;
        Ok(Self { dir, public_key })
    }

    #[allow(dead_code)]
    pub fn dir(&self) -> &Path {
        &self.dir
    }

    pub fn identity_path(&self) -> PathBuf {
        self.dir.join(IDENTITY_FILE)
    }

    #[allow(dead_code)]
    pub fn load_identity(&self) -> Result<Option<AgentIdentity>> {
        read_json(&self.identity_path())
    }

    pub fn store_identity(&self, identity: &AgentIdentity) -> Result<()> {
        atomic_write_json(&self.identity_path(), identity)
    }

    /// Verify and persist a policy bundle. Nothing is written unless both the
    /// content hash and the Ed25519 signature validate.
    pub fn apply_policy(&self, bundle: &PolicyBundle) -> Result<()> {
        self.verify_policy(bundle)?;

        let stored = StoredPolicy {
            received_at: Utc::now(),
            bundle: bundle.clone(),
        };
        atomic_write_json(&self.dir.join(POLICY_FILE), &stored)?;
        atomic_write(
            &self.dir.join(POLICY_SOURCE_FILE),
            bundle.cedar_source.as_bytes(),
        )?;

        // A verified policy is authoritative: any previous fail-closed marker
        // is now obsolete.
        self.clear_fail_closed()?;
        Ok(())
    }

    pub fn verify_policy(&self, bundle: &PolicyBundle) -> Result<()> {
        if sha256_hex(&bundle.cedar_source) != bundle.sha256 {
            bail!("policy bundle content hash does not match its sha256 field");
        }
        let signature =
            hex::decode(&bundle.signature).context("policy signature is not valid hex")?;
        UnparsedPublicKey::new(&ED25519, &self.public_key)
            .verify(&policy_signing_payload(bundle), &signature)
            .map_err(|_| anyhow::anyhow!("policy signature does not verify against pinned key"))?;
        Ok(())
    }

    pub fn load_policy(&self) -> Result<Option<StoredPolicy>> {
        read_json(&self.dir.join(POLICY_FILE))
    }

    pub fn freshness(&self, max_age: chrono::Duration) -> Result<PolicyFreshness> {
        match self.load_policy()? {
            None => Ok(PolicyFreshness::Missing),
            Some(stored) if Utc::now() - stored.received_at > max_age => Ok(PolicyFreshness::Stale),
            Some(_) => Ok(PolicyFreshness::Fresh),
        }
    }

    pub fn apply_revocations(&self, state: &RevocationState) -> Result<()> {
        atomic_write_json(&self.dir.join(REVOCATIONS_FILE), state)
    }

    #[allow(dead_code)]
    pub fn load_revocations(&self) -> Result<RevocationState> {
        Ok(read_json(&self.dir.join(REVOCATIONS_FILE))?.unwrap_or_default())
    }

    pub fn apply_kill_switch(
        &self,
        scope: &str,
        reason: &str,
        issued_at: DateTime<Utc>,
    ) -> Result<()> {
        atomic_write_json(
            &self.dir.join(KILL_SWITCH_FILE),
            &StoredKillSwitch {
                scope: scope.to_string(),
                reason: reason.to_string(),
                issued_at,
                received_at: Utc::now(),
            },
        )
    }

    #[allow(dead_code)]
    pub fn kill_switch(&self) -> Result<Option<StoredKillSwitch>> {
        read_json(&self.dir.join(KILL_SWITCH_FILE))
    }

    /// Evaluate freshness and persist/clear the marker. Returns the state that
    /// the local runtime must observe.
    pub fn refresh_fail_closed(&self, max_age: chrono::Duration) -> Result<PolicyFreshness> {
        let freshness = self.freshness(max_age)?;
        match freshness {
            PolicyFreshness::Fresh => self.clear_fail_closed()?,
            PolicyFreshness::Stale => self.set_fail_closed(&format!(
                "policy older than {}s offline window",
                max_age.num_seconds()
            ))?,
            PolicyFreshness::Missing => self.set_fail_closed("no signed policy available")?,
        }
        Ok(freshness)
    }

    pub fn set_fail_closed(&self, reason: &str) -> Result<()> {
        let path = self.dir.join(FAIL_CLOSED_FILE);
        if path.exists() {
            return Ok(());
        }
        atomic_write_json(
            &path,
            &FailClosedMarker {
                reason: reason.to_string(),
                since: Utc::now(),
            },
        )
    }

    pub fn clear_fail_closed(&self) -> Result<()> {
        let path = self.dir.join(FAIL_CLOSED_FILE);
        if path.exists() {
            fs::remove_file(&path)
                .with_context(|| format!("remove fail-closed marker {}", path.display()))?;
        }
        Ok(())
    }

    pub fn fail_closed(&self) -> Result<Option<FailClosedMarker>> {
        read_json(&self.dir.join(FAIL_CLOSED_FILE))
    }
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<Option<T>> {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .with_context(|| format!("parse {}", path.display()))
            .map(Some),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error).with_context(|| format!("read {}", path.display())),
    }
}

fn atomic_write_json<T: Serialize>(path: &Path, value: &T) -> Result<()> {
    let bytes = serde_json::to_vec_pretty(value).context("encode agent state")?;
    atomic_write(path, &bytes)
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes).with_context(|| format!("write {}", tmp.display()))?;
    fs::rename(&tmp, path).with_context(|| format!("replace {}", path.display()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axiom_agent_protocol::sha256_hex;
    use ring::rand::SystemRandom;
    use ring::signature::{Ed25519KeyPair, KeyPair};
    use uuid::Uuid;

    struct Signed {
        cache_dir: tempfile::TempDir,
        public_key: String,
        bundle: PolicyBundle,
    }

    fn signed_bundle(version: u64) -> Signed {
        let dir = tempfile::tempdir().unwrap();
        let rng = SystemRandom::new();
        let pkcs8 = Ed25519KeyPair::generate_pkcs8(&rng).unwrap();
        let key = Ed25519KeyPair::from_pkcs8(pkcs8.as_ref()).unwrap();
        let source = format!(
            "permit(principal, action, resource) when {{ resource.version == {version} }};"
        );
        let mut bundle = PolicyBundle {
            bundle_id: Uuid::new_v4(),
            tenant_id: "tenant-a".into(),
            version,
            sha256: sha256_hex(&source),
            cedar_source: source,
            signature: String::new(),
            issued_at: Utc::now(),
        };
        bundle.signature = hex::encode(key.sign(&policy_signing_payload(&bundle)).as_ref());
        Signed {
            cache_dir: dir,
            public_key: hex::encode(key.public_key().as_ref()),
            bundle,
        }
    }

    #[test]
    fn verified_policy_is_written_and_marked_fresh() {
        let signed = signed_bundle(1);
        let cache = AgentCache::new(signed.cache_dir.path(), &signed.public_key).unwrap();
        cache.set_fail_closed("no signed policy available").unwrap();

        cache.apply_policy(&signed.bundle).unwrap();

        let stored = cache.load_policy().unwrap().unwrap();
        assert_eq!(stored.bundle.version, 1);
        assert!(cache.dir().join(POLICY_SOURCE_FILE).exists());
        assert!(cache.fail_closed().unwrap().is_none());
        assert_eq!(
            cache.freshness(chrono::Duration::seconds(60)).unwrap(),
            PolicyFreshness::Fresh
        );
    }

    #[test]
    fn tampered_policy_is_rejected_and_nothing_is_written() {
        let signed = signed_bundle(1);
        let cache = AgentCache::new(signed.cache_dir.path(), &signed.public_key).unwrap();

        let mut tampered = signed.bundle.clone();
        tampered.cedar_source = "permit(principal, action, resource);".into();

        assert!(cache.apply_policy(&tampered).is_err());
        assert!(cache.load_policy().unwrap().is_none());
    }

    #[test]
    fn policy_signed_by_another_key_is_rejected() {
        let signed = signed_bundle(1);
        let other = signed_bundle(1);
        let cache = AgentCache::new(signed.cache_dir.path(), &other.public_key).unwrap();
        assert!(cache.apply_policy(&signed.bundle).is_err());
    }

    #[test]
    fn stale_policy_sets_fail_closed_marker() {
        let signed = signed_bundle(1);
        let cache = AgentCache::new(signed.cache_dir.path(), &signed.public_key).unwrap();
        cache.apply_policy(&signed.bundle).unwrap();

        // Rewrite the receive time into the past to simulate a long outage.
        let mut stored = cache.load_policy().unwrap().unwrap();
        stored.received_at = Utc::now() - chrono::Duration::seconds(3600);
        atomic_write_json(&cache.dir().join(POLICY_FILE), &stored).unwrap();

        let state = cache
            .refresh_fail_closed(chrono::Duration::seconds(60))
            .unwrap();
        assert_eq!(state, PolicyFreshness::Stale);
        assert!(cache.fail_closed().unwrap().is_some());

        // A fresh bundle clears the marker again.
        cache.apply_policy(&signed.bundle).unwrap();
        assert!(cache.fail_closed().unwrap().is_none());
    }

    #[test]
    fn kill_switch_persists_across_restart() {
        let signed = signed_bundle(1);
        let dir = signed.cache_dir.path().to_path_buf();
        let key = signed.public_key.clone();
        let issued = Utc::now();
        {
            let cache = AgentCache::new(&dir, &key).unwrap();
            cache
                .apply_kill_switch("global", "incident-42", issued)
                .unwrap();
        }
        let cache = AgentCache::new(&dir, &key).unwrap();
        let stored = cache.kill_switch().unwrap().unwrap();
        assert_eq!(stored.scope, "global");
        assert_eq!(stored.reason, "incident-42");
    }
}
