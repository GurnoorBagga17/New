---
name: cedar-guardrail
description: Enforce non-negotiable Cedar policy guardrails, ExtMCP argument validation (SQL verbs, filesystem paths, egress domains), cryptographic payload approval hashing, and fail-closed security for Axiom NHI.
---

# Cedar Guardrail & Security Enforcement Skill

This skill guides the design, implementation, and verification of policy enforcement mechanisms for Axiom NHI (Non-Human Identity) governance.

## Core Non-Negotiable Architecture Constraints

1. **Deterministic Fail-Closed Policy:**
   - Any failure in policy evaluation (Cedar engine error, syntax mismatch, timeout, network partition) MUST default to `DENY` / `ABORT`.
   - Never allow fallback to permissive execution or unauthenticated bypass.

2. **ExtMCP Argument Validation Rules:**
   - **SQL Queries:** Intercept and parse SQL statements. Deny destructive DDL (`DROP`, `TRUNCATE`, `ALTER`) unless explicitly authorized by cryptographic break-glass approval tokens. Validate read-only constraints where applicable.
   - **Filesystem Paths:** Strictly canonicalize paths before evaluation to block directory traversal attacks (`../`, symlink exploitation). Enforce sandbox containment within designated project roots.
   - **HTTP Egress Domains:** Enforce explicit domain allowlists (CIDR / FQDN). Deny DNS rebinding and internal loopback/metadata queries (e.g., `169.254.169.254`, `localhost`, link-local addresses).

3. **Cryptographic Payload Hashing for Human-in-the-Loop Approvals:**
   - High-risk operations requiring escalation must generate a SHA-256/BLAKE3 digest of the exact parsed canonical payload.
   - The approver signs the payload digest. Execution MUST verify the incoming payload matches the signed hash at runtime to prevent TOCTOU (Time-of-Check to Time-of-Use) tampering.

4. **Licensing Isolation (Clean Apache-2.0 Boundaries):**
   - Axiom NHI codebase is licensed under **Apache-2.0**.
   - **OpenBao** (MPL-2.0) must be shipped and integrated as an **unmodified binary/service** communicating strictly over standard APIs (HTTP/gRPC) across network boundaries.
   - Never vendor or statically link MPL-2.0 source code into Apache-2.0 binaries.

5. **Protocol & Spec Compliance:**
   - Enforce **IETF RFC 8693** (OAuth 2.0 Token Exchange) for cross-service agent delegation.
   - Enforce **RFC 8707** (Resource Indicators for OAuth 2.0).
   - Comply with **MCP OAuth 2.1 (CIMD - Client Identification and Metadata Discovery)**.
   - Mitigate vulnerabilities outlined in the **OWASP Non-Human Identity (NHI) & Agentic Top 10**.

## Implementation Checklist

- [ ] Verify `cedar-policy` engine initialization with caching.
- [ ] Check argument parsers for SQL, Path, and URL before calling Cedar `is_authorized`.
- [ ] Ensure OTel audit spans are emitted for every policy decision (`ALLOW` or `DENY`) with full deterministic context (subject NHI, resource, action, context hash, latency).
- [ ] Validate timeout handling: enforce sub-millisecond execution budget. If evaluation exceeds budget, fail closed.
