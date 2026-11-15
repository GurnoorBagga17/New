// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { IconShieldCheck, IconLock, IconArrowRight, LogoOkta } from "../components/Icons";

export default function SignUpPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !name) return;
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setStatus(`Workspace successfully provisioned for ${email}. Redirecting...`);
      setTimeout(() => {
        window.location.href = "http://localhost:5173"; // Route to Gateway Console UI
      }, 700);
    }, 450);
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
          <h1>Create Workspace</h1>
          <p className="auth-subtitle">
            Deploy your dedicated Axiom NHI tenant. Includes passive discovery forever and 5 free active agents.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label htmlFor="sign-up-name">Full Name</label>
            <input
              id="sign-up-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ada Lovelace"
              className="auth-input"
            />
          </div>

          <div className="auth-field">
            <label htmlFor="sign-up-email">Work Email</label>
            <input
              id="sign-up-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="architect@company.com"
              className="auth-input"
            />
          </div>

          <div className="auth-field">
            <label htmlFor="sign-up-password">Password (8+ characters)</label>
            <input
              id="sign-up-password"
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
              {isSubmitting ? "Provisioning..." : (
                <span className="btn-flex-inner">
                  Create Workspace <IconArrowRight size={15} />
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
            <span>Provision with Okta / SSO</span>
          </button>
        </div>

        <div className="auth-card-footer">
          <p>
            Already have an account?{" "}
            <Link href="/sign-in" className="auth-accent-link">
              Sign In &rarr;
            </Link>
          </p>
          <div className="auth-security-note">
            <IconLock size={12} color="#64748B" />
            <span>No credit card required. Free tier forever.</span>
          </div>
        </div>
      </div>
    </main>
  );
}
