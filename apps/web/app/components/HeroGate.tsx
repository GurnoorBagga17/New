// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
'use client';

import React, { useState, useEffect, useId } from 'react';
import Link from 'next/link';
import { HERO_COPY, GATE_SCENARIOS, type GateScenario } from '../content/landing';
import { QuickCopyCommand } from './QuickCopyCommand';
import { useReducedMotion } from '../lib/motion';

interface SystemTab {
  id: string;
  scenarioIdx: number;
  label: string;
}

const SYSTEM_TABS: SystemTab[] = [
  { id: 'all-systems', scenarioIdx: 0, label: 'All Systems' },
  { id: 'cloud-platforms', scenarioIdx: 1, label: 'Cloud Platforms' },
  { id: 'kubernetes-sandbox', scenarioIdx: 2, label: 'Kubernetes Sandbox' },
  { id: 'crypto-tool', scenarioIdx: 3, label: 'Cryptographic Tool' },
  { id: 'secure-active', scenarioIdx: 4, label: 'Secure Active Mode' },
  { id: 'trusted-model', scenarioIdx: 5, label: 'Trusted Model' },
];

function renderSystemTabIcon(id: string, isSelected: boolean) {
  const iconClass = `w-3.5 h-3.5 ${isSelected ? "text-indigo-600" : "text-slate-400"}`;
  switch (id) {
    case 'all-systems':
      return (
        <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    case 'cloud-platforms':
      return (
        <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
        </svg>
      );
    case 'kubernetes-sandbox':
      return (
        <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3v18M3 12h18M6.5 6.5l11 11M6.5 17.5l11-11" />
        </svg>
      );
    case 'crypto-tool':
      return (
        <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="8" />
          <path d="m10 15 5-3-5-3v6Z" fill="currentColor" />
        </svg>
      );
    case 'secure-active':
      return (
        <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <polyline points="9 12 11 14 15 10" />
        </svg>
      );
    case 'trusted-model':
    default:
      return (
        <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m21 16-9 5-9-5V8l9-5 9 5v8z" />
          <path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12" />
        </svg>
      );
  }
}

export function HeroGate() {
  const [currentIndex, setCurrentIndex] = useState(4); // Default to Secure Active Mode
  const [isPlaying, setIsPlaying] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [copiedPolicy, setCopiedPolicy] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const liveRegionId = useId();

  const activeScenario: GateScenario = GATE_SCENARIOS[currentIndex] ?? GATE_SCENARIOS[0]!;

  useEffect(() => {
    if (!isPlaying || isHovered || prefersReducedMotion) {
      return;
    }
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % GATE_SCENARIOS.length);
    }, 4600);
    return () => clearInterval(interval);
  }, [isPlaying, isHovered, prefersReducedMotion]);

  const handleCopyPolicy = () => {
    const textToCopy = activeScenario.cedarRule || `allow: ["read", "list", "search"]\ndeny: ["exec", "sudo", "write", "network"]`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedPolicy(true);
    setTimeout(() => setCopiedPolicy(false), 2000);
  };

  return (
    <section className="relative overflow-hidden pt-10 pb-16 lg:pt-14 lg:pb-24 bg-slate-50/50" aria-label="Axiom NHI overview and interactive gate demo">
      {/* Ethereal Ambient Background Lighting */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none -z-10" aria-hidden="true">
        {/* Soft Cyan Ambient Wash (Top-Left) */}
        <div className="absolute -top-32 -left-32 w-[520px] h-[520px] bg-gradient-to-br from-sky-200/50 via-cyan-100/30 to-transparent rounded-full blur-3xl" />
        {/* Soft Lavender / Indigo Wash (Center-Right) */}
        <div className="absolute top-8 -right-24 w-[600px] h-[600px] bg-gradient-to-bl from-indigo-100/60 via-purple-100/40 to-transparent rounded-full blur-3xl" />
        {/* Subtle Violet Wash (Bottom-Center) */}
        <div className="absolute -bottom-28 left-1/4 w-[480px] h-[480px] bg-gradient-to-t from-violet-100/40 via-blue-50/20 to-transparent rounded-full blur-3xl" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
          
          {/* ====================================================================
             LEFT COLUMN: Typography, Brand Accents, CTAs & Pillars
             ==================================================================== */}
          <div className="lg:col-span-5 flex flex-col justify-center">
            {/* Eyebrow Pill Badge */}
            <div className="inline-flex items-center gap-2 self-start px-3.5 py-1.5 rounded-full bg-blue-50/90 border border-blue-200/70 shadow-xs backdrop-blur-xs mb-6">
              <span className="w-5 h-5 rounded-full bg-blue-500/15 flex items-center justify-center text-blue-600 flex-shrink-0">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <polyline points="9 12 11 14 15 10" />
                </svg>
              </span>
              <span className="text-[11px] font-bold tracking-wider text-blue-700 uppercase font-sans">
                AI-POWERED IDENTITY SECURITY FOR AI
              </span>
            </div>

            {/* Main Headline with 5 ms Gradient & Brush Stroke Accent */}
            <h1 className="text-4xl sm:text-5xl lg:text-[54px] font-extrabold text-slate-900 tracking-[-0.035em] leading-[1.08] font-sans">
              Every AI agent<br />
              is an identity.<br />
              Govern what it<br />
              can do in under<br />
              <span className="relative inline-block mt-1">
                <span className="bg-gradient-to-r from-blue-700 via-indigo-600 to-violet-700 bg-clip-text text-transparent font-black">
                  5 ms.
                </span>
                {/* Curved Brush Underline */}
                <svg
                  className="absolute -bottom-2.5 left-0 w-full text-indigo-500/80 overflow-visible"
                  viewBox="0 0 160 14"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path
                    d="M3 10.5C38 3.5 102 2 157 11.5"
                    stroke="currentColor"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </h1>

            {/* Subheadline Paragraph */}
            <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-lg mt-6 font-normal">
              {HERO_COPY.subheadline}
            </p>

            {/* Action Buttons: Primary & Secondary (Guaranteed Brilliant White Text) */}
            <div className="flex flex-wrap items-center gap-3.5 mt-8">
              <Link
                href="/playground"
                className="hero-cta-primary px-7 py-3.5 rounded-full font-bold text-sm bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-900 hover:from-slate-900 hover:to-indigo-900 shadow-lg shadow-indigo-950/25 hover:shadow-indigo-500/30 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 flex items-center gap-2 group cursor-pointer border border-slate-800"
                style={{ color: 'rgb(255, 255, 255)', backgroundColor: 'rgb(15, 23, 42)' }}
              >
                <span className="text-white font-bold tracking-wide" style={{ color: 'rgb(255, 255, 255)' }}>
                  Try the Playground
                </span>
                <span aria-hidden="true" className="text-white group-hover:translate-x-1 transition-transform font-bold" style={{ color: 'rgb(255, 255, 255)' }}>
                  &rarr;
                </span>
              </Link>

              <a
                href="#talk-to-engineer"
                className="px-6 py-3.5 rounded-full font-semibold text-sm text-slate-700 bg-white hover:bg-slate-50 border border-slate-200/90 hover:border-slate-300 shadow-xs hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-2.5 cursor-pointer"
              >
                <span>Talk to an Engineer</span>
                {/* SVG Headset Icon (Replaces Emoji) */}
                <svg className="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                  <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
                </svg>
              </a>
            </div>

            {/* Three Value Proposition Pillars (Clean SVGs, Zero Emojis) */}
            <div className="flex flex-wrap items-center gap-6 mt-8 pt-5 border-t border-slate-200/70" aria-label="Axiom core pillars">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                  <svg className="w-3 h-3 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </span>
                <span>Agentic-First Security</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <span className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <svg className="w-3 h-3 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <polyline points="9 12 11 14 15 10" />
                  </svg>
                </span>
                <span>Real-Time Protection</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <span className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <svg className="w-3 h-3 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="3" y="12" width="4" height="8" rx="1" />
                    <rect x="10" y="8" width="4" height="12" rx="1" />
                    <rect x="17" y="4" width="4" height="16" rx="1" />
                  </svg>
                </span>
                <span>Built for Enterprise</span>
              </div>
            </div>

            {/* CLI Quickstart Bar */}
            <div className="mt-5">
              <QuickCopyCommand command={HERO_COPY.ctaSecondary.command} />
            </div>
          </div>

          {/* ====================================================================
             RIGHT COLUMN: The High-Fidelity Security Console Widget
             ==================================================================== */}
          <div className="lg:col-span-7 relative">
            
            {/* 3D Floating Element: Top-Right Glass Shield with Dynamic Specular Reflection */}
            <div className="absolute -top-7 -right-4 sm:-right-8 pointer-events-none z-20 hidden sm:block animate-float-slow" aria-hidden="true">
              <div className="relative w-16 h-18 sm:w-20 sm:h-22 rounded-2xl bg-gradient-to-br from-white/95 via-sky-50/80 to-indigo-100/60 backdrop-blur-md p-0.5 shadow-[0_18px_38px_rgba(79,70,229,0.18)] border border-white/80">
                <div className="w-full h-full rounded-[14px] flex items-center justify-center bg-gradient-to-br from-sky-400/10 via-indigo-400/10 to-transparent">
                  <svg className="w-8 h-8 text-blue-500 drop-shadow-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <polyline points="9 12 11 14 15 10" />
                  </svg>
                </div>
              </div>
            </div>

            {/* 3D Floating Element: Bottom-Right Frosted Isometric Prism */}
            <div className="absolute -bottom-7 right-6 sm:right-12 pointer-events-none z-20 hidden sm:block animate-float-reverse" aria-hidden="true">
              <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-white/95 via-indigo-50/90 to-purple-100/70 backdrop-blur-md p-1 shadow-[0_18px_40px_rgba(99,102,241,0.22)] border border-white/90 transform rotate-6">
                <div className="w-full h-full rounded-xl flex items-center justify-center bg-gradient-to-br from-indigo-500/10 to-purple-500/10">
                  <svg className="w-7 h-7 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Main Floating Console Window Card */}
            <div
              className="relative bg-white/95 backdrop-blur-md rounded-[28px] border border-slate-200/80 shadow-[0_22px_65px_-12px_rgba(99,102,241,0.14),0_8px_24px_-6px_rgba(15,23,42,0.04)] p-4 sm:p-6 transition-all duration-300"
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              onFocus={() => setIsHovered(true)}
              onBlur={() => setIsHovered(false)}
              role="region"
              aria-label="Axiom AI Layer Governance Gateway interactive demo"
            >
              {/* Window Header Bar */}
              <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
                {/* Left: macOS 3 Window Dots */}
                <div className="flex items-center gap-1.5" aria-hidden="true">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-xs inline-block" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-xs inline-block" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-xs inline-block" />
                </div>

                {/* Center: Title + Glyph */}
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded bg-indigo-600 text-white font-extrabold text-[10px] flex items-center justify-center leading-none">
                    A
                  </span>
                  <span className="text-[11.5px] font-bold text-slate-800 tracking-wider uppercase font-mono">
                    AXIOM: AI LAYER GOVERNANCE GATEWAY
                  </span>
                </div>

                {/* Right: Online Status & Pause/Play */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPlaying((p) => !p)}
                    className="px-2 py-0.5 rounded text-[10px] font-mono font-medium text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
                    title={isPlaying ? "Pause auto-rotation" : "Resume auto-rotation"}
                    aria-label={isPlaying ? "Pause auto-rotation" : "Resume auto-rotation"}
                  >
                    {isPlaying ? "PAUSE" : "PLAY"}
                  </button>

                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 text-[11px] font-semibold text-emerald-700">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    <span>Online</span>
                    <span className="text-[9px] text-emerald-600 leading-none">▼</span>
                  </div>
                </div>
              </div>

              {/* Accessible Live Region */}
              <div id={liveRegionId} className="sr-only" aria-live="polite" aria-atomic="true">
                Current scenario: {activeScenario.name}. Status: {activeScenario.verdict.toUpperCase()}. Tool: {activeScenario.tool}.
              </div>

              {/* Horizontal System Category Tabs */}
              <div className="flex items-center gap-2 overflow-x-auto py-3 scrollbar-none border-b border-slate-100" role="tablist" aria-label="Select governance module">
                {SYSTEM_TABS.map((tab) => {
                  const isSelected = currentIndex === tab.scenarioIdx;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      onClick={() => setCurrentIndex(tab.scenarioIdx)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200 cursor-pointer ${
                        isSelected
                          ? "bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-700 border border-indigo-200 shadow-xs ring-1 ring-indigo-200/50 scale-[1.02]"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent"
                      }`}
                    >
                      {renderSystemTabIcon(tab.id, isSelected)}
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Top 3 Telemetry Metric Cards with Active Animations */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-4">
                
                {/* Metric 1: Identity Overview */}
                <div className="bg-slate-50/70 hover:bg-slate-50 border border-slate-200/60 rounded-2xl p-3.5 flex flex-col justify-between transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="w-7 h-7 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </span>
                    <span className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider font-sans">
                      IDENTITY OVERVIEW
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between mt-2.5">
                    <span className="text-2xl font-black text-slate-900 font-sans tracking-tight">
                      2,847
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                        &uarr; 12%
                      </span>
                      {/* Animated Sparkline Curve with Glowing Coordinate */}
                      <div className="relative flex items-center">
                        <svg className="w-14 h-5 text-indigo-500 overflow-visible" viewBox="0 0 50 16" fill="none" aria-hidden="true">
                          <path
                            d="M2 12 C 12 14, 20 6, 28 8 C 36 10, 42 2, 48 3"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <span className="absolute right-0 top-0.5 flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-600" />
                        </span>
                      </div>
                    </div>
                  </div>

                  <span className="text-[11px] text-slate-500 font-medium mt-1">
                    AI Agents Detected
                  </span>
                </div>

                {/* Metric 2: Security Status */}
                <div className="bg-slate-50/70 hover:bg-slate-50 border border-slate-200/60 rounded-2xl p-3.5 flex flex-col justify-between transition-colors">
                  <div className="flex items-center justify-between">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center ${
                      activeScenario.verdict === 'permit' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                    }`}>
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                    </span>
                    <span className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider font-sans">
                      SECURITY STATUS
                    </span>
                  </div>

                  <div className="flex items-center justify-between mt-2.5">
                    <span className={`text-xl font-black font-sans tracking-tight transition-colors duration-200 ${
                      activeScenario.verdict === 'permit' ? 'text-emerald-600' : 'text-rose-600'
                    }`}>
                      {activeScenario.verdict === 'permit' ? 'All Safe' : '1 Blocked'}
                    </span>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                      activeScenario.verdict === 'permit' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                      {activeScenario.verdict === 'permit' ? '✓' : '✕'}
                    </span>
                  </div>

                  <span className="text-[11px] text-slate-500 font-medium mt-1">
                    {activeScenario.verdict === 'permit' ? 'No Critical Risks' : 'Inline AST Rule Enforced'}
                  </span>
                </div>

                {/* Metric 3: Response Time with Live Dancing Equalizer */}
                <div className="bg-slate-50/70 hover:bg-slate-50 border border-slate-200/60 rounded-2xl p-3.5 flex flex-col justify-between transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="w-7 h-7 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                      </svg>
                    </span>
                    <span className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider font-sans">
                      RESPONSE TIME
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between mt-2.5">
                    <span className="text-2xl font-black text-slate-900 font-sans tracking-tight">
                      {activeScenario.latencyDisplay || '5 ms'}
                    </span>
                    {/* Live Dancing Equalizer Bars */}
                    <div className="flex items-end gap-1 h-5" aria-hidden="true">
                      <span className="w-1.5 bg-emerald-400 rounded-xs animate-bar-1" />
                      <span className="w-1.5 bg-emerald-500 rounded-xs animate-bar-2" />
                      <span className="w-1.5 bg-emerald-500 rounded-xs animate-bar-3" />
                      <span className="w-1.5 bg-emerald-600 rounded-xs animate-bar-4" />
                    </div>
                  </div>

                  <span className="text-[11px] text-slate-500 font-medium mt-1">
                    Average Decision Time
                  </span>
                </div>

              </div>

              {/* Bottom Two Split Panels: Detected Threats & Core Policy (Animated Transitions) */}
              <div key={activeScenario.id} className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mb-4 animate-deck-slide">
                
                {/* Left Panel: Detected Threats */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex flex-col justify-between shadow-xs">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wide font-sans">
                      DETECTED THREATS
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold ${
                      activeScenario.verdict === 'deny'
                        ? 'bg-rose-50 text-rose-600 border border-rose-200'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      <span>{activeScenario.verdict === 'deny' ? 'Pending' : '0 Active'}</span>
                    </span>
                  </div>

                  {/* Soft Alert Banner */}
                  <div className="bg-rose-50/80 hover:bg-rose-50 border border-rose-100/90 rounded-xl p-3 flex items-center justify-between gap-2.5 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center flex-shrink-0">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                          <line x1="12" y1="9" x2="12" y2="13" />
                          <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                      </span>
                      <code className="font-mono text-xs text-rose-900 font-medium truncate">
                        {activeScenario.verdict === 'deny'
                          ? `'exec', 'sudo', 'rm', 'curl', 'write', 'open'`
                          : `'read', 'list', 'search', 'verify_token'`}
                      </code>
                    </div>
                    <span className="text-slate-400 font-bold text-sm flex-shrink-0">&rsaquo;</span>
                  </div>
                </div>

                {/* Right Panel: Core Policy */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-4 flex flex-col justify-between shadow-xs">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <svg className="w-4 h-4 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wide font-sans">
                        CORE POLICY
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Active
                    </span>
                  </div>

                  {/* Policy Snippet Box */}
                  <div className="relative bg-slate-50/90 border border-slate-200/70 rounded-xl p-3 font-mono text-xs text-slate-800">
                    <div className="flex items-start gap-2.5">
                      <svg className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        <polyline points="9 12 11 14 15 10" />
                      </svg>
                      <div className="flex-1 space-y-1 overflow-x-auto scrollbar-none">
                        <div>
                          <span className="text-emerald-700 font-bold">allow: </span>
                          <span className="text-slate-600">['read', 'list', 'search']</span>
                        </div>
                        <div>
                          <span className="text-rose-600 font-bold">deny: </span>
                          <span className="text-slate-600">['exec', 'sudo', 'write', 'network']</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyPolicy}
                        className="text-slate-400 hover:text-slate-700 transition-colors p-1 cursor-pointer"
                        title="Copy policy rules"
                        aria-label="Copy policy rules"
                      >
                        {copiedPolicy ? (
                          <span className="text-[10px] font-bold text-emerald-600">Copied!</span>
                        ) : (
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

              </div>

              {/* Console Bottom Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  <span>Axiom Core Latency: &lt; 5 ms</span>
                  <span className="text-slate-300">|</span>
                  <span className="text-slate-600 font-semibold">TRUSTED</span>
                  <span className="text-slate-300">|</span>
                  <span>Enforced with Ease</span>
                </div>

                <Link
                  href={`/playground?scenario=${activeScenario.id}`}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 group transition-colors cursor-pointer"
                >
                  <span>Secure in Playback</span>
                  <span aria-hidden="true" className="group-hover:translate-x-0.5 transition-transform font-bold">&rarr;</span>
                </Link>
              </div>

            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
