// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
//! Agent channel: outbound-initiated WebSocket carrying the control protocol.
//!
//! Wire format is JSON over WebSocket on TLS 443. That is intentional: strict
//! corporate egress proxies routinely block raw gRPC with non-standard ALPN,
//! while `wss://` on 443 looks like ordinary browser traffic (the same reason
//! `cloudflared` and Teleport use it). The domain envelope is transport
//! agnostic, so gRPC/gRPC-Web can replace this later without a protocol change.
//!
//! Lifecycle: authenticate -> Hello -> HelloAck + current policy/revocations ->
//! steady state (heartbeats, audit, acks) -> disconnect marks the agent offline.

use std::time::Duration;

use axiom_agent_protocol::{
    AgentMessage, ControlMessage, DEFAULT_HEARTBEAT_SECONDS, PROTOCOL_VERSION,
};
use axum::{
    extract::{
        ws::{Message, WebSocket},
        State,
    },
    http::HeaderMap,
    response::{IntoResponse, Response},
};
use futures_util::{SinkExt, StreamExt};
use tokio::{sync::mpsc, time::timeout};
use uuid::Uuid;

use crate::{authenticate_channel, upgrade, AppState, ChannelAuth};

const HELLO_TIMEOUT: Duration = Duration::from_secs(10);
const SEND_TIMEOUT: Duration = Duration::from_secs(10);

pub async fn agent_channel(
    State(state): State<AppState>,
    headers: HeaderMap,
    ws: axum::extract::ws::WebSocketUpgrade,
) -> Response {
    match authenticate_channel(&state, &headers) {
        Ok(auth) => upgrade(state, ws, auth),
        Err(error) => error.into_response(),
    }
}

pub(crate) async fn handle_socket(state: AppState, socket: WebSocket, auth: ChannelAuth) {
    let (mut sink, mut stream) = socket.split();
    let agent_id = auth.agent_id;
    let tenant_id = auth.tenant_id.clone();

    // The agent must identify itself before we announce state. A socket that
    // connects and stays silent is dropped rather than holding resources.
    let hello = match timeout(HELLO_TIMEOUT, stream.next()).await {
        Ok(Some(Ok(Message::Text(text)))) => match serde_json::from_str::<AgentMessage>(&text) {
            Ok(AgentMessage::Hello {
                protocol_version,
                agent_id: claimed,
                ..
            }) if claimed == agent_id && protocol_version == PROTOCOL_VERSION => true,
            Ok(AgentMessage::Hello {
                protocol_version, ..
            }) => {
                tracing::warn!(
                    %agent_id,
                    protocol_version,
                    "agent protocol version mismatch"
                );
                false
            }
            _ => false,
        },
        _ => false,
    };

    if !hello {
        let _ = sink
            .send(Message::Close(Some(axum::extract::ws::CloseFrame {
                code: 1008,
                reason: "expected Hello with matching protocol version".into(),
            })))
            .await;
        return;
    }

    // Register before sending the snapshot so a policy published during
    // handshake cannot be lost between the snapshot and the steady state.
    let (tx, mut rx) = mpsc::unbounded_channel::<ControlMessage>();
    state.register_connection(agent_id, tx);
    state.store.mark_online(agent_id);

    tracing::info!(%agent_id, %tenant_id, "agent channel connected");

    if let Some(policy) = state.store.latest_policy(&tenant_id) {
        if send_control(&mut sink, &ControlMessage::Policy(policy)).await.is_err() {
            state.unregister_connection(agent_id);
            state.store.mark_offline(agent_id);
            return;
        }
    }

    let revocations = state.store.revocations(&tenant_id);
    if revocations.version > 0
        && send_control(&mut sink, &ControlMessage::Revocations { state: revocations })
            .await
            .is_err()
    {
        state.unregister_connection(agent_id);
        state.store.mark_offline(agent_id);
        return;
    }

    if let Some(kill) = state.store.kill_switch() {
        let applies = kill.scope == "global"
            || kill.scope == format!("tenant:{tenant_id}")
            || kill.scope == tenant_id;
        if applies {
            let message = ControlMessage::KillSwitch {
                scope: kill.scope,
                reason: kill.reason,
                issued_at: kill.issued_at,
            };
            if send_control(&mut sink, &message).await.is_err() {
                state.unregister_connection(agent_id);
                state.store.mark_offline(agent_id);
                return;
            }
        }
    }

    let hello_ack = ControlMessage::HelloAck {
        protocol_version: PROTOCOL_VERSION,
        server_time: chrono::Utc::now(),
        heartbeat_interval_seconds: DEFAULT_HEARTBEAT_SECONDS,
    };
    if send_control(&mut sink, &hello_ack).await.is_err() {
        state.unregister_connection(agent_id);
        state.store.mark_offline(agent_id);
        return;
    }

    loop {
        tokio::select! {
            outbound = rx.recv() => {
                match outbound {
                    Some(message) => {
                        if send_control(&mut sink, &message).await.is_err() {
                            break;
                        }
                    }
                    None => break,
                }
            }
            incoming = stream.next() => {
                match incoming {
                    Some(Ok(Message::Text(text))) => {
                        if !handle_agent_message(&state, agent_id, &tenant_id, &text) {
                            let _ = sink
                                .send(Message::Close(Some(axum::extract::ws::CloseFrame {
                                    code: 1008,
                                    reason: "agent revoked or protocol violation".into(),
                                })))
                                .await;
                            break;
                        }
                    }
                    Some(Ok(Message::Ping(payload))) => {
                        if sink.send(Message::Pong(payload)).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Pong(_))) => {}
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(Message::Binary(_))) => {
                        tracing::warn!(%agent_id, "binary frame rejected on JSON channel");
                        break;
                    }
                    Some(Err(error)) => {
                        tracing::debug!(%agent_id, %error, "agent socket error");
                        break;
                    }
                }
            }
        }
    }

    state.unregister_connection(agent_id);
    state.store.mark_offline(agent_id);
    tracing::info!(%agent_id, %tenant_id, "agent channel disconnected");
}

/// Returns `false` when the channel must be closed.
fn handle_agent_message(state: &AppState, agent_id: Uuid, tenant_id: &str, text: &str) -> bool {
    let message: AgentMessage = match serde_json::from_str(text) {
        Ok(message) => message,
        Err(error) => {
            tracing::warn!(%agent_id, %error, "dropping malformed agent frame");
            return true;
        }
    };

    match message {
        AgentMessage::Heartbeat {
            seq,
            sent_at,
            policy_version,
            decisions_total,
            denies_total,
        } => {
            if !state.store.record_heartbeat(
                agent_id,
                seq,
                sent_at,
                policy_version,
                decisions_total,
                denies_total,
            ) {
                // Duplicate sequence (replay) or revoked agent.
                return state
                    .store
                    .agent(agent_id)
                    .map(|agent| agent.status != axiom_agent_protocol::AgentStatus::Revoked)
                    .unwrap_or(false);
            }
            true
        }
        AgentMessage::PolicyAck {
            seq,
            version,
            applied,
            error,
        } => {
            if !state.store.accept_sequence(agent_id, seq) {
                return true;
            }
            tracing::info!(%agent_id, version, applied, "policy acknowledged");
            state
                .store
                .record_policy_ack(agent_id, version, applied, error);
            true
        }
        AgentMessage::AuditBatch { seq, events } => {
            if !state.store.accept_sequence(agent_id, seq) {
                return true;
            }
            let accepted = state.store.record_audit(tenant_id, agent_id, events);
            tracing::debug!(%agent_id, accepted, "audit batch ingested");
            true
        }
        AgentMessage::KillSwitchAck { seq, received_at } => {
            if !state.store.accept_sequence(agent_id, seq) {
                return true;
            }
            tracing::warn!(%agent_id, %received_at, "kill switch acknowledged");
            true
        }
        AgentMessage::Hello { .. } => true,
    }
}

async fn send_control(
    sink: &mut futures_util::stream::SplitSink<WebSocket, Message>,
    message: &ControlMessage,
) -> Result<(), ()> {
    let encoded = serde_json::to_string(message).map_err(|_| ())?;
    timeout(SEND_TIMEOUT, sink.send(Message::Text(encoded)))
        .await
        .map_err(|_| ())?
        .map_err(|_| ())
}
