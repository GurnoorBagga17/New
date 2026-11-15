"use client";

import { useState } from "react";

const views = [
  { label: "Agent-native", heading: "Identity is the new perimeter.", copy: "AI agents call tools with delegated authority, at machine speed. Their access needs context and policy at the moment a tool executes.", points: ["Short-lived, verifiable identities", "Tool-aware authorization", "Decisions attached to audit context"] },
  { label: "Runtime-first", heading: "Security belongs in the call path.", copy: "A policy decision made outside the execution boundary can miss the request that matters. Axiom evaluates MCP calls inline before they reach a tool.", points: ["Inspect the request and target", "Validate arguments before execution", "Fail closed when enforcement is unavailable"] },
] as const;

export function ThesisSwitcher() {
  const [active, setActive] = useState(0);
  const view = views[active]!;
  return <div className="thesis-card"><div className="switcher" role="group" aria-label="Product thesis">{views.map((option, index) => <button key={option.label} type="button" aria-pressed={active === index} className={active === index ? "switcher-button is-active" : "switcher-button"} onClick={() => setActive(index)}>{option.label}</button>)}</div><div className="thesis-content" aria-live="polite"><p className="eyebrow">THE AXIOM THESIS</p><h3>{view.heading}</h3><p>{view.copy}</p><ul>{view.points.map((point) => <li key={point}><span aria-hidden="true">↗</span>{point}</li>)}</ul></div><div className="thesis-visual" aria-hidden="true"><div className="visual-orbit orbit-one"/><div className="visual-orbit orbit-two"/><div className="visual-center">A</div><span className="visual-node node-agent">AGENT</span><span className="visual-node node-policy">POLICY</span><span className="visual-node node-tool">TOOL</span></div></div>;
}
