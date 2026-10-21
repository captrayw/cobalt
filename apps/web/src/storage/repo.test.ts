import 'fake-indexeddb/auto';
import { emptyMemory } from '@calm/core';
import { describe, expect, it, vi } from 'vitest';
import { MEMORY_KEY, openCalmDb, STORES } from './db';
import { finalizeSession } from './finalize';
import { recoverOpenSessions } from './recover';
import { createRepo, SESSION_RETENTION, SNAPSHOT_RETENTION } from './repo';
import { freshRepo, makeSessionDoc, T0 } from './testing';
import { DEFAULT_SETTINGS } from './types';

describe('repository', () => {
  it('starts with empty memory, no sessions and default settings', async () => {
    const { repo } = freshRepo();
    expect(await repo.loadMemory()).toEqual(emptyMemory());
    expect(await repo.recentSessions()).toEqual([]);
    expect(await repo.lastSession()).toBeNull();
    expect(await repo.openSessions()).toEqual([]);
    expect(await repo.loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(await repo.listSnapshots()).toEqual([]);
  });

  it('saves memory and the finished session together, and memory survives a reload', async () => {
    const { repo, factory, name } = freshRepo();
    const { memory, doc } = finalizeSession(emptyMemory(), makeSessionDoc({ lingerEvery: 7 }), T0 + 900_000, 'done');
    expect(Object.keys(memory.pages).length).toBeGreaterThan(0);
    await repo.finishSession(memory, doc);
    expect(await repo.loadMemory()).toEqual(memory);
    expect(await repo.lastSession()).toEqual(doc);

    repo.close();
    const reopened = createRepo(name, factory);
    expect(await reopened.loadMemory()).toEqual(memory);
    expect(await reopened.recentSessions()).toEqual([doc]);
    reopened.close();
  });

  it('writes nothing when the session or memory is not valid', async () => {
    const { repo } = freshRepo();
    const first = finalizeSession(emptyMemory(), makeSessionDoc({ lingerEvery: 7 }), T0, 'done');
    await repo.finishSession(first.memory, first.doc);

    const second = finalizeSession(first.memory, makeSessionDoc({ seed: 2, startedAt: T0 + 1000, lingerEvery: 5 }), T0 + 2000, 'done');
    const broken = { ...second.doc, records: [{ ...second.doc.records[0], dwell: -1 }] };
    await expect(repo.finishSession(second.memory, broken)).rejects.toThrow(/did not save the session/);
    await expect(repo.finishSession({ ...second.memory, v: 2 } as never, second.doc)).rejects.toThrow(/did not save the memory/);
    expect(await repo.loadMemory()).toEqual(first.memory);
    expect(await repo.recentSessions()).toEqual([first.doc]);
  });

  it('checkpoints an open session, then recovers it at the next launch as a partial session', async () => {
    const { repo } = freshRepo();
    const doc = makeSessionDoc({ lingerEvery: 7, status: 'open' });
    await repo.checkpoint(doc);
    // A later checkpoint of the same session replaces the earlier one.
    const later = { ...doc, records: [...doc.records, ...makeSessionDoc({ watched: 32, lingerEvery: 7 }).records.slice(30)] };
    await repo.checkpoint(later);
    expect(await repo.openSessions()).toEqual([later]);
    expect(await repo.recentSessions()).toEqual([]);

    expect(await recoverOpenSessions(repo, T0 + 5000)).toBe(1);
    const expected = finalizeSession(emptyMemory(), later, T0 + 5000, 'partial');
    expect(await repo.openSessions()).toEqual([]);
    expect(await repo.recentSessions()).toEqual([expected.doc]);
    const memory = await repo.loadMemory();
    expect(memory).toEqual(expected.memory);
    expect(memory.loops).toHaveLength(1);
    expect(memory.loops[0].watched).toBe(32);
    expect(expected.doc.status).toBe('partial');
    expect(expected.doc.endedAt).toBe(T0 + 5000);
    expect(expected.doc.records.filter((r) => r.linger).length).toBeGreaterThan(0);

    // Nothing left to recover.
    expect(await recoverOpenSessions(repo, T0 + 6000)).toBe(0);
  });

  it('dates a recovered session by its checkpoint, while memory records the time of the save', async () => {
    const { repo } = freshRepo();
    const checkpointAt = T0 + 9000;
    await repo.checkpoint({ ...makeSessionDoc({ lingerEvery: 7, status: 'open' }), endedAt: checkpointAt });
    const launchAt = T0 + 3 * 24 * 3600 * 1000;
    expect(await recoverOpenSessions(repo, launchAt)).toBe(1);
    const [session] = await repo.recentSessions();
    const memory = await repo.loadMemory();
    expect(session.endedAt).toBe(checkpointAt);
    expect(memory.loops[0].at).toBe(checkpointAt);
    expect(memory.updatedAt).toBe(launchAt);
  });

  it('a late checkpoint never reopens a session that was already finished', async () => {
    const { repo } = freshRepo();
    const open = makeSessionDoc({ lingerEvery: 7, status: 'open' });
    const done = finalizeSession(emptyMemory(), open, T0 + 1000, 'done');
    await repo.finishSession(done.memory, done.doc);
    await repo.checkpoint(open);
    expect(await repo.openSessions()).toEqual([]);
    expect((await repo.lastSession())?.status).toBe('done');
    expect(await recoverOpenSessions(repo, T0 + 2000)).toBe(0);
  });

  it('leaves alone a session that is still running in another tab', async () => {
    const { repo } = freshRepo();
    const live = makeSessionDoc({ seed: 8, lingerEvery: 7, status: 'open' });
    const stale = makeSessionDoc({ seed: 9, startedAt: T0 + 5000, lingerEvery: 7, status: 'open' });
    await repo.checkpoint(live);
    await repo.checkpoint(stale);
    expect(await recoverOpenSessions(repo, T0 + 9000, async (id) => id === live.id)).toBe(1);
    expect((await repo.openSessions()).map((s) => s.id)).toEqual([live.id]);
  });

  it('keeps unreadable stored memory as a snapshot instead of overwriting it', async () => {
    const { repo, factory, name } = freshRepo();
    const db = await openCalmDb(name, factory);
    await db.put(STORES.memory, { v: 99, garbage: true }, MEMORY_KEY);
    db.close();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await repo.loadMemory()).toEqual(emptyMemory());
    warn.mockRestore();
    const [snapshot] = await repo.listSnapshots();
    expect(snapshot.reason).toBe('migration');
    expect(snapshot.raw).toEqual({ v: 99, garbage: true });
    // The unreadable document is replaced only after it was copied, so later loads are quiet.
    expect(await repo.loadMemory()).toEqual(emptyMemory());
    expect(await repo.listSnapshots()).toHaveLength(1);
  });

  it('recovers several checkpoints oldest first, and closes an empty one without learning', async () => {
    const { repo } = freshRepo();
    const empty = makeSessionDoc({ seed: 3, startedAt: T0 + 60_000, watched: 0 });
    const older = makeSessionDoc({ seed: 4, startedAt: T0, lingerEvery: 6 });
    await repo.checkpoint(empty);
    await repo.checkpoint(older);
    expect((await repo.openSessions()).map((s) => s.id)).toEqual([older.id, empty.id]);
    expect(await recoverOpenSessions(repo, T0 + 120_000)).toBe(2);
    const memory = await repo.loadMemory();
    expect(memory.loops.map((l) => l.seed)).toEqual([older.seed]);
    const sessions = await repo.recentSessions();
    expect(sessions.map((s) => [s.id, s.status])).toEqual([
      [empty.id, 'partial'],
      [older.id, 'partial'],
    ]);
    expect(sessions[0].totals).toEqual({ watched: 0, lingers: 0, sleeps: 0, fromMem: 0, seconds: 0 });
  });

  it(`keeps the last ${SESSION_RETENTION} sessions`, async () => {
    const { repo } = freshRepo();
    const ids: string[] = [];
    let memory = emptyMemory();
    for (let i = 0; i < SESSION_RETENTION + 5; i++) {
      const result = finalizeSession(memory, makeSessionDoc({ seed: 10 + i, startedAt: T0 + i * 1000, watched: 6 }), T0 + i * 1000 + 500, 'done');
      memory = result.memory;
      ids.push(result.doc.id);
      await repo.finishSession(memory, result.doc);
    }
    const kept = await repo.recentSessions();
    expect(kept).toHaveLength(SESSION_RETENTION);
    expect(kept.map((s) => s.id)).toEqual(ids.slice(5).reverse());
    expect((await repo.recentSessions(3)).map((s) => s.id)).toEqual(ids.slice(-3).reverse());
    expect((await repo.lastSession())?.id).toBe(ids.at(-1));
  });

  it(`keeps the last ${SNAPSHOT_RETENTION} snapshots, newest first`, async () => {
    const { repo } = freshRepo();
    for (let i = 0; i < SNAPSHOT_RETENTION + 2; i++) await repo.snapshot('import', { ...emptyMemory(), updatedAt: i }, T0 + i);
    // Two snapshots in the same millisecond both survive.
    await repo.snapshot('reset', emptyMemory(), T0 + 6);
    const snaps = await repo.listSnapshots();
    expect(snaps).toHaveLength(SNAPSHOT_RETENTION);
    expect(snaps.map((s) => s.at)).toEqual([T0 + 7, T0 + 6, T0 + 5, T0 + 4, T0 + 3]);
    expect(snaps[0].reason).toBe('reset');
    expect(snaps[1].memory.updatedAt).toBe(6);
  });

  it('merges stored settings with the defaults, validates patches and ignores unreadable rows', async () => {
    const { repo, factory, name } = freshRepo();
    expect(await repo.saveSettings({ useMemory: false, volumeDb: -12 })).toEqual({ ...DEFAULT_SETTINGS, useMemory: false, volumeDb: -12 });
    expect(await repo.saveSettings({ theme: 'light', pageDetails: true })).toEqual({
      ...DEFAULT_SETTINGS,
      useMemory: false,
      volumeDb: -12,
      theme: 'light',
      pageDetails: true,
    });
    await expect(repo.saveSettings({ volumeDb: 6 })).rejects.toThrow(/volumeDb/);
    await expect(repo.saveSettings({ theme: 'sepia' as never })).rejects.toThrow(/theme/);
    await expect(repo.saveSettings({ loud: true } as never)).rejects.toThrow(/no setting called loud/);
    // Pace and linger rhythm are no longer settings (owner change, Oct 2026).
    await expect(repo.saveSettings({ pace: 'measured' } as never)).rejects.toThrow(/no setting called pace/);

    // Rows written by hand: garbage is ignored, an unversioned bare value is migrated, and the
    // pace and linger rhythm rows an older version stored are skipped.
    const db = await openCalmDb(name, factory);
    await db.put(STORES.settings, { v: 1, name: 'reducedMotion', value: 'sometimes' }, 'reducedMotion');
    await db.put(STORES.settings, 'reduce', 'reducedMotion');
    await db.put(STORES.settings, { v: 1, name: 'useMemory', value: 'yes' }, 'useMemory');
    await db.put(STORES.settings, { v: 1, name: 'unknown', value: 1 }, 'unknown');
    await db.put(STORES.settings, { v: 1, name: 'pace', value: 'measured' }, 'pace');
    await db.put(STORES.settings, { v: 1, name: 'lingerMode', value: 'user' }, 'lingerMode');
    db.close();
    const settings = await repo.loadSettings();
    expect(settings.reducedMotion).toBe('reduce');
    expect(settings.useMemory).toBe(DEFAULT_SETTINGS.useMemory);
    expect(settings).not.toHaveProperty('unknown');
    expect(settings).not.toHaveProperty('pace');
    expect(settings).not.toHaveProperty('lingerMode');
  });

  it('reset keeps settings, empties memory and sessions, and leaves a snapshot', async () => {
    const { repo } = freshRepo();
    await repo.saveSettings({ theme: 'dark', volumeDb: -6 });
    const { memory, doc } = finalizeSession(emptyMemory(), makeSessionDoc({ lingerEvery: 7 }), T0, 'done');
    await repo.finishSession(memory, doc);
    await repo.checkpoint(makeSessionDoc({ seed: 9, startedAt: T0 + 10 }));

    await repo.reset(T0 + 99);
    expect(await repo.loadMemory()).toEqual(emptyMemory());
    expect(await repo.recentSessions()).toEqual([]);
    expect(await repo.openSessions()).toEqual([]);
    expect(await repo.loadSettings()).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark', volumeDb: -6 });
    const [snap] = await repo.listSnapshots();
    expect(snap).toMatchObject({ v: 1, at: T0 + 99, reason: 'reset' });
    expect(snap.memory).toEqual(memory);
    expect(snap).not.toHaveProperty('raw');
  });

  it('warns when memory grows past 64 KB', async () => {
    const { repo } = freshRepo();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { memory, doc } = finalizeSession(emptyMemory(), makeSessionDoc({ lingerEvery: 7 }), T0, 'done');
    await repo.finishSession(memory, doc);
    expect(warn).not.toHaveBeenCalled();
    const big = { ...memory, feat: { ...memory.feat } };
    for (let i = 0; i < 7000; i++) big.feat[`${1 + (i % 7)}|n|${Math.floor(i / 7)}`] = { a: 1.123456789 + i, b: 9.987654321 };
    await repo.finishSession(big, doc);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/above the 65536-byte budget/));
    warn.mockRestore();
  });

  it('stores memory under the single key "current"', async () => {
    const { repo, factory, name } = freshRepo();
    const { memory, doc } = finalizeSession(emptyMemory(), makeSessionDoc({ lingerEvery: 7 }), T0, 'done');
    await repo.finishSession(memory, doc);
    const db = await openCalmDb(name, factory);
    expect(await db.getAllKeys(STORES.memory)).toEqual([MEMORY_KEY]);
    db.close();
  });
});
