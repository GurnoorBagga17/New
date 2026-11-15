// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
"use client";

import React from "react";
import {
  LogoClaude,
  LogoOpenAI,
  LogoKubernetes,
  LogoSnowflake,
  LogoAWS,
  LogoVault,
  LogoCedar,
  LogoDatadog,
  LogoCrowdStrike,
  LogoOkta,
  LogoLangChain,
  LogoCursor,
} from "./Icons";

const ECOSYSTEM_LOGOS = [
  { name: "Claude Desktop", category: "Agent Runtime", tag: "MCP Native", icon: LogoClaude },
  { name: "OpenAI Assistants", category: "LLM Provider", tag: "API Tools", icon: LogoOpenAI },
  { name: "LangChain & LangGraph", category: "Agent Framework", tag: "Autonomous", icon: LogoLangChain },
  { name: "Cursor & Windsurf", category: "Developer Agent", tag: "Tool Invocation", icon: LogoCursor },
  { name: "Kubernetes Workloads", category: "Cloud Infrastructure", tag: "SPIFFE / SPIRE", icon: LogoKubernetes },
  { name: "Snowflake Data Cloud", category: "Data Warehouse", tag: "Least Privilege", icon: LogoSnowflake },
  { name: "AWS Secrets Manager", category: "Credential Store", tag: "JIT Rotation", icon: LogoAWS },
  { name: "HashiCorp & OpenBao", category: "Cryptographic Vault", tag: "Ephemeral Leases", icon: LogoVault },
  { name: "Cedar Policy Engine", category: "Formal Verification", tag: "Sub-ms Gate", icon: LogoCedar },
  { name: "Datadog Telemetry", category: "SIEM & Observability", tag: "Audit Pipeline", icon: LogoDatadog },
  { name: "CrowdStrike Falcon", category: "Endpoint Security", tag: "Identity Threat", icon: LogoCrowdStrike },
  { name: "Okta Workload Identity", category: "Federation", tag: "RFC 8707", icon: LogoOkta },
];

export function MarqueeLogos() {
  return (
    <section className="marquee-section" aria-label="Supported Integrations and Ecosystem">
      <div className="marquee-label-wrap wrap">
        <span className="marquee-eyebrow">SEAMLESS INTEGRATION ACROSS EVERY MAJOR AI RUNTIME &amp; ENTERPRISE STACK</span>
      </div>
      <div className="marquee-container">
        <div className="marquee-track marquee-scroll-left">
          {[...ECOSYSTEM_LOGOS, ...ECOSYSTEM_LOGOS].map((item, index) => {
            const Icon = item.icon;
            return (
              <div key={`${item.name}-${index}`} className="marquee-card">
                <span className="marquee-logo-badge">
                  <Icon size={20} />
                </span>
                <div className="marquee-text-group">
                  <span className="marquee-name">{item.name}</span>
                  <span className="marquee-tag">{item.tag}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
