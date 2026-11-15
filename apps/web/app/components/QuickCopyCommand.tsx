"use client";

import { useState } from "react";

export function QuickCopyCommand({ command = "docker compose up axiom-gateway" }: { command?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  return (
    <div className="command-pill-wrapper">
      <button 
        type="button" 
        onClick={handleCopy} 
        className={`command-pill ${copied ? "is-copied" : ""}`}
        aria-label="Copy docker compose command to clipboard"
      >
        <span className="command-text">{command}</span>
        <span className="command-copy-icon" aria-hidden="true">
          {copied ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="copy-check">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
        </span>
        {copied && <span className="copy-feedback-tooltip">Copied!</span>}
      </button>
    </div>
  );
}
