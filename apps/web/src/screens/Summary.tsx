import { eveningColor, readableInk, relativeLuminance } from '@calm/core';
import { useEffect, type CSSProperties } from 'react';
import { navigate } from '../router';
import { startSession, useApp } from '../store';
import type { SessionRecordDoc } from '../storage/types';
import { formatClock, Screen, Stat } from '../ui';

/** One watched page, in the colors it was shown in: its own by day, its night color by night. */
export function PageTile({ rec }: { rec: SessionRecordDoc }) {
  const p = rec.item;
  const shown = rec.night ? eveningColor(p) : { hex: p.hex, name: p.catName };
  const ink = readableInk(shown.hex);
  // Marks sit on a veil that pushes away from the ink: lighter under dark ink, darker under light.
  const veil = relativeLuminance(ink) > 0.5 ? 'rgb(0 0 0 / 0.3)' : 'rgb(255 255 255 / 0.4)';
  return (
    <article className="tile" data-lingered={rec.linger} data-memory={p.memKey ? 'true' : undefined} data-night={rec.night ? 'true' : undefined}>
      <div className="tile-color" style={{ background: shown.hex, '--page-ink': ink, '--mark-veil': veil } as CSSProperties}>
        <span className="tile-note">{p.note}</span>
        <span className="tile-marks">
          {rec.linger && <span className="mark">Lingered</span>}
          {rec.sleep && <span className="mark">Possible sleep</span>}
          {p.memKey && <span className="mark">From memory</span>}
        </span>
      </div>
      <div className="tile-body">
        <strong>{shown.name}</strong>
        <span className="muted">
          Group {p.phase} · {p.phaseName}
        </span>
        <span className="muted">
          Held <span className="num">{formatClock(rec.dwell)}</span>
        </span>
      </div>
    </article>
  );
}

export function Summary() {
  const summary = useApp((s) => s.summary);
  const note = useApp((s) => s.storageNote);

  useEffect(() => {
    if (!summary) navigate('done', true);
  }, [summary]);
  if (!summary?.totals) return null;

  const { watched, lingers, sleeps, seconds } = summary.totals;
  const lingered = summary.records.filter((r) => r.linger);

  return (
    <Screen title="Session ended" back={false} fill>
      <div className="stats" data-testid="summary-stats">
        <Stat label="Pages watched" value={<span data-testid="watched">{watched}</span>} />
        <Stat label="Total time" value={formatClock(seconds)} />
        <Stat label="Lingers" value={<span data-testid="lingers">{lingers}</span>} />
        <Stat label="Possible sleep" value={sleeps} />
      </div>

      <section className="stack" aria-labelledby="lingered-heading">
        <h2 id="lingered-heading">Pages you lingered on</h2>
        {lingered.length > 0 ? (
          <div className="tiles">
            {lingered.map((rec) => (
              <PageTile key={rec.index} rec={rec} />
            ))}
          </div>
        ) : (
          <p className="muted">No page held you much longer than its neighbors this time.</p>
        )}
        {summary.useMemory && lingered.length > 0 && <p className="muted small">These pages are remembered on this device and may return in a later session.</p>}
        {note && <p className="notice">{note}</p>}
      </section>

      <div className="btn-row btn-row-stack">
        <button type="button" className="btn" onClick={() => startSession(true)}>
          Start next session
        </button>
        <button type="button" className="btn" onClick={() => navigate('done')}>
          Done
        </button>
      </div>
    </Screen>
  );
}
