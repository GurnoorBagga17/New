/**
 * Module 1B: SSE Client for GET /v1/local/events/stream
 * Team 7B: Auto-reconnect with exponential backoff + jitter
 * 
 * Connection: same-origin only (localhost:8080)
 * Heartbeat: 30s staleness detection
 * Fail-closed: explicit error states
 */

import { useEffect, useRef, useCallback } from 'react';
import { useTrafficStore } from '../stores/trafficStore';
import type { AuditEvent } from '../types';
import { containsSecret } from '../utils/secretScrubber';

const SSE_ENDPOINT = '/v1/local/events/stream';
const HEARTBEAT_TIMEOUT_MS = 30000; // 30 seconds
const BATCH_INTERVAL_MS = 16; // ~60 FPS frame budget

function isAuditEvent(value: unknown): value is AuditEvent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event.timestamp_rfc3339 === 'string' &&
    typeof event.request_id === 'string' &&
    typeof event.trace_id === 'string' &&
    typeof event.agent_id === 'string' &&
    typeof event.target_server === 'string' &&
    typeof event.tool_name === 'string' &&
    typeof event.runtime_mode === 'string' &&
    typeof event.decision === 'string' &&
    typeof event.policy_version === 'string' &&
    (typeof event.denial_reason === 'string' || event.denial_reason === null) &&
    Array.isArray(event.validator_summary) &&
    event.validator_summary.every((item) => typeof item === 'string') &&
    typeof event.kill_switch_active === 'boolean' &&
    typeof event.latency_us === 'number' &&
    Number.isFinite(event.latency_us)
  );
}

interface SSEConnectionOptions {
  enabled?: boolean;
  onError?: (error: Error) => void;
}

export function useSSEConnection(options: SSEConnectionOptions = {}) {
  const { enabled = true, onError } = options;
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const heartbeatTimerRef = useRef<number | null>(null);
  const batchTimerRef = useRef<number | null>(null);
  const pendingEventsRef = useRef<AuditEvent[]>([]);
  const retryCountRef = useRef(0);
  
  const { addEvents, updateSSEStatus } = useTrafficStore();
  
  // Flush pending events in batches (frame budget optimization)
  const flushBatch = useCallback(() => {
    if (pendingEventsRef.current.length > 0) {
      addEvents(pendingEventsRef.current, 'live');
      pendingEventsRef.current = [];
    }
  }, [addEvents]);
  
  // Reset heartbeat timeout
  const resetHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current !== null) {
      window.clearTimeout(heartbeatTimerRef.current);
    }
    
    heartbeatTimerRef.current = window.setTimeout(() => {
      updateSSEStatus({
        state: 'stale',
        error: 'No heartbeat received for 30 seconds',
      });
    }, HEARTBEAT_TIMEOUT_MS);
    
    updateSSEStatus({ lastMessageAt: Date.now() });
  }, [updateSSEStatus]);
  
  // Connect to SSE endpoint
  const connect = useCallback(() => {
    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    updateSSEStatus({
      state: 'connecting',
      source: 'offline',
      retryCount: retryCountRef.current,
    });
    
    try {
      const eventSource = new EventSource(SSE_ENDPOINT);
      eventSourceRef.current = eventSource;
      
      // Connection opened
      eventSource.onopen = () => {
        retryCountRef.current = 0;
        updateSSEStatus({
          state: 'connected',
          source: 'live',
          error: undefined,
          retryCount: 0,
        });
        
        retryCountRef.current = 0;
        resetHeartbeat();
      };
      
      // Audit event message
      eventSource.addEventListener('audit', (event) => {
        try {
          // Never retain or display a payload that violates the browser zero-secret invariant.
          if (containsSecret(event.data).found) {
            updateSSEStatus({
              state: 'error',
              error: 'SECURITY: audit event rejected because secret-like data was present; request outcome is unknown.',
            });
            return;
          }

          const parsed: unknown = JSON.parse(event.data);
          if (!isAuditEvent(parsed)) {
            updateSSEStatus({
              state: 'error',
              error: 'EVENT STREAM ERROR: audit event did not match the current backend schema; request outcome is unknown.',
            });
            return;
          }
          const auditEvent = parsed;
          
          // Batch events for frame-budget optimization
          pendingEventsRef.current.push(auditEvent);
          
          if (batchTimerRef.current === null) {
            batchTimerRef.current = window.setTimeout(() => {
              flushBatch();
              batchTimerRef.current = null;
            }, BATCH_INTERVAL_MS);
          }
          
          resetHeartbeat();
        } catch {
          // Do not log parser errors or payload data; retain only a generic local status.
          updateSSEStatus({
            state: 'error',
            error: 'EVENT STREAM ERROR: audit event was not valid JSON; request outcome is unknown.',
          });
        }
      });
      
      // Heartbeat message (backend should send periodic ping)
      eventSource.addEventListener('ping', () => {
        resetHeartbeat();
      });

      // Admin actions have a separate contract from MCP decision events.
      // Do not coerce them into rows with invented decision fields.
      eventSource.addEventListener('kill_switch_action', () => {
        resetHeartbeat();
      });
      
      // Connection error
      eventSource.onerror = () => {
        if (heartbeatTimerRef.current !== null) {
          window.clearTimeout(heartbeatTimerRef.current);
          heartbeatTimerRef.current = null;
        }
        updateSSEStatus({
          state: 'disconnected',
          source: 'offline',
          error: 'The local backend event stream is unavailable. The browser will retry automatically.',
          retryCount: retryCountRef.current + 1,
        });
        retryCountRef.current += 1;
        onError?.(new Error('Local admin event stream disconnected.'));
      };
    } catch (err) {
      updateSSEStatus({
        state: 'disconnected',
        source: 'offline',
        error: 'The local backend event stream could not be opened.',
        retryCount: retryCountRef.current,
      });
      onError?.(err instanceof Error ? err : new Error('Local admin event stream could not be opened.'));
    }
  }, [
    updateSSEStatus,
    resetHeartbeat,
    flushBatch,
    onError,
  ]);
  
  // Disconnect
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    if (heartbeatTimerRef.current !== null) {
      window.clearTimeout(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
    
    if (batchTimerRef.current !== null) {
      window.clearTimeout(batchTimerRef.current);
      batchTimerRef.current = null;
    }
    
    // Flush any pending events
    flushBatch();
    
    updateSSEStatus({
      state: 'disconnected',
      error: undefined,
    });
  }, [updateSSEStatus, flushBatch]);
  
  // Effect: connect/disconnect based on enabled flag
  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      disconnect();
    }
    
    return () => {
      disconnect();
    };
  }, [enabled, connect, disconnect]);
  
  return {
    connect,
    disconnect,
  };
}
