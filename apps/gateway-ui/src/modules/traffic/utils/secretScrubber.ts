/**
 * Module 1B: Secret Pattern Detection
 * Team 7B: Defensive scrubber to prevent secrets in DOM/store/clipboard
 * 
 * Patterns from Team 0 security spec (canary patterns)
 */

import sharedSecretSpec from "../../../../../../docs/api-contracts/secret-patterns.json";

export interface SecretPattern {
  name: string;
  pattern: RegExp;
  description: string;
}

/**
 * Canonical secret patterns from Team 0 security spec
 * These must NEVER appear in:
 * - DOM nodes (including data attributes)
 * - localStorage/sessionStorage
 * - Zustand store
 * - Clipboard operations
 */
const DISPLAY_NAMES: Record<string, string> = {
  "authorization-header": "Bearer Token",
  "bearer-value": "Bearer Token",
  "jwt-shaped": "JWT",
  "private-key-block": "Private Key Header",
  "secret-assignment": "Generic Secret Marker",
  "aws-access-key": "AWS Access Key",
  "github-token": "GitHub Token",
  "openai-style-key": "OpenAI Key",
};

export const SECRET_PATTERNS: SecretPattern[] = sharedSecretSpec.patterns.map(
  ({ id, regex }) => {
    const insensitive = regex.startsWith("(?i)");
    return {
      name: DISPLAY_NAMES[id] ?? id,
      pattern: new RegExp(insensitive ? regex.slice(4) : regex, insensitive ? "i" : ""),
      description: `Shared Team 0 pattern: ${id}`,
    };
  },
);

/**
 * Check if text contains any secret patterns
 */
export function containsSecret(text: string): {
  found: boolean;
  matches: Array<{ pattern: string; match: string }>;
} {
  const matches: Array<{ pattern: string; match: string }> = [];
  
  for (const { name, pattern } of SECRET_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      matches.push({
        pattern: name,
        match: match[0].slice(0, 50) + (match[0].length > 50 ? '...' : ''),
      });
    }
  }
  
  return {
    found: matches.length > 0,
    matches,
  };
}

/**
 * Scan DOM for secret patterns
 * Used in defensive test assertions
 */
export function scanDOMForSecrets(): {
  found: boolean;
  violations: Array<{ element: string; pattern: string; snippet: string }>;
} {
  const violations: Array<{ element: string; pattern: string; snippet: string }> = [];
  
  // Scan all text nodes
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
  );
  
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.textContent || '';
    const result = containsSecret(text);
    
    if (result.found) {
      for (const match of result.matches) {
        violations.push({
          element: node.parentElement?.tagName || 'UNKNOWN',
          pattern: match.pattern,
          snippet: match.match,
        });
      }
    }
  }
  
  // Scan data attributes - get all elements and check their attributes
  const allElements = document.getElementsByTagName("*");
  Array.from(allElements).forEach((element) => {
    Array.from(element.attributes).forEach((attr) => {
      if (attr.name.startsWith('data-')) {
        const result = containsSecret(attr.value);
        if (result.found) {
          for (const match of result.matches) {
            violations.push({
              element: `${element.tagName}[${attr.name}]`,
              pattern: match.pattern,
              snippet: match.match,
            });
          }
        }
      }
    });
  });
  
  return {
    found: violations.length > 0,
    violations,
  };
}

/**
 * Scan storage for secrets
 */
export function scanStorageForSecrets(): {
  found: boolean;
  violations: Array<{ storage: string; key: string; pattern: string }>;
} {
  const violations: Array<{ storage: string; key: string; pattern: string }> = [];
  
  const checkStorage = (storage: Storage, name: string) => {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key) continue;
      
      const value = storage.getItem(key);
      if (!value) continue;
      
      const result = containsSecret(value);
      if (result.found) {
        for (const match of result.matches) {
          violations.push({
            storage: name,
            key,
            pattern: match.pattern,
          });
        }
      }
    }
  };
  
  if (typeof localStorage !== 'undefined') {
    checkStorage(localStorage, 'localStorage');
  }
  
  if (typeof sessionStorage !== 'undefined') {
    checkStorage(sessionStorage, 'sessionStorage');
  }
  
  return {
    found: violations.length > 0,
    violations,
  };
}
