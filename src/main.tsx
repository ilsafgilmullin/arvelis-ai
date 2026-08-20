import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';
import './mobile-polish.css';
import './qa-hardening.css';
import './runtime-polish.css';
import './layout-hardening.css';
import './product-polish.css';
import './post-merge-mobile-qa.css';
import './smart-entry.css';
import './smart-entry-responsive.css';
import './chat-experience.css';
import './chat-features.css';
import './chat-refactor-v2.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element not found');
}

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
