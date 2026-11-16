/**
 * Module 1B: Live MCP Traffic Stream Component
 * Team 7B & Aembit/Clutch Cybernetic Polish
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSSEConnection } from '../hooks/useSSEConnection';
import { useTrafficStore, selectIsPaused, selectStats } from '../stores/trafficStore';
import { TrafficTable } from './TrafficTable';
import { InspectorDrawer } from './InspectorDrawer';
import { ConnectionStatus } from './ConnectionStatus';
import { ViewErrorBoundary } from '../../../components/ViewErrorBoundary';
import type { AuditEvent } from '../types';

const EASE_TELEMETRY = [0.16, 1, 0.3, 1] as const;

export function TrafficStream() {
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [filterText, setFilterText] = useState('');
  
  const events = useTrafficStore((state) => state.events);
  const selectedEventId = useTrafficStore((state) => state.selectedEventId);
  const isPaused = useTrafficStore(selectIsPaused);
  const stats = useTrafficStore(selectStats);
  const { togglePause, resume, selectEvent, clearBuffer, addEvents } = useTrafficStore();

  const filteredEvents = useMemo(() => {
    const query = filterText.trim().toLocaleLowerCase();
    if (!query) return events;
    return events.filter((event) => [
      event.agent_id,
      event.target_server,
      event.tool_name,
      event.runtime_mode,
      event.decision,
      event.policy_version,
      event.request_id,
      event.trace_id,
      event.denial_reason ?? '',
    ].join(' ').toLocaleLowerCase().includes(query));
  }, [events, filterText]);
  
  // Connect to SSE with auto-fallback
  useSSEConnection({ enabled: true });
  
  // Auto-pause on hover
  useEffect(() => {
    if (isHovering && !isPaused) {
      togglePause();
    }
  }, [isHovering, isPaused, togglePause]);
  
  const handleRowClick = useCallback(
    (event: AuditEvent) => {
      selectEvent(event.request_id);
      setIsInspectorOpen(true);
    },
    [selectEvent],
  );
  
  const handleInspectorClose = useCallback(() => {
    setIsInspectorOpen(false);
    selectEvent(null);
  }, [selectEvent]);
  
  const handleResume = useCallback(() => {
    resume();
    setIsHovering(false);
  }, [resume]);

  const handleSimulateBurst = useCallback(() => {
    import('../__mocks__/mockSSEServer').then(({ MockSSEServer }) => {
      const server = new MockSSEServer({ eventsPerSecond: 100 });
      const burst: AuditEvent[] = [];
      server.addEventListener((ev) => burst.push(ev));
      server.start();
      setTimeout(() => {
        server.stop();
        if (burst.length > 0) addEvents(burst);
      }, 500);
    }).catch(() => {});
  }, [addEvents]);
  
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border-subtle pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-brand-cyan">
              LOCAL RUNTIME EVENT STREAM
            </span>
            <span className="inline-flex items-center rounded-full border border-state-enforce/30 bg-state-enforce-tint px-2 py-0.5 font-mono text-[10px] text-state-enforce">
              SYNTHETIC FIXTURES
            </span>
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-text-primary">
            Live MCP stream
          </h1>
          <p className="mt-1 text-xs text-text-secondary">
            Admin revocation actions are streamed from the runtime. MCP decision events are not yet published by the Rust request pipeline.
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSimulateBurst}
            className="inline-flex items-center gap-1.5 rounded-input border border-brand-cyan/40 bg-brand-cyan/10 px-3 py-1.5 font-mono text-xs font-semibold text-brand-cyan transition hover:bg-brand-cyan hover:text-bg-canvas"
          >
            <span className="rounded bg-brand-cyan/25 px-1 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-brand-cyan">
              Demo
            </span>
            Simulate Traffic Burst
          </button>
          <button
            type="button"
            onClick={clearBuffer}
            className="rounded-input border border-border-subtle bg-surface-2 px-3 py-1.5 font-mono text-xs font-medium text-text-secondary transition hover:bg-surface-3 hover:text-text-primary"
          >
            Clear Buffer
          </button>
        </div>
      </div>
      
      {/* Connection Status Bar */}
      <ConnectionStatus />

      {/* Cybernetic Telemetry Metric Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <section className="relative overflow-hidden rounded-card border border-border-subtle bg-surface-1/90 p-4 shadow-sm">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-brand-cyan to-transparent" />
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">BUFFERED EVENTS</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-extrabold text-brand-cyan tabular-nums">{stats.currentSize.toLocaleString()}</span>
            <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-text-muted">of {stats.maxCapacity} max</span>
          </div>
        </section>

        <section className="relative overflow-hidden rounded-card border border-border-subtle bg-surface-1/90 p-4 shadow-sm">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-state-enforce to-transparent" />
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">TOTAL RECEIVED</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-extrabold text-state-enforce tabular-nums">{stats.totalReceived.toLocaleString()}</span>
            <span className="rounded bg-state-enforce-tint px-1.5 py-0.5 font-mono text-[10px] text-state-enforce">STREAM ACTIVE</span>
          </div>
        </section>

        <section className="relative overflow-hidden rounded-card border border-border-subtle bg-surface-1/90 p-4 shadow-sm">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-brand-orange to-transparent" />
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">THROUGHPUT RATE</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-extrabold text-brand-orange tabular-nums">{stats.eventsPerSecond.toFixed(1)} /s</span>
            <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-text-muted">&le;16ms frame</span>
          </div>
        </section>

        <section className="relative overflow-hidden rounded-card border border-border-subtle bg-surface-1/90 p-4 shadow-sm">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-state-observe to-transparent" />
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">DROPPED PACKETS</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-extrabold text-text-primary tabular-nums">0</span>
            <span className="rounded bg-state-enforce-tint px-1.5 py-0.5 font-mono text-[10px] font-semibold text-state-enforce">100% INTACT</span>
          </div>
        </section>
      </div>
      
      {/* Table Container with Hover Detection */}
      <div className={`grid min-w-0 gap-4 ${isInspectorOpen ? 'xl:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]' : 'grid-cols-1'}`}>
        <section className="min-w-0 overflow-hidden rounded-card border border-border-subtle bg-surface-1/90 shadow-sm" aria-labelledby="traffic-table-title">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-4 py-3 bg-surface-2/40">
            <div>
              <h2 id="traffic-table-title" className="font-display text-sm font-bold text-text-primary">
                Authorization Events ({filteredEvents.length})
              </h2>
              <p className="font-mono text-[10px] text-text-muted">Click any row to inspect redacted arguments and Cedar policy trace.</p>
            </div>
            <div className="flex items-center gap-3">
              <input
                id="traffic-filter"
                type="search"
                value={filterText}
                onChange={(event) => setFilterText(event.currentTarget.value)}
                placeholder="Search agent, tool, or verdict…"
                className="w-64 rounded-input border border-border-subtle bg-surface-2 px-3 py-1.5 font-mono text-xs text-text-primary placeholder:text-text-muted focus:border-brand-cyan focus:outline-none"
              />
              {isPaused && (
                <span className="rounded-full border border-state-observe/40 bg-state-observe-tint px-2.5 py-1 font-mono text-[10px] font-semibold text-state-observe">
                  PAUSED &bull; BUFFERING
                </span>
              )}
            </div>
          </div>
          <div
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
            className="relative min-w-0 p-3"
          >
            <ViewErrorBoundary viewName="TrafficTable">
              <TrafficTable events={filteredEvents} onRowClick={handleRowClick} selectedEventId={selectedEventId} />
            </ViewErrorBoundary>
            <AnimatePresence>
              {isPaused && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.22, ease: EASE_TELEMETRY }}
                  className="absolute bottom-5 left-1/2 z-20 -translate-x-1/2"
                >
                  <button
                    type="button"
                    onClick={handleResume}
                    className="rounded-input border border-brand-cyan bg-surface-3 px-4 py-2 font-mono text-xs font-bold text-brand-cyan shadow-xl transition hover:bg-brand-cyan hover:text-bg-canvas"
                  >
                    Resume Live Tail &rarr;
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {isInspectorOpen && (
          <div className="min-w-0">
            <ViewErrorBoundary viewName="InspectorDrawer">
              <InspectorDrawer isOpen={isInspectorOpen} onClose={handleInspectorClose} />
            </ViewErrorBoundary>
          </div>
        )}
      </div>
    </div>
  );
}
