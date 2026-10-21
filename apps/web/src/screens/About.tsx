import { SOURCES } from '../content/sources';
import { Screen } from '../ui';

/** Source numbers, as in the list at the end. */
function Refs({ n }: { n: number[] }) {
  return <span className="num muted small"> [{n.join(', ')}]</span>;
}

export function About() {
  return (
    <Screen title="About" intro="A plain account of what Calm Scroll does, and why.">
      <section className="prose">
        <h2>What it is</h2>
        <p>
          Calm Scroll plays a fifteen-minute feed of full-screen colors, each with one soft note. You move on whenever you like, as in a short-video
          feed. It is a relaxation aid. It does not diagnose, treat or cure anything.
        </p>
        <p>No study has tested this exact mix of color, sound and feed, so treat it as a gentle experiment.</p>
      </section>

      <section className="prose">
        <h2>The arc</h2>
        <p>Each session passes through seven groups: Meet, Lift, Ground, Deepen, Slow, Release and Rest.</p>
        <ul>
          <li>
            Colors lose saturation as the session goes on, because saturation and brightness move arousal more than hue does.
            <Refs n={[7, 8]} />
          </li>
          <li>
            They move from warm to cool families, since cool hues arouse less than red at matched saturation.
            <Refs n={[8]} />
          </li>
          <li>
            Lightness stays in a soft middle band rather than ending near black, because dark immersive scenes can raise arousal.
            <Refs n={[10]} />
          </li>
          <li>
            Notes descend and soften, and lighter pages take higher notes, a match most people share.
            <Refs n={[15, 16, 17]} />
          </li>
          <li>
            The last page resolves to the home note, D3, and the session ends in silence.
            <Refs n={[14]} />
          </li>
        </ul>
        <p>
          The sound uses standard tuning, with A at 440 Hz. Claims about 432 Hz rest on one small pilot study.
          <Refs n={[19]} />
        </p>
      </section>

      <section className="prose">
        <h2>The linger rhythm</h2>
        <p>
          Stay on a page past its planned time and it starts to breathe. Its note repeats once per breath, each breath a little longer, softer
          and weighted toward the exhale, and the screen dims slightly.
        </p>
        <p>
          The gradual rhythm starts at the page's own pace and stretches each breath about 6%, toward six and then five breaths a minute. Slow
          breathing near six a minute, with a longer exhale, is linked to relaxation, though the studies are small.
          <Refs n={[20, 21, 22, 23, 24, 25]} />
        </p>
        <p>
          Each change stays small, because responses fade with repetition and return with sudden novelty.
          <Refs n={[28]} /> The 2, 5, 9 second rhythm is kept for comparison. Its 2 second opening equals thirty breaths a minute, so it is not the default.
        </p>
      </section>

      <section className="prose">
        <h2>Rest</h2>
        <p>
          After three minutes without a touch or key press, the sound fades to silence and the screen may turn off. The page is noted as possible
          sleep. Any touch wakes it.
          <Refs n={[26, 27]} />
        </p>
      </section>

      <section className="prose">
        <h2>Memory</h2>
        <p>
          A page you stay on much longer than the pages around it is remembered, with a score. Each page is compared only with its neighbors, so
          the natural slowing late in a session does not count as a preference.
          <Refs n={[32, 33]} />
        </p>
        <p>
          The next session may bring a remembered page back by chance, inside its original group and never more than a quarter of a group, so
          most of each session stays new.
          <Refs n={[2, 34, 35]} /> Scores fade 15% each session. You can turn this off on the Home screen.
        </p>
      </section>

      <section className="prose">
        <h2>Privacy</h2>
        <p>
          There is no account, no analytics and no network use. Everything stays in this browser on this device. You can export, import or reset
          it on the Memory screen.
        </p>
      </section>

      <section className="prose">
        <h2>Care and safety</h2>
        <ul>
          <li>
            Nothing flashes. Colors change only by slow crossfade, every page lasts at least two seconds, and the feed moves at most one page per
            0.4 seconds.
            <Refs n={[4]} />
          </li>
          <li>Saturation stays low, and the first page is the loudest. The volume control can only make sound softer.</li>
          <li>
            Every color is paired with a name, a note or a lightness cue, since red-green color blindness is common.
            <Refs n={[5]} />
          </li>
          <li>
            At night, lower your screen brightness. Blue light is the strongest signal for staying awake.
            <Refs n={[6]} />
          </li>
          <li>Sessions end. There are no streaks, badges, notifications or endless feed.</li>
        </ul>
      </section>

      <section className="prose" aria-labelledby="sources-heading">
        <h2 id="sources-heading">Sources</h2>
        <ol className="sources">
          {SOURCES.map((s) => (
            <li key={s.n} value={s.n}>
              {s.cite}{' '}
              <a href={s.url} target="_blank" rel="noreferrer noopener">
                Link
              </a>
            </li>
          ))}
        </ol>
      </section>
    </Screen>
  );
}
