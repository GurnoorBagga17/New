# `@axiom/cedar-editor`

Local Cedar policy editor and policy-studio UI package. The main entry exports policy form, envelope, diagnostic, evaluator-adapter and token helpers. `@axiom/cedar-editor/studio` exports React editor panels and lazy Monaco integration; Monaco workers are bundled locally, not fetched from a CDN.

## Integration status

The package is consumed by the gateway policy studio and public playground. Current dry-run/bundle HTTP contracts are drafts: no matching `/v1/local/policies/*` backend routes are implemented. The UI must keep these operations behind the typed adapter and must not present mock or browser-side validation as an authoritative runtime decision. Cedar WASM runtime evaluation is not included in this package build yet.

## Build and checks

From the repository root:

```powershell
pnpm --filter @axiom/cedar-editor typecheck
pnpm --filter @axiom/cedar-editor lint
pnpm --filter @axiom/cedar-editor test
pnpm --filter @axiom/cedar-editor build
pnpm --filter @axiom/cedar-editor run build-storybook
```

The current unit suite checks envelope parsing and display-mode helpers. The lazy editor setup is roughly 695.8 KiB gzip; it is excluded from the gateway initial-JS budget as a lazy Monaco chunk and remains a first-use optimization target.
