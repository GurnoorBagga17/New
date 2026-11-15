# Axiom NHI — Gateway Runtime Behavior Matrix & Mode Enforcement

**Author:** Team 1 (Gateway & Runtime Infrastructure)  
**Status:** Reviewable Slice for Gate G1 (Draft v0.1.0)  
**Target Milestone:** Gate G1 (90-day MCP runtime security wedge)  
**Affected Teams:** Team 0 (Architecture), Team 2 (Policy), Team 5 (Observability & Kill-Switch), Team 6 (QA)

---

## 1. Gateway Runtime Mode Behavior Matrix

The gateway acts as the deterministic enforcement boundary between the upstream AI agent/client and the backend MCP tool server. Below is the behavioral contract across all request conditions and runtime modes:

| Ingress Condition | Observe-Only Mode (`observe-only`) | Enforce Mode (`enforce`) |
| :--- | :--- | :--- |
| **ExtMCP Permit (`Pass`)** | **Forward** call to MCP backend. Emit `decision: "ALLOW"` audit event. | **Forward** call to MCP backend. Emit `decision: "ALLOW"` audit event. |
| **ExtMCP Deny (`AuthorizationError`)** | **Forward** call to MCP backend with zero disruption. Record shadow denial (`decision: "WOULD_DENY"`) in audit telemetry. | **Block** call before backend execution. Return typed denial response (see Section 2). Emit `decision: "DENY"` audit event. |
| **ExtMCP Timeout (>15ms) or Unavailable** | **Forward** call to MCP backend. Emit shadow failure `decision: "WOULD_DENY"` with reason `"EXTMCP_TIMEOUT_FAIL_OPEN"`. | **Fail Closed (Block)**. Return JSON-RPC error `-32001` with message `"Security gateway unavailable"`. Emit `decision: "DENY"` with reason `"EXTMCP_TIMEOUT_FAIL_CLOSED"`. |
| **Active Emergency Kill Switch** | **Flagged Decision (See Section 3):**<br>• *Default/Recommended:* **Block** call before backend execution with `-32001`.<br>• *Strict Shadow:* Forward with shadow kill-switch alert. | **Block** call before backend execution immediately (<1ms). Return JSON-RPC error `-32001` (`"REVOCATION_ACTIVE"`). Backend never executes. |

---

## 2. Client Response Envelopes & Error Code Mapping

In accordance with Model Context Protocol standards and agentgateway error specifications, response formatting differs by MCP method to avoid breaking agent client runtimes:

### A. For `tools/call` Denials (Enforce Mode)
Per Model Context Protocol specification, application-level tool failures must return **HTTP 200 OK** with a JSON-RPC result containing `isError: true`. This prevents LLM client SDKs from crashing with unhandled HTTP transport exceptions and allows the model to perceive that the tool call was prohibited:

```json
{
  "jsonrpc": "2.0",
  "id": "req-12345",
  "result": {
    "isError": true,
    "content": [
      {
        "type": "text",
        "text": "Axiom NHI Policy Denial: Execution forbidden by active Cedar policy rule [id: forbid_destructive_sql]. Reason: Prohibited SQL verb 'DROP'."
      }
    ]
  }
}
```

### B. For Non-`tools/call` Methods (`tools/list`, `prompts/get`, `resources/read`) & Infrastructure Errors
For metadata methods or severe infrastructure failures (e.g., ExtMCP unavailable, active kill-switch), return a standard JSON-RPC error envelope:

```json
{
  "jsonrpc": "2.0",
  "id": "req-12345",
  "error": {
    "code": -32001,
    "message": "Axiom NHI Enforcement: Request blocked by emergency kill switch (target: agent-finance-prod-1).",
    "data": {
      "reason": "KILL_SWITCH_ACTIVE",
      "request_id": "018f6c4a-3b56-789a-bcde-0123456789ab"
    }
  }
}
```

---

## 3. Team 0 Escalation: Observe-Only vs. Emergency Kill-Switch Conflict

### The Architectural Conflict
There is an unresolved contradiction in the Phase 1 source plans:
1. **The Observe-Only Mandate:** *"In observe-only mode: Never block traffic—even if ExtMCP returns a policy denial or times out, log the shadow event and forward the call to the MCP server with zero production disruption."*
2. **The Emergency Kill-Switch Mandate:** *"Sub-second emergency revocation... ensure all subsequent protected calls are rejected in < 1ms."*

If an operator executes `axiom kill agent <compromised-agent>` during a live incident while the gateway is in observe-only mode, what happens?

### Evaluated Options for Team 0

| Option | Description | Trade-offs |
| :--- | :--- | :--- |
| **Option A: Strict Observe-Only** | Observe-only *never* blocks, even when a kill-switch is active. Only logs `KILL_SWITCH_TRIGGERED`. | **Unacceptable Risk:** If an enterprise is evaluating Axiom in shadow mode and an agent is actively exfiltrating data or running destructive commands, the operator's emergency kill command is ignored. |
| **Option B: Kill-Switch Precedence (Recommended)** | Active emergency kill-switch *always* blocks, overriding observe-only mode. Regular Cedar policy denials remain shadow/forwarded. | **Secure & Practical:** Preserves non-breaking evaluation of newly authored Cedar policies while honoring active containment of identified hostile entities. |
| **Option C: Explicit Gateway Flag** | Configurable setting in gateway: `kill_switch_overrides_observe_only: true` (default `true`). | Provides explicit administrative control and satisfies conservative change-management policies. |

### Team 1 Recommendation
**Adopt Option B (with Option C configuration support).** Emergency revocation represents an explicit human or automated containment action against an active threat. It must deterministically fail closed even when policies are running in shadow evaluation.

---

## 4. Latency Budget: Hard 15 ms Deadline vs. <5 ms Inline Target

### Latency Allocation (<5 ms Successful Inline Target)
To meet the `< 5ms` end-to-end inline latency budget for Gate G1, the pipeline stages are budgeted as follows:

```
[Agent Client]
     │
     │  (0.5 ms ingress network transit)
     ▼
[agentgateway Interceptor]
     │  (0.2 ms extract headers, generate UUIDv7 request_id)
     ▼
[ExtMCP gRPC Callout (h2c)]
     │  (0.3 ms h2c loopback RPC hop)
     ├── Step 1: Kill-Switch Check (ArcSwap lookup)       < 0.05 ms
     ├── Step 2: Identity Verification (cached JWKS/CIMD) < 0.50 ms
     ├── Step 3: Argument Validation (pure AST parse)     < 1.00 ms
     ├── Step 4: Cedar Authorization (is_authorized)      < 1.00 ms (p99)
     └── Step 5: Audit Event Enqueue (lock-free ring)     < 0.05 ms
     ▼
[agentgateway Enforcement]
     │  (0.2 ms parse result & route decision)
     ▼
[Forward to MCP Backend] ─── Total Budget Overhead: ~3.8 ms (< 5.0 ms target)
```

### The Hard 15 ms Deadline
- **Configuration:** Set via `policies.http.requestTimeout: 15ms` in `agentgateway.yaml`.
- **Relationship:** The `<5 ms` target is the **p99 performance objective** under normal operating conditions. The `15 ms` deadline is the **worst-case bounding ceiling**.
- **Failure Semantics:** If any validator, network socket, or Cedar policy evaluation stalls due to garbage collection, cold starts, or lock contention, the gateway aborts the callout at exactly 15 ms.
  - In `enforce` mode: Triggers immediate `failClosed` to protect backend assets.
  - In `observe-only` mode: Triggers timeout telemetry and immediately forwards to avoid breaking upstream clients.
