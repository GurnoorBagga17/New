# Axiom NHI — Complete Backend Architecture & Service Ecosystem

**Document:** `docs/architecture/complete-audit/BACKEND_ARCHITECTURE.md`  
**Classification:** Deep-Dive Backend & Systems Engineering Specification  
**Primary Language:** Rust (2021 Edition, 18 Workspace Crates)  
**Asynchronous Runtimes:** Tokio (Full multi-threaded), Tonic (gRPC), Axum (HTTP/SSE)  

---

## 1. Backend Subsystem Architecture

The Axiom NHI backend is architected as an **in-process, high-throughput security pipeline** that executes inline before any autonomous tool execution reaches a target system. Rather than introducing inter-process network hops between policy engines, validators, and token checkers, all 18 crates are compiled into a unified runtime binary (`axiom-extmcp-runtime`).

### 1.1 Service Dependency & Inter-Communication Topology

```mermaid
flowchart TD
    subgraph Ingress["1. Ingress Layer"]
        Envoy["Envoy / AgentGateway"]
        BrowserConsole["Operator Console / Playground"]
    end

    subgraph RuntimeCrate["2. axiom-extmcp-runtime (Unified Host Process)"]
        GrpcServer["Tonic gRPC Service (:9001)\n(ExtMcp CheckRequest/CheckResponse)"]
        AxumServer["Axum HTTP/SSE Admin API (:8787)\n(Hot-Swap, Kill-Switch, Lineage, OpenBao)"]

        subgraph Pipeline["Inline CheckPipeline (<2ms Hot Path)"]
            IdVerifier["axiom-identity\n(OIDC, JWT, CIMD, RFC 8707)"]
            Validators["axiom-validators\n(sqlparser-rs, Path, SSRF, Tool Pin)"]
            KillSwitch["axiom-kill-switch\n(ArcSwap RevocationStore)"]
            CedarEngine["extmcp-cedar\n(AWS Cedar v4 + ArcSwap PolicyStore)"]
        end

        AuditBus["axiom-audit (AuditBus)\nBounded Queue Lock-Free Emitter"]
        WriterThread["axiom-audit (Writer Thread)\nOff-Path JSONL File Append"]
        LineageMem["axiom-lineage-graph\n(In-Memory Blast-Radius Simulator)"]
        SecretlessBroker["axiom-secretless\n(OpenBao Dynamic Lease Broker)"]
    end

    subgraph ExternalServices["3. External Infrastructure & Data Stores"]
        PostgresDb[("PostgreSQL 16\n(Persistent Lineage Nodes & Edges)")]
        OpenBaoVault["OpenBao Vault (MPL-2.0 Container)\n(:8200 HTTP REST)"]
        SpiceDbCluster["SpiceDB Cluster\n(:50051 Zanzibar RBAC)"]
        CloudApis["Cloud Providers\n(AWS STS/IAM, GitHub API, Slack Web API)"]
        SiemEndpoints["Enterprise SIEM\n(Splunk HEC, Azure Sentinel)"]
    end

    %% Wiring
    Envoy -->|gRPC CheckRequest| GrpcServer
    BrowserConsole -->|HTTP REST / SSE| AxumServer

    GrpcServer --> Pipeline
    IdVerifier -->|1. IdentityContext| Validators
    Validators -->|2. ValidatedFacts| KillSwitch
    KillSwitch -->|3. RevocationDecision| CedarEngine
    CedarEngine -->|4. Decision (Permit/Deny)| GrpcServer

    Pipeline -.->|Async Event| AuditBus
    AuditBus --> WriterThread
    AuditBus -.->|Broadcast Channel| AxumServer

    AxumServer -->|Atomic Hot-Swap| CedarEngine
    AxumServer -->|Atomic Revocation| KillSwitch
    AxumServer --> LineageMem
    AxumServer --> SecretlessBroker

    LineageMem -.->|SQLx Sync| PostgresDb
    SecretlessBroker -->|REST JIT Leases| OpenBaoVault
    AxumServer -.->|gRPC/HTTP| SpiceDbCluster
    AxumServer -.->|OCSF v1.3| SiemEndpoints
```

---

## 2. Comprehensive 18-Crate Workspace Deep-Dive

### 2.1 `services/extmcp/runtime`
- **Location:** `services/extmcp/runtime/src/main.rs`, `src/admin.rs`, `src/lib.rs`
- **Responsibilities:**
  - Starts the Tonic gRPC server on port `9001` implementing `agentgateway.dev.ext_mcp.ExtMcp`.
  - Starts the Axum loopback administration HTTP/SSE server on port `8787`.
  - Automatically runs embedded PostgreSQL migrations on startup if `DATABASE_URL` is configured:
    ```rust
    if let Ok(db_url) = std::env::var("DATABASE_URL") {
        if let Ok(graph) = axiom_lineage_graph::PostgresLineageGraph::connect(&db_url).await {
            info!("Running embedded PostgreSQL migrations...");
            let _ = graph.run_migrations().await;
        }
    }
    ```
  - Warm-caches trusted OIDC issuer JWKS keys on boot to guarantee <0.5ms cold-start latency.
  - Manages atomic policy snapshot swaps and emergency revocation snapshots.
- **Key Environment Variables:**
  - `AXIOM_EXTMCP_BIND`: gRPC address (default: `0.0.0.0:9001`).
  - `AXIOM_ADMIN_ADDR`: Loopback admin address (default: `127.0.0.1:8787`).
  - `AXIOM_ADMIN_TOKEN`: High-entropy 32+ byte administrative secret.
  - `AXIOM_ALLOW_ANONYMOUS_LOCAL`: Set to `1` for browser local development without token lock.
  - `AXIOM_DATA_DIR`: Path to persistent runtime state (`./data/axiom`).
  - `AXIOM_IDENTITY_CONFIG`: Path to JSON issuer config (`deployments/local/identity.json`).
  - `AXIOM_RESOURCE_MAP_CONFIG`: Path to resource map (`deployments/local/resources.json`).
  - `AXIOM_VALIDATION_CONFIG`: Path to validation profiles (`deployments/local/validation.json`).
  - `AXIOM_REVOCATION_CONFIG`: Path to initial revocations (`deployments/local/revocations.json`).

### 2.2 `services/extmcp/cedar`
- **Location:** `services/extmcp/cedar/src/engine.rs`, `src/store.rs`, `src/schema.rs`
- **Responsibilities:**
  - Wraps the official AWS `cedar_policy` v4 crate.
  - Implements `PolicySnapshotStore` using `arc_swap::ArcSwap<PolicySnapshot>`, allowing lock-free reads during query evaluation while supporting atomic hot-reloads via `swap()`.
  - Computes deterministic SHA-256 versions of active policy bundles over sorted policy text.
  - Guarantees fail-closed evaluation: any syntax, schema, or evaluation error defaults to `Decision::Deny`.

### 2.3 `identity`
- **Location:** `identity/src/verifier.rs`, `src/oauth/jwt_validator.rs`, `src/cimd/mod.rs`
- **Responsibilities:**
  - Enforces OAuth 2.1 compliance (Bearer tokens strictly accepted in `Authorization` header).
  - Validates RS256/ES256 signatures against cached JWKS with ≤30s clock skew.
  - Implements RFC 8707 Resource Indicators: rejects requests where the token's audience does not match the canonical target resource URI (preventing confused deputy attacks).
  - Resolves Client ID Metadata Documents (CIMD) for URL-based agent identities with SSRF protection (rejects private IPs, loopback, and requires HTTPS).

### 2.4 `validators`
- **Location:** `validators/src/adapter.rs`, `src/sql.rs`, `src/filesystem.rs`, `src/egress.rs`, `src/tool_pin.rs`
- **Responsibilities:**
  - `sql.rs`: Uses `sqlparser-rs` to construct an Abstract Syntax Tree (AST). Detects destructive DDL verbs (`DROP`, `TRUNCATE`, `ALTER`), stacked queries (`SELECT 1; DROP TABLE users`), and unauthorized table writes.
  - `filesystem.rs`: Canonicalizes paths, validates root confinement, and blocks directory traversal (`../`, `/etc/passwd`, `/var/run/secrets/kubernetes.io`).
  - `egress.rs`: Resolves target domains, enforces egress host allowlists, and blocks SSRF attempts against cloud metadata (`169.254.169.254`) and internal subnets (`10.0.0.0/8`, `192.168.0.0/16`).
  - `tool_pin.rs`: Computes RFC 8785 canonical JSON SHA-256 hashes of tool schemas, preventing definition tampering ("tool rug-pulls").

### 2.5 `lineage-graph`
- **Location:** `lineage-graph/src/lib.rs`, `src/postgres.rs`
- **Responsibilities:**
  - Reconciles static discovery nodes with runtime OTel communication edges.
  - Implements breadth-first search (BFS) in Rust and recursive Common Table Expressions (CTEs) in PostgreSQL 16 (`simulate_revocation(target_uid)`).
  - Calculates blast-radius scores and identifies shared-credential siblings (`NHI9:2025`) before revocations occur.

### 2.6 `risk-engine`
- **Location:** `risk-engine/src/lib.rs`
- **Responsibilities:**
  - Implements mathematical risk scoring for all 10 OWASP NHI Top 10 (2025) and 10 OWASP MCP Top 10 (2025) controls.
  - Combines exposure scores (weight: 60%) and blast-radius scores (weight: 40%) into composite severities (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`).

### 2.7 `secretless`
- **Location:** `secretless/src/lib.rs`, `src/openbao.rs`, `src/aws_sts.rs`, `src/gcp_sts.rs`, `src/azure_entra.rs`, `src/oauth2_client_credentials.rs`, `src/api_key_vault_injector.rs`
- **Responsibilities:**
  - Implements universal `CredentialBrokerProvider` trait:
    ```rust
    #[async_trait]
    pub trait CredentialBrokerProvider: Send + Sync {
        fn provider_name(&self) -> &'static str;
        async fn exchange_credentials(
            &self,
            claims: &WorkloadClaims,
            target_resource: &str,
        ) -> Result<EphemeralLease, SecretlessError>;
        async fn revoke_lease(&self, lease_id: &str) -> Result<(), SecretlessError>;
    }
    ```
  - **OpenBao Dynamic Engine:** Manages JIT dynamic database/vault leases (`vault://openbao/...`).
  - **AWS STS Web Identity:** Assumes target IAM roles via `AssumeRoleWithWebIdentity` with short-lived 15-minute sessions.
  - **GCP STS Workload Identity:** Exchanges workload JWTs for Google Cloud STS federated tokens.
  - **Azure Entra Managed Identity:** Exchanges federated assertion tokens for Microsoft Graph / Azure Resource Manager access tokens.
  - **RFC 8693 OAuth 2.0 SaaS Broker:** Executes client credentials token exchanges against upstream SaaS identity providers (Salesforce, Workday, ServiceNow) with strict scope attenuation.
  - **Vault API Key Injector:** Injects masked ephemeral static keys into request headers directly at egress without exposing raw values to AI agents.

### 2.8 `approvals`
- **Location:** `approvals/src/lib.rs`, `src/slack.rs`
- **Responsibilities:**
  - Implements atomic single-use human-in-the-loop approvals.
  - Computes length-prefixed domain-separated SHA-256 hashes (`AXIOM_APPROVAL_PAYLOAD_V1\x00`).
  - Re-evaluates payload hashes immediately prior to execution, completely eliminating Time-of-Check to Time-of-Use (TOCTOU) race conditions.

### 2.9 `fleet-control`
- **Location:** `fleet-control/src/lib.rs`, `src/spicedb.rs`
- **Responsibilities:**
  - Multi-cluster fleet governance and synchronization.
  - Connects to SpiceDB Zanzibar API (`/v1/permissions/checkPermission`, `/v1/relationships/write`) for causal delegation chain revocations.
  - Analyzes 30-day cloud IAM usage logs to generate rightsizing recommendations removing wildcard permissions (`:*`).

### 2.10 `siem-soar`
- **Location:** `siem-soar/src/lib.rs`, `src/dispatcher.rs`
- **Responsibilities:**
  - Streams security events to enterprise SIEM platforms (Splunk HEC, Azure Sentinel).
  - Formats events in standard OCSF v1.3 JSON and ArcSight CEF with strict character escaping (preventing log injection attacks).

### 2.11 `observability/audit` & `observability/kill-switch`
- **Location:** `observability/audit/src/writer.rs`, `observability/kill-switch/src/service.rs`
- **Responsibilities:**
  - `audit`: Lock-free bounded event bus with off-path writer. Writes append-only JSONL files with cryptographic SHA-256 Merkle hash chaining (`prev_hash`, `entry_hash`).
  - `kill-switch`: Lock-free `ArcSwap<RevocationSnapshot>` providing sub-50ms global, per-agent, per-tool, and per-session emergency revocations.

### 2.12 `connectors`
- **Location:** `connectors/src/lib.rs`, `src/discovery.rs`, `src/aws.rs`, `src/k8s.rs`, `src/github.rs`, `src/enterprise.rs`
- **Responsibilities:**
  - Multi-cloud passive identity and credential discovery workers.
  - Normalizes heterogeneous IAM definitions into canonical `DiscoveredEntity` records.
  - Enforces the Zero-Secret invariant across all 12 discovery connectors (AWS, K8s, GitHub, Slack, Azure Entra, GCP IAM, Okta, Snowflake, Databricks, GitLab, AI Gateways, Terraform State).
  - Computes deterministic, salted HMAC-SHA256 fingerprints for every discovered secret, token, key-pair, or service principal.
