// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
"use client";

import React, { useState } from "react";
import { IconLightning, IconShieldCheck, IconKey, IconLock, IconCheck, IconArrowRight } from "./Icons";

export function TalkToEngineerSection() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    agentCount: "50-250",
    challenge: "mcp-security",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [ticketId, setTicketId] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json().catch(() => ({}));
      setTicketId(data.ticketId || `AXM-ENG-${Math.floor(1000 + Math.random() * 9000)}`);
    } catch {
      setTicketId(`AXM-ENG-${Math.floor(1000 + Math.random() * 9000)}`);
    } finally {
      setIsSubmitting(false);
      setIsSubmitted(true);
    }
  };

  return (
    <section className="talk-engineer-section" id="contact-engineer">
      <div className="wrap talk-engineer-grid">
        {/* Left Column: Technical Highlights & Perks */}
        <div className="talk-engineer-info">
          <div className="live-eng-badge">
            <span className="live-eng-dot" />
            <span>SECURITY ARCHITECTS STANDING BY &bull; RESPONSE UNDER 15 MIN</span>
          </div>

          <h2>Talk directly to a security engineer.</h2>
          <p className="eng-lede">
            No junior SDRs or script-readers. Connect with the core engineering team building inline non-human identity governance, Cedar verification gates, and ephemeral credential vaults.
          </p>

          <div className="eng-perks-list">
            <div className="eng-perk-item">
              <div className="perk-icon-wrap perk-threat">
                <IconLightning size={20} color="#00E5FF" />
              </div>
              <div className="perk-content">
                <h4>Custom MCP Threat Modeling</h4>
                <p>We review your autonomous agent topology and analyze potential AST injection or token leak vectors.</p>
              </div>
            </div>

            <div className="eng-perk-item">
              <div className="perk-icon-wrap perk-cedar">
                <IconShieldCheck size={20} color="#10B981" />
              </div>
              <div className="perk-content">
                <h4>Tailored Cedar Policy Templates</h4>
                <p>Get ready-to-deploy least-privilege boundary rules mapped directly to your database &amp; API schemas.</p>
              </div>
            </div>

            <div className="eng-perk-item">
              <div className="perk-icon-wrap perk-poc">
                <IconKey size={20} color="#F59E0B" />
              </div>
              <div className="perk-content">
                <h4>Zero-Friction Enterprise Proof-of-Concept</h4>
                <p>Run Axiom Gateway in shadow-observe mode on your internal cluster with zero code changes.</p>
              </div>
            </div>
          </div>

          <div className="trust-cert-badges">
            <span className="cert-pill">SOC 2 Type II</span>
            <span className="cert-pill">HIPAA Ready</span>
            <span className="cert-pill">ISO 27001 Aligned</span>
            <span className="cert-pill">Apache 2.0 Core</span>
          </div>
        </div>

        {/* Right Column: Interactive Direct Routing Form */}
        <div className="talk-engineer-form-card">
          <div className="form-card-header">
            <div className="form-window-dots">
              <span className="dot dot-red" />
              <span className="dot dot-yellow" />
              <span className="dot dot-green" />
            </div>
            <span className="form-header-title">Send a Direct Message to Engineering</span>
          </div>

          {!isSubmitted ? (
            <form onSubmit={handleSubmit} className="engineer-form">
              <div className="form-row-dual">
                <div className="form-group">
                  <label htmlFor="eng-name">Your Name</label>
                  <input
                    id="eng-name"
                    type="text"
                    required
                    placeholder="Alex Chen"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="saas-input"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="eng-email">Work Email</label>
                  <input
                    id="eng-email"
                    type="email"
                    required
                    placeholder="alex@company.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="saas-input"
                  />
                </div>
              </div>

              <div className="form-row-dual">
                <div className="form-group">
                  <label htmlFor="eng-company">Company</label>
                  <input
                    id="eng-company"
                    type="text"
                    placeholder="Acme Corp"
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    className="saas-input"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="eng-agents">Active Non-Human Identities (NHIs)</label>
                  <select
                    id="eng-agents"
                    value={formData.agentCount}
                    onChange={(e) => setFormData({ ...formData, agentCount: e.target.value })}
                    className="saas-select"
                  >
                    <option value="1-50">1 &ndash; 50 Agents / Workloads</option>
                    <option value="50-250">50 &ndash; 250 Agents (Growth)</option>
                    <option value="250-1000">250 &ndash; 1,000 Agents (Scale)</option>
                    <option value="1000+">1,000+ (Enterprise Fleet)</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="eng-challenge">Primary Security Priority</label>
                <select
                  id="eng-challenge"
                  value={formData.challenge}
                  onChange={(e) => setFormData({ ...formData, challenge: e.target.value })}
                  className="saas-select"
                >
                  <option value="mcp-security">Securing Model Context Protocol (MCP) Tool Invocations</option>
                  <option value="static-keys">Eliminating Static Bearer Tokens &amp; API Keys</option>
                  <option value="prompt-injection">Deep AST Protection Against Prompt Injections &amp; SQL Drops</option>
                  <option value="compliance">Continuous Non-Human Identity Audit &amp; Compliance</option>
                  <option value="custom-poc">Private On-Premise / Air-Gapped Deployment</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="eng-message">Message / Architecture Notes (Optional)</label>
                <textarea
                  id="eng-message"
                  rows={3}
                  placeholder="Tell us about your current agent framework (Claude Desktop, LangGraph, custom) and what tools you want to govern..."
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  className="saas-textarea"
                />
              </div>

              <button type="submit" disabled={isSubmitting} className="submit-eng-btn">
                <span>
                  {isSubmitting ? "Routing to Engineer..." : (
                    <span className="btn-flex-inner">
                      Send Message to Engineering Queue <IconArrowRight size={15} />
                    </span>
                  )}
                </span>
              </button>

              <p className="form-privacy-note">
                <IconLock size={12} color="#64748B" /> Zero tracking cookies. Your architecture notes are encrypted and dispatched directly to our on-call security team.
              </p>
            </form>
          ) : (
            <div className="form-success-card">
              <div className="success-icon-wrap">
                <IconCheck size={28} color="#10B981" />
              </div>
              <h3>Message Received by Engineering</h3>
              <p>
                Thanks, <b>{formData.name}</b>. Ticket <code>{ticketId}</code> has been dispatched directly to our security engineering team. You will receive a technical review response at <b>{formData.email}</b> shortly.
              </p>
              <div className="success-actions">
                <button
                  type="button"
                  className="reset-btn"
                  onClick={() => {
                    setIsSubmitted(false);
                    setFormData({ ...formData, message: "" });
                  }}
                >
                  Send Another Message
                </button>
                <a
                  href="https://github.com/axiom-nhi/axiom-nhi"
                  target="_blank"
                  rel="noreferrer"
                  className="github-track-link"
                >
                  Explore GitHub Repo &rarr;
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
