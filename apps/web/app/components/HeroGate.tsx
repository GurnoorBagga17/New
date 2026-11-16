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
    }, 2800);
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

        {/* Right Column: The Gate Interactive Simulation */}
        <div
          className="hero-gate-container"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onFocus={() => setIsHovered(true)}
          onBlur={() => setIsHovered(false)}
          role="region"
          aria-label="Interactive policy evaluation gate demo"
        >
          {/* Header Controls */}
          <div className="hero-gate-header">
            <div className="hero-gate-title">
              <span className="hero-gate-pulse" />
              <span>THE GATE · INLINE BOUNDARY</span>
            </div>

            <div className="hero-gate-controls">
              <button
                type="button"
                onClick={() => setIsPlaying((p) => !p)}
                className="hero-gate-toggle"
                aria-label={isPlaying ? 'Pause interactive demo' : 'Play interactive demo'}
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <rect x="6" y="4" width="4" height="16" />
                    <rect x="14" y="4" width="4" height="16" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
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

          {/* Fallback for Reduced Motion: Static 3-Row List */}
          {prefersReducedMotion ? (
            <div className="hero-gate-static-list" aria-label="Static security scenario summary">
              {GATE_SCENARIOS.slice(0, 3).map((scenario) => (
                <div
                  key={scenario.id}
                  className={`hero-gate-static-item ${scenario.verdict === 'permit' ? 'is-permit' : 'is-deny'}`}
                >
                  <div className="static-item-header">
                    <span className="static-item-badge">{scenario.badge}</span>
                    <span className="static-item-tool">{scenario.tool}</span>
                    <span className="static-item-latency">{scenario.latencyDisplay} ({scenario.latencyKind})</span>
                  </div>
                  <p className="static-item-reason">{scenario.reason}</p>
                </div>
              ))}
            </div>
          ) : (
            /* Dynamic Visual Stage */
            <div className="hero-gate-stage" role="img" aria-label={`Security interceptor demonstration showing ${activeScenario.name}`}>
              {/* Luminous Gate Boundary Line */}
              <div className="gate-boundary-line" aria-hidden="true">
                <div className="gate-line-glow" />
                <span className="gate-marker gate-marker-top">GATE</span>
                <span className="gate-marker gate-marker-bottom">INTERCEPT</span>
              </div>

              {/* Travelling Tool Call Card */}
              <div
                key={activeScenario.id}
                className={`gate-call-card ${activeScenario.verdict === 'permit' ? 'gate-permit' : 'gate-deny'}`}
              >
                <div className="gate-card-top">
                  <div className="gate-card-identity">
                    <span className="agent-badge">Agent: data-analyst-prod</span>
                    <span className="tool-name">{activeScenario.tool}</span>
                  </div>
                  <span className={`verdict-pill ${activeScenario.verdict}`}>
                    {activeScenario.verdict === 'permit' ? 'PERMIT' : 'BLOCKED'}
                  </span>
                </div>

                <div className="gate-card-body">
                  <div className="gate-payload-code">
                    <code>{activeScenario.payloadSummary}</code>
                  </div>
                  <div className="gate-reason-text">
                    <span className="gate-validator">{activeScenario.validator}</span>
                    <span className="gate-detail">{activeScenario.reason}</span>
                  </div>
                </div>

                <div className="gate-card-footer">
                  <span className="gate-latency-badge">
                    Latency: <strong>{activeScenario.latencyDisplay}</strong>
                    <small className="latency-kind">({activeScenario.latencyKind})</small>
                  </span>

                  <Link
                    href={`/playground?scenario=${activeScenario.id}`}
                    className="gate-playground-link"
                  >
                    Run in Playground &rarr;
                  </Link>
                </div>
              </div>

              {/* Scenario Stepper Indicators */}
              <div className="hero-gate-stepper" role="tablist" aria-label="Select scenario">
                {GATE_SCENARIOS.map((scenario, index) => (
                  <button
                    key={scenario.id}
                    type="button"
                    role="tab"
                    aria-selected={index === currentIndex}
                    aria-label={`Scenario ${index + 1}: ${scenario.name}`}
                    className={`stepper-dot ${index === currentIndex ? 'active' : ''} ${scenario.verdict === 'permit' ? 'dot-permit' : 'dot-deny'}`}
                    onClick={() => setCurrentIndex(index)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
