# Axiom NHI — Complete Execution Flows & Sequence Diagrams

**Document:** `docs/architecture/complete-audit/EXECUTION_FLOWS.md`  
**Classification:** Visual End-to-End System Execution & Communication Workflows  
**Diagrams Included:** 12 Detailed Mermaid Sequence Diagrams  

---

## Flow 1: Operator Login & Session Establishment

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Security Admin
    participant UI as apps/web (/sign-in)
    participant AuthApi as /api/auth/login
    participant Store as apps/web/app/api/auth/store.ts
    participant Console as apps/web (/console)

    Admin->>UI: Enter Email & Password
    UI->>AuthApi: POST /api/auth/login {email, password}
    AuthApi->>Store: validateUser(email, password)
    Store-->>AuthApi: Return UserProfile {userId, tenantId, role: "security-admin"}
    AuthApi->>AuthApi: Sign session token & generate CSRF
    AuthApi-->>UI: Set HTTP-Only Cookie (axm_session)
    UI->>Console: Redirect to /console
    Console->>Console: Mount Dashboard & Initialize Live Telemetry
```

---

## Flow 2: Console Dashboard Loading & Live SSE Telemetry

```mermaid
sequenceDiagram
    autonumber
    participant Browser as Operator Console (/console)
    participant NextApi as /api/auth/me
    participant ExtMcpAdmin as services/extmcp/runtime (:8787)
    participant AuditBus as axiom-audit (AuditBus)

    Browser->>NextApi: GET /api/auth/me
    NextApi-->>Browser: Return {authenticated: true, operator: "Sarah Chen", tenantId: "org_902"}
    
    Browser->>ExtMcpAdmin: GET /v1/owasp/scorecard
    ExtMcpAdmin-->>Browser: Return 8 OWASP Enforced Controls JSON
    
    Browser->>ExtMcpAdmin: GET /v1/local/events/stream (Server-Sent Events)
    ExtMcpAdmin-->>Browser: HTTP 200 (text/event-stream) Keep-Alive
    
    loop Real-Time Tool Execution Stream
        AuditBus-->>ExtMcpAdmin: Broadcast AuditEvent JSON
        ExtMcpAdmin-->>Browser: SSE data: {"tool": "db.query", "decision": "DENY", "latencyMs": 1.4}
        Browser->>Browser: Prepend record to live traffic table
    end
```

---

## Flow 3: Multi-Cloud Discovery & Inventory Ingestion

```mermaid
sequenceDiagram
    autonumber
    actor Operator as Cloud SecOps
    participant UI as /integrations
    participant Orchestrator as connectors::DiscoveryOrchestrator
    participant CloudApi as AWS IAM / K8s API
    participant Fingerprint as connectors::fingerprint_credential_id
    participant Postgres as PostgreSQL 16 (nhi_nodes)

    Operator->>UI: Click "Discover Cloud NHIs"
    UI->>Orchestrator: Trigger Scan {tenant_id, providers: ["aws_iam", "kubernetes"]}
    Orchestrator->>CloudApi: GET /iam/roles (Rate-limited via TokenBucket)
    CloudApi-->>Orchestrator: Return 250 Roles & Service Accounts
    
    loop For Each Discovered Entity
        Orchestrator->>Fingerprint: Compute HMAC-SHA256(tenant_salt, key_id)
        Fingerprint-->>Orchestrator: "hmac-sha256:7f83b165..."
        Orchestrator->>Postgres: INSERT INTO nhi_nodes ON CONFLICT DO UPDATE
    end
    
    Postgres-->>UI: Display 250 Discovered Machine Identities
```

---

## Flow 4: Multi-Signal Ownership Attribution

```mermaid
sequenceDiagram
    autonumber
    participant Ingestion as connectors::DiscoveryOrchestrator
    participant Attribution as attribution::OwnershipAttributionEngine
    participant Codeowners as .github/CODEOWNERS
    participant CIMD as identity::cimd::fetch
    participant Postgres as PostgreSQL 16

    Ingestion->>Attribution: resolve_ownership(entity_uid, raw_metadata)
    Attribution->>Codeowners: match_path("services/billing/worker.py")
    Codeowners-->>Attribution: Found Team: "@corp/billing-secops"
    Attribution->>CIMD: fetch_metadata(client_id_url)
    CIMD-->>Attribution: Verified Contact: "sarah.eng@corp"
    Attribution->>Attribution: Compute Confidence Score = 0.95
    Attribution->>Postgres: UPDATE nhi_nodes SET owner_email = "sarah.eng@corp", owner_confidence = 0.95
```

---

## Flow 5: Pre-Revocation Blast-Radius Simulation

```mermaid
sequenceDiagram
    autonumber
    actor Admin as SOC Operator
    participant UI as /console (Lineage Tab)
    participant AdminApi as services/extmcp/runtime (:8787)
    participant Engine as lineage-graph::simulate_revocation
    participant Postgres as PostgreSQL 16 (Recursive CTE)

    Admin->>UI: Select "secret::pg_analyst_rw" & Click "Simulate Revocation"
    UI->>AdminApi: POST /v1/lineage/simulate-revoke {target_uid: "secret::pg_analyst_rw"}
    AdminApi->>Engine: simulate_revocation("secret::pg_analyst_rw")
    Engine->>Postgres: SELECT * FROM simulate_revocation('secret::pg_analyst_rw');
    Postgres-->>Engine: Return 2 directly affected, 1 shared sibling ("agent::payroll-bot-1")
    Engine-->>AdminApi: RevocationImpactSimulation {blast_radius_score: 75, safe: false}
    AdminApi-->>UI: Display Red Outage Warning: "Payroll bot will break!"
```

---

## Flow 6: Interactive Playground Security Evaluation

```mermaid
sequenceDiagram
    autonumber
    actor Evaluator as Security Evaluator
    participant Playground as /playground
    participant NextApi as /api/playground/evaluate
    participant RustEngine as services/extmcp/runtime (:8787)
    participant AstValidator as validators::sql::analyze

    Evaluator->>Playground: Select "DROP TABLE customer_records" & Click "Run"
    Playground->>NextApi: POST /api/playground/evaluate {tool: "db.query", args: "DROP TABLE..."}
    NextApi->>RustEngine: POST /v1/local/policies/dry-run
    RustEngine->>AstValidator: Analyze AST dialect
    AstValidator-->>RustEngine: Matched DESTRUCTIVE_DDL
    RustEngine-->>NextApi: Return {verdict: "DENY", latencyMs: 0.31, astThreat: "DESTRUCTIVE_DDL"}
    NextApi-->>Playground: Render Red Deny Pill & Merkle Hash (0x8f2d...)
```

---

## Flow 7: Inline Tool Call Interception & AST Defense (<2ms Hot Path)

```mermaid
sequenceDiagram
    autonumber
    actor Agent as Autonomous AI Agent
    participant Gateway as Envoy / AgentGateway (:9090)
    participant ExtMcp as axiom-extmcp-runtime (:9001 gRPC)
    participant AST as validators::sql
    participant Cedar as extmcp-cedar (Cedar v4)
    participant TargetDb as Production PostgreSQL DB

    Agent->>Gateway: JSON-RPC tools/call {name: "execute_query", args: {query: "DROP TABLE users"}}
    Gateway->>ExtMcp: gRPC CheckRequest(McpRequest)
    ExtMcp->>AST: Parse SQL AST
    AST-->>ExtMcp: Violation: Statement::DropTable detected
    ExtMcp-->>Gateway: gRPC McpRequestResult::Error(PERMISSION_DENIED, "Destructive DDL blocked")
    Gateway-->>Agent: JSON-RPC Error -32000 (Blocked by Policy in 1.4ms)
    Note over Gateway,TargetDb: Command NEVER reaches Target Database
```

---

## Flow 8: Cedar Policy Dry-Run Evaluation

```mermaid
sequenceDiagram
    autonumber
    actor Author as Policy Author
    participant Console as /console (Cedar Studio)
    participant AdminApi as services/extmcp/runtime (:8787)
    participant CedarValidator as cedar_policy::Validator

    Author->>Console: Enter candidate Cedar policy text & Click "Dry Run"
    Console->>AdminApi: POST /v1/local/policies/dry-run {policy_text, sample_requests}
    AdminApi->>CedarValidator: validate(&policy_set, ValidationMode::Strict)
    CedarValidator-->>AdminApi: Validation Passed (0 errors)
    AdminApi->>AdminApi: Compute candidate SHA-256 version
    AdminApi-->>Console: Return {valid: true, candidate_version: "sha256:7f83b...", diagnostics: []}
```

---

## Flow 9: Atomic Policy Bundle Hot-Swap (`ArcSwap`)

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Security Admin
    participant Console as /console
    participant AdminApi as services/extmcp/runtime (:8787)
    participant Store as extmcp_cedar::PolicySnapshotStore
    participant Disk as data/axiom/policy-bundle.json
    participant SSE as Connected Browser Consoles

    Admin->>Console: Click "Activate Policy Bundle"
    Console->>AdminApi: PUT /v1/local/policies/bundle {policies, schema}
    AdminApi->>Disk: Write temporary file & atomic rename
    AdminApi->>Store: store.swap(new_snapshot) (Atomic Pointer Swap)
    AdminApi->>SSE: Broadcast "policy_bundle_activated"
    SSE-->>Console: Update live active version indicator
    AdminApi-->>Console: HTTP 200 {activated: true, version: "0x8f2d...", policy_count: 5}
```

---

## Flow 10: Sub-50ms Emergency Kill-Switch Revocation

```mermaid
sequenceDiagram
    autonumber
    actor SOC as SOC Analyst
    participant Console as /console (Emergency Kill Switch)
    participant AdminApi as services/extmcp/runtime (:8787)
    participant KillSwitch as axiom-kill-switch::KillSwitchService
    participant RevStore as axiom-kill-switch::RevocationStore (ArcSwap)
    actor RogueAgent as Rogue AI Agent
    participant ExtMcp as Inline gRPC Server (:9001)

    SOC->>Console: Select "agent::reporting-worker-4" & Click "Trigger Kill Switch"
    Console->>AdminApi: POST /v1/local/revocations {target_kind: "agent", target_id: "agent-4"}
    AdminApi->>KillSwitch: record_revocation(target, reason)
    KillSwitch->>RevStore: Atomic ArcSwap snapshot update (<1ms)
    AdminApi-->>Console: HTTP 200 {revoked: true, target: "agent-4"}
    
    Note over RogueAgent,ExtMcp: Immediate Subsequent Invocations Fail Closed
    RogueAgent->>ExtMcp: tools/call db.query
    ExtMcp->>RevStore: Check revocation for "agent-4"
    RevStore-->>ExtMcp: RevocationOutcome::Revoked(reason)
    ExtMcp-->>RogueAgent: Instant HTTP 403 / gRPC DENY in 0.08ms
```

---

## Flow 11: Dynamic Secretless Credential Issuance (OpenBao)

```mermaid
sequenceDiagram
    autonumber
    actor Agent as Attested AI Agent
    participant Gateway as ExtMCP Gateway
    participant Secretless as axiom-secretless::OpenBaoClient
    participant OpenBao as OpenBao Vault (:8200)
    participant UpstreamDb as Target Database

    Agent->>Gateway: tools/call db.execute_query (with SVID JWT)
    Gateway->>Gateway: Cedar Policy permits access to "mcp://postgres-prod"
    Gateway->>Secretless: request_dynamic_lease("database/creds/analyst", ttl: 900)
    Secretless->>OpenBao: POST /v1/database/creds/analyst
    OpenBao->>UpstreamDb: CREATE USER "v-token-123" WITH PASSWORD "..."
    OpenBao-->>Secretless: Return {lease_id: "...", username, password, ttl: 900}
    Secretless-->>Gateway: Inject ephemeral credentials into upstream connection
    Gateway->>UpstreamDb: Execute query as "v-token-123"
    UpstreamDb-->>Gateway: Return SQL Results
    Gateway-->>Agent: Return Clean JSON Data (Zero Secret Exposure to Agent)
```

---

## Flow 12: Cryptographic Audit Event Streaming & SIEM Dispatch

```mermaid
sequenceDiagram
    autonumber
    participant Pipeline as CheckPipeline (Inline Gate)
    participant AuditBus as axiom-audit (AuditBus)
    participant Writer as axiom-audit::AuditWriter (Off-Path Thread)
    participant Disk as data/axiom/audit.jsonl
    participant Siem as siem-soar::SplunkHecDispatcher
    participant Splunk as Enterprise Splunk HEC

    Pipeline->>AuditBus: emit(AuditEvent)
    Note over Pipeline: Hot path continues immediately (<2ms)
    AuditBus->>Writer: Channel receive (bounded queue)
    Writer->>Writer: Compute entry_hash = SHA256(prev_hash + event_json)
    Writer->>Disk: Append line to audit.jsonl & flush buffer
    AuditBus->>Siem: dispatch_event(AuditEvent)
    Siem->>Siem: Format as standard OCSF v1.3 JSON
    Siem->>Splunk: HTTPS POST /services/collector/event (HEC)
    Splunk-->>Siem: HTTP 200 OK {"text":"Success","code":0}
```
