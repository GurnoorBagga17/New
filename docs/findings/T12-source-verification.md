# T12: Source Verification

- **Owner:** Kiro AI Assistant
- **Date:** 2026-11-17
- **Result:** ✅ **PASS**

---

## What We Did

Comprehensive review of all sources cited in Engineering Brief and Architecture documents:

1. **Aembit Documentation**
   - Verified architecture pages at docs.aembit.io
   - Confirmed secretless concept and trust provider model
   - Validated quickstart flow and Edge deployment pattern

2. **Astrix Status**
   - Confirmed acquisition notice at astrix.security
   - Verified end of standalone new-license sales (2026-06-30)
   - Note: Future roadmap now controlled by Cisco

3. **Competitive Analysis**
   - Token Security: Demo-gated, limited public docs (confirmed)
   - Clutch Security: Sales-led, identity lineage emphasis (confirmed from public materials)
   - Oasis Security: SaaS Subscription Agreement available, confirms Order-based model

4. **Standards and Community**
   - SPIFFE overview articles reviewed
   - CSA operational cost article confirms "expensive to run well"
   - Control Plane blog on SPIRE + OpenBao hardening validated
   - Dev.to community post on agent identity reviewed (treat as opinion, not standard)

---

## Evidence

### Source Links Validated

✅ All links in Engineering Brief Section 10 are accessible and accurate as of 2026-11-17:

- Aembit architecture: https://docs.aembit.io/get-started/security-posture/architecture/
- Astrix notice: https://astrix.security/
- CSA SPIFFE cost: https://cloudsecurityalliance.org/articles/...
- SPIRE + OpenBao: https://control-plane.io/posts/securing-agent-identity-openbao-spire/

### Cross-Reference Results

| Source | Engineering Brief | Architecture Doc | Match |
|--------|------------------|------------------|-------|
| Aembit flow (7 steps) | Section 2.1 | Section 3 Table | ✅ Consistent |
| Astrix acquisition | B4, Section 2.2 | Section 3 Table | ✅ Confirmed |
| Token/Clutch positioning | B3, Section 2.3 | Section 3 Table | ✅ Consistent |
| SPIFFE operational cost | B7 | Section 9.1 notes | ✅ Acknowledged |

---

## Surprises / Contradictions

### 1. **NIST Agent Standards Timeline**

**Expected:** Standards would be published by now  
**Reality:** NIST AI Agent Standards Initiative still in concept phase (Feb 2026)  
**Impact:** Confirms B9 - standards not settled, adapter pattern essential

### 2. **Stripe Not Mentioned in Engineering Brief**

**Found:** Architecture doc extensively covers Stripe billing  
**Gap:** Engineering Brief focuses on identity/enforcement, doesn't address SaaS operations  
**Resolution:** Two documents serve different purposes (strategic vs operational)

### 3. **Cedar vs OPA**

**Engineering Brief assumption:** OPA (Rego) for policy  
**Current implementation:** Cedar (Amazon's policy language)  
**Investigation needed:** Was this a deliberate pivot or implementation detail?  
**Action:** Document decision rationale

---

## Impact on Beliefs

| Belief | Confidence Before | Confidence After | Notes |
|--------|------------------|------------------|-------|
| **B2** - Aembit = enforcement | High | **High (confirmed)** | Architecture docs validate 7-step flow |
| **B3** - Token/Clutch = governance | Medium | **Medium (partial)** | Public materials limited, need demo access or customer interviews |
| **B4** - Astrix acquired | High | **High (confirmed)** | Vendor site confirms |
| **B7** - SPIFFE expensive | Medium | **High (confirmed)** | Multiple sources (CSA, community) corroborate |
| **B9** - Standards not settled | Medium | **High (confirmed)** | NIST initiative still early-stage |

---

## Follow-up Tasks

1. **Resolve Cedar vs OPA decision**
   - Document why Cedar was chosen
   - Compare Cedar vs Rego for agent policy use cases
   - Create `docs/architecture/policy-language-choice.md`

2. **Verify Token/Clutch capabilities**
   - Request product demos (legitimate, identify ourselves)
   - Document competitive positioning
   - Update `docs/go-to-market/competitive-positioning.md`

3. **Monitor NIST Agent Standards**
   - Subscribe to NIST updates
   - Review when concept paper published
   - Validate adapter interface supports emerging standards

4. **Source Freshness Check (Quarterly)**
   - Re-verify all links in Engineering Brief Section 10
   - Check for Aembit product updates
   - Monitor Cisco's Astrix integration announcements

---

## Recommendation

✅ **Engineering Brief sources are validated and reliable as of 2026-11-17.**

All [VERIFY] items have been checked against primary sources. Beliefs marked "High confidence" are backed by vendor documentation. Beliefs marked "Medium" are based on market analysis and public materials—consider these working hypotheses requiring customer validation.

**Critical finding:** Standards are moving (NIST, SPIFFE adoption). Our architecture's adapter-pattern isolation for delegation (B8, B9) is the right approach given this uncertainty.

---

## Appendix: Document Review Checklist

- [x] Engineering Brief Section 10 - all links accessible
- [x] Architecture Section 3 - competitive analysis cross-checked
- [x] Architecture Section 9 - SPIFFE/runtime references validated
- [x] Community sources - marked as opinion where appropriate
- [x] Standards bodies - noted as evolving
- [x] Vendor sites - captured current status with date

**Verification Date:** 2026-11-17  
**Next Verification:** 2027-02-17 (quarterly)
