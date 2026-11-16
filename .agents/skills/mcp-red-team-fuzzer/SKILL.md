---
name: mcp-red-team-fuzzer
description: Generate adversarial JSON-RPC tool calls (SQL injection, path traversal, SSRF URLs, mutated tool schemas for definition pinning) to automate Gate G1 and Week 4 Red-Team simulation tests.
---

# MCP Red-Team Fuzzer & Adversarial Testing Skill

This skill provides methodologies, payloads, and automated test generators to simulate real-world attacks against Axiom NHI's `agentgateway` and `ExtMCP` service.

## Attack Vectors & Test Suites

### 1. SQL Injection & DDL Bypass Attacks
Generate payloads attempting to evade basic string filtering:
- Multi-statement injection: `SELECT 1; DROP TABLE users;`
- Inline comments: `UN/*comment*/ION SELECT password FROM credentials;`
- Hex-encoded / unicode bypasses: `0x73656c656374...`
- Verification: Assert `ExtMCP` SQL AST parser extracts the true AST root and blocks non-SELECT verbs when read-only mode is active.

### 2. Path Traversal & Sandbox Escape
- Relative traversal patterns: `../../../../etc/shadow`, `..\\..\\windows\\system32\\config\\sam`
- URL-encoded & double-encoded traversal: `%2e%2e%2f`, `%252e%252e%252f`
- Null byte injections: `/workspace/safe.txt\0/etc/passwd`
- Symlink traversal: Verify symlink target resolution outside allowed workspace boundaries.

### 3. Server-Side Request Forgery (SSRF) & Egress Evasion
- AWS/GCP/Azure Metadata endpoints: `http://169.254.169.254/latest/meta-data/`
- Decimal/Octal IP representations: `http://2852039166/` (169.254.169.254)
- DNS Rebinding simulation: Test dynamic DNS updates resolving to internal loopback `127.0.0.1`.
- IPv6 loopback variants: `http://[::1]:8080/admin`

### 4. Tool-Definition Pinning & Schema Mutation
- In-flight schema replacement: Alter the tool schema parameter definitions between session initialization and tool invocation.
- Shadowing attacks: Declare duplicate tool names with differing argument types.
- Verification: Ensure `agentgateway` and `ExtMCP` verify the cryptographic hash of registered tool definitions before every execution.

## Automated Execution Harness

Execute the red-team fuzz suite:

```bash
cargo test --package tests --test red_team_fuzz
```
