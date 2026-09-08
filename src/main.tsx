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
import './chat-experience.css';
import './chat-features.css';
import './chat-refactor-v2.css';
import './chat-history-v2.css';
import './chat-runtime-hardening-v2.css';
import './app-foundation-v1.css';
import './auth-foundation-v2.css';
import './real-auth-v1.css';
import './account-security.css';
import './home-foundation-v1.css';
import './profile-foundation-v1.css';
import './profile-auth-mobile-qa.css';
import './history-foundation-v1.css';
import './travel/travel-foundation-v1.css';
import './travel/travel-acceptance-v1.css';
import './travel/travel-v2-shell.css';
import './travel/travel-v2-home.css';
import './travel/travel-v2-workspace.css';
import './travel/travel-v2-responsive.css';
import './travel/travel-v2-auth.css';
import './travel/travel-v2-polish.css';

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
