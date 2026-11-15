import type { ButtonHTMLAttributes, ReactNode } from "react";

export type StateKind = "enforce" | "observe" | "pending" | "deny" | "revoked";

const stateIcons: Record<StateKind, string> = {
  enforce: "✓",
  observe: "◉",
  pending: "◷",
  deny: "⊘",
  revoked: "⨯",
};

export function StateBadge({ state, children }: { state: StateKind; children: string }) {
  return <span className={`ax-state ax-state--${state}`}><span aria-hidden="true">{stateIcons[state]}</span><span>{children.toUpperCase()}</span></span>;
}

export function Button({ variant = "primary", children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" }) {
  return <button className={`ax-button ax-button--${variant} ${className}`} {...props}>{children}</button>;
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`ax-panel ${className}`}>{children}</section>;
}
