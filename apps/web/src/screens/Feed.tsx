import { eveningColor, FEED_UI, readableInk } from '@calm/core';
import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { useReducedMotion } from '../appearance';
import type { FeedController } from '../feed/controller';
import { ColorCrossfade } from '../feed/crossfade';
import { classifyKey, initialWheel, pointerAction, wheelAction } from '../feed/gestures';
import { updateSettings, useApp } from '../store';

const FEED_LABEL =
  'Calm feed. Swipe up or press the down arrow for the next page. Swipe right or press the right arrow for night colors, left for day.';
/** The day-or-night notice: shown this long, then gone (its fade is in feed.css). */
const NOTICE_MS = 1600;

/** Wire keys, wheel and pointer input on the feed surface to the controller. */
function useFeedInputs(
  feed: FeedController,
  surface: React.RefObject<HTMLElement | null>,
  wake: (input: boolean) => void,
  switchColors: (night: boolean) => void,
) {
  useEffect(() => {
    const el = surface.current;
    if (!el) return;
    let wheel = initialWheel;
    let press: { id: number; x: number; y: number; onButton: boolean } | null = null;
    let lastMove = Number.NEGATIVE_INFINITY;

    const onKey = (e: KeyboardEvent) => {
      const action = classifyKey(e.key, e.target);
      if (action === 'ignore') return;
      wake(true);
      if (action === 'next') {
        e.preventDefault();
        feed.next();
      } else if (action === 'end') {
        e.preventDefault();
        feed.end();
      } else if (action === 'day' || action === 'night') {
        e.preventDefault();
        switchColors(action === 'night');
        feed.activity(true);
      } else feed.activity(true);
    };
    const onWheel = (e: WheelEvent) => {
      const [state, action] = wheelAction(wheel, performance.now(), e.deltaY, e.deltaMode);
      wheel = state;
      wake(true);
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
      wake(true);
      // A swipe counts wherever it starts; a tap on End or Next belongs to that button's click.
      if (action === 'next') feed.next();
      else if (action === 'day' || action === 'night') {
        switchColors(action === 'night');
        feed.activity(true);
      } else if (!onButton) feed.activity(action === 'tap');
    };
    const onMove = () => {
      const now = performance.now();
      if (now - lastMove < FEED_UI.moveActivityEveryMs) return;
      lastMove = now;
      // A pointer passing over (or a browser's synthetic move after the page changes) is not a touch.
      wake(false);
      feed.activity(false);
    };
    const onCancel = () => {
      press = null;
    };
    // The same touch again, as the events iOS counts as a gesture for starting sound.
    const onGesture = () => feed.unlock();

    window.addEventListener('keydown', onKey);
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointercancel', onCancel);
    el.addEventListener('touchend', onGesture, { passive: true });
    el.addEventListener('click', onGesture);
    return () => {
      window.removeEventListener('keydown', onKey);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointercancel', onCancel);
      el.removeEventListener('touchend', onGesture);
      el.removeEventListener('click', onGesture);
    };
  }, [feed, surface, wake, switchColors]);
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="3" fill="currentColor" />
      <path
        d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M13.5 10.2A5.8 5.8 0 0 1 5.8 2.5a5.8 5.8 0 1 0 7.7 7.7z" fill="currentColor" />
    </svg>
  );
}

/**
 * End, Next, and the left and right arrows that show a swipe sideways switches day and night (and
 * do it when tapped). The arrows are hints: each fades out once its gesture has been used (`learned`),
 * yet stays a button for screen readers and shows again when focused from the keyboard. They change
 * only then, so a page change does not re-render them.
 */
const FeedControls = memo(function FeedControls({
  feed,
  switchColors,
  learnedNext,
  learnedSideways,
}: {
  feed: FeedController;
  switchColors: (night: boolean) => void;
  learnedNext: boolean;
  learnedSideways: boolean;
}) {
  const sideways = (night: boolean) => () => {
    switchColors(night);
    feed.activity(true);
  };
  const side = learnedSideways ? ' is-learned' : '';
  return (
    <>
      <button type="button" className="feed-button feed-end" aria-label="End session" onClick={feed.end}>
        <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
          <path d="M5 5l12 12M17 5L5 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
        </svg>
      </button>
      <button type="button" className={`feed-button feed-day${side}`} aria-label="Day mode" onClick={sideways(false)}>
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </button>
      <button type="button" className={`feed-button feed-night${side}`} aria-label="Night mode" onClick={sideways(true)}>
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </button>
      <button type="button" className={`feed-button feed-next${learnedNext ? ' is-learned' : ''}`} aria-label="Next page" onClick={feed.next}>
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
  const night = useApp((s) => s.settings.night);
  const learnedNext = useApp((s) => s.settings.learnedNext);
  const learnedSideways = useApp((s) => s.settings.learnedSideways);
  const reduced = useReducedMotion();
  const surface = useRef<HTMLElement>(null);
  const crossfade = useRef<ColorCrossfade | null>(null);
  const awakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Until the first touch, a quiet hint says how to move on (sound also starts with that touch).
  // Like the down arrow, it is retired once the person has moved on to a next page.
  const [touched, setTouched] = useState(false);
  const touchedRef = useRef(false);

  // Brighten the faint controls for a moment after any touch. A DOM attribute, not React state,
  // so input never costs a render. A key, wheel, tap or swipe (`input`) also hides the hint.
  const wake = useCallback((input: boolean) => {
    const el = surface.current;
    if (!el) return;
    el.dataset.awake = 'true';
    if (awakeTimer.current) clearTimeout(awakeTimer.current);
    awakeTimer.current = setTimeout(() => {
      el.dataset.awake = 'false';
    }, FEED_UI.controlsAwakeMs);
    if (input && !touchedRef.current) {
      touchedRef.current = true;
      setTouched(true);
    }
  }, []);

  // A swipe sideways switches day and night: saved as the setting, and named in a notice that fades.
  // The id restarts the fade when the same notice shows again.
  const [notice, setNotice] = useState<{ id: number; night: boolean } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchColors = useCallback((toNight: boolean) => {
    // The first switch also retires the side arrows' hint.
    void updateSettings(useApp.getState().settings.learnedSideways ? { night: toNight } : { night: toNight, learnedSideways: true });
    setNotice((n) => ({ id: (n?.id ?? 0) + 1, night: toNight }));
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);

  useFeedInputs(feed, surface, wake, switchColors);

  // Visibility, pagehide and audio interruptions. (Leaving the route ends the session; see App.)
  useEffect(() => {
    const detach = feed.attach();
    surface.current?.focus({ preventScroll: true });
    return () => {
      detach();
      if (awakeTimer.current) clearTimeout(awakeTimer.current);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, [feed]);

  // The records note which colors each page was shown in.
  useEffect(() => feed.setNight(night), [feed, night]);

  // Pages only change when the person moves on, so leaving page 1 retires the down arrow and the
  // swipe-up hint.
  useEffect(() => {
    if (view.index > 0 && !learnedNext) void updateSettings({ learnedNext: true });
  }, [view.index, learnedNext]);

  // The color on screen, the page's own or its night color, with an ink that stays readable on it.
  const { page } = view;
  const shown = useMemo(
    () => (night ? eveningColor(page) : { L: page.L, C: page.C, h: page.h, hex: page.hex, name: page.catName }),
    [night, page],
  );
  const ink = useMemo(() => readableInk(shown.hex), [shown]);

  // Crossfade in OKLCH over the page's xfade, also when the colors switch between day and night.
  useEffect(() => {
    if (!surface.current) return;
    crossfade.current ??= new ColorCrossfade(surface.current);
    crossfade.current.to(shown, page.xfade, reduced);
  }, [shown, page.xfade, reduced]);
  useEffect(() => () => crossfade.current?.stop(), []);

  const showing = view.status === 'showing';
  const announcement = pageDetails ? `Page ${view.index + 1} of ${view.total}. ${page.note}, ${shown.name}${page.memKey ? ', from memory' : ''}.` : '';
  // Kept in a region that is always present, so screen readers announce each change.
  const statusText =
    view.status === 'resting'
      ? 'Resting. Tap or swipe to continue.'
      : view.status === 'paused'
        ? 'Paused. Tap to resume.'
        : notice
          ? notice.night
            ? 'Night mode'
            : 'Day mode'
          : '';

  return (
    <main
      ref={surface}
      className="feed"
      aria-label={FEED_LABEL}
      tabIndex={-1}
      style={{ '--page-ink': ink } as CSSProperties}
      data-page={view.index + 1}
      data-status={view.status}
      data-breath={view.breath}
      data-memory={page.memKey ? 'true' : undefined}
      data-night={night ? 'true' : undefined}
    >
      <div className="feed-dim" style={{ opacity: view.dim }} />

      {pageDetails && showing && (
        <div className="feed-details" key={view.index}>
          <span className="feed-note">{page.note}</span>
          <span className="feed-name">
            {shown.name}
            {page.memKey ? ' · from memory' : ''}
          </span>
        </div>
      )}

      {notice && (
        <p className="feed-notice" key={notice.id} aria-hidden="true">
          {notice.night ? <MoonIcon /> : <SunIcon />}
          {notice.night ? 'Night mode' : 'Day mode'}
        </p>
      )}

      {!reduced && showing && <div className="feed-progress" key={view.t0} style={{ animationDuration: `${page.dwell}s` }} />}

      {!learnedNext && !touched && view.index === 0 && view.status !== 'resting' && view.status !== 'paused' && (
        <p className="feed-hint">Swipe up for the next page</p>
      )}

      <FeedControls feed={feed} switchColors={switchColors} learnedNext={learnedNext} learnedSideways={learnedSideways} />

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
