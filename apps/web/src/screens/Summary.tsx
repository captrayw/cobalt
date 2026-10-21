import { useEffect } from 'react';
import { navigate } from '../router';
import { startSession, useApp } from '../store';
import type { SessionRecordDoc } from '../storage/types';
import { formatClock, Screen, Stat } from '../ui';

export function PageTile({ rec }: { rec: SessionRecordDoc }) {
  const p = rec.item;
  return (
    <article className="tile" data-lingered={rec.linger} data-memory={p.memKey ? 'true' : undefined}>
      <div className="tile-color" style={{ background: p.hex }}>
        <span className="tile-note">{p.note}</span>
        <span className="tile-marks">
          {rec.linger && <span className="mark">Lingered</span>}
          {rec.sleep && <span className="mark">Possible sleep</span>}
          {p.memKey && <span className="mark">From memory</span>}
        </span>
      </div>
      <div className="tile-body">
        <strong>{p.catName}</strong>
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
    if (!summary) navigate('home', true);
  }, [summary]);
  if (!summary?.totals) return null;

  const { watched, lingers, sleeps, seconds } = summary.totals;
  const lingered = summary.records.filter((r) => r.linger);

  return (
    <Screen title="Session ended" back={false}>
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

      <div className="btn-row">
        <button type="button" className="btn" onClick={startSession}>
          Start next session
        </button>
        <button type="button" className="btn" onClick={() => navigate('home')}>
          Done
        </button>
      </div>
    </Screen>
  );
}
