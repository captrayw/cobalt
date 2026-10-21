import 'fake-indexeddb/auto';
import { emptyMemory } from '@calm/core';
import { describe, expect, it } from 'vitest';
import { applyImport, checkImport, exportAll, exportFileName, exportJson } from './exportImport';
import { finalizeSession } from './finalize';
import type { CalmRepo } from './repo';
import { freshRepo, makeSessionDoc, T0 } from './testing';
import { DEFAULT_SETTINGS, type ExportFile } from './types';

/** A repository with three finished sessions, an open checkpoint and changed settings. */
async function populated(): Promise<CalmRepo> {
  const { repo } = freshRepo();
  let memory = emptyMemory();
  for (let i = 0; i < 3; i++) {
    const result = finalizeSession(memory, makeSessionDoc({ seed: 20 + i, startedAt: T0 + i * 1_000_000, lingerEvery: 6 + i }), T0 + i * 1_000_000 + 900_000, 'done');
    memory = result.memory;
    await repo.finishSession(memory, result.doc);
  }
  await repo.checkpoint(makeSessionDoc({ seed: 30, startedAt: T0 + 9_000_000 }));
  await repo.saveSettings({ volumeDb: -9.5, pageDetails: true, theme: 'light', reducedMotion: 'reduce', useMemory: false });
  return repo;
}

const withoutTime = (file: ExportFile) => ({ ...file, exportedAt: 0 });

describe('export and import', () => {
  it('exports memory, finished sessions oldest first, settings and the schema version', async () => {
    const repo = await populated();
    const file = await exportAll(repo, T0 + 10_000_000);
    expect(file.app).toBe('calm-scroll');
    expect(file.schema).toBe(1);
    expect(file.exportedAt).toBe(T0 + 10_000_000);
    expect(file.sessions.map((s) => s.startedAt)).toEqual([T0, T0 + 1_000_000, T0 + 2_000_000]);
    expect(file.sessions.every((s) => s.status === 'done')).toBe(true);
    expect(file.memory).toEqual(await repo.loadMemory());
    expect(file.settings).toEqual({ volumeDb: -9.5, pageDetails: true, theme: 'light', reducedMotion: 'reduce', useMemory: false });
  });

  it('an exported file imports back unchanged', async () => {
    const source = await populated();
    const file = await exportAll(source, T0 + 10_000_000);
    const text = exportJson(file);

    const check = checkImport(text);
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.file).toEqual(file);
    expect(check.summary).toEqual({
      pages: Object.keys(file.memory.pages).length,
      loops: 3,
      sessions: 3,
      exportedAt: T0 + 10_000_000,
    });

    // Into a fresh device...
    const { repo: target } = freshRepo();
    await applyImport(target, check.file, T0 + 11_000_000);
    const again = await exportAll(target, T0 + 12_000_000);
    expect(withoutTime(again)).toEqual(withoutTime(file));
    expect(JSON.stringify(withoutTime(again))).toBe(JSON.stringify(withoutTime(file)));

    // ...and back over the original, which drops its open checkpoint.
    await applyImport(source, check.file, T0 + 13_000_000);
    expect(withoutTime(await exportAll(source, 0))).toEqual(withoutTime(file));
    expect(await source.openSessions()).toEqual([]);
  });

  it('keeps a snapshot of the memory an import replaces', async () => {
    const repo = await populated();
    const before = await repo.loadMemory();
    const { repo: other } = freshRepo();
    const file = await exportAll(other, T0);
    await applyImport(repo, file, T0 + 20_000_000);
    expect(await repo.loadMemory()).toEqual(emptyMemory());
    expect(await repo.recentSessions()).toEqual([]);
    expect(await repo.loadSettings()).toEqual(DEFAULT_SETTINGS);
    const [snap] = await repo.listSnapshots();
    expect(snap).toMatchObject({ reason: 'import', at: T0 + 20_000_000 });
    expect(snap.memory).toEqual(before);
  });

  it('leaves out an open session found in a file, so it is never learned at the next launch', async () => {
    const repo = await populated();
    const file = await exportAll(repo, T0);
    const tampered: ExportFile = { ...file, sessions: [...file.sessions, makeSessionDoc({ seed: 31, startedAt: T0 + 30_000_000, lingerEvery: 5 })] };
    const check = checkImport(exportJson(tampered));
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    const { repo: target } = freshRepo();
    await applyImport(target, check.file, T0 + 31_000_000);
    expect(await target.openSessions()).toEqual([]);
    expect(await target.recentSessions()).toHaveLength(3);
  });

  it('fills settings missing from an older file with their defaults', async () => {
    const repo = await populated();
    const file = await exportAll(repo, T0);
    const { theme: _theme, volumeDb: _volume, ...partial } = file.settings;
    const check = checkImport(JSON.stringify({ ...file, settings: partial }));
    expect(check.ok && check.file.settings).toEqual({ ...file.settings, theme: DEFAULT_SETTINGS.theme, volumeDb: DEFAULT_SETTINGS.volumeDb });
  });

  it('imports an older file that still has pace and linger rhythm settings, without them', async () => {
    const file = await exportAll(await populated(), T0);
    const check = checkImport(JSON.stringify({ ...file, settings: { ...file.settings, pace: 'measured', lingerMode: 'user' } }));
    expect(check.ok && check.file.settings).toEqual(file.settings);
  });

  it('rejects files it cannot use, with short, plain reasons', async () => {
    const file = await exportAll(await populated(), T0);
    const reject = (text: string) => {
      const check = checkImport(text);
      expect(check.ok).toBe(false);
      return check.ok ? '' : check.error;
    };
    expect(reject('{ not json')).toBe('This file could not be read. Choose a Calm Scroll export, saved as .json.');
    expect(reject('[1, 2, 3]')).toBe('This file is not a Calm Scroll export.');
    expect(reject(JSON.stringify({ ...file, app: 'other-app' }))).toBe('This file is not a Calm Scroll export.');
    expect(reject(JSON.stringify({ ...file, schema: 2 }))).toBe('This file comes from a newer version of Calm Scroll.');

    const [firstKey] = Object.keys(file.memory.pages);
    const badPages = { ...file.memory.pages, [firstKey]: { ...file.memory.pages[firstKey], a: 'lots' } };
    const badMemory = reject(JSON.stringify({ ...file, memory: { ...file.memory, pages: badPages } }));
    expect(badMemory).toMatch(/^This file has data Calm Scroll cannot use\. The memory is not valid \(pages\..+\.a: /);

    const badSession = reject(JSON.stringify({ ...file, sessions: [{ ...file.sessions[0], status: 'lost' }] }));
    expect(badSession).toMatch(/^This file has data Calm Scroll cannot use\. The session is not valid \(status: /);

    const badSetting = reject(JSON.stringify({ ...file, settings: { ...file.settings, volumeDb: 12 } }));
    expect(badSetting).toMatch(/^This file has data Calm Scroll cannot use\. The file is not valid \(settings\.volumeDb: /);

    expect(reject(JSON.stringify({ ...file, memory: undefined }))).toMatch(/The memory is not a document/);
    for (const message of [badMemory, badSession, badSetting]) expect(message.length).toBeLessThanOrEqual(190);
  });

  it('names export files by local date', () => {
    expect(exportFileName(new Date(2026, 9, 21, 8, 30).getTime())).toBe('calm-scroll-2026-10-21.json');
  });
});
