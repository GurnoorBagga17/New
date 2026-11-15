# Measurement methodology — latency and revocation propagation

**Owner:** Team 5 (`@axiom-nhi/team-5-observability`)
**Status:** Draft `0.1.0-draft`.
**Purpose:** Define how the Gate G1 slice is measured and what the numbers do and
do not mean. No Gate G1 result is claimed here.

## 1. Questions

1. **Revocation lookup cost.** How long does `check_pre_identity` and
   `check_post_identity` take on the request path?
2. **Audit enqueue cost.** How long does the inline `try_emit` take when the
   queue has capacity, and what happens under pressure?
3. **Revocation propagation delay.** How long from an authority update being
   committed to a consumer observing the new state?
4. **End-to-end added latency.** How much latency do audit and revocation add to
   the gateway→ExtMCP→backend path, in enforce and observe-only modes?

Questions 1–2 are component measurements. Question 3 has an in-process form and
a cross-process form. Question 4 belongs to the Team 6 harness.

## 2. Instruments

### 2.1 Metric names

Defined once in `observability/opentelemetry/src/metrics.rs` so Team 5 emits and
Team 6 asserts the same names:

| Name | Unit | Meaning |
| --- | --- | --- |
| `axiom.revocation.lookup.duration` | seconds | One lookup |
| `axiom.revocation.state.version` | 1 | Current snapshot version |
| `axiom.revocation.propagation.delay` | seconds | Commit-to-visible delay |
| `axiom.revocation.stale.total` | 1 | Stale lookups |
| `axiom.revocation.unavailable.total` | 1 | Unavailable lookups |
| `axiom.audit.enqueue.duration` | seconds | Inline enqueue |
| `axiom.audit.queue.depth` | 1 | Current queued records |
| `axiom.audit.dropped.total` | 1 | Dropped records |
| `axiom.audit.write.duration` | seconds | Off-path writer batch |
| `axiom.audit.redactions.total` | 1 | Values replaced |
| `axiom.audit.export.failures.total` | 1 | Export failures |
| `axiom.trace.parse.failures.total` | 1 | Malformed `traceparent` |

Durations are reported in seconds at the metric layer (OpenTelemetry
convention); audit events keep microseconds and examples print nanoseconds. The
unit is part of the metric name contract.

### 2.2 Percentiles

`LatencySummary::from_samples` sorts samples and reports nearest-rank `p50`,
`p95`, `p99`, `min`, `max`, and `count`. An empty set returns `None` rather than
a misleading zero.

### 2.3 Propagation probe

`PropagationProbe` records `(version, timestamp)` on update and visibility:

```rust
probe.mark_update(version, now_unix_ms);
// ... snapshot travels / is installed ...
probe.mark_visible(version, now_unix_ms); // -> Option<PropagationSample>
```

The probe is a measurement helper, not a synchronization primitive. A negative
delay (clock regression) is clamped to zero.

## 3. Definitions

Let **T_commit** be the instant the authority's new snapshot becomes live
(`RevocationStore::apply` returns, or the admin service accepts the command).
Let **T_visible** be the instant a consumer lookup returns the new
`state_version`.

```text
propagation_delay = T_visible - T_commit
```

Three variants must be reported separately:

| Variant | What it measures | Current support |
| --- | --- | --- |
| In-process hand-off | Authority swap → reader install → lookup in one process | implemented |
| Same-host cross-process | Admin process → transport → ExtMCP process | transport not built |
| Cross-host | Admin → transport → ExtMCP on another machine | out of Phase 1 |

For the same-host cross-process case, both ends must use a monotonic clock
(`Instant`) or a shared time source. Wall-clock subtraction across hosts is
invalid due to skew and is **not** an acceptable G1 measurement.

## 4. Workloads

The runnable probe in `kill-switch/examples/slice_probe.rs` uses:

| Measurement | Samples | Workload |
| --- | --- | --- |
| `revocation.pre_identity` | 200,000 | Four active revocations (global, server, agent, tool), warm cache, `server-a`/`tool-a` |
| `revocation.post_identity` | 200,000 | Same, plus `agent-a` |
| `audit.enqueue` | 100,000 | Critical queue sized above the sample count so every enqueue succeeds; one pre-built `DENY` record cloned per iteration |
| `revocation.handoff` | 2,000 | Alternate agent `revoke`/`clear`; apply on authority, install into reader, read back |
| `revocation.propagation_ms` | 2,000 | Same loop, `PropagationProbe` in milliseconds |

Warm-up: 10,000 pre- and post-identity lookups before sampling. The example
prints a checksum of observed versions so the optimizer cannot elide the reads.

The drop path is not benchmarked by the example; unit tests assert it is
non-blocking. Measure it separately with a deliberately small queue.

## 5. Procedure

### 5.1 Component probe (in-process)

```text
cargo run \
  -p axiom-kill-switch --example slice_probe --release
```

Report the machine, OS, architecture, Rust version, build profile, and date.
Repeat at least three times; keep every run, not just the best one.

### 5.2 Audit drop behavior

1. Construct a bus with `critical_capacity = 1`, `routine_capacity = 1`.
2. Fill both queues.
3. Time `try_emit` for the next record.
4. Assert the call returns immediately with `DroppedFull` and the counter
   increments.

This is a correctness test, not a latency distribution.

### 5.3 End-to-end (Team 6)

Team 6 owns the harness. Team 5 will provide the metric hooks and fixtures. The
harness should:

1. drive MCP requests through the real gateway in both `enforce` and
   `observe-only`;
2. record client-observed latency, ExtMCP callout duration, and
   `pipeline_latency_us`;
3. toggle a global revocation mid-run and record the first request that is
   denied (or shadowed) plus the first request after the new version is visible;
4. run with the audit writer enabled and disabled to isolate enqueue cost;
5. run a pressure case with a slow writer to confirm request latency is flat
   while `axiom.audit.dropped.total` rises;
6. run failure injection for stale and unavailable revocation state.

End-to-end measurement must not use the in-process numbers as a substitute.

### 5.4 Reporting template

```text
environment: <os> <arch>, <cpu>, <ram>, <profile>, <rustc>, <commit>, <date>
workload:    <name>, <N>, <warmup>, <repetitions>
result:      count=<n> min=<..> p50=<..> p95=<..> p99=<..> max=<..> <unit>
notes:       <background load, timer resolution, anomalies>
```

## 6. Observed in-process run (illustrative, not Gate G1 evidence)

Captured on the development machine on 2026-11-15:

```text
slice_probe: os=windows arch=x86_64 profile=release
```

| Measurement | Run A p50 | Run A p95 | Run A p99 | Run B p50 | Run B p95 | Run B p99 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| pre-identity lookup | 1.9 µs | 4.0 µs | 7.1 µs | 1.9 µs | 3.2 µs | 6.8 µs |
| post-identity lookup | 2.2 µs | 4.7 µs | 8.5 µs | 2.3 µs | 3.8 µs | 8.3 µs |
| audit enqueue | 0.5 µs | 2.0 µs | 2.7 µs | 0.6 µs | 1.1 µs | 2.4 µs |
| authority→reader hand-off | 13.9 µs | 40.1 µs | 107.2 µs | 8.9 µs | 17.5 µs | 38.6 µs |
| propagation (probe, ms) | 0 ms | 0 ms | 1 ms | 0 ms | 0 ms | 0 ms |

Run A and Run B are two invocations of the same command on an otherwise busy
developer desktop. Maximum values were 0.6–16.7 ms and are dominated by
scheduler/preemption noise; they are not representative of steady-state cost.
The spreads between runs show why these numbers must not be presented as an SLO.

What this supports:

- lookup is a small, bounded operation well under the seam's `<50 µs` budget;
- enqueue is sub-microsecond at p50 and low single-digit microseconds at p99;
- in-process hand-off is tens of microseconds, not milliseconds.

What this does **not** support:

- any claim about cross-process propagation;
- any claim about gateway end-to-end latency;
- any claim about behavior under production load;
- any Gate G1 pass/fail statement.

## 7. Suggested acceptance thresholds (for discussion, not commitments)

These are proposals for Team 6 and Team 0 to debate, not measured results:

| Property | Proposed threshold | Rationale |
| --- | --- | --- |
| Revocation lookup p99 | ≤ 50 µs | Matches the existing Team 2 seam budget |
| Audit enqueue p99 | ≤ 10 µs with capacity | Keeps the inline path negligible against the 15 ms callout budget |
| Critical audit drops | 0 at target RPS | A dropped denial is a control failure |
| In-process propagation p99 | ≤ 1 ms | Snapshot install is local |
| Cross-process propagation p99 | ≤ refresh interval + 1 s | Depends on the transport Team 0 chooses |
| End-to-end added latency | within Team 1's callout budget | Team 1 owns the 15 ms deadline |

## 8. Limits and pitfalls

- **Debug builds are not comparable.** Always use `--release`.
- **Windows timer resolution.** Millisecond probe values are coarse; use the
  nanosecond hand-off measurement for sub-millisecond work.
- **Nearest-rank percentiles.** A small number of huge outliers moves `max` but
  barely moves `p99`; report both and explain spikes.
- **CPU frequency and background load.** Pin the process and quiesce the machine
  for any number that leaves this document.
- **Allocation effects.** The first lookups in a process warm allocator and
  branch predictor state; warm up before sampling.
- **Snapshot size.** Lookup probes four keys regardless of total entry count
  (the map probe is O(log n)), but install cost grows with snapshot size. Record
  the entry count with every propagation number.
- **Clock source.** Use monotonic time for durations. Never subtract wall-clock
  timestamps across hosts.
- **Measurement itself.** Sampling `Instant::now()` twice per iteration adds
  overhead. Report the methodology so readers can judge it.

## 9. Ownership

| Task | Owner |
| --- | --- |
| Component probe and fixtures | Team 5 |
| End-to-end harness and acceptance run | Team 6 |
| Gateway callout timing | Team 1 |
| Pipeline timing fields | Team 2 |
| Decision on cross-process transport | Team 0 |
