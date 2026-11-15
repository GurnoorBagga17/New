# Team 1 — MCP Gateway & Runtime Infrastructure

**Owner:** Team 1 (`@axiom-nhi/team-1-gateway`)  
**Target:** Gate G1 (90-day MCP runtime security wedge)  
**Status:** First implementation slice delivered and validated against mock backend and mock ExtMCP.

---

## 1. Directory Structure & Delivered Artifacts

- **`agentgateway/`**:
  - `UPSTREAM_PIN.md`: Protocol mapping and pin specification for `agentgateway` `v1.7.0`, matched with the checked-in upstream `proto/ext_mcp.proto`.
  - `agentgateway.yaml`: Enforce-mode configuration with filtered request headers and fail-closed processor behavior.
  - `agentgateway-observe-only.yaml`: Observe-only configuration with fail-open processor behavior.
- **[`runtime-modes/`](file:///c:/Users/Lenovo/Desktop/Axiom/gateway/runtime-modes/)**:
  - [`BEHAVIOR_MATRIX.md`](file:///c:/Users/Lenovo/Desktop/Axiom/gateway/runtime-modes/BEHAVIOR_MATRIX.md): Comprehensive gateway behavior matrix across Permit, Deny, Timeout/Unavailable, and Active Kill Switch in both runtime modes. Includes response envelope formatting, the `<5 ms` inline vs. `15 ms` deadline breakdown, and formal escalation of the observe-only vs. emergency-kill-switch conflict for Team 0.
- **[`mcp-interceptor/`](file:///c:/Users/Lenovo/Desktop/Axiom/gateway/mcp-interceptor/)**:
  - [`interceptor.js`](file:///c:/Users/Lenovo/Desktop/Axiom/gateway/mcp-interceptor/interceptor.js): Core gateway interception, header filtering, deadline enforcement, and mode enforcement engine.
  - [`mock_mcp_backend.js`](file:///c:/Users/Lenovo/Desktop/Axiom/gateway/mcp-interceptor/mock_mcp_backend.js): Mock MCP tool server with execution tracking to verify that prohibited side-effects never run.
  - [`mock_extmcp.js`](file:///c:/Users/Lenovo/Desktop/Axiom/gateway/mcp-interceptor/mock_extmcp.js): Mock ExtMCP gRPC policy engine simulating Permit, Deny, Timeout (>15ms), and Kill-Switch responses.
  - [`interceptor.test.js`](file:///c:/Users/Lenovo/Desktop/Axiom/gateway/mcp-interceptor/interceptor.test.js): Automated test suite covering 11 critical behavior and security assertions.
- **`deployments/docker/`**:
  - `Dockerfile.agentgateway`: Container build pinning `agentgateway:v1.7.0`.
  - `docker-compose.yml`: Draft topology only. Its ExtMCP and MCP backend services are idle placeholders and do not listen on their advertised ports.

---

## 2. Validation & Test Execution

Run the automated gateway interception and behavior test suite:

```bash
node gateway/mcp-interceptor/interceptor.test.js
```

All 11 mock-based test cases pass, verifying:
- Enforce mode blocks prohibited side-effects (0 backend calls executed).
- For `tools/call` policy denials in enforce mode, client receives HTTP 200 with `isError: true`.
- For non-`tools/call` and emergency revocations, client receives JSON-RPC error `-32001`.
- 15ms callout deadline is strictly enforced (fails closed in enforce mode; fails open in observe-only).
- Active kill switch triggers immediate blockage.
- Observe-only mode never disrupts legitimate or policy-denied traffic, emitting shadow `WOULD_DENY` telemetry.
- Raw bearer tokens are strictly protected and never leak into logs or audit events.

These results cover the Node interceptor prototype. They do not validate the agentgateway container, a real ExtMCP gRPC server, or the Docker Compose topology. The agentgateway YAML currently has no verified 15 ms remote processor timeout setting.

---

## 3. Strict Boundary Compliance

As Team 1:
- JWT verification and CIMD fetching are delegated to **Team 3** (`identity/`).
- SQL/path parsing and tool-pin verification are delegated to **Team 4** (`validators/`).
- Cedar policy rules and policy evaluation are delegated to **Team 2** (`services/extmcp/`).
- Structured audit disk writing and OTel export are delegated to **Team 5** (`observability/`).
- Wire protocol changes and cross-team contract freezing are deferred to **Team 0** (`docs/architecture/`, `proto/`).
