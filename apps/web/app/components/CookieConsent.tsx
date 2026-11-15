// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
"use client";

import React, { useEffect, useState } from "react";
import { IconShieldCheck } from "./Icons";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem("axiom_cookies")) {
        setVisible(true);
      }
    } catch {
      setVisible(true);
    }
  }, []);

  function save(mode: "all" | "necessary") {
    try {
      localStorage.setItem("axiom_cookies", mode);
    } catch {}
    document.cookie = `axiom_consent=${mode}; path=/; max-age=31536000; SameSite=Lax; Secure`;
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <aside
      className="cookie-consent-banner"
      role="region"
      aria-label="Privacy & Cookie Preferences"
    >
      <div className="cookie-consent-inner">
        <div className="cookie-icon-wrap">
          <IconShieldCheck size={18} color="#00E5FF" />
        </div>
        <div className="cookie-content">
          <p className="cookie-title">Zero Third-Party Tracking</p>
          <p className="cookie-desc">
            We use strictly necessary cryptographic session tokens and optional privacy-first telemetry to operate the Axiom NHI gateway.
          </p>
        </div>
        <div className="cookie-actions">
          <button
            type="button"
            onClick={() => save("necessary")}
            className="cookie-btn cookie-btn-subtle"
          >
            Essential Only
          </button>
          <button
            type="button"
            onClick={() => save("all")}
            className="cookie-btn cookie-btn-primary"
          >
            Accept All
          </button>
        </div>
      </div>
    </aside>
  );
}
