# Axiom NHI - Engineering Integration Plan

**Purpose:** Connect the Engineering Brief research findings with the implemented architecture and current codebase  
**Date:** 2026-11-17  
**Status:** Active development roadmap

---

## Executive Summary

This document bridges three key artifacts:
1. **Engineering Brief** (`AXIOM_NHI_ENGINEERING_BRIEF.md`) - Strategic research and competitive analysis
2. **Architecture Blueprint** (`AXIOM-CUSTOMER-JOURNEY-AND-SYSTEM-ARCHITECTURE.md`) - SaaS product design
3. **Current Implementation** - 15% complete (Phase 0-1)

---

## 1. Belief Validation Status

Mapping Engineering Brief beliefs to implementation work:

| Belief | Status | Implementation Evidence | Next Action |
|--------|--------|------------------------|-------------|
| **B1** - Two planes (enforcement + governance) | ✅ Validated | Architecture doc Section 4 confirms split | Reflected in repo structure |
| **B2** - Aembit = enforcement | ✅ Confirmed | Cited in architecture competitive analysis | Task T3 (Edge proxy) planned |
| **B3** - Token/Clutch = governance | 🔄 Verify needed | Mentioned in architecture Section 3 | Task T12 - source verification |
| **B4** - Astrix acquired | ✅ Confirmed | Architecture Section 3 links to notice | No action needed |
| **B5** - Market compression | ⏳ Assumption | Reflected in architecture wedge strategy | Monitor analyst reports |
| **B6** - Closed loop defensible | 🔬 Testing | Architecture Section 5 proposes this | Tasks T3-T10 will prove it |
| **B7** - SPIFFE right but expensive | ⏳ Needs prototype | Not yet implemented | **Task T1 - PRIORITY** |
| **B8** - Two-layer identity | ⏳ Needs prototype | Architecture Section 9.2 mentions delegation | **Task T6 - PRIORITY** |
| **B9** - Standards not settled | ✅ Noted | Architecture isolates behind adapter pattern | Interface design needed |

---

## 2. Component Mapping

Engineering Brief Section 3.1 components mapped to current codebase:

### 2.1 Implemented Components

| Component | Brief Section | Current Location | Completion |
|-----------|--------------|------------------|------------|
| **Connectors (structure)** | 3.1 | `connectors/src/` | 30% - Normalization done, AWS/GitHub stubs |
| **Identity graph store** | 3.1 | `migrations/0003_integrations_and_connectors.sql` | 40% - Schema exists, no graph queries |
| **Risk engine** | 3.1 | `risk-engine/` (stub) | 5% - Directory exists, no scoring |
| **Policy engine** | 3.1 | `services/extmcp/` | 60% - Cedar (not OPA), policy loading exists |
| **Audit log** | 3.1 | `observability/audit/` | 20% - Schema exists, no emission |
| **Control plane API** | Architecture | `apps/web/app/api/` | 40% - Auth, billing, integrations |
| **Database (multi-tenant)** | Architecture | `migrations/*.sql` | 70% - Schema with RLS policies |

### 2.2 Not Yet Implemented

| Component | Brief Section | Priority | Blocking Task |
|-----------|--------------|----------|---------------|
| **Workload identity (SPIFFE)** | 3.1, B7 | 🔴 HIGH | Task T1 |
| **Credential broker** | 3.1 | 🔴 HIGH | Task T2 (OpenBao integration) |
| **Edge proxy** | 3.1 | 🔴 HIGH | Task T3 |
| **Graph queries (blast radius)** | 3.1 | 🟡 MEDIUM | Task T7 |
| **Risk scoring** | 3.1 | 🟡 MEDIUM | Task T8 |
| **Remediation with rollback** | 3.1 | 🟢 LOW | Task T10 |

---

## 3. Security Requirements Compliance

Engineering Brief Section 4 requirements vs. current implementation:

| Requirement | Status | Implementation | Gap |
|-------------|--------|----------------|-----|
| **1. Least-privilege read-only** | 🟡 Partial | `connectors/src/lib.rs` has fingerprinting | Need to document exact scopes per connector |
| **2. No long-lived credentials** | 🟡 Partial | Architecture doc specifies this | Need SPIFFE/OpenBao implementation (T1, T2) |
| **3. Tenant isolation tested** | ✅ Done | `tests/security/tenant-isolation.test.ts` created | Task T9 - need CI integration |
| **4. Opt-in reversible remediation** | ❌ Not implemented | Not started | Task T10 |
| **5. Safe degradation** | ❌ Not documented | Not specified | Task T11 - failure mode tests |
| **6. Tamper-evident audit** | 🟡 Partial | `migrations/0002_billing_and_entitlements.sql` has audit schema | Need append-only verification |
| **7. No secrets in logs** | ⚠️ Unknown | No automated checks | Add linter/CI check |

---

## 4. Task Integration Roadmap

Engineering Brief Section 7 tasks mapped to Implementation Checklist phases:

### Phase 1: Foundation & Verification (Weeks 1-4)

**Tasks from Engineering Brief:**

- **T12** - Source verification ✅ **DONE**
  - Status: Completed in architecture review
  - Finding: `REVIEW-SUMMARY.md` validates all sources
  - Next: Keep sources.md updated

- **T9** - Tenant isolation tests ✅ **CREATED**
  - Status: Test suite created, needs CI
  - Location: `tests/security/tenant-isolation.test.ts`
  - Next: Add to GitHub Actions workflow

**Tasks from Implementation Checklist:**

- ✅ Phase 0 complete (database migrations, Docker setup)
- 🔄 Phase 1 in progress (MFA, CSRF protection)

### Phase 2: Identity & Policy Prototypes (Weeks 5-8)

**Engineering Brief Tasks:**

- **T1** - SPIRE on kind 🔴 **PRIORITY**
  - Status: Not started
  - Owner: Needed
  - Deliverable: `docs/findings/T1-spire-setup.md`
  - Acceptance: Two workloads get distinct SVIDs, rotation observed

- **T2** - SPIRE + OpenBao 🔴 **PRIORITY**
  - Status: Not started
  - Dependencies: T1 complete
  - Deliverable: `docs/findings/T2-spire-openbao.md`
  - Acceptance: Signing operations in OpenBao audit log

- **T3** - Edge proxy MVP 🔴 **PRIORITY**
  - Status: Gateway crate exists, needs SPIFFE integration
  - Location: `gateway/`, `services/extmcp/`
  - Dependencies: T1, T2
  - Deliverable: `docs/findings/T3-edge-proxy.md`

**Implementation Checklist Tasks:**

- Complete Phase 1 (Secure Identity)
- Begin Phase 4 (Runtime Deployment)

### Phase 3: Discovery & Graph (Weeks 9-12)

**Engineering Brief Tasks:**

- **T4** - GitHub discovery connector
  - Status: Normalization exists, needs OAuth flow
  - Location: `connectors/src/discovery.rs`
  - Dependencies: Phase 3 (Real Integrations) from checklist
  - Deliverable: `docs/findings/T4-github-connector.md`

- **T5** - Cloud IAM discovery
  - Status: AWS IAM normalizer exists
  - Location: `connectors/src/discovery.rs`
  - Dependencies: Phase 3 (Real Integrations)
  - Deliverable: `docs/findings/T5-aws-iam-connector.md`

- **T7** - Blast radius query
  - Status: Schema exists, no graph implementation
  - Location: `lineage-graph/`
  - Dependencies: T4, T5 complete
  - Deliverable: `docs/findings/T7-blast-radius.md`
  - Acceptance: Compromised identity returns correct reachable resources

- **T8** - Risk scoring v0
  - Status: Not started
  - Location: `risk-engine/`
  - Dependencies: T7
  - Deliverable: `docs/findings/T8-risk-scoring.md`
  - Acceptance: Seeded risky identities ranked correctly

**Implementation Checklist Tasks:**

- Phase 3 (Real Integrations) - AWS IAM + GitHub

### Phase 4: Advanced Features (Weeks 13-16)

**Engineering Brief Tasks:**

- **T6** - Agent delegation prototype
  - Status: Not started
  - Location: `identity/` (new delegation module)
  - Dependencies: T1, T2
  - Deliverable: `docs/findings/T6-agent-delegation.md`
  - Acceptance: Scenario S-F passes (agent chain preserved in logs)

- **T10** - Remediation with rollback
  - Status: Not started
  - Location: TBD (new remediation module)
  - Dependencies: T4, T5
  - Deliverable: `docs/findings/T10-remediation.md`
  - Acceptance: Action executes, rollback restores state

- **T11** - Failure mode tests
  - Status: Not started
  - Location: `tests/failure/`
  - Dependencies: T3
  - Deliverable: `docs/findings/T11-failure-modes.md`
  - Acceptance: Scenario S-G passes (outage behavior matches policy)

**Implementation Checklist Tasks:**

- Phase 4 (Runtime Deployment)
- Phase 5 (Production Hardening)

---

## 5. Lab Environment Setup

Engineering Brief Section 5 requirements:

### Current Setup ✅

- [x] Docker Compose with PostgreSQL, Redis, OpenBao
- [x] Next.js development environment
- [x] Rust workspace builds
- [x] Test databases

### Missing for Lab ❌

- [ ] kind or k3d Kubernetes cluster
- [ ] SPIRE deployment
- [ ] OpenBao integrated with SPIRE
- [ ] OPA policy engine
- [ ] Wazuh for audit log monitoring
- [ ] Test GitHub org with dummy credentials
- [ ] Isolated cloud account (AWS/GCP/Azure)

### Setup Script Needed

Create `scripts/setup-lab.ps1`:

```powershell
# Install kind
scoop install kind

# Create cluster
kind create cluster --name axiom-lab

# Deploy SPIRE
kubectl apply -f deployments/kubernetes/spire/

# Deploy OpenBao
helm install openbao deployments/helm/openbao/

# Deploy OPA
kubectl apply -f deployments/kubernetes/opa/

# Seed test data
python tests/seed-test-data.py
```

---

## 6. Threat Scenarios Implementation

Engineering Brief Section 6 scenarios mapped to test suite:

| Scenario | Location | Status | Dependencies |
|----------|----------|--------|--------------|
| **S-A** Orphaned identity | `tests/scenarios/S-A-orphaned-identity.test.ts` | ❌ Not created | T4, T5 |
| **S-B** Overprivileged account | `tests/scenarios/S-B-overprivileged.test.ts` | ❌ Not created | T5, T8 |
| **S-C** API key in repo | `tests/scenarios/S-C-leaked-key.test.ts` | ❌ Not created | T4 |
| **S-D** Agent excess tools | `tests/scenarios/S-D-tool-access.test.ts` | ❌ Not created | T3 |
| **S-E** Anomalous access | `tests/scenarios/S-E-anomaly.test.ts` | ❌ Not created | T8 |
| **S-F** Agent delegation chain | `tests/scenarios/S-F-delegation.test.ts` | ❌ Not created | T6 |
| **S-G** Credential outage | `tests/scenarios/S-G-outage.test.ts` | ❌ Not created | T11 |

**Action:** Create `tests/scenarios/` directory with test stubs for each scenario.

---

## 7. Open Questions Resolution

Engineering Brief Section 8 questions with current answers:

### Q1: Which three discovery sources first?

**Answer from Architecture:** AWS IAM, GitHub, Kubernetes

**Rationale:**
- AWS IAM: Broadest enterprise coverage
- GitHub: Developer workflow visibility
- Kubernetes: Cloud-native workload identity

**Implementation Checklist:** Phase 3 focuses on AWS + GitHub

### Q2: SPIFFE in MVP or defer?

**Architecture Decision:** Include SPIFFE in Phase 4 (Runtime)

**Trade-off:**
- **Pro:** Standards-based, interoperable, no stored credentials
- **Con:** Operational complexity (CSA article confirms)
- **MVP Path:** Start with cloud-native workload identity (AWS IAM roles, GCP workload identity), add SPIFFE Layer in Phase 4

**Action:** Update architecture to clarify cloud-native → SPIFFE migration path

### Q3: Sidecar, node agent, or SDK?

**Architecture Decision:** Customer-deployed Gateway (sidecar pattern)

**From Architecture Section 9:**
- Gateway runs in customer VPC/Kubernetes
- Outbound mTLS to control plane
- Signed policy distribution

**Trade-off Analysis Needed:** Document in `docs/findings/deployment-patterns.md`

### Q4: Minimum viable risk score?

**Proposal:** OWASP NHI Top 10 + MCP Top 10

**From Main README:**
- `risk-engine/` references OWASP NHI Top 10 (NHI1-NHI10)
- MCP Top 10 (MCP01-MCP10)

**Action:** Task T8 will define scoring model

### Q5: Fail-open or fail-closed default?

**Architecture Decision:** Customer-configurable per policy

**From Architecture Section 9.2:**
> "Runtime invariants: Enforce mode must never forward on [...] failure. Observe mode [...] cannot be mistaken for enforcement."

**Modes:**
- **Observe**: Fail-open, log decisions
- **Enforce**: Fail-closed on policy/revocation/identity failure

**Action:** Document in policy schema

### Q6: Open source strategy?

**From Main README:**
> License Boundary: Apache-2.0 Open-Core Community Runtime + Enterprise Control Plane

**Open Source (Apache 2.0):**
- Gateway
- Runtime (ExtMCP)
- Validators
- Identity verification
- UI packages

**Enterprise (Commercial):**
- Connectors
- Lineage graph
- Risk engine
- Control plane SaaS

**Action:** Add LICENSE files to each module

### Q7: Buyer persona and GTM?

**Architecture Decision:** Start with invite-only design partners

**From Architecture Section 6.1:**
> "Recommend starting with sales-assisted design-partner program rather than public self-serve"

**Buyer:** Security teams at companies with 500+ employees, autonomous AI systems

**Action:** Create `docs/go-to-market/buyer-personas.md`

### Q8: Durable moat?

**Architecture Answer:** Closed-loop enforcement + governance

**From Engineering Brief:**
> "Enforcement vendors see little posture. Governance vendors enforce little. Axiom's wedge is connecting the two."

**Moat Elements:**
1. Real-time enforcement prevents breaches
2. Governance discovers and scores risk
3. Automated remediation closes the loop
4. Standards-based interoperability (SPIFFE)

---

## 8. Immediate Next Steps (This Week)

### Day 1-2: Lab Setup
- [ ] Install kind/k3d
- [ ] Deploy SPIRE (Task T1)
- [ ] Create test GitHub org
- [ ] Seed dummy credentials

### Day 3-4: SPIFFE Prototype
- [ ] Complete Task T1 (SPIRE workload identity)
- [ ] Document setup time and pain points
- [ ] Create `docs/findings/T1-spire-setup.md`

### Day 5: Integration
- [ ] Begin Task T2 (SPIRE + OpenBao)
- [ ] Update integration checklist with findings
- [ ] Create GitHub Actions workflow for T9 (tenant isolation)

---

## 9. Success Metrics

Track these to validate beliefs and measure progress:

| Metric | Target | Current | Validates |
|--------|--------|---------|-----------|
| SPIRE setup time | < 4 hours | Unknown | B7 |
| Tenant isolation test pass rate | 100% | 0% (not in CI) | Sec. Req. 3 |
| Discovery connector coverage | 3 sources | 0 (stubs only) | B6 |
| Edge proxy latency overhead | < 10ms p99 | Unknown | B6 |
| Risk scoring false positive rate | < 10% | Unknown | B6 |
| Time to first "aha" for design partner | < 1 hour | Unknown | Q1, Q7 |

---

## 10. Findings Directory Structure

Create this structure:

```
docs/
├── findings/
│   ├── T1-spire-setup.md
│   ├── T2-spire-openbao.md
│   ├── T3-edge-proxy.md
│   ├── T4-github-connector.md
│   ├── T5-aws-iam-connector.md
│   ├── T6-agent-delegation.md
│   ├── T7-blast-radius.md
│   ├── T8-risk-scoring.md
│   ├── T9-tenant-isolation.md
│   ├── T10-remediation.md
│   ├── T11-failure-modes.md
│   └── T12-source-verification.md ✅ (REVIEW-SUMMARY.md)
├── go-to-market/
│   ├── buyer-personas.md
│   └── competitive-positioning.md
└── architecture/
    ├── deployment-patterns.md
    └── open-source-strategy.md
```

---

## 11. Cross-Reference Matrix

Quick lookup: where to find information

| Topic | Engineering Brief | Architecture Doc | Implementation | Tests |
|-------|------------------|------------------|----------------|-------|
| Competitive analysis | Section 2 | Section 3 | N/A | N/A |
| Two planes concept | B1, Section 3 | Section 4 | Repo structure | N/A |
| SPIFFE/SPIRE | B7, T1, T2 | Section 9.1 | Not implemented | T1 finding |
| Tenant isolation | Sec. Req. 3 | Section 8.3, 11 | `migrations/*.sql` | `tests/security/` |
| Billing | N/A | Section 6.3, 10 | `apps/web/app/api/billing/` | Not tested |
| Discovery connectors | Section 3.1 | Section 7 | `connectors/src/` | T4, T5 |
| Risk scoring | Section 3.1 | Section 7.5 | `risk-engine/` (stub) | T8 |
| Edge proxy | Section 3.1 | Section 9.2 | `gateway/`, `services/extmcp/` | T3 |
| Remediation | Section 3.1 | Section 7 | Not implemented | T10 |

---

## 12. Sync Cadence

To keep Engineering Brief and Implementation aligned:

- **Weekly:** Review task progress, update findings
- **Bi-weekly:** Validate beliefs against findings, update confidence levels
- **Monthly:** Sync architecture doc with proven findings
- **Quarterly:** Review open questions, adjust product roadmap

**Next sync:** 2026-11-24 (1 week)

---

## Appendix: Quick Commands

```powershell
# Check current status
git status
pnpm dev

# Run specific task
.\scripts\task-t1-spire.ps1    # Task T1
.\scripts\task-t9-isolation.ps1  # Task T9

# View findings
code docs/findings/

# Update this document
code ENGINEERING-INTEGRATION-PLAN.md
```

---

**Document Owner:** Engineering Lead  
**Last Updated:** 2026-11-17  
**Next Review:** 2026-11-24
