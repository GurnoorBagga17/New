// Copyright 2026 Axiom NHI - Licensed under Apache-2.0
//! End-to-end control-plane test: enroll -> channel -> signed policy -> ack.
//!
//! This is the vertical slice the design-partner demo depends on. It uses a
//! real TCP listener and a real WebSocket client; nothing is mocked.

use std::sync::Arc;
use std::time::Duration;

use axiom_agent_protocol::{
    policy_signing_payload, AgentMessage, AgentStatus, ControlMessage, PolicyBundle,
    PROTOCOL_VERSION,
};
use axiom_control_plane::{router, signer::PolicySigner, store::Store, AppState};
use futures_util::{SinkExt, StreamExt};
use ring::signature::{UnparsedPublicKey, ED25519};
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::net::TcpListener;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::header::AUTHORIZATION;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{connect_async, MaybeTlsStream, WebSocketStream};
use uuid::Uuid;

struct Harness {
    base: String,
    admin_token: String,
    state: AppState,
    _dir: tempfile::TempDir,
}

#[derive(Debug, Deserialize)]
struct EnrollOut {
    agent_id: Uuid,
    tenant_id: String,
    agent_secret: String,
    public_key: String,
    policy: Option<PolicyBundle>,
}

async fn start() -> Harness {
    let dir = tempfile::tempdir().unwrap();
    let signer = PolicySigner::load_or_create(dir.path().join("signing.pk8")).unwrap();
    let admin_token = "test-admin-token-at-least-24-chars".to_string();
    let state = AppState::new(
        Arc::new(Store::new()),
        Arc::new(signer),
        admin_token.clone(),
        Duration::from_secs(900),
        chrono::Duration::seconds(45),
    );

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let app = router(state.clone());
    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    Harness {
        base: format!("http://{addr}"),
        admin_token,
        state,
        _dir: dir,
    }
}

async fn mint_token(harness: &Harness) -> String {
    let response: Value = reqwest::Client::new()
        .post(format!("{}/v1/admin/enrollments", harness.base))
        .bearer_auth(&harness.admin_token)
        .json(&json!({ "tenant_id": "tenant-a", "created_by": "test" }))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    response["enrollment_token"].as_str().unwrap().to_string()
}

async fn enroll(harness: &Harness, token: &str) -> EnrollOut {
    reqwest::Client::new()
        .post(format!("{}/v1/agents/enroll", harness.base))
        .json(&json!({
            "enrollment_token": token,
            "agent_name": "agent-a",
            "environment": "test",
            "agent_version": "0.1.0",
        }))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap()
}

type Ws = WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>;

async fn connect_channel(base: &str, agent_id: Uuid, secret: &str) -> Ws {
    let ws_url = base.replacen("http://", "ws://", 1) + "/v1/agents/channel";
    let mut request = ws_url.into_client_request().unwrap();
    request
        .headers_mut()
        .insert("x-axiom-agent-id", agent_id.to_string().parse().unwrap());
    request
        .headers_mut()
        .insert(AUTHORIZATION, format!("Bearer {secret}").parse().unwrap());
    let (socket, _) = connect_async(request).await.unwrap();
    socket
}

async fn send(socket: &mut Ws, message: &AgentMessage) {
    socket
        .send(Message::Text(
            serde_json::to_string(message).unwrap().into(),
        ))
        .await
        .unwrap();
}

async fn next_control(socket: &mut Ws) -> ControlMessage {
    loop {
        let message = tokio::time::timeout(Duration::from_secs(5), socket.next())
            .await
            .expect("timed out waiting for control message")
            .expect("channel ended")
            .expect("websocket error");
        match message {
            Message::Text(text) => {
                return serde_json::from_str(text.as_ref()).expect("decode control message");
            }
            Message::Ping(payload) => {
                socket.send(Message::Pong(payload)).await.unwrap();
            }
            other => panic!("unexpected frame: {other:?}"),
        }
    }
}

#[tokio::test]
async fn enroll_channel_policy_ack_and_kill_switch() {
    let harness = start().await;
    let token = mint_token(&harness).await;

    let enrolled = enroll(&harness, &token).await;
    assert_eq!(enrolled.tenant_id, "tenant-a");
    assert!(enrolled.policy.is_none());

    let mut socket =
        connect_channel(&harness.base, enrolled.agent_id, &enrolled.agent_secret).await;
    send(
        &mut socket,
        &AgentMessage::Hello {
            protocol_version: PROTOCOL_VERSION,
            agent_id: enrolled.agent_id,
            agent_version: "0.1.0".into(),
            labels: Default::default(),
        },
    )
    .await;

    assert!(matches!(
        next_control(&mut socket).await,
        ControlMessage::HelloAck { .. }
    ));

    // Admin publishes the first signed policy bundle.
    let publish: Value = reqwest::Client::new()
        .post(format!("{}/v1/admin/policies", harness.base))
        .bearer_auth(&harness.admin_token)
        .json(&json!({
            "tenant_id": "tenant-a",
            "cedar_source": "permit(principal, action, resource);",
            "created_by": "test",
        }))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(publish["delivered_agents"], 1);

    let bundle = match next_control(&mut socket).await {
        ControlMessage::Policy(bundle) => bundle,
        other => panic!("expected policy, got {other:?}"),
    };
    assert_eq!(bundle.version, 1);
    assert_eq!(bundle.tenant_id, "tenant-a");

    let public_key = hex::decode(&enrolled.public_key).unwrap();
    let signature = hex::decode(&bundle.signature).unwrap();
    UnparsedPublicKey::new(&ED25519, public_key)
        .verify(&policy_signing_payload(&bundle), &signature)
        .expect("agent must be able to verify the bundle with its pinned key");

    send(
        &mut socket,
        &AgentMessage::PolicyAck {
            seq: 1,
            version: bundle.version,
            applied: true,
            error: None,
        },
    )
    .await;

    send(
        &mut socket,
        &AgentMessage::Heartbeat {
            seq: 2,
            sent_at: chrono::Utc::now(),
            policy_version: bundle.version,
            decisions_total: 42,
            denies_total: 3,
        },
    )
    .await;

    let mut attempts = 0;
    while harness.state.store.policy_ack(enrolled.agent_id).is_none() {
        tokio::time::sleep(Duration::from_millis(25)).await;
        attempts += 1;
        assert!(attempts < 100, "agent ack was never recorded");
    }
    let (version, applied, error, _) = harness.state.store.policy_ack(enrolled.agent_id).unwrap();
    assert_eq!(version, 1);
    assert!(applied);
    assert!(error.is_none());

    let mut attempts = 0;
    while harness
        .state
        .store
        .agent(enrolled.agent_id)
        .unwrap()
        .decisions_total
        != 42
    {
        tokio::time::sleep(Duration::from_millis(25)).await;
        attempts += 1;
        assert!(attempts < 100, "heartbeat was never applied");
    }
    assert_eq!(
        harness.state.store.agent(enrolled.agent_id).unwrap().status,
        AgentStatus::Online
    );

    // Emergency kill switch reaches the connected agent.
    let kill: Value = reqwest::Client::new()
        .post(format!("{}/v1/admin/kill-switch", harness.base))
        .bearer_auth(&harness.admin_token)
        .json(&json!({ "scope": "tenant:tenant-a", "reason": "test incident" }))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(kill["delivered_agents"], 1);

    match next_control(&mut socket).await {
        ControlMessage::KillSwitch { scope, reason, .. } => {
            assert_eq!(scope, "tenant:tenant-a");
            assert_eq!(reason, "test incident");
        }
        other => panic!("expected kill switch, got {other:?}"),
    }

    send(
        &mut socket,
        &AgentMessage::KillSwitchAck {
            seq: 3,
            received_at: chrono::Utc::now(),
        },
    )
    .await;

    // Ghost agents disappear from the fleet view when the socket drops.
    drop(socket);
    let mut attempts = 0;
    while harness.state.store.agent(enrolled.agent_id).unwrap().status != AgentStatus::Offline {
        tokio::time::sleep(Duration::from_millis(25)).await;
        attempts += 1;
        assert!(attempts < 100, "agent was never marked offline");
    }
}

#[tokio::test]
async fn enrollment_tokens_are_single_use_and_admin_auth_is_required() {
    let harness = start().await;

    // No admin token: token minting must fail.
    let unauthorized = reqwest::Client::new()
        .post(format!("{}/v1/admin/enrollments", harness.base))
        .json(&json!({ "tenant_id": "tenant-a" }))
        .send()
        .await
        .unwrap();
    assert_eq!(unauthorized.status(), reqwest::StatusCode::UNAUTHORIZED);

    let token = mint_token(&harness).await;
    enroll(&harness, &token).await;

    let reuse = reqwest::Client::new()
        .post(format!("{}/v1/agents/enroll", harness.base))
        .json(&json!({
            "enrollment_token": token,
            "agent_name": "agent-b",
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(reuse.status(), reqwest::StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn channel_rejects_a_bad_agent_secret() {
    let harness = start().await;
    let token = mint_token(&harness).await;
    let enrolled = enroll(&harness, &token).await;

    let ws_url = harness.base.replacen("http://", "ws://", 1) + "/v1/agents/channel";
    let mut request = ws_url.into_client_request().unwrap();
    request.headers_mut().insert(
        "x-axiom-agent-id",
        enrolled.agent_id.to_string().parse().unwrap(),
    );
    request
        .headers_mut()
        .insert(AUTHORIZATION, "Bearer not-the-real-secret".parse().unwrap());

    match connect_async(request).await {
        Err(tokio_tungstenite::tungstenite::Error::Http(response)) => {
            assert_eq!(response.status(), 401);
        }
        other => panic!("expected HTTP 401, got {other:?}"),
    }
}
