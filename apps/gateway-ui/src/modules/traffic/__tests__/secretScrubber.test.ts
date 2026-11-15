/**
 * Module 1B: Secret Scrubber Defensive Test (B7)
 * Team 7B: MUST FAIL if secrets reach DOM/store/clipboard
 * 
 * This test is a BLOCKING gate - it must pass for Gate G1
 */

import { describe, it, expect } from 'vitest';
import {
  containsSecret,
  scanDOMForSecrets,
  scanStorageForSecrets,
} from '../utils/secretScrubber';

describe('Secret Pattern Detection', () => {
  it('should detect Bearer tokens', () => {
    const text = 'Authorization: Bearer abc123def456ghi789jkl012mno345pqr678';
    const result = containsSecret(text);
    
    expect(result.found).toBe(true);
    expect(result.matches[0]?.pattern).toBe('Bearer Token');
  });
  
  it('should detect JWTs', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const result = containsSecret(jwt);
    
    expect(result.found).toBe(true);
    expect(result.matches[0]?.pattern).toBe('JWT');
  });
  
  it('should detect OpenAI keys', () => {
    const text = 'API_KEY=sk-1234567890abcdefghij';
    const result = containsSecret(text);
    
    expect(result.found).toBe(true);
    expect(result.matches.some((m) => m.pattern === 'OpenAI Key')).toBe(true);
  });
  
  it('should detect AWS access keys', () => {
    const text = 'aws_access_key_id=AKIAIOSFODNN7EXAMPLE';
    const result = containsSecret(text);
    
    expect(result.found).toBe(true);
    expect(result.matches.some((m) => m.pattern === 'AWS Access Key')).toBe(true);
  });
  
  it('should detect GitHub tokens', () => {
    const text = 'GITHUB_TOKEN=ghp_1234567890abcdefghijklmnopqrstuvwxyz';
    const result = containsSecret(text);
    
    expect(result.found).toBe(true);
    expect(result.matches.some((m) => m.pattern === 'GitHub Token')).toBe(true);
  });
  
  it('should detect private key headers', () => {
    const text = '-----BEGIN RSA PRIVATE KEY-----\nMIIE...';
    const result = containsSecret(text);
    
    expect(result.found).toBe(true);
    expect(result.matches[0]?.pattern).toBe('Private Key Header');
  });
  
  it('should detect generic secret patterns', () => {
    const text = 'password: "mySecretPassword123"';
    const result = containsSecret(text);
    
    expect(result.found).toBe(true);
    expect(result.matches[0]?.pattern).toBe('Generic Secret Marker');
  });
  
  it('should not flag safe identifiers', () => {
    const safeText = 'agent_id: finance-agent-prod, trace_id: abc123def456';
    const result = containsSecret(safeText);
    
    expect(result.found).toBe(false);
  });
  
  it('should not flag policy versions (SHA-256)', () => {
    const sha256 = 'policy_version: a1b2c3d4e5f67890abcdef1234567890';
    const result = containsSecret(sha256);
    
    // SHA-256 hashes are safe metadata
    expect(result.found).toBe(false);
  });
});

describe('DOM Secret Scanning', () => {
  it('should detect secrets in DOM text nodes', () => {
    // Setup: inject a secret into DOM
    const div = document.createElement('div');
    div.textContent = 'Token: Bearer abc123def456ghi789jkl012mno345pqr678';
    document.body.appendChild(div);
    
    const result = scanDOMForSecrets();
    
    expect(result.found).toBe(true);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0]?.pattern).toBe('Bearer Token');
    
    // Cleanup
    document.body.removeChild(div);
  });
  
  it('should detect secrets in data attributes', () => {
    const div = document.createElement('div');
    div.setAttribute('data-token', 'sk-1234567890abcdefghij');
    document.body.appendChild(div);
    
    const result = scanDOMForSecrets();
    
    expect(result.found).toBe(true);
    expect(result.violations.some((v) => v.pattern === 'OpenAI Key')).toBe(true);
    
    // Cleanup
    document.body.removeChild(div);
  });
  
  it('should pass when DOM is clean', () => {
    // Clean DOM should have no violations
    const result = scanDOMForSecrets();
    
    // This test will fail if ANY secret leaks into the DOM during other tests
    expect(result.found).toBe(false);
    
    if (result.found) {
      console.error('Secret violations found in DOM:', result.violations);
    }
  });
});

describe('Storage Secret Scanning', () => {
  it('should detect secrets in localStorage', () => {
    localStorage.setItem('api_key', 'sk-1234567890abcdefghij');
    
    const result = scanStorageForSecrets();
    
    expect(result.found).toBe(true);
    expect(result.violations.some((v) => v.pattern === 'OpenAI Key')).toBe(true);
    
    // Cleanup
    localStorage.removeItem('api_key');
  });
  
  it('should detect secrets in sessionStorage', () => {
    sessionStorage.setItem('token', 'Bearer abc123def456ghi789jkl012mno345pqr678');
    
    const result = scanStorageForSecrets();
    
    expect(result.found).toBe(true);
    expect(result.violations.some((v) => v.pattern === 'Bearer Token')).toBe(true);
    
    // Cleanup
    sessionStorage.removeItem('token');
  });
  
  it('should pass when storage is clean', () => {
    // Clear all storage
    localStorage.clear();
    sessionStorage.clear();
    
    const result = scanStorageForSecrets();
    
    expect(result.found).toBe(false);
    
    if (result.found) {
      console.error('Secret violations found in storage:', result.violations);
    }
  });
});

describe('Gate G1 Compliance', () => {
  it('[BLOCKING] DOM must never contain raw secrets', () => {
    const result = scanDOMForSecrets();
    
    if (result.found) {
      console.error(
        'FAIL: Secrets found in DOM (violates zero-secret browser invariant):',
        result.violations,
      );
    }
    
    expect(result.found).toBe(false);
  });
  
  it('[BLOCKING] Storage must never contain raw secrets', () => {
    const result = scanStorageForSecrets();
    
    if (result.found) {
      console.error(
        'FAIL: Secrets found in browser storage (violates zero-secret browser invariant):',
        result.violations,
      );
    }
    
    expect(result.found).toBe(false);
  });
});
