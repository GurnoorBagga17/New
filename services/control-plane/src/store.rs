// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
//! In-memory control-plane store.
//!
//! This is deliberately a bounded, single-process implementation behind a
//! narrow API so that a Postgres-backed `PgStore` (schema in
//! `migrations/0004_saas_agents.sql`) can replace it without touching the
//! handlers or the channel loop.
//!
//! Security invariants enforced here:
//! - Enrollment tokens are stored as SHA-256 hashes, single use, tenant bound.
//! - Agent secrets are stored as SHA-256 hashes and compared in constant time.
//! - Every lookup that returns tenant data takes an explicit tenant scope; the
//!   admin handlers derive that scope from the authenticated session.

use std::collections::{BTreeMap, HashMap, HashSet, VecDeque};
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;

use axiom_agent_protocol::{
    sha256_hex, AgentStatus, AuditEventEnvelope, PolicyBundle, RevocationState,
};
use chrono::{DateTime, Utc};
#[allow(deprecated)]
use ring::constant_time::verify_slices_are_equal;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

/// Hard cap on retained audit events in the in-memory MVP store. The real
/// implementation streams into Postgres; this bound exists so a runaway agent
/// cannot exhaust control-plane memory.
const MAX_AUDIT_EVENTS: usize = 100_000;

/// Default agent allowance for a tenant without an explicit entitlement row.
const DEFAULT_AGENT_LIMIT: u32 = 3;

#[derive(Debug, Error)]
pub enum StoreError {
    #[error("enrollment token is invalid")]
    InvalidToken,
    #[error("enrollment token has expired")]
    ExpiredToken,
    #[error("enrollment token has already been used")]
    TokenAlreadyUsed,
    #[error("tenant entitlement does not permit runtime enrollment")]
    EntitlementDenied,
    #[error("tenant agent limit reached ({0})")]
    AgentLimitReached(u32),
    #[error("agent authentication failed")]
    Unauthorized,
    #[error("agent not found")]
    AgentNotFound,
    #[error("tenant not found")]
    TenantNotFound,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TenantEntitlement {
    pub tenant_id: String,
    /// Gates `runtime.enforcement`; without it, no enrollment token is issued.
    pub runtime_enforcement: bool,
    /// Maximum enrolled agents. The control plane rejects enrollment over it.
    pub agents_limit: u32,
    /// `manual` during pilots, `stripe` once checkout is wired in Phase 3.
    pub billing_source: String,
}

impl TenantEntitlement {
    pub fn pilot(tenant_id: impl Into<String>) -> Self {
        Self {
            tenant_id: tenant_id.into(),
            runtime_enforcement: true,
            agents_limit: DEFAULT_AGENT_LIMIT,
            billing_source: "manual".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct AgentRecord {
    pub agent_id: Uuid,
    pub tenant_id: String,
    pub name: String,
    pub environment: String,
    pub version: String,
    pub labels: BTreeMap<String, String>,
    pub status: AgentStatus,
    pub created_at: DateTime<Utc>,
    pub last_seen_at: Option<DateTime<Utc>>,
    pub policy_version: u64,
    pub decisions_total: u64,
    pub denies_total: u64,
    #[serde(skip_serializing)]
    pub secret_hash: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct EnrollmentView {
    pub tenant_id: String,
    pub expires_at: DateTime<Utc>,
    pub max_agents: u32,
}

#[derive(Debug, Clone)]
struct EnrollmentRecord {
    tenant_id: String,
    #[allow(dead_code)]
    created_by: String,
    expires_at: DateTime<Utc>,
    consumed_at: Option<DateTime<Utc>>,
    agent_id: Option<Uuid>,
    max_agents: u32,
}

#[derive(Debug, Clone)]
pub struct AgentCredentials {
    pub agent_id: Uuid,
    pub tenant_id: String,
    pub secret: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AuditRecord {
    pub event_id: Uuid,
    pub tenant_id: String,
    pub agent_id: Uuid,
    pub occurred_at: DateTime<Utc>,
    pub decision: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latency_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entry_hash: Option<String>,
    pub received_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KillSwitchState {
    pub scope: String,
    pub reason: String,
    pub issued_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
pub struct HeartbeatView {
    pub agent_id: Uuid,
    pub seq: u64,
    pub sent_at: DateTime<Utc>,
    pub policy_version: u64,
    pub decisions_total: u64,
    pub denies_total: u64,
    pub received_at: DateTime<Utc>,
}

#[derive(Default)]
struct Inner {
    enrollments: HashMap<String, EnrollmentRecord>,
    agents: HashMap<Uuid, AgentRecord>,
    policies: HashMap<String, PolicyBundle>,
    revoked_policies: HashSet<String>,
    heartbeats: HashMap<Uuid, HeartbeatView>,
    audit: VecDeque<AuditRecord>,
    seen_events: HashSet<Uuid>,
    seen_sequences: HashSet<(Uuid, u64)>,
    revocations: HashMap<String, RevocationState>,
    kill_switch: Option<KillSwitchState>,
    entitlements: HashMap<String, TenantEntitlement>,
    policy_acks: HashMap<Uuid, (u64, bool, Option<String>, DateTime<Utc>)>,
}

pub struct Store {
    inner: Mutex<Inner>,
}

impl Store {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(Inner::default()),
        }
    }

    fn lock(&self) -> MutexGuard<'_, Inner> {
        // A poisoned lock means a handler panicked mid-mutation. Recovering keeps
        // an agent fleet enforcing rather than turning a panic into an outage.
        self.inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    // -- entitlements -------------------------------------------------------

    pub fn entitlement(&self, tenant_id: &str) -> TenantEntitlement {
        self.lock()
            .entitlements
            .get(tenant_id)
            .cloned()
            .unwrap_or_else(|| TenantEntitlement::pilot(tenant_id))
    }

    pub fn set_entitlement(&self, entitlement: TenantEntitlement) {
        self.lock()
            .entitlements
            .insert(entitlement.tenant_id.clone(), entitlement);
    }

    pub fn list_entitlements(&self) -> Vec<TenantEntitlement> {
        let inner = self.lock();
        let mut items: Vec<_> = inner.entitlements.values().cloned().collect();
        items.sort_by(|a, b| a.tenant_id.cmp(&b.tenant_id));
        items
    }

    // -- enrollment ---------------------------------------------------------

    /// Mint a single-use enrollment token. Returns the plaintext token exactly
    /// once; only its hash is retained.
    pub fn create_enrollment(
        &self,
        tenant_id: &str,
        created_by: &str,
        ttl: Duration,
    ) -> Result<(String, EnrollmentView), StoreError> {
        let entitlement = self.entitlement(tenant_id);
        if !entitlement.runtime_enforcement {
            return Err(StoreError::EntitlementDenied);
        }

        let token = generate_token();
        let token_hash = sha256_hex(&token);
        let expires_at = Utc::now()
            + chrono::Duration::from_std(ttl).unwrap_or_else(|_| chrono::Duration::minutes(15));

        let view = EnrollmentView {
            tenant_id: tenant_id.to_string(),
            expires_at,
            max_agents: entitlement.agents_limit,
        };

        self.lock().enrollments.insert(
            token_hash,
            EnrollmentRecord {
                tenant_id: tenant_id.to_string(),
                created_by: created_by.to_string(),
                expires_at,
                consumed_at: None,
                agent_id: None,
                max_agents: entitlement.agents_limit,
            },
        );

        Ok((token, view))
    }

    /// Consume an enrollment token and create the agent identity.
    pub fn enroll(
        &self,
        token: &str,
        name: &str,
        environment: &str,
        version: &str,
        labels: BTreeMap<String, String>,
    ) -> Result<AgentCredentials, StoreError> {
        let token_hash = sha256_hex(token);
        let mut inner = self.lock();

        let record = inner
            .enrollments
            .get(&token_hash)
            .cloned()
            .ok_or(StoreError::InvalidToken)?;

        if record.consumed_at.is_some() {
            return Err(StoreError::TokenAlreadyUsed);
        }
        if record.expires_at <= Utc::now() {
            return Err(StoreError::ExpiredToken);
        }

        let entitlement = inner
            .entitlements
            .get(&record.tenant_id)
            .cloned()
            .unwrap_or_else(|| TenantEntitlement::pilot(&record.tenant_id));
        if !entitlement.runtime_enforcement {
            return Err(StoreError::EntitlementDenied);
        }

        let active = inner
            .agents
            .values()
            .filter(|agent| agent.tenant_id == record.tenant_id)
            .filter(|agent| agent.status != AgentStatus::Revoked)
            .count() as u32;
        let limit = record.max_agents.min(entitlement.agents_limit);
        if active >= limit {
            return Err(StoreError::AgentLimitReached(limit));
        }

        let secret = generate_token();
        let agent_id = Uuid::new_v4();
        let now = Utc::now();

        inner.agents.insert(
            agent_id,
            AgentRecord {
                agent_id,
                tenant_id: record.tenant_id.clone(),
                name: name.to_string(),
                environment: environment.to_string(),
                version: version.to_string(),
                labels,
                status: AgentStatus::Pending,
                created_at: now,
                last_seen_at: None,
                policy_version: 0,
                decisions_total: 0,
                denies_total: 0,
                secret_hash: sha256_hex(&secret),
            },
        );

        if let Some(entry) = inner.enrollments.get_mut(&token_hash) {
            entry.consumed_at = Some(now);
            entry.agent_id = Some(agent_id);
        }

        Ok(AgentCredentials {
            agent_id,
            tenant_id: record.tenant_id,
            secret,
        })
    }

    // -- agent identity -----------------------------------------------------

    #[allow(deprecated)]
    pub fn authenticate_agent(&self, agent_id: Uuid, secret: &str) -> bool {
        let inner = self.lock();
        let Some(agent) = inner.agents.get(&agent_id) else {
            return false;
        };
        if agent.status == AgentStatus::Revoked {
            return false;
        }
        let expected = agent.secret_hash.as_bytes();
        let actual = sha256_hex(secret);
        verify_slices_are_equal(expected, actual.as_bytes()).is_ok()
    }

    pub fn agent(&self, agent_id: Uuid) -> Option<AgentRecord> {
        self.lock().agents.get(&agent_id).cloned()
    }

    pub fn list_agents(&self, tenant_id: &str) -> Vec<AgentRecord> {
        let inner = self.lock();
        let mut items: Vec<_> = inner
            .agents
            .values()
            .filter(|agent| agent.tenant_id == tenant_id)
            .cloned()
            .collect();
        items.sort_by_key(|a| a.created_at);
        items
    }

    pub fn revoke_agent(&self, tenant_id: &str, agent_id: Uuid) -> Result<(), StoreError> {
        let mut inner = self.lock();
        let agent = inner
            .agents
            .get_mut(&agent_id)
            .ok_or(StoreError::AgentNotFound)?;
        if agent.tenant_id != tenant_id {
            return Err(StoreError::AgentNotFound);
        }
        agent.status = AgentStatus::Revoked;
        Ok(())
    }

    pub fn mark_online(&self, agent_id: Uuid) {
        let mut inner = self.lock();
        if let Some(agent) = inner.agents.get_mut(&agent_id) {
            if agent.status != AgentStatus::Revoked {
                agent.status = AgentStatus::Online;
                agent.last_seen_at = Some(Utc::now());
            }
        }
    }

    pub fn mark_offline(&self, agent_id: Uuid) {
        let mut inner = self.lock();
        if let Some(agent) = inner.agents.get_mut(&agent_id) {
            if agent.status == AgentStatus::Online {
                agent.status = AgentStatus::Offline;
            }
        }
    }

    /// Mark agents offline when their heartbeat is older than `threshold`.
    /// Returns the agents that transitioned.
    pub fn reap_stale_agents(&self, threshold: chrono::Duration) -> Vec<Uuid> {
        let now = Utc::now();
        let mut inner = self.lock();
        let mut transitioned = Vec::new();
        for agent in inner.agents.values_mut() {
            if agent.status != AgentStatus::Online {
                continue;
            }
            match agent.last_seen_at {
                Some(last_seen) if now - last_seen > threshold => {
                    agent.status = AgentStatus::Offline;
                    transitioned.push(agent.agent_id);
                }
                None => {
                    agent.status = AgentStatus::Offline;
                    transitioned.push(agent.agent_id);
                }
                _ => {}
            }
        }
        transitioned
    }

    pub fn record_heartbeat(
        &self,
        agent_id: Uuid,
        seq: u64,
        sent_at: DateTime<Utc>,
        policy_version: u64,
        decisions_total: u64,
        denies_total: u64,
    ) -> bool {
        let mut inner = self.lock();
        // Agent messages are at-most-once per (agent, seq); a replay must not
        // inflate counters or move liveness forward.
        if !inner.seen_sequences.insert((agent_id, seq)) {
            return false;
        }
        let Some(agent) = inner.agents.get_mut(&agent_id) else {
            return false;
        };
        if agent.status == AgentStatus::Revoked {
            return false;
        }

        let now = Utc::now();
        agent.status = AgentStatus::Online;
        agent.last_seen_at = Some(now);
        agent.policy_version = policy_version;
        agent.decisions_total = decisions_total;
        agent.denies_total = denies_total;

        inner.heartbeats.insert(
            agent_id,
            HeartbeatView {
                agent_id,
                seq,
                sent_at,
                policy_version,
                decisions_total,
                denies_total,
                received_at: now,
            },
        );
        true
    }

    pub fn heartbeats(&self, tenant_id: &str) -> Vec<HeartbeatView> {
        let inner = self.lock();
        inner
            .heartbeats
            .values()
            .filter(|hb| {
                inner
                    .agents
                    .get(&hb.agent_id)
                    .map(|agent| agent.tenant_id == tenant_id)
                    .unwrap_or(false)
            })
            .cloned()
            .collect()
    }

    // -- policy -------------------------------------------------------------

    pub fn next_policy_version(&self, tenant_id: &str) -> u64 {
        self.lock()
            .policies
            .get(tenant_id)
            .map(|bundle| bundle.version + 1)
            .unwrap_or(1)
    }

    pub fn store_policy(&self, bundle: PolicyBundle) {
        self.lock()
            .policies
            .insert(bundle.tenant_id.clone(), bundle);
    }

    pub fn latest_policy(&self, tenant_id: &str) -> Option<PolicyBundle> {
        self.lock().policies.get(tenant_id).cloned()
    }

    pub fn list_policies(&self, tenant_id: &str) -> Vec<PolicyBundle> {
        // MVP keeps only the latest bundle per tenant; the API shape already
        // matches the future `policy_bundles` history query.
        self.latest_policy(tenant_id).into_iter().collect()
    }

    pub fn record_policy_ack(
        &self,
        agent_id: Uuid,
        version: u64,
        applied: bool,
        error: Option<String>,
    ) {
        self.lock()
            .policy_acks
            .insert(agent_id, (version, applied, error, Utc::now()));
    }

    pub fn policy_ack(&self, agent_id: Uuid) -> Option<(u64, bool, Option<String>, DateTime<Utc>)> {
        self.lock().policy_acks.get(&agent_id).cloned()
    }

    /// Invalidates every cached bundle for a tenant. Used by the emergency
    /// path; agents keep their last-known-good until the next signed bundle
    /// arrives, which is why revocation is tracked separately.
    pub fn revoke_policies(&self, tenant_id: &str) {
        let mut inner = self.lock();
        inner.policies.remove(tenant_id);
        inner.revoked_policies.insert(tenant_id.to_string());
    }

    pub fn policies_revoked(&self, tenant_id: &str) -> bool {
        self.lock().revoked_policies.contains(tenant_id)
    }

    // -- kill switch / revocations -----------------------------------------

    pub fn set_revocations(&self, tenant_id: &str, state: RevocationState) {
        self.lock().revocations.insert(tenant_id.to_string(), state);
    }

    pub fn revocations(&self, tenant_id: &str) -> RevocationState {
        self.lock()
            .revocations
            .get(tenant_id)
            .cloned()
            .unwrap_or_default()
    }

    pub fn trigger_kill_switch(&self, scope: &str, reason: &str) -> KillSwitchState {
        let state = KillSwitchState {
            scope: scope.to_string(),
            reason: reason.to_string(),
            issued_at: Utc::now(),
        };
        self.lock().kill_switch = Some(state.clone());
        state
    }

    pub fn kill_switch(&self) -> Option<KillSwitchState> {
        self.lock().kill_switch.clone()
    }

    pub fn clear_kill_switch(&self) {
        self.lock().kill_switch = None;
    }

    // -- audit --------------------------------------------------------------

    /// Store deduplicated audit events. Returns the number accepted.
    pub fn record_audit(
        &self,
        tenant_id: &str,
        agent_id: Uuid,
        events: Vec<AuditEventEnvelope>,
    ) -> usize {
        let mut inner = self.lock();
        let mut accepted = 0;
        let now = Utc::now();

        for event in events {
            if !inner.seen_events.insert(event.event_id) {
                continue; // at-least-once delivery: drop the duplicate
            }
            inner.audit.push_back(AuditRecord {
                event_id: event.event_id,
                tenant_id: tenant_id.to_string(),
                agent_id,
                occurred_at: event.occurred_at,
                decision: event.decision,
                tool: event.tool,
                latency_ms: event.latency_ms,
                payload_hash: event.payload_hash,
                entry_hash: event.entry_hash,
                received_at: now,
            });
            accepted += 1;
        }

        while inner.audit.len() > MAX_AUDIT_EVENTS {
            if let Some(dropped) = inner.audit.pop_front() {
                inner.seen_events.remove(&dropped.event_id);
            }
        }

        accepted
    }

    pub fn audit_events(&self, tenant_id: &str, limit: usize) -> Vec<AuditRecord> {
        let inner = self.lock();
        let mut items: Vec<_> = inner
            .audit
            .iter()
            .filter(|record| record.tenant_id == tenant_id)
            .cloned()
            .collect();
        items.sort_by_key(|a| std::cmp::Reverse(a.occurred_at));
        items.truncate(limit.min(MAX_AUDIT_EVENTS));
        items
    }

    pub fn audit_count(&self, tenant_id: &str) -> usize {
        let inner = self.lock();
        inner
            .audit
            .iter()
            .filter(|record| record.tenant_id == tenant_id)
            .count()
    }

    /// Sequence replay guard for non-heartbeat messages (audit, acks, kill ack).
    pub fn accept_sequence(&self, agent_id: Uuid, seq: u64) -> bool {
        self.lock().seen_sequences.insert((agent_id, seq))
    }
}

impl Default for Store {
    fn default() -> Self {
        Self::new()
    }
}

fn generate_token() -> String {
    let mut bytes = [0u8; 32];
    if getrandom::getrandom(&mut bytes).is_err() {
        // Failing open here would mint a predictable credential. Panic is the
        // safe behaviour: the process must not issue enrollment material.
        panic!("OS RNG unavailable; refusing to mint enrollment credentials");
    }
    hex::encode(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn labels() -> BTreeMap<String, String> {
        BTreeMap::new()
    }

    #[test]
    fn enrollment_token_is_single_use() {
        let store = Store::new();
        let (token, _) = store
            .create_enrollment("tenant-a", "operator-1", Duration::from_secs(60))
            .unwrap();

        let first = store
            .enroll(&token, "agent-1", "prod", "1.0.0", labels())
            .unwrap();
        assert_eq!(first.tenant_id, "tenant-a");

        let second = store.enroll(&token, "agent-2", "prod", "1.0.0", labels());
        assert!(matches!(second, Err(StoreError::TokenAlreadyUsed)));
    }

    #[test]
    fn expired_token_is_rejected() {
        let store = Store::new();
        let (token, _) = store
            .create_enrollment("tenant-a", "operator-1", Duration::from_secs(0))
            .unwrap();
        // Force expiry irrespective of clock granularity.
        {
            let mut inner = store.lock();
            let hash = sha256_hex(&token);
            inner.enrollments.get_mut(&hash).unwrap().expires_at =
                Utc::now() - chrono::Duration::seconds(1);
        }
        let result = store.enroll(&token, "agent-1", "prod", "1.0.0", labels());
        assert!(matches!(result, Err(StoreError::ExpiredToken)));
    }

    #[test]
    fn entitlement_toggle_blocks_enrollment_token_creation() {
        let store = Store::new();
        store.set_entitlement(TenantEntitlement {
            tenant_id: "tenant-a".into(),
            runtime_enforcement: false,
            agents_limit: 10,
            billing_source: "manual".into(),
        });
        let result = store.create_enrollment("tenant-a", "operator-1", Duration::from_secs(60));
        assert!(matches!(result, Err(StoreError::EntitlementDenied)));
    }

    #[test]
    fn agent_limit_is_enforced() {
        let store = Store::new();
        store.set_entitlement(TenantEntitlement {
            tenant_id: "tenant-a".into(),
            runtime_enforcement: true,
            agents_limit: 1,
            billing_source: "manual".into(),
        });

        let (token, _) = store
            .create_enrollment("tenant-a", "operator-1", Duration::from_secs(60))
            .unwrap();
        store
            .enroll(&token, "agent-1", "prod", "1.0.0", labels())
            .unwrap();

        let (second, _) = store
            .create_enrollment("tenant-a", "operator-1", Duration::from_secs(60))
            .unwrap();
        let result = store.enroll(&second, "agent-2", "prod", "1.0.0", labels());
        assert!(matches!(result, Err(StoreError::AgentLimitReached(1))));
    }

    #[test]
    fn agent_secret_authenticates_and_revocation_wins() {
        let store = Store::new();
        let (token, _) = store
            .create_enrollment("tenant-a", "operator-1", Duration::from_secs(60))
            .unwrap();
        let creds = store
            .enroll(&token, "agent-1", "prod", "1.0.0", labels())
            .unwrap();

        assert!(store.authenticate_agent(creds.agent_id, &creds.secret));
        assert!(!store.authenticate_agent(creds.agent_id, "wrong"));

        store.revoke_agent("tenant-a", creds.agent_id).unwrap();
        assert!(!store.authenticate_agent(creds.agent_id, &creds.secret));
    }

    #[test]
    fn audit_events_are_deduplicated_by_event_id() {
        let store = Store::new();
        let (token, _) = store
            .create_enrollment("tenant-a", "operator-1", Duration::from_secs(60))
            .unwrap();
        let creds = store
            .enroll(&token, "agent-1", "prod", "1.0.0", labels())
            .unwrap();

        let event = AuditEventEnvelope {
            event_id: Uuid::new_v4(),
            occurred_at: Utc::now(),
            decision: "deny".into(),
            tool: Some("read_file".into()),
            latency_ms: Some(1.2),
            payload_hash: None,
            prev_hash: None,
            entry_hash: None,
        };

        assert_eq!(
            store.record_audit("tenant-a", creds.agent_id, vec![event.clone()]),
            1
        );
        assert_eq!(
            store.record_audit("tenant-a", creds.agent_id, vec![event]),
            0
        );
        assert_eq!(store.audit_count("tenant-a"), 1);
    }

    #[test]
    fn replayed_heartbeat_sequence_does_not_advance_liveness() {
        let store = Store::new();
        let (token, _) = store
            .create_enrollment("tenant-a", "operator-1", Duration::from_secs(60))
            .unwrap();
        let creds = store
            .enroll(&token, "agent-1", "prod", "1.0.0", labels())
            .unwrap();

        let sent_at = Utc::now();
        assert!(store.record_heartbeat(creds.agent_id, 1, sent_at, 1, 10, 1));
        assert!(!store.record_heartbeat(creds.agent_id, 1, sent_at, 1, 99, 99));
        assert_eq!(store.agent(creds.agent_id).unwrap().decisions_total, 10);
    }

    #[test]
    fn tenants_are_isolated() {
        let store = Store::new();
        let (a_token, _) = store
            .create_enrollment("tenant-a", "op-a", Duration::from_secs(60))
            .unwrap();
        let (b_token, _) = store
            .create_enrollment("tenant-b", "op-b", Duration::from_secs(60))
            .unwrap();
        store
            .enroll(&a_token, "agent-a", "prod", "1.0.0", labels())
            .unwrap();
        store
            .enroll(&b_token, "agent-b", "prod", "1.0.0", labels())
            .unwrap();

        let agents_a = store.list_agents("tenant-a");
        assert_eq!(agents_a.len(), 1);
        assert_eq!(agents_a[0].tenant_id, "tenant-a");
        assert!(store.list_agents("tenant-c").is_empty());
    }
}
