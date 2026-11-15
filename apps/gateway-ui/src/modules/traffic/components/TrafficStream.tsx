/**
 * Module 1B: Live MCP Traffic Stream Component
 * Team 7B: Main integration of SSE client + virtualized table + inspector
 * 
 * Features:
 * - Auto-connect SSE to /v1/local/events/stream
 * - Hover-to-pause with resume pill
 * - Inspector drawer on row click
 * - 500+ events/sec at 60 FPS target
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSSEConnection } from '../hooks/useSSEConnection';
import { useTrafficStore, selectIsPaused, selectStats } from '../stores/trafficStore';
import { TrafficTable } from './TrafficTable';
import { InspectorDrawer } from './InspectorDrawer';
import { ConnectionStatus } from './ConnectionStatus';
import type { AuditEvent } from '../types';

// EASE_TELEMETRY: cubic-bezier(0.16, 1, 0.3, 1), 220ms
const EASE_TELEMETRY = [0.16, 1, 0.3, 1] as const;

export function TrafficStream() {
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [filterText, setFilterText] = useState('');
  
  const events = useTrafficStore((state) => state.events);
  const selectedEventId = useTrafficStore((state) => state.selectedEventId);
  const isPaused = useTrafficStore(selectIsPaused);
  const stats = useTrafficStore(selectStats);
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
  const { togglePause, resume, selectEvent, clearBuffer } = useTrafficStore();
  
  // Connect to SSE
  useSSEConnection({ enabled: true });
  
  // Auto-pause on hover
  useEffect(() => {
    if (isHovering && !isPaused) {
      togglePause();
    }
  }, [isHovering, isPaused, togglePause]);
  
  // Handle row click
  const handleRowClick = useCallback(
    (event: AuditEvent) => {
      selectEvent(event.request_id);
      setIsInspectorOpen(true);
    },
    [selectEvent],
  );
  
  // Handle inspector close
  const handleInspectorClose = useCallback(() => {
    setIsInspectorOpen(false);
    selectEvent(null);
  }, [selectEvent]);
  
  // Handle resume
  const handleResume = useCallback(() => {
    resume();
    setIsHovering(false);
  }, [resume]);
  
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 font-mono text-[10px] font-medium tracking-[0.14em] text-brand-orange">
            MODULE 1B · LIVE TELEMETRY
          </p>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-text-primary">
            Live MCP traffic
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Same-origin audit events from the local runtime, when the stream endpoint is available.
          </p>
        </div>
        
        <button
          onClick={clearBuffer}
          className="px-4 py-2 text-sm font-medium text-text-primary bg-surface-2 border border-border-subtle rounded-input hover:bg-surface-3 transition-[transform,opacity]"
        >
          Clear Buffer
        </button>
      </div>
      
      {/* Connection Status Bar */}
      <ConnectionStatus />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: 'BUFFERED', value: stats.currentSize.toLocaleString(), detail: `of ${stats.maxCapacity.toLocaleString()} max` },
          { label: 'RECEIVED', value: stats.totalReceived.toLocaleString(), detail: 'since buffer clear' },
          { label: 'CURRENT RATE', value: `${stats.eventsPerSecond.toFixed(1)} /s`, detail: 'measured locally' },
          { label: 'DROPPED', value: stats.droppedCount.toLocaleString(), detail: 'buffer capacity exceeded' },
        ].map((metric) => (
          <section key={metric.label} className="rounded-card border border-border-subtle bg-surface-1 px-4 py-3 shadow-[var(--elevation-top-edge-highlight)]">
            <p className="font-mono text-[10px] tracking-[0.12em] text-text-muted">{metric.label}</p>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <span className="font-mono text-xl tabular-nums text-text-primary">{metric.value}</span>
              <span className="truncate text-[10px] text-text-muted">{metric.detail}</span>
            </div>
          </section>
        ))}
      </div>
      
      {/* Table Container with Hover Detection */}
      <div className={`grid min-w-0 gap-4 ${isInspectorOpen ? 'xl:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]' : 'grid-cols-1'}`}>
        <section className="min-w-0 overflow-hidden rounded-card border border-border-subtle bg-surface-1 shadow-[var(--elevation-top-edge-highlight)]" aria-labelledby="traffic-table-title">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
            <div>
              <h2 id="traffic-table-title" className="text-sm font-semibold text-text-primary">Authorization events</h2>
              <p className="mt-0.5 text-xs text-text-muted">Select a row to inspect its redacted audit fields.</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="sr-only" htmlFor="traffic-filter">Search events</label>
              <input
                id="traffic-filter"
                type="search"
                value={filterText}
                onChange={(event) => setFilterText(event.currentTarget.value)}
                placeholder="Search identity, tool, verdict…"
                className="w-56 rounded-input border border-border-subtle bg-surface-2 px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-brand-orange"
              />
              {isPaused && <span className="rounded-full border border-state-observe/40 bg-state-observe-tint px-2.5 py-1 font-mono text-[10px] text-state-observe">PAUSED · BUFFERING</span>}
            </div>
          </div>
          <div
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
            className="relative min-w-0 p-3"
          >
            <TrafficTable events={filteredEvents} onRowClick={handleRowClick} selectedEventId={selectedEventId} />
            <AnimatePresence>
              {isPaused && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.22, ease: EASE_TELEMETRY }}
                  className="absolute bottom-5 left-1/2 z-20 -translate-x-1/2"
                >
                  <button onClick={handleResume} className="rounded-card border border-brand-orange/40 bg-surface-3 px-4 py-2.5 text-sm font-medium text-brand-orange shadow-lg transition-[transform,opacity] hover:scale-[1.02]">
                    Resume live tail
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {isInspectorOpen && (
          <div className="min-w-0">
            <InspectorDrawer isOpen={isInspectorOpen} onClose={handleInspectorClose} />
          </div>
        )}
      </div>
    </div>
  );
}
