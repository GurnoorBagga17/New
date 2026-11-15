import type { PolicyVerdict, RouteMode } from "../types.js";
import { CheckIcon, DenyIcon, EyeIcon, ShieldIcon, ClockIcon, AlertIcon } from "./icons.js";

export interface VerdictBadgeProps {
  readonly verdict: PolicyVerdict | null;
  readonly status?: "ok" | "invalid" | "timeout" | "unavailable" | "contract_mismatch" | "error";
}

/**
 * Policy verdict badge. Status is never colour-only: unique icon + uppercase
 * monospace label, per the Tactical Precision rules.
 */
export function VerdictBadge({ verdict, status = "ok" }: VerdictBadgeProps) {
  if (verdict === "ALLOW") {
    return (
      <span className="ax-badge ax-badge--allow" data-testid="verdict-badge">
        <CheckIcon />
        ALLOW
      </span>
    );
  }
  if (verdict === "WOULD_DENY") {
    return (
      <span className="ax-badge ax-badge--observe" data-testid="verdict-badge">
        <EyeIcon />
        WOULD DENY
      </span>
    );
  }
  if (verdict === "DENY") {
    return (
      <span className="ax-badge ax-badge--deny" data-testid="verdict-badge">
        <DenyIcon />
        DENY
      </span>
    );
  }
  if (status === "timeout") {
    return (
      <span className="ax-badge ax-badge--pending" data-testid="verdict-badge">
        <ClockIcon />
        TIMEOUT
      </span>
    );
  }
  if (status === "contract_mismatch" || status === "unavailable" || status === "error") {
    return (
      <span className="ax-badge ax-badge--deny" data-testid="verdict-badge">
        <AlertIcon />
        NO VERDICT
      </span>
    );
  }
  if (status === "invalid") {
    return (
      <span className="ax-badge ax-badge--deny" data-testid="verdict-badge">
        <AlertIcon />
        INVALID
      </span>
    );
  }
  return (
    <span className="ax-badge ax-badge--neutral" data-testid="verdict-badge">
      <ShieldIcon />
      NOT EVALUATED
    </span>
  );
}

export interface ModeBadgeProps {
  readonly mode: RouteMode;
}

export function ModeBadge({ mode }: ModeBadgeProps) {
  return mode === "enforce" ? (
    <span className="ax-badge ax-badge--allow">
      <ShieldIcon />
      ENFORCE
    </span>
  ) : (
    <span className="ax-badge ax-badge--observe">
      <EyeIcon />
      OBSERVE-ONLY
    </span>
  );
}
