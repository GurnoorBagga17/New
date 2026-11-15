"""
tests/integration/test_acceptance_matrix.py
Team 6 — Gate G1 Acceptance Matrix Integration Tests
Version: 0.1.0-draft

Covers all rows in tests/integration/gate_g1_acceptance_matrix.md using the mock stack.
Tests are parameterized to run in both ObserveOnly and Enforce modes where the row applies.

DRAFT BOUNDARY notes:
- OB-07 / kill-switch-in-observe-only: implementation depends on Decision D3.
  The test exists but is guarded by SKIP_DRAFT_D3 flag.
- Assertions over WOULD_DENY vs. DENY in observe-only audit records depend on Decision D4.
  Current stubs use "WOULD_DENY"; update assertions when D4 is resolved.
- EN-10 (non-tools/call JSON-RPC error code) depends on Decision D7.

Run:
    python -m pytest tests/integration/test_acceptance_matrix.py -v

No live services are required; all subsystems are mocked.
"""

from __future__ import annotations

import pytest

from tests.integration.helpers.assertions import (
    MockAuditSink,
    MockBackendCallLog,
    assert_audit_event,
    assert_backend_called_once,
    assert_backend_not_called,
    assert_jsonrpc_denied,
    assert_jsonrpc_permit,
)
from tests.integration.helpers.mock_stack import (
    Decision,
    ExtMcpTimeoutError,
    MockExtMcp,
    MockGateway,
    MockMcpBackend,
    PolicyLoadError,
    RuntimeMode,
    StubPolicyResponse,
    StubValidatorResult,
)

# ---------------------------------------------------------------------------
# Flags for draft-blocked test cases
# ---------------------------------------------------------------------------

# [D3] Pending Team 0 decision: does kill switch override observe-only?
# Set to False to skip OB-07 until D3 is resolved.
SKIP_DRAFT_D3 = False  # T6 recommendation: True; keeping test as expected-to-fail

# [D7] Pending Team 0 decision: non-tools/call error code
SKIP_DRAFT_D7 = True


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def audit_sink() -> MockAuditSink:
    return MockAuditSink()


@pytest.fixture
def backend() -> MockMcpBackend:
    return MockMcpBackend()


def _make_request(tool_name: str = "mock_tool", params: dict | None = None) -> dict:
    return {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {"name": tool_name, **(params or {})},
    }


# ---------------------------------------------------------------------------
# Observe-Only tests (OB-*)
# ---------------------------------------------------------------------------

class TestObserveOnlyMatrix:

    def _gw(self, extmcp, backend, audit_sink, revocation_state=None):
        return MockGateway(
            runtime_mode=RuntimeMode.OBSERVE_ONLY,
            backend=backend,
            extmcp=extmcp,
            audit_sink=audit_sink,
            revocation_state=revocation_state,
        )

    def test_ob01_policy_permit_forwards_and_audits(self, backend, audit_sink):
        """OB-01: Policy permit in observe-only → forward, ALLOW audit."""
        extmcp = MockExtMcp(policy_response=StubPolicyResponse(decision=Decision.PERMIT))
        gw = self._gw(extmcp, backend, audit_sink)
        backend.call_log.mark("before")

        req = _make_request("mock_tool")
        resp = gw.handle(req, agent_id="agent-oa-01")

        assert_jsonrpc_permit(resp)
        assert_backend_called_once(backend.call_log, "mock_tool", "before")

        events = audit_sink.events_for(gw.audit_sink._events[-1].request_id)
        evt = events[-1]
        assert evt.decision == "ALLOW"
        assert evt.kill_switch_active is False
        assert evt.runtime_mode == "ObserveOnly"

    def test_ob02_policy_deny_forwards_and_audits_would_deny(self, backend, audit_sink):
        """OB-02: Policy deny in observe-only → still forward, WOULD_DENY audit. [D4]"""
        extmcp = MockExtMcp(
            policy_response=StubPolicyResponse(decision=Decision.DENY, reason="policy deny")
        )
        gw = self._gw(extmcp, backend, audit_sink)
        backend.call_log.mark("before")

        req = _make_request("mock_tool")
        resp = gw.handle(req, agent_id="agent-oa-02")

        # In observe-only: forwarded despite denial — backend MUST have been called
        assert_backend_called_once(backend.call_log, "mock_tool", "before")
        # Response is NOT an error body — it's the upstream result
        result = resp.get("result", {})
        assert result.get("isError") is not True, (
            "OB-02: Observe-only should NOT inject isError=true even for a would-deny"
        )

        # Audit: WOULD_DENY [D4]
        evt = audit_sink._events[-1]
        assert evt.decision == "WOULD_DENY", f"[D4-draft] Expected WOULD_DENY, got {evt.decision}"
        assert evt.denial_reason is not None

    def test_ob03_identity_failure_forwards(self, backend, audit_sink):
        """OB-03: Auth failure in observe-only → forward, WOULD_DENY audit."""
        # Simulate identity failure via a deny from ExtMCP with a suitable reason
        extmcp = MockExtMcp(
            policy_response=StubPolicyResponse(
                decision=Decision.DENY, reason="identity: token expired"
            )
        )
        gw = self._gw(extmcp, backend, audit_sink)
        backend.call_log.mark("before")

        resp = gw.handle(_make_request(), agent_id="agent-oa-03")
        assert_backend_called_once(backend.call_log, "mock_tool", "before")
        evt = audit_sink._events[-1]
        assert evt.decision == "WOULD_DENY"
        assert "identity" in (evt.denial_reason or "").lower()

    def test_ob04_validator_failure_forwards(self, backend, audit_sink):
        """OB-04: Validator failure in observe-only → forward, WOULD_DENY + validator_summary."""
        extmcp = MockExtMcp(
            policy_response=StubPolicyResponse(
                decision=Decision.DENY, reason="validator: stacked SQL"
            ),
            validator_result=StubValidatorResult(
                validator_id="sql",
                passed=False,
                violation_code="STACKED_QUERY",
                reason="Multiple statements detected",
            ),
        )
        gw = self._gw(extmcp, backend, audit_sink)
        backend.call_log.mark("before")

        resp = gw.handle(_make_request(), agent_id="agent-oa-04")
        assert_backend_called_once(backend.call_log, "mock_tool", "before")
        evt = audit_sink._events[-1]
        assert evt.decision == "WOULD_DENY"
        assert any("STACKED_QUERY" in s for s in evt.validator_summary), (
            f"Expected STACKED_QUERY in validator_summary, got: {evt.validator_summary}"
        )

    def test_ob05_extmcp_timeout_forwards(self, backend, audit_sink):
        """OB-05: ExtMCP timeout in observe-only → forward, shadow failure audit."""
        extmcp = MockExtMcp(simulate_timeout=True)
        gw = self._gw(extmcp, backend, audit_sink)
        backend.call_log.mark("before")

        resp = gw.handle(_make_request(), agent_id="agent-oa-05")
        assert_backend_called_once(backend.call_log, "mock_tool", "before")
        evt = audit_sink._events[-1]
        assert evt.decision == "WOULD_DENY"
        assert "timeout" in (evt.denial_reason or "").lower()

    def test_ob06_policy_load_failure_forwards(self, backend, audit_sink):
        """OB-06: Policy-load failure in observe-only → forward, shadow failure audit."""
        extmcp = MockExtMcp(policy_load_failure=True)
        gw = self._gw(extmcp, backend, audit_sink)
        backend.call_log.mark("before")

        resp = gw.handle(_make_request(), agent_id="agent-oa-06")
        assert_backend_called_once(backend.call_log, "mock_tool", "before")
        evt = audit_sink._events[-1]
        assert evt.decision == "WOULD_DENY"
        assert "policy_load_failure" in (evt.denial_reason or "").lower()

    @pytest.mark.skipif(SKIP_DRAFT_D3, reason="[D3] Kill-switch-in-OO behavior not yet decided")
    def test_ob07_kill_switch_in_observe_only(self, backend, audit_sink):
        """OB-07: Kill switch active in observe-only — DRAFT [D3].
        
        T6 recommendation: kill switch OVERRIDES observe-only (security guarantee).
        Test asserts T6 recommendation until D3 is settled.
        If Team 0 decides OO always forwards, invert assert and update matrix.
        """
        extmcp = MockExtMcp(policy_response=StubPolicyResponse(decision=Decision.PERMIT))
        gw = self._gw(
            extmcp, backend, audit_sink,
            revocation_state={"agent": {"agent-oa-07"}}
        )
        backend.call_log.mark("before")

        resp = gw.handle(_make_request(), agent_id="agent-oa-07")
        # T6 recommendation: blocked even in OO
        assert_jsonrpc_denied(resp, reason_fragment="KILL_SWITCH_TRIGGERED", is_kill_switch=True)
        assert_backend_not_called(backend.call_log, "mock_tool", "before")
        evt = audit_sink._events[-1]
        assert evt.kill_switch_active is True


# ---------------------------------------------------------------------------
# Enforce mode tests (EN-*)
# ---------------------------------------------------------------------------

class TestEnforceModeMatrix:

    def _gw(self, extmcp, backend, audit_sink, revocation_state=None):
        return MockGateway(
            runtime_mode=RuntimeMode.ENFORCE,
            backend=backend,
            extmcp=extmcp,
            audit_sink=audit_sink,
            revocation_state=revocation_state,
        )

    def test_en01_policy_permit_forwards(self, backend, audit_sink):
        """EN-01: Policy permit in enforce → forward, ALLOW audit."""
        extmcp = MockExtMcp(policy_response=StubPolicyResponse(decision=Decision.PERMIT))
        gw = self._gw(extmcp, backend, audit_sink)
        backend.call_log.mark("before")

        resp = gw.handle(_make_request(), agent_id="agent-en-01")
        assert_jsonrpc_permit(resp)
        assert_backend_called_once(backend.call_log, "mock_tool", "before")
        evt = audit_sink._events[-1]
        assert evt.decision == "ALLOW"
        assert evt.runtime_mode == "Enforce"

    def test_en02_policy_deny_blocks_backend(self, backend, audit_sink):
        """EN-02: Policy deny in enforce → isError=true, backend NOT called, DENY audit."""
        extmcp = MockExtMcp(
            policy_response=StubPolicyResponse(decision=Decision.DENY, reason="Cedar forbid rule")
        )
        gw = self._gw(extmcp, backend, audit_sink)
        backend.call_log.mark("before")

        resp = gw.handle(_make_request(), agent_id="agent-en-02")
        assert_jsonrpc_denied(resp)
        assert_backend_not_called(backend.call_log, "mock_tool", "before")
        evt = audit_sink._events[-1]
        assert evt.decision == "DENY"
        assert evt.denial_reason is not None

    def test_en03_identity_failure_blocks_backend(self, backend, audit_sink):
        """EN-03: Identity failure in enforce → blocked, NOT forwarded to backend."""
        extmcp = MockExtMcp(
            policy_response=StubPolicyResponse(
                decision=Decision.DENY, reason="identity: token expired"
            )
        )
        gw = self._gw(extmcp, backend, audit_sink)
        backend.call_log.mark("before")

        resp = gw.handle(_make_request(), agent_id="agent-en-03")
        assert_jsonrpc_denied(resp)
        assert_backend_not_called(backend.call_log, "mock_tool", "before")
        evt = audit_sink._events[-1]
        assert evt.decision == "DENY"
        assert "identity" in (evt.denial_reason or "").lower()

    def test_en04_validator_failure_blocks_backend(self, backend, audit_sink):
        """EN-04: Validator failure in enforce → blocked, NOT forwarded, violation in audit."""
        extmcp = MockExtMcp(
            policy_response=StubPolicyResponse(
                decision=Decision.DENY, reason="validator: stacked SQL detected"
            ),
            validator_result=StubValidatorResult(
                validator_id="sql",
                passed=False,
                violation_code="STACKED_QUERY",
            ),
        )
        gw = self._gw(extmcp, backend, audit_sink)
        backend.call_log.mark("before")

        resp = gw.handle(_make_request(), agent_id="agent-en-04")
        assert_jsonrpc_denied(resp)
        assert_backend_not_called(backend.call_log, "mock_tool", "before")
        evt = audit_sink._events[-1]
        assert evt.decision == "DENY"
        assert any("STACKED_QUERY" in s for s in evt.validator_summary)

    def test_en05_extmcp_timeout_fails_closed(self, backend, audit_sink):
        """EN-05: ExtMCP timeout in enforce → fail-closed, backend NOT called."""
        extmcp = MockExtMcp(simulate_timeout=True)
        gw = self._gw(extmcp, backend, audit_sink)
        backend.call_log.mark("before")

        resp = gw.handle(_make_request(), agent_id="agent-en-05")
        assert_jsonrpc_denied(resp)
        assert_backend_not_called(backend.call_log, "mock_tool", "before")
        evt = audit_sink._events[-1]
        assert evt.decision == "DENY"
        assert "timeout" in (evt.denial_reason or "").lower()

    def test_en06_policy_load_failure_fails_closed(self, backend, audit_sink):
        """EN-06: Policy-load failure in enforce → fail-closed, backend NOT called."""
        extmcp = MockExtMcp(policy_load_failure=True)
        gw = self._gw(extmcp, backend, audit_sink)
        backend.call_log.mark("before")

        resp = gw.handle(_make_request(), agent_id="agent-en-06")
        assert_jsonrpc_denied(resp)
        assert_backend_not_called(backend.call_log, "mock_tool", "before")
        evt = audit_sink._events[-1]
        assert evt.decision == "DENY"

    def test_en07_kill_switch_agent_scoped(self, backend, audit_sink):
        """EN-07: Kill switch (agent-scoped) in enforce → blocked, kill_switch_active=true."""
        extmcp = MockExtMcp(policy_response=StubPolicyResponse(decision=Decision.PERMIT))
        gw = self._gw(
            extmcp, backend, audit_sink,
            revocation_state={"agent": {"agent-en-07"}}
        )
        backend.call_log.mark("before")

        resp = gw.handle(_make_request(), agent_id="agent-en-07")
        assert_jsonrpc_denied(resp, is_kill_switch=True)
        assert_backend_not_called(backend.call_log, "mock_tool", "before")
        evt = audit_sink._events[-1]
        assert evt.kill_switch_active is True
        assert evt.decision == "DENY"

    def test_en08_kill_switch_tool_scoped(self, backend, audit_sink):
        """EN-08: Kill switch (tool-scoped) in enforce → blocked, kill_switch_active=true."""
        extmcp = MockExtMcp(policy_response=StubPolicyResponse(decision=Decision.PERMIT))
        gw = self._gw(
            extmcp, backend, audit_sink,
            revocation_state={"tool": {"mock-server/mock_tool"}}
        )
        backend.call_log.mark("before")

        resp = gw.handle(
            _make_request("mock_tool"),
            agent_id="agent-en-08",
            target_server="mock-server",
            tool_name="mock_tool",
        )
        assert_jsonrpc_denied(resp, is_kill_switch=True)
        assert_backend_not_called(backend.call_log, "mock_tool", "before")
        evt = audit_sink._events[-1]
        assert evt.kill_switch_active is True

    def test_en09_kill_switch_global(self, backend, audit_sink):
        """EN-09: Global kill switch in enforce → all agents blocked."""
        extmcp = MockExtMcp(policy_response=StubPolicyResponse(decision=Decision.PERMIT))
        gw = self._gw(
            extmcp, backend, audit_sink,
            revocation_state={"global": True}
        )
        backend.call_log.mark("before")

        for agent_id in ["agent-a", "agent-b", "agent-c"]:
            resp = gw.handle(_make_request(), agent_id=agent_id)
            assert_jsonrpc_denied(resp, is_kill_switch=True)

        assert_backend_not_called(backend.call_log, "mock_tool", "before")
        for evt in audit_sink._events:
            assert evt.kill_switch_active is True

    @pytest.mark.skipif(SKIP_DRAFT_D7, reason="[D7] Non-tools/call error code not yet decided")
    def test_en10_non_tools_call_method_denied(self, backend, audit_sink):
        """EN-10: Non-tools/call method denied → JSON-RPC error -32001. DRAFT [D7]."""
        # Placeholder — will implement when D7 is resolved
        pytest.skip("[D7] Pending Team 0 decision on non-tools/call error code")


# ---------------------------------------------------------------------------
# Security invariant: audit records must never contain bearer tokens
# ---------------------------------------------------------------------------

class TestAuditRedactionInvariant:

    def test_audit_never_contains_bearer_token(self, backend, audit_sink):
        """Security: AuditEvent must not contain bearer token even for denied requests."""
        extmcp = MockExtMcp(policy_response=StubPolicyResponse(decision=Decision.DENY))
        gw = MockGateway(
            runtime_mode=RuntimeMode.ENFORCE,
            backend=backend,
            extmcp=extmcp,
            audit_sink=audit_sink,
        )
        resp = gw.handle(_make_request(), agent_id="agent-redact-01")
        # Verify audit assertion helper catches any token leakage
        evt = audit_sink._events[-1]
        # Simulate what would happen if a bearer token leaked into agent_id
        import json
        raw = json.dumps(evt.__dict__)
        forbidden = ["Bearer ", "eyJ", "Authorization:"]
        for tok in forbidden:
            assert tok not in raw, (
                f"SECURITY VIOLATION: '{tok}' found in AuditEvent — "
                "bearer tokens must never reach audit logs"
            )
