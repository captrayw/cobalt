import { describe, expect, it } from 'vitest';
import { classifyKey, initialWheel, normalizeWheel, pointerAction, wheelAction, type WheelState } from './gestures';

const el = (tagName: string, isContentEditable = false) => ({ tagName, isContentEditable });

describe('key filter (scenario 7)', () => {
  it('keys typed into a form control never move the feed', () => {
    for (const tag of ['INPUT', 'SELECT', 'TEXTAREA', 'input', 'textarea']) {
      for (const key of ['ArrowDown', 'PageDown', ' ', 'j', 'J', 'a', 'Enter']) expect(classifyKey(key, el(tag))).toBe('ignore');
    }
    expect(classifyKey('j', el('DIV', true))).toBe('ignore');
  });

  it('Esc still ends from a form control', () => {
    expect(classifyKey('Escape', el('INPUT'))).toBe('end');
  });

  it('Space and Enter on a focused button belong to the button', () => {
    expect(classifyKey(' ', el('BUTTON'))).toBe('ignore');
    expect(classifyKey('Enter', el('BUTTON'))).toBe('ignore');
    expect(classifyKey('ArrowDown', el('BUTTON'))).toBe('next');
  });

  it('↓, PageDown, Space and J move on; Esc ends; other keys are activity', () => {
    for (const key of ['ArrowDown', 'PageDown', ' ', 'j', 'J']) expect(classifyKey(key, el('MAIN'))).toBe('next');
    expect(classifyKey('Escape', null)).toBe('end');
    for (const key of ['ArrowUp', 'a', 'Shift', 'Enter', 'k']) expect(classifyKey(key, el('BODY'))).toBe('activity');
  });

  it('← is day and → is night, except while typing in a form control', () => {
    expect(classifyKey('ArrowLeft', el('MAIN'))).toBe('day');
    expect(classifyKey('ArrowRight', el('MAIN'))).toBe('night');
    expect(classifyKey('ArrowRight', el('BUTTON'))).toBe('night');
    expect(classifyKey('ArrowLeft', el('INPUT'))).toBe('ignore');
  });
});

describe('wheel gestures', () => {
  it('normalizes deltaY by deltaMode', () => {
    expect(normalizeWheel(3, 0)).toBe(3);
    expect(normalizeWheel(3, 1)).toBe(48);
    expect(normalizeWheel(1, 2)).toBe(400);
  });

  it('scenario 9: three events 60 ms apart advance one page; one more 400 ms later advances again', () => {
    let state: WheelState = initialWheel;
    const actions: string[] = [];
    for (const at of [1000, 1060, 1120, 1520]) {
      const [next, action] = wheelAction(state, at, 40, 0);
      state = next;
      actions.push(action);
    }
    expect(actions).toEqual(['next', 'activity', 'activity', 'next']);
  });

  it('small or upward deltas are activity; the first event above 12 px in a gesture advances', () => {
    let state: WheelState = initialWheel;
    const actions: string[] = [];
    for (const [at, dy] of [
      [0, 4],
      [20, -30],
      [40, 13],
      [60, 50],
    ] as const) {
      const [next, action] = wheelAction(state, at, dy, 0);
      state = next;
      actions.push(action);
    }
    expect(actions).toEqual(['activity', 'activity', 'next', 'activity']);
  });
});

describe('pointer gestures', () => {
  it('a swipe up of more than 40 px moves on; a still press is a tap', () => {
    expect(pointerAction(0, -41)).toBe('next');
    expect(pointerAction(0, -40)).toBe('activity');
    expect(pointerAction(2, 3)).toBe('tap');
    expect(pointerAction(0, 80)).toBe('activity');
  });

  it('a swipe mostly sideways of more than 50 px is day to the left and night to the right', () => {
    expect(pointerAction(-60, 5)).toBe('day');
    expect(pointerAction(60, -10)).toBe('night');
    expect(pointerAction(100, -50)).toBe('night');
    // Not far enough, or more up than sideways: the usual meanings.
    expect(pointerAction(50, 0)).toBe('activity');
    expect(pointerAction(60, -45)).toBe('next');
  });
});
