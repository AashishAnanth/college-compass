/* Engine output into a sentence a person would actually say.
 *
 * No red anywhere in this product -- see the design notes. States are
 * wrong / noise / watch / clear / guess, and attention is amber.
 */

import type {
  CourseResult, GroupResult, Narration, NarrationState,
  TriageReport, TriageRow, TriageVerdict,
} from './types';

export const PILL_LABEL: Record<NarrationState, string> = {
  wrong: 'Canvas is wrong',
  noise: 'Too early to tell',
  watch: 'Worth a look',
  clear: 'On track',
  guess: 'Guessing',
};

function biggestRemaining(r: CourseResult): GroupResult | null {
  const live = r.groups.filter((g) => !g.is_bonus && g.remaining_weight > 0.01);
  if (!live.length) return null;
  return live.reduce((a, b) => (b.remaining_weight > a.remaining_weight ? b : a));
}

/**
 * Canvas is misleading when it shows a number a reasonable person would read as
 * their grade while almost nothing has actually been decided.
 *
 * The settled ceiling matters. Canvas's two numbers stay far apart for most of
 * a term, but once a real share of the course is graded the useful thing to say
 * is what you need from here — the discrepancy moves to the receipt.
 */
const NOISE_CEILING = 25;

function canvasIsMisleading(r: CourseResult): boolean {
  const { current, final } = r.canvas_says;
  if (r.settled_pct >= NOISE_CEILING) return false;
  if (current != null && final != null && Math.abs(current - final) > 25) return true;
  if (current != null && r.settled_pct < 15) return true;
  return false;
}

export function narrate(r: CourseResult): Narration {
  const big = biggestRemaining(r);
  const { current, final } = r.canvas_says;

  if ((r.rules.confidence ?? 1) < 0.5) {
    return {
      state: 'guess',
      claim: "We don't have the syllabus for this one.",
      because: "Canvas's own group weights don't add up to 100%, so any number "
             + 'here would be invented.',
    };
  }

  if (canvasIsMisleading(r)) {
    let claim: string;
    let because: string;
    if (current != null && final != null && Math.abs(current - final) > 25) {
      claim = `Canvas is showing you ${current}% and ${final}% for this course. `
            + 'Neither is your grade.';
      because = 'The first ignores everything not yet graded, the second counts it '
              + `all as zero. Only ${r.settled_pct.toFixed(1)}% of the course has `
              + 'actually been decided.';
    } else {
      claim = `That ${current}% in Canvas is noise.`;
      because = `It's computed from ${r.settled_pct.toFixed(1)}% of the course — the `
              + 'handful of things graded so far. It will swing wildly for weeks.';
    }
    if (big) {
      because += ` ${big.name} is ${big.remaining_weight.toFixed(0)}% of your grade `
               + 'and none of it is in yet.';
    }
    return { state: 'wrong', claim, because };
  }

  if (r.is_noise) {
    if (big) {
      return {
        state: 'noise',
        claim: `${big.name} decides this course — ${big.weight.toFixed(0)}% of it.`,
        because: `Nothing meaningful is graded yet (${r.settled_pct.toFixed(1)}% `
               + 'settled). Everything you do between now and then is preparation, '
               + 'not performance.',
      };
    }
    return {
      state: 'noise',
      claim: 'Nothing is decided in this course yet.',
      because: 'Check back once work starts being graded.',
    };
  }

  // Nothing left to play for: report the outcome rather than advice.
  if (r.needed_for('A') === null) {
    const article = 'AEIOU'.includes(r.floor_letter[0] ?? '') ? 'an' : 'a';
    return {
      state: 'clear',
      claim: `Finished at ${r.floor.toFixed(1)}% — ${article} ${r.floor_letter}.`,
      because: 'Every graded item is in. Nothing you do now changes this one.',
    };
  }

  const needA = r.needed_for('A');
  if (needA !== null && needA <= 0) {
    return {
      state: 'clear',
      claim: 'The A is locked in.',
      because: 'Even a zero on everything remaining leaves you above the cutoff. '
             + 'Spend your time elsewhere.',
    };
  }
  if (needA !== null && needA > 100) {
    // Late in a term the required rate explodes as the denominator shrinks, so
    // quote a target only while it is still achievable.
    const reachable = Object.entries(r.rules.letter_cutoffs)
      .sort((a, b) => b[1] - a[1])
      .map(([letter]) => ({ letter, need: r.needed_for(letter) }))
      .find((x) => x.need !== null && x.need > 0 && x.need <= 100);

    if (!reachable) {
      return {
        state: 'watch',
        claim: `This one is settled — you finish between ${r.floor.toFixed(0)}% `
             + `and ${r.ceiling.toFixed(0)}%.`,
        because: 'Too little is left to move the letter. Nothing here is worth '
               + 'your next hour.',
      };
    }
    return {
      state: 'watch',
      claim: `The A is out of reach here — the ${reachable.letter} needs `
           + `${(reachable.need as number).toFixed(0)}% from now on.`,
      because: "That's not a failure, it's a reallocation. This is the course to "
             + 'spend less on.',
    };
  }
  if (needA !== null) {
    const slack = r.slack_for('A') ?? 0;
    return {
      state: needA <= 85 ? 'clear' : 'watch',
      claim: `You need ${needA.toFixed(0)}% on everything left to hold the A.`,
      because: `That's ${slack.toFixed(0)} points of slack across the rest of the `
             + `course. Right now you're banking ${r.earned_pct.toFixed(1)} of a `
             + `possible ${r.settled_pct.toFixed(1)}.`,
    };
  }
  return { state: 'clear', claim: 'Nothing to flag.', because: '' };
}

/**
 * One line for the top of the page. It answers the question the student
 * actually opened this to ask -- where the effort goes -- rather than
 * reporting on Canvas.
 */
export function headline(results: CourseResult[]): { claim: string; detail: string } {
  const live = results
    .map((r) => ({ r, need: r.needed_for('A') }))
    .filter((x) => x.need !== null) as Array<{ r: CourseResult; need: number }>;

  const settled = results.map((r) => r.settled_pct);
  const most = settled.length ? Math.max(...settled) : 0;

  // Before anything is graded there is no advice to give, and pretending
  // otherwise is the whole failure mode this exists to avoid.
  if (most < 15) {
    const biggest = results
      .flatMap((r) => r.groups.filter((g) => !g.is_bonus)
        .map((g) => ({ code: r.code, name: g.name, weight: g.weight })))
      .sort((a, b) => b.weight - a.weight)[0];
    return {
      claim: 'Nothing is decided yet, so nothing needs your evening.',
      detail: biggest
        ? `The first thing that will move a grade is ${biggest.name.toLowerCase()} `
          + `in ${biggest.code} — ${biggest.weight.toFixed(0)}% of that course. `
          + 'Until then this page has nothing useful to tell you, and says so.'
        : 'Check back once work starts being graded.',
    };
  }

  const gone = live.filter((x) => x.need > 100).map((x) => x.r.code);
  const locked = live.filter((x) => x.need <= 0).map((x) => x.r.code);
  const tightest = live.filter((x) => x.need > 0 && x.need <= 100)
    .sort((a, b) => b.need - a.need)[0];

  if (tightest) {
    const relax = gone[0] ?? locked[0];
    return {
      claim: `${tightest.r.code} needs the most from you — ${tightest.need.toFixed(0)}% `
           + 'on everything that is left.',
      detail: relax
        ? `${relax} is the one to let go of, and ${most.toFixed(0)}% of the term is `
          + 'already decided. The rest is below, ranked by how little room each one leaves you.'
        : `${most.toFixed(0)}% of the term is already decided. The rest is below, `
          + 'ranked by how little room each one leaves you.',
    };
  }

  return {
    claim: 'Every course is settled. Nothing you do now changes these.',
    detail: `${most.toFixed(0)}% of the term is decided and no target is still in play.`,
  };
}

export const TRIAGE_COPY: Record<TriageVerdict, string> = {
  tight: 'Needs the most from you',
  watch: 'Keep an eye on it',
  comfortable: 'Room to breathe',
  locked: 'Already safe — spend time elsewhere',
  gone: 'Target out of reach — aim lower and reallocate',
  settled: 'Finished',
};

/**
 * Where does the next hour go? Ranked by slack: how many points of the
 * remaining course you can throw away and still hold the target letter.
 * Little slack means it needs attention; lots means you can let up, which is
 * the half nobody ever tells you.
 */
export function triage(results: CourseResult[], target = 'A'): TriageReport {
  const rows: TriageRow[] = results.map((r) => {
    const need = r.needed_for(target);
    const slack = r.slack_for(target);
    let verdict: TriageVerdict;
    let rank: number;

    if (need === null) { verdict = 'settled'; rank = 999; }
    else if (need > 100) { verdict = 'gone'; rank = 900; }
    else if (need <= 0) { verdict = 'locked'; rank = 800; }
    else {
      verdict = need >= 90 ? 'tight' : need >= 75 ? 'watch' : 'comfortable';
      rank = -need;
    }
    return { code: r.code, need, slack, remaining: 100 - r.settled_pct,
             verdict, rank, result: r };
  });
  rows.sort((a, b) => a.rank - b.rank);

  // Early in a term every course needs roughly the same thing, so a ranking
  // implies a priority that does not exist. Say so rather than invent one.
  const live = rows.filter((r) => r.need !== null && r.need > 0 && r.need <= 100);
  const needs = live.map((r) => r.need as number);
  const spread = needs.length > 1 ? Math.max(...needs) - Math.min(...needs) : 0;

  return { rows, spread, tooCloseToCall: needs.length > 1 && spread < 5 };
}
