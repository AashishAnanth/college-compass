import type { CourseResult } from '../../engine/types';

/** The Airbnb price-breakdown pattern applied to a grade: line items, a rule,
 *  a total. Opened by choice, never in your face. */
export function Receipt({ result }: { result: CourseResult }) {
  const rows = result.groups.filter((g) => g.weight >= 0.05 || g.is_bonus);
  const notes = [...(result.rules.notes ?? []), ...result.warnings];

  return (
    <div className="receipt">
      {rows.map((g) => {
        const got = g.earned_fraction === null
          ? (g.scored_count === 0 ? 'not started' : '—')
          : `${(g.earned_fraction * 100).toFixed(0)}% so far`;
        const count = g.expected_count
          ? `${g.scored_count} of ${g.expected_count}`
          : `${g.scored_count} graded`;
        return (
          <div className={`line${g.is_bonus ? ' flag' : ''}`} key={g.name}>
            <span>{g.name}</span>
            <span>{count} · {got}</span>
            <span>{g.is_bonus ? `+${g.weight.toFixed(0)}%` : `${g.weight.toFixed(1)}%`}</span>
          </div>
        );
      })}
      <div className="line total">
        <span>Decided so far</span><span /><span>{result.settled_pct.toFixed(1)}%</span>
      </div>
      {notes.length > 0 && (
        <p className="note">
          {notes.map((n, i) => (
            <span key={i}>{n}{i < notes.length - 1 && <br />}</span>
          ))}
        </p>
      )}
    </div>
  );
}
