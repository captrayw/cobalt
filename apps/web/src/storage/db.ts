import { wrap, type DBSchema, type IDBPDatabase } from 'idb';
import type { SessionDoc, SnapshotDoc } from './types';

/**
 * IndexedDB database for everything cobalt keeps on the device. Its name is from before the app
 * was renamed and must stay: a new name would open an empty database and leave the stored data behind.
 */
export const DB_NAME = 'calm-scroll';
export const DB_VERSION = 1;

export const STORES = {
  memory: 'memory',
  sessions: 'sessions',
  settings: 'settings',
  snapshots: 'snapshots',
} as const;

/** The memory store holds a single document under this key. */
export const MEMORY_KEY = 'current';

/** One stored setting, keyed by its name. */
export interface SettingRow {
  v: 1;
  name: string;
  value: unknown;
}

export interface CalmSchema extends DBSchema {
  /** Values are checked and migrated on read, so they are typed loosely here. */
  memory: { key: string; value: unknown };
  sessions: { key: string; value: SessionDoc; indexes: { startedAt: number; status: string } };
  settings: { key: string; value: unknown };
  snapshots: { key: number; value: SnapshotDoc };
}

export type CalmDb = IDBPDatabase<CalmSchema>;

/**
 * Opens (and creates or upgrades) the database. Pass a factory to isolate tests; otherwise the
 * browser's indexedDB is used. Forward store migrations go in the upgrade step, one block per version.
 * `onClose` runs when the connection ends: another tab upgrading, or the browser dropping it.
 */
export function openCalmDb(name: string = DB_NAME, factory?: IDBFactory, onClose?: () => void): Promise<CalmDb> {
  const request = (factory ?? indexedDB).open(name, DB_VERSION);
  request.addEventListener('upgradeneeded', (event) => {
    const db = wrap(request.result) as unknown as CalmDb;
    if (event.oldVersion < 1) {
      db.createObjectStore(STORES.memory);
      const sessions = db.createObjectStore(STORES.sessions, { keyPath: 'id' });
      sessions.createIndex('startedAt', 'startedAt');
      sessions.createIndex('status', 'status');
      db.createObjectStore(STORES.settings);
      db.createObjectStore(STORES.snapshots, { keyPath: 'at' });
    }
  });
  return (wrap(request) as Promise<unknown>).then((value) => {
    const db = value as CalmDb;
    // Let a newer version of the app (another tab) upgrade the schema.
    db.addEventListener('versionchange', () => {
      db.close();
      onClose?.();
    });
    // The browser can drop the connection, for example when site data is cleared.
    db.addEventListener('close', () => onClose?.());
    return db;
  });
}
