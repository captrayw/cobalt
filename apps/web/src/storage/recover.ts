import { finalizeSession } from './finalize';
import type { CalmRepo } from './repo';

/**
 * Scores and learns every unfinished checkpoint as a partial session, oldest first, then closes it.
 * Run at launch: writes started during pagehide may not have finished. Returns how many were recovered.
 */
export async function recoverOpenSessions(repo: CalmRepo, at: number): Promise<number> {
  const open = await repo.openSessions();
  if (open.length === 0) return 0;
  let memory = await repo.loadMemory();
  for (const doc of open) {
    const result = finalizeSession(memory, doc, at, 'partial');
    await repo.finishSession(result.memory, result.doc);
    memory = result.memory;
  }
  return open.length;
}
