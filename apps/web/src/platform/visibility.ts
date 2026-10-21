/** Calls back with true when the page becomes hidden and false when it is visible again. */
export function watchVisibility(onChange: (hidden: boolean) => void): () => void {
  const handler = () => onChange(document.visibilityState === 'hidden');
  document.addEventListener('visibilitychange', handler);
  if (document.visibilityState === 'hidden') handler();
  return () => document.removeEventListener('visibilitychange', handler);
}

/** Calls back when the page is being unloaded or put in the back-forward cache. */
export function watchPageHide(onHide: () => void): () => void {
  window.addEventListener('pagehide', onHide);
  return () => window.removeEventListener('pagehide', onHide);
}
