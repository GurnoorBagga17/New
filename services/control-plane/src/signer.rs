// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
//! Ed25519 signing for policy bundles.
//!
//! Persistence here is deliberately simple (a PKCS#8 file under the control
//! plane data directory) so the MVP is runnable without KMS. Production must
//! replace this with a managed key (KMS/HSM/OpenBao transit) and keep only the
//! public key in the control plane configuration.

use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use axiom_agent_protocol::{policy_signing_payload, PolicyBundle};
use ring::rand::SystemRandom;
use ring::signature::{Ed25519KeyPair, KeyPair};

pub struct PolicySigner {
    key: Ed25519KeyPair,
    public_key_hex: String,
    key_path: PathBuf,
}

impl PolicySigner {
    /// Load a PKCS#8 Ed25519 key, or create one on first boot.
    ///
    /// The generated key is written with `0600` permissions on Unix. This is a
    /// developer/MVP convenience, not a production key-management story.
    pub fn load_or_create(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref().to_path_buf();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .with_context(|| format!("create signing key directory {}", parent.display()))?;
        }

        let pkcs8 = if path.exists() {
            fs::read(&path).with_context(|| format!("read signing key {}", path.display()))?
        } else {
            let rng = SystemRandom::new();
            let generated = Ed25519KeyPair::generate_pkcs8(&rng)
                .map_err(|_| anyhow::anyhow!("OS RNG failed while generating signing key"))?;
            fs::write(&path, generated.as_ref())
                .with_context(|| format!("persist signing key {}", path.display()))?;
            restrict_permissions(&path)?;
            generated.as_ref().to_vec()
        };

        let key = Ed25519KeyPair::from_pkcs8(&pkcs8)
            .map_err(|_| anyhow::anyhow!("invalid Ed25519 PKCS#8 signing key"))?;
        let public_key_hex = hex::encode(key.public_key().as_ref());

        Ok(Self {
            key,
            public_key_hex,
            key_path: path,
        })
    }

    pub fn public_key_hex(&self) -> &str {
        &self.public_key_hex
    }

    pub fn key_path(&self) -> &Path {
        &self.key_path
    }

    /// Sign the canonical payload and write the hex signature into the bundle.
    pub fn sign_bundle(&self, bundle: &mut PolicyBundle) {
        let payload = policy_signing_payload(bundle);
        bundle.signature = hex::encode(self.key.sign(&payload).as_ref());
    }
}

#[cfg(unix)]
fn restrict_permissions(path: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let mut permissions = fs::metadata(path)?.permissions();
    permissions.set_mode(0o600);
    fs::set_permissions(path, permissions)?;
    Ok(())
}

#[cfg(not(unix))]
fn restrict_permissions(_path: &Path) -> Result<()> {
    // Windows ACL hardening is handled by the deployment/secret manager.
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axiom_agent_protocol::sha256_hex;
    use chrono::Utc;
    use ring::signature::{UnparsedPublicKey, ED25519};
    use uuid::Uuid;

    #[test]
    fn signatures_verify_with_public_key() {
        let dir = tempfile::tempdir().unwrap();
        let signer = PolicySigner::load_or_create(dir.path().join("key.pk8")).unwrap();
        let mut bundle = PolicyBundle {
            bundle_id: Uuid::new_v4(),
            tenant_id: "tenant-a".into(),
            version: 1,
            sha256: sha256_hex("permit(principal, action, resource);"),
            cedar_source: "permit(principal, action, resource);".into(),
            signature: String::new(),
            issued_at: Utc::now(),
        };

        signer.sign_bundle(&mut bundle);
        assert!(!bundle.signature.is_empty());

        let public_key = hex::decode(signer.public_key_hex()).unwrap();
        let signature = hex::decode(&bundle.signature).unwrap();
        UnparsedPublicKey::new(&ED25519, public_key)
            .verify(&policy_signing_payload(&bundle), &signature)
            .expect("signature must verify");
    }

    #[test]
    fn keys_survive_reload() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("key.pk8");
        let first = PolicySigner::load_or_create(&path).unwrap();
        let second = PolicySigner::load_or_create(&path).unwrap();
        assert_eq!(first.public_key_hex(), second.public_key_hex());
    }
}
