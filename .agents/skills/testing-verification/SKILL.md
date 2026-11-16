---
name: testing-verification
description: Comprehensive testing, protocol debugging, chaos resilience, k6 load benchmarking, and DAST/Trivy security verification runbook for Axiom NHI.
---

# Axiom NHI Testing, Debugging & Verification Toolkit

This skill provides step-by-step procedures for offline policy validation, protocol debugging, load testing (Gate G1), chaos fault injection, and security scanning (Gate G3).

---

## 1. Protocol, Policy & Graph Debugging

### A. Model Context Protocol Inspector
Launch the interactive MCP Inspector to inspect raw JSON-RPC payloads, test argument bounds, and verify tool-definition pinning:

```bash
npx @modelcontextprotocol/inspector
```
- Connect to `http://localhost:8080/mcp` (Streamable HTTP) or stdio binaries.
- Mutate parameter types in-flight to verify `ExtMCP` rejects tampered tool definitions.

### B. Offline Cedar Policy Verification
Run deterministic offline policy assertions without starting the gateway:

```bash
# Validate policy syntax against the Cedar schema
cedar validate --schema policies/schema.cedarschema --policies policies/rules.cedar

# Evaluate single authorization request
cedar authorize \
  --policies policies/rules.cedar \
  --schema policies/schema.cedarschema \
  --principal 'User::"agent-analytics-01"' \
  --action 'Action::"query_readonly"' \
  --resource 'Database::"customer_analytics"'
```

### C. SpiceDB Relationship & Causal Revocation Verification
Validate `.zed` schemas and test relationship assertion YAMLs:

```bash
# Validate SpiceDB schema and relationship test cases
zed validate schema/delegation.zed
```
- Verify multi-hop delegation: when parent agent credentials are terminated, ensure all child delegation edges resolve to `DENIED` immediately.

---

## 2. Gate G1 Performance & Chaos Testing

### A. k6 Latency & Concurrency Benchmarking
Measure $p50$, $p95$, and $p99$ authorization latencies under 1,000–10,000 concurrent agent requests:

```bash
# Run k6 load script against ExtMCP proxy
k6 run tests/benchmarks/k6_extmcp_latency.js
```
**Gate G1 Criteria:**
- $p50 < 0.8\text{ ms}$
- $p95 < 1.5\text{ ms}$
- $p99 < 3.0\text{ ms}$

### B. Toxiproxy Chaos & Fail-Closed Validation
Inject network partitions between `agentgateway`, `ExtMCP`, SpiceDB, and OpenBao:

```bash
# Inject 100ms latency spike (exceeding sub-millisecond evaluation budget)
toxiproxy-cli toxic add -t latency -a latency=100 downstream_cedar

# Inject TCP connection reset
toxiproxy-cli toxic add -t reset_peer downstream_openbao
```
**Assertion:** Every request passing through `agentgateway` during the fault MUST immediately return `HTTP 504` / `RPC ABORT` with action denied. **Zero requests may fail open.**

---

## 3. Security, Container & Red-Team Scanning (Gate G3)

### A. Aqua Trivy Vulnerability & Misconfiguration Scan
Run container image and dependency CVE audits:

```bash
trivy image axiom-gateway:latest --severity HIGH,CRITICAL --ignore-unfixed
trivy config deployments/helm/
```
Ensure **zero critical vulnerabilities** prior to external penetration testing.

### B. OWASP ZAP DAST API Scanning
Run dynamic security checks against control-plane endpoints:

```bash
zap-baseline.py -t http://localhost:8080 -r zap_report.html
```

### C. Promptfoo Adversarial Fuzzing
Execute prompt-injection and privilege escalation test suites against governed tools:

```bash
npx promptfoo eval -c tests/redteam/promptfoo.yaml
```
Verify that prompt injections attempting SQL DDL writes, path traversal (`../`), or unauthorized HTTP egress are deterministically intercepted and blocked by `ExtMCP`.
