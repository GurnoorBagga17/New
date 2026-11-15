"use client";

import React, { useMemo } from "react";

export function EnclaveVisual() {
  const svgHtml = useMemo(() => {
    const S = 0.866, H = 0.5; // isometric 30° projection
    const CX = 200, CY = 350; // screen origin of the scene
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
        ? `matrix(${S},${-H},0,1,${x.toFixed(1)},${y.toFixed(1)})`
        : `matrix(${S},${H},0,1,${x.toFixed(1)},${y.toFixed(1)})`;
    };

    // geometry
    const BU = 260, BV = 380, BH = 190; // glass box size
    const A = -50, B = 310, C = -50, D = 430, T = 26; // pedestal

    let s = "";
    s += `
    <defs>
      <radialGradient id="enc-bg" cx="50%" cy="45%" r="55%">
        <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="#22d3ee" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="enc-glass" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#7dd3fc" stop-opacity="0.24"/>
        <stop offset="100%" stop-color="#0f172a" stop-opacity="0.18"/>
      </linearGradient>
      <linearGradient id="enc-glass-v" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#a78bfa" stop-opacity="0.24"/>
        <stop offset="100%" stop-color="#0f172a" stop-opacity="0.25"/>
      </linearGradient>
      <linearGradient id="enc-ped-top" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#24334a"/><stop offset="100%" stop-color="#121b29"/>
      </linearGradient>
      <linearGradient id="enc-shield" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#fb7185"/>
        <stop offset="55%" stop-color="#e11d48"/>
        <stop offset="100%" stop-color="#9f1239"/>
      </linearGradient>
      <filter id="enc-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"/></filter>
      <filter id="enc-blur-s" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
      <marker id="enc-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerUnits="userSpaceOnUse"
              markerWidth="26" markerHeight="26" orient="auto">
        <path d="M0,0 L10,5 L0,10 z" fill="#67e8f9"/>
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
        const baseOpacity = Math.max(0.12, Math.min(0.5, 1 - distFromCenter / 580));
        const dotRadius = ringIdx % 3 === 0 ? "1.6" : "1.2";

        s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${dotRadius}" fill="#22d3ee" opacity="${baseOpacity.toFixed(2)}" />`;
      }
      s += `</g>`;
    });
    s += `</g></g>`;

    s += `<g class="enc-float">`;

    // ---- pedestal underglow reflection ----
    s += `<ellipse cx="440" cy="535" rx="320" ry="110" fill="rgba(34,211,238,0.18)" filter="url(#enc-blur)"/>`;

    // ---- pedestal ----
    s += poly(
      [P(A, C, 0), P(A, D, 0), P(A, D, -T), P(A, C, -T)],
      'fill="#111827" stroke="rgba(56,189,248,0.35)" stroke-width="1.2"'
    );
    s += poly(
      [P(A, D, 0), P(B, D, 0), P(B, D, -T), P(A, D, -T)],
      'fill="#0e1726" stroke="rgba(56,189,248,0.35)" stroke-width="1.2"'
    );
    s += poly(
      [P(A, C, 0), P(B, C, 0), P(B, D, 0), P(A, D, 0)],
      'fill="url(#enc-ped-top)" stroke="rgba(56,189,248,0.55)" stroke-width="1.4"'
    );

    // ---- glass box: floor + back walls ----
    s += poly(
      [P(0, 0, 0), P(BU, 0, 0), P(BU, BV, 0), P(0, BV, 0)],
      'fill="rgba(8,47,73,0.45)" stroke="rgba(125,211,252,0.25)"'
    );
    s += poly(
      [P(BU, 0, 0), P(BU, BV, 0), P(BU, BV, BH), P(BU, 0, BH)],
      'fill="rgba(148,163,184,0.07)" stroke="rgba(190,230,255,0.35)"'
    );
    s += poly(
      [P(0, 0, 0), P(BU, 0, 0), P(BU, 0, BH), P(0, 0, BH)],
      'fill="rgba(148,163,184,0.07)" stroke="rgba(190,230,255,0.35)"'
    );

    // ---- beams (glow, core, highlight) ----
    const beamU = [85, 145],
      beamZ = 80,
      v0 = 12,
      v1 = 286;

    s += `<g filter="url(#enc-blur)" opacity=".75">`;
    beamU.forEach((u) => {
      const a = P(u, v0, beamZ),
        b = P(u, v1, beamZ);
      s += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#22d3ee" stroke-width="22" stroke-linecap="round"/>`;
    });
    s += `</g>`;

    beamU.forEach((u) => {
      const a = P(u, v0, beamZ),
        b = P(u, v1, beamZ);
      s += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#22d3ee" stroke-width="10" stroke-linecap="round" opacity=".85" marker-end="url(#enc-arrow)"/>`;
      s += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#cffafe" stroke-width="3" stroke-linecap="round" opacity=".9"/>`;
    });

    // ---- three glass gates ----
    const panes = [
      {
        v: 90,
        lines: ["Identity Binding"],
        shape: "circle",
        fill: "url(#enc-glass)",
      },
      {
        v: 185,
        lines: ["Cedar Argument Gate"],
        shape: "square",
        fill: "url(#enc-glass)",
      },
      {
        v: 280,
        lines: ["OpenBao Ephemeral", "Vault"],
        shape: "circle",
        fill: "url(#enc-glass-v)",
      },
    ];

    const u0 = 25,
      W = 210,
      PH = 160,
      ztop = 170;

    panes.forEach((p) => {
      s += `<g transform="${mat(u0, p.v, ztop, "u")}">`;
      s += `<rect width="${W}" height="${PH}" rx="4" fill="${p.fill}" stroke="rgba(150,220,255,0.6)" stroke-width="1.2"/>`;
      p.lines.forEach((t, i) => {
        s += `<text x="16" y="${
          26 + i * 19
        }" fill="#e0f2fe" font-size="14.5" font-weight="600" font-family="'Space Grotesk',sans-serif">${t}</text>`;
      });
      [60, 120].forEach((x) => {
        const y = ztop - beamZ; // = 90
        if (p.shape === "circle") {
          s += `<circle cx="${x}" cy="${y}" r="20" fill="rgba(2,12,24,0.45)" stroke="rgba(190,235,255,0.75)" stroke-width="2"/>`;
          s += `<circle cx="${x}" cy="${y}" r="11" fill="none" stroke="rgba(103,232,249,0.7)" stroke-width="1.5"/>`;
        } else {
          s += `<rect x="${x - 17}" y="${
            y - 17
          }" width="34" height="34" rx="5" fill="rgba(2,12,24,0.45)" stroke="rgba(190,235,255,0.75)" stroke-width="2"/>`;
          s += `<rect x="${x - 8}" y="${
            y - 8
          }" width="16" height="16" rx="3" fill="none" stroke="rgba(103,232,249,0.7)" stroke-width="1.5"/>`;
        }
      });
      s += `</g>`;
    });

    // ---- moving data packets (on top of glass so they stay bright) ----
    beamU.forEach((u) => {
      const a = P(u, v0, beamZ),
        b = P(u, v1, beamZ);
      ["", "b2"].forEach((c) => {
        s += `<line class="enc-packet ${c}" pathLength="100" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#ffffff" stroke-width="8" stroke-linecap="round" style="filter:drop-shadow(0 0 8px #22d3ee)"/>`;
      });
    });

    // ---- red shield (extrusion + glow + face) ----
    const shieldPath =
      "M55 0 C75 12 95 14 110 14 L110 62 C110 96 84 118 55 125 C26 118 0 96 0 62 L0 14 C15 14 35 12 55 0 Z";
    s += `<g class="enc-shield-glow" filter="url(#enc-blur)" transform="${mat(
      60,
      294,
      150,
      "u"
    )}"><path d="${shieldPath}" fill="#fb2c55"/></g>`;
    s += `<g transform="${mat(
      60,
      283,
      150,
      "u"
    )}"><path d="${shieldPath}" fill="#7f1230" stroke="#be123c"/></g>`;
    s += `<g transform="${mat(60, 294, 150, "u")}">
            <path d="${shieldPath}" fill="url(#enc-shield)" stroke="#fda4af" stroke-width="1.5"/>
            <path d="M55 12 C70 22 88 26 98 26 L98 60 C98 86 78 104 55 112 Z" fill="rgba(255,255,255,0.18)"/>
          </g>`;

    // ---- SQL DROP TABLE attack bar ----
    s += `<g transform="${mat(125, 292, 52, "v")}"><g class="enc-sql">
            <rect x="0" y="0" width="150" height="24" rx="3" fill="rgba(76,5,25,0.95)" stroke="#fb7185" stroke-width="1.2" style="filter:drop-shadow(0 0 10px rgba(251,113,133,0.5))"/>
            <text x="75" y="17" text-anchor="middle" fill="#fecdd3" font-size="13" font-weight="700" letter-spacing="1" font-family="ui-monospace,Menlo,monospace">SQL DROP TABLE</text>
          </g></g>`;

    // ---- front glass faces + top ----
    s += poly(
      [P(0, 0, 0), P(0, BV, 0), P(0, BV, BH), P(0, 0, BH)],
      'fill="rgba(125,211,252,0.05)" stroke="rgba(190,230,255,0.55)" stroke-width="1.3"'
    );
    s += poly(
      [P(0, BV, 0), P(BU, BV, 0), P(BU, BV, BH), P(0, BV, BH)],
      'fill="rgba(125,211,252,0.05)" stroke="rgba(190,230,255,0.55)" stroke-width="1.3"'
    );
    s += poly(
      [P(0, 0, BH), P(BU, 0, BH), P(BU, BV, BH), P(0, BV, BH)],
      'fill="rgba(186,230,253,0.06)" stroke="rgba(190,230,255,0.6)" stroke-width="1.3"'
    );

    // ---- labels ----
    const [mx, my] = P(0, 60, 28);
    s += `<g transform="translate(${mx + 6},${my + 65})">
            <rect width="158" height="34" rx="6" fill="rgba(6,16,28,0.92)" stroke="#22d3ee" stroke-width="1.2" style="filter:drop-shadow(0 0 12px rgba(34,211,238,0.3))"/>
            <text x="79" y="22" text-anchor="middle" fill="#67e8f9" font-size="15" font-weight="600" font-family="'Space Grotesk',sans-serif">MCP data packets</text>
          </g>`;

    // BLOCKED • 3.1ms glowing status badge
    s += `<g class="enc-blocked" transform="translate(680,340)">
            <rect width="176" height="38" rx="19" fill="rgba(24,4,12,0.94)" stroke="#fb7185" stroke-width="1.5" style="filter:drop-shadow(0 0 16px rgba(251,44,85,0.6))"/>
            <circle cx="22" cy="19" r="4.5" fill="#f43f5e" style="filter:drop-shadow(0 0 6px #fb2c55)"/>
            <text x="100" y="24" text-anchor="middle" fill="#ffe4e6" font-size="13.5" font-weight="700" letter-spacing="0.5px" font-family="'JetBrains Mono',ui-monospace,Menlo,monospace">BLOCKED • 3.1ms</text>
          </g>`;

    // Pedestal brand label
    s += `<g transform="${mat(-34, 95, 10, "v")}">
            <rect width="270" height="34" rx="6" fill="rgba(9,15,24,0.94)" stroke="rgba(148,163,184,0.35)"/>
            <text x="135" y="23" text-anchor="middle" fill="#e2e8f0" font-size="17" font-weight="600" font-family="'Space Grotesk',sans-serif">The Inline Agent Enclave</text>
          </g>`;

    s += `</g>`;

    return `<svg viewBox="0 0 880 650" role="img" aria-label="The Inline Agent Enclave">${s}</svg>`;
  }, []);

  return (
    <div id="axiom-enclave" dangerouslySetInnerHTML={{ __html: svgHtml }} />
  );
}
