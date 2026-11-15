# ADR 002: Frontend verdict and safety semantics

**Status:** Proposed for downstream review; not frozen.  
**Date:** 2026-11-15  
**Owners:** Team 0 (semantics), Teams 1/2/5 (runtime behavior), Teams 6/7/8 (verification and presentation)

## Canonical display values

The UI must handle the following values explicitly:

| Runtime/audit fact | UI state | Meaning |
|---|---|---|
| `ALLOW` / policy `PERMIT` | `ALLOW` | Decision permitted; actual forwarding/execution is still established by the gateway event. |
| `WOULD_DENY` / policy `DENY` while `observe-only` | `OBSERVE` | Shadow result; must not be rendered as a blocked `DENY`. |
| `PENDING` | `PENDING` | An explicit pending workflow state only when the backend emits it; Phase 1 does not define an approval flow. |
| `DENY` | `DENY` | Enforce-mode denial; show block only when the gateway confirms enforcement. |
| kill-switch action/decision | `REVOKED` | Emergency revocation was applied or matched; distinguish “action applied” from “request blocked” in event detail. |
| Any unrecognized value | `UNKNOWN` | Preserve the raw enum string for diagnostics, show a neutral icon + uppercase `UNKNOWN`, never infer `ALLOW`, never color-only. |

Icons and uppercase monospace labels are required alongside color. For accessibility, color is supplementary and the state label is the screen-reader text.

## Timeout copy and enforcement

For an enforce-mode callout timeout, render the required exact copy:

> FAIL-CLOSED: ExtMCP policy service unreachable (timeout 15ms) — tool call blocked

Only show this after a backend/gateway timeout event confirms a 15 ms deadline and blocked request. The local API contract and timeout event payload are currently absent; the frontend must not synthesize this event from a generic disconnected state.

In observe-only, a callout failure should be a distinct shadow-failure state and the gateway forwards according to the current architecture document. Do not label it `ALLOW` or claim the policy check succeeded.

## Kill-switch behavior in observe-only — unresolved D3

The source playbook says both “observe-only never blocks” and “kill-switch aborts”; the runtime-pipeline doc marks the conflict open. The Team 5 helper can recommend `Block` for a revoked target under operator-selected precedence, but there is no gateway wire path proving which option is active.

**Team 0 recommendation:** emergency revocation overrides observe-only. It is a separate emergency safety control, not a shadow policy result. Render the event as `REVOKED`, display whether the action was applied and whether a subsequent call was blocked, and do not mislabel it `OBSERVE`.

This remains **proposed**, not frozen, until Teams 1, 2, 5, and 6 review it and test the actual gateway behavior. The UI must consume an explicit backend outcome and must not infer precedence from runtime mode.

## Two-step revoke interaction

The UI must require the documented 400 ms hold or the approved keyboard sequence, show the target and target type before confirmation, provide cancellation, and wait for a confirmed backend result before showing `REVOKED`. The current backend has no HTTP endpoint, no `session_id` target, and no browser actor/authentication contract; do not expose a live-looking revoke action until those gaps are resolved.
