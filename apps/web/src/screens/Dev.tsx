import { PreviewPlayer, WebAudioEngine, type PreviewSpeed } from '@calm/audio';
import { CHECK_IDS, newSeed, PACE_PRESETS, parseSeed, prepareSession, type CheckId, type PaceId, type Session } from '@calm/core';
import { useEffect, useState } from 'react';
import { useApp } from '../store';
import { formatClock, Screen, Segmented, Switch } from '../ui';

const CHECK_NAMES: Record<CheckId, string> = {
  noRepeat: 'No family twice in a row',
  chromaFalls: 'Chroma falls group to group',
  warmToCool: 'Warm to cool',
  pitchFalls: 'Pitch falls group to group',
  smoothLight: 'Lightness steps at most 0.08',
  inGamut: 'Every color inside sRGB',
  slowChanges: 'Every page at least minDwell',
  smallLeaps: 'Leaps at most 7 semitones',
  endsOnTonic: 'Ends on D3',
};

const PACES = [
  { value: 'standard', label: '5–10 s' },
  { value: 'measured', label: '12–24 s' },
] as const satisfies readonly { value: PaceId; label: string }[];

const f = (x: number, digits: number) => x.toFixed(digits);

/** Hidden QA screen (#/dev): generate by seed, read the nine checks and the full sequence, and listen at 1x or 10x. */
export function Dev() {
  const memory = useApp((s) => s.memory);
  const [seedText, setSeedText] = useState('');
  const [pace, setPace] = useState<PaceId>('standard');
  const [useMemory, setUseMemory] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [ms, setMs] = useState(0);
  const [playing, setPlaying] = useState<{ speed: PreviewSpeed; page: number } | null>(null);
  const [player] = useState(() => new PreviewPlayer());

  useEffect(() => () => player.stop(), [player]);

  const generate = () => {
    const seed = seedText.trim() === '' ? newSeed() : parseSeed(seedText);
    const t0 = performance.now();
    const s = prepareSession({ seed, ...PACE_PRESETS[pace], memory, useMemory });
    setMs(performance.now() - t0);
    setSession(s);
  };

  const play = (speed: PreviewSpeed) => {
    if (!session) return;
    setPlaying({ speed, page: 0 });
    player.play(session, speed, new WebAudioEngine({ volumeDb: useApp.getState().settings.volumeDb }), {
      onPage: (page) => setPlaying((p) => (p ? { ...p, page } : p)),
      onEnd: () => setPlaying(null),
    });
  };

  const v = session?.validation;

  return (
    <Screen title="Developer" intro="Generation, the nine checks and preview playback, for QA.">
      <section className="panel" aria-label="Generate">
        <div className="field">
          <label className="label" htmlFor="seed">
            Seed
          </label>
          <input id="seed" type="text" inputMode="text" placeholder="Empty for a random seed" value={seedText} onChange={(e) => setSeedText(e.target.value)} />
          <p className="hint">Digits are used modulo 2^32; any other text is hashed.</p>
        </div>
        <Segmented legend="Pace" value={pace} choices={PACES} onChange={setPace} />
        <Switch label="Use memory" checked={useMemory} onChange={setUseMemory} />
        <button type="button" className="btn btn-block" onClick={generate} data-testid="dev-generate">
          Generate
        </button>
      </section>

      {session && v && (
        <>
          <section className="panel" aria-label="Checks" data-testid="dev-checks" data-pass={v.pass} data-inserted={session.inserted}>
            <div className="spread wrap">
              <h2>{v.pass ? 'All nine checks pass' : 'Some checks fail'}</h2>
              <span className="num muted small">{f(ms, 1)} ms</span>
            </div>
            <p className="num small muted">
              seed {session.seed} · tries {session.tries} · pages {session.items.length} · from memory {session.inserted}
            </p>
            <ul className="list">
              {CHECK_IDS.map((id) => (
                <li key={id} data-check={id} data-ok={v.checks[id]}>
                  <span className={v.checks[id] ? 'ok' : 'fail'} aria-hidden="true">
                    {v.checks[id] ? '✓' : '✗'}
                  </span>
                  <span className="grow">{CHECK_NAMES[id]}</span>
                  <span className="sr-only">{v.checks[id] ? 'passes' : 'fails'}</span>
                </li>
              ))}
            </ul>
            <p className="num small muted">
              chroma {v.stats.chroma.map((c) => f(c, 3)).join(' ')} · warm {v.stats.warm.map((w) => f(w, 2)).join(' ')} · pitch{' '}
              {v.stats.pitch.map((p) => f(p, 1)).join(' ')} · max ΔL {f(v.stats.maxDL, 3)} · max ΔE {f(v.stats.maxDE, 3)} · max leap {v.stats.maxLeap}
            </p>
          </section>

          <section className="panel" aria-label="Preview">
            <h2>Preview</h2>
            <div className="btn-row">
              <button type="button" className="btn" onClick={() => play(1)} disabled={playing !== null}>
                Play 1×
              </button>
              <button type="button" className="btn" onClick={() => play(10)} disabled={playing !== null}>
                Play 10×
              </button>
            </div>
            {playing && (
              <div className="spread">
                <span className="num small">
                  {playing.speed}× · page {playing.page + 1} of {session.items.length}
                </span>
                <button type="button" className="btn" onClick={() => player.stop()}>
                  Stop
                </button>
              </div>
            )}
          </section>

          <section className="stack" aria-label="Sequence">
            <h2 id="sequence-heading">Sequence</h2>
            <div className="table-wrap" role="region" aria-labelledby="sequence-heading" tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    {['#', 'Start', 'Dwell', 'Group', 'Family', 'Color', 'L', 'C', 'h', 'Note', 'dB', 'Fade', 'Memory'].map((h) => (
                      <th key={h} scope="col">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {session.items.map((p) => (
                    <tr key={p.i} data-memory={p.memKey ? 'true' : undefined}>
                      <td>{p.i}</td>
                      <td>{formatClock(p.start)}</td>
                      <td>{f(p.dwell, 2)}</td>
                      <td>
                        {p.phase} {p.phaseName}
                      </td>
                      <td>{p.catName}</td>
                      <td>
                        <span className="row" style={{ gap: 6 }}>
                          <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: p.hex }} aria-hidden="true" />
                          {p.hex}
                        </span>
                      </td>
                      <td>{f(p.L, 3)}</td>
                      <td>{f(p.C, 3)}</td>
                      <td>{f(p.h, 1)}</td>
                      <td>
                        {p.note} ({p.midi})
                      </td>
                      <td>{f(p.gainDb, 1)}</td>
                      <td>{f(p.xfade, 2)}</td>
                      <td>{p.memKey ? 'from memory' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </Screen>
  );
}
