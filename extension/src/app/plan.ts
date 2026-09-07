/* Planning: "what if I get an 85 on the final?"
 *
 * A plan is a set of hypothetical scores keyed by assignment. Rather than
 * bolt a parallel projection onto the engine, we write the scores into a copy
 * of the Canvas data and evaluate that. The grade you see under a plan is
 * computed by exactly the same code as the real one -- there is no second,
 * approximate path that can drift.
 */

import type { Dump, ItemResult, RawCourse } from '../engine/types';

/** Assignment id -> score out of points_possible. */
export type Plan = Record<string, number>;

export const planKey = (courseId: number, itemName: string) =>
  `${courseId}::${itemName}`;

export function itemKey(course: { id: number }, item: ItemResult) {
  return planKey(course.id, item.name);
}

/** A copy of the dump with planned scores written in as graded submissions. */
export function applyPlan(dump: Dump, plan: Plan): Dump {
  if (!Object.keys(plan).length) return dump;

  const courses: RawCourse[] = dump.courses.map((c) => {
    const byId = new Map<number, string>();
    for (const a of c.assignments ?? []) byId.set(a.id, a.name);

    let touched = false;
    const submissions = (c.submissions ?? []).map((s) => {
      const name = byId.get(s.assignment_id);
      if (name === undefined) return s;
      const score = plan[planKey(c.id, name)];
      if (score === undefined) return s;
      touched = true;
      return { ...s, score, workflow_state: 'graded', excused: false };
    });

    return touched ? { ...c, submissions } : c;
  });

  return { ...dump, courses };
}

const STORAGE_KEY = 'college-compass:plan';

export function loadPlan(): Plan {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Plan) : {};
  } catch {
    return {};                 // private window, blocked storage, bad JSON
  }
}

export function savePlan(plan: Plan) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
  } catch { /* not worth interrupting anyone over */ }
}
