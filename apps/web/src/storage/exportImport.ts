import { DOC_VERSION, MigrationError, migrateExport } from './migrate';
import type { CalmRepo } from './repo';
import type { ExportFile } from './types';

export interface ImportSummary {
  /** Remembered pages. */
  pages: number;
  /** Sessions in the learning history. */
  loops: number;
  /** Stored sessions. */
  sessions: number;
  exportedAt: number;
}

export type ImportCheck = { ok: true; file: ExportFile; summary: ImportSummary } | { ok: false; error: string };

/**
 * One JSON document with memory, finished sessions (oldest first), settings and the schema version.
 * Its format tag stays 'calm-scroll' from before the app was named cobalt, so every export reads back.
 */
export async function exportAll(repo: CalmRepo, at: number): Promise<ExportFile> {
  const [memory, sessions, settings] = await Promise.all([repo.loadMemory(), repo.recentSessions(Number.POSITIVE_INFINITY), repo.loadSettings()]);
  return { app: 'calm-scroll', schema: DOC_VERSION, exportedAt: at, memory, sessions: sessions.reverse(), settings };
}

/** The export as text for a file. */
export const exportJson = (file: ExportFile): string => JSON.stringify(file, null, 2);

/** A file name such as cobalt-2026-10-21.json, in local time. */
export function exportFileName(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `cobalt-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

const MAX_DETAIL = 140;

/** Reads and checks an export file without changing anything; the UI confirms before applyImport. */
export function checkImport(text: string): ImportCheck {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file could not be read. Choose a cobalt export, saved as .json.' };
  }
  try {
    const file = migrateExport(doc);
    return {
      ok: true,
      file,
      summary: {
        pages: Object.keys(file.memory.pages).length,
        loops: file.memory.loops.length,
        sessions: file.sessions.length,
        exportedAt: file.exportedAt,
      },
    };
  } catch (error) {
    if (error instanceof MigrationError) {
      const message = error.message.length > MAX_DETAIL ? `${error.message.slice(0, MAX_DETAIL - 1)}…` : error.message;
      return { ok: false, error: message.startsWith('This file') ? message : `This file has data cobalt cannot use. ${message}` };
    }
    return { ok: false, error: 'This file could not be read.' };
  }
}

/** Replaces memory, sessions and settings with the file's, after a snapshot of the current memory. */
export function applyImport(repo: CalmRepo, file: ExportFile, at: number): Promise<void> {
  return repo.replaceAll(file, at);
}
