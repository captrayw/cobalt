import { emptyMemory, groupOf, newSeed, noteName, scoreMean, simulate, type PageMemory } from '@calm/core';
import { useRef, useState, type ChangeEvent } from 'react';
import { LineChart, type LineSeries } from '../charts/LineChart';
import { reloadFromRepo, useApp } from '../store';
import { applyImport, checkImport, exportAll, exportFileName, exportJson, type ExportFile, type ImportSummary } from '../storage';
import { percent, Screen, Swatch } from '../ui';

const SANDBOX = { viewers: 24, loops: 10 };

interface SandboxResult {
  loops: number[];
  series: LineSeries[];
  memRate: number;
  freshRate: number;
}

/** Runs the sandbox one simulated viewer at a time, yielding between viewers to keep the screen responsive. */
async function runSandbox(onProgress: (done: number) => void): Promise<SandboxResult> {
  const totals = Array.from({ length: SANDBOX.loops }, () => ({ watched: 0, lingers: 0, fromMem: 0, favorite: 0 }));
  let memPages = 0,
    memLingers = 0,
    freshPages = 0,
    freshLingers = 0;
  const base = newSeed();
  for (let v = 0; v < SANDBOX.viewers; v++) {
    const r = simulate({ seed: (base + v) >>> 0, viewers: 1, loops: SANDBOX.loops });
    r.loops.forEach((l, i) => {
      totals[i].watched += l.watched;
      totals[i].lingers += l.lingers;
      totals[i].fromMem += l.fromMem;
      totals[i].favorite += l.favorite;
    });
    memPages += r.memPages;
    memLingers += Math.round(r.memLingerRate * r.memPages);
    freshPages += r.freshPages;
    freshLingers += Math.round(r.freshLingerRate * r.freshPages);
    onProgress(v + 1);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const share = (x: number, of: number) => (of > 0 ? x / of : 0);
  return {
    loops: totals.map((_, i) => i + 1),
    series: [
      { key: 'linger', label: 'Linger share', color: 'var(--series-1)', values: totals.map((t) => share(t.lingers, t.watched)) },
      { key: 'memory', label: 'From memory', color: 'var(--series-2)', values: totals.map((t) => share(t.fromMem, t.watched)) },
      { key: 'favorite', label: 'Favorite family', color: 'var(--series-3)', values: totals.map((t) => share(t.favorite, t.watched)) },
    ],
    memRate: share(memLingers, memPages),
    freshRate: share(freshLingers, freshPages),
  };
}

function RememberedPage({ p }: { p: PageMemory }) {
  const note = noteName(p.midi);
  return (
    <li data-testid="memory-page">
      <Swatch hex={p.hex} label={`${p.catName}, ${note}`} />
      <div className="grow stack-tight" style={{ gap: 0 }}>
        <strong>
          {p.catName} · {note}
        </strong>
        <span className="muted small">
          Group {p.phase} · {groupOf(p.phase).name} · lingered {p.lingers} of {p.shown}
        </span>
      </div>
      <div className="stack-tight" style={{ gap: 0, alignItems: 'flex-end' }}>
        <span className="num">{percent(scoreMean(p))}</span>
        <span className="muted small">to return</span>
      </div>
    </li>
  );
}

function formatDate(at: number): string {
  return new Date(at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function MemoryScreen() {
  const memory = useApp((s) => s.memory);
  const repo = useApp((s) => s.repo);
  const [sandbox, setSandbox] = useState<SandboxResult | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [pending, setPending] = useState<{ file: ExportFile; summary: ImportSummary } | null>(null);
  const [resetArmed, setResetArmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const pages = Object.values(memory.pages).sort((a, b) => scoreMean(b) - scoreMean(a) || b.lingers - a.lingers);
  const loops = memory.loops.filter((l) => !l.sim);
  const history: LineSeries[] = [
    { key: 'linger', label: 'Linger share', color: 'var(--series-1)', values: loops.map((l) => (l.watched ? l.lingers / l.watched : 0)) },
    { key: 'memory', label: 'From memory', color: 'var(--series-2)', values: loops.map((l) => (l.watched ? l.fromMem / l.watched : 0)) },
  ];

  const onSandbox = async () => {
    setProgress(0);
    setSandbox(await runSandbox(setProgress));
    setProgress(null);
  };

  const onExport = async () => {
    if (!repo) return;
    const at = Date.now();
    const url = URL.createObjectURL(new Blob([exportJson(await exportAll(repo, at))], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = exportFileName(at);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage('Exported. The file holds your memory, sessions and settings.');
  };

  const onPickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const check = checkImport(await file.text());
    setResetArmed(false);
    if (check.ok) {
      setPending({ file: check.file, summary: check.summary });
      setMessage(null);
    } else {
      setPending(null);
      setMessage(check.error);
    }
  };

  const onConfirmImport = async () => {
    if (!repo || !pending) return;
    await applyImport(repo, pending.file, Date.now());
    setPending(null);
    await reloadFromRepo();
    setMessage('Imported. A copy of your previous memory was kept on this device.');
  };

  const onConfirmReset = async () => {
    if (repo) await repo.reset(Date.now());
    useApp.setState({ memory: emptyMemory(), lastSession: null });
    setResetArmed(false);
    setMessage('Memory cleared. Settings are unchanged.');
  };

  return (
    <Screen title="Memory" intro="Pages you stayed on much longer than their neighbors. Scores fade 15% each session, and everything stays on this device.">
      <section className="stack" aria-labelledby="remembered-heading">
        <div className="spread">
          <h2 id="remembered-heading">Remembered pages</h2>
          <span className="muted small num" data-testid="memory-count">
            {pages.length} of 80
          </span>
        </div>
        {pages.length > 0 ? (
          <ul className="list">
            {pages.map((p) => (
              <RememberedPage key={p.key} p={p} />
            ))}
          </ul>
        ) : (
          <p className="muted" data-testid="memory-empty">
            Nothing remembered yet. Stay on a page much longer than the ones around it, and it will appear here.
          </p>
        )}
      </section>

      <section className="panel" aria-labelledby="history-heading">
        <h2 id="history-heading">Session history</h2>
        {loops.length > 1 ? (
          <LineChart title="Share of pages per session" xLabel="Session" xValues={loops.map((l) => l.n)} series={history} testId="history-chart" />
        ) : loops.length === 1 ? (
          <p className="muted">
            One session so far: you lingered on {percent(history[0].values[0])} of its pages, and {percent(history[1].values[0])} came from memory.
            From the second session on, this becomes a chart.
          </p>
        ) : (
          <p className="muted">Your sessions will be charted here.</p>
        )}
      </section>

      <section className="panel" aria-labelledby="sandbox-heading">
        <h2 id="sandbox-heading">Sandbox</h2>
        <p className="muted small">
          {SANDBOX.viewers} simulated viewers, each with one favorite color family and one favorite note, watch {SANDBOX.loops} sessions each. It
          shows how memory learns. Your own memory is not touched.
        </p>
        <button type="button" className="btn" onClick={() => void onSandbox()} disabled={progress !== null}>
          {progress === null ? (sandbox ? 'Run again' : 'Run sandbox') : `Simulating ${progress} of ${SANDBOX.viewers}`}
        </button>
        {sandbox && (
          <>
            <LineChart title="Simulated viewers, share of pages" xLabel="Session" xValues={sandbox.loops} series={sandbox.series} testId="sandbox-chart" />
            <p className="muted small">
              Remembered pages held viewers {percent(sandbox.memRate)} of the time, against {percent(sandbox.freshRate)} for new pages.
            </p>
          </>
        )}
      </section>

      <section className="panel" aria-labelledby="data-heading">
        <h2 id="data-heading">Your data</h2>
        <p className="muted small">Export saves one file with your memory, sessions and settings. Import replaces them, after you confirm.</p>
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => void onExport()} disabled={!repo}>
            Export
          </button>
          <button type="button" className="btn" onClick={() => fileInput.current?.click()} disabled={!repo}>
            Import
          </button>
        </div>
        <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={(e) => void onPickFile(e)} />

        {pending && (
          <div className="notice stack" role="group" aria-label="Confirm import">
            <p>
              This file holds {pending.summary.pages} remembered pages, a history of {pending.summary.loops} sessions and {pending.summary.sessions}{' '}
              stored sessions, exported {formatDate(pending.summary.exportedAt)}. Importing replaces the memory, sessions and settings on this
              device. A copy of your current memory is kept first.
            </p>
            <div className="btn-row">
              <button type="button" className="btn" onClick={() => void onConfirmImport()}>
                Replace my data
              </button>
              <button type="button" className="btn" onClick={() => setPending(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <hr className="divider" />
        {resetArmed ? (
          <div className="stack" role="group" aria-label="Confirm reset">
            <p className="small">This clears remembered pages and stored sessions. Settings stay as they are.</p>
            <div className="btn-row">
              <button type="button" className="btn btn-danger" onClick={() => void onConfirmReset()} data-testid="reset-confirm">
                Reset now
              </button>
              <button type="button" className="btn" onClick={() => setResetArmed(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              setPending(null);
              setResetArmed(true);
            }}
            data-testid="reset"
          >
            Reset memory
          </button>
        )}
        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
      </section>
    </Screen>
  );
}
