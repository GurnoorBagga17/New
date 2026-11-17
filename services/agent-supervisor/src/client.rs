// Copyright 2026 Axiom NHI - Licensed under Apache-2.0
//! Outbound-only control-plane client.
//!
//! Every request in this module is initiated by the agent. There is no
//! listener, no inbound port, and no callback URL — the supervisor only ever
//! dials `https://` or `wss://` on 443.

use std::collections::BTreeMap;
use std::time::Duration;

use anyhow::{bail, Context, Result};
use axiom_agent_protocol::{PolicyBundle, RevocationState};
use serde::{Deserialize, Serialize};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::header::{HeaderValue, AUTHORIZATION};
use tokio_tungstenite::tungstenite::http::Request;
use tokio_tungstenite::{connect_async, MaybeTlsStream, WebSocketStream};
use uuid::Uuid;

use crate::cache::AgentIdentity;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Clone)]
pub struct ControlPlaneClient {
    base_url: String,
    http: reqwest::Client,
}

#[derive(Debug, Serialize)]
struct EnrollRequest<'a> {
    enrollment_token: &'a str,
    agent_name: &'a str,
    environment: &'a str,
    agent_version: &'a str,
    labels: BTreeMap<String, String>,
}

#[derive(Debug, Deserialize)]
pub struct EnrollResponse {
    pub protocol_version: u32,
    pub agent_id: Uuid,
    pub tenant_id: String,
    pub agent_secret: String,
    pub heartbeat_interval_seconds: u64,
    pub public_key: String,
    pub policy: Option<PolicyBundle>,
    pub revocations: RevocationState,
}

impl ControlPlaneClient {
    pub fn new(base_url: &str) -> Result<Self> {
        let base_url = base_url.trim().trim_end_matches('/').to_string();
        if !base_url.starts_with("https://") && !base_url.starts_with("http://") {
            bail!("AXIOM_CONTROL_PLANE_URL must start with https:// (or http:// for local demos)");
        }
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .user_agent(concat!("axiom-agent-supervisor/", env!("CARGO_PKG_VERSION")))
            .build()
            .context("build control-plane HTTP client")?;
        Ok(Self { base_url, http })
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    pub async fn enroll(
        &self,
        token: &str,
        agent_name: &str,
        environment: &str,
        agent_version: &str,
        labels: BTreeMap<String, String>,
    ) -> Result<EnrollResponse> {
        let response = self
            .http
            .post(format!("{}/v1/agents/enroll", self.base_url))
            .json(&EnrollRequest {
                enrollment_token: token,
                agent_name,
                environment,
                agent_version,
                labels,
            })
            .send()
            .await
            .context("enrollment request failed")?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            bail!("enrollment rejected ({status}): {body}");
        }

        response.json().await.context("decode enrollment response")
    }

    /// Connect the outbound channel. Credentials travel in headers, never in
    /// the URL, so they do not leak into proxy logs.
    pub async fn connect(
        &self,
        identity: &AgentIdentity,
    ) -> Result<WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>> {
        let mut request: Request<()> = self
            .channel_url()
            .into_client_request()
            .context("build WebSocket upgrade request")?;

        request.headers_mut().insert(
            "x-axiom-agent-id",
            HeaderValue::from_str(&identity.agent_id.to_string())
                .context("agent id is not a valid header value")?,
        );
        request.headers_mut().insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", identity.agent_secret))
                .context("agent secret is not a valid header value")?,
        );

        let (socket, response) = tokio::time::timeout(CONNECT_TIMEOUT, connect_async(request))
            .await
            .context("timed out connecting to control plane")?
            .context("WebSocket upgrade failed")?;

        tracing::debug!(status = %response.status(), "control-plane channel upgraded");
        Ok(socket)
    }

    pub fn channel_url(&self) -> String {
        let base = self
            .base_url
            .replacen("https://", "wss://", 1)
            .replacen("http://", "ws://", 1);
        format!("{base}/v1/agents/channel")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn channel_url_preserves_scheme_security() {
        let secure = ControlPlaneClient::new("https://control.example.com/").unwrap();
        assert_eq!(
            secure.channel_url(),
            "wss://control.example.com/v1/agents/channel"
        );

        let local = ControlPlaneClient::new("http://127.0.0.1:8090").unwrap();
        assert_eq!(
            local.channel_url(),
            "ws://127.0.0.1:8090/v1/agents/channel"
        );
    }

    #[test]
    fn non_http_scheme_is_rejected() {
        assert!(ControlPlaneClient::new("ftp://control.example.com").is_err());
    }
}
