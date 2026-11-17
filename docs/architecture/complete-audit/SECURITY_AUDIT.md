# Axiom NHI — Defensive Source-Code Security Audit

**Document:** `docs/architecture/complete-audit/SECURITY_AUDIT.md`  
**Classification:** Defensive Application Security & Cryptographic Review  
**Auditor:** Principal Cloud Security Architect & Staff DevSecOps Engineer  
**Scope:** Monorepo-wide source code inspection (`identity`, `validators`, `services/extmcp`, `secretless`, `approvals`, `apps/web`)  

---

## 1. Security Architecture & Threat Defense Summary

Axiom NHI is architected with a **defense-in-depth, fail-closed security posture**. The source code was audited against common attack vectors and enterprise compliance standards:

| Attack Vector / Security Domain | Defensive Mitigation Mechanism | Implementation Location | Verified Status |
|---|---|---|---|
| **Plaintext Secret Exposure** | HMAC-SHA256 credential fingerprinting using isolated tenant salt | `connectors/src/lib.rs:50-65` | **ENFORCED** |
| **Destructive SQL DDL via Prompt Injection** | `sqlparser-rs` AST analysis blocks `DROP`, `TRUNCATE`, `ALTER` | `validators/src/sql.rs:40-80` | **ENFORCED** |
| **Filesystem Sandbox Traversal** | Path canonicalization and root confinement trap `../` and token mounts | `validators/src/filesystem.rs:25-60`| **ENFORCED** |
| **SSRF & Cloud Metadata Thefts** | DNS-pinned egress firewall drops `169.254.169.254` and RFC 1918 subnets | `validators/src/egress.rs:30-75` | **ENFORCED** |
| **Tool Definition Tampering (Rug-Pulls)** | RFC 8785 JSON Canonicalization Scheme (JCS) SHA-256 schema pinning | `validators/src/tool_pin.rs:20-55` | **ENFORCED** |
| **Confused Deputy Token Replays** | RFC 8707 Resource Indicators require audience match to canonical target URI | `identity/src/resource_indicators.rs` | **ENFORCED** |
| **Approval TOCTOU Tampering** | Length-prefixed domain-separated SHA-256 payload hash binding | `approvals/src/lib.rs:62-75` | **ENFORCED** |
| **SSE Telemetry Interception** | Single-use 30-second ticket tokens (`POST /v1/local/events/ticket`) with atomic burn | `services/extmcp/runtime/src/admin.rs` | **ENFORCED** |
| **Unauthorized High-Risk Actions**| WebAuthn hardware step-up signatures (`X-Axiom-StepUp-Signature`) required in production | `services/extmcp/runtime/src/admin.rs` | **ENFORCED** |
| **Insecure Dev Mode in Prod** | Fail-closed boot check: immediate exit if dev flags set when `AXIOM_ENV=production` | `services/extmcp/runtime/src/main.rs` | **ENFORCED** |
| **Timing Side-Channel Attacks** | Constant-time byte comparison (`constant_time_eq`) on admin tokens | `services/extmcp/runtime/src/admin.rs:209`| **ENFORCED** |
| **Log Injection / Header Forgery** | ArcSight CEF header & dictionary character escaping | `siem-soar/src/lib.rs:75-100` | **ENFORCED** |
| **Audit Ledger Tampering** | Off-path append-only writer with SHA-256 Merkle hash chaining | `observability/audit/src/writer.rs:70-110`| **ENFORCED** |

---

## 2. Detailed Findings Register

| ID | Finding | Severity | File | Function / Location | Evidence | Impact | Recommended Fix / Status |
|---|---|---|---|---|---|---|---|
| **SEC-01** | Admin API Dev-Mode Loopback Bypass | **LOW** | `services/extmcp/runtime/src/admin.rs` | `require_admin_token` (Line 183) | `if env::var("AXIOM_ALLOW_ANONYMOUS_LOCAL") == Ok("1") { next.run() }` | In development, loopback requests bypass admin token verification. | **RESOLVED:** `main.rs` strictly exits on boot if `AXIOM_ALLOW_ANONYMOUS_LOCAL` or `AXIOM_DEV_MODE` is set when `AXIOM_ENV=production`. |
| **SEC-02** | In-Memory Session Store in Next.js API | **LOW** | `apps/web/app/api/auth/store.ts` | `InMemoryAuthStore` | Memory-backed map of sessions for rapid dev testing | Server restart clears session state in dev. | **RESOLVED:** Backed by production PostgreSQL pooling via `pg.Pool`, migration `0003_operator_auth_and_scim.sql` (`tenants`, `operators`, `operator_sessions`). |
| **SEC-03** | Permissive Fallback in Web Playground API | **INFORMATIONAL** | `apps/web/app/api/playground/evaluate/route.ts` | `POST` (Line 56) | When upstream ExtMCP engine is offline, runs deterministic local regex/AST check. | Playground remains interactive for prospective buyers even without Rust installed. | Documented transparently with `upstreamSource: "local-eval-engine"`. **VERIFIED.** |
| **SEC-04** | Length-Prefixed Domain Separation | **RESOLVED** | `approvals/src/lib.rs` | `compute_payload_sha256` (Line 69) | `hasher.update(b"AXIOM_APPROVAL_PAYLOAD_V1\x00")` with length bytes | Eliminates delimiter injection collisions. | **VERIFIED.** |
| **SEC-05** | Zero Raw Token Logging | **RESOLVED** | `identity/src/verifier.rs`, `connectors/src/lib.rs` | Token verification & discovery | `HeaderValue.set_sensitive(true)`, HMAC hashing | Prevents tokens leaking into logs. | **VERIFIED.** |

---

## 3. Cryptographic Implementation Verification

1. **Human Approval Payload Hash Binding:**
   ```rust
   // approvals/src/lib.rs:62-75
   pub fn compute_payload_sha256(
       agent_id: &str,
       target_server: &str,
       tool_name: &str,
       canonical_arguments_json: &str,
   ) -> String {
       let mut hasher = Sha256::new();
       hasher.update(b"AXIOM_APPROVAL_PAYLOAD_V1\x00");
       for field in [agent_id, target_server, tool_name, canonical_arguments_json] {
           hasher.update((field.len() as u64).to_le_bytes());
           hasher.update(field.as_bytes());
       }
       format!("sha256:{}", hex::encode(hasher.finalize()))
   }
   ```
   - Length prefixing (`(field.len() as u64).to_le_bytes()`) prevents boundary-shifting collisions between fields.
   - Domain separation (`AXIOM_APPROVAL_PAYLOAD_V1\x00`) prevents cross-protocol hash re-use.

2. **Audit Ledger Hash Chaining:**
   ```rust
   // observability/audit/src/writer.rs
   // entry_hash = SHA256(prev_hash + "\n" + canonical_event_json)
   ```
   - Guarantees append-only integrity. Any modification or deletion of a prior record invalidates all subsequent entries in `audit.jsonl`.
