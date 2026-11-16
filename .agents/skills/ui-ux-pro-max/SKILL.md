---
name: ui-ux-pro-max
description: Structured design system skill for enterprise SaaS dashboards, multi-step onboarding wizards, non-human identity (NHI) dependency graphs, and live telemetry feeds.
---

# UI/UX Pro Max: Enterprise SaaS & NHI Dashboards

This skill guides the design and layout of specialized enterprise SaaS dashboards, multi-tier security consoles, and dependency graphs for Axiom NHI.

## Key Interface Patterns

### 1. Non-Human Identity (NHI) Dependency Lineage Graph
- Use React Flow or SVG canvas with light-grid background (`bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px]`).
- Visual nodes represent:
  - Agent / NHI Identity (Service Principal, Workload, Autonomous Agent)
  - Intermediary Gateway / ExtMCP callout point
  - Protected Resource (Database, Dynamic Vault Engine, S3 bucket, Third-Party API)
- Edge styles:
  - Solid neutral line: Standard authorized delegation (RFC 8693)
  - Dashed amber line: Pending human-in-the-loop cryptographic escalation
  - Red strikethrough: Denied / Revoked relationship

### 2. Multi-Step Onboarding & Quickstart Wizard
- Step indicator: Linear clean progress bar with numbered pills (`Step 1: Connect Gateway`, `Step 2: Define Cedar Policy`, `Step 3: Validate OTel Audit`).
- Collapsible inline code blocks with copy-to-clipboard button and terminal styling (dark slate card with monospace syntax highlighting).

### 3. Real-Time Security & Audit Feed
- Streamed table rows with pulse indicators for live ingress/egress requests.
- Slide-over inspector panel (`Sheet` component) displaying raw canonical JSON payload, SHA-256 hash digest, and evaluation latency breakdown ($p50 / p95$).
