# Axiom NHI — Implementation Checklist

**Purpose:** Track completion of critical gaps identified in IMPLEMENTATION-GAP-ANALYSIS.md  
**Target:** Production-ready commercial launch  
**Last Updated:** 2026-11-17

---

## Phase 0: Foundation (BLOCKING) ⏰ Week 1-2

**Exit criteria:** Can deploy without mock data and verify tenant isolation

### Security Fixes (Critical)

- [x] Remove integration mock fallback (`apps/web/app/api/integrations/route.ts`)
  - **Status:** ✅ FIXED - Now returns HTTP 503 when backend unavailable
  - **Commit:** [pending]
  - **Tested:** Manual verification needed

- [ ] Add CSRF middleware implementation
  - **File:** `apps/web/middleware.ts`
  - **Status:** ✅ CREATED - Needs integration testing
  - **Required tests:**
    - [ ] Mutating request without X-CSRF-Token header returns 403
    - [ ] GET/HEAD/OPTIONS bypass CSRF check
    - [ ] Valid CSRF token allows mutation
    - [ ] Expired/invalid token rejected

- [ ] Database RLS policies
  - **File:** `migrations/0001_tenants_and_operators.sql`
  - **Status:** ✅ CREATED - Needs deployment
  - **Required actions:**
    - [ ] Run migration in test database
    - [ ] Verify RLS blocks cross-tenant queries
    - [ ] Test connection pool tenant context setting
    - [ ] Measure performance impact (<5ms per query)

- [ ] Tenant isolation test suite
  - **File:** `tests/security/tenant-isolation.test.ts`
  - **Status:** ✅ CREATED - Needs CI integration
  - **Required actions:**
    - [ ] Set up test database with fixtures
    - [ ] Run all 20+ isolation tests
    - [ ] Add to CI pipeline (must pass before merge)
    - [ ] Document expected test coverage (>95%)

### Documentation

- [ ] Freeze API contracts (OpenAPI 3.1)
  - **Owner:** Backend Lead
  - **Deliverable:** `docs/api-contracts/v1-beta.yaml`
  - **Contents:**
    - [ ] Authentication endpoints
    - [ ] Tenant management
    - [ ] Integration CRUD
    - [ ] Billing checkout/portal
    - [ ] Runtime enrollment
    - [ ] Audit query

- [ ] Document threat model
  - **Owner:** Security Architect
  - **Deliverable:** `docs/security/THREAT-MODEL.md`
  - **Contents:**
    - [ ] Trust boundaries diagram
    - [ ] Attack surface analysis
    - [ ] Mitigations for each threat
    - [ ] Residual risk assessment

---

## Phase 1: Secure Identity ⏰ Week 3-4

**Exit criteria:** Production-ready authentication with no default credentials

### Authentication Hardening

- [ ] Mandatory AXIOM_ADMIN_TOKEN check
  - **File:** `apps/web/app/api/console/proxy.ts`
  - **Change:** Remove dev token fallback
  - **Required:**
    ```typescript
    if (!token || token.trim().length === 0) {
      throw new Error("AXIOM_ADMIN_TOKEN must be set");
    }
    ```
  - **Testing:** Verify server fails to start without token

- [ ] CSRF token validation in auth middleware
  - **File:** `apps/web/middleware.ts`
  - **Status:** Header presence check exists
  - **Missing:** Token value comparison against session
  - **Required:**
    ```typescript
    const session = await getOperatorSession(req);
    const providedToken = req.headers.get('x-csrf-token');
    if (providedToken !== session.csrfToken) {
      return 403;
    }
    ```

- [ ] PostgreSQL tenant context enforcement
  - **File:** `apps/web/app/api/auth/store.ts`
  - **Missing:** `set_tenant_context()` call before every query
  - **Required:**
    ```typescript
    await client.query('SELECT set_tenant_context($1)', [tenantId]);
    const result = await client.query('SELECT * FROM operators...');
    ```
  - **Testing:** Verify query without context returns no rows

### MFA/WebAuthn

- [ ] TOTP enrollment flow
  - **File:** `apps/web/app/api/auth/mfa/totp/enroll/route.ts`
  - **Status:** Not implemented
  - **Required:**
    - [ ] Generate secret with `speakeasy` or `otpauth`
    - [ ] Return QR code data URL
    - [ ] Verify challenge before marking enabled

- [ ] WebAuthn enrollment (passkey)
  - **File:** `apps/web/app/api/auth/mfa/webauthn/enroll/route.ts`
  - **Status:** Not implemented
  - **Library:** `@simplewebauthn/server`
  - **Required:**
    - [ ] Generate registration options
    - [ ] Verify attestation response
    - [ ] Store credential ID in `operators.webauthn_credential_id`

- [ ] Session revocation API
  - **File:** `apps/web/app/api/auth/sessions/revoke/route.ts`
  - **Status:** `deleteSession()` exists, needs API wrapper
  - **Required:**
    ```typescript
    POST /api/auth/sessions/revoke
    Body: { session_id: string }
    Auth: Current session with security-admin role
    ```

### Development Mode Controls

- [ ] Document AXIOM_DEV_MODE behavior
  - **File:** `docs/development/LOCAL-SETUP.md`
  - **Required content:**
    - [ ] Explicit warning about anonymous fallback
    - [ ] Environment variable matrix
    - [ ] When to use vs. not use dev mode
    - [ ] Security implications

- [ ] Add startup banner in dev mode
  - **File:** `apps/web/app/layout.tsx` or server startup
  - **Required:**
    ```
    ⚠️  AXIOM_DEV_MODE ENABLED - ANONYMOUS AUTH ACTIVE
    This configuration MUST NOT be used in production.
    ```

---

## Phase 2: Billing Integration ⏰ Week 5-7

**Exit criteria:** Can accept payment and enforce entitlements

### Stripe Integration

- [x] Checkout session creation
  - **File:** `apps/web/app/api/billing/checkout/route.ts`
  - **Status:** ✅ CREATED - Needs Stripe account setup
  - **Required env vars:**
    - [ ] `STRIPE_SECRET_KEY`
    - [ ] `STRIPE_PRICE_EVAL`
    - [ ] `STRIPE_PRICE_TEAM`
    - [ ] `NEXT_PUBLIC_APP_URL`

- [x] Webhook signature verification
  - **File:** `apps/web/app/api/billing/webhook/route.ts`
  - **Status:** ✅ CREATED - Needs webhook secret
  - **Required env vars:**
    - [ ] `STRIPE_WEBHOOK_SECRET` (from Stripe dashboard)
  - **Testing:**
    - [ ] Use Stripe CLI to send test webhooks
    - [ ] Verify idempotent processing (replay same event)
    - [ ] Test all event types (checkout.completed, invoice.paid, etc.)

- [x] Database migrations for billing
  - **File:** `migrations/0002_billing_and_entitlements.sql`
  - **Status:** ✅ CREATED - Needs deployment
  - **Tables:**
    - [x] `subscriptions`
    - [x] `billing_webhook_events` (idempotency)
    - [x] `tenant_entitlements` (versioned)
    - [x] `billing_audit_events`

### Entitlement Enforcement

- [ ] Entitlement middleware
  - **File:** `apps/web/app/api/middleware/check-entitlement.ts`
  - **Required:**
    ```typescript
    export async function checkEntitlement(
      tenantId: string,
      feature: string
    ): Promise<boolean> {
      const result = await db.query(
        'SELECT tenant_has_feature($1, $2)',
        [tenantId, feature]
      );
      return result.rows[0].tenant_has_feature;
    }
    ```

- [ ] Apply entitlement checks to APIs
  - **Locations:**
    - [ ] `POST /api/integrations` → check `connector.{provider}`
    - [ ] `POST /api/runtime/enrollment` → check `runtime.enforcement`
    - [ ] `GET /api/console/*` → check `console.access`
  - **Behavior:** Return 402 Payment Required when feature disabled

### Billing UI

- [ ] Billing page showing subscription status
  - **File:** `apps/web/app/dashboard/billing/page.tsx`
  - **Status:** Needs implementation
  - **Required elements:**
    - [ ] Current plan and status
    - [ ] Usage vs. limits (operators, connections, runtime instances)
    - [ ] Upgrade/downgrade buttons
    - [ ] Payment method management (Stripe Customer Portal)
    - [ ] Invoice history
    - [ ] Cancellation flow with confirmation

---

## Phase 3: Real Integrations ⏰ Week 8-12

**Exit criteria:** Two working connectors with real OAuth/role assumption

### AWS IAM Connector (Read-Only)

- [ ] CloudFormation template generation
  - **File:** `apps/web/app/api/integrations/aws/setup/route.ts`
  - **Output:** CF template with read-only IAM role
  - **Permissions:**
    ```yaml
    - iam:GetRole
    - iam:ListRoles
    - iam:ListUsers
    - iam:ListServiceSpecificCredentials
    - iam:GetRoleLastUsed
    ```
  - **Trust relationship:** Axiom SaaS account + external ID

- [ ] AssumeRole implementation
  - **File:** `connectors/src/discovery.rs` (AWS feature)
  - **Status:** Struct exists, needs AWS SDK integration
  - **Library:** `aws-sdk-sts`, `aws-sdk-iam`
  - **Required:**
    ```rust
    pub async fn assume_role_and_discover(
        role_arn: &str,
        external_id: &str,
    ) -> Result<Vec<DiscoveredNode>, DiscoveryError>
    ```

- [ ] Test connection handler
  - **File:** `apps/web/app/api/integrations/[id]/test/route.ts`
  - **Behavior:**
    - [ ] Call AWS IAM ListRoles (paginated, limit 10)
    - [ ] Return success with role count
    - [ ] Return error with missing permissions list

- [ ] Discovery job worker
  - **File:** `connectors/src/discovery.rs`
  - **Required:**
    - [ ] Enumerate all IAM roles, users, service accounts
    - [ ] Get last used timestamps
    - [ ] Get attached policies (managed + inline)
    - [ ] Normalize to `DiscoveredNode`
    - [ ] Store in `inventory_entities` table
    - [ ] Update cursor for incremental sync

### GitHub App Connector

- [ ] GitHub App manifest
  - **File:** `deployments/github/app-manifest.json`
  - **Permissions:**
    ```json
    {
      "metadata": "read",
      "administration": "read",
      "actions": "read",
      "secrets": "read"
    }
    ```

- [ ] Installation callback handler
  - **File:** `apps/web/app/api/integrations/github/install/callback/route.ts`
  - **Required:**
    - [ ] Verify `state` parameter matches stored nonce
    - [ ] Exchange `code` for installation token
    - [ ] Store encrypted installation ID and tokens
    - [ ] Create integration_connection record
    - [ ] Queue initial discovery job

- [ ] GitHub discovery worker
  - **File:** `connectors/src/discovery.rs` (GitHub feature)
  - **Status:** Normalizer exists, needs Octokit integration
  - **Library:** `octocrab` or `github-rs`
  - **Required:**
    ```rust
    pub async fn discover_github_app(
        installation_id: u64,
        app_id: u64,
        private_key: &str,
    ) -> Result<Vec<DiscoveredNode>, DiscoveryError>
    ```

### Job Queue Implementation

- [ ] Background worker with Tokio
  - **File:** `connectors/src/worker.rs`
  - **Status:** Not implemented
  - **Required:**
    - [ ] Poll `connector_sync_jobs` table for queued jobs
    - [ ] Lease job with expiry (5 minutes)
    - [ ] Execute connector-specific discovery
    - [ ] Update job status and records counts
    - [ ] Handle errors and retry with exponential backoff

- [ ] Job scheduler (cron-like)
  - **File:** `connectors/src/scheduler.rs`
  - **Status:** Not implemented
  - **Required:**
    - [ ] Every 4 hours: create sync jobs for all connected integrations
    - [ ] Respect tenant rate limits
    - [ ] Skip if previous job still running

---

## Phase 4: Runtime Security ⏰ Week 13-16

**Exit criteria:** Secure deployment with signed policy and enrollment

### Enrollment API

- [ ] Generate enrollment code
  - **File:** `apps/web/app/api/runtime/enrollment/route.ts`
  - **Status:** Not implemented
  - **Required:**
    ```typescript
    POST /api/runtime/enrollment
    Response: {
      enrollment_code: string,  // 256-bit random, base64
      expires_at: string,       // 15 minutes from now
      control_plane_url: string,
      tenant_id: string         // server-derived
    }
    ```

- [ ] Enrollment exchange endpoint
  - **File:** `services/extmcp/runtime/src/enrollment.rs`
  - **Status:** Not implemented
  - **Required:**
    ```rust
    POST /v1/enrollment/exchange
    Body: { enrollment_code: string }
    Response: {
      workload_cert_pem: string,
      workload_key_pem: string,
      control_plane_ca_pem: string,
      tenant_config: SignedPolicyBundle
    }
    ```

### Signed Policy Distribution

- [ ] Ed25519 key pair generation
  - **Tool:** `openssl` or `age-keygen`
  - **Storage:** Control plane secure key store (HashiCorp Vault or AWS KMS)
  - **Public key:** Embedded in runtime image or fetched from JWKS endpoint

- [ ] Policy signing function
  - **File:** `services/extmcp/policy-api/src/signing.rs`
  - **Status:** Not implemented
  - **Required:**
    ```rust
    pub fn sign_policy_bundle(
        tenant_id: &str,
        policy_version: u64,
        cedar_policies: &str,
        valid_until: i64,
        signing_key: &ed25519_dalek::SigningKey,
    ) -> SignedPolicyBundle
    ```

- [ ] Policy verification in runtime
  - **File:** `services/extmcp/runtime/src/policy.rs`
  - **Status:** Not implemented
  - **Required:**
    - [ ] Verify signature with control plane public key
    - [ ] Check expiry (fail closed if expired)
    - [ ] Check monotonic version (prevent rollback)
    - [ ] Atomically activate new policy

### Helm Chart Fixes

- [ ] Add enrollment init container
  - **File:** `deployments/helm/axiom-nhi/templates/gateway-deployment.yaml`
  - **Required:**
    ```yaml
    initContainers:
      - name: enrollment
        image: {{ .Values.gateway.image.repository }}:{{ .Values.gateway.image.tag }}
        command: ["/usr/local/bin/axiom-runtime-enroll"]
        env:
          - name: ENROLLMENT_CODE
            valueFrom:
              secretKeyRef:
                name: axiom-enrollment-secret
                key: code
    ```

- [ ] Add workload cert volume
  - **File:** Same as above
  - **Required:**
    ```yaml
    volumes:
      - name: workload-cert
        secret:
          secretName: axiom-gateway-workload-cert
    volumeMounts:
      - name: workload-cert
        mountPath: /etc/axiom/certs
        readOnly: true
    ```

- [ ] Test Helm install/upgrade
  - **Commands:**
    ```bash
    kind create cluster --name axiom-test
    helm install axiom-test ./deployments/helm/axiom-nhi \
      --set gateway.enrollmentCode="test-code-123" \
      --wait --timeout 5m
    kubectl get pods -n axiom-test
    kubectl logs -n axiom-test deployment/axiom-gateway
    helm upgrade axiom-test ./deployments/helm/axiom-nhi
    helm rollback axiom-test
    helm delete axiom-test
    kind delete cluster --name axiom-test
    ```

---

## Phase 5: Production Hardening ⏰ Week 17-20

### Database Operations

- [ ] Choose migration tool
  - **Options:** sqlx, Flyway, Liquibase, Alembic
  - **Decision:** [TBD by backend team]
  - **Required features:**
    - Version tracking table
    - Rollback support
    - Dry-run mode
    - Team collaboration (multiple developers)

- [ ] Set up automated backups
  - **Tool:** pg_dump + cron or managed service backup
  - **Schedule:** Every 4 hours
  - **Retention:** 30 days
  - **Storage:** Encrypted S3 bucket
  - **Testing:** Quarterly restore drill

- [ ] Disaster recovery runbook
  - **File:** `docs/operations/DISASTER-RECOVERY.md`
  - **Contents:**
    - [ ] RTO/RPO definitions
    - [ ] Backup restoration steps
    - [ ] Database failover procedure
    - [ ] Service degradation modes
    - [ ] Communication templates

### Observability

- [ ] Prometheus metrics
  - **Metrics to track:**
    - `axiom_connector_sync_age_seconds{tenant, provider}`
    - `axiom_policy_version{tenant, runtime}`
    - `axiom_revocation_propagation_seconds{tenant}`
    - `axiom_audit_buffer_lag_seconds{tenant}`
    - `axiom_entitlement_checks_total{tenant, feature, result}`

- [ ] Grafana dashboards
  - **Dashboards:**
    - [ ] Tenant health overview
    - [ ] Connector sync status
    - [ ] Runtime heartbeat and policy lag
    - [ ] Billing subscription states
    - [ ] Database connection pool metrics

- [ ] Alert rules
  - **Critical alerts:**
    - [ ] Connector sync failed 3x in 1 hour
    - [ ] Policy distribution lag > 5 minutes
    - [ ] Runtime heartbeat missing > 10 minutes
    - [ ] Database connection pool exhausted
    - [ ] Webhook processing errors > 10/hour

### Performance Testing

- [ ] Load test: 10,000 identities
  - **Tool:** k6 or Locust
  - **Scenario:** Discover 10k IAM roles across 100 tenants
  - **Success criteria:**
    - [ ] Discovery completes in <10 minutes
    - [ ] Database queries <100ms p99
    - [ ] No memory leaks
    - [ ] CPU usage <70% sustained

- [ ] Load test: 1,000 req/s authorization
  - **Scenario:** MCP gateway processing 1k authz decisions/second
  - **Success criteria:**
    - [ ] p50 latency <5ms (inline budget)
    - [ ] p99 latency <15ms (fail-closed deadline)
    - [ ] No dropped requests
    - [ ] Audit events buffered correctly

---

## Phase 6: Compliance and Launch ⏰ Week 21-24

### Security Audit

- [ ] Internal security review
  - **Reviewer:** CISO or Security Architect
  - **Focus areas:**
    - [ ] Tenant isolation (SQL injection, RLS bypass)
    - [ ] Authentication (JWT forging, session hijacking)
    - [ ] Authorization (privilege escalation, IDOR)
    - [ ] Injection attacks (XSS, command injection, SSRF)
    - [ ] Cryptography (weak algorithms, hardcoded keys)

- [ ] External penetration testing
  - **Vendor:** [TBD]
  - **Scope:** Web console, APIs, runtime deployment
  - **Deliverable:** Report with findings and remediation timeline
  - **Threshold:** No critical/high findings unresolved

- [ ] Dependency audit
  - **Tools:** `npm audit`, `cargo audit`, Snyk, Dependabot
  - **Frequency:** Weekly in CI
  - **Policy:** Block deployment on high/critical CVEs

### Accessibility

- [ ] WCAG 2.1 AA audit
  - **Tool:** axe DevTools, Lighthouse, manual screen reader testing
  - **Scope:** All dashboard pages
  - **Required checks:**
    - [ ] Keyboard navigation (no mouse required)
    - [ ] Screen reader compatibility (NVDA, JAWS)
    - [ ] Color contrast ratios (4.5:1 for text)
    - [ ] Focus indicators visible
    - [ ] Form labels and error messages

- [ ] Accessibility statement
  - **File:** `apps/web/app/accessibility/page.tsx`
  - **Contents:**
    - [ ] Conformance level (WCAG 2.1 AA)
    - [ ] Known issues and workarounds
    - [ ] Contact for accessibility feedback

### Legal and Compliance

- [ ] Data Processing Agreement (DPA)
  - **Owner:** Legal counsel
  - **Required sections:**
    - [ ] Data categories processed
    - [ ] Subprocessors list
    - [ ] Data retention and deletion
    - [ ] Security measures
    - [ ] Breach notification (72 hours)

- [ ] Privacy Policy
  - **Owner:** Legal + Privacy counsel
  - **Required:**
    - [ ] GDPR compliance (EU customers)
    - [ ] CCPA compliance (California customers)
    - [ ] Cookie policy
    - [ ] User rights (access, deletion, portability)

- [ ] Terms of Service
  - **Owner:** Legal counsel
  - **Required:**
    - [ ] Acceptable use policy
    - [ ] Service level commitments
    - [ ] Limitation of liability
    - [ ] Termination and data export

- [ ] SOC 2 Type 1 preparation
  - **Owner:** CISO + Compliance team
  - **Deliverable:** Readiness assessment document
  - **Controls to document:**
    - [ ] Logical access controls
    - [ ] Change management
    - [ ] Encryption at rest and in transit
    - [ ] Incident response procedures

### Launch Documentation

- [ ] Customer onboarding guide
  - **File:** `docs/customer/GETTING-STARTED.md`
  - **Contents:**
    - [ ] Account creation and MFA setup
    - [ ] First integration connection
    - [ ] Runtime deployment (Kubernetes)
    - [ ] Policy authoring and testing
    - [ ] Support contact information

- [ ] API documentation
  - **Tool:** OpenAPI docs or Redocly
  - **URL:** `https://docs.axiom.io/api/v1`
  - **Contents:**
    - [ ] Authentication (Bearer token)
    - [ ] Rate limits
    - [ ] Example requests/responses
    - [ ] Error codes and troubleshooting

### Go/No-Go Decision

- [ ] Executive sign-off meeting
  - **Attendees:** CEO, CTO, CISO, Head of Product, Legal
  - **Agenda:**
    - [ ] Review all phase exit criteria
    - [ ] Security audit results
    - [ ] Performance benchmarks
    - [ ] Support readiness
    - [ ] Legal/compliance clearance
  - **Outcome:** Written go/no-go decision with signatures

---

## Progress Tracking

**Overall completion:** 15% (Phase 0 in progress)

| Phase | Status | Completion | Blockers |
|-------|--------|------------|----------|
| Phase 0: Foundation | 🟡 In Progress | 40% | Database migration deployment, test suite CI integration |
| Phase 1: Secure Identity | ⚪ Not Started | 0% | Phase 0 completion |
| Phase 2: Billing | 🟡 In Progress | 30% | Stripe account setup, webhook testing |
| Phase 3: Integrations | ⚪ Not Started | 5% | Phase 1 completion, AWS/GitHub credentials |
| Phase 4: Runtime | ⚪ Not Started | 10% | Phase 3 completion, Ed25519 key generation |
| Phase 5: Hardening | ⚪ Not Started | 0% | Phase 4 completion |
| Phase 6: Launch | ⚪ Not Started | 0% | All previous phases |

---

## Critical Path Items (Must Complete First)

1. ✅ **Remove mock fallback** - DONE
2. 🔄 **Deploy database migrations** - IN PROGRESS
3. 🔄 **Run tenant isolation tests** - READY, needs CI setup
4. ⏳ **Set up Stripe webhook endpoint** - CREATED, needs secrets
5. ⏳ **Implement CSRF validation** - CREATED, needs testing

## Next Actions (This Week)

1. Deploy `migrations/0001_tenants_and_operators.sql` to test database
2. Set up GitHub Actions workflow to run `tenant-isolation.test.ts`
3. Obtain Stripe test mode API keys and webhook secret
4. Test billing webhook with Stripe CLI
5. Document threat model trust boundaries

---

**Last updated:** 2026-11-17  
**Maintained by:** Engineering Lead  
**Review frequency:** Weekly during active development
