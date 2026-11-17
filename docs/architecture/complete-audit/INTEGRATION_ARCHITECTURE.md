# Axiom NHI — Complete Integration & Connector Architecture

**Document:** `docs/architecture/complete-audit/INTEGRATION_ARCHITECTURE.md`  
**Classification:** Cloud & SaaS Connector Engineering Specification  
**Primary Crates:** `connectors`, `identity`, `secretless`, `siem-soar`, `fleet-control`  

---

## 1. Integration Inventory & Support Matrix

Axiom NHI provides verifiable, source-code-backed connectors across cloud providers, container orchestrators, code repositories, secrets vaults, and enterprise security platforms:

| Integration Provider | Target Domain | Authentication Mechanism | Discovery / Ingestion Method | Normalization & Fingerprinting | Status |
|---|---|---|---|---|---|
| **AWS IAM / STS** | Cloud Infrastructure | AWS IAM Read-Only / STS AssumeRole | `aws-sdk-iam` (`ListRoles`, `ListUsers`, `ListAccessKeys`) | `arn:aws:iam::...` &rarr; HMAC-SHA256 Key ID | **COMPLETE** |
| **Kubernetes (K8s)** | Container Workloads | In-Cluster ServiceAccount Token | `kube-rs` API (`api/v1/serviceaccounts`, `pods`) | `spiffe://cluster/ns/...` &rarr; HMAC-SHA256 Token | **COMPLETE** |
| **GitHub** | Developer & CI/CD | GitHub App Private Key / Fine-Grained PAT | `octocrab` API (`/orgs/{org}/installations`, Actions Secrets) | `github::repo/actions/...` &rarr; CODEOWNERS parsing | **COMPLETE** |
| **Slack** | Workspace Bot Agents | Bot User OAuth Token (`xoxb-...`) | Slack Web API (`auth.test`, `bots.info`, `apps.list`) | `slack::team_id/bot_id` &rarr; Scopes normalization | **COMPLETE** |
| **OpenBao / Vault** | Ephemeral Secrets | AppRole / Kubernetes Auth Engine | OpenBao HTTP REST API (:8200) | `vault://openbao/...` &rarr; Dynamic Lease Token | **COMPLETE** |
| **SpiceDB** | Fleet Authorization | Pre-shared Key (PSK) / gRPC | SpiceDB Zanzibar API (:50051) | `objectType:objectId#relation@subject` | **COMPLETE** |
| **Splunk HEC** | Enterprise SIEM | HTTP Event Collector (HEC) Token | HTTPS POST `/services/collector/event` | OCSF v1.3 JSON format | **COMPLETE** |
| **Microsoft Sentinel** | Enterprise SIEM / SOC | Azure AD App Registration / Shared Key | Azure Log Analytics Data Collector API | ArcSight CEF / OCSF v1.3 format | **COMPLETE** |

---

## 2. Connector Architecture & Zero-Secret Guardrails

### 2.1 The $0 Passive Discovery Promise
All cloud discovery connectors run with **strictly read-only permissions**:
- **AWS:** Requires only `IAMReadOnlyAccess` or a scoped policy with `iam:List*` and `iam:Get*`. It never modifies IAM policies, attaches roles, or provisions infrastructure.
- **Kubernetes:** Uses a read-only `ClusterRole` with `get`, `list`, and `watch` permissions restricted to `serviceaccounts`, `pods`, and `configmaps`.
- **GitHub:** Operates via a read-only GitHub App inspecting repository metadata, workflow files, and `.github/CODEOWNERS`.
- **Slack:** Uses read-only `auth.test` and `bots:read` scopes.

### 2.2 Rate-Limiting & High-Scale Ingestion (`TokenBucketLimiter`)
To prevent cloud provider API throttling during 10,000-NHI enterprise discovery scans, `connectors/src/lib.rs` implements a thread-safe token bucket rate limiter:
- **Refill Rate:** 50 requests per second (`requests_per_second`).
- **Burst Capacity:** 100 requests (`burst_capacity`).
- **Retry Policy:** 5 exponential backoff retries with jitter (`max_retries`).

### 2.3 Credential Fingerprinting vs. Plaintext Rejection
```rust
// connectors/src/lib.rs:50-65
pub fn fingerprint_credential_id(tenant_salt: &[u8], credential_identifier: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(tenant_salt).expect("HMAC accepts any key length");
    mac.update(credential_identifier.as_bytes());
    format!("hmac-sha256:{}", hex::encode(mac.finalize().into_bytes()))
}
```
If an operator accidentally passes a plaintext API token to the discovery connector, the connector hashes it immediately into `hmac-sha256:secret:...` using the tenant salt and drops the plaintext buffer from memory.

---

## 3. Complete Integration Execution Flow

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Cloud Security Admin
    participant Console as /console & /integrations
    participant Orchestrator as connectors::DiscoveryOrchestrator
    participant CloudApi as AWS / K8s / GitHub / Slack
    participant Lineage as lineage-graph (Postgres 16)
    participant Risk as risk-engine

    Admin->>Console: Click "Sync AWS IAM & K8s"
    Console->>Orchestrator: Trigger Discovery Scan {tenant_id, credentials_ref}
    
    rect rgb(240, 248, 255)
        Note over Orchestrator,CloudApi: Step 1: Read-Only Cloud Fetch
        Orchestrator->>CloudApi: GET /iam/roles (Rate-limited via TokenBucket)
        CloudApi-->>Orchestrator: Return 450 Roles & Service Accounts
    end

    rect rgb(255, 245, 245)
        Note over Orchestrator: Step 2: Normalization & Zero-Secret Hashing
        Orchestrator->>Orchestrator: Compute HMAC-SHA256 Fingerprints
        Orchestrator->>Orchestrator: Resolve CODEOWNERS attribution
    end

    rect rgb(245, 255, 245)
        Note over Orchestrator,Lineage: Step 3: Persistence & Topology Construction
        Orchestrator->>Lineage: Bulk Upsert nhi_nodes (450 entities)
        Orchestrator->>Lineage: Bulk Upsert nhi_edges (communication & ownership)
    end

    rect rgb(255, 250, 240)
        Note over Lineage,Risk: Step 4: Risk Scoring & Blast Radius
        Lineage->>Risk: Feed EntitySecurityTelemetry + Blast Radius
        Risk->>Risk: Evaluate OWASP NHI & MCP Top 10
        Risk-->>Lineage: Update exposure_score, blast_radius_score
    end

    Lineage-->>Console: Stream updated inventory & high-risk alerts to UI
```

---

## 4. Secretless Credential Brokering (OpenBao)

### 4.1 Architecture & Workflow
Instead of granting AI agents permanent database passwords or long-lived cloud keys, Axiom NHI acts as a **dynamic secret broker**:
1. When an AI agent needs to query a database (`mcp://postgres-prod.internal`), it authenticates with the ExtMCP gateway using its short-lived SPIFFE SVID or OAuth 2.1 token.
2. The ExtMCP runtime validates the Cedar policy.
3. If permitted, the runtime calls the OpenBao client (`secretless/src/openbao.rs`), which invokes OpenBao's dynamic database secret engine:
   `POST /v1/database/creds/analyst`
4. OpenBao generates a temporary PostgreSQL user with a 15-minute TTL.
5. The ExtMCP gateway injects this credential dynamically into the upstream connection header.
6. The AI agent never receives the raw password; it only sees the success response.
7. Upon task completion or 15-minute expiration, OpenBao automatically drops the temporary database role.

### 4.2 IETF RFC 8693 Multi-Hop Token Exchange
When an AI agent delegates a sub-task to another agent, `secretless::exchange_rfc8693_token` verifies that:
- The child agent's requested scopes are a strict subset of the parent's scopes (preventing privilege escalation).
- The audience indicator matches RFC 8707 canonical URIs (`mcp://...`).
- The `act` (actor) claim records the full delegation lineage chain:
  `["agent::parent-orchestrator", "agent::child-worker"]`.
