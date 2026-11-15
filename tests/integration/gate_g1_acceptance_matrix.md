# Gate G1 Acceptance Matrix — Team 6

**Version:** `0.1.0-draft`  
**Status:** Draft — contracts not frozen. All `Decision` and `AuditEvent` assertions use mock-boundary
stubs until Team 0 freezes `PolicyResponse.decision` semantics and the `WouldDeny` placement (see
§ Unresolved Decisions).  
**Owners:** `@axiom-nhi/team-6-qa`  
**Review required from:** `@axiom-nhi/team-0-arch`, `@axiom-nhi/team-5-observability`

---

## 1. Scope

This matrix covers every observable Gate G1 outcome for a `tools/call` MCP request traversing the
full pipeline:

```
Client → agentgateway (T1) → ExtMCP/CheckRequest (T2 orchestrates T3+T4) → backend MCP server
                           ↓
                     AuditEvent (T5, async)
```

Non-`tools/call` methods (`tools/list`, `prompts/get`, `resources/read`) follow the same pipeline
but have distinct method-specific payload requirements tracked in
[Unresolved Decision #7](#7-tool-method-specific-payload-fields).

---

## 2. Acceptance Matrix

Legend:
- **HTTP status** — transport-layer response code from agentgateway to the caller.
- **JSON-RPC body** — parsed `result` / `error` fields in the MCP response envelope.
- **Backend executed** — whether the upstream MCP server received and processed the call.
- **AuditEvent.decision** — value in the redacted `AuditEvent` written to `audit.jsonl`.
- **AuditEvent.kill_switch_active** — boolean field.
- **Assert method** — how Team 6 tests verify the outcome (not HTTP 200 alone).

> ⚠️ **DRAFT BOUNDARY** — `WouldDeny` placement (observe-only decision representation in
> `PolicyResponse` vs. `AuditEvent`) is tracked as Unresolved Decision #4. Assertions marked
> `[D4]` will be updated once Team 0 settles the decision model.

### 2.1 Observe-Only Mode

| ID | Scenario | HTTP Status | JSON-RPC body | Backend executed | AuditEvent.decision | AuditEvent.kill_switch_active | Assert method |
|----|----------|-------------|---------------|-----------------|---------------------|-------------------------------|---------------|
| OB-01 | Policy **permit** | 200 | `result` = upstream response | ✅ Yes | `"ALLOW"` | `false` | Parse JSON-RPC `result`; confirm backend mock received call; read `audit.jsonl` |
| OB-02 | Policy **deny** (would-deny) `[D4]` | 200 | `result` = upstream response (forwarded despite denial) | ✅ Yes | `"WOULD_DENY"` | `false` | Parse JSON-RPC `result`; confirm backend mock received call; verify `decision=WOULD_DENY` in audit |
| OB-03 | **Identity failure** (bad/expired token) | 200 | `result` = upstream response (forwarded) | ✅ Yes | `"WOULD_DENY"` | `false` | Confirm `IdentityContext.authenticated=false` in audit validator_summary; backend still received call |
| OB-04 | **Validator failure** (SQL injection detected) | 200 | `result` = upstream response (forwarded) | ✅ Yes | `"WOULD_DENY"` | `false` | Parse `validator_summary` in AuditEvent; confirm `violation_code` present; backend still received call |
| OB-05 | **ExtMCP timeout / unavailable** | 200 | `result` = upstream response (forwarded) | ✅ Yes | `"WOULD_DENY"` (shadow timeout) | `false` | Inject network fault; confirm gateway did not block; audit records `shadow_failure` |
| OB-06 | **Policy-load failure** (corrupt policy bundle) | 200 | `result` = upstream response (forwarded) | ✅ Yes | `"WOULD_DENY"` | `false` | Corrupt `.cedar` file; confirm gateway forwards; audit records policy_version error |
| OB-07 | **Kill switch active** `[D3]` | TBD `[D3]` | TBD — open decision whether kill switch overrides observe-only | TBD | `"DENY"` with `kill_switch_active=true` | `true` | **BLOCKED on Decision #3** — keep behind mock boundary |

### 2.2 Enforce Mode

| ID | Scenario | HTTP Status | JSON-RPC body | Backend executed | AuditEvent.decision | AuditEvent.kill_switch_active | Assert method |
|----|----------|-------------|---------------|-----------------|---------------------|-------------------------------|---------------|
| EN-01 | Policy **permit** | 200 | `result` = upstream response | ✅ Yes | `"ALLOW"` | `false` | Parse JSON-RPC `result`; confirm backend mock received call; read audit |
| EN-02 | Policy **deny** | 200 | `isError: true`, `content[0].text` contains rejection message | ❌ No | `"DENY"` | `false` | Parse `isError`; confirm backend mock did **not** receive call; verify audit denial_reason |
| EN-03 | **Identity failure** (bad/expired token) | 200 | `isError: true`, rejection message | ❌ No | `"DENY"` | `false` | Same as EN-02; audit shows identity failure cause |
| EN-04 | **Validator failure** (e.g., stacked SQL) | 200 | `isError: true`, rejection message | ❌ No | `"DENY"` | `false` | Parse `isError`; backend not called; `validator_summary` has violation_code |
| EN-05 | **ExtMCP timeout / unavailable** (fail-closed) | 200 | `isError: true`, fail-closed message | ❌ No | `"DENY"` | `false` | Inject fault; gateway must block; audit records timeout reason |
| EN-06 | **Policy-load failure** (fail-closed) | 200 | `isError: true`, policy error message | ❌ No | `"DENY"` | `false` | Corrupt policy; gateway must block; audit records policy_version error |
| EN-07 | **Kill switch active — agent-scoped** | 200 | `isError: true`, `"KILL_SWITCH_TRIGGERED"` message | ❌ No | `"DENY"` | `true` | Invoke `axiom kill agent <id>`; subsequent calls blocked; audit has kill_switch_active |
| EN-08 | **Kill switch active — tool-scoped** | 200 | `isError: true`, `"KILL_SWITCH_TRIGGERED"` message | ❌ No | `"DENY"` | `true` | Same for tool scope |
| EN-09 | **Kill switch active — global** | 200 | `isError: true`, `"KILL_SWITCH_TRIGGERED"` message | ❌ No | `"DENY"` | `true` | `axiom kill global --all`; all calls blocked |
| EN-10 | **Non-`tools/call` method denied** `[D7]` | 200 | JSON-RPC error code `-32001` | ❌ No | `"DENY"` | `false` | Method-specific error per agentgateway spec; **BLOCKED on Decision #7** |

---

## 3. Assertion Specification

### 3.1 JSON-RPC Body Assertions (not HTTP 200 alone)

For every `tools/call` denial in enforce mode:

```python
# Pseudo-code — implemented in tests/integration/helpers/assertions.py
def assert_mcp_tools_call_denied(response: dict, expected_reason_fragment: str = None):
    """Assert the response body contains a policy denial, not just HTTP 200."""
    assert response.get("jsonrpc") == "2.0"
    result = response.get("result", {})
    assert result.get("isError") is True, (
        f"Expected isError=true in result body but got: {result}"
    )
    content = result.get("content", [])
    assert len(content) > 0, "Expected non-empty content array in denial response"
    text = content[0].get("text", "")
    assert len(text) > 0, "Expected non-empty denial message text"
    if expected_reason_fragment:
        assert expected_reason_fragment in text, (
            f"Expected '{expected_reason_fragment}' in denial text: '{text}'"
        )
```

### 3.2 Backend Side-Effect Assertions

The test harness runs a **mock backend MCP server** that records all received `tools/call` requests.
After each test case, the harness queries the mock backend's call log:

```python
def assert_backend_not_called(mock_backend, tool_name: str, since_marker: str):
    """Assert the mock backend did NOT receive a tools/call for the given tool."""
    calls = mock_backend.get_calls_since(since_marker, tool_name=tool_name)
    assert len(calls) == 0, (
        f"Backend should not have been called for denied tool '{tool_name}' "
        f"but received {len(calls)} call(s): {calls}"
    )

def assert_backend_called_once(mock_backend, tool_name: str, since_marker: str):
    """Assert the mock backend received exactly one tools/call for the given tool."""
    calls = mock_backend.get_calls_since(since_marker, tool_name=tool_name)
    assert len(calls) == 1, (
        f"Expected exactly 1 backend call for '{tool_name}' but got {len(calls)}"
    )
```

### 3.3 AuditEvent Assertions

The harness reads `/var/log/axiom/audit.jsonl` (or the mock audit sink) and parses events:

```python
def assert_audit_event(audit_sink, request_id: str, expected: dict):
    """
    Assert a redacted AuditEvent was emitted for the given request_id.
    
    Security invariant: bearer tokens must NOT appear in any audit field.
    """
    events = [e for e in audit_sink.read() if e["request_id"] == request_id]
    assert len(events) == 1, f"Expected 1 audit event for {request_id}, got {len(events)}"
    event = events[0]
    
    for field, expected_val in expected.items():
        actual_val = event.get(field)
        assert actual_val == expected_val, (
            f"AuditEvent.{field}: expected {expected_val!r}, got {actual_val!r}"
        )
    
    # Security invariant: no raw bearer token in any string field
    raw_text = str(event)
    forbidden_patterns = ["Bearer ", "Authorization:", "eyJ"]  # JWT prefix
    for pattern in forbidden_patterns:
        assert pattern not in raw_text, (
            f"SECURITY VIOLATION: Found '{pattern}' in AuditEvent — "
            f"tokens must be redacted before logging"
        )
    
    # Security invariant: agent_id must be present and non-empty
    assert event.get("agent_id"), "AuditEvent.agent_id must be present"
    
    # Latency field must be present and non-negative
    assert isinstance(event.get("latency_us"), int) and event["latency_us"] >= 0
```

---

## 4. Unresolved Decisions Blocking Full Implementation

The following decisions are open per `docs/architecture/phase1-bootstrap.md`.
Team 6 tracks them here and keeps dependent assertions behind `[DRAFT-MOCK]` boundaries.

| # | Decision | Blocking | Options | T6 Recommendation | Owner |
|---|----------|----------|---------|-------------------|-------|
| D3 | Kill switch overrides observe-only? | OB-07 | A) KS always denies (overrides OO) B) OO always forwards | **A — KS always denies; keeps security guarantee** | Team 0 + Team 5 |
| D4 | `WouldDeny` in `PolicyResponse` or only in `AuditEvent`? | OB-02..06 | A) T2 returns `WouldDeny` variant B) T2 returns `Deny`; T1 translates for OO | **B — T1/mode-layer translates; T2 stays mode-agnostic** | Team 0 + Team 2 |
| D5 | Kill switch lookup key precedence (agent_id, jti, server, tool, global) | EN-07..09 | Resolved: global → server → agent_id → tool; `jti` deferred | All matches block; this ordering selects the primary reported reason only | Team 0 |
| D7 | Non-`tools/call` method-specific error shape | EN-10 | A) JSON-RPC `-32001` for all denied methods B) Method-specific bodies | **A — uniform `-32001` simplifies assertion** | Team 0 + Team 1 |

---

## 5. Dependencies on Draft Contracts (v0.1.0-draft)

| Contract field | Producer | Consumer (T6 assertion) | Gap / change needed |
|----------------|----------|--------------------------|---------------------|
| `AuditEvent.decision` string values | Team 5 | OB-*, EN-* rows | Confirm `"ALLOW"`, `"DENY"`, `"WOULD_DENY"` are the exhaustive set; add `"KILL_SWITCH_TRIGGERED"` or fold into `"DENY"` with `kill_switch_active=true` |
| `AuditEvent.validator_summary` structure | Team 5 | OB-04, EN-04 | Currently `Vec<String>`; T6 needs at least `violation_code` present in entries — propose structured `{validator_id, passed, violation_code}` per entry |
| `PolicyResponse.decision` `WouldDeny` variant | Team 2 | OB-02..06 | Blocked on Decision D4 |
| `RevocationState.effective_unix_ms` | Team 5 | EN-07..09 propagation timing | T6 needs to know propagation latency SLA; needs atomic `state_version` for ordering |
| Kill switch error body shape in `tools/call` response | Team 1 | EN-07..09 | Needs `"KILL_SWITCH_TRIGGERED"` token or equivalent in `content[0].text` or a distinct JSON-RPC error code |

> These are **proposals to Team 0** for review before the contract is frozen. Team 6 will
> not implement against these without Team 0 sign-off.
