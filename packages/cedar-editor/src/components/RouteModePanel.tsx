import { useState } from "react";
import { motion } from "motion/react";
import type { RouteMode } from "../types.js";
import { SPRING_TACTILE } from "../motion.js";
import { ModeBadge } from "./VerdictBadge.js";
import { AlertIcon } from "./icons.js";

export interface StudioRoute {
  readonly routeId: string;
  readonly mode: RouteMode;
  /** Optional display name from the host shell; falls back to routeId. */
  readonly label?: string;
}

export interface RouteModePanelProps {
  readonly routes: readonly StudioRoute[];
  readonly onChange: (routeId: string, mode: RouteMode) => void;
  readonly disabled?: boolean;
}

/**
 * Per-route Observe-Only ↔ Enforce control.
 *
 * Promoting a route to Enforce is a deliberate second step: the operator must
 * confirm with the domain-verb button `Enforce Cedar Policy`.
 */
export function RouteModePanel({ routes, onChange, disabled = false }: RouteModePanelProps) {
  const [pendingRouteId, setPendingRouteId] = useState<string | null>(null);

  return (
    <section className="ax-card" aria-labelledby="ax-routes-title">
      <div className="ax-card__header">
        <div>
          <p className="ax-overline">Bundle metadata</p>
          <h2 className="ax-card-title" id="ax-routes-title">
            Per-route runtime mode
          </h2>
        </div>
        <span className="ax-badge ax-badge--neutral">Armed only on activation</span>
      </div>
      <div className="ax-card__body">
        {routes.length === 0 ? (
          <p className="ax-secondary" style={{ margin: 0 }}>
            No routes were reported by the host. Route modes cannot be edited.
          </p>
        ) : null}
        {routes.map((route) => {
          const pending = pendingRouteId === route.routeId;
          const nextMode: RouteMode = route.mode === "enforce" ? "observe" : "enforce";
          return (
            <div key={route.routeId}>
              <div className="ax-route-row">
                <div className="ax-route-meta">
                  <span className="ax-route-id">{route.label ?? route.routeId}</span>
                  {route.label !== undefined ? (
                    <span className="ax-mono ax-muted">{route.routeId}</span>
                  ) : null}
                </div>
                <div className="ax-btn-row">
                  <ModeBadge mode={route.mode} />
                  <button
                    type="button"
                    className="ax-mode-switch"
                    role="switch"
                    aria-checked={route.mode === "enforce"}
                    aria-label={`Toggle ${route.routeId} runtime mode. Current mode ${route.mode}.`}
                    disabled={disabled}
                    onClick={() => {
                      if (nextMode === "enforce") {
                        setPendingRouteId(route.routeId);
                      } else {
                        setPendingRouteId(null);
                        onChange(route.routeId, "observe");
                      }
                    }}
                  >
                    <motion.span
                      className="ax-mode-switch__thumb"
                      animate={{ x: route.mode === "enforce" ? 26 : 0 }}
                      transition={SPRING_TACTILE}
                    />
                    <span className="ax-mode-switch__label">
                      {route.mode === "enforce" ? "ENFORCE" : "OBSERVE"}
                    </span>
                  </button>
                </div>
              </div>
              {pending ? (
                <div className="ax-alert ax-alert--warning" role="alert">
                  <AlertIcon width={16} height={16} />
                  <div>
                    <strong>PROMOTE TO ENFORCE?</strong>
                    <p>
                      Calls on <code className="ax-mono">{route.routeId}</code>{" "}
                      will be blocked fail-closed when Cedar denies or the policy
                      callout fails. This change is armed only when the bundle is
                      activated.
                    </p>
                    <div className="ax-btn-row" style={{ marginTop: "0.5rem" }}>
                      <button
                        type="button"
                        className="ax-btn ax-btn--enforce"
                        onClick={() => {
                          setPendingRouteId(null);
                          onChange(route.routeId, "enforce");
                        }}
                      >
                        Enforce Cedar Policy
                      </button>
                      <button
                        type="button"
                        className="ax-btn ax-btn--ghost"
                        onClick={() => setPendingRouteId(null)}
                      >
                        Keep Observe-Only
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
