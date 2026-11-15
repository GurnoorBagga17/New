/**
 * Verdict Badge Component
 * Team 7B: Semantic state display (always icon + uppercase mono label)
 * 
 * Rule: Status is NEVER color-only (WCAG 2.1 AA compliance)
 */

import { VERDICT_DISPLAY_MAP, VERDICT_COLOR_MAP } from '../types';

interface VerdictBadgeProps {
  decision: string;
  showIcon?: boolean;
}

// SVG icon paths (inline to avoid external requests)
const ICONS = {
  ALLOW: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
    />
  ),
  OBSERVE: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
    />
  ),
  DENY: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636"
    />
  ),
  REVOKED: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
    />
  ),
  PENDING: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
    />
  ),
};

export function VerdictBadge({ decision, showIcon = true }: VerdictBadgeProps) {
  const recognized = Object.hasOwn(VERDICT_DISPLAY_MAP, decision);
  const displayText = recognized ? VERDICT_DISPLAY_MAP[decision]! : 'UNKNOWN';
  const statusKey = recognized ? VERDICT_COLOR_MAP[decision]! : 'state-pending';
  const visualState = statusKey.replace('state-', '');
  const icon = ICONS[displayText as keyof typeof ICONS] || ICONS.PENDING;
  
  return (
    <div
      className={`verdict-badge verdict-badge--${visualState}`}
      aria-label={recognized ? displayText : `UNKNOWN verdict: ${decision}`}
      title={recognized ? undefined : decision}
    >
      {showIcon && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="verdict-badge__icon"
        >
          {icon}
        </svg>
      )}
      <span className="verdict-badge__label">
        {displayText}
      </span>
    </div>
  );
}
