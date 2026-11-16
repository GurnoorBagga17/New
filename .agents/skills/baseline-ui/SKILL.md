---
name: baseline-ui
description: Reusable baseline UI primitives, shadcn/ui and Radix component patterns, Tailwind v4 @theme tokens, and data-dense enterprise dashboard tables for Axiom.
---

# Baseline UI Component Patterns & Rules

This skill provides building blocks and compositional rules for creating enterprise SaaS dashboard components in Axiom (`@axiom/ui` and `apps/web`).

## Component Structure Guidelines

1. **Composition over Monoliths:**
   - Prefer compound components (e.g., `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogFooter`).
   - Use headless Radix UI primitives with Tailwind styling for dropdowns, tooltips, dialogs, and popovers.

2. **Tailwind CSS v4 & Next.js Best Practices:**
   - Avoid legacy `tailwind.config.js` plugins; leverage Tailwind v4 `@theme` block in CSS.
   - Keep styling declarative directly in class names; avoid inline style attributes.
   - Group class names logically: layout (`flex`, `grid`) $\to$ sizing/spacing (`p-`, `m-`, `w-`, `h-`) $\to$ typography $\to$ background/borders $\to$ states (`hover:`, `focus-visible:`).

3. **High-Density Enterprise Table Pattern:**
   - Compact row heights (`h-10` or `h-11`).
   - Sticky header with subtle border bottom.
   - Direct inline badge renderers for NHI status (`Active`, `Expired`, `Revoked`, `Awaiting Approval`).
   - Monospace formatters for SHA-256 digests and RFC 8693 token exchange IDs.

4. **Empty & Error States:**
   - Always supply an accessible empty state with icon, title, short description, and primary CTA.
   - Fallback error boundaries wrapping dynamic data tables and charts.
