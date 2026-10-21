import { useEffect, useRef } from 'react';
import { BackButton } from '../ui';

/**
 * Owner change (Oct 2026): About names the maker and nothing more. Behind the name, a cobalt glow
 * breathes at six breaths a minute, the pace the linger rhythm moves toward.
 */
export function About() {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);

  return (
    <main className="screen about-screen">
      <div className="column about">
        <BackButton />

        <div className="about-center">
          <div className="about-glow" aria-hidden="true" />
          <h1 ref={heading} tabIndex={-1} className="about-title">
            <span className="about-eyebrow">a cobalt app</span>{' '}
            <span className="about-by">by</span>{' '}
            <span className="about-maker">a color company</span>
          </h1>
          <span className="about-rule" aria-hidden="true" />
          <a className="about-link" href="https://acolorcompany.com" target="_blank" rel="noopener noreferrer">
            acolorcompany.com<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>

        <p className="about-rights">© 2026 a color company. All rights reserved.</p>
      </div>
    </main>
  );
}
