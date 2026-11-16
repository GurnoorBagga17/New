import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "../components/SiteShell";

export const metadata: Metadata = {
  title: "Documentation & Architecture Reference | Axiom NHI",
  description:
    "Complete developer guides, architectural blueprints, Cedar policy authoring, and API references for Axiom NHI.",
};

const DOC_TOPICS = [
  { id: "quickstart", title: "Docker Quickstart", tag: "Setup", desc: "Deploy the local inline MCP proxy in 5 minutes." },
  { id: "identity", title: "RFC 8707 Identity Binding", tag: "Security", desc: "Attest autonomous agents without static bearer tokens." },
  { id: "ast-guard", title: "Deep AST Argument Inspection", tag: "Runtime", desc: "Pre-execution sanitization of SQL, Bash, and API inputs." },
  { id: "cedar-engine", title: "Deterministic Cedar Policies", tag: "Policy", desc: "Sub-millisecond fail-closed rule authoring." },
  { id: "vault-leasing", title: "OpenBao Dynamic Credential Vault", tag: "Secrets", desc: "Single-use ephemeral credentials with bounded TTLs." },
  { id: "audit-trail", title: "Tamper-Evident Audit Streaming", tag: "Forensics", desc: "Cryptographic OTel audit events with automated PII masking." },
];

export default function DocsPage() {
  return (
    <SiteShell>
      <div className="docs-page wrap">
        {/* Header */}
        <header className="docs-header">
          <div className="docs-badge">
            <span className="live-dot" />
            <span>DRAFT REFERENCE &bull; VERIFY AGAINST IMPLEMENTED RUNTIME</span>
          </div>
          <h1>Axiom documentation</h1>
          <p className="docs-subtitle">
            Phase 1 architecture and integration notes. Runtime capabilities and deployment examples remain subject to implementation and contract review.
          </p>
        </header>

        {/* Quick Topic Cards Grid */}
        <div className="docs-cards-grid">
          {DOC_TOPICS.map((topic) => (
            <a key={topic.id} href={`#${topic.id}`} className="doc-topic-card">
              <div className="topic-header">
                <span className="topic-tag">{topic.tag}</span>
              <span className="topic-arrow">↗</span>
              </div>
              <h3>{topic.title}</h3>
              <p>{topic.desc}</p>
            </a>
          ))}
        </div>

        {/* Documentation Sections */}
        <div className="docs-content-container">
          {/* Section 1: Quickstart */}
          <article className="docs-section" id="quickstart">
            <div className="section-title-wrap">
              <span className="section-num">01</span>
              <div>
                <p className="eyebrow">GETTING STARTED</p>
                <h2>Docker Compose Quickstart</h2>
              </div>
            </div>
            <p className="section-prose">
              The fastest way to run Axiom Gateway is via our pre-configured Docker Compose cluster. It spins up the
              Rust-native inline proxy on port <code>:9090</code>, an embedded Cedar policy engine, and OpenBao ephemeral vault.
            </p>

            <div className="code-block-card">
              <div className="code-block-header">
                <div className="window-dots" aria-hidden="true">
                  <span className="dot dot-red" />
                  <span className="dot dot-yellow" />
                  <span className="dot dot-green" />
                </div>
                <span className="code-lang">docker-compose.yml</span>
              </div>
              <pre>
                <code>
                  {`version: "3.9"\n`}
                  {`services:\n`}
                  {`  axiom-gateway:\n`}
                  {`    image: ghcr.io/axiom-nhi/axiom-gateway:v0.4.2\n`}
                  {`    ports:\n`}
                  {`      - "9090:9090"\n`}
                  {`    environment:\n`}
                  {`      - AXIOM_MODE=enforce\n`}
                  {`      - CEDAR_POLICIES_PATH=/etc/axiom/policies\n`}
                  {`      - OPENBAO_ADDR=http://vault:8200\n`}
                  {`    volumes:\n`}
                  {`      - ./policies:/etc/axiom/policies:ro\n`}
                </code>
              </pre>
            </div>

            <p className="section-prose">
              Configure your Model Context Protocol (MCP) clients (Claude Desktop, Cursor, or LangChain) to route requests
              through the proxy by setting the <code>MCP_GATEWAY_URL</code> environment variable:
            </p>

            <div className="code-block-card">
              <div className="code-block-header">
                <small>Terminal</small>
              </div>
              <pre>
                <code>
                  <span className="cmd-prompt">$ </span>
                  <span className="cmd-code">export MCP_GATEWAY_URL="http://localhost:9090/v1/mcp"</span>
                  {`\n`}
                  <span className="cmd-prompt">$ </span>
                  <span className="cmd-code">axiom-cli agent verify --agent-id="analyst-worker-1"</span>
                </code>
              </pre>
            </div>
          </article>

          {/* Section 2: RFC 8707 Identity Binding */}
          <article className="docs-section" id="identity">
            <div className="section-title-wrap">
              <span className="section-num">02</span>
              <div>
                <p className="eyebrow">IDENTITY &amp; ATTESTATION</p>
                <h2>RFC 8707 Resource Indicators &amp; SPIFFE Attestation</h2>
              </div>
            </div>
            <p className="section-prose">
              Traditional API keys grant ambient authority. If an autonomous agent&apos;s session token leaks, an attacker can
              pivot laterally across databases and services. Axiom enforces RFC 8707 token exchange on every single tool call.
            </p>
            <div className="feature-bullets-grid">
              <div className="feature-bullet-card">
                <h4>Cryptographic Proof-of-Possession</h4>
                <p>Tokens are bound to agent process memory and hardware TPM/enclave roots via Ed25519 signatures.</p>
              </div>
              <div className="feature-bullet-card">
                <h4>Single-Resource Scoping</h4>
                <p>Tokens minted for <code>db.read</code> cannot be replayed against <code>cloud.deploy</code> or storage buckets.</p>
              </div>
              <div className="feature-bullet-card">
                <h4>Automatic Lineage Tracking</h4>
                <p>Parent-child delegation trees are verified recursively to prevent confused deputy attacks.</p>
              </div>
            </div>
          </article>

          {/* Section 3: AST Argument Inspection */}
          <article className="docs-section" id="ast-guard">
            <div className="section-title-wrap">
              <span className="section-num">03</span>
              <div>
                <p className="eyebrow">RUNTIME GUARDRAILS</p>
                <h2>Deep AST Argument Inspection Engine</h2>
              </div>
            </div>
            <p className="section-prose">
              Regex patterns fail against adversarial prompt injections. Axiom implements native Rust Abstract Syntax Tree (AST)
              parsers that parse raw invocation arguments before passing execution to upstream tools.
            </p>

            <div className="table-wrapper">
              <table className="docs-table">
                <thead>
                  <tr>
                    <th>Syntax Parser</th>
                    <th>Threat Categories Trapped</th>
                    <th>Interception Overhead</th>
                    <th>Fail Mode</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><code>SQL AST Walker</code></td>
                    <td>DESTRUCTIVE_DDL, OUT-OF-BAND_EXFIL, STACKED_QUERIES</td>
                    <td>0.42ms</td>
                    <td>Fail-Closed</td>
                  </tr>
                  <tr>
                    <td><code>Filesystem Canonicalizer</code></td>
                    <td>DIRECTORY_TRAVERSAL, SYM_LINK_LOOP, SENSITIVE_PROC_ESCAPE</td>
                    <td>0.18ms</td>
                    <td>Fail-Closed</td>
                  </tr>
                  <tr>
                    <td><code>SSRF / Network Guard</code></td>
                    <td>INTERNAL_METADATA_IP, LINK_LOCAL_PROBING, DNS_REBINDING</td>
                    <td>0.31ms</td>
                    <td>Fail-Closed</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>

          {/* Section 4: Cedar Policy Language Reference */}
          <article className="docs-section" id="cedar-engine">
            <div className="section-title-wrap">
              <span className="section-num">04</span>
              <div>
                <p className="eyebrow">MATHEMATICAL POLICY</p>
                <h2>Cedar Policy Language Specification</h2>
              </div>
            </div>
            <p className="section-prose">
              Axiom leverages AWS Cedar &mdash; a mathematically proven, formally verified policy engine. Policies evaluate in
              microseconds with deterministic, auditable decisions.
            </p>

            <div className="code-block-card">
              <div className="code-block-header">
                <span className="code-lang">production_guard.cedar</span>
              </div>
              <pre>
                <code>
                  {`// Prevent autonomous write operations on production tables\n`}
                  {`forbid (\n`}
                  {`  principal in Group::"autonomous_agents",\n`}
                  {`  action in [Action::"db:drop", Action::"db:truncate", Action::"db:alter"],\n`}
                  {`  resource in Database::"production"\n`}
                  {`);\n\n`}
                  {`// Permit read operations only when AST inspection confirms safety\n`}
                  {`permit (\n`}
                  {`  principal in Group::"analyst_agents",\n`}
                  {`  action == Action::"db:select",\n`}
                  {`  resource\n`}
                  {`) when {\n`}
                  {`  context.ast.is_read_only == true &&\n`}
                  {`  context.ast.max_rows <= 10000\n`}
                  {`};\n`}
                </code>
              </pre>
            </div>
          </article>

          {/* Section 5: Ephemeral Vault Leasing */}
          <article className="docs-section" id="vault-leasing">
            <div className="section-title-wrap">
              <span className="section-num">05</span>
              <div>
                <p className="eyebrow">DYNAMIC CREDENTIALS</p>
                <h2>OpenBao Ephemeral Credential Leasing</h2>
              </div>
            </div>
            <p className="section-prose">
              Never expose long-lived database credentials, AWS keys, or API tokens to autonomous agents.
              Upon Cedar policy approval, Axiom dynamically provisions just-in-time credentials from OpenBao with a 60-second TTL.
              The credentials expire automatically upon completion of the tool call.
            </p>
          </article>

          {/* Section 6: Tamper-Evident Audit */}
          <article className="docs-section" id="audit-trail">
            <div className="section-title-wrap">
              <span className="section-num">06</span>
              <div>
                <p className="eyebrow">COMPLIANCE &amp; TRUST</p>
                <h2>Tamper-Evident OpenTelemetry Audit Stream</h2>
              </div>
            </div>
            <p className="section-prose">
              Every request, verdict, and identity linkage is cryptographically hashed with RFC 8785 canonical digest formats into structured OpenTelemetry audit events.
              Customer data and PII are masked at the proxy edge before records are emitted, enabling comprehensive
              compliance audit controls with zero data leakage risk.
            </p>
          </article>
        </div>

        {/* Bottom CTA */}
        <div className="docs-bottom-cta">
          <div>
            <h3>Experience the policy engine in action.</h3>
            <p>Explore pre-built threat scenarios in our interactive browser playground.</p>
          </div>
          <div className="cta-actions">
            <Link href="/playground" className="deploy-button">
              Launch Live Playground
            </Link>
            <Link href="/benchmarks" className="text-link-button">
              See benchmark methodology →
            </Link>
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
