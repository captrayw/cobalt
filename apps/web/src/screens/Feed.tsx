import { FEED_UI } from '@calm/core';
import { memo, useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { useReducedMotion } from '../appearance';
import type { FeedController } from '../feed/controller';
import { ColorCrossfade } from '../feed/crossfade';
import { classifyKey, initialWheel, pointerAction, wheelAction } from '../feed/gestures';
import { useApp } from '../store';

const FEED_LABEL = 'Calm feed. Swipe up or press the down arrow for the next page.';

/** Wire keys, wheel and pointer input on the feed surface to the controller. */
function useFeedInputs(feed: FeedController, surface: React.RefObject<HTMLElement | null>, wake: () => void) {
  useEffect(() => {
    const el = surface.current;
    if (!el) return;
    let wheel = initialWheel;
    let press: { id: number; x: number; y: number; onButton: boolean } | null = null;
    let lastMove = Number.NEGATIVE_INFINITY;

    const onKey = (e: KeyboardEvent) => {
      const action = classifyKey(e.key, e.target);
      if (action === 'ignore') return;
      wake();
      if (action === 'next') {
        e.preventDefault();
        feed.next();
      } else if (action === 'end') {
        e.preventDefault();
        feed.end();
      } else feed.activity(true);
    };
    const onWheel = (e: WheelEvent) => {
      const [state, action] = wheelAction(wheel, performance.now(), e.deltaY, e.deltaMode);
      wheel = state;
      wake();
      if (action === 'next') feed.next();
      else feed.activity(false);
    };
    const onDown = (e: PointerEvent) => {
      press = { id: e.pointerId, x: e.clientX, y: e.clientY, onButton: (e.target as Element).closest('button') !== null };
    };
    const onUp = (e: PointerEvent) => {
      if (!press || press.id !== e.pointerId) return;
      const action = pointerAction(e.clientX - press.x, e.clientY - press.y);
      const onButton = press.onButton;
      press = null;
      wake();
      // A swipe counts wherever it starts; a tap on End or Next belongs to that button's click.
      if (action === 'next') feed.next();
      else if (!onButton) feed.activity(action === 'tap');
    };
    const onMove = () => {
      const now = performance.now();
      if (now - lastMove < FEED_UI.moveActivityEveryMs) return;
      lastMove = now;
      wake();
      feed.activity(false);
    };
    const onCancel = () => {
      press = null;
    };

    window.addEventListener('keydown', onKey);
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('keydown', onKey);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointercancel', onCancel);
    };
  }, [feed, surface, wake]);
}

/** End and Next. They never change during a session, so a page change does not re-render them. */
const FeedControls = memo(function FeedControls({ feed }: { feed: FeedController }) {
  return (
    <>
      <button type="button" className="feed-button feed-end" aria-label="End session" onClick={feed.end}>
        <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
          <path d="M5 5l12 12M17 5L5 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
        </svg>
      </button>
      <button type="button" className="feed-button feed-next" aria-label="Next page" onClick={feed.next}>
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 9l7 7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </button>
    </>
  );
});

export function FeedScreen({ feed }: { feed: FeedController }) {
  const view = useSyncExternalStore(feed.subscribe, feed.getView);
  const pageDetails = useApp((s) => s.settings.pageDetails);
  const reduced = useReducedMotion();
  const surface = useRef<HTMLElement>(null);
  const crossfade = useRef<ColorCrossfade | null>(null);
  const awakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Brighten the faint controls for a moment after any touch. A DOM attribute, not React state,
  // so input never costs a render.
  const wake = useCallback(() => {
    const el = surface.current;
    if (!el) return;
    el.dataset.awake = 'true';
    if (awakeTimer.current) clearTimeout(awakeTimer.current);
    awakeTimer.current = setTimeout(() => {
      el.dataset.awake = 'false';
    }, FEED_UI.controlsAwakeMs);
  }, []);

  useFeedInputs(feed, surface, wake);

  // Visibility, pagehide and audio interruptions. (Leaving the route ends the session; see App.)
  useEffect(() => {
    const detach = feed.attach();
    surface.current?.focus({ preventScroll: true });
    return () => {
      detach();
      if (awakeTimer.current) clearTimeout(awakeTimer.current);
    };
  }, [feed]);

  // Crossfade the page color in OKLCH over the page's xfade.
  const { page } = view;
  useEffect(() => {
    if (!surface.current) return;
    crossfade.current ??= new ColorCrossfade(surface.current);
    crossfade.current.to(page, page.xfade, reduced);
  }, [page, reduced]);
  useEffect(() => () => crossfade.current?.stop(), []);

  const showing = view.status === 'showing';
  const announcement = pageDetails ? `Page ${view.index + 1} of ${view.total}. ${page.note}, ${page.catName}${page.memKey ? ', from memory' : ''}.` : '';
  // Kept in a region that is always present, so screen readers announce each change.
  const statusText =
    view.status === 'resting' ? 'Resting. Tap or swipe to continue.' : view.status === 'paused' ? 'Paused. Tap to resume.' : '';

  return (
    <main
      ref={surface}
      className="feed"
      aria-label={FEED_LABEL}
      tabIndex={-1}
      data-page={view.index + 1}
      data-status={view.status}
      data-breath={view.breath}
      data-memory={page.memKey ? 'true' : undefined}
    >
      <div className="feed-dim" style={{ opacity: view.dim }} />

      {pageDetails && showing && (
        <div className="feed-details" key={view.index}>
          <span className="feed-note">{page.note}</span>
          <span className="feed-name">
            {page.catName}
            {page.memKey ? ' · from memory' : ''}
          </span>
        </div>
      )}

      {!reduced && showing && <div className="feed-progress" key={view.t0} style={{ animationDuration: `${page.dwell}s` }} />}

      <FeedControls feed={feed} />

      {view.status === 'resting' && (
        <div className="feed-overlay">
          <p className="feed-overlay-title">Resting</p>
          <p className="feed-overlay-hint">Tap or swipe to continue</p>
        </div>
      )}
      {view.status === 'paused' && (
        <div className="feed-overlay">
          <p className="feed-overlay-title">Paused</p>
          <p className="feed-overlay-hint">Tap to resume</p>
        </div>
      )}

      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>
      <div className="sr-only" role="status">
        {statusText}
      </div>
    </main>
  );
}
