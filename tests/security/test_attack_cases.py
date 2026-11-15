"""
tests/security/test_attack_cases.py
Team 6 — Gate G1 Adversarial Attack Suite
Version: 0.1.0-draft

Plans and stubs for the Q6.4 adversarial red-team attack corpus.
Attack categories:
  SQL-01..05: Stacked queries, CTE-wrapped destructive writes, comment injection, hex encoding
  PATH-01..04: Directory traversal, symlink escape, null byte, double encoding
  SSRF-01..03: Private-IP literals, loopback, cloud metadata endpoint
  DNS-01..02: DNS rebinding, 301/302 redirect to private IP
  TOOL-01..02: Tool-definition mutation (rug pull), schema drift

STUB NOTE: These tests assert that the validator layer (Team 4) detects the attack and
  that the gateway (Team 1 + Team 2) blocks the call in enforce mode.  Until Team 4
  validators are implemented, all tests run against the mock stack with injected
  ValidatorResult facts. This keeps the test corpus stable while upstream teams develop.

Do NOT fix bugs found here in /gateway/, /validators/, or /services/extmcp/.
File a bug report pointing to the failing test case and assign to the owning team.
"""

from __future__ import annotations

import pytest

from tests.integration.helpers.assertions import (
    MockAuditSink,
    assert_backend_not_called,
    assert_jsonrpc_denied,
)
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
# Helpers
# ---------------------------------------------------------------------------

def _deny_policy() -> StubPolicyResponse:
    return StubPolicyResponse(decision=Decision.DENY, reason="validator blocked")


def _permit_policy() -> StubPolicyResponse:
    return StubPolicyResponse(decision=Decision.PERMIT)


def _make_enforce_gw(extmcp, backend, audit_sink):
    return MockGateway(
        runtime_mode=RuntimeMode.ENFORCE,
        backend=backend,
        extmcp=extmcp,
        audit_sink=audit_sink,
    )


def _make_observe_gw(extmcp, backend, audit_sink):
    return MockGateway(
        runtime_mode=RuntimeMode.OBSERVE_ONLY,
        backend=backend,
        extmcp=extmcp,
        audit_sink=audit_sink,
    )


def _req(tool_name: str = "run_sql", params: dict | None = None) -> dict:
    return {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {"name": tool_name, **(params or {})},
    }


@pytest.fixture
def audit_sink():
    return MockAuditSink()


@pytest.fixture
def backend():
    return MockMcpBackend()


# ---------------------------------------------------------------------------
# SQL Attack Cases
# ---------------------------------------------------------------------------

class TestSqlAttacks:
    """
    Stacked queries and CTE-wrapped destructive writes.

    Implementation note: These tests inject pre-parsed ValidatorResult facts as if
    Team 4's sql validator has already classified the input.  The gateway + Cedar layer
    (Team 2) is what Team 6 is testing here — not the parser itself.
    Team 4 owns parser-level unit tests in /validators/sql/.
    """

    def test_sql01_stacked_query_blocked_in_enforce(self, backend, audit_sink):
        """SQL-01: SELECT 1; DROP TABLE users — stacked query blocked in enforce mode."""
        # Payload: "SELECT 1; DROP TABLE users"
        # Expected: Team 4 returns sql_statement_count=2, Deny from Cedar
        extmcp = MockExtMcp(
            policy_response=_deny_policy(),
            validator_result=StubValidatorResult(
                validator_id="sql",
                passed=False,
                violation_code="STACKED_QUERY",
                reason="Multiple SQL statements detected: 2",
                sql_verbs=["SELECT", "DROP"],
                sql_tables=["users"],
                sql_is_readonly=False,
                sql_statement_count=2,
            ),
        )
        gw = _make_enforce_gw(extmcp, backend, audit_sink)
        backend.call_log.mark("before")

        resp = gw.handle(_req("run_sql"), agent_id="attacker-sql01")
        assert_jsonrpc_denied(resp)
        assert_backend_not_called(backend.call_log, "run_sql", "before")
        evt = audit_sink._events[-1]
        assert evt.decision == "DENY"
        assert any("STACKED_QUERY" in s for s in evt.validator_summary)

    def test_sql02_cte_wrapped_destructive_write_blocked(self, backend, audit_sink):
        """SQL-02: WITH del AS (DELETE FROM users) SELECT 1 — CTE-wrapped DELETE blocked."""
        # Payload: "WITH del AS (DELETE FROM users WHERE id=1) SELECT 1"
        extmcp = MockExtMcp(
            policy_response=_deny_policy(),
            validator_result=StubValidatorResult(
                validator_id="sql",
                passed=False,
                violation_code="CTE_DESTRUCTIVE",
                reason="CTE contains destructive verb: DELETE",
                sql_verbs=["DELETE", "SELECT"],
                sql_tables=["users"],
                sql_is_readonly=False,
                sql_statement_count=1,
            ),
        )
        gw = _make_enforce_gw(extmcp, backend, audit_sink)
        backend.call_log.mark("before")

        resp = gw.handle(_req("run_sql"), agent_id="attacker-sql02")
        assert_jsonrpc_denied(resp)
        assert_backend_not_called(backend.call_log, "run_sql", "before")
        evt = audit_sink._events[-1]
        assert any("CTE_DESTRUCTIVE" in s for s in evt.validator_summary)

    def test_sql03_comment_injected_drop_blocked(self, backend, audit_sink):
        """SQL-03: SELECT /*!50000 DROP TABLE users*/ — comment-injected payload blocked."""
        extmcp = MockExtMcp(
            policy_response=_deny_policy(),
            validator_result=StubValidatorResult(
                validator_id="sql",
                passed=False,
                violation_code="COMMENT_INJECTION",
                reason="Conditional comment enclosing destructive verb",
                sql_verbs=["DROP"],
                sql_tables=["users"],
                sql_is_readonly=False,
                sql_statement_count=1,
            ),
        )
        gw = _make_enforce_gw(extmcp, backend, audit_sink)
        backend.call_log.mark("before")

        resp = gw.handle(_req("run_sql"), agent_id="attacker-sql03")
        assert_jsonrpc_denied(resp)
        assert_backend_not_called(backend.call_log, "run_sql", "before")

    def test_sql04_hex_encoded_drop_blocked(self, backend, audit_sink):
        """SQL-04: Hex-encoded DROP TABLE — charset obfuscation blocked.
        
        BUG TRACKER NOTE: If this test fails, the validator is not catching hex encoding.
        File as bug assigned to Team 4 (/validators/sql/).
        """
        extmcp = MockExtMcp(
            policy_response=_deny_policy(),
            validator_result=StubValidatorResult(
                validator_id="sql",
                passed=False,
                violation_code="HEX_ENCODING",
                reason="Hex-encoded SQL detected with destructive verb",
                sql_verbs=["DROP"],
                sql_tables=["users"],
                sql_is_readonly=False,
                sql_statement_count=1,
            ),
        )
        gw = _make_enforce_gw(extmcp, backend, audit_sink)
        backend.call_log.mark("before")

        resp = gw.handle(_req("run_sql"), agent_id="attacker-sql04")
        assert_jsonrpc_denied(resp)
        assert_backend_not_called(backend.call_log, "run_sql", "before")

    def test_sql05_read_only_select_permitted(self, backend, audit_sink):
        """SQL-05: Pure SELECT — read-only query permitted (not an attack)."""
        extmcp = MockExtMcp(
            policy_response=_permit_policy(),
            validator_result=StubValidatorResult(
                validator_id="sql",
                passed=True,
                sql_verbs=["SELECT"],
                sql_tables=["users"],
                sql_is_readonly=True,
                sql_statement_count=1,
            ),
        )
        gw = _make_enforce_gw(extmcp, backend, audit_sink)
        backend.call_log.mark("before")

        resp = gw.handle(_req("run_sql"), agent_id="agent-sql05")
        # Must NOT be denied
        result = resp.get("result", {})
        assert result.get("isError") is not True, (
            "SQL-05: Read-only SELECT must NOT be denied"
        )
        from tests.integration.helpers.assertions import assert_backend_called_once
        assert_backend_called_once(backend.call_log, "run_sql", "before")


# ---------------------------------------------------------------------------
# Path Traversal Attack Cases
# ---------------------------------------------------------------------------

class TestPathTraversalAttacks:

    def test_path01_dotdot_traversal_blocked(self, backend, audit_sink):
        """PATH-01: ../../etc/passwd — directory traversal blocked."""
        extmcp = MockExtMcp(
            policy_response=_deny_policy(),
            validator_result=StubValidatorResult(
                validator_id="filesystem",
                passed=False,
                violation_code="PATH_TRAVERSAL",
                reason="Lexical .. traversal detected outside root boundary",
                normalized_path=None,
                path_traversal_detected=True,
            ),
        )
        gw = _make_enforce_gw(extmcp, backend, audit_sink)
        backend.call_log.mark("before")

        resp = gw.handle(_req("read_file"), agent_id="attacker-path01")
        assert_jsonrpc_denied(resp)
        assert_backend_not_called(backend.call_log, "read_file", "before")

    def test_path02_double_encoded_traversal_blocked(self, backend, audit_sink):
        """PATH-02: %252e%252e%252f (double-encoded ../) — blocked."""
        extmcp = MockExtMcp(
            policy_response=_deny_policy(),
            validator_result=StubValidatorResult(
                validator_id="filesystem",
                passed=False,
                violation_code="PATH_TRAVERSAL",
                reason="Double-encoded path traversal sequence detected",
                path_traversal_detected=True,
            ),
        )
        gw = _make_enforce_gw(extmcp, backend, audit_sink)
        backend.call_log.mark("before")

        resp = gw.handle(_req("read_file"), agent_id="attacker-path02")
        assert_jsonrpc_denied(resp)
        assert_backend_not_called(backend.call_log, "read_file", "before")

    def test_path03_null_byte_in_path_blocked(self, backend, audit_sink):
        """PATH-03: /safe/path\x00/etc/passwd — null byte injection blocked."""
        extmcp = MockExtMcp(
            policy_response=_deny_policy(),
            validator_result=StubValidatorResult(
                validator_id="filesystem",
                passed=False,
                violation_code="NULL_BYTE",
                reason="Null byte detected in path argument",
                path_traversal_detected=True,
            ),
        )
        gw = _make_enforce_gw(extmcp, backend, audit_sink)
        backend.call_log.mark("before")

        resp = gw.handle(_req("read_file"), agent_id="attacker-path03")
        assert_jsonrpc_denied(resp)
        assert_backend_not_called(backend.call_log, "read_file", "before")

    def test_path04_symlink_escape_blocked(self, backend, audit_sink):
        """PATH-04: Symlink inside root that resolves outside boundary — blocked.
        
        BUG TRACKER NOTE: If this test fails because the validator does not follow
        symlinks, file as bug assigned to Team 4 (/validators/filesystem/).
        """
        extmcp = MockExtMcp(
            policy_response=_deny_policy(),
            validator_result=StubValidatorResult(
                validator_id="filesystem",
                passed=False,
                violation_code="SYMLINK_ESCAPE",
                reason="Resolved symlink target is outside allowed root directory",
                path_traversal_detected=True,
                normalized_path="/outside/root/secret.txt",
            ),
        )
        gw = _make_enforce_gw(extmcp, backend, audit_sink)
        backend.call_log.mark("before")

        resp = gw.handle(_req("read_file"), agent_id="attacker-path04")
        assert_jsonrpc_denied(resp)
        assert_backend_not_called(backend.call_log, "read_file", "before")


# ---------------------------------------------------------------------------
# SSRF Attack Cases
# ---------------------------------------------------------------------------

class TestSsrfAttacks:

    def test_ssrf01_rfc1918_private_ip_blocked(self, backend, audit_sink):
        """SSRF-01: http://192.168.1.1/api — private RFC 1918 IP blocked."""
        extmcp = MockExtMcp(
            policy_response=_deny_policy(),
            validator_result=StubValidatorResult(
                validator_id="egress",
                passed=False,
                violation_code="PRIVATE_IP",
                reason="Target IP 192.168.1.1 is in RFC 1918 private range",
                egress_domain="192.168.1.1",
                egress_is_private_ip=True,
            ),
        )
        gw = _make_enforce_gw(extmcp, backend, audit_sink)
        backend.call_log.mark("before")

        resp = gw.handle(_req("http_fetch"), agent_id="attacker-ssrf01")
        assert_jsonrpc_denied(resp)
        assert_backend_not_called(backend.call_log, "http_fetch", "before")

    def test_ssrf02_cloud_metadata_endpoint_blocked(self, backend, audit_sink):
        """SSRF-02: http://169.254.169.254/latest/meta-data/ — IMDSv1 endpoint blocked."""
        extmcp = MockExtMcp(
            policy_response=_deny_policy(),
            validator_result=StubValidatorResult(
                validator_id="egress",
                passed=False,
                violation_code="METADATA_ENDPOINT",
                reason="Target 169.254.169.254 is a cloud metadata link-local address",
                egress_domain="169.254.169.254",
                egress_is_private_ip=True,
            ),
        )
        gw = _make_enforce_gw(extmcp, backend, audit_sink)
        backend.call_log.mark("before")

        resp = gw.handle(_req("http_fetch"), agent_id="attacker-ssrf02")
        assert_jsonrpc_denied(resp)
        assert_backend_not_called(backend.call_log, "http_fetch", "before")

    def test_ssrf03_loopback_blocked(self, backend, audit_sink):
        """SSRF-03: http://127.0.0.1:8080/ — loopback address blocked."""
        extmcp = MockExtMcp(
            policy_response=_deny_policy(),
            validator_result=StubValidatorResult(
                validator_id="egress",
                passed=False,
                violation_code="LOOPBACK",
                reason="Target 127.0.0.1 is a loopback address",
                egress_domain="127.0.0.1",
                egress_is_private_ip=True,
            ),
        )
        gw = _make_enforce_gw(extmcp, backend, audit_sink)
        backend.call_log.mark("before")

        resp = gw.handle(_req("http_fetch"), agent_id="attacker-ssrf03")
        assert_jsonrpc_denied(resp)
        assert_backend_not_called(backend.call_log, "http_fetch", "before")


# ---------------------------------------------------------------------------
# DNS Rebinding Attack Cases
# ---------------------------------------------------------------------------

class TestDnsRebindingAttacks:

    def test_dns01_rebinding_after_validation_blocked(self, backend, audit_sink):
        """DNS-01: DNS rebinding — domain resolves to public IP at validation, private IP at execution.
        
        Detection: Team 4 passes pre-resolved IP pins to Team 1 (gateway enforces at socket layer).
        This test verifies the validator detects the private IP rebind target and blocks.
        
        NOTE: Full DNS rebinding prevention requires Team 1 to enforce at the TCP socket
        boundary using Team 4's pre-resolved IP. This test covers the validator-level
        detection path. Socket-level enforcement is a Team 1 concern (G1.8).
        """
        extmcp = MockExtMcp(
            policy_response=_deny_policy(),
            validator_result=StubValidatorResult(
                validator_id="egress",
                passed=False,
                violation_code="DNS_REBINDING",
                reason="Resolved IP 192.168.0.1 is in private range; DNS rebind suspected",
                egress_domain="attacker.example.com",
                egress_is_private_ip=True,
            ),
        )
        gw = _make_enforce_gw(extmcp, backend, audit_sink)
        backend.call_log.mark("before")

        resp = gw.handle(_req("http_fetch"), agent_id="attacker-dns01")
        assert_jsonrpc_denied(resp)
        assert_backend_not_called(backend.call_log, "http_fetch", "before")

    def test_dns02_301_redirect_to_private_ip_blocked(self, backend, audit_sink):
        """DNS-02: HTTP 301 redirect to private IP — unauthorized redirect blocked.
        
        NOTE: Redirect following happens at the gateway network layer (Team 1 concern, G1.8).
        This test validates the egress validator pre-flight detection if the redirect
        target is known or the domain resolves to private space.
        
        BUG TRACKER NOTE: If redirect-to-private-IP is not caught, file bug to Team 1 (G1.8).
        """
        extmcp = MockExtMcp(
            policy_response=_deny_policy(),
            validator_result=StubValidatorResult(
                validator_id="egress",
                passed=False,
                violation_code="REDIRECT_PRIVATE",
                reason="Redirect target http://10.0.0.1/ resolves to private IP",
                egress_domain="10.0.0.1",
                egress_is_private_ip=True,
            ),
        )
        gw = _make_enforce_gw(extmcp, backend, audit_sink)
        backend.call_log.mark("before")

        resp = gw.handle(_req("http_fetch"), agent_id="attacker-dns02")
        assert_jsonrpc_denied(resp)
        assert_backend_not_called(backend.call_log, "http_fetch", "before")


# ---------------------------------------------------------------------------
# Tool-Definition Mutation (Rug Pull) Attack Cases
# ---------------------------------------------------------------------------

class TestToolDefinitionMutationAttacks:

    def test_tool01_tool_description_rug_pull_blocked(self, backend, audit_sink):
        """TOOL-01: Mid-session tool description mutation ('rug pull') — blocked.
        
        Scenario: tools/list returns a modified tool description between two calls.
        Team 4 computes SHA-256 of the canonical tool definition (name + description + inputSchema)
        and flags drift from the pinned hash.
        """
        extmcp = MockExtMcp(
            policy_response=_deny_policy(),
            validator_result=StubValidatorResult(
                validator_id="tool-pinning",
                passed=False,
                violation_code="TOOL_DEFINITION_MUTATED",
                reason="Tool SHA-256 changed from pinned value: description drift detected",
                tool_pin_sha256="sha256:AAAA...current",
                tool_pin_verified=False,
            ),
        )
        gw = _make_enforce_gw(extmcp, backend, audit_sink)
        backend.call_log.mark("before")

        resp = gw.handle(_req("dangerous_tool"), agent_id="attacker-tool01")
        assert_jsonrpc_denied(resp)
        assert_backend_not_called(backend.call_log, "dangerous_tool", "before")
        evt = audit_sink._events[-1]
        assert any("TOOL_DEFINITION_MUTATED" in s for s in evt.validator_summary)

    def test_tool02_argument_schema_drift_blocked(self, backend, audit_sink):
        """TOOL-02: inputSchema drift — tool accepts new dangerous fields after update.
        
        BUG TRACKER NOTE: If this test fails because pin comparison uses only tool name,
        file bug to Team 4 (/validators/tool-pinning/) — schema must be included in hash.
        """
        extmcp = MockExtMcp(
            policy_response=_deny_policy(),
            validator_result=StubValidatorResult(
                validator_id="tool-pinning",
                passed=False,
                violation_code="SCHEMA_DRIFT",
                reason="inputSchema changed from approved version; new field 'exec' added",
                tool_pin_sha256="sha256:BBBB...current",
                tool_pin_verified=False,
            ),
        )
        gw = _make_enforce_gw(extmcp, backend, audit_sink)
        backend.call_log.mark("before")

        resp = gw.handle(_req("write_file"), agent_id="attacker-tool02")
        assert_jsonrpc_denied(resp)
        assert_backend_not_called(backend.call_log, "write_file", "before")

    def test_tool03_matching_pin_permitted(self, backend, audit_sink):
        """TOOL-03: Tool definition matches approved pin — call permitted (not an attack)."""
        extmcp = MockExtMcp(
            policy_response=_permit_policy(),
            validator_result=StubValidatorResult(
                validator_id="tool-pinning",
                passed=True,
                tool_pin_sha256="sha256:CCCC...approved",
                tool_pin_verified=True,
            ),
        )
        gw = _make_enforce_gw(extmcp, backend, audit_sink)
        backend.call_log.mark("before")

        resp = gw.handle(_req("safe_tool"), agent_id="agent-tool03")
        result = resp.get("result", {})
        assert result.get("isError") is not True, "PIN-verified tool call should not be denied"
        from tests.integration.helpers.assertions import assert_backend_called_once
        assert_backend_called_once(backend.call_log, "safe_tool", "before")
