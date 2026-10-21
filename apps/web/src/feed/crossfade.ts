import { mixOklch, oklchToHex, type Lch } from '@calm/core';

/**
 * Crossfades a background between page colors in OKLCH: L, C and the shorter hue arc, one update
 * per animation frame. An sRGB CSS transition could pass through grey between distant hues.
 */
export class ColorCrossfade {
  private current: Lch | null = null;
  private frame = 0;
  private readonly el: HTMLElement;

  constructor(el: HTMLElement) {
    this.el = el;
  }

  to(target: Lch, seconds: number, instant: boolean): void {
    cancelAnimationFrame(this.frame);
    const from = this.current;
    if (instant || from === null || seconds <= 0) {
      this.paint(target);
      return;
    }
    const start = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / (seconds * 1000));
      this.paint(t >= 1 ? target : mixOklch(from, target, t));
      if (t < 1) this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
  }

  private paint(color: Lch): void {
    this.current = color;
    this.el.style.backgroundColor = oklchToHex(color.L, color.C, color.h);
  }
}
