import { lazy, Suspense, useState } from "react";
import { MotionConfig } from "motion/react";
import { TrafficStream } from "./modules/traffic/components/TrafficStream";
import { useTrafficStore } from "./modules/traffic/stores/trafficStore";
import type { SSEConnectionState } from "./modules/traffic/types";

const PolicyStudioPage = lazy(() =>
  import("./modules/policy-studio/PolicyStudioPage").then((module) => ({
    default: module.PolicyStudioPage,
  })),
);
const AuditExplorer = lazy(() =>
  import("./modules/killswitch-audit/AuditExplorer").then((module) => ({
    default: module.AuditExplorer,
  })),
);
const FleetWorkloadsPage = lazy(() =>
  import("./modules/fleet/FleetWorkloadsPage").then((module) => ({
    default: module.FleetWorkloadsPage,
  })),
);
const LineageGraphPage = lazy(() =>
  import("./modules/lineage/LineageGraphPage").then((module) => ({
    default: module.LineageGraphPage,
  })),
);
const ApprovalsPage = lazy(() =>
  import("./modules/approvals/ApprovalsPage").then((module) => ({
    default: module.ApprovalsPage,
  })),
);
const AlertsCenterPage = lazy(() =>
  import("./modules/alerts/AlertsCenterPage").then((module) => ({
    default: module.AlertsCenterPage,
  })),
);
const ConnectorsPage = lazy(() =>
  import("./modules/connectors/ConnectorsPage").then((module) => ({
    default: module.ConnectorsPage,
  })),
);

type ConsoleView =
  | "traffic"
  | "fleet"
  | "lineage"
  | "approvals"
  | "alerts"
  | "connectors"
  | "policies"
  | "audit"
  | "kill-switch";

const NAV_ITEMS: readonly { id: ConsoleView; label: string; icon: string }[] = [
  { id: "traffic", label: "Live MCP Stream", icon: "⌁" },
  { id: "fleet", label: "Fleet Workloads", icon: "🤖" },
  { id: "lineage", label: "Lineage Graph", icon: "☊" },
  { id: "approvals", label: "Human Approvals", icon: "✓" },
  { id: "alerts", label: "Security Alerts", icon: "⚠" },
  { id: "connectors", label: "Connectors Hub", icon: "⬡" },
  { id: "policies", label: "Cedar Studio", icon: "◇" },
  { id: "audit", label: "Audit Logs", icon: "▤" },
  { id: "kill-switch", label: "Kill Switch", icon: "⏻" },
];

const CONNECTION_LABEL: Record<SSEConnectionState, string> = {
  connecting: "CONNECTING",
  connected: "STREAM LIVE",
  disconnected: "DISCONNECTED",
  stale: "STALE",
  paused: "PAUSED",
  error: "STREAM ERROR",
};

const CONNECTION_COLOR: Record<SSEConnectionState, string> = {
  connecting: "text-state-pending",
  connected: "text-state-enforce",
  disconnected: "text-text-muted",
  stale: "text-state-pending",
  paused: "text-state-observe",
  error: "text-state-deny",
};

function SectionFallback({ label }: { label: string }) {
  return <p role="status" className="rounded-card border border-border-subtle bg-surface-1 p-5 text-sm text-text-secondary">Loading {label}…</p>;
}

export default function App() {
  const [view, setView] = useState<ConsoleView>("traffic");
  const sseState = useTrafficStore((state) => state.sseStatus.state);

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-canvas text-text-primary">
        <header className="sticky top-0 z-30 flex h-16 items-center border-b border-border-subtle bg-surface-1/95 px-4 backdrop-blur md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-input border border-brand-orange/30 bg-brand-orange/10 text-brand-orange" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" className="size-5" stroke="currentColor" strokeWidth="1.7">
                <path d="M12 2.8 21 19H3L12 2.8Z" />
                <path d="m12 9 4.2 7.2H7.8L12 9Z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-semibold tracking-tight text-text-primary">Axiom NHI</p>
              <p className="hidden font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted sm:block">Operator Console</p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2 md:gap-3">
            <span className={`inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-2 px-3 py-1.5 font-mono text-[10px] tracking-wider ${CONNECTION_COLOR[sseState]}`}>
              <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
              {CONNECTION_LABEL[sseState]}
            </span>
            <button
              type="button"
              disabled
              title="Revocation is unavailable until the local backend endpoint is implemented."
              className="hidden cursor-not-allowed items-center gap-2 rounded-input border border-state-deny/50 px-3 py-2 font-mono text-[10px] font-semibold tracking-wider text-state-deny opacity-75 sm:inline-flex"
            >
              <span aria-hidden="true">⚠</span> REVOCATION UNAVAILABLE
            </button>
          </div>
        </header>

        <div className="grid min-h-[calc(100vh-4rem)] grid-cols-[64px_minmax(0,1fr)] md:grid-cols-[208px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-r border-border-subtle bg-surface-1 px-2 py-4 md:px-3" aria-label="Operator navigation">
            <p className="hidden px-3 pb-3 font-mono text-[10px] font-medium tracking-[0.14em] text-text-muted md:block">WORKSPACE</p>
            <nav className="flex flex-col gap-1" aria-label="Console sections">
              {NAV_ITEMS.map((item) => {
                const active = view === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={active ? "page" : undefined}
                    aria-pressed={active}
                    title={item.label}
                    onClick={() => setView(item.id)}
                    className={`group flex min-h-10 items-center justify-center gap-3 rounded-input border px-2 text-left text-sm transition-[transform,opacity] md:justify-start md:px-3 ${active ? "border-border-strong bg-surface-2 text-text-primary shadow-[inset_0_1px_0_var(--text-primary)]" : "border-transparent text-text-secondary hover:border-border-subtle hover:bg-surface-2"}`}
                  >
                    <span aria-hidden="true" className={`w-5 shrink-0 text-center font-mono text-base ${active ? "text-brand-orange" : "text-text-muted"}`}>{item.icon}</span>
                    <span className="hidden truncate md:inline">{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="mt-auto border-t border-border-subtle pt-4">
              <p className="hidden px-3 font-mono text-[10px] uppercase tracking-wider text-text-muted md:block">LOCAL MODE</p>
              <p className="mt-1 hidden px-3 text-xs leading-relaxed text-text-secondary md:block">Same-origin console. Backend route availability is shown per module.</p>
              <div className="mt-3 flex justify-center md:hidden" aria-label="Local mode">
                <span aria-hidden="true" className="size-2 rounded-full bg-state-observe" />
              </div>
            </div>
          </aside>

          <main className="min-w-0 p-3 md:p-5 xl:p-6">
            <div className="mx-auto w-full max-w-[1800px]">
              {view === "traffic" && <TrafficStream />}
              {view === "fleet" && (
                <Suspense fallback={<SectionFallback label="Fleet Workloads" />}>
                  <FleetWorkloadsPage />
                </Suspense>
              )}
              {view === "lineage" && (
                <Suspense fallback={<SectionFallback label="Lineage Graph" />}>
                  <LineageGraphPage />
                </Suspense>
              )}
              {view === "approvals" && (
                <Suspense fallback={<SectionFallback label="Human Approvals" />}>
                  <ApprovalsPage />
                </Suspense>
              )}
              {view === "alerts" && (
                <Suspense fallback={<SectionFallback label="Security Alerts" />}>
                  <AlertsCenterPage />
                </Suspense>
              )}
              {view === "connectors" && (
                <Suspense fallback={<SectionFallback label="Discovery Connectors" />}>
                  <ConnectorsPage />
                </Suspense>
              )}
              {view === "policies" && <Suspense fallback={<SectionFallback label="Cedar Studio" />}><PolicyStudioPage /></Suspense>}
              {view === "audit" && <Suspense fallback={<SectionFallback label="Audit Logs" />}><AuditExplorer /></Suspense>}
              {view === "kill-switch" && (
                <section className="mx-auto max-w-3xl rounded-card border border-border-subtle bg-surface-1 p-6 shadow-[inset_0_1px_0_var(--text-primary)] md:p-8" aria-labelledby="kill-switch-title">
                  <p className="font-mono text-[10px] font-medium tracking-[0.14em] text-state-pending">CONTROL PLANE STATUS</p>
                  <div className="mt-4 flex items-start gap-4">
                    <span className="grid size-10 shrink-0 place-items-center rounded-input border border-state-pending/40 bg-state-pending-tint font-mono text-lg text-state-pending" aria-hidden="true">!</span>
                    <div>
                      <h1 id="kill-switch-title" className="font-display text-xl font-semibold tracking-tight text-text-primary">Kill switch unavailable</h1>
                      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">The gateway does not expose the local revocation endpoint or a reviewed session-target contract. Revocation controls are disabled and no request has been sent.</p>
                      <p className="mt-4 inline-flex items-center gap-2 rounded-input border border-state-pending/40 bg-state-pending-tint px-3 py-2 font-mono text-xs text-state-pending"><span aria-hidden="true">◷</span> API STATUS: NOT IMPLEMENTED</p>
                    </div>
                  </div>
                  <div className="mt-8 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-card border border-border-subtle bg-surface-2 p-4"><p className="font-mono text-[10px] tracking-wider text-text-muted">TARGET</p><p className="mt-2 text-sm text-text-secondary">No target selection is available.</p></div>
                    <div className="rounded-card border border-border-subtle bg-surface-2 p-4"><p className="font-mono text-[10px] tracking-wider text-text-muted">SAFETY CONFIRMATION</p><p className="mt-2 text-sm text-text-secondary">Two-step hold control stays disabled until a real revoke endpoint is available.</p></div>
                  </div>
                </section>
              )}
            </div>
          </main>
        </div>
      </div>
    </MotionConfig>
  );
}

