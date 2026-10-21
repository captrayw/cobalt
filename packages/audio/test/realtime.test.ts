import { describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { WebAudioEngine, type EngineState } from '../src/index.ts';

describe('WebAudioEngine with a live AudioContext', () => {
  it('creates and resumes the context inside a tap, reports state changes, and closes', async () => {
    const engine = new WebAudioEngine();
    expect(engine.state).toBe('idle');
    expect(engine.now()).toBe(0);

    const states: EngineState[] = [];
    let unlocked: Promise<boolean> = Promise.resolve(false);
    const button = document.createElement('button');
    button.textContent = 'Start';
    button.addEventListener('click', () => {
      unlocked = engine.unlock();
      engine.onStateChange((s) => states.push(s));
    });
    document.body.append(button);
    await userEvent.click(button);

    expect(await unlocked).toBe(true);
    expect(engine.state).toBe('running');
    const at = engine.now() + 0.03;
    engine.tone(440, at, 0.5, -6, 0.4);
    engine.drones([50], -6, at);
    engine.setMaster(0.9, 0.2);
    engine.releaseVoices(0.25);

    await engine.close(0.06, 0.1);
    expect(engine.state).toBe('closed');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(states).toContain('closed');
    // Calls after close are ignored, and unlocking again reports failure.
    engine.tone(440, engine.now(), 1, 0, 0.4);
    expect(await engine.unlock()).toBe(false);
    button.remove();
  });
});
