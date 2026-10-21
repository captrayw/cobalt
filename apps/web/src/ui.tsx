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

/** Back to the Done screen, at the top of each secondary screen. */
export function BackButton() {
  return (
    <button type="button" className="back" onClick={() => navigate('done')}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Back
    </button>
  );
}

/**
 * One screen: a single column up to 640 px. Focus moves to its heading when it opens. With `fill`,
 * the last block (a screen's buttons) sits at the bottom of the screen when the content is shorter.
 */
export function Screen({
  title,
  intro,
  back = true,
  fill = false,
  children,
}: {
  title: string;
  intro?: ReactNode;
  back?: boolean;
  fill?: boolean;
  children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  return (
    <main className={fill ? 'screen screen-fill' : 'screen'}>
      <div className="column">
        <header className="screen-head">
          {back && <BackButton />}
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

/** A light tap on phones that have one, as instant feedback for a change. */
export function haptic(): void {
  try {
    navigator.vibrate?.(10);
  } catch {
    // No vibration here: the change on screen is the feedback.
  }
}

/** The label of a settings row, with its one line of help underneath. */
export function RowText({ label, labelId, hint, hintId }: { label: ReactNode; labelId: string; hint?: ReactNode; hintId: string }) {
  // Spans throughout, so a whole row can also be a button.
  return (
    <span className="row-text">
      <span id={labelId} className="row-label">
        {label}
      </span>
      {hint && (
        <span id={hintId} className="row-help">
          {hint}
        </span>
      )}
    </span>
  );
}

/** A choice among a few short options, as a settings row: label and help, then the options as pills. */
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
  const labelId = useId();
  const hintId = useId();
  return (
    <div className="set-row set-row-wide">
      <RowText label={legend} labelId={labelId} hint={hint} hintId={hintId} />
      <div className="segmented" role="radiogroup" aria-labelledby={labelId} aria-describedby={hint ? hintId : undefined}>
        {choices.map((c) => (
          <label key={c.value}>
            <input
              type="radio"
              name={name}
              value={c.value}
              checked={value === c.value}
              onChange={() => {
                haptic();
                onChange(c.value);
              }}
            />
            {c.label}
          </label>
        ))}
      </div>
    </div>
  );
}

/** An on/off setting as a settings row: label and help on the left, the switch on the right. */
export function Switch({ label, hint, checked, onChange }: { label: string; hint?: ReactNode; checked: boolean; onChange: (checked: boolean) => void }) {
  const labelId = useId();
  const hintId = useId();
  return (
    <div className="set-row">
      <RowText label={label} labelId={labelId} hint={hint} hintId={hintId} />
      <button
        type="button"
        role="switch"
        className="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={hint ? hintId : undefined}
        onClick={() => {
          haptic();
          onChange(!checked);
        }}
      />
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
