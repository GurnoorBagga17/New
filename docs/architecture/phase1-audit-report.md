# Axiom NHI Phase 1 final engineering audit

**Audit date:** 2026-11-15  
**Verdict:** **Gate G1 is not passed. The frontend source slice is implemented and locally verified, but Phase 1 is not release-ready.**  
**Scope:** Current repository contents and locally runnable checks. No live integrated gateway/policy runtime, production identity issuer, design-partner environment, or Lighthouse run was available.

## Executive result

The workspace now has four TypeScript packages/apps: `apps/gateway-ui`, `apps/web`, `packages/ui`, and `packages/cedar-editor`. The gateway console includes the virtualized audit stream, an integrated lazy-loaded policy studio, and a lazy-loaded audit explorer with search plus redacted CSV/NDJSON export. It labels kill-switch revocation unavailable because the backend route is absent. The public app statically builds `/`, `/playground`, `/benchmarks`, and `/docs`; it labels examples as simulations and does not publish invented benchmark data.

The tokens are generated from the repository source, local variable fonts are bundled, the frontend workspace typechecks and lints, 25 frontend unit tests pass, both app bundles meet their configured initial-JS budgets, and the built gateway assets pass the static air-gap URL scan. Rust tests and Clippy pass locally.

These checks do not prove a working end-to-end product. The four `/v1/local/*` endpoints are explicitly proposal-only and no corresponding HTTP/SSE route handlers were found. Live telemetry, policy dry-run/activation, revocation behavior, event throughput/frame time, browser request isolation, Lighthouse/Core Web Vitals, and partner-pilot gates remain unproven. Accordingly, no Gate G1 claim is made.

## Implemented and reviewed

- Added the public web app and shared `@axiom/ui` package, plus pnpm workspace and lockfile wiring.
- Integrated the existing policy studio into the gateway console using a lazy-loaded view; wrapped motion in `MotionConfig reducedMotion="user"`.
- Added Module 1D audit search and export over the bounded in-memory event buffer. Exports use only current audit DTO fields, reject shared secret-pattern matches before file creation, escape CSV cells against formula injection, and are covered by four tests. Revocation remains explicitly unavailable and sends no request.
- Added local variable-font assets to the web/shared and gateway themes. The gateway CSP keeps script, connect, and asset sources same-origin.
- Added secret-pattern rejection and current-schema shape validation before audit SSE events can enter the gateway store. Malformed and secret-like payloads receive generic errors without logging the payload or parser exception.
- Corrected event-stream disconnect wording so it does not claim the backend blocked a tool call. Corrected the traffic table rendering to use TanStack `flexRender` and removed its `any` cast.
- Updated motion declarations to animate only `transform` and `opacity`; added shared ESLint 9 flat configuration and lint scripts for all four workspaces.
- Added Cedar editor boundary tests for envelope parsing, observe-only `WOULD_DENY` presentation, and route-mode precedence.
- Added local Storybook review surfaces for shared state badges and Cedar verdict/mode badges; both static Storybook builds pass and are included in CI.
- Built generated CSS variables and Tailwind theme output from `tokens.json`. The configured contrast script checks 32 WCAG 2.1 AA text/border pairs for dark and light palettes.
- Kept current backend DTO schemas separate from draft HTTP request/response schemas. All four route proposals remain visibly marked `proposal-not-implemented`; fixtures and the SSE sample stream are mock artifacts.

## Team and gate status

| Area | Current evidence | Status |
|---|---|---|
| Team 0 — contracts and architecture | Current Rust DTO schemas, separate proposal schemas/OpenAPI, fixtures, secret patterns, ADRs, dependency map, generated token outputs | Incomplete: transport contracts and D3 revocation/observe semantics remain draft pending backend and downstream-owner review. |
| Tokens and theme | Dark/light token source, local fonts, Style Dictionary output, WCAG script passing 32 pairs | Partial: APCA is not independently calculated; contrast script covers configured text/border pairs, not every rendered pairing. |
| Team 1 — gateway | Agentgateway configuration, Node interceptor prototype, gateway UI same-origin adapter boundary | Incomplete: no verified deployed local REST/SSE routes, integrated runtime assembly, or live callout timeout proof. |
| Team 2 — policy/ExtMCP | Rust policy and ExtMCP component crates and runtime adapter | Incomplete: production configuration does not assemble the full live request path; frontend dry-run and bundle routes are absent. |
| Team 3 — identity | JWT/JWKS verifier and typed policy adapter with local tests | Component-level only: no live issuer interoperability, production config/reload, or full runtime evidence. |
| Team 4 — validators | Configured validator families and adversarial/unit coverage | Component-level only: trusted production profile loading and connector-level DNS/redirect enforcement remain to be integrated. |
| Team 5 — observability | Audit/revocation/tracing libraries | Incomplete: no local SSE publisher/admin transport or measured revocation propagation. |
| Team 6 — QA | Mock acceptance/security/failure tests and CI workflow definitions | Incomplete: no live-stack or partner acceptance run. |
| Team 7 — gateway UI/editor | Traffic stream, inspector, policy studio, audit explorer/export, shared UI, Cedar editor; 25 passing frontend tests | Partial: revocation action is unavailable until its API exists; 500+ events/sec at 60 FPS has not been measured. |
| Team 8 — public web | Static landing, simulator, thesis switcher, quickstart, playground, docs, benchmarks routes | Partial: production build succeeds, but Lighthouse/accessibility/Core Web Vitals gates were not run. |

## Gate G1 evidence

| Gate | Result | Evidence and limit |
|---|---|---|
| Gateway zero-external URL build scan | **Pass (static scan)** | `python docs/architecture/scripts/check_gateway_ui_offline.py` passes on the production output. The checker permits a short exact list of embedded React/Monaco documentation and SVG namespace strings; it continues to reject other external URL references and external request API targets. This is static output analysis, not a browser network trace. |
| Telemetry 500+ events/sec and 60 FPS | **Not verified** | No live endpoint or throughput/frame-time benchmark was run. The rate display is a measurement of received events, not a performance claim. |
| Initial JS budgets | **Pass (configured script)** | `python docs/architecture/scripts/check_frontend_budgets.py`: web 128.3 KiB gzip / 180 KiB; gateway UI 141.1 KiB gzip / 450 KiB. Lazy Monaco setup is excluded and listed by the script; its emitted setup chunk is large (about 695.8 KiB gzip) and should be optimized before first editor use. |
| Web Lighthouse, accessibility, LCP and INP | **Not verified** | No Lighthouse/browser audit was run. Static generation is not performance or accessibility evidence. |
| Color source scan | **Pass** | `python docs/architecture/scripts/check_frontend_colors.py`: 76 source files scanned; no hardcoded hex colors or pure black. |
| Token contrast | **Pass for configured pairs** | `python docs/architecture/scripts/check_design_tokens.py`: 32 configured WCAG 2.1 AA text/border pairs pass for dark/light. APCA and component-level pair coverage remain open. |
| Backend callout, observe-only, fail-closed, and revocation gates | **Not verified** | No live HTTP/SSE local admin routes or complete assembled runtime; no measured <5 ms internal evaluation, hard 15 ms deadline, zero observe-only disruption, or <100 ms revocation propagation evidence. |
| Zero-secret invariant | **Partial** | Shared canary-pattern specification, DOM/storage scanner tests, and SSE intake rejection are present. This does not prove every backend log/browser payload path or unknown secret format. |
| Design-partner pilots | **Not run** | No evidence from five partner environments or the 30-day pilot protocol. |

## Verification run

| Command | Result |
|---|---|
| `pnpm run typecheck` | Pass: strict TypeScript checks for all four workspaces. |
| `pnpm run lint` | Pass: ESLint 9 across all four workspaces. |
| `pnpm run test` | Pass: 25 tests total — 17 gateway secret-scrubber tests, 4 audit-export tests, and 4 Cedar editor boundary tests. |
| `pnpm --filter @axiom/ui run build-storybook` | Pass: shared UI Storybook built with the accessibility addon. |
| `pnpm --filter @axiom/cedar-editor run build-storybook` | Pass: Cedar verdict/mode Storybook built with the accessibility addon. |
| `pnpm run build` and app/package builds | Web and gateway production builds, shared UI build, and standalone Cedar library build completed. Next statically prerendered `/`, `/benchmarks`, `/docs`, and `/playground`. Concurrent Turbo tasks can contend for the Cedar `dist` directory on Windows; the standalone Cedar build passed. |
| `npm run build --prefix docs/architecture/token-build` | Pass: generated `tokens.css` and `tailwind-theme.css`. |
| `cargo test --workspace` | Pass in the earlier local verification run; unit and doc tests only, no live-stack coverage. |
| `cargo clippy --workspace --all-targets -- -D warnings` | Pass in the current local verification run. |
| `python docs/architecture/scripts/validate_api_contract_fixtures.py` | Pass: 9 schemas, 9 JSON fixtures, 2 SSE events, and all four routes explicitly proposal-only. |
| `python docs/architecture/scripts/check_frontend_workspace.py` | Pass: required workspace and typecheck scripts exist. |
| `python docs/architecture/scripts/check_frontend_budgets.py` | Pass: web 128.3 KiB and gateway UI 141.1 KiB gzip initial JS. |
| `python docs/architecture/scripts/check_gateway_ui_offline.py` | Pass: static production-output scan. |
| `python docs/architecture/scripts/check_frontend_colors.py` | Pass: 76 source files scanned; no hardcoded hex colors or pure black. |
| `python docs/architecture/scripts/check_design_tokens.py` | Pass: 32 configured WCAG contrast pairs. |

All checks above were run locally on Windows. The GitHub Actions workflow is defined but has not run on GitHub/Linux. Earlier `npm audit --prefix docs/architecture/token-build` reported six low/moderate development-tool findings in Style Dictionary's transitive dependency tree; rerun audit before release.

## Folder cleanup and provenance

The duplicate `.opencode` plan copy and generated Python caches were removed in the prior cleanup pass. This pass also removed the obsolete `apps/gateway-ui/TEAM_7B_DELIVERY_SUMMARY.md`, which reported unmeasured throughput and outdated module/workspace status. Plans, PDFs, fixtures, tests, contracts, and generated token outputs remain intentional project inputs or review artifacts. Root `node_modules`, Rust `target`, frontend `dist`/`.next`, Storybook `storybook-static`, and `.turbo` are ignored build/dependency outputs and must not be treated as deliverables.

The current Git worktree reports the repository files as untracked. There is no committed baseline in this checkout to compare against, and this audit did not stage or commit files. Review/stage the intended deliverables as a coherent change before using commit history or CI as provenance evidence.

## Final decision and remaining owners

**Gate G1: NOT PASSED.** The frontend is now buildable, typed, linted, within the configured initial-JS budgets, and backed by local unit/contract checks. Phase 1 still lacks implemented local admin endpoints and an assembled production runtime, and its live behavior, runtime performance, Lighthouse metrics, browser-level air-gap proof, and partner acceptance have not been demonstrated.

Next work: Teams 1/2/5 implement and integrate the reviewed local API/SSE contracts; Team 0 records reviewed D3/error/identity decisions and only then freezes contracts; Team 6 runs integrated adversarial and failure tests; Teams 7/8 measure browser performance, accessibility, and telemetry throughput; and the release team supplies live callout, observe-only, revocation, and partner-pilot evidence. Optimize the 695.8 KiB gzip Monaco setup chunk before relying on the policy editor in constrained environments.
