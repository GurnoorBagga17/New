# ExtMCP runtime service

This crate contains the Tonic ExtMCP adapter and a configured binary entrypoint. The entrypoint assembles the Team 3 OIDC verifier, Team 4 trusted validator profiles, the Cedar engine, and a boot-time revocation snapshot. It does not contain demo identity or string-based security fallbacks.

## Required configuration

The service refuses to start unless these environment variables point to valid administrator-owned JSON files:

- `AXIOM_IDENTITY_CONFIG`: `issuers` (`issuer`, `jwks_url`) and `canonical_resources`.
- `AXIOM_VALIDATION_CONFIG`: trusted tool profiles, expected canonical tool-definition SHA-256 pins, SQL dialects, and any path/egress argument profiles.
- `AXIOM_RESOURCE_MAP_CONFIG`: map from configured gateway backend names to canonical resource URIs. Every value must appear in the identity allow-list.
- `AXIOM_REVOCATION_CONFIG`: a versioned revocation snapshot explicitly marked with `state: "available"` and a freshness TTL from 1 to 300 seconds.

`AXIOM_RUNTIME_MODE` accepts `enforce` or `observe` and defaults to `enforce`. If gateway metadata includes a runtime mode, ExtMCP rejects a mismatch. Active revocations override observe-only mode.

The JSON examples under `deployments/docker/config/` document the format. The example OIDC issuer uses the reserved `.invalid` domain and cannot authenticate requests.

## Current boundary

Revocation is currently read from a boot-time config snapshot; live admin updates, persistence, and API/SSE wiring are not implemented. Expired snapshots fail closed. The runtime also does not yet publish the Team 5 audit bus. Tool-pin validation currently checks the configured definition against its configured digest; the upstream `tools/list` response is not yet captured and compared. Egress validation is not yet bound to the gateway's actual outbound socket/DNS decision. These are G1 blockers. The local Docker Compose project is an integration harness with a no-side-effect mock MCP backend; it is not a production deployment profile.

Build and run the component with:

```text
cargo build --locked -p extmcp-runtime
```
