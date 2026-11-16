---
name: benchmark-gate
description: Run the p50, p95, and p99 latency benchmark harness, verify sub-millisecond ExtMCP policy evaluations, test fail-closed behavior under chaos conditions, and validate OTel audit integrity for Axiom NHI Gate G1.
---

# Benchmark Gate & Performance Validation Skill

This skill guides the execution and verification of Gate G1 performance benchmarks, chaos resilience tests, and latency profiling for Axiom NHI.

## Key Performance Indicators (Gate G1 Targets)

- **p50 Latency:** `< 0.8 ms` (sub-millisecond target for cached Cedar policy evaluation)
- **p95 Latency:** `< 1.5 ms`
- **p99 Latency:** `< 3.0 ms`
- **Throughput:** Minimum 10,000 RPS on standard dual-core container instance
- **Memory Footprint:** Resident memory `< 64 MB` for `ExtMCP` evaluation service

## Benchmark Procedures

### 1. ExtMCP Evaluation Latency Benchmark

Run the Rust Criterion benchmark harness in the policy evaluation crate:

```bash
cargo bench --package axiom-policy-engine --bench extmcp_latency
```

Ensure the test suite evaluates:
- Uncached cold evaluation (first policy load)
- Cached warm evaluation (100,000 sequential tool call evaluations)
- Multi-threaded concurrent evaluation (16 concurrent threads generating synthetic tool requests)

### 2. Chaos Resilience & Fail-Closed Testing

Simulate infrastructure degradation and ensure deterministic fail-closed behavior:

1. **Cedar Engine Panic / Timeout Simulation:**
   - Inject synthetic 10ms delays into policy evaluation.
   - Assert client receives HTTP 504 / RPC status `DEADLINE_EXCEEDED` with action rejected.
2. **OpenBao Unreachable Test:**
   - Terminate OpenBao container or inject socket RST.
   - Ensure dynamic token issuance requests are denied with fail-closed logs. Zero credentials leaked.
3. **SpiceDB Network Partition:**
   - Verify delegation resolution aborts and denies cross-agent action when relationship verification fails.

### 3. OpenTelemetry Audit Trace Verification

1. Stream synthetic load through `agentgateway`.
2. Inspect OTel Collector trace buffer:
   - Ensure 100% of policy decisions emit an `axiom.nhi.audit.decision` span.
   - Verify fields: `trace_id`, `nhi_identity_id`, `action`, `resource`, `decision_result`, `hash_digest`, `duration_us`.
   - Verify zero un-audited operations leak through the gateway.
