// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
//! Axiom hybrid SaaS control plane.
//!
//! Responsibilities:
//! - Issue single-use, tenant-bound enrollment tokens (entitlement gated).
//! - Authenticate outbound agents and hold their long-lived channel.
//! - Sign and distribute policy bundles; record acknowledgements.
//! - Receive heartbeats and deduplicated audit batches.
//! - Broadcast kill-switch and revocation updates.
//!
//! The control plane **never dials an agent**. Every connection is initiated by
//! the customer-side supervisor, which is what makes the zero-inbound-port
//! posture possible.

pub mod channel;
pub mod signer;
pub mod store;

use std::collections::{BTreeMap, HashMap};
use std::sync::{Arc, Mutex};

use axiom_agent_protocol::{
    sha256_hex, ControlMessage, PolicyBundle, RevocationState, DEFAULT_HEARTBEAT_SECONDS,
    PROTOCOL_VERSION,
};
use axum::{
    extract::{ws::WebSocketUpgrade, Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{delete, get, post, put},
    Json, Router,
};
use chrono::{DateTime, Utc};
#[allow(deprecated)]
use ring::constant_time::verify_slices_are_equal;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tokio::sync::mpsc;
use tower_http::trace::TraceLayer;
use uuid::Uuid;

use crate::signer::PolicySigner;
use crate::store::{Store, StoreError, TenantEntitlement};

/// Transport-level state: credentials, entitlements and connected agents.
#[derive(Clone)]
pub struct AppState {
    pub store: Arc<Store>,
    pub signer: Arc<PolicySigner>,
    inner: Arc<StateInner>,
}

struct StateInner {
    admin_token: String,
    enrollment_ttl: std::time::Duration,
    offline_after: chrono::Duration,
    connections: Mutex<HashMap<Uuid, mpsc::UnboundedSender<ControlMessage>>>,
}

impl AppState {
    pub fn new(
        store: Arc<Store>,
        signer: Arc<PolicySigner>,
        admin_token: impl Into<String>,
        enrollment_ttl: std::time::Duration,
        offline_after: chrono::Duration,
    ) -> Self {
        Self {
            store,
            signer,
            inner: Arc::new(StateInner {
                admin_token: admin_token.into(),
                enrollment_ttl,
                offline_after,
                connections: Mutex::new(HashMap::new()),
            }),
        }
    }

    pub fn enrollment_ttl(&self) -> std::time::Duration {
        self.inner.enrollment_ttl
    }

    pub fn offline_after(&self) -> chrono::Duration {
        self.inner.offline_after
    }

    fn connections(
        &self,
    ) -> std::sync::MutexGuard<'_, HashMap<Uuid, mpsc::UnboundedSender<ControlMessage>>> {
        self.inner
            .connections
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub(crate) fn register_connection(
        &self,
        agent_id: Uuid,
        sender: mpsc::UnboundedSender<ControlMessage>,
    ) {
        self.connections().insert(agent_id, sender);
    }

    pub(crate) fn unregister_connection(&self, agent_id: Uuid) {
        self.connections().remove(&agent_id);
    }

    pub(crate) fn connected_count(&self) -> usize {
        self.connections().len()
    }

    /// Push a message to every connected agent in a tenant.
    pub fn push_to_tenant(&self, tenant_id: &str, message: ControlMessage) -> usize {
        let targets: Vec<(Uuid, mpsc::UnboundedSender<ControlMessage>)> = {
            let connections = self.connections();
            connections
                .iter()
                .filter_map(|(agent_id, sender)| {
                    self.store
                        .agent(*agent_id)
                        .filter(|agent| agent.tenant_id == tenant_id)
                        .map(|_| (*agent_id, sender.clone()))
                })
                .collect()
        };

        let mut delivered = 0;
        for (agent_id, sender) in targets {
            if sender.send(message.clone()).is_ok() {
                delivered += 1;
            } else {
                self.unregister_connection(agent_id);
            }
        }
        delivered
    }

    pub fn push_all(&self, message: ControlMessage) -> usize {
        let connections: Vec<_> = self
            .connections()
            .iter()
            .map(|(id, tx)| (*id, tx.clone()))
            .collect();
        let mut delivered = 0;
        for (agent_id, sender) in connections {
            if sender.send(message.clone()).is_ok() {
                delivered += 1;
            } else {
                self.unregister_connection(agent_id);
            }
        }
        delivered
    }

    /// Background task: mark agents offline when heartbeats stop arriving. The
    /// fleet view must not keep claiming an agent is healthy after its socket
    /// died silently.
    pub fn spawn_offline_reaper(self) {
        tokio::spawn(async move {
            let mut ticker = tokio::time::interval(std::time::Duration::from_secs(5));
            loop {
                ticker.tick().await;
                let reaped = self.store.reap_stale_agents(self.offline_after());
                for agent_id in reaped {
                    tracing::info!(%agent_id, "agent marked offline after heartbeat timeout");
                }
            }
        });
    }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[derive(Debug)]
pub enum ApiError {
    Unauthorized,
    NotFound(String),
    BadRequest(String),
    Forbidden(String),
    Conflict(String),
    Internal(String),
}

impl ApiError {
    fn status(&self) -> StatusCode {
        match self {
            Self::Unauthorized => StatusCode::UNAUTHORIZED,
            Self::NotFound(_) => StatusCode::NOT_FOUND,
            Self::BadRequest(_) => StatusCode::BAD_REQUEST,
            Self::Forbidden(_) => StatusCode::FORBIDDEN,
            Self::Conflict(_) => StatusCode::CONFLICT,
            Self::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn code(&self) -> &'static str {
        match self {
            Self::Unauthorized => "unauthorized",
            Self::NotFound(_) => "not_found",
            Self::BadRequest(_) => "bad_request",
            Self::Forbidden(_) => "forbidden",
            Self::Conflict(_) => "conflict",
            Self::Internal(_) => "internal",
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = self.status();
        let message = match &self {
            Self::Unauthorized => "unauthorized".to_string(),
            Self::NotFound(m)
            | Self::BadRequest(m)
            | Self::Forbidden(m)
            | Self::Conflict(m)
            | Self::Internal(m) => m.clone(),
        };
        if status.is_server_error() {
            tracing::error!(%status, %message, "control-plane request failed");
        }
        (
            status,
            Json(json!({ "error": message, "code": self.code() })),
        )
            .into_response()
    }
}

impl From<StoreError> for ApiError {
    fn from(error: StoreError) -> Self {
        match error {
            StoreError::InvalidToken | StoreError::ExpiredToken | StoreError::TokenAlreadyUsed => {
                Self::Unauthorized
            }
            StoreError::Unauthorized => Self::Unauthorized,
            StoreError::EntitlementDenied => {
                Self::Forbidden("tenant entitlement does not permit runtime enrollment".into())
            }
            StoreError::AgentLimitReached(limit) => Self::Conflict(format!(
                "agent limit reached for this plan ({limit}); upgrade to enroll another agent"
            )),
            StoreError::AgentNotFound | StoreError::TenantNotFound => {
                Self::NotFound("agent not found".into())
            }
        }
    }
}

type ApiResult<T> = Result<T, ApiError>;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

fn bearer(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(axum::http::header::AUTHORIZATION)?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
}

#[allow(deprecated)]
fn constant_time_eq(left: &str, right: &str) -> bool {
    verify_slices_are_equal(left.as_bytes(), right.as_bytes()).is_ok()
}

fn require_admin(state: &AppState, headers: &HeaderMap) -> ApiResult<()> {
    match bearer(headers) {
        Some(token) if constant_time_eq(token, &state.inner.admin_token) => Ok(()),
        _ => Err(ApiError::Unauthorized),
    }
}

// ---------------------------------------------------------------------------
// Request / response bodies
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct EnrollRequest {
    pub enrollment_token: String,
    pub agent_name: String,
    #[serde(default = "default_environment")]
    pub environment: String,
    #[serde(default)]
    pub agent_version: String,
    #[serde(default)]
    pub labels: BTreeMap<String, String>,
}

fn default_environment() -> String {
    "prod".into()
}

#[derive(Debug, Serialize)]
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

#[derive(Debug, Deserialize)]
pub struct CreateEnrollmentRequest {
    pub tenant_id: String,
    #[serde(default = "default_created_by")]
    pub created_by: String,
}

fn default_created_by() -> String {
    "console".into()
}

#[derive(Debug, Serialize)]
pub struct CreateEnrollmentResponse {
    pub enrollment_token: String,
    pub tenant_id: String,
    pub expires_at: DateTime<Utc>,
    pub max_agents: u32,
    pub install_command: String,
}

#[derive(Debug, Deserialize)]
pub struct PublishPolicyRequest {
    pub tenant_id: String,
    pub cedar_source: String,
    #[serde(default = "default_created_by")]
    pub created_by: String,
}

#[derive(Debug, Deserialize)]
pub struct KillSwitchRequest {
    #[serde(default = "default_scope")]
    pub scope: String,
    pub reason: String,
}

fn default_scope() -> String {
    "global".into()
}

#[derive(Debug, Deserialize)]
pub struct RevocationRequest {
    pub tenant_id: String,
    #[serde(default)]
    pub global: bool,
    #[serde(default)]
    pub servers: Vec<String>,
    #[serde(default)]
    pub tools: Vec<String>,
    #[serde(default)]
    pub agents: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct TenantQuery {
    pub tenant_id: String,
}

#[derive(Debug, Deserialize)]
pub struct AuditQuery {
    pub tenant_id: String,
    #[serde(default = "default_audit_limit")]
    pub limit: usize,
}

fn default_audit_limit() -> usize {
    100
}

#[derive(Debug, Deserialize)]
pub struct EntitlementRequest {
    pub tenant_id: String,
    pub runtime_enforcement: bool,
    #[serde(default = "default_agent_limit")]
    pub agents_limit: u32,
    #[serde(default = "default_billing_source")]
    pub billing_source: String,
}

fn default_agent_limit() -> u32 {
    3
}

fn default_billing_source() -> String {
    "manual".into()
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

pub fn router(state: AppState) -> Router {
    let admin = Router::new()
        .route("/v1/admin/enrollments", post(create_enrollment))
        .route("/v1/admin/agents", get(list_agents))
        .route("/v1/admin/agents/:agent_id", get(get_agent))
        .route("/v1/admin/agents/:agent_id/revoke", post(revoke_agent))
        .route(
            "/v1/admin/policies",
            get(list_policies).post(publish_policy),
        )
        .route("/v1/admin/kill-switch", post(trigger_kill_switch))
        .route("/v1/admin/kill-switch", delete(clear_kill_switch))
        .route("/v1/admin/revocations", put(update_revocations))
        .route("/v1/admin/audit", get(list_audit))
        .route(
            "/v1/admin/entitlements",
            get(list_entitlements).put(update_entitlement),
        )
        .with_state(state.clone());

    Router::new()
        .route("/healthz", get(healthz))
        .route("/v1/control-plane/public-key", get(public_key))
        .route("/v1/agents/enroll", post(enroll))
        .route("/v1/agents/channel", get(channel::agent_channel))
        .merge(admin)
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

async fn healthz(State(state): State<AppState>) -> impl IntoResponse {
    Json(json!({
        "status": "ok",
        "protocol_version": PROTOCOL_VERSION,
        "connected_agents": state.connected_count(),
        "signing_key": state.signer.public_key_hex(),
        "server_time": Utc::now(),
    }))
}

async fn public_key(State(state): State<AppState>) -> impl IntoResponse {
    Json(json!({
        "algorithm": "ed25519",
        "public_key": state.signer.public_key_hex(),
    }))
}

async fn enroll(
    State(state): State<AppState>,
    Json(request): Json<EnrollRequest>,
) -> ApiResult<Json<EnrollResponse>> {
    if request.agent_name.trim().is_empty() {
        return Err(ApiError::BadRequest("agent_name is required".into()));
    }
    if request.enrollment_token.trim().is_empty() {
        return Err(ApiError::BadRequest("enrollment_token is required".into()));
    }

    let credentials = state.store.enroll(
        &request.enrollment_token,
        request.agent_name.trim(),
        request.environment.trim(),
        request.agent_version.trim(),
        request.labels,
    )?;

    tracing::info!(
        agent_id = %credentials.agent_id,
        tenant_id = %credentials.tenant_id,
        "agent enrolled"
    );

    Ok(Json(EnrollResponse {
        protocol_version: PROTOCOL_VERSION,
        agent_id: credentials.agent_id,
        tenant_id: credentials.tenant_id.clone(),
        agent_secret: credentials.secret,
        heartbeat_interval_seconds: DEFAULT_HEARTBEAT_SECONDS,
        public_key: state.signer.public_key_hex().to_string(),
        policy: state.store.latest_policy(&credentials.tenant_id),
        revocations: state.store.revocations(&credentials.tenant_id),
    }))
}

async fn create_enrollment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CreateEnrollmentRequest>,
) -> ApiResult<Json<CreateEnrollmentResponse>> {
    require_admin(&state, &headers)?;
    let (token, view) = state.store.create_enrollment(
        &request.tenant_id,
        &request.created_by,
        state.enrollment_ttl(),
    )?;

    Ok(Json(CreateEnrollmentResponse {
        enrollment_token: token.clone(),
        tenant_id: view.tenant_id,
        expires_at: view.expires_at,
        max_agents: view.max_agents,
        install_command: format!(
            "AXIOM_CONTROL_PLANE_URL=<control-plane-url> AXIOM_ENROLLMENT_TOKEN={token} axiom-agent-supervisor"
        ),
    }))
}

async fn list_agents(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<TenantQuery>,
) -> ApiResult<impl IntoResponse> {
    require_admin(&state, &headers)?;
    Ok(Json(json!({
        "agents": state.store.list_agents(&query.tenant_id),
    })))
}

async fn get_agent(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(agent_id): Path<Uuid>,
    Query(query): Query<TenantQuery>,
) -> ApiResult<impl IntoResponse> {
    require_admin(&state, &headers)?;
    let agent = state
        .store
        .agent(agent_id)
        .filter(|agent| agent.tenant_id == query.tenant_id)
        .ok_or_else(|| ApiError::NotFound("agent not found".into()))?;
    let heartbeat = state
        .store
        .heartbeats(&query.tenant_id)
        .into_iter()
        .find(|hb| hb.agent_id == agent_id);
    let ack = state.store.policy_ack(agent_id);

    Ok(Json(json!({
        "agent": agent,
        "heartbeat": heartbeat,
        "policy_ack": ack.map(|(version, applied, error, at)| json!({
            "version": version,
            "applied": applied,
            "error": error,
            "received_at": at,
        })),
    })))
}

async fn revoke_agent(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(agent_id): Path<Uuid>,
    Json(query): Json<TenantQuery>,
) -> ApiResult<impl IntoResponse> {
    require_admin(&state, &headers)?;
    state.store.revoke_agent(&query.tenant_id, agent_id)?;
    // Drop the live socket immediately; the agent must re-enroll with a new
    // token, which the control plane will refuse while it is revoked.
    state.unregister_connection(agent_id);
    Ok(Json(json!({ "revoked": true, "agent_id": agent_id })))
}

async fn publish_policy(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<PublishPolicyRequest>,
) -> ApiResult<impl IntoResponse> {
    require_admin(&state, &headers)?;
    let cedar_source = request.cedar_source.trim();
    if cedar_source.is_empty() {
        return Err(ApiError::BadRequest("cedar_source is required".into()));
    }
    if !cedar_source.contains("permit") && !cedar_source.contains("forbid") {
        return Err(ApiError::BadRequest(
            "cedar_source does not contain a permit or forbid rule".into(),
        ));
    }

    let version = state.store.next_policy_version(&request.tenant_id);
    let mut bundle = PolicyBundle {
        bundle_id: Uuid::new_v4(),
        tenant_id: request.tenant_id.clone(),
        version,
        sha256: sha256_hex(cedar_source),
        cedar_source: cedar_source.to_string(),
        signature: String::new(),
        issued_at: Utc::now(),
    };
    state.signer.sign_bundle(&mut bundle);
    state.store.store_policy(bundle.clone());

    let delivered =
        state.push_to_tenant(&request.tenant_id, ControlMessage::Policy(bundle.clone()));

    tracing::info!(
        tenant_id = %request.tenant_id,
        version,
        delivered,
        created_by = %request.created_by,
        "policy bundle published"
    );

    Ok(Json(json!({
        "bundle": bundle,
        "delivered_agents": delivered,
    })))
}

async fn list_policies(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<TenantQuery>,
) -> ApiResult<impl IntoResponse> {
    require_admin(&state, &headers)?;
    Ok(Json(json!({
        "policies": state.store.list_policies(&query.tenant_id),
        "revoked": state.store.policies_revoked(&query.tenant_id),
    })))
}

async fn trigger_kill_switch(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<KillSwitchRequest>,
) -> ApiResult<impl IntoResponse> {
    require_admin(&state, &headers)?;
    if request.reason.trim().is_empty() {
        return Err(ApiError::BadRequest("reason is required".into()));
    }

    let switch = state
        .store
        .trigger_kill_switch(&request.scope, request.reason.trim());
    let message = ControlMessage::KillSwitch {
        scope: switch.scope.clone(),
        reason: switch.reason.clone(),
        issued_at: switch.issued_at,
    };

    let delivered = if let Some(tenant_id) = switch.scope.strip_prefix("tenant:") {
        state.push_to_tenant(tenant_id, message)
    } else {
        state.push_all(message)
    };

    tracing::warn!(
        scope = %switch.scope,
        reason = %switch.reason,
        delivered,
        "kill switch engaged"
    );

    Ok(Json(
        json!({ "kill_switch": switch, "delivered_agents": delivered }),
    ))
}

async fn clear_kill_switch(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<impl IntoResponse> {
    require_admin(&state, &headers)?;
    state.store.clear_kill_switch();
    Ok(Json(json!({ "kill_switch": null })))
}

async fn update_revocations(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<RevocationRequest>,
) -> ApiResult<impl IntoResponse> {
    require_admin(&state, &headers)?;
    let current = state.store.revocations(&request.tenant_id);
    let next = RevocationState {
        version: current.version + 1,
        global: request.global,
        servers: request.servers,
        tools: request.tools,
        agents: request.agents,
    };
    state
        .store
        .set_revocations(&request.tenant_id, next.clone());

    let delivered = state.push_to_tenant(
        &request.tenant_id,
        ControlMessage::Revocations {
            state: next.clone(),
        },
    );

    Ok(Json(json!({
        "revocations": next,
        "delivered_agents": delivered,
    })))
}

async fn list_audit(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<AuditQuery>,
) -> ApiResult<impl IntoResponse> {
    require_admin(&state, &headers)?;
    let limit = query.limit.clamp(1, 1000);
    Ok(Json(json!({
        "events": state.store.audit_events(&query.tenant_id, limit),
        "total": state.store.audit_count(&query.tenant_id),
    })))
}

async fn list_entitlements(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<impl IntoResponse> {
    require_admin(&state, &headers)?;
    Ok(Json(json!({
        "entitlements": state.store.list_entitlements(),
    })))
}

async fn update_entitlement(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<EntitlementRequest>,
) -> ApiResult<impl IntoResponse> {
    require_admin(&state, &headers)?;
    let entitlement = TenantEntitlement {
        tenant_id: request.tenant_id,
        runtime_enforcement: request.runtime_enforcement,
        agents_limit: request.agents_limit,
        billing_source: request.billing_source,
    };
    state.store.set_entitlement(entitlement.clone());
    Ok(Json(json!({ "entitlement": entitlement })))
}

// ---------------------------------------------------------------------------
// WebSocket handshake (shared with `channel.rs`)
// ---------------------------------------------------------------------------

pub(crate) struct ChannelAuth {
    pub agent_id: Uuid,
    pub tenant_id: String,
}

pub(crate) fn authenticate_channel(
    state: &AppState,
    headers: &HeaderMap,
) -> ApiResult<ChannelAuth> {
    let agent_id = headers
        .get("x-axiom-agent-id")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| Uuid::parse_str(value).ok())
        .ok_or(ApiError::Unauthorized)?;

    let secret = bearer(headers).ok_or(ApiError::Unauthorized)?;

    if !state.store.authenticate_agent(agent_id, secret) {
        return Err(ApiError::Unauthorized);
    }

    let agent = state
        .store
        .agent(agent_id)
        .ok_or_else(|| ApiError::NotFound("agent not found".into()))?;

    Ok(ChannelAuth {
        agent_id,
        tenant_id: agent.tenant_id,
    })
}

pub(crate) fn upgrade(state: AppState, ws: WebSocketUpgrade, auth: ChannelAuth) -> Response {
    ws.max_message_size(2 * 1024 * 1024)
        .on_upgrade(move |socket| channel::handle_socket(state, socket, auth))
}
