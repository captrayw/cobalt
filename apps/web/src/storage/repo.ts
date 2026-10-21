import { emptyMemory, type Memory } from '@calm/core';
import type { IDBPObjectStore, StoreNames } from 'idb';
import type { z } from 'zod';
import { DB_NAME, MEMORY_KEY, openCalmDb, STORES, type CalmDb, type CalmSchema, type SettingRow } from './db';
import { migrateMemory, migrateSession, migrateSettingValue, migrateSnapshot, needsMigration } from './migrate';
import { ExportFileSchema, MemorySchema, SessionDocSchema, SettingsSchema, describeIssue } from './schema';
import { DEFAULT_SETTINGS, type ExportFile, type SessionDoc, type Settings, type SnapshotDoc, type SnapshotReason } from './types';

/** Retention rules from the brief. */
export const SESSION_RETENTION = 50;
export const SNAPSHOT_RETENTION = 5;
export const MEMORY_SIZE_LIMIT = 64 * 1024;

/** Everything the app reads and writes on the device. All personal data stays in IndexedDB. */
export interface CalmRepo {
  /** The memory document, or empty memory when there is none. */
  loadMemory(): Promise<Memory>;
  /** Saves memory and the finished session together, in one transaction, then keeps the last 50 sessions. */
  finishSession(memory: Memory, session: SessionDoc): Promise<void>;
  /** Stores the in-progress session with status "open". Cheap: it is validated when recovered. */
  checkpoint(session: SessionDoc): Promise<void>;
  /** Checkpoints of sessions that never finished, oldest first. */
  openSessions(): Promise<SessionDoc[]>;
  /** Finished sessions, newest first. */
  recentSessions(limit?: number): Promise<SessionDoc[]>;
  lastSession(): Promise<SessionDoc | null>;
  /** Defaults merged with the stored settings; a stored value that is not valid is ignored. */
  loadSettings(): Promise<Settings>;
  saveSettings(patch: Partial<Settings>): Promise<Settings>;
  /** Snapshots, newest first. */
  listSnapshots(): Promise<SnapshotDoc[]>;
  /** Keeps a copy of memory; the last 5 copies are kept. */
  snapshot(reason: SnapshotReason, memory: Memory, at: number): Promise<void>;
  /** Snapshots memory, then clears memory and sessions. Settings stay. */
  reset(at: number): Promise<void>;
  /** Snapshots memory, then replaces memory, sessions and settings with the file's, in one transaction. */
  replaceAll(file: ExportFile, at: number): Promise<void>;
  close(): void;
}

type WritableStore<Name extends StoreNames<CalmSchema>, Tx extends ArrayLike<StoreNames<CalmSchema>>> = IDBPObjectStore<
  CalmSchema,
  Tx,
  Name,
  'readwrite'
>;

const byStartedAt = (a: SessionDoc, b: SessionDoc) => a.startedAt - b.startedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function parseOrThrow<T>(schema: z.ZodType<T>, doc: unknown, what: string): T {
  const result = schema.safeParse(doc);
  if (!result.success) throw new Error(`Calm Scroll did not save the ${what}: ${describeIssue(result.error)}`);
  return result.data;
}

function warnIfLarge(memory: Memory): void {
  const bytes = new TextEncoder().encode(JSON.stringify(memory)).length;
  if (bytes > MEMORY_SIZE_LIMIT) console.warn(`Calm Scroll: memory is ${bytes} bytes, above the ${MEMORY_SIZE_LIMIT}-byte budget.`);
}

function readSession(raw: unknown): SessionDoc | null {
  try {
    return migrateSession(raw);
  } catch (error) {
    console.warn('Calm Scroll: skipped a stored session that could not be read.', error);
    return null;
  }
}

/** Memory as stored, migrated when it is in an older format. Unreadable memory reads as empty, keeping the original as raw. */
function readMemory(raw: unknown): { memory: Memory; migrated: boolean; unreadable: boolean } {
  if (raw === undefined) return { memory: emptyMemory(), migrated: false, unreadable: false };
  try {
    return { memory: migrateMemory(raw), migrated: needsMigration(raw), unreadable: false };
  } catch (error) {
    console.warn('Calm Scroll: stored memory could not be read.', error);
    return { memory: emptyMemory(), migrated: false, unreadable: true };
  }
}

/** Adds a snapshot under a free timestamp key, then keeps the newest 5. */
async function putSnapshot<Tx extends ArrayLike<StoreNames<CalmSchema>>>(store: WritableStore<'snapshots', Tx>, snap: SnapshotDoc): Promise<void> {
  let at = snap.at;
  while ((await store.getKey(at)) !== undefined) at += 1;
  await store.put({ ...snap, at });
  const keys = await store.getAllKeys();
  for (const key of keys.slice(0, Math.max(0, keys.length - SNAPSHOT_RETENTION))) await store.delete(key);
}

/** Deletes the oldest sessions beyond the newest 50. */
async function trimSessions<Tx extends ArrayLike<StoreNames<CalmSchema>>>(store: WritableStore<'sessions', Tx>): Promise<void> {
  let excess = (await store.count()) - SESSION_RETENTION;
  let cursor = excess > 0 ? await store.index('startedAt').openCursor() : null;
  while (cursor && excess > 0) {
    await cursor.delete();
    excess -= 1;
    cursor = await cursor.continue();
  }
}

export function createRepo(name: string = DB_NAME, factory?: IDBFactory): CalmRepo {
  let opening: Promise<CalmDb> | null = null;
  const db = () => (opening ??= openCalmDb(name, factory));

  const repo: CalmRepo = {
    async loadMemory() {
      const d = await db();
      const raw = await d.get(STORES.memory, MEMORY_KEY);
      const { memory, migrated } = readMemory(raw);
      if (migrated) {
        // Keep the old document as a snapshot, then store the migrated one.
        const tx = d.transaction([STORES.memory, STORES.snapshots], 'readwrite');
        await putSnapshot(tx.objectStore(STORES.snapshots), { v: 1, at: Date.now(), reason: 'migration', memory, raw });
        await tx.objectStore(STORES.memory).put(memory, MEMORY_KEY);
        await tx.done;
      }
      return memory;
    },

    async finishSession(memory, session) {
      const m = parseOrThrow(MemorySchema, memory, 'memory');
      const s = parseOrThrow(SessionDocSchema, session, 'session');
      warnIfLarge(m);
      const d = await db();
      const tx = d.transaction([STORES.memory, STORES.sessions], 'readwrite');
      const sessions = tx.objectStore(STORES.sessions);
      await tx.objectStore(STORES.memory).put(m, MEMORY_KEY);
      await sessions.put(s);
      await trimSessions(sessions);
      await tx.done;
    },

    async checkpoint(session) {
      const d = await db();
      await d.put(STORES.sessions, { ...session, status: 'open' });
    },

    async openSessions() {
      const d = await db();
      const rows = await d.getAllFromIndex(STORES.sessions, 'status', 'open');
      return rows.map(readSession).filter((s): s is SessionDoc => s !== null && s.status === 'open').sort(byStartedAt);
    },

    async recentSessions(limit = SESSION_RETENTION) {
      const d = await db();
      const out: SessionDoc[] = [];
      let cursor = await d.transaction(STORES.sessions).store.index('startedAt').openCursor(null, 'prev');
      while (cursor && out.length < limit) {
        const doc = readSession(cursor.value);
        if (doc && doc.status !== 'open') out.push(doc);
        cursor = await cursor.continue();
      }
      return out;
    },

    async lastSession() {
      return (await repo.recentSessions(1))[0] ?? null;
    },

    async loadSettings() {
      const d = await db();
      const tx = d.transaction(STORES.settings);
      const [keys, values] = await Promise.all([tx.store.getAllKeys(), tx.store.getAll()]);
      const settings: Settings = { ...DEFAULT_SETTINGS };
      keys.forEach((key, i) => {
        if (!Object.hasOwn(DEFAULT_SETTINGS, key)) return;
        const name = key as keyof Settings;
        const value = migrateSettingValue(name, values[i]);
        if (value !== undefined) (settings as Record<keyof Settings, unknown>)[name] = value;
      });
      return settings;
    },

    async saveSettings(patch) {
      const rows: SettingRow[] = [];
      for (const [name, value] of Object.entries(patch)) {
        if (value === undefined) continue;
        if (!Object.hasOwn(SettingsSchema.shape, name)) throw new Error(`There is no setting called ${name}.`);
        const result = SettingsSchema.shape[name as keyof Settings].safeParse(value);
        if (!result.success) throw new Error(`The ${name} setting cannot be ${JSON.stringify(value)}.`);
        rows.push({ v: 1, name, value: result.data });
      }
      const d = await db();
      const tx = d.transaction(STORES.settings, 'readwrite');
      for (const row of rows) await tx.store.put(row, row.name);
      await tx.done;
      return repo.loadSettings();
    },

    async listSnapshots() {
      const d = await db();
      const rows = await d.getAll(STORES.snapshots);
      const snaps: SnapshotDoc[] = [];
      for (const row of rows) {
        try {
          snaps.push(migrateSnapshot(row));
        } catch (error) {
          console.warn('Calm Scroll: skipped a snapshot that could not be read.', error);
        }
      }
      return snaps.sort((a, b) => b.at - a.at);
    },

    async snapshot(reason, memory, at) {
      const m = parseOrThrow(MemorySchema, memory, 'snapshot');
      const d = await db();
      const tx = d.transaction(STORES.snapshots, 'readwrite');
      await putSnapshot(tx.store, { v: 1, at, reason, memory: m });
      await tx.done;
    },

    async reset(at) {
      const d = await db();
      const tx = d.transaction([STORES.memory, STORES.sessions, STORES.snapshots], 'readwrite');
      const raw = await tx.objectStore(STORES.memory).get(MEMORY_KEY);
      const { memory, migrated, unreadable } = readMemory(raw);
      await putSnapshot(tx.objectStore(STORES.snapshots), { v: 1, at, reason: 'reset', memory, ...(migrated || unreadable ? { raw } : {}) });
      await tx.objectStore(STORES.memory).delete(MEMORY_KEY);
      await tx.objectStore(STORES.sessions).clear();
      await tx.done;
    },

    async replaceAll(file, at) {
      const parsed = parseOrThrow(ExportFileSchema, file, 'import');
      const d = await db();
      const tx = d.transaction([STORES.memory, STORES.sessions, STORES.settings, STORES.snapshots], 'readwrite');
      const memoryStore = tx.objectStore(STORES.memory);
      const sessions = tx.objectStore(STORES.sessions);
      const settings = tx.objectStore(STORES.settings);
      const raw = await memoryStore.get(MEMORY_KEY);
      const { memory, migrated, unreadable } = readMemory(raw);
      await putSnapshot(tx.objectStore(STORES.snapshots), { v: 1, at, reason: 'import', memory, ...(migrated || unreadable ? { raw } : {}) });
      await memoryStore.put(parsed.memory, MEMORY_KEY);
      await sessions.clear();
      for (const s of parsed.sessions) await sessions.put(s);
      await trimSessions(sessions);
      await settings.clear();
      for (const [key, value] of Object.entries(parsed.settings)) await settings.put({ v: 1, name: key, value } satisfies SettingRow, key);
      await tx.done;
    },

    close() {
      const pending = opening;
      opening = null;
      void pending?.then((d) => d.close()).catch(() => undefined);
    },
  };
  return repo;
}
