/** What a cold visitor reads before they reach the app. */
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
        <a className="ghlink" href="https://github.com/AashishAnanth/college-compass">
          Source on GitHub
        </a>
      </header>

      <p className="thesis hero">
        Canvas told me I had a <em>100%</em> and a <em>6.58%</em> in the same
        course, on the same day.
      </p>

      <p className="standfirst">
        Both numbers were real, and neither was my grade. Canvas computes one
        figure that ignores everything ungraded and another that counts it all as
        zero. In September the gap between them is the entire course.
      </p>

      <div className="proof">
        <div className="pcol">
          <span className="plabel">What Canvas showed</span>
          <span className="pbig">100%<span className="psub">&thinsp;A</span></span>
          <span className="pnote">ignores everything ungraded</span>
        </div>
        <div className="pcol">
          <span className="plabel">Also Canvas, same day</span>
          <span className="pbig">6.58%<span className="psub">&thinsp;F</span></span>
          <span className="pnote">counts ungraded work as zero</span>
        </div>
        <div className="pcol accent">
          <span className="plabel">Actually decided</span>
          <span className="pbig">1.8%</span>
          <span className="pnote">of the course had been graded</span>
        </div>
      </div>

      <p className="standfirst tight">
        College Compass reads your real Canvas data, reconciles it against the
        grading rules in your syllabus, and refuses to show a single number.
        It shows the range, how much is actually settled, and what you can afford
        to let up on. Below is the real interface running on sample data — drag
        the sliders, switch the point in the semester.
      </p>
    </div>
  );
}
