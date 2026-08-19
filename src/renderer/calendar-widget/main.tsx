import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/styles/tokens.css';
import { CalendarWidgetApp } from './CalendarWidgetApp.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CalendarWidgetApp />
  </StrictMode>,
);
