"use client";

import { useState } from "react";
import { StateBadge } from "@axiom/ui";

const scenarios = [
  { name: "Read-only query", tool: "warehouse.query", detail: "SELECT region, total FROM quarterly_sales", verdict: "ALLOW", state: "enforce", time: "illustrative simulation" },
  { name: "Destructive query", tool: "warehouse.query", detail: "DROP TABLE customer_records", verdict: "WOULD DENY", state: "observe", time: "illustrative simulation" },
  { name: "Unpinned tool", tool: "catalog.install", detail: "Tool definition changed after approval", verdict: "DENY", state: "deny", time: "illustrative simulation" },
] as const;

export function InterceptSimulator() {
  const [selected, setSelected] = useState(0);
  const scenario = scenarios[selected]!;
  return <section className="simulator" aria-labelledby="sim-title">
    <div className="simulator-head"><div><p className="eyebrow">INTERACTIVE PREVIEW</p><h2 id="sim-title">See a tool call meet policy.</h2></div><p className="sim-label">Illustrative simulation · not a live benchmark</p></div>
    <div className="scenario-tabs" role="group" aria-label="Intercept scenarios">
      {scenarios.map((item, index) => <button key={item.name} type="button" aria-pressed={selected === index} className={selected === index ? "scenario-tab is-active" : "scenario-tab"} onClick={() => setSelected(index)}>{item.name}</button>)}
    </div>
    <div className="sim-grid">
      <div className="packet-card"><div className="packet-meta"><span>INCOMING MCP REQUEST</span><span>tools/call</span></div><p className="packet-tool">{scenario.tool}</p><code>{scenario.detail}</code><div className="packet-route"><span className="route-node">AGENT</span><span className="route-line" aria-hidden="true"><i /></span><span className="route-node route-node--policy">CEDAR POLICY</span><span className="route-line" aria-hidden="true"><i /></span><span className="route-node">MCP SERVER</span></div></div>
      <div className="decision-card" aria-live="polite"><p className="eyebrow">POLICY OUTCOME</p><StateBadge state={scenario.state}>{scenario.verdict}</StateBadge><p className="decision-copy">{selected === 0 ? "The call passed the configured policy path." : selected === 1 ? "In observe-only mode, a would-deny finding is recorded while the call continues." : "In enforce mode, a tool definition that fails its pin check is blocked."}</p><small>{scenario.time}</small></div>
    </div>
  </section>;
}
