# Audit event and redaction contract

**Owner:** Team 5 (`@axiom-nhi/team-5-observability`)
**Status:** Draft `0.1.0-draft` — proposal, not frozen.
**Implementation:** `observability/audit/` (`axiom-audit`).
**Consumers:** Team 1 (emit site), Team 2 (decision emit site), Team 6 (QA).

This document defines the audit event shapes, redaction rules, bounded
non-blocking delivery, and failure behavior for the Phase 1 slice. It is the
reference for anyone who constructs or asserts an audit record.

## 1. Principles

1. **Do not collect secrets.** The strongest control is that the event builder
   has no field for a bearer token, authorization header, or raw tool arguments.
   Redaction is defense in depth, not permission to pass them in.
2. **Never block the request.** Enqueue is a bounded `try_send`; I/O runs on a
   dedicated writer thread.
3. **Fail visibly.** Drops and write failures are counted. Silent loss of a
   denial record is a bug, not an acceptable trade.
4. **Bound hostile input.** Every free-text field has a length cap and every
   JSON walk has depth and node caps.
5. **Keep decision and admin records distinguishable.** The decision record
   mirrors the shared contract; the admin record is a separate draft shape.

## 2. Event shapes

### 2.1 Decision event (`AuditEvent`)

Exactly the 13 fields in the Team 0 draft, in this order:

| Field | Type | Rule |
| --- | --- | --- |
| `timestamp_rfc3339` | string | UTC, millisecond precision, `Z` suffix |
| `request_id` | string | Gateway correlation id; empty becomes `unknown` |
| `trace_id` | string | 32 lowercase hex characters (P5; pending decision) |
| `agent_id` | string | Verified agent id; empty becomes `anonymous` |
| `target_server` | string | Target MCP server; empty becomes `unknown` |
| `tool_name` | string | Empty for non-tool methods; empty stays empty |
| `runtime_mode` | string | `enforce` or `observe-only` |
| `decision` | string | `ALLOW`, `DENY`, or `WOULD_DENY` |
| `policy_version` | string | Cedar bundle version; empty becomes `unknown` |
| `denial_reason` | string or null | Producer-redacted, ≤ 2048 chars |
| `validator_summary` | array of string | ≤ 32 entries, each ≤ 512 chars, redacted |
| `kill_switch_active` | boolean | Whether a revocation match applied |
| `latency_us` | integer | Pipeline latency in microseconds |

Serialization is a single JSON object per line. Identifiers (request, agent,
server, tool, policy version) are redacted for credential patterns but **not**
for PII: an agent id containing `@` is an identity, not a leak, and rewriting it
would break correlation. Free-text reasons and summaries receive the full
redaction pass, including PII.

### 2.2 Kill-switch admin event (`KillSwitchAuditEvent`) — draft

This shape is not in the shared contract. See proposal P4.

| Field | Type | Rule |
| --- | --- | --- |
| `event_type` | string | Always `kill_switch_action` |
| `timestamp_rfc3339` | string | Same clock rules as decision events |
| `action` | string | `revoke` or `clear` |
| `target_kind` | string | `global`, `mcp_server`, `agent`, `tool` |
| `target_id` | string | Canonical target id (credential-redacted) |
| `actor` | string | Operator or automation id |
| `reason` | string | Operator note, fully redacted, ≤ 2048 chars |
| `previous_state_version` | integer | Snapshot version before the action |
| `state_version` | integer | Snapshot version after the action, or the unchanged version on rejection |
| `outcome` | string | `applied`, `already_in_desired_state`, `rejected` |
| `source` | string | `cli`, `unix_socket`, `loopback_http`, `test` |
| `request_id` | string or null | Optional admin correlation id |

### 2.3 Record type and priority

`AuditRecord` is an enum of `Decision` and `KillSwitchAction`. Priority is
derived from content, not from the caller:

| Condition | Priority |
| --- | --- |
| `decision = DENY` | critical |
| `decision = WOULD_DENY` | critical |
| `kill_switch_active = true` | critical |
| `KillSwitchAction` (any outcome) | critical |
| `decision = ALLOW` | routine |

Critical records survive routine-queue pressure. A full critical queue drops and
counts rather than blocking.

## 3. Redaction

Redaction runs in the builder, before the record is enqueued. The writer never
receives an unredacted record. The pipeline is ordered so broad rules run before
narrow ones:

1. `Authorization: ...` / `authorization=...` values
2. `Bearer <token>` occurrences
3. JWT-shaped triples (`eyJ...eyJ...sig`)
4. Secret assignments (`password=`, `client_secret:`, `api_key=`, `token=`, ...)
5. Cookies and `Set-Cookie`
6. PEM private-key blocks
7. Cloud/provider token literals (`AKIA...`, `ghp_...`, `xoxb-...`)
8. Email, international phone, US SSN
9. Payment-card candidates that pass Luhn (13–19 digits)

### 3.1 Rule table

| Category | Example input (synthetic) | Replacement |
| --- | --- | --- |
| Authorization header | `Authorization: Bearer SYNTHETIC` | `authorization=[REDACTED]` |
| Bare bearer | `upstream said Bearer SYNTHETIC` | `Bearer [REDACTED]` |
| JWT | `eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.sig` | `[REDACTED_JWT]` |
| Secret assignment | `password=SYNTHETIC`, `api_key: 'SYNTHETIC'` | `<key>=[REDACTED]` |
| Cookie | `Cookie: session=SYNTHETIC` | `Cookie=[REDACTED]` |
| Private key | PEM `BEGIN ... PRIVATE KEY` block | `[REDACTED_PRIVATE_KEY]` |
| AWS access key | `AKIA` + 16 uppercase/digits | `[REDACTED_AWS_ACCESS_KEY]` |
| GitHub token | `ghp_` + 20+ alphanumerics | `[REDACTED_GITHUB_TOKEN]` |
| Slack token | `xoxb-...` | `[REDACTED_SLACK_TOKEN]` |
| Email | `agent@example.com` in free text | `[REDACTED_EMAIL]` |
| Phone | `+1 415 555 0100` | `[REDACTED_PHONE]` |
| US SSN | `123-45-6789` | `[REDACTED_SSN]` |
| Payment card | `4111 1111 1111 1111` (Luhn-valid) | `[REDACTED_PAYMENT_CARD]` |

Arbitrary digit runs that fail Luhn are left alone, so request ids that happen
to be long numbers are not destroyed.

### 3.2 Structured JSON redaction

`Redactor::redact_json` is used for any structured value that reaches an audit
sink outside the typed builder (for example a future diagnostic envelope). It:

- replaces values under sensitive keys wholesale;
- recurses into objects and arrays with a depth limit of 8 and a node limit of
  1000;
- redacts string leaves with the full rule set;
- replaces over-limit subtrees with `[REDACTED_DEPTH_LIMIT]` or
  `[REDACTED_NODE_LIMIT]`.

Sensitive keys include credentials, cookies, session ids, and tool-argument
fields: `arguments`, `params`, `query`, `sql`, `statement`, `script`, `command`,
`path`, `file`, `url`, `uri`, `endpoint`, plus PII keys (`email`, `phone`, `ssn`,
`credit_card`, `card_number`, `cvv`, `pin`).

### 3.3 Bounds

| Bound | Value | Applies to |
| --- | --- | --- |
| `MAX_TEXT_INPUT` | 32 KiB | characters inspected per free-text field |
| `MAX_REASON_LEN` | 2048 chars | `denial_reason`, admin `reason` |
| `MAX_SUMMARY_ENTRY_LEN` | 512 chars | each validator summary entry |
| `MAX_SUMMARY_ENTRIES` | 32 | validator summary array |
| `MAX_ID_LEN` | 256 chars | request, agent, server, tool, policy version, target id |
| `MAX_JSON_DEPTH` | 8 | structured redaction |
| `MAX_JSON_NODES` | 1000 | structured redaction |

Over-long free text is truncated and marked `...[TRUNCATED]`; over-long
identifiers are truncated without a marker. Truncation is preferable to dropping
the whole event.

### 3.4 What never enters audit

- Raw `Authorization` header or bearer token (no field exists).
- Raw tool arguments, JSON-RPC params, SQL text, file paths, URLs, or commands
  (no field exists; summaries must be canonical facts).
- Private keys, cookies, session ids, API keys.
- Raw validator inputs. Only the canonical `validator_summary` projection is
  accepted.

## 4. Delivery: bounded and non-blocking

```text
inline path: build → redact → try_send ─┬─► critical queue (1024)
                                        └─► routine queue  (8192)
                                                   │
writer thread: drain → serialize → JSONL ◄─────────┘
```

Defaults: critical capacity 1024, routine capacity 8192. Both must be greater
than zero; the bus rejects a zero-capacity configuration at construction.

### 4.1 Enqueue outcomes

| Outcome | Meaning | Caller behavior |
| --- | --- | --- |
| `Enqueued { priority }` | Record accepted | Continue |
| `DroppedFull { priority }` | Queue full; record dropped and counted | Continue; counter/metric records loss |
| `Disconnected` | Writer is gone | Continue; counter/metric records loss |

`try_emit` never blocks and never performs I/O. The inline path latency is one
bounded channel attempt plus, for a decision event, the redaction pass.

### 4.2 Accounting

`AuditBusStatsSnapshot` exposes:

- `critical_enqueued`, `routine_enqueued`;
- `critical_dropped`, `routine_dropped`;
- `disconnected`;
- `current_depth`.

The corresponding metric names are in
`observability/opentelemetry/src/metrics.rs`: `axiom.audit.enqueue.duration`,
`axiom.audit.queue.depth`, `axiom.audit.dropped.total`,
`axiom.audit.write.duration`, `axiom.audit.redactions.total`.

A full routine queue drops `ALLOW` records first. A full critical queue is an
incident signal: it means denials or admin actions are being lost, and the
operator should inspect writer health and disk throughput.

### 4.3 Writer behavior

`spawn_file_writer` opens the file synchronously so path/permission errors are
returned to the caller before a thread starts. The writer:

- appends one compact JSON object per line;
- flushes every 64 written records or after 100 ms idle;
- counts failed serializations and write/flush errors instead of exiting;
- drains remaining records and flushes when all producers disconnect.

Rotation, compression, retention, and remote export are not in Phase 1. The
writer seam is the place to add them without touching the inline path.

## 5. Failure behavior

| Failure | Impact | Behavior |
| --- | --- | --- |
| Routine queue full | `ALLOW` records dropped | Counted; request unaffected |
| Critical queue full | `DENY`/kill-switch records dropped | Counted as `critical_dropped`; request unaffected; alert |
| Writer thread down | Enqueue returns `Disconnected` | Counted; request unaffected |
| Disk full / permission error | Write or flush fails | Counted in `failed`; writer continues |
| Serialization error | Record not written | Counted; writer continues |
| Clock skew / regression | Timestamps may be non-monotonic | Redaction and decisions unaffected; propagation uses monotonic `Instant` |
| Malformed `traceparent` | Audit `trace_id` falls back to a root value | Request is not blocked; `axiom.trace.parse.failures` increments |
| Redaction regex failure | Not possible at runtime (compiled once, validity tested at startup) | If compilation ever failed, the process would fail fast rather than emit unredacted data |

## 6. Residual risks and limits

Redaction is pattern-based and cannot prove a free-text field is safe.

- **Encoded or split secrets.** Base64, URL-encoded, or chunked tokens may not
  match. The primary control remains "do not put secrets in audit fields".
- **Novel token formats.** Only known provider prefixes are matched.
- **PII false positives.** Free-text phone-like numbers can be redacted even
  when not PII; identity fields are excluded from PII redaction to preserve
  correlation.
- **PII false negatives.** Names, addresses, and national ids outside the
  supported patterns are not detected.
- **Summary abuse.** A caller could place a secret in a validator summary; the
  scoring treats summaries as free text, but the contract forbids raw inputs.
- **Logs outside audit.** `tracing` fields are not automatically passed through
  `Redactor`. Emit sites must follow the same rules and never log
  `raw_auth_header` or `raw_arguments`.

## 7. Test evidence

Run:

```text
cargo test -p axiom-audit
```

Covered behaviors:

- authorization, bare bearer, JWT, secret assignment, cookie, and PEM redaction;
- PII (email, phone, SSN) and Luhn payment-card redaction;
- non-Luhn digit runs preserved;
- credential-only mode preserves identity emails;
- recursive JSON key redaction and depth bounding;
- free-text truncation marker;
- exact 13-field decision event shape;
- validator summary count/length caps;
- critical versus routine priority;
- routine and critical overflow counted separately without blocking;
- disconnected writer reported;
- writer appends JSONL, redacts, flushes, and stops after producer disconnect.

Tests use synthetic sentinels such as `SYNTHETIC_REDACTION_SENTINEL`; no real
credential appears in the repository.

## 8. Open decisions

1. Admin record shape and stream placement (Team 0, P4).
2. `trace_id` format (Team 0, P5).
3. `validator_summary` projection (Team 0 + Team 4, P6).
4. Whether audit writes are synchronous at process shutdown (Team 5 + Team 1).
5. OTLP export and retention are post-G1.
