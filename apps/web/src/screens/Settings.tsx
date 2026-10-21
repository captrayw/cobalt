import type { AudioEngine } from '@calm/audio';
import { generateValid, PACE_PRESETS, SCHEDULE, scoreMean, USER_VOLUME_DB } from '@calm/core';
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ARC } from '../arc';
import { navigate } from '../router';
import { createEngine, resetMemory, updateSettings, useApp } from '../store';
import type { MotionSetting, ThemeSetting } from '../storage/types';
import { haptic, RowText, Screen, Segmented, Switch } from '../ui';

const MOTION = [
  { value: 'system', label: 'System' },
  { value: 'reduce', label: 'Reduce' },
  { value: 'allow', label: 'Allow' },
] as const satisfies readonly { value: MotionSetting; label: string }[];

const THEMES = [
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
] as const satisfies readonly { value: ThemeSetting; label: string }[];

/** The first page of one fixed session: a real color and note to preview the settings with. */
const SAMPLE = generateValid({ seed: 7, ...PACE_PRESETS.standard }).items[0];

/** How long the sample note sounds, and the least time between notes while the volume slider moves. */
const SAMPLE_SEC = 1.4;
const SAMPLE_GAP_MS = 350;

/** Volume as the slider shows it, with a true minus sign. */
const formatDb = (db: number): string => `${db < 0 ? '−' : ''}${Math.abs(db)} dB`;

/**
 * Plays the sample page's note at a given volume: from the preview, and as the volume slider moves,
 * at most every SAMPLE_GAP_MS and always at the last value. `prime` starts audio inside a gesture.
 */
function useSampleNote() {
  const engine = useRef<AudioEngine | null>(null);
  const lastAt = useRef(Number.NEGATIVE_INFINITY);
  const trailing = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (trailing.current) clearTimeout(trailing.current);
      void engine.current?.close(0.05);
      engine.current = null;
    },
    [],
  );

  const prime = useCallback((volumeDb: number) => {
    engine.current ??= createEngine(volumeDb);
    void engine.current.unlock();
  }, []);

  const play = useCallback((volumeDb: number) => {
    lastAt.current = performance.now();
    const e = (engine.current ??= createEngine(volumeDb));
    e.setVolume(volumeDb);
    e.releaseVoices(0.06);
    void e.unlock().then((running) => {
      if (running) e.tone(SAMPLE.hz, e.now() + SCHEDULE.offset, SAMPLE_SEC, SAMPLE.gainDb, 0.35);
    });
  }, []);

  const playSoon = useCallback(
    (volumeDb: number) => {
      if (trailing.current) clearTimeout(trailing.current);
      const wait = lastAt.current + SAMPLE_GAP_MS - performance.now();
      if (wait <= 0) play(volumeDb);
      else trailing.current = setTimeout(() => play(volumeDb), wait);
    },
    [play],
  );

  return { prime, play, playSoon };
}

/** A card heading with its pigment marker, as on the website. */
function CardHead({ id, chip, children }: { id: string; chip: string | 'arc'; children: ReactNode }) {
  return (
    <div className="card-head">
      {chip === 'arc' ? (
        <span className="chip chip-arc" aria-hidden="true" />
      ) : (
        <span className="chip" style={{ '--chip': chip } as CSSProperties} aria-hidden="true" />
      )}
      <h2 id={id}>{children}</h2>
    </div>
  );
}

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none', color: 'var(--ink-3)' }}>
      <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The risky action, last and on its own, with a confirmation step. */
function ResetCard() {
  const headId = useId();
  const textIds = [useId(), useId()];
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const confirm = async () => {
    setBusy(true);
    try {
      await resetMemory();
      setMessage('Memory cleared. Settings are unchanged.');
    } catch (error) {
      console.warn(error);
      setMessage('The reset did not finish, so nothing was changed.');
    } finally {
      setBusy(false);
      setArmed(false);
    }
  };

  return (
    <section className="card" aria-labelledby={headId}>
      <CardHead id={headId} chip="var(--p-red)">
        Reset
      </CardHead>
      {armed ? (
        <div className="set-row" role="group" aria-label="Confirm reset">
          <RowText label="Reset memory?" labelId={textIds[0]} hint="Clears remembered pages and stored sessions." hintId={textIds[1]} />
          <div className="row" style={{ gap: 4 }}>
            <button type="button" className="btn-text" onClick={() => setArmed(false)}>
              Cancel
            </button>
            <button type="button" className="btn-text danger" onClick={() => void confirm()} disabled={busy} data-testid="settings-reset-confirm">
              Reset now
            </button>
          </div>
        </div>
      ) : (
        <div className="set-row">
          <RowText label="Reset memory" labelId={textIds[0]} hint="Forgets the pages you lingered on. Settings stay." hintId={textIds[1]} />
          <button
            type="button"
            className="btn-text danger"
            onClick={() => {
              haptic();
              setMessage('');
              setArmed(true);
            }}
            aria-describedby={textIds[1]}
            data-testid="settings-reset"
          >
            Reset
          </button>
        </div>
      )}
      <p className="row-help" role="status" style={{ paddingBottom: message ? 14 : 0 }}>
        {message}
      </p>
    </section>
  );
}

export function SettingsScreen() {
  const s = useApp((st) => st.settings);
  const memory = useApp((st) => st.memory);
  const { prime, play, playSoon } = useSampleNote();
  const ids = { preview: useId(), sound: useId(), screen: useId(), memory: useId(), night: useId() };
  const rowIds = [useId(), useId(), useId(), useId(), useId(), useId()];

  const remembered = Object.values(memory.pages).sort((a, b) => scoreMean(b) - scoreMean(a) || b.lingers - a.lingers);
  const learned =
    remembered.length === 0 ? 'Nothing yet' : `${remembered.length} remembered ${remembered.length === 1 ? 'page' : 'pages'}`;
  const volumeText = s.volumeDb === 0 ? '0 dB, the maximum' : `${s.volumeDb} dB`;

  return (
    <Screen title="Settings">
      <div className="cards">
        <section className="card preview" aria-labelledby={ids.preview}>
          <CardHead id={ids.preview} chip="arc">
            Preview
          </CardHead>
          <div
            className="preview-page"
            style={{ background: SAMPLE.hex }}
            role="img"
            aria-label={`The first page of a session: ${SAMPLE.catName}, note ${SAMPLE.note}.`}
          >
            {s.pageDetails && (
              <>
                <span>{SAMPLE.note}</span>
                <span>{SAMPLE.catName}</span>
              </>
            )}
          </div>
          <div className="preview-strip" aria-hidden="true">
            {ARC.map((step) => (
              <span key={step.name} style={{ background: step.hex }} />
            ))}
          </div>
          <div className="preview-foot">
            <span className="row-help">A session's first page, as it looks and sounds now.</span>
            <button type="button" className="btn-text" onClick={() => play(s.volumeDb)}>
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <path d="M3 1.8v10.4L12 7z" fill="currentColor" />
              </svg>
              Play note
            </button>
          </div>
        </section>

        <section className="card" aria-labelledby={ids.sound}>
          <CardHead id={ids.sound} chip="var(--p-blue)">
            Sound
          </CardHead>
          <div className="set-row set-row-wide">
            <div className="row-text">
              <label className="row-label" htmlFor="volume">
                Volume
              </label>
              <span className="row-help" id={rowIds[0]}>
                Softer only. Each session starts at its loudest.
              </span>
            </div>
            <span className="row-value" aria-hidden="true">
              {formatDb(s.volumeDb)}
            </span>
            <input
              id="volume"
              className="range"
              type="range"
              min={USER_VOLUME_DB.min}
              max={USER_VOLUME_DB.max}
              step={1}
              value={s.volumeDb}
              aria-valuetext={volumeText}
              aria-describedby={rowIds[0]}
              onChange={(e) => {
                const volumeDb = Number(e.target.value);
                void updateSettings({ volumeDb });
                playSoon(volumeDb);
              }}
              onPointerUp={(e) => {
                prime(Number(e.currentTarget.value));
                playSoon(Number(e.currentTarget.value));
              }}
            />
          </div>
        </section>

        <section className="card" aria-labelledby={ids.screen}>
          <CardHead id={ids.screen} chip="var(--p-yellow)">
            Screen and color
          </CardHead>
          <Switch
            label="Page details"
            hint="Show each page's note and color name."
            checked={s.pageDetails}
            onChange={(pageDetails) => void updateSettings({ pageDetails })}
          />
          <Segmented legend="Theme" hint="System follows your phone." value={s.theme} choices={THEMES} onChange={(theme) => void updateSettings({ theme })} />
          <Segmented
            legend="Motion"
            hint="Reduce switches colors instantly and hides the progress line."
            value={s.reducedMotion}
            choices={MOTION}
            onChange={(reducedMotion) => void updateSettings({ reducedMotion })}
          />
        </section>

        <section className="card" aria-labelledby={ids.memory}>
          <CardHead id={ids.memory} chip="var(--p-green)">
            Learning and memory
          </CardHead>
          <Switch
            label="Use what I lingered on"
            hint="Brings back pages you stayed on. Applies from the next session."
            checked={s.useMemory}
            onChange={(useMemory) => void updateSettings({ useMemory })}
          />
          <button type="button" className="set-row" onClick={() => navigate('memory')}>
            <RowText label="What it learned" labelId={rowIds[1]} hint={learned} hintId={rowIds[2]} />
            {remembered.length > 0 && (
              <span className="mini-swatches" aria-hidden="true">
                {remembered.slice(0, 4).map((p) => (
                  <span key={p.key} style={{ background: p.hex }} />
                ))}
              </span>
            )}
            <Chevron />
          </button>
          <div className="set-row">
            <RowText label="Where it's kept" labelId={rowIds[3]} hintId={rowIds[4]} />
            <span className="row-value">This device</span>
          </div>
        </section>

        <section className="card" aria-labelledby={ids.night}>
          <CardHead id={ids.night} chip="var(--p-violet)">
            Bedtime
          </CardHead>
          <div className="set-row">
            <RowText
              label="Lower your screen brightness"
              labelId={rowIds[5]}
              hint="The arc ends in blue and violet, and blue light holds back melatonin, the hormone that eases sleep, more than any other color."
              hintId={`${rowIds[5]}-help`}
            />
          </div>
        </section>

        <ResetCard />
      </div>
    </Screen>
  );
}
