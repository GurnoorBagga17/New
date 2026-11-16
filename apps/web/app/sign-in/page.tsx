// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { IconShieldCheck, IconLock, IconArrowRight, LogoOkta } from "../components/Icons";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStatus("Sign-in is a design preview. Identity provider integration is not connected.");
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
            Sign in to access workspace identity and runtime activity.
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

          <button type="submit" className="auth-submit-btn">
            <span>
              <span className="btn-flex-inner">Sign In to Console <IconArrowRight size={15} /></span>
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
            disabled
          >
            <LogoOkta size={18} />
            <span>Enterprise SSO · not connected</span>
          </button>
        </div>

        <div className="auth-card-footer">
          <p>
            No workspace yet?{" "}
            <Link href="/sign-up" className="auth-accent-link">
              Create a workspace &rarr;
            </Link>
          </p>
          <div className="auth-security-note">
            <IconLock size={12} color="var(--text-muted)" />
            <span>Preview state · identity provider is not connected.</span>
          </div>
        </div>
      </div>
    </main>
  );
}
