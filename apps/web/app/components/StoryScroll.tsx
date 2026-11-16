'use client';

import { useState, useEffect, useRef } from 'react';
import { STORY_STEPS } from '../content/landing';
import { BlastRadiusGraph } from './blast/BlastRadiusGraph';
import { KillSwitchDemo } from './KillSwitchDemo';
import { useReducedMotion } from '../lib/motion';

/**
 * Sample Fixture for Step 1: Discover
 * Visibly labeled as Demo / Sample Environment (Rule 7).
 */
const SAMPLE_DISCOVER_IDENTITIES = [
  {
    id: 'id-01',
    name: 'agent:data-analyst-prod',
    kind: 'Autonomous Agent',
    iconType: 'agent',
    owner: 'data-eng@axiom.security',
    tools: ['postgres_query', 's3_get_object'],
    confidence: '98% (High)',
    status: 'Monitored',
  },
  {
    id: 'id-02',
    name: 'app:github-copilot-workspace',
    kind: 'GitHub App Installation',
    iconType: 'github',
    owner: 'platform-team@axiom.security',
    tools: ['github_list_prs', 'git_commit'],
    confidence: '99% (Attested)',
    status: 'Monitored',
  },
  {
    id: 'id-03',
    name: 'sa:cluster-autoscaler-eu',
    kind: 'K8s Service Account',
    iconType: 'k8s',
    owner: 'infra-sec@axiom.security',
    tools: ['k8s_scale_nodes'],
    confidence: '94% (Attested)',
    status: 'Monitored',
  },
  {
    id: 'id-04',
    name: 'bot:support-summarizer',
    kind: 'Slack Enterprise App',
    iconType: 'slack',
    owner: 'c-support@axiom.security',
    tools: ['slack_post_message', 'zendesk_read'],
    confidence: '88% (Heuristic)',
    status: 'Dormant Key Found',
  },
];

export function StoryScroll() {
  const [activeStepId, setActiveStepId] = useState<'discover' | 'understand' | 'govern'>('discover');
  const prefersReduced = useReducedMotion();

  const step1Ref = useRef<HTMLDivElement>(null);
  const step2Ref = useRef<HTMLDivElement>(null);
  const step3Ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefersReduced) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const stepId = entry.target.getAttribute('data-step-id') as 'discover' | 'understand' | 'govern';
            if (stepId) {
              setActiveStepId(stepId);
            }
          }
        });
      },
      {
        threshold: 0.35,
        rootMargin: '-10% 0px -40% 0px',
      }
    );

    if (step1Ref.current) observer.observe(step1Ref.current);
    if (step2Ref.current) observer.observe(step2Ref.current);
    if (step3Ref.current) observer.observe(step3Ref.current);

    return () => observer.disconnect();
  }, [prefersReduced]);

  const renderStep1Visual = () => (
    <div className="story-fixture-card" aria-label="Sample discovered identities table">
      <div className="fixture-badge-bar">
        <span className="fixture-tag">DEMO ENVIRONMENT</span>
        <span className="fixture-note">Sample read-only scan output · Not customer data</span>
      </div>

      <div className="fixture-table-wrap">
        <table className="fixture-table">
          <thead>
            <tr>
              <th>Identity</th>
              <th>Owner / Human Sponsor</th>
              <th>Authorized Tools</th>
              <th>Attribution</th>
            </tr>
          </thead>
          <tbody>
            {SAMPLE_DISCOVER_IDENTITIES.map((item) => (
              <tr key={item.id}>
                <td>
                  <div className="identity-cell">
                    <span className="identity-icon" aria-hidden="true">
                      {item.iconType === 'agent' && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--brand-cyan)' }}>
                          <rect x="4" y="4" width="16" height="16" rx="2" />
                          <rect x="9" y="9" width="6" height="6" />
                          <line x1="9" y1="1" x2="9" y2="4" />
                          <line x1="15" y1="1" x2="15" y2="4" />
                          <line x1="9" y1="20" x2="9" y2="23" />
                          <line x1="15" y1="20" x2="15" y2="23" />
                          <line x1="20" y1="9" x2="23" y2="9" />
                          <line x1="20" y1="14" x2="23" y2="14" />
                          <line x1="1" y1="9" x2="4" y2="9" />
                          <line x1="1" y1="14" x2="4" y2="14" />
                        </svg>
                      )}
                      {item.iconType === 'github' && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--state-enforce)' }}>
                          <line x1="6" y1="3" x2="6" y2="15" />
                          <circle cx="18" cy="6" r="3" />
                          <circle cx="6" cy="18" r="3" />
                          <path d="M18 9a9 9 0 0 1-9 9" />
                        </svg>
                      )}
                      {item.iconType === 'k8s' && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--brand-purple)' }}>
                          <polygon points="12 2 2 7 12 12 22 7 12 2" />
                          <polyline points="2 17 12 22 22 17" />
                          <polyline points="2 12 12 17 22 12" />
                        </svg>
                      )}
                      {item.iconType === 'slack' && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--state-warning)' }}>
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                      )}
                    </span>
                    <div>
                      <strong>{item.name}</strong>
                      <small>{item.kind}</small>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="owner-text">{item.owner}</span>
                </td>
                <td>
                  <span className="tools-badge">{item.tools.join(', ')}</span>
                </td>
                <td>
                  <span className={`confidence-chip ${item.status === 'Dormant Key Found' ? 'chip-warn' : 'chip-good'}`}>
                    {item.confidence}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderStep2Visual = () => <BlastRadiusGraph />;

  const renderStep3Visual = () => (
    <div className="story-govern-visual">
      {/* Visual Subpart A: Cedar Policy Snippet beside Live Intercept */}
      <div className="govern-cedar-split">
        <div className="govern-code-block">
          <div className="code-header">
            <span>policy.cedar</span>
            <span className="code-lang">AWS Cedar 3.x</span>
          </div>
          <pre>
            <code>
{`permit(
  principal == Axiom::Agent::"data-analyst",
  action    == Axiom::Action::"tools/call",
  resource  == Axiom::Tool::"postgres_query"
)
when {
  context.sql_ast_is_select_only == true &&
  context.tool_pin_hash_valid == true &&
  context.dynamic_lease_active == true
};`}
            </code>
          </pre>
        </div>

        <div className="govern-verdict-preview">
          <div className="verdict-banner-enforce">
            <span className="verdict-dot" />
            <div>
              <strong>INLINE VERDICT: PERMITTED</strong>
              <p>Cedar policy evaluated in <strong>&lt; 5 ms (target)</strong> with zero agent modifications.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Visual Subpart B: Kill Switch Demo */}
      <div className="govern-killswitch-wrap">
        <KillSwitchDemo />
      </div>
    </div>
  );

  return (
    <section className="story-scroll-section" aria-label="Axiom Architecture: Discover, Understand, Govern">
      <div className="wrap">
        {/* Section Heading */}
        <div className="story-heading">
          <span className="eyebrow">CONTINUOUS WORKLOAD LIFECYCLE</span>
          <h2>Three steps from total visibility to inline control.</h2>
          <p>
            You cannot govern what you cannot see. Axiom turns chaotic non-human identity sprawl into continuous, deterministic boundaries.
          </p>
        </div>

        {/* Story Progress Rail */}
        <nav className="story-progress-rail" aria-label="Story sections navigation">
          {STORY_STEPS.map((step) => (
            <a
              key={step.id}
              href={step.anchor}
              className={`progress-rail-item ${activeStepId === step.id ? 'is-active' : ''}`}
              onClick={() => setActiveStepId(step.id)}
            >
              <span className="rail-step-number">{step.stepNumber}</span>
              <span className="rail-step-title">{step.title}</span>
            </a>
          ))}
        </nav>

        {/* Desktop 2-Column or Mobile Stacked Layout */}
        <div className="story-layout">
          {/* Left Column: Narrative Text Blocks */}
          <div className="story-narrative-col">
            {/* Step 1: Discover */}
            <div
              id="discover"
              ref={step1Ref}
              data-step-id="discover"
              className={`story-step-block ${activeStepId === 'discover' ? 'is-active-step' : ''}`}
            >
              <span className="step-pill">STEP 01 · VISIBILITY</span>
              <h3>{STORY_STEPS[0]!.tagline}</h3>
              <p>{STORY_STEPS[0]!.description}</p>

              <ul className="step-features-list">
                {STORY_STEPS[0]!.keyPoints.map((point) => (
                  <li key={point}>✓ {point}</li>
                ))}
              </ul>

              {/* Mobile Inline Visual (rendered stacked on mobile or when reduced motion is preferred) */}
              <div className="story-inline-visual-mobile">
                {renderStep1Visual()}
              </div>
            </div>

            {/* Step 2: Understand */}
            <div
              id="understand"
              ref={step2Ref}
              data-step-id="understand"
              className={`story-step-block ${activeStepId === 'understand' ? 'is-active-step' : ''}`}
            >
              <span className="step-pill">STEP 02 · BLAST RADIUS</span>
              <h3>{STORY_STEPS[1]!.tagline}</h3>
              <p>{STORY_STEPS[1]!.description}</p>

              <ul className="step-features-list">
                {STORY_STEPS[1]!.keyPoints.map((point) => (
                  <li key={point}>✓ {point}</li>
                ))}
              </ul>

              {/* Mobile Inline Visual */}
              <div className="story-inline-visual-mobile">
                {renderStep2Visual()}
              </div>
            </div>

            {/* Step 3: Govern */}
            <div
              id="govern"
              ref={step3Ref}
              data-step-id="govern"
              className={`story-step-block ${activeStepId === 'govern' ? 'is-active-step' : ''}`}
            >
              <span className="step-pill">STEP 03 · INLINE ENFORCEMENT</span>
              <h3>{STORY_STEPS[2]!.tagline}</h3>
              <p>{STORY_STEPS[2]!.description}</p>

              <ul className="step-features-list">
                {STORY_STEPS[2]!.keyPoints.map((point) => (
                  <li key={point}>✓ {point}</li>
                ))}
              </ul>

              {/* Mobile Inline Visual */}
              <div className="story-inline-visual-mobile">
                {renderStep3Visual()}
              </div>
            </div>
          </div>

          {/* Right Column: Sticky Visual Panel (Swaps active graphic via IntersectionObserver on desktop) */}
          <div className="story-sticky-col">
            <div className="story-sticky-panel">
              {activeStepId === 'discover' && renderStep1Visual()}
              {activeStepId === 'understand' && renderStep2Visual()}
              {activeStepId === 'govern' && renderStep3Visual()}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
