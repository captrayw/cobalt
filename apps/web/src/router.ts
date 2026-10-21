import { useSyncExternalStore } from 'react';

/** The feed is the default: opening the app goes straight into scrolling. */
export type Route = 'feed' | 'summary' | 'done' | 'memory' | 'settings' | 'about' | 'dev';

const ROUTES: readonly Route[] = ['feed', 'summary', 'done', 'memory', 'settings', 'about', 'dev'];

export function parseHash(hash: string): Route {
  const name = hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  return (ROUTES as readonly string[]).includes(name) ? (name as Route) : 'feed';
}

export function navigate(route: Route, replace = false): void {
  const hash = route === 'feed' ? '#/' : `#/${route}`;
  if (location.hash === hash || (route === 'feed' && location.hash === '')) return;
  if (replace) location.replace(hash);
  else location.hash = hash;
}

const subscribe = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
};

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, () => parseHash(location.hash));
}
