# Axiom NHI - Project Status Report

**Date:** 2026-11-17  
**Repository Status:** Development in progress  
**Overall Completion:** 15%  
**Production Ready:** No (estimated 16-20 weeks to launch)

---

## 🎯 Quick Status

### ✅ What's Complete

**Phase 0: Foundation (100%)**
- Docker Compose infrastructure setup
- PostgreSQL with RLS tenant isolation
- Database migrations (3 complete schemas)
- Environment configuration
- Development scripts (setup, start)
- Documentation framework

**Phase 1: Secure Identity (40%)**
- Session-based authentication
- CSRF protection middleware
- TOTP/MFA enrollment endpoints
- Password hashing (scrypt)
- Step-up verification framework

**Phase 2: Billing (30%)**
- Stripe checkout API
- Webhook signature verification
- Idempotent event processing
- Entitlement schema
- Billing audit trail

**Security (70%)**
- Mock fallback removed (critical fix)
- Tenant isolation test suite (20+ tests)
- RLS policies on all tables
- HMAC credential fingerprinting
- Zero-secret browser invariant

**Documentation (90%)**
- 7 major documents (15,000+ words)
- Engineering brief with 12 tasks
- Integration plan connecting strategy to code
- Source verification complete (T12)
- Getting started guides

### 🔄 In Progress

**Phase 1: Secure Identity (60% remaining)**
- [ ] WebAuthn enrollment
- [ ] Session revocation API
- [ ] Remove dev mode default credentials
- [ ] Production-ready MFA flow

**Phase 2: Billing (70% remaining)**
- [ ] Stripe account setup
- [ ] Webhook testing with Stripe CLI
- [ ] Entitlement enforcement in APIs
- [ ] Billing dashboard UI

**Engineering Tasks**
- [ ] T1: SPIRE setup on kind
- [ ] T9: CI integration for security tests
- [ ] Cedar vs OPA decision documentation

### ⏳ Not Started

**Phase 3: Integrations (95% remaining)**
- AWS IAM connector (OAuth/role assumption)
- GitHub App installation flow
- Job queue worker
- Discovery sync with cursors

**Phase 4: Runtime (90% remaining)**
- SPIRE workload identity (T1)
- OpenBao integration (T2)
- Edge proxy with SVID verification (T3)
- Policy signing (Ed25519)
- Enrollment API

**Phase 5: Hardening (0%)**
- Performance benchmarks
- Load testing
- Disaster recovery
- Observability dashboards

**Phase 6: Launch (0%)**
- Security audit
- Penetration testing
- Accessibility audit
- Legal/compliance

---

## 📊 Metrics Dashboard

### Code Stats

| Metric | Count | Target |
|--------|-------|--------|
| Total files created | 25+ | N/A |
| Lines of production code | ~5,000 | ~50,000 |
| Database tables | 15 | 25 |
| API endpoints | 12 | 30+ |
| Security tests | 20+ | 100+ |
| Documentation pages | 7 | 15 |

### Task Progress

| Phase | Tasks Complete | Tasks Remaining | % Done |
|-------|---------------|-----------------|--------|
| Phase 0 | 5/5 | 0 | 100% |
| Phase 1 | 4/10 | 6 | 40% |
| Phase 2 | 3/10 | 7 | 30% |
| Phase 3 | 1/20 | 19 | 5% |
| Phase 4 | 2/20 | 18 | 10% |
| Phase 5 | 0/15 | 15 | 0% |
| Phase 6 | 0/10 | 10 | 0% |

### Engineering Brief Tasks (12 Total)

| Task | Status | Owner | Blocker |
|------|--------|-------|---------|
| T1: SPIRE setup | ⏳ Not started | Needed | kind cluster setup |
| T2: SPIRE + OpenBao | ⏳ Blocked | Needed | T1 |
| T3: Edge proxy MVP | 🔄 In progress | Needed | T1, T2 |
| T4: GitHub connector | ⏳ Planned | Needed | Phase 3 start |
| T5: AWS IAM connector | ⏳ Planned | Needed | Phase 3 start |
| T6: Agent delegation | ⏳ Not started | Needed | T1, T2 |
| T7: Blast radius | ⏳ Not started | Needed | T4, T5 |
| T8: Risk scoring | ⏳ Not started | Needed | T7 |
| T9: Tenant isolation | 🔄 Tests created | Done | CI integration |
| T10: Remediation | ⏳ Not started | Needed | T4, T5 |
| T11: Failure modes | ⏳ Not started | Needed | T3 |
| T12: Source verify | ✅ **Complete** | Done | None |

---

## 🚀 What You Can Do Today

### Run the Application

```powershell
# Start development server
pnpm dev

# Visit http://localhost:3000
```

**What works:**
- Public landing pages
- Sign-in page (no backend yet)
- Playground
- Documentation pages

**What doesn't work yet:**
- Authentication (returns 401)
- Integrations (no real connectors)
- Billing (needs Stripe keys)
- MCP gateway (Rust backend not running)

### Run Tests

```powershell
# Unit tests
pnpm test

# Security tests (need setup)
cd tests
npm install
node security/tenant-isolation.test.ts
```

### Explore Code

Key directories to explore:

```
apps/web/              # Next.js web app (Phase 0-2)
├── app/api/          # API routes
│   ├── auth/         # Authentication ✅
│   ├── billing/      # Stripe integration ✅
│   └── integrations/ # Connector APIs 🔄

services/extmcp/      # Rust MCP runtime (Phase 4)
├── authorization/    # Policy evaluation
├── cedar/           # Policy language
└── runtime/         # Gateway runtime

connectors/src/       # Discovery connectors (Phase 3)
├── lib.rs           # Normalization ✅
├── discovery.rs     # AWS/GitHub/K8s stubs 🔄
└── enterprise.rs    # Additional connectors

migrations/           # Database schemas ✅
├── 0001_tenants_and_operators.sql
├── 0002_billing_and_entitlements.sql
└── 0003_integrations_and_connectors.sql

tests/security/       # Security test suite ✅
└── tenant-isolation.test.ts
```

---

## 🎯 Critical Path to MVP

### Week 1-2: SPIRE Foundation

**Goal:** Get workload identity running

- [ ] Install kind/k3d
- [ ] Deploy SPIRE (follow T1)
- [ ] Attest 2 workloads
- [ ] Observe SVID rotation
- [ ] Document pain points

**Deliverable:** `docs/findings/T1-spire-setup.md`

### Week 3-4: Policy Enforcement

**Goal:** Prove the wedge works

- [ ] Integrate SPIRE + OpenBao (T2)
- [ ] Build Edge proxy MVP (T3)
- [ ] Intercept → verify → decide → inject
- [ ] Measure latency overhead

**Deliverable:** `docs/findings/T3-edge-proxy.md`

### Week 5-8: Discovery + Risk

**Goal:** Show the full loop

- [ ] GitHub connector (T4)
- [ ] AWS IAM connector (T5)
- [ ] Blast radius query (T7)
- [ ] Risk scoring v0 (T8)
- [ ] Dashboard showing discovered risks

**Deliverable:** Working demo for design partners

### Week 9-16: Production Hardening

**Goal:** Make it reliable

- [ ] Job queue for connectors
- [ ] Signed policy distribution
- [ ] Enrollment API
- [ ] Failure mode tests (T11)
- [ ] Observability

**Deliverable:** Beta-quality product

---

## 📝 Document Hierarchy

### Start Here
1. **START-HERE.md** - Choose your path
2. **GETTING-STARTED.md** - Setup instructions
3. **PROJECT-STATUS.md** (this file) - Current state

### Strategy & Planning
4. **AXIOM_NHI_ENGINEERING_BRIEF.md** - Research and competitive analysis
5. **ENGINEERING-INTEGRATION-PLAN.md** - Task mapping
6. **AXIOM-CUSTOMER-JOURNEY-AND-SYSTEM-ARCHITECTURE.md** - Full architecture

### Implementation
7. **IMPLEMENTATION-CHECKLIST.md** - 150+ tracked tasks
8. **docs/architecture/IMPLEMENTATION-GAP-ANALYSIS.md** - Security review
9. **REVIEW-SUMMARY.md** - Comprehensive analysis

### Findings
10. **docs/findings/T*.md** - Engineering task results

---

## 🔍 Known Issues & Limitations

### Security
- ⚠️ Dev mode has anonymous auth fallback (requires 2 env flags)
- ⚠️ Default admin token in development (remove before production)
- ⚠️ No secret scanning in CI yet
- ⚠️ Audit events not emitted in request path

### Infrastructure
- ⚠️ No Kubernetes cluster setup
- ⚠️ No SPIRE deployment
- ⚠️ OpenBao not integrated with SPIRE
- ⚠️ No monitoring/alerting

### Features
- ⚠️ No real AWS/GitHub connectors
- ⚠️ No job queue worker
- ⚠️ No risk scoring implementation
- ⚠️ No remediation automation

### Testing
- ⚠️ Security tests not in CI
- ⚠️ No E2E tests for full flow
- ⚠️ No performance benchmarks
- ⚠️ No failure injection tests

---

## 🎓 Learning Resources

### For New Engineers

**Day 1:** Read these in order
1. START-HERE.md
2. Engineering Brief (focus on Section 1-2)
3. Architecture Doc (focus on Section 1-5)

**Day 2-3:** Set up environment
1. Follow GETTING-STARTED.md
2. Run `.\start.ps1 -Setup`
3. Explore the codebase

**Week 1:** Pick a task
1. Review IMPLEMENTATION-CHECKLIST.md
2. Choose from Phase 1 or 2 tasks
3. Create a finding document

### Key Concepts to Understand

**Workload Identity:**
- What: Cryptographic identity for services (not static credentials)
- Why: Eliminates long-lived secrets
- How: SPIFFE/SPIRE (or cloud-native equivalents)
- Read: https://spiffe.io/docs/latest/spiffe-about/overview/

**Tenant Isolation:**
- What: PostgreSQL Row-Level Security (RLS)
- Why: Prevent data leakage between customers
- How: `current_setting('app.current_tenant_id')`
- See: `migrations/0001_tenants_and_operators.sql`

**Two Planes:**
- **Enforcement:** Runtime access control (like Aembit)
- **Governance:** Discovery, inventory, risk (like Token/Clutch)
- **Our Wedge:** Both in one closed loop

---

## 🤝 Contributing

### Before Starting Work

1. Read the Engineering Brief
2. Check if a task exists in Implementation Checklist
3. If starting a Brief task (T1-T12), create a finding document
4. Update PROJECT-STATUS.md when task is complete

### Code Review Checklist

- [ ] Follows TypeScript/Rust style guidelines
- [ ] Includes tests for new features
- [ ] Updates relevant documentation
- [ ] No secrets in code or logs
- [ ] Tenant isolation verified
- [ ] Database queries use RLS

### Git Workflow

```bash
# Create feature branch
git checkout -b feat/t1-spire-setup

# Make changes with clear commits
git commit -m "feat(identity): add SPIRE deployment manifests"

# Update checklist
code IMPLEMENTATION-CHECKLIST.md

# Create PR with finding document
git add docs/findings/T1-spire-setup.md
```

---

## 📞 Support & Questions

### Documentation Issues
- Check START-HERE.md first
- Search GETTING-STARTED.md
- Review relevant finding documents

### Technical Questions
- Search Engineering Brief for strategic context
- Check Architecture Doc for design decisions
- Review Implementation Checklist for task details

### Bugs or Problems
- Check Known Issues section above
- Review PROJECT-STATUS.md for current limitations
- Create GitHub issue with reproduction steps

---

## 📅 Next Review Date

**Current:** 2026-11-17  
**Next Review:** 2026-11-24 (weekly during active development)

**Review Checklist:**
- [ ] Update completion percentages
- [ ] Mark completed tasks
- [ ] Add new blockers
- [ ] Update metrics
- [ ] Adjust timeline if needed

---

## 🎉 Celebrate Progress

**From Zero to 15% in One Day:**

What we built:
- 25+ production files
- 3 database migrations
- 7 comprehensive documents
- Security test suite
- Billing integration
- Development infrastructure

**That's significant progress!** The foundation is solid. Now we execute on the roadmap.

**Next milestone:** 25% (Phase 1 complete)  
**Target date:** 2026-12-01 (2 weeks)

---

**Maintained by:** Engineering Team  
**Document Owner:** Engineering Lead  
**Last Updated:** 2026-11-17
