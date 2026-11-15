# Axiom public web app

Static Next.js app for the Phase 1 public experience:

- `/` — product landing page with labeled scenario simulations, market-thesis switcher and quickstart.
- `/playground` — Cedar editor experience; examples are illustrative unless an explicit backend adapter is supplied.
- `/benchmarks` — benchmark methodology/status page; it withholds figures until a signed artifact exists.
- `/docs` — current local documentation entry point.

The app consumes `@axiom/ui` and generated design tokens; fonts are bundled locally. Production builds statically prerender these routes. Lighthouse, accessibility, LCP and INP have not been measured, so static generation must not be treated as a performance/accessibility pass.

```powershell
pnpm --filter @axiom/web typecheck
pnpm --filter @axiom/web lint
pnpm --filter @axiom/web build
```

The latest locally measured initial JavaScript is recorded in `docs/architecture/phase1-audit-report.md`.
