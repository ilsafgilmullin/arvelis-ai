import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ControlApp } from './ControlApp';
import './control.css';

const root = document.getElementById('control-root');

if (!root) {
  throw new Error('ARVELIS CONTROL root element not found');
}

createRoot(root).render(
  <StrictMode>
    <ControlApp />
  </StrictMode>,
);
