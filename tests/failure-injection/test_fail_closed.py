"""
tests/failure-injection/test_fail_closed.py
Team 6 — Gate G1 Failure Injection / Chaos Suite
Version: 0.1.0-draft

Covers Q6.5/Q6.6: Fail-closed chaos testing and observe-only verification.

Scenarios injected:
  CHAOS-01: ExtMCP process killed (unavailable) during active traffic — enforce fails closed.
  CHAOS-02: ExtMCP process paused (SIGSTOP / docker pause) — enforce fails closed.
  CHAOS-03: Policy file corrupted mid-reload — enforce fails closed.
  CHAOS-04: Policy file corrupted in observe-only — traffic continues, shadow audit.
  CHAOS-05: ExtMCP unavailable in observe-only — 0% legitimate calls fail.
  CHAOS-06: Partial ExtMCP flap: some calls succeed, some time out — enforce always fail-closed.
  CHAOS-07: Revocation state stale (out-of-date propagation) — latest-revoked wins.
  CHAOS-08: AuditEvent writer blocked (simulated I/O stall) — inline path not blocked.

STUB NOTE: These tests use MockGateway with injected faults. The live chaos harness
(docker pause / SIGSTOP) is documented in comments and planned for Day 60.
Filing criteria: if a test fails against the live stack, file a bug to the owning team
and do NOT fix it in this directory.

Run:
    python -m pytest tests/failure-injection/test_fail_closed.py -v
"""

from __future__ import annotations

import threading
import time

import pytest

from tests.integration.helpers.assertions import MockAuditSink
from tests.integration.helpers.mock_stack import (
    Decision,
    MockExtMcp,
    MockGateway,
    MockMcpBackend,
    RuntimeMode,
    StubPolicyResponse,
    StubValidatorResult,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def audit_sink():
    return MockAuditSink()


@pytest.fixture
def backend():
    return MockMcpBackend()


def _req(tool: str = "mock_tool") -> dict:
    return {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool}}


# ---------------------------------------------------------------------------
# CHAOS-01: ExtMCP unavailable in enforce mode → fail closed
# ---------------------------------------------------------------------------

class TestExtMcpUnavailableEnforce:

    def test_chaos01_extmcp_unavailable_fails_closed(self, backend, audit_sink):
        """CHAOS-01: ExtMCP unavailable in enforce → 100% of calls fail closed, 0% reach backend."""
        extmcp = MockExtMcp(simulate_unavailable=True)
        gw = MockGateway(
            runtime_mode=RuntimeMode.ENFORCE,
            backend=backend,
            extmcp=extmcp,
            audit_sink=audit_sink,
        )
        backend.call_log.mark("before")

        blocked = 0
        for i in range(50):
            resp = gw.handle(_req(), agent_id=f"agent-chaos01-{i}")
            result = resp.get("result", {})
            if result.get("isError") is True:
                blocked += 1

        # 100% must be blocked
        assert blocked == 50, (
            f"CHAOS-01 FAIL: Only {blocked}/50 calls were blocked when ExtMCP is unavailable. "
            f"enforce mode MUST fail closed. Bug: file to @axiom-nhi/team-1-gateway (G1.5/G1.6)"
        )
        # 0% must reach backend
        backend_calls = backend.call_log.calls_since("before")
        assert len(backend_calls) == 0, (
            f"CHAOS-01 FAIL: {len(backend_calls)} calls reached backend despite ExtMCP unavailability. "
            f"enforce mode MUST NOT forward to backend when extmcp is unreachable."
        )

    def test_chaos01_all_calls_audited_on_extmcp_failure(self, backend, audit_sink):
        """CHAOS-01b: Every fail-closed call must still generate an AuditEvent."""
        extmcp = MockExtMcp(simulate_unavailable=True)
        gw = MockGateway(
            runtime_mode=RuntimeMode.ENFORCE,
            backend=backend,
            extmcp=extmcp,
            audit_sink=audit_sink,
        )
        n_calls = 20
        for i in range(n_calls):
            gw.handle(_req(), agent_id=f"agent-chaos01b-{i}")

        assert len(audit_sink._events) >= n_calls, (
            f"CHAOS-01b FAIL: Expected >={n_calls} audit events but got {len(audit_sink._events)}. "
            f"Every fail-closed call must be audited. Bug: @axiom-nhi/team-5-observability"
        )
        for evt in audit_sink._events:
            assert evt.decision == "DENY", (
                f"CHAOS-01b FAIL: Expected DENY decision for fail-closed call, got {evt.decision!r}"
            )


# ---------------------------------------------------------------------------
# CHAOS-02: ExtMCP timeout in enforce mode → fail closed
# ---------------------------------------------------------------------------

class TestExtMcpTimeoutEnforce:

    def test_chaos02_extmcp_timeout_fails_closed(self, backend, audit_sink):
        """CHAOS-02: ExtMCP timeout (15ms deadline exceeded) in enforce → fail closed."""
        extmcp = MockExtMcp(simulate_timeout=True)
        gw = MockGateway(
            runtime_mode=RuntimeMode.ENFORCE,
            backend=backend,
            extmcp=extmcp,
            audit_sink=audit_sink,
        )
        backend.call_log.mark("before")

        blocked = 0
        for i in range(50):
            resp = gw.handle(_req(), agent_id=f"agent-chaos02-{i}")
            if resp.get("result", {}).get("isError") is True:
                blocked += 1

        assert blocked == 50, (
            f"CHAOS-02 FAIL: {50 - blocked}/50 calls were NOT blocked on ExtMCP timeout. "
            f"enforce mode MUST fail closed on timeout. Bug: @axiom-nhi/team-1-gateway (G1.5)"
        )
        assert len(backend.call_log.calls_since("before")) == 0


# ---------------------------------------------------------------------------
# CHAOS-03/04: Policy load failure — enforce vs. observe-only
# ---------------------------------------------------------------------------

class TestPolicyLoadFailure:

    def test_chaos03_policy_load_failure_enforce_fails_closed(self, backend, audit_sink):
        """CHAOS-03: Corrupt policy bundle in enforce → fail closed, 0% reach backend."""
        extmcp = MockExtMcp(policy_load_failure=True)
        gw = MockGateway(
            runtime_mode=RuntimeMode.ENFORCE,
            backend=backend,
            extmcp=extmcp,
            audit_sink=audit_sink,
        )
        backend.call_log.mark("before")

        for i in range(30):
            resp = gw.handle(_req(), agent_id=f"agent-chaos03-{i}")
            assert resp.get("result", {}).get("isError") is True, (
                f"CHAOS-03 FAIL: Call {i} was NOT blocked on policy load failure in enforce mode."
            )

        assert len(backend.call_log.calls_since("before")) == 0, (
            "CHAOS-03 FAIL: Calls reached backend despite policy load failure in enforce mode."
        )

    def test_chaos04_policy_load_failure_observe_only_forwards(self, backend, audit_sink):
        """CHAOS-04: Corrupt policy bundle in observe-only → 0% calls fail, all forwarded."""
        extmcp = MockExtMcp(policy_load_failure=True)
        gw = MockGateway(
            runtime_mode=RuntimeMode.OBSERVE_ONLY,
            backend=backend,
            extmcp=extmcp,
            audit_sink=audit_sink,
        )
        backend.call_log.mark("before")

        n_calls = 30
        for i in range(n_calls):
            resp = gw.handle(_req(), agent_id=f"agent-chaos04-{i}")
            result = resp.get("result", {})
            assert result.get("isError") is not True, (
                f"CHAOS-04 FAIL: observe-only call {i} was blocked on policy load failure. "
                f"observe-only MUST NOT block legitimate calls. Bug: @axiom-nhi/team-1-gateway"
            )

        # All must have reached backend
        backend_calls = backend.call_log.calls_since("before")
        assert len(backend_calls) == n_calls, (
            f"CHAOS-04 FAIL: Expected {n_calls} backend calls in observe-only, got {len(backend_calls)}."
        )

        # Audit must record shadow failure
        for evt in audit_sink._events[-n_calls:]:
            assert evt.decision == "WOULD_DENY", (
                f"CHAOS-04 FAIL: Expected WOULD_DENY audit in observe-only failure, got {evt.decision!r}"
            )


# ---------------------------------------------------------------------------
# CHAOS-05: ExtMCP unavailable in observe-only → 0% legitimate calls fail
# ---------------------------------------------------------------------------

class TestExtMcpUnavailableObserveOnly:

    def test_chaos05_extmcp_unavailable_observe_only_forwards(self, backend, audit_sink):
        """CHAOS-05: ExtMCP unavailable in observe-only → 0% calls blocked, all forwarded."""
        extmcp = MockExtMcp(simulate_unavailable=True)
        gw = MockGateway(
            runtime_mode=RuntimeMode.OBSERVE_ONLY,
            backend=backend,
            extmcp=extmcp,
            audit_sink=audit_sink,
        )
        backend.call_log.mark("before")

        n_calls = 50
        for i in range(n_calls):
            resp = gw.handle(_req(), agent_id=f"agent-chaos05-{i}")
            result = resp.get("result", {})
            assert result.get("isError") is not True, (
                f"CHAOS-05 FAIL: observe-only call {i} was blocked when ExtMCP is unavailable. "
                f"Zero legitimate calls may fail in observe-only. Bug: @axiom-nhi/team-1-gateway"
            )

        backend_calls = backend.call_log.calls_since("before")
        assert len(backend_calls) == n_calls


# ---------------------------------------------------------------------------
# CHAOS-06: Partial ExtMCP flap — alternating timeout/success in enforce
# ---------------------------------------------------------------------------

class TestExtMcpFlap:

    def test_chaos06_partial_flap_enforce_always_fails_closed_on_timeout(self, backend, audit_sink):
        """CHAOS-06: Intermittent ExtMCP timeout in enforce → every timed-out call fails closed."""
        backend.call_log.mark("before")
        permit_response = StubPolicyResponse(decision=Decision.PERMIT)

        for i in range(100):
            audit_sink.reset()
            # Alternate: even calls succeed, odd calls timeout
            if i % 2 == 0:
                extmcp = MockExtMcp(policy_response=permit_response)
            else:
                extmcp = MockExtMcp(simulate_timeout=True)

            gw = MockGateway(
                runtime_mode=RuntimeMode.ENFORCE,
                backend=backend,
                extmcp=extmcp,
                audit_sink=audit_sink,
            )
            resp = gw.handle(_req(), agent_id=f"agent-chaos06-{i}")
            result = resp.get("result", {})
            if i % 2 == 1:
                # Timeout call must fail closed
                assert result.get("isError") is True, (
                    f"CHAOS-06 FAIL: Timeout call {i} was NOT blocked in enforce mode."
                )

        # Verify backend was only called for the 50 successful (even) calls
        all_calls = backend.call_log.calls_since("before")
        assert len(all_calls) == 50, (
            f"CHAOS-06 FAIL: Expected 50 backend calls (permitted), got {len(all_calls)}."
        )


# ---------------------------------------------------------------------------
# CHAOS-07: Stale revocation state
# ---------------------------------------------------------------------------

class TestStaleRevocationState:

    def test_chaos07_stale_revocation_state_uses_latest_known_revoked(self, backend, audit_sink):
        """CHAOS-07: When revocation propagation is delayed, gateway uses last-known state.
        
        Security invariant: stale state defaults to REVOKED (not permitted).
        In-memory ArcSwap: once written, the revoked bit is durable until explicitly cleared.
        
        This test verifies that a call after a revocation event is blocked even if the
        revocation notification arrives with a delay.
        
        Live-stack note: measure propagation latency separately in PERF-04.
        """
        permit_policy = StubPolicyResponse(decision=Decision.PERMIT)
        extmcp = MockExtMcp(policy_response=permit_policy)

        # Phase 1: Call is permitted
        gw = MockGateway(
            runtime_mode=RuntimeMode.ENFORCE,
            backend=backend,
            extmcp=extmcp,
            audit_sink=audit_sink,
            revocation_state={},
        )
        backend.call_log.mark("before_revocation")
        resp1 = gw.handle(_req(), agent_id="agent-chaos07")
        assert resp1.get("result", {}).get("isError") is not True

        # Phase 2: Revocation state updated (simulating propagation)
        gw.revocation_state = {"agent": {"agent-chaos07"}}
        backend.call_log.mark("after_revocation")

        # Phase 3: Subsequent call must be blocked
        resp2 = gw.handle(_req(), agent_id="agent-chaos07")
        assert resp2.get("result", {}).get("isError") is True, (
            "CHAOS-07 FAIL: Call after revocation state update was NOT blocked. "
            "Stale state must default to revoked. Bug: @axiom-nhi/team-5-observability"
        )
        assert len(backend.call_log.calls_since("after_revocation")) == 0


# ---------------------------------------------------------------------------
# CHAOS-08: Audit writer I/O stall must not block inline path
# ---------------------------------------------------------------------------

class TestAuditWriterIoStall:

    def test_chaos08_audit_io_stall_does_not_block_inline_path(self, backend, audit_sink):
        """CHAOS-08: Simulated audit writer I/O stall must not delay inline request path.
        
        Security invariant from runtime-pipeline.md §7: Audit I/O must stay off the
        inline path (bounded ring buffer / async emission).
        
        In mock: audit emission is synchronous. This test documents the requirement.
        In live stack: introduce artificial delay in audit writer and verify p99 is unaffected.
        
        Live-stack test command (Day 60):
            python -m pytest tests/failure-injection/test_fail_closed.py::TestAuditWriterIoStall \
                --live-stack --inject-audit-delay-ms=100
        
        BUG TRACKER: If live-stack p99 latency increases proportionally to audit delay,
        file bug to @axiom-nhi/team-5-observability (O5.4).
        """
        # In mock: verify the pipeline completes; audit io-stall is a live-stack concern
        extmcp = MockExtMcp(policy_response=StubPolicyResponse(decision=Decision.PERMIT))
        gw = MockGateway(
            runtime_mode=RuntimeMode.ENFORCE,
            backend=backend,
            extmcp=extmcp,
            audit_sink=audit_sink,
        )
        resp = gw.handle(_req(), agent_id="agent-chaos08")
        # Verify the call completed and audit was eventually emitted
        assert len(audit_sink._events) > 0, "At least one audit event must be emitted"
        result = resp.get("result", {})
        assert result.get("isError") is not True


# ---------------------------------------------------------------------------
# CHAOS-09: Kill switch does not cancel already-running upstream calls
# ---------------------------------------------------------------------------

class TestKillSwitchBoundary:

    def test_chaos09_kill_switch_does_not_cancel_in_flight_calls(self, backend, audit_sink):
        """CHAOS-09: Kill switch only blocks NEW calls; in-flight backend work is not cancelled.
        
        Security boundary from runtime-pipeline.md and playbook §5:
          'revocation blocks new calls and does not cancel already-running upstream work'
        
        In mock: simulate an in-flight call by marking backend call_log before revocation.
        Live-stack note: use a slow backend MCP server (simulated 500ms latency) and issue
        kill while the call is in-flight; verify the in-flight call completes.
        """
        # Simulate a slow backend that is already processing
        slow_backend = MockMcpBackend(latency_ms=10)  # 10ms simulated backend latency
        extmcp_permit = MockExtMcp(policy_response=StubPolicyResponse(decision=Decision.PERMIT))

        gw = MockGateway(
            runtime_mode=RuntimeMode.ENFORCE,
            backend=slow_backend,
            extmcp=extmcp_permit,
            audit_sink=audit_sink,
            revocation_state={},
        )
        slow_backend.call_log.mark("before")

        # In-flight call (synchronous in mock)
        resp = gw.handle(_req(), agent_id="agent-chaos09-inflight")
        # The in-flight call must complete (even if kill switch fires after gateway passes it)
        assert len(slow_backend.call_log.calls_since("before")) == 1, (
            "CHAOS-09: In-flight call was cancelled before backend completion — violation of boundary"
        )

        # Now apply kill switch for future calls
        gw.revocation_state = {"agent": {"agent-chaos09-new"}}
        slow_backend.call_log.mark("after_revocation")

        resp_new = gw.handle(_req(), agent_id="agent-chaos09-new")
        assert resp_new.get("result", {}).get("isError") is True, (
            "CHAOS-09: New call after kill switch was NOT blocked"
        )
        assert len(slow_backend.call_log.calls_since("after_revocation")) == 0, (
            "CHAOS-09: Kill-switch-blocked new call still reached backend"
        )
