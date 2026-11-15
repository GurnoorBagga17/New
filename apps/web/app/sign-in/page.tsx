// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { IconShieldCheck, IconLock, IconArrowRight, LogoOkta } from "../components/Icons";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setStatus(`Connecting to enterprise IdP session for ${email}...`);
      setTimeout(() => {
        window.location.href = "http://localhost:5173"; // Route to Gateway Console UI
      }, 700);
    }, 400);
  }

  return (
    <main className="auth-page-wrap">
      <div className="auth-card">
        <div className="auth-card-top">
          <Link href="/" className="auth-back-link">
            &larr; Back to Axiom NHI
          </Link>
          <div className="auth-brand-badge">
            <IconShieldCheck size={28} color="#00E5FF" />
            <span className="auth-brand-text">AXIOM CONTROL PLANE</span>
          </div>
          <h1>Sign In</h1>
          <p className="auth-subtitle">
            Access your autonomous agent governance dashboard, Cedar policies, and live audit telemetry.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label htmlFor="sign-in-email">Work Email</label>
            <input
              id="sign-in-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="architect@company.com"
              className="auth-input"
            />
          </div>

          <div className="auth-field">
            <div className="auth-field-row">
              <label htmlFor="sign-in-password">Master Key / Password</label>
              <a href="#reset" className="auth-forgot-link">Forgot?</a>
            </div>
            <input
              id="sign-in-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="auth-input"
            />
          </div>

          <button type="submit" disabled={isSubmitting} className="auth-submit-btn">
            <span>
              {isSubmitting ? "Authenticating..." : (
                <span className="btn-flex-inner">
                  Sign In to Console <IconArrowRight size={15} />
                </span>
              )}
            </span>
          </button>
        </form>

        {status && <div className="auth-status-msg">{status}</div>}

        <div className="auth-divider">
          <span>OR ENTERPRISE FEDERATION</span>
        </div>

        <div className="auth-sso-buttons">
          <button
            type="button"
            className="auth-sso-btn"
            onClick={() => {
              setStatus("Initiating Okta SAML 2.0 / OIDC assertion...");
              setTimeout(() => { window.location.href = "http://localhost:5173"; }, 600);
            }}
          >
            <LogoOkta size={18} />
            <span>Sign In with Okta / SAML 2.0</span>
          </button>
        </div>

        <div className="auth-card-footer">
          <p>
            No workspace yet?{" "}
            <Link href="/sign-up" className="auth-accent-link">
              Create free workspace &rarr;
            </Link>
          </p>
          <div className="auth-security-note">
            <IconLock size={12} color="#64748B" />
            <span>FIPS 140-3 and SOC 2 Type II attestation enforced.</span>
          </div>
        </div>
      </div>
    </main>
  );
}
