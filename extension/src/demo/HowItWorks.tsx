/** The section engineers read. Specifics, not adjectives. */
export function HowItWorks() {
  return (
    <div className="wrap how">
      <section>
        <h2>How it works</h2>

        <div className="hgrid">
          <div className="hcell">
            <h3>Session-based, no credentials</h3>
            <p>
              A Manifest V3 extension injects a collector into the Canvas tab you
              are already signed into. Requests are same-origin, so the session
              cookie carries them. No access token, no password, no account, and
              nothing is sent anywhere — the engine runs in your browser.
            </p>
          </div>

          <div className="hcell">
            <h3>Syllabus rules, not just Canvas</h3>
            <p>
              Canvas rarely knows the whole grading scheme. A rules model covers
              weighted and raw-points courses, bonus categories that can never
              lower a grade, dropped scores, score multipliers, and rounding —
              a course rounding to the nearest integer makes 89.5 an A and 89.49 a B.
            </p>
          </div>

          <div className="hcell">
            <h3>Answers, not a dashboard</h3>
            <p>
              Every course gets one sentence you can act on — what you need from
              here, or that it is already decided. Where the engine cannot say
              something useful it says that instead: early in a term the triage
              view refuses to rank courses at all, because every one of them
              needs roughly the same thing. Canvas&rsquo;s own numbers are shown
              only as a footnote, since they routinely disagree with themselves
              by fifty points.
            </p>
          </div>

          <div className="hcell">
            <h3>The engine exists twice, on purpose</h3>
            <p>
              Python for analysis, TypeScript so the extension needs no backend.
              A parity harness runs both over every scenario and diffs{' '}
              <b>753 values</b>, so the two cannot drift. It has already earned
              its keep: it pinned a projection bug where a 500-point course
              collapsed to an F because Canvas had not created the later
              assignments yet.
            </p>
          </div>
        </div>

        <p className="fine">
          The data on this page is synthetic — invented courses, invented scores.
          The shapes are taken from real Canvas API responses, including the ways
          a course can be misconfigured: weighting switched off, category weights
          left at zero, bonus work filed as ordinary graded work, and assignments
          marked graded with no score entered. A demo built on tidy data would
          misrepresent the problem, because the problem is that the real data is
          not tidy.
        </p>

        <div className="cta">
          <a className="btn" href="https://github.com/AashishAnanth/college-compass">
            Read the source
          </a>
          <span className="ctanote">
            Python&nbsp;+&nbsp;TypeScript&nbsp;· React&nbsp;18&nbsp;· Manifest&nbsp;V3&nbsp;· no backend
          </span>
        </div>
      </section>
    </div>
  );
}
