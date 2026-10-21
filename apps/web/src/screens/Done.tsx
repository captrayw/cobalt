import { useEffect, useId, useRef } from 'react';
import { ARC, NIGHT_ARC } from '../arc';
import { navigate } from '../router';
import { startSession, useApp } from '../store';
import type { SessionDoc } from '../storage/types';
import { CardHead, formatMinutes, MiniArc, RowText } from '../ui';

function lastLine(last: SessionDoc | null): string {
  if (!last?.totals) return 'No session has finished on this device yet.';
  const { watched, lingers, sleeps, seconds } = last.totals;
  const parts = [`${watched} ${watched === 1 ? 'page' : 'pages'} over ${formatMinutes(seconds)}`];
  parts.push(lingers === 0 ? 'no lingers' : `${lingers} ${lingers === 1 ? 'linger' : 'lingers'}`);
  return `Last session: ${parts.join(', ')}${sleeps > 0 ? ', and possible sleep' : ''}.`;
}

/**
 * Where a person lands after choosing Done on the summary: a quiet stopping point, with day and
 * night explained (each with its arc of colors) and the way back in at the bottom of the screen.
 * Opening the app again goes straight back into scrolling.
 */
export function Done() {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  const ready = useApp((s) => s.ready);
  const last = useApp((s) => s.lastSession);
  const remembered = useApp((s) => Object.keys(s.memory.pages).length);
  const note = useApp((s) => s.storageNote);
  const night = useApp((s) => s.settings.night);
  const ids = { modes: useId(), day: useId(), dayHint: useId(), night: useId(), nightHint: useId() };

  return (
    <main className="screen screen-fill">
      <div className="column">
        <header className="screen-head">
          <h1 ref={heading} tabIndex={-1}>
            Done for now
          </h1>
          <p className="muted" data-testid="last-session">
            {lastLine(last)}
          </p>
          {note && <p className="notice">{note}</p>}
        </header>

        <section className="card" aria-labelledby={ids.modes} data-testid="day-night">
          <CardHead id={ids.modes} chip="arc">
            Day and night
          </CardHead>
          <div className="set-row">
            <RowText label="Day" labelId={ids.day} hint="Soft colors that move from warm to cool as the session goes on." hintId={ids.dayHint} />
            <MiniArc colors={ARC} />
          </div>
          <div className="set-row">
            <RowText
              label="Night"
              labelId={ids.night}
              hint="Warm, dim colors with no blue, darker page by page, to wind down before sleep."
              hintId={ids.nightHint}
            />
            <MiniArc colors={NIGHT_ARC} />
          </div>
          <p className="row-help card-foot">
            In a session, swipe right for night and left for day. {night ? 'Night' : 'Day'} is on now. The sound is the same in both.
          </p>
        </section>

        <nav className="nav-list" aria-label="More">
          <button type="button" className="nav-item" onClick={() => navigate('memory')}>
            Memory
            <span className="muted">{remembered === 1 ? '1 page' : `${remembered} pages`}</span>
          </button>
          <button type="button" className="nav-item" onClick={() => navigate('settings')}>
            Settings
          </button>
          <button type="button" className="nav-item" onClick={() => navigate('about')}>
            About
          </button>
        </nav>

        <button type="button" className="btn btn-primary btn-block" onClick={() => startSession(true)} disabled={!ready}>
          Start a session
        </button>
      </div>
    </main>
  );
}
