import { INPUT } from '@calm/core';

/** What an input means to the feed. */
export type InputAction = 'next' | 'end' | 'activity' | 'ignore';

interface TargetLike {
  tagName?: string;
  isContentEditable?: boolean;
}

const FORM_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA']);
const NEXT_KEYS = new Set(['ArrowDown', 'Down', 'PageDown', ' ', 'Spacebar', 'j', 'J']);

/**
 * Keys: ↓, PageDown, Space or J move on; Esc ends. While focus is in a select, input or text area
 * every key except Esc is ignored, and Space and Enter on a focused button belong to the button.
 */
export function classifyKey(key: string, target: EventTarget | TargetLike | null): InputAction {
  const el = target as TargetLike | null;
  const tag = el?.tagName?.toUpperCase() ?? '';
  if (key === 'Escape' || key === 'Esc') return 'end';
  if (FORM_TAGS.has(tag) || el?.isContentEditable === true) return 'ignore';
  if (tag === 'BUTTON' && (key === ' ' || key === 'Spacebar' || key === 'Enter')) return 'ignore';
  return NEXT_KEYS.has(key) ? 'next' : 'activity';
}

/** Wheel deltaY in pixels: × 16 for lines (deltaMode 1), × 400 for pages (deltaMode 2). */
export function normalizeWheel(deltaY: number, deltaMode: number): number {
  if (deltaMode === 1) return deltaY * INPUT.wheelLineScale;
  if (deltaMode === 2) return deltaY * INPUT.wheelPageScale;
  return deltaY;
}

export interface WheelState {
  /** Time of the previous wheel event, ms. */
  last: number;
  /** This gesture has already advanced a page. */
  advanced: boolean;
}

export const initialWheel: WheelState = { last: Number.NEGATIVE_INFINITY, advanced: false };

/**
 * A gap over 250 ms between wheel events starts a new gesture. The first event in a gesture with a
 * normalized deltaY above 12 px advances one page; every other wheel event counts as activity.
 */
export function wheelAction(state: WheelState, at: number, deltaY: number, deltaMode: number): [WheelState, InputAction] {
  const dy = normalizeWheel(deltaY, deltaMode);
  const advanced = at - state.last > INPUT.wheelGapMs ? false : state.advanced;
  if (!advanced && dy > INPUT.wheelPx) return [{ last: at, advanced: true }, 'next'];
  return [{ last: at, advanced }, 'activity'];
}

/** Movement under this many pixels counts as a tap. */
const TAP_SLOP_PX = 10;

/** A finished pointer gesture: a swipe up of more than 40 px moves on; a still press is a tap. */
export function pointerAction(dx: number, dy: number): 'next' | 'tap' | 'activity' {
  if (-dy > INPUT.swipePx) return 'next';
  if (Math.abs(dx) < TAP_SLOP_PX && Math.abs(dy) < TAP_SLOP_PX) return 'tap';
  return 'activity';
}
