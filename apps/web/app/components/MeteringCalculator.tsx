"use client";

import React, { useState, useId } from "react";
import Link from "next/link";

export function MeteringCalculator() {
  const [identities, setIdentities] = useState(280);
  const [events, setEvents] = useState(18800);

  const identitiesId = useId();
  const eventsId = useId();

  // Price calculation formula calibrated to yield $6.96 at (280, 18800)
  const identityCost = identities * 0.015;
  const eventCost = (events / 1000) * 0.1468085;
  const totalCost = (identityCost + eventCost).toFixed(2);

  const identityPercent = Math.min(100, Math.max(0, (identities / 5000) * 100));
  const eventPercent = Math.min(100, Math.max(0, (events / 250000) * 100));

  const applyPreset = (presetIdentities: number, presetEvents: number) => {
    setIdentities(presetIdentities);
    setEvents(presetEvents);
  };

  return (
    <div className="simulator-card metering-card" aria-label="Dual-Slider Metering Calculator">
      {/* Card Header with Presets */}
      <div className="metering-card-header">
        <div className="metering-header-top">
          <span className="metering-tag">Dual-Slider Metering Calculator</span>
          <div className="metering-presets">
            <button
              type="button"
              className={`preset-btn ${identities === 280 && events === 18800 ? "is-active" : ""}`}
              onClick={() => applyPreset(280, 18800)}
            >
              Seed (280)
            </button>
            <button
              type="button"
              className={`preset-btn ${identities === 1200 && events === 85000 ? "is-active" : ""}`}
              onClick={() => applyPreset(1200, 85000)}
            >
              Growth (1.2k)
            </button>
            <button
              type="button"
              className={`preset-btn ${identities === 4500 && events === 200000 ? "is-active" : ""}`}
              onClick={() => applyPreset(4500, 200000)}
            >
              Scale (4.5k)
            </button>
          </div>
        </div>

        <div className="metering-tier">
          <span className="tier-zero">$0</span>
          <div className="tier-text-group">
            <span className="tier-name">Passive Discovery</span>
            <span className="tier-subtext">Free shadow audit • Pay only when enforcing inline</span>
          </div>
        </div>
      </div>

      {/* Main Sliders & Cost Grid */}
      <div className="metering-card-body">
        {/* Sliders Column */}
        <div className="metering-sliders">
          {/* Slider 1: Active Identities */}
          <div className="slider-group">
            <div className="slider-meta">
              <label htmlFor={identitiesId} className="slider-label">
                Active Non-Human Identities (NHIs)
              </label>
              <div className="slider-val-tag">
                <span className="val-number">{identities.toLocaleString()}</span>
                <span className="val-rate">($0.015 / NHI)</span>
              </div>
            </div>
            <div className="slider-track-wrap">
              <input
                id={identitiesId}
                type="range"
                min="0"
                max="5000"
                step="10"
                value={identities}
                onChange={(e) => setIdentities(Number(e.target.value))}
                className="cyan-slider"
                style={{
                  background: `linear-gradient(to right, rgb(0, 229, 255) 0%, rgb(0, 229, 255) ${identityPercent}%, rgb(30, 39, 58) ${identityPercent}%, rgb(30, 39, 58) 100%)`,
                }}
                aria-valuemin={0}
                aria-valuemax={5000}
                aria-valuenow={identities}
              />
            </div>
          </div>

          {/* Slider 2: Ingested Events */}
          <div className="slider-group">
            <div className="slider-meta">
              <label htmlFor={eventsId} className="slider-label">
                Ingested MCP Tool Events / Month
              </label>
              <div className="slider-val-tag">
                <span className="val-number">{events.toLocaleString()}</span>
                <span className="val-rate">($0.147 / 1k reqs)</span>
              </div>
            </div>
            <div className="slider-track-wrap">
              <input
                id={eventsId}
                type="range"
                min="0"
                max="250000"
                step="500"
                value={events}
                onChange={(e) => setEvents(Number(e.target.value))}
                className="cyan-slider"
                style={{
                  background: `linear-gradient(to right, rgb(0, 229, 255) 0%, rgb(0, 229, 255) ${eventPercent}%, rgb(30, 39, 58) ${eventPercent}%, rgb(30, 39, 58) 100%)`,
                }}
                aria-valuemin={0}
                aria-valuemax={250000}
                aria-valuenow={events}
              />
            </div>
          </div>

          {/* Transparent Line Items */}
          <div className="calculator-breakdown">
            <div className="breakdown-item">
              <span>Passive Discovery:</span>
              <span className="item-free">$0.00</span>
            </div>
            <div className="breakdown-item">
              <span>Identity Lineage:</span>
              <span>${identityCost.toFixed(2)}</span>
            </div>
            <div className="breakdown-item">
              <span>Cedar Evaluated Calls:</span>
              <span>${eventCost.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Cost Display Column */}
        <div className="metering-cost-column">
          <span className="cost-label">Estimated cost</span>
          <div className="cost-amount-wrap">
            <span className="cost-amount">${totalCost}</span>
            <span className="cost-period">/mo</span>
          </div>
          <span className="cost-guarantee">No credit card required to start</span>
          <Link href="/docs#quickstart" className="metering-cta-btn">
            Deploy in 5 Min <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
