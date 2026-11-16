---
name: extmcp-policy-guard
description: Enforce fail-closed defaults on network/timeout errors, SHA-256 cryptographic payload binding for single-use approvals, strict SQL AST verb filtering, filesystem path canonicalization, and outbound HTTP egress allowlisting.
---

# ExtMCP Policy Guard & Security Enforcement Skill

This skill governs the security requirements for the `ExtMCP` policy callout service, running in Rust as an inline policy evaluation hook or sidecar to `agentgateway`.

## Core Guardrail Architecture

### 1. Fail-Closed Policy Enforcement
- Every network interruption, Cedar evaluation error, SpiceDB partition, or processing timeout (> 1.5ms budget) MUST immediately evaluate to `Action::Deny` / `Verdict::Reject`.
- Never provide fallback permissive paths or soft-fail modes.

### 2. Argument Validation Engine (`validators` crate)
- **SQL AST Parsing & Verb Filtering:**
  - Parse inbound SQL using `sqlparser` before tool execution.
  - Reject destructive DDL operations (`DROP`, `TRUNCATE`, `ALTER`) and bulk operations (`DELETE WITHOUT WHERE`, `UPDATE WITHOUT WHERE`) unless signed by a cryptographically verified break-glass approval token.
- **Filesystem Canonicalization:**
  - Resolve and canonicalize all requested filesystem paths (`std::fs::canonicalize`).
  - Reject directory traversal payloads containing relative sequences (`../`, `..\\`), embedded null bytes, or paths traversing outside permitted container/sandbox directories.
- **Egress HTTP Allowlisting:**
  - Validate all egress destinations against strict CIDR and FQDN allowlists.
  - Automatically reject cloud metadata addresses (`169.254.169.254`), loopback ranges (`127.0.0.0/8`, `::1`), and non-routable private ranges unless explicitly authorized.

### 3. Cryptographic Payload Binding for Approvals
- Any action flagged for human-in-the-loop escalation (Slack/CLI) must calculate:
  $$\text{Digest} = \text{SHA-256}(\text{Canonicalize}(\text{JSON-RPC Request Payload}))$$
- The approver signs this hash.
- Prior to dispatching the approved tool call, `ExtMCP` MUST recompute the payload hash and assert exact equivalence to prevent Time-of-Check to Time-of-Use (TOCTOU) payload swapping.
- Tokens must be single-use with a maximum TTL of 300 seconds.

### 4. Deterministic Audit Trace Attribution
- Generate an OpenTelemetry span (`axiom.extmcp.policy_decision`) for every decision.
- Record `subject_nhi_id`, `client_id`, `tool_name`, `decision` (`PERMIT` | `DENY`), `evaluation_latency_us`, and `rule_id`.
