import { useEffect, useRef } from 'react';
import { BackButton } from '../ui';

/**
 * The website's impasto texture for the calm-arc bar. The header bar is 11 px tall with a
 * displacement of 6; at larger sizes the brand guide asks for about 6 per 30 px of bar height.
 */
const MARK_HEIGHT_PX = 22;
const MARK_DISPLACEMENT = (6 * MARK_HEIGHT_PX) / 30;

/**
 * Owner change (Oct 2026): About names the maker and nothing more: "a cobalt app by" the A Color
 * Company lockup, the website and the rights line. Behind it, a cobalt glow breathes at six breaths
 * a minute, the pace the linger rhythm moves toward.
 */
export function About() {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);

  return (
    <main className="screen about-screen">
      <svg className="filter-defs" width="0" height="0" aria-hidden="true" focusable="false">
        <defs>
          <filter id="impasto" x="-4%" y="-4%" width="108%" height="108%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.03 0.11" numOctaves={3} seed={7} result="t" />
            <feDiffuseLighting in="t" surfaceScale={1.6} lightingColor="#ffffff" result="l">
              <feDistantLight azimuth={235} elevation={58} />
            </feDiffuseLighting>
            <feComposite in="SourceGraphic" in2="l" operator="arithmetic" k1={1.16} k2={0} k3={0} k4={0} result="lit" />
            <feDisplacementMap in="lit" in2="t" scale={MARK_DISPLACEMENT} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      <div className="column about">
        <BackButton />

        <div className="about-center">
          <div className="about-glow" aria-hidden="true" />
          <h1 ref={heading} tabIndex={-1} className="about-title">
            <span className="about-eyebrow">a cobalt app</span>{' '}
            <span className="about-by">by</span>{' '}
            <span className="brand">
              <span className="brand-mark" aria-hidden="true" />A Color Company
            </span>
          </h1>
          <span className="about-rule" aria-hidden="true" />
          <a className="about-link" href="https://acolorcompany.com" target="_blank" rel="noopener noreferrer">
            acolorcompany.com<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>

        <p className="about-rights">© 2026 A Color Company. All rights reserved.</p>
      </div>
    </main>
  );
}
