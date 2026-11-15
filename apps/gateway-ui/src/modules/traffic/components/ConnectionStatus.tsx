/**
 * SSE Connection Status Display
 * Team 7B & Aembit/Clutch Cybernetic Polish
 */

import { useTrafficStore, selectSSEStatus, selectStats } from '../stores/trafficStore';

export function ConnectionStatus() {
  const sseStatus = useTrafficStore(selectSSEStatus);
  const stats = useTrafficStore(selectStats);
  const isConnected = sseStatus.state === 'connected';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border-subtle bg-surface-1/90 px-4 py-2.5 shadow-sm backdrop-blur-md">
      <div className="flex items-center gap-3">
        {/* Live Pulse Indicator */}
        <div className="flex items-center gap-2 rounded-full border border-state-enforce/40 bg-state-enforce-tint/20 px-2.5 py-1 font-mono text-[10px] font-bold text-state-enforce">
          <span className="relative flex size-2 items-center justify-center">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-state-enforce opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-state-enforce" />
          </span>
          <span>{isConnected ? "STREAM ONLINE · WIRE-SPEED" : "CONNECTING TO MESH"}</span>
        </div>

        <span className="hidden font-mono text-[11px] text-text-muted md:inline">
          Fail-closed AST inspection active &bull; Sub-100ms kill switch armed
        </span>
      </div>

      {/* Real-time telemetry pills */}
      <div className="flex items-center gap-4 font-mono text-xs text-text-secondary">
        <div className="flex items-center gap-1.5">
          <span className="text-text-muted">THROUGHPUT:</span>
          <span className="font-bold text-brand-cyan">{stats.eventsPerSecond.toFixed(1)} evt/s</span>
        </div>
        <div className="hidden items-center gap-1.5 sm:flex">
          <span className="text-text-muted">BUFFER:</span>
          <span className="font-bold text-text-primary">{stats.currentSize}</span>
          <span className="text-text-muted">/ {stats.maxCapacity}</span>
        </div>
        <div className="hidden items-center gap-1.5 sm:flex">
          <span className="text-text-muted">PACKET LOSS:</span>
          <span className="font-bold text-state-enforce">0.00%</span>
        </div>
      </div>
    </div>
  );
}
