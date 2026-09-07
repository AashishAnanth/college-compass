/* College Compass grading engine.
 *
 * Canvas reports two grades and both are wrong in opposite directions:
 * `current_score` ignores ungraded work, `final_score` counts it as zero.
 * Early in a term the gap between them is the whole grade -- CS 2200 reports
 * 100% (an A) and 6.58% (an F) for the same student on the same day.
 *
 * So this never produces one number. It produces a range plus the one fact
 * that makes a range meaningful: how much of the course is settled.
 *
 * Kept in step with engine/grade.py by tests/parity.mjs, which runs both
 * against the same Canvas dump and diffs every value.
 */

import type {
  CanvasCourse, CourseResult, CourseRules, GroupResult, Item, ItemResult, RawCourse,
} from './types';

const GRADED_STATES = new Set(['graded']);

/* ── canvas normalisation ─────────────────────────────────────────── */

export function isScored(item: Item): boolean {
  return item.score !== null && item.score !== undefined
      && !item.excused
      && GRADED_STATES.has(item.state)
      && (item.points_possible ?? 0) > 0;
}

function fractionOf(item: Item): number | null {
  return isScored(item) ? item.score! / item.points_possible! : null;
}

export function normaliseCourse(c: RawCourse): CanvasCourse {
  const gnames: Record<number, string> = {};
  for (const g of c.assignment_groups ?? []) gnames[g.id] = g.name;

  const subs: Record<number, Record<string, any>> = {};
  for (const s of c.submissions ?? []) subs[s.assignment_id] = s;

  const items: Item[] = (c.assignments ?? []).map((a) => {
    const s = subs[a.id] ?? {};
    return {
      id: a.id,
      name: String(a.name ?? '').trim(),
      group_id: a.assignment_group_id ?? null,
      group_name: gnames[a.assignment_group_id] ?? '?',
      points_possible: a.points_possible ?? null,
      due_at: a.due_at ?? null,
      score: s.score === undefined ? null : s.score,
      state: s.workflow_state ?? 'unsubmitted',
      excused: Boolean(s.excused),
    };
  });

  const grades = c.enrollments?.[0]?.grades ?? {};
  return {
    id: c.id,
    code: (c.course_code || String(c.id)).split(' ')[0] ?? String(c.id),
    name: c.name,
    weights_applied: Boolean(c.apply_assignment_group_weights),
    items,
    canvas_current_score: grades.current_score ?? null,
    canvas_final_score: grades.final_score ?? null,
  };
}

/* ── letters ──────────────────────────────────────────────────────── */

function roundScore(rules: CourseRules, pct: number): number {
  return rules.rounding === 'nearest_int' ? Math.round(pct) : pct;
}

export function letterFor(rules: CourseRules, pct: number): string {
  const p = roundScore(rules, pct);
  const entries = Object.entries(rules.letter_cutoffs).sort((a, b) => b[1] - a[1]);
  for (const [letter, cutoff] of entries) if (p >= cutoff) return letter;
  return 'F';
}

/* ── the engine ───────────────────────────────────────────────────── */

function itemsFor(course: CanvasCourse, ids: number[]): Item[] {
  const want = new Set(ids ?? []);
  return course.items.filter((i) => i.group_id !== null && want.has(i.group_id));
}

interface Base {
  settled: number; earned: number; floor: number; ceiling: number;
  onPace: number; groups: GroupResult[]; warnings: string[];
}

function evaluateWeighted(rules: CourseRules, course: CanvasCourse): Base {
  let settled = 0, earned = 0, ceilingExtra = 0, bonusCeiling = 0;
  const groups: GroupResult[] = [];
  const warnings: string[] = [];

  for (const g of rules.groups) {
    const items = itemsFor(course, g.canvas_group_ids);
    const scored = items.filter(isScored);
    // Canvas removes excused work from the grade entirely, so it must shrink the
    // denominator -- otherwise it looks like work still to come and permanently
    // holds the course below 100% settled.
    const excused = items.filter((i) => i.excused).length;

    // Within a category, weight is distributed by points, not per item: a
    // 60-point project is worth six times a 10-point one. Averaging the
    // fractions instead would misreport a course by tens of points.
    const drop = g.drop_lowest ?? 0;
    let kept = [...scored].sort((a, b) => (fractionOf(a) ?? 0) - (fractionOf(b) ?? 0));
    if (drop && g.expected_count && scored.length >= g.expected_count) {
      kept = kept.slice(drop);
    }

    const scoredPts = kept.reduce((s, i) => s + (i.points_possible ?? 0), 0);
    const earnedPts = kept.reduce((s, i) => s + (i.score ?? 0), 0);

    // How many points this category will be worth in total. Canvas only creates
    // assignments as the term goes, so fall back to the ones we can see.
    let nExpected = g.expected_count ?? Math.max(items.length, scored.length);
    if (nExpected) nExpected = Math.max(kept.length, nExpected - excused);

    let perItem = g.expected_points_each ?? null;
    if (perItem == null) {
      const sizes = items.filter((i) => !i.excused && (i.points_possible ?? 0) > 0)
                         .map((i) => i.points_possible as number);
      perItem = sizes.length ? sizes.reduce((a, b) => a + b, 0) / sizes.length : null;
    }
    let expectedPts = (nExpected && perItem != null)
      ? perItem * Math.max(0, nExpected - drop)
      : items.filter((i) => !i.excused)
             .reduce((s, i) => s + (i.points_possible ?? 0), 0);
    expectedPts = Math.max(expectedPts, scoredPts);

    let frac: number | null = null;
    let settledW = 0;
    if (scoredPts > 0) {
      frac = earnedPts / scoredPts;
      settledW = g.weight * Math.min(1, scoredPts / expectedPts);
    }
    const remainingW = Math.max(0, g.weight - settledW);

    if (g.is_bonus) {
      bonusCeiling += g.weight;
      if (frac !== null) earned += settledW * frac;
    } else {
      settled += settledW;
      if (frac !== null) earned += settledW * frac;
      ceilingExtra += remainingW;
    }

    // Each item's share of the final grade: its points as a fraction of the
    // category, times the category's weight.
    const itemResults: ItemResult[] = items.map((i) => ({
      name: i.name, group: g.name, points: i.points_possible,
      weight: i.excused || expectedPts <= 0
        ? 0 : (i.points_possible ?? 0) / expectedPts * g.weight,
      due_at: i.due_at, score: i.score, is_scored: isScored(i), state: i.state,
    }));

    groups.push({
      name: g.name, weight: g.weight, is_bonus: Boolean(g.is_bonus),
      scored_count: kept.length, expected_count: g.expected_count ?? null,
      earned_fraction: frac, settled_weight: settledW,
      remaining_weight: remainingW, note: g.note ?? '', items: itemResults,
    });

    if (g.expected_count && items.length < g.expected_count) {
      warnings.push(`Canvas lists ${items.length} of ${g.expected_count} `
                  + `${g.name.toLowerCase()} — the rest come from the syllabus`);
    }
  }

  const floor = earned;
  let ceiling = earned + ceilingExtra + bonusCeiling;
  if (rules.max_percent != null) ceiling = Math.min(ceiling, rules.max_percent);
  const paceRate = settled > 0 ? earned / settled : 0;

  return { settled, earned, floor, ceiling,
           onPace: earned + (100 - settled) * paceRate, groups, warnings };
}

function evaluatePoints(rules: CourseRules, course: CanvasCourse): Base {
  const total = Number(rules.total_points) || 1;
  const counted = new Set<number>();
  const bonus = new Set<number>();
  for (const g of rules.groups) {
    for (const id of g.canvas_group_ids ?? []) {
      counted.add(id);
      if (g.is_bonus) bonus.add(id);
    }
  }

  let earnedPts = 0, settledPts = 0, bonusPts = 0;
  for (const i of course.items) {
    if (counted.size && (i.group_id === null || !counted.has(i.group_id))) continue;
    if (i.group_id !== null && bonus.has(i.group_id)) {
      if (isScored(i)) bonusPts += i.score!;
      continue;
    }
    if (isScored(i)) { settledPts += i.points_possible!; earnedPts += i.score!; }
  }

  const listed = course.items
    .filter((i) => !counted.size || (i.group_id !== null && counted.has(i.group_id)))
    .reduce((s, i) => s + (i.points_possible ?? 0), 0);

  const settled = Math.min(settledPts / total * 100, 100);
  const floor = (earnedPts + bonusPts) / total * 100;
  let ceiling = floor + (total - settledPts) / total * 100;
  if (rules.max_percent != null) ceiling = Math.min(ceiling, rules.max_percent);
  ceiling = Math.max(ceiling, floor);
  const paceRate = settledPts > 0 ? earnedPts / settledPts : 0;

  const groups: GroupResult[] = rules.groups.map((g) => {
    const items = itemsFor(course, g.canvas_group_ids);
    const scored = items.filter(isScored);
    const ppAll = items.reduce((s, i) => s + (i.points_possible ?? 0), 0);
    const ppScored = scored.reduce((s, i) => s + i.points_possible!, 0);
    const got = scored.reduce((s, i) => s + i.score!, 0);
    return {
      name: g.name, weight: ppAll / total * 100, is_bonus: Boolean(g.is_bonus),
      scored_count: scored.length,
      expected_count: g.expected_count ?? items.length,
      earned_fraction: scored.length ? got / ppScored : null,
      settled_weight: ppScored / total * 100,
      remaining_weight: (ppAll - ppScored) / total * 100,
      note: g.note ?? '',
      items: items.map((i) => ({
        name: i.name, group: g.name, points: i.points_possible,
        weight: i.excused ? 0 : (i.points_possible ?? 0) / total * 100,
        due_at: i.due_at, score: i.score, is_scored: isScored(i), state: i.state,
      })),
    };
  });

  const warnings: string[] = [];
  if (listed - (rules.total_points ?? 0) > 0.5) {
    warnings.push(`Canvas lists ${listed} points but the syllabus says `
                + `${rules.total_points} — using the syllabus.`);
  }

  return {
    settled, earned: floor, floor, ceiling,
    onPace: (earnedPts + (total - settledPts) * paceRate) / total * 100,
    groups, warnings,
  };
}

function validate(rules: CourseRules): string[] {
  const problems: string[] = [];
  if (rules.scheme === 'weighted') {
    const total = rules.groups.filter((g) => !g.is_bonus)
                              .reduce((s, g) => s + g.weight, 0);
    if (Math.abs(total - 100) > 0.01) {
      problems.push(`graded weights sum to ${+total.toFixed(2)}%, not 100%`);
    }
  } else if (!rules.total_points) {
    problems.push('points course with no total_points');
  }
  return problems;
}

export function evaluate(rules: CourseRules, raw: RawCourse | CanvasCourse): CourseResult {
  const course: CanvasCourse = 'items' in raw ? raw : normaliseCourse(raw);
  const base = rules.scheme === 'points'
    ? evaluatePoints(rules, course)
    : evaluateWeighted(rules, course);

  const warnings = validate(rules).concat(base.warnings);
  if (!course.weights_applied && rules.scheme === 'weighted') {
    warnings.unshift('Canvas has weighting switched off for this course, so its '
                   + 'own grade is a flat points average.');
  }

  const settled_pct = base.settled;
  const earned_pct = base.earned;

  const needed_for = (letter: string): number | null => {
    const cutoff = rules.letter_cutoffs[letter];
    if (cutoff === undefined) return null;
    const remaining = 100 - settled_pct;
    if (remaining <= 0.0001) return null;
    // Rounding favours the student: 89.5 really is an A.
    const target = rules.rounding === 'nearest_int' ? cutoff - 0.5 : cutoff;
    return (target - earned_pct) / remaining * 100;
  };

  return {
    code: rules.course_code,
    course_name: course.name,
    rules,
    settled_pct,
    earned_pct,
    floor: base.floor,
    ceiling: base.ceiling,
    on_pace: base.onPace,
    floor_letter: letterFor(rules, base.floor),
    ceiling_letter: letterFor(rules, base.ceiling),
    on_pace_letter: letterFor(rules, base.onPace),
    groups: base.groups,
    warnings,
    canvas_says: { current: course.canvas_current_score,
                   final: course.canvas_final_score },
    is_noise: settled_pct < 15,
    is_decided: letterFor(rules, base.floor) === letterFor(rules, base.ceiling),
    needed_for,
    slack_for: (letter: string) => {
      const need = needed_for(letter);
      return need === null ? null : (100 - need) / 100 * (100 - settled_pct);
    },
    get upcoming() {
      return base.groups.flatMap((g) => g.items).filter((i) => !i.is_scored)
        .sort((a, b) => b.weight - a.weight);
    },
    needed_on(item: ItemResult, restRate?: number, letter = 'A') {
      const cutoff = rules.letter_cutoffs[letter];
      if (cutoff === undefined || item.weight <= 0) return null;
      const target = rules.rounding === 'nearest_int' ? cutoff - 0.5 : cutoff;
      const pace = restRate ?? (settled_pct > 0 ? earned_pct / settled_pct : 0.9);
      const other = Math.max(0, (100 - settled_pct) - item.weight);
      return (target - earned_pct - other * pace) / item.weight * 100;
    },
  };
}

/**
 * Final percentage if the rest of the course goes a given way.
 *
 * `defaultRate` (0..1) is assumed on all remaining work; `assume` overrides it
 * per group name. Bonus is assumed forfeited unless named -- a projection
 * should never flatter you with points you have not earned.
 */
export function project(
  result: CourseResult,
  defaultRate: number,
  assume: Record<string, number> = {},
): number {
  let total = result.earned_pct;
  let accounted = result.settled_pct;

  for (const g of result.groups) {
    if (g.is_bonus) {
      const rate = assume[g.name];
      if (rate !== undefined && g.remaining_weight > 0) {
        total += g.remaining_weight * rate;
      }
      continue;
    }
    accounted += g.remaining_weight;
    if (g.remaining_weight > 0) {
      total += g.remaining_weight * (assume[g.name] ?? defaultRate);
    }
  }

  // Points courses list only the assignments Canvas has created so far, so a
  // 195-point course may show 40 points of work in September. Whatever is
  // unaccounted for is still coming and has to be projected too, or the
  // ceiling collapses.
  const unlisted = 100 - accounted;
  if (unlisted > 0.0001) total += unlisted * defaultRate;

  if (result.rules.max_percent != null) {
    total = Math.min(total, result.rules.max_percent);
  }
  return total;
}
