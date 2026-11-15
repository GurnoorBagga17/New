/**
 * Module 1C — Policy Studio page (Team 7C).
 *
 * Orchestration only: the page owns the reducer, the backend adapter, and the
 * activation flow. Editor, form, diff, and panels come from
 * `@axiom/cedar-editor/studio`; no policy decision is computed here.
 */

import { useEffect, useReducer, useRef, useState } from "react";
import { MotionConfig } from "motion/react";
import {
  AXIOM_SCHEMA_SOURCE,
  LOCAL_POLICY_CONTRACT_VERSION,
  analyzeCedarText,
  createBackendDryRunAdapter,
  failureResult,
  type ActiveBundleInfo,
  type BundleActivationResult,
  type DryRunEnvelope,
  type EvaluatorAdapter,
  type GuidedPolicyFormState,
  type PolicyDiagnostic,
  type RouteMode,
  type ThemeMode,
} from "@axiom/cedar-editor";
import {
  ActivationPanel,
  AlertIcon,
  BeakerIcon,
  CedarEditor,
  DryRunPanel,
  GuidedPolicyForm,
  RouteModePanel,
  ShieldIcon,
  type StudioRoute,
} from "@axiom/cedar-editor/studio";
import {
  buildEnvelopeFromDraft,
  createInitialPolicyStudioState,
  envelopeToDraft,
  isFormLocked,
  policyStudioReducer,
  selectActivationReadiness,
  selectGuidedFormView,
  selectPolicies,
  selectRouteModes,
  type EnvelopeDraft,
} from "./policyStudioState.js";

export interface PolicyStudioPageProps {
  /** Defaults to the same-origin backend adapter. Tests pass a mock adapter. */
  readonly adapter?: EvaluatorAdapter;
  readonly routes?: readonly StudioRoute[];
  readonly initialSource?: string;
  readonly baselineSource?: string;
  readonly activeVersion?: string | null;
  readonly initialEnvelope?: DryRunEnvelope;
  readonly themeMode?: ThemeMode;
  /** Called after a successful hot reload so the host can refresh its shell. */
  readonly onBundleActivated?: (active: ActiveBundleInfo) => void;
}

const RUNTIME_MODE_OPTIONS: readonly { readonly value: EnvelopeDraft["runtimeMode"]; readonly label: string }[] = [
  { value: "", label: "Route default" },
  { value: "observe", label: "Observe-Only" },
  { value: "enforce", label: "Enforce" },
];

export function PolicyStudioPage({
  adapter: adapterProp,
  routes,
  initialSource,
  baselineSource,
  activeVersion,
  initialEnvelope,
  themeMode = "light",
  onBundleActivated,
}: PolicyStudioPageProps) {
  const [adapter] = useState<EvaluatorAdapter>(
    () => adapterProp ?? createBackendDryRunAdapter(),
  );
  const [state, dispatch] = useReducer(
    policyStudioReducer,
    {
      ...(routes !== undefined ? { routes } : {}),
      ...(initialSource !== undefined ? { initialSource } : {}),
      ...(baselineSource !== undefined ? { baselineSource } : {}),
      ...(initialEnvelope !== undefined ? { initialEnvelope } : {}),
      ...(activeVersion !== undefined ? { activeVersion } : {}),
    },
    createInitialPolicyStudioState,
  );
  const [draft, setDraft] = useState<EnvelopeDraft>(() =>
    envelopeToDraft(state.envelope),
  );
  const [envelopeError, setEnvelopeError] = useState<string | null>(null);
  const [cancelledNotice, setCancelledNotice] = useState<string | null>(null);
  const inFlightRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      inFlightRef.current?.abort();
    };
  }, []);

  const updateDraft = (patch: Partial<EnvelopeDraft>): void => {
    setDraft((current) => ({ ...current, ...patch }));
    setCancelledNotice(null);
    // A changed envelope invalidates the reviewed simulation even though the
    // candidate SHA-256 itself is envelope-independent.
    dispatch({ type: "review/cleared" });
  };

  const runDryRun = async (): Promise<void> => {
    const built = buildEnvelopeFromDraft(draft);
    if (!built.ok) {
      setEnvelopeError(built.error);
      return;
    }
    setEnvelopeError(null);
    setCancelledNotice(null);
    inFlightRef.current?.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;
    dispatch({ type: "dry-run/started", envelope: built.envelope });

    try {
      const result = await adapter.dryRun(
        {
          policies: selectPolicies(state),
          schema: AXIOM_SCHEMA_SOURCE,
          envelope: built.envelope,
          routeModes: selectRouteModes(state),
        },
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      dispatch({ type: "dry-run/settled", result });
    } catch {
      if (controller.signal.aborted) return;
      dispatch({
        type: "dry-run/settled",
        result: failureResult({
          status: "error",
          reason:
            "SIMULATION FAILED: the evaluator threw before returning a result. No verdict is displayed.",
          adapterId: adapter.id,
        }),
      });
    }
  };

  const cancelDryRun = (): void => {
    if (!state.dryRunning) return;
    inFlightRef.current?.abort();
    inFlightRef.current = null;
    dispatch({
      type: "dry-run/settled",
      result: failureResult({
        status: "error",
        reason:
          "SIMULATION CANCELLED: the operator cancelled the request. No verdict is displayed.",
        adapterId: adapter.id,
      }),
    });
    setCancelledNotice("SIMULATION CANCELLED — no result was applied.");
  };

  const activate = async (): Promise<void> => {
    const readiness = selectActivationReadiness(state);
    if (!readiness.ready || state.candidateVersion === null) return;
    if (adapter.activateBundle === undefined) {
      setCancelledNotice(
        `ACTIVATION UNAVAILABLE: adapter '${adapter.id}' cannot hot reload a bundle.`,
      );
      return;
    }
    inFlightRef.current?.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;
    dispatch({ type: "activation/started" });

    try {
      const result = await adapter.activateBundle(
        {
          policies: selectPolicies(state),
          schema: AXIOM_SCHEMA_SOURCE,
          routeModes: selectRouteModes(state),
          expectedCandidateVersion: state.candidateVersion,
        },
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      dispatch({ type: "activation/settled", result });
      if (result.activated && result.active !== null) {
        onBundleActivated?.(result.active);
      }
    } catch {
      if (controller.signal.aborted) return;
      const failure: BundleActivationResult = {
        activated: false,
        active: null,
        errors: [
          "HOT RELOAD FAILED: the evaluator threw before returning a result. The live bundle was not changed.",
        ],
        diagnostics: [],
        affectedRoutes: [],
        affectedTools: [],
        contractWarnings: [],
        simulated: false,
      };
      dispatch({ type: "activation/settled", result: failure });
    }
  };

  const formView = selectGuidedFormView(state);
  const activationReadiness = selectActivationReadiness(state);
  const managedAdapters = adapter.capabilities.clientSide && adapter.id === "mock";
  const diagnostics: readonly PolicyDiagnostic[] = [
    ...analyzeCedarText(state.candidateSource),
    ...(state.dryRunResult?.diagnostics ?? []),
  ];
  const routeModes = selectRouteModes(state);
  const simulated = state.dryRunResult?.simulated === true;

  return (
    <MotionConfig reducedMotion="user">
      <div className="ax-studio">
        <header className="ax-row" style={{ gridColumn: "1 / -1", alignItems: "flex-start", width: "100%", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "1rem", marginBottom: "0.25rem" }}>
          <div>
            <p className="ax-overline" style={{ marginBottom: "0.25rem", color: "var(--brand-cyan, #00E5FF)" }}>
              Axiom NHI · Module 1C · Policy Studio
            </p>
            <h1 className="ax-title" style={{ fontSize: "1.5rem", letterSpacing: "-0.02em" }}>Cedar policy authoring &amp; simulation</h1>
            <p className="ax-secondary" style={{ maxWidth: "56rem", marginTop: "0.25rem" }}>
              Policies are simulated against one MCP tools/call envelope, then
              promoted per route. Monaco and its worker are served from the local
              bundle; this page makes no outbound requests.
            </p>
          </div>
          <div className="ax-btn-row" style={{ marginLeft: "auto" }}>
            <span className="ax-badge ax-badge--neutral" title="Proposed wire contract">
              CONTRACT {LOCAL_POLICY_CONTRACT_VERSION}
            </span>
            <span
              className={
                adapter.capabilities.clientSide
                  ? "ax-badge ax-badge--observe"
                  : "ax-badge ax-badge--allow"
              }
            >
              <ShieldIcon width={12} height={12} />
              {adapter.capabilities.clientSide
                ? "IN-BROWSER EVALUATOR"
                : "BACKEND EVALUATOR"}
            </span>
            <span className="ax-mono ax-muted">{adapter.id}</span>
          </div>
        </header>

        {managedAdapters ? (
          <div className="ax-alert ax-alert--info" style={{ gridColumn: "1 / -1" }} role="note">
            <BeakerIcon width={16} height={16} />
            <div>
              <strong>SIMULATED FIXTURE ADAPTER</strong>
              <p>
                Every result on this page is a typed fixture. It is not backend
                evidence and its latency is not a benchmark.
              </p>
            </div>
          </div>
        ) : null}

        {cancelledNotice !== null ? (
          <div className="ax-alert ax-alert--info" style={{ gridColumn: "1 / -1" }} role="status">
            <AlertIcon width={16} height={16} />
            <div>
              <strong>OPERATOR NOTICE</strong>
              <p>{cancelledNotice}</p>
            </div>
          </div>
        ) : null}

        {/* Left Column: Cedar Editor, Guided Policy Form, Route Mode Panel */}
        <div className="ax-stack">
            <section className="ax-card" aria-labelledby="ax-candidate-title">
              <div className="ax-card__header">
                <div>
                  <p className="ax-overline">Candidate bundle</p>
                  <h2 className="ax-card-title" id="ax-candidate-title">
                    Cedar policy source
                  </h2>
                </div>
                <span className="ax-mono ax-muted">1 policy draft</span>
              </div>
              <div className="ax-card__body">
                <CedarEditor
                  value={state.candidateSource}
                  onChange={(source) => dispatch({ type: "source/edited", source })}
                  diagnostics={diagnostics}
                  themeMode={themeMode}
                  ariaLabel="Cedar candidate policy"
                />
                <p className="ax-secondary" style={{ margin: 0, fontSize: "0.75rem" }}>
                  Editor checks are labelled <code className="ax-mono">EDITOR</code>{" "}
                  and are syntax-only. Schema and policy validation always run on
                  the evaluator.
                </p>
              </div>
            </section>

            <GuidedPolicyForm
              state={state.formState}
              onChange={(form: GuidedPolicyFormState) =>
                dispatch({ type: "form/applied", form })
              }
              diverged={formView.diverged}
              markerAvailable={formView.markerAvailable}
              issues={formView.issues}
              disabled={isFormLocked(state)}
              onLoadFromCode={() => dispatch({ type: "form/loaded-from-code" })}
              onRegenerate={() => dispatch({ type: "form/regenerated" })}
            />

            <RouteModePanel
              routes={state.routes}
              disabled={state.activating || state.dryRunning}
              onChange={(routeId: string, mode: RouteMode) =>
                dispatch({ type: "route/mode", routeId, mode })
              }
            />
          </div>

          <div className="ax-stack">
            <section className="ax-card" aria-labelledby="ax-envelope-title">
              <div className="ax-card__header">
                <div>
                  <p className="ax-overline">Dry-run input</p>
                  <h2 className="ax-card-title" id="ax-envelope-title">
                    MCP tools/call envelope
                  </h2>
                </div>
                <span className="ax-badge ax-badge--neutral">redacted facts only</span>
              </div>
              <div className="ax-card__body">
                <div style={{ display: "grid", gap: "0.5rem" }}>
                  <label className="ax-label">
                    Canonical target server
                    <input
                      className="ax-input ax-mono"
                      value={draft.targetServer}
                      spellCheck={false}
                      onChange={(event) =>
                        updateDraft({ targetServer: event.target.value })
                      }
                    />
                  </label>
                  <label className="ax-label">
                    Tool name
                    <input
                      className="ax-input ax-mono"
                      value={draft.toolName}
                      spellCheck={false}
                      onChange={(event) =>
                        updateDraft({ toolName: event.target.value })
                      }
                    />
                  </label>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "0.5rem",
                    }}
                  >
                    <label className="ax-label">
                      Agent id
                      <input
                        className="ax-input ax-mono"
                        value={draft.agentId}
                        spellCheck={false}
                        onChange={(event) =>
                          updateDraft({ agentId: event.target.value })
                        }
                      />
                    </label>
                    <label className="ax-label">
                      Client id
                      <input
                        className="ax-input ax-mono"
                        value={draft.clientId}
                        spellCheck={false}
                        onChange={(event) =>
                          updateDraft({ clientId: event.target.value })
                        }
                      />
                    </label>
                  </div>
                  <label className="ax-label">
                    Runtime mode override
                    <select
                      className="ax-select"
                      value={draft.runtimeMode}
                      onChange={(event) =>
                        updateDraft({
                          runtimeMode: event.target.value as EnvelopeDraft["runtimeMode"],
                        })
                      }
                    >
                      {RUNTIME_MODE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="ax-label">
                    Raw arguments (JSON)
                    <textarea
                      className="ax-textarea ax-mono"
                      rows={6}
                      spellCheck={false}
                      value={draft.argumentsJson}
                      onChange={(event) =>
                        updateDraft({ argumentsJson: event.target.value })
                      }
                    />
                  </label>
                </div>

                <p className="ax-secondary" style={{ margin: 0, fontSize: "0.75rem" }}>
                  Never paste an Authorization header, cookie, API key, or token.
                  Envelopes carry fake or redacted validator facts only; the
                  zero-secret guard rejects secret-bearing argument keys.
                </p>

                {envelopeError !== null ? (
                  <div className="ax-alert ax-alert--error" role="alert">
                    <AlertIcon width={16} height={16} />
                    <div>
                      <strong>ENVELOPE REJECTED</strong>
                      <p>{envelopeError}</p>
                    </div>
                  </div>
                ) : null}

                <div className="ax-btn-row">
                  <button
                    type="button"
                    className="ax-btn ax-btn--primary"
                    disabled={state.dryRunning || state.activating}
                    onClick={() => {
                      void runDryRun();
                    }}
                  >
                    {state.dryRunning ? "Simulating…" : "Simulate Dry Run"}
                  </button>
                  {state.dryRunning ? (
                    <button
                      type="button"
                      className="ax-btn ax-btn--ghost"
                      onClick={cancelDryRun}
                    >
                      Cancel Request
                    </button>
                  ) : null}
                </div>
              </div>
            </section>

            <DryRunPanel
              result={state.dryRunResult}
              running={state.dryRunning}
              error={envelopeError}
            />

            <ActivationPanel
              activeVersion={state.activeVersion}
              candidateVersion={state.candidateVersion}
              candidateSource={state.candidateSource}
              baselineSource={state.baselineSource}
              routeModes={routeModes}
              lastDryRunStatus={state.lastDryRunStatus}
              activating={state.activating}
              activationResult={state.activationResult}
              onActivate={() => {
                void activate();
              }}
            />

            <p className="ax-mono ax-muted" style={{ margin: 0 }}>
              {activationReadiness.ready
                ? "READY: candidate SHA is pinned by the successful simulation."
                : `NOT READY: ${activationReadiness.reason ?? "simulation required."}`}
              {simulated ? " · SIMULATED FIXTURE" : ""}
            </p>
          </div>
      </div>
    </MotionConfig>
  );
}

export { PolicyStudioPage as default };
