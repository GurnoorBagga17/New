# Axiom NHI — Identity Intelligence & Runtime Security for Autonomous Systems

**Target Positioning:** Discover every identity. Understand every relationship. Govern every action.  
**License Boundary:** Apache-2.0 Open-Core Community Runtime (`gateway/`, `services/extmcp/`, `identity/`, `validators/`, `observability/`, `packages/ui/`, `packages/cedar-editor/`, `apps/gateway-ui/`) + Enterprise Control Plane (`connectors/`, `attribution/`, `lineage-graph/`, `risk-engine/`, `alerts/`, `secretless/`, `approvals/`, `siem-soar/`, `fleet-control/`, `apps/console/`, `deployments/helm/axiom-nhi/`).

## Full-Stack Architecture Across Phases 1–4

| Phase | Gate | Core Engineering Deliverables & Crate Locations |
| --- | --- | --- |
| **Phase 1 (Days 1–90)** | **Gate G1**: Runtime Wedge MVP (`< 5ms` inline ExtMCP evaluation, `15ms` fail-closed deadline, `< 50ms` kill-switch propagation) | `gateway/agentgateway/`, `gateway/mcp-interceptor/`, `gateway/local-admin-api/server.cjs`, `services/extmcp/` (`authorization`, `cedar`, `policy-api`, `runtime`), `identity/` (OAuth 2.1, JWKS, CIMD SSRF-safe cache, RFC 8707), `validators/` (SQL AST, Path, Egress SSRF, Tool Pinning), `observability/` (`audit`, `kill-switch`, `opentelemetry`), `apps/gateway-ui/`, `apps/web/` |
| **Phase 2 (Months 3–6)** | **Gate G2**: Identity Lineage & Blast-Radius Intelligence (`< 30m` Shadow Audit, Dual-Graph hot-path isolation) | `docs/api-contracts/phase2_contracts.rs`, `proto/context_sync.proto`, `connectors/` (AWS IAM, Kubernetes, GitHub, Slack read-only scanners with HMAC-SHA256 credential fingerprinting), `attribution/` (CIMD + `.github/CODEOWNERS` + IAM tags + Git blame confidence scorer), `lineage-graph/` (`migrations/0001_phase2_graph.sql`, recursive CTE `simulate_revocation`), `risk-engine/` (OWASP NHI Top 10 `NHI1`–`NHI10` & OWASP MCP Top 10 `MCP01`–`MCP10`), `alerts/` (30-Minute Shadow Audit generator, Slack Block Kit & Jira REST v3 deduplicator) |
| **Phase 3 (Months 6–9)** | **Gate G3**: Secretless Lifecycle & Enterprise Hardening | `secretless/` (OpenBao dynamic secret lease broker with zero-secret browser pills, IETF RFC 8693 multi-hop token exchange with scope attenuation, zero-downtime dual-secret rotation state machine), `approvals/` (atomic single-use SHA-256 payload-bound Slack & CLI approvals), `siem-soar/` (OCSF v1.3 / CEF streaming for Splunk HEC, Sentinel, CrowdStrike SOAR) |
| **Phase 4 (Months 9–18)** | **Gate G4**: Fleet Governance & Commercial Scale (`$0` Discovery metering) | `fleet-control/` (SpiceDB real-time delegation graph & causal revocation, multi-cluster canary rollout manager, least-privilege cloud IAM rightsizing diff generator, distributed spend circuit breakers, Ed25519-signed CycloneDX 1.6 AI-BOM & compliance pack generator, `$0`-Discovery usage metering engine), `apps/console/`, `deployments/helm/axiom-nhi/` (Customer-VPC air-gapped Helm chart) |

## Verification & Quality Gates

1. **Run Phase 1–4 Python Integration, Security, Chaos & Performance Suite (58 tests)**:
   ```bash
   python3 tests/run_tests.py
   ```
2. **Run Gateway MCP Interceptor & Runtime Mode Suite (11 tests)**:
   ```bash
   node gateway/mcp-interceptor/interceptor.test.js
   ```
3. **Run Architecture, Token Contrast (WCAG 2.1 AA), Bundle Budget, Air-Gap Offline & Contract Gates**:
   ```bash
   python3 docs/architecture/scripts/check_design_tokens.py
   python3 docs/architecture/scripts/check_frontend_budgets.py
   python3 docs/architecture/scripts/check_frontend_colors.py
   python3 docs/architecture/scripts/check_frontend_workspace.py
   python3 docs/architecture/scripts/check_gateway_ui_offline.py
   python3 docs/architecture/scripts/validate_api_contract_fixtures.py
   ```
4. **Build & Test Rust Workspace Crates**:
   ```bash
   cargo test --workspace
   ```
