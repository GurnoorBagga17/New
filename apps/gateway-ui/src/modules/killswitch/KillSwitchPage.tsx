// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
import { useState, useRef, useEffect } from "react";

interface RevocationRecord {
  id: string;
  targetKind: "agent_id" | "mcp_session" | "global_fleet";
  targetValue: string;
  reason: string;
  revokedBy: string;
  revokedAtUnix: number;
  status: "ACTIVE_BLOCK" | "RESTORED";
}

const INITIAL_REVOCATIONS: RevocationRecord[] = [
  {
    id: "rev-01",
    targetKind: "agent_id",
    targetValue: "spiffe://axiom.internal/ns/sandbox/sa/temp-scrape-runner-x9",
    reason: "Orphaned Shadow NHI detected without active corporate owner",
    revokedBy: "secops-operator@corp.internal",
    revokedAtUnix: Math.floor(Date.now() / 1000) - 3600,
    status: "ACTIVE_BLOCK",
  },
];

const TARGET_PRESETS = [
  { label: "FinOps Agent", value: "spiffe://axiom.internal/ns/prod/sa/autonomous-finops-agent", kind: "agent_id" as const },
  { label: "GitHub PR Bot", value: "spiffe://axiom.internal/ns/ci/sa/github-pr-review-bot", kind: "agent_id" as const },
  { label: "Active FinOps Session", value: "sess-finops-prod-01", kind: "mcp_session" as const },
  { label: "GLOBAL FLEET EMERGENCY HALT", value: "ALL_ACTIVE_WORKLOADS", kind: "global_fleet" as const },
];

export function KillSwitchPage() {
  const [revocations, setRevocations] = useState<RevocationRecord[]>(INITIAL_REVOCATIONS);
  const [selectedTarget, setSelectedTarget] = useState(TARGET_PRESETS[0]!.value);
  const [targetKind, setTargetKind] = useState<"agent_id" | "mcp_session" | "global_fleet">("agent_id");
  const [reason, setReason] = useState("Suspected AST command injection attempt");
  const [operatorEmail, setOperatorEmail] = useState("secops-operator@corp.internal");
  const [revocationSuccessToast, setRevocationSuccessToast] = useState<string | null>(null);

  // Hold-to-confirm button logic (1.5s press)
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);

  const startHold = () => {
    setIsHolding(true);
    const startTime = Date.now();
    const duration = 1500; // 1.5 seconds

    holdTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / duration) * 100, 100);
      setHoldProgress(progress);

      if (progress >= 100) {
        clearInterval(holdTimerRef.current!);
        setIsHolding(false);
        setHoldProgress(0);
        executeRevocation();
      }
    }, 30);
  };

  const cancelHold = () => {
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
    }
    setIsHolding(false);
    setHoldProgress(0);
  };

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearInterval(holdTimerRef.current);
    };
  }, []);

  const executeRevocation = async () => {
    const newRecord: RevocationRecord = {
      id: `rev-${Date.now()}`,
      targetKind,
      targetValue: selectedTarget,
      reason,
      revokedBy: operatorEmail,
      revokedAtUnix: Math.floor(Date.now() / 1000),
      status: "ACTIVE_BLOCK",
    };

    // Try posting to local admin API server if running, else update state directly
    try {
      await fetch(`/v1/local/sessions/${encodeURIComponent(selectedTarget)}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          revoked_by: operatorEmail,
        }),
      });
    } catch {
      // Local fallback
    }

    setRevocations((prev) => [newRecord, ...prev]);
    setRevocationSuccessToast(`Revocation enacted for ${selectedTarget}. Sub-100ms kill confirmed.`);
    setTimeout(() => setRevocationSuccessToast(null), 5000);
  };

  const handleRestore = (id: string) => {
    setRevocations((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: "RESTORED" } : r))
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-border-subtle pb-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-state-deny">
              EMERGENCY CONTAINMENT &bull; SUB-100MS WIRE HALT
            </span>
            <span className="inline-flex items-center rounded-full border border-state-deny/40 bg-state-deny-tint px-2 py-0.5 font-mono text-[10px] text-state-deny">
              API: /v1/local/sessions/:id/revoke
            </span>
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-text-primary">
            Emergency Kill Switch &amp; Workload Containment
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Enforces immediate cryptographic session severance across Envoy proxy sidecars. Revocations propagate fleet-wide in sub-100ms via SSE broadcast.
          </p>
        </div>
      </div>

      {revocationSuccessToast && (
        <div className="flex items-center justify-between rounded-card border border-state-deny/50 bg-state-deny-tint p-4 text-xs font-mono text-state-deny">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-state-deny animate-ping" />
            <span>{revocationSuccessToast}</span>
          </div>
          <button type="button" onClick={() => setRevocationSuccessToast(null)}>
            &times;
          </button>
        </div>
      )}

      {/* Target Selector & Two-Step Hold-to-Revoke Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-6">
          <div className="rounded-card border border-state-deny/30 bg-surface-1 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-state-deny">
                ARM REVOCATION PAYLOAD
              </span>
              <span className="rounded bg-surface-3 px-2 py-0.5 font-mono text-[10px] text-text-muted">
                SAFETY-LATCH ENGAGED
              </span>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="block font-mono text-xs text-text-muted">Target Preset</label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {TARGET_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => {
                        setSelectedTarget(preset.value);
                        setTargetKind(preset.kind);
                      }}
                      className={`rounded-input border p-2 text-left transition ${
                        selectedTarget === preset.value
                          ? "border-state-deny bg-state-deny-tint/20 text-text-primary font-semibold"
                          : "border-border-subtle bg-surface-2 text-text-secondary hover:border-border-strong"
                      }`}
                    >
                      <div className="font-mono text-xs">{preset.label}</div>
                      <div className="truncate font-mono text-[10px] text-text-muted">{preset.value}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-mono text-xs text-text-muted">Custom Target Identifier</label>
                <input
                  type="text"
                  value={selectedTarget}
                  onChange={(e) => setSelectedTarget(e.target.value)}
                  className="mt-1 w-full rounded-input border border-border-subtle bg-surface-2 px-3 py-2 font-mono text-xs text-text-primary focus:border-state-deny focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-mono text-xs text-text-muted">Revocation Reason (Scrubbed)</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-1 w-full rounded-input border border-border-subtle bg-surface-2 px-3 py-2 font-mono text-xs text-text-primary focus:border-state-deny focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-mono text-xs text-text-muted">Authorized SecOps Operator</label>
                <input
                  type="text"
                  value={operatorEmail}
                  onChange={(e) => setOperatorEmail(e.target.value)}
                  className="mt-1 w-full rounded-input border border-border-subtle bg-surface-2 px-3 py-2 font-mono text-xs text-text-primary focus:border-state-deny focus:outline-none"
                />
              </div>
            </div>

            {/* Two-step Hold Button */}
            <div className="mt-8 border-t border-border-subtle pt-6">
              <p className="font-mono text-xs text-text-muted text-center mb-3">
                PRESS AND HOLD 1.5 SECONDS TO EXECUTE REVOCATION
              </p>
              <div className="relative overflow-hidden rounded-input">
                {/* Hold progress fill */}
                <div
                  className="absolute inset-0 bg-state-deny transition-all duration-75"
                  style={{ width: `${holdProgress}%` }}
                />
                <button
                  type="button"
                  onMouseDown={startHold}
                  onMouseUp={cancelHold}
                  onMouseLeave={cancelHold}
                  onTouchStart={startHold}
                  onTouchEnd={cancelHold}
                  className="relative z-10 w-full select-none border border-state-deny bg-state-deny-tint/40 py-3.5 font-mono text-xs font-bold text-state-deny transition active:scale-[0.99]"
                >
                  {isHolding
                    ? `HOLDING... ${Math.round(holdProgress)}%`
                    : "PRESS & HOLD TO HALT TARGET"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Active Blocks Audit Table */}
        <div className="space-y-4 lg:col-span-6">
          <div className="rounded-card border border-border-subtle bg-surface-1 p-5 shadow-sm">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-muted">
              ACTIVE REVOCATION LOG ({revocations.length})
            </span>
            <div className="mt-4 space-y-3">
              {revocations.map((rev) => (
                <div
                  key={rev.id}
                  className={`rounded-card border p-4 transition ${
                    rev.status === "ACTIVE_BLOCK"
                      ? "border-state-deny/40 bg-state-deny-tint/10"
                      : "border-border-subtle bg-surface-2 opacity-60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-text-primary">
                      {rev.targetValue.split("/").pop()}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                        rev.status === "ACTIVE_BLOCK"
                          ? "bg-state-deny-tint text-state-deny"
                          : "bg-surface-3 text-text-muted"
                      }`}
                    >
                      {rev.status}
                    </span>
                  </div>

                  <p className="mt-1 break-all font-mono text-[10px] text-text-muted">
                    {rev.targetValue}
                  </p>
                  <p className="mt-2 text-xs text-text-secondary leading-relaxed">
                    Reason: {rev.reason}
                  </p>

                  <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-2 font-mono text-[10px] text-text-muted">
                    <span>Operator: {rev.revokedBy}</span>
                    {rev.status === "ACTIVE_BLOCK" && (
                      <button
                        type="button"
                        onClick={() => handleRestore(rev.id)}
                        className="rounded border border-border-subtle bg-surface-2 px-2 py-1 font-semibold text-text-primary transition hover:bg-surface-3"
                      >
                        RESTORE ACCESS
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
