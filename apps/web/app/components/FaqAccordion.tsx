'use client';

import React, { useState } from 'react';
import { FAQ_ITEMS } from '../content/landing';

export function FaqAccordion() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const toggle = (idx: number) => setOpenIdx(openIdx === idx ? null : idx);

  return (
    <section className="faq-section" id="faq" aria-label="Frequently Asked Questions">
      <div className="wrap">
        <div className="section-heading">
          <p className="eyebrow">OBJECTION HANDLING &amp; TECHNICAL ARCHITECTURE</p>
          <h2>Frequently Asked Questions</h2>
          <p>
            Learn how Axiom fits into your existing cloud infrastructure, Kubernetes clusters, and autonomous agent loops.
          </p>
        </div>

        <div className="faq-list">
          {FAQ_ITEMS.map((faq, idx) => {
            const isOpen = openIdx === idx;
            return (
              <div key={faq.id} className={`faq-item ${isOpen ? 'is-open' : ''}`}>
                <button
                  type="button"
                  className="faq-question-btn"
                  onClick={() => toggle(idx)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${faq.id}`}
                  id={`faq-question-${faq.id}`}
                >
                  <span className="faq-question-text">{faq.question}</span>
                  <span className="faq-chevron" aria-hidden="true">
                    {isOpen ? '−' : '+'}
                  </span>
                </button>
                {isOpen && (
                  <div
                    id={`faq-answer-${faq.id}`}
                    role="region"
                    aria-labelledby={`faq-question-${faq.id}`}
                    className="faq-answer-content"
                  >
                    <p>{faq.answer}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
