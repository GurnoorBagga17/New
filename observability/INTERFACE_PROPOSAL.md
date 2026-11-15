# Team 5 interface proposal — revocation, audit, and trace context

**Status:** Draft proposal, not an approved contract.
**Schema baseline:** `0.1.0-draft`.
**Author:** Team 5 (`@axiom-nhi/team-5-observability`).
**Coordinator:** Team 0 owns shared contracts, versioning, and the freeze decision.

**Implementation note (2026-11-15):** The two-phase `check_pre_identity` / `check_post_identity` seam described below has been implemented in the Team 2 authorization crate and matched by Team 5's local checker. This proposal remains unapproved as a shared/versioned contract; other decisions in this document remain open.

This document lists the exact cross-team changes Team 5 needs to integrate the
slice safely. None of these changes are applied to `docs/api-contracts/` or
`proto/` by Team 5. Each item names the owner who must make or approve the
change.

## Decision summary

| ID | Change | Owner | Blocks G1? | Team 5 recommendation |
| --- | --- | --- | --- | --- |
| P1 | Split Team 2's revocation seam into pre-identity and post-identity checks | Team 2 + Team 0 | **Yes** | Adopt the two-phase seam below |
| P2 | Add `Stale` and `Unavailable` revocation outcomes; fail closed in enforce mode | Team 2 + Team 0 | **Yes** | Add both outcomes; map to a distinct denial reason |
| P3 | Define revocation `target_id` encoding and snapshot version semantics | Team 0 | **Yes** | Adopt the rules in the [revocation API](kill-switch/REVOCATION_API.md) |
| P4 | Define kill-switch admin action auditing | Team 0 | No (workaround exists) | Separate record shape with `event_type` discriminator |
| P5 | Define `AuditEvent.trace_id` representation | Team 0 | No | 32 lowercase hex characters (W3C trace-id field) |
| P6 | Define `validator_summary` shape | Team 0 + Team 4 | No | Bounded string projection for `0.1.0-draft`; structured type later |
| P7 | Define revocation propagation transport | Team 0 + Team 1 | No (single-process slice works) | In-process reader for G1; authenticated snapshot pull after freeze |
| P8 | Decide whether an active revocation overrides observe-only mode | Team 0 | **Yes** | Revocation wins by default, operator-configurable |
| P9 | `RuntimeRequest.tool_name` behavior for non-tool MCP methods | Team 0 + Team 1 | No | Empty string means "not a tool call" |
| P10 | Per-token (`jti`) revocation | Team 3 + Team 0 | No (Phase 1.1) | Defer; keep `token_jti` available |

---

## P1 — Team 2 revocation seam is a correctness blocker

**Current code** (`services/extmcp/authorization/src/lib.rs`, Team 2):

```rust
pub trait RevocationChecker: Send + Sync {
    fn is_revoked(&self, agent_id: &str, tool_name: &str, server: &str) -> RevocationOutcome;
}
```

Called in `CheckPipeline::execute` before identity verification:

```rust
let revocation_outcome =
    self.revocation_checker
        .is_revoked(&req.tool_name, &req.tool_name, &req.target_server);
```

**Problems**

1. The first argument is documented as `agent_id`, but the caller passes
   `req.tool_name`. An agent revocation can never match, and a tool named like
   an agent can produce a false match.
2. The check runs before identity verification, so the real agent ID is not
   available at that point.
3. `RevocationOutcome` has no `Stale` or `Unavailable` variant. Team 2 cannot
   distinguish "no match" from "state could not be read", so enforce mode has no
   way to fail closed on a missing required decision.
4. The single call mixes target kinds with different availability: `global`,
   `mcp_server`, and `tool` are knowable before identity; `agent` is not.

**Proposed seam** (Team 2 owns the edit; Team 0 approves the contract text):

```rust
/// Revocation state observed by the policy pipeline.
pub enum RevocationOutcome {
    /// Fresh state, no target matched.
    Active { state_version: u64 },
    /// Fresh state, at least one target matched.
    Revoked {
        primary_reason: String,
        matched_targets: Vec<RevokedTarget>,
        state_version: u64,
    },
    /// Last known state is older than the freshness bound.
    Stale {
        last_known_version: u64,
        age_ms: u64,
        primary_reason: Option<String>,
        matched_targets: Vec<RevokedTarget>,
    },
    /// No revocation state could be read.
    Unavailable { reason: String },
}

pub struct RevokedTarget {
    pub target_kind: String, // "global" | "mcp_server" | "agent" | "tool"
    pub target_id: String,
    pub state_version: u64,
    pub reason: String,
}
```

```rust
pub trait RevocationChecker: Send + Sync {
    /// Check global, server, and tool targets. Call before identity.
    fn check_pre_identity(&self, server: &str, tool_name: Option<&str>)
        -> RevocationOutcome;

    /// Check all targets, including agent. Call only after identity.
    fn check_post_identity(&self, agent_id: &str, server: &str, tool_name: Option<&str>)
        -> RevocationOutcome;
}
```

**Pipeline change requested**

1. Run `check_pre_identity(&req.target_server, tool_option)` as Stage 1.
2. Run identity as Stage 2.
3. Run `check_post_identity(&identity.agent_id, &req.target_server, tool_option)`
   as Stage 3, before Cedar evaluation.
4. Treat `Revoked` as a deny with `ErrorCategory::Revoked`.
5. Treat `Unavailable` (and `Stale` with no last-known match) in **enforce** mode
   as a deny with a new `ErrorCategory::RevocationUnavailable`, using denial
   reason `KILL_SWITCH_UNAVAILABLE`. In observe-only mode, record a shadow
   decision and forward.
6. Treat `Stale` with a last-known match as revoked when the Team 0 decision
   says revocation overrides observe-only (P8); otherwise record
   `WOULD_DENY` and forward.

**Adapter ownership.** Team 2's crate may depend on `observability/kill-switch`
without creating a cycle, because Team 5 does not depend on Team 2. Team 5 will
provide the mapping table and review the adapter; Team 2 owns the code change in
`services/extmcp/authorization/`. Sketch for Team 2:

```rust
use axiom_kill_switch::{RevocationChecker as Team5Checker, RevocationDecision};

fn to_outcome(decision: RevocationDecision) -> RevocationOutcome {
    match decision {
        RevocationDecision::Active { state_version, .. } => {
            RevocationOutcome::Active { state_version }
        }
        RevocationDecision::Revoked { primary, matches, state_version, .. } => {
            RevocationOutcome::Revoked {
                primary_reason: primary.reason,
                matched_targets: matches.into_iter().map(to_target).collect(),
                state_version,
            }
        }
        RevocationDecision::Stale { state_version, age_ms, primary, matches, .. } => {
            RevocationOutcome::Stale {
                last_known_version: state_version,
                age_ms,
                primary_reason: primary.map(|entry| entry.reason),
                matched_targets: matches.into_iter().map(to_target).collect(),
            }
        }
        RevocationDecision::Unavailable { reason } => {
            RevocationOutcome::Unavailable { reason }
        }
    }
}
```

**Until P1 lands**, Team 5's slice is testable in isolation against
`StaticRevocationChecker`, but end-to-end agent revocation cannot work.

---

## P2 — Revocation failure semantics and error categories

The shared contract currently defines `ALLOW`, `DENY`, and `WOULD_DENY`, but not
the behavior when revocation state is unavailable. Team 5 recommends:

| Condition | Enforce mode | Observe-only mode | Audit `decision` | Denial reason |
| --- | --- | --- | --- | --- |
| Fresh match | Block | Block if P8 says revocation wins; otherwise forward | `DENY` (or `WOULD_DENY` if forwarded) | `KILL_SWITCH_ACTIVE` |
| Fresh no match | Forward | Forward | `ALLOW` | — |
| Stale, last-known match | Block | Same as fresh match | `DENY` / `WOULD_DENY` | `KILL_SWITCH_ACTIVE` |
| Stale, no match | Block (fail closed) | Forward, shadow | `DENY` / `WOULD_DENY` | `KILL_SWITCH_UNAVAILABLE` |
| Unavailable | Block (fail closed) | Forward, shadow | `DENY` / `WOULD_DENY` | `KILL_SWITCH_UNAVAILABLE` |

Team 1's behavior matrix already uses `KILL_SWITCH_ACTIVE`. Team 0 should bless
`KILL_SWITCH_UNAVAILABLE` (or an agreed alternative) so audit and QA can assert
one string. `ErrorCategory` needs a matching variant; Team 2 currently has
`Revoked`, `AuthenticationFailure`, `ValidatorFailure`, `PolicyEngineError`, and
`InternalError`.

**Why fail closed on stale with no match?** In enforce mode, "I do not know
whether this is revoked" is not the same as "not revoked". Silently allowing on
a stale snapshot turns a state outage into a bypass. Observe-only remains
non-disruptive by design.

---

## P3 — `RevocationState` wire rules to freeze

Team 5's model matches the playbook fields exactly. The following details are
unresolved and must be written into the shared contract.

| Field | Proposed rule |
| --- | --- |
| `target_kind` | One of `global`, `mcp_server`, `agent`, `tool`. Serialized as those lowercase strings. |
| `target_id` for `global` | `"*"`. Producers may accept an empty string and normalize it to `"*"`; consumers must treat both as global. |
| `target_id` for `mcp_server` | The canonical server name from `RuntimeRequest.target_server`, unchanged. |
| `target_id` for `agent` | The verified `IdentityContext.agent_id` (JWT `sub`) exactly, unchanged. |
| `target_id` for `tool` | `<server>/<tool>` where each component percent-encodes `%`, `/`, `:`, `*`, and control bytes (`%25`, `%2F`, `%3A`, `%2A`, `%XX`). Team 0 should confirm full RFC 3986 unreserved-only encoding if a stricter form is preferred. |
| `revoked` | `true` means blocked. `false` is a tombstone that records a clear, not a deletion. |
| `state_version` | Monotonic snapshot version when the entry last changed. Not a timestamp and not wall-clock ordering. |
| `effective_unix_ms` | When the state became effective. Phase 1 rejects scheduling more than 60 s ahead. |
| `reason` | Producer-redacted operator text, non-empty, ≤ 2048 characters, no control characters. It may appear in audit and must never contain credentials. |
| Unknown fields | Team 0 to decide forward-compatibility: ignore or reject. Team 5 currently rejects a snapshot that does not validate internally but ignores unknown JSON fields via serde defaults. |

A complete snapshot envelope (`epoch`, `version`, `generated_at_unix_ms`,
`entries`) is a Team 5 draft, not a shared contract. It is documented in
[REVOCATION_API.md](kill-switch/REVOCATION_API.md#snapshot-envelope). If Team 0
freezes a different transport shape, only `store.rs` and `sync.rs` change; the
lookup API and precedence do not.

---

## P4 — Kill-switch admin action auditing

The shared `AuditEvent` describes an authorization decision. It has no fields
for an operator action. Team 5 currently emits a separate record:

```json
{
  "event_type": "kill_switch_action",
  "timestamp_rfc3339": "2026-11-15T12:00:00.000Z",
  "action": "revoke",
  "target_kind": "agent",
  "target_id": "finance-agent",
  "actor": "operator-1",
  "reason": "compromised credential",
  "previous_state_version": 4,
  "state_version": 5,
  "outcome": "applied",
  "source": "cli",
  "request_id": "kill-001"
}
```

**Options**

- **A. Extend `AuditEvent`** with `event_type` and optional admin fields.
  Rejected: every existing consumer would need to handle a union, and decision
  metrics would need filtering.
- **B. Separate record shape, same sink** (recommended). Keep the decision
  `AuditEvent` unchanged; bless the admin shape and its `event_type`
  discriminator. Team 6 can assert both independently.
- **C. Encode admin actions as a decision event.** Rejected: it loses
  `previous_state_version`, `actor`, and `outcome`, and pollutes denial metrics.

**Requested decision:** Team 0 blesses option B, fixes the required fields and
their optionality, and records whether admin records share the decision stream
or use a separate file/consumer. Team 5's writer can split them without an API
change if the decision is "separate stream".

`outcome` values used by the slice: `applied`, `already_in_desired_state`,
`rejected`. `source` values: `cli`, `unix_socket`, `loopback_http`, plus `test`
for harnesses. Production sources should be limited to the first three.

---

## P5 — `AuditEvent.trace_id` representation

The shared contract calls the field `trace_id` but does not define its format.
Team 5 recommends the W3C **trace-id field**: 32 lowercase hex characters, no
version or flags. Rationale:

- it is stable across `traceparent` versions and cheap to index;
- the gateway already parses `traceparent` with `axiom-telemetry`;
- the full `traceparent` remains available in spans/logs for sampling flags.

If Team 0 prefers the whole `traceparent`, the contract must pin the version
prefix and flags handling; mixing both forms would break joins. Consumers must
treat a missing or malformed value as a new root trace and never as an
authorization failure.

---

## P6 — `validator_summary` shape

Team 2's `ValidatorResult` is structured (validator id, pass flag, violation
code, SQL verbs/tables, path and egress facts, tool-pin hash). The audit contract
only says `validator_summary`. Team 5 currently accepts `Vec<String>`, bounded to
32 entries of 512 characters, and redacts each entry.

**Recommendation for `0.1.0-draft`:** keep `Vec<String>` with a canonical
projection, for example:

```text
sql:passed=false;violation=SQL_WRITE;verbs=DELETE;tables=users;readonly=false;statements=1
path:passed=true;traversal=false
tool_pin:passed=true;sha256=...
```

The projection must contain only facts and must not include raw SQL text, raw
paths, raw URLs, or argument values. A structured
`Vec<ValidatorSummary>` is a better long-term shape but adds a JSON schema
change; Team 5 recommends scheduling it for the next contract version rather
than changing the audit stream twice before G1.

**Owner:** Team 4 defines the projection, Team 2 passes it to the audit builder,
Team 0 records it. Team 5's builder already enforces count/length/redaction.

---

## P7 — Revocation propagation transport

Phase 1's slice supports two topologies:

1. **Single process (G1 default).** Team 2's adapter holds a
   `CachedRevocationReader` and the admin service holds the authoritative
   `RevocationStore`. The hand-off is an in-process atomic snapshot install plus
   the optional JSON snapshot file for restart.
2. **Separate audit/control process (post-G1).** Needs a transport that Team 0
   has not chosen. Candidates: authenticated loopback HTTP snapshot pull,
   unix-domain socket, or a shared file with change notification.

**Recommendation:** do not freeze a cross-process protocol before G1. Expose the
snapshot as an opaque, versioned JSON document and keep the freshness bound in
the reader. Team 1 should not poll revocation state per request; it should use
Team 2's decision result or a reader handle.

**Measurement consequence:** in-process propagation is measured with the
`PropagationProbe`; cross-process propagation requires the transport and a
monotonic clock comparison on one host. See [MEASUREMENT.md](MEASUREMENT.md).

---

## P8 — Should revocation override observe-only?

**Recommendation: yes, by default, and configurable.**

Rationale:

- Observe-only exists to avoid disrupting traffic while policy is being tuned.
  An emergency revocation is an explicit operator action after a suspected
  compromise; forwarding through it defeats the control.
- Team 1's interceptor already has `killSwitchOverridesObserveOnly = true` as its
  default, and its behavior matrix recommends kill-switch precedence.
- Team 5's `recommended_action` implements the same default and exposes the flag,
  so both teams can be configured consistently.

**Decision requested from Team 0:** bless "active revocation overrides
observe-only" as the contract default, and define the config key and its
documented default. If Team 0 chooses the opposite, Team 5's helper and Team 1's
flag must both change; the audit decision becomes `WOULD_DENY` with forwarding.

**Caveat:** stale or unavailable state is **not** an active revocation. In
observe-only mode it should never block; in enforce mode it fails closed (P2).

---

## P9 — `tool_name` for non-tool MCP methods

`RuntimeRequest.tool_name` is a `String`, not an `Option`. For methods such as
`tools/list` or `initialize`, there may be no tool. Team 5 treats an empty or
whitespace-only tool name as "no tool target" and skips tool-specific
revocation. Team 0 should state that empty string is the canonical "not
applicable" value so Team 1, 2, and 5 do not disagree. A server or global
revocation still applies.

---

## P10 — Per-token (`jti`) revocation

Team 3's `IdentityContext` already exposes `token_jti`. Phase 1's target kinds do
not include a token target. Team 5 recommends deferring token revocation to
Phase 1.1 and, when added, extending `target_kind` with `token` rather than
overloading `agent`. The lookup precedence would place `token` after `agent` and
before `tool`.

---

## Contract and version impact

If Team 0 accepts P1–P3 and P8, Team 5 suggests:

- bump the shared contract to `0.2.0-draft`;
- add a revocation section to `docs/api-contracts/` with the enum, failure
  outcomes, target encoding, and denial reasons;
- add the admin event shape (P4) either in the same revision or a follow-up;
- add the freeze checklist items: "revocation precedence", "stale/unavailable
  behavior", "target id encoding", "admin action audit", "trace id format".

No wire message in `proto/` changes. These are domain-contract and in-process
seam changes layered on the existing pass/deny hook.

## Requested actions

- [ ] **Team 0:** decide P2, P3, P4, P5, P8; schedule contract version.
- [ ] **Team 2:** split the seam (P1); add stale/unavailable outcomes (P2);
      call the post-identity check before Cedar; add the adapter dependency.
- [ ] **Team 1:** confirm `KILL_SWITCH_UNAVAILABLE` and the observe-only flag
      default; keep forwarding unaffected when state is stale in observe-only.
- [ ] **Team 3:** confirm `agent_id` is the JWT `sub` and is stable for the
      token lifetime; keep `token_jti` available for Phase 1.1.
- [ ] **Team 4:** publish the canonical validator summary projection (P6).
- [ ] **Team 6:** add acceptance cases for stale/unavailable state, admin audit
      records, and both runtime modes.

## What Team 5 will do after approval

- Regenerate the seam adapter helper in this workspace.
- Update `REVOCATION_API.md` and `AUDIT_REDACTION.md` to the approved version.
- Add compatibility tests against the frozen fixtures.
- Remove the `StaticRevocationChecker` mock from the integration path without
  removing it from the test surface.
