// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
"use client";

import React, { useState } from "react";
import { IconPlus, IconMinus } from "./Icons";

const FAQS = [
  {
    question: "What exactly is a Non-Human Identity (NHI) and why is it dangerous?",
    answer: "A Non-Human Identity (NHI) is any programmatic identity used by AI agents, autonomous bots, background microservices, or API integrations. Unlike human users who authenticate with passwords and MFA, NHIs rely on static API keys, service tokens, or certificates. If an autonomous agent is manipulated by prompt injection or compromised upstream, those static credentials grant attackers ambient, uncontrolled access to databases and cloud APIs.",
    tag: "Fundamentals",
  },
  {
    question: "How is Axiom different from traditional IAM like Okta, CyberArk, or AWS IAM?",
    answer: "Traditional IAM manages who has an account and issues long-lived static tokens. But traditional IAM has zero visibility into what an agent does inside a tool session. Axiom is an inline, real-time decision gateway: it inspects every individual tool-call parameter (via deep AST parsing), enforces deterministic Cedar policies at sub-millisecond speeds, and replaces static tokens with dynamic 60-second single-use credentials.",
    tag: "Architecture",
  },
  {
    question: "Will routing tool traffic through Axiom add latency to our AI agent responses?",
    answer: "No. Axiom's core proxy is written in Rust with zero-copy deserialization and in-memory Cedar WASM evaluation. The entire decision loop—including identity verification, AST argument parsing, and policy evaluation—completes with a P99 tail latency under 3.5ms. This is imperceptible compared to typical LLM streaming token generation (which takes 200ms–800ms).",
    tag: "Performance",
  },
  {
    question: "Can we test Axiom in shadow/observe mode without risking breaking production?",
    answer: "Yes! Axiom features a native 'Observe (Shadow Audit)' mode. You can deploy the gateway in minutes, and it will passively monitor all MCP traffic, log would-deny policy violations, and map identity lineage—without blocking a single request. Once you review your baseline telemetry, you can switch to 'Enforce (Fail-Closed)' with one click.",
    tag: "Deployment",
  },
  {
    question: "Do we have to rewrite our agent codebase or modify existing MCP tools?",
    answer: "Zero code changes required. Axiom adheres strictly to the Model Context Protocol (MCP) JSON-RPC specification. You simply point your existing client (Claude Desktop, Cursor, LangGraph, or custom agent) to the local proxy URL (e.g. export MCP_GATEWAY_URL=\"http://localhost:9090\"). Downstream tools receive standard requests with dynamic credentials injected on the fly.",
    tag: "Integration",
  },
  {
    question: "How does Axiom prevent prompt injection attacks from dropping database tables?",
    answer: "Axiom uses an inline AST (Abstract Syntax Tree) argument parser. Instead of fragile regex strings, Axiom parses the syntactic grammar of incoming tool arguments pre-execution. If a hijacked agent attempts 'DROP TABLE customer_records' or directory traversal like '/var/run/secrets', Axiom traps the AST node and terminates the call immediately fail-closed.",
    tag: "Threat Defense",
  },
];

export function FaqAccordion() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const toggle = (idx: number) => setOpenIdx(openIdx === idx ? null : idx);

  return (
    <section className="faq-section" id="faq">
      <div className="wrap">
        <div className="faq-header">
          <p className="eyebrow">COMMON ARCHITECTURE QUESTIONS</p>
          <h2>Everything you need to know about inline NHI governance.</h2>
          <p>
            Learn how Axiom fits into your existing cloud infrastructure, Kubernetes clusters, and AI developer workflows.
          </p>
        </div>

        <div className="faq-list">
          {FAQS.map((faq, idx) => {
            const isOpen = openIdx === idx;
            return (
              <div key={idx} className={`faq-item ${isOpen ? "is-open" : ""}`}>
                <button
                  type="button"
                  className="faq-question-btn"
                  onClick={() => toggle(idx)}
                  aria-expanded={isOpen}
                >
                  <span className="faq-question-text">{faq.question}</span>
                  <div className="faq-btn-right">
                    <span className="faq-tag">{faq.tag}</span>
                    <span className="faq-chevron-icon">
                      {isOpen ? <IconMinus size={14} color="#00E5FF" /> : <IconPlus size={14} color="#94A3B8" />}
                    </span>
                  </div>
                </button>
                {isOpen && (
                  <div className="faq-answer-content">
                    <p>{faq.answer}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
