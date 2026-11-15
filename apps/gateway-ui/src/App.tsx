// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
import { lazy, Suspense, useState, useEffect } from "react";
import { MotionConfig, motion, AnimatePresence } from "motion/react";
import { TrafficStream } from "./modules/traffic/components/TrafficStream";
import { useTrafficStore } from "./modules/traffic/stores/trafficStore";
import type { SSEConnectionState } from "./modules/traffic/types";
import {
  IconLiveStream,
  IconCedarStudio,
  IconKillSwitch,
  IconFleet,
  IconIdentity,
  IconAttribution,
  IconSecretless,
  IconLineage,
  IconApprovals,
  IconAlerts,
  IconRisk,
  IconObservability,
  IconDeployments,
  IconConnectors,
  IconSiem,
  IconAudit,
  IconSearch,
  IconSun,
  IconMoon,
} from "./components/Icons";

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

interface NavItem {
  id: ConsoleView;
  label: string;
  badge?: string;
  icon: React.ComponentType<{ size?: number; color?: string; className?: string }>;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "CORE RUNTIME",
    items: [
      { id: "traffic", label: "Live MCP Stream", icon: IconLiveStream, badge: "LIVE" },
      { id: "policies", label: "Cedar Studio", icon: IconCedarStudio },
      { id: "kill-switch", label: "Kill Switch", icon: IconKillSwitch, badge: "SUB-100MS" },
    ],
  },
  {
    label: "IDENTITY & GOVERNANCE",
    items: [
      { id: "fleet", label: "Fleet Workloads", icon: IconFleet },
      { id: "identity", label: "Workload Identity", icon: IconIdentity },
      { id: "attribution", label: "Attribution & AIBOM", icon: IconAttribution },
      { id: "secretless", label: "Secretless Broker", icon: IconSecretless, badge: "ZERO-SECRET" },
    ],
  },
  {
    label: "SECURITY & COMPLIANCE",
    items: [
      { id: "lineage", label: "Lineage Graph", icon: IconLineage },
      { id: "approvals", label: "Human Approvals", icon: IconApprovals },
      { id: "alerts", label: "Security Alerts", icon: IconAlerts },
      { id: "risk", label: "OWASP Risk Engine", icon: IconRisk },
    ],
  },
  {
    label: "OPERATIONS & PLATFORM",
    items: [
      { id: "observability", label: "Observability & OTel", icon: IconObservability },
      { id: "deployments", label: "Deployments & Air-Gap", icon: IconDeployments },
      { id: "connectors", label: "Connectors Hub", icon: IconConnectors },
      { id: "siem", label: "SIEM & SOAR", icon: IconSiem },
      { id: "audit", label: "Audit Logs", icon: IconAudit },
    ],
  },
];

const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

const CONNECTION_LABEL: Record<SSEConnectionState, string> = {
  connecting: "CONNECTING",
  connected: "STREAM LIVE",
  disconnected: "DISCONNECTED",
  stale: "STALE",
  paused: "PAUSED",
  error: "STREAM ERROR",
};

const CONNECTION_COLOR: Record<SSEConnectionState, string> = {
  connecting: "text-state-pending border-state-pending/30 bg-state-pending-tint/10",
  connected: "text-state-enforce border-state-enforce/30 bg-state-enforce-tint/20",
  disconnected: "text-text-muted border-border-subtle bg-surface-2",
  stale: "text-state-pending border-state-pending/30 bg-state-pending-tint/10",
  paused: "text-state-observe border-state-observe/30 bg-state-observe-tint/10",
  error: "text-state-deny border-state-deny/30 bg-state-deny-tint/10",
};

function SectionFallback({ label }: { label: string }) {
  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-card border border-border-subtle bg-surface-1/80 p-8 text-sm text-text-secondary backdrop-blur-md shadow-sm"
    >
      <div className="relative flex size-3 items-center justify-center">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-cyan opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-brand-cyan" />
      </div>
      <span className="font-mono text-xs uppercase tracking-wider">Mounting {label} module…</span>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<ConsoleView>("traffic");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const sseState = useTrafficStore((state) => state.sseStatus.state);

  // Aembit / Clutch Security Signature Cybernetic Theme Support (defaults to dark)
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("axiom-theme-v2");
      if (saved === "light" || saved === "dark") return saved;
    }
    return "dark";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("axiom-theme-v2", theme);
  }, [theme]);

  // Keyboard shortcut (Cmd+K or Ctrl+K) to open Quick Search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const filteredItems = searchQuery.trim()
    ? ALL_NAV_ITEMS.filter((item) =>
        item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.id.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : ALL_NAV_ITEMS;

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-canvas text-text-primary selection:bg-brand-cyan/20 selection:text-brand-cyan font-sans transition-colors duration-200">
        {/* Top Cybernetic Command Header */}
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border-subtle bg-surface-1/90 px-4 backdrop-blur-xl md:px-6 shadow-[0_1px_12px_rgba(0,0,0,0.4)]">
          {/* Left Brand Identity */}
          <div className="flex items-center gap-3">
            <div
              className="relative grid size-10 shrink-0 place-items-center rounded-input border border-brand-cyan/40 bg-gradient-to-br from-brand-cyan/20 via-brand-cyan/5 to-transparent text-brand-cyan shadow-[0_0_15px_rgba(0,229,255,0.2)]"
              aria-hidden="true"
            >
              <svg viewBox="0 0 24 24" fill="none" className="size-5" stroke="currentColor" strokeWidth="2">
                <path d="M12 2.8 21 19H3L12 2.8Z" />
                <path d="m12 9 4.2 7.2H7.8L12 9Z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-sm font-bold tracking-tight text-text-primary">
                  AXIOM NHI
                </span>
                <span className="inline-flex items-center rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-1.5 py-0.2 font-mono text-[9px] font-bold text-brand-cyan tracking-wider">
                  v0.4.2
                </span>
              </div>
              <p className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted sm:block">
                Runtime Governance Console
              </p>
            </div>
          </div>

          {/* Center Live Telemetry Indicators (Inspired by Aembit & Clutch) */}
          <div className="hidden items-center gap-4 lg:flex">
            <div className="flex items-center gap-2 rounded-input border border-border-subtle bg-surface-2/60 px-3 py-1 font-mono text-[11px]">
              <span className="text-text-muted">P99 LATENCY:</span>
              <span className="font-bold text-state-enforce">2.4ms</span>
            </div>
            <div className="flex items-center gap-2 rounded-input border border-border-subtle bg-surface-2/60 px-3 py-1 font-mono text-[11px]">
              <span className="text-text-muted">WORKLOADS:</span>
              <span className="font-bold text-brand-cyan">18 Active</span>
            </div>
            <div className="flex items-center gap-2 rounded-input border border-border-subtle bg-surface-2/60 px-3 py-1 font-mono text-[11px]">
              <span className="text-text-muted">DYNAMIC LEASES:</span>
              <span className="font-bold text-brand-orange">4 Vault Leases</span>
            </div>
          </div>

          {/* Right Action Tools: Search, Theme Toggle, Stream State, Kill Switch */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Quick Search Button */}
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              className="flex items-center gap-2 rounded-input border border-border-subtle bg-surface-2/70 px-2.5 py-1.5 text-xs text-text-muted transition hover:border-border-strong hover:text-text-primary"
            >
              <IconSearch size={14} />
              <span className="hidden sm:inline font-mono text-[11px]">Search</span>
              <kbd className="hidden rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-text-muted lg:inline">
                ⌘K
              </kbd>
            </button>

            {/* Theme Toggle (Dark Cybernetic / Light Enterprise) */}
            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title={`Switch to ${theme === "dark" ? "light" : "dark cybernetic"} mode`}
              className="grid size-9 place-items-center rounded-input border border-border-subtle bg-surface-2/70 text-text-secondary transition hover:border-border-strong hover:text-text-primary hover:bg-surface-3"
            >
              {theme === "dark" ? <IconSun size={15} /> : <IconMoon size={15} />}
            </button>

            {/* SSE Stream State Pill with radar pulse */}
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[10px] font-semibold tracking-wider ${CONNECTION_COLOR[sseState]}`}
            >
              <span className="relative flex size-2 items-center justify-center">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-current" />
              </span>
              {CONNECTION_LABEL[sseState]}
            </span>

            {/* Emergency Halt Button */}
            <button
              type="button"
              onClick={() => setView("kill-switch")}
              title="Emergency Kill Switch"
              className="inline-flex items-center gap-1.5 rounded-input border border-state-deny/60 bg-gradient-to-r from-state-deny/20 to-state-deny/10 px-3 py-1.5 font-mono text-[10px] font-bold tracking-wider text-state-deny transition hover:bg-state-deny hover:text-white shadow-[0_0_12px_rgba(244,63,94,0.2)]"
            >
              <IconKillSwitch size={13} />
              <span className="hidden sm:inline">EMERGENCY HALT</span>
            </button>
          </div>
        </header>

        {/* Quick Jump Modal */}
        <AnimatePresence>
          {isSearchOpen && (
            <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-20 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -10 }}
                transition={{ duration: 0.15 }}
                className="w-full max-w-lg overflow-hidden rounded-card border border-border-subtle bg-surface-1 p-4 shadow-2xl"
              >
                <div className="flex items-center gap-2 border-b border-border-subtle pb-3">
                  <IconSearch size={16} className="text-text-muted" />
                  <input
                    type="text"
                    autoFocus
                    placeholder="Jump to module (e.g. Identity, Leases, Cedar, OTel)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-transparent font-sans text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setIsSearchOpen(false)}
                    className="rounded px-2 py-0.5 font-mono text-xs text-text-muted hover:text-text-primary"
                  >
                    ESC
                  </button>
                </div>
                <div className="mt-3 max-h-72 overflow-y-auto space-y-1">
                  {filteredItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setView(item.id);
                          setIsSearchOpen(false);
                          setSearchQuery("");
                        }}
                        className="flex w-full items-center justify-between rounded-input px-3 py-2 text-left text-xs transition hover:bg-surface-2"
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon size={15} className="text-brand-cyan" />
                          <span className="font-medium text-text-primary">{item.label}</span>
                        </div>
                        {item.badge && (
                          <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[9px] text-text-muted">
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {filteredItems.length === 0 && (
                    <p className="p-4 text-center font-mono text-xs text-text-muted">
                      No matching console modules found.
                    </p>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Main Console Split View */}
        <div className="grid min-h-[calc(100vh-4rem)] grid-cols-[64px_minmax(0,1fr)] md:grid-cols-[240px_minmax(0,1fr)]">
          {/* Cybernetic Sidebar Navigation */}
          <aside
            className="flex min-h-0 flex-col overflow-y-auto border-r border-border-subtle bg-surface-1/70 px-2 py-5 backdrop-blur-md md:px-3"
            aria-label="Operator navigation"
          >
            <div className="space-y-6">
              {NAV_GROUPS.map((group) => (
                <div key={group.label} className="space-y-1">
                  <p className="hidden px-3 pb-1 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-text-muted/80 md:block">
                    {group.label}
                  </p>
                  <nav className="flex flex-col gap-0.5" aria-label={group.label}>
                    {group.items.map((item) => {
                      const active = view === item.id;
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          aria-current={active ? "page" : undefined}
                          aria-pressed={active}
                          title={item.label}
                          onClick={() => setView(item.id)}
                          className={`group relative flex min-h-9 items-center justify-center gap-3 rounded-input px-2 text-left text-xs transition-all duration-150 md:justify-start md:px-3 ${
                            active
                              ? "border border-brand-cyan/40 bg-gradient-to-r from-brand-cyan/15 via-brand-cyan/5 to-transparent text-text-primary font-semibold shadow-[0_0_12px_rgba(0,229,255,0.08)]"
                              : "border border-transparent text-text-secondary hover:border-border-subtle hover:bg-surface-2 hover:text-text-primary"
                          }`}
                        >
                          {/* Active glowing indicator pill */}
                          {active && (
                            <span
                              className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-full bg-brand-cyan shadow-[0_0_6px_#00E5FF]"
                              aria-hidden="true"
                            />
                          )}
                          <span
                            aria-hidden="true"
                            className={`shrink-0 transition-colors ${
                              active ? "text-brand-cyan" : "text-text-muted group-hover:text-text-primary"
                            }`}
                          >
                            <Icon size={16} />
                          </span>
                          <span className="hidden truncate md:inline">{item.label}</span>
                          {item.badge && (
                            <span
                              className={`ml-auto hidden rounded px-1.5 py-0.2 font-mono text-[8px] font-bold md:inline ${
                                active
                                  ? "bg-brand-cyan/20 text-brand-cyan"
                                  : "bg-surface-3 text-text-muted"
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </nav>
                </div>
              ))}
            </div>

            {/* Sidebar Footer Info */}
            <div className="mt-auto border-t border-border-subtle pt-4">
              <div className="hidden px-3 md:block">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-state-enforce animate-pulse" />
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-text-primary">
                    AIR-GAP RUNTIME
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-text-muted">
                  Strict zero-egress enforcement. 16/16 modules online.
                </p>
              </div>
              <div className="mt-3 flex justify-center md:hidden" aria-label="Runtime online">
                <span aria-hidden="true" className="size-2 rounded-full bg-state-enforce" />
              </div>
            </div>
          </aside>

          {/* Main Dashboard Canvas with Motion Transitions */}
          <main className="min-w-0 p-3 md:p-6 xl:p-8 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1800px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={view}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                >
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
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
        </div>
      </div>
    </MotionConfig>
  );
}
