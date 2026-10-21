import { USER_VOLUME_DB } from '@calm/core';
import { updateSettings, useApp } from '../store';
import type { MotionSetting, ThemeSetting } from '../storage/types';
import { Screen, Segmented, Switch } from '../ui';

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
        <Switch
          label="Use what I lingered on"
          hint="Brings back pages you stayed on, and gently favors their colors and notes. Applies from the next session."
          checked={s.useMemory}
          onChange={(useMemory) => void updateSettings({ useMemory })}
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
