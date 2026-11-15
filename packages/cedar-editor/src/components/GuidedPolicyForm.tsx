import { useId, useState, type KeyboardEvent } from "react";
import {
  DESTRUCTIVE_SQL_VERBS,
  SQL_VERBS,
  validateEgressHost,
  validatePathPrefix,
  type EgressHostRule,
  type FormValidationIssue,
  type GuidedPolicyFormState,
  type SqlVerb,
} from "../forms/model.js";
import { TrashIcon, PlusIcon, AlertIcon } from "./icons.js";

export interface GuidedPolicyFormProps {
  readonly state: GuidedPolicyFormState;
  readonly onChange: (next: GuidedPolicyFormState) => void;
  readonly diverged: boolean;
  readonly markerAvailable: boolean;
  readonly issues: readonly FormValidationIssue[];
  readonly disabled?: boolean;
  readonly onLoadFromCode?: () => void;
  readonly onRegenerate: () => void;
}

/**
 * Guided rule builder. Every edit regenerates Cedar text through the parent.
 * When code no longer matches the form (`diverged`), the form is read-only
 * until the operator explicitly loads the code or regenerates.
 */
export function GuidedPolicyForm({
  state,
  onChange,
  diverged,
  markerAvailable,
  issues,
  disabled = false,
  onLoadFromCode,
  onRegenerate,
}: GuidedPolicyFormProps) {
  const [newPrefix, setNewPrefix] = useState("");
  const [newHost, setNewHost] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const prefixInputId = useId();
  const hostInputId = useId();
  const locked = disabled || diverged;

  const toggleVerb = (verb: SqlVerb): void => {
    const current = new Set(state.sql.allowedVerbs);
    if (current.has(verb)) current.delete(verb);
    else current.add(verb);
    onChange({
      ...state,
      sql: { ...state.sql, allowedVerbs: [...current] },
    });
  };

  const addPrefix = (): void => {
    const error = validatePathPrefix(newPrefix.trim());
    if (error !== null) {
      setInputError(error);
      return;
    }
    if (state.path.prefixes.includes(newPrefix.trim())) {
      setInputError("That prefix is already present.");
      return;
    }
    setInputError(null);
    onChange({
      ...state,
      path: { ...state.path, prefixes: [...state.path.prefixes, newPrefix.trim()] },
    });
    setNewPrefix("");
  };

  const addHost = (): void => {
    const error = validateEgressHost(newHost);
    if (error !== null) {
      setInputError(error);
      return;
    }
    const normalized = newHost.trim().toLowerCase();
    if (state.egress.hosts.some((rule) => rule.host === normalized)) {
      setInputError("That egress host is already present.");
      return;
    }
    setInputError(null);
    onChange({
      ...state,
      egress: {
        ...state.egress,
        hosts: [
          ...state.egress.hosts,
          { host: normalized, includeSubdomains: false },
        ],
      },
    });
    setNewHost("");
  };

  const updateHost = (index: number, next: EgressHostRule): void => {
    onChange({
      ...state,
      egress: {
        ...state.egress,
        hosts: state.egress.hosts.map((rule, current) =>
          current === index ? next : rule,
        ),
      },
    });
  };

  const onEnter = (action: () => void) => (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      action();
    }
  };

  return (
    <section className="ax-card" aria-labelledby="ax-guided-rules-title">
      <div className="ax-card__header">
        <div>
          <p className="ax-overline">Module 1C</p>
          <h2 className="ax-card-title" id="ax-guided-rules-title">
            Guided argument rules
          </h2>
        </div>
        {diverged ? (
          <span className="ax-badge ax-badge--pending">
            <AlertIcon />
            DIVERGED / CUSTOM
          </span>
        ) : (
          <span className="ax-badge ax-badge--allow">FORM ACTIVE</span>
        )}
      </div>

      <div className="ax-card__body">
        {diverged ? (
          <div className="ax-alert ax-alert--warning" role="status">
            <div>
              <strong>DIVERGED / CUSTOM POLICY</strong>
              <p>
                Editor text no longer matches the guided form. Form edits are
                disabled so operator code is never silently overwritten.
              </p>
              <div className="ax-btn-row" style={{ marginTop: "0.5rem" }}>
                {markerAvailable && onLoadFromCode !== undefined ? (
                  <button
                    type="button"
                    className="ax-btn ax-btn--ghost"
                    onClick={onLoadFromCode}
                  >
                    Load Form From Code
                  </button>
                ) : (
                  <span className="ax-secondary">
                    No form marker in this document; it cannot be loaded into the
                    form.
                  </span>
                )}
                {confirmRegenerate ? (
                  <>
                    <span className="ax-secondary">
                      Overwrite the editor with generated policy?
                    </span>
                    <button
                      type="button"
                      className="ax-btn ax-btn--danger"
                      onClick={() => {
                        setConfirmRegenerate(false);
                        onRegenerate();
                      }}
                    >
                      Confirm Overwrite
                    </button>
                    <button
                      type="button"
                      className="ax-btn ax-btn--ghost"
                      onClick={() => setConfirmRegenerate(false)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="ax-btn"
                    onClick={() => setConfirmRegenerate(true)}
                  >
                    Regenerate From Form
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {issues.length > 0 ? (
          <div className="ax-alert ax-alert--error" role="alert">
            <div>
              <strong>FORM INCOMPLETE</strong>
              <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                {issues.map((issue) => (
                  <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        <div className="ax-form-rule">
          <div className="ax-form-rule__head">
            <span className="ax-form-rule__title">
              <RuleSwitch
                checked={state.sql.enabled}
                disabled={locked}
                label="SQL verb allowlist enabled"
                onChange={(enabled) =>
                  onChange({ ...state, sql: { ...state.sql, enabled } })
                }
              />
              SQL verb allowlist
            </span>
            <span className="ax-mono ax-muted">
              context.sql_verbs
            </span>
          </div>
          <p className="ax-secondary" style={{ margin: 0, fontSize: "0.78125rem" }}>
            Permits only when every verb returned by Team 4&apos;s SQL AST
            parser is inside this set. The browser does not parse SQL.
          </p>
          <div className="ax-chip-row" role="group" aria-label="Allowed SQL verbs">
            {SQL_VERBS.map((verb) => {
              const pressed = state.sql.allowedVerbs.includes(verb);
              const destructive = DESTRUCTIVE_SQL_VERBS.includes(verb);
              return (
                <button
                  key={verb}
                  type="button"
                  className={`ax-chip${destructive ? " ax-chip--destructive" : ""}`}
                  aria-pressed={pressed}
                  disabled={locked || !state.sql.enabled}
                  onClick={() => toggleVerb(verb)}
                >
                  {verb}
                </button>
              );
            })}
          </div>
        </div>

        <div className="ax-form-rule">
          <div className="ax-form-rule__head">
            <span className="ax-form-rule__title">
              <RuleSwitch
                checked={state.path.enabled}
                disabled={locked}
                label="Filesystem path boundary enabled"
                onChange={(enabled) =>
                  onChange({ ...state, path: { ...state.path, enabled } })
                }
              />
              Filesystem root boundaries
            </span>
            <span className="ax-mono ax-muted">context.normalized_path</span>
          </div>
          <ul className="ax-list">
            {state.path.prefixes.map((prefix) => (
              <li className="ax-list__item" key={prefix}>
                <code className="ax-mono" style={{ flex: 1 }}>
                  {prefix}
                </code>
                <button
                  type="button"
                  className="ax-icon-btn"
                  aria-label={`Remove path prefix ${prefix}`}
                  disabled={locked || !state.path.enabled}
                  onClick={() =>
                    onChange({
                      ...state,
                      path: {
                        ...state.path,
                        prefixes: state.path.prefixes.filter((entry) => entry !== prefix),
                      },
                    })
                  }
                >
                  <TrashIcon width={12} height={12} />
                </button>
              </li>
            ))}
          </ul>
          <div className="ax-row">
            <label className="ax-label" htmlFor={prefixInputId} style={{ flex: 1 }}>
              Add root directory prefix
              <input
                id={prefixInputId}
                className="ax-input ax-mono"
                value={newPrefix}
                placeholder="/srv/axiom-mock/data"
                disabled={locked || !state.path.enabled}
                onChange={(event) => setNewPrefix(event.target.value)}
                onKeyDown={onEnter(addPrefix)}
              />
            </label>
            <button
              type="button"
              className="ax-btn ax-btn--ghost"
              disabled={locked || !state.path.enabled || newPrefix.trim().length === 0}
              onClick={addPrefix}
              style={{ alignSelf: "flex-end" }}
            >
              <PlusIcon width={12} height={12} />
              Add Prefix
            </button>
          </div>
        </div>

        <div className="ax-form-rule">
          <div className="ax-form-rule__head">
            <span className="ax-form-rule__title">
              <RuleSwitch
                checked={state.egress.enabled}
                disabled={locked}
                label="Outbound egress allowlist enabled"
                onChange={(enabled) =>
                  onChange({ ...state, egress: { ...state.egress, enabled } })
                }
              />
              Outbound HTTP egress allowlist
            </span>
            <span className="ax-mono ax-muted">context.egress_domain</span>
          </div>
          <ul className="ax-list">
            {state.egress.hosts.map((rule, index) => (
              <li className="ax-list__item" key={`${rule.host}-${index}`}>
                <code className="ax-mono" style={{ flex: 1 }}>
                  {rule.host}
                </code>
                <label className="ax-check">
                  <input
                    type="checkbox"
                    checked={rule.includeSubdomains}
                    disabled={locked || !state.egress.enabled}
                    onChange={(event) =>
                      updateHost(index, {
                        ...rule,
                        includeSubdomains: event.target.checked,
                      })
                    }
                  />
                  subdomains
                </label>
                <button
                  type="button"
                  className="ax-icon-btn"
                  aria-label={`Remove egress host ${rule.host}`}
                  disabled={locked || !state.egress.enabled}
                  onClick={() =>
                    onChange({
                      ...state,
                      egress: {
                        ...state.egress,
                        hosts: state.egress.hosts.filter((_, current) => current !== index),
                      },
                    })
                  }
                >
                  <TrashIcon width={12} height={12} />
                </button>
              </li>
            ))}
          </ul>
          <div className="ax-row">
            <label className="ax-label" htmlFor={hostInputId} style={{ flex: 1 }}>
              Add egress hostname
              <input
                id={hostInputId}
                className="ax-input ax-mono"
                value={newHost}
                placeholder="api.mock.invalid"
                disabled={locked || !state.egress.enabled}
                onChange={(event) => setNewHost(event.target.value)}
                onKeyDown={onEnter(addHost)}
              />
            </label>
            <button
              type="button"
              className="ax-btn ax-btn--ghost"
              disabled={locked || !state.egress.enabled || newHost.trim().length === 0}
              onClick={addHost}
              style={{ alignSelf: "flex-end" }}
            >
              <PlusIcon width={12} height={12} />
              Add Host
            </button>
          </div>
        </div>

        {inputError !== null ? (
          <p className="ax-field-error" role="alert">
            {inputError}
          </p>
        ) : null}

        <p className="ax-secondary" style={{ margin: 0, fontSize: "0.75rem" }}>
          Generated policy always requires{" "}
          <code className="ax-mono">context.validator_passed == true</code>,{" "}
          <code className="ax-mono">context.tool_pin_verified == true</code>, and
          the selected boundary facts. Schema and policy validation still run on
          the backend.
        </p>
      </div>
    </section>
  );
}

interface RuleSwitchProps {
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly label: string;
  readonly onChange: (next: boolean) => void;
}

function RuleSwitch({ checked, disabled, label, onChange }: RuleSwitchProps) {
  return (
    <button
      type="button"
      className="ax-switch"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="ax-switch__thumb" />
    </button>
  );
}
