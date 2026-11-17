# Gateway Local Admin API (Archived / Legacy Compatibility)

**Status:** ARCHIVED & DEPRECATED  
**Authoritative Replacement:** `services/extmcp/runtime/src/admin.rs` (Native Rust HTTP/SSE Engine on port `8787`)  

---

## Notice of Deprecation

In Phase 1 of Axiom NHI, `gateway/local-admin-api/server.cjs` was used as an interim Node.js development server to simulate admin endpoints and serve the static `gateway-ui` bundle.

**As of Phase 2+, all control plane and administrative operations are natively implemented in the unified Rust ExtMCP runtime binary:**
- **File:** `services/extmcp/runtime/src/admin.rs`
- **Port:** `8787` (HTTP/SSE) alongside gRPC on port `9001`
- **Capabilities:**
  - `POST /v1/local/policies/dry-run`: Native AWS Cedar v4 + `sqlparser-rs` AST evaluation (<0.5ms)
  - `PUT /v1/local/policies/bundle`: Lock-free `ArcSwap` policy bundle hot-reload
  - `POST /v1/local/revocations`: Sub-50ms emergency kill-switch revocation
  - `GET /v1/local/events/stream`: Real-time Server-Sent Events (SSE) from the `AuditBus`
  - `GET /v1/lineage/graph` & `POST /v1/lineage/simulate-revoke`: PostgreSQL 16 recursive blast-radius simulation
  - `GET /v1/owasp/scorecard`: Native OWASP NHI Top 10 & MCP Top 10 posture scorecard
  - `POST /v1/secretless/attest-and-lease`: OpenBao dynamic secretless credential leasing

`server.cjs` is retained solely for legacy backwards compatibility in `docker-compose.demo.yml` and forwards state changes to `http://127.0.0.1:8787`. All new tools and frontend integrations must communicate directly with the Rust ExtMCP admin port (`8787`).
