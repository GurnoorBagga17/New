// Copyright 2026 Axiom NHI — Licensed under Apache-2.0
import { useState } from "react";

interface AttributionRecord {
  entityUid: string;
  name: string;
  kind: "ai_agent" | "mcp_tool" | "cloud_role" | "api_credential";
  primaryOwnerEmail: string | null;
  owningTeam: string | null;
  confidenceScore: number;
  isShadowNhi: boolean;
  evidenceSources: string[];
  lastAttested: string;
  status: "CLAIMED" | "INVESTIGATING" | "QUARANTINED";
}

const INITIAL_RECORDS: AttributionRecord[] = [
  {
    entityUid: "spiffe://axiom.internal/ns/prod/sa/autonomous-finops-agent",
    name: "autonomous-finops-agent",
    kind: "ai_agent",
    primaryOwnerEmail: "alex.mercer@corp.internal",
    owningTeam: "FinOps Core (@sec-finops)",
    confidenceScore: 0.95,
    isShadowNhi: false,
    evidenceSources: ["oauth21:cimd_verified", "github:CODEOWNERS"],
    lastAttested: "12m ago",
    status: "CLAIMED",
  },
  {
    entityUid: "spiffe://axiom.internal/ns/ci/sa/github-pr-review-bot",
    name: "github-pr-review-bot",
    kind: "ai_agent",
    primaryOwnerEmail: "elena.rostova@corp.internal",
    owningTeam: "Developer Experience (@devex)",
    confidenceScore: 0.88,
    isShadowNhi: false,
    evidenceSources: ["cloud:iam_owner_tag", "github:CODEOWNERS"],
    lastAttested: "38m ago",
    status: "CLAIMED",
  },
  {
    entityUid: "https://agents.axiomnhi.io/cimd/bi-reporting-collector.json",
    name: "bi-reporting-collector",
    kind: "ai_agent",
    primaryOwnerEmail: "devon.vance@corp.internal",
    owningTeam: "Data Analytics (@data-eng)",
    confidenceScore: 0.70,
    isShadowNhi: false,
    evidenceSources: ["slack:app_installer"],
    lastAttested: "2h ago",
    status: "CLAIMED",
  },
  {
    entityUid: "spiffe://axiom.internal/ns/sandbox/sa/temp-scrape-runner-x9",
    name: "temp-scrape-runner-x9",
    kind: "ai_agent",
    primaryOwnerEmail: null,
    owningTeam: null,
    confidenceScore: 0.0,
    isShadowNhi: true,
    evidenceSources: ["idp:creator_departed_or_unverified"],
    lastAttested: "48d ago",
    status: "QUARANTINED",
  },
  {
    entityUid: "spiffe://axiom.internal/ns/experimental/sa/claude-desktop-local-mcp",
    name: "claude-desktop-local-mcp",
    kind: "mcp_tool",
    primaryOwnerEmail: "marcus.chen@corp.internal",
    owningTeam: "Research Sandbox",
    confidenceScore: 0.60,
    isShadowNhi: false,
    evidenceSources: ["git:blame_provenance"],
    lastAttested: "6h ago",
    status: "INVESTIGATING",
  },
  {
    entityUid: "arn:aws:iam::129481928412:role/AxiomEgressProxyRole",
    name: "AxiomEgressProxyRole",
    kind: "cloud_role",
    primaryOwnerEmail: "cloud-infra@corp.internal",
    owningTeam: "Platform Infrastructure",
    confidenceScore: 0.80,
    isShadowNhi: false,
    evidenceSources: ["cloud:iam_owner_tag"],
    lastAttested: "1d ago",
    status: "CLAIMED",
  },
];

const SIGNED_AIBOM_SAMPLE = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  serialNumber: "urn:uuid:3e671687-395b-41f5-a30f-a58921a69b79",
  version: 1,
  metadata: {
    timestamp: "2026-11-16T00:15:00Z",
    component: {
      type: "application",
      name: "autonomous-finops-agent",
      version: "2.4.1",
      purl: "pkg:oci/axiom-nhi/autonomous-finops-agent@sha256:7f3b890a88ef11",
    },
    authors: [
      { name: "FinOps Core (@sec-finops)", email: "finops-core@corp.internal" },
    ],
  },
  signature: {
    algorithm: "Ed25519",
    publicKeyId: "did:key:z6MkuV8zWbKjK3m1oQYq7L9p8X...",
    digest: "sha256:8f4c2810a0e9981882d92bbef8e3318b8c8d8f99e",
    signatureValue: "MEYCIQDx9vA23uY4c1K341K8L09mHhU41pPzXy6w7Vb8N190...",
  },
};

export function AttributionPage() {
  const [records, setRecords] = useState<AttributionRecord[]>(INITIAL_RECORDS);
  const [selectedRecord, setSelectedRecord] = useState<AttributionRecord>(INITIAL_RECORDS[0]!);
  const [filter, setFilter] = useState<"ALL" | "SHADOW" | "LOW_CONFIDENCE" | "CLAIMED">("ALL");
  const [activeTab, setActiveTab] = useState<"DIRECTORY" | "AIBOM" | "SIMULATOR">("DIRECTORY");

  // Simulator state
  const [simEntity, setSimEntity] = useState("spiffe://axiom.internal/ns/staging/sa/test-agent");
  const [simCimd, setSimCimd] = useState("sarah.connor@corp.internal");
  const [simCodeowners, setSimCodeowners] = useState("@cyberdyne-sec");
  const [simCloudTag, setSimCloudTag] = useState("");
  const [simSlack, setSimSlack] = useState("");
  const [simGitBlame, setSimGitBlame] = useState("");
  const [simActiveInIdp, setSimActiveInIdp] = useState(true);

  const calculateSimScore = () => {
    if (!simActiveInIdp) {
      return { score: 0.0, shadow: true, reason: "idp:creator_departed_or_unverified", team: null, owner: null };
    }
    if (simCimd && simCodeowners) {
      return { score: 0.95, shadow: false, reason: "oauth21:cimd_verified + github:CODEOWNERS", team: simCodeowners, owner: simCimd };
    }
    if (simCloudTag) {
      return { score: simCodeowners ? 0.88 : 0.80, shadow: false, reason: "cloud:iam_owner_tag", team: simCodeowners || "@platform-sec", owner: simCloudTag };
    }
    if (simSlack) {
      return { score: 0.70, shadow: false, reason: "slack:app_installer", team: simCodeowners || "Unassigned", owner: simSlack };
    }
    if (simGitBlame) {
      return { score: 0.60, shadow: false, reason: "git:blame_provenance", team: simCodeowners || "Unassigned", owner: simGitBlame };
    }
    return { score: 0.0, shadow: true, reason: "No verified attribution signals found", team: null, owner: null };
  };

  const simResult = calculateSimScore();

  const filteredRecords = records.filter((r) => {
    if (filter === "SHADOW") return r.isShadowNhi;
    if (filter === "LOW_CONFIDENCE") return r.confidenceScore < 0.70 && !r.isShadowNhi;
    if (filter === "CLAIMED") return r.status === "CLAIMED";
    return true;
  });

  const handleQuarantine = (uid: string) => {
    setRecords((prev) =>
      prev.map((r) => (r.entityUid === uid ? { ...r, status: "QUARANTINED" } : r))
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-border-subtle pb-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-brand-orange">
              GOVERNANCE &bull; ATTRIBUTION ENGINE
            </span>
            <span className="inline-flex items-center rounded-full border border-state-enforce/30 bg-state-enforce-tint px-2 py-0.5 font-mono text-[10px] text-state-enforce">
              RUST CRATE: attribution
            </span>
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-text-primary">
            Ownership Attribution &amp; AIBOM Engine
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Resolves &ldquo;Who owns this NHI or AI agent?&rdquo; using multi-signal correlation (OAuth 2.1 CIMD, CODEOWNERS, IAM tags, and Slack installers).
          </p>
        </div>

        {/* Tab switchers */}
        <div className="flex rounded-input border border-border-subtle bg-surface-1 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("DIRECTORY")}
            className={`rounded px-3 py-1.5 font-mono text-xs transition ${
              activeTab === "DIRECTORY"
                ? "bg-surface-2 font-semibold text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            NHI Registry ({records.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("AIBOM")}
            className={`rounded px-3 py-1.5 font-mono text-xs transition ${
              activeTab === "AIBOM"
                ? "bg-surface-2 font-semibold text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            Signed AIBOM Manifest
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("SIMULATOR")}
            className={`rounded px-3 py-1.5 font-mono text-xs transition ${
              activeTab === "SIMULATOR"
                ? "bg-surface-2 font-semibold text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            Attribution Simulator
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-text-muted">Total NHI Workloads</p>
          <p className="mt-2 font-display text-2xl font-bold text-text-primary">{records.length}</p>
          <p className="mt-1 text-xs text-text-muted">Across 3 clusters &amp; cloud IAM</p>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-state-enforce">Claimed &bull; High Confidence</p>
          <p className="mt-2 font-display text-2xl font-bold text-state-enforce">
            {records.filter((r) => r.confidenceScore >= 0.8).length}
          </p>
          <p className="mt-1 text-xs text-text-muted">Score &ge; 80% with verified owner</p>
        </div>
        <div className="rounded-card border border-border-subtle bg-surface-1 p-4 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-state-pending">Low Confidence (&lt;70%)</p>
          <p className="mt-2 font-display text-2xl font-bold text-state-pending">
            {records.filter((r) => r.confidenceScore < 0.7 && !r.isShadowNhi).length}
          </p>
          <p className="mt-1 text-xs text-text-muted">Requires manual team mapping</p>
        </div>
        <div className="rounded-card border border-state-deny/40 bg-state-deny-tint/10 p-4 shadow-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-state-deny">Shadow NHIs (Orphaned)</p>
          <p className="mt-2 font-display text-2xl font-bold text-state-deny">
            {records.filter((r) => r.isShadowNhi).length}
          </p>
          <p className="mt-1 text-xs text-state-deny/80">Departed creators or zero signals</p>
        </div>
      </div>

      {activeTab === "DIRECTORY" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Main Registry Table */}
          <div className="space-y-4 lg:col-span-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-text-muted">FILTER:</span>
                {(["ALL", "CLAIMED", "LOW_CONFIDENCE", "SHADOW"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setFilter(mode)}
                    className={`rounded-input px-2.5 py-1 font-mono text-xs transition ${
                      filter === mode
                        ? "border border-border-strong bg-surface-2 font-semibold text-text-primary"
                        : "border border-border-subtle bg-surface-1 text-text-muted hover:text-text-primary"
                    }`}
                  >
                    {mode.replace("_", " ")}
                  </button>
                ))}
              </div>
              <span className="font-mono text-xs text-text-muted">
                Showing {filteredRecords.length} of {records.length}
              </span>
            </div>

            <div className="overflow-hidden rounded-card border border-border-subtle bg-surface-1">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border-subtle bg-surface-2 font-mono uppercase text-text-muted">
                  <tr>
                    <th className="p-3">Workload / Agent</th>
                    <th className="p-3">Owner / Team</th>
                    <th className="p-3">Confidence</th>
                    <th className="p-3">Signals</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {filteredRecords.map((r) => {
                    const isSelected = selectedRecord.entityUid === r.entityUid;
                    return (
                      <tr
                        key={r.entityUid}
                        onClick={() => setSelectedRecord(r)}
                        className={`cursor-pointer transition hover:bg-surface-2/60 ${
                          isSelected ? "bg-surface-2" : ""
                        }`}
                      >
                        <td className="p-3">
                          <div className="font-mono font-semibold text-text-primary">{r.name}</div>
                          <div className="max-w-[240px] truncate font-mono text-[10px] text-text-muted">
                            {r.entityUid}
                          </div>
                        </td>
                        <td className="p-3">
                          {r.primaryOwnerEmail ? (
                            <div>
                              <div className="font-medium text-text-primary">{r.primaryOwnerEmail}</div>
                              <div className="text-[10px] text-text-muted">{r.owningTeam}</div>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded bg-state-deny-tint px-1.5 py-0.5 font-mono text-[10px] font-semibold text-state-deny">
                              UNOWNED / SHADOW
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-3">
                              <div
                                className={`h-full ${
                                  r.confidenceScore >= 0.8
                                    ? "bg-state-enforce"
                                    : r.confidenceScore >= 0.5
                                    ? "bg-state-pending"
                                    : "bg-state-deny"
                                }`}
                                style={{ width: `${Math.round(r.confidenceScore * 100)}%` }}
                              />
                            </div>
                            <span className="font-mono text-xs font-semibold text-text-primary">
                              {Math.round(r.confidenceScore * 100)}%
                            </span>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {r.evidenceSources.map((ev) => (
                              <span
                                key={ev}
                                className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-text-secondary"
                              >
                                {ev.split(":")[0]}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          {r.isShadowNhi && r.status !== "QUARANTINED" && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleQuarantine(r.entityUid);
                              }}
                              className="rounded border border-state-deny/50 bg-state-deny-tint px-2 py-1 font-mono text-[10px] font-semibold text-state-deny transition hover:bg-state-deny hover:text-white"
                            >
                              QUARANTINE
                            </button>
                          )}
                          {r.status === "QUARANTINED" && (
                            <span className="font-mono text-[10px] font-semibold text-state-deny">
                              QUARANTINED
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Record Detail Panel */}
          <div className="space-y-4 lg:col-span-4">
            <div className="rounded-card border border-border-subtle bg-surface-1 p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold uppercase tracking-wider text-text-muted">
                  ATTRIBUTION DOSSIER
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                    selectedRecord.isShadowNhi
                      ? "border border-state-deny/40 bg-state-deny-tint text-state-deny"
                      : "border border-state-enforce/40 bg-state-enforce-tint text-state-enforce"
                  }`}
                >
                  {selectedRecord.isShadowNhi ? "SHADOW NHI" : "VERIFIED WORKLOAD"}
                </span>
              </div>

              <h2 className="mt-3 font-display text-lg font-bold text-text-primary">
                {selectedRecord.name}
              </h2>
              <p className="mt-1 break-all font-mono text-xs text-text-muted">
                {selectedRecord.entityUid}
              </p>

              <div className="mt-5 space-y-3 divide-y divide-border-subtle text-xs">
                <div className="pt-2">
                  <p className="font-mono uppercase text-text-muted">Primary Contact</p>
                  <p className="mt-1 font-medium text-text-primary">
                    {selectedRecord.primaryOwnerEmail || "None (Creator departed or unverified)"}
                  </p>
                </div>
                <div className="pt-2">
                  <p className="font-mono uppercase text-text-muted">Owning Team</p>
                  <p className="mt-1 font-medium text-text-primary">
                    {selectedRecord.owningTeam || "Unassigned"}
                  </p>
                </div>
                <div className="pt-2">
                  <p className="font-mono uppercase text-text-muted">Confidence Resolution</p>
                  <p className="mt-1 font-mono text-sm font-bold text-brand-orange">
                    {(selectedRecord.confidenceScore * 100).toFixed(0)}%
                  </p>
                </div>
                <div className="pt-2">
                  <p className="font-mono uppercase text-text-muted">Evidence Provenance</p>
                  <ul className="mt-2 space-y-1.5 font-mono text-[11px]">
                    {selectedRecord.evidenceSources.map((ev) => (
                      <li key={ev} className="flex items-center gap-2 text-text-secondary">
                        <span className="size-1.5 rounded-full bg-brand-orange" />
                        <span>{ev}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="pt-2">
                  <p className="font-mono uppercase text-text-muted">Last Attested</p>
                  <p className="mt-1 font-mono text-text-secondary">{selectedRecord.lastAttested}</p>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => alert(`Triggering re-attestation probe for ${selectedRecord.name}...`)}
                  className="w-full rounded-input border border-border-subtle bg-surface-2 py-2 font-mono text-xs font-semibold text-text-primary transition hover:border-border-strong hover:bg-surface-3"
                >
                  Force Identity Re-Attestation
                </button>
                {selectedRecord.isShadowNhi && (
                  <button
                    type="button"
                    onClick={() => handleQuarantine(selectedRecord.entityUid)}
                    className="w-full rounded-input border border-state-deny/40 bg-state-deny-tint py-2 font-mono text-xs font-semibold text-state-deny transition hover:bg-state-deny hover:text-white"
                  >
                    Quarantine Workload Immediately
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Signed AIBOM Manifest Tab */}
      {activeTab === "AIBOM" && (
        <div className="space-y-4">
          <div className="rounded-card border border-border-subtle bg-surface-1 p-5 shadow-sm">
            <div className="flex flex-col justify-between gap-4 border-b border-border-subtle pb-4 sm:flex-row sm:items-center">
              <div>
                <span className="font-mono text-xs font-semibold uppercase tracking-wider text-state-enforce">
                  CYBERNETIC PROVENANCE &bull; CYCLONEDX 1.6
                </span>
                <h2 className="mt-1 font-display text-lg font-bold text-text-primary">
                  Ed25519-Signed AI Bill of Materials (AIBOM)
                </h2>
                <p className="mt-1 text-xs text-text-secondary">
                  Cryptographically binds tool capabilities, base foundation model, and team ownership to runtime execution.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(SIGNED_AIBOM_SAMPLE, null, 2));
                  alert("CycloneDX 1.6 AIBOM JSON copied to clipboard!");
                }}
                className="rounded-input border border-border-subtle bg-surface-2 px-3 py-1.5 font-mono text-xs font-semibold text-text-primary transition hover:bg-surface-3"
              >
                Copy AIBOM Manifest
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-input border border-border-subtle bg-surface-2 p-3 font-mono text-xs">
                <span className="text-text-muted">SIGNING KEY ALGORITHM:</span>
                <div className="mt-1 font-bold text-text-primary">Ed25519 (Pure EdDSA RFC 8032)</div>
              </div>
              <div className="rounded-input border border-border-subtle bg-surface-2 p-3 font-mono text-xs">
                <span className="text-text-muted">CRYPTO SIGNATURE STATUS:</span>
                <div className="mt-1 font-bold text-state-enforce">&check; VALIDATED &bull; INTEGRITY INTACT</div>
              </div>
              <div className="rounded-input border border-border-subtle bg-surface-2 p-3 font-mono text-xs">
                <span className="text-text-muted">SIGNING DID / PUBLIC KEY:</span>
                <div className="mt-1 truncate font-bold text-text-primary">did:key:z6MkuV8zWbKjK3m1oQYq7L9p8X...</div>
              </div>
            </div>

            <div className="mt-4 rounded-card border border-border-subtle bg-canvas p-4">
              <pre className="overflow-x-auto font-mono text-xs leading-relaxed text-text-secondary">
                {JSON.stringify(SIGNED_AIBOM_SAMPLE, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Simulator Tab */}
      {activeTab === "SIMULATOR" && (
        <div className="rounded-card border border-border-subtle bg-surface-1 p-5 shadow-sm">
          <span className="font-mono text-xs font-semibold uppercase tracking-wider text-brand-orange">
            RUST ENGINE REPL &bull; attribution::resolve_ownership
          </span>
          <h2 className="mt-1 font-display text-lg font-bold text-text-primary">
            Attribution Algorithm Sandbox
          </h2>
          <p className="mt-1 text-xs text-text-secondary">
            Test arbitrary OAuth CIMD contact URIs, CODEOWNERS lines, and Slack metadata against the multi-signal attribution heuristic.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <div>
                <label className="block font-mono text-xs text-text-muted">Entity UID / SPIFFE ID</label>
                <input
                  type="text"
                  value={simEntity}
                  onChange={(e) => setSimEntity(e.target.value)}
                  className="mt-1 w-full rounded-input border border-border-subtle bg-surface-2 px-3 py-2 font-mono text-xs text-text-primary focus:border-border-strong focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-mono text-xs text-text-muted">OAuth 2.1 CIMD Contact Email</label>
                <input
                  type="text"
                  value={simCimd}
                  placeholder="e.g. engineer@corp.internal"
                  onChange={(e) => setSimCimd(e.target.value)}
                  className="mt-1 w-full rounded-input border border-border-subtle bg-surface-2 px-3 py-2 font-mono text-xs text-text-primary focus:border-border-strong focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-mono text-xs text-text-muted">GitHub .github/CODEOWNERS Team</label>
                <input
                  type="text"
                  value={simCodeowners}
                  placeholder="e.g. @platform-sec"
                  onChange={(e) => setSimCodeowners(e.target.value)}
                  className="mt-1 w-full rounded-input border border-border-subtle bg-surface-2 px-3 py-2 font-mono text-xs text-text-primary focus:border-border-strong focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-mono text-xs text-text-muted">Cloud IAM / K8s Owner Tag</label>
                <input
                  type="text"
                  value={simCloudTag}
                  placeholder="e.g. owner=finops-lead@corp.internal"
                  onChange={(e) => setSimCloudTag(e.target.value)}
                  className="mt-1 w-full rounded-input border border-border-subtle bg-surface-2 px-3 py-2 font-mono text-xs text-text-primary focus:border-border-strong focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-mono text-xs text-text-muted">Slack App Installer Email</label>
                <input
                  type="text"
                  value={simSlack}
                  placeholder="e.g. devon@corp.internal"
                  onChange={(e) => setSimSlack(e.target.value)}
                  className="mt-1 w-full rounded-input border border-border-subtle bg-surface-2 px-3 py-2 font-mono text-xs text-text-primary focus:border-border-strong focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-mono text-xs text-text-muted">Git Blame / Commit Author (&lt;180d)</label>
                <input
                  type="text"
                  value={simGitBlame}
                  placeholder="e.g. committer@corp.internal"
                  onChange={(e) => setSimGitBlame(e.target.value)}
                  className="mt-1 w-full rounded-input border border-border-subtle bg-surface-2 px-3 py-2 font-mono text-xs text-text-primary focus:border-border-strong focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="activeInIdp"
                  checked={simActiveInIdp}
                  onChange={(e) => setSimActiveInIdp(e.target.checked)}
                  className="size-4 rounded border-border-subtle bg-surface-2 text-brand-orange"
                />
                <label htmlFor="activeInIdp" className="font-mono text-xs text-text-primary">
                  Creator is actively employed in corporate IdP (Okta / Entra ID)
                </label>
              </div>
            </div>

            {/* Simulation Output Card */}
            <div className="flex flex-col justify-between rounded-card border border-border-subtle bg-canvas p-5">
              <div>
                <span className="font-mono text-xs uppercase tracking-wider text-text-muted">
                  SIMULATION EVALUATION RESULT
                </span>
                <div className="mt-4 flex items-center gap-3">
                  <div className="font-mono text-4xl font-extrabold text-brand-orange">
                    {(simResult.score * 100).toFixed(0)}%
                  </div>
                  <div>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 font-mono text-xs font-semibold ${
                        simResult.shadow
                          ? "border border-state-deny/40 bg-state-deny-tint text-state-deny"
                          : "border border-state-enforce/40 bg-state-enforce-tint text-state-enforce"
                      }`}
                    >
                      {simResult.shadow ? "SHADOW NHI DETECTED" : "VERIFIED ATTRIBUTION"}
                    </span>
                  </div>
                </div>

                <div className="mt-6 space-y-3 text-xs">
                  <div>
                    <span className="font-mono text-text-muted">RESOLVED PRIMARY OWNER:</span>
                    <div className="mt-1 font-mono font-semibold text-text-primary">
                      {simResult.owner || "None (Shadow Workload)"}
                    </div>
                  </div>
                  <div>
                    <span className="font-mono text-text-muted">RESOLVED OWNING TEAM:</span>
                    <div className="mt-1 font-mono font-semibold text-text-primary">
                      {simResult.team || "Unassigned"}
                    </div>
                  </div>
                  <div>
                    <span className="font-mono text-text-muted">PRIMARY EVIDENCE RULE:</span>
                    <div className="mt-1 font-mono text-text-secondary">{simResult.reason}</div>
                  </div>
                </div>
              </div>

              <div className="mt-8 rounded-input border border-border-subtle bg-surface-1 p-3 text-[11px] text-text-muted">
                Confidence heuristic follows Phase 3 Rust rulebook: CIMD + CODEOWNERS (0.95) &gt; Cloud IAM Tag (0.80) &gt; Slack Installer (0.70) &gt; Git Blame (0.60). Inactive in IdP results in 0.00 confidence.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
