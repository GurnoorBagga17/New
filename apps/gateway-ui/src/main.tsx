/**
 * Axiom NHI Gateway UI - Main Entry Point
 * Team 7B: Module 1B (Live Traffic) + Module 1D (Kill Switch)
 * Apache-2.0 License
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/tokens.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
