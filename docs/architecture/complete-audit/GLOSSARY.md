# Axiom NHI — Master Terminology & Architectural Glossary

**Document:** `docs/architecture/complete-audit/GLOSSARY.md`  
**Classification:** Definitive Technical Taxonomy & Standard Reference  
**Entries:** 65+ Industry, Security & Platform Definitions  

---

## 1. Non-Human Identity (NHI) & Cloud Identity

1. **Non-Human Identity (NHI):** Any automated software entity, service account, workload identity, API token, cron job, or autonomous AI agent that authenticates and executes operations without direct human interaction.
2. **Shadow NHI:** An unmanaged machine identity, API token, or bot created by developers without formal registration, security review, or attributed human ownership.
3. **Machine Identity Management (MIM):** The cybersecurity discipline of discovering, cataloging, credentialing, monitoring, and offboarding non-human identities across cloud infrastructure.
4. **Service Account:** A machine account created in an operating system, Kubernetes cluster, or cloud provider (e.g. AWS IAM, GCP IAM) to run daemon processes and background jobs.
5. **Workload Identity:** An identity assigned to a running container, pod, or serverless function, authenticated dynamically via OIDC or SPIFFE rather than static secrets.
6. **Client ID Metadata Document (CIMD):** An HTTPS URL-based identity specification (defined in the Model Context Protocol) where an agent's `client_id` points to a signed JSON document declaring verified developer contacts, scopes, and public keys.
7. **Identity Attribution:** The algorithmic process of determining the human engineer or team responsible for creating, operating, or maintaining a machine identity.
8. **CODEOWNERS:** A file located at `.github/CODEOWNERS` or `.gitlab/CODEOWNERS` specifying the engineering teams responsible for code, configurations, and deployed workloads.
9. **Dormant Identity:** An NHI that has held active credentials without issuing an API call or tool invocation for an extended period (typically >90 days).
10. **Offboarding Leakage:** The vulnerability condition where an employee departs an organization but their personal API tokens, bot installations, and automation scripts remain active.

---

## 2. Model Context Protocol (MCP) & AI Agent Security

11. **Model Context Protocol (MCP):** An open standard protocol introduced by Anthropic that allows LLMs to query external databases, invoke tools, and read local or remote resources via JSON-RPC.
12. **`tools/call`:** The standard MCP JSON-RPC method by which an AI agent requests execution of an external tool with arbitrary arguments.
13. **Tool Definition Tampering (Rug-Pull):** An attack where a compromised or malicious MCP tool server silently alters its parameter schemas or descriptions to trick an LLM into performing dangerous actions.
14. **Prompt Injection (Indirect):** An attack where an adversarial payload hidden inside a database row, webpage, or file causes an LLM to hallucinate unauthorized tool invocations.
15. **Destructive DDL:** SQL Data Definition Language statements (`DROP TABLE`, `TRUNCATE`, `ALTER TABLE`) that permanently destroy database tables and records.
16. **Stacked Statements:** Multiple SQL commands separated by semicolons (e.g. `SELECT 1; DROP TABLE users;`), often used by attackers to bypass simple keyword filters.
17. **Tool Schema Pinning:** Normalizing an MCP tool definition using RFC 8785 JSON Canonicalization Scheme (JCS) and enforcing its SHA-256 hash at runtime to block schema tampering.
18. **Shadow MCP Server:** An unauthorized or unvetted MCP tool server spun up by an engineer that bypasses corporate security gateways.
19. **Scope Creep:** The gradual accumulation of unauthorized tool permissions by an agent over successive execution hops.
20. **Context Bleed:** The accidental sharing of sensitive prompt context, PII, or internal tokens across multi-tenant LLM sessions.

---

## 3. Cryptography, Tokens & Attestation

21. **Zero-Secret Invariant:** The architectural principle that raw plaintext passwords, bearer tokens, and private keys are never stored in databases, printed in logs, or exposed to browser clients.
22. **Credential Fingerprinting:** Computing an HMAC-SHA256 hash of a credential's identifier using an isolated tenant salt, allowing duplicate detection without secret exposure.
23. **RFC 8707 Resource Indicators:** An OAuth 2.0 extension requiring tokens to bind their `aud` (audience) claim to the exact canonical resource URI being accessed, preventing confused deputy attacks.
24. **IETF RFC 8693 Token Exchange:** The standard protocol for exchanging a parent token for an attenuated child token with reduced scopes and a documented delegation chain (`act` claim).
25. **Scope Attenuation:** The cryptographic restriction ensuring that a delegated child token can never possess permissions exceeding those granted to the delegating parent.
26. **Time-of-Check to Time-of-Use (TOCTOU):** A race condition where a payload is modified between the time an operator approves it and the time the system executes it.
27. **Merkle Hash Chaining:** Linking each audit log record to the SHA-256 hash of the preceding record, making historical log deletion or alteration cryptographically detectable.
28. **Constant-Time Comparison:** Byte-by-byte comparison that executes in identical CPU cycles regardless of match status, eliminating timing side-channel attacks on secret tokens.
29. **Domain Separation:** Prefixing cryptographic hash inputs with a distinct protocol identifier (e.g. `AXIOM_APPROVAL_PAYLOAD_V1\x00`) to prevent cross-protocol hash collisions.
30. **Single-Use Consumption:** Ensuring an approved cryptographic authorization token can be redeemed exactly once before it is automatically invalidated.

---

## 4. Policy Engines & Formal Verification

31. **AWS Cedar:** A declarative, formally verified open-source policy language developed by AWS for fine-grained authorization.
32. **Decidability:** The mathematical guarantee that a Cedar policy evaluation is guaranteed to terminate and return a definitive permit or deny decision without infinite loops.
33. **Fail-Closed by Design:** The security architecture where any syntax error, evaluation timeout, network partition, or unhandled exception immediately results in access denial.
34. **`ArcSwap`:** A Rust concurrency primitive (`arc_swap::ArcSwap`) providing lock-free atomic pointer swaps, allowing hot-reload of policy bundles without stalling concurrent reader threads.
35. **Permit Policy:** An explicit Cedar authorization rule that allows an action if all conditions are satisfied.
36. **Forbid Policy:** An absolute Cedar denial rule that unconditionally overrides any matching permit policies.
37. **Strict Schema Validation:** Validating policy text against a formal schema (`ValidationMode::Strict`) to ensure all entity types, actions, and attributes are known at load time.
38. **Observe-Only Mode:** Evaluating policies and AST rules against live traffic to log `WOULD_DENY` verdicts without actively dropping requests.
39. **Enforce Mode:** Inline active protection where violation verdicts immediately return HTTP 403 or gRPC `PERMISSION_DENIED`.
40. **AST Parser:** An Abstract Syntax Tree generator (`sqlparser-rs`) that transforms raw query text into a structured syntax tree for precise grammatical analysis.

---

## 5. Graph Topology & Dependency Analysis

41. **Lineage Graph:** A directed graph modeling the operational dependencies and communication paths between owners, agents, credentials, and target servers.
42. **Blast Radius:** The full scope of upstream workloads, downstream agents, and microservices that will fail if a specific credential or resource is revoked.
43. **Shared-Credential Sibling:** Two or more independent workloads that authenticate using the same underlying credential (`NHI9:2025`).
44. **Common Table Expression (CTE):** A SQL query structure (`WITH RECURSIVE`) enabling multi-hop hierarchical graph traversals directly inside PostgreSQL.
45. **Breadth-First Search (BFS):** An algorithm for traversing graph data structures layer by layer, used to determine outage distances during revocation simulation.
46. **Privilege Weight:** A numeric score assigned to a node reflecting its administrative capability (e.g. Read = 10, Write = 25, Destructive DDL = 45).
47. **Composite Risk Score:** A mathematically weighted score combining an identity's exposure severity (60%) with its structural blast-radius score (40%).
48. **Exposure Floor:** A mandatory minimum risk score (75 points) applied to any identity lacking an active human owner.
49. **Causal Chain Revocation:** In SpiceDB Zanzibar, revoking a root grant and automatically cascading revocation down all child grants without affecting sibling branches.
50. **Zanzibar:** Google's global, consistent authorization system model based on object-to-subject relationship tuples.

---

## 6. Infrastructure & Standards

51. **OpenBao:** An open-source, community-governed fork of HashiCorp Vault (MPL-2.0) providing dynamic secret engines and JIT leases.
52. **Just-In-Time (JIT) Credential:** An ephemeral username and password generated dynamically for an agent and automatically deleted after a short TTL (e.g. 15 minutes).
53. **Server-Sent Events (SSE):** A unidirectional HTTP standard allowing the Rust ExtMCP backend to push real-time audit frames to browser dashboards over a single persistent connection.
54. **Tonic:** A high-performance, asynchronous gRPC library for Rust built on top of Tokio, Tower, and Hyper.
55. **Axum:** An ergonomic, high-throughput asynchronous web application framework for Rust.
56. **Turborepo:** A high-performance build system for TypeScript monorepos that caches build and test artifacts.
57. **OCSF (Open Cybersecurity Schema Framework):** An open-standard JSON schema (v1.3) for normalizing security events across SIEM platforms.
58. **ArcSight CEF (Common Event Format):** A standard log format consisting of a pipe-delimited header and key-value extension dictionary.
59. **Splunk HEC (HTTP Event Collector):** A fast, scalable token-authenticated HTTP endpoint for streaming operational telemetry into Splunk.
60. **Software Bill of Materials (SBOM):** A comprehensive machine-readable inventory of software components and dependencies formatted in CycloneDX 1.6.
61. **Air-Gapped Deployment:** An isolated execution environment completely disconnected from the public internet.
62. **SSRF (Server-Side Request Forgery):** An attack where a server or agent is tricked into making unauthorized requests to internal network services or cloud metadata endpoints.
63. **IMDSv2:** The Amazon EC2 Instance Metadata Service requiring session-oriented tokens to prevent SSRF vulnerabilities.
64. **Distroless Container:** A minimal container image containing only the application binary and its immediate runtime dependencies, excluding package managers, shells, and OS utilities.
65. **OWASP NHI Top 10 (2025):** The industry standard catalog of the ten most critical security risks associated with non-human identities.
