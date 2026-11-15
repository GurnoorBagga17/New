// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
import { useState } from "react";

interface TraceSpan {
  id: string;
  name: string;
  service: string;
  durationMs: number;
  offsetMs: number;
  status: "OK" | "DENIED" | "ERROR";
  attributes: Record<string, string>;
}

const TRACE_SAMPLE_SPANS: TraceSpan[] = [
  {
    id: "span-01",
    name: "gateway.ingress_proxy",
    service: "axiom-envoy-ingress",
    durationMs: 0.2,
    offsetMs: 0.0,
    status: "OK",
    attributes: { "http.method": "POST", "rpc.method": "tools/call", "client.ip": "10.244.12.8" },
  },
  {
    id: "span-02",
    name: "identity.spiffe_svid_verify",
    service: "axiom-identity-verifier",
    durationMs: 0.4,
    offsetMs: 0.2,
    status: "OK",
    attributes: { "spiffe.id": "spiffe://axiom.internal/ns/prod/sa/autonomous-finops-agent", "pcr0.verified": "true" },
  },
  {
    id: "span-03",
    name: "cedar.policy_eval",
    service: "axiom-cedar-engine",
    durationMs: 0.8,
    offsetMs: 0.6,
    status: "OK",
    attributes: { "cedar.decision": "ALLOW", "policy.id": "pol-sql-readonly-v4", "eval.us": "820" },
  },
  {
    id: "span-04",
    name: "secretless.lease_injection",
    service: "axiom-openbao-broker",
    durationMs: 0.3,
    offsetMs: 1.4,
    status: "OK",
    attributes: { "vault.lease_id": "openbao/lease/mysql/0196d1", "ttl.seconds": "300" },
  },
  {
    id: "span-05",
    name: "mcp.upstream_dispatch",
    service: "target-mcp-snowflake",
    durationMs: 1.9,
    offsetMs: 1.7,
    status: "OK",
    attributes: { "mcp.tool": "execute_sql", "target.db": "prod-analytics" },
  },
  {
    id: "span-06",
    name: "egress.zero_secret_scrubber",
    service: "axiom-scrubber-pipeline",
    durationMs: 0.2,
    offsetMs: 3.6,
    status: "OK",
    attributes: { "pii.scrubbed": "0", "secrets.detected": "0", "bytes.scanned": "4096" },
  },
];

export function ObservabilityPage() {
  const [selectedSpan, setSelectedSpan] = useState<TraceSpan>(TRACE_SAMPLE_SPANS[2]!);
  const [activeTab, setActiveTab] = useState<"TRACES" | "METRICS" | "SLO">("TRACES");
  const totalTraceDuration = 3.8;

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-border-subtle pb-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-brand-orange">
              TELEMETRY &bull; OPENTELEMETRY &amp; PROMETHEUS
            </span>
            <span className="inline-flex items-center rounded-full border border-state-enforce/30 bg-state-enforce-tint px-2 py-0.5 font-mono text-[10px] text-state-enforce">
              MODULE: observability
            </span>
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-text-primary">
            Observability &amp; Wire-Speed Telemetry
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Sub-millisecond wire performance metrics, OpenTelemetry distributed trace waterfall, and real-time error budget tracking.
          </p>
        </div>

        {/* Tab switchers */}
        <div className="flex rounded-input border border-border-subtle bg-surface-1 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("TRACES")}
            className={`rounded px-3 py-1.5 font-mono text-xs transition ${
              activeTab === "TRACES"
                ? "bg-surface-2 font-semibold text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            OTel Trace Waterfall
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("METRICS")}
            className={`rounded px-3 py-1.5 font-mono text-xs transition ${
              activeTab === "METRICS"
                ? "bg-surface-2 font-semibold text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            Prometheus Metrics
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("SLO")}
            className={`rounded px-3 py-1.5 font-mono text-xs transition ${
              activeTab === "SLO"
                ? "bg-surface-2 font-semibold text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            SLO &amp; Error Budget
          </button>
        </div>
      </div>

      {/* Latency Gauges */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-text-muted">P50 Gateway Latency</p>
          <p className="mt-2 font-display text-2xl font-bold text-state-enforce">1.1 ms</p>
          <p className="mt-1 text-xs text-text-muted">Median wire transit time</p>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-text-muted">P95 Gateway Latency</p>
          <p className="mt-2 font-display text-2xl font-bold text-state-enforce">2.4 ms</p>
          <p className="mt-1 text-xs text-text-muted">95% of calls complete under 2.5ms</p>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-brand-orange">P99 Gateway Latency</p>
          <p className="mt-2 font-display text-2xl font-bold text-brand-orange">3.8 ms</p>
          <p className="mt-1 text-xs text-text-muted">Under 5.0ms strict ceiling</p>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-text-muted">Total Evaluated RPS</p>
          <p className="mt-2 font-display text-2xl font-bold text-text-primary">14,250</p>
          <p className="mt-1 text-xs text-text-muted">Requests/sec across fleet</p>
        </div>
      </div>

      {/* Tab 1: Trace Waterfall */}
      {activeTab === "TRACES" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-8">
            <div className="rounded-card border border-border-subtle bg-surface-1 p-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-border-subtle pb-3">
                <span className="font-mono text-xs font-semibold text-text-primary">
                  TRACE ID: 0196d1f0-7c40-7d6a-8c7b-trace-001 &bull; TOTAL: {totalTraceDuration}ms
                </span>
                <span className="rounded bg-state-enforce-tint px-2 py-0.5 font-mono text-[10px] font-bold text-state-enforce">
                  200 OK &bull; PERMITTED
                </span>
              </div>

              {/* Waterfall Bar Graph */}
              <div className="mt-6 space-y-4">
                {TRACE_SAMPLE_SPANS.map((span) => {
                  const leftPercent = (span.offsetMs / totalTraceDuration) * 100;
                  const widthPercent = Math.max((span.durationMs / totalTraceDuration) * 100, 2);
                  const isSelected = selectedSpan.id === span.id;

                  return (
                    <div
                      key={span.id}
                      onClick={() => setSelectedSpan(span)}
                      className={`cursor-pointer rounded p-2 transition hover:bg-surface-2 ${
                        isSelected ? "bg-surface-2 ring-1 ring-border-strong" : ""
                      }`}
                    >
                      <div className="flex justify-between font-mono text-xs">
                        <span className="font-semibold text-text-primary">{span.name}</span>
                        <span className="text-text-muted">{span.durationMs.toFixed(1)} ms</span>
                      </div>
                      <div className="relative mt-1.5 h-3 w-full rounded bg-surface-3">
                        <div
                          className="absolute h-full rounded bg-brand-orange"
                          style={{
                            left: `${leftPercent}%`,
                            width: `${widthPercent}%`,
                          }}
                        />
                      </div>
                      <div className="mt-1 font-mono text-[10px] text-text-muted">
                        Service: {span.service}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Span Attributes Inspector */}
          <div className="space-y-4 lg:col-span-4">
            <div className="rounded-card border border-border-subtle bg-surface-1 p-5 shadow-sm">
              <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-muted">
                SPAN ATTRIBUTES
              </span>
              <h2 className="mt-2 font-display text-lg font-bold text-text-primary">
                {selectedSpan.name}
              </h2>
              <p className="mt-1 font-mono text-xs text-brand-orange">
                Duration: {selectedSpan.durationMs}ms
              </p>

              <div className="mt-4 space-y-2 rounded-input border border-border-subtle bg-surface-2 p-3 font-mono text-xs">
                {Object.entries(selectedSpan.attributes).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2 border-b border-border-subtle py-1 last:border-0">
                    <span className="text-text-muted truncate">{k}:</span>
                    <span className="font-semibold text-text-primary truncate">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Prometheus Metrics */}
      {activeTab === "METRICS" && (
        <div className="rounded-card border border-border-subtle bg-surface-1 p-5 shadow-sm">
          <span className="font-mono text-xs font-semibold text-brand-orange">
            PROMETHEUS METRIC SCRAPE ENDPOINT &bull; /metrics
          </span>
          <pre className="mt-4 overflow-x-auto rounded-input bg-canvas p-4 font-mono text-xs text-text-secondary leading-relaxed">
{`# HELP axiom_mcp_requests_total Total number of MCP tool calls processed
# TYPE axiom_mcp_requests_total counter
axiom_mcp_requests_total{status="permit",runtime_mode="enforce"} 1894210
axiom_mcp_requests_total{status="deny",runtime_mode="enforce"} 124

# HELP axiom_cedar_evaluation_duration_seconds Cedar evaluation latency histogram
# TYPE axiom_cedar_evaluation_duration_seconds histogram
axiom_cedar_evaluation_duration_seconds_bucket{le="0.001"} 1840211
axiom_cedar_evaluation_duration_seconds_bucket{le="0.005"} 1894334
axiom_cedar_evaluation_duration_seconds_count 1894334
axiom_cedar_evaluation_duration_seconds_sum 1512.44

# HELP axiom_secretless_leases_active Gauge of active ephemeral dynamic leases
# TYPE axiom_secretless_leases_active gauge
axiom_secretless_leases_active{vault="openbao-prod"} 142`}
          </pre>
        </div>
      )}

      {/* Tab 3: SLO */}
      {activeTab === "SLO" && (
        <div className="space-y-4">
          <div className="rounded-card border border-border-subtle bg-surface-1 p-5 shadow-sm">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-state-enforce">
              SERVICE LEVEL OBJECTIVES (SLO)
            </span>
            <h2 className="mt-1 font-display text-lg font-bold text-text-primary">
              99.99% Availability &amp; Sub-5ms Wire Budget
            </h2>
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-card border border-border-subtle bg-surface-2 p-4">
                <span className="font-mono text-xs text-text-muted">SLO 1: P99 LATENCY &lt; 5.0ms</span>
                <p className="mt-2 font-mono text-2xl font-bold text-state-enforce">99.998%</p>
                <p className="mt-1 text-xs text-text-muted">Error budget remaining: 98.4% (30-day window)</p>
              </div>
              <div className="rounded-card border border-border-subtle bg-surface-2 p-4">
                <span className="font-mono text-xs text-text-muted">SLO 2: AVAILABILITY &gt; 99.99%</span>
                <p className="mt-2 font-mono text-2xl font-bold text-state-enforce">100.00%</p>
                <p className="mt-1 text-xs text-text-muted">0 unhandled proxy panics or crash loops</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
