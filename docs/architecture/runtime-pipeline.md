# Phase 1 runtime pipeline

## Request path

1. **Ingress and correlation — Team 1:** accept the MCP request; assign a request ID; extract the MCP method, selected backend/tool, session and trace context, and allowed authentication headers.
2. **Emergency revocation — Team 5 state, Team 2 orchestration:** check the applicable revocation state before normal authorization and short-circuit revoked requests.
3. **Identity — Team 3:** verify the bearer token and target audience; return `IdentityContext` or a typed authentication failure.
4. **Argument and tool validation — Team 4:** classify and normalize request arguments and tool definitions; return factual `ValidatorResult` data.
5. **Authorization — Team 2:** combine the caller, target/action, validator facts, and active policy snapshot; return a deterministic policy result.
6. **Enforcement and forwarding — Team 1:** apply the selected runtime mode. In enforce mode, deny a denied or unavailable decision. In observe-only mode, record the shadow decision and forward despite a policy denial or callout failure, as specified by the playbook.
7. **Audit and telemetry — Team 5:** emit redacted structured decision events asynchronously; observability I/O must not block the inline call path.

The response phase may invoke ExtMCP for response processing when configured. Phase 1 authorization and argument checks must not trust a mutated request as though it were the original: processor ordering and the authorized target/identifier are part of the Team 0 contract review.

## Runtime mode behavior

| Condition | Observe-only | Enforce |
| --- | --- | --- |
| Policy permit | Forward | Forward |
| Policy denial | Record would-deny; forward | Deny before backend execution |
| ExtMCP timeout/unavailable | Record shadow failure; forward | Fail closed |
| Active kill switch | **Open decision:** define whether emergency revocation overrides observe-only | Deny before backend execution |

The source playbook says observe-only never blocks traffic and separately describes kill-switch aborts. Team 0 must explicitly settle whether the emergency kill switch is an exception to observe-only before contracts are frozen.

## Timing targets

- End-to-end inline target: `<5 ms` from the architecture playbook.
- Gateway-to-ExtMCP deadline: `15 ms` from the playbook.
- ExtMCP policy evaluation: `<1 ms p99` by Gate G1.
- Revocation propagation: `<50 ms` target; end-to-end kill verification `<100 ms` in Team 5 and Gate G1 criteria.

These are separate measurements; the 15 ms timeout is not itself proof of a `<5 ms` successful path. Team 6 should report p50/p95/p99 and timeout/error cases separately.
