import { useState } from "react";
import type { BundleActivationResult, DryRunStatus } from "../types.js";
import { PolicyDiff } from "./PolicyDiff.js";
import { AlertIcon, ShieldIcon } from "./icons.js";

export interface ActivationPanelProps {
  readonly activeVersion: string | null;
  readonly candidateVersion: string | null;
  readonly candidateSource: string;
  readonly baselineSource: string;
  readonly routeModes: readonly { readonly routeId: string; readonly mode: "observe" | "enforce" }[];
  readonly lastDryRunStatus: DryRunStatus | null;
  readonly activating: boolean;
  readonly activationResult: BundleActivationResult | null;
  readonly onActivate: () => void;
}

/**
 * Bundle activation review.
 *
 * Activation is only offered after a successful dry-run supplied a candidate
 * SHA-256. A rejected hot reload never updates the displayed active version.
 */
export function ActivationPanel({
  activeVersion,
  candidateVersion,
  candidateSource,
  baselineSource,
  routeModes,
  lastDryRunStatus,
  activating,
  activationResult,
  onActivate,
}: ActivationPanelProps) {
  const [reviewing, setReviewing] = useState(false);
  const enforceRoutes = routeModes.filter((route) => route.mode === "enforce");
  const ready = candidateVersion !== null && lastDryRunStatus === "ok";
  const succeeded = activationResult?.activated === true;
  const failed = activationResult !== null && !activationResult.activated;

  return (
    <section className="ax-card" aria-labelledby="ax-activate-title">
      <div className="ax-card__header">
        <div>
          <p className="ax-overline">PUT /v1/local/policies/bundle</p>
          <h2 className="ax-card-title" id="ax-activate-title">
            Bundle activation
          </h2>
        </div>
        <span className="ax-badge ax-badge--neutral">Hot reload</span>
      </div>

      <div className="ax-card__body">
        <dl className="ax-facts">
          <dt>Active SHA</dt>
          <dd className="ax-mono">
            {activeVersion ?? "UNKNOWN — not reported by backend"}
          </dd>
          <dt>Candidate SHA</dt>
          <dd className="ax-mono">
            {candidateVersion ?? "PENDING — run a successful simulation"}
          </dd>
          <dt>Enforce routes</dt>
          <dd className="ax-mono">
            {enforceRoutes.length === 0
              ? "none — all routes observe-only"
              : enforceRoutes.map((route) => route.routeId).join(", ")}
          </dd>
        </dl>

        {!ready ? (
          <div className="ax-alert ax-alert--warning" role="status">
            <AlertIcon width={16} height={16} />
            <div>
              <strong>SIMULATION REQUIRED</strong>
              <p>
                {lastDryRunStatus === "invalid"
                  ? "The candidate bundle did not validate. Activation is blocked until the policy validates."
                  : lastDryRunStatus === "ok"
                    ? "The dry-run did not return a candidate SHA-256. Activation is blocked because the reviewed version cannot be pinned."
                    : "Run Simulate Dry Run successfully before activation so the reviewed candidate SHA-256 comes from the evaluator."}
              </p>
            </div>
          </div>
        ) : null}

        {activating ? (
          <div role="status" style={{ display: "grid", gap: "0.5rem" }}>
            <div className="ax-loading-bar" />
            <p className="ax-mono" style={{ margin: 0 }}>
              HOT RELOAD IN FLIGHT • awaiting server validation
            </p>
          </div>
        ) : null}

        {succeeded ? (
          <div className="ax-alert ax-alert--success" role="status">
            <ShieldIcon width={16} height={16} />
            <div>
              <strong>BUNDLE ACTIVE</strong>
              <p className="ax-mono">
                {activationResult.active?.version ?? candidateVersion}
              </p>
              <p>
                {activationResult.active?.policyCount ?? 0} policies • loaded at
                unix {activationResult.active?.loadedAtUnix ?? "unknown"}
              </p>
              {activationResult.simulated ? (
                <p>SIMULATED FIXTURE — no server state changed.</p>
              ) : null}
            </div>
          </div>
        ) : null}

        {failed ? (
          <div className="ax-alert ax-alert--error" role="alert">
            <AlertIcon width={16} height={16} />
            <div>
              <strong>HOT RELOAD REJECTED — LIVE BUNDLE UNCHANGED</strong>
              <p className="ax-mono">
                Active bundle remains: {activeVersion ?? "UNKNOWN (not reported)"}
              </p>
              <ul style={{ margin: "0.375rem 0 0", paddingLeft: "1.1rem" }}>
                {activationResult.errors.length > 0 ? (
                  activationResult.errors.map((error, index) => (
                    <li key={`${error}-${index}`} className="ax-mono">
                      {error}
                    </li>
                  ))
                ) : (
                  <li>The server did not return an error message.</li>
                )}
              </ul>
            </div>
          </div>
        ) : null}

        {reviewing ? (
          <>
            <hr className="ax-divider" />
            <PolicyDiff before={baselineSource} after={candidateSource} />
            <div className="ax-alert ax-alert--warning" role="note">
              <AlertIcon width={16} height={16} />
              <div>
                <strong>CONFIRM ACTIVATION</strong>
                <p>
                  The server re-validates the bundle before swapping it. If the
                  live version moved past the reviewed candidate SHA, the hot
                  reload is rejected and the active bundle stays live.
                </p>
              </div>
            </div>
            <div className="ax-btn-row">
              <button
                type="button"
                className={enforceRoutes.length > 0 ? "ax-btn ax-btn--enforce" : "ax-btn ax-btn--primary"}
                disabled={activating || !ready}
                onClick={onActivate}
              >
                {enforceRoutes.length > 0
                  ? "Enforce Cedar Policy"
                  : "Activate Policy Bundle"}
              </button>
              <button
                type="button"
                className="ax-btn ax-btn--ghost"
                disabled={activating}
                onClick={() => setReviewing(false)}
              >
                Cancel Review
              </button>
            </div>
          </>
        ) : (
          <div className="ax-btn-row">
            <button
              type="button"
              className="ax-btn"
              disabled={!ready || activating || succeeded}
              onClick={() => setReviewing(true)}
            >
              Review Activation
            </button>
            {succeeded ? (
              <span className="ax-secondary">Activation complete for this candidate.</span>
            ) : null}
          </div>
        )}

        {activationResult !== null &&
        activationResult.contractWarnings.length > 0 ? (
          <div className="ax-alert ax-alert--warning" role="status">
            <AlertIcon width={16} height={16} />
            <div>
              <strong>CONTRACT WARNING — Team 0 action item</strong>
              <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                {activationResult.contractWarnings.map((warning, index) => (
                  <li key={`${warning}-${index}`} className="ax-mono">
                    {warning}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
