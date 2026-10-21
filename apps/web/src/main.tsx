// The website's three families, self-hosted (latin subsets only): bundled and precached, never
// fetched from a third party. Bricolage Grotesque for headings and the wordmark, Instrument Sans
// for text, Space Mono for values.
import '@fontsource/bricolage-grotesque/latin-700.css';
import '@fontsource/bricolage-grotesque/latin-800.css';
import '@fontsource/instrument-sans/latin-400.css';
import '@fontsource/instrument-sans/latin-500.css';
import '@fontsource/instrument-sans/latin-600.css';
import '@fontsource/space-mono/latin-400.css';
import '@fontsource/space-mono/latin-700.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/feed.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { inNativeApp } from './platform/native';
import { initApp, useApp } from './store';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void initApp().then(() => {
  // Debug builds of the iPhone app print this in the Xcode console, and in the CI simulator's log.
  if (inNativeApp) {
    const storage = useApp.getState().repo ? 'open' : 'unavailable';
    console.info(`cobalt: iPhone app ready; storage ${storage}; audio session ${'audioSession' in navigator ? 'yes' : 'no'}`);
  }
});

// Offline support: the service worker precaches the app shell and assets. A new version waits, and
// is applied (with a reload) only between sessions while the app is in the background, so it never
// cuts a session short. Closing every window also applies it, as usual. The iPhone app carries its
// files inside, so it has no service worker.
if (import.meta.env.PROD && !inNativeApp) {
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
