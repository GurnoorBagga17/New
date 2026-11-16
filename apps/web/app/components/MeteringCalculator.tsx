'use client';

import React, { useState, useId } from 'react';
import Link from 'next/link';

export function MeteringCalculator() {
  const [agents, setAgents] = useState(250);
  const [events, setEvents] = useState(50000);
  const [retentionDays, setRetentionDays] = useState(30);

  const agentsId = useId();
  const eventsId = useId();
  const retentionId = useId();

  // Explicit Capacity Pricing Formula
  const agentCost = agents * 0.015;
  const eventCost = (events / 1000) * 0.15;
  const retentionCost = retentionDays > 30 ? (retentionDays - 30) * 0.25 : 0.0;
  const totalCost = (agentCost + eventCost + retentionCost).toFixed(2);

  return (
    <section className="pricing-section" id="pricing" aria-label="Transparent pricing and interactive capacity calculator">
      <div className="wrap">
        <div className="section-heading">
          <p className="eyebrow">TRANSPARENT CAPACITY PRICING</p>
          <h2>Predictable, fair pricing. Never a seat tax on AI.</h2>
          <p>
            Axiom believes finding what you have should always be free. Run read-only discovery scans forever for $0.
          </p>
        </div>

        <div className="pricing-grid">
          {/* Tier 1: $0 Discovery Policy Guarantee */}
          <div className="pricing-card free-tier-card">
            <div className="pricing-header">
              <span className="pricing-pill">POLICY GUARANTEE</span>
              <h3>Passive Discovery &amp; Shadow Audit</h3>
              <div className="pricing-amount">
                <span className="amount-val">$0</span>
                <span className="amount-period">/ forever</span>
              </div>
              <p className="pricing-desc">
                Everything you need to uncover agent sprawl and quantify your blast radius.
              </p>
            </div>

            <ul className="pricing-features">
              <li>✓ Unlimited read-only cloud &amp; SCM connectors</li>
              <li>✓ Complete AI-BOM agent attribution map</li>
              <li>✓ Interactive blast radius &amp; lineage analysis</li>
              <li>✓ OWASP Machine Identity &amp; MCP Top 10 scans</li>
              <li>✓ Zero credit card required · Never expires</li>
            </ul>

            <div className="pricing-action">
              <Link href="/docs#quickstart" className="deploy-button">
                Start Free Discovery &rarr;
              </Link>
            </div>
          </div>

          {/* Tier 2: Interactive Gateway Capacity Calculator */}
          <div className="pricing-card calculator-card">
            <div className="pricing-header">
              <span className="pricing-pill">RUNTIME ENFORCEMENT</span>
              <h3>Dynamic Gateway Capacity</h3>
              <div className="pricing-amount">
                <span className="amount-val">${totalCost}</span>
                <span className="amount-period">/ month</span>
              </div>
              <p className="pricing-formula">
                Formula: <code>$0 Discovery + ($0.015 × Agents) + ($0.150 / 1k Calls)</code>
              </p>
            </div>

            <div className="calculator-controls">
              {/* Input 1: Active Managed Agents */}
              <div className="control-group">
                <div className="control-label-row">
                  <label htmlFor={agentsId}>1. Active Managed Agents</label>
                  <span className="control-val">{agents.toLocaleString()} agents</span>
                </div>
                <input
                  id={agentsId}
                  type="range"
                  min="10"
                  max="2000"
                  step="10"
                  value={agents}
                  onChange={(e) => setAgents(Number(e.target.value))}
                  className="ax-slider"
                  aria-valuemin={10}
                  aria-valuemax={2000}
                  aria-valuenow={agents}
                />
              </div>

              {/* Input 2: Tool Call Volume / Month */}
              <div className="control-group">
                <div className="control-label-row">
                  <label htmlFor={eventsId}>2. Tool Call Volume / Month</label>
                  <span className="control-val">{events.toLocaleString()} calls</span>
                </div>
                <input
                  id={eventsId}
                  type="range"
                  min="5000"
                  max="500000"
                  step="5000"
                  value={events}
                  onChange={(e) => setEvents(Number(e.target.value))}
                  className="ax-slider"
                  aria-valuemin={5000}
                  aria-valuemax={500000}
                  aria-valuenow={events}
                />
              </div>

              {/* Input 3: Audit Log Retention */}
              <div className="control-group">
                <div className="control-label-row">
                  <label htmlFor={retentionId}>3. Forensic Audit Log Retention</label>
                  <span className="control-val">{retentionDays} Days</span>
                </div>
                <select
                  id={retentionId}
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(Number(e.target.value))}
                  className="ax-select"
                >
                  <option value={30}>30 Days (Included in Base)</option>
                  <option value={90}>90 Days (+$15/mo)</option>
                  <option value={365}>365 Days Compliance (+$83/mo)</option>
                </select>
              </div>
            </div>

            <div className="calculator-breakdown-row">
              <div className="breakdown-stat">
                <span>Discovery Base</span>
                <strong>$0.00</strong>
              </div>
              <div className="breakdown-stat">
                <span>Agent Identity Attestation</span>
                <strong>${agentCost.toFixed(2)}</strong>
              </div>
              <div className="breakdown-stat">
                <span>Cedar Evaluated Invocations</span>
                <strong>${eventCost.toFixed(2)}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
