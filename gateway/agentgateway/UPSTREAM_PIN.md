# Agentgateway and ExtMCP upstream pin

**Pin:** `agentgateway` tag `v1.7.0`  
**Schema:** `https://agentgateway.dev/schema/config`  
**Protocol source:** [`proto/ext_mcp.proto`](../../proto/ext_mcp.proto), copied from the upstream tag's `crates/protos/proto/ext_mcp.proto`  
**Transport:** gRPC over HTTP/2 (h2c for the local compose network)

The earlier `v0.12.0` pin and protocol summary were incompatible with the checked-in gateway configuration. This file and the two YAML configurations now use the v1.7.0 standalone shape: top-level `gateways` plus `routes`, a remote MCP guardrail processor, and an MCP target backend. The image entrypoint uses `agentgateway -f`.

## Wire contract summary

The checked-in `.proto` is the upstream definition; do not edit it as an Axiom extension. It defines `ExtMcp.CheckRequest` and `ExtMcp.CheckResponse`.

- `McpRequest` carries service names, method, CEL-produced `metadata_context`, optional raw JSON-RPC params, and filtered request headers.
- `McpResponse` carries service names, method, `metadata_context`, raw JSON-RPC result, and no request-header field.
- Request and response results each select `Pass`, raw JSON `mutated`, or `AuthorizationError`.
- Request results can also set/remove request headers and attach metadata for later gateway filters.
- `AuthorizationError` uses the upstream enum (`UNKNOWN`, `PERMISSION_DENIED`, `RESOURCE_EXHAUSTED`, `INVALID`), a reason string, and optional raw JSON-RPC error bytes.

## Mapping and limits

The gateway supplies the configured runtime mode and version as processor metadata and forwards only the four listed headers. The ExtMCP service must derive tool name and arguments from the raw `mcp_request` JSON. The upstream protocol does not carry an Axiom `RuntimeRequest` or typed identity/validator objects. The checked-in `proto/ext_mcp.proto` makes the wire contract reproducible, but generated bindings and a listening ExtMCP server are still required before this configuration is deployable.

The YAML configurations are shape-validated against the published schema during local verification. That does not replace running the pinned container: image startup, actual gRPC behavior, auth/header handling, timeouts, and backend interoperability still require a runtime check.
