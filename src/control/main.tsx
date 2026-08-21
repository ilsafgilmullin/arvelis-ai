import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ControlErrorBoundary } from './ControlErrorBoundary';
import { ControlRuntime } from './ControlRuntime';
import './control.css';
import './runtime.css';

const root = document.getElementById('control-root');

if (!root) {
  throw new Error('ARVELIS CONTROL root element not found');
}

createRoot(root).render(
  <StrictMode>
    <ControlErrorBoundary>
      <ControlRuntime />
    </ControlErrorBoundary>
  </StrictMode>,
);

window.requestAnimationFrame(() => {
  window.requestAnimationFrame(() => {
    document.getElementById('control-preboot')?.remove();
  });
});
