import { useEffect, useRef } from 'react';
import { ARC } from '../arc';
import { navigate } from '../router';
import { startSession, useApp } from '../store';
import type { SessionDoc } from '../storage/types';
import { formatMinutes } from '../ui';

function lastLine(last: SessionDoc | null): string {
  if (!last?.totals) return 'No session has finished on this device yet.';
  const { watched, lingers, sleeps, seconds } = last.totals;
  const parts = [`${watched} ${watched === 1 ? 'page' : 'pages'} over ${formatMinutes(seconds)}`];
  parts.push(lingers === 0 ? 'no lingers' : `${lingers} ${lingers === 1 ? 'linger' : 'lingers'}`);
  return `Last session: ${parts.join(', ')}${sleeps > 0 ? ', and possible sleep' : ''}.`;
}

/**
 * Where a person lands after choosing Done on the summary: a quiet stopping point. Opening the app
 * again goes straight back into scrolling.
 */
export function Done() {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  const ready = useApp((s) => s.ready);
  const last = useApp((s) => s.lastSession);
  const remembered = useApp((s) => Object.keys(s.memory.pages).length);
  const note = useApp((s) => s.storageNote);

  return (
    <main className="screen">
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

        <div className="arc" role="img" aria-label="The arc: warm colors and higher notes at the start, cool and lower at the end.">
          {ARC.map((step) => (
            <div className="arc-step" key={step.name}>
              <span className="arc-swatch" style={{ background: step.hex }} />
              <span className="arc-name">{step.name}</span>
            </div>
          ))}
        </div>

        <button type="button" className="btn btn-primary btn-block" onClick={() => startSession(true)} disabled={!ready}>
          Start a session
        </button>

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
      </div>
    </main>
  );
}
