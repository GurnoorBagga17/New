# Axiom NHI — Identity Intelligence & Runtime Security for Autonomous Systems

> **Discover every identity. Understand every relationship. Govern every action.**

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org)
[![Rust](https://img.shields.io/badge/rust-1.75%2B-orange.svg)](https://www.rust-lang.org)

Axiom NHI is a comprehensive identity intelligence and MCP (Model Context Protocol) runtime security platform for autonomous AI systems.

## 🚀 Quick Start

```powershell
# 1. First-time setup
.\start.ps1 -Setup

# 2. Start development
.\start.ps1

# 3. Open browser to http://localhost:3000
```

That's it! See [GETTING-STARTED.md](GETTING-STARTED.md) for detailed instructions.

## 📋 Prerequisites

- **Node.js 20+** - https://nodejs.org
- **Rust 1.75+** - https://rustup.rs  
- **Docker Desktop** - https://www.docker.com/products/docker-desktop/
- **pnpm** (auto-installed during setup)

## 🏗️ Architecture

**License Boundary:** Apache-2.0 Open-Core Community Runtime + Enterprise Control Plane

## 🏗️ Architecture

**License Boundary:** Apache-2.0 Open-Core Community Runtime + Enterprise Control Plane

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Axiom Control Plane                       │
│  (Tenant Management, Integrations, Policy, Billing)         │
└─────────────────────────────────────────────────────────────┘
                              │
                      Outbound mTLS
                              │
┌─────────────────────────────────────────────────────────────┐
│                Customer VPC / Kubernetes                     │
│                                                              │
│  ┌─────────┐       ┌──────────┐       ┌──────────┐        │
│  │ MCP     │──────▶│  Axiom   │──────▶│ Approved │        │
│  │ Client  │       │  Gateway │       │ MCP      │        │
│  │ / Agent │◀──────│ (ExtMCP) │◀──────│ Server   │        │
│  └─────────┘       └──────────┘       └──────────┘        │
│                          │                                  │
│                    Policy Cache                             │
│                    Audit Buffer                             │
└─────────────────────────────────────────────────────────────┘
```

### Development Phases

| Phase | Focus | Status |
|-------|-------|--------|
| **Phase 0** | Foundation & Security | ✅ **Completed** |
| **Phase 1** | Secure Identity (MFA, CSRF) | 🔄 **In Progress** |
| **Phase 2** | Billing Integration (Stripe) | 🔄 **In Progress** |
| **Phase 3** | Real Integrations (AWS, GitHub) | ⏳ Next |
| **Phase 4** | Runtime Deployment | ⏳ Planned |
| **Phase 5** | Production Hardening | ⏳ Planned |
| **Phase 6** | Commercial Launch | ⏳ Goal |

## ✨ Features

### Current (Phase 0-1)

- ✅ Multi-tenant architecture with PostgreSQL RLS
- ✅ Session-based authentication with CSRF protection
- ✅ TOTP/MFA enrollment
- ✅ Stripe billing integration (ready for testing)
- ✅ Docker Compose development environment
- ✅ Database migrations
- ✅ Security test suite

### Coming Soon (Phase 2-3)

- ⏳ AWS IAM discovery connector
- ⏳ GitHub App integration
- ⏳ Identity lineage graph
- ⏳ Risk scoring engine
- ⏳ MCP gateway enrollment

## 📚 Documentation

- **[START HERE](START-HERE.md)** - Quick start guide with paths to choose ⭐
- **[Getting Started Guide](GETTING-STARTED.md)** - Complete setup and development workflow
- **[Engineering Brief](AXIOM_NHI_ENGINEERING_BRIEF.md)** - Strategic research and competitive analysis
- **[Engineering Integration Plan](ENGINEERING-INTEGRATION-PLAN.md)** - Connects brief to implementation
- **[Architecture Blueprint](AXIOM-CUSTOMER-JOURNEY-AND-SYSTEM-ARCHITECTURE.md)** - Full system design
- **[Implementation Checklist](IMPLEMENTATION-CHECKLIST.md)** - Development roadmap (150+ tasks)
- **[Gap Analysis](docs/architecture/IMPLEMENTATION-GAP-ANALYSIS.md)** - Security review
- **[Review Summary](REVIEW-SUMMARY.md)** - Current state assessment
- **[Findings](docs/findings/)** - Engineering task results (T1-T12)

## 🎯 Current Status

**Overall Completion:** 15% (Foundation phase complete, Identity phase in progress)

**What Works Now:**
- ✅ Development environment with Docker Compose
- ✅ Multi-tenant PostgreSQL with RLS policies
- ✅ Authentication with sessions and CSRF protection
- ✅ Billing integration (Stripe checkout + webhooks)
- ✅ MFA/TOTP enrollment
- ✅ Security test suite (20+ tests)
- ✅ Database migrations

**Next Priorities (This Week):**
1. 🔄 Task T1: Set up SPIRE on kind cluster
2. 🔄 Task T9: Integrate tenant isolation tests into CI
3. 🔄 Complete Phase 1: Secure Identity
4. 🔄 Document Cedar vs OPA policy choice

**See:** `ENGINEERING-INTEGRATION-PLAN.md` for detailed task mapping

## 🧪 Testing

```powershell
# Run all tests
pnpm test

# Run security tests
pnpm test tests/security/

# Run Rust tests
cargo test --workspace

# Run E2E tests
python tests/run_tests.py
```

## 🛠️ Development

### Project Structure

```
Axiom/
├── apps/
│   ├── web/              # Next.js public web app
│   ├── console/          # Enterprise control plane
│   └── gateway-ui/       # Gateway admin UI
├── services/extmcp/      # Rust MCP gateway
├── connectors/           # Discovery connectors
├── identity/             # JWT verification
├── validators/           # Security validators
├── migrations/           # Database schema
└── tests/                # Test suites
```

### Tech Stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS
- **Backend:** Rust (Tokio, Axum), Node.js (Next.js API routes)
- **Database:** PostgreSQL 16 with RLS
- **Cache:** Redis 7
- **Billing:** Stripe
- **Secrets:** OpenBao (optional)

## 🔐 Security

### Security Features

- Multi-tenant isolation with Row-Level Security (RLS)
- CSRF protection on all mutating endpoints
- Server-side session management
- HMAC-SHA256 credential fingerprinting
- Zero-secret browser invariant
- Signed policy distribution (planned)

### Reporting Security Issues

Email: security@axiom.io

See [SECURITY.md](SECURITY.md) for our security policy.

## 📄 License

Apache License 2.0 - see [LICENSE](LICENSE) for details.

**Open-Core Model:**
- **Community Edition:** Gateway, runtime, validators, UI packages (Apache 2.0)
- **Enterprise Edition:** Connectors, lineage graph, risk engine, control plane (Commercial)

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
