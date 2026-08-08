import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/styles/tokens.css';
import { CelebrationApp } from './CelebrationApp.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CelebrationApp />
  </StrictMode>,
);
