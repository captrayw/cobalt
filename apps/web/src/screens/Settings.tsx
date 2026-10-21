import { USER_VOLUME_DB, type LingerMode, type PaceId } from '@calm/core';
import { updateSettings, useApp } from '../store';
import type { MotionSetting, ThemeSetting } from '../storage/types';
import { Screen, Segmented, Switch } from '../ui';

const PACES = [
  { value: 'standard', label: '5–10 s' },
  { value: 'measured', label: '12–24 s' },
] as const satisfies readonly { value: PaceId; label: string }[];

const RHYTHMS = [
  { value: 'gradual', label: 'Gradual' },
  { value: 'user', label: '2, 5, 9 s' },
] as const satisfies readonly { value: LingerMode; label: string }[];

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

export function SettingsScreen() {
  const s = useApp((st) => st.settings);
  const volumeLabel = s.volumeDb === 0 ? '0 dB, the maximum' : `${s.volumeDb} dB`;

  return (
    <Screen title="Settings">
      <section className="panel" aria-label="Session">
        <Segmented
          legend="Pace"
          value={s.pace}
          choices={PACES}
          onChange={(pace) => void updateSettings({ pace })}
          hint="Seconds per page. Measured viewing is slower, so the longer pace is offered too."
        />
        <Segmented
          legend="Linger rhythm"
          value={s.lingerMode}
          choices={RHYTHMS}
          onChange={(lingerMode) => void updateSettings({ lingerMode })}
          hint="Gradual starts at the page's own pace and stretches each breath about 6%. The 2, 5, 9 s rhythm is kept for comparison."
        />
      </section>

      <section className="panel" aria-label="Sound">
        <div className="field">
          <div className="spread">
            <label className="label" htmlFor="volume">
              Volume
            </label>
            <span className="num muted small" aria-hidden="true">
              {volumeLabel}
            </span>
          </div>
          <input
            id="volume"
            className="range"
            type="range"
            min={USER_VOLUME_DB.min}
            max={USER_VOLUME_DB.max}
            step={1}
            value={s.volumeDb}
            aria-valuetext={volumeLabel}
            onChange={(e) => void updateSettings({ volumeDb: Number(e.target.value) })}
          />
          <p className="hint">The volume control can only make sound softer. Each session starts at its loudest and falls from there.</p>
        </div>
      </section>

      <section className="panel" aria-label="Display">
        <Switch
          label="Page details"
          hint="Show each page's note and color name."
          checked={s.pageDetails}
          onChange={(pageDetails) => void updateSettings({ pageDetails })}
        />
        <hr className="divider" />
        <Segmented
          legend="Motion"
          value={s.reducedMotion}
          choices={MOTION}
          onChange={(reducedMotion) => void updateSettings({ reducedMotion })}
          hint="Reduce switches colors instantly and hides the progress line."
        />
        <Segmented legend="Theme" value={s.theme} choices={THEMES} onChange={(theme) => void updateSettings({ theme })} />
      </section>

      <p className="muted small">
        At night, consider lowering your screen brightness. The arc ends in blue and violet, and blue light holds back melatonin, the hormone
        that eases sleep, more than any other color.
      </p>
    </Screen>
  );
}
