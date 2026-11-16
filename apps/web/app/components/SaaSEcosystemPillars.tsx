// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
"use client";

import React, { useState } from "react";
import { IconCheck, IconCross, IconEye, IconShield, IconKey } from "./Icons";

export function SaaSEcosystemPillars() {
  const [activeTab, setActiveTab] = useState<"ciso" | "dev">("ciso");

  return (
    <section className="saas-pillars-section" id="how-it-works">
      <div className="wrap">
        {/* Comparison Box */}
        <div className="problem-comparison-box">
          <div className="problem-header">
            <span className="problem-pill">THE NON-HUMAN IDENTITY PROBLEM</span>
            <h2>
              Workloads outnumber humans 45-to-1.<br />
              Traditional IAM only protects humans.
            </h2>
            <p>
              Your employees have Okta, Single Sign-On, and 2-Factor Authentication. Your autonomous AI agents, MCP tools, and background workloads have permanent, unmonitored API keys.
            </p>
          </div>

          <div className="comparison-cards-grid">
            {/* Human Column */}
            <div className="contrast-card card-human">
              <div className="contrast-card-header">
                <span className="contrast-badge">TRADITIONAL IAM (OKTA, ENTRA)</span>
                <h3>Human User Perimeter</h3>
              </div>
              <ul className="contrast-list">
                <li>
                  <span className="icon-wrap-check"><IconCheck size={14} /></span>
                  1 Human on 1 Managed Laptop
                </li>
                <li>
                  <span className="icon-wrap-check"><IconCheck size={14} /></span>
                  Authenticated via Biometrics / Push MFA
                </li>
                <li>
                  <span className="icon-wrap-check"><IconCheck size={14} /></span>
                  Bounded by explicit business hours and manual clicks
                </li>
                <li>
                  <span className="icon-wrap-check"><IconCheck size={14} /></span>
                  Access revoked instantly when employee departs
                </li>
              </ul>
              <div className="contrast-footer">
                <span className="footer-status status-safe">
                  <IconCheck size={12} color="#10B981" /> Well Protected
                </span>
              </div>
            </div>

            {/* Agent Column */}
            <div className="contrast-card card-agent">
              <div className="contrast-card-header">
                <span className="contrast-badge badge-warning">THE UNGOVERNED SURFACE</span>
                <h3>AI Agent &amp; Workload Perimeter</h3>
              </div>
              <ul className="contrast-list">
                <li>
                  <span className="icon-wrap-cross"><IconCross size={14} /></span>
                  45+ autonomous tool calls per second across microservices
                </li>
                <li>
                  <span className="icon-wrap-cross"><IconCross size={14} /></span>
                  Uses permanent static API keys and bearer tokens
                </li>
                <li>
                  <span className="icon-wrap-cross"><IconCross size={14} /></span>
                  Vulnerable to prompt injection, AST tampering &amp; tool drift
                </li>
                <li>
                  <span className="icon-wrap-cross"><IconCross size={14} /></span>
                  82% of enterprise breaches now involve compromised non-human identities
                </li>
              </ul>
              <div className="contrast-footer">
                <span className="footer-status status-danger">
                  <IconCross size={12} color="#F43F5E" /> High Risk &amp; Blind Spot
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 3 Pillars */}
        <div className="three-pillars-wrap">
          <div className="pillars-intro">
            <p className="eyebrow">CONTINUOUS LIFECYCLE GOVERNANCE</p>
            <h2>How Axiom Secures Every Autonomous Agent</h2>
            <p className="pillars-subtext">
              Axiom acts as a transparent, inline zero-trust decision proxy. No code changes to your AI tools, no latency penalty.
            </p>
          </div>

          <div className="pillars-grid">
            {/* Pillar 1 */}
            <div className="pillar-card">
              <div className="pillar-top-row">
                <span className="pillar-step-badge">STAGE 01</span>
                <div className="pillar-icon-box">
                  <IconEye size={22} color="#00E5FF" />
                </div>
              </div>
              <h3>Continuous Discovery</h3>
              <p>
                Automatically inventory every autonomous agent, subagent, and MCP tool running in your ecosystem. Map identity lineage and identify over-privileged static bearer tokens in passive shadow-observe mode.
              </p>
              <div className="pillar-meta">
                <span><IconCheck size={12} /> 100% Shadow Audit</span>
                <span><IconCheck size={12} /> Zero Code Changes</span>
              </div>
            </div>

            {/* Pillar 2 */}
            <div className="pillar-card pillar-card-active">
              <div className="pillar-top-row">
                <span className="pillar-step-badge badge-active">STAGE 02</span>
                <div className="pillar-icon-box box-active">
                  <IconShield size={22} color="#10B981" />
                </div>
              </div>
              <h3>Inline AST &amp; Cedar Guard</h3>
              <p>
                Intercept calls at machine speed (&lt; 3.5ms). Deep AST parsers sanitize arguments against destructive DDL, SSRF, and file traversal, while Cedar policies enforce mathematically verifiable boundaries.
              </p>
              <div className="pillar-meta">
                <span><IconCheck size={12} /> Fail-Closed Protection</span>
                <span><IconCheck size={12} /> P99 &lt; 3.5ms Overhead</span>
              </div>
            </div>

            {/* Pillar 3 */}
            <div className="pillar-card">
              <div className="pillar-top-row">
                <span className="pillar-step-badge">STAGE 03</span>
                <div className="pillar-icon-box">
                  <IconKey size={22} color="#6366F1" />
                </div>
              </div>
              <h3>Just-In-Time Secret Leases</h3>
              <p>
                Eliminate hardcoded secrets forever. Upon policy approval, OpenBao mints dynamic, single-use credentials with 60-second TTLs injected directly into the upstream connection.
              </p>
              <div className="pillar-meta">
                <span><IconCheck size={12} /> Zero Static Secrets</span>
                <span><IconCheck size={12} /> Ephemeral Dynamic TTL</span>
              </div>
            </div>
          </div>
        </div>

        {/* Persona Switcher */}
        <div className="persona-switcher-box">
          <div className="persona-nav">
            <span className="persona-lead">WHY LEADING TEAMS CHOOSE AXIOM:</span>
            <div className="persona-tabs">
              <button
                type="button"
                className={`persona-tab ${activeTab === "ciso" ? "is-active" : ""}`}
                onClick={() => setActiveTab("ciso")}
              >
                For CISOs &amp; Security Leaders
              </button>
              <button
                type="button"
                className={`persona-tab ${activeTab === "dev" ? "is-active" : ""}`}
                onClick={() => setActiveTab("dev")}
              >
                For AI Engineers &amp; Platform Teams
              </button>
            </div>
          </div>

          <div className="persona-content-display">
            {activeTab === "ciso" ? (
              <div className="persona-pane">
                <div className="pane-main">
                  <h3>Enterprise-grade risk reduction without slowing AI innovation.</h3>
                  <p>
                    Enable engineering teams to ship autonomous agent features with complete peace of mind. Axiom enforces cryptographic least privilege, eliminates leaked credential exposure, and provides automated, audit-ready compliance evidence.
                  </p>
                  <div className="persona-bullets">
                    <div className="bullet-col">
                      <h4>Continuous Compliance Ready</h4>
                      <p>Align with SOC 2, HIPAA, ISO 27001, and NIST AI RMF controls with tamper-evident OpenTelemetry and RFC 8785 audit streams.</p>
                    </div>
                    <div className="bullet-col">
                      <h4>Deterministic Kill-Switch</h4>
                      <p>Instantly revoke misbehaving agent sub-trees cluster-wide with a single cryptographic signature.</p>
                    </div>
                  </div>
                </div>
                <div className="pane-stat">
                  <span className="stat-num">100%</span>
                  <span className="stat-label">Fail-Closed Guarantee</span>
                  <p className="stat-sub">Network partition or policy timeout halts unverified execution automatically.</p>
                </div>
              </div>
            ) : (
              <div className="persona-pane">
                <div className="pane-main">
                  <h3>Drop-in proxy for Claude Desktop, LangGraph, and Cursor.</h3>
                  <p>
                    No rewrites. No custom SDK bloat. Run Axiom as a lightweight local sidecar or Docker container. Author readable, declarative Cedar policies as code and test them in an offline playground.
                  </p>
                  <div className="persona-bullets">
                    <div className="bullet-col">
                      <h4>Sub-Millisecond Rust Core</h4>
                      <p>Ultra-low P99 tail latency ensures zero perceptible delay on streaming LLM responses.</p>
                    </div>
                    <div className="bullet-col">
                      <h4>Standard MCP Spec</h4>
                      <p>Full support for Model Context Protocol JSON-RPC frames, SSE streaming, and OAuth 2.1 RFC 8707.</p>
                    </div>
                  </div>
                </div>
                <div className="pane-stat">
                  <span className="stat-num">&lt; 3.5ms</span>
                  <span className="stat-label">P99 Gateway Overhead</span>
                  <p className="stat-sub">Engineered with Rust, zero-copy deserialization, and in-memory Cedar WASM.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
