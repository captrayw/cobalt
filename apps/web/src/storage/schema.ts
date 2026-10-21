import {
  CAT_IDS,
  MEMORY_CAPS,
  USER_VOLUME_DB,
  type FeatureScore,
  type LingerMode,
  type LoopLog,
  type Memory,
  type PaceId,
  type Page,
  type PageMemory,
} from '@calm/core';
import { z } from 'zod';
import type { ExportFile, SessionDoc, SessionRecordDoc, SessionTotals, Settings, SnapshotDoc } from './types';
import { ULID_PATTERN } from './ulid';

/** zod schemas for every stored and imported document. z.number() already rejects NaN and Infinity. */

const PACE_IDS = ['standard', 'measured'] as const satisfies readonly PaceId[];
const LINGER_MODES = ['gradual', 'user'] as const satisfies readonly LingerMode[];

const nonNegative = z.number().min(0);
const count = z.number().int().min(0);
const seed = z.number().int().min(0).max(4294967295);
const phase = z.number().int().min(1).max(7);
const midi = z.number().int().min(0).max(127);
const hex = z.string().regex(/^#[0-9A-F]{6}$/i, 'Expected a #RRGGBB color');
const catId = z.enum(CAT_IDS);
const featureKey = new RegExp(`^[1-7]\\|(c\\|(${CAT_IDS.join('|')})|n\\|\\d{1,3})$`);

export const PageSchema: z.ZodType<Page> = z.object({
  i: z.number().int().min(1),
  start: nonNegative,
  dwell: z.number().positive(),
  phase,
  phaseName: z.string(),
  cat: catId,
  catName: z.string(),
  L: z.number().min(0).max(1),
  C: nonNegative,
  h: z.number().min(0).max(360),
  hex,
  midi,
  note: z.string(),
  hz: z.number().positive(),
  drone: z.array(midi),
  gainDb: z.number().max(0),
  xfade: nonNegative,
  memKey: z.string().min(1).optional(),
});

export const PageMemorySchema: z.ZodType<PageMemory> = z.object({
  key: z.string().min(1),
  cat: catId,
  catName: z.string(),
  L: z.number().min(0).max(1),
  C: nonNegative,
  h: z.number().min(0).max(360),
  hex,
  midi,
  phase,
  a: z.number().positive(),
  b: z.number().positive(),
  shown: count,
  lingers: count,
  sleeps: count,
  lastLoop: count,
});

export const LoopLogSchema: z.ZodType<LoopLog> = z.object({
  n: z.number().int().min(1),
  seed,
  watched: count,
  lingers: count,
  sleeps: count,
  fromMem: count,
  medDwell: nonNegative,
  sim: z.boolean(),
  at: nonNegative,
});

const FeatureScoreSchema: z.ZodType<FeatureScore> = z.object({ a: z.number().positive(), b: z.number().positive() });

export const MemorySchema: z.ZodType<Memory> = z.object({
  v: z.literal(1),
  updatedAt: nonNegative,
  loops: z.array(LoopLogSchema).max(MEMORY_CAPS.loops, `At most ${MEMORY_CAPS.loops} loops`),
  pages: z
    .record(z.string(), PageMemorySchema)
    .refine((pages) => Object.keys(pages).length <= MEMORY_CAPS.pages, `At most ${MEMORY_CAPS.pages} remembered pages`)
    .refine((pages) => Object.entries(pages).every(([key, p]) => p.key === key), 'Each remembered page must be stored under its own key'),
  feat: z.record(z.string().regex(featureKey, 'Expected a feature key such as 3|c|TEAL or 3|n|62'), FeatureScoreSchema),
});

export const SessionRecordDocSchema: z.ZodType<SessionRecordDoc> = z.object({
  index: count,
  planned: z.number().positive(),
  dwell: nonNegative,
  sleep: z.boolean(),
  breaths: count,
  z: z.number().nullable(),
  linger: z.boolean(),
  item: PageSchema,
  night: z.boolean().optional(),
});

const SessionTotalsSchema: z.ZodType<SessionTotals> = z.object({
  watched: count,
  lingers: count,
  sleeps: count,
  fromMem: count,
  seconds: nonNegative,
});

export const SessionDocSchema: z.ZodType<SessionDoc> = z
  .object({
    v: z.literal(1),
    id: z.string().regex(ULID_PATTERN, 'Expected a ULID'),
    seed,
    pace: z.enum(PACE_IDS),
    minDwell: z.number().positive(),
    maxDwell: z.number().positive(),
    lingerMode: z.enum(LINGER_MODES),
    useMemory: z.boolean(),
    inserted: count,
    pages: count,
    startedAt: nonNegative,
    endedAt: nonNegative.nullable(),
    status: z.enum(['open', 'done', 'partial']),
    records: z.array(SessionRecordDocSchema),
    totals: SessionTotalsSchema.nullable(),
  })
  .refine((doc) => doc.maxDwell >= doc.minDwell, 'maxDwell must not be below minDwell');

export const SettingsSchema = z.object({
  useMemory: z.boolean(),
  volumeDb: z.number().min(USER_VOLUME_DB.min).max(USER_VOLUME_DB.max),
  pageDetails: z.boolean(),
  night: z.boolean(),
  reducedMotion: z.enum(['system', 'reduce', 'allow']),
  theme: z.enum(['system', 'dark', 'light']),
  learnedNext: z.boolean(),
  learnedSideways: z.boolean(),
}) satisfies z.ZodType<Settings>;

export const SnapshotDocSchema: z.ZodType<SnapshotDoc> = z.object({
  v: z.literal(1),
  at: nonNegative,
  reason: z.enum(['import', 'reset', 'migration']),
  memory: MemorySchema,
  raw: z.unknown().optional(),
});

export const ExportFileSchema: z.ZodType<ExportFile> = z.object({
  app: z.literal('calm-scroll'),
  schema: z.literal(1),
  exportedAt: nonNegative,
  memory: MemorySchema,
  sessions: z.array(SessionDocSchema),
  settings: SettingsSchema,
});

/** The first problem in a failed parse, as "path: message". */
export function describeIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'unknown problem';
  const path = issue.path.map(String).join('.');
  // A bad record key or set element carries the useful message one level down.
  const message = issue.code === 'invalid_key' || issue.code === 'invalid_element' ? (issue.issues[0]?.message ?? issue.message) : issue.message;
  return path ? `${path}: ${message}` : message;
}
