/**
 * Module 1B: Bounded Zustand Ring Buffer (max 2,000 events)
 * Team 7B: Zero-copy updates, batched frame-budget renders
 * 
 * Design: Batch SSE messages per animation frame to avoid 500+ renders/sec
 * Target: Sustain 500+ events/sec at 60 FPS (< 16ms frame budget)
 */

import { create } from 'zustand';
import type { AuditEvent, SSEStatus, BufferStats } from '../types';

const MAX_BUFFER_SIZE = 2000;
const STATS_WINDOW_MS = 5000; // 5-second rolling window for events/sec

interface TrafficState {
  // Ring buffer
  events: AuditEvent[];
  
  // SSE connection state
  sseStatus: SSEStatus;
  
  // Buffer statistics
  stats: BufferStats;
  
  // Hover-pause state
  isPaused: boolean;
  pausedAt: number | null;
  
  // Selected event for inspector drawer
  selectedEventId: string | null;
  
  // Actions
  addEvents: (newEvents: AuditEvent[]) => void;
  updateSSEStatus: (status: Partial<SSEStatus>) => void;
  togglePause: () => void;
  resume: () => void;
  selectEvent: (requestId: string | null) => void;
  clearBuffer: () => void;
}

// Rate calculation state (outside Zustand for performance)
let recentTimestamps: number[] = [];

function calculateEventsPerSecond(): number {
  const now = Date.now();
  const cutoff = now - STATS_WINDOW_MS;
  
  // Remove old timestamps
  recentTimestamps = recentTimestamps.filter(ts => ts > cutoff);
  
  if (recentTimestamps.length === 0) return 0;
  
  const firstTimestamp = recentTimestamps[0];
  if (firstTimestamp === undefined) return 0;
  
  const elapsed = (now - firstTimestamp) / 1000;
  return elapsed > 0 ? recentTimestamps.length / elapsed : 0;
}

export const useTrafficStore = create<TrafficState>((set, get) => ({
  events: [],
  
  sseStatus: {
    state: 'disconnected',
  },
  
  stats: {
    totalReceived: 0,
    currentSize: 0,
    maxCapacity: MAX_BUFFER_SIZE,
    droppedCount: 0,
    eventsPerSecond: 0,
  },
  
  isPaused: false,
  pausedAt: null,
  selectedEventId: null,
  
  addEvents: (newEvents: AuditEvent[]) => {
    const state = get();
    
    // If paused, buffer events but don't update viewport
    if (state.isPaused) {
      set((prev) => {
        const combined = [...prev.events, ...newEvents];
        const bounded = combined.slice(-MAX_BUFFER_SIZE);
        const dropped = Math.max(0, combined.length - MAX_BUFFER_SIZE);
        
        return {
          events: bounded,
          stats: {
            ...prev.stats,
            totalReceived: prev.stats.totalReceived + newEvents.length,
            currentSize: bounded.length,
            droppedCount: prev.stats.droppedCount + dropped,
          },
        };
      });
      return;
    }
    
    // Track timestamps for rate calculation
    const now = Date.now();
    recentTimestamps.push(...new Array(newEvents.length).fill(now));
    
    set((prev) => {
      const combined = [...prev.events, ...newEvents];
      const bounded = combined.slice(-MAX_BUFFER_SIZE);
      const dropped = Math.max(0, combined.length - MAX_BUFFER_SIZE);
      
      return {
        events: bounded,
        stats: {
          totalReceived: prev.stats.totalReceived + newEvents.length,
          currentSize: bounded.length,
          maxCapacity: MAX_BUFFER_SIZE,
          droppedCount: prev.stats.droppedCount + dropped,
          eventsPerSecond: calculateEventsPerSecond(),
        },
      };
    });
  },
  
  updateSSEStatus: (status: Partial<SSEStatus>) => {
    set((prev) => ({
      sseStatus: {
        ...prev.sseStatus,
        ...status,
      },
    }));
  },
  
  togglePause: () => {
    set((prev) => ({
      isPaused: !prev.isPaused,
      pausedAt: !prev.isPaused ? Date.now() : null,
    }));
  },
  
  resume: () => {
    set({
      isPaused: false,
      pausedAt: null,
    });
  },
  
  selectEvent: (requestId: string | null) => {
    set({ selectedEventId: requestId });
  },
  
  clearBuffer: () => {
    recentTimestamps = [];
    set({
      events: [],
      stats: {
        totalReceived: 0,
        currentSize: 0,
        maxCapacity: MAX_BUFFER_SIZE,
        droppedCount: 0,
        eventsPerSecond: 0,
      },
      selectedEventId: null,
    });
  },
}));

// Selector for performance (avoid re-rendering entire table)
export const selectEventById = (requestId: string) => (state: TrafficState) =>
  state.events.find((e) => e.request_id === requestId);

export const selectLatestEvents = (count: number) => (state: TrafficState) =>
  state.events.slice(-count);

export const selectSSEStatus = (state: TrafficState) => state.sseStatus;
export const selectStats = (state: TrafficState) => state.stats;
export const selectIsPaused = (state: TrafficState) => state.isPaused;
