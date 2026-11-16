---
name: antigravity-frontend-design
description: Enforce modern, light-themed enterprise SaaS UI standards, consistent typography scales, Tailwind CSS v4 design tokens, accessible focus rings, and responsive dashboard layouts for Axiom.
---

# Antigravity Frontend Design Standards (Enterprise SaaS)

This skill enforces high-density, light-themed enterprise SaaS design principles for Axiom's Next.js and Tailwind CSS frontend.

## Visual Hierarchy & Palette Guardrails

1. **Light-Themed Enterprise SaaS Palette:**
   - **Background:** High-clarity clean neutral backgrounds (`bg-neutral-50` / `bg-white`).
   - **Borders & Dividers:** Subtle, crisp 1px borders (`border-neutral-200/80` or `border-neutral-200`). Avoid heavy shadows.
   - **Card Elevation:** Flat surfaces with subtle micro-borders and soft ambient shadows (`shadow-xs` or `shadow-sm`).
   - **Typography:** Deep neutral-900 (`text-neutral-900`) for primary headings, neutral-600 (`text-neutral-600`) for body/descriptions, and neutral-400 (`text-neutral-400`) for metadata.
   - **Status & Brand Accents:**
     - Success / Validated: Emerald (`text-emerald-700 bg-emerald-50 border-emerald-200`)
     - Warning / Escalation Pending: Amber (`text-amber-700 bg-amber-50 border-amber-200`)
     - Danger / Policy Denied: Rose / Red (`text-rose-700 bg-rose-50 border-rose-200`)
     - Primary / Interactive: High-contrast indigo / slate-900 accents

2. **Typography Scale:**
   - Page Titles: `text-2xl font-semibold tracking-tight text-neutral-900`
   - Section Headings: `text-lg font-medium tracking-tight text-neutral-900`
   - Data / Table Headers: `text-xs font-semibold uppercase tracking-wider text-neutral-500`
   - Body & Table Cells: `text-sm font-normal text-neutral-700`
   - Monospace (Tokens, Hashes, IDs): `font-mono text-xs text-neutral-800 bg-neutral-100 px-1.5 py-0.5 rounded`

3. **Accessibility & Focus States (WCAG 2.2 AA):**
   - Visible, distinct focus rings: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2`.
   - Contrast ratio $\ge 4.5:1$ for normal text, $\ge 3:1$ for large text and UI controls.
   - Screen-reader friendly aria attributes (`aria-expanded`, `aria-haspopup`, `aria-label`).

4. **Micro-Interactions & Animation:**
   - Durations: Standard fast transitions `transition-colors duration-150 ease-in-out`.
   - Motion safety: Always pair with `motion-reduce:transition-none`.
