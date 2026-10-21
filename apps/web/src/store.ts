import { NullAudioEngine, WebAudioEngine, type AudioEngine } from '@calm/audio';
import { emptyMemory, newSeed, PACE_PRESETS, prepareValidSession, type LingerMode, type Memory, type PaceId } from '@calm/core';
import * as core from '@calm/core';
import { create } from 'zustand';
import { FeedController } from './feed/controller';
import { navigate } from './router';
import { createRepo, finalizeSession, recoverOpenSessions, ulid, type CalmRepo } from './storage';
import { DEFAULT_SETTINGS, type SessionDoc, type Settings } from './storage/types';

export interface AppState {
  ready: boolean;
  repo: CalmRepo | null;
  settings: Settings;
  memory: Memory;
  /** The most recent finished session, for the line on the Done screen. */
  lastSession: SessionDoc | null;
  /** The running feed, if any. */
  feed: FeedController | null;
  /** The session shown on the Summary screen. */
  summary: SessionDoc | null;
  /** Plain-language note when storage is unavailable or a save failed; cleared by the next good save. */
  storageNote: string | null;
}

export const useApp = create<AppState>(() => ({
  ready: false,
  repo: null,
  settings: DEFAULT_SETTINGS,
  memory: emptyMemory(),
  lastSession: null,
  feed: null,
  summary: null,
  storageNote: null,
}));

const NO_STORAGE = 'This browser is not letting cobalt store data, so sessions will not be remembered.';
const NOT_SAVED = 'This session could not be saved on this device.';

/**
 * QA hook for the end-to-end tests: app state and the core, in development or when a test has set
 * sessionStorage "calm-qa". Production pages do not expose it otherwise.
 */
declare global {
  interface Window {
    __calm?: { getState: typeof useApp.getState; core: typeof core };
  }
}
function qaEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return sessionStorage.getItem('calm-qa') === '1';
  } catch {
    return false;
  }
}
if (typeof window !== 'undefined' && qaEnabled()) window.__calm = { getState: useApp.getState, core };

/** A running session holds a lock named after it, so another tab's recovery leaves it alone. */
const lockName = (id: string) => `calm-scroll-session-${id}`;
const releaseLocks = new Map<string, () => void>();

async function isSessionLive(id: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.locks?.query) return false;
  try {
    const { held = [] } = await navigator.locks.query();
    return held.some((lock) => lock.name === lockName(id));
  } catch {
    return false;
  }
}

function holdSessionLock(id: string): void {
  if (typeof navigator === 'undefined' || !navigator.locks?.request) return;
  void navigator.locks
    .request(lockName(id), () => new Promise<void>((resolve) => releaseLocks.set(id, resolve)))
    .catch(() => undefined);
}

function releaseSessionLock(id: string): void {
  releaseLocks.get(id)?.();
  releaseLocks.delete(id);
}

/** Settings changed before storage opened, saved once it has. */
let pendingSettings: Partial<Settings> = {};

/** Open storage, finish any session a closed app left open, and load settings and memory. */
export async function initApp(): Promise<void> {
  try {
    const repo = createRepo();
    const recovered = await recoverOpenSessions(repo, Date.now(), isSessionLive).catch(() => 0);
    const [stored, memory, lastSession] = await Promise.all([repo.loadSettings(), repo.loadMemory(), repo.lastSession()]);
    const early = pendingSettings;
    pendingSettings = {};
    useApp.setState({ ready: true, repo, settings: { ...stored, ...early }, memory, lastSession });
    if (Object.keys(early).length > 0) await repo.saveSettings(early).catch(() => useApp.setState({ storageNote: NO_STORAGE }));
    if (recovered > 0) console.info(`cobalt: scored ${recovered} unfinished session(s) from last time.`);
  } catch (error) {
    console.warn('cobalt storage unavailable', error);
    useApp.setState({ ready: true, repo: null, storageNote: NO_STORAGE });
  }
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const { repo, ready, settings, feed } = useApp.getState();
  useApp.setState({ settings: { ...settings, ...patch } });
  if (patch.volumeDb !== undefined) feed?.setVolume(patch.volumeDb);
  if (!ready) {
    pendingSettings = { ...pendingSettings, ...patch };
    return;
  }
  if (!repo) return;
  try {
    // The change is already on screen; the stored copy is not read back over newer changes.
    await repo.saveSettings(patch);
    if (useApp.getState().storageNote === NO_STORAGE) useApp.setState({ storageNote: null });
  } catch {
    useApp.setState({ storageNote: NO_STORAGE });
  }
}

/** Re-read settings, memory and the last session, e.g. after an import. */
export async function reloadFromRepo(): Promise<void> {
  const { repo } = useApp.getState();
  if (!repo) return;
  const [settings, memory, lastSession] = await Promise.all([repo.loadSettings(), repo.loadMemory(), repo.lastSession()]);
  useApp.setState({ settings, memory, lastSession });
}

/** A Web Audio engine, or a silent one where the browser has no Web Audio. */
export function createEngine(volumeDb: number): AudioEngine {
  const hasWebAudio = typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window);
  return hasWebAudio ? new WebAudioEngine({ volumeDb }) : new NullAudioEngine();
}

/** Clear remembered pages and stored sessions, after a snapshot of the memory. Settings stay. */
export async function resetMemory(): Promise<void> {
  const { repo } = useApp.getState();
  if (repo) await repo.reset(Date.now());
  useApp.setState({ memory: emptyMemory(), lastSession: null });
}

/** Owner change (Oct 2026): every session uses the 5 to 10 s pace and the gradual linger rhythm. */
const PACE: PaceId = 'standard';
const RHYTHM: LingerMode = 'gradual';

/**
 * Start a fresh session. The session is generated, passes all nine checks, and draws on memory
 * when the switch is on. With `gesture` (a tap or key press, as on "Start next session") audio
 * unlocks at once; without it (opening the app) sound starts with the first touch in the feed.
 */
export function startSession(gesture: boolean): void {
  const state = useApp.getState();
  if (state.feed && state.feed.state.status !== 'ended') {
    navigate('feed');
    return;
  }
  const { settings, memory } = state;
  const session = prepareValidSession({ ...PACE_PRESETS[PACE], memory, useMemory: settings.useMemory }, newSeed);
  const id = ulid(Date.now());
  const feed = new FeedController(
    { id, session, mode: RHYTHM, pace: PACE, useMemory: settings.useMemory, memory: settings.useMemory ? memory : null, night: settings.night },
    {
      engine: createEngine(settings.volumeDb),
      hooks: {
        checkpoint: (doc) => {
          void useApp.getState().repo?.checkpoint(doc).catch(() => undefined);
        },
        finish: (doc) => void finishSession(doc),
      },
    },
  );
  holdSessionLock(id);
  useApp.setState({ feed, summary: null });
  feed.start(gesture);
  navigate('feed');
}

/** Score and learn from a finished session, show the summary, then save memory and the session together. */
async function finishSession(doc: SessionDoc): Promise<void> {
  const { memory: before, repo } = useApp.getState();
  const result = finalizeSession(before, doc, Date.now(), 'done');
  navigate('summary', true);
  useApp.setState({ memory: result.memory, summary: result.doc, lastSession: result.doc, feed: null });
  try {
    await repo?.finishSession(result.memory, result.doc);
    if (useApp.getState().storageNote === NOT_SAVED) useApp.setState({ storageNote: null });
  } catch {
    // Memory goes back to what is stored, so this session is never learned twice: if a checkpoint
    // of it was saved, the next launch recovers it.
    useApp.setState({ memory: before, storageNote: NOT_SAVED });
  } finally {
    releaseSessionLock(doc.id);
  }
}
