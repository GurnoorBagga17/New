// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="site-wrapper">
      {/* Background ambient lighting */}
      <div className="global-radial-bloom" aria-hidden="true" />
      <div className="global-ambient-grid" aria-hidden="true" />

      {/* Top Global Announcement Banner */}
      <div className="top-announcement-bar">
        <div className="wrap announcement-inner">
          <span className="announcement-pill">v0.4.2 RELEASE</span>
          <span className="announcement-text">
            Inline Non-Human Identity Governance for the Model Context Protocol (MCP)
          </span>
          <Link href="/shadow-audit" className="announcement-link">
            Run 30-Min Shadow Audit <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>

      {/* Top Navigation Bar */}
      <header className="site-header">
        <div className="header-inner wrap">
          {/* Brand Logo & Live Badge */}
          <div className="brand-group">
            <Link className="wordmark" href="/" aria-label="Axiom NHI home">
              <svg
                width="28"
                height="28"
                viewBox="0 0 32 32"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="wordmark-icon"
                aria-hidden="true"
              >
                <polygon
                  points="16,3 29,26 3,26"
                  stroke="var(--brand-cyan)"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  fill="rgba(0, 229, 255, 0.08)"
                />
                <polygon
                  points="16,11 23,23 9,23"
                  stroke="var(--brand-cyan)"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  fill="rgba(9, 13, 20, 0.9)"
                />
                <line x1="16" y1="3" x2="16" y2="11" stroke="var(--brand-cyan)" strokeWidth="1.5" />
                <line x1="29" y1="26" x2="23" y2="23" stroke="var(--brand-cyan)" strokeWidth="1.5" />
                <line x1="3" y1="26" x2="9" y2="23" stroke="var(--brand-cyan)" strokeWidth="1.5" />
              </svg>
              <span className="wordmark-text">
                <span className="wordmark-axiom">AXIOM</span>
                <span className="wordmark-nhi"> NHI</span>
              </span>
            </Link>
            <span className="header-live-indicator" title="Gateway runtime engine online">
              <span className="live-pulse-dot" />
              LIVE GATEWAY
            </span>
          </div>

          {/* Center Nav Links */}
          <nav className="site-nav" aria-label="Main navigation">
            <Link href="/platform" className="nav-link">Platform</Link>
            <Link href="/integrations" className="nav-link">Integrations</Link>
            <Link href="/compare" className="nav-link">Compare</Link>
            <Link href="/playground" className="nav-link">Playground</Link>
            <Link href="/benchmarks" className="nav-link">Benchmarks</Link>
            <Link href="/pricing" className="nav-link">Pricing</Link>
            <Link href="/docs" className="nav-link">Docs</Link>
            <Link href="/trust" className="nav-link">Trust</Link>
          </nav>

          {/* Right Action Buttons */}
          <div className="header-actions flex items-center gap-4">
            <Link
              href="/contact"
              className="nav-link hidden xl:inline-flex items-center text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors px-1"
            >
              Contact
            </Link>
            <Link
              href="/shadow-audit"
              className="nav-link hidden lg:inline-flex items-center text-xs font-semibold text-slate-600 hover:text-indigo-600 transition-colors px-1"
            >
              30-Min Shadow Audit
            </Link>
            <Link
              href="/sign-in"
              className="nav-link hidden sm:inline-flex items-center text-xs font-semibold text-slate-700 hover:text-slate-900 transition-colors px-2 py-1"
            >
              Sign In
            </Link>
            <Link
              href="/console"
              className="inline-flex items-center px-4 py-2 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs hover:shadow-sm transition-all"
            >
              <span>Console</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="site-main">{children}</main>

      {/* Enterprise Global Footer */}
      <footer className="site-footer">
        <div className="wrap footer-grid">
          {/* Column 1: Brand & Status */}
          <div className="footer-col-brand">
            <Link className="wordmark" href="/">
              <span className="wordmark-text">
                <span className="wordmark-axiom">AXIOM</span>
                <span className="wordmark-nhi"> NHI</span>
              </span>
            </Link>
            <p className="footer-mission">
              Runtime identity binding, AST-level argument validation, and Cedar policy enforcement for non-human agent execution.
            </p>
            <div className="footer-uptime-badge">
              <span className="uptime-dot" />
              <span>All Systems Operational • P99 &lt; 3.5ms</span>
            </div>
          </div>

          {/* Column 2: Architecture & Platform */}
          <div className="footer-col">
            <h4>Architecture</h4>
            <nav aria-label="Architecture links">
              <Link href="/platform">Platform Overview</Link>
              <Link href="/integrations">Integrations (24)</Link>
              <Link href="/compare">Competitor Compare</Link>
              <Link href="/playground">Policy Playground</Link>
              <Link href="/benchmarks">Sub-ms Benchmarks</Link>
              <Link href="/pricing">Pricing ($0 Discovery)</Link>
            </nav>
          </div>

          {/* Column 3: Tools & Resources */}
          <div className="footer-col">
            <h4>Resources</h4>
            <nav aria-label="Resources links">
              <Link href="/shadow-audit">30-Min Shadow Audit</Link>
              <Link href="/resources">Playbooks &amp; RFCs</Link>
              <Link href="/changelog">Changelog (G1–G4)</Link>
              <Link href="/docs">Developer Docs</Link>
              <Link href="/console">Operator Console</Link>
              <a href="https://github.com/GurnoorBagga17/New" target="_blank" rel="noreferrer">
                GitHub Repository ↗
              </a>
            </nav>
          </div>

          {/* Column 4: Trust & Legal */}
          <div className="footer-col">
            <h4>Trust &amp; Governance</h4>
            <nav aria-label="Trust and governance links">
              <Link href="/trust">Trust Center &amp; AI-BOM</Link>
              <Link href="/about">About &amp; Open Core</Link>
              <Link href="/security">Security Disclosures</Link>
              <Link href="/privacy">Privacy Policy</Link>
              <Link href="/terms">Terms of Service</Link>
              <Link href="/contact">Talk to Engineer</Link>
            </nav>
          </div>
        </div>

        <div className="wrap footer-bottom-row">
          <div className="footer-copyright">
            © {new Date().getFullYear()} Axiom NHI Project. Distributed under the Apache-2.0 License.
          </div>
          <div className="footer-legal-links">
            <Link href="/security">Security</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/trust">Trust</Link>
            <Link href="/contact">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
