// Copyright 2024 Axiom NHI — Licensed under Apache-2.0
//! Audit event types.
//!
//! [`AuditEvent`] mirrors the Team 0 draft shared contract. It intentionally
//! has exactly the fields listed in the playbook so consumers do not see a
//! silently invented payload.
//!
//! [`KillSwitchAuditEvent`] is a Team 5 draft for admin actions. It is a
//! separate record shape; Team 0 must decide whether to bless a shared
//! discriminator or a separate stream before freeze.

use std::fmt;

use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::redact::Redactor;

/// Draft schema version carried by documentation and tests.
pub const AUDIT_SCHEMA_VERSION: &str = "1.0.0";

const MAX_ID_LEN: usize = 256;
const MAX_REASON_LEN: usize = 2_048;
const MAX_SUMMARY_ENTRY_LEN: usize = 512;
const MAX_SUMMARY_ENTRIES: usize = 32;

/// Clock seam so event timestamps are deterministic in tests.
pub trait Clock: Send + Sync {
    /// Current Unix time in milliseconds.
    fn now_unix_ms(&self) -> i64;
    /// Current UTC time formatted as RFC 3339 with millisecond precision.
    fn now_rfc3339(&self) -> String;
}

/// Production clock.
#[derive(Debug, Clone, Copy, Default)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn now_unix_ms(&self) -> i64 {
        Utc::now().timestamp_millis()
    }

    fn now_rfc3339(&self) -> String {
        Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
    }
}

/// Deterministic clock for tests.
#[derive(Debug, Clone)]
pub struct FixedClock {
    /// Milliseconds since the Unix epoch.
    pub unix_ms: i64,
    /// RFC 3339 representation returned by [`Clock::now_rfc3339`].
    pub rfc3339: String,
}

impl FixedClock {
    /// Create a fixed clock.
    pub fn new(unix_ms: i64, rfc3339: impl Into<String>) -> Self {
        Self {
            unix_ms,
            rfc3339: rfc3339.into(),
        }
    }
}

impl Clock for FixedClock {
    fn now_unix_ms(&self) -> i64 {
        self.unix_ms
    }

    fn now_rfc3339(&self) -> String {
        self.rfc3339.clone()
    }
}

/// Decision value written to `AuditEvent.decision`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AuditDecision {
    /// The request was permitted and forwarded.
    Allow,
    /// The request was blocked.
    Deny,
    /// The request would have been blocked in enforce mode but was forwarded.
    WouldDeny,
}

impl AuditDecision {
    /// Contract string for this decision.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Allow => "ALLOW",
            Self::Deny => "DENY",
            Self::WouldDeny => "WOULD_DENY",
        }
    }
}

impl fmt::Display for AuditDecision {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Runtime mode value written to `AuditEvent.runtime_mode`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AuditRuntimeMode {
    /// The gateway enforces decisions.
    Enforce,
    /// The gateway records shadow decisions and forwards.
    ObserveOnly,
}

impl AuditRuntimeMode {
    /// Contract string for this mode.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Enforce => "enforce",
            Self::ObserveOnly => "observe-only",
        }
    }
}

impl fmt::Display for AuditRuntimeMode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Audit record for one authorization decision.
///
/// **Contract status:** mirrors the Team 0 draft `AuditEvent` field-for-field.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AuditEvent {
    /// UTC timestamp in RFC 3339 format.
    pub timestamp_rfc3339: String,
    /// Request correlation identifier from the gateway.
    pub request_id: String,
    /// W3C trace ID carried through the request.
    pub trace_id: String,
    /// Authenticated agent identifier, or `anonymous`.
    pub agent_id: String,
    /// Target MCP server name.
    pub target_server: String,
    /// Tool name, or an empty string for methods without a tool.
    pub tool_name: String,
    /// `enforce` or `observe-only`.
    pub runtime_mode: String,
    /// `ALLOW`, `DENY`, or `WOULD_DENY`.
    pub decision: String,
    /// Active Cedar policy bundle version.
    pub policy_version: String,
    /// Redacted denial reason, if any.
    pub denial_reason: Option<String>,
    /// Redacted canonical validator summaries.
    pub validator_summary: Vec<String>,
    /// Whether a revocation entry matched this request.
    pub kill_switch_active: bool,
    /// Pipeline latency in microseconds.
    pub latency_us: u64,
}

/// Input used to build a redacted [`AuditEvent`].
///
/// This type deliberately has no `raw_arguments`, `raw_auth_header`, or
/// arbitrary JSON field. Callers must summarize validator results themselves.
#[derive(Debug, Clone)]
pub struct AuditEventInput {
    /// Request correlation identifier.
    pub request_id: String,
    /// W3C trace ID.
    pub trace_id: String,
    /// Authenticated agent ID.
    pub agent_id: String,
    /// Target MCP server.
    pub target_server: String,
    /// Tool name.
    pub tool_name: String,
    /// Runtime mode.
    pub runtime_mode: AuditRuntimeMode,
    /// Decision.
    pub decision: AuditDecision,
    /// Policy version.
    pub policy_version: String,
    /// Optional denial reason; redacted before serialization.
    pub denial_reason: Option<String>,
    /// Canonical validator summaries; redacted and bounded.
    pub validator_summary: Vec<String>,
    /// Whether a revocation entry matched.
    pub kill_switch_active: bool,
    /// Pipeline latency in microseconds.
    pub latency_us: u64,
}

impl AuditEventInput {
    /// Build an event using the production redactor.
    pub fn build(&self, clock: &dyn Clock) -> AuditEvent {
        self.build_with_redactor(&Redactor::new(), clock)
    }

    /// Build an event using a caller-provided redactor.
    pub fn build_with_redactor(&self, redactor: &Redactor, clock: &dyn Clock) -> AuditEvent {
        let denial_reason = self.denial_reason.as_ref().and_then(|reason| {
            let redacted = sanitize_plain(&redactor.redact(reason), MAX_REASON_LEN);
            if redacted.is_empty() {
                None
            } else {
                Some(redacted)
            }
        });

        let validator_summary = self
            .validator_summary
            .iter()
            .take(MAX_SUMMARY_ENTRIES)
            .filter_map(|summary| {
                let redacted = sanitize_plain(&redactor.redact(summary), MAX_SUMMARY_ENTRY_LEN);
                if redacted.is_empty() {
                    None
                } else {
                    Some(redacted)
                }
            })
            .collect();

        AuditEvent {
            timestamp_rfc3339: clock.now_rfc3339(),
            request_id: sanitize_identity(&self.request_id, redactor, "unknown"),
            trace_id: sanitize_plain(
                &redactor.redact_credentials_only(&self.trace_id),
                MAX_ID_LEN,
            ),
            agent_id: sanitize_identity(&self.agent_id, redactor, "anonymous"),
            target_server: sanitize_identity(&self.target_server, redactor, "unknown"),
            tool_name: sanitize_identity(&self.tool_name, redactor, ""),
            runtime_mode: self.runtime_mode.as_str().to_string(),
            decision: self.decision.as_str().to_string(),
            policy_version: sanitize_identity(&self.policy_version, redactor, "unknown"),
            denial_reason,
            validator_summary,
            kill_switch_active: self.kill_switch_active,
            latency_us: self.latency_us,
        }
    }
}

/// Audit record for a kill-switch or restore action.
///
/// **Contract status:** Team 5 draft proposal. The shared contract does not yet
/// define admin-action auditing. See `INTERFACE_PROPOSAL.md`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct KillSwitchAuditEvent {
    /// Discriminator for this record shape.
    pub event_type: String,
    /// UTC timestamp in RFC 3339 format.
    pub timestamp_rfc3339: String,
    /// `revoke` or `clear`.
    pub action: String,
    /// `agent`, `tool`, `mcp_server`, or `global`.
    pub target_kind: String,
    /// Canonical target identifier.
    pub target_id: String,
    /// Operator or automation that requested the action.
    pub actor: String,
    /// Redacted operator reason.
    pub reason: String,
    /// Snapshot version before the action.
    pub previous_state_version: u64,
    /// Snapshot version after the action.
    pub state_version: u64,
    /// `applied`, `already_in_desired_state`, or `rejected`.
    pub outcome: String,
    /// `cli`, `unix_socket`, or `loopback_http` in Phase 1.
    pub source: String,
    /// Optional request correlation identifier.
    pub request_id: Option<String>,
}

/// Input used to build a redacted [`KillSwitchAuditEvent`].
#[derive(Debug, Clone)]
pub struct KillSwitchAuditInput {
    /// `revoke` or `clear`.
    pub action: String,
    /// Revocation target kind.
    pub target_kind: String,
    /// Canonical revocation target identifier.
    pub target_id: String,
    /// Operator or automation identity.
    pub actor: String,
    /// Operator reason; redacted before serialization.
    pub reason: String,
    /// Snapshot version before the action.
    pub previous_state_version: u64,
    /// Snapshot version after the action.
    pub state_version: u64,
    /// Action outcome.
    pub outcome: String,
    /// Admin channel used.
    pub source: String,
    /// Optional request correlation identifier.
    pub request_id: Option<String>,
}

impl KillSwitchAuditInput {
    /// Build a kill-switch audit record using the production redactor.
    pub fn build(&self, clock: &dyn Clock) -> KillSwitchAuditEvent {
        self.build_with_redactor(&Redactor::new(), clock)
    }

    /// Build a kill-switch audit record using a caller-provided redactor.
    pub fn build_with_redactor(
        &self,
        redactor: &Redactor,
        clock: &dyn Clock,
    ) -> KillSwitchAuditEvent {
        KillSwitchAuditEvent {
            event_type: "kill_switch_action".to_string(),
            timestamp_rfc3339: clock.now_rfc3339(),
            action: sanitize_plain(&self.action, 32),
            target_kind: sanitize_plain(&self.target_kind, 32),
            target_id: sanitize_plain(
                &redactor.redact_credentials_only(&self.target_id),
                MAX_ID_LEN,
            ),
            actor: sanitize_identity(&self.actor, redactor, "unknown"),
            reason: sanitize_plain(&redactor.redact(&self.reason), MAX_REASON_LEN),
            previous_state_version: self.previous_state_version,
            state_version: self.state_version,
            outcome: sanitize_plain(&self.outcome, 64),
            source: sanitize_plain(&self.source, 64),
            request_id: self
                .request_id
                .as_ref()
                .map(|id| sanitize_identity(id, redactor, "unknown")),
        }
    }
}

/// A record that can be delivered by the audit bus.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "record_type", content = "payload")]
pub enum AuditRecord {
    /// A normal authorization decision event.
    #[serde(rename = "decision")]
    Decision(AuditEvent),
    /// A kill-switch admin action event.
    #[serde(rename = "kill_switch_action")]
    KillSwitchAction(KillSwitchAuditEvent),
}

impl AuditRecord {
    /// Stable record type label for metrics and tests.
    pub fn record_type(&self) -> &'static str {
        match self {
            Self::Decision(_) => "decision",
            Self::KillSwitchAction(_) => "kill_switch_action",
        }
    }

    /// Whether this record should use the critical queue.
    ///
    /// Denials and kill-switch actions must survive routine queue pressure.
    pub fn is_critical(&self) -> bool {
        match self {
            Self::Decision(event) => {
                event.decision != AuditDecision::Allow.as_str() || event.kill_switch_active
            }
            Self::KillSwitchAction(_) => true,
        }
    }

    /// Serialize to a JSON value.
    pub fn to_json_value(&self) -> serde_json::Result<Value> {
        match self {
            Self::Decision(event) => serde_json::to_value(event),
            Self::KillSwitchAction(event) => serde_json::to_value(event),
        }
    }

    /// Serialize to one compact JSON line (without a trailing newline).
    pub fn to_json_line(&self) -> serde_json::Result<String> {
        match self {
            Self::Decision(event) => serde_json::to_string(event),
            Self::KillSwitchAction(event) => serde_json::to_string(event),
        }
    }
}

fn sanitize_plain(value: &str, max_chars: usize) -> String {
    let cleaned: String = value
        .chars()
        .filter(|c| !c.is_control())
        .take(max_chars)
        .collect();
    cleaned.trim().to_string()
}

fn sanitize_identity(value: &str, redactor: &Redactor, fallback: &str) -> String {
    let redacted = redactor.redact_credentials_only(value);
    let cleaned = sanitize_plain(&redacted, MAX_ID_LEN);
    if cleaned.is_empty() {
        fallback.to_string()
    } else {
        cleaned
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // Synthetic sentinels only; not valid credentials.
    const SENTINEL: &str = "SYNTHETIC_AUDIT_SENTINEL";

    fn fixed_clock() -> FixedClock {
        FixedClock::new(1_700_000_000_000, "2023-11-14T22:13:20.000Z")
    }

    fn sample_input() -> AuditEventInput {
        AuditEventInput {
            request_id: "req-001".to_string(),
            trace_id: "4bf92f3577b34da6a3ce929d0e0e4736".to_string(),
            agent_id: "finance-agent".to_string(),
            target_server: "prod-db".to_string(),
            tool_name: "execute_sql".to_string(),
            runtime_mode: AuditRuntimeMode::Enforce,
            decision: AuditDecision::Deny,
            policy_version: "sha256:abc".to_string(),
            denial_reason: Some(format!("blocked Bearer {SENTINEL}")),
            validator_summary: vec![
                "sql:verbs=DELETE;readonly=false".to_string(),
                format!("note=password={SENTINEL}"),
            ],
            kill_switch_active: false,
            latency_us: 1234,
        }
    }

    #[test]
    fn builds_contract_shaped_event() {
        let event = sample_input().build(&fixed_clock());
        assert_eq!(event.timestamp_rfc3339, "2023-11-14T22:13:20.000Z");
        assert_eq!(event.request_id, "req-001");
        assert_eq!(event.runtime_mode, "enforce");
        assert_eq!(event.decision, "DENY");
        assert_eq!(event.validator_summary.len(), 2);
        assert!(!event.kill_switch_active);
        assert_eq!(event.latency_us, 1234);
    }

    #[test]
    fn redacts_reason_and_summary_before_serialization() {
        let event = sample_input().build(&fixed_clock());
        let json = serde_json::to_string(&event).unwrap();
        assert!(!json.contains(SENTINEL), "json: {json}");
        assert!(!json.contains("Bearer SYNTHETIC"), "json: {json}");
        assert!(json.contains("[REDACTED]"));
    }

    #[test]
    fn decision_event_has_exactly_the_contract_fields() {
        let event = sample_input().build(&fixed_clock());
        let value = serde_json::to_value(&event).unwrap();
        let object = value.as_object().unwrap();
        let mut keys: Vec<&str> = object.keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(
            keys,
            vec![
                "agent_id",
                "decision",
                "denial_reason",
                "kill_switch_active",
                "latency_us",
                "policy_version",
                "request_id",
                "runtime_mode",
                "target_server",
                "timestamp_rfc3339",
                "tool_name",
                "trace_id",
                "validator_summary",
            ]
        );
    }

    #[test]
    fn caps_validator_summary_count_and_length() {
        let mut input = sample_input();
        input.validator_summary = (0..100)
            .map(|index| format!("validator-{index}:{}", "x".repeat(2_000)))
            .collect();
        let event = input.build(&fixed_clock());
        assert_eq!(event.validator_summary.len(), MAX_SUMMARY_ENTRIES);
        assert!(event
            .validator_summary
            .iter()
            .all(|summary| summary.chars().count() <= MAX_SUMMARY_ENTRY_LEN));
    }

    #[test]
    fn missing_identity_fields_get_documented_fallbacks() {
        let mut input = sample_input();
        input.agent_id.clear();
        input.target_server.clear();
        input.request_id.clear();
        let event = input.build(&fixed_clock());
        assert_eq!(event.agent_id, "anonymous");
        assert_eq!(event.target_server, "unknown");
        assert_eq!(event.request_id, "unknown");
    }

    #[test]
    fn kill_switch_event_has_discriminator_and_redacted_reason() {
        let input = KillSwitchAuditInput {
            action: "revoke".to_string(),
            target_kind: "agent".to_string(),
            target_id: "finance-agent".to_string(),
            actor: "operator@example.com".to_string(),
            reason: format!("compromised token Bearer {SENTINEL}"),
            previous_state_version: 4,
            state_version: 5,
            outcome: "applied".to_string(),
            source: "cli".to_string(),
            request_id: Some("kill-001".to_string()),
        };
        let event = input.build(&fixed_clock());
        assert_eq!(event.event_type, "kill_switch_action");
        assert_eq!(event.previous_state_version, 4);
        assert_eq!(event.state_version, 5);
        assert!(!event.reason.contains(SENTINEL));
        let json = serde_json::to_string(&event).unwrap();
        assert!(!json.contains(SENTINEL), "json: {json}");
    }

    #[test]
    fn denials_are_critical_and_allows_are_routine() {
        let deny = AuditRecord::Decision(sample_input().build(&fixed_clock()));
        assert!(deny.is_critical());
        assert_eq!(deny.record_type(), "decision");

        let mut allow_input = sample_input();
        allow_input.decision = AuditDecision::Allow;
        allow_input.denial_reason = None;
        let allow = AuditRecord::Decision(allow_input.build(&fixed_clock()));
        assert!(!allow.is_critical());

        let kill = AuditRecord::KillSwitchAction(
            KillSwitchAuditInput {
                action: "revoke".to_string(),
                target_kind: "global".to_string(),
                target_id: "*".to_string(),
                actor: "operator".to_string(),
                reason: "freeze".to_string(),
                previous_state_version: 0,
                state_version: 1,
                outcome: "applied".to_string(),
                source: "cli".to_string(),
                request_id: None,
            }
            .build(&fixed_clock()),
        );
        assert!(kill.is_critical());
        assert_eq!(kill.record_type(), "kill_switch_action");
    }

    #[test]
    fn record_serializes_to_one_json_object() {
        let record = AuditRecord::Decision(sample_input().build(&fixed_clock()));
        let line = record.to_json_line().unwrap();
        assert!(!line.contains('\n'));
        let value: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(value["decision"], json!("DENY"));
    }
}
