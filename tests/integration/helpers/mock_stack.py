"""
tests/integration/helpers/mock_stack.py
Team 6 — Gate G1 Acceptance Harness
Version: 0.1.0-draft

Minimal mock stack for integration tests that do not yet have a live agentgateway deployment.
Provides:
- MockMcpBackend: records calls, can simulate latency or failure.
- MockAuditWriter: captures AuditEvents emitted by the pipeline.
- MockExtMcp: returns scripted PolicyResponse and can simulate timeouts/unavailability.
- MockIdentityVerifier: returns scripted IdentityContext.
- MockGateway: composes the above and routes a JSON-RPC request through the pipeline logic.

DRAFT BOUNDARY: MockGateway implements the pipeline described in docs/architecture/runtime-pipeline.md
using the draft v0.1.0-draft contract shapes. All decision semantics marked [D*] are configurable
stubs so tests remain adaptable until Team 0 freezes the contracts.

Design rules:
- No real bearer tokens appear in this file or in test fixtures.
- Mocks record all received inputs to support side-effect assertions.
- Policy decisions and identity results are injected by tests, not hardcoded.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable

from tests.integration.helpers.assertions import (
    AuditEventSnapshot,
    MockAuditSink,
    MockBackendCallLog,
)


# ---------------------------------------------------------------------------
# Draft contract enums and stubs
# ---------------------------------------------------------------------------

class RuntimeMode(str, Enum):
    OBSERVE_ONLY = "ObserveOnly"
    ENFORCE = "Enforce"


class Decision(str, Enum):
    PERMIT = "Permit"
    DENY = "Deny"
    # [D4] DRAFT: WouldDeny may move to AuditEvent-only; keep as stub for now
    WOULD_DENY = "WouldDeny"


@dataclass
class StubIdentityContext:
    """Stub IdentityContext — mirrors draft struct from docs/api-contracts/README.md."""
    authenticated: bool
    agent_id: str                   # JWT sub — test values must NOT be real tokens
    client_id: str
    cimd_uri: str | None
    issuer: str
    audience: list[str]
    scopes: list[str]
    token_jti: str
    expires_at_unix: int


@dataclass
class StubValidatorResult:
    """Stub ValidatorResult — mirrors draft struct."""
    validator_id: str
    passed: bool
    violation_code: str | None = None
    reason: str | None = None
    sql_verbs: list[str] = field(default_factory=list)
    sql_tables: list[str] = field(default_factory=list)
    sql_is_readonly: bool = True
    sql_statement_count: int = 1
    normalized_path: str | None = None
    path_traversal_detected: bool = False
    egress_domain: str | None = None
    egress_is_private_ip: bool = False
    tool_pin_sha256: str | None = None
    tool_pin_verified: bool = True


@dataclass
class StubPolicyResponse:
    """Stub PolicyResponse — mirrors draft struct. [D4] WouldDeny placement TBD."""
    decision: Decision
    policy_version: str = "sha256:draft-mock-0000"
    matched_policy_ids: list[str] = field(default_factory=list)
    reason: str = ""
    evaluation_latency_us: int = 0


# ---------------------------------------------------------------------------
# Mock subsystem components
# ---------------------------------------------------------------------------

class MockMcpBackend:
    """Records all tools/call invocations. Supports latency injection and failure modes."""

    def __init__(self, latency_ms: float = 0.0, fail_with: str | None = None):
        self.call_log = MockBackendCallLog()
        self.latency_ms = latency_ms
        self.fail_with = fail_with  # None = success; str = error message to return

    def handle_tools_call(
        self, tool_name: str, arguments: dict, request_id: str
    ) -> dict:
        if self.latency_ms:
            time.sleep(self.latency_ms / 1000.0)
        self.call_log.record(tool_name, arguments, request_id)
        if self.fail_with:
            return {
                "jsonrpc": "2.0",
                "id": 1,
                "result": {"isError": True, "content": [{"type": "text", "text": self.fail_with}]},
            }
        return {
            "jsonrpc": "2.0",
            "id": 1,
            "result": {
                "isError": False,
                "content": [{"type": "text", "text": f"mock result for {tool_name}"}],
            },
        }


class MockExtMcp:
    """Returns scripted PolicyResponse. Supports timeout and unavailability simulation."""

    def __init__(
        self,
        policy_response: StubPolicyResponse | None = None,
        identity_context: StubIdentityContext | None = None,
        validator_result: StubValidatorResult | None = None,
        simulate_timeout: bool = False,
        simulate_unavailable: bool = False,
        policy_load_failure: bool = False,
    ):
        self.policy_response = policy_response or StubPolicyResponse(decision=Decision.PERMIT)
        self.identity_context = identity_context
        self.validator_result = validator_result or StubValidatorResult(
            validator_id="sql", passed=True
        )
        self.simulate_timeout = simulate_timeout
        self.simulate_unavailable = simulate_unavailable
        self.policy_load_failure = policy_load_failure

    def check(self, request: dict, deadline_ms: float = 15.0) -> StubPolicyResponse | None:
        """Simulate the ExtMCP CheckRequest call.
        
        Returns None on timeout/unavailability to signal fail-closed path.
        Raises PolicyLoadError on policy_load_failure.
        """
        if self.simulate_unavailable:
            raise ExtMcpUnavailableError("ExtMCP service unavailable (simulated)")
        if self.simulate_timeout:
            # Simulate deadline exceeded — in real code, the 15ms gRPC deadline fires
            raise ExtMcpTimeoutError(f"ExtMCP deadline exceeded after {deadline_ms}ms (simulated)")
        if self.policy_load_failure:
            raise PolicyLoadError("Cedar policy bundle failed to parse (simulated)")
        return self.policy_response


class ExtMcpUnavailableError(Exception):
    pass


class ExtMcpTimeoutError(Exception):
    pass


class PolicyLoadError(Exception):
    pass


# ---------------------------------------------------------------------------
# MockGateway — wires the full pipeline per runtime-pipeline.md
# ---------------------------------------------------------------------------

class MockGateway:
    """
    Minimal mock of the agentgateway + ExtMCP pipeline.
    
    Pipeline order (from runtime-pipeline.md):
    1. Kill-switch check
    2. Identity verification (mocked)
    3. Argument & tool validation (mocked)
    4. Cedar authorization (mocked via MockExtMcp)
    5. Enforcement / forwarding (apply RuntimeMode)
    6. Audit emission (into MockAuditSink, async-simulated)
    
    [D3] DRAFT: Kill switch override of observe-only is a configurable flag until
    Team 0 settles the decision. Default = True (kill switch overrides OO).
    """

    # [D3] DRAFT config — pending Team 0 decision
    KILL_SWITCH_OVERRIDES_OBSERVE_ONLY: bool = True  # recommendation: True

    def __init__(
        self,
        runtime_mode: RuntimeMode,
        backend: MockMcpBackend,
        extmcp: MockExtMcp,
        audit_sink: MockAuditSink,
        revocation_state: dict | None = None,
    ):
        self.runtime_mode = runtime_mode
        self.backend = backend
        self.extmcp = extmcp
        self.audit_sink = audit_sink
        # revocation_state: {target_kind: set_of_target_ids}
        # e.g. {"agent": {"agent-123"}, "global": True}
        self.revocation_state = revocation_state or {}

    def _is_revoked(self, agent_id: str, tool_name: str, target_server: str) -> bool:
        """Check revocation state. [D5] key precedence: global > server > tool > agent."""
        rv = self.revocation_state
        if rv.get("global"):
            return True
        if target_server in rv.get("server", set()):
            return True
        full_tool = f"{target_server}/{tool_name}"
        if full_tool in rv.get("tool", set()):
            return True
        if agent_id in rv.get("agent", set()):
            return True
        return False

    def handle(
        self,
        jsonrpc_request: dict,
        agent_id: str = "test-agent",          # test fixture — NOT a real credential
        target_server: str = "mock-server",
        tool_name: str | None = None,
    ) -> dict:
        """Process a JSON-RPC tools/call through the mock pipeline."""
        if tool_name is None:
            tool_name = jsonrpc_request.get("params", {}).get("name", "mock_tool")
        request_id = str(uuid.uuid4())
        trace_id = f"00-{uuid.uuid4().hex}-{uuid.uuid4().hex[:16]}-01"
        start_us = time.monotonic_ns() // 1000

        kill_switch_active = self._is_revoked(agent_id, tool_name, target_server)

        # --- Step 1: Kill-switch check ---
        if kill_switch_active:
            should_deny_for_kill_switch = (
                self.runtime_mode == RuntimeMode.ENFORCE
                or self.KILL_SWITCH_OVERRIDES_OBSERVE_ONLY  # [D3]
            )
            if should_deny_for_kill_switch:
                self._emit_audit(
                    request_id, trace_id, agent_id, target_server, tool_name,
                    decision="DENY",
                    denial_reason="KILL_SWITCH_TRIGGERED",
                    kill_switch_active=True,
                    validator_summary=[],
                    latency_us=time.monotonic_ns() // 1000 - start_us,
                )
                return self._deny_response(
                    "KILL_SWITCH_TRIGGERED", jsonrpc_request.get("id")
                )

        # --- Steps 2-4: ExtMCP check (identity + validation + policy) ---
        policy_resp: StubPolicyResponse | None = None
        extmcp_error: str | None = None
        validator_summary: list[str] = []

        try:
            policy_resp = self.extmcp.check(jsonrpc_request)
            if self.extmcp.validator_result:
                vr = self.extmcp.validator_result
                if not vr.passed:
                    validator_summary.append(
                        f"{vr.validator_id}:FAIL:{vr.violation_code or 'unknown'}"
                    )
        except ExtMcpTimeoutError as e:
            extmcp_error = f"timeout: {e}"
        except ExtMcpUnavailableError as e:
            extmcp_error = f"unavailable: {e}"
        except PolicyLoadError as e:
            extmcp_error = f"policy_load_failure: {e}"

        # --- Step 5: Enforcement ---
        if extmcp_error:
            # Callout failed
            if self.runtime_mode == RuntimeMode.ENFORCE:
                audit_decision = "DENY"
                self._emit_audit(
                    request_id, trace_id, agent_id, target_server, tool_name,
                    decision=audit_decision,
                    denial_reason=extmcp_error,
                    kill_switch_active=False,
                    validator_summary=validator_summary,
                    latency_us=time.monotonic_ns() // 1000 - start_us,
                )
                return self._deny_response(extmcp_error, jsonrpc_request.get("id"))
            else:  # ObserveOnly
                # [D4] DRAFT: decision value TBD — using WOULD_DENY stub
                self._emit_audit(
                    request_id, trace_id, agent_id, target_server, tool_name,
                    decision="WOULD_DENY",   # [D4]
                    denial_reason=extmcp_error,
                    kill_switch_active=False,
                    validator_summary=validator_summary,
                    latency_us=time.monotonic_ns() // 1000 - start_us,
                )
                return self.backend.handle_tools_call(tool_name, {}, request_id)

        # Normal policy response
        effective_decision = policy_resp.decision if policy_resp else Decision.DENY

        if effective_decision in (Decision.DENY, Decision.WOULD_DENY):
            if self.runtime_mode == RuntimeMode.ENFORCE:
                audit_decision = "DENY"
                self._emit_audit(
                    request_id, trace_id, agent_id, target_server, tool_name,
                    decision=audit_decision,
                    denial_reason=policy_resp.reason if policy_resp else "no policy response",
                    kill_switch_active=False,
                    validator_summary=validator_summary,
                    latency_us=time.monotonic_ns() // 1000 - start_us,
                )
                return self._deny_response(
                    policy_resp.reason if policy_resp else "policy denied",
                    jsonrpc_request.get("id"),
                )
            else:  # ObserveOnly — forward despite denial
                self._emit_audit(
                    request_id, trace_id, agent_id, target_server, tool_name,
                    decision="WOULD_DENY",   # [D4]
                    denial_reason=policy_resp.reason if policy_resp else "shadow deny",
                    kill_switch_active=False,
                    validator_summary=validator_summary,
                    latency_us=time.monotonic_ns() // 1000 - start_us,
                )
                return self.backend.handle_tools_call(tool_name, {}, request_id)

        # Permit path
        self._emit_audit(
            request_id, trace_id, agent_id, target_server, tool_name,
            decision="ALLOW",
            denial_reason=None,
            kill_switch_active=False,
            validator_summary=validator_summary,
            latency_us=time.monotonic_ns() // 1000 - start_us,
        )
        return self.backend.handle_tools_call(tool_name, jsonrpc_request.get("params", {}), request_id)

    def _deny_response(self, reason: str, req_id: Any) -> dict:
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "isError": True,
                "content": [{"type": "text", "text": reason}],
            },
        }

    def _emit_audit(
        self,
        request_id: str,
        trace_id: str,
        agent_id: str,
        target_server: str,
        tool_name: str,
        *,
        decision: str,
        denial_reason: str | None,
        kill_switch_active: bool,
        validator_summary: list[str],
        latency_us: int,
    ) -> None:
        import datetime
        event = AuditEventSnapshot(
            timestamp_rfc3339=datetime.datetime.utcnow().isoformat() + "Z",
            request_id=request_id,
            trace_id=trace_id,
            agent_id=agent_id,
            target_server=target_server,
            tool_name=tool_name,
            runtime_mode=self.runtime_mode.value,
            decision=decision,
            policy_version="sha256:draft-mock-0000",
            denial_reason=denial_reason,
            validator_summary=validator_summary,
            kill_switch_active=kill_switch_active,
            latency_us=latency_us,
        )
        self.audit_sink._events.append(event)
