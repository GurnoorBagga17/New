'use client';

import { useState, useId } from 'react';
import { CLAIMS } from '../data/claims';
import { useReducedMotion } from '../lib/motion';

interface ReplicaState {
  id: string;
  name: string;
  region: string;
  status: 'active' | 'killed';
  propagationMs: number;
}

export function KillSwitchDemo() {
  const [isKilled, setIsKilled] = useState(false);
  const [replayingCall, setReplayingCall] = useState(false);
  const [replayVerdict, setReplayVerdict] = useState<string | null>(null);
  const prefersReduced = useReducedMotion();
  const liveRegionId = useId();

  const propagationClaim = CLAIMS.killSwitchPropagation!;

  const initialReplicas: ReplicaState[] = [
    { id: 'gw-us-east-1a', name: 'Gateway Replica 1', region: 'us-east-1a', status: isKilled ? 'killed' : 'active', propagationMs: 12 },
    { id: 'gw-us-east-1b', name: 'Gateway Replica 2', region: 'us-east-1b', status: isKilled ? 'killed' : 'active', propagationMs: 18 },
    { id: 'gw-us-west-2a', name: 'Gateway Replica 3', region: 'us-west-2a', status: isKilled ? 'killed' : 'active', propagationMs: 24 },
    { id: 'gw-eu-west-1a', name: 'Gateway Replica 4', region: 'eu-west-1a', status: isKilled ? 'killed' : 'active', propagationMs: 38 },
    { id: 'gw-ap-northeast-1', name: 'Gateway Replica 5', region: 'ap-northeast-1', status: isKilled ? 'killed' : 'active', propagationMs: 44 },
  ];

  const handleKill = () => {
    setIsKilled(true);
    setReplayingCall(false);
    setReplayVerdict(null);
  };

  const handleReset = () => {
    setIsKilled(false);
    setReplayingCall(false);
    setReplayVerdict(null);
  };

  const handleReplayToolCall = () => {
    setReplayingCall(true);
    setTimeout(() => {
      setReplayVerdict(
        isKilled
          ? 'DENIED: Agent execution halted fleet-wide by emergency kill switch'
          : 'PERMITTED: Attestation verified; token lease active'
      );
      setReplayingCall(false);
    }, prefersReduced ? 0 : 350);
  };

  return (
    <div className="killswitch-container" role="region" aria-label="Fleet Emergency Revocation Demo">
      {/* Control Header */}
      <div className="killswitch-header">
        <div className="killswitch-title">
          <span className="killswitch-pulse" />
          <div>
            <h3>Fleet-Wide Emergency Revocation</h3>
            <p className="killswitch-subtitle">
              Propagates revocation across all distributed gateway nodes in {propagationClaim.value} {propagationClaim.unit}
              <span className={`claim-tag claim-tag--${propagationClaim.kind}`}> {propagationClaim.kind}</span>
            </p>
          </div>
        </div>

        <div className="killswitch-actions">
          {!isKilled ? (
            <button
              type="button"
              className="killswitch-btn killswitch-btn--danger"
              onClick={handleKill}
              aria-label="Trigger emergency fleet kill switch for compromised agent"
            >
              🛑 Kill Agent Fleet-Wide
            </button>
          ) : (
            <button
              type="button"
              className="killswitch-btn killswitch-btn--reset"
              onClick={handleReset}
              aria-label="Reset emergency kill switch demo"
            >
              ↺ Reset Fleet Replicas
            </button>
          )}
        </div>
      </div>

      {/* Screen Reader Announcement */}
      <div id={liveRegionId} className="sr-only" aria-live="polite">
        {isKilled
          ? `Emergency kill switch engaged. All 5 gateway replicas halted agent execution in under 50 milliseconds.`
          : `All 5 gateway replicas operational and evaluating live agent tool calls.`}
      </div>

      {/* Visual Replicas Grid */}
      <div className="killswitch-topology">
        {/* Agent Node */}
        <div className={`agent-node ${isKilled ? 'agent-node--killed' : 'agent-node--active'}`}>
          <div className="agent-node-badge">AGENT IDENTITY</div>
          <h4>agent:financial-recon</h4>
          <span className="agent-status-label">{isKilled ? 'REVOKED' : 'ONLINE'}</span>
        </div>

        <div className="topology-arrow" aria-hidden="true">&darr;</div>

        {/* 5 Gateway Nodes */}
        <div className="replicas-grid" role="list" aria-label="Distributed Gateway Replicas">
          {initialReplicas.map((gw) => (
            <div
              key={gw.id}
              role="listitem"
              className={`replica-card ${isKilled ? 'replica-card--killed' : 'replica-card--active'}`}
            >
              <div className="replica-header">
                <span className="replica-dot" />
                <span className="replica-region">{gw.region}</span>
              </div>
              <div className="replica-name">{gw.name}</div>
              <div className="replica-verdict">
                {isKilled ? `HALTED (+${gw.propagationMs}ms)` : 'ENFORCING'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Replay Verification Strip */}
      <div className="killswitch-verification">
        <div className="verification-prompt">
          <span>Test subsequent tool invocation:</span>
          <code>tools/call: postgres_query("SELECT * FROM transactions")</code>
        </div>

        <div className="verification-action">
          <button
            type="button"
            className="test-call-btn"
            onClick={handleReplayToolCall}
            disabled={replayingCall}
          >
            {replayingCall ? 'Dispatching...' : 'Dispatch Tool Call'}
          </button>
        </div>

        {replayVerdict && (
          <div className={`verification-verdict ${isKilled ? 'verdict--denied' : 'verdict--permitted'}`}>
            <strong>VERDICT:</strong> {replayVerdict}
          </div>
        )}
      </div>
    </div>
  );
}
