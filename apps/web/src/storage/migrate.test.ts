import 'fake-indexeddb/auto';
import { emptyMemory, type Memory } from '@calm/core';
import { describe, expect, it, vi } from 'vitest';
import { MEMORY_KEY, openCalmDb, STORES } from './db';
import { finalizeSession } from './finalize';
import {
  docVersion,
  migrateMemory,
  migrateSession,
  migrateSettingRow,
  migrateSettingValue,
  migrateSnapshot,
  MigrationError,
  needsMigration,
} from './migrate';
import { freshRepo, makeSessionDoc, T0 } from './testing';

const learned = (): Memory => finalizeSession(emptyMemory(), makeSessionDoc({ lingerEvery: 7 }), T0, 'done').memory;

describe('memory migrations', () => {
  it('treats a document without v as version 0', () => {
    expect(docVersion({})).toBe(0);
    expect(docVersion({ v: 1 })).toBe(1);
    expect(needsMigration({ pages: {} })).toBe(true);
    expect(needsMigration(emptyMemory())).toBe(false);
  });

  it('0 -> 1 fills the missing parts and keeps what is there', () => {
    const memory = learned();
    const { v: _v, updatedAt: _u, ...old } = memory;
    expect(migrateMemory(old)).toEqual({ ...memory, updatedAt: 0 });
    expect(migrateMemory({})).toEqual(emptyMemory());
    expect(migrateMemory({ pages: null, loops: 'none' })).toEqual(emptyMemory());
  });

  it('leaves a current document as it is', () => {
    const memory = learned();
    expect(migrateMemory(structuredClone(memory))).toEqual(memory);
  });

  it('refuses documents from a newer version and documents that are not valid', () => {
    expect(() => migrateMemory({ ...emptyMemory(), v: 2 })).toThrow(MigrationError);
    expect(() => migrateMemory({ ...emptyMemory(), v: 2 })).toThrow(/newer version/);
    expect(() => migrateMemory('memory')).toThrow(/not a document/);
    const memory = learned();
    const [key] = Object.keys(memory.pages);
    expect(() => migrateMemory({ ...memory, pages: { ...memory.pages, [key]: { ...memory.pages[key], b: -1 } } })).toThrow(/not valid \(pages\./);
    expect(() => migrateMemory({ ...memory, pages: { wrong: memory.pages[key] } })).toThrow(/its own key/);
    expect(() => migrateMemory({ ...memory, feat: { banana: { a: 1, b: 9 } } })).toThrow(/feature key/);
  });

  it('loadMemory migrates a stored version 0 document, saves it as version 1 and keeps the original as a snapshot', async () => {
    const { repo, factory, name } = freshRepo();
    const memory = learned();
    const { v: _v, ...old } = memory;
    const db = await openCalmDb(name, factory);
    await db.put(STORES.memory, old, MEMORY_KEY);

    expect(await repo.loadMemory()).toEqual(memory);
    expect(await db.get(STORES.memory, MEMORY_KEY)).toEqual(memory);
    const [snap] = await repo.listSnapshots();
    expect(snap.reason).toBe('migration');
    expect(snap.memory).toEqual(memory);
    expect(snap.raw).toEqual(old);
    // Already migrated: no second snapshot.
    await repo.loadMemory();
    expect(await repo.listSnapshots()).toHaveLength(1);
    db.close();
  });

  it('reads unreadable stored memory as empty without throwing', async () => {
    const { repo, factory, name } = freshRepo();
    const db = await openCalmDb(name, factory);
    await db.put(STORES.memory, { v: 1, pages: 'garbage' }, MEMORY_KEY);
    db.close();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await repo.loadMemory()).toEqual(emptyMemory());
    expect(warn).toHaveBeenCalled();
    // A reset still keeps the unreadable document in its snapshot.
    await repo.reset(T0);
    const [snap] = await repo.listSnapshots();
    expect(snap.raw).toEqual({ v: 1, pages: 'garbage' });
    warn.mockRestore();
  });
});

describe('session migrations', () => {
  it('0 -> 1 fills defaults for an unversioned session', () => {
    const doc = makeSessionDoc({ watched: 3 });
    const old = {
      id: doc.id,
      seed: doc.seed,
      minDwell: 12,
      startedAt: doc.startedAt,
      endedAt: doc.startedAt + 60_000,
      records: doc.records.map(({ index, dwell, item }) => ({ index, dwell, item })),
    };
    expect(migrateSession(old)).toEqual({
      v: 1,
      id: doc.id,
      seed: doc.seed,
      pace: 'measured',
      minDwell: 12,
      maxDwell: 24,
      lingerMode: 'gradual',
      useMemory: true,
      inserted: 0,
      pages: 3,
      startedAt: doc.startedAt,
      endedAt: doc.startedAt + 60_000,
      status: 'done',
      records: doc.records.map((r) => ({ ...r, breaths: 0 })),
      totals: null,
    });
    expect(migrateSession({ ...old, endedAt: undefined }).status).toBe('open');
  });

  it('leaves a current session as it is and rejects one that is not valid', () => {
    const doc = makeSessionDoc();
    expect(migrateSession(structuredClone(doc))).toEqual(doc);
    expect(() => migrateSession({ ...doc, id: 'not-a-ulid' })).toThrow(/ULID/);
    expect(() => migrateSession({ ...doc, maxDwell: 1 })).toThrow(/maxDwell/);
    expect(() => migrateSession({ ...doc, v: 3 })).toThrow(/newer version/);
  });
});

describe('snapshot migrations', () => {
  it('0 -> 1 versions the snapshot and migrates the memory inside it', () => {
    const memory = learned();
    const { v: _v, ...oldMemory } = memory;
    expect(migrateSnapshot({ at: T0, reason: 'reset', memory: oldMemory })).toEqual({ v: 1, at: T0, reason: 'reset', memory });
    expect(migrateSnapshot({ at: T0, memory }).reason).toBe('migration');
  });
});

describe('setting migrations', () => {
  it('0 -> 1 wraps a bare value in a versioned row', () => {
    expect(migrateSettingRow('theme', 'dark')).toEqual({ v: 1, name: 'theme', value: 'dark' });
    expect(migrateSettingRow('theme', { v: 1, name: 'theme', value: 'light' })).toEqual({ v: 1, name: 'theme', value: 'light' });
    expect(() => migrateSettingRow('theme', { v: 2, name: 'theme', value: 'x' })).toThrow(/newer version/);
  });

  it('returns a stored value only when it is valid', () => {
    expect(migrateSettingValue('theme', 'dark')).toBe('dark');
    expect(migrateSettingValue('reducedMotion', { v: 1, name: 'reducedMotion', value: 'reduce' })).toBe('reduce');
    expect(migrateSettingValue('theme', 'sepia')).toBeUndefined();
    expect(migrateSettingValue('volumeDb', -40)).toBeUndefined();
    expect(migrateSettingValue('volumeDb', -30)).toBe(-30);
    expect(migrateSettingValue('theme', { v: 9, value: 'dark' })).toBeUndefined();
  });
});
