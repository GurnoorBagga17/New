"use client";

import React from "react";

const ECOSYSTEM_LOGOS = [
  { name: "Claude Desktop", category: "Agent Runtime", tag: "MCP Native" },
  { name: "OpenAI Assistants", category: "LLM Provider", tag: "API Tools" },
  { name: "LangChain & LangGraph", category: "Agent Framework", tag: "Autonomous" },
  { name: "Cursor & Windsurf", category: "Developer Agent", tag: "Tool Invocation" },
  { name: "Kubernetes Workloads", category: "Cloud Infrastructure", tag: "SPIFFE / SPIRE" },
  { name: "Snowflake Data Cloud", category: "Data Warehouse", tag: "Least Privilege" },
  { name: "AWS Secrets Manager", category: "Credential Store", tag: "JIT Rotation" },
  { name: "HashiCorp & OpenBao", category: "Cryptographic Vault", tag: "Ephemeral Leases" },
  { name: "Cedar Policy Engine", category: "Formal Verification", tag: "Sub-ms Gate" },
  { name: "Datadog Telemetry", category: "SIEM & Observability", tag: "Audit Pipeline" },
  { name: "CrowdStrike Falcon", category: "Endpoint Security", tag: "Identity Threat" },
  { name: "Okta Workload Identity", category: "Federation", tag: "RFC 8707" },
];

export function MarqueeLogos() {
  return (
    <section className="marquee-section" aria-label="Supported Integrations and Ecosystem">
      <div className="marquee-label-wrap wrap">
        <span className="marquee-eyebrow">SEAMLESS INTEGRATION ACROSS EVERY MAJOR AI RUNTIME &amp; ENTERPRISE STACK</span>
      </div>
      <div className="marquee-container">
        <div className="marquee-track marquee-scroll-left">
          {[...ECOSYSTEM_LOGOS, ...ECOSYSTEM_LOGOS].map((item, index) => (
            <div key={`${item.name}-${index}`} className="marquee-card">
              <span className="marquee-dot" />
              <div className="marquee-text-group">
                <span className="marquee-name">{item.name}</span>
                <span className="marquee-tag">{item.tag}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
