import { QuestionCarousel } from '../app/components/QuestionCarousel';

/** Compact. The tool is the point; this exists to say what it is in one breath. */
export function Landing() {
  return (
    <div className="wrap landing">
      <header className="mast">
        <svg className="needle" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="10.25" stroke="currentColor" strokeWidth="1.1" opacity=".45" />
          <path d="M12 4.2 L15 13.4 L12 11.6 L9 13.4 Z" fill="currentColor" />
          <path d="M12 19.8 L9 10.6 L12 12.4 L15 10.6 Z" fill="currentColor" opacity=".3" />
        </svg>
        <span className="wordmark">College&nbsp;Compass</span>
        <nav className="mnav">
          <a href="https://github.com/AashishAnanth/college-compass">GitHub</a>
          <a className="btn small" href="https://github.com/AashishAnanth/college-compass#install-the-extension">
            Add to Chrome
          </a>
        </nav>
      </header>

      <QuestionCarousel />

      <p className="standfirst lede">
        A grade planner that reads your Canvas courses and your syllabus, then
        tells you what you need on what&rsquo;s left. <b>Type a score into any
        assignment below</b> and every number on the page recomputes.
      </p>
    </div>
  );
}
