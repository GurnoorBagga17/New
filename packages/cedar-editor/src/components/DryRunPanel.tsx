import type { DryRunResult } from "../types.js";
import { VerdictBadge } from "./VerdictBadge.js";
import { AlertIcon, BeakerIcon, ClockIcon, ShieldIcon } from "./icons.js";

export interface DryRunPanelProps {
  readonly result: DryRunResult | null;
  readonly running: boolean;
  readonly error?: string | null;
}

const EMPTY_COPY =
  "NO SIMULATION RUN — enter an MCP tools/call envelope, then select Simulate Dry Run.";

/**
 * Dry-run result panel. All facts are rendered from the evaluator response;
 * the panel never computes SQL classes, path normalisation, egress verdicts, or
 * blast radius on its own.
 */
export function DryRunPanel({ result, running, error = null }: DryRunPanelProps) {
  return (
    <section className="ax-card" aria-labelledby="ax-dryrun-title">
      <div className="ax-card__header">
        <div>
          <p className="ax-overline">/v1/local/policies/dry-run</p>
          <h2 className="ax-card-title" id="ax-dryrun-title">
            Simulation result
          </h2>
        </div>
        <VerdictBadge
          verdict={result?.verdict ?? null}
          status={result?.status ?? "ok"}
        />
      </div>

      <div className="ax-card__body" aria-live="polite">
        {running ? (
          <div role="status" style={{ display: "grid", gap: "0.5rem" }}>
            <div className="ax-loading-bar" />
            <p className="ax-mono" style={{ margin: 0 }}>
              SIMULATING • POST /v1/local/policies/dry-run
            </p>
            <p className="ax-secondary" style={{ margin: 0 }}>
              No active policy state is mutated.
            </p>
          </div>
        ) : null}

        {!running && error !== null ? (
          <div className="ax-alert ax-alert--error" role="alert">
            <AlertIcon width={16} height={16} />
            <div>
              <strong>SIMULATION BLOCKED</strong>
              <p>{error}</p>
            </div>
          </div>
        ) : null}

        {!running && error === null && result === null ? (
          <div role="status">
            <p className="ax-overline" style={{ marginTop: 0 }}>
              EMPTY
            </p>
            <p className="ax-secondary" style={{ margin: 0 }}>
              {EMPTY_COPY}
            </p>
          </div>
        ) : null}

        {!running && result !== null ? <ResultBody result={result} /> : null}
      </div>
    </section>
  );
}

function ResultBody({ result }: { readonly result: DryRunResult }) {
  const failure =
    result.status === "timeout" ||
    result.status === "unavailable" ||
    result.status === "contract_mismatch" ||
    result.status === "error";

  return (
    <>
      {failure ? (
        <div className="ax-alert ax-alert--error" role="alert" data-testid="dryrun-failure">
          <AlertIcon width={16} height={16} />
          <div>
            <strong>
              {result.status === "timeout"
                ? "FAIL-CLOSED: TIMEOUT"
                : result.status === "unavailable"
                  ? "FAIL-CLOSED: UNAVAILABLE"
                  : result.status === "contract_mismatch"
                    ? "CONTRACT MISMATCH"
                    : "NO DECISION"}
            </strong>
            <p>{result.reason}</p>
            <p className="ax-mono ax-muted" style={{ marginTop: "0.375rem" }}>
              {result.adapterId} • {result.correlationId}
            </p>
          </div>
        </div>
      ) : null}

      {result.status === "invalid" ? (
        <div className="ax-alert ax-alert--error" role="alert">
          <AlertIcon width={16} height={16} />
          <div>
            <strong>POLICY INVALID — NOT EVALUATED</strong>
            <p>{result.reason}</p>
          </div>
        </div>
      ) : null}

      {result.status === "ok" ? (
        <div style={{ display: "grid", gap: "0.5rem" }}>
          <div className="ax-row" style={{ justifyContent: "flex-start" }}>
            <VerdictBadge verdict={result.verdict} status={result.status} />
            <span className="ax-mono ax-muted">
              {result.decision ?? "NO DECISION"}
            </span>
            {result.verdictSource === "derived" ? (
              <span className="ax-badge ax-badge--neutral" title="Team 0 D4 pending">
                DERIVED FROM MODE
              </span>
            ) : null}
          </div>
          <p style={{ margin: 0 }}>{result.reason}</p>
        </div>
      ) : null}

      <dl className="ax-facts">
        <dt>Matched</dt>
        <dd className="ax-mono">
          {result.matchedPolicyIds.length > 0
            ? result.matchedPolicyIds.join(", ")
            : "none reported"}
        </dd>
        <dt>Latency</dt>
        <dd className="ax-mono">
          {result.simulated
            ? "— simulated fixture"
            : result.evaluationLatencyUs === null
              ? "not reported by evaluator"
              : `${result.evaluationLatencyUs} µs engine time`}
        </dd>
        <dt>Candidate SHA</dt>
        <dd className="ax-mono">{result.candidateVersion ?? "not reported"}</dd>
        <dt>Active SHA</dt>
        <dd className="ax-mono">{result.activeVersion ?? "not reported"}</dd>
        <dt>Adapter</dt>
        <dd className="ax-mono">{result.adapterId}</dd>
      </dl>

      <hr className="ax-divider" />

      <section aria-labelledby="ax-facts-title">
        <p className="ax-overline" id="ax-facts-title" style={{ marginTop: 0 }}>
          Validator facts returned by the evaluator
        </p>
        <dl className="ax-facts">
          <dt>SQL</dt>
          <dd className="ax-mono">
            {result.validatorFacts.sql.present
              ? `${result.validatorFacts.sql.verbs.join(", ") || "no verbs"} • ${result.validatorFacts.sql.statementCount} stmt • ${
                  result.validatorFacts.sql.isReadonly === true
                    ? "READ-ONLY"
                    : result.validatorFacts.sql.isReadonly === false
                      ? "NOT READ-ONLY"
                      : "READ-ONLY UNKNOWN"
                }`
              : "no SQL validation evidence"}
          </dd>
          <dt>Tables</dt>
          <dd className="ax-mono">
            {result.validatorFacts.sql.tables.length > 0
              ? result.validatorFacts.sql.tables.join(", ")
              : "—"}
          </dd>
          <dt>Path</dt>
          <dd className="ax-mono">
            {result.validatorFacts.path.normalizedPath ?? "—"}{" "}
            {result.validatorFacts.path.traversalDetected
              ? "• TRAVERSAL DETECTED"
              : "• traversal not detected"}
          </dd>
          <dt>Egress</dt>
          <dd className="ax-mono">
            {result.validatorFacts.egress.domain ?? "—"}{" "}
            {result.validatorFacts.egress.privateIp
              ? "• PRIVATE/METADATA IP"
              : "• private IP not detected"}
          </dd>
          <dt>Tool pin</dt>
          <dd className="ax-mono">
            {result.validatorFacts.toolPin.sha256 ?? "no digest reported"}{" "}
            {result.validatorFacts.toolPin.verified === null
              ? "• verification not reported"
              : result.validatorFacts.toolPin.verified
                ? "• VERIFIED"
                : "• NOT VERIFIED"}
          </dd>
        </dl>
      </section>

      {result.validatorFacts.raw.length > 0 ? (
        <details>
          <summary className="ax-overline" style={{ cursor: "pointer" }}>
            Validator results ({result.validatorFacts.raw.length})
          </summary>
          <ul className="ax-list" style={{ marginTop: "0.5rem" }}>
            {result.validatorFacts.raw.map((validator, index) => (
              <li
                key={`${validator.validator_id}-${index}`}
                style={{ display: "grid", gap: "0.125rem" }}
              >
                <span className="ax-mono">
                  {validator.validator_id} •{" "}
                  {validator.passed ? "PASSED" : "FAILED"}
                  {validator.violation_code !== null
                    ? ` • ${validator.violation_code}`
                    : ""}
                </span>
                {validator.reason !== null ? (
                  <span className="ax-secondary">{validator.reason}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {result.diagnostics.length > 0 ? (
        <section aria-labelledby="ax-errors-title">
          <p className="ax-overline" id="ax-errors-title" style={{ marginTop: 0 }}>
            Policy diagnostics (verbatim)
          </p>
          <ul className="ax-list">
            {result.diagnostics.map((diagnostic, index) => (
              <li key={`${diagnostic.code}-${index}`} className="ax-alert ax-alert--error">
                <div>
                  <strong>
                    {diagnostic.code}
                    {diagnostic.line !== undefined
                      ? ` • LINE ${diagnostic.line}`
                      : ""}
                    {diagnostic.column !== undefined
                      ? `:${diagnostic.column}`
                      : ""}
                  </strong>
                  <p className="ax-mono">{diagnostic.message}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="ax-blast-title">
        <p className="ax-overline" id="ax-blast-title" style={{ marginTop: 0 }}>
          Blast radius — reported by evaluator only
        </p>
        {result.affectedRoutes.length === 0 && result.affectedTools.length === 0 ? (
          <p className="ax-secondary" style={{ margin: 0 }}>
            Not reported by the evaluator. No client-side blast radius is
            computed.
          </p>
        ) : (
          <dl className="ax-facts">
            <dt>Routes</dt>
            <dd className="ax-mono">
              {result.affectedRoutes.length > 0
                ? result.affectedRoutes.join(", ")
                : "none reported"}
            </dd>
            <dt>Tools</dt>
            <dd className="ax-mono">
              {result.affectedTools.length > 0
                ? result.affectedTools.join(", ")
                : "none reported"}
            </dd>
          </dl>
        )}
      </section>

      {result.contractWarnings.length > 0 ? (
        <div className="ax-alert ax-alert--warning" role="status">
          <AlertIcon width={16} height={16} />
          <div>
            <strong>CONTRACT WARNING — Team 0 action item</strong>
            <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
              {result.contractWarnings.map((warning, index) => (
                <li key={`${warning}-${index}`} className="ax-mono">
                  {warning}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {result.simulated ? (
        <div className="ax-alert ax-alert--info" role="note">
          <BeakerIcon width={16} height={16} />
          <div>
            <strong>SIMULATED FIXTURE — not a benchmark</strong>
            <p>
              This payload came from the mock adapter. It is not backend
              evidence and its latency is not a performance measurement.
            </p>
          </div>
        </div>
      ) : null}

      <p className="ax-mono ax-muted" style={{ margin: 0 }}>
        <ShieldIcon width={12} height={12} aria-hidden="true" /> correlation{" "}
        {result.correlationId}
        {result.status === "timeout" ? (
          <>
            {" "}
            <ClockIcon width={12} height={12} aria-hidden="true" /> fail-closed
          </>
        ) : null}
      </p>
    </>
  );
}
