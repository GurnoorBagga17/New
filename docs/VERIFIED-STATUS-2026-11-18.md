# Axiom NHI — Verified Status (2026-11-18)

**Purpose:** replace the contradictory completion claims in the repo with one
snapshot that was actually re-checked against the code on this date.

**Supersedes (do not treat as current):**
- `PROJECT-STATUS.md` — "All 18 Workspace Crates Compiling & Verified"
- `IMPLEMENTATION-CHECKLIST.md` — "Overall completion: 15%"
- `REVISED-PLAN-2026-11-17.md` — "Overall Completion: 2%"
- `docs/architecture/complete-audit/IMPLEMENTATION_STATUS.md` — "22/28 complete, 0 broken"

Those four documents describe different points in time and different
definitions of "done". This file records what was verified, what was fixed
during verification, and what remains unverified.

---

## 1. Bottom line

**The project is not complete.** The Rust core is substantial and builds;
the SaaS/product layer is partially implemented; production readiness has not
been demonstrated.

| Area | Assessment | Evidence |
|---|---|---|
| Rust core engine | Substantial, mostly working | 21 workspace crates, ~24.4k lines of Rust, workspace tests (see §2) |
| Rust policy/kill-switch/identity/validators | Strongest part of the repo | Unit tests present and passing for these crates |
| Next.js SaaS layer | Partial | 18 API route files, 0 web unit tests, no billing dashboard, no enrollment route |
| Deployability | Not production-ready | Two conflicting migration sets, dev credentials in compose defaults, CI gaps |
| Documentation accuracy | Unreliable | Four status docs with incompatible claims; feature matrix cites files that do not exist |

Rough completion (intentionally coarse): **Rust core ~75–80%, web/SaaS layer
~30–40%, production readiness not yet achieved.** These are judgement calls,
not measurements.

---

## 2. Commands run and results

Run from the repository root on Windows (PowerShell), 2026-11-18.

| Check | Result |
|---|---|
| `python tests/run_tests.py` | **57 passed, 1 skipped, 0 failed** (coverage gate 93.8%) |
| `pnpm --filter @axiom/web run typecheck` | **Pass** (after fixes in §3) |
| `pnpm --filter @axiom/web run build` | **Pass** (after fixes in §3) |
| `cargo test --workspace` | **Fails on this machine** — see §2.1 |
| Browser/HTTP checks against dev server (`:3001`) | **Pass** — see §2.2 |
| `cargo clippy --workspace`, `cargo fmt --check` | Not run in this pass |
| Docker / Helm deployment | Not run |
| Live Postgres / Stripe / AWS | Not run |
| Playwright e2e | Not run |

### 2.1 Rust test caveat

`cargo test --workspace` does **not** produce a clean run on this Windows
machine. Two separate failures were observed:

1. `rustc` crashed with `STATUS_STACK_BUFFER_OVERRUN` while compiling
   `axiom-approvals` and `axiom-alerts`. The same crates compile and pass when
   built individually (`cargo test -p axiom-approvals --lib` → 5 passed).
2. `axiom-lineage-graph` failed with `error[E0463]: can't find crate for
   'sqlx'` in the workspace run.

This looks environmental (parallel codegen / stale artifacts), not necessarily
a source defect, but it means the often-quoted "258 passed, 0 failed" could not
be reproduced here. Treat that number as unconfirmed until CI or a clean
machine reproduces it.

### 2.2 Security behaviour verified against a running server

A dedicated test user was registered, then the protected endpoints were called
with and without the CSRF token.

| Request | Expected | Observed |
|---|---|---|
| `GET /api/healthz` | public | **200** |
| `POST /api/auth/logout` (no session) | rejected by proxy | **401** |
| `POST /api/integrations` (no session) | rejected | **401** |
| `POST /api/billing/webhook` (unsigned) | public route, fails closed | **503** |
| `POST /api/console/revocations` (session, no CSRF header) | 403 | **403** |
| same, wrong CSRF header | 403 | **403** |
| same, correct CSRF header | reaches handler | **404** (upstream control plane absent) |
| same, correct header + `Origin: https://evil.example` | 403 | **403** |
| `POST /api/auth/logout` with valid token | 200 | **200** |
| `GET /api/auth/me` after logout | 401 | **401** |

---

## 3. Fixes made during this audit

### 3.1 CSRF/auth middleware never ran (critical, fixed)

`apps/web/middleware.ts` listed `"/"` in `PUBLIC_PATHS` and matched with
`pathname.startsWith(path)`. Every path starts with `/`, so every request was
treated as public and the CSRF/session checks were dead code.

Changed in this pass:

- Renamed `middleware.ts` → `proxy.ts` (Next.js 16 renamed the convention;
  `middleware.ts` is deprecated). `pnpm build` now reports `ƒ Proxy (Middleware)`.
- Path matching now respects segment boundaries: `"/"` only matches `/`, and
  `"/api/console"` does not match `"/api/consoleX"`.
- Added a real **double-submit check**: the `X-CSRF-Token` header must match the
  new `axiom_csrf` cookie, compared in constant time. Bearer-token API clients
  are exempt from CSRF (they are not cookie-authenticated).
- Added same-origin rejection for mutating API requests with a foreign `Origin`.
- Issued `axiom_csrf` at login, registration, and OIDC callback; refreshed it in
  `GET /api/auth/me` so sessions created before this change pick it up; cleared
  it on logout.
- Added `apps/web/lib/csrf.ts` (`csrfFetch`) and wired the console and
  integrations pages to send the header. Without this, enabling the check would
  have broken every mutating UI action.

### 3.2 Production build was broken (fixed)

`next build` failed at page-data collection because four route modules threw at
import time when secrets were absent:

- `api/billing/checkout` — `STRIPE_SECRET_KEY`
- `api/billing/webhook` — Stripe/webhook/database env
- `api/console/proxy` — `AXIOM_ADMIN_TOKEN`

All three now resolve configuration lazily at request time. Production still
fails closed (503 / request-time error), but builds no longer require runtime
secrets. This also means the CI `pnpm run build` job can pass without secrets.

### 3.3 Stripe webhook hardening (partial, untested against Stripe)

- Added Stripe's recommended **300-second timestamp tolerance**; signatures
  outside the window are rejected (replay protection).
- Length-checked the signature before `timingSafeEqual`.
- Added a fail-closed `503` when the webhook has no Stripe client or database,
  instead of treating the event as an already-processed duplicate and silently
  acknowledging it.
- Stripe keys remain placeholders in `.env.example`; no real event has been
  tested.

---

## 4. Missing or incomplete (verified)

These were checked with `git ls-files` / direct file reads, not taken from docs.

| Item | Status | Evidence |
|---|---|---|
| AWS / K8s / GitHub connectors | **Missing** | `connectors/src/` contains only `discovery.rs`, `enterprise.rs`, `lib.rs`, `saas_oauth.rs`; no `aws.rs`, `k8s.rs`, `github.rs` despite `IMPLEMENTATION_STATUS.md` citing them |
| Enrollment API + `enrollment.rs` | **Missing** | no `apps/web/app/api/runtime/`; no `enrollment.rs` anywhere |
| Entitlement middleware | **Missing** | no entitlement enforcement module in `apps/web` |
| Billing dashboard page | **Missing** | no `/dashboard/billing` page; no client calls `/api/billing/checkout` |
| WebAuthn enroll route | **Missing** | only TOTP enroll/verify routes exist |
| Session revoke route | **Missing** | only `/api/auth/logout` (current session) exists |
| Connector worker / scheduler | **Missing** | no worker/scheduler crate or service |
| Policy signing (`signing.rs`) | **Missing** | no signing module in the policy crates |
| Threat model | **Missing** | no threat-model document found |
| Disaster recovery doc | **Missing** | no DR runbook found |
| OpenAPI v1 spec | **Partial** | only `docs/api-contracts/local-admin-api.openapi.yaml` |
| GitHub App manifest | **Missing** | not found |
| TOTP MFA | **Present but unverified** | routes exist; no automated test exercises a full enroll → verify flow |
| Auth store durability | **Partial** | default is in-memory + JSON file; PostgreSQL is an optional async mirror, so multi-replica session consistency is not proven |
| Audit-log failure handling | **Open** | failures are logged/dropped; no dead-letter queue |

---

## 5. Open security / operations issues

| Issue | Severity | Status |
|---|---|---|
| CSRF middleware dead due to `"/"` prefix match | Critical | **Fixed and verified** (§3.1) |
| CSRF token was presence-only, never compared | High | **Fixed** (double-submit) |
| Production build required runtime secrets | High | **Fixed** (§3.2) |
| Webhook replay window | High | **Fixed in code**, untested against live Stripe |
| Two conflicting database schemas | High | **Open** |
| Dev credentials defaulted in compose files | High | **Open** |
| CI does not run Python, Playwright, `cargo audit`, `npm audit` | Medium | **Open** |
| Tenant-isolation test cannot run | Medium | **Open** |
| Audit-log failures dropped | Medium | **Open** |

### 5.1 Two conflicting migration sets

- Root `migrations/` creates `tenants`, `operators`, billing/entitlements,
  integrations, and SaaS agents.
- `lineage-graph/migrations/` independently creates `tenants`, `operators`,
  `operator_sessions`, plus the graph and RLS tables.
- Root `docker-compose.yml` mounts `./migrations`.
- `deployments/docker/docker-compose.yml` and `docker-compose.prod.yml` mount
  `../../lineage-graph/migrations`.

Consequence: in the production-style compose files, the billing and entitlement
tables from root `0002` are never created, while the webhook writes to
`subscriptions` and `tenant_entitlements`. This needs one canonical migration
chain before any deployment claim is credible.

### 5.2 Development credentials are baked in

- `docker-compose.yml`: `POSTGRES_PASSWORD: axiom_dev_password`,
  `OPENBAO_DEV_ROOT_TOKEN_ID: axiom-dev-root-token`.
- `deployments/docker/docker-compose.yml`: default `AXIOM_ADMIN_TOKEN` value.
- `apps/web/app/api/console/proxy.ts`: non-production fallback token.
- `apps/web/app/api/auth/store.ts`: `axm_dev_stepup_sig` fallback under
  `AXIOM_DEV_MODE=1` outside production.

The production compose file correctly requires `AXIOM_ADMIN_TOKEN`, and
`lib/startup-checks.ts` refuses to start with dev-like tokens in production —
but the checked-in defaults should still be removed or generated per environment.

### 5.3 CI coverage gaps

`.github/workflows/ci.yml` runs Rust fmt/clippy/test, JS typecheck/lint/test/build,
Helm lint/template, and contract fixtures. It does **not** run:

- `python tests/run_tests.py`
- Playwright (`tests/e2e/gateway-console.spec.ts`)
- `cargo audit` or `npm audit`
- `tests/security/tenant-isolation.test.ts`

The last one also cannot run as-is: it imports `@jest/globals`, but the
workspace has no Jest dependency or config, and `tests/` is outside the pnpm
workspace, so `turbo run test` never sees it.

---

## 6. Test-coverage reality

- **Rust:** tests exist per crate; count unconfirmed in this environment (§2.1).
- **Python:** 57 passed / 1 skipped, but they exercise
  `tests/integration/helpers/mock_stack.py`, not the real Rust services,
  Next.js routes, or a database.
- **Web:** zero `*.test.ts(x)` / `*.spec.ts(x)` files under `apps/web`.
  Repo-wide there are 6 JS/TS test files (gateway-ui, cedar-editor, the
  unreachable tenant-isolation test, and the Playwright spec).
- **E2E:** one Playwright spec exists; not run in CI.

---

## 7. Recommended next steps (in order)

1. **Pick one migration chain** and delete/redirect the other; make both compose
   files use it. Verify the billing webhook tables exist in the prod compose.
2. **Remove checked-in default credentials**; require env-provided secrets in
   every compose file and generate local values in a bootstrap script.
3. **Make CI honest:** add Python tests, Playwright, `cargo audit`, `npm audit`,
   and a runnable tenant-isolation suite (Jest/Vitest with a real Postgres
   service). Ensure `pnpm build` runs with dummy (non-secret) env values.
4. **Reproduce the Rust workspace test run** on Linux CI and record the real
   pass count; investigate the Windows `rustc` crash separately.
5. **Finish the missing SaaS pieces** in this order: enrollment, entitlement
   middleware, connector worker, WebAuthn, session revoke, billing UI.
6. **Test Stripe against the CLI** (`stripe trigger checkout.session.completed`)
   including replay and out-of-tolerance signatures.
7. **Reconcile the four status documents** against this file, then keep one.

---

## 8. Reproduce

```powershell
python tests/run_tests.py
pnpm --filter @axiom/web run typecheck
pnpm --filter @axiom/web run build
cargo test --workspace
```

HTTP checks (after `next dev`):

```powershell
curl.exe -i -X POST http://localhost:3001/api/auth/logout          # 401
curl.exe -i -X POST http://localhost:3001/api/billing/webhook -d "{}"  # 503 (public, fail-closed)
```
