import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

export interface LineSeries {
  key: string;
  label: string;
  /** A CSS color, normally var(--series-n). The same entity keeps the same slot in every chart. */
  color: string;
  /** Shares from 0 to 1, one per x value. */
  values: number[];
}

const Y_TICKS = [0, 0.25, 0.5, 0.75, 1];
/** End labels closer than this (px) would collide; then the legend carries identity alone. */
const LABEL_GAP = 16;
/** Below this width there is no room for end labels; the legend and tooltip carry the values. */
const END_LABEL_MIN_WIDTH = 480;

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** The element's width in CSS pixels, kept current as it resizes. */
function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.max(240, Math.round(el.clientWidth)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * A small share-over-sessions line chart: 2px lines, ringed end dots, hairline grid, a legend,
 * selective end labels, a crosshair tooltip on hover and keyboard focus, and a table view.
 * It draws at its real pixel width, so text stays 12 px on a phone and on a desktop.
 */
export function LineChart({ title, xLabel, xValues, series, testId }: { title: string; xLabel: string; xValues: number[]; series: LineSeries[]; testId?: string }) {
  const id = useId();
  const [box, W] = useWidth(360);
  const [hover, setHover] = useState<number | null>(null);
  const roomy = W >= END_LABEL_MIN_WIDTH;
  const H = roomy ? 236 : 200;
  const M = { top: 14, right: roomy ? 118 : 14, bottom: 34, left: 40 };
  const PLOT_W = W - M.left - M.right;
  const PLOT_H = H - M.top - M.bottom;
  const n = xValues.length;
  const top = Math.max(0.25, ...series.flatMap((s) => s.values));
  const yMax = Math.min(1, Math.ceil(top * 4) / 4);
  const ticks = Y_TICKS.filter((t) => t <= yMax + 1e-9);

  const x = (i: number) => M.left + (n <= 1 ? PLOT_W / 2 : (i / (n - 1)) * PLOT_W);
  const y = (v: number) => M.top + PLOT_H - (Math.min(v, yMax) / yMax) * PLOT_H;

  // End labels ride the lines when there is room and they do not collide; the legend always carries identity.
  const ends = n === 0 || !roomy ? [] : series.map((s) => ({ key: s.key, label: s.label, value: s.values[n - 1], y: y(s.values[n - 1]) })).sort((a, b) => a.y - b.y);
  const endLabels = ends.some((e, i) => i > 0 && e.y - ends[i - 1].y < LABEL_GAP) ? [] : ends;

  const xTickEvery = Math.max(1, Math.ceil(n / (roomy ? 8 : 5)));

  const onPointer = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!box || n === 0) return;
    const vx = ((e.clientX - box.left) / box.width) * W;
    const i = n <= 1 ? 0 : Math.round(((vx - M.left) / PLOT_W) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (n === 0) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const step = e.key === 'ArrowRight' ? 1 : -1;
      setHover((h) => Math.max(0, Math.min(n - 1, (h ?? (step > 0 ? -1 : n)) + step)));
    }
  };

  const tip = hover === null ? null : { left: (x(hover) / W) * 100, x: xValues[hover], rows: series.map((s) => ({ ...s, value: s.values[hover] })) };

  return (
    <figure className="chart" data-testid={testId} style={{ margin: 0 }}>
      <figcaption className="label">{title}</figcaption>
      <ul className="legend">
        {series.map((s) => (
          <li key={s.key}>
            <svg width="18" height="8" aria-hidden="true">
              <line x1="1" y1="4" x2="17" y2="4" stroke={s.color} strokeWidth="2" strokeLinecap="round" />
            </svg>
            {s.label}
          </li>
        ))}
      </ul>
      <div ref={box} style={{ position: 'relative' }}>
        <svg
          className="chart-plot"
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-labelledby={`${id}-desc`}
          tabIndex={0}
          onKeyDown={onKey}
          onFocus={() => setHover((h) => h ?? n - 1)}
          onBlur={() => setHover(null)}
        >
          <desc id={`${id}-desc`}>
            {title}. {series.map((s) => `${s.label}: ${s.values.map(pct).join(', ')}`).join('. ')}.
          </desc>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={M.left + PLOT_W} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
              <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="12" fill="var(--ink-2)" style={{ fontFamily: 'var(--font-mono)' }}>
                {pct(t)}
              </text>
            </g>
          ))}
          {xValues.map((v, i) =>
            i % xTickEvery === 0 || i === n - 1 ? (
              <text key={v} x={x(i)} y={H - M.bottom + 18} textAnchor="middle" fontSize="12" fill="var(--ink-2)" style={{ fontFamily: 'var(--font-mono)' }}>
                {v}
              </text>
            ) : null,
          )}
          <text x={M.left + PLOT_W / 2} y={H - 2} textAnchor="middle" fontSize="12" fill="var(--ink-2)">
            {xLabel}
          </text>

          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + PLOT_H} stroke="var(--line-strong)" strokeWidth="1" />}

          {series.map((s) => (
            <g key={s.key} data-series={s.key}>
              {n > 1 && (
                <path
                  d={s.values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              {n > 0 && <circle cx={x(n - 1)} cy={y(s.values[n - 1])} r="4" fill={s.color} stroke="var(--panel)" strokeWidth="2" />}
              {hover !== null && hover !== n - 1 && <circle cx={x(hover)} cy={y(s.values[hover])} r="4" fill={s.color} stroke="var(--panel)" strokeWidth="2" />}
            </g>
          ))}

          {endLabels.map((e) => (
            <text key={e.key} x={x(n - 1) + 10} y={e.y} dy="0.32em" fontSize="12" fill="var(--ink-2)">
              <tspan fill="var(--ink)" style={{ fontFamily: 'var(--font-mono)' }}>
                {pct(e.value)}
              </tspan>{' '}
              {e.label}
            </text>
          ))}

          <rect
            x={M.left - 12}
            y={M.top}
            width={PLOT_W + 24}
            height={PLOT_H}
            fill="transparent"
            onPointerMove={onPointer}
            onPointerDown={onPointer}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
        {tip && (
          <div
            className="chart-tip"
            role="status"
            style={{ left: `${Math.min(78, Math.max(4, tip.left))}%` }}
          >
            <span className="label">
              {xLabel} {tip.x}
            </span>
            {tip.rows.map((r) => (
              <span key={r.key} className="chart-tip-row">
                <svg width="14" height="8" aria-hidden="true">
                  <line x1="1" y1="4" x2="13" y2="4" stroke={r.color} strokeWidth="2" strokeLinecap="round" />
                </svg>
                <strong className="num">{pct(r.value)}</strong>
                <span className="muted">{r.label}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      <details className="chart-table">
        <summary>Show as table</summary>
        <div className="table-wrap" role="region" aria-label={`${title}, table`} tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th scope="col">{xLabel}</th>
                {series.map((s) => (
                  <th scope="col" key={s.key}>
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {xValues.map((v, i) => (
                <tr key={v}>
                  <td>{v}</td>
                  {series.map((s) => (
                    <td key={s.key}>{pct(s.values[i])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
