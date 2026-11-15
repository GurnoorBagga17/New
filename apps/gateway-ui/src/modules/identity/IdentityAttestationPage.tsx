// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
import { useState } from "react";

interface AttestationIdentity {
  id: string;
  agentId: string;
  spiffeId: string;
  clientId: string;
  cimdUri: string | null;
  issuer: string;
  audience: string[];
  scopes: string[];
  tokenJti: string;
  expiresInSecs: number;
  attestationMethod: "AWS_NITRO_PCR0" | "HARDWARE_TPM_2" | "APPLE_SECURE_ENCLAVE" | "SPIFFE_X509";
  pcr0Hash?: string;
  tpmEndorsementKey?: string;
  trustDomain: string;
  status: "VERIFIED" | "SUSPECT" | "EXPIRED";
}

const INITIAL_IDENTITIES: AttestationIdentity[] = [
  {
    id: "id-01",
    agentId: "spiffe://axiom.internal/ns/prod/sa/autonomous-finops-agent",
    spiffeId: "spiffe://axiom.internal/ns/prod/sa/autonomous-finops-agent",
    clientId: "https://agents.axiomnhi.io/cimd/finops-agent.json",
    cimdUri: "https://agents.axiomnhi.io/cimd/finops-agent.json",
    issuer: "https://auth.axiom.internal/oauth2/v1",
    audience: ["mcp://prod-db", "mcp://aws-iam-proxy"],
    scopes: ["sql:select", "iam:get-role"],
    tokenJti: "0196d1f0-7c40-7d6a-8c7b-21c55a8f1001",
    expiresInSecs: 248,
    attestationMethod: "AWS_NITRO_PCR0",
    pcr0Hash: "9f8e87b2c5e4a1b023f8c7d6e5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6",
    trustDomain: "axiom.internal",
    status: "VERIFIED",
  },
  {
    id: "id-02",
    agentId: "spiffe://axiom.internal/ns/ci/sa/github-pr-review-bot",
    spiffeId: "spiffe://axiom.internal/ns/ci/sa/github-pr-review-bot",
    clientId: "github-pr-review-bot-client-01",
    cimdUri: null,
    issuer: "https://token.actions.githubusercontent.com",
    audience: ["mcp://github-mcp", "mcp://jira-mcp"],
    scopes: ["repo:read", "pull_requests:comment"],
    tokenJti: "0196d1f0-8e12-7a1b-9f0a-11b43c9d2002",
    expiresInSecs: 184,
    attestationMethod: "HARDWARE_TPM_2",
    tpmEndorsementKey: "EK-SHA256-4a9b2c8d1e3f5a7b9c0d2e4f6a8b0c2d4e6f8a0b",
    trustDomain: "axiom.internal",
    status: "VERIFIED",
  },
  {
    id: "id-03",
    agentId: "spiffe://axiom.internal/ns/ops/sa/k8s-auto-remediation-worker",
    spiffeId: "spiffe://axiom.internal/ns/ops/sa/k8s-auto-remediation-worker",
    clientId: "https://agents.axiomnhi.io/cimd/k8s-worker.json",
    cimdUri: "https://agents.axiomnhi.io/cimd/k8s-worker.json",
    issuer: "https://kubernetes.default.svc.cluster.local",
    audience: ["mcp://kubernetes-mcp", "mcp://datadog-mcp"],
    scopes: ["pods:get", "pods:restart", "metrics:read"],
    tokenJti: "0196d1f0-9b34-7c2d-8e1f-33d55e8a3003",
    expiresInSecs: 512,
    attestationMethod: "SPIFFE_X509",
    trustDomain: "axiom.internal",
    status: "VERIFIED",
  },
  {
    id: "id-04",
    agentId: "spiffe://axiom.internal/ns/sandbox/sa/temp-scrape-runner-x9",
    spiffeId: "spiffe://axiom.internal/ns/sandbox/sa/temp-scrape-runner-x9",
    clientId: "unregistered-client-992",
    cimdUri: null,
    issuer: "https://external-untrusted-idp.io",
    audience: ["mcp://internal-snowflake"],
    scopes: ["*"],
    tokenJti: "0196d1f0-a123-7d4e-b56f-44e66f9b4004",
    expiresInSecs: 0,
    attestationMethod: "SPIFFE_X509",
    trustDomain: "untrusted.external",
    status: "EXPIRED",
  },
];

const SAMPLE_CIMD_DOCUMENT = {
  client_id: "https://agents.axiomnhi.io/cimd/finops-agent.json",
  client_name: "Autonomous FinOps Agent (Production)",
  client_uri: "https://finops.internal.corp/agents/01",
  logo_uri: "https://finops.internal.corp/assets/agent-icon.png",
  contacts: ["sec-finops@corp.internal", "alex.mercer@corp.internal"],
  tos_uri: "https://corp.internal/legal/agent-tos",
  policy_uri: "https://corp.internal/legal/privacy",
  jwks_uri: "https://auth.axiom.internal/.well-known/jwks.json",
  grant_types: ["urn:ietf:params:oauth:grant-type:token-exchange", "client_credentials"],
  response_types: ["token"],
  scope: "sql:select iam:get-role metrics:read",
  token_endpoint_auth_method: "private_key_jwt",
  signed_metadata: "eyJhbGciOiJSUzI1NiIsImtpZCI6ImNpbWQtMSJ9...",
};

export function IdentityAttestationPage() {
  const [identities] = useState<AttestationIdentity[]>(INITIAL_IDENTITIES);
  const [selectedId, setSelectedId] = useState<AttestationIdentity>(INITIAL_IDENTITIES[0]!);
  const [activeTab, setActiveTab] = useState<"ACTIVE_IDENTITIES" | "CIMD_INSPECTOR" | "HARDWARE_ENCLAVES">("ACTIVE_IDENTITIES");

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-border-subtle pb-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-brand-orange">
              CRYPTOGRAPHIC IDENTITY &bull; ZERO-TRUST ATTESTATION
            </span>
            <span className="inline-flex items-center rounded-full border border-state-enforce/30 bg-state-enforce-tint px-2 py-0.5 font-mono text-[10px] text-state-enforce">
              RUST CRATE: identity
            </span>
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-text-primary">
            SPIFFE &amp; Enclave Attestation Vault
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Continuous verification of autonomous agents using SPIFFE X.509 SVIDs, AWS Nitro Enclave PCR0 registers, TPM 2.0 cryptographic proofs, and RFC 8707 Resource Indicators.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex rounded-input border border-border-subtle bg-surface-1 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("ACTIVE_IDENTITIES")}
            className={`rounded px-3 py-1.5 font-mono text-xs transition ${
              activeTab === "ACTIVE_IDENTITIES"
                ? "bg-surface-2 font-semibold text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            SVID &amp; JWT Context ({identities.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("CIMD_INSPECTOR")}
            className={`rounded px-3 py-1.5 font-mono text-xs transition ${
              activeTab === "CIMD_INSPECTOR"
                ? "bg-surface-2 font-semibold text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            CIMD Document Cache
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("HARDWARE_ENCLAVES")}
            className={`rounded px-3 py-1.5 font-mono text-xs transition ${
              activeTab === "HARDWARE_ENCLAVES"
                ? "bg-surface-2 font-semibold text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            Hardware PCR0 / TPM Proofs
          </button>
        </div>
      </div>

      {/* Identity Metrics */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-text-muted">SPIFFE Trust Domain</p>
          <p className="mt-2 font-display text-xl font-bold text-text-primary">axiom.internal</p>
          <p className="mt-1 font-mono text-xs text-state-enforce">&check; mTLS Handshake Mutual</p>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-state-enforce">Hardware Attested</p>
          <p className="mt-2 font-display text-2xl font-bold text-state-enforce">3 Workloads</p>
          <p className="mt-1 text-xs text-text-muted">Nitro PCR0 &amp; TPM 2.0 Validated</p>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-brand-orange">RFC 8707 Audience Check</p>
          <p className="mt-2 font-display text-2xl font-bold text-brand-orange">100% Bound</p>
          <p className="mt-1 text-xs text-text-muted">Confused deputy attacks blocked</p>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-text-muted">JWKS Key Cache</p>
          <p className="mt-2 font-display text-2xl font-bold text-text-primary">Fresh (22s)</p>
          <p className="mt-1 text-xs text-text-muted">Auto-rotates every 300s</p>
        </div>
      </div>

      {/* Tab 1: Active Identities Table & Dossier */}
      {activeTab === "ACTIVE_IDENTITIES" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-8">
            <div className="overflow-hidden rounded-card border border-border-subtle bg-surface-1">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border-subtle bg-surface-2 font-mono uppercase text-text-muted">
                  <tr>
                    <th className="p-3">Agent Principal (SPIFFE ID)</th>
                    <th className="p-3">Attestation</th>
                    <th className="p-3">RFC 8707 Audience</th>
                    <th className="p-3">Token JTI &bull; TTL</th>
                    <th className="p-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {identities.map((item) => {
                    const isSelected = selectedId.id === item.id;
                    return (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedId(item)}
                        className={`cursor-pointer transition hover:bg-surface-2/60 ${
                          isSelected ? "bg-surface-2" : ""
                        }`}
                      >
                        <td className="p-3">
                          <div className="font-mono font-semibold text-text-primary">
                            {item.spiffeId.split("/").pop()}
                          </div>
                          <div className="max-w-[260px] truncate font-mono text-[10px] text-text-muted">
                            {item.spiffeId}
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="inline-flex rounded bg-surface-3 px-2 py-0.5 font-mono text-[10px] font-medium text-text-secondary">
                            {item.attestationMethod}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {item.audience.map((aud) => (
                              <span
                                key={aud}
                                className="rounded border border-border-subtle bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-brand-orange"
                              >
                                {aud.replace("mcp://", "")}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="font-mono text-[10px] text-text-muted">
                            {item.tokenJti.substring(0, 13)}...
                          </div>
                          <div className="font-mono text-xs font-semibold text-text-primary">
                            {item.expiresInSecs > 0 ? `${item.expiresInSecs}s remaining` : "EXPIRED"}
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          <span
                            className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                              item.status === "VERIFIED"
                                ? "bg-state-enforce-tint text-state-enforce"
                                : "bg-state-deny-tint text-state-deny"
                            }`}
                          >
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Dossier */}
          <div className="space-y-4 lg:col-span-4">
            <div className="rounded-card border border-border-subtle bg-surface-1 p-5 shadow-sm">
              <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-muted">
                IDENTITY CONTEXT VERIFIER
              </span>
              <h2 className="mt-2 font-display text-lg font-bold text-text-primary">
                {selectedId.spiffeId.split("/").pop()}
              </h2>

              <div className="mt-4 space-y-3 divide-y divide-border-subtle text-xs">
                <div className="pt-2">
                  <p className="font-mono uppercase text-text-muted">OAuth 2.1 Client ID</p>
                  <p className="mt-1 break-all font-mono text-[11px] text-text-primary">
                    {selectedId.clientId}
                  </p>
                </div>
                <div className="pt-2">
                  <p className="font-mono uppercase text-text-muted">CIMD Metadata URI</p>
                  <p className="mt-1 break-all font-mono text-[11px] text-brand-orange">
                    {selectedId.cimdUri || "None (Static OAuth Client)"}
                  </p>
                </div>
                <div className="pt-2">
                  <p className="font-mono uppercase text-text-muted">Token Issuer (iss)</p>
                  <p className="mt-1 font-mono text-[11px] text-text-secondary">{selectedId.issuer}</p>
                </div>
                <div className="pt-2">
                  <p className="font-mono uppercase text-text-muted">Attenuated OAuth Scopes</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {selectedId.scopes.map((s) => (
                      <span key={s} className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-text-primary">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
                {selectedId.pcr0Hash && (
                  <div className="pt-2">
                    <p className="font-mono uppercase text-text-muted">AWS Nitro Enclave PCR0 Hash</p>
                    <p className="mt-1 break-all font-mono text-[10px] text-state-enforce">
                      {selectedId.pcr0Hash}
                    </p>
                  </div>
                )}
                {selectedId.tpmEndorsementKey && (
                  <div className="pt-2">
                    <p className="font-mono uppercase text-text-muted">TPM 2.0 Endorsement Key</p>
                    <p className="mt-1 break-all font-mono text-[10px] text-state-enforce">
                      {selectedId.tpmEndorsementKey}
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => alert(`Simulating RFC 8707 audience verification against ${selectedId.spiffeId}... Result: VALID`)}
                  className="w-full rounded-input border border-border-subtle bg-surface-2 py-2 font-mono text-xs font-semibold text-text-primary transition hover:bg-surface-3"
                >
                  Verify RFC 8707 Audience
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: CIMD Inspector */}
      {activeTab === "CIMD_INSPECTOR" && (
        <div className="rounded-card border border-border-subtle bg-surface-1 p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-4 border-b border-border-subtle pb-4 sm:flex-row sm:items-center">
            <div>
              <span className="font-mono text-xs font-semibold uppercase tracking-wider text-state-enforce">
                CLIENT ID METADATA DOCUMENT (CIMD) &bull; DRAFT V0.1.0
              </span>
              <h2 className="mt-1 font-display text-lg font-bold text-text-primary">
                Model Context Protocol Dynamic Client Registration
              </h2>
              <p className="mt-1 text-xs text-text-secondary">
                Eliminates pre-shared static client secrets by allowing agents to advertise identity metadata and JWKS public keys at a URL-formatted client_id.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(SAMPLE_CIMD_DOCUMENT, null, 2));
                alert("CIMD document copied to clipboard!");
              }}
              className="rounded-input border border-border-subtle bg-surface-2 px-3 py-1.5 font-mono text-xs font-semibold text-text-primary transition hover:bg-surface-3"
            >
              Copy CIMD JSON
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-input border border-border-subtle bg-surface-2 p-3 font-mono text-xs">
              <span className="text-text-muted">CIMD CACHE STATUS:</span>
              <div className="mt-1 font-bold text-state-enforce">&check; WARM &bull; HIT RATIO: 99.4%</div>
            </div>
            <div className="rounded-input border border-border-subtle bg-surface-2 p-3 font-mono text-xs">
              <span className="text-text-muted">REDIRECT URI VALIDATION:</span>
              <div className="mt-1 font-bold text-text-primary">Enforced Same-Domain (corp.internal)</div>
            </div>
            <div className="rounded-input border border-border-subtle bg-surface-2 p-3 font-mono text-xs">
              <span className="text-text-muted">TOKEN AUTH METHOD:</span>
              <div className="mt-1 font-bold text-brand-orange">private_key_jwt (Asymmetric)</div>
            </div>
          </div>

          <div className="mt-4 rounded-card border border-border-subtle bg-canvas p-4">
            <pre className="overflow-x-auto font-mono text-xs leading-relaxed text-text-secondary">
              {JSON.stringify(SAMPLE_CIMD_DOCUMENT, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Tab 3: Hardware Enclaves */}
      {activeTab === "HARDWARE_ENCLAVES" && (
        <div className="space-y-4">
          <div className="rounded-card border border-border-subtle bg-surface-1 p-5 shadow-sm">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-brand-orange">
              CRYPTOGRAPHIC ROOT OF TRUST
            </span>
            <h2 className="mt-1 font-display text-lg font-bold text-text-primary">
              Hardware Platform Configuration Registers (PCRs)
            </h2>
            <p className="mt-1 text-xs text-text-secondary">
              Axiom Gateway guarantees that non-human agents run exclusively inside attested hardware boundaries without memory tampering.
            </p>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-card border border-border-subtle bg-surface-2 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-text-primary">
                    AWS NITRO ENCLAVE ATTESTATION
                  </span>
                  <span className="rounded bg-state-enforce-tint px-2 py-0.5 font-mono text-[10px] font-bold text-state-enforce">
                    VERIFIED
                  </span>
                </div>
                <div className="mt-3 space-y-2 font-mono text-xs">
                  <div>
                    <span className="text-text-muted">PCR0 (Enclave Image Kernel):</span>
                    <p className="break-all text-[11px] text-text-primary">
                      9f8e87b2c5e4a1b023f8c7d6e5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6
                    </p>
                  </div>
                  <div>
                    <span className="text-text-muted">PCR1 (OS &amp; Bootloader):</span>
                    <p className="break-all text-[11px] text-text-primary">
                      a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0
                    </p>
                  </div>
                  <div>
                    <span className="text-text-muted">PCR2 (Application Code):</span>
                    <p className="break-all text-[11px] text-text-primary">
                      7890abcdef0123456789abcdef0123456789abcdef0123456789abcdef012345
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-card border border-border-subtle bg-surface-2 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-text-primary">
                    TPM 2.0 ENDORSEMENT &amp; QUOTE
                  </span>
                  <span className="rounded bg-state-enforce-tint px-2 py-0.5 font-mono text-[10px] font-bold text-state-enforce">
                    HARDWARE BOUND
                  </span>
                </div>
                <div className="mt-3 space-y-2 font-mono text-xs">
                  <div>
                    <span className="text-text-muted">Endorsement Key Digest:</span>
                    <p className="break-all text-[11px] text-text-primary">
                      EK-SHA256-4a9b2c8d1e3f5a7b9c0d2e4f6a8b0c2d4e6f8a0b
                    </p>
                  </div>
                  <div>
                    <span className="text-text-muted">Hardware Manufacturer:</span>
                    <p className="text-[11px] text-text-primary">Infineon TPM 2.0 (FIPS 140-2 Level 2)</p>
                  </div>
                  <div>
                    <span className="text-text-muted">Nonce Verification:</span>
                    <p className="text-[11px] text-state-enforce">&check; Fresh Nonce Exchanged (0.4ms)</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
