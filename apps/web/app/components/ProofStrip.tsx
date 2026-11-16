import { CLAIMS } from '../data/claims';
import { WORKS_WITH_INTEGRATIONS } from '../content/landing';

export function ProofStrip() {
  const proofItems = [
    {
      claim: CLAIMS.inlineLatency!,
      label: "Inline P99 Latency",
      detail: "Target gateway policy overhead at runtime",
    },
    {
      claim: CLAIMS.failClosedDeadline!,
      label: "Fail-Closed Deadline",
      detail: "Hard limit; unverified calls reject by default",
    },
    {
      claim: CLAIMS.killSwitchPropagation!,
      label: "Kill Switch Fleet Halt",
      detail: "Emergency revocation target propagation",
    },
    {
      claim: CLAIMS.shadowAuditDuration!,
      label: "Shadow Audit Scan",
      detail: "Read-only agent discovery target speed",
    },
  ];

  return (
    <section className="proof-section" aria-label="Verified security guarantees and integration ecosystem">
      <div className="wrap">
        {/* Row 1: Sourced Numbers Grid */}
        <div className="proof-grid">
          {proofItems.map(({ claim, label, detail }) => (
            <div key={claim.id} className="proof-card">
              <div className="proof-card-header">
                <span className="proof-number">
                  {claim.value} {claim.unit ?? ''}
                </span>
                <span className={`claim-tag claim-tag--${claim.kind}`}>
                  {claim.kind}
                </span>
              </div>
              <h3 className="proof-label">{label}</h3>
              <p className="proof-detail">{detail}</p>
              <div className="proof-source">
                <span>Backed by:</span> <code>{claim.source}</code>
              </div>
            </div>
          ))}
        </div>

        {/* Row 2: Verification Badges */}
        <div className="proof-badges-row">
          <div className="proof-badge">
            <span className="badge-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: 'var(--brand-cyan)' }}>
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
            </span>
            <div className="badge-text">
              <strong>Apache-2.0 Open Core</strong>
              <small>Runtime gateway, Cedar engine &amp; CLI</small>
            </div>
          </div>

          <div className="proof-badge">
            <span className="badge-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: 'var(--state-enforce)' }}>
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <polyline points="9 12 11 14 15 10" />
              </svg>
            </span>
            <div className="badge-text">
              <strong>OWASP NHI &amp; MCP Top 10</strong>
              <small>Automated AST &amp; egress rule coverage</small>
            </div>
          </div>

          <div className="proof-badge">
            <span className="badge-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: 'var(--brand-purple)' }}>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v8" />
                <path d="M8 12h8" />
              </svg>
            </span>
            <div className="badge-text">
              <strong>WCAG 2.1 AA Tokens</strong>
              <small>Verified in automated CI pipeline</small>
            </div>
          </div>
        </div>

        {/* Row 3: Neutral "Works With" Integration Strip (Replaces Marquee) */}
        <div className="works-with-container">
          <span className="works-with-label">WORKS OUT OF THE BOX WITH</span>
          <div className="works-with-list">
            {WORKS_WITH_INTEGRATIONS.map((item) => (
              <div key={item.name} className="works-with-item">
                <span className="works-with-name">{item.name}</span>
                <span className="works-with-kind">{item.kind}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
