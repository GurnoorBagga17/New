// Copyright 2026 Axiom NHI - Licensed under Apache-2.0
//! Axiom agent supervisor.
//!
//! Runs next to the customer's MCP traffic. It has exactly one outbound
//! dependency: the Axiom control plane over TLS 443. It owns:
//!
//! - enrollment and the agent identity file,
//! - the long-lived outbound channel (reconnect + backoff + jitter),
//! - verification and atomic caching of signed policy bundles,
//! - the offline fail-closed marker,
//! - a size-capped FIFO audit ring (`AXIOM_AUDIT_MAX_BYTES`, default 500 MB).
//!
//! It intentionally does **not** spawn `extmcp-runtime` yet: wiring the runtime
//! to consume `policy.cedar` / `kill-switch.json` / `fail-closed.json` is the
//! follow-up integration. This process proves the control loop end to end.

mod audit_ring;
mod cache;
mod client;

use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{bail, Context, Result};
use axiom_agent_protocol::{AgentMessage, ControlMessage, PROTOCOL_VERSION};
use cache::{AgentCache, AgentIdentity};
use chrono::Utc;
use client::ControlPlaneClient;
use futures_util::stream::SplitSink;
use futures_util::{SinkExt, StreamExt};
use tokio::net::TcpStream;
use tokio::time::{interval, sleep, timeout, MissedTickBehavior};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};

use crate::audit_ring::AuditRing;

const AUDIT_BATCH_BYTES: u64 = 512 * 1024;
const AUDIT_FLUSH_SECONDS: u64 = 15;
const SEND_TIMEOUT: Duration = Duration::from_secs(15);
const MAX_BACKOFF: Duration = Duration::from_secs(60);

type WsSink = SplitSink<WebSocketStream<MaybeTlsStream<TcpStream>>, Message>;

struct Config {
    control_plane_url: String,
    enrollment_token: Option<String>,
    agent_name: String,
    environment: String,
    agent_version: String,
    config_dir: PathBuf,
    audit_max_bytes: u64,
    offline_max_age: chrono::Duration,
    public_key_override: Option<String>,
    labels: BTreeMap<String, String>,
}

impl Config {
    fn from_env() -> Result<Self> {
        let control_plane_url = std::env::var("AXIOM_CONTROL_PLANE_URL").context(
            "AXIOM_CONTROL_PLANE_URL must be set (for example https://control.axiom.example)",
        )?;
        let config_dir = std::env::var("AXIOM_CONFIG_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("./axiom-agent"));

        Ok(Self {
            control_plane_url,
            enrollment_token: std::env::var("AXIOM_ENROLLMENT_TOKEN").ok(),
            agent_name: std::env::var("AXIOM_AGENT_NAME").unwrap_or_else(|_| hostname_fallback()),
            environment: std::env::var("AXIOM_AGENT_ENV").unwrap_or_else(|_| "production".into()),
            agent_version: std::env::var("AXIOM_AGENT_VERSION")
                .unwrap_or_else(|_| env!("CARGO_PKG_VERSION").to_string()),
            config_dir,
            audit_max_bytes: env_u64("AXIOM_AUDIT_MAX_BYTES", audit_ring::DEFAULT_MAX_BYTES),
            offline_max_age: chrono::Duration::seconds(
                env_u64("AXIOM_OFFLINE_MAX_AGE_SECONDS", 900) as i64,
            ),
            public_key_override: std::env::var("AXIOM_CONTROL_PLANE_PUBLIC_KEY")
                .ok()
                .filter(|value| !value.trim().is_empty()),
            labels: parse_labels(std::env::var("AXIOM_AGENT_LABELS").ok()),
        })
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let config = Config::from_env()?;
    if config.control_plane_url.starts_with("http://")
        && !is_loopback(&config.control_plane_url)
        && config.public_key_override.is_none()
    {
        tracing::warn!(
            "control plane URL uses plaintext HTTP and no public key is pinned; \
             this is only acceptable for local demos"
        );
    }

    run(config).await
}

async fn run(config: Config) -> Result<()> {
    let client = ControlPlaneClient::new(&config.control_plane_url)?;
    let (cache, identity) = bootstrap(&config, &client).await?;
    let cache = Arc::new(cache);

    let ring = Arc::new(AuditRing::open(
        config.config_dir.join("audit"),
        config.audit_max_bytes,
    )?);

    let freshness = cache.refresh_fail_closed(config.offline_max_age)?;
    tracing::info!(
        agent_id = %identity.agent_id,
        tenant_id = %identity.tenant_id,
        config_dir = %config.config_dir.display(),
        audit_max_bytes = config.audit_max_bytes,
        offline_max_age_seconds = config.offline_max_age.num_seconds(),
        ?freshness,
        fail_closed = cache.fail_closed()?.is_some(),
        "agent supervisor ready"
    );

    spawn_freshness_monitor(cache.clone(), config.offline_max_age);

    let mut backoff = Duration::from_secs(1);
    loop {
        match run_session(&client, &cache, &identity, &ring, &config).await {
            Ok(()) => {
                tracing::info!("control-plane channel closed");
                backoff = Duration::from_secs(1);
            }
            Err(error) => {
                tracing::warn!(error = %error, retry_in_ms = backoff.as_millis(), "channel failed");
            }
        }

        // Last-known-good policy keeps enforcing while we are disconnected.
        // The freshness monitor flips to fail-closed if this lasts too long.
        sleep(jitter(backoff)).await;
        backoff = (backoff * 2).min(MAX_BACKOFF);
    }
}

async fn bootstrap(
    config: &Config,
    client: &ControlPlaneClient,
) -> Result<(AgentCache, AgentIdentity)> {
    let identity_path = config.config_dir.join(cache::IDENTITY_FILE);

    if identity_path.exists() {
        let bytes = fs::read(&identity_path)
            .with_context(|| format!("read agent identity {}", identity_path.display()))?;
        let mut identity: AgentIdentity =
            serde_json::from_slice(&bytes).context("parse agent identity file")?;
        let public_key = config
            .public_key_override
            .clone()
            .unwrap_or_else(|| identity.public_key.clone());

        if let Some(pinned) = &config.public_key_override {
            if pinned != &identity.public_key {
                tracing::warn!(
                    "pinned control-plane key differs from the enrolled key; \
                     trusting the pinned key and refusing bundles signed by the old one"
                );
                identity.public_key = pinned.clone();
            }
        }

        let cache = AgentCache::new(&config.config_dir, &public_key)?;
        cache.store_identity(&identity)?;
        tracing::info!(agent_id = %identity.agent_id, "loaded existing agent identity");
        return Ok((cache, identity));
    }

    let token = config
        .enrollment_token
        .as_deref()
        .context("no agent identity found and AXIOM_ENROLLMENT_TOKEN is not set")?;

    tracing::info!(agent = %config.agent_name, "enrolling agent with control plane");
    let response = client
        .enroll(
            token,
            &config.agent_name,
            &config.environment,
            &config.agent_version,
            config.labels.clone(),
        )
        .await?;

    if response.protocol_version != PROTOCOL_VERSION {
        bail!(
            "control plane speaks protocol {}, agent speaks {}",
            response.protocol_version,
            PROTOCOL_VERSION
        );
    }

    let public_key = config
        .public_key_override
        .clone()
        .unwrap_or_else(|| response.public_key.clone());

    let identity = AgentIdentity {
        agent_id: response.agent_id,
        tenant_id: response.tenant_id,
        agent_secret: response.agent_secret,
        public_key,
        control_plane_url: config.control_plane_url.clone(),
        heartbeat_interval_seconds: response.heartbeat_interval_seconds,
        enrolled_at: Utc::now(),
    };

    let cache = AgentCache::new(&config.config_dir, &identity.public_key)?;
    cache.store_identity(&identity)?;

    if let Some(policy) = &response.policy {
        cache
            .apply_policy(policy)
            .context("apply policy delivered with enrollment")?;
        tracing::info!(version = policy.version, "initial policy installed");
    }
    cache.apply_revocations(&response.revocations)?;

    tracing::info!(
        agent_id = %identity.agent_id,
        tenant_id = %identity.tenant_id,
        config_dir = %config.config_dir.display(),
        "agent enrolled"
    );

    Ok((cache, identity))
}

async fn run_session(
    client: &ControlPlaneClient,
    cache: &AgentCache,
    identity: &AgentIdentity,
    ring: &AuditRing,
    config: &Config,
) -> Result<()> {
    let socket = client.connect(identity).await?;
    let (mut sink, mut stream) = socket.split();
    let mut seq = 0u64;
    let mut policy_version = cache
        .load_policy()?
        .map(|stored| stored.bundle.version)
        .unwrap_or(0);

    seq += 1;
    send(
        &mut sink,
        &AgentMessage::Hello {
            protocol_version: PROTOCOL_VERSION,
            agent_id: identity.agent_id,
            agent_version: config.agent_version.clone(),
            labels: config.labels.clone(),
        },
    )
    .await?;

    tracing::info!("channel established; waiting for control messages");

    let mut heartbeat = interval(Duration::from_secs(
        identity.heartbeat_interval_seconds.max(5),
    ));
    heartbeat.set_missed_tick_behavior(MissedTickBehavior::Delay);
    let mut audit = interval(Duration::from_secs(AUDIT_FLUSH_SECONDS));
    audit.set_missed_tick_behavior(MissedTickBehavior::Delay);

    loop {
        tokio::select! {
            _ = heartbeat.tick() => {
                seq += 1;
                let message = AgentMessage::Heartbeat {
                    seq,
                    sent_at: Utc::now(),
                    policy_version,
                    // Decision counters are populated once the runtime is
                    // wired in; the control plane treats absent data as idle,
                    // never as healthy-by-default.
                    decisions_total: 0,
                    denies_total: 0,
                };
                send(&mut sink, &message).await?;
            }
            _ = audit.tick() => {
                if let Err(error) = ring.ingest_spool(&config.config_dir.join("spool")) {
                    tracing::warn!(%error, "failed to ingest runtime audit spool");
                }
                drain_audit(ring, &mut sink, &mut seq).await?;
            }
            incoming = stream.next() => {
                match incoming {
                    Some(Ok(Message::Text(text))) => {
                        let message: ControlMessage = match serde_json::from_str(text.as_ref()) {
                            Ok(message) => message,
                            Err(error) => {
                                tracing::warn!(%error, "dropping malformed control frame");
                                continue;
                            }
                        };
                        match message {
                            ControlMessage::HelloAck { protocol_version, heartbeat_interval_seconds, server_time } => {
                                tracing::info!(
                                    protocol_version,
                                    heartbeat_interval_seconds,
                                    %server_time,
                                    "control plane acknowledged agent"
                                );
                            }
                            ControlMessage::Policy(bundle) => {
                                seq += 1;
                                let ack = match cache.apply_policy(&bundle) {
                                    Ok(()) => {
                                        policy_version = bundle.version;
                                        tracing::info!(
                                            version = bundle.version,
                                            "signed policy applied to local cache"
                                        );
                                        AgentMessage::PolicyAck { seq, version: bundle.version, applied: true, error: None }
                                    }
                                    Err(error) => {
                                        tracing::error!(
                                            version = bundle.version,
                                            %error,
                                            "policy rejected; keeping last-known-good"
                                        );
                                        AgentMessage::PolicyAck {
                                            seq,
                                            version: bundle.version,
                                            applied: false,
                                            error: Some(error.to_string()),
                                        }
                                    }
                                };
                                send(&mut sink, &ack).await?;
                            }
                            ControlMessage::Revocations { state } => {
                                cache.apply_revocations(&state)?;
                                tracing::warn!(
                                    version = state.version,
                                    global = state.global,
                                    servers = state.servers.len(),
                                    tools = state.tools.len(),
                                    "revocation snapshot applied"
                                );
                            }
                            ControlMessage::KillSwitch { scope, reason, issued_at } => {
                                cache.apply_kill_switch(&scope, &reason, issued_at)?;
                                tracing::error!(%scope, %reason, "KILL SWITCH received");
                                seq += 1;
                                send(&mut sink, &AgentMessage::KillSwitchAck {
                                    seq,
                                    received_at: Utc::now(),
                                }).await?;
                            }
                        }
                    }
                    Some(Ok(Message::Ping(payload))) => {
                        sink.send(Message::Pong(payload)).await.context("send pong")?;
                    }
                    Some(Ok(Message::Pong(_))) | Some(Ok(Message::Binary(_))) | Some(Ok(Message::Frame(_))) => {}
                    Some(Ok(Message::Close(frame))) => {
                        tracing::info!(?frame, "control plane closed the channel");
                        return Ok(());
                    }
                    Some(Err(error)) => {
                        return Err(error).context("agent channel stream error");
                    }
                    None => return Ok(()),
                }
            }
        }
    }
}

async fn drain_audit(ring: &AuditRing, sink: &mut WsSink, seq: &mut u64) -> Result<()> {
    if ring.is_empty() {
        return Ok(());
    }

    let batch = ring.take_batch(AUDIT_BATCH_BYTES)?;
    if batch.skipped_lines > 0 {
        tracing::warn!(
            skipped_lines = batch.skipped_lines,
            "skipped malformed local audit records"
        );
    }
    if batch.events.is_empty() {
        ring.ack(&batch)?;
        return Ok(());
    }

    *seq += 1;
    let message = AgentMessage::AuditBatch {
        seq: *seq,
        events: batch.events.clone(),
    };

    match send(sink, &message).await {
        Ok(()) => {
            tracing::debug!(events = batch.events.len(), "audit batch delivered");
            ring.ack(&batch)?;
            Ok(())
        }
        Err(error) => {
            // Put the segments back so they are retried on reconnect. The
            // control plane deduplicates on event_id if a send actually landed.
            ring.requeue(&batch)?;
            Err(error)
        }
    }
}

async fn send(sink: &mut WsSink, message: &AgentMessage) -> Result<()> {
    let encoded = serde_json::to_string(message).context("encode agent message")?;
    timeout(SEND_TIMEOUT, sink.send(Message::Text(encoded)))
        .await
        .context("timed out sending to control plane")?
        .context("send to control plane failed")
}

fn spawn_freshness_monitor(cache: Arc<AgentCache>, max_age: chrono::Duration) {
    tokio::spawn(async move {
        let mut ticker = interval(Duration::from_secs(10));
        ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);
        loop {
            ticker.tick().await;
            match cache.refresh_fail_closed(max_age) {
                Ok(cache::PolicyFreshness::Fresh) => {}
                Ok(state) => tracing::warn!(
                    ?state,
                    "policy state is not fresh; local runtime must fail closed"
                ),
                Err(error) => tracing::error!(%error, "failed to evaluate policy freshness"),
            }
        }
    });
}

fn parse_labels(raw: Option<String>) -> BTreeMap<String, String> {
    raw.unwrap_or_default()
        .split(',')
        .filter_map(|pair| {
            let (key, value) = pair.split_once('=')?;
            let key = key.trim();
            if key.is_empty() {
                return None;
            }
            Some((key.to_string(), value.trim().to_string()))
        })
        .collect()
}

fn hostname_fallback() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "axiom-agent".into())
}

fn is_loopback(url: &str) -> bool {
    url.contains("://127.0.0.1") || url.contains("://localhost") || url.contains("://[::1]")
}

fn env_u64(key: &str, default: u64) -> u64 {
    std::env::var(key)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(default)
}

/// Exponential backoff with +/-20% jitter so a control-plane restart does not
/// produce a synchronized reconnection storm from the whole fleet.
fn jitter(base: Duration) -> Duration {
    let mut byte = [0u8; 1];
    let extra = if getrandom::getrandom(&mut byte).is_ok() {
        base.mul_f64((byte[0] as f64 / 255.0) * 0.4)
    } else {
        Duration::ZERO
    };
    base.saturating_sub(base.mul_f64(0.2)) + extra
}
