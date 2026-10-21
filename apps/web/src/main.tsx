// Self-hosted fonts (latin subsets only): bundled and precached, never fetched from a third party.
import '@fontsource/unbounded/latin-600.css';
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-600.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/feed.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { initApp } from './store';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void initApp();

// Offline support: precache the app shell and assets. Updates apply on the next launch.
if (import.meta.env.PROD) registerSW({ immediate: true });
