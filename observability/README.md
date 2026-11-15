# Team 5 — Observability and emergency controls

**Owner:** `@axiom-nhi/team-5-observability`
**Status:** Draft `0.1.0-draft` — Gate G1 first slice
**Contract state:** not frozen. See [INTERFACE_PROPOSAL.md](INTERFACE_PROPOSAL.md).

This directory implements three related controls for the Phase 1 MCP runtime
wedge:

| Area | Path | Responsibility |
| --- | --- | --- |
| Trace context and measurement | `opentelemetry/` (`axiom-telemetry`) | W3C `traceparent` parse/generate/sanitize, metric names, percentile summaries, propagation probe |
| Redacted asynchronous audit | `audit/` (`axiom-audit`) | Audit event shapes, redaction, bounded non-blocking delivery, JSONL writer |
| Emergency revocation | `kill-switch/` (`axiom-kill-switch`) | Target model and precedence, lock-free snapshot reads, versioned updates, cached reader, admin service, persistence |

These component crates are members of the repository's root Cargo workspace.
They remain independently testable packages, but `cargo test --workspace` builds
them alongside identity, validators, and Team 2's policy crates. The shared
runtime contract is still draft.

## What this slice delivers

- **Revocation API and state.** Four target kinds (`global`, `mcp_server`,
  `agent`, `tool`), deterministic canonical keys, primary-reason precedence,
  epoch + version snapshot rules, stale and unavailable outcomes, and an
  enforce/observe-only recommendation helper.
- **A mockable seam for Team 2.** A two-phase `RevocationChecker` trait
  (`check_pre_identity`, `check_post_identity`) plus
  `StaticRevocationChecker` for tests. Storage stays in Team 5.
- **Admin actions with audit.** `KillSwitchService` validates commands, applies
  them, persists optionally, and emits a critical kill-switch audit record even
  when the command is rejected.
- **Bounded audit.** Two bounded queues (critical and routine), non-blocking
  `try_send`, explicit drop counters, and an off-path JSONL writer.
- **Redaction.** Bearer tokens, authorization values, JWTs, secret assignments,
  cookies, private keys, cloud tokens, email/phone/SSN, and Luhn-valid payment
  cards are replaced before serialization. Raw tool arguments have no field in
  the audit builder at all.
- **Trace propagation.** Strict W3C parsing, child-span generation, header
  sanitization, and credential-like baggage removal.
- **Visible failure behavior.** See
  [FAILURE_AND_REDACTION_MATRIX.md](FAILURE_AND_REDACTION_MATRIX.md).

## Quick start

```text
cargo test --workspace
cargo clippy --workspace --all-targets
cargo run -p axiom-kill-switch --example slice_probe --release
```

The last command is an **in-process** probe, not a Gate G1 benchmark. The
measurement method and the exact interpretation limits are in
[MEASUREMENT.md](MEASUREMENT.md).

## Security invariants

1. Raw bearer tokens, authorization headers, and secrets never enter an audit
   event, log field, fixture, or revocation reason.
2. Audit enqueue never blocks the inline request path and never performs I/O.
   A full queue drops and counts; it does not stall the caller.
3. Revocation blocks new protected calls. It does not cancel an upstream tool
   call that is already running.
4. A malformed or inconsistent revocation snapshot is rejected whole.
5. Same-epoch snapshots move forward only; an epoch change requires an explicit
   opt-in and is logged.
6. Enforce mode fails closed when required revocation state is stale or
   unavailable. Observe-only mode records a shadow decision and forwards.
7. Validators report facts; Team 5 does not parse tool arguments or make Cedar
   policy decisions.

## Integration status

| Consumer | State | Notes |
| --- | --- | --- |
| Team 1 gateway | Draft helper available | `axiom-telemetry` provides `traceparent` handling; Team 1 still owns the 15 ms callout budget and enforcement. |
| Team 2 ExtMCP | Two-phase seam integrated in the local authorization crate | Global/server/tool checks run before identity; agent checks run after identity. The shared contract is still draft, and the gRPC runtime is not implemented. |
| Team 3 identity | No change required | `IdentityContext.token_jti` enables a later per-token revocation extension, not in this slice. |
| Team 4 validators | Input contract only | Audit accepts canonical validator summaries, never raw arguments. |
| Team 6 QA | Draft hooks | `StaticRevocationChecker` and `AuditBus` are deterministic test seams. End-to-end tests belong in `tests/`. |

## Phase 1 non-goals

No SIEM/SOAR integration, Slack approval workflow, Postgres audit history,
mid-flight cancellation, discovery/graph connectors, token exchange, fleet
dashboards, or admin wire protocol. The admin API is in-process only until
Team 0 freezes a transport.

## Documents

| Document | Purpose |
| --- | --- |
| [INTERFACE_PROPOSAL.md](INTERFACE_PROPOSAL.md) | Exact cross-team contract changes, owners, options, and recommendations |
| [kill-switch/REVOCATION_API.md](kill-switch/REVOCATION_API.md) | Revocation state, lookup/update API, precedence, versioning, staleness |
| [audit/AUDIT_REDACTION.md](audit/AUDIT_REDACTION.md) | Event shapes, redaction rules, bounded delivery, writer behavior |
| [FAILURE_AND_REDACTION_MATRIX.md](FAILURE_AND_REDACTION_MATRIX.md) | Failure behavior by mode, audit delivery failures, redaction coverage |
| [MEASUREMENT.md](MEASUREMENT.md) | How lookup latency, enqueue latency, end-to-end latency, and propagation are measured |
