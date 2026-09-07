import { QuestionCarousel } from '../app/components/QuestionCarousel';
import { useCountUp, useReveal } from '../app/hooks/motion';

function Stat({ value, suffix, label, accent = false }: {
  value: number; suffix: string; label: string; accent?: boolean;
}) {
  const { ref, shown } = useReveal<HTMLDivElement>();
  const n = useCountUp(value, shown, 900);
  return (
    <div className={`pcol${accent ? ' accent' : ''}${shown ? ' in' : ''}`} ref={ref}>
      <span className="pbig">
        {value % 1 === 0 ? Math.round(n) : n.toFixed(1)}<span className="psub">{suffix}</span>
      </span>
      <span className="pnote">{label}</span>
    </div>
  );
}

export function Landing() {
  const intro = useReveal<HTMLDivElement>('0px');

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

      <div className={`intro${intro.shown ? ' in' : ''}`} ref={intro.ref}>
        <p className="eyebrow">Every week, the same questions</p>

        <QuestionCarousel />

        <p className="thesis hero">
          Your grade is a plan, not a number.
        </p>

        <p className="standfirst">
          Canvas can tell you what you scored. It cannot tell you what to do next —
          it does not know how your syllabus weights anything, or how many exams
          are still coming. College Compass reconciles the two and answers the
          question you actually have: <em>where does tonight go?</em>
        </p>
      </div>

      <div className="proof">
        <Stat value={5} suffix="" label="courses, one evening" />
        <Stat value={1} suffix="" label="actually needs your evening" accent />
        <Stat value={38} suffix="%" label="of the term already decided" />
      </div>

      <p className="standfirst tight">
        Below is the real interface, running on sample data. Drag a slider to
        test a scenario. Move through the semester to watch the advice change.
      </p>
    </div>
  );
}
