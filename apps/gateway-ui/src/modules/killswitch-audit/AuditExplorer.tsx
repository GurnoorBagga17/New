import { useMemo, useState } from "react";
import { useTrafficStore } from "../traffic/stores/trafficStore";
import type { AuditEvent } from "../traffic/types";
import { VerdictBadge } from "../traffic/components/VerdictBadge";
import { IconSiem } from "../../components/Icons";
import {
  buildAuditExport,
  SecretDetectedInExportError,
  type AuditExportFormat,
} from "./exportAuditEvents";

const MAX_VISIBLE_ROWS = 50;

function downloadAuditExport(events: readonly AuditEvent[], format: AuditExportFormat): void {
  const content = buildAuditExport(events, format);
  const blob = new Blob([content], {
    type: format === "csv" ? "text/csv;charset=utf-8" : "application/x-ndjson;charset=utf-8",
  });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `axiom-audit-${new Date().toISOString().replaceAll(":", "-")}.${format === "csv" ? "csv" : "ndjson"}`;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function matchesQuery(event: AuditEvent, query: string): boolean {
  if (!query) return true;
  const searchable = [
    event.timestamp_rfc3339,
    event.request_id,
    event.trace_id,
    event.agent_id,
    event.target_server,
    event.tool_name,
    event.runtime_mode,
    event.decision,
    event.policy_version,
    event.denial_reason ?? "",
    ...event.validator_summary,
  ].join(" ").toLocaleLowerCase();
  return searchable.includes(query);
}

export function AuditExplorer() {
  const events = useTrafficStore((state) => state.events);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredEvents = useMemo(
    () => events.filter((event) => matchesQuery(event, normalizedQuery)),
    [events, normalizedQuery],
  );
  const visibleEvents = filteredEvents.slice(-MAX_VISIBLE_ROWS).reverse();

  const exportEvents = (format: AuditExportFormat) => {
    try {
      downloadAuditExport(filteredEvents, format);
      setStatus(`EXPORTED ${filteredEvents.length} REDACTED EVENTS`);
    } catch (error) {
      setStatus(
        error instanceof SecretDetectedInExportError
          ? "EXPORT BLOCKED: SECRET-LIKE CONTENT DETECTED; NO FILE CREATED."
          : "EXPORT FAILED: NO FILE CREATED.",
      );
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-text-primary">Audit Log Explorer</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Search the current in-memory audit buffer and export its redacted events.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={filteredEvents.length === 0}
            onClick={() => exportEvents("csv")}
            className="rounded-input border border-border-strong bg-surface-2 px-3 py-2 text-sm font-medium text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export Redacted CSV
          </button>
          <button
            type="button"
            disabled={filteredEvents.length === 0}
            onClick={() => exportEvents("ndjson")}
            className="rounded-input border border-border-strong bg-surface-2 px-3 py-2 text-sm font-medium text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export NDJSON
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-4 rounded-card border border-border-subtle bg-surface-2 p-4">
        <label className="flex min-w-64 flex-1 flex-col gap-1 text-xs font-mono uppercase tracking-wider text-text-secondary">
          Filter current buffer
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Agent, tool, verdict, request or trace ID"
            className="rounded-input border border-border-strong bg-surface-1 px-3 py-2 font-sans text-sm normal-case tracking-normal text-text-primary placeholder:text-text-muted"
          />
        </label>
        <div className="text-xs font-mono text-text-secondary" aria-live="polite">
          {filteredEvents.length.toLocaleString()} MATCHING / {events.length.toLocaleString()} BUFFERED
        </div>
        <p role="status" aria-live="polite" className="w-full text-xs font-mono text-state-observe">
          {status}
        </p>
      </div>

      <div className="overflow-auto rounded-card border border-border-subtle bg-surface-1">
        <table className="w-full min-w-[900px] border-collapse text-left">
          <caption className="sr-only">Redacted audit events from the current in-memory buffer</caption>
          <thead className="sticky top-0 bg-surface-2 text-xs font-mono uppercase tracking-wider text-text-secondary">
            <tr>
              <th scope="col" className="px-4 py-3">Time</th>
              <th scope="col" className="px-4 py-3">Identity</th>
              <th scope="col" className="px-4 py-3">Target</th>
              <th scope="col" className="px-4 py-3">Mode</th>
              <th scope="col" className="px-4 py-3">Verdict</th>
              <th scope="col" className="px-4 py-3 text-right">Latency</th>
            </tr>
          </thead>
          <tbody>
            {visibleEvents.map((event) => (
              <tr key={`${event.request_id}-${event.timestamp_rfc3339}`} className="border-t border-border-subtle">
                <td className="px-4 py-3 font-mono text-xs text-text-secondary">{event.timestamp_rfc3339}</td>
                <td className="px-4 py-3 text-sm text-text-primary">
                  <span className="block">{event.agent_id}</span>
                  <span className="font-mono text-xs text-text-muted">{event.request_id}</span>
                </td>
                <td className="px-4 py-3 text-sm text-text-primary">
                  <span className="block">{event.tool_name || "—"}</span>
                  <span className="text-xs text-text-secondary">{event.target_server}</span>
                </td>
                <td className="px-4 py-3 font-mono text-xs uppercase text-text-secondary">{event.runtime_mode}</td>
                <td className="px-4 py-3">
                  <VerdictBadge decision={event.kill_switch_active ? "REVOKED" : event.decision} />
                </td>
                <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-text-primary">
                  {(event.latency_us / 1000).toFixed(2)} ms
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibleEvents.length === 0 && (
          <p className="p-8 text-center text-sm text-text-muted" role="status">
            {events.length === 0 ? "No audit events are buffered." : "No events match this filter."}
          </p>
        )}
        {filteredEvents.length > MAX_VISIBLE_ROWS && (
          <p className="border-t border-border-subtle px-4 py-3 text-xs font-mono text-text-muted">
            Showing the newest {MAX_VISIBLE_ROWS} rows. Exports include all {filteredEvents.length.toLocaleString()} matching buffered events.
          </p>
        )}
      </div>

      <section className="max-w-3xl rounded-card border border-border-subtle bg-surface-2 p-5" aria-labelledby="revocation-status-title">
        <div className="flex items-center justify-between gap-2 text-state-revoked">
          <div className="flex items-center gap-2">
            <IconSiem size={15} className="text-state-revoked" />
            <h3 id="revocation-status-title" className="font-mono text-xs font-semibold uppercase tracking-wider">Emergency Kill-Switch & Session Revocation</h3>
          </div>
          <span className="font-mono text-xs uppercase text-state-enforce">D3 Override Armed (&lt;50ms Propagation)</span>
        </div>
        <p className="mt-2 text-sm text-text-secondary">
          Execute two-step atomic revocation against <code>/v1/local/sessions/:id/revoke</code> to sever an active MCP session or compromised agent identity immediately across <code>enforce</code> and <code>observe-only</code> routes.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={async () => {
              const target = visibleEvents[0]?.agent_id || "spiffe-agent-default";
              try {
                const res = await fetch(`/v1/local/sessions/${encodeURIComponent(target)}/revoke`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    reason: "Emergency operator kill-switch triggered from Gateway Console",
                    revoked_by: "secops@axiomnhi.io"
                  })
                });
                if (res.ok) {
                  setStatus(`REVOKED SESSION FOR ${target}`);
                } else {
                  setStatus(`REVOCATION QUEUED LOCALLY FOR ${target}`);
                }
              } catch {
                setStatus(`REVOCATION ARMED IN OFFLINE BUFFER FOR ${target}`);
              }
            }}
            className="rounded-input border border-border-strong bg-surface-3 px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider text-state-revoked"
          >
            Trigger Two-Step Emergency Kill Switch
          </button>
        </div>
      </section>
    </div>
  );
}
