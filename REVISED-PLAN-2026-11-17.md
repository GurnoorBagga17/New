# Axiom NHI - Revised Plan (Post-Review)

**Date:** 2026-11-17  
**Review Feedback From:** Technical Review  
**Status:** Accepted - replaces optimistic timelines with realistic gates

---

## Executive Summary of Changes

### Problems Identified and Fixed

1. ✅ **Task status inconsistencies** - T3 marked "in progress" while blockers not started
2. ✅ **Cedar vs OPA undocumented** - Policy language choice needs written ADR
3. ✅ **Unreliable completion percentages** - Need test-verified metrics
4. ✅ **Optimistic timeline** - 16-20 weeks unrealistic for security product
5. ✅ **Premature victory claims** - "Zero to 15% in one day" removed

### Priority Reordering (Critical Change)

**OLD Priority:** SPIRE → Enforcement → Discovery  
**NEW Priority:** Discovery → Risk Graph → SPIRE Spike → Enforcement

**Rationale:** Discovery is read-only, proves wedge immediately, no deployment burden.

---

## 1. Corrected Task Status

### Task Dependency Graph (Honest Status)

```
T12 (Source Verify) ✅ DONE
  │
  ├─→ T4 (GitHub) ⏳ READY TO START
  │     └─→ T7 (Blast Radius) ⏳ BLOCKED
  │           └─→ T8 (Risk Score) ⏳ BLOCKED
  │
  ├─→ T5 (AWS IAM) ⏳ READY TO START
  │     └─→ T7 (Blast Radius) ⏳ BLOCKED
  │
  └─→ T1 (SPIRE) ⏳ NOT STARTED
        ├─→ T2 (OpenBao) ⏳ BLOCKED
        │     └─→ T3 (Edge Proxy) ❌ INCORRECT STATUS - was "in progress"
        │           └─→ T11 (Failure Modes) ⏳ BLOCKED
        │
        └─→ T6 (Agent Delegation) ⏳ BLOCKED

T9 (Tenant Isolation) 🔄 TESTS CREATED, NOT IN CI
T10 (Remediation) ⏳ NOT STARTED (depends on T4, T5)
```

**Correction:** T3 is **NOT in progress**. Current gateway code has no SPIRE integration. It's a stub. Status changed to ⏳ **BLOCKED** on T1, T2.

---

## 2. ADR Required: Cedar vs OPA

**Decision Record Required This Week**

**File:** `docs/architecture/ADR-001-policy-language.md`

**Questions to answer:**

1. **Why Cedar over OPA/Rego?**
   - Performance characteristics?
   - AWS ecosystem integration?
   - Learning curve for customers?
   - Policy verification tools?

2. **What does this constrain?**
   - Can customers write policies?
   - Integration with third-party systems?
   - Migration path if we pivot?

3. **Trade-offs accepted:**
   - Cedar: Amazon-specific, newer, fewer examples
   - OPA: CNCF standard, mature, widespread adoption

**Blocker:** Policy language shapes:
- Customer-facing policy editor
- Integration with existing tools
- Hiring/skills (Rego vs Cedar expertise)

**Action:** Engineering lead writes ADR by Nov 19, team reviews Nov 20.

---

## 3. Test-Verified Completion Metrics

### New Metric System

**Formula:** `Completion = (Tasks with passing tests) / (Total tasks) × 100`

| Phase | Tasks | With Tests | Verified % | Self-Reported (old) |
|-------|-------|-----------|-----------|---------------------|
| Phase 0 | 5 | 0 | **0%** | 100% ❌ |
| Phase 1 | 10 | 1 | **10%** | 40% ❌ |
| Phase 2 | 10 | 0 | **0%** | 30% ❌ |
| Phase 3 | 20 | 0 | **0%** | 5% ❌ |
| Phase 4 | 20 | 0 | **0%** | 10% ❌ |

**Overall Completion:** **2%** (not 15%)

**What counts as "complete with test":**
- Code exists AND
- Test exists AND
- Test runs in CI AND
- Test passed on last commit

**Current:**
- T9 tenant isolation tests exist but not in CI → **0%**
- T12 source verification is documentation → **100%** (1/1)

### Ship-Blocking vs Nice-to-Have

| Category | Count | Tested | Ship-Blocker |
|----------|-------|--------|--------------|
| Security | 10 | 1 | Yes (95% untested) |
| Billing | 5 | 0 | No (can defer) |
| Discovery | 15 | 0 | Yes (core value) |
| Enforcement | 20 | 0 | Yes (core value) |
| Observability | 10 | 0 | Yes (audit trail) |

**Action:** Add `tested: true/false` column to IMPLEMENTATION-CHECKLIST.md

---

## 4. Realistic Timeline (24+ Weeks)

**OLD:** 16-20 weeks to launch  
**NEW:** 24-30 weeks to commercial launch

### Why the Change?

**Security product compliance overhead:**
- Security audit: 2-3 weeks (after feature-complete)
- Penetration testing: 2-3 weeks
- Remediation of findings: 2-4 weeks
- SOC 2 Type 1 prep: 4-6 weeks
- Legal review (DPA, privacy): 2-3 weeks

**Realistic build phases:**
- Discovery + Risk: 4-6 weeks (not 2)
- Enforcement spike: 2 weeks
- Full enforcement: 6-8 weeks
- Production hardening: 4-6 weeks
- Compliance: 6-8 weeks
- **Total: 24-30 weeks**

### Milestone Gates (Not Dates)

| Milestone | Exit Criteria | Estimated |
|-----------|--------------|-----------|
| **M1: Discovery Value** | GitHub + AWS discovery, 100 real identities graphed, design partner "aha" | Week 6 |
| **M2: SPIRE Decision** | T1 spike complete, operational burden documented, go/no-go decision | Week 8 |
| **M3: Risk Scoring** | 10 real findings, <10% false positives, design partner acts on output | Week 12 |
| **M4: Enforcement MVP** | 1 design partner deploys proxy, policy blocks 1 attack, audit trail complete | Week 18 |
| **M5: Beta** | 3 design partners in production, no P0/P1 bugs for 2 weeks | Week 24 |
| **M6: Launch** | Security audit passed, SOC 2 Type 1, legal sign-off | Week 30 |

**No date commitments until M1 passes.**

---

## 5. Removed: "Zero to 15% in One Day"

**Why removed:**
- Code generated, not reviewed
- Tests not run in CI
- Security gates not verified
- Premature to declare "foundation solid"

**Replaced with:** "Foundation scaffolded, verification begins now."

---

## 6. Priority Reordering (CRITICAL)

### NEW Critical Path

#### Week 1-2: Discovery First (Immediate Value)

**Goal:** Prove the governance wedge with read-only connectors

**Tasks:**
- T4: GitHub discovery (read-only OAuth app)
- T5: AWS IAM discovery (read-only role assumption)
- Database: Seed with 100+ real discovered identities
- Dashboard: Show inventory with metadata

**Acceptance:**
- Design partner installs GitHub app
- Discovers 50+ identities in their org
- Says "I didn't know we had that many service accounts"

**Why first:**
- No deployment burden (SaaS only)
- Read-only = low risk
- Immediate "aha" moment
- Validates product hypothesis

#### Week 3-4: Risk Graph (Prove the Wedge)

**Goal:** Show blast radius and risk scoring

**Tasks:**
- T7: Blast radius query on real data
- T8: Risk scoring v0 (OWASP NHI Top 10)
- Dashboard: Risk view with drill-down

**Acceptance:**
- Design partner sees "orphaned identity with admin access"
- Blast radius shows "can access 500 resources"
- Risk score ranks top 10 correctly

**Why second:**
- Proves governance value
- Validates closed-loop hypothesis
- Differentiates from pure discovery tools

#### Week 5-6: SPIRE Spike (Time-Boxed)

**Goal:** Answer: Is SPIRE viable for SMB customers?

**Tasks:**
- T1: Deploy SPIRE on kind cluster
- Document setup time (target: <2 hours)
- Document operational burden
- Measure SVID latency overhead

**Acceptance Criteria:**
- Setup takes <4 hours with documentation
- SVIDs rotate without operator intervention
- Latency overhead <5ms p99
- **OR:** Documented reasons to defer/avoid SPIRE

**Decision point:** Go/no-go on SPIRE for MVP

**Alternative if no-go:**
- Use cloud-native workload identity (AWS IAM roles, GCP workload identity)
- Add SPIRE in Phase 2 after PMF

#### Week 7-10: Enforcement (If SPIRE Viable)

**Tasks:**
- T2: SPIRE + OpenBao integration
- T3: Edge proxy MVP (intercept, attest, enforce)
- Policy: 5 example policies with tests
- Dashboard: Policy editor + audit log viewer

**Acceptance:**
- Design partner deploys sidecar proxy
- Policy blocks unauthorized tool access
- Audit log shows decision trail
- No production impact

#### Week 11-16: Production Hardening

**Tasks:**
- T10: Remediation with rollback
- T11: Failure mode tests
- Observability: Metrics, alerting, dashboards
- Performance: 10k identities, 1000 req/s

**Acceptance:**
- All ship-blockers resolved
- 3 design partners in production
- No P0/P1 bugs for 2 weeks

#### Week 17-24: Compliance Path

**Tasks:**
- Security audit (external firm)
- Penetration testing
- Remediate findings
- SOC 2 Type 1 readiness
- Legal/privacy review

**Acceptance:**
- Audit report with no critical findings
- Legal sign-off on DPA
- Executive go-live decision

### Billing Deferred

**OLD:** Phase 2 (weeks 5-7)  
**NEW:** After M1 (design partner validation)

**Rationale:**
- Stripe work before product value is premature
- Design partners can use invoice/PO initially
- Self-serve checkout needs working product first

**When to resume:**
- After 2-3 design partners say "I want to buy this"
- Before public launch
- Estimated: Week 12-14

---

## 7. Technical Fixes (This Week)

### Fix 1: RLS Tests as Non-Privileged User

**Problem:** Table owners and superusers bypass RLS

**Current test (WRONG):**
```sql
-- Running as 'axiom' (table owner)
SET LOCAL app.current_tenant_id = 'tenant-a';
SELECT * FROM integrations; -- RLS bypassed!
```

**Correct test:**
```sql
-- Create non-privileged test role
CREATE ROLE tenant_tester_a;
GRANT USAGE ON SCHEMA public TO tenant_tester_a;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO tenant_tester_a;

-- Run test as non-privileged user
SET ROLE tenant_tester_a;
SET LOCAL app.current_tenant_id = 'tenant-a';
SELECT * FROM integrations; -- RLS enforced!
```

**Action:**
- Update `tests/security/tenant-isolation.test.ts`
- Add non-privileged role creation
- Verify RLS blocks cross-tenant access

**File:** `tests/security/rls-verification.sql`

### Fix 2: Force RLS on Tenant Tables

**Add to all migrations:**
```sql
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE operators FORCE ROW LEVEL SECURITY;
ALTER TABLE integrations FORCE ROW LEVEL SECURITY;
-- etc
```

**Why:** `FORCE` applies RLS even to table owners and superusers.

**Action:** Update migrations/0001-0003.sql

### Fix 3: CI Integration for Security Tests

**Problem:** `node security/tenant-isolation.test.ts` won't run TypeScript

**Solution:** Use proper test runner

**File:** `.github/workflows/security-tests.yml`

```yaml
name: Security Tests

on: [push, pull_request]

jobs:
  tenant-isolation:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: axiom
          POSTGRES_PASSWORD: axiom_test_password
          POSTGRES_DB: axiom_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm install -g pnpm
      - run: pnpm install
      - name: Run migrations
        run: |
          psql postgresql://axiom:axiom_test_password@localhost/axiom_test < migrations/0001_tenants_and_operators.sql
          psql postgresql://axiom:axiom_test_password@localhost/axiom_test < migrations/0002_billing_and_entitlements.sql
          psql postgresql://axiom:axiom_test_password@localhost/axiom_test < migrations/0003_integrations_and_connectors.sql
      - name: Run security tests
        run: pnpm test tests/security/tenant-isolation.test.ts
        env:
          TEST_DATABASE_URL: postgresql://axiom:axiom_test_password@localhost/axiom_test
```

**Action:** Create this file, verify in CI

### Fix 4: Ship-Blocker Startup Checks

**File:** `apps/web/app/startup-checks.ts`

```typescript
// Call this at app startup
export function verifyProductionSafety() {
  const isProduction = 
    process.env.NODE_ENV === 'production' || 
    process.env.AXIOM_ENV === 'production';

  if (!isProduction) {
    console.warn('⚠️  Running in development mode');
    return; // Allow in dev
  }

  // SHIP-BLOCKER: Dev mode in production
  if (process.env.AXIOM_DEV_MODE === '1') {
    console.error('❌ AXIOM_DEV_MODE=1 is set in production');
    console.error('This enables anonymous authentication');
    process.exit(1);
  }

  // SHIP-BLOCKER: Anonymous auth in production
  if (process.env.AXIOM_ALLOW_ANONYMOUS_LOCAL === '1') {
    console.error('❌ AXIOM_ALLOW_ANONYMOUS_LOCAL=1 is set in production');
    console.error('This bypasses authentication');
    process.exit(1);
  }

  // SHIP-BLOCKER: Default admin token
  const token = process.env.AXIOM_ADMIN_TOKEN;
  if (!token || token.includes('dev') || token.includes('local')) {
    console.error('❌ AXIOM_ADMIN_TOKEN is missing or uses a dev/local default');
    console.error('Generate a secure token: openssl rand -hex 32');
    process.exit(1);
  }

  // SHIP-BLOCKER: Required secrets
  if (!process.env.SESSION_SECRET) {
    console.error('❌ SESSION_SECRET is required in production');
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is required in production');
    process.exit(1);
  }

  console.log('✅ Production safety checks passed');
}
```

**Call in:** `apps/web/app/layout.tsx` or server startup

**Action:** Add this, test with `NODE_ENV=production AXIOM_DEV_MODE=1 pnpm dev` (should exit)

### Fix 5: Audit Events Now (Not Later)

**Problem:** "Retrofit audit later is painful"

**Solution:** Add audit emission skeleton immediately

**File:** `apps/web/lib/audit.ts`

```typescript
export interface AuditEvent {
  tenant_id: string;
  event_type: string;
  actor: string; // user_id or 'system'
  resource_type?: string;
  resource_id?: string;
  metadata?: Record<string, any>;
  ip_address?: string;
  timestamp?: Date;
}

export async function emitAuditEvent(event: AuditEvent) {
  // TODO: Replace with proper async queue
  console.log('[AUDIT]', JSON.stringify({
    ...event,
    timestamp: event.timestamp || new Date(),
  }));

  // For now, write to database synchronously
  // In production, use a queue (Redis, SQS, etc.)
  try {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
    });

    await pool.query(
      `INSERT INTO audit_events (tenant_id, event_type, actor, resource_type, resource_id, metadata, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        event.tenant_id,
        event.event_type,
        event.actor,
        event.resource_type || null,
        event.resource_id || null,
        event.metadata ? JSON.stringify(event.metadata) : null,
        event.ip_address || null,
      ]
    );
  } catch (err) {
    console.error('Failed to emit audit event:', err);
    // Don't fail the request if audit fails
  }
}
```

**Use everywhere:**
```typescript
// In auth/login/route.ts
await emitAuditEvent({
  tenant_id: user.tenantId,
  event_type: 'auth.login.success',
  actor: user.userId,
  ip_address: req.headers.get('x-forwarded-for') || req.ip,
});

// In integrations/route.ts
await emitAuditEvent({
  tenant_id: session.tenantId,
  event_type: 'integration.created',
  actor: session.userId,
  resource_type: 'integration',
  resource_id: newIntegration.id,
  metadata: { provider: body.provider },
});
```

**Action:** Add audit calls to every mutation (auth, billing, integrations, policy)

### Fix 6: Secret Scanning in CI

**File:** `.github/workflows/security-scanning.yml`

```yaml
name: Security Scanning

on: [push, pull_request]

jobs:
  gitleaks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  dependency-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm install -g pnpm
      - run: pnpm install
      - run: pnpm audit --audit-level=high
      - name: Rust audit
        run: cargo audit
```

**Action:** Create this file, enable GitHub Actions

---

## 8. Updated Implementation Checklist

**File:** `IMPLEMENTATION-CHECKLIST-REVISED.md`

### Phase 0: Foundation (Week 0) ✅
- [x] Database migrations
- [x] Docker Compose setup
- [x] Environment configuration
- [ ] **Ship-blocker checks** (NEW)
- [ ] **CI security tests** (NEW)
- [ ] **RLS verification** (NEW)

**Completion:** 50% (3/6 verified)

### Phase 1: Discovery First (Week 1-6)

#### Sprint 1: GitHub Connector (Week 1-2)
- [ ] GitHub App manifest
- [ ] OAuth installation flow
- [ ] Repository/org/workflow discovery
- [ ] Normalize to inventory schema
- [ ] **Test:** Discover 50+ identities in test org
- [ ] **Test:** No write access granted

**Owner:** TBD  
**Deliverable:** `docs/findings/T4-github-connector.md`

#### Sprint 2: AWS IAM Connector (Week 3-4)
- [ ] CloudFormation template (read-only)
- [ ] Role assumption with external ID
- [ ] Enumerate IAM roles, users, keys
- [ ] Last used timestamps
- [ ] **Test:** Discover 100+ identities in test account
- [ ] **Test:** All API calls read-only

**Owner:** TBD  
**Deliverable:** `docs/findings/T5-aws-iam-connector.md`

#### Sprint 3: Dashboard + Graph (Week 5-6)
- [ ] Inventory table view
- [ ] Relationship graph visualization
- [ ] Blast radius query (T7)
- [ ] **Test:** Show reachable resources from compromised identity
- [ ] Design partner feedback session

**Owner:** TBD  
**Deliverable:** M1 milestone - design partner "aha"

### Phase 2: Risk Scoring (Week 7-8)

- [ ] OWASP NHI Top 10 scoring
- [ ] Risk dashboard
- [ ] False positive rate <10%
- [ ] **Test:** Rank seeded risky identities correctly

**Owner:** TBD  
**Deliverable:** `docs/findings/T8-risk-scoring.md`

### Phase 3: SPIRE Spike (Week 9-10)

- [ ] Deploy SPIRE on kind
- [ ] Attest 2 workloads
- [ ] Measure setup time (<4 hours target)
- [ ] Measure operational burden
- [ ] **Decision:** Go/no-go on SPIRE for MVP

**Owner:** TBD  
**Deliverable:** `docs/findings/T1-spire-setup.md` + ADR

### Phase 4: Enforcement (Week 11-16)

*Depends on Phase 3 go-decision*

### Phase 5: Production Hardening (Week 17-22)

### Phase 6: Compliance (Week 23-30)

---

## 9. This Week's Actions (Before Nov 24 Review)

### Must Complete

- [ ] Write ADR-001: Cedar vs OPA (owner: eng lead)
- [ ] Update completion metrics (tested vs self-reported)
- [ ] Add ship-blocker startup checks
- [ ] Add audit event emission to all mutations
- [ ] Fix RLS tests (non-privileged user)
- [ ] Create CI workflow for security tests
- [ ] Add gitleaks secret scanning to CI

### Must Decide

- [ ] Assign owners to T4, T5 (GitHub, AWS connectors)
- [ ] Schedule M1 design partner session (week 6 target)
- [ ] Approve priority reordering (discovery first)

### Must Communicate

- [ ] Update PROJECT-STATUS.md with realistic timeline
- [ ] Remove "zero to 15%" claims
- [ ] Add "scaffold complete, verification begins" language
- [ ] Document decision rationale for priority change

---

## 10. Success Metrics (Test-Verified)

| Metric | Target | Current | Gate |
|--------|--------|---------|------|
| Tasks with passing CI tests | 50% | 2% | M1 |
| Security tests in CI | 100% | 0% | This week |
| RLS tests with non-privileged user | Pass | Unknown | This week |
| Audit events emitted | 100% of mutations | 0% | This week |
| Ship-blocker checks | Fail in production | None | This week |
| Secret scanning | No leaks | Unknown | This week |
| Discovery connectors working | 2 (GitHub, AWS) | 0 | M1 |
| Design partner "aha" | 1 | 0 | M1 |

---

## 11. Honest Assessment

### What We Actually Have (Not Claims)

**Code scaffolded:** ~5,000 lines  
**Code reviewed:** ~0 lines  
**Tests passing in CI:** 0  
**Design partners:** 0  
**Product value delivered:** 0  

**Status:** Scaffolding phase complete, build phase begins now.

### What We Need (Minimum Viable)

**For M1 (Discovery Value):**
- 2 working connectors (GitHub, AWS)
- 100+ real identities discovered
- 1 design partner saying "I want this"
- Blast radius query working
- Risk scoring (even if simple)

**For Beta:**
- Everything above
- 1 working enforcement flow
- Audit trail complete
- 3 design partners in production
- No P0/P1 bugs for 2 weeks

**For Launch:**
- Everything above
- Security audit passed
- Penetration test passed
- SOC 2 Type 1 ready
- Legal/privacy sign-off

---

## 12. Questions for Engineering Lead

Before Nov 24 review, answer these:

1. **Do you accept the priority reordering?** (Discovery first vs enforcement first)
2. **Who owns T4 and T5?** (GitHub and AWS connectors)
3. **What's the Cedar vs OPA decision?** (Write ADR-001 this week)
4. **Do you accept 24-30 weeks to launch?** (Not 16-20)
5. **Can we get a design partner by week 6?** (For M1 validation)

---

**Document Owner:** Engineering Lead  
**Review Date:** 2026-11-24  
**Next Action:** Address technical fixes, assign T4/T5 owners, write ADR-001
