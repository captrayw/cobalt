import type { AudioEngine, EngineState } from './engine.ts';

/** A silent engine for browsers without Web Audio: the feed still runs, without sound. */
export class NullAudioEngine implements AudioEngine {
  readonly state: EngineState = 'idle';

  async unlock(): Promise<boolean> {
    return false;
  }

  tone(): void {}

  drones(): void {}

  setMaster(): void {}

  now(): number {
    return 0;
  }

  async close(): Promise<void> {}

  setVolume(): void {}

  releaseVoices(): void {}

  fadeDrones(): void {}

  async sleep(): Promise<void> {}

  onStateChange(): () => void {
    return () => {};
  }
}
