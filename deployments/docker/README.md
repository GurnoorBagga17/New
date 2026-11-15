# Gate G1 Docker integration harness

This Compose project is a **local integration harness**, not a production deployment. It is configured to build the pinned agentgateway, the Rust ExtMCP binary, and a side-effect-free mock MCP backend. It no longer substitutes an HTTP regex evaluator for the ExtMCP gRPC service or includes the in-memory demo admin API as if it were live control-plane wiring. The stack has not yet been run end to end.

## Configure before starting

Copy the `*.example.json` files in `config/` to the corresponding names below, then replace the example issuer with a real test OIDC issuer whose JWKS endpoint is publicly reachable over HTTPS:

```text
config/identity.json
config/validation-profiles.json
config/resources.json
config/revocations.json
```

The identity issuer, canonical resource URI, backend resource map, tool profile, and pinned tool-definition hash must agree. The example `issuer.example.invalid` is intentionally nonfunctional; it is not an authentication bypass. The SQL tool profile hash is the SHA-256 digest of its canonical JSON definition. Recompute the pin whenever the backend tool definition changes. The current adapter verifies the configured definition against its configured digest, but does not yet capture and compare the live upstream `tools/list` response; this is not yet proof of rug-pull protection.

The example revocation file is a boot-time snapshot for local integration only, with a maximum five-minute freshness window. This binary does not yet receive live updates from the admin API, persist updates, or reload snapshots; when the snapshot expires, requests fail closed. Do not use it as production kill-switch evidence. Enforce mode denies calls for configured targets; an active configured kill switch also blocks in observe mode.

## Start the harness

From this directory:

```powershell
docker compose up --build
```

The gateway listens on `http://localhost:8080`; the mock MCP backend is reachable only on the Compose network. The ExtMCP service is not published on the host. The mock backend records calls only in its own process memory and does not execute database, filesystem, or network actions. It also avoids echoing caller arguments in responses.

To stop the harness:

```powershell
docker compose down
```

## Current limitations

- There is no live local-admin REST/SSE transport connected to the Rust policy, audit, or revocation state. The separate `gateway/local-admin-api/server.cjs` remains a demo implementation and is not included in this stack.
- Revocation configuration is loaded at process startup; dynamic operator updates and durable state are still required for G1.
- Egress validation is not yet bound to the gateway's actual outbound socket/DNS decision, and the runtime does not yet publish the Team 5 audit bus.
- The example OIDC issuer is invalid by design. Supply your own development issuer and valid test tokens; never put a production token in the repository.
- Compose startup is not acceptance evidence by itself. Team 6 must exercise the real MCP path, verify backend side effects, inject failures, and publish the G1 evidence packet.
