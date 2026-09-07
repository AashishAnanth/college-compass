import { TRIAGE_COPY, triage } from '../../engine/narrate';
import type { CourseResult } from '../../engine/types';

/** Where the next hour goes. Refuses to rank when ranking would be dishonest. */
export function Triage({ results }: { results: CourseResult[] }) {
  const report = triage(results, 'A');

  return (
    <section>
      <h2>Where the next hour goes</h2>
      <div className="triage">
        {report.rows.map((t) => {
          const detail =
            t.verdict === 'gone'
              ? `an A is out of reach; the B needs ${(t.result.needed_for('B') ?? 0).toFixed(0)}%`
              : t.verdict === 'locked' ? 'the A holds even if you stop now'
              : t.need === null ? 'nothing left to play for'
              : <>needs <b>{t.need.toFixed(0)}%</b> on everything remaining</>;
          return (
            <div className={`trow ${t.verdict}`} key={t.code}>
              <span className="code">{t.code}</span>
              <span className="verdict">{TRIAGE_COPY[t.verdict]} — {detail}</span>
              <span className="num">
                {t.slack === null ? '—'
                  : `${t.slack > 0 ? '' : '-'}${Math.abs(t.slack).toFixed(0)} pts slack`}
              </span>
            </div>
          );
        })}
      </div>
      <p className="bandnote">
        {report.tooCloseToCall
          ? `Every course needs within ${report.spread.toFixed(1)} points of the same
             thing right now, so there is no real priority order yet — this list will
             separate as grades come in. Slack is how much of the remaining course you
             can throw away and still finish with an A.`
          : `Slack is how many points of the remaining course you can throw away and
             still finish with an A. Least slack first.`}
      </p>
    </section>
  );
}
