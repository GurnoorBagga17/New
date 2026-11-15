// Copyright 2024 Axiom NHI — Licensed under Apache-2.0
//! Revocation model, target canonicalization, and key precedence.
//!
//! The shared draft contract lists four target kinds: `agent`, `tool`,
//! `mcp_server`, and `global`. This module keeps those names on the wire while
//! adding deterministic internal keys and a documented precedence for choosing
//! the primary audit reason when several entries match.

use std::collections::BTreeMap;
use std::fmt;

use serde::{Deserialize, Serialize};

use crate::RevocationError;

/// Canonical revocation target kinds.
///
/// The declaration order is the primary-reason precedence:
/// `global` (0), `mcp_server` (1), `agent` (2), `tool` (3). Every matching
/// entry still blocks; precedence only selects which match is reported as the
/// primary cause.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RevocationTargetKind {
    /// Emergency gateway freeze.
    Global,
    /// An entire MCP server.
    McpServer,
    /// A specific agent identity.
    Agent,
    /// A specific tool on a specific server.
    Tool,
}

impl RevocationTargetKind {
    /// Contract string for this kind.
    pub fn as_contract_str(&self) -> &'static str {
        match self {
            Self::Global => "global",
            Self::McpServer => "mcp_server",
            Self::Agent => "agent",
            Self::Tool => "tool",
        }
    }

    /// Precedence rank used to select the primary match.
    pub fn precedence_rank(&self) -> u8 {
        match self {
            Self::Global => 0,
            Self::McpServer => 1,
            Self::Agent => 2,
            Self::Tool => 3,
        }
    }

    /// Parse a contract `target_kind` string.
    pub fn from_contract_str(value: &str) -> Result<Self, RevocationError> {
        match value {
            "global" => Ok(Self::Global),
            "mcp_server" | "server" => Ok(Self::McpServer),
            "agent" => Ok(Self::Agent),
            "tool" => Ok(Self::Tool),
            other => Err(RevocationError::InvalidTarget(format!(
                "unknown target_kind '{other}'"
            ))),
        }
    }
}

impl fmt::Display for RevocationTargetKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_contract_str())
    }
}

/// A validated revocation target.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct RevocationTarget {
    kind: RevocationTargetKind,
    id: String,
}

impl RevocationTarget {
    /// The global target.
    pub fn global() -> Self {
        Self {
            kind: RevocationTargetKind::Global,
            id: "*".to_string(),
        }
    }

    /// An agent target keyed by the authenticated agent ID (`JWT sub`).
    pub fn agent(id: impl Into<String>) -> Result<Self, RevocationError> {
        let id = validate_component(&id.into(), "agent id")?;
        Ok(Self {
            kind: RevocationTargetKind::Agent,
            id,
        })
    }

    /// A server target keyed by the canonical MCP server name.
    pub fn server(name: impl Into<String>) -> Result<Self, RevocationError> {
        let id = validate_component(&name.into(), "server name")?;
        Ok(Self {
            kind: RevocationTargetKind::McpServer,
            id,
        })
    }

    /// A tool target keyed by `server/tool`.
    ///
    /// Each component is percent-encoded so a `/` inside a server or tool name
    /// cannot create an ambiguous composite key.
    pub fn tool(
        server: impl Into<String>,
        tool: impl Into<String>,
    ) -> Result<Self, RevocationError> {
        let server = validate_component(&server.into(), "server name")?;
        let tool = validate_component(&tool.into(), "tool name")?;
        Ok(Self {
            kind: RevocationTargetKind::Tool,
            id: format!("{}/{}", encode_component(&server), encode_component(&tool)),
        })
    }

    /// Rebuild a target from the shared contract's `target_kind` and `target_id`.
    pub fn from_contract(
        kind: RevocationTargetKind,
        id: impl Into<String>,
    ) -> Result<Self, RevocationError> {
        let id = id.into();
        match kind {
            RevocationTargetKind::Global => {
                if id.is_empty() || id == "*" {
                    Ok(Self::global())
                } else {
                    Err(RevocationError::InvalidTarget(
                        "global target_id must be '*'".to_string(),
                    ))
                }
            }
            RevocationTargetKind::Agent => Self::agent(id),
            RevocationTargetKind::McpServer => Self::server(id),
            RevocationTargetKind::Tool => {
                let (server, tool) = id.split_once('/').ok_or_else(|| {
                    RevocationError::InvalidTarget(
                        "tool target_id must be '<server>/<tool>'".to_string(),
                    )
                })?;
                let server = decode_component(server)?;
                let tool = decode_component(tool)?;
                Self::tool(server, tool)
            }
        }
    }

    /// Target kind.
    pub fn kind(&self) -> RevocationTargetKind {
        self.kind
    }

    /// Contract-visible target identifier.
    ///
    /// For tools this is the canonical `server/tool` pair with each component
    /// percent-encoded.
    pub fn id(&self) -> &str {
        &self.id
    }

    /// Internal canonical key used by the snapshot index.
    ///
    /// Prefixes avoid collisions between an agent named `*` and the global
    /// target, or between a server and an agent with the same name.
    pub fn canonical_key(&self) -> String {
        match self.kind {
            RevocationTargetKind::Global => global_key(),
            RevocationTargetKind::McpServer => server_key(&self.id),
            RevocationTargetKind::Agent => agent_key(&self.id),
            RevocationTargetKind::Tool => format!("t:{}", self.id),
        }
    }

    /// Convert to the shared contract shape.
    pub fn to_state(
        &self,
        revoked: bool,
        state_version: u64,
        effective_unix_ms: i64,
        reason: impl Into<String>,
    ) -> RevocationState {
        RevocationState {
            target_kind: self.kind,
            target_id: self.id.clone(),
            revoked,
            state_version,
            effective_unix_ms,
            reason: reason.into(),
        }
    }
}

/// Internal key for the global target.
pub fn global_key() -> String {
    "g:*".to_string()
}

/// Internal key for an agent.
pub fn agent_key(agent_id: &str) -> String {
    format!("a:{}", encode_component(agent_id))
}

/// Internal key for a server.
pub fn server_key(server: &str) -> String {
    format!("s:{}", encode_component(server))
}

/// Internal key for a tool on a server.
pub fn tool_key(server: &str, tool: &str) -> String {
    format!("t:{}/{}", encode_component(server), encode_component(tool))
}

/// A revocation state entry mirroring the shared draft contract.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RevocationState {
    /// Target kind.
    pub target_kind: RevocationTargetKind,
    /// Contract-visible target identifier.
    pub target_id: String,
    /// Whether the target is currently revoked.
    pub revoked: bool,
    /// Snapshot version when this entry last changed.
    pub state_version: u64,
    /// When the state became effective, in Unix milliseconds.
    pub effective_unix_ms: i64,
    /// Operator reason (redacted before storage by the service layer).
    pub reason: String,
}

/// A complete, versioned revocation snapshot.
///
/// `entries` is keyed by the internal canonical key. The value preserves the
/// shared `RevocationState` shape. This envelope is a Team 5 draft; Team 0 has
/// not frozen a snapshot-transport contract.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RevocationSnapshot {
    /// Authority instance identifier. Changes when a new authority starts.
    pub epoch: String,
    /// Monotonic snapshot version within an epoch.
    pub version: u64,
    /// When the snapshot was produced, in Unix milliseconds.
    pub generated_at_unix_ms: i64,
    /// Entries keyed by canonical target key.
    pub entries: BTreeMap<String, RevocationState>,
}

impl RevocationSnapshot {
    /// Create an empty snapshot.
    pub fn empty(epoch: impl Into<String>, now_unix_ms: i64) -> Self {
        Self {
            epoch: epoch.into(),
            version: 0,
            generated_at_unix_ms: now_unix_ms,
            entries: BTreeMap::new(),
        }
    }

    /// Validate internal consistency.
    ///
    /// This is applied to snapshots loaded from disk or received from a sync
    /// source. A malformed snapshot is rejected rather than partially applied.
    pub fn validate(&self) -> Result<(), RevocationError> {
        validate_component(&self.epoch, "epoch")?;
        for (key, state) in &self.entries {
            let kind = state.target_kind;
            let target = RevocationTarget::from_contract(kind, state.target_id.clone())?;
            if target.canonical_key() != *key {
                return Err(RevocationError::InvalidSnapshot(format!(
                    "entry key '{key}' does not match target '{}'",
                    target.canonical_key()
                )));
            }
            if state.state_version > self.version {
                return Err(RevocationError::InvalidSnapshot(format!(
                    "entry state_version {} exceeds snapshot version {}",
                    state.state_version, self.version
                )));
            }
            if state.reason.chars().count() > 2_048 {
                return Err(RevocationError::InvalidSnapshot(
                    "entry reason exceeds 2048 characters".to_string(),
                ));
            }
            if state.reason.chars().any(|c| c.is_control()) {
                return Err(RevocationError::InvalidSnapshot(
                    "entry reason contains control characters".to_string(),
                ));
            }
        }
        Ok(())
    }

    /// Look up an entry by canonical key.
    pub fn get(&self, key: &str) -> Option<&RevocationState> {
        self.entries.get(key)
    }

    /// Iterate over active (`revoked = true`) entries.
    pub fn active_entries(&self) -> impl Iterator<Item = (&String, &RevocationState)> {
        self.entries.iter().filter(|(_, state)| state.revoked)
    }

    /// Number of entries, including explicit clear tombstones.
    pub fn entry_count(&self) -> usize {
        self.entries.len()
    }
}

/// A query against revocation state.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RevocationQuery<'a> {
    /// Authenticated agent ID, when identity verification has already run.
    pub agent_id: Option<&'a str>,
    /// Target MCP server.
    pub target_server: &'a str,
    /// Tool name; may be empty for non-tool methods.
    pub tool_name: &'a str,
}

impl<'a> RevocationQuery<'a> {
    /// Query before identity verification. Agent revocations cannot match yet.
    pub fn pre_identity(target_server: &'a str, tool_name: &'a str) -> Self {
        Self {
            agent_id: None,
            target_server,
            tool_name,
        }
    }

    /// Query after identity verification. Agent revocations can match.
    pub fn post_identity(agent_id: &'a str, target_server: &'a str, tool_name: &'a str) -> Self {
        Self {
            agent_id: Some(agent_id),
            target_server,
            tool_name,
        }
    }
}

/// One matching revocation entry.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RevocationMatch {
    /// Matching target.
    pub target: RevocationTarget,
    /// Snapshot version when this entry last changed.
    pub state_version: u64,
    /// When the entry became effective, in Unix milliseconds.
    pub effective_unix_ms: i64,
    /// Reason recorded for the entry.
    pub reason: String,
}

/// Result of a revocation lookup.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RevocationDecision {
    /// The state was fresh and no entry matched.
    Active {
        /// Snapshot epoch.
        epoch: String,
        /// Snapshot version.
        state_version: u64,
        /// When the lookup ran, in Unix milliseconds.
        evaluated_at_unix_ms: i64,
    },
    /// The state was fresh and at least one entry matched.
    Revoked {
        /// Snapshot epoch.
        epoch: String,
        /// Snapshot version.
        state_version: u64,
        /// When the lookup ran, in Unix milliseconds.
        evaluated_at_unix_ms: i64,
        /// All matching entries, ordered by precedence.
        matches: Vec<RevocationMatch>,
        /// Highest-precedence match.
        primary: RevocationMatch,
    },
    /// The last known state is older than the configured freshness bound.
    ///
    /// `matches` reflects the last known snapshot so an observe-only consumer
    /// can still honor a previously observed kill switch.
    Stale {
        /// Snapshot epoch.
        epoch: String,
        /// Last known snapshot version.
        state_version: u64,
        /// Age of the last successful refresh, in milliseconds.
        age_ms: u64,
        /// Configured maximum staleness, in milliseconds.
        max_staleness_ms: u64,
        /// Matches from the last known snapshot.
        matches: Vec<RevocationMatch>,
        /// Highest-precedence last-known match, if any.
        primary: Option<RevocationMatch>,
    },
    /// No revocation state could be read.
    Unavailable {
        /// Human-readable reason.
        reason: String,
    },
}

impl RevocationDecision {
    /// Whether a revocation match exists, including a last-known stale match.
    pub fn is_revoked(&self) -> bool {
        match self {
            Self::Revoked { .. } => true,
            Self::Stale { primary, .. } => primary.is_some(),
            Self::Active { .. } | Self::Unavailable { .. } => false,
        }
    }

    /// Whether the decision came from a fresh snapshot.
    pub fn is_fresh(&self) -> bool {
        matches!(self, Self::Active { .. } | Self::Revoked { .. })
    }

    /// Whether state was unavailable or stale.
    pub fn is_degraded(&self) -> bool {
        matches!(self, Self::Stale { .. } | Self::Unavailable { .. })
    }

    /// Snapshot version, when one exists.
    pub fn state_version(&self) -> Option<u64> {
        match self {
            Self::Active { state_version, .. } | Self::Revoked { state_version, .. } => {
                Some(*state_version)
            }
            Self::Stale { state_version, .. } => Some(*state_version),
            Self::Unavailable { .. } => None,
        }
    }

    /// Snapshot epoch, when one exists.
    pub fn epoch(&self) -> Option<&str> {
        match self {
            Self::Active { epoch, .. } | Self::Revoked { epoch, .. } => Some(epoch),
            Self::Stale { epoch, .. } => Some(epoch),
            Self::Unavailable { .. } => None,
        }
    }

    /// All matches, if any.
    pub fn matches(&self) -> &[RevocationMatch] {
        match self {
            Self::Revoked { matches, .. } | Self::Stale { matches, .. } => matches,
            Self::Active { .. } | Self::Unavailable { .. } => &[],
        }
    }

    /// Highest-precedence match, if any.
    pub fn primary_match(&self) -> Option<&RevocationMatch> {
        match self {
            Self::Revoked { primary, .. } => Some(primary),
            Self::Stale { primary, .. } => primary.as_ref(),
            Self::Active { .. } | Self::Unavailable { .. } => None,
        }
    }

    /// Recommendation for the gateway/policy enforcement point.
    ///
    /// This is a pure helper. Team 1 owns the final gateway behavior and Team 2
    /// owns the policy pipeline; the recommendation is documented in
    /// `REVOCATION_API.md` and `INTERFACE_PROPOSAL.md`.
    pub fn recommended_action(
        &self,
        mode: EnforcementMode,
        kill_switch_overrides_observe_only: bool,
        fail_closed_on_unavailable: bool,
    ) -> RecommendedAction {
        match (self, mode) {
            (Self::Active { .. }, _) => RecommendedAction::Allow,
            (Self::Revoked { .. }, EnforcementMode::Enforce) => RecommendedAction::Block,
            (Self::Revoked { .. }, EnforcementMode::ObserveOnly) => {
                if kill_switch_overrides_observe_only {
                    RecommendedAction::Block
                } else {
                    RecommendedAction::AllowWithShadow
                }
            }
            (Self::Stale { primary, .. }, _) if primary.is_some() => {
                if mode == EnforcementMode::Enforce || kill_switch_overrides_observe_only {
                    RecommendedAction::Block
                } else {
                    RecommendedAction::AllowWithShadow
                }
            }
            (Self::Stale { .. } | Self::Unavailable { .. }, EnforcementMode::Enforce) => {
                if fail_closed_on_unavailable {
                    RecommendedAction::Block
                } else {
                    RecommendedAction::Allow
                }
            }
            (Self::Stale { .. } | Self::Unavailable { .. }, EnforcementMode::ObserveOnly) => {
                RecommendedAction::AllowWithShadow
            }
        }
    }
}

/// Enforcement mode at the decision point.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EnforcementMode {
    /// Enforce decisions; unavailable required state fails closed.
    Enforce,
    /// Record shadow decisions and forward.
    ObserveOnly,
}

/// Recommended action for the enforcement point.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecommendedAction {
    /// Forward the request.
    Allow,
    /// Block the request.
    Block,
    /// Forward but emit a shadow decision.
    AllowWithShadow,
}

/// Kill-switch action.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RevocationAction {
    /// Activate revocation.
    Revoke,
    /// Clear revocation.
    Clear,
}

impl RevocationAction {
    /// Contract string for the action.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Revoke => "revoke",
            Self::Clear => "clear",
        }
    }
}

impl fmt::Display for RevocationAction {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// State mutation command.
#[derive(Debug, Clone)]
pub struct RevocationCommand {
    /// Target to mutate.
    pub target: RevocationTarget,
    /// Revoke or clear.
    pub action: RevocationAction,
    /// Operator reason. Must be non-empty and free of control characters.
    pub reason: String,
    /// Optional effective time. Phase 1 rejects scheduling more than 60 s ahead.
    pub effective_unix_ms: Option<i64>,
}

impl RevocationCommand {
    /// Create a command.
    pub fn new(
        target: RevocationTarget,
        action: RevocationAction,
        reason: impl Into<String>,
    ) -> Self {
        Self {
            target,
            action,
            reason: reason.into(),
            effective_unix_ms: None,
        }
    }

    /// Create a command with an explicit effective time.
    pub fn with_effective_unix_ms(mut self, effective_unix_ms: i64) -> Self {
        self.effective_unix_ms = Some(effective_unix_ms);
        self
    }

    /// Validate the command.
    pub fn validate(&self, now_unix_ms: i64) -> Result<(), RevocationError> {
        let reason = self.reason.trim();
        if reason.is_empty() {
            return Err(RevocationError::EmptyReason);
        }
        if reason.chars().count() > 2_048 {
            return Err(RevocationError::ReasonTooLong);
        }
        if reason.chars().any(|c| c.is_control()) {
            return Err(RevocationError::ControlCharacter(
                "reason contains control characters".to_string(),
            ));
        }
        if let Some(effective) = self.effective_unix_ms {
            if effective > now_unix_ms.saturating_add(60_000) {
                return Err(RevocationError::ScheduledNotSupported);
            }
        }
        Ok(())
    }
}

/// Result of applying a command.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UpdateOutcome {
    /// The target changed state.
    Applied {
        /// Version before the change.
        previous_version: u64,
        /// Version after the change.
        version: u64,
    },
    /// The target was already in the requested state.
    AlreadyInDesiredState {
        /// Current version, unchanged.
        version: u64,
        /// Current revoked value.
        revoked: bool,
    },
}

impl UpdateOutcome {
    /// Version after the operation.
    pub fn version(&self) -> u64 {
        match self {
            Self::Applied { version, .. } | Self::AlreadyInDesiredState { version, .. } => *version,
        }
    }

    /// Version before the operation.
    pub fn previous_version(&self) -> u64 {
        match self {
            Self::Applied {
                previous_version, ..
            } => *previous_version,
            Self::AlreadyInDesiredState { version, .. } => *version,
        }
    }

    /// Short outcome label for audit.
    pub fn outcome_label(&self) -> &'static str {
        match self {
            Self::Applied { .. } => "applied",
            Self::AlreadyInDesiredState { .. } => "already_in_desired_state",
        }
    }
}

fn validate_component(value: &str, field: &str) -> Result<String, RevocationError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(RevocationError::InvalidTarget(format!("{field} is empty")));
    }
    if trimmed.chars().count() > 256 {
        return Err(RevocationError::InvalidTarget(format!(
            "{field} exceeds 256 characters"
        )));
    }
    if trimmed.chars().any(|c| c.is_control()) {
        return Err(RevocationError::InvalidTarget(format!(
            "{field} contains control characters"
        )));
    }
    Ok(trimmed.to_string())
}

/// Percent-encode characters that would make a composite key ambiguous.
fn encode_component(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'%' => out.push_str("%25"),
            b'/' => out.push_str("%2F"),
            b':' => out.push_str("%3A"),
            b'*' => out.push_str("%2A"),
            0x00..=0x1f | 0x7f => {
                use std::fmt::Write as _;
                let _ = write!(out, "%{byte:02X}");
            }
            other => out.push(other as char),
        }
    }
    out
}

fn decode_component(value: &str) -> Result<String, RevocationError> {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len() {
                return Err(RevocationError::InvalidTarget(
                    "truncated percent-encoding in tool target".to_string(),
                ));
            }
            let hi = hex_nibble(bytes[index + 1])?;
            let lo = hex_nibble(bytes[index + 2])?;
            out.push((hi << 4) | lo);
            index += 3;
        } else {
            out.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(out)
        .map_err(|_| RevocationError::InvalidTarget("tool target is not valid UTF-8".to_string()))
}

fn hex_nibble(byte: u8) -> Result<u8, RevocationError> {
    match byte {
        b'0'..=b'9' => Ok(byte - b'0'),
        b'a'..=b'f' => Ok(byte - b'a' + 10),
        b'A'..=b'F' => Ok(byte - b'A' + 10),
        _ => Err(RevocationError::InvalidTarget(
            "invalid percent-encoding in tool target".to_string(),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn target_kind_contract_strings_and_precedence() {
        assert_eq!(RevocationTargetKind::Global.as_contract_str(), "global");
        assert_eq!(
            RevocationTargetKind::McpServer.as_contract_str(),
            "mcp_server"
        );
        assert_eq!(RevocationTargetKind::Agent.as_contract_str(), "agent");
        assert_eq!(RevocationTargetKind::Tool.as_contract_str(), "tool");
        assert!(
            RevocationTargetKind::Global.precedence_rank()
                < RevocationTargetKind::McpServer.precedence_rank()
        );
        assert!(
            RevocationTargetKind::McpServer.precedence_rank()
                < RevocationTargetKind::Agent.precedence_rank()
        );
        assert!(
            RevocationTargetKind::Agent.precedence_rank()
                < RevocationTargetKind::Tool.precedence_rank()
        );
    }

    #[test]
    fn tool_target_encodes_separators() {
        let target = RevocationTarget::tool("prod/db", "execute/sql").unwrap();
        assert_eq!(target.id(), "prod%2Fdb/execute%2Fsql");
        assert_eq!(target.canonical_key(), "t:prod%2Fdb/execute%2Fsql");

        let restored =
            RevocationTarget::from_contract(RevocationTargetKind::Tool, target.id()).unwrap();
        assert_eq!(restored, target);
    }

    #[test]
    fn global_target_normalizes_empty_id() {
        let target = RevocationTarget::from_contract(RevocationTargetKind::Global, "").unwrap();
        assert_eq!(target, RevocationTarget::global());
        assert_eq!(target.canonical_key(), "g:*");
    }

    #[test]
    fn agent_and_server_keys_are_distinct() {
        let agent = RevocationTarget::agent("prod-db").unwrap();
        let server = RevocationTarget::server("prod-db").unwrap();
        assert_ne!(agent.canonical_key(), server.canonical_key());
    }

    #[test]
    fn empty_and_control_targets_are_rejected() {
        assert!(RevocationTarget::agent("  ").is_err());
        assert!(RevocationTarget::server("bad\nserver").is_err());
        assert!(RevocationTarget::tool("server", "").is_err());
    }

    #[test]
    fn snapshot_validation_catches_key_mismatch() {
        let mut snapshot = RevocationSnapshot::empty("epoch-1", 0);
        let entry = RevocationState {
            target_kind: RevocationTargetKind::Agent,
            target_id: "agent-a".to_string(),
            revoked: true,
            state_version: 1,
            effective_unix_ms: 0,
            reason: "test".to_string(),
        };
        snapshot.version = 1;
        snapshot.entries.insert("wrong-key".to_string(), entry);
        assert!(snapshot.validate().is_err());
    }

    #[test]
    fn snapshot_validation_accepts_consistent_entry() {
        let mut snapshot = RevocationSnapshot::empty("epoch-1", 0);
        let target = RevocationTarget::agent("agent-a").unwrap();
        snapshot.version = 1;
        snapshot
            .entries
            .insert(target.canonical_key(), target.to_state(true, 1, 0, "test"));
        snapshot.validate().unwrap();
        assert_eq!(snapshot.active_entries().count(), 1);
    }

    #[test]
    fn command_validation_enforces_reason_and_schedule_rules() {
        let target = RevocationTarget::global();
        assert!(
            RevocationCommand::new(target.clone(), RevocationAction::Revoke, "  ")
                .validate(1_000)
                .is_err()
        );
        assert!(
            RevocationCommand::new(target.clone(), RevocationAction::Revoke, "line\nbreak")
                .validate(1_000)
                .is_err()
        );
        assert!(
            RevocationCommand::new(target.clone(), RevocationAction::Revoke, "ok")
                .with_effective_unix_ms(1_000 + 60_001)
                .validate(1_000)
                .is_err()
        );
        RevocationCommand::new(target, RevocationAction::Revoke, "ok")
            .with_effective_unix_ms(1_000 + 30_000)
            .validate(1_000)
            .unwrap();
    }

    #[test]
    fn recommended_action_matches_documented_matrix() {
        let revoked = RevocationDecision::Revoked {
            epoch: "e".into(),
            state_version: 1,
            evaluated_at_unix_ms: 0,
            matches: vec![],
            primary: RevocationMatch {
                target: RevocationTarget::global(),
                state_version: 1,
                effective_unix_ms: 0,
                reason: "test".into(),
            },
        };
        assert_eq!(
            revoked.recommended_action(EnforcementMode::Enforce, true, true),
            RecommendedAction::Block
        );
        assert_eq!(
            revoked.recommended_action(EnforcementMode::ObserveOnly, true, true),
            RecommendedAction::Block
        );
        assert_eq!(
            revoked.recommended_action(EnforcementMode::ObserveOnly, false, true),
            RecommendedAction::AllowWithShadow
        );

        let unavailable = RevocationDecision::Unavailable {
            reason: "down".into(),
        };
        assert_eq!(
            unavailable.recommended_action(EnforcementMode::Enforce, true, true),
            RecommendedAction::Block
        );
        assert_eq!(
            unavailable.recommended_action(EnforcementMode::ObserveOnly, true, true),
            RecommendedAction::AllowWithShadow
        );
    }
}
