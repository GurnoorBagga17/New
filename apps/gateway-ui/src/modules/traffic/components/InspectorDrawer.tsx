/**
 * Module 1B: 460px Inspector Drawer (SPRING_DRAWER)
 * Team 7B: Full JSON-RPC envelope, CIMD badge, RFC 8707 indicator
 * 
 * Shows: tools/call envelope, OAuth 2.1 context, validator facts
 * Copy-to-clipboard: non-sensitive fields only
 */

import { motion, AnimatePresence } from 'motion/react';
import { useTrafficStore, selectEventById } from '../stores/trafficStore';
import { VerdictBadge } from './VerdictBadge';

// SPRING_DRAWER: { stiffness: 360, damping: 36, mass: 1.0 }
const SPRING_DRAWER = {
  type: 'spring' as const,
  stiffness: 360,
  damping: 36,
  mass: 1.0,
};

interface InspectorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
  };
  
  return (
    <button
      onClick={handleCopy}
      className="text-xs text-brand-orange hover:text-brand-indigo font-mono transition-[transform,opacity]"
      title={`Copy ${label || 'value'}`}
    >
      COPY
    </button>
  );
}

function DetailRow({ label, value, copyable = false }: {
  label: string;
  value: string | number | null;
  copyable?: boolean;
}) {
  const displayValue = value ?? '—';
  
  return (
    <div className="flex justify-between items-start gap-4 py-2 border-b border-border-subtle">
      <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-mono text-text-primary text-right break-all">
          {String(displayValue)}
        </span>
        {copyable && value && <CopyButton text={String(value)} label={label} />}
      </div>
    </div>
  );
}

export function InspectorDrawer({ isOpen, onClose }: InspectorDrawerProps) {
  const selectedEventId = useTrafficStore((state) => state.selectedEventId);
  const event = useTrafficStore(
    selectedEventId ? selectEventById(selectedEventId) : () => null,
  );
  
  if (!event) return null;
  
  const latencyMs = (event.latency_us / 1000).toFixed(2);
  
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-x-0 top-16 bottom-0 z-40 bg-surface-1/80 xl:hidden"
            onClick={onClose}
          />
          
          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={SPRING_DRAWER}
            className="fixed right-0 top-16 z-50 h-[calc(100vh-4rem)] w-[min(460px,calc(100vw-2rem))] overflow-y-auto border-l border-border-subtle bg-surface-2 shadow-2xl xl:sticky xl:top-20 xl:h-[calc(100vh-6rem)] xl:w-full xl:rounded-card xl:border xl:shadow-[var(--elevation-top-edge-highlight)]"
          >
            {/* Header */}
            <div className="sticky top-0 bg-surface-2 border-b border-border-subtle p-6 z-10">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-base font-semibold text-text-primary">
                    Event Inspector
                  </h2>
                  <p className="text-xs text-text-muted font-mono mt-1">
                    Request {event.request_id.slice(0, 12)}...
                  </p>
                </div>
                
                <button
                  onClick={onClose}
                  aria-label="Close event inspector"
                  className="text-text-muted hover:text-text-primary transition-[transform,opacity]"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-5 h-5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18 18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              
              <div className="mt-4">
                <VerdictBadge
                  decision={event.kill_switch_active ? 'REVOKED' : event.decision}
                  showIcon={true}
                />
              </div>
            </div>
            
            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Decision Details */}
              <section>
                <h3 className="text-xs font-mono uppercase tracking-wider text-text-muted mb-3">
                  Decision Details
                </h3>
                <div className="bg-surface-1 border border-border-subtle rounded-card p-4 space-y-0">
                  <DetailRow label="Verdict" value={event.decision} />
                  <DetailRow label="Runtime Mode" value={event.runtime_mode} />
                  <DetailRow label="Latency" value={`${latencyMs} ms`} />
                  <DetailRow label="Kill Switch" value={event.kill_switch_active ? 'ACTIVE' : 'Inactive'} />
                </div>
              </section>
              
              {/* Identity Context */}
              <section>
                <h3 className="text-xs font-mono uppercase tracking-wider text-text-muted mb-3">
                  Identity Context
                </h3>
                <div className="bg-surface-1 border border-border-subtle rounded-card p-4 space-y-0">
                  <DetailRow label="Agent ID" value={event.agent_id} copyable />
                  <DetailRow label="Trace ID" value={event.trace_id} copyable />
                  <DetailRow label="Request ID" value={event.request_id} copyable />
                  
                  {/* TODO: Add CIMD and RFC 8707 indicators when backend provides them */}
                </div>
              </section>
              
              {/* Target Information */}
              <section>
                <h3 className="text-xs font-mono uppercase tracking-wider text-text-muted mb-3">
                  Target Information
                </h3>
                <div className="bg-surface-1 border border-border-subtle rounded-card p-4 space-y-0">
                  <DetailRow label="MCP Server" value={event.target_server} />
                  <DetailRow label="Tool Name" value={event.tool_name || '—'} />
                </div>
              </section>
              
              {/* Policy Information */}
              <section>
                <h3 className="text-xs font-mono uppercase tracking-wider text-text-muted mb-3">
                  Policy Information
                </h3>
                <div className="bg-surface-1 border border-border-subtle rounded-card p-4 space-y-0">
                  <DetailRow
                    label="Policy Version"
                    value={event.policy_version}
                    copyable
                  />
                  {event.denial_reason && (
                    <div className="py-2 border-b border-border-subtle">
                      <span className="text-xs font-medium text-text-secondary uppercase tracking-wider block mb-2">
                        Denial Reason
                      </span>
                      <p className="text-sm text-state-deny font-mono whitespace-pre-wrap">
                        {event.denial_reason}
                      </p>
                    </div>
                  )}
                </div>
              </section>
              
              {/* Validator Summary */}
              {event.validator_summary.length > 0 && (
                <section>
                  <h3 className="text-xs font-mono uppercase tracking-wider text-text-muted mb-3">
                    Validator Summary
                  </h3>
                  <div className="bg-surface-1 border border-border-subtle rounded-card p-4">
                    <ul className="space-y-2">
                      {event.validator_summary.map((summary, idx) => (
                        <li
                          key={idx}
                          className="text-sm font-mono text-text-secondary"
                        >
                          {summary}
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>
              )}
              
              {/* Timestamp */}
              <section>
                <h3 className="text-xs font-mono uppercase tracking-wider text-text-muted mb-3">
                  Timestamp
                </h3>
                <div className="bg-surface-1 border border-border-subtle rounded-card p-4">
                  <p className="text-sm font-mono text-text-primary">
                    {event.timestamp_rfc3339}
                  </p>
                </div>
              </section>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
