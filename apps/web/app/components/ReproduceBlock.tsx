import { QuickCopyCommand } from './QuickCopyCommand';

export function ReproduceBlock() {
  return (
    <section className="reproduce-section" id="reproduce" aria-label="Reproduce benchmarks and run test fixtures">
      <div className="wrap">
        <div className="section-heading">
          <p className="eyebrow">REPRODUCIBILITY &amp; OPEN SOURCE</p>
          <h2>Don&apos;t take our word for it. Run the benchmarks yourself.</h2>
          <p>
            Every security guarantee and latency target is verifiable in your local terminal using our automated chaos test suite.
          </p>
        </div>

        <div className="reproduce-grid">
          {/* Card 1: 1-Click Gateway Docker Install */}
          <div className="reproduce-card">
            <div className="reproduce-header">
              <span className="reproduce-badge">1. DEPLOY RUNTIME</span>
              <h3>Single-Command Local Quickstart</h3>
              <p>Spin up the inline MCP gateway proxy locally in Docker.</p>
            </div>
            <div className="reproduce-command-wrap">
              <QuickCopyCommand command="docker compose up axiom-gateway" />
            </div>
            <p className="reproduce-subtext">Listens on localhost:9090 for stdio &amp; SSE agent tool calls.</p>
          </div>

          {/* Card 2: Run Chaos & Fail-Closed Tests */}
          <div className="reproduce-card">
            <div className="reproduce-header">
              <span className="reproduce-badge">2. VERIFY CHAOS</span>
              <h3>Run 9/9 Chaos Fail-Closed Tests</h3>
              <p>Simulate network cuts, evaluator timeouts, and crashed processes.</p>
            </div>
            <div className="reproduce-command-wrap">
              <QuickCopyCommand command="python -m pytest tests/failure-injection/test_fail_closed.py" />
            </div>
            <p className="reproduce-subtext">Verifies 100% fail-closed rejection on 15 ms deadline timeout.</p>
          </div>

          {/* Card 3: Run Cedar Latency Benchmarks */}
          <div className="reproduce-card">
            <div className="reproduce-header">
              <span className="reproduce-badge">3. MEASURE LATENCY</span>
              <h3>Run Local Latency Benchmark Harness</h3>
              <p>Execute PERF-01 through PERF-04 evaluation methodology tests.</p>
            </div>
            <div className="reproduce-command-wrap">
              <QuickCopyCommand command="python tests/performance/test_latency_benchmarks.py" />
            </div>
            <p className="reproduce-subtext">Inspects P50, P95, and P99 policy evaluation timings.</p>
          </div>
        </div>

        {/* Target Benchmark Latency Teaser */}
        <div className="benchmark-teaser-card">
          <div className="teaser-left">
            <span className="teaser-pill">PERFORMANCE TARGETS</span>
            <h4>Inline Cedar Evaluation Latency Profile</h4>
            <p>
              Runtime numbers are withheld on /benchmarks until production fleet runs conclude. Targets below reflect architectural invariants.
            </p>
          </div>

          <div className="teaser-chart" role="img" aria-label="Target latency percentiles: P50 under 1 millisecond, P95 under 2.5 milliseconds, P99 under 5 milliseconds">
            <div className="bar-group">
              <div className="bar-val">&lt; 1 ms</div>
              <div className="bar-track"><div className="bar-fill" style={{ height: '30%' }} /></div>
              <div className="bar-label">P50 (Target)</div>
            </div>
            <div className="bar-group">
              <div className="bar-val">&lt; 2.5 ms</div>
              <div className="bar-track"><div className="bar-fill" style={{ height: '60%' }} /></div>
              <div className="bar-label">P95 (Target)</div>
            </div>
            <div className="bar-group">
              <div className="bar-val">&lt; 5 ms</div>
              <div className="bar-track"><div className="bar-fill bar-fill--p99" style={{ height: '90%' }} /></div>
              <div className="bar-label">P99 (Target)</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
