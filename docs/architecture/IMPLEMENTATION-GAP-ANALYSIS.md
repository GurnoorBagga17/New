# Axiom NHI — Implementation Gap Analysis

**Document type:** Technical gap analysis and implementation roadmap  
**Prepared:** 2026-11-17  
**Baseline:** Current repository state vs. AXIOM-CUSTOMER-JOURNEY-AND-SYSTEM-ARCHITECTURE.md requirements  
**Status:** Critical findings requiring immediate attention before commercial launch

---

## Executive Summary

This analysis compares the current Axiom NHI codebase against the comprehensive architecture blueprint. The repository demonstrates significant Phase 1 (Runtime) and Phase 2 (Discovery) engineering progress, but **critical security, tenant isolation, billing, and production-readiness gaps exist** that must be resolved before accepting real payment or protecting customer production MCP traffic.

### Overall Assessment by Phase

| Phase | Architecture Requirements | Current Implementation | Gap Severity |
|-------|--------------------------|------------------------|--------------|
| **Phase 0** | Product decisions, threat model, API contracts | Partial - no frozen contracts or formal threat model | 🔴 HIGH |
| **Phase 1** | Secure identity, tenant foundation, JWT verification | Partial - file/memory store with PostgreSQL fallback | 🔴 HIGH |
| **Phase 2** | Billing, provisioning, webhook verification | Not implemented - no billing integration found | 🔴 CRITICAL |
| **Phase 3** | Real integrations with OAuth/role setup | Mock fallback behavior violates production requirements | 🔴 CRITICAL |
| **Phase 4** | Runtime deployment with secure enrollment | Helm chart exists but prior audit found mismatches | 🟡 MEDIUM |
| **Phase 5** | Commercial launch readiness | Not assessed - prerequisite phases incomplete | 🔴 BLOCKED |

---

## 1. Critical Security Findings (MUST FIX)

### 1.1 Mock Integration Fallback Violates Production Requirements

**File:** `apps/web/app/api/integrations/route.ts`

**Current behavior:**
```typescript
try {
  const upstreamRes = await fetch(`${ADMIN_API_URL}/v1/integrations`, {
    headers: getAdminHeaders(),
    cache: "no-store",
  });
  if (upstreamRes.ok) {
    const data = await upstreamRes.json();
    return NextResponse.json(data);
  }
} catch {
  // Upstream offline fallback
}

// Fallback response with tenant-scoped integration state
return NextResponse.json({
  integrations: [
    {
      id: "intg-aws-prod",
      tenant_id: session.tenantId,
      provider: "aws_iam",
      status: "connected",  // ⚠️ FABRICATED SUCCESS
      last_sync_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
      // ... fabricated data
    },
  ],
});
```

**Architecture violation:**
> Section 14: "Remove success fallbacks; implement OAuth/role connection setup, durable per-tenant credentials, real test/sync lifecycle, and status events."

**Required fix:**
- Remove all mock/fallback success responses
- Return HTTP 503 Service Unavailable when backend is down
- Never show `status: "connected"` unless real provider handshake succeeded
- Implement real OAuth authorization code flow or cloud role assumption

**Risk:** Customers see fabricated "connected" integrations that provide no actual security coverage.

---

### 1.2 Default Admin Token in Development Mode

**File:** `apps/web/app/api/console/proxy.ts`

**Current behavior:**
```typescript
export const ADMIN_TOKEN = (() => {
  const token = process.env.AXIOM_ADMIN_TOKEN;
  if (token && token.trim().length > 0) {
    return token.trim();
  }
  if (isProduction) {
    throw new Error(
      "Fatal: AXIOM_ADMIN_TOKEN must be set in production mode"
    );
  }
  return "axm_local_dev_token_for_browser_testing";  // ⚠️ HARDCODED SECRET
})();
```

**Architecture violation:**
> Section 13 Security Controls: "No secret defaults" and "No default password or shared admin token"

**Required fix:**
- Production deployment MUST fail startup if `AXIOM_ADMIN_TOKEN` is unset
- Development mode should require explicit `AXIOM_DEV_MODE=1` environment flag
- Log a prominent warning when using development credentials
- Consider workload identity/mTLS instead of bearer token for service-to-service auth

**Risk:** Hardcoded tokens could leak in logs, error messages, or accidentally deployed dev configurations.

---

### 1.3 Anonymous Session Fallback in Development

**File:** `apps/web/app/api/auth/store.ts`

**Current behavior:**
```typescript
// Explicit dev mode fallback only when explicitly acknowledged
if (
  process.env.AXIOM_DEV_MODE === "1" &&
  process.env.AXIOM_ALLOW_ANONYMOUS_LOCAL === "1" &&
  process.env.NODE_ENV !== "production"
) {
  return {
    sessionId: "dev-session",
    userId: "user-sarah-chen",
    tenantId: "org-axiom-enterprise",
    role: "security-admin",  // ⚠️ FULL ADMIN ACCESS
    csrfToken: "dev-csrf",
    expiresAtUnix: Math.floor(Date.now() / 1000) + 3600 * 24,
  };
}
```

**Architecture violation:**
> Section 6.2: "Never trust client-supplied tenant ID/role, create a security administrator from an unverified email"

**Mitigating factors:**
- Requires TWO explicit environment flags
- Production guard exists
- Better than previous implementations

**Recommendations:**
- ✅ Keep the dual-flag requirement
- Add startup banner showing this mode is active
- Consider time-limited automatic expiry (max 4 hours)
- Ensure test/CI environments don't accidentally enable this

---

### 1.4 No Billing Integration Found

**Files searched:** `apps/web/app/api/billing/*`, `apps/console/*`, payment provider integration

**Finding:** No Stripe, payment provider, or webhook verification implementation found in reviewed surfaces.

**Architecture requirement:**
> Section 6.3: "Stripe-style hosted checkout flow (proposed, not currently implemented)"
> Section 10: Full billing and entitlements architecture
> Section 14: "No verified billing checkout/webhook/entitlements workflow was established"

**Required implementation:**

1. **Checkout Session Creation:**
   ```typescript
   POST /api/billing/checkout
   - Validates tenant status, plan, region
   - Creates server-selected price_id (never client-supplied)
   - Returns hosted checkout URL
   ```

2. **Webhook Handler:**
   ```typescript
   POST /api/billing/webhook
   - Verifies provider signature (HMAC-SHA256)
   - Stores event ID with unique constraint
   - Processes idempotently with transaction
   - Updates subscription state
   - Publishes entitlement change event
   ```

3. **Entitlement Service:**
   ```typescript
   // Server-authoritative entitlement calculation
   interface TenantEntitlement {
     tenant_id: string;
     plan_id: "eval" | "team" | "enterprise";
     status: "active" | "past_due" | "canceled";
     features: {
       "connector.aws": boolean;
       "runtime.enforcement": boolean;
       "sso.saml": boolean;
     };
     limits: {
       operators: number;
       connections: number;
       runtime_instances: number;
     };
     version: number;
     effective_at: string;
   }
   ```

**Risk:** Architecture document warns "do not take real payment [...] until billing [...] release gates pass."

---

### 1.5 Tenant Isolation Verification Gaps

**Current state:**
- PostgreSQL schema includes tenant-scoped queries
- Auth store includes tenant context
- Integration API checks session.tenantId

**Architecture requirement:**
> Section 8.3: "Every API call must derive tenant and operator from validated session. Never trust client-supplied tenant_id."
> Section 11: "RLS denies when tenant context is missing"

**Missing verification:**

1. **Row-Level Security (RLS) policies:**
   ```sql
   -- Required but not found in migrations
   ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
   
   CREATE POLICY tenant_isolation ON integrations
     USING (tenant_id = current_setting('app.current_tenant_id')::TEXT);
   ```

2. **Connection pool tenant context:**
   ```typescript
   // Must set on every query
   await pool.query('SET LOCAL app.current_tenant_id = $1', [tenantId]);
   ```

3. **Integration tests for tenant crossing:**
   ```typescript
   test('cannot read other tenant integrations', async () => {
     const tenant_a_session = createSession(tenant_a_user);
     const tenant_b_integration_id = 'intg-tenant-b';
     
     const res = await fetch(`/api/integrations/${tenant_b_integration_id}`, {
       headers: { Cookie: `axiom_session=${tenant_a_session.sessionId}` }
     });
     
     expect(res.status).toBe(404); // Not 403, to avoid enumeration
   });
   ```

**Required action:**
- Add RLS policies to all tenant-owned tables
- Test connection-pool context reuse
- Build tenant-crossing attack test suite

---

### 1.6 CSRF Protection Status

**File:** `apps/web/app/api/auth/store.ts` includes `csrfToken` in session

**Architecture requirement:**
> Section 8.3: "Request is CSRF-protected if cookie-authenticated and mutating"

**Current state:**
- CSRF token generated and stored ✅
- No middleware checking `X-CSRF-Token` header found ❌

**Required implementation:**
```typescript
// middleware.ts or per-route
export async function verifyCsrfToken(req: NextRequest): Promise<boolean> {
  const session = await getOperatorSession(req);
  if (!session) return false;
  
  // GET/HEAD/OPTIONS don't need CSRF
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
  
  const providedToken = req.headers.get('x-csrf-token');
  return providedToken === session.csrfToken;
}
```

**Risk:** Without CSRF protection, authenticated mutations are vulnerable to cross-origin attacks.

---

## 2. Production Readiness Gaps

### 2.1 Integration Connector Real Implementation

**Current:** Rust connector crates with normalization logic exist (`connectors/src/lib.rs`)

**Missing:**
- Actual AWS IAM role assumption code
- GitHub App OAuth callback handler
- Kubernetes RBAC discovery worker
- Durable job queue with retry/cursor logic
- Credential encryption/rotation implementation

**Architecture requirement:**
> Section 7.1: "Preferred authorization patterns: Cloud workload identity, OAuth authorization code, Provider-native app installation"

**Priority implementation order:**

1. **AWS IAM (Highest value, read-only)**
   ```rust
   pub async fn discover_aws_iam(
       account_id: &str,
       role_arn: &str,
       external_id: &str,
   ) -> Result<Vec<DiscoveredNode>, DiscoveryError> {
       // 1. AssumeRole with STS
       // 2. List IAM roles/users/service accounts
       // 3. Get attached policies and last used timestamps
       // 4. Normalize to DiscoveredNode
       // 5. Return without storing raw credentials
   }
   ```

2. **GitHub App (Developer audience, OAuth)**
   ```typescript
   // apps/web/app/api/integrations/github/install/callback/route.ts
   export async function GET(req: NextRequest) {
       const code = req.nextUrl.searchParams.get('code');
       const state = req.nextUrl.searchParams.get('state');
       
       // 1. Verify state matches stored nonce
       // 2. Exchange code for installation token
       // 3. Store encrypted refresh token
       // 4. Queue initial discovery job
       // 5. Redirect to dashboard with success
   }
   ```

3. **Job queue with durable cursor:**
   ```sql
   CREATE TABLE connector_sync_jobs (
     job_id UUID PRIMARY KEY,
     tenant_id TEXT NOT NULL,
     connection_id TEXT NOT NULL,
     status TEXT NOT NULL, -- queued, running, completed, failed
     cursor JSONB,
     started_at TIMESTAMPTZ,
     completed_at TIMESTAMPTZ,
     records_processed INTEGER DEFAULT 0,
     error_category TEXT,
     CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) 
       REFERENCES tenants(tenant_id)
   );
   ```

---

### 2.2 Runtime Deployment Secure Enrollment

**Current:** Helm chart exists at `deployments/helm/axiom-nhi/values.yaml`

**Architecture requirement:**
> Section 9.1: "Dashboard creates enrollment record and short-lived single-use bootstrap code. Runtime exchanges for workload identity/certificate."

**Current Helm values DO NOT show enrollment mechanism:**
```yaml
gateway:
  image:
    repository: ghcr.io/agentgateway/agentgateway
  # ❌ No enrollment token or mTLS certificate volume
```

**Required implementation:**

1. **Enrollment API:**
   ```typescript
   POST /api/runtime/enrollment
   Response: {
     enrollment_code: "enroll_1a2b3c...",  // 256-bit random
     expires_at: "2026-11-17T12:00:00Z",   // 15 minutes
     control_plane_url: "https://cp.axiom.io",
     tenant_id: "org-acme-prod" // server-derived, not client
   }
   ```

2. **Runtime bootstrap:**
   ```rust
   // services/extmcp/runtime/src/enrollment.rs
   pub async fn exchange_enrollment_code(
       code: &str,
       control_plane_url: &str,
   ) -> Result<WorkloadIdentity, EnrollmentError> {
       // 1. POST code to /v1/enrollment/exchange
       // 2. Receive mTLS certificate + tenant config
       // 3. Store certificate securely (not ConfigMap)
       // 4. Delete enrollment code locally
       // 5. Establish outbound mTLS connection
   }
   ```

3. **Helm chart secret management:**
   ```yaml
   apiVersion: v1
   kind: Secret
   metadata:
     name: axiom-gateway-workload-cert
   type: kubernetes.io/tls
   # Populated by init container after enrollment exchange
   ```

**Risk:** Without secure enrollment, deployments might use shared static tokens visible in ConfigMaps.

---

### 2.3 Signed Policy/Revocation Distribution

**Architecture requirement:**
> Section 9.2: "Policy and revocation artifacts must be signed, tenant-bound, versioned, expiring, and rollback-protected"

**Current state:** ExtMCP runtime exists but signed policy distribution not verified in reviewed files.

**Required implementation:**

```rust
// Policy bundle signature verification
pub struct SignedPolicyBundle {
    pub tenant_id: String,
    pub policy_version: u64,
    pub cedar_policies: String,
    pub valid_until_unix: i64,
    pub signature_ed25519: String, // Base64
}

pub fn verify_policy_bundle(
    bundle: &SignedPolicyBundle,
    control_plane_pubkey: &ed25519_dalek::PublicKey,
) -> Result<(), PolicyError> {
    // 1. Check expiry
    if bundle.valid_until_unix < now() {
        return Err(PolicyError::Expired);
    }
    
    // 2. Construct signed payload
    let payload = format!(
        "{}:{}:{}:{}",
        bundle.tenant_id,
        bundle.policy_version,
        bundle.valid_until_unix,
        bundle.cedar_policies
    );
    
    // 3. Verify Ed25519 signature
    let sig = Signature::from_bytes(&base64::decode(&bundle.signature_ed25519)?)?;
    control_plane_pubkey.verify_strict(payload.as_bytes(), &sig)?;
    
    // 4. Check monotonic version (prevent rollback)
    let current_version = load_current_policy_version()?;
    if bundle.policy_version <= current_version {
        return Err(PolicyError::Rollback);
    }
    
    Ok(())
}
```

---

### 2.4 Observability and Audit Completeness

**Files found:** `observability/audit/`, `observability/kill-switch/`

**Architecture requirement:**
> Section 9.2: "Emit redacted decision event asynchronously"
> Section 8: "Audit: redacted immutable action/decision events"

**Current state:** Audit crates exist but integration into MCP request path not verified.

**Required verification:**
```rust
// After every MCP authorization decision
pub async fn emit_decision_event(
    tenant_id: &str,
    decision: &AuthzDecision,
    redacted_context: &RedactedContext,
) {
    let event = AuditEvent {
        event_id: Uuid::new_v4(),
        tenant_id: tenant_id.to_string(),
        timestamp_unix: now(),
        event_type: "mcp.authorization.decision",
        decision: decision.to_string(), // "allow" | "deny"
        caller_identity: redacted_context.caller_uid, // Never raw JWT
        target_mcp_server: redacted_context.server_uid,
        tool_name: redacted_context.tool_name,
        // ❌ DO NOT LOG: raw arguments, secrets, PII
        policy_version: decision.policy_version,
        revocation_version: decision.revocation_version,
    };
    
    // Async append-only write
    audit_buffer.push(event).await;
}
```

**Missing pieces:**
- Integration into gateway request handler
- Buffered batch upload to control plane
- Backpressure/overflow behavior specification
- Query API for tenant-scoped audit search

---

## 3. API Contract Gaps

### 3.1 No Frozen API Contracts

**Architecture requirement:**
> Phase 0: "Freeze tenant, identity, connector, policy, runtime, and audit API contracts"

**Current state:**
- `docs/api-contracts/phase2_contracts.rs` mentioned in main README
- Contracts exist but not marked as frozen/stable
- No OpenAPI/protobuf versioning strategy found

**Recommended action:**

1. **Publish OpenAPI 3.1 specs:**
   ```yaml
   openapi: 3.1.0
   info:
     title: Axiom NHI Control Plane API
     version: 1.0.0-beta
   servers:
     - url: https://api.axiom.io/v1
   ```

2. **Contract testing:**
   ```typescript
   // tests/api-contracts/tenant.contract.test.ts
   describe('Tenant API v1 Contract', () => {
     test('GET /v1/tenants/:id matches schema', async () => {
       const response = await api.get('/v1/tenants/org-test');
       expect(response).toMatchSchema(TenantResponseSchema);
     });
   });
   ```

3. **Breaking change policy:**
   - v1 APIs cannot break until v2 exists
   - Deprecation warnings 90 days before removal
   - Server advertises supported API versions

---

### 3.2 Webhook Event Schema Undefined

**Architecture requirement:**
> Section 6.3: "Webhook handler verifies signature, timestamp, event type"

**Current state:** No webhook event schema or signature verification found.

**Required definition:**

```typescript
interface BillingWebhookEvent {
  id: string; // Provider event ID
  type: 'checkout.session.completed' | 'invoice.payment_failed' | 'customer.subscription.deleted';
  created_at: number; // Unix timestamp
  data: {
    customer_id: string;
    subscription_id: string;
    status: 'active' | 'past_due' | 'canceled';
    plan_id: string;
  };
  // Provider-specific signature in headers
}

function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSig)
  );
}
```

---

## 4. Deployment and Operations Gaps

### 4.1 Helm Chart Validation

**Architecture note:**
> Section 14: "A previous audit found mismatched env names, missing required values/config references, and conflicting runtime workloads"

**Current values.yaml:** Found at `deployments/helm/axiom-nhi/values.yaml`

**Required validation:**
```bash
# Test in disposable cluster
kind create cluster --name axiom-test
helm install axiom-test ./deployments/helm/axiom-nhi --dry-run --debug
helm install axiom-test ./deployments/helm/axiom-nhi
kubectl get pods -n axiom-test --watch
helm test axiom-test
helm delete axiom-test
kind delete cluster --name axiom-test
```

**Missing Helm features:**
- Init container for enrollment exchange
- Secret management integration (External Secrets Operator?)
- Network policies for air-gapped mode
- Resource limits and HPA configuration
- Upgrade/rollback smoke tests

---

### 4.2 Database Migration Strategy

**Current:** PostgreSQL referenced in auth store with conditional pool initialization

**Architecture requirement:**
> Section 11: "Migrations are versioned and run as controlled deployment step"

**Missing:**
- Formal migration tool (e.g., Flyway, Liquibase, sqlx migrate)
- Version tracking table
- Rollback procedures
- Blue-green migration testing

**Recommended setup:**
```bash
# Using sqlx (Rust ecosystem)
sqlx migrate add create_tenants_table
sqlx migrate add create_operators_table
sqlx migrate add create_integrations_table
sqlx migrate add enable_rls_policies

# Verify before deploy
sqlx migrate run --dry-run
sqlx migrate run
```

---

### 4.3 Disaster Recovery and Backup

**Architecture requirement:**
> Section 12: "Backups are encrypted, tenant-aware restore procedures are tested"

**Current state:** No backup/restore procedures found in reviewed materials.

**Required documentation:**

1. **Backup strategy:**
   - Automated PostgreSQL PITR with 30-day retention
   - Encrypted S3/object storage destination
   - Tenant-selective restore capability
   - RPO: 1 hour, RTO: 4 hours

2. **Restore testing:**
   ```bash
   # Quarterly DR drill
   1. Provision new environment
   2. Restore latest backup
   3. Verify tenant isolation
   4. Test one integration and runtime connection
   5. Document any gaps
   ```

---

## 5. Recommended Implementation Roadmap

### Phase 0: Foundation (Week 1-2) - BLOCKING

**Exit criteria:** Can deploy without mock data and verify tenant isolation.

- [ ] Remove integration mock fallback (apps/web/app/api/integrations/route.ts)
- [ ] Add RLS policies to all tenant tables
- [ ] Write tenant-crossing attack tests
- [ ] Publish OpenAPI v1-beta contracts
- [ ] Document threat model and trust boundaries
- [ ] Freeze JWT verification and session contracts

**Owner:** Engineering Lead + Security Architect

---

### Phase 1: Secure Identity (Week 3-4) - CRITICAL

**Exit criteria:** Production-ready authentication with no default credentials.

- [ ] Mandatory AXIOM_ADMIN_TOKEN check in production
- [ ] CSRF middleware implementation and tests
- [ ] PostgreSQL connection pool tenant context setting
- [ ] MFA enrollment flow (TOTP or WebAuthn)
- [ ] Session revocation API and UI
- [ ] Remove or clearly document AXIOM_DEV_MODE behavior

**Owner:** Backend Team + Security Review

---

### Phase 2: Billing Integration (Week 5-7) - CRITICAL

**Exit criteria:** Can accept payment and enforce entitlements.

- [ ] Choose payment provider (Stripe recommended)
- [ ] Implement checkout session creation
- [ ] Webhook signature verification
- [ ] Idempotent event processing with unique constraints
- [ ] Entitlement calculation and caching
- [ ] Billing page showing actual subscription status
- [ ] Trial-to-paid conversion flow
- [ ] Plan downgrade and cancellation procedures

**Owner:** Full-Stack + Product + Legal (for terms)

---

### Phase 3: Real Integrations (Week 8-12) - HIGH

**Exit criteria:** Two working connectors with real OAuth/role assumption.

**Connector 1: AWS IAM (Read-only)**
- [ ] IAM role assumption with external ID
- [ ] CloudFormation template generation
- [ ] Test connection with actual AWS API call
- [ ] Discovery job queue with retry logic
- [ ] Normalize to inventory schema with provenance
- [ ] Dashboard showing actual discovered roles

**Connector 2: GitHub App**
- [ ] GitHub App manifest and installation flow
- [ ] OAuth callback handler
- [ ] Installation token refresh
- [ ] Metadata discovery (repos, workflows, secrets)
- [ ] Permission change detection
- [ ] Revocation/uninstall handling

**Owner:** Integrations Team + Connectors Squad

---

### Phase 4: Runtime Security (Week 13-16) - HIGH

**Exit criteria:** Secure deployment with signed policy and enrollment.

- [ ] Enrollment API with short-lived bootstrap codes
- [ ] Runtime enrollment exchange implementation
- [ ] Ed25519 signed policy bundle distribution
- [ ] Monotonic version and rollback protection
- [ ] mTLS workload identity for outbound connections
- [ ] Helm chart with proper secret management
- [ ] Redacted audit event emission in request path
- [ ] Kill-switch propagation end-to-end test

**Owner:** Runtime Team + Platform Engineering

---

### Phase 5: Production Hardening (Week 17-20) - MEDIUM

**Exit criteria:** Can run in production with proper observability.

- [ ] Database migration tooling (sqlx or equivalent)
- [ ] Backup and restore procedures
- [ ] Disaster recovery runbook
- [ ] Status page and incident communication plan
- [ ] Observability dashboards (connector health, policy lag, audit lag)
- [ ] Support access procedures with approval workflow
- [ ] Performance testing (10k NHIs, 1000 req/s)
- [ ] Load testing and capacity planning

**Owner:** SRE + Operations

---

### Phase 6: Compliance and Launch (Week 21-24) - FINAL

**Exit criteria:** Legal/security sign-off for commercial launch.

- [ ] Security audit of implementation vs. architecture
- [ ] Penetration testing (tenant isolation, auth bypass, injection)
- [ ] WCAG 2.1 AA accessibility audit
- [ ] Data processing agreement (DPA) finalization
- [ ] Privacy policy and subprocessor list
- [ ] SOC 2 Type 1 readiness assessment
- [ ] Customer-facing documentation
- [ ] Support tier definitions and SLAs
- [ ] Go/no-go decision with executive team

**Owner:** CISO + Legal + Product

---

## 6. Testing Requirements

### 6.1 Security Test Suite (Required before launch)

```typescript
// tests/security/tenant-isolation.test.ts
describe('Tenant Isolation', () => {
  test('cannot read other tenant integrations', async () => { /* ... */ });
  test('cannot update other tenant policy', async () => { /* ... */ });
  test('cannot impersonate other tenant operator', async () => { /* ... */ });
});

// tests/security/auth-bypass.test.ts
describe('Authentication Bypass', () => {
  test('forged JWT rejected', async () => { /* ... */ });
  test('expired session rejected', async () => { /* ... */ });
  test('CSRF token mismatch blocks mutation', async () => { /* ... */ });
});

// tests/security/injection.test.ts
describe('Injection Attacks', () => {
  test('SQL injection in tenant_id parameter', async () => { /* ... */ });
  test('Cedar policy injection via tool name', async () => { /* ... */ });
  test('Command injection in connector credentials', async () => { /* ... */ });
});
```

### 6.2 Integration Test Requirements

```python
# tests/integration/end_to_end_test.py
def test_full_customer_journey():
    """
    1. Provision tenant with invitation
    2. Owner accepts, sets up MFA
    3. Connects AWS integration with real IAM role
    4. Waits for discovery job completion
    5. Deploys runtime with enrollment code
    6. Verifies runtime health and policy version
    7. Sends test MCP request through gateway
    8. Verifies authorization and audit event
    9. Triggers emergency kill-switch
    10. Verifies MCP request blocked
    11. Cancels subscription
    12. Verifies tenant enters grace period
    """
```

---

## 7. Risk Assessment

### High-Risk Items (Cannot Launch Without)

1. **Mock integration fallback** - Customers see fake security coverage
2. **No billing integration** - Cannot accept payment or enforce entitlements
3. **Incomplete tenant isolation** - Potential data leakage between customers
4. **No CSRF protection** - Vulnerable to cross-origin attacks
5. **Default credentials** - Hardcoded tokens could leak

### Medium-Risk Items (Should Fix Soon)

1. **Unsigned policy distribution** - Could be tampered in transit
2. **No audit event emission** - Cannot prove security decisions
3. **Helm chart validation** - Deployment might fail in customer environments
4. **Database migration strategy** - Schema changes could break production

### Low-Risk Items (Can Defer)

1. **OpenAPI contract publication** - Internal teams can coordinate
2. **Disaster recovery testing** - Lower priority for MVP
3. **Performance benchmarking** - Can optimize after launch

---

## 8. Conclusion and Recommendations

### What's Working Well

✅ **Phase 1 Runtime Engineering:** ExtMCP, gateway, validators, and Cedar integration show solid foundation  
✅ **Connector Normalization:** Discovery orchestrator with HMAC fingerprinting demonstrates security awareness  
✅ **Development Ergonomics:** File-backed auth store and explicit dev mode flags show thoughtful local development experience  
✅ **Architecture Documentation:** The customer journey document provides excellent blueprint

### Critical Path to Launch

**DO NOT ACCEPT REAL PAYMENT OR PROMISE PRODUCTION MCP PROTECTION UNTIL:**

1. ✅ Integration mock fallback removed
2. ✅ Billing webhook verification implemented
3. ✅ Tenant isolation tests passing
4. ✅ CSRF protection active
5. ✅ Real AWS and GitHub integrations working
6. ✅ Runtime secure enrollment operational
7. ✅ Signed policy distribution verified
8. ✅ Security audit completed

### Immediate Next Steps (This Week)

1. **Remove `apps/web/app/api/integrations/route.ts` mock fallback** - Replace with HTTP 503
2. **Add RLS policies to PostgreSQL schema** - Prevent tenant data leakage
3. **Document current threat model** - Make implicit security assumptions explicit
4. **Choose billing provider** - Stripe recommended for SaaS
5. **Schedule architecture review** - Engineering + Security + Product alignment

### Final Note

The current repository demonstrates **significant technical capability** in the hardest parts (runtime security, policy evaluation, discovery normalization). The gaps are primarily in **production operationalization** (billing, webhooks, enrollment, deployment) rather than fundamental architecture flaws.

With focused execution on the roadmap above, this can become a **production-ready, commercially viable product** within 16-20 weeks.

---

**Document prepared by:** Kiro AI Assistant  
**Review required by:** Engineering Lead, Security Architect, Product Manager  
**Next review date:** 2026-11-24 (1 week)
