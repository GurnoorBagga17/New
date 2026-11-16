'use client';

import { useState, useMemo, useId } from 'react';
import {
  SAMPLE_GRAPH_NODES,
  SAMPLE_GRAPH_EDGES,
  computeReachable,
} from './graph.fixture';
import { useReducedMotion } from '../../lib/motion';

export function BlastRadiusGraph() {
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [isRevoked, setIsRevoked] = useState(false);
  const [revocationTimeMs, setRevocationTimeMs] = useState<number | null>(null);
  const prefersReduced = useReducedMotion();
  const liveRegionId = useId();

  // Selected or active leaked token ID
  const activeTokenId = 'tok-gh-app-sec';

  const { reachableIds } = useMemo(() => {
    if (!selectedTokenId || isRevoked) {
      return { reachableIds: new Set<string>() };
    }
    return computeReachable(selectedTokenId, SAMPLE_GRAPH_NODES, SAMPLE_GRAPH_EDGES);
  }, [selectedTokenId, isRevoked]);

  // Compute metrics for reachable nodes
  const reachableNodes = useMemo(() => {
    return SAMPLE_GRAPH_NODES.filter((n) => reachableIds.has(n.id) && n.id !== selectedTokenId);
  }, [reachableIds, selectedTokenId]);

  const sensitiveCount = useMemo(() => {
    return reachableNodes.filter((n) => n.sensitive).length;
  }, [reachableNodes]);

  const handleMarkLeaked = (tokenId: string) => {
    setSelectedTokenId(tokenId);
    setIsRevoked(false);
    setRevocationTimeMs(null);
  };

  const handleRevoke = () => {
    setIsRevoked(true);
    setRevocationTimeMs(18); // Simulated mock revocation speed
  };

  const handleReset = () => {
    setSelectedTokenId(null);
    setIsRevoked(false);
    setRevocationTimeMs(null);
  };

  return (
    <div className="blast-container" role="region" aria-label="Interactive Blast Radius and Lineage Graph">
      {/* Top Controls & Live Metrics Bar */}
      <div className="blast-toolbar">
        <div className="blast-title-group">
          <span className="blast-pill">MODULE 2A · LINEAGE BLAST RADIUS</span>
          <h3>Simulated Credential Blast Radius</h3>
        </div>

        <div className="blast-metrics">
          <div className={`metric-box ${reachableNodes.length > 0 ? 'metric-alert' : ''}`}>
            <span className="metric-label">REACHABLE NODES</span>
            <span className="metric-value">{reachableNodes.length}</span>
          </div>
          <div className={`metric-box ${sensitiveCount > 0 ? 'metric-critical' : ''}`}>
            <span className="metric-label">SENSITIVE ASSETS</span>
            <span className="metric-value">{sensitiveCount}</span>
          </div>
        </div>

        <div className="blast-actions">
          {!selectedTokenId ? (
            <button
              type="button"
              className="blast-btn blast-btn-leak"
              onClick={() => handleMarkLeaked(activeTokenId)}
            >
              Simulate Leaked Token
            </button>
          ) : isRevoked ? (
            <button type="button" className="blast-btn blast-btn-reset" onClick={handleReset}>
              Reset Simulation
            </button>
          ) : (
            <button type="button" className="blast-btn blast-btn-revoke" onClick={handleRevoke}>
              ⚡ Revoke Token Now
            </button>
          )}
        </div>
      </div>

      {/* Dynamic Status Notification Banner */}
      <div className="blast-status-banner">
        {!selectedTokenId ? (
          <p className="status-idle">
            Select a token below or click <strong>Simulate Leaked Token</strong> to observe transitive reachability across identities, roles, and datastores.
          </p>
        ) : isRevoked ? (
          <p className="status-revoked">
            ✓ Token revoked in <strong>{revocationTimeMs} ms (simulated)</strong>. All transitive access collapsed to 0.
          </p>
        ) : (
          <p className="status-alert">
            ⚠️ <strong>{selectedTokenId}</strong> compromised. Transitive reachability spans <strong>{reachableNodes.length} downstream assets</strong> including {sensitiveCount} sensitive datastores.
          </p>
        )}
      </div>

      {/* Screen Reader Live Region */}
      <div id={liveRegionId} className="sr-only" aria-live="polite">
        {!selectedTokenId
          ? 'Simulation idle. Zero compromised assets.'
          : isRevoked
          ? `Token revoked in ${revocationTimeMs} milliseconds. Zero downstream assets reachable.`
          : `Token marked as leaked. ${reachableNodes.length} downstream assets reachable, including ${sensitiveCount} sensitive assets.`}
      </div>

      {/* SVG Interactive Canvas */}
      <div className="blast-canvas-wrap">
        <svg
          viewBox="0 0 800 480"
          className="blast-svg"
          role="img"
          aria-label="Blast radius topology graph showing agents, tokens, roles, and sensitive resources"
        >
          {/* Column Background Guide Stripes */}
          <rect x="10" y="10" width="180" height="460" rx="8" fill="var(--bg-surface-1)" opacity="0.4" />
          <rect x="210" y="10" width="180" height="460" rx="8" fill="var(--bg-surface-1)" opacity="0.4" />
          <rect x="410" y="10" width="180" height="460" rx="8" fill="var(--bg-surface-1)" opacity="0.4" />
          <rect x="610" y="10" width="180" height="460" rx="8" fill="var(--bg-surface-1)" opacity="0.4" />

          {/* Column Header Labels */}
          <text x="100" y="30" textAnchor="middle" className="svg-col-title">AGENTS</text>
          <text x="300" y="30" textAnchor="middle" className="svg-col-title">TOKENS / SA</text>
          <text x="500" y="30" textAnchor="middle" className="svg-col-title">ROLES & SECRETS</text>
          <text x="700" y="30" textAnchor="middle" className="svg-col-title">TARGET RESOURCES</text>

          {/* Render Directed Edges */}
          <g className="blast-edges">
            {SAMPLE_GRAPH_EDGES.map((edge, idx) => {
              const fromNode = SAMPLE_GRAPH_NODES.find((n) => n.id === edge.from);
              const toNode = SAMPLE_GRAPH_NODES.find((n) => n.id === edge.to);
              if (!fromNode || !toNode) return null;

              const isEdgeSevered = isRevoked && (edge.from === selectedTokenId || edge.to === selectedTokenId);
              const isEdgeHighlighted =
                !isRevoked &&
                selectedTokenId &&
                reachableIds.has(edge.from) &&
                reachableIds.has(edge.to);

              const strokeColor = isEdgeSevered
                ? 'var(--text-muted)'
                : isEdgeHighlighted
                ? 'var(--state-deny)'
                : 'var(--border-subtle)';

              const strokeWidth = isEdgeHighlighted ? 2.5 : 1.2;
              const strokeDash = isEdgeSevered ? '4 4' : 'none';
              const opacity = isEdgeSevered ? 0.25 : isEdgeHighlighted ? 0.95 : 0.45;

              return (
                <line
                  key={`${edge.from}-${edge.to}-${idx}`}
                  x1={fromNode.x + 30}
                  y1={fromNode.y}
                  x2={toNode.x - 30}
                  y2={toNode.y}
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeDasharray={strokeDash}
                  opacity={opacity}
                  className={isEdgeHighlighted && !prefersReduced ? 'blast-edge-glow' : ''}
                />
              );
            })}
          </g>

          {/* Render Nodes */}
          <g className="blast-nodes">
            {SAMPLE_GRAPH_NODES.map((node) => {
              const isSelected = node.id === selectedTokenId;
              const isReachable = reachableIds.has(node.id) && !isSelected;
              const isTargetToken = node.id === activeTokenId;

              let nodeFill = 'var(--bg-surface-2)';
              let nodeStroke = 'var(--border-strong)';
              let textFill = 'var(--text-primary)';

              if (isSelected) {
                nodeFill = isRevoked ? 'var(--bg-surface-3)' : 'var(--state-deny-tint)';
                nodeStroke = isRevoked ? 'var(--state-revoked)' : 'var(--state-deny)';
                textFill = isRevoked ? 'var(--text-muted)' : 'var(--state-deny)';
              } else if (isReachable) {
                nodeFill = node.sensitive ? 'var(--state-deny-tint)' : 'var(--state-pending-tint)';
                nodeStroke = node.sensitive ? 'var(--state-deny)' : 'var(--state-pending)';
                textFill = 'var(--text-primary)';
              } else if (isTargetToken && !selectedTokenId) {
                nodeStroke = 'var(--brand-cyan)';
              }

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  tabIndex={0}
                  role="button"
                  aria-label={`${node.label} (${node.kind})${isReachable ? ' - Reachable from compromised token' : ''}`}
                  onClick={() => node.kind === 'token' && handleMarkLeaked(node.id)}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && node.kind === 'token') {
                      e.preventDefault();
                      handleMarkLeaked(node.id);
                    }
                  }}
                  className="blast-node-group"
                  style={{ cursor: node.kind === 'token' ? 'pointer' : 'default' }}
                >
                  <rect
                    x="-65"
                    y="-18"
                    width="130"
                    height="36"
                    rx="6"
                    fill={nodeFill}
                    stroke={nodeStroke}
                    strokeWidth={isSelected || isReachable ? 2 : 1}
                  />
                  <text
                    x="0"
                    y="-2"
                    textAnchor="middle"
                    fill={textFill}
                    fontSize="9.5"
                    fontWeight="600"
                    fontFamily="var(--typography-font-family-mono)"
                  >
                    {node.label.length > 20 ? `${node.label.slice(0, 18)}…` : node.label}
                  </text>
                  <text
                    x="0"
                    y="10"
                    textAnchor="middle"
                    fill="var(--text-muted)"
                    fontSize="8"
                    fontFamily="var(--typography-font-family-sans)"
                  >
                    {node.sublabel ?? node.kind}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Screen Reader Accessible Table */}
      {reachableNodes.length > 0 && (
        <div className="sr-only">
          <h4>Reachable Assets from {selectedTokenId}</h4>
          <table>
            <thead>
              <tr>
                <th>Resource Name</th>
                <th>Type</th>
                <th>Classification</th>
              </tr>
            </thead>
            <tbody>
              {reachableNodes.map((n) => (
                <tr key={n.id}>
                  <td>{n.label}</td>
                  <td>{n.kind}</td>
                  <td>{n.sensitive ? 'Sensitive / Confidential' : 'Internal'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
