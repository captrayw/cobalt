import { useSyncExternalStore } from 'react';

export type Route = 'home' | 'feed' | 'summary' | 'memory' | 'settings' | 'about' | 'dev';

const ROUTES: readonly Route[] = ['home', 'feed', 'summary', 'memory', 'settings', 'about', 'dev'];

export function parseHash(hash: string): Route {
  const name = hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  return (ROUTES as readonly string[]).includes(name) ? (name as Route) : 'home';
}

export function navigate(route: Route, replace = false): void {
  const hash = route === 'home' ? '#/' : `#/${route}`;
  if (location.hash === hash) return;
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
