import { FEED_UI } from '@calm/core';
import { inNativeApp, setFeedActive } from './native';

/**
 * Keeps the screen on while wanted. One request at a time; after a refusal (no user activation,
 * battery saver) it waits before asking again. A lock that arrives after it stopped being wanted
 * is released straight away. In the iPhone app the phone itself keeps the screen on instead.
 */
export class WakeLockManager {
  private sentinel: WakeLockSentinel | null = null;
  private wanted = false;
  private requesting = false;
  private retryAt = 0;

  set(want: boolean): void {
    if (inNativeApp) {
      if (want !== this.wanted) {
        this.wanted = want;
        void setFeedActive(want).catch(() => undefined);
      }
      return;
    }
    if (want !== this.wanted) {
      this.wanted = want;
      if (!want) {
        this.drop();
        return;
      }
    }
    // The browser drops the lock when the page is hidden, so ask again once it is gone.
    if (want && this.sentinel === null && !this.requesting && Date.now() >= this.retryAt) void this.acquire();
  }

  get held(): boolean {
    return this.sentinel !== null;
  }

  private async acquire(): Promise<void> {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    this.requesting = true;
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
      this.retryAt = Date.now() + FEED_UI.wakeLockRetryMs;
    } finally {
      this.requesting = false;
    }
  }

  private drop(): void {
    const sentinel = this.sentinel;
    this.sentinel = null;
    if (sentinel) void sentinel.release().catch(() => undefined);
  }
}
