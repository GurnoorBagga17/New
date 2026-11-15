# Protocol ownership

Team 0 owns the Axiom protocol mapping in this directory. [`ext_mcp.proto`](ext_mcp.proto) is copied unchanged from agentgateway tag `v1.7.0`, source path `crates/protos/proto/ext_mcp.proto`.

The upstream service has request and response hooks (`CheckRequest` and `CheckResponse`) and supports pass, mutation, and authorization error outcomes. Axiom's `RuntimeRequest`, identity, validation, policy, audit, and revocation models are domain contracts layered on top of that hook; they are not automatically fields of the upstream protocol.

Do not add Axiom fields to the upstream wire messages without a compatibility plan. The mapping and current limitations are documented in [`gateway/agentgateway/UPSTREAM_PIN.md`](../gateway/agentgateway/UPSTREAM_PIN.md). Axiom's shared API contract is still draft, and generated bindings/service implementation remain outstanding.
