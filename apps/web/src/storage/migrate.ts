import { PACE_PRESETS, type Memory } from '@calm/core';
import type { z } from 'zod';
import type { SettingRow } from './db';
import { describeIssue, ExportFileSchema, MemorySchema, SessionDocSchema, SettingsSchema, SnapshotDocSchema } from './schema';
import { DEFAULT_SETTINGS, type ExportFile, type SessionDoc, type Settings, type SnapshotDoc } from './types';

/**
 * Forward migrations for stored documents. Every document carries a version field v; one without
 * it is version 0. Each step turns version n into n + 1, and the result is checked with zod.
 */

/** Current version of every stored document and of the export file. */
export const DOC_VERSION = 1;

export class MigrationError extends Error {
  override name = 'MigrationError';
}

type Doc = Record<string, unknown>;
type Migration = (doc: Doc) => Doc;

const isRecord = (x: unknown): x is Doc => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown, fallback: number): number => (typeof x === 'number' && Number.isFinite(x) ? x : fallback);
const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const dict = (x: unknown): Doc => (isRecord(x) ? x : {});

/** Version of a stored document; a document without v is version 0. */
export const docVersion = (doc: unknown): number => (isRecord(doc) && typeof doc.v === 'number' ? doc.v : 0);

/** True when a document is older than the current version. */
export const needsMigration = (doc: unknown): boolean => docVersion(doc) < DOC_VERSION;

function runMigrations(doc: unknown, steps: Readonly<Record<number, Migration>>, what: string): Doc {
  if (!isRecord(doc)) throw new MigrationError(`The ${what} is not a document.`);
  let current = doc;
  let v = docVersion(current);
  if (!Number.isInteger(v) || v < 0) throw new MigrationError(`The ${what} has an unknown version.`);
  if (v > DOC_VERSION) throw new MigrationError(`The ${what} was saved by a newer version of Calm Scroll.`);
  while (v < DOC_VERSION) {
    const step = steps[v];
    if (!step) throw new MigrationError(`There is no migration for ${what} version ${v}.`);
    current = step(current);
    const next = docVersion(current);
    if (next <= v) throw new MigrationError(`The ${what} migration from version ${v} did not advance.`);
    v = next;
  }
  return current;
}

function check<T>(schema: z.ZodType<T>, doc: unknown, what: string): T {
  const result = schema.safeParse(doc);
  if (!result.success) throw new MigrationError(`The ${what} is not valid (${describeIssue(result.error)}).`);
  return result.data;
}

export const MEMORY_MIGRATIONS: Readonly<Record<number, Migration>> = {
  // 0 -> 1: memory saved before versioning carried no v.
  0: (doc) => ({
    ...doc,
    v: 1,
    updatedAt: num(doc.updatedAt, 0),
    loops: list(doc.loops),
    pages: dict(doc.pages),
    feat: dict(doc.feat),
  }),
};

export const SESSION_MIGRATIONS: Readonly<Record<number, Migration>> = {
  // 0 -> 1: fill the fields that sessions saved before versioning may lack.
  0: (doc) => {
    const records = list(doc.records);
    const minDwell = num(doc.minDwell, PACE_PRESETS.standard.minDwell);
    const measured = minDwell >= PACE_PRESETS.measured.minDwell;
    const endedAt = typeof doc.endedAt === 'number' ? doc.endedAt : null;
    return {
      ...doc,
      v: 1,
      pace: doc.pace ?? (measured ? 'measured' : 'standard'),
      minDwell,
      maxDwell: num(doc.maxDwell, measured ? PACE_PRESETS.measured.maxDwell : PACE_PRESETS.standard.maxDwell),
      lingerMode: doc.lingerMode ?? 'gradual',
      useMemory: doc.useMemory ?? true,
      inserted: num(doc.inserted, 0),
      pages: num(doc.pages, records.length),
      startedAt: num(doc.startedAt, 0),
      endedAt,
      status: doc.status ?? (endedAt === null ? 'open' : 'done'),
      records: records.map((rec) =>
        isRecord(rec)
          ? { sleep: false, breaths: 0, z: null, linger: false, ...rec, planned: rec.planned ?? dict(rec.item).dwell }
          : rec,
      ),
      totals: doc.totals ?? null,
    };
  },
};

export const SNAPSHOT_MIGRATIONS: Readonly<Record<number, Migration>> = {
  // 0 -> 1: snapshots saved before versioning carried no v.
  0: (doc) => ({ ...doc, v: 1, at: num(doc.at, 0), reason: doc.reason ?? 'migration' }),
};

export function migrateMemory(doc: unknown): Memory {
  return check(MemorySchema, runMigrations(doc, MEMORY_MIGRATIONS, 'memory'), 'memory');
}

export function migrateSession(doc: unknown): SessionDoc {
  return check(SessionDocSchema, runMigrations(doc, SESSION_MIGRATIONS, 'session'), 'session');
}

export function migrateSnapshot(doc: unknown): SnapshotDoc {
  const migrated = runMigrations(doc, SNAPSHOT_MIGRATIONS, 'snapshot');
  return check(SnapshotDocSchema, { ...migrated, memory: migrateMemory(migrated.memory) }, 'snapshot');
}

/** A stored setting row. Before versioning a row was the bare value itself. */
export function migrateSettingRow(name: string, raw: unknown): SettingRow {
  if (!isRecord(raw) || !('v' in raw)) return { v: 1, name, value: raw };
  if (docVersion(raw) > DOC_VERSION) throw new MigrationError(`The setting ${name} was saved by a newer version of Calm Scroll.`);
  return { v: 1, name: typeof raw.name === 'string' ? raw.name : name, value: raw.value };
}

/** The stored value of one setting, or undefined when it is missing or not valid. */
export function migrateSettingValue<K extends keyof Settings>(name: K, raw: unknown): Settings[K] | undefined {
  try {
    const result = SettingsSchema.shape[name].safeParse(migrateSettingRow(name, raw).value);
    return result.success ? (result.data as Settings[K]) : undefined;
  } catch {
    return undefined;
  }
}

/** An export file of any supported version, migrated to the current one. Settings missing from it take their defaults. */
export function migrateExport(doc: unknown): ExportFile {
  if (!isRecord(doc) || doc.app !== 'calm-scroll') throw new MigrationError('This file is not a Calm Scroll export.');
  const schema = typeof doc.schema === 'number' ? doc.schema : 0;
  if (schema > DOC_VERSION) throw new MigrationError('This file comes from a newer version of Calm Scroll.');
  const file = {
    app: 'calm-scroll',
    schema: DOC_VERSION,
    exportedAt: num(doc.exportedAt, 0),
    memory: migrateMemory(doc.memory),
    sessions: list(doc.sessions).map(migrateSession),
    settings: { ...DEFAULT_SETTINGS, ...dict(doc.settings) },
  };
  return check(ExportFileSchema, file, 'file');
}
