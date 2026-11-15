"""
tests/integration/helpers/assertions.py
Team 6 — Gate G1 Acceptance Harness
Version: 0.1.0-draft

Purpose: Shared assertion helpers used by integration, security, and failure-injection suites.

DRAFT BOUNDARY: Fields marked [D3], [D4], [D5], [D7] depend on unresolved Team 0 contract
decisions.  Do not remove draft markers until the corresponding decision is recorded in
docs/architecture/decisions/ and Team 0 signs off.

Security invariants enforced here:
- Raw bearer tokens never appear in AuditEvent fields (checked in every audit assertion).
- Backend side effects are verified independently of HTTP status codes.
- Denial is confirmed via parsed JSON-RPC body, not HTTP 200 alone.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Iterable

# ---------------------------------------------------------------------------
# Data classes mirroring draft v0.1.0-draft contracts
# (kept as pure Python dicts/dataclasses; not generated bindings)
# ---------------------------------------------------------------------------

@dataclass
class AuditEventSnapshot:
    """Parsed snapshot of one AuditEvent from audit.jsonl.
    
    Fields match the draft AuditEvent struct in docs/api-contracts/README.md.
    Unknown fields are collected in `extra` for forward compatibility.
    """
    timestamp_rfc3339: str
    request_id: str
    trace_id: str
    agent_id: str
    target_server: str
    tool_name: str
    runtime_mode: str          # "ObserveOnly" | "Enforce"
    decision: str              # "ALLOW" | "DENY" | "WOULD_DENY"  [D4]
    policy_version: str
    denial_reason: str | None
    validator_summary: list    # Vec<String> in draft; T6 proposes structured entries
    kill_switch_active: bool
    latency_us: int
    extra: dict = field(default_factory=dict)

    @classmethod
    def from_dict(cls, d: dict) -> "AuditEventSnapshot":
        known = {
            "timestamp_rfc3339", "request_id", "trace_id", "agent_id",
            "target_server", "tool_name", "runtime_mode", "decision",
            "policy_version", "denial_reason", "validator_summary",
            "kill_switch_active", "latency_us",
        }
        extra = {k: v for k, v in d.items() if k not in known}
        return cls(
            timestamp_rfc3339=d["timestamp_rfc3339"],
            request_id=d["request_id"],
            trace_id=d["trace_id"],
            agent_id=d["agent_id"],
            target_server=d["target_server"],
            tool_name=d["tool_name"],
            runtime_mode=d["runtime_mode"],
            decision=d["decision"],
            policy_version=d["policy_version"],
            denial_reason=d.get("denial_reason"),
            validator_summary=d.get("validator_summary", []),
            kill_switch_active=d["kill_switch_active"],
            latency_us=d["latency_us"],
            extra=extra,
        )


# ---------------------------------------------------------------------------
# Token redaction patterns — MUST match what Team 5 strips before logging
# ---------------------------------------------------------------------------

_REDACTION_FORBIDDEN = [
    re.compile(r"Bearer\s+[A-Za-z0-9\-._~+/]+=*"),   # Authorization header value
    re.compile(r"eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+"),  # JWT header.payload prefix
    re.compile(r"\"Authorization\"\s*:"),               # Header name in JSON
]


def _assert_no_tokens_in_text(text: str, context: str = "") -> None:
    """Raise AssertionError if any bearer token pattern appears in text."""
    for pattern in _REDACTION_FORBIDDEN:
        match = pattern.search(text)
        if match:
            raise AssertionError(
                f"SECURITY VIOLATION in {context}: "
                f"found token pattern '{pattern.pattern}' (matched: '{match.group()[:40]}...'). "
                f"Team 5 must redact bearer tokens before writing AuditEvent."
            )


# ---------------------------------------------------------------------------
# JSON-RPC body assertions
# ---------------------------------------------------------------------------

def assert_jsonrpc_permit(response: dict) -> None:
    """Assert the JSON-RPC response indicates a successful (permitted) tools/call.
    
    A permitted response has no isError flag and a non-null result.
    """
    assert response.get("jsonrpc") == "2.0", (
        f"Expected jsonrpc=2.0, got: {response.get('jsonrpc')!r}"
    )
    assert "error" not in response, (
        f"Expected no JSON-RPC error but found: {response['error']}"
    )
    result = response.get("result")
    assert result is not None, "Expected non-null result for permitted call"
    assert result.get("isError") is not True, (
        f"Expected isError!=true for permitted call, got: {result}"
    )


def assert_jsonrpc_denied(
    response: dict,
    *,
    reason_fragment: str | None = None,
    is_kill_switch: bool = False,
) -> None:
    """Assert the JSON-RPC response body indicates a policy denial.
    
    Per agentgateway spec, a denied tools/call returns HTTP 200 with
    isError=true in the result body. HTTP 200 alone is NOT sufficient.
    
    Args:
        response: Parsed JSON-RPC response dict.
        reason_fragment: Optional substring expected in content[0].text.
        is_kill_switch: If True, also assert KILL_SWITCH_TRIGGERED appears in body. [D3/D5]
    """
    assert response.get("jsonrpc") == "2.0", (
        f"Expected jsonrpc=2.0, got: {response.get('jsonrpc')!r}"
    )
    result = response.get("result", {})
    assert result.get("isError") is True, (
        f"ASSERTION FAILURE: Expected isError=true for denied tools/call but got: {result}. "
        f"HTTP 200 alone is not a sufficient denial assertion."
    )
    content = result.get("content", [])
    assert len(content) > 0, (
        f"Expected non-empty content array in denial response, got: {content}"
    )
    text = content[0].get("text", "")
    assert len(text) > 0, f"Expected non-empty denial message text, got empty string"

    if reason_fragment:
        assert reason_fragment in text, (
            f"Expected '{reason_fragment}' in denial text but got: '{text[:200]}'"
        )
    # [D3][D5] DRAFT BOUNDARY: kill switch text format pending Decision D3/D5
    if is_kill_switch:
        assert "KILL_SWITCH_TRIGGERED" in text, (  # [DRAFT-MOCK] text token TBD
            f"Expected KILL_SWITCH_TRIGGERED token in kill-switch denial, got: '{text[:200]}'"
        )
    # Security invariant: denial message must not contain bearer tokens
    _assert_no_tokens_in_text(text, context="JSON-RPC denial content")


def assert_jsonrpc_error_code(response: dict, expected_code: int) -> None:
    """Assert a JSON-RPC error response with specific error code (e.g. -32001). [D7]
    
    Used for non-tools/call method denials. DRAFT: code value pending Decision D7.
    """
    assert "error" in response, (
        f"Expected JSON-RPC error object but got result: {response}"
    )
    code = response["error"].get("code")
    assert code == expected_code, (
        f"Expected JSON-RPC error code {expected_code}, got {code}"
    )


# ---------------------------------------------------------------------------
# Backend side-effect assertions
# ---------------------------------------------------------------------------

class MockBackendCallLog:
    """In-memory log of calls received by the mock MCP backend server.
    
    The mock server appends a CallRecord for every request it processes.
    Tests inject faults by telling the mock to reject or not-record calls.
    """

    def __init__(self):
        self._calls: list[dict] = []
        self._markers: dict[str, int] = {}

    def record(self, tool_name: str, arguments: dict, request_id: str) -> None:
        self._calls.append({
            "tool_name": tool_name,
            "arguments": arguments,
            "request_id": request_id,
        })

    def mark(self, marker: str) -> None:
        """Set a named bookmark at the current call count."""
        self._markers[marker] = len(self._calls)

    def calls_since(self, marker: str, tool_name: str | None = None) -> list[dict]:
        start = self._markers.get(marker, 0)
        calls = self._calls[start:]
        if tool_name is not None:
            calls = [c for c in calls if c["tool_name"] == tool_name]
        return calls

    def reset(self) -> None:
        self._calls.clear()
        self._markers.clear()


def assert_backend_not_called(
    log: MockBackendCallLog, tool_name: str, since_marker: str
) -> None:
    """Assert the mock backend did NOT receive a tools/call for the given tool since marker."""
    calls = log.calls_since(since_marker, tool_name=tool_name)
    assert len(calls) == 0, (
        f"Backend should NOT have been called for denied tool '{tool_name}' "
        f"but received {len(calls)} call(s): {calls}"
    )


def assert_backend_called_once(
    log: MockBackendCallLog, tool_name: str, since_marker: str
) -> None:
    """Assert the mock backend received exactly one tools/call since marker."""
    calls = log.calls_since(since_marker, tool_name=tool_name)
    assert len(calls) == 1, (
        f"Expected exactly 1 backend call for '{tool_name}' since '{since_marker}', "
        f"got {len(calls)}: {calls}"
    )


# ---------------------------------------------------------------------------
# AuditEvent assertions
# ---------------------------------------------------------------------------

class MockAuditSink:
    """In-memory sink that the test harness injects in place of the real audit writer.
    
    In integration tests against a live stack, this reads from audit.jsonl.
    In unit tests, it stores events injected directly by test helpers.
    """

    def __init__(self):
        self._events: list[AuditEventSnapshot] = []

    def ingest_jsonl(self, text: str) -> None:
        for line in text.splitlines():
            line = line.strip()
            if line:
                self._events.append(AuditEventSnapshot.from_dict(json.loads(line)))

    def events_for(self, request_id: str) -> list[AuditEventSnapshot]:
        return [e for e in self._events if e.request_id == request_id]

    def reset(self) -> None:
        self._events.clear()


def assert_audit_event(
    sink: MockAuditSink,
    request_id: str,
    *,
    expected_decision: str,
    expected_runtime_mode: str,
    kill_switch_active: bool = False,
    expect_denial_reason: bool = False,
    expect_validator_violation: bool = False,
) -> AuditEventSnapshot:
    """Assert exactly one AuditEvent was emitted for the request and validate its fields.
    
    Security invariants checked:
    1. No bearer tokens appear in any string field.
    2. agent_id is present (non-empty).
    3. latency_us is non-negative integer.
    4. decision matches expected value.
    5. kill_switch_active matches expected value.
    
    Returns the matched event for callers that need further field-level checks.
    """
    events = sink.events_for(request_id)
    assert len(events) == 1, (
        f"Expected exactly 1 AuditEvent for request_id={request_id!r}, "
        f"got {len(events)}: {[e.decision for e in events]}"
    )
    evt = events[0]

    # Field value checks
    assert evt.decision == expected_decision, (
        f"AuditEvent.decision: expected {expected_decision!r}, got {evt.decision!r}"
    )
    assert evt.runtime_mode == expected_runtime_mode, (
        f"AuditEvent.runtime_mode: expected {expected_runtime_mode!r}, got {evt.runtime_mode!r}"
    )
    assert evt.kill_switch_active == kill_switch_active, (
        f"AuditEvent.kill_switch_active: expected {kill_switch_active}, got {evt.kill_switch_active}"
    )
    if expect_denial_reason:
        assert evt.denial_reason, (
            f"Expected non-empty AuditEvent.denial_reason for decision={expected_decision!r}"
        )
    if expect_validator_violation:
        assert len(evt.validator_summary) > 0, (
            "Expected validator_summary entries for a validator-failure scenario"
        )

    # Security invariants
    assert evt.agent_id, "AuditEvent.agent_id must be present and non-empty"
    assert isinstance(evt.latency_us, int) and evt.latency_us >= 0, (
        f"AuditEvent.latency_us must be a non-negative integer, got: {evt.latency_us!r}"
    )
    raw_text = json.dumps(evt.__dict__)
    _assert_no_tokens_in_text(raw_text, context=f"AuditEvent for {request_id}")

    return evt
