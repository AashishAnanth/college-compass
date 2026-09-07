import { useState } from 'react';
import type { CourseResult, ItemResult } from '../../engine/types';

/**
 * What is still to play for, what each piece is worth, and what you need on it.
 *
 * Every row is an input. Type a score and the whole course recomputes -- this
 * is the difference between reading a grade and planning one.
 */

function verdict(need: number | null): { text: string; tone: string } {
  if (need === null) return { text: '', tone: '' };
  if (need <= 0) return { text: 'skip it, still fine', tone: 'free' };
  if (need > 100) return { text: '', tone: 'over' };
  return { text: `need ${need.toFixed(0)}%`, tone: need >= 90 ? 'hard' : '' };
}

function when(due: string | null): string {
  if (!due) return '';
  const d = new Date(due);
  return Number.isNaN(d.getTime())
    ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** The best grade still in play. Targeting the A on a course where the A is
 *  gone makes every row read "not enough", which helps nobody. */
function bestReachable(result: CourseResult): string | null {
  const letters = Object.entries(result.rules.letter_cutoffs)
    .sort((a, b) => b[1] - a[1]).map(([l]) => l);
  for (const letter of letters) {
    const need = result.needed_for(letter);
    if (need !== null && need <= 100) return letter;
  }
  return null;
}

export interface PlanControls {
  get(item: ItemResult): number | undefined;      // planned score, if any
  set(item: ItemResult, score: number | null): void;
}

export function WhatsLeft({ result, plan }: {
  result: CourseResult;
  plan?: PlanControls;
}) {
  const [all, setAll] = useState(false);
  const items: ItemResult[] = result.upcoming;
  const target = bestReachable(result);
  if (!items.length) return null;

  const needs = items.map(
    (it) => (target ? result.needed_on(it, undefined, target) : null));
  const anyAchievable = needs.some((n) => n !== null && n <= 100);

  const shown = all ? items : items.slice(0, 5);
  const hidden = items.length - shown.length;

  return (
    <div className="left">
      <div className="lhead">
        <span>What&rsquo;s left</span>
        <span>worth</span>
        <span>{anyAchievable && target ? `to hold the ${target}` : 'suggested'}</span>
        <span>my plan</span>
      </div>

      {shown.map((it, i) => {
        const v = anyAchievable ? verdict(needs[i] ?? null) : { text: '', tone: '' };
        const planned = plan?.get(it);
        const suggestion = needs[i] ?? null;
        return (
          <div className={`lrow${planned !== undefined ? ' planned' : ''}`}
               key={`${it.group}/${it.name}`}>
            <span className="lname">
              {it.name}
              {when(it.due_at) && <em className="ldue">{when(it.due_at)}</em>}
            </span>
            <span className="lwt">{it.weight.toFixed(1)}%</span>
            <span className={`lneed ${v.tone}`}>{v.text}</span>
            <span className="lplan">
              {plan ? (
                <>
                  <input
                    type="number" min={0} max={it.points ?? 100} step="any"
                    className="pinput"
                    value={planned ?? ''}
                    placeholder={
                      suggestion !== null && suggestion > 0 && suggestion <= 100
                        ? String(Math.ceil((suggestion / 100) * (it.points ?? 100)))
                        : '—'
                    }
                    aria-label={`Planned score for ${it.name}`}
                    onChange={(e) => {
                      const raw = e.target.value;
                      plan.set(it, raw === '' ? null : Number(raw));
                    }}
                  />
                  <span className="pof">/ {it.points ?? '—'}</span>
                </>
              ) : null}
            </span>
          </div>
        );
      })}

      {hidden > 0 && (
        <button className="lmore" onClick={() => setAll(true)}>
          Show {hidden} more
        </button>
      )}
    </div>
  );
}
