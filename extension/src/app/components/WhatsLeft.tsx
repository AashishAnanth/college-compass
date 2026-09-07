import { useState } from 'react';
import type { CourseResult, ItemResult } from '../../engine/types';

/**
 * What is still to play for, and what each piece is actually worth.
 *
 * This is the part that answers "what do I need on the final" — you cannot
 * say it without knowing what the final is worth, which Canvas will not tell
 * you and the syllabus states only in passing.
 */

function verdict(need: number | null): { text: string; tone: string } {
  if (need === null) return { text: '—', tone: '' };
  if (need <= 0) return { text: 'skip it, you’re still fine', tone: 'free' };
  if (need > 100) return { text: 'a perfect score is not enough', tone: 'over' };
  return { text: `need ${need.toFixed(0)}%`, tone: need >= 90 ? 'hard' : '' };
}

function when(due: string | null): string {
  if (!due) return '';
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** The best grade still in play. Targeting the A on a course where the A is
 *  gone makes every row read "not enough on its own", which helps nobody. */
function bestReachable(result: CourseResult): string | null {
  const letters = Object.entries(result.rules.letter_cutoffs)
    .sort((a, b) => b[1] - a[1]).map(([l]) => l);
  for (const letter of letters) {
    const need = result.needed_for(letter);
    if (need !== null && need <= 100) return letter;
  }
  return null;
}

export function WhatsLeft({ result }: { result: CourseResult }) {
  const [all, setAll] = useState(false);
  const items: ItemResult[] = result.upcoming;
  const target = bestReachable(result);
  if (!items.length || !target) return null;

  const needs = items.map((it) => result.needed_on(it, undefined, target));
  // If your current pace cannot reach the target, no single assignment can
  // rescue it either, and a column of "not enough" says nothing. State the
  // real requirement once instead.
  const anyAchievable = needs.some((n) => n !== null && n <= 100);
  const uniform = result.needed_for(target);

  const shown = all ? items : items.slice(0, 5);
  const hidden = items.length - shown.length;

  return (
    <div className="left">
      <div className="lhead">
        <span>What&rsquo;s left</span>
        <span>worth</span>
        <span>{anyAchievable ? `to hold the ${target}` : ''}</span>
      </div>

      {shown.map((it, i) => {
        const v = anyAchievable
          ? verdict(needs[i] ?? null)
          : { text: '', tone: '' };
        return (
          <div className="lrow" key={`${it.group}/${it.name}`}>
            <span className="lname">
              {it.name}
              {when(it.due_at) && <em className="ldue">{when(it.due_at)}</em>}
            </span>
            <span className="lwt">{it.weight.toFixed(1)}%</span>
            <span className={`lneed ${v.tone}`}>{v.text}</span>
          </div>
        );
      })}

      {hidden > 0 && (
        <button className="lmore" onClick={() => setAll(true)}>
          {hidden} more, each worth under {shown[shown.length - 1]?.weight.toFixed(1)}%
        </button>
      )}

      <p className="lnote">
        {anyAchievable ? (
          <>
            Assumes the rest of the course goes at your current pace. Anything
            marked <em>skip it</em> can score zero without costing you the grade.
          </>
        ) : (
          <>
            Nothing here reaches the {target} on its own — at your current pace it
            takes <em>{(uniform ?? 0).toFixed(0)}% across everything left</em>.
            The weights still tell you where that effort is worth spending.
          </>
        )}
      </p>
    </div>
  );
}
