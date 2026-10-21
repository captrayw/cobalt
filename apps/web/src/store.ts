import { NullAudioEngine, WebAudioEngine, type AudioEngine } from '@calm/audio';
import { emptyMemory, newSeed, PACE_PRESETS, prepareValidSession, type Memory } from '@calm/core';
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
  /** The most recent finished session, for the line on Home. */
  lastSession: SessionDoc | null;
  /** The running feed, if any. */
  feed: FeedController | null;
  /** The session shown on the Summary screen. */
  summary: SessionDoc | null;
  /** Plain-language note when storage is unavailable or a save failed. */
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

const NO_STORAGE = 'This browser is not letting Calm Scroll store data, so sessions will not be remembered.';

// QA hook for the end-to-end tests and the developer screen: read-only access to app state and the core.
declare global {
  interface Window {
    __calm?: { getState: typeof useApp.getState; core: typeof core };
  }
}
if (typeof window !== 'undefined') window.__calm = { getState: useApp.getState, core };

/** Open storage, finish any session a closed app left open, and load settings and memory. */
export async function initApp(): Promise<void> {
  try {
    const repo = createRepo();
    const recovered = await recoverOpenSessions(repo, Date.now()).catch(() => 0);
    const [settings, memory, lastSession] = await Promise.all([repo.loadSettings(), repo.loadMemory(), repo.lastSession()]);
    useApp.setState({ ready: true, repo, settings, memory, lastSession });
    if (recovered > 0) console.info(`Calm Scroll: scored ${recovered} unfinished session(s) from last time.`);
  } catch (error) {
    console.warn('Calm Scroll storage unavailable', error);
    useApp.setState({ ready: true, repo: null, storageNote: NO_STORAGE });
  }
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const { repo, settings, feed } = useApp.getState();
  const next = { ...settings, ...patch };
  useApp.setState({ settings: next });
  if (patch.volumeDb !== undefined) feed?.setVolume(patch.volumeDb);
  try {
    if (repo) useApp.setState({ settings: await repo.saveSettings(patch) });
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

function createEngine(volumeDb: number): AudioEngine {
  const hasWebAudio = typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window);
  return hasWebAudio ? new WebAudioEngine({ volumeDb }) : new NullAudioEngine();
}

/**
 * Start a fresh session. Call it inside the tap or key press, so the audio context can unlock.
 * The session is generated, passes all nine checks, and draws on memory when the switch is on.
 */
export function startSession(): void {
  const state = useApp.getState();
  if (state.feed && state.feed.state.status !== 'ended') {
    navigate('feed');
    return;
  }
  const { settings, memory } = state;
  const session = prepareValidSession({ ...PACE_PRESETS[settings.pace], memory, useMemory: settings.useMemory }, newSeed);
  const feed = new FeedController(
    { id: ulid(Date.now()), session, mode: settings.lingerMode, pace: settings.pace, useMemory: settings.useMemory },
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
  useApp.setState({ feed, summary: null });
  feed.start();
  navigate('feed');
}

/** Score and learn from a finished session, show the summary, then save memory and the session together. */
async function finishSession(doc: SessionDoc): Promise<void> {
  const { memory, repo } = useApp.getState();
  const result = finalizeSession(memory, doc, Date.now(), 'done');
  navigate('summary', true);
  useApp.setState({ memory: result.memory, summary: result.doc, lastSession: result.doc, feed: null });
  try {
    await repo?.finishSession(result.memory, result.doc);
  } catch {
    useApp.setState({ storageNote: 'This session could not be saved on this device.' });
  }
}
