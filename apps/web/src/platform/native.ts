/**
 * The iPhone app runs this same web app inside a native shell (Capacitor; see apps/web/ios). There
 * a few things go through cobalt's own plugin (ios/App/App/Cobalt.swift), because an app's web view
 * does not honor the web's wake lock or vibration and cannot download files. On the web, none of
 * this loads.
 */
interface CobaltPlugin {
  feed(options: { active: boolean }): Promise<void>;
  tap(): Promise<void>;
  share(options: { name: string; text: string }): Promise<{ completed: boolean }>;
}

type CapacitorGlobal = { Capacitor?: { isNativePlatform?: () => boolean } };

/** True inside the iPhone app: its native bridge is in place before any page script runs. */
export const inNativeApp = (globalThis as CapacitorGlobal).Capacitor?.isNativePlatform?.() === true;

// Kept in an object: a plugin proxy answers every property, `then` included, so a promise must
// never resolve to the proxy itself.
let loaded: Promise<{ plugin: CobaltPlugin }> | null = null;
function native(): Promise<{ plugin: CobaltPlugin }> {
  loaded ??= import('@capacitor/core').then(({ registerPlugin }) => ({ plugin: registerPlugin<CobaltPlugin>('Cobalt') }));
  return loaded;
}

/** While pages are showing: the screen stays on, and a swipe up from the bottom edge stays in the feed. */
export async function setFeedActive(active: boolean): Promise<void> {
  const { plugin } = await native();
  await plugin.feed({ active });
}

/** A light tap from the phone's Taptic Engine. */
export async function tap(): Promise<void> {
  const { plugin } = await native();
  await plugin.tap();
}

/** Offers a text file through the share sheet (Save to Files, AirDrop, Mail); true once it was saved or sent. */
export async function shareFile(name: string, text: string): Promise<boolean> {
  const { plugin } = await native();
  return (await plugin.share({ name, text })).completed;
}
