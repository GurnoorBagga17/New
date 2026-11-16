"use client";

import React, { useState, useMemo } from "react";

type Scenario = "sql" | "select" | "path" | "killswitch";

interface ScenarioConfig {
  id: Scenario;
  label: string;
  verdict: "DENY" | "ALLOW" | "REVOKED";
  verdictSymbol: string;
  verdictColor: string;
  attackText: string;
  badgeText: string;
  badgeSubtext: string;
  leaseBadge?: string;
  blockedAtGate: number; // 0 = not blocked, 1 = Gate 1, 2 = Gate 2, 3 = Gate 3
}

const SCENARIOS: Record<Scenario, ScenarioConfig> = {
  sql: {
    id: "sql",
    label: "1. SQL DROP Injection",
    verdict: "DENY",
    verdictSymbol: "✕",
    verdictColor: "rgb(220, 38, 38)",
    attackText: "SQL DROP TABLE customer_records",
    badgeText: "✕ BLOCKED FAIL-CLOSED • 1.4ms",
    badgeSubtext: "ExtMCP AST Verifier rejected destructive DDL",
    blockedAtGate: 2,
  },
  select: {
    id: "select",
    label: "2. Read-Only SELECT",
    verdict: "ALLOW",
    verdictSymbol: "✓",
    verdictColor: "rgb(5, 150, 105)",
    attackText: "SELECT * FROM analytics_q3 WHERE id = $1",
    badgeText: "✓ ALLOWED INLINE • 0.31ms",
    badgeSubtext: "Zero-Secret Ephemeral Lease Minted",
    leaseBadge: "vault://openbao/prod-db • TTL 240s",
    blockedAtGate: 0,
  },
  path: {
    id: "path",
    label: "3. Path Traversal",
    verdict: "DENY",
    verdictSymbol: "✕",
    verdictColor: "rgb(220, 38, 38)",
    attackText: "PATH ESCAPE: ../../../../etc/shadow",
    badgeText: "✕ BLOCKED: PATH ESCAPE • 0.42ms",
    badgeSubtext: "ExtMCP Path Canonicalizer rejected breakout",
    blockedAtGate: 2,
  },
  killswitch: {
    id: "killswitch",
    label: "4. Causal Kill Switch",
    verdict: "REVOKED",
    verdictSymbol: "⏻",
    verdictColor: "rgb(217, 119, 6)",
    attackText: "EMERGENCY CAUSAL KILL SWITCH TRIGGERED",
    badgeText: "⏻ REVOKED: CAUSAL KILL SWITCH • 0.10ms",
    badgeSubtext: "Cluster-wide SpiceDB & OpenBao token invalidation",
    blockedAtGate: 1,
  },
};

export function EnclaveVisual() {
  const [activeScenario, setActiveScenario] = useState<Scenario>("sql");
  const current = SCENARIOS[activeScenario];

  const svgHtml = useMemo(() => {
    // 30° Isometric mathematical projection
    // cos(30°) = sqrt(3)/2 ≈ 0.866025, sin(30°) = 0.5
    const S = Math.cos(Math.PI / 6); // 0.8660254
    const H = Math.sin(Math.PI / 6); // 0.5
    const CX = 200, CY = 350; // screen origin of the 3D scene

    const P = (u: number, v: number, z: number): [number, number] => [
      CX + S * (u + v),
      CY + H * (v - u) - z,
    ];

    const pts = (a: [number, number][]) =>
      a.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
    const poly = (a: [number, number][], attrs: string) =>
      `<polygon points="${pts(a)}" ${attrs}/>`;

    // plane matrices: 'u' = plane spanned by u+z, 'v' = plane spanned by v+z
    const mat = (u: number, v: number, z: number, t: "u" | "v") => {
      const [x, y] = P(u, v, z);
      return t === "u"
        ? `matrix(${S.toFixed(4)},${(-H).toFixed(4)},0,1,${x.toFixed(1)},${y.toFixed(1)})`
        : `matrix(${S.toFixed(4)},${H.toFixed(4)},0,1,${x.toFixed(1)},${y.toFixed(1)})`;
    };

    // Geometry parameters
    const BU = 260, BV = 380, BH = 190; // glass box bounding dimensions
    const A = -50, B = 310, C = -50, D = 430, T = 26; // architectural pedestal
    const beamU = [85, 145];
    const beamZ = 80;
    const v0 = 12;

    // Determine beam endpoint based on active scenario
    let v1 = 286;
    if (current.blockedAtGate === 1) {
      v1 = 88; // Blocked at Gate 1 perimeter
    } else if (current.blockedAtGate === 2) {
      v1 = 182; // Blocked at Gate 2 AST shield
    } else {
      v1 = 340; // Traverses all gates to target DB
    }

    // Colors according to verdict
    const isAllowed = current.verdict === "ALLOW";
    const isRevoked = current.verdict === "REVOKED";
    const beamColor = isAllowed
      ? "rgb(5, 150, 105)"
      : isRevoked
      ? "rgb(217, 119, 6)"
      : "rgb(220, 38, 38)";
    const beamCoreColor = isAllowed
      ? "rgb(167, 243, 208)"
      : isRevoked
      ? "rgb(254, 215, 170)"
      : "rgb(254, 205, 211)";

    let s = "";
    s += `
    <defs>
      <radialGradient id="enc-bg" cx="50%" cy="45%" r="55%">
        <stop offset="0%" stop-color="rgb(2, 132, 199)" stop-opacity="0.16"/>
        <stop offset="60%" stop-color="rgb(79, 70, 229)" stop-opacity="0.06"/>
        <stop offset="100%" stop-color="rgb(248, 250, 252)" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="enc-glass-crystal" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(255, 255, 255, 0.94)"/>
        <stop offset="100%" stop-color="rgba(241, 245, 249, 0.82)"/>
      </linearGradient>
      <linearGradient id="enc-ped-top" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="rgb(248, 250, 252)"/><stop offset="100%" stop-color="rgb(226, 232, 240)"/>
      </linearGradient>
      <linearGradient id="enc-shield-crimson" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="rgb(239, 68, 68)"/>
        <stop offset="55%" stop-color="rgb(220, 38, 38)"/>
        <stop offset="100%" stop-color="rgb(153, 27, 27)"/>
      </linearGradient>
      <linearGradient id="enc-shield-amber" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="rgb(245, 158, 11)"/>
        <stop offset="55%" stop-color="rgb(217, 119, 6)"/>
        <stop offset="100%" stop-color="rgb(180, 83, 9)"/>
      </linearGradient>
      <filter id="enc-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"/></filter>
      <filter id="enc-blur-s" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
      <marker id="enc-arrow-emerald" viewBox="0 0 10 10" refX="5" refY="5" markerUnits="userSpaceOnUse"
              markerWidth="24" markerHeight="24" orient="auto">
        <path d="M0,0 L10,5 L0,10 z" fill="rgb(5, 150, 105)"/>
      </marker>
      <marker id="enc-arrow-crimson" viewBox="0 0 10 10" refX="5" refY="5" markerUnits="userSpaceOnUse"
              markerWidth="24" markerHeight="24" orient="auto">
        <path d="M0,0 L10,5 L0,10 z" fill="rgb(220, 38, 38)"/>
      </marker>
    </defs>
    <ellipse cx="470" cy="330" rx="420" ry="250" fill="url(#enc-bg)"/>`;

    // ---- background moving concentric isometric dots ----
    const dotCX = 440, dotCY = 330;
    const rings = [130, 170, 210, 250, 290, 335, 380, 430, 485, 545, 610];
    s += `<g class="enc-dots-layer">`;
    s += `<g class="enc-dots-orbit">`;
    rings.forEach((r, ringIdx) => {
      const ry = r * 0.5; // exact isometric compression
      const dotCount = Math.floor((2 * Math.PI * r) / 22);
      const waveDelay = (ringIdx * 0.32).toFixed(2);

      s += `<g class="enc-dot-ring enc-ring-${ringIdx % 4}" style="animation-delay: -${waveDelay}s">`;
      for (let i = 0; i < dotCount; i++) {
        const angle = (i / dotCount) * 2 * Math.PI;
        const x = dotCX + r * Math.cos(angle);
        const y = dotCY + ry * Math.sin(angle);
        if (x < -20 || x > 900 || y < -20 || y > 680) continue;

        const distFromCenter = Math.hypot(x - dotCX, (y - dotCY) / 0.5);
        const baseOpacity = Math.max(0.12, Math.min(0.45, 1 - distFromCenter / 580));
        const dotRadius = ringIdx % 3 === 0 ? "1.6" : "1.2";

        s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${dotRadius}" fill="rgb(2, 132, 199)" opacity="${baseOpacity.toFixed(2)}" />`;
      }
      s += `</g>`;
    });
    s += `</g></g>`;

    s += `<g class="enc-float">`;

    // ---- pedestal underglow reflection ----
    s += `<ellipse cx="440" cy="535" rx="320" ry="110" fill="rgba(2, 132, 199, 0.12)" filter="url(#enc-blur)"/>`;

    // ---- architectural pedestal ----
    s += poly(
      [P(A, C, 0), P(A, D, 0), P(A, D, -T), P(A, C, -T)],
      'fill="rgb(203, 213, 225)" stroke="rgba(2, 132, 199, 0.3)" stroke-width="1.2"'
    );
    s += poly(
      [P(A, D, 0), P(B, D, 0), P(B, D, -T), P(A, D, -T)],
      'fill="rgb(148, 163, 184)" stroke="rgba(2, 132, 199, 0.3)" stroke-width="1.2"'
    );
    s += poly(
      [P(A, C, 0), P(B, C, 0), P(B, D, 0), P(A, D, 0)],
      'fill="url(#enc-ped-top)" stroke="rgba(2, 132, 199, 0.5)" stroke-width="1.4"'
    );

    // ---- glass box: floor + back walls ----
    s += poly(
      [P(0, 0, 0), P(BU, 0, 0), P(BU, BV, 0), P(0, BV, 0)],
      'fill="rgba(241, 245, 249, 0.75)" stroke="rgba(2, 132, 199, 0.2)"'
    );
    s += poly(
      [P(BU, 0, 0), P(BU, BV, 0), P(BU, BV, BH), P(BU, 0, BH)],
      'fill="rgba(248, 250, 252, 0.3)" stroke="rgba(148, 163, 184, 0.3)"'
    );
    s += poly(
      [P(0, 0, 0), P(BU, 0, 0), P(BU, 0, BH), P(0, 0, BH)],
      'fill="rgba(248, 250, 252, 0.3)" stroke="rgba(148, 163, 184, 0.3)"'
    );

    // ---- beams (glow, core, highlight) ----
    s += `<g filter="url(#enc-blur)" opacity=".65">`;
    beamU.forEach((u) => {
      const a = P(u, v0, beamZ);
      const b = P(u, v1, beamZ);
      s += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${beamColor}" stroke-width="20" stroke-linecap="round"/>`;
    });
    s += `</g>`;

    const arrowMarker = isAllowed ? "url(#enc-arrow-emerald)" : "url(#enc-arrow-crimson)";
    beamU.forEach((u) => {
      const a = P(u, v0, beamZ);
      const b = P(u, v1, beamZ);
      s += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${beamColor}" stroke-width="8" stroke-linecap="round" opacity=".9" marker-end="${arrowMarker}"/>`;
      s += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${beamCoreColor}" stroke-width="2.5" stroke-linecap="round" opacity=".95"/>`;
    });

    // ---- Three Crystal-Light Frosted Glass Gates ----
    const gates = [
      {
        v: 90,
        gateNum: "GATE 1",
        title: "OAuth 2.1 CIMD",
        subtitle: "RFC 8707 Token Exchange",
        borderColor: "rgb(2, 132, 199)",
        badgeColor: "rgba(2, 132, 199, 0.12)",
      },
      {
        v: 185,
        gateNum: "GATE 2",
        title: "Cedar + AST Guard",
        subtitle: "SQL / Path / Egress Guard",
        borderColor: "rgb(79, 70, 229)",
        badgeColor: "rgba(79, 70, 229, 0.12)",
      },
      {
        v: 280,
        gateNum: "GATE 3",
        title: "OpenBao Vault Lease",
        subtitle: "Ephemeral Dynamic Token",
        borderColor: "rgb(5, 150, 105)",
        badgeColor: "rgba(5, 150, 105, 0.12)",
      },
    ];

    const u0 = 25, W = 210, PH = 160, ztop = 170;

    gates.forEach((gate, gIdx) => {
      s += `<g transform="${mat(u0, gate.v, ztop, "u")}">`;
      // Crystal-white frosted glass card with laser-etched rim
      s += `<rect width="${W}" height="${PH}" rx="6" fill="url(#enc-glass-crystal)" stroke="${gate.borderColor}" stroke-width="1.5" style="filter:drop-shadow(0 2px 8px rgba(15, 23, 42, 0.08))"/>`;
      
      // Top gate index pill
      s += `<rect x="14" y="12" width="56" height="18" rx="3" fill="${gate.badgeColor}"/>`;
      s += `<text x="42" y="24.5" text-anchor="middle" fill="${gate.borderColor}" font-size="10.5" font-weight="700" font-family="'JetBrains Mono',monospace" letter-spacing="0.8px">${gate.gateNum}</text>`;

      // Gate titles
      s += `<text x="14" y="46" fill="rgb(15, 23, 42)" font-size="14.5" font-weight="700" font-family="'Space Grotesk',sans-serif">${gate.title}</text>`;
      s += `<text x="14" y="63" fill="rgb(100, 116, 139)" font-size="11" font-weight="500" font-family="'Inter',sans-serif">${gate.subtitle}</text>`;

      // Portals
      [60, 120].forEach((x) => {
        const y = ztop - beamZ; // 90
        s += `<circle cx="${x}" cy="${y}" r="22" fill="rgba(241, 245, 249, 0.85)" stroke="${gate.borderColor}" stroke-width="1.8"/>`;
        s += `<circle cx="${x}" cy="${y}" r="12" fill="none" stroke="${gate.borderColor}" stroke-width="1.2" stroke-dasharray="3 3"/>`;
      });

      // Gate status indicator
      const isThisGateBlocking = current.blockedAtGate === gIdx + 1;
      if (isThisGateBlocking) {
        s += `<circle cx="${W - 20}" cy="21" r="5" fill="rgb(220, 38, 38)"/>`;
      } else if (isAllowed || current.blockedAtGate > gIdx + 1) {
        s += `<circle cx="${W - 20}" cy="21" r="5" fill="rgb(5, 150, 105)"/>`;
      } else {
        s += `<circle cx="${W - 20}" cy="21" r="5" fill="rgb(203, 213, 225)"/>`;
      }

      s += `</g>`;
    });

    // ---- Moving Data Packets ----
    beamU.forEach((u) => {
      const a = P(u, v0, beamZ);
      const b = P(u, v1, beamZ);
      const packetShadow = isAllowed ? "rgba(5, 150, 105, 0.6)" : "rgba(220, 38, 38, 0.6)";
      s += `<line class="enc-packet" pathLength="100" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="rgb(255, 255, 255)" stroke-width="7" stroke-linecap="round" style="filter:drop-shadow(0 0 6px ${packetShadow})"/>`;
    });

    // ---- Extruded 3D Crimson Hexagonal Shield on Active Attack ----
    if (current.blockedAtGate > 0) {
      const shieldGateV = current.blockedAtGate === 1 ? 95 : 190;
      const shieldGradient = isRevoked ? "url(#enc-shield-amber)" : "url(#enc-shield-crimson)";
      const shieldGlowColor = isRevoked ? "rgb(245, 158, 11)" : "rgb(239, 68, 68)";
      const shieldPath =
        "M55 0 C75 12 95 14 110 14 L110 62 C110 96 84 118 55 125 C26 118 0 96 0 62 L0 14 C15 14 35 12 55 0 Z";

      // Shockwave rings at impact
      const impactPoint = P(115, shieldGateV, beamZ);
      s += `<g class="enc-shockwave" transform="translate(${impactPoint[0]},${impactPoint[1]})">
              <ellipse cx="0" cy="0" rx="44" ry="22" fill="none" stroke="${shieldGlowColor}" stroke-width="2" opacity="0.8"/>
              <ellipse cx="0" cy="0" rx="72" ry="36" fill="none" stroke="${shieldGlowColor}" stroke-width="1.2" opacity="0.4"/>
            </g>`;

      // Extruded 3D shield rear depth
      s += `<g class="enc-shield-glow" filter="url(#enc-blur)" transform="${mat(60, shieldGateV + 10, 150, "u")}">
              <path d="${shieldPath}" fill="${shieldGlowColor}"/>
            </g>`;
      s += `<g transform="${mat(60, shieldGateV - 2, 150, "u")}">
              <path d="${shieldPath}" fill="rgb(127, 29, 29)" stroke="rgb(185, 28, 28)"/>
            </g>`;
      // 3D shield front face with crystal specular highlight
      s += `<g transform="${mat(60, shieldGateV + 8, 150, "u")}">
              <path d="${shieldPath}" fill="${shieldGradient}" stroke="rgb(254, 205, 211)" stroke-width="1.6"/>
              <path d="M55 12 C70 22 88 26 98 26 L98 60 C98 86 78 104 55 112 Z" fill="rgba(255,255,255,0.22)"/>
              <text x="55" y="72" text-anchor="middle" fill="rgb(255, 255, 255)" font-size="28" font-weight="800">${current.verdictSymbol}</text>
            </g>`;
    }

    // ---- Interactive Attack / Operation Bar ----
    const barBg = isAllowed ? "rgba(236, 253, 245, 0.95)" : isRevoked ? "rgba(254, 243, 199, 0.95)" : "rgba(254, 242, 242, 0.95)";
    const barBorder = isAllowed ? "rgb(5, 150, 105)" : isRevoked ? "rgb(217, 119, 6)" : "rgb(220, 38, 38)";
    const barText = isAllowed ? "rgb(4, 120, 87)" : isRevoked ? "rgb(180, 83, 9)" : "rgb(185, 28, 28)";

    s += `<g transform="${mat(115, 288, 48, "v")}">
            <rect x="0" y="0" width="220" height="28" rx="4" fill="${barBg}" stroke="${barBorder}" stroke-width="1.2" style="filter:drop-shadow(0 2px 8px rgba(15, 23, 42, 0.08))"/>
            <text x="110" y="19" text-anchor="middle" fill="${barText}" font-size="11.5" font-weight="700" letter-spacing="0.5px" font-family="'JetBrains Mono',monospace">${current.attackText.slice(0, 26)}</text>
          </g>`;

    // ---- Zero-Secret Lease Pill Injection (Allowed Scenario) ----
    if (current.leaseBadge) {
      s += `<g transform="${mat(115, 335, 96, "v")}">
              <rect x="0" y="0" width="224" height="28" rx="14" fill="rgb(236, 253, 245)" stroke="rgb(5, 150, 105)" stroke-width="1.4" style="filter:drop-shadow(0 2px 10px rgba(5, 150, 105, 0.25))"/>
              <text x="112" y="18.5" text-anchor="middle" fill="rgb(4, 120, 87)" font-size="11" font-weight="700" font-family="'JetBrains Mono',monospace">${current.leaseBadge}</text>
            </g>`;
    }

    // ---- Front glass faces + top edge specular highlights ----
    s += poly(
      [P(0, 0, 0), P(0, BV, 0), P(0, BV, BH), P(0, 0, BH)],
      'fill="rgba(255, 255, 255, 0.06)" stroke="rgba(2, 132, 199, 0.25)" stroke-width="1.2"'
    );
    s += poly(
      [P(0, BV, 0), P(BU, BV, 0), P(BU, BV, BH), P(0, BV, BH)],
      'fill="rgba(255, 255, 255, 0.06)" stroke="rgba(2, 132, 199, 0.25)" stroke-width="1.2"'
    );
    s += poly(
      [P(0, 0, BH), P(BU, 0, BH), P(BU, BV, BH), P(0, BV, BH)],
      'fill="rgba(255, 255, 255, 0.12)" stroke="rgba(255, 255, 255, 0.8)" stroke-width="1.5"'
    );

    // ---- Input workload label ----
    const [mx, my] = P(0, 60, 28);
    s += `<g transform="translate(${mx - 10},${my + 65})">
            <rect width="180" height="34" rx="6" fill="rgb(255, 255, 255)" stroke="rgb(2, 132, 199)" stroke-width="1.2" style="filter:drop-shadow(0 2px 10px rgba(15, 23, 42, 0.08))"/>
            <text x="90" y="22" text-anchor="middle" fill="rgb(15, 23, 42)" font-size="13" font-weight="600" font-family="'Space Grotesk',sans-serif">Autonomous AI Agent</text>
          </g>`;

    // ---- Dynamic Glowing Status Badge (Top-Right) ----
    const badgeFill = isAllowed ? "rgb(236, 253, 245)" : isRevoked ? "rgb(254, 243, 199)" : "rgb(254, 242, 242)";
    const badgeStroke = isAllowed ? "rgb(5, 150, 105)" : isRevoked ? "rgb(217, 119, 6)" : "rgb(220, 38, 38)";
    const badgeTextFill = isAllowed ? "rgb(4, 120, 87)" : isRevoked ? "rgb(180, 83, 9)" : "rgb(185, 28, 28)";

    s += `<g class="enc-status-badge" transform="translate(630, 290)">
            <rect width="232" height="42" rx="21" fill="${badgeFill}" stroke="${badgeStroke}" stroke-width="1.6" style="filter:drop-shadow(0 4px 14px rgba(15, 23, 42, 0.12))"/>
            <circle cx="24" cy="21" r="5" fill="${badgeStroke}"/>
            <text x="126" y="26" text-anchor="middle" fill="${badgeTextFill}" font-size="12.5" font-weight="700" letter-spacing="0.5px" font-family="'JetBrains Mono',monospace">${current.badgeText}</text>
          </g>`;

    // Pedestal brand label
    s += `<g transform="${mat(-34, 95, 10, "v")}">
            <rect width="280" height="34" rx="6" fill="rgb(255, 255, 255)" stroke="rgb(203, 213, 225)" stroke-width="1.2" style="filter:drop-shadow(0 2px 6px rgba(15, 23, 42, 0.05))"/>
            <text x="140" y="23" text-anchor="middle" fill="rgb(15, 23, 42)" font-size="15" font-weight="700" font-family="'Space Grotesk',sans-serif">The Inline Agent Enclave</text>
          </g>`;

    s += `</g>`;

    return `<svg viewBox="0 0 880 650" role="img" aria-label="The Inline Agent Enclave 30-degree isometric projection">${s}</svg>`;
  }, [current]);

  return (
    <div className="flex flex-col gap-4">
      {/* 30° Isometric 3D Enclave Canvas */}
      <div
        id="axiom-enclave"
        className="w-full relative rounded-2xl overflow-hidden bg-[var(--bg-canvas)] border border-[var(--border-subtle)] shadow-[0_1px_3px_rgba(15,23,42,0.04)]"
        dangerouslySetInnerHTML={{ __html: svgHtml }}
      />

      {/* Interactive 4-Scenario Control Strip (Audit Prompt Section 2.3 item 5) */}
      <div
        className="grid grid-cols-2 md:grid-cols-4 gap-2.5 p-2 rounded-xl bg-[var(--bg-surface-1)] border border-[var(--border-subtle)] shadow-xs"
        role="group"
        aria-label="Enclave Simulation Attack Scenarios"
      >
        {(Object.keys(SCENARIOS) as Scenario[]).map((scKey) => {
          const sc = SCENARIOS[scKey];
          const isActive = activeScenario === scKey;
          return (
            <button
              key={sc.id}
              type="button"
              onClick={() => setActiveScenario(sc.id)}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-cyan)] ${
                isActive
                  ? "bg-[var(--bg-surface-2)] text-[var(--text-primary)] border border-[var(--border-strong)] shadow-xs"
                  : "bg-transparent text-[var(--text-muted)] border border-transparent hover:text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)]"
              }`}
            >
              <span className="truncate">{sc.label}</span>
              <span
                className={`ml-2 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                  sc.verdict === "ALLOW"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : sc.verdict === "REVOKED"
                    ? "bg-amber-50 text-amber-700 border border-amber-200"
                    : "bg-rose-50 text-rose-700 border border-rose-200"
                }`}
              >
                {sc.verdictSymbol} {sc.verdict}
              </span>
            </button>
          );
        })}
      </div>

      {/* Live Scenario Diagnostic Banner */}
      <div className="flex items-center justify-between px-4 py-2 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] font-mono">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: current.verdictColor }} />
          <span className="font-semibold text-[var(--text-primary)]">{current.badgeText}</span>
          <span className="text-[var(--text-muted)] hidden sm:inline">• {current.badgeSubtext}</span>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
          Fail-Closed Hardware Boundary
        </span>
      </div>
    </div>
  );
}
