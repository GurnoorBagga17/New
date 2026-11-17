// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
//! Control-plane binary bootstrap.
//!
//! Environment:
//! - `AXIOM_CONTROL_PLANE_BIND`     (default `127.0.0.1:8090`)
//! - `AXIOM_CONTROL_PLANE_ADMIN_TOKEN` (required; vendor-internal admin bearer)
//! - `AXIOM_DATA_DIR`               (default `./data`; holds the signing key)
//! - `AXIOM_ENROLLMENT_TTL_SECONDS` (default `900`)
//! - `AXIOM_AGENT_OFFLINE_AFTER_SECONDS` (default `45`)
//! - `RUST_LOG`                     (default `info`)

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result};
use axiom_control_plane::{signer::PolicySigner, store::Store, AppState};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info,tower_http=warn")),
        )
        .init();

    let bind: SocketAddr = std::env::var("AXIOM_CONTROL_PLANE_BIND")
        .unwrap_or_else(|_| "127.0.0.1:8090".to_string())
        .parse()
        .context("AXIOM_CONTROL_PLANE_BIND must be a socket address")?;

    let admin_token = std::env::var("AXIOM_CONTROL_PLANE_ADMIN_TOKEN")
        .context("AXIOM_CONTROL_PLANE_ADMIN_TOKEN must be set")?;
    if admin_token.len() < 24 {
        anyhow::bail!("AXIOM_CONTROL_PLANE_ADMIN_TOKEN must be at least 24 characters");
    }

    let data_dir = std::env::var("AXIOM_DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("./data"));
    let enrollment_ttl_seconds = env_u64("AXIOM_ENROLLMENT_TTL_SECONDS", 900);
    let offline_after_seconds = env_u64("AXIOM_AGENT_OFFLINE_AFTER_SECONDS", 45);

    let signer = PolicySigner::load_or_create(data_dir.join("policy-signing-key.pk8"))
        .context("initialise policy signing key")?;
    tracing::info!(
        public_key = signer.public_key_hex(),
        key_path = %signer.key_path().display(),
        "policy signing key ready"
    );

    let state = AppState::new(
        Arc::new(Store::new()),
        Arc::new(signer),
        admin_token,
        Duration::from_secs(enrollment_ttl_seconds),
        chrono::Duration::seconds(offline_after_seconds as i64),
    );
    state.clone().spawn_offline_reaper();

    let app = axiom_control_plane::router(state);

    let listener = tokio::net::TcpListener::bind(bind)
        .await
        .with_context(|| format!("bind control plane to {bind}"))?;

    tracing::info!(%bind, "axiom control plane listening");

    axum::serve(listener, app)
        .await
        .context("control plane server failed")?;

    Ok(())
}

fn env_u64(key: &str, default: u64) -> u64 {
    std::env::var(key)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(default)
}
