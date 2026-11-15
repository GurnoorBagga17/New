# ADR 003: Token contrast and delivery

**Status:** Proposed; requires Team 7 UI review before the shared token set is frozen.  
**Date:** 2026-11-15  
**Affected teams:** Team 0 (architecture), Team 7 (design system and gateway UI), Team 8 (web).

## Context

The kickoff token values include `text-muted` `#5E6B85` and `border-strong` `#2F3B54`. The WCAG 2.1 contrast checker measures the muted text at 3.67:1 on `#090B10`, below the 4.5:1 body-text requirement. The border value also fails the 3:1 interactive-boundary target on the defined dark surfaces. Keeping those values would make the stated contrast gate impossible to meet wherever these roles are used.

The token source and generated CSS/Tailwind v4 theme are now consumed by `packages/ui/`, `apps/gateway-ui/`, and `apps/web/`. The current generated output location is `docs/architecture/generated/`.

## Decision

The current draft in `/tokens.json` uses darker-theme `text-muted` `#8491AA` and `border-strong` `#66738D`, and fills in light-theme semantic, typography, and motion values. `docs/architecture/scripts/check_design_tokens.py` checks all declared text roles against all four surfaces at 4.5:1 and strong borders at 3:1. The Style Dictionary build emits CSS variables and a Tailwind v4 `@theme inline` file under `docs/architecture/generated/`.

The token set remains a proposal until Team 7 reviews the adjusted colors and Team 8 confirms the output integration. Both apps currently consume generated variables; avoid divergent copies. The contrast gate is WCAG 2.1 only and does not calculate APCA or prove arbitrary component combinations.

## Consequences

- The two adjusted dark values differ from the kickoff palette to satisfy the explicit contrast requirement.
- The checker establishes WCAG contrast ratios for configured foreground/background pairs; it does not calculate APCA or prove the contrast of arbitrary component combinations.
- The generated artifacts are reviewable build outputs, not evidence that either frontend bundle meets its size or runtime gates.

## Contract/version impact

No API contract changes. Token source is draft version `0.1.0-draft`; review and versioning are required before frontend adoption.
