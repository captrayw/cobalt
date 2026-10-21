import { useEffect, useSyncExternalStore } from 'react';
import { useApp } from './store';

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';
const LIGHT_QUERY = '(prefers-color-scheme: light)';
/** The bg token of each theme, for the browser's status bar. */
const THEME_BG = { dark: '#090C12', light: '#F1F3F7' } as const;

const subscribeTo = (media: string) => (onChange: () => void) => {
  const query = window.matchMedia(media);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
const subscribeReduce = subscribeTo(REDUCE_QUERY);
const subscribeLight = subscribeTo(LIGHT_QUERY);

const systemReduces = () => window.matchMedia(REDUCE_QUERY).matches;
const systemLight = () => window.matchMedia(LIGHT_QUERY).matches;

/** True when colors should switch instantly and nothing should slide. */
export function useReducedMotion(): boolean {
  const setting = useApp((s) => s.settings.reducedMotion);
  const system = useSyncExternalStore(subscribeReduce, systemReduces, () => false);
  return setting === 'reduce' || (setting === 'system' && system);
}

/** Apply the theme and motion settings to the document root. */
export function useAppearance(): void {
  const theme = useApp((s) => s.settings.theme);
  const light = useSyncExternalStore(subscribeLight, systemLight, () => false);
  const reduced = useReducedMotion();
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
    const resolved = theme === 'system' ? (light ? 'light' : 'dark') : theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_BG[resolved]);
  }, [theme, light]);
  useEffect(() => {
    document.documentElement.dataset.motion = reduced ? 'reduce' : 'allow';
  }, [reduced]);
}
