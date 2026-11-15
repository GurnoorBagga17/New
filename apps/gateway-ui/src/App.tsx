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
const AttributionPage = lazy(() =>
  import("./modules/attribution/AttributionPage").then((module) => ({
    default: module.AttributionPage,
  })),
);
const IdentityAttestationPage = lazy(() =>
  import("./modules/identity/IdentityAttestationPage").then((module) => ({
    default: module.IdentityAttestationPage,
  })),
);
const SecretlessBrokerPage = lazy(() =>
  import("./modules/secretless/SecretlessBrokerPage").then((module) => ({
    default: module.SecretlessBrokerPage,
  })),
);
const DeploymentsPage = lazy(() =>
  import("./modules/deployments/DeploymentsPage").then((module) => ({
    default: module.DeploymentsPage,
  })),
);
const ObservabilityPage = lazy(() =>
  import("./modules/observability/ObservabilityPage").then((module) => ({
    default: module.ObservabilityPage,
  })),
);
const RiskEnginePage = lazy(() =>
  import("./modules/risk/RiskEnginePage").then((module) => ({
    default: module.RiskEnginePage,
  })),
);
const SiemSoarPage = lazy(() =>
  import("./modules/siem/SiemSoarPage").then((module) => ({
    default: module.SiemSoarPage,
  })),
);
const KillSwitchPage = lazy(() =>
  import("./modules/killswitch/KillSwitchPage").then((module) => ({
    default: module.KillSwitchPage,
  })),
);

type ConsoleView =
  | "traffic"
  | "policies"
  | "kill-switch"
  | "fleet"
  | "identity"
  | "attribution"
  | "secretless"
  | "lineage"
  | "approvals"
  | "alerts"
  | "risk"
  | "observability"
  | "deployments"
  | "connectors"
  | "siem"
  | "audit";

interface NavGroup {
  label: string;
  items: { id: ConsoleView; label: string; icon: string }[];
}

const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "CORE RUNTIME",
    items: [
      { id: "traffic", label: "Live MCP Stream", icon: "⌁" },
      { id: "policies", label: "Cedar Studio", icon: "◇" },
      { id: "kill-switch", label: "Kill Switch", icon: "⏻" },
    ],
  },
  {
    label: "IDENTITY & GOVERNANCE",
    items: [
      { id: "fleet", label: "Fleet Workloads", icon: "🤖" },
      { id: "identity", label: "Workload Identity", icon: "🔑" },
      { id: "attribution", label: "Attribution & AIBOM", icon: "👤" },
      { id: "secretless", label: "Secretless Broker", icon: "🔒" },
    ],
  },
  {
    label: "SECURITY & COMPLIANCE",
    items: [
      { id: "lineage", label: "Lineage Graph", icon: "☊" },
      { id: "approvals", label: "Human Approvals", icon: "✓" },
      { id: "alerts", label: "Security Alerts", icon: "⚠" },
      { id: "risk", label: "OWASP Risk Engine", icon: "🛡" },
    ],
  },
  {
    label: "OPERATIONS & PLATFORM",
    items: [
      { id: "observability", label: "Observability & OTel", icon: "📊" },
      { id: "deployments", label: "Deployments & Air-Gap", icon: "☸" },
      { id: "connectors", label: "Connectors Hub", icon: "⬡" },
      { id: "siem", label: "SIEM & SOAR", icon: "⚡" },
      { id: "audit", label: "Audit Logs", icon: "▤" },
    ],
  },
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
  return (
    <div role="status" className="flex items-center gap-3 rounded-card border border-border-subtle bg-surface-1 p-5 text-sm text-text-secondary">
      <span className="size-2 rounded-full bg-brand-orange animate-ping" />
      <span>Loading {label}…</span>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<ConsoleView>("traffic");
  const sseState = useTrafficStore((state) => state.sseStatus.state);

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-canvas text-text-primary">
        <header className="sticky top-0 z-30 flex h-16 items-center border-b border-border-subtle bg-surface-1/95 px-4 backdrop-blur md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="grid size-9 shrink-0 place-items-center rounded-input border border-brand-orange/30 bg-brand-orange/10 text-brand-orange"
              aria-hidden="true"
            >
              <svg viewBox="0 0 24 24" fill="none" className="size-5" stroke="currentColor" strokeWidth="1.7">
                <path d="M12 2.8 21 19H3L12 2.8Z" />
                <path d="m12 9 4.2 7.2H7.8L12 9Z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-semibold tracking-tight text-text-primary">
                Axiom NHI
              </p>
              <p className="hidden font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted sm:block">
                Unified Operator Console
              </p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2 md:gap-3">
            <span
              className={`inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-2 px-3 py-1.5 font-mono text-[10px] tracking-wider ${CONNECTION_COLOR[sseState]}`}
            >
              <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
              {CONNECTION_LABEL[sseState]}
            </span>
            <button
              type="button"
              onClick={() => setView("kill-switch")}
              title="Open Emergency Kill Switch panel"
              className="inline-flex items-center gap-1.5 rounded-input border border-state-deny/50 bg-state-deny-tint/30 px-3 py-1.5 font-mono text-[10px] font-semibold tracking-wider text-state-deny transition hover:bg-state-deny hover:text-white"
            >
              <span aria-hidden="true">⏻</span> EMERGENCY HALT
            </button>
          </div>
        </header>

        <div className="grid min-h-[calc(100vh-4rem)] grid-cols-[64px_minmax(0,1fr)] md:grid-cols-[224px_minmax(0,1fr)]">
          <aside
            className="flex min-h-0 flex-col overflow-y-auto border-r border-border-subtle bg-surface-1 px-2 py-4 md:px-3"
            aria-label="Operator navigation"
          >
            <div className="space-y-6">
              {NAV_GROUPS.map((group) => (
                <div key={group.label} className="space-y-1">
                  <p className="hidden px-3 pb-1 font-mono text-[9px] font-semibold tracking-[0.14em] text-text-muted md:block">
                    {group.label}
                  </p>
                  <nav className="flex flex-col gap-0.5" aria-label={group.label}>
                    {group.items.map((item) => {
                      const active = view === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          aria-current={active ? "page" : undefined}
                          aria-pressed={active}
                          title={item.label}
                          onClick={() => setView(item.id)}
                          className={`group flex min-h-9 items-center justify-center gap-2.5 rounded-input border px-2 text-left text-xs transition-[transform,opacity] md:justify-start md:px-3 ${
                            active
                              ? "border-border-strong bg-surface-2 text-text-primary shadow-[inset_0_1px_0_var(--text-primary)] font-semibold"
                              : "border-transparent text-text-secondary hover:border-border-subtle hover:bg-surface-2"
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`w-4 shrink-0 text-center font-mono text-sm ${
                              active ? "text-brand-orange" : "text-text-muted"
                            }`}
                          >
                            {item.icon}
                          </span>
                          <span className="hidden truncate md:inline">{item.label}</span>
                        </button>
                      );
                    })}
                  </nav>
                </div>
              ))}
            </div>

            <div className="mt-auto border-t border-border-subtle pt-4">
              <p className="hidden px-3 font-mono text-[10px] uppercase tracking-wider text-text-muted md:block">
                LOCAL MODE &bull; FULL MESH
              </p>
              <p className="mt-1 hidden px-3 text-[11px] leading-relaxed text-text-secondary md:block">
                All 10 backend crates active. Same-origin proxy routing.
              </p>
              <div className="mt-3 flex justify-center md:hidden" aria-label="Local mode">
                <span aria-hidden="true" className="size-2 rounded-full bg-state-observe" />
              </div>
            </div>
          </aside>

          <main className="min-w-0 p-3 md:p-5 xl:p-6 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1800px]">
              {/* CORE RUNTIME */}
              {view === "traffic" && <TrafficStream />}
              {view === "policies" && (
                <Suspense fallback={<SectionFallback label="Cedar Policy Studio" />}>
                  <PolicyStudioPage />
                </Suspense>
              )}
              {view === "kill-switch" && (
                <Suspense fallback={<SectionFallback label="Emergency Kill Switch" />}>
                  <KillSwitchPage />
                </Suspense>
              )}

              {/* IDENTITY & GOVERNANCE */}
              {view === "fleet" && (
                <Suspense fallback={<SectionFallback label="Fleet Workloads" />}>
                  <FleetWorkloadsPage />
                </Suspense>
              )}
              {view === "identity" && (
                <Suspense fallback={<SectionFallback label="Workload Identity & Attestation" />}>
                  <IdentityAttestationPage />
                </Suspense>
              )}
              {view === "attribution" && (
                <Suspense fallback={<SectionFallback label="Ownership Attribution & AIBOM" />}>
                  <AttributionPage />
                </Suspense>
              )}
              {view === "secretless" && (
                <Suspense fallback={<SectionFallback label="Secretless Ephemeral Broker" />}>
                  <SecretlessBrokerPage />
                </Suspense>
              )}

              {/* SECURITY & COMPLIANCE */}
              {view === "lineage" && (
                <Suspense fallback={<SectionFallback label="Lineage Graph & Blast Radius" />}>
                  <LineageGraphPage />
                </Suspense>
              )}
              {view === "approvals" && (
                <Suspense fallback={<SectionFallback label="Human-in-the-Loop Approvals" />}>
                  <ApprovalsPage />
                </Suspense>
              )}
              {view === "alerts" && (
                <Suspense fallback={<SectionFallback label="Security Alerts Center" />}>
                  <AlertsCenterPage />
                </Suspense>
              )}
              {view === "risk" && (
                <Suspense fallback={<SectionFallback label="OWASP Risk Engine" />}>
                  <RiskEnginePage />
                </Suspense>
              )}

              {/* OPERATIONS & PLATFORM */}
              {view === "observability" && (
                <Suspense fallback={<SectionFallback label="Observability & OTel Traces" />}>
                  <ObservabilityPage />
                </Suspense>
              )}
              {view === "deployments" && (
                <Suspense fallback={<SectionFallback label="Deployments & Air-Gap Topology" />}>
                  <DeploymentsPage />
                </Suspense>
              )}
              {view === "connectors" && (
                <Suspense fallback={<SectionFallback label="Discovery Connectors Hub" />}>
                  <ConnectorsPage />
                </Suspense>
              )}
              {view === "siem" && (
                <Suspense fallback={<SectionFallback label="SIEM & SOAR Forwarding" />}>
                  <SiemSoarPage />
                </Suspense>
              )}
              {view === "audit" && (
                <Suspense fallback={<SectionFallback label="Audit Logs Explorer" />}>
                  <AuditExplorer />
                </Suspense>
              )}
            </div>
          </main>
        </div>
      </div>
    </MotionConfig>
  );
}
