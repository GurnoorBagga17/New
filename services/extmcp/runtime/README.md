# ExtMCP runtime service

The runtime starts the Tonic ExtMCP authorization service and a loopback HTTP admin API in the same process. Both use the same Cedar snapshot and revocation store. Admin state is persisted under `AXIOM_DATA_DIR`.

## Required configuration

The service refuses to start unless these environment variables point to administrator-owned JSON files:

- `AXIOM_IDENTITY_CONFIG`: trusted issuers (`issuer`, `jwks_url`) and canonical resources.
- `AXIOM_VALIDATION_CONFIG`: trusted tool profiles, definition SHA-256 pins, SQL dialects, and path/egress argument profiles.
- `AXIOM_RESOURCE_MAP_CONFIG`: gateway backend names mapped to canonical resources in the identity allow-list.
- `AXIOM_REVOCATION_CONFIG`: startup seed with `state: "available"`, a nonzero version, a 1–300 second seed TTL, and optional global/server/tool/agent entries.
- `AXIOM_ADMIN_TOKEN`: high-entropy bearer secret, at least 32 bytes.

Optional settings: `AXIOM_ADMIN_ACTOR` (defaults to `local-operator`), `AXIOM_ADMIN_ADDR` (defaults to `127.0.0.1:8787`), and `AXIOM_DATA_DIR` (defaults to `./data/axiom`). The Docker Compose profile binds admin port 8787 to host loopback and requires `AXIOM_ADMIN_TOKEN` in the environment. The Vite dev proxy reads that token on the server and injects it; the browser bundle never contains it.

## Admin routes

Except for `GET /healthz`, routes require `Authorization: Bearer <AXIOM_ADMIN_TOKEN>`.

- `GET /v1/local/policies/version` reads the active Rust Cedar snapshot.
- `POST /v1/local/policies/dry-run` validates candidate Cedar syntax and schema. It does not evaluate an MCP request or return a policy verdict.
- `PUT /v1/local/policies/bundle` validates, persists, and atomically swaps a candidate policy bundle. Per-route mode changes are not applied; runtime mode remains configured through `AXIOM_RUNTIME_MODE`.
- `GET /v1/local/revocations` reads the runtime's revocation snapshot.
- `POST /v1/local/revocations` accepts `{action, target_kind, target_id, reason}`. Supported kinds are `global`, `mcp_server`, `agent`, and `tool`. The Rust kill-switch service applies the action to the live request-path store, persists the snapshot, and queues a redacted audit record.
- `GET /v1/local/events/stream` publishes kill-switch admin actions and heartbeats. It does not publish MCP decision events because the authorization pipeline is not yet connected to the audit bus.

The example issuer under `deployments/docker/config/` uses the reserved `.invalid` domain and cannot authenticate requests. Supply a reachable issuer and JWKS endpoint before starting the gRPC runtime. The Docker Compose project uses a side-effect-free mock MCP backend and is an integration harness, not a production deployment profile.

## Remaining runtime integration boundaries

Tool-pin validation compares the configured definition to its configured digest; it does not capture and compare the upstream `tools/list` result. Egress argument validation is not bound to the gateway's actual DNS/socket decision. The MCP decision audit event is not yet emitted by the authorization pipeline. The local admin stream intentionally reports only kill-switch actions.

Build with `cargo build --locked -p extmcp-runtime`.
