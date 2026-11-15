# Revocation lookup and update API

**Owner:** Team 5 (`@axiom-nhi/team-5-observability`)
**Status:** Draft `0.1.0-draft` — proposal, not frozen.
**Implementation:** `observability/kill-switch/` (`axiom-kill-switch`).
**Consumers:** Team 2 (decision orchestration), Team 1 (enforcement), Team 6 (QA).

This document defines the revocation state Team 5 owns, the read and write
operations, precedence, versioning, and the behavior when state is stale or
unavailable. It does not define an admin wire protocol; the admin API is
in-process in Phase 1.

## 1. Scope

In scope:

- in-memory revocation state for `global`, `mcp_server`, `agent`, and `tool`
  targets;
- a lock-free read path for the request pipeline;
- a serialized admin update path;
- versioned snapshots, restart persistence, and a cached consumer reader;
- audit records for admin actions.

Out of scope for Phase 1:

- cancelling an upstream call that is already running;
- SIEM/SOAR forwarding, approval workflows, or Postgres history;
- per-token (`jti`) revocation;
- a public admin HTTP/gRPC protocol;
- distributed consensus. A second authority instance is a Phase 2 concern.

## 2. State model

```rust
pub enum RevocationTargetKind {
    Global,     // emergency freeze
    McpServer,  // one backend MCP server
    Agent,      // one authenticated identity (JWT sub)
    Tool,       // one tool on one server
}

pub struct RevocationState {
    pub target_kind: RevocationTargetKind,
    pub target_id: String,
    pub revoked: bool,
    pub state_version: u64,
    pub effective_unix_ms: i64,
    pub reason: String,
}
```

`RevocationState` mirrors the shared draft contract field-for-field. The
snapshot envelope around it is a Team 5 draft:

```rust
pub struct RevocationSnapshot {
    pub epoch: String,
    pub version: u64,
    pub generated_at_unix_ms: i64,
    pub entries: BTreeMap<String, RevocationState>, // keyed by internal canonical key
}
```

### 2.1 Target identifiers

| Kind | `target_id` | Example |
| --- | --- | --- |
| `global` | `*` | `*` |
| `mcp_server` | Canonical server name, unchanged | `prod-db` |
| `agent` | Verified `IdentityContext.agent_id` (JWT `sub`), unchanged | `finance-agent` |
| `tool` | `<server>/<tool>` with each component percent-encoded | `prod-db/execute_sql` |

Tool targets percent-encode `%`, `/`, `:`, `*`, and control bytes so a `/` in a
server or tool name cannot create an ambiguous composite key:

```text
RevocationTarget::tool("prod/db", "execute/sql")
  target_id    = "prod%2Fdb/execute%2Fsql"
  canonical key = "t:prod%2Fdb/execute%2Fsql"
```

Internal keys use prefixes to prevent cross-kind collisions:

| Kind | Internal key |
| --- | --- |
| global | `g:*` |
| mcp_server | `s:<encoded server>` |
| agent | `a:<encoded agent>` |
| tool | `t:<encoded server>/<encoded tool>` |

Components are trimmed and limited to 256 characters, and control characters
are rejected. An agent named `*` cannot collide with the global target because
the prefixes differ.

### 2.2 Match precedence

Any active match blocks. Precedence only selects the **primary reason** reported
to audit and to the caller:

```text
global (0) > mcp_server (1) > agent (2) > tool (3)
```

All matches are retained and returned in that order, then by target id for
determinism. A revoked global target therefore reports `global` as the primary
reason even if the agent, server, and tool are also revoked.

### 2.3 Why two phases

| Target kind | Known before identity? |
| --- | --- |
| `global` | yes |
| `mcp_server` | yes |
| `tool` | yes |
| `agent` | no — requires a verified `IdentityContext` |

Team 2 must call `check_pre_identity` before identity and
`check_post_identity` after identity. A single pre-identity call cannot enforce
agent revocation. This is proposal **P1** in
[../INTERFACE_PROPOSAL.md](../INTERFACE_PROPOSAL.md).

## 3. Lookup API

```rust
pub struct RevocationQuery<'a> {
    pub agent_id: Option<&'a str>,
    pub target_server: &'a str,
    pub tool_name: &'a str, // empty means "not a tool call"
}

impl<'a> RevocationQuery<'a> {
    pub fn pre_identity(target_server: &'a str, tool_name: &'a str) -> Self;
    pub fn post_identity(agent_id: &'a str, target_server: &'a str, tool_name: &'a str) -> Self;
}

pub enum RevocationDecision {
    Active {
        epoch: String,
        state_version: u64,
        evaluated_at_unix_ms: i64,
    },
    Revoked {
        epoch: String,
        state_version: u64,
        evaluated_at_unix_ms: i64,
        matches: Vec<RevocationMatch>,
        primary: RevocationMatch,
    },
    Stale {
        epoch: String,
        state_version: u64,
        age_ms: u64,
        max_staleness_ms: u64,
        matches: Vec<RevocationMatch>,
        primary: Option<RevocationMatch>,
    },
    Unavailable {
        reason: String,
    },
}
```

`RevocationStore::lookup(&RevocationQuery)` and
`CachedRevocationReader::lookup(...)` are lock-free. The reader clones an `Arc`
to the current snapshot; it never allocates a map and never takes the update
mutex.

The draft consumer trait is:

```rust
pub trait RevocationChecker: Send + Sync {
    fn check_pre_identity(&self, target_server: &str, tool_name: Option<&str>)
        -> RevocationDecision;
    fn check_post_identity(&self, agent_id: &str, target_server: &str, tool_name: Option<&str>)
        -> RevocationDecision;
}
```

### 3.1 Decision semantics

| Decision | Meaning | Enforce mode | Observe-only |
| --- | --- | --- | --- |
| `Active` | Fresh state, no match | allow | allow |
| `Revoked` | Fresh state, at least one match | block | block if revocation overrides observe-only, else `WOULD_DENY` and forward |
| `Stale` with `primary = Some` | Freshness bound exceeded but a last-known match exists | block | block if revocation overrides observe-only, else shadow and forward |
| `Stale` with `primary = None` | Freshness bound exceeded, no last-known match | **block (fail closed)** | shadow (`WOULD_DENY`) and forward |
| `Unavailable` | No state could be read | **block (fail closed)** | shadow (`WOULD_DENY`) and forward |

`RevocationDecision::recommended_action(mode, kill_switch_overrides_observe_only,
fail_closed_on_unavailable)` implements this table. The gateway still owns the
final behavior; this helper keeps both teams aligned.

### 3.2 Why stale-with-match still blocks

Forgetting a match because the refresh loop fell behind would reopen exactly the
path an operator closed. The last known snapshot is therefore authoritative for
matches until a newer snapshot explicitly clears them. Version and epoch travel
with every decision so audit can show which state was used.

### 3.3 Freshness does not apply to the authority

The local `RevocationStore` is the authority and is always fresh
(`max_staleness_ms = u64::MAX`). Freshness matters for
`CachedRevocationReader`, which starts **unloaded** and reports `Unavailable`
until its first successful install.

## 4. Versioning and epochs

Every snapshot carries an `epoch` and a monotonic `version`.

| Situation | Behavior |
| --- | --- |
| Same epoch, incoming `version > current` | install |
| Same epoch, incoming `version <= current` | no-op (`AlreadyLatest`); state does not move backwards |
| Different epoch, any version | reject with `EpochMismatch` unless `allow_epoch_change = true` |
| Different epoch with explicit opt-in | install and log a warning |
| First install into an unloaded reader | accepted; defines the epoch |
| Malformed snapshot | reject whole; live state untouched |

An epoch identifies an authority instance. It changes when a new authority
starts or state is rebuilt. Rejecting unannounced epoch changes prevents a
restarted or misconfigured authority from silently rewinding revocation state.
An operator who intentionally replaces the authority must opt in and is
audited by the resulting admin action log and warning.

`state_version` on each entry is the snapshot version when it last changed. It
is not a timestamp. Two entries can carry different state versions; the
snapshot version is the maximum.

## 5. Update API

```rust
pub enum RevocationAction {
    Revoke,
    Clear,
}

pub struct RevocationCommand {
    pub target: RevocationTarget,
    pub action: RevocationAction,
    pub reason: String,
    pub effective_unix_ms: Option<i64>,
}

pub enum UpdateOutcome {
    Applied { previous_version: u64, version: u64 },
    AlreadyInDesiredState { version: u64, revoked: bool },
}
```

### 5.1 Validation

| Rule | Result |
| --- | --- |
| Reason trimmed empty | `EmptyReason` |
| Reason > 2048 characters | `ReasonTooLong` |
| Reason contains control characters | `ControlCharacter` |
| Effective time more than 60 s ahead | `ScheduledNotSupported` |
| Target component empty, > 256 chars, or control characters | `InvalidTarget` |
| Snapshot internally inconsistent | `InvalidSnapshot` |
| Snapshot older than current in the same epoch | no-op |
| Snapshot from a different epoch without opt-in | `EpochMismatch` |

The service redacts the reason **before** storage. A secret pasted into an
operator note never reaches the snapshot file or audit record.

### 5.2 Idempotency and tombstones

Repeating `revoke` on an already-revoked target returns
`AlreadyInDesiredState` without bumping the version, so polling admin clients do
not create version churn. `clear` writes `revoked = false` rather than deleting
the entry. The tombstone makes the clear observable and keeps the version
history meaningful. Compaction is deferred; the Phase 1 entry count is bounded
by operator actions, not request volume.

### 5.3 Concurrency

- Reads: `arc_swap::ArcSwap<StoreState>` — no lock, no allocation beyond the
  `Arc` clone and the match vector.
- Updates: a `Mutex<()>` taken only by `apply` / `install_snapshot`.
- The update clones the snapshot, mutates the copy, validates it, then swaps.
  Readers see either the old or the new snapshot, never a partial one.
- Losing a concurrent update is prevented by the mutex. Throughput on the admin
  path is not a Gate G1 requirement.

## 6. Admin service and audit

```rust
pub struct KillSwitchService { /* store + optional audit sink + optional snapshot path */ }

impl KillSwitchService {
    pub fn new(store: Arc<RevocationStore>) -> Self;
    pub fn with_audit(self, sink: Arc<dyn AuditSink>) -> Self;
    pub fn with_persistence(self, path: impl Into<PathBuf>) -> Self;
    pub fn revoke(&self, target: RevocationTarget, reason: impl Into<String>,
                  actor: &str, source: AdminSource) -> Result<AdminActionResult, RevocationError>;
    pub fn clear(&self, target: RevocationTarget, reason: impl Into<String>,
                 actor: &str, source: AdminSource) -> Result<AdminActionResult, RevocationError>;
    pub fn apply(&self, command: RevocationCommand, actor: &str,
                 source: AdminSource, request_id: Option<String>)
        -> Result<AdminActionResult, RevocationError>;
}
```

Every attempt produces a kill-switch audit record, including a rejected one
(`outcome = "rejected"`). The record is always **critical** priority, so it is
not shed while routine `ALLOW` records are under pressure. If the critical queue
is full, the record is dropped and counted; the action still succeeds and the
drop is observable through `axiom.audit.dropped.total`.

Audit outcome values:

| `outcome` | Meaning |
| --- | --- |
| `applied` | State changed; `previous_state_version != state_version` |
| `already_in_desired_state` | No change; versions equal |
| `rejected` | Validation failed; state unchanged |

`source` values in this slice: `cli`, `unix_socket`, `loopback_http`, `test`.
Transport implementations are not included.

## 7. Persistence and restart

`save_snapshot` writes the whole snapshot to a sibling temporary file, flushes,
syncs, and renames. On Unix the temporary file is created `0600`. On Windows the
rename falls back to remove-then-rename because `std::fs::rename` cannot replace
an existing file; that window is documented, not hidden.

`load_snapshot` validates before returning. A corrupt or internally inconsistent
file is a hard error, not a partial load. Callers can use:

```rust
let snapshot = load_snapshot("/var/lib/axiom/revocation.json")?;
let store = RevocationStore::from_snapshot(snapshot, clock)?;
```

Persistence is best-effort for the last update: a crash between the state swap
and the file write keeps the live state but loses the file update. The next
successful admin action rewrites the full snapshot.

## 8. How state reaches the ExtMCP decision path

```text
operator ──► KillSwitchService ──► RevocationStore (authority, ArcSwap)
                                     │
                                     ├── audit: KillSwitchAuditEvent (critical)
                                     └── snapshot file (optional restart recovery)
                                             │
                                     CachedRevocationReader (Team 2 process)
                                             │  check_pre_identity
                                             │  check_post_identity
                                             ▼
                                      Team 2 CheckPipeline
                                             │
                                             ▼
                                      Team 1 gateway enforcement
```

Team 2 never owns storage. It holds a reader (or a mock) and asks two questions.
Team 1 never reads revocation state directly per request; it acts on Team 2's
decision. The adapter from `RevocationDecision` to Team 2's
`RevocationOutcome` is Team 2's code change (P1).

## 9. Performance characteristics

- Lookup is a pointer load plus up to four `BTreeMap` probes. It does not take
  the update mutex and does not perform I/O.
- The update path clones the snapshot. Phase 1 snapshots are operator-sized
  (tens to hundreds of entries), not request-sized.
- The in-process probe reports low-microsecond lookup cost on a developer
  machine. Those numbers are illustrative only; the measurement method, not the
  numbers, is the commitment. See [../MEASUREMENT.md](../MEASUREMENT.md).

## 10. Open decisions

1. Tool `target_id` encoding: exact percent-encoding set (Team 0).
2. `global` `target_id`: `*` versus empty string (Team 0).
3. Admin audit record shape and stream placement (Team 0).
4. Cross-process snapshot transport (Team 0, post-G1).
5. Entry compaction policy for long-lived tombstones (Team 5, post-G1).
6. Whether `Stale` with no match should block in enforce mode (recommended yes).

## 11. Test coverage in this slice

The crate-level tests cover:

- canonical keys and separator encoding;
- per-kind matching and scoping;
- precedence ordering with four simultaneous matches;
- pre-identity versus post-identity agent behavior;
- idempotent revoke and clear tombstones;
- version monotonicity and epoch rejection;
- malformed snapshot rejection without partial application;
- unloaded reader `Unavailable` and fail-closed recommendation;
- stale evaluation with explicit age;
- admin audit records for applied, cleared, and rejected commands;
- reason redaction before storage and audit;
- snapshot persistence round-trip, corrupt file, and wrong-key rejection.

Run them with:

```text
cargo test -p axiom-kill-switch
```
