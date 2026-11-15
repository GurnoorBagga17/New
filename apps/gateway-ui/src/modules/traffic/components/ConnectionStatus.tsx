/**
 * SSE Connection Status Display
 * Team 7B: Fail-closed style error messages
 * 
 * States: connecting | connected | disconnected | stale | error
 */

import { useTrafficStore, selectSSEStatus, selectStats } from '../stores/trafficStore';
import type { SSEConnectionState } from '../types';

const STATUS_CONFIG: Record<
  SSEConnectionState,
  { label: string; icon: string; color: string; pulseColor?: string }
> = {
  connecting: {
    label: 'CONNECTING',
    icon: '◌',
    color: 'text-state-pending',
    pulseColor: 'bg-state-pending',
  },
  connected: {
    label: 'LIVE',
    icon: '●',
    color: 'text-state-enforce',
    pulseColor: 'bg-state-enforce',
  },
  disconnected: {
    label: 'DISCONNECTED',
    icon: '×',
    color: 'text-state-deny',
  },
  stale: {
    label: 'STALE',
    icon: '!',
    color: 'text-state-pending',
  },
  paused: {
    label: 'PAUSED',
    icon: 'Ⅱ',
    color: 'text-state-observe',
  },
  error: {
    label: 'ERROR',
    icon: '⚠',
    color: 'text-state-revoked',
  },
};

export function ConnectionStatus() {
  const sseStatus = useTrafficStore(selectSSEStatus);
  const stats = useTrafficStore(selectStats);
  
  const config = STATUS_CONFIG[sseStatus.state];
  const showPulse = sseStatus.state === 'connected' && config.pulseColor;
  
  // Format retry countdown
  const getRetryCountdown = () => {
    if (!sseStatus.nextRetryAt) return null;
    
    const remaining = Math.max(
      0,
      Math.ceil((sseStatus.nextRetryAt - Date.now()) / 1000),
    );
    
    return remaining > 0 ? `Retry in ${remaining}s` : 'Retrying...';
  };
  
  return (
    <div className="flex items-center justify-between px-6 py-3 bg-surface-2 border-b border-border-subtle">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className={`font-mono ${config.color} ${showPulse ? 'animate-pulse' : ''}`}>
            {config.icon}
          </span>
          <span className={`text-xs font-mono uppercase tracking-wider ${config.color}`}>
            {config.label}
          </span>
        </div>
        
        {/* Error message */}
        {sseStatus.error && (
          <span className="text-xs text-state-deny font-mono">
            {sseStatus.error}
          </span>
        )}
        
        {/* Retry countdown */}
        {sseStatus.state === 'disconnected' && sseStatus.nextRetryAt && (
          <span className="text-xs text-text-muted font-mono">
            {getRetryCountdown()} {sseStatus.retryCount && `(attempt ${sseStatus.retryCount})`}
          </span>
        )}
      </div>
      
      {/* Buffer statistics */}
      <div className="flex items-center gap-6 text-xs font-mono text-text-secondary">
        <div>
          <span className="text-text-muted">Events:</span>{' '}
          <span className="text-text-primary">{stats.currentSize.toLocaleString()}</span>
          <span className="text-text-muted"> / {stats.maxCapacity.toLocaleString()}</span>
        </div>
        
        <div>
          <span className="text-text-muted">Rate:</span>{' '}
          <span className="text-text-primary">{stats.eventsPerSecond.toFixed(1)}</span>
          <span className="text-text-muted"> evt/s</span>
        </div>
        
        {stats.droppedCount > 0 && (
          <div>
            <span className="text-state-deny">Dropped:</span>{' '}
            <span className="text-state-deny">{stats.droppedCount.toLocaleString()}</span>
          </div>
        )}
        
        <div>
          <span className="text-text-muted">Total:</span>{' '}
          <span className="text-text-primary">{stats.totalReceived.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}
