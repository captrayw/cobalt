/**
 * Keeps the screen on while wanted. Rejections are tolerated, and a lock that resolves after it
 * stopped being wanted is released straight away.
 */
export class WakeLockManager {
  private sentinel: WakeLockSentinel | null = null;
  private wanted = false;

  set(want: boolean): void {
    if (want === this.wanted) {
      // The browser drops the lock when the page is hidden; ask again if it is gone.
      if (want && this.sentinel === null) void this.acquire();
      return;
    }
    this.wanted = want;
    if (want) void this.acquire();
    else this.drop();
  }

  get held(): boolean {
    return this.sentinel !== null;
  }

  private async acquire(): Promise<void> {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    try {
      const sentinel = await navigator.wakeLock.request('screen');
      if (!this.wanted || this.sentinel !== null) {
        void sentinel.release().catch(() => undefined);
        return;
      }
      this.sentinel = sentinel;
      sentinel.addEventListener('release', () => {
        if (this.sentinel === sentinel) this.sentinel = null;
      });
    } catch {
      // Not allowed right now (no user activation, battery saver, hidden page). Try again later.
    }
  }

  private drop(): void {
    const sentinel = this.sentinel;
    this.sentinel = null;
    if (sentinel) void sentinel.release().catch(() => undefined);
  }
}
