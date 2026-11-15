# Failure and redaction matrix — Team 5 slice

**Owner:** Team 5 (`@axiom-nhi/team-5-observability`)
**Status:** Draft `0.1.0-draft`.
**Scope:** revocation lookup/update, audit delivery, trace context, and
redaction. Gateway and policy failures are included only where they interact
with these controls.

Legend: **FC** = fail closed (deny), **FO** = fail open (forward), **Shadow** =
forward and emit `WOULD_DENY`. "Required" means the decision is mandatory for a
safe allow in enforce mode.

## 1. Required-decision failure semantics

| Decision | Required in enforce? | Required in observe-only? | If unavailable |
| --- | --- | --- | --- |
| Revocation state | yes | no | FC in enforce; Shadow in observe-only |
| Identity verification | yes | policy-dependent | FC in enforce (Team 1/2/3 contract) |
| Argument validation | yes, when validators are registered | no | FC in enforce (Team 4 emits an error) |
| Cedar authorization | yes | no | FC in enforce (Team 2 returns `Deny` + `PolicyEngineError`) |
| Audit delivery | no | no | Never blocks; count and continue |
| Trace context | no | no | Generate a new root; count; continue |

Only revocation and trace context are Team 5's. The other rows are included so
the matrix is unambiguous at integration time.

## 2. Revocation lookup failures

| Condition | Decision | Enforce | Observe-only | Audit `decision` | Denial reason | Metric |
| --- | --- | --- | --- | --- | --- | --- |
| Fresh, no match | `Active` | FO | FO | `ALLOW` | — | `lookup.duration` |
| Fresh, global match | `Revoked` | FC | FC (recommended) or Shadow | `DENY` / `WOULD_DENY` | `KILL_SWITCH_ACTIVE` | `lookup.duration` |
| Fresh, server match | `Revoked` | FC | same as global | `DENY` / `WOULD_DENY` | `KILL_SWITCH_ACTIVE` | `lookup.duration` |
| Fresh, agent match (post-identity) | `Revoked` | FC | same as global | `DENY` / `WOULD_DENY` | `KILL_SWITCH_ACTIVE` | `lookup.duration` |
| Fresh, tool match | `Revoked` | FC | same as global | `DENY` / `WOULD_DENY` | `KILL_SWITCH_ACTIVE` | `lookup.duration` |
| Several matches | `Revoked` | FC | same as global | `DENY` / `WOULD_DENY` | primary = `global > mcp_server > agent > tool` | `lookup.duration` |
| Stale, last-known match | `Stale` | FC | FC (recommended) or Shadow | `DENY` / `WOULD_DENY` | `KILL_SWITCH_ACTIVE` | `stale.total` |
| Stale, no match | `Stale` | FC | Shadow | `DENY` / `WOULD_DENY` | `KILL_SWITCH_UNAVAILABLE` | `stale.total` |
| Reader never loaded | `Unavailable` | FC | Shadow | `DENY` / `WOULD_DENY` | `KILL_SWITCH_UNAVAILABLE` | `unavailable.total` |
| Snapshot malformed at install | `Unavailable` (state unchanged) | FC | Shadow | `DENY` / `WOULD_DENY` | `KILL_SWITCH_UNAVAILABLE` | install error log |
| Same-epoch older snapshot | previous state | unchanged | unchanged | unchanged | — | no-op |
| Epoch change without opt-in | previous state | unchanged | unchanged | unchanged | — | warning |
| Clock regression | state age treated as 0 | unchanged | unchanged | unchanged | — | none |

Notes:

- Revocation blocks **new** calls only. It does not cancel in-flight upstream
  work; that is a Phase 2 concern.
- "Stale with match" blocking is deliberate: a refresh outage must not reopen a
  revoked identity.
- The decision helper is
  `RevocationDecision::recommended_action(mode, kill_switch_overrides_observe_only,
  fail_closed_on_unavailable)`.

## 3. Revocation update and admin failures

| Condition | Result | State change | Audit record | Operator visibility |
| --- | --- | --- | --- | --- |
| Valid revoke | `Applied` | yes, version +1 | critical, `outcome=applied` | success |
| Valid clear | `Applied` | yes, version +1 | critical, `outcome=applied` | success |
| Repeated revoke | `AlreadyInDesiredState` | no | critical, `outcome=already_in_desired_state` | idempotent |
| Empty reason | `EmptyReason` | no | critical, `outcome=rejected` | error |
| Reason > 2048 chars | `ReasonTooLong` | no | critical, `outcome=rejected` | error |
| Control characters in reason | `ControlCharacter` | no | critical, `outcome=rejected` | error |
| Scheduling > 60 s ahead | `ScheduledNotSupported` | no | critical, `outcome=rejected` | error |
| Invalid target id | `InvalidTarget` | no | critical, `outcome=rejected` | error |
| Snapshot serialization failure | `Persistence` | live state kept | critical, `outcome=applied`, `persisted=false` | error log; retry |
| Snapshot write failure | `Persistence` | live state kept | as above | error log; retry |
| Critical audit queue full | action succeeds | yes | dropped, `critical_dropped` +1 | metric/alert |
| Concurrent admins | serialized by mutex | both apply in order | one record each | success |
| Epoch change with opt-in | `Installed` | yes | warning log | warning |

The admin action is **not** rolled back when persistence or audit delivery
fails. Live revocation takes effect immediately; durability and audit delivery
are reported separately. This is intentional: an operator hitting the kill switch
should not have the block undone by a disk problem.

## 4. Audit delivery failures

| Failure | Inline path | Records affected | Counter/metric | Recovery |
| --- | --- | --- | --- | --- |
| Routine queue full | non-blocking `DroppedFull` | `ALLOW` only | `routine_dropped`, `axiom.audit.dropped.total` | writer catches up |
| Critical queue full | non-blocking `DroppedFull` | `DENY`/`WOULD_DENY`/kill-switch | `critical_dropped`, `axiom.audit.dropped.total` | alert; inspect writer/disk |
| Writer disconnected | `Disconnected` | all subsequent | `disconnected`, `axiom.audit.dropped.total` | restart writer |
| Disk full | writer counts `failed` | current batch | `axiom.audit.export.failures.total` (analogue) | free space; writer continues |
| Flush error | writer counts `failed` | current batch | as above | retry on next flush |
| Serialization error | writer counts `failed` | single record | as above | none; record is malformed |
| Slow writer | queues fill | as above | `queue.depth` | scale writer; check disk |
| Process crash before flush | records in queue lost | up to 64 written/100 ms buffered | n/a | accepted Phase 1 risk |
| Audit disabled (no sink) | no-op | none | none | by configuration |

Audit delivery never changes an authorization decision. A missing audit record
is a compliance/observability failure, not an authorization bypass.

## 5. Trace-context failures

| Condition | Behavior | Request impact | Metric |
| --- | --- | --- | --- |
| No `traceparent` | generate a new root context | none | none |
| Malformed `traceparent` | generate a new root context | none | `axiom.trace.parse.failures.total` |
| Uppercase hex | reject, new root | none | parse failure |
| All-zero trace or span id | reject, new root | none | parse failure |
| `ff` version | reject, new root | none | parse failure |
| Oversized `tracestate` | truncate | none | none |
| Oversized `baggage` | truncate | none | none |
| Credential-like baggage key | drop that member | none | none |
| Control characters in headers | strip | none | none |

Trace context is correlation data. It never authorizes a request and never
blocks one.

## 6. Redaction matrix

| Data class | Where it can appear | Rule | Replacement | Residual risk |
| --- | --- | --- | --- | --- |
| Authorization header | free text, JSON string | authorization rule | `authorization=[REDACTED]` | unusual casing; covered case-insensitively |
| Bearer token | free text | `Bearer <token>` rule | `Bearer [REDACTED]` | split or encoded tokens |
| JWT | free text | three-segment `eyJ...` rule | `[REDACTED_JWT]` | non-`eyJ` headers |
| Password / secret / API key | free text, JSON key | assignment rule + sensitive key | `[REDACTED]` | secrets without a key label |
| Cookie / `Set-Cookie` | free text, JSON key | cookie rule + sensitive key | `[REDACTED]` | none known |
| Private key | free text | PEM block rule | `[REDACTED_PRIVATE_KEY]` | non-PEM key material |
| AWS / GitHub / Slack token | free text | prefix rules | `[REDACTED_*]` | other providers |
| Email | free text | email rule | `[REDACTED_EMAIL]` | identity fields intentionally preserved |
| Phone | free text | international phone rule | `[REDACTED_PHONE]` | unusual formats |
| SSN | free text | US SSN rule | `[REDACTED_SSN]` | non-US national ids |
| Payment card | free text | 13–19 digits + Luhn | `[REDACTED_PAYMENT_CARD]` | non-Luhn account numbers |
| Tool arguments | no audit field | rejected by type | n/a | caller could abuse a summary string |
| Raw SQL / path / URL / command | no audit field | rejected by type | n/a | summary text is free-form |
| Session id | JSON key | sensitive key | `[REDACTED]` | free text without label |
| Bearer in baggage | `baggage` header | sensitive-key drop | member removed | encoded key names |

Redaction is applied to:

- `denial_reason` (full pass);
- each `validator_summary` entry (full pass);
- admin `reason` (full pass, before storage);
- identified fields (credential-only pass);
- any structured value through `Redactor::redact_json` (full pass with bounds).

## 7. Blast radius and non-goals

| Failure | Customer impact | Team 5 response |
| --- | --- | --- |
| Revocation state unavailable | enforce blocks new calls (fail closed) | restore reader/snapshot; observe-only continues |
| Revocation update lost | previous state remains; operator retries | version/epoch checks prevent silent rewind |
| Audit writer down | calls proceed, audit loss counted | alert; restore writer |
| Redaction miss | possible secret in audit | treat as incident; add a rule and a regression test |
| Trace parse failure | trace split, request proceeds | metric; fix producer |

Phase 1 non-goals: no mid-flight cancellation, no SIEM/SOAR, no Slack approval,
no Postgres history, no fleet dashboard, no cross-region replication.

## 8. Test mapping

| Matrix area | Test location |
| --- | --- |
| Lookup precedence, scoping, stale/unavailable | `kill-switch/src/store.rs`, `kill-switch/src/model.rs` |
| Admin outcomes and audit records | `kill-switch/src/service.rs` |
| Persistence failures and restart | `kill-switch/src/persistence.rs` |
| Queue overflow and disconnection | `audit/src/bus.rs` |
| Writer errors and redaction at rest | `audit/src/writer.rs` |
| Redaction categories and bounds | `audit/src/redact.rs` |
| Event shape and field caps | `audit/src/event.rs` |
| Trace parsing and sanitization | `opentelemetry/src/trace_context.rs` |

Run everything:

```text
cargo test -p axiom-audit -p axiom-kill-switch -p axiom-telemetry
```
