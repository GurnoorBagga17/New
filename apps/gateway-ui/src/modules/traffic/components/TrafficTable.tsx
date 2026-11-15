/**
 * Module 1B: Virtualized 5-Column High-Density Traffic Table
 * Team 7B: TanStack Virtual + Table, 500+ events/sec at 60 FPS
 * 
 * Columns: Identity | Target Tool | Active Mode/Policy | Latency ms | Verdict
 * Target: < 16ms frame budget with transform/opacity animations only
 */

import { useVirtualizer } from '@tanstack/react-virtual';
import {
  useReactTable,
  getCoreRowModel,
  createColumnHelper,
  flexRender,
} from '@tanstack/react-table';
import type { ColumnDef } from '@tanstack/react-table';
import { useRef, useMemo } from 'react';
import { motion } from 'motion/react';
import type { AuditEvent } from '../types';
import { VerdictBadge } from './VerdictBadge';

interface TrafficTableProps {
  events: AuditEvent[];
  onRowClick: (event: AuditEvent) => void;
  selectedEventId: string | null;
}

const columnHelper = createColumnHelper<AuditEvent>();

// EASE_TELEMETRY: cubic-bezier(0.16, 1, 0.3, 1), 220ms
const EASE_TELEMETRY = [0.16, 1, 0.3, 1] as const;

export function TrafficTable({
  events,
  onRowClick,
  selectedEventId,
}: TrafficTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  
  // Define columns matching Phase 1 spec
  const columns = useMemo(
    () => [
      columnHelper.accessor('agent_id', {
        id: 'identity',
        header: 'Identity',
        cell: (info) => {
          const value = info.getValue();
          const isAnonymous = value === 'anonymous';
          
          return (
            <div className="flex flex-col">
              <span
                className={`text-sm font-medium ${
                  isAnonymous ? 'text-text-muted' : 'text-text-primary'
                }`}
              >
                {value}
              </span>
              {!isAnonymous && (
                <span className="text-xs text-text-muted font-mono">
                  {info.row.original.trace_id.slice(0, 12)}...
                </span>
              )}
            </div>
          );
        },
        size: 200,
      }),
      
      columnHelper.accessor('tool_name', {
        id: 'tool',
        header: 'Target Tool',
        cell: (info) => {
          const toolName = info.getValue();
          const server = info.row.original.target_server;
          
          return (
            <div className="flex flex-col">
              <span className="text-sm font-medium text-text-primary">
                {toolName || '—'}
              </span>
              <span className="text-xs text-text-secondary">{server}</span>
            </div>
          );
        },
        size: 220,
      }),
      
      columnHelper.accessor('runtime_mode', {
        id: 'mode',
        header: 'Active Mode / Policy',
        cell: (info) => {
          const mode = info.getValue();
          const policyVersion = info.row.original.policy_version;
          const killSwitch = info.row.original.kill_switch_active;
          
          return (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-mono uppercase tracking-wider ${
                    mode === 'enforce'
                      ? 'text-state-enforce'
                      : 'text-state-observe'
                  }`}
                >
                  {mode}
                </span>
                {killSwitch && (
                  <span className="text-xs font-mono uppercase tracking-wider text-state-revoked">
                    REVOKED
                  </span>
                )}
              </div>
              <span className="text-xs text-text-muted font-mono">
                {policyVersion.slice(0, 8)}
              </span>
            </div>
          );
        },
        size: 200,
      }),
      
      columnHelper.accessor('latency_us', {
        id: 'latency',
        header: 'Latency',
        cell: (info) => {
          const latencyUs = info.getValue();
          const latencyMs = (latencyUs / 1000).toFixed(2);
          
          let colorClass = 'text-state-enforce';
          if (latencyUs > 5000) colorClass = 'text-state-deny font-bold';
          else if (latencyUs > 3000) colorClass = 'text-brand-orange';
          
          return (
            <span className={`text-xs font-mono font-semibold ${colorClass}`}>
              {latencyMs} ms
            </span>
          );
        },
        size: 110,
      }),
      
      columnHelper.accessor('decision', {
        id: 'verdict',
        header: 'Verdict',
        cell: (info) => {
          const decision = info.getValue();
          const killSwitch = info.row.original.kill_switch_active;
          
          return (
            <VerdictBadge
              decision={killSwitch ? 'REVOKED' : decision}
              showIcon={true}
            />
          );
        },
        size: 140,
      }),
    ] as ColumnDef<AuditEvent>[],
    [],
  );
  
  // Table instance
  const table = useReactTable({
    data: events,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
  
  // Virtualizer for rows
  const virtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72, // Fixed row height
    overscan: 10,
  });
  
  const virtualRows = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  
  return (
    <div
      ref={parentRef}
      className="h-[min(65vh,680px)] min-h-[360px] overflow-auto rounded-card border border-border-subtle bg-surface-1"
    >
      <table className="w-full">
        <thead className="sticky top-0 z-10 bg-surface-2 border-b border-border-subtle">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="text-left px-4 py-3 text-xs font-medium text-text-secondary uppercase tracking-wider"
                  style={{ width: header.getSize() }}
                >
                  {header.isPlaceholder
                    ? null
                    : header.column.columnDef.header?.toString()}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        
        <tbody className="relative" style={{ height: `${totalSize}px` }}>
          {virtualRows.map((virtualRow) => {
            const row = table.getRowModel().rows[virtualRow.index];
            if (!row) return null;
            
            const isSelected = row.original.request_id === selectedEventId;
            
            return (
              <motion.tr
                key={row.id}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.22,
                  ease: EASE_TELEMETRY,
                }}
                className={`absolute top-0 left-0 w-full cursor-pointer border-b border-border-subtle transition-[transform,opacity] ${
                  isSelected
                    ? 'bg-surface-3'
                    : 'hover:bg-surface-2'
                }`}
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                onClick={() => onRowClick(row.original)}
                tabIndex={0}
                aria-selected={isSelected}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onRowClick(row.original);
                  }
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="px-4 py-3"
                    style={{ width: cell.column.getSize() }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </motion.tr>
            );
          })}
        </tbody>
      </table>
      
      {events.length === 0 && (
        <div className="flex items-center justify-center h-full text-text-muted">
          <div className="text-center">
            <p className="text-sm font-medium">No events yet</p>
            <p className="text-xs mt-1">Waiting for MCP traffic...</p>
          </div>
        </div>
      )}
    </div>
  );
}
