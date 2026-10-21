import { useEffect, useId, useRef, type ReactNode } from 'react';
import { navigate } from './router';

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function formatMinutes(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`;
  return `${Math.round(seconds / 60)} min`;
}

export const percent = (x: number): string => `${Math.round(x * 100)}%`;

/** One screen: a single column up to 640 px. Focus moves to its heading when it opens. */
export function Screen({ title, intro, back = true, children }: { title: string; intro?: ReactNode; back?: boolean; children: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  return (
    <main className="screen">
      <div className="column">
        <header className="screen-head">
          {back && (
            <button type="button" className="back" onClick={() => navigate('done')}>
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Back
            </button>
          )}
          <h1 ref={heading} tabIndex={-1}>
            {title}
          </h1>
          {intro && <p className="muted">{intro}</p>}
        </header>
        {children}
      </div>
    </main>
  );
}

export interface Choice<T extends string> {
  value: T;
  label: string;
}

/** A radio group drawn as pills. */
export function Segmented<T extends string>({
  legend,
  hint,
  value,
  choices,
  onChange,
}: {
  legend: string;
  hint?: ReactNode;
  value: T;
  choices: readonly Choice<T>[];
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="field">
      <legend className="label">{legend}</legend>
      <div className="segmented">
        {choices.map((c) => (
          <label key={c.value}>
            <input type="radio" name={name} value={c.value} checked={value === c.value} onChange={() => onChange(c.value)} />
            {c.label}
          </label>
        ))}
      </div>
      {hint && <p className="hint">{hint}</p>}
    </fieldset>
  );
}

export function Switch({ label, hint, checked, onChange }: { label: string; hint?: ReactNode; checked: boolean; onChange: (checked: boolean) => void }) {
  const id = useId();
  return (
    <div className="stack-tight">
      <div className="switch-row">
        <span id={id}>{label}</span>
        <button type="button" role="switch" className="switch" aria-checked={checked} aria-labelledby={id} onClick={() => onChange(!checked)} />
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

/** A color is never shown alone: the swatch sits with its family name and note. */
export function Swatch({ hex, label }: { hex: string; label: string }) {
  return <span className="swatch" style={{ background: hex }} role="img" aria-label={label} />;
}
