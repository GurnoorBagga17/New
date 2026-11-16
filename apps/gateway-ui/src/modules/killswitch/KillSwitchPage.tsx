// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
import { useCallback, useEffect, useState, type FormEvent } from "react";

type TargetKind = "global" | "mcp_server" | "agent" | "tool";
interface RevocationEntry {
  target_kind: TargetKind;
  target_id: string;
  revoked: boolean;
  state_version: number;
  effective_unix_ms: number;
  reason: string;
}
interface RevocationResponse {
  state_version: number;
  revoked_count: number;
  entries: RevocationEntry[];
}

export function KillSwitchPage() {
  const [targetKind, setTargetKind] = useState<TargetKind>("agent");
  const [targetId, setTargetId] = useState("");
  const [reason, setReason] = useState("");
  const [action, setAction] = useState<"revoke" | "clear">("revoke");
  const [entries, setEntries] = useState<RevocationEntry[]>([]);
  const [stateVersion, setStateVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/v1/local/revocations", {
        headers: { Accept: "application/json" },
        cache: "no-store",
        credentials: "same-origin",
        redirect: "error",
      });
      if (!response.ok) throw new Error(`Revocation API returned HTTP ${response.status}.`);
      const data = (await response.json()) as RevocationResponse;
      if (!Array.isArray(data.entries) || typeof data.state_version !== "number") {
        throw new Error("Revocation API response did not match the expected shape.");
      }
      setEntries(data.entries);
      setStateVersion(data.state_version);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load revocation state.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/v1/local/revocations", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ action, target_kind: targetKind, target_id: targetKind === "global" ? "*" : targetId, reason }),
        cache: "no-store",
        credentials: "same-origin",
        redirect: "error",
      });
      const result = (await response.json()) as { status?: string; state_version?: number; persisted?: boolean; audit_enqueued?: boolean; message?: string };
      if (!response.ok) throw new Error(result.message || `Revocation API returned HTTP ${response.status}.`);
      const storage = result.persisted ? "saved to persistent state" : "updated in memory; persistence was not confirmed";
      const audit = result.audit_enqueued ? "audit record queued" : "audit queue did not confirm delivery";
      setNotice(`${result.status === "already_in_desired_state" ? "No change was needed" : action === "revoke" ? "Revocation applied" : "Revocation cleared"} · version ${result.state_version} · ${storage} · ${audit}.`);
      setTargetId("");
      setReason("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Revocation request failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="border-b border-border-subtle pb-5">
        <p className="font-mono text-[10px] uppercase tracking-wider text-brand-cyan">EMERGENCY CONTAINMENT · RUNTIME API</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-text-primary">Revocation controls</h1>
        <p className="mt-1 text-sm text-text-secondary">Revocations block new protected calls in the shared runtime store. They do not cancel work already in progress.</p>
      </header>

      {error && <div role="alert" className="rounded-card border border-state-deny/40 bg-state-deny-tint/10 p-3 text-sm text-state-deny">{error}</div>}
      {notice && <div role="status" className="rounded-card border border-state-enforce/40 bg-state-enforce-tint/10 p-3 text-sm text-state-enforce">{notice}</div>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <form onSubmit={submit} className="space-y-4 rounded-card border border-state-deny/40 bg-surface-1 p-5">
          <div><p className="font-mono text-[9px] uppercase tracking-wider text-state-deny">REVOCATION REQUEST</p><h2 className="mt-2 font-display text-lg font-semibold text-text-primary">Choose scope and document why.</h2></div>
          <label className="block text-xs text-text-secondary">Target scope<select value={targetKind} onChange={(event) => setTargetKind(event.target.value as TargetKind)} className="mt-1 w-full rounded-input border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-primary"><option value="agent">Agent identity</option><option value="mcp_server">MCP server</option><option value="tool">Tool (server/tool)</option><option value="global">Global runtime</option></select></label>
          {targetKind !== "global" && <label className="block text-xs text-text-secondary">Target ID<input required value={targetId} onChange={(event) => setTargetId(event.target.value)} placeholder={targetKind === "tool" ? "mcp://prod-db/query" : targetKind === "mcp_server" ? "mcp://prod-db" : "agent subject ID"} className="mt-1 w-full rounded-input border border-border-subtle bg-surface-2 px-3 py-2 font-mono text-xs text-text-primary placeholder:text-text-muted" /></label>}
          <label className="block text-xs text-text-secondary">Operator reason<textarea required minLength={1} maxLength={2048} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Describe the observed risk and intended scope." className="mt-1 min-h-28 w-full rounded-input border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted" /></label>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4"><label className="flex items-center gap-2 text-xs text-text-secondary">Action<select value={action} onChange={(event) => setAction(event.target.value as "revoke" | "clear")} className="rounded-input border border-border-subtle bg-surface-2 px-2 py-1.5 text-xs text-text-primary"><option value="revoke">Revoke</option><option value="clear">Clear revocation</option></select></label><button disabled={submitting} className="rounded-input border border-state-deny/50 bg-state-deny-tint/20 px-4 py-2 text-xs font-semibold text-state-deny disabled:cursor-wait disabled:opacity-50">{submitting ? "Applying…" : action === "revoke" ? "Apply revocation" : "Clear revocation"}</button></div>
          <p className="text-[10px] text-text-muted">Requests are authorized by the local admin bearer token. Operator identity comes from the runtime configuration, not this form.</p>
        </form>

        <section className="rounded-card border border-border-subtle bg-surface-1 p-5" aria-labelledby="revocations-heading">
          <div className="flex items-center justify-between gap-3"><div><p className="font-mono text-[9px] uppercase tracking-wider text-brand-cyan">LIVE RUNTIME STATE</p><h2 id="revocations-heading" className="mt-1 font-display text-lg font-semibold text-text-primary">Revocation entries</h2></div><button type="button" onClick={() => void refresh()} className="rounded-input border border-border-subtle bg-surface-2 px-3 py-1.5 text-xs text-text-secondary">Refresh</button></div>
          <p className="mt-2 font-mono text-[10px] text-text-muted">{stateVersion === null ? "State version unavailable" : `State version ${stateVersion}`}</p>
          {loading ? <p className="mt-6 text-sm text-text-muted">Loading runtime state…</p> : entries.length === 0 ? <p className="mt-6 rounded-input border border-border-subtle bg-surface-2 p-4 text-sm text-text-secondary">No revocation records are stored.</p> : <div className="mt-4 space-y-3">{[...entries].reverse().map((entry) => <article key={`${entry.target_kind}:${entry.target_id}`} className={`rounded-input border p-4 ${entry.revoked ? "border-state-deny/40 bg-state-deny-tint/5" : "border-border-subtle bg-surface-2 opacity-75"}`}><div className="flex items-center justify-between gap-3"><span className="font-mono text-[9px] uppercase tracking-wider text-text-muted">{entry.target_kind} · v{entry.state_version}</span><span className={`rounded-full border px-2 py-0.5 font-mono text-[9px] ${entry.revoked ? "border-state-deny/40 text-state-deny" : "border-state-enforce/40 text-state-enforce"}`}>{entry.revoked ? "ACTIVE BLOCK" : "CLEARED"}</span></div><p className="mt-2 break-all font-mono text-xs text-text-primary">{entry.target_id}</p><p className="mt-2 text-xs text-text-secondary">{entry.reason}</p><time className="mt-2 block font-mono text-[9px] text-text-muted">{new Date(entry.effective_unix_ms).toLocaleString()}</time></article>)}</div>}
          <p className="mt-4 text-[10px] leading-relaxed text-text-muted">This control blocks new calls observed by this runtime instance. It does not revoke upstream credentials or terminate in-flight MCP calls.</p>
        </section>
      </div>
    </div>
  );
}
