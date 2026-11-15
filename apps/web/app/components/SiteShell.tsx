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
          <Link href="/docs#quickstart" className="announcement-link">
            Explore Architecture <span aria-hidden="true">→</span>
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
                  stroke="rgb(0, 229, 255)"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  fill="rgba(0, 229, 255, 0.08)"
                />
                <polygon
                  points="16,11 23,23 9,23"
                  stroke="rgb(0, 229, 255)"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  fill="rgba(9, 13, 20, 0.9)"
                />
                <line x1="16" y1="3" x2="16" y2="11" stroke="rgb(0, 229, 255)" strokeWidth="1.5" />
                <line x1="29" y1="26" x2="23" y2="23" stroke="rgb(0, 229, 255)" strokeWidth="1.5" />
                <line x1="3" y1="26" x2="9" y2="23" stroke="rgb(0, 229, 255)" strokeWidth="1.5" />
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
            <Link href="/playground" className="nav-link">Playground</Link>
            <Link href="/benchmarks" className="nav-link">Benchmarks</Link>
            <Link href="/docs" className="nav-link">Docs</Link>
            <a
              href="https://github.com/axiom-nhi/axiom-nhi"
              target="_blank"
              rel="noreferrer"
              className="nav-link nav-github"
            >
              <span>GitHub</span>
              <span className="github-repo-pill">Repository</span>
            </a>
          </nav>

          {/* Right Action Button */}
          <div className="header-actions">
            <Link href="/docs#quickstart" className="deploy-button">
              <span>Deploy in 5 Min</span>
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

          {/* Column 2: Architecture */}
          <div className="footer-col">
            <h4>Architecture</h4>
            <nav aria-label="Architecture links">
              <Link href="/docs#identity">Identity Binding</Link>
              <Link href="/docs#cedar">Cedar Policy Gate</Link>
              <Link href="/docs#vault">OpenBao Ephemeral Vault</Link>
              <Link href="/docs#audit">Zero-Knowledge Audit</Link>
            </nav>
          </div>

          {/* Column 3: Resources */}
          <div className="footer-col">
            <h4>Developers</h4>
            <nav aria-label="Developer links">
              <Link href="/playground">Policy Playground</Link>
              <Link href="/docs#quickstart">Docker Quickstart</Link>
              <Link href="/benchmarks">Sub-ms Benchmarks</Link>
              <a href="https://github.com/axiom-nhi/axiom-nhi" target="_blank" rel="noreferrer">
                GitHub Repository ↗
              </a>
            </nav>
          </div>

          {/* Column 4: Compliance & Trust */}
          <div className="footer-col">
            <h4>Security &amp; Trust</h4>
            <nav aria-label="Security links">
              <span className="footer-pill-item">OAuth 2.1 RFC 8707</span>
              <span className="footer-pill-item">SPIFFE / SPIRE Attestation</span>
              <span className="footer-pill-item">Fail-Closed Guarantee</span>
              <span className="footer-pill-item">Apache 2.0 Open Source</span>
            </nav>
          </div>
        </div>

        <div className="wrap footer-bottom-row">
          <div className="footer-copyright">
            © {new Date().getFullYear()} Axiom NHI Project. Distributed under the Apache-2.0 License.
          </div>
          <div className="footer-legal-links">
            <Link href="/docs">Security Disclosures</Link>
            <Link href="/docs">Privacy</Link>
            <Link href="/docs">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
