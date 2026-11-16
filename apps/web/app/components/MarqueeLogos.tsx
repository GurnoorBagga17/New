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
    <section className="py-8 bg-slate-50/70 border-y border-slate-200/80 overflow-hidden relative" aria-label="Supported Integrations and Ecosystem">
      {/* Left and Right Fade Gradients */}
      <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-slate-50 via-slate-50/80 to-transparent z-10 pointer-events-none" aria-hidden="true" />
      <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-slate-50 via-slate-50/80 to-transparent z-10 pointer-events-none" aria-hidden="true" />

      <div className="max-w-7xl mx-auto px-4 text-center mb-5">
        <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500">
          SEAMLESS INTEGRATION ACROSS EVERY MAJOR AI RUNTIME &amp; ENTERPRISE STACK
        </span>
      </div>

      <div className="overflow-hidden whitespace-nowrap flex w-full">
        <div className="marquee-track marquee-scroll-left flex items-center">
          {[...ECOSYSTEM_LOGOS, ...ECOSYSTEM_LOGOS].map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={`${item.name}-${index}`}
                className="inline-flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white border border-slate-200/90 shadow-xs hover:shadow-sm hover:border-indigo-300 transition-all mx-2 flex-shrink-0"
              >
                <span className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-700">
                  <Icon size={18} />
                </span>
                <div className="flex flex-col text-left">
                  <span className="text-xs font-bold text-slate-900 leading-tight">{item.name}</span>
                  <span className="text-[10px] font-mono text-slate-500 font-medium mt-0.5">{item.tag}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
