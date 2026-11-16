'use client';

import { useState, useEffect } from 'react';
import { AUDIENCE_TABS, type AudienceTab } from '../content/landing';

export function AudienceToggle() {
  const [activeTabId, setActiveTabId] = useState<'security' | 'engineering'>('security');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'engineering' || hash === 'security') {
        setActiveTabId(hash);
      }
    }
  }, []);

  const handleTabChange = (tabId: 'security' | 'engineering') => {
    setActiveTabId(tabId);
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      window.history.replaceState(null, '', `#${tabId}`);
    }
  };

  const currentTab: AudienceTab =
    AUDIENCE_TABS.find((t) => t.id === activeTabId) ?? AUDIENCE_TABS[0]!;

  return (
    <section className="audience-section" id="audience" aria-label="Tailored value propositions for security and engineering">
      <div className="wrap">
        <div className="section-heading">
          <p className="eyebrow">DESIGNED FOR DUAL OWNERSHIP</p>
          <h2>Built for the teams who build agents, and the teams who secure them.</h2>
        </div>

        {/* Tab Switcher Buttons */}
        <div className="audience-tabs-bar" role="tablist" aria-label="Target audience perspectives">
          {AUDIENCE_TABS.map((tab) => {
            const isSelected = activeTabId === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={isSelected}
                aria-controls={`panel-${tab.id}`}
                className={`audience-tab-btn ${isSelected ? 'active' : ''}`}
                onClick={() => handleTabChange(tab.id as 'security' | 'engineering')}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Panel Content */}
        <div
          id={`panel-${currentTab.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${currentTab.id}`}
          className="audience-panel"
        >
          <div className="audience-header">
            <h3>{currentTab.heading}</h3>
            <p>{currentTab.summary}</p>
          </div>

          <div className="audience-features-grid">
            {currentTab.features.map((feat) => (
              <div key={feat.title} className="audience-feature-card">
                <div className="feature-top">
                  <h4>{feat.title}</h4>
                  {feat.spec && <span className="feature-spec">{feat.spec}</span>}
                </div>
                <p>{feat.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
