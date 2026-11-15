# ExtMCP runtime adapter

This crate compiles the checked-in `proto/ext_mcp.proto` into a Tonic server and adapts `CheckRequest` to the Team 2 authorization pipeline. It provides `ExtMcpAdapter::serve(SocketAddr)` as the listener entrypoint.

The caller constructs the pipeline and an administrator-owned map from agentgateway backend names to canonical OAuth resource URIs. The adapter rejects unknown or multi-target service names, reads `Authorization` only from the protocol headers, passes request/session correlation through, and maps the pipeline decision to ExtMCP `Pass` or `AuthorizationError`. Observe mode emits `axiom_decision=would_deny`; emergency revocation behavior is an explicit constructor option while decision D3 remains unresolved.

Build and run the adapter tests with:

```text
cargo test -p extmcp-runtime
```

This is an integration library, not a production executable. Production issuer/policy/profile configuration, component assembly, audit wiring, TLS/mTLS, health/readiness endpoints, Docker wiring, and a live gateway interoperability test remain to be implemented before deployment.
