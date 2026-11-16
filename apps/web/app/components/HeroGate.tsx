'use client';

import { useState, useEffect, useId } from 'react';
import Link from 'next/link';
import { HERO_COPY, GATE_SCENARIOS, type GateScenario } from '../content/landing';
import { QuickCopyCommand } from './QuickCopyCommand';
import { useReducedMotion } from '../lib/motion';

export function HeroGate() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const liveRegionId = useId();

  const activeScenario: GateScenario = GATE_SCENARIOS[currentIndex] ?? GATE_SCENARIOS[0]!;

  useEffect(() => {
    if (!isPlaying || isHovered || prefersReducedMotion) {
      return;
    }
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % GATE_SCENARIOS.length);
    }, 4200);
    return () => clearInterval(interval);
  }, [isPlaying, isHovered, prefersReducedMotion]);

  return (
    <section className="hero-section" aria-label="Axiom NHI overview and interactive gate demo">
      <div className="wrap hero-layout">
        {/* Left Column: Headlines, CTAs, and Micro-proof */}
        <div className="hero-content">
          <div className="hero-live-badge">
            <span className="live-dot" />
            <span>{HERO_COPY.eyebrow.toUpperCase()}</span>
          </div>

          <h1 className="hero-headline">
            Every AI agent is an identity.<br />
            Govern what it can do in under 5&nbsp;ms.
          </h1>

          <p className="hero-subheadline">
            {HERO_COPY.subheadline}
          </p>

          <div className="hero-actions">
            <Link href={HERO_COPY.ctaPrimary.href} className="deploy-button">
              <span>{HERO_COPY.ctaPrimary.label}</span>
              <span aria-hidden="true">&rarr;</span>
            </Link>

            <a href={HERO_COPY.ctaTertiary.href} className="text-link-button">
              {HERO_COPY.ctaTertiary.label}
            </a>
          </div>

          <div className="hero-command-area">
            <QuickCopyCommand command={HERO_COPY.ctaSecondary.command} />
          </div>

          <div className="hero-meta-strip" aria-label="Product guarantees">
            {HERO_COPY.microProof.map((item) => (
              <span className="meta-item" key={item}>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                  style={{ color: 'var(--state-enforce)' }}
                >
                  <path
                    d="M13.5 4.5L6.5 11.5L3 8"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {item}
              </span>
            ))}
          </div>
        </div>

        {/* Right Column: Sleek Tactical Runtime Inspector */}
        <div
          className="hero-gate-container hero-console-wrap"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onFocus={() => setIsHovered(true)}
          onBlur={() => setIsHovered(false)}
          role="region"
          aria-label="Interactive policy evaluation gate demo"
        >
          {/* Top Window Bar */}
          <div className="hero-console-topbar">
            <div className="console-window-dots" aria-hidden="true">
              <span className="dot dot-red" />
              <span className="dot dot-amber" />
              <span className="dot dot-green" />
            </div>

            <div className="console-title">
              <span className="console-live-beacon" />
              <span>AXIOM INLINE GOVERNANCE GATEWAY</span>
            </div>

            <div className="hero-gate-controls">
              <button
                type="button"
                onClick={() => setIsPlaying((p) => !p)}
                className="hero-gate-toggle"
                aria-label={isPlaying ? 'Pause interactive demo' : 'Play interactive demo'}
                title={isPlaying ? 'Pause auto-cycle' : 'Resume auto-cycle'}
              >
                {isPlaying ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <rect x="5" y="4" width="4" height="16" />
                    <rect x="15" y="4" width="4" height="16" />
                  </svg>
                ) : (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                )}
                <span>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
              </button>
            </div>
          </div>

          {/* Accessible Live Region */}
          <div
            id={liveRegionId}
            className="sr-only"
            aria-live="polite"
            aria-atomic="true"
          >
            Scenario: {activeScenario.name}. Verdict: {activeScenario.verdict.toUpperCase()}. Reason: {activeScenario.reason}.
          </div>

          {/* Interactive Scenario Selector Tabs */}
          <div className="console-scenario-tabs" role="tablist" aria-label="Select security scenario">
            {GATE_SCENARIOS.map((scenario, index) => {
              const isSelected = index === currentIndex;
              return (
                <button
                  key={scenario.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  className={`console-tab-btn ${isSelected ? 'is-active' : ''} ${scenario.verdict === 'permit' ? 'tab-permit' : 'tab-deny'}`}
                  onClick={() => setCurrentIndex(index)}
                >
                  <span className="tab-indicator" />
                  <span className="tab-name">{scenario.name}</span>
                </button>
              );
            })}
          </div>

          {/* 3-Stage Architecture Pipeline Visual */}
          <div className="console-pipeline" aria-hidden="true">
            {/* Stage 1: Workload Agent */}
            <div className="pipeline-node node-agent">
              <div className="node-icon-wrap">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="10" rx="3" />
                  <circle cx="12" cy="5" r="2" />
                  <path d="M12 7v4" />
                  <line x1="8" y1="16" x2="8.01" y2="16" />
                  <line x1="16" y1="16" x2="16.01" y2="16" />
                </svg>
              </div>
              <div className="node-meta">
                <span className="node-label">INBOUND WORKLOAD</span>
                <strong className="node-id">{activeScenario.agentId ?? 'autonomous-agent'}</strong>
                <span className="node-sub">tools/call: {activeScenario.tool}</span>
              </div>
            </div>

            {/* Connecting Beam 1 */}
            <div className="pipeline-wire">
              <div className="wire-track" />
              <div className="wire-pulse pulse-forward" />
              <span className="wire-tag">MCP WIRE</span>
            </div>

            {/* Stage 2: Axiom Gate Boundary */}
            <div className="pipeline-node node-gateway">
              <div className="node-icon-wrap icon-gate">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z" />
                  <path d="M12 8v8" />
                  <path d="M8 12h8" />
                </svg>
              </div>
              <div className="node-meta">
                <span className="node-label">AXIOM BOUNDARY</span>
                <strong className="node-id">{activeScenario.validator}</strong>
                <span className="node-sub">AST &amp; Cedar Evaluator</span>
              </div>
            </div>

            {/* Connecting Beam 2 */}
            <div className={`pipeline-wire ${activeScenario.verdict === 'permit' ? 'wire-permitted' : 'wire-blocked'}`}>
              <div className="wire-track" />
              <div className={`wire-pulse ${activeScenario.verdict === 'permit' ? 'pulse-forward' : 'pulse-blocked'}`} />
              <span className="wire-tag">{activeScenario.verdict === 'permit' ? 'AUTHORIZED' : 'SEVERED'}</span>
            </div>

            {/* Stage 3: Target Resource & Verdict */}
            <div className={`pipeline-node node-target ${activeScenario.verdict === 'permit' ? 'target-permitted' : 'target-blocked'}`}>
              <div className="node-icon-wrap icon-target">
                {activeScenario.verdict === 'permit' ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                  </svg>
                )}
              </div>
              <div className="node-meta">
                <span className="node-label">TARGET RESOURCE</span>
                <strong className="node-id">{activeScenario.targetResource ?? 'Protected Resource'}</strong>
                <span className={`verdict-tag ${activeScenario.verdict}`}>
                  {activeScenario.verdict === 'permit' ? 'PERMITTED' : 'BLOCKED INLINE'}
                </span>
              </div>
            </div>
          </div>

          {/* Code & Policy Inspection Split-Deck */}
          <div className="console-inspector-grid">
            {/* Left: Tool Call Arguments */}
            <div className="inspector-panel">
              <div className="panel-header">
                <span className="panel-badge">INSPECTED ARGUMENTS</span>
                <span className="panel-lang">AST PARSER</span>
              </div>
              <div className="panel-body">
                <pre className="code-display">
                  <code>{activeScenario.payloadSummary}</code>
                </pre>
              </div>
            </div>

            {/* Right: Cedar Policy Rule */}
            <div className={`inspector-panel ${activeScenario.verdict === 'permit' ? 'border-permit' : 'border-deny'}`}>
              <div className="panel-header">
                <span className="panel-badge">CEDAR 3.X POLICY</span>
                <span className={`verdict-mini-badge ${activeScenario.verdict}`}>
                  {activeScenario.verdict === 'permit' ? 'ALLOW' : 'FORBID'}
                </span>
              </div>
              <div className="panel-body">
                <pre className="code-display policy-display">
                  <code>{activeScenario.cedarRule ?? activeScenario.reason}</code>
                </pre>
                <p className="policy-explanation">
                  <span className="bullet">&bull;</span> {activeScenario.reason}
                </p>
              </div>
            </div>
          </div>

          {/* Console Bottom Action Bar */}
          <div className="console-footer-bar">
            <div className="footer-metric">
              <span className="metric-dot" />
              <span>Inline Wire Latency: <strong>{activeScenario.latencyDisplay}</strong></span>
              <span className="metric-tag">({activeScenario.latencyKind})</span>
              <span className="metric-sep">&bull;</span>
              <span className="fail-closed-note">Fail-Closed on Outage</span>
            </div>

            <Link
              href={`/playground?scenario=${activeScenario.id}`}
              className="console-playground-cta"
            >
              <span>Simulate in Playground</span>
              <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

