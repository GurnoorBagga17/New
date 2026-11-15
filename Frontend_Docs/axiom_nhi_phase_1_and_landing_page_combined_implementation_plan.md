# Axiom NHI — Phase 1 & Public Landing Page Combined Full Implementation Plan (Days 1–90)

**Scope**: Unified Backend Runtime + Embedded Community Gateway UI (`apps/gateway-ui`) + Public Acquisition Funnel & Interactive Sandbox (`apps/web`)  
**Target Gate (Gate G1)**:
1. Deployed in **5 design-partner environments** (`docker compose up axiom-gateway`).
2. Reproducible open benchmark verifying **`p50`/`p95`/`p99` `ExtMCP` inline policy evaluation latency** (`< 5ms` internal execution) and **deterministic `fail-closed` behavior**.
3. **Zero false-positive disruptions** during `observe-only` shadow runs.
4. Verified **sub-second kill-switch revocation** (`< 100ms` propagation).
5. **Frontend & Landing Page Exit Gates**: Zero outbound network requests in standalone `apps/gateway-ui` mode; virtualized telemetry stream sustains `500+ events/sec` at `60 FPS` (`< 16ms` frame budget); `< 180 KB` gzipped initial JS payload (`< 450 KB` embedded gateway UI cap, excluding lazy-loaded Monaco/WebGL chunks); Public Landing Page (`apps/web`) achieves **Lighthouse `>= 95` Performance and `100` Accessibility/SEO** with `LCP < 1.8s` and `INP < 100ms`.

---

## 1. Unified Monorepo Topology & `.github/CODEOWNERS` Lock

Axiom NHI combines the Apache-2.0 Rust runtime and the TypeScript frontend surfaces inside a single polyglot repository (`axiom-nhi`) with strict license and team ownership boundaries:

```text
axiom-nhi/
├── Cargo.toml                           # Rust workspace root (Apache-2.0)
├── pnpm-workspace.yaml                  # TypeScript Turborepo/pnpm root
├── tokens.json                          # Single source of truth for Design System tokens
├── proto/
│   └── extmcp.proto                     # Team 0: agentgateway ExtMcp gRPC definition
├── gateway/                             # Team 1: Hardened agentgateway + local UI static server
│   ├── agentgateway/
│   ├── mcp-interceptor/
│   ├── runtime-modes/
│   └── local-admin-api/                 # Serves /v1/local/* REST/SSE + embedded apps/gateway-ui
├── services/
│   └── extmcp/                          # Team 2: Tonic h2c gRPC server + Cedar v4.14.1 engine
├── identity/                            # Team 3: MCP OAuth 2.1 + CIMD + RFC 8707 verifier
├── validators/                          # Team 4: SQL AST (sqlparser), Path, Egress & Tool Pinning
├── observability/                       # Team 5: OpenTelemetry OTLP/JSONL + ArcSwap Kill Switch
├── packages/                            # Team 7 (Design System & Shared Frontend Libraries — Apache-2.0)
│   ├── ui/                              # @axiom/ui: Radix + Tailwind v4 tokens, badges, Cmd+K, drawers
│   └── cedar-editor/                    # @axiom/cedar-editor: Monaco + Cedar DSL grammar + WASM worker
├── apps/
│   ├── gateway-ui/                      # Team 7: Standalone Community Runtime SPA (localhost:8080, Apache-2.0)
│   └── web/                             # Team 8: Public Landing Page (/), /playground, /benchmarks, /docs
├── tests/                               # Team 6: Backend + Playwright E2E + Chromatic + k6/Benchmark harness
└── deployments/
    └── docker/                          # Team 1: Single-command Docker Compose stack
```

### `.github/CODEOWNERS` (Strict Anti-Overlap Enforcement)

```text
/docs/architecture/           @axiom-nhi/team-0-arch
/docs/api-contracts/          @axiom-nhi/team-0-arch
/proto/                       @axiom-nhi/team-0-arch
/tokens.json                  @axiom-nhi/team-0-arch @axiom-nhi/team-7-ui

/gateway/                     @axiom-nhi/team-1-gateway
/deployments/docker/          @axiom-nhi/team-1-gateway @axiom-nhi/team-0-arch
/services/extmcp/             @axiom-nhi/team-2-policy
/identity/                    @axiom-nhi/team-3-identity
/validators/                  @axiom-nhi/team-4-validators
/observability/               @axiom-nhi/team-5-observability
/tests/                       @axiom-nhi/team-6-qa

/packages/ui/                 @axiom-nhi/team-7-ui
/packages/cedar-editor/       @axiom-nhi/team-7-ui @axiom-nhi/team-2-policy
/apps/gateway-ui/             @axiom-nhi/team-7-ui
/apps/web/                    @axiom-nhi/team-8-web
```

---

## 2. Design System, Color Tokens, Typography & Motion Spec ("Tactical Precision")

All frontend surfaces (`apps/web` and `apps/gateway-ui`) compile their CSS variables and Tailwind v4 theme directly from `/tokens.json` via Style Dictionary.

### 2.1 Surface, Brand & Semantic Security State Tokens

To prevent OLED halation and eye fatigue during incident response, pure `#000000` is forbidden. Elevation uses stepped dark-graphite luminance paired with `1px` borders (`rgba(255, 255, 255, 0.08)`) and top-edge inner highlights (`inset 0 1px 0 rgba(255, 255, 255, 0.06)`):

```css
:root[data-theme="dark"] {
  /* Stepped Surface & Structural Palette */
  --bg-canvas: #090B10;          /* oklch(14% 0.015 260) - Base backdrop & public dark landing canvas */
  --bg-surface-1: #0E121B;       /* oklch(18% 0.018 260) - Sidebar (220px), top bar (64px), table containers */
  --bg-surface-2: #141926;       /* oklch(22% 0.022 260) - Elevated cards, Monaco panels, 460px/480px drawers */
  --bg-surface-3: #1C2333;       /* oklch(27% 0.026 260) - Row hover states, dropdowns, Cmd+K palette */
  --border-subtle: #1E2638;      /* oklch(28% 0.025 260) - Default 1px structural dividers & card outlines */
  --border-strong: #2F3B54;      /* oklch(37% 0.032 260) - Active input focus rings & selected rows */

  /* Typography Ink Hierarchy */
  --text-primary: #F3F6FC;       /* oklch(97% 0.008 260) - 16.8:1 contrast headings, identity names, KPIs */
  --text-secondary: #9AA6BF;     /* oklch(73% 0.028 260) - 7.4:1 contrast descriptions & table metadata */
  --text-muted: #5E6B85;         /* oklch(53% 0.030 260) - Timestamps, disabled controls, axis ticks */

  /* Brand & Interactive Accent Tokens */
  --brand-cyan: #00E5FF;         /* Primary CTAs, active runtime intercept beams, telemetry pulse */
  --brand-cyan-glow: rgba(0, 229, 255, 0.14);
  --brand-indigo: #6366F1;       /* Identity graph lineage edges, OAuth 2.1 & delegation badges */
  --brand-indigo-glow: rgba(99, 102, 241, 0.16);
  --brand-violet: #A855F7;       /* Autonomous AI agent nodes, MCP tool schema tags */
  --brand-violet-glow: rgba(168, 85, 247, 0.14);

  /* Cybersecurity Semantic State Tokens (Always paired with unique icon + uppercase monospace label) */
  --state-enforce: #10B981;      /* Emerald - Active Cedar guardrail enforced; valid tool call permitted */
  --state-enforce-tint: rgba(16, 185, 129, 0.12);
  --state-observe: #38BDF8;      /* Sky - Non-blocking shadow telemetry mode; zero production impact */
  --state-observe-tint: rgba(56, 189, 248, 0.12);
  --state-pending: #F59E0B;      /* Amber - Execution paused; awaiting approval signature */
  --state-pending-tint: rgba(245, 158, 11, 0.12);
  --state-deny: #F43F5E;         /* Crimson - Unauthorized argument, SQLi, or unpinned tool blocked fail-closed */
  --state-deny-tint: rgba(244, 63, 94, 0.12);
  --state-revoked: #EF4444;      /* Alert Red - Kill switch triggered; session severed */
  --state-revoked-tint: rgba(239, 68, 68, 0.18);

  /* Border Radii */
  --radius-input: 6px;
  --radius-card: 10px;
  --radius-modal: 14px;
}

/* Executive Report & Documentation Light Theme (/docs & optional light operator mode) */
:root[data-theme="light"] {
  --bg-canvas: #F8FAFC;
  --bg-surface-1: #FFFFFF;
  --bg-surface-2: #F1F5F9;
  --border-subtle: #E2E8F0;
  --text-primary: #0F172A;
  --brand-cyan: #0284C7;
  --brand-indigo: #4F46E5;
}
```

### 2.2 Typography & Technical Micro-Copy Rules

| Typographic Role | Font Family | Desktop Size | Line Height | Tracking & Weight | OpenType / CSS Features |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Hero Display (`H1`)** | `Space Grotesk` / `Plus Jakarta Sans` | `56px` (`3.5rem`) | `1.08` | `-0.035em` • `700` | Tight architectural SaaS presence |
| **Section Title (`H2`)** | `Space Grotesk` / `Plus Jakarta Sans` | `36px` (`2.25rem`) | `1.15` | `-0.025em` • `600` | — |
| **Console Page Title** | `Inter` / `Geist Sans` | `22px` (`1.375rem`) | `1.30` | `-0.015em` • `600` | `"cv02", "cv03", "cv04", "cv11"` (`1` vs `l` vs `I`) |
| **Card / Drawer Header** | `Inter` / `Geist Sans` | `15px` (`0.9375rem`) | `1.40` | `-0.010em` • `600` | `"cv02", "cv03", "cv04", "cv11"` |
| **Standard UI Body** | `Inter` / `Geist Sans` | `14px` (`0.875rem`) | `1.50` | `0.000em` • `400` | `"cv02", "cv03", "cv04", "cv11"` |
| **Table Cell / Form Label** | `Inter` / `Geist Sans` | `13px` (`0.8125rem`) | `1.40` | `0.000em` • `500` | `"cv02", "cv03", "cv04", "cv11"` |
| **Section Overline / Kicker** | `JetBrains Mono` / `Geist Mono` | `11px` (`0.6875rem`) | `1.20` | `+0.080em` CAPS • `500` | Uppercase tactical labels |
| **Policy DSL / SHA-256 / Metrics** | `JetBrains Mono` / `Geist Mono` | `12.5px` (`0.78rem`) | `1.55` | `0.000em` • `400` | `font-variant-numeric: tabular-nums` (zero horizontal jitter) |

- **Deterministic Micro-Copy Standard**: Error banners must state exact technical failure modes (e.g., `FAIL-CLOSED: ExtMCP policy service unreachable (timeout 15ms) — tool call blocked`), and primary buttons must use domain-specific verbs (`Enforce Cedar Policy`, `Simulate Blast Radius`, `Revoke Agent Session`).
- **Strict Zero-Secret Browser Invariant**: Neither `apps/gateway-ui` nor `apps/web` ever fetches, decrypts, renders, or caches raw secret values, API keys, or private keys—not even behind an "unmask" eye icon. Secret bindings render strictly as cryptographic metadata pills: `vault://openbao/prod-db • TTL 4m 12s • Lease Active`.

### 2.3 Motion Physics & Signature Micro-Animations (`motion/react`)

All animations obey GPU compositor rules (`transform` and `opacity` only) wrapped in `<MotionConfig reducedMotion="user">`:
- **`SPRING_TACTILE`**: `{ stiffness: 480, damping: 34, mass: 0.8 }` — Button presses, `Observe ↔ Enforce` switches, `layoutId="active-pill"` shared navigation pills.
- **`SPRING_DRAWER`**: `{ stiffness: 360, damping: 36, mass: 1.0 }` — `460px`/`480px` slide-over inspection drawers and `Cmd+K` command palette.
- **`EASE_TELEMETRY`**: `cubic-bezier(0.16, 1, 0.3, 1)` (`220ms`) — Live MCP stream rows entering the virtualized feed, dropdowns, and alert toasts.
- **`EASE_PULSE`**: `cubic-bezier(0.4, 0, 0.6, 1)` (`2.4s` continuous loop) — Active gateway heartbeat dot.
- **Signature Animation 1 (Live MCP Packet Intercept Beam)**: Incoming tool calls send a glowing `2px` `#00E5FF` cyan pulse along an SVG path (`180ms`) into the Cedar Policy Node. On `ALLOW`, the node flashes Emerald (`#10B981`) for `250ms`; on `DENY`, the pulse strikes a Crimson (`#F43F5E`) hexagonal shield wall with a damped horizontal micro-shake (`x: [-3, 3, -2, 2, 0]`, `200ms`) and spawns a `BLOCKED • 3.1ms` badge.
- **Signature Animation 2 (Two-Step Kill-Switch Severance)**: Triggering emergency revocation requires a deliberate two-step safety interaction (`Click -> 400ms radial hold` or `Cmd+Backspace`), radiating a crimson sonar ring (`scale: 0.8 -> 2.4`, `450ms`) and severing the target session edge (`pathLength: 1 -> 0`).

---

## 3. Shared Backend-to-Frontend Phase 1 Contracts (Frozen by Team 0)

In addition to the internal Rust contracts between Teams 1–5 (`RuntimeRequest`, `IdentityContext`, `ValidatorResult`, `PolicyRequest`, `PolicyResponse`, `AuditEvent`, `RevocationState`), Team 1 and Team 5 expose four local loopback REST/SSE endpoints on `localhost:8080/v1/local/*` consumed by `apps/gateway-ui`:

| Endpoint | Method / Transport | Backend Owner | Frontend Consumer (`apps/gateway-ui`) | Payload / Behavior |
| :--- | :--- | :--- | :--- | :--- |
| `/v1/local/events/stream` | `GET` (SSE `text/event-stream`) | Team 5 + Team 1 | Module 1B (Live Traffic Inspector) | Streams redacted `AuditEvent` JSON records in real time into a bounded Zustand ring buffer (`max 2,000 events`). |
| `/v1/local/policies/dry-run` | `POST` (`application/json`) | Team 2 + Team 4 | Module 1C (Cedar Policy Studio) | Evaluates candidate `.cedar` rules + `ValidatorResult` against a sample MCP `tools/call` JSON-RPC envelope without mutating active state. |
| `/v1/local/policies/bundle` | `PUT` (`application/json`) | Team 2 + Team 1 | Module 1C (Cedar Policy Studio) | Validates and hot-reloads the active `.cedar` policy bundle and per-route `observe-only` vs. `enforce` mode via `ArcSwap`. |
| `/v1/local/sessions/{id}/revoke` | `POST` (`application/json`) | Team 5 + Team 2 | Module 1D (Local Kill Switch) | Immediately inserts `agent_id`, `session_id`, or `tool_id` into the `ArcSwap` revocation set (`< 50ms`) and emits a `REVOKED` audit event. |

---

## 4. Team-by-Team Implementation Plans & Strict Anti-Overlap Rules

To execute both the Rust runtime and the two Phase 1 frontend applications (`apps/gateway-ui` and `apps/web`) in parallel within 90 days, organize into **8 specialized teams** (or map across 5–8 founding engineers with primary/secondary hats).

### Team 0 — Architecture, Contracts & Design-Token Governance
- **Ownership**: `/proto/`, `/docs/api-contracts/`, `/tokens.json`, `/docs/architecture/`
- **What to Build**:
  1. Freeze `extmcp.proto`, the 7 Rust runtime structs, the 4 `/v1/local/*` OpenAPI/TypeScript schemas, and `/tokens.json` in Week 1.
  2. Enforce the `15ms` `ExtMCP` gRPC callout timeout and the **Strict Zero-Secret Invariant** across both backend logs and browser payloads.
  3. Maintain CI gates for Rust (`cargo clippy`), TypeScript (`tsc --noEmit`), and bundle budgets (`< 180 KB` gzipped initial JS on `apps/web`, `< 450 KB` on `apps/gateway-ui`).
- **What NOT to Touch**: Never write implementation code inside `/gateway/`, `/services/extmcp/`, `/identity/`, `/validators/`, `/observability/`, `/apps/`, or `/packages/`.

---

### Team 1 — MCP Gateway, Egress Proxy & Embedded UI Hosting
- **Ownership**: `/gateway/`, `/deployments/docker/`
- **What to Build (`G1.1` – `G1.10`)**:
  1. Configure upstream [agentgateway](https://github.com/agentgateway/agentgateway) for MCP `stdio` and Streamable HTTP/SSE (`MCP-Protocol-Version: 2025-03-26`).
  2. Intercept `tools/call`, `tools/list`, `prompts/get`, and `resources/read`, normalize into `RuntimeRequest`, and invoke `services/extmcp` over persistent `h2c` (`localhost:9001`) with a hard `15ms` deadline ([Set up remote guardrails](https://agentgateway.dev/docs/standalone/latest/documentation/mcp/guardrails/setup/)).
  3. Enforce `observe-only` (never block; log shadow decisions) vs. `enforce` mode (return HTTP 200 with `isError: true` on `tools/call` policy denial or JSON-RPC `-32001` on non-`tools/call` / kill-switch aborts per [agentgateway Error Codes](https://agentgateway.dev/docs/standalone/main/documentation/mcp/guardrails/processors/)).
  4. Enforce Team 4's outbound egress allowlist at the proxy socket/DNS boundary.
  5. Embed the compiled static build of `apps/gateway-ui` inside the gateway binary/container on `localhost:8080` and route `/v1/local/*` API requests with strict `Content-Security-Policy: default-src 'self'` headers.
- **What NOT to Touch**: Do not parse JWTs/CIMD (Team 3), do not write SQL/path regexes in CEL (Team 4), do not write Cedar policies (Team 2), and do not author React UI components (Team 7).

---

### Team 2 — Cedar Policy Engine, `ExtMCP` Service & Cedar WASM Compiler
- **Ownership**: `/services/extmcp/`, plus the Rust-to-WASM build target in `/packages/cedar-editor/wasm/`
- **What to Build (`P2.1` – `P2.10`)**:
  1. Build the `tonic` `ExtMcp` gRPC server (`CheckRequest` and `CheckResponse`) embedding [`cedar-policy` v4.14.1](https://crates.io/crates/cedar-policy).
  2. Orchestrate the hot-path pipeline inside `CheckRequest`:
     - Step 1: Check Team 5's `ArcSwap` kill-switch set (`< 50µs`).
     - Step 2: Verify caller identity via Team 3 (`IdentityContext`).
     - Step 3: Canonicalize and validate arguments via Team 4 (`ValidatorResult`).
     - Step 4: Evaluate Cedar `Authorizer::is_authorized()` and return `PolicyResponse`.
  3. Implement `/v1/local/policies/dry-run` and `/v1/local/policies/bundle` with hot-reloadable SHA-256 versioned policy snapshots.
  4. Compile a lightweight Rust WASM wrapper around `cedar-policy` + Team 4's validators (`@axiom/cedar-wasm`) so Team 7 and Team 8 can run real in-browser Cedar policy evaluation in the `/playground` and Monaco studio without a backend server.
- **What NOT to Touch**: Do not write raw SQL/path parsers inside Cedar policies (Team 4), do not verify OAuth 2.1 signatures (Team 3), and do not build React UI layouts (Team 7/8).

---

### Team 3 — Identity & Authentication (`OAuth 2.1` + `CIMD` + `RFC 8707`)
- **Ownership**: `/identity/`
- **What to Build (`I3.1` – `I3.10`)**:
  1. Implement [MCP OAuth 2.1 Authorization](https://modelcontextprotocol.io/specification/draft/basic/authorization) bearer token extraction and JWS signature verification against cached JWKS endpoints.
  2. Implement Client ID Metadata Document (CIMD) resolution and TTL caching for URL-based `client_id` identifiers ([MCP Client Registration](https://blog.modelcontextprotocol.io/posts/client_registration/)).
  3. Enforce [IETF RFC 8707 Resource Indicators](https://www.rfc-editor.org/info/rfc8707/) audience validation (`aud` claim must match the exact target MCP server URI to prevent confused-deputy token replay).
  4. Output the canonical `IdentityContext` struct (including `cimd_uri` and `rfc8707_aud_matched` badges for the UI inspector).
- **What NOT to Touch**: Do not build Phase 3 RFC 8693 token exchange, do not build Phase 2 cloud IAM connectors, and do not make tool-level authorization decisions (Team 2).

---

### Team 4 — Argument Security Validators & Tool-Definition Pinning
- **Ownership**: `/validators/`
- **What to Build (`A4.1` – `A4.10`)**:
  1. **SQL AST Validator (`/validators/sql/`)**: Parse SQL queries using [`sqlparser`](https://crates.io/crates/sqlparser), classify statements (`SELECT` vs. `INSERT`/`UPDATE` vs. `DELETE`/`DROP`/`TRUNCATE`/`ALTER`), reject stacked multi-statement queries (`ast.len() > 1`), and strip comment/CTE obfuscation.
  2. **Filesystem Path Validator (`/validators/filesystem/`)**: Decode percent/Unicode sequences, reject null bytes, normalize `..` traversal segments, resolve symlinks, and enforce root directory boundaries.
  3. **Outbound Egress Validator (`/validators/egress/`)**: Parse URLs, enforce strict subdomain boundaries, block IP literals and RFC 1918 / loopback / cloud metadata IPs (`169.254.169.254`), and provide DNS-pinned resolution to Team 1.
  4. **Tool-Definition Pinning (`/validators/tool-pinning/`)**: Canonicalize `tools/list` schemas (RFC 8785 JCS), compute SHA-256 digests, and block mid-session tool description mutations ("rug pulls") during `CheckResponse`.
- **What NOT to Touch**: Never hardcode agent permissions inside validators—return factual `ValidatorResult` structs to Team 2's Cedar engine.

---

### Team 5 — Observability, Audit Stream & Instant Kill Switch
- **Ownership**: `/observability/`
- **What to Build (`O5.1` – `O5.10`)**:
  1. Instrument end-to-end W3C trace IDs using [`opentelemetry`](https://crates.io/crates/opentelemetry) and export structured `AuditEvent` logs to both OTLP collectors and local `/var/log/axiom/audit.jsonl`.
  2. Enforce strict token/secret scrubbing so no bearer token, OpenBao secret, or sensitive credential ever enters logs or the `/v1/local/events/stream` SSE broadcast.
  3. Implement the `/v1/local/events/stream` SSE broadcaster pushing live intercepted events to `apps/gateway-ui`.
  4. Build the `axiom kill` CLI and `/v1/local/sessions/{id}/revoke` endpoint backed by an `ArcSwap` revocation table supporting agent, tool, MCP server, and global emergency stop in `< 50ms`.
- **What NOT to Touch**: Do not build Phase 2 Jira/Slack alert routers or Phase 3 SIEM/SOAR pipelines.

---

### Team 7 — Design System (`@axiom/ui`) & Standalone Community Runtime UI (`apps/gateway-ui`)
- **Ownership**: `/packages/ui/`, `/packages/cedar-editor/`, `/apps/gateway-ui/`
- **Staffing Profile**: 2 Frontend Systems Engineers (React 19, TypeScript Strict, Tailwind CSS v4, Radix UI, TanStack Virtual/Table, Monaco Editor, Zustand)
- **Mission**: Build the shared `@axiom/ui` component library and the zero-dependency Apache-2.0 Community Runtime Console (`localhost:8080`) bundled inside the `agentgateway` container.
- **Detailed Work Breakdown (`Module 1A` – `Module 1D`)**:
  - **`Module 1A` (`@axiom/ui` Design System & 3-Pane Operator Shell)**:
    - Compile `/tokens.json` into CSS variables and Tailwind v4 utilities (`#090B10` canvas, `#0E121B` surface-1, `#141926` surface-2, `1px` `#1E2638` hairlines).
    - Build the 12 custom brand SVG glyphs (`1.5px` stroke: `axiom-mark`, `mcp-server`, `autonomous-agent`, `nhi-service-account`, `secretless-lease`, `cedar-gate`, `spicedb-lineage`, `blast-radius`, `atomic-approval`, `causal-kill-switch`, `ai-bom`, `taint-flow`) and semantic status badges (`ALLOW`, `OBSERVE`, `PENDING`, `DENY`, `REVOKED`).
    - Build the `localhost:8080` 3-pane operator shell: top status bar (`HEALTHY • FAIL-CLOSED ARMED`, global `OBSERVE-ONLY ↔ ENFORCE` switch, `p99` tabular-nums latency readout, and two-step hold-to-fire **Emergency Kill Switch**), `220px` left navigation rail, center workspace, `460px` slide-over inspector drawer (`SPRING_DRAWER`), and global `Cmd+K` / `Ctrl+K` command palette (`cmdk`).
  - **`Module 1B` (Live MCP Traffic & `ExtMCP` Callout Inspector)**:
    - Connect to `GET /v1/local/events/stream` (SSE) into a bounded Zustand ring buffer (`max 2,000 events`) with automatic hover-to-pause and a floating `Resume Stream` pill.
    - Render a virtualized 5-column high-density table (`@tanstack/react-virtual` + `@tanstack/react-table`: Identity, Target Tool, Active Mode/Policy, Latency `ms`, Verdict) sustaining `500+ events/sec` at `60 FPS`.
    - Clicking any row opens the `460px` right drawer displaying the full JSON-RPC `tools/call` envelope, verified OAuth 2.1 CIMD badge, RFC 8707 target indicator, SHA-256 tool-definition pin status, and extracted SQL/path/egress attributes.
  - **`Module 1C` (Visual Cedar Policy & Argument Validator Studio)**:
    - Build `@axiom/cedar-editor` wrapping Monaco Editor in a web worker with custom Cedar syntax highlighting, `axiom.cedarschema` autocomplete, and instant dry-run validation via `/v1/local/policies/dry-run` (or `@axiom/cedar-wasm`).
    - Pair the code editor with a guided visual form builder for SQL verb allowlists (`SELECT` vs `DELETE`/`DROP`), filesystem path prefixes, and outbound HTTP egress allowlists, plus per-route `Observe-Only ↔ Enforce` toggles (`PUT /v1/local/policies/bundle`).
  - **`Module 1D` (Local Kill Switch & Audit Log Explorer)**:
    - Build the two-step radial hold (`400ms`) revocation drawer calling `POST /v1/local/sessions/{id}/revoke` and a filterable local audit table supporting one-click redacted CSV and NDJSON export.
- **Strict Scope Boundary (What Team 7 Must NOT Do)**:
  - **DO NOT** make any external network requests from `apps/gateway-ui` (no Google Fonts CDN, no Segment/PostHog analytics, no external API calls—bundle `Space Grotesk`, `Geist Sans`, and `Geist Mono` `.woff2` fonts and Monaco workers locally so it passes strict offline air-gap verification).
  - **DO NOT** build multi-tenant SaaS login/OIDC screens, WebGL 50,000-node Sigma.js lineage graphs, or billing portals—those belong to `apps/console` in **Phases 2–6**.
  - **DO NOT** build the public marketing landing page (`apps/web`)—that belongs to **Team 8**.

---

### Team 8 — Public Landing Page, 3D Enclave Visual & Interactive Sandbox (`apps/web`)
- **Ownership**: `/apps/web/`
- **Staffing Profile**: 1–2 Creative Frontend & DX Engineers (Next.js App Router, React Three Fiber / Spline, `motion/react`, GSAP ScrollTrigger, Fumadocs/Nextra MDX, Apache ECharts)
- **Mission**: Build the high-converting, hands-on technical proof environment (`apps/web`) that proves Axiom NHI's inline runtime enforcement, dual-graph vision, and transparent `$0` discovery pricing directly in the browser without requiring installation.
- **Detailed Work Breakdown (`Sections 2.1` & `2.2`)**:
  1. **Root Landing Page (`/`) — 5 Interactive Sections**:
     - **Sticky 64px Glass Navbar**: `backdrop-filter: blur(12px)`, links to `/playground`, `/benchmarks`, `/docs`, GitHub repo star counter, and `Deploy in 5 Min` CTA.
     - **Section 1 — 12-Column Split Hero & Live 3-Scenario MCP Intercept Simulator**:
       - *Top/Background Visual ("The Inline Agent Enclave")*: Interactive isometric 3D glass-and-obsidian prism (`React Three Fiber` / `Spline` with `±6 deg` mouse parallax and automatic animated SVG fallback for low-GPU devices) over a `24px × 24px` radial dot matrix and `800px × 400px` cyan spotlight (`rgba(0, 229, 255, 0.09)`).
       - *Interactive Split Terminal & Policy Trace Widget*: Left pane lets visitors fire 3 preset adversarial prompt-injection attacks (`Scenario 1: SQL DROP TABLEusers;--`, `Scenario 2: Path Traversal ../../etc/passwd`, `Scenario 3: Unauthorized Egress + Sub-Agent Kill Switch`). Right pane animates the `180ms` `#00E5FF` intercept beam through OAuth 2.1 CIMD check -> RFC 8707 audience check -> SHA-256 tool pin check -> Cedar `DENY` crimson shield deflection (`BLOCKED • 3.1ms`) and an interactive **Kill Switch** button.
     - **Section 2 — Market Thesis Comparison (`Legacy Posture vs. Axiom Inline`)**: Interactive drag-handle / mode-switcher walkthrough contrasting post-hoc posture alert fatigue after data exfiltration against Axiom's pre-execution inline gating.
     - **Section 3 — Interactive Dual-Graph Preview**: Clickable mini-graph preview showing how a compromised agent resolves *upward* to its human owner (Git commit, IAM role, Slack attribution) and *downward* to dependent production databases (blast-radius preview).
     - **Section 4 — Transparent Metering Calculator (Dual-Slider Cost Modeler)**: Interactive sliders for `Employee Count` (`50–5,000`), `NHI Ratio` (`10:1–50:1`), and `% Actively Governed` (`5%–100%`). Dynamically calculates and proves visually that **all passive NHI discovery is `$0`** across every edition (avoiding the `$202,500/yr` naive per-discovered-NHI quote trap) while metering only actively governed NHIs and fleet agents.
     - **Section 5 — 5-Minute Quickstart Strip**: One-click copyable `docker compose up axiom-gateway` and Helm snippets with an instant toggle between `Standalone Community Mode (Apache-2.0)` and `Control Plane Pairing`.
  2. **Dedicated Public Engineering Sub-Routes**:
     - **`/playground` (Zero-Install Cedar & MCP Policy Sandbox)**: Embeds Team 7's `@axiom/cedar-editor` and Team 2's `@axiom/cedar-wasm` module so visitors can paste any MCP JSON-RPC tool manifest, edit Cedar SQL/path/egress policies, and run live adversarial payloads entirely in the browser.
     - **`/benchmarks` (Reproducible Latency & Fail-Closed Proof Hub)**: Renders interactive `p50`/`p95`/`p99` latency distribution histograms (Apache ECharts / Tremor) and fail-closed chaos test logs generated by Team 6's benchmark harness.
     - **`/docs` (Versioned MDX Engineering Documentation)**: Built with Fumadocs/Nextra supporting both Dark and Executive Light (`#F8FAFC`) themes, interactive MCP OAuth 2.1 (`CIMD` + `RFC 8707`) sequence diagrams, and `agentgateway` configuration references.
- **Strict Scope Boundary (What Team 8 Must NOT Do)**:
  - **DO NOT** fork UI primitives, status pills, or the Monaco Cedar editor inside `apps/web`—import `@axiom/ui` and `@axiom/cedar-editor` from `/packages/` owned by **Team 7**.
  - **DO NOT** invent synthetic benchmark numbers on `/benchmarks`—bind the charts directly to the signed JSON benchmark artifact published by **Team 6**.
  - **DO NOT** exceed the `< 180 KB` gzipped initial JS payload budget (lazy-load the 3D enclave canvas, Monaco `/playground`, and ECharts bundles via `next/dynamic`).

---

### Team 6 — QA, Chaos Engineering, Benchmark Harness & Visual/E2E Verification
- **Ownership**: `/tests/`
- **What to Build (`Q6.1` – `Q6.10` + Frontend Quality Gates)**:
  1. **Backend Security & Chaos Suite**: Automated test runners for MCP protocol conformance, OAuth 2.1/CIMD/RFC 8707 token replay rejection, 100+ adversarial SQLi/path/SSRF/tool-rug-pull payloads, and `docker pause` fail-closed chaos verification.
  2. **Reproducible Open Benchmark Suite**: Load-testing harness measuring `p50`, `p95`, and `p99` `ExtMCP` overhead under concurrent agent bursts and sub-second kill-switch revocation latency, exporting structured JSON consumed by `apps/web/benchmarks`.
  3. **Frontend Playwright E2E & Zero-Secret DOM Audit**:
     - Automated Playwright tests verifying the live MCP stream at `500 events/sec` (`< 16ms` frame budget), Monaco Cedar dry-run blocking, two-step kill-switch revocation roundtrip, and a DOM/network scanner asserting **zero raw secret values** ever appear in `localStorage`, `sessionStorage`, DOM nodes, or SSE payloads.
     - Automated Lighthouse CI (`>= 95` Performance, `100` Accessibility/SEO, APCA/WCAG 2.1 AA contrast `>= 4.5:1` body text and `>= 3:1` interactive borders) and Chromatic visual regression snapshots across Dark (`#090B10`) and Light (`#F8FAFC`) themes.
- **What NOT to Touch**: Never patch production code directly in `/gateway/`, `/services/`, `/packages/`, or `/apps/`—file failing tests and assign fixes to the owning team.

---

## 5. Integrated 90-Day Execution Schedule (Backend + Gateway UI + Landing Page)

### Milestone 1 (Days 1–30): Foundation, Design System & Working Local Pipeline
- **Team 0**: Freeze `extmcp.proto`, 7 Rust contracts, 4 `/v1/local/*` OpenAPI endpoints, and `/tokens.json`.
- **Teams 1–5**: Deliver working `agentgateway` + `ExtMCP` + `Cedar` + `OAuth 2.1/CIMD` + `sqlparser`/path/egress prototypes + local JSONL/SSE stream (`GET /v1/local/events/stream`).
- **Team 7**: Ship `Module 1A` (`@axiom/ui` token pipeline, dark/light themes, 12 brand SVGs, `Cmd+K` palette, 3-pane operator shell) and `Module 1B` (virtualized live MCP SSE stream viewer).
- **Team 8**: Ship the Root Landing Page (`/`) Hero, 3-Scenario MCP Intercept Simulator, Market Thesis Comparison switcher, and 5-Minute Quickstart strip.
- **Team 6**: Stand up CI pipelines (Rust tests, Vitest, Lighthouse CI budget check, and initial SQLi/traversal test fixtures).

### Milestone 2 (Days 31–60): Full Security Enforcement, Policy Studio & Public `/playground`
- **Teams 1–5**: Complete RFC 8707 audience binding, `tools/list` SHA-256 pinning, `15ms` timeout + `failClosed` enforcement, `/v1/local/policies/dry-run` & `bundle` endpoints, and `< 50ms` `axiom kill` CLI/API (`POST /v1/local/sessions/{id}/revoke`).
- **Team 2 + Team 7**: Compile `@axiom/cedar-wasm` and ship `Module 1C` (Visual Cedar Policy & Argument Validator Studio with Monaco worker) and `Module 1D` (Two-step Kill Switch drawer & CSV/NDJSON Audit Log Explorer) inside `apps/gateway-ui`.
- **Team 8**: Ship `/playground` (in-browser WASM Cedar sandbox), the Transparent Metering Calculator (Dual-Slider `$0` discovery proof), Dual-Graph preview, and `/docs` MDX portal.
- **Team 6**: Execute `docker pause` fail-closed chaos tests, Playwright E2E safety flows, and zero-secret DOM assertions.

### Milestone 3 (Days 61–90): Benchmarks, Bundle Hardening & 5 Design-Partner Pilots (Gate G1)
- **Team 6 + Team 8**: Publish the reproducible `p50`/`p95`/`p99` latency and fail-closed benchmark suite and launch `/benchmarks` on `apps/web`.
- **Team 1 + Team 7**: Embed the static `apps/gateway-ui` bundle (`< 450 KB` gzipped, zero external network calls) into the single-command `docker compose up axiom-gateway` image.
- **All Teams**: Execute the 30-day pilot protocol across **5 design partners** (Week 1 `observe-only` shadow run with `0` false positives -> Week 3 `enforce` mode on destructive tools -> Week 4 live red-team prompt-injection & kill-switch drill) to pass **Gate G1**.

---

## 6. Explicit Phase 1 Deferrals (What NO Team Builds in Days 1–90)

To protect the 90-day runtime & landing page launch, these modules from the Master Plan and Frontend Plan are strictly locked out of Phase 1:
- **Multi-Tenant SaaS Control Plane (`apps/console`), OIDC/SAML SSO, & Full WebGL 50k-Node Lineage Canvas (`Sigma.js`)** -> Deferred to **Frontend Phase 2** (note: `apps/web` includes only the lightweight clickable *Mini-Graph Preview* on the landing page).
- **Cloud/SaaS Read-Only Connectors (AWS IAM, K8s, GitHub, Slack) & Postgres Lineage DB** -> Deferred to **Phase 2**.
- **OWASP NHI/MCP Compliance Matrix UI & Jira/Slack Alert Routing Builder** -> Deferred to **Phase 2 / Frontend Phase 3**.
- **Control-Plane OpenBao Dynamic Secret Broker UI, Zero-Downtime Rotation State Machine, & Cloud IAM Rightsizing Diff Viewer** -> Deferred to **Phase 3 / Frontend Phase 4**.
- **SpiceDB Multi-Hop Delegation Explorer, Atomic Single-Use Slack Approvals, & Spend Circuit Breakers** -> Deferred to **Phase 3–4 / Frontend Phase 5**.
- **Multi-Cluster Canary Rollout Manager, Air-Gapped Customer-VPC Helm Console, Signed AI-BOM Vault, & Billing Portal** -> Deferred to **Phase 4 / Frontend Phase 6**.
