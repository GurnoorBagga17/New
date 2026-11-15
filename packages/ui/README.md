# `@axiom/ui`

Small shared UI package for the Axiom public web app and gateway console. It exports semantic state badges and basic panel/button primitives; app-specific flows remain in their owning apps.

The theme imports CSS variables and Tailwind v4 theme output generated from the root `tokens.json`. Variable Space Grotesk, Inter, and JetBrains Mono fonts are bundled locally. Use semantic state tokens with an icon and uppercase label; do not hardcode color values.

```powershell
pnpm --filter @axiom/ui typecheck
pnpm --filter @axiom/ui lint
pnpm --filter @axiom/ui build
pnpm --filter @axiom/ui run build-storybook
```

The token set and generated output remain under review. The configured checker covers WCAG text and interactive-border pairs; it does not calculate APCA or audit every rendered component pairing.
