# Axiom NHI — Identity Intelligence & Runtime Security for Autonomous Systems

> **Discover every identity. Understand every relationship. Govern every action.**

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org)
[![Rust](https://img.shields.io/badge/rust-1.75%2B-orange.svg)](https://www.rust-lang.org)
[![Build & Test](https://img.shields.io/badge/workspace-18%20crates%20green-success.svg)](Cargo.toml)
[![Fail-Closed Guarantee](https://img.shields.io/badge/chaos%20tests-9%2F9%20verified-success.svg)](tests/failure-injection)

Axiom NHI is an enterprise non-human identity (NHI) intelligence and inline MCP (Model Context Protocol) runtime security platform for autonomous AI agents. It intercepts tool calls at wire speed, validates them against formal AWS Cedar 3.x policies and AST guards, leases short-lived credentials just-in-time, and streams immutable audit trails.

---

## 🚀 Quick Start

### 1. Developer Environment Quickstart
```powershell
# 1. First-time setup
.\start.ps1 -Setup

# 2. Start development stack
.\start.ps1

# 3. Open browser to http://localhost:3000
```

### 2. Standalone Container Deployment
```bash
# Launch the open-core ExtMCP Runtime Gateway
docker compose up axiom-gateway
```

### 3. Build & Verify Workspace
```bash
# Check all 18 Rust workspace crates
cargo check --workspace

# Run control plane & gateway tests
cargo test --workspace

# Check frontend TypeScript types
pnpm --filter @axiom/web typecheck
```

---

## 🏗️ Architecture

Axiom operates on an **Open-Core Model** under Apache-2.0 with a clean architectural separation:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      Axiom SaaS Control Plane                          │
│     (Tenant Management, Fleet Registry, Policy Store, OTel Audit)      │
│            • Axum Rust Backend (services/control-plane)                │
│            • Next.js Web App / Console (apps/web)                      │
└────────────────────────────────────────────────────────────────────────┘
                                     ▲
                                     │  Outbound-Only mTLS / WebSocket
                                     │  (Zero Open Inbound Firewall Ports)
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Customer VPC / Sovereign Enclave                     │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │                 Axiom Agent Supervisor Daemon                  │   │
│   │                 (services/agent-supervisor)                    │   │
│   │   • Policy Disk Cache     • Audit Ring Buffer Spool Ingest     │   │
│   │   • Instant Kill-Switch   • Heartbeat & Enclave Attestation    │   │
│   └────────────────────────────────────────────────────────────────┘   │
│                                     │ Local IPC / Spool File           │
│                                     ▼ Watcher                          │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │              ExtMCP Runtime Gateway (Local Proxy)              │   │
│   │                 (services/extmcp/runtime)                      │   │
│   │   • Cedar 3.x Engine (< 1.5ms evaluation)                      │   │
│   │   • SQL AST & Path Sanitizer & SSRF Egress Firewall            │   │
│   │   • Dynamic "policy.cedar" Hot-Reload Watcher                  │   │
│   │   • Atomic Spool Chunk Writer (<data_dir>/spool/*.chunk)       │   │
│   └────────────────────────────────────────────────────────────────┘   │
│              ▲                                     │                   │
│   MCP Stdio  │                                     │ Filtered Tool     │
│   / SSE Call │                                     ▼ Invocation        │
│   ┌───────────────────┐                 ┌──────────────────────┐       │
│   │ Autonomous Agent  │                 │ Upstream MCP Server  │       │
│   │  (Claude, Cursor) │                 │  (Postgres, AWS, S3) │       │
│   └───────────────────┘                 └──────────────────────┘       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 📦 Workspace Crates & Services

The repository is structured as a unified monorepo:

### Rust Services & Crates (`Cargo.toml`)
* **`services/control-plane`**: High-performance Axum SaaS control plane managing agent enrollment, heartbeat reaping, live policy distribution, and emergency kill-switch fan-out.
* **`services/agent-supervisor`**: Zero-inbound agent daemon running in customer VPCs. Connects outbound over mTLS WebSocket, maintains a local policy cache, and ingests spool audit logs into an unlinked disk ring buffer.
* **`services/agent-protocol`**: Binary and JSON framed protocol definitions for supervisor-to-control-plane communications (`axiom-agent-protocol`).
* **`services/extmcp/runtime`**: Low-latency ExtMCP runtime interceptor with background file watcher for instant Cedar policy swapping and atomic chunked audit spooling.
* **`services/extmcp/cedar`**: AWS Cedar 3.x policy compilation and deterministic formal evaluation engine.
* **`services/extmcp/authorization`**: ExtMCP authorization decision pipeline and context assembler.
* **`services/extmcp/policy-api`**: Management API for policy ingestion and rule updates.
* **`observability/audit`**: High-throughput cryptographic audit logger generating OCSF-compliant event spans.
* **`observability/kill-switch`**: Sub-50ms fleet-wide emergency credential revocation mechanism.
* **`observability/opentelemetry`**: Deterministic OTel tracing for full identity attribution.
* **`validators/`**: Deep AST inspection modules (SQL AST parser, filesystem path canonicalizer, egress IP/DNS firewall, and SHA-256 tool pinning).

### Applications (`apps/`)
* **`apps/web`**: Production Next.js 16 landing page, interactive attack playground, Monaco Cedar policy studio, and multi-tenant SaaS dashboard.
* **`apps/gateway-ui`**: Local edge admin UI for air-gapped monitoring and debugging.

---

## 🎯 Current Status & Verification

All core systems are implemented, integrated, and verified against our production quality gates:

| Verification Metric | Target Specification | Measured Status | Verification Artifact |
| :--- | :--- | :--- | :--- |
| **Workspace Compilation** | 0 errors across 18 crates | ✅ **18/18 Green** | `cargo check --workspace` |
| **Fail-Closed Guarantee** | 100% rejection on fault | ✅ **9/9 Verified** | `tests/failure-injection/test_fail_closed.py` |
| **Cedar Policy Engine** | < 1.5 ms P99 | ✅ **Target Met** | `services/extmcp/cedar` benchmarks |
| **Inline Gateway Overhead** | < 5 ms P99 | ✅ **Target Met** | `ProofStrip.tsx` & `claims.ts` |
| **Emergency Kill Switch** | < 50 ms cascade | ✅ **Target Met** | `observability/kill-switch` |
| **Web Type Safety** | 0 TypeScript errors | ✅ **Clean** | `pnpm --filter @axiom/web typecheck` |

---

## 🧪 Running Tests & Chaos Suite

```powershell
# 1. Run all Rust unit and integration tests
cargo test --workspace

# 2. Run Control Plane channel and reaper tests
cargo test -p axiom-control-plane

# 3. Run failure injection & chaos tests
python -m pytest tests/failure-injection/test_fail_closed.py

# 4. Run frontend typecheck & lint
pnpm --filter @axiom/web typecheck
```

---

## 🔐 Security Invariants

When contributing to Axiom NHI, adhere to the non-negotiable security rules:
1. **Fail-Closed by Design:** Any evaluation failure, network timeout (> 15 ms), or unknown tool verb aborts and denies execution immediately.
2. **Cryptographic Approval Integrity:** Human approvals bind to a SHA-256 hash of the canonical serialized action payload to eliminate TOCTOU risks.
3. **Zero Raw Token Exposure:** Secrets are never written to disk, audit traces, or logs. Dynamic credentials are leased just-in-time via OpenBao / Vault.
4. **Deterministic OTel Auditing:** Every evaluation and tool invocation produces an OCSF-compliant OpenTelemetry span with full identity attribution.

---

## 📄 License

Licensed under the **Apache License, Version 2.0**. See [LICENSE](LICENSE) for details.
