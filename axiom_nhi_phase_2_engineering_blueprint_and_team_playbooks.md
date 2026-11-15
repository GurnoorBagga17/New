# Axiom NHI — Phase 2 Engineering Blueprint & Team Implementation Playbooks (Months 3–6 / Days 91–180)

**Target Milestone**: Gate G2 (Identity Lineage & Blast-Radius Intelligence — "Essentials: Discovery & Posture" Tier)  
**Target Exit Criteria (Gate G2)**:
1. Automated **Shadow-NHI & Unowned-Agent Audit Report** generated within the target **30-minute read-only onboarding workflow**.
2. Verified **Secret-to-Dependent Lineage Mapping** (`credential -> workload/agent -> MCP tool -> downstream resource`) prior to executing any revocation.
3. Zero regression on Phase 1 inline runtime latency (`< 5ms` inside `ExtMCP`), achieved by keeping Postgres graph traversal strictly off the synchronous hot path and syncing precomputed ownership/blast-radius attributes into `axiom-extmcp`'s in-memory `ArcSwap` cache.

---

## 1. Phase 2 Architectural Golden Rules & Hot-Path Isolation

Moving from Phase 1 (stateless inline runtime enforcement) to Phase 2 (stateful identity inventory, lineage graph, and posture scoring) introduces the single biggest engineering trap in cybersecurity startups: **letting graph database queries leak into the inline authorization hot path**.

To guarantee Phase 1's sub-5ms runtime guarantee while delivering Phase 2's lineage intelligence, Team 0 enforces four architectural laws:

1. **Strict Separation of Plane (Dual-Graph Architecture)**:
   - **Control/Intelligence Plane (Postgres 16 + `sqlx`)**: Stores the complete NHI inventory, static secret locations, cloud IAM roles, Kubernetes service accounts, GitHub Actions OIDC/PATs, Slack bots, ownership edges, and recursive dependency paths ("*Which production workloads and AI agents break if we revoke `aws_access_key_id = AKIA...`?*").
   - **Inline Runtime Data Plane (`agentgateway` + `axiom-extmcp`)**: Never queries Postgres during a `CheckRequest` call. Instead, a background sync worker pushes compact, precomputed snapshots (`EntityContextSnapshot`: `owner_id`, `blast_radius_score`, `lineage_depth`, `is_shadow_nhi`) into `axiom-extmcp` over gRPC every 30 seconds (and immediately on updates), stored in a lock-free `ArcSwap` map.
2. **Read-Only Discovery by Default ($0 Discovery Promise)**:
   - All four Phase 2 connectors (AWS IAM, Kubernetes, GitHub, Slack) authenticate strictly with **read-only permissions** (`IAMReadOnlyAccess`, K8s `ClusterRole` with `get`/`list`/`watch` on metadata only, GitHub App read-only org/repo metadata, Slack `bots:read`/`users:read`).
   - Connectors **never** extract or store raw plaintext secret values in Postgres—only cryptographic fingerprints (HMAC-SHA256 of secret identifiers/key IDs), metadata, scopes, and usage timestamps.
3. **Deterministic Pre-Revocation Blast-Radius Simulation (`axiom kill --dry-run`)**:
   - Before an operator executes `axiom kill` (built in Phase 1), Phase 2 upgrades the CLI and API to query the Postgres lineage graph and return the exact list of dependent workloads, sibling agents sharing the same upstream credential, and affected production services.
4. **Standards-Grounded Risk Engine**:
   - Every finding maps deterministically to the official [OWASP Non-Human Identities Top 10 (2025)](https://owasp.github.io/www-project-non-human-identities-top-10/2025/top-10-2025/) (`NHI1:2025` through `NHI10:2025`) and the [OWASP MCP Top 10 (2025)](https://owasp.org/projects/mcp-top-10) (`MCP01:2025` through `MCP10:2025`).

---

## 2. Monorepo Phase 2 Expansion & `.github/CODEOWNERS`

Phase 2 extends the `axiom-nhi` Cargo workspace with four new top-level directories while keeping all Phase 1 directories intact:

```text
# .github/CODEOWNERS — Phase 2 Additions & Ownership Boundaries
/docs/architecture/           @axiom-nhi/team-0-arch
/docs/api-contracts/          @axiom-nhi/team-0-arch
/proto/                       @axiom-nhi/team-0-arch

/gateway/                     @axiom-nhi/team-1-gateway
/connectors/                  @axiom-nhi/team-1-gateway
  ├── aws-iam/                # aws-sdk-iam, aws-sdk-sts read-only scanner
  ├── kubernetes/             # kube-rs ServiceAccount, RoleBinding & Secret metadata scanner
  ├── github/                 # octocrab GitHub Apps, Actions OIDC, PAT & CODEOWNERS scanner
  └── slack/                  # Slack Bot tokens, webhook & app installer scanner

/services/extmcp/             @axiom-nhi/team-2-policy
/risk-engine/                 @axiom-nhi/team-2-policy @axiom-nhi/team-4-validators
  ├── blast-radius/           # Blast-radius & exposure scoring calculator
  ├── owasp-nhi/              # OWASP NHI1:2025 - NHI10:2025 rule evaluators
  └── owasp-mcp/              # OWASP MCP01:2025 - MCP10:2025 rule evaluators

/identity/                    @axiom-nhi/team-3-identity
/attribution/                 @axiom-nhi/team-3-identity
  ├── git-blame/              # Commit author & PR approver attribution
  ├── codeowners-parser/      # .github/CODEOWNERS & Terraform tag resolver
  └── confidence-scorer/      # Multi-signal human owner resolver

/validators/                  @axiom-nhi/team-4-validators
/lineage-graph/               @axiom-nhi/team-4-validators
  ├── migrations/             # SQLx Postgres 16 DDL for nodes, edges & snapshots
  ├── ingestion/              # Connector + OTel runtime edge reconciler
  └── impact-simulator/       # Recursive CTE blast-radius & pre-revocation analyzer

/observability/               @axiom-nhi/team-5-observability
/alerts/                      @axiom-nhi/team-5-observability
  ├── slack-notifier/         # Interactive Slack Block Kit findings & dry-run alerts
  ├── jira-client/            # Jira REST API v3 issue creation & deduplication
  └── audit-reporter/         # 30-minute Shadow-NHI & Blast-Radius Audit generator

/tests/                       @axiom-nhi/team-6-qa
```

### Phase 2 Workspace Dependencies (`Cargo.toml` Additions)

Add these verified crates from [crates.io](https://crates.io/) to `[workspace.dependencies]`:

```toml
sqlx = { version = "0.8", features = ["runtime-tokio", "tls-rustls", "postgres", "uuid", "chrono", "json"] } # https://crates.io/crates/sqlx
aws-config = "1.5"
aws-sdk-iam = "1.50"                    # https://crates.io/crates/aws-sdk-iam
aws-sdk-sts = "1.50"                    # https://crates.io/crates/aws-sdk-sts
kube = { version = "0.96", features = ["runtime", "client", "derive"] }
k8s-openapi = { version = "0.23", features = ["latest"] }
octocrab = "0.41"
petgraph = "0.6"                        # In-memory DAG cycle detection & centrality scoring
cron = "0.12"
```

---

## 3. Shared Phase 2 Data Contracts & Postgres Lineage Schema (Owned by Team 0)

### 3.1 Core Rust Contracts (`/docs/api-contracts/phase2_contracts.rs`)

```rust
// 1. DiscoveredEntity (Emitted by Team 1 Connectors -> Consumed by Team 3 & Team 4)
pub struct DiscoveredEntity {
    pub entity_uid: String,          // e.g., "aws:iam::123456789012:role/prod-agent-exec"
    pub entity_kind: EntityKind,     // AwsIamRole | AwsAccessKey | K8sServiceAccount | GithubApp | SlackBot | McpServer | AiAgent
    pub source_connector: String,    // "aws-iam" | "kubernetes" | "github" | "slack" | "runtime-otel"
    pub display_name: String,
    pub fingerprint_sha256: String,  // Key/credential identifier hash (NEVER raw secret value)
    pub created_at_unix: Option<i64>,
    pub last_used_unix: Option<i64>,
    pub raw_permissions: Vec<String>,// e.g., ["s3:*", "rds-db:connect"]
    pub metadata_tags: std::collections::HashMap<String, String>, // e.g., {"terraform_module": "...", "created_by": "..."}
}

// 2. DiscoveredEdge (Emitted by Team 1 Connectors & Team 5 OTel Stream -> Consumed by Team 4 Graph)
pub struct DiscoveredEdge {
    pub source_uid: String,          // e.g., "agent:finance-bot"
    pub target_uid: String,          // e.g., "mcp:prod-db-server"
    pub relation_type: RelationType, // AuthenticatesWith | AssumesRole | InvokesMcpTool | ReadsSecret | MountedInPod
    pub observed_via: String,        // "static-config" | "runtime-otel" | "cloud-api"
    pub first_seen_unix: i64,
    pub last_seen_unix: i64,
    pub call_count_24h: u64,
}

// 3. OwnershipAttribution (Produced by Team 3 -> Stored in Team 4 Graph & Consumed by Team 2/5)
pub struct OwnershipAttribution {
    pub entity_uid: String,
    pub primary_owner_email: Option<String>, // None == "Unowned / Shadow NHI"
    pub owning_team: Option<String>,
    pub confidence_score: f32,       // 0.0 to 1.0 (e.g., 0.95 for CODEOWNERS + IAM tag match)
    pub evidence_sources: Vec<String>, // e.g., ["github:CODEOWNERS", "aws:tag:Owner", "slack:app_creator"]
}

// 4. RiskScorecard (Produced by Team 2 & Team 4 -> Consumed by Team 2 Cedar Cache & Team 5 Alerts)
pub struct RiskScorecard {
    pub entity_uid: String,
    pub exposure_score: u8,          // 0-100
    pub blast_radius_score: u8,      // 0-100 (based on downstream transitive dependents & privilege sensitivity)
    pub composite_severity: String,  // "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
    pub owasp_nhi_findings: Vec<String>, // e.g., ["NHI1:2025", "NHI5:2025", "NHI7:2025"]
    pub owasp_mcp_findings: Vec<String>, // e.g., ["MCP02:2025", "MCP09:2025"]
    pub dependent_workloads_count: u32,
}

// 5. RevocationImpactReport (Produced by Team 4 -> Consumed by Team 5 CLI/Alerts before revocation)
pub struct RevocationImpactReport {
    pub target_uid: String,
    pub safe_to_revoke_immediately: bool,
    pub directly_affected_agents: Vec<String>,
    pub transitively_affected_workloads: Vec<String>,
    pub shared_credential_siblings: Vec<String>, // Workloads sharing the same static secret (NHI9:2025)
    pub recommended_action: String,
}
```

### 3.2 Postgres 16 Lineage Graph DDL (`/lineage-graph/migrations/0001_phase2_graph.sql`)

```sql
CREATE TABLE nhi_nodes (
    entity_uid TEXT PRIMARY KEY,
    entity_kind TEXT NOT NULL,
    source_connector TEXT NOT NULL,
    display_name TEXT NOT NULL,
    fingerprint_sha256 TEXT NOT NULL,
    owner_email TEXT,
    owning_team TEXT,
    owner_confidence REAL DEFAULT 0.0,
    exposure_score SMALLINT DEFAULT 0,
    blast_radius_score SMALLINT DEFAULT 0,
    owasp_nhi_flags TEXT[] DEFAULT '{}',
    owasp_mcp_flags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE nhi_edges (
    source_uid TEXT NOT NULL REFERENCES nhi_nodes(entity_uid) ON DELETE CASCADE,
    target_uid TEXT NOT NULL REFERENCES nhi_nodes(entity_uid) ON DELETE CASCADE,
    relation_type TEXT NOT NULL,
    observed_via TEXT NOT NULL,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    call_count_24h BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (source_uid, target_uid, relation_type)
);

CREATE INDEX idx_nhi_edges_target ON nhi_edges(target_uid);
CREATE INDEX idx_nhi_nodes_unowned ON nhi_nodes(owner_email) WHERE owner_email IS NULL;
```

---

## 4. Team-by-Team Phase 2 Implementation Playbooks & Strict Scope Boundaries

### Team 0 — Architecture & Engineering Integration

**Directory Ownership**: `/docs/architecture/`, `/docs/api-contracts/`, `/proto/`  
**Mission**: Govern the Dual-Graph boundary so Postgres lineage queries never degrade Phase 1 runtime latency, freeze the 5 Phase 2 contracts, and enforce the 30-minute onboarding budget.

- **Detailed Responsibilities**:
  1. Freeze `phase2_contracts.rs` and the gRPC `ContextSync` service that pushes precomputed `RiskScorecard` and `OwnershipAttribution` summaries from Postgres into `axiom-extmcp`'s in-memory `ArcSwap` cache.
  2. Review all connector IAM policies to guarantee 100% read-only permissions and zero plaintext secret storage.
  3. Coordinate the 30-minute end-to-end onboarding pipeline across Teams 1, 3, 4, and 5.
- **Strict Scope Boundary (What Team 0 Must NOT Do)**:
  - **DO NOT** write connector API clients, SQL queries, or Jira/Slack webhook code.
  - **DO NOT** allow Phase 3 features (dynamic secret rotation, OpenBao control-plane brokering, RFC 8693 token exchange, or Slack single-use runtime approvals) into Phase 2 PRs.

---

### Team 1 — Cloud & SaaS Read-Only Discovery Connectors (Expanding from Gateway)

**Directory Ownership**: `/connectors/aws-iam/`, `/connectors/kubernetes/`, `/connectors/github/`, `/connectors/slack/`, plus maintaining `/gateway/`  
**Mission**: Build high-throughput, rate-limit-aware, strictly read-only discovery connectors that inventory all cloud/SaaS NHIs and emit normalized `DiscoveredEntity` and `DiscoveredEdge` records in under 10 minutes.

- **Work Breakdown (`C1.1` – `C1.8`)**:
  - **`C1.1` (AWS IAM Connector — [`aws-sdk-iam`](https://crates.io/crates/aws-sdk-iam))**: Enumerate IAM Roles, IAM Users, Access Keys (`GetAccessKeyLastUsed`), OIDC Identity Providers, and attached inline/managed policies. Emit `AssumesRole` trust policy edges.
  - **`C1.2` (Kubernetes Connector — `kube-rs`)**: Enumerate `ServiceAccount` objects, `RoleBinding`/`ClusterRoleBinding` subjects, `Secret` metadata annotations (never `.data` secret payloads!), and Pod specs mounting service account tokens or environment secrets.
  - **`C1.3` (GitHub Connector — `octocrab`)**: Scan GitHub Apps, Actions workflows (`.github/workflows/*.yml`) for OIDC role assumptions and secret references, deploy keys, fine-grained PAT metadata, and `.github/CODEOWNERS` files.
  - **`C1.4` (Slack Connector)**: Enumerate Slack Apps, bot users, outgoing webhooks, OAuth scopes, and installer user IDs via read-only Slack Web APIs.
  - **`C1.5` & `C1.6` (Rate-Limit Backoff & Incremental Sync)**: Implement token-bucket rate limiting, exponential backoff, and cursor-based pagination so scanning a 10,000-NHI enterprise environment finishes within 10 minutes without triggering provider API throttling.
  - **`C1.7` & `C1.8` (30-Minute Onboarding CLI & Docker Compose Update)**: Add `axiom discover run --all` and package the Phase 2 discovery worker + Postgres 16 in `/deployments/docker/`.
- **Strict Scope Boundary (What Team 1 Must NOT Do)**:
  - **DO NOT** write directly to Postgres tables—emit `DiscoveredEntity` and `DiscoveredEdge` streams to **Team 4's** ingestion service.
  - **DO NOT** compute OWASP risk scores or ownership confidence inside `/connectors/`—that belongs to **Team 2** and **Team 3**.
  - **DO NOT** request write/mutation permissions (`iam:DeleteAccessKey`, `iam:PutRolePolicy`) in any cloud connector—mutating cloud IAM rightsizing is **Phase 4**, and secret rotation is **Phase 3**.

---

### Team 2 — Context-Aware Policy Engine & OWASP Risk Scoring

**Directory Ownership**: `/services/extmcp/`, `/risk-engine/owasp-nhi/`, `/risk-engine/owasp-mcp/`  
**Mission**: Upgrade Cedar authorization to evaluate precomputed ownership and blast-radius context at runtime, and implement the deterministic rule evaluators for the [OWASP NHI Top 10 (2025)](https://owasp.github.io/www-project-non-human-identities-top-10/2025/top-10-2025/) and [OWASP MCP Top 10 (2025)](https://owasp.org/projects/mcp-top-10).

- **Work Breakdown (`R2.1` – `R2.8`)**:
  - **`R2.1` (OWASP NHI Top 10 Evaluators — `/risk-engine/owasp-nhi/`)**: Implement deterministic detectors for:
    - `NHI1:2025 Improper Offboarding` (orphaned NHI whose creator left the org or repo was archived, or dormant `> 90` days)
    - `NHI2:2025 Secret Leakage` (credentials referenced in plaintext workflow/config metadata)
    - `NHI3:2025 Vulnerable Third-Party NHI` (over-scoped third-party GitHub Apps / Slack bots)
    - `NHI4:2025 Insecure Authentication` (unauthenticated MCP servers or static keys without OIDC/OAuth 2.1)
    - `NHI5:2025 Overprivileged NHI` (wildcard `*` IAM actions or unrestricted destructive MCP tools)
    - `NHI6:2025 Insecure Cloud Deployment Configurations` (K8s pods with `automountServiceAccountToken: true` and cluster-admin bindings)
    - `NHI7:2025 Long-Lived Secrets` (static keys/tokens unrotated `> 90` days)
    - `NHI8:2025 Environment Isolation` (single NHI/secret shared across `dev`/`staging` and `prod` targets)
    - `NHI9:2025 NHI Reuse` (multiple distinct agents or workloads authenticating with the same credential)
    - `NHI10:2025 Human Use of NHI` (service account credentials invoked from interactive developer IPs/CLI sessions)
  - **`R2.2` (OWASP MCP Top 10 Evaluators — `/risk-engine/owasp-mcp/`)**: Map runtime + static telemetry to [OWASP MCP Top 10](https://owasp.org/projects/mcp-top-10) (`MCP01:2025` Token Mismanagement, `MCP02:2025` Privilege Escalation via Scope Creep, `MCP03:2025` Tool Poisoning via Team 4 pin mismatches, `MCP07:2025` Insufficient Auth, `MCP08:2025` Lack of Telemetry, `MCP09:2025` Shadow MCP Servers discovered via egress/runtime traffic without registered owners).
  - **`R2.3` & `R2.4` (Cedar Schema v2 & Lock-Free Context Cache)**: Extend `axiom.cedarschema` so `Axiom::Agent` and `Axiom::Tool` entities include `has_owner: Bool`, `owner_team: String`, `blast_radius_score: Long`, and `owasp_flags: Set<String>`. Enable policies like:
    ```cedar
    // Block unowned (Shadow) AI agents from invoking high-blast-radius production tools
    forbid (
        principal is Axiom::Agent,
        action == Axiom::Action::"tools/call",
        resource is Axiom::Tool
    )
    when {
        principal.has_owner == false &&
        resource.blast_radius_score >= 70
    };
    ```
- **Strict Scope Boundary (What Team 2 Must NOT Do)**:
  - **DO NOT** execute SQL queries against Postgres inside `CheckRequest`—only read from the in-memory `ArcSwap` snapshot synced from Team 4.
  - **DO NOT** write Jira or Slack notification clients—emit `RiskScorecard` structs to **Team 4** (storage) and **Team 5** (alerting).

---

### Team 3 — Automated Ownership Attribution Engine

**Directory Ownership**: `/attribution/git-blame/`, `/attribution/codeowners-parser/`, `/attribution/confidence-scorer/`, plus `/identity/`  
**Mission**: Solve the hardest operational problem in NHI governance—"Who actually owns this service account or AI agent?"—by correlating multi-source signals into a weighted `OwnershipAttribution` record.

- **Work Breakdown (`A3.1` – `A3.7`)**:
  - **`A3.1` (Cloud & K8s Tag Resolver)**: Extract explicit ownership tags (`owner`, `team`, `created-by`, `cost-center`, `app.kubernetes.io/managed-by`) from AWS IAM, Kubernetes annotations, and OAuth 2.1 CIMD contacts.
  - **`A3.2` (Git Blame, PR & Terraform Provenance)**: Correlate IAM roles, K8s manifests, and MCP server configs back to the Git commit author and PR approver who provisioned them in Infrastructure-as-Code (Terraform/Helm) or application repos.
  - **`A3.3` (`.github/CODEOWNERS` & Directory Matcher)**: Parse `.github/CODEOWNERS` to map repository paths containing agent or workflow definitions to responsible engineering teams.
  - **`A3.4` (Slack & OAuth Installer Correlation)**: Match Slack bot creators and OAuth 2.1 CIMD `client_uri` / `contacts` metadata against active corporate directory emails.
  - **`A3.5` (Multi-Signal Confidence Scorer)**: Combine signals using deterministic weights (e.g., Verified CIMD + `CODEOWNERS` match = `0.95`; IAM tag alone = `0.80`; Git commit author from 6 months ago = `0.60`; no signals or departed employee = `0.0 -> Unowned / Shadow NHI`).
- **Strict Scope Boundary (What Team 3 Must NOT Do)**:
  - **DO NOT** build raw AWS, K8s, GitHub, or Slack API crawlers—consume the normalized metadata fetched by **Team 1's** connectors.
  - **DO NOT** build interactive Slack approval bots (that is **Phase 3**).

---

### Team 4 — Postgres Lineage Graph & Blast-Radius Simulation Engine

**Directory Ownership**: `/lineage-graph/migrations/`, `/lineage-graph/ingestion/`, `/lineage-graph/impact-simulator/`, `/risk-engine/blast-radius/`, plus `/validators/`  
**Mission**: Own the Postgres 16 inventory and dependency graph (`sqlx`), reconcile static discovery edges (Team 1) with live runtime edges (Team 5 OTel stream), compute quantitative blast-radius scores, and power pre-revocation impact simulations.

- **Work Breakdown (`L4.1` – `L4.8`)**:
  - **`L4.1` & `L4.2` (Postgres 16 Schema & High-Speed Batch Ingestion)**: Manage SQLx migrations (`nhi_nodes`, `nhi_edges`, `nhi_audit_snapshots`). Perform idempotent batch upserts (`INSERT ... ON CONFLICT DO UPDATE`) so a 10,000-node scan commits in `< 5 seconds`.
  - **`L4.3` (Runtime-to-Static Graph Reconciliation)**: Merge Team 1's static cloud edges with Team 5's runtime OTel edges (`agent -> mcp_server -> tool -> database_table / egress_domain`) so the graph shows both *declared permissions* and *actual runtime usage*.
  - **`L4.4` & `L4.5` (Blast-Radius & Exposure Scoring Engine)**: Use recursive SQL CTEs and `petgraph` to compute:
    - **Blast Radius (`0–100`)**: Transitive fan-out of production databases, filesystem roots, and external APIs reachable from a credential or agent, weighted by privilege level (Read vs. Write vs. Admin/Destructive).
    - **Exposure Score (`0–100`)**: Weighted combination of credential age (`> 90` days), lack of owner (`owner_email IS NULL`), shared reuse across workloads (`NHI9:2025`), and missing runtime enforcement (`observe-only` vs. `enforce`).
  - **`L4.6` & `L4.7` (Pre-Revocation Lineage & Impact Simulator)**: Expose a sub-50ms query (`simulate_revocation(target_uid)`) using a recursive CTE over `nhi_edges` that identifies every upstream agent, Kubernetes pod, and sibling workload that depends on a secret or tool before it is revoked.
- **Strict Scope Boundary (What Team 4 Must NOT Do)**:
  - **DO NOT** introduce SpiceDB in Phase 2—per the Master Plan (Page 4), the fleet-wide SpiceDB delegation graph is reserved for **Phase 4 (Ultimate Tier)**; Phase 2 strictly uses **Postgres 16** for the lineage and dependency graph.
  - **DO NOT** send Slack or Jira HTTP messages directly—expose `RevocationImpactReport` and `RiskScorecard` queries to **Team 5**.

---

### Team 5 — Jira/Slack Alerting, Shadow Audit Generator & Lineage-Aware Kill Switch

**Directory Ownership**: `/alerts/slack-notifier/`, `/alerts/jira-client/`, `/alerts/audit-reporter/`, plus `/observability/`  
**Mission**: Deliver the automated **30-Minute Shadow-NHI & Unowned-Agent Audit Report**, route deduplicated high-risk findings to Slack and Jira, and upgrade `axiom kill` with pre-revocation lineage verification.

- **Work Breakdown (`O5.11` – `O5.18`)**:
  - **`O5.11` (Automated 30-Minute Shadow Audit Generator — `/alerts/audit-reporter/`)**: Build `axiom audit generate --format pdf,json,md` that compiles:
    1. Total discovered NHIs, MCP servers, and AI agents vs. actively governed entities.
    2. Top Shadow MCP endpoints (`MCP09:2025`) and unowned credentials (`NHI1:2025`).
    3. Shared static secrets (`NHI9:2025`) and over-privileged tools (`NHI5:2025`, `MCP02:2025`).
    4. Exact remediation commands to bring top risks under Cedar `enforce` mode.
  - **`O5.12` & `O5.13` (Slack Block Kit & Jira REST v3 Alerting)**:
    - Send rich Slack Block Kit alerts and auto-create Jira tickets for `CRITICAL` / `HIGH` findings, automatically assigning the ticket to the human owner identified by **Team 3**.
    - Implement fingerprint-based deduplication and suppression windows so teams never get spammed with duplicate tickets on recurring scans.
  - **`O5.14` & `O5.15` (Lineage-Verified Kill Switch — `axiom kill --verify-lineage`)**:
    - Upgrade `axiom kill` to query Team 4's `simulate_revocation(target_uid)` before revoking a shared credential or MCP server, printing the exact blast radius (affected workloads and sibling agents) and requiring `--force` if shared production workloads would be collateral damage.
- **Strict Scope Boundary (What Team 5 Must NOT Do)**:
  - **DO NOT** build interactive Slack Permit/Deny runtime approval buttons bound to request hashes—atomic single-use Slack approvals belong to **Phase 3**. Phase 2 Slack integration is strictly outbound posture/anomaly alerting.
  - **DO NOT** build enterprise SIEM/SOAR streaming pipelines (Splunk/Sentinel/CrowdStrike)—that belongs to **Phase 3**.

---

### Team 6 — Phase 2 QA, Scale Benchmarking & Gate G2 Validation

**Directory Ownership**: `/tests/integration/`, `/tests/security/`, `/tests/performance/`, `/tests/failure-injection/`  
**Mission**: Validate the 30-minute onboarding SLA against realistic multi-thousand-NHI environments, verify 100% accuracy of pre-revocation lineage mapping, and prove zero hot-path latency regression.

- **Work Breakdown (`Q6.11` – `Q6.18`)**:
  - **`Q6.11` (Synthetic 10,000-NHI Enterprise Fixture)**: Build a deterministic mock cloud environment (LocalStack AWS IAM + Kind K8s cluster + mock GitHub/Slack APIs) seeded with 10,000 NHIs, 25 planted Shadow MCP servers, 50 shared credentials, and 15 multi-hop dependency chains.
  - **`Q6.12` (30-Minute Onboarding Stopwatch Test)**: Automated CI gate verifying that `docker compose up` -> `axiom discover run --all` -> attribution -> graph build -> `axiom audit generate` completes in **under 30 minutes** (target `< 10 minutes` on the 10k fixture).
  - **`Q6.13` (Pre-Revocation Lineage Accuracy Verification)**: Test multi-service dependency chains where `Agent A` and `Billing Worker B` share `Secret S`. Verify that simulating revocation on `Secret S` flags `Billing Worker B` as collateral impact, whereas revoking `Agent A`'s session only blocks `Agent A`.
  - **`Q6.14` (Zero Hot-Path Regression Benchmark)**: Run Phase 1's p50/p95/p99 `ExtMCP` load test while Postgres is running heavy recursive CTE lineage scans—proving `ExtMCP` latency remains `< 5ms` even if Postgres is overloaded or paused.
- **Strict Scope Boundary (What Team 6 Must NOT Do)**:
  - **DO NOT** modify production connector, graph, or attribution code outside `/tests/`.

---

## 5. 90-Day Phase 2 Execution Schedule (Days 91–180 -> Gate G2)

### Milestone 2.1 (Days 91–120): Read-Only Connectors & Postgres Lineage Foundation
- **Team 0**: Freeze `phase2_contracts.rs` and `0001_phase2_graph.sql`.
- **Team 1**: Deliver working AWS IAM and Kubernetes read-only connectors.
- **Team 2**: Implement `NHI1`–`NHI10` and `MCP01`–`MCP10` rule evaluators against static fixtures.
- **Team 3**: Build cloud tag and `.github/CODEOWNERS` ownership parsers.
- **Team 4**: Stand up Postgres 16 `nhi_nodes` and `nhi_edges` batch ingestion + OTel runtime edge merger.
- **Team 5**: Build the Shadow-NHI Audit Report template and `axiom kill --dry-run` CLI preview.
- **Team 6**: Stand up the LocalStack + Kind 10,000-NHI synthetic enterprise testbed.

### Milestone 2.2 (Days 121–150): Attribution, Blast-Radius Scoring & Jira/Slack Alerting
- **Team 0**: Verify `ContextSync` gRPC push from Postgres to `axiom-extmcp` `ArcSwap` cache.
- **Team 1**: Deliver GitHub (Apps/Actions/PATs) and Slack connectors + rate-limit backoff.
- **Team 2**: Enable ownership-aware and blast-radius-aware Cedar policies inside `axiom-extmcp`.
- **Team 3**: Complete Git blame/PR provenance correlation and multi-signal confidence scoring.
- **Team 4**: Complete recursive CTE blast-radius scoring and pre-revocation impact simulator.
- **Team 5**: Ship deduplicated Slack Block Kit and Jira REST v3 alerting routed to attributed owners.
- **Team 6**: Run failure-injection tests (killing Postgres during active MCP traffic) and lineage accuracy tests.

### Milestone 2.3 (Days 151–180): 30-Minute Onboarding Hardening & Gate G2 Partner Sign-Off
- **All Teams**: Execute Week 2 Shadow Audits across the 5 design partners; verify `< 30-minute` time-to-first-audit report; validate pre-revocation lineage mapping on live partner staging credentials; sign off **Gate G2**.

---

## 6. What NOT to Build in Phase 2 (Strict Deferral Guardrails)

| Deferred Capability | Target Phase | Why It Must Stay Out of Phase 2 |
| :--- | :--- | :--- |
| **Control-Plane OpenBao Dynamic Secrets & Zero-Downtime Static Secret Rotation** | **Phase 3** | Phase 2connectors are strictly read-only to guarantee zero-friction 30-minute onboarding. |
| **RFC 8693 Multi-Hop Token Exchange** | **Phase 3** | Requires enterprise identity broker hardening after lineage visibility is proven. |
| **Atomic Single-Use Slack Runtime Approvals** | **Phase 3** | Phase 2 Slack integration is for posture alerting; inline human-in-the-loop gating ships in Phase 3. |
| **SIEM / SOAR Streaming (Splunk, Sentinel)** | **Phase 3** | Phase 2 focuses on developer/security workflows (Slack + Jira + Audit Report). |
| **Fleet-Wide SpiceDB Delegation Graph & Multi-Cluster Control Plane** | **Phase 4** | Postgres handles single-tenant lineage in Phase 2; fleet SpiceDB scales in Phase 4. |
| **Least-Privilege Cloud IAM Rightsizing Policy Generator** | **Phase 4** | Phase 2 flags over-privileged NHIs (`NHI5:2025`); automated cloud IAM mutation ships in Phase 4. |
