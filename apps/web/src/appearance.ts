import { useEffect, useSyncExternalStore } from 'react';
import { useApp } from './store';

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReduce(onChange: () => void) {
  const query = window.matchMedia(REDUCE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

const systemReduces = () => window.matchMedia(REDUCE_QUERY).matches;

/** True when colors should switch instantly and nothing should slide. */
export function useReducedMotion(): boolean {
  const setting = useApp((s) => s.settings.reducedMotion);
  const system = useSyncExternalStore(subscribeReduce, systemReduces, () => false);
  return setting === 'reduce' || (setting === 'system' && system);
}

/** Apply the theme and motion settings to the document root. */
export function useAppearance(): void {
  const theme = useApp((s) => s.settings.theme);
  const reduced = useReducedMotion();
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    document.documentElement.dataset.motion = reduced ? 'reduce' : 'allow';
  }, [reduced]);
}
