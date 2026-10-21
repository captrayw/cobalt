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
import { initApp, useApp } from './store';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void initApp();

// Offline support: the service worker precaches the app shell and assets. A new version waits, and
// is applied (with a reload) only between sessions while the app is in the background, so it never
// cuts a session short. Closing every window also applies it, as usual.
if (import.meta.env.PROD) {
  let updateWaiting = false;
  const applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateWaiting = true;
      applyWhenIdle();
    },
  });
  function applyWhenIdle() {
    const feed = useApp.getState().feed;
    const sessionRunning = feed !== null && feed.state.status !== 'ended';
    if (updateWaiting && !sessionRunning && document.visibilityState === 'hidden') void applyUpdate(true);
  }
  document.addEventListener('visibilitychange', applyWhenIdle);
}
