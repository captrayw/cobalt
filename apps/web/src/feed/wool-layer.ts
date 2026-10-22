import { woolStep } from './wool';
import type { WoolRequest, WoolResult } from './wool.worker';

/** Texels per CSS px: crisp fibres, with a cap so a large window stays quick. */
const SCALE = 2;
const MAX_TEXELS = 2_000_000;
/** The first texture fades in on its own, after the worker has drawn it. */
const FIRST_FADE_S = 0.8;

/**
 * The feed's wool: two canvases that take turns over the page color, blended into it. The next
 * page's texture is drawn in the worker and loaded into the hidden canvas while the page holds, never
 * during a fade, so a page change only fades one canvas in and the other out, which the compositor
 * does alone. A page that comes before its texture is ready keeps the last one; the next page brings
 * the drift up to date.
 */
export class WoolLayer {
  private readonly worker: Worker;
  private readonly canvases: [HTMLCanvasElement, HTMLCanvasElement];
  private front = 0;
  private readonly base = 1 + Math.floor(Math.random() * 100_000);
  private size = { width: 0, height: 0, scale: SCALE };
  /** The page on screen, and whether its color changes instantly (reduced motion). */
  private index = -1;
  private instant = false;
  /** A texture is on screen; the hidden canvas holds the next one. */
  private showing = false;
  private backLoaded = false;
  /** A texture from the worker, waiting for the current fade to end. */
  private pending: ImageBitmap | null = null;
  private fadingUntil = 0;
  private readonly timers: Record<'ask' | 'load', ReturnType<typeof setTimeout> | null> = { ask: null, load: null };
  /** Requests are numbered, so a texture drawn for an earlier size is dropped. */
  private generation = 0;
  /** One texture is drawn at a time; a page asked for meanwhile waits, and only the newest. */
  private drawing = false;
  private queued: number | null = null;

  constructor(a: HTMLCanvasElement, b: HTMLCanvasElement, host: HTMLElement) {
    this.canvases = [a, b];
    this.measure(host);
    this.worker = new Worker(new URL('./wool.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<WoolResult>) => this.arrive(e.data);
  }

  /** Page `index` is now on screen, its color fading over `seconds`. */
  show(index: number, seconds: number, instant: boolean): void {
    if (index === this.index) return;
    this.index = index;
    this.instant = instant;
    if (!this.showing) {
      this.ask(index);
      return;
    }
    // The creases change in one step as the color starts to fade, which the fade hides: two
    // textures half shown at once would double the blending for the whole fade.
    if (this.backLoaded) this.flip(0);
    // The page's color fades even when the texture stays: nothing is loaded until it is over.
    this.fadingUntil = Math.max(this.fadingUntil, performance.now() + (instant ? 0 : seconds * 1000));
    // Once this fade is over, draw the next page's texture.
    this.afterFade('ask', () => this.ask(this.index + 1));
  }

  /** After the window changes size, draw the texture again at the new size. */
  resize(host: HTMLElement): void {
    this.measure(host);
    this.generation++;
    this.pending?.close();
    this.pending = null;
    this.backLoaded = false;
    this.showing = false;
    this.ask(this.index);
  }

  destroy(): void {
    for (const t of Object.values(this.timers)) if (t) clearTimeout(t);
    this.worker.terminate();
    this.pending?.close();
  }

  private measure(host: HTMLElement): void {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    const scale = Math.min(SCALE, Math.sqrt(MAX_TEXELS / (w * h)));
    this.size = { width: Math.round(w * scale), height: Math.round(h * scale), scale };
  }

  private ask(index: number): void {
    if (this.drawing) {
      this.queued = index;
      return;
    }
    this.drawing = true;
    const request: WoolRequest = { id: this.generation, ...this.size, ...woolStep(this.base, Math.max(0, index)) };
    this.worker.postMessage(request);
  }

  private arrive(result: WoolResult): void {
    this.drawing = false;
    this.take(result);
    if (this.queued !== null) {
      const next = this.queued;
      this.queued = null;
      this.ask(next);
    }
  }

  private take({ id, bitmap }: WoolResult): void {
    if (id !== this.generation) {
      bitmap.close();
      return;
    }
    this.pending?.close();
    this.pending = bitmap;
    if (!this.showing) {
      // The first texture (or the first at a new size) fades in straight away.
      this.load();
      this.flip(this.instant ? 0 : FIRST_FADE_S);
      this.showing = true;
      this.afterFade('ask', () => this.ask(this.index + 1));
    } else this.afterFade('load', () => this.load());
  }

  /** Puts the waiting texture into the hidden canvas. */
  private load(): void {
    const bitmap = this.pending;
    if (!bitmap) return;
    this.pending = null;
    const back = this.canvases[1 - this.front];
    back.style.transition = 'none';
    back.style.opacity = '0';
    back.width = bitmap.width;
    back.height = bitmap.height;
    back.getContext('bitmaprenderer')?.transferFromImageBitmap(bitmap);
    this.backLoaded = true;
  }

  /** Fades the hidden canvas in and the shown one out. */
  private flip(seconds: number): void {
    const into = this.canvases[1 - this.front];
    const out = this.canvases[this.front];
    const fade = seconds > 0 ? `opacity ${seconds}s linear` : 'none';
    into.style.transition = fade;
    out.style.transition = fade;
    into.style.opacity = '1';
    out.style.opacity = '0';
    this.front = 1 - this.front;
    this.backLoaded = false;
    this.fadingUntil = performance.now() + seconds * 1000;
  }

  /** Runs `step` once no fade is running; a page change during the wait pushes it back. */
  private afterFade(kind: 'ask' | 'load', step: () => void): void {
    const pending = this.timers[kind];
    if (pending) clearTimeout(pending);
    this.timers[kind] = setTimeout(() => {
      this.timers[kind] = null;
      if (this.fadingUntil > performance.now()) this.afterFade(kind, step);
      else step();
    }, Math.max(0, this.fadingUntil - performance.now()) + 50);
  }
}
