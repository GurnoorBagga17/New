# Axiom NHI — Complete Product User Manual & Operator Runbook

**Document:** `docs/architecture/complete-audit/USER_MANUAL.md`  
**Classification:** Operational Runbook & Operator Guide  
**Target Users:** Security Administrators, SOC Analysts, DevSecOps Engineers  

---

## 1. Product Navigation & Operator Console Overview

When an operator accesses Axiom NHI at `http://localhost:3000/console`, the dashboard presents a high-density, real-time command center organized into six core functional tabs:

```
+---------------------------------------------------------------------------------------+
|  AXIOM NHI // CLOUD CONTROL PLANE                                      ● Online [Live]|
|  Operator: Sarah Chen (Staff SecOps) | Tenant: org_enterprise_prod_902                |
+---------------------------------------------------------------------------------------+
| [Traffic Stream] [Lineage & Siblings] [Cedar Studio] [OpenBao Leases] [OWASP] [Kill] |
+---------------------------------------------------------------------------------------+
```

### 1.1 Dashboard Metric Cards Explained
1. **Total AI Agents & NHIs Detected (`2,847`):** The count of all active, passive, and historical non-human identities discovered across cloud environments and active MCP gateways.
2. **Security Status (`All Safe / Enforced`):** Indicates whether the inline ExtMCP gateway is actively enforcing Cedar policies (`ENFORCE`) or operating in passive observation mode (`OBSERVE_ONLY`).
3. **Average Decision Latency (`0.31 ms` to `1.4 ms`):** The round-trip policy evaluation and AST validation latency enforced on the inline proxy path.
4. **Threats Blocked (24h):** The number of autonomous tool calls intercepted and dropped due to destructive SQL, path traversal, SSRF, or policy denial.

---

## 2. Core Operational Workflows

### 2.1 Operation 1: Monitoring Live Agent Traffic & Intercepts
- **Objective:** Inspect autonomous AI agent tool calls in real time and verify decision rationales.
- **Prerequisites:** Rust ExtMCP runtime running on `127.0.0.1:8787` (or local dev mode enabled).
- **Steps:**
  1. Click the **Traffic Stream** tab in `/console`.
  2. Filter by status: `ALL`, `DENIED`, or `ALLOWED`.
  3. Click any row in the traffic table (e.g. `tx-901 db.execute_query`).
  4. The right-hand detail pane opens, displaying the full JSON audit trace, SHA-256 Merkle hashes, and matched Cedar rule.
- **Expected Result:** High-risk actions (e.g. `DROP TABLE customer_records`) show a red `DENY` pill with latency `<2ms` and the detected AST violation code `DESTRUCTIVE_DDL`.
- **Troubleshooting:**
  - *Problem:* Traffic table shows static initial records and no new entries appear.
  - *Fix:* Check terminal running `cargo run -p extmcp-runtime`. Ensure port `8787` is reachable at `http://127.0.0.1:8787/healthz`.

---

### 2.2 Operation 2: Authoring & Testing Cedar Policies in Cedar Studio
- **Objective:** Test a new access control rule against sample agent requests without disrupting production traffic.
- **Prerequisites:** Active session in `/console`.
- **Steps:**
  1. Click the **Cedar Studio** tab.
  2. Enter your Cedar policy rule in the syntax editor:
     ```cedar
     permit (
       principal in Axiom::AgentRole::"analyst",
       action == Axiom::Action::"execute_query",
       resource == Axiom::Resource::"customer_db"
     ) when {
       context.ast_verb in ["SELECT"] &&
       context.row_limit <= 500
     };
     ```
  3. Click **Simulate Dry Run**.
  4. Review the validation results in the JSON output pane.
  5. If the policy validates successfully and passes AST checks, click **Activate Policy Bundle**.
- **Expected Result:**
  - Dry run returns `{"verdict": "PERMIT", "latencyMs": 0.31}`.
  - Activation returns `{"activated": true, "version": "sha256:7f83b..."}`. All gateway proxies immediately enforce the new policy via lock-free `ArcSwap`.
- **Troubleshooting:**
  - *Problem:* Error `POLICY_PARSE_FAILED: unexpected token`.
  - *Fix:* Verify that Cedar syntax uses strict double quotes for entity types and strings (`Axiom::Resource::"customer_db"`).

---

### 2.3 Operation 3: Simulating Blast Radius Before Revoking Credentials
- **Objective:** Verify which sister workloads and downstream AI agents will experience outages if a specific secret or service is revoked.
- **Prerequisites:** Lineage graph populated in PostgreSQL or memory engine.
- **Steps:**
  1. Click the **Lineage & Siblings** tab.
  2. Select the target entity: `secret::pg_analyst_rw`.
  3. Click **Simulate Revocation**.
- **Expected Result:**
  - The simulator runs a recursive breadth-first traversal.
  - If multiple agents use that credential (e.g. `agent::reporting-worker-4` and `agent::payroll-bot-1`), the UI displays a red alert:
    `WARNING: Shared credential detected! Revoking will break payroll-bot-1!`
  - The recommended action indicates `REJECT_REVOCATION_SHARED_CREDENTIAL`.
- **Troubleshooting:**
  - *Problem:* Traversal returns 0 dependents for a known active secret.
  - *Fix:* Ensure communication edges have been synced from discovery connectors or OTel trace spans.

---

### 2.4 Operation 4: Triggering the Sub-50ms Emergency Kill Switch
- **Objective:** Instantly block a compromised or rogue AI agent from executing any further tool calls across the entire enterprise.
- **Prerequisites:** Identified rogue agent UID (e.g. `agent::reporting-worker-4`).
- **Steps:**
  1. Click the **Emergency Kill Switch** tab.
  2. Select Target Scope: `agent_id` (or `session_id`, `tool_name`, `global`).
  3. Enter Target Identifier: `agent::reporting-worker-4`.
  4. Enter Reason: `Suspected prompt injection during payroll tool invocation`.
  5. Check the confirmation box: `I understand this immediately drops all active sessions`.
  6. Click **TRIGGER EMERGENCY KILL SWITCH**.
- **Expected Result:**
  - The status badge changes to a glowing red `REVOKED ACTIVE`.
  - The Rust `RevocationStore` atomically updates in `<1ms`.
  - Any subsequent tool invocation from that agent receives an immediate HTTP 403 / JSON-RPC Error in `<0.1ms`.
- **Troubleshooting:**
  - *Problem:* Button is disabled.
  - *Fix:* Ensure the confirmation checkbox is checked and a reason of at least 10 characters is entered.
