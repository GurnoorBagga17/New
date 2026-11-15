# Team 6 — QA and Assurance: Gate G1 Security Testing Harness

**Owner:** Team 6 (`@axiom-nhi/team-6-qa`)  
**Status:** Gate G1 First Slice Delivered (v0.1.0-draft)

Team 6 independently verifies Gate G1 behavior across normal requests, adversarial inputs, and infrastructure failures. Subsystem component teams maintain their own unit tests; cross-subsystem acceptance, security attacks, performance benchmarks, and chaos injection are owned here.

---

## 1. Directory Structure

```
tests/
├── integration/
│   ├── gate_g1_acceptance_matrix.md   # Canonical Gate G1 acceptance matrix (OB-* and EN-* rows)
│   ├── helpers/
│   │   ├── assertions.py             # JSON-RPC body, backend side-effect, and redacted AuditEvent checks
│   │   └── mock_stack.py             # Pipeline mock (agentgateway + ExtMCP + backend + audit sink)
│   └── test_acceptance_matrix.py     # Automated integration tests for all matrix rows
├── security/
│   └── test_attack_cases.py          # Q6.4 adversarial attack suite (SQL, Path, SSRF, DNS, Rug-pull)
├── performance/
│   └── test_latency_benchmarks.py    # p50/p95/p99 benchmark harness & kill-switch propagation
├── failure-injection/
│   └── test_fail_closed.py           # Chaos / fail-closed & observe-only verification suite
├── pytest.py                         # Standard-library pytest compatibility shim (offline)
├── conftest.py                       # Root conftest
└── run_tests.py                      # Standalone test runner (runs in standard Python 3.13+)
```

---

## 2. Core Gate G1 Invariants Verified

1. **Denial is never graded by HTTP 200 alone**: Per agentgateway specification, `tools/call` denials return HTTP 200 with `isError: true` in the JSON-RPC response body. Tests parse the body and confirm `isError: true`.
2. **Backend side-effect non-execution**: For every denied or failed request in enforce mode, the test harness verifies that the upstream MCP backend server was *never* invoked.
3. **Audit token redaction invariant**: Every emitted `AuditEvent` is scanned; raw bearer tokens (`Bearer `, `eyJ...`, etc.) are strictly forbidden in any logged field.
4. **Observe-only non-disruption**: In observe-only mode, 100% of legitimate requests are forwarded to the backend even on policy denial, ExtMCP timeout, or policy file corruption.
5. **Enforce fail-closed**: When ExtMCP is unavailable, times out (>15ms deadline), or encounters corrupt policies, 100% of calls fail closed.
6. **Latency separation**: Successful-path latency (<5ms target) is measured and reported strictly separately from timeout (15ms deadline) and deny paths.

---

## 3. Running the Test Suite

Install the test dependency once, then run the full verification suite:

```powershell
python -m pip install -r requirements-dev.txt
python tests/run_tests.py
```

Or using pytest directly:

```powershell
pytest tests/ -v
```

All 50 test cases execute against the deterministic mock pipeline without requiring external network access or live services.

---

## 4. Dependencies on Draft Contracts (v0.1.0-draft)

The test assertions depend on the draft shared contracts from Team 0. The following decisions are tracked as open:
- **Decision D3 (Kill switch vs Observe-Only)**: Matrix OB-07 tracks whether emergency revocation overrides observe-only mode. T6 recommendation: Kill switch always denies.
- **Decision D4 (`WouldDeny` Placement)**: Tracking whether `WouldDeny` is returned by ExtMCP or translated by the gateway.
- **Decision D5 (Revocation Precedence)**: Resolved by Team 0 as `global` > `mcp_server` > `agent` > `tool`. Every matching revocation blocks; the ordering selects the primary reported reason.
- **Decision D7 (Non-`tools/call` Errors)**: Uniform JSON-RPC error `-32001` for non-`tools/call` denials (test EN-10 skipped pending freeze).
