import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/styles/tokens.css';
import { HudApp } from './HudApp.js';
import { HudScale } from './HudScale.js';

/**
 * The HUD is laid out at one fixed size and then shrunk to suit the screen it landed on; the
 * main process works out the factor from the display and passes it in on the URL.
 */
const scale = Number(new URLSearchParams(window.location.search).get('scale'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HudScale scale={Number.isFinite(scale) && scale > 0 ? scale : 1}>
      <HudApp />
    </HudScale>
  </StrictMode>,
);
