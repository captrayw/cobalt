import { baseL, CHROMA, FAMILY_BY_ID, fitChroma, GROUPS, oklchToHex, type LingerMode, type PaceId } from '@calm/core';
import { navigate } from '../router';
import { startSession, updateSettings, useApp } from '../store';
import type { SessionDoc } from '../storage/types';
import { formatMinutes, Segmented, Switch } from '../ui';

const PACES = [
  { value: 'standard', label: '5–10 s per page' },
  { value: 'measured', label: '12–24 s per page' },
] as const satisfies readonly { value: PaceId; label: string }[];

const RHYTHMS = [
  { value: 'gradual', label: 'Gradual' },
  { value: 'user', label: '2, 5, 9 s' },
] as const satisfies readonly { value: LingerMode; label: string }[];

/** One color per group at its center: the group's main family, lightness and chroma. */
const ARC = GROUPS.map((g) => {
  const tn = (g.phase - 0.5) / GROUPS.length;
  const main = [...g.fams].sort((a, b) => b.w - a.w)[0].cat;
  const [lo, hi] = FAMILY_BY_ID[main].band;
  const h = (lo + hi) / 2,
    L = baseL(tn);
  return { name: g.name, hex: oklchToHex(L, fitChroma(L, CHROMA.start + (CHROMA.end - CHROMA.start) * tn, h), h) };
});

function lastLine(last: SessionDoc | null): string {
  if (!last?.totals) return 'Your first session starts fresh.';
  const { watched, lingers, sleeps, seconds } = last.totals;
  const parts = [`${watched} ${watched === 1 ? 'page' : 'pages'} over ${formatMinutes(seconds)}`];
  parts.push(lingers === 0 ? 'no lingers' : `${lingers} ${lingers === 1 ? 'linger' : 'lingers'}`);
  return `Last session: ${parts.join(', ')}${sleeps > 0 ? ', and possible sleep' : ''}.`;
}

export function Home() {
  const ready = useApp((s) => s.ready);
  const settings = useApp((s) => s.settings);
  const last = useApp((s) => s.lastSession);
  const remembered = useApp((s) => Object.keys(s.memory.pages).length);
  const note = useApp((s) => s.storageNote);

  return (
    <main className="screen">
      <div className="column">
        <header className="screen-head">
          <h1>Calm Scroll</h1>
          <p className="muted">Fifteen minutes of soft color and sound. Stay on a page and it slows into a breathing rhythm.</p>
        </header>

        <div className="arc" role="img" aria-label="The arc: warm colors and higher notes at the start, cool and lower at the end.">
          {ARC.map((step) => (
            <div className="arc-step" key={step.name}>
              <span className="arc-swatch" style={{ background: step.hex }} />
              <span className="arc-name">{step.name}</span>
            </div>
          ))}
        </div>

        <div className="stack">
          <button type="button" className="btn btn-primary btn-block" onClick={startSession} disabled={!ready}>
            Start session
          </button>
          <p className="muted small" data-testid="last-session">
            {lastLine(last)}
          </p>
          {note && <p className="notice">{note}</p>}
        </div>

        <section className="panel" aria-label="Session options">
          <Segmented legend="Pace" value={settings.pace} choices={PACES} onChange={(pace) => void updateSettings({ pace })} />
          <Segmented
            legend="Linger rhythm"
            value={settings.lingerMode}
            choices={RHYTHMS}
            onChange={(lingerMode) => void updateSettings({ lingerMode })}
            hint={settings.lingerMode === 'gradual' ? 'Each breath stretches a little, toward six breaths a minute.' : 'Breaths of 2, 5 and then 9 seconds, kept for comparison.'}
          />
          <hr className="divider" />
          <Switch
            label="Use what I lingered on"
            hint="Brings back pages you stayed on, and gently favors their colors and notes."
            checked={settings.useMemory}
            onChange={(useMemory) => void updateSettings({ useMemory })}
          />
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

        <p className="muted small">A relaxation aid, not a medical treatment. Everything stays on this device.</p>
      </div>
    </main>
  );
}
