# Axiom NHI: Engineering Brief (Verify, Challenge, Build)

**Status:** Draft v0.1, 2026-11-17
**Audience:** Axiom engineers
**Purpose:** Turn competitor and standards research into verifiable engineering work. Treat everything here as a hypothesis until a task below confirms or kills it.

> **How to use this document**
> 1. Read Section 1 (what we believe and how confident we are).
> 2. Pick tasks from Section 7. Each has an acceptance criterion.
> 3. Anything marked **[VERIFY]** must be checked against primary sources before we rely on it.
> 4. Anything marked **[ASSUMPTION]** is a product bet. Challenge it with evidence, not opinion.
> 5. Record findings in `docs/findings/` using the template in Section 9.

---

## 1. Summary of beliefs

| # | Belief | Confidence | How to verify |
|---|--------|-----------|---------------|
| B1 | NHI security splits into two planes: **enforcement** (runtime access) and **governance** (discovery, posture, remediation). | High | Compare vendor docs (Section 2) |
| B2 | Aembit is primarily an enforcement-plane product (identity attestation, policy, short-lived credential injection). | High | Read docs.aembit.io architecture pages |
| B3 | Astrix, Token Security and Clutch Security are primarily governance-plane products. | Medium **[VERIFY]** | Product pages, demos, public docs |
| B4 | Astrix was acquired by Cisco and ended standalone new-license sales on 2026-06-30. | High (vendor site confirms) | astrix.security banner |
| B5 | Standalone NHI-inventory-only products face market compression as platform vendors absorb the category. | Medium **[ASSUMPTION]** (analyst opinion) | Customer interviews, win/loss data |
| B6 | A closed loop (discover → attribute → score → enforce → verify → remediate) in one product is a defensible wedge. | Unproven **[ASSUMPTION]** | MVP + design-partner feedback |
| B7 | SPIFFE/SPIRE is the right workload-identity foundation, but operationally expensive to run well. | Medium **[VERIFY]** | Prototype in Section 7 (T1) |
| B8 | Agent identity needs two layers: *what is this agent* (workload identity) and *acting for whom* (delegation, e.g. OAuth token exchange). | Medium **[VERIFY]** | Prototype in Section 7 (T6) |
| B9 | Agent identity standards are not settled (NIST AI Agent Standards Initiative, Feb 2026). We must isolate this behind an adapter. | Medium **[VERIFY]** | Read NIST concept paper |

---

## 2. Competitive landscape: what to extract from each

### 2.1 Aembit (enforcement plane)
Reported flow (verify against official docs):
1. Workload makes an outbound request.
2. Edge component intercepts the request.
3. Edge validates workload identity from runtime evidence (e.g. Kubernetes service account, cloud IAM role, GitHub Actions OIDC).
4. Cloud control plane evaluates the access policy (identity, posture, time, location).
5. Control plane obtains a short-lived credential from a Credential Provider.
6. Edge injects the credential into the request and forwards it.
7. Access event is logged.

**Design principles worth copying:**
- Separation of duties: identity verification (Trust Provider), policy decision (control plane) and credential issuance (Credential Provider) are separate components.
- Network location is never sufficient proof of identity.
- Secretless by default: the workload never holds a long-lived credential.

**Known weak points to exploit [VERIFY]:**
- Risk prioritization relies mostly on policy enforcement, not deep posture scoring.
- Edge/proxy deployment is required for many runtime patterns.
- Availability of credential issuance directly affects app availability (HA is a hard requirement for us too).

### 2.2 Astrix Security (governance plane, now Cisco)
- Discovery, inventory and risk scoring of NHIs across SaaS, cloud and AI platforms.
- Strong on over-permissioned or stale credentials and risky third-party OAuth grants. Extended to AI agent and MCP-style connections.
- Now being integrated into Cisco products. Standalone new licenses ended 2026-06-30.

### 2.3 Token Security / Clutch Security (governance plane)
- Both are sales-led and demo-gated. We cannot assume self-serve trial access.
- Clutch emphasizes **identity lineage**: the relationships between identity, secret, workload, owner and resource.
- Action: collect public docs and demo material only. Do not scrape or misrepresent ourselves to get access.

### 2.4 Competitive gap hypothesis **[ASSUMPTION]**
Enforcement vendors see little posture. Governance vendors enforce little. Axiom's wedge is connecting the two in one loop.

---

## 3. Target architecture (proposal, challenge it)

```
 Sources               Discovery            Risk Graph            Policy/Enforcement        Evidence
 -------               ---------            ----------            ------------------        --------
 GitHub / CI     --->  Connectors     --->  identity--secret--    Policy engine (OPA?)  --> Audit log
 Cloud IAM             (read-only)          workload--resource    Credential broker         Remediation
 Kubernetes                                 owner, blast radius   Edge/sidecar proxy        proof + rollback
 AI agents / MCP                                                  Workload identity
                                                                  (SPIFFE/SPIRE)
```

### 3.1 Components

| Component | Responsibility | Candidate tech | Open question |
|-----------|---------------|----------------|---------------|
| Connectors | Read-only discovery of identities, secrets, grants | Per-source SDKs | Which 3 sources first? |
| Identity graph store | Model identity→secret→workload→resource, owners, lineage | Postgres + graph layer, or a graph DB | Is a graph DB necessary at MVP scale? |
| Risk engine | Score permissions, staleness, exposure, blast radius | Rules first, ML later | What is the minimum useful scoring model? |
| Policy engine | Authorization decisions | OPA (Rego) | Policy language exposed to customers? |
| Workload identity | Attested, short-lived identity for workloads and agents | SPIFFE/SPIRE | Operational burden for SMB customers? |
| Credential broker | Issue short-lived credentials per request | OpenBao/Vault, cloud STS | Which credential providers at MVP? |
| Edge proxy | Intercept, attest, inject | Envoy or custom lightweight proxy | Sidecar vs node agent vs SDK? |
| Audit and evidence | Immutable access and remediation log | Append-only store, SIEM export | Retention and tamper evidence? |
| Remediation | Rotate, revoke, reassign owner, with rollback | Per-connector actions | Which actions are safe to automate? |

### 3.2 Agent identity (two-layer model) **[VERIFY]**
- **Layer 1: what is this agent.** Workload identity (SPIFFE ID / SVID) issued from attestation, not from a stored secret.
- **Layer 2: acting for whom.** Delegation via OAuth token exchange (RFC 8693) or equivalent, so audit logs show the human principal and the full agent chain, not just the last hop.
- **Risk to design against:** a chain of agents each impersonating the user makes logs show one human doing everything.
- **Isolation requirement:** keep the delegation mechanism behind an interface. Standards are still moving (NIST initiative; competing proposals).

---

## 4. Security requirements (non-negotiable)

1. Discovery connectors request **least-privilege, read-only** scopes. Document the exact scopes per connector.
2. No long-lived credentials stored by Axiom where an attested short-lived alternative exists.
3. Tenant isolation is tested, not assumed (see T9).
4. Remediation actions are **opt-in, reversible and logged**. Default is recommend-only.
5. The control plane and credential broker must degrade safely. Define fail-open vs fail-closed per policy and document it (credential issuance outages break customer apps).
6. All audit events are tamper-evident and exportable to a SIEM.
7. Secrets in logs, traces and error messages are a release blocker. Add automated checks.

---

## 5. Lab environment (for verification work)

Laptop-friendly (16 GB RAM). Do not run everything at once.

| Layer | Choice | Notes |
|-------|--------|-------|
| Cluster | kind or k3d | Single node is enough |
| Workload identity | SPIRE | One trust domain per environment. Do not share signing material across them |
| Secrets/PKI | OpenBao (open-source Vault fork) | Integrate as SPIRE upstream authority; check audit entries |
| Policy | OPA | Start with 3 to 5 Rego policies |
| Monitoring | Wazuh | Ingest audit logs, test anomaly detection |
| Test data | Dummy credentials, test GitHub org, isolated cloud account | **Never production data or real secrets** |

---

## 6. Threat scenarios to reproduce

Use only dummy credentials and isolated infrastructure.

| ID | Scenario | What we must prove |
|----|----------|--------------------|
| S-A | Orphaned identity (no owner) | Detected, owner attribution workflow exists |
| S-B | Overprivileged service account | Detected, least-privilege recommendation is correct |
| S-C | Dummy API key in a test repo | Detected, attributed to an owner, remediation path works |
| S-D | Agent has more tools than its function needs | Policy blocks out-of-scope access; logs show the attempt |
| S-E | Workload accesses a resource it never touched before | Anomaly flagged within a defined time |
| S-F | Agent chain delegation (A→B→C) | Audit log preserves original human principal and full chain |
| S-G | Credential issuance outage | Behavior matches documented fail-open/closed policy |

---

## 7. Engineering tasks

Each task needs an owner, a result in `docs/findings/`, and a pass/fail against the acceptance criterion.

| ID | Task | Acceptance criterion | Verifies |
|----|------|---------------------|----------|
| T1 | Stand up SPIRE on kind; attest 2 workloads; fetch SVIDs | Both workloads obtain distinct short-lived SVIDs; rotation observed. **Record setup time and pain points** | B7 |
| T2 | Integrate SPIRE with OpenBao as upstream authority | Signing operations appear in OpenBao audit log | B7 |
| T3 | Build minimal Edge proxy: intercept → verify SVID → OPA decision → fetch short-lived credential → inject → log | Authorized request succeeds, unauthorized is denied, both logged; latency overhead measured | B2, B6 |
| T4 | GitHub discovery connector (read-only, test org) | Lists identities, tokens, apps, workflows; documents exact scopes used | B3, B6 |
| T5 | Cloud IAM discovery connector (one provider, test account) | Finds unused and over-permissioned service accounts seeded by us | B6 |
| T6 | Agent delegation prototype (two-layer model) | Scenario S-F passes; swappable adapter interface exists | B8, B9 |
| T7 | Identity graph + blast-radius query | Given a compromised identity, returns reachable resources correctly on seeded data | B6 |
| T8 | Risk scoring v0 (rules-based) | Ranks seeded risky identities above benign ones; false-positive rate recorded | B6 |
| T9 | Tenant isolation test suite | Cross-tenant access attempts fail in automated tests | Sec. req. 3 |
| T10 | Remediation with rollback (one action, e.g. revoke token) | Action executes, evidence logged, rollback restores state | Sec. req. 4 |
| T11 | Failure-mode test for control plane outage | Behavior matches documented policy (S-G) | Sec. req. 5 |
| T12 | Source verification pass | Every **[VERIFY]** item in this doc has a primary-source link or is corrected | B2, B3, B4, B9 |

**Suggested order:** T12 (in parallel) → T1 → T2 → T3 → T4 → T7 → T8 → T5 → T6 → T10 → T9 → T11.

---

## 8. Open questions for the team

1. Which three discovery sources give a design partner the fastest "aha"?
2. Do we need SPIFFE/SPIRE in the MVP, or can we start with cloud-native workload identity and add SPIFFE later?
3. Sidecar, node agent or SDK for enforcement? What does each cost in deployment friction?
4. What is our minimum viable risk score, and how will we prove it is useful rather than noisy?
5. Fail-open or fail-closed by default for credential issuance, and who decides, us or the customer?
6. What do we expose as open source (if anything) versus keep proprietary?
7. Who is the buyer, and does an SMB or India-first, self-serve motion actually work against sales-led incumbents? **[ASSUMPTION]**
8. How do we avoid being just a feature of a larger platform vendor? What is the durable moat?

---

## 9. Findings template

Create one file per task: `docs/findings/T<id>-<short-name>.md`

```
# T<id>: <title>
- Owner:
- Date:
- Result: PASS / FAIL / PARTIAL
- What we did (commands, configs, versions):
- Evidence (logs, screenshots, metrics):
- Surprises / things that contradicted this brief:
- Impact on beliefs (B#): confirmed / weakened / refuted
- Follow-up tasks:
```

---

## 10. Sources (verify these yourself)

- Aembit architecture: https://docs.aembit.io/get-started/security-posture/architecture/
- Aembit secretless concept: https://aembit.io/glossary/secretless/
- Aembit review summary (third party, treat as opinion): https://www.rfp.wiki/it-security/workload-identity-management/aembit
- Astrix status notice: https://astrix.security/
- Analyst view on Cisco/Astrix (opinion): https://nand-research.com/?p=5554
- SPIRE + OpenBao hardening: https://control-plane.io/posts/securing-agent-identity-openbao-spire/
- CSA on SPIFFE operational cost: https://cloudsecurityalliance.org/articles/everyone-wants-spiffe-almost-no-one-can-afford-to-build-it-right
- SPIFFE overview: https://travis.media/blog/what-is-spiffe-identity-standard-ai-agents/
- Agent identity with SPIFFE and OAuth (community post, verify against NIST): https://dev.to/indra_gustiprasetya_a80a/ai-agent-identity-needs-spiffe-and-oauth-not-one-key-4k4e

**Not verified in this brief:** exact Aembit Helm repo, chart names and quickstart values; Token and Clutch internal capabilities beyond marketing; any statement about NIST's final position on agent identity. Engineers must check these directly.

---

## 11. Ground rules

- Test only on infrastructure and accounts we own. Use dummy credentials.
- Do not attempt to access competitor products under false pretenses.
- Disagreement with this brief is welcome. Put it in a finding with evidence.
