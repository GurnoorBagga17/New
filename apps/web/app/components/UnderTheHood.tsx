'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';

const EnclaveVisual = dynamic(
  () => import('./EnclaveVisual').then((mod) => mod.EnclaveVisual),
  { ssr: false, loading: () => <div className="p-8 text-center text-sm text-muted">Loading enclave architecture...</div> }
);

const SaaSEcosystemPillars = dynamic(
  () => import('./SaaSEcosystemPillars').then((mod) => mod.SaaSEcosystemPillars),
  { ssr: false, loading: () => <div className="p-8 text-center text-sm text-muted">Loading governance pillars...</div> }
);

export function UnderTheHood() {
  const [openSection, setOpenSection] = useState<'architecture' | 'enclave' | 'pillars' | null>('enclave');

  const toggleSection = (section: 'architecture' | 'enclave' | 'pillars') => {
    setOpenSection((prev) => (prev === section ? null : section));
  };

  return (
    <section className="underthehood-section" id="architecture" aria-label="Under the Hood: Deep Technical Architecture">
      <div className="wrap">
        <div className="section-heading">
          <p className="eyebrow">FORMAL SPECIFICATIONS &amp; PROTOCOLS</p>
          <h2>Under the Hood: Cryptographic enforcement at wire speed.</h2>
          <p>
            Explore our formal Cedar 3.x policy compilation, hardware-bound SPIFFE attestation, and zero-knowledge telemetry trail.
          </p>
        </div>

        <div className="underthehood-accordion" role="region" aria-label="Technical deep dive accordion">
          {/* Item 1: Cryptographic Enclave Architecture */}
          <div className="accordion-item">
            <button
              type="button"
              className="accordion-trigger"
              onClick={() => toggleSection('enclave')}
              aria-expanded={openSection === 'enclave'}
            >
              <div className="trigger-title">
                <span className="trigger-badge">ENTERPRISE ENCLAVE PROFILE</span>
                <strong>Confidential Computing &amp; Nitro Enclave Isolation</strong>
              </div>
              <span className="trigger-chevron">{openSection === 'enclave' ? '−' : '+'}</span>
            </button>
            {openSection === 'enclave' && (
              <div className="accordion-content">
                <p className="accordion-desc">
                  The Axiom Evaluator supports memory-isolated enclave deployment (AWS Nitro Enclaves, GCP Confidential VMs, or AMD SEV-SNP). Static credentials never touch persistent disks and keys stay sealed in hardware memory.
                </p>
                <div className="enclave-embed">
                  <EnclaveVisual />
                </div>
              </div>
            )}
          </div>

          {/* Item 2: Governance Pillars & Dynamic Leasing */}
          <div className="accordion-item">
            <button
              type="button"
              className="accordion-trigger"
              onClick={() => toggleSection('pillars')}
              aria-expanded={openSection === 'pillars'}
            >
              <div className="trigger-title">
                <span className="trigger-badge">SECRETLESS BROKER</span>
                <strong>Zero-Standing-Privilege Dynamic Credential Leasing</strong>
              </div>
              <span className="trigger-chevron">{openSection === 'pillars' ? '−' : '+'}</span>
            </button>
            {openSection === 'pillars' && (
              <div className="accordion-content">
                <p className="accordion-desc">
                  Eliminate perpetual machine API keys. Axiom negotiates short-lived (15–60 minute) dynamic tokens from HashiCorp Vault / OpenBao, STS, and GitHub Apps just-in-time for verified tool calls.
                </p>
                <SaaSEcosystemPillars />
              </div>
            )}
          </div>

          {/* Item 3: Standards Compliance & RFC Matrix */}
          <div className="accordion-item">
            <button
              type="button"
              className="accordion-trigger"
              onClick={() => toggleSection('architecture')}
              aria-expanded={openSection === 'architecture'}
            >
              <div className="trigger-title">
                <span className="trigger-badge">STANDARDS</span>
                <strong>Standards Compliance &amp; Protocol Reference Matrix</strong>
              </div>
              <span className="trigger-chevron">{openSection === 'architecture' ? '−' : '+'}</span>
            </button>
            {openSection === 'architecture' && (
              <div className="accordion-content">
                <div className="standards-grid">
                  <div className="standard-card">
                    <h4>RFC 8707 · Resource Indicators</h4>
                    <p>Enforces audience-restricted bearer token issuance for OAuth 2.0 authorization servers.</p>
                  </div>
                  <div className="standard-card">
                    <h4>SPIFFE / SPIRE Workload ID</h4>
                    <p>Cryptographically verifiable X.509 SVIDs minted per container, pod, and agent runtime.</p>
                  </div>
                  <div className="standard-card">
                    <h4>OCSF 1.1 Audit Logging</h4>
                    <p>Open Cybersecurity Schema Framework compliant structured JSON-RPC security telemetry.</p>
                  </div>
                  <div className="standard-card">
                    <h4>AWS Cedar 3.x Verification</h4>
                    <p>Mathematically sound authorization logic with formal automated policy analysis.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
