import { finalizeSession } from './finalize';
import type { CalmRepo } from './repo';

/**
 * Scores and learns every unfinished checkpoint as a partial session, oldest first, then closes it.
 * Run at launch: writes started during pagehide may not have finished. Returns how many were recovered.
 * A session is dated by its checkpoint (the last moment it is known to have run), not by this launch;
 * memory's updatedAt is still the time of this save. A session still running in another tab or
 * window (`isLive`) is left alone.
 */
export async function recoverOpenSessions(repo: CalmRepo, at: number, isLive: (id: string) => Promise<boolean> = async () => false): Promise<number> {
  const open = await repo.openSessions();
  if (open.length === 0) return 0;
  let memory = await repo.loadMemory();
  let recovered = 0;
  for (const doc of open) {
    if (await isLive(doc.id)) continue;
    const result = finalizeSession(memory, doc, doc.endedAt ?? at, 'partial');
    const saved = result.memory === memory ? memory : { ...result.memory, updatedAt: at };
    await repo.finishSession(saved, result.doc);
    memory = saved;
    recovered += 1;
  }
  return recovered;
}
