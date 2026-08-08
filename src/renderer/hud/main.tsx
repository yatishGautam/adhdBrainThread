import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/styles/tokens.css';
import { HudApp } from './HudApp.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HudApp />
  </StrictMode>,
);
