/* The shapes the whole app is built on.
 *
 * A syllabus describes how a course is graded; Canvas describes what you
 * scored. Neither alone answers "am I on track" -- Canvas does not know what is
 * still coming, and the syllabus does not know what you got.
 */

/** One graded category, as described by a syllabus. */
export interface Group {
  name: string;
  /** Percent of the final grade. 0 for points-scheme courses. */
  weight: number;
  /**
   * How many of these exist by the end of term, per the syllabus -- not per
   * Canvas. CS 3510 lists one exam in September and five in its syllabus.
   * Without this, projection is fiction.
   */
  expected_count?: number | null;
  /** Points each item is worth, when the syllabus says and Canvas has not
   *  created them yet. Falls back to the average of what we can see. */
  expected_points_each?: number | null;
  drop_lowest?: number;
  canvas_group_ids: number[];
  /** True only when it can raise the grade and never lower it. */
  is_bonus?: boolean;
  note?: string;
}

export type Scheme = 'weighted' | 'points';
export type Rounding = 'none' | 'nearest_int';

export interface CourseRules {
  course_code: string;
  scheme: Scheme;
  groups: Group[];
  /** Points scheme only: the denominator, e.g. 195. */
  total_points?: number | null;
  letter_cutoffs: Record<string, number>;
  rounding: Rounding;
  /** Cap when bonus can push above 100, e.g. 102. */
  max_percent?: number | null;
  late_policy?: string;
  notes?: string[];
  source?: 'syllabus' | 'canvas' | 'manual';
  confidence?: number;
}

/** One assignment plus whatever Canvas knows about your submission. */
export interface Item {
  id: number;
  name: string;
  group_id: number | null;
  group_name: string;
  points_possible: number | null;
  due_at: string | null;
  score: number | null;
  state: string;
  excused: boolean;
}

export interface CanvasCourse {
  id: number;
  code: string;
  name: string;
  weights_applied: boolean;
  items: Item[];
  canvas_current_score: number | null;
  canvas_final_score: number | null;
}

/** The raw shape the collector returns, straight from the Canvas API. */
export interface RawCourse {
  id: number;
  name: string;
  course_code: string;
  apply_assignment_group_weights?: boolean;
  syllabus_body?: string | null;
  assignment_groups?: Array<{ id: number; name: string; group_weight?: number;
                              assignments?: unknown[] }>;
  assignments?: Array<Record<string, any>>;
  submissions?: Array<Record<string, any>>;
  enrollments?: Array<{ grades?: Record<string, any> }>;
}

export interface Dump {
  collected_at: string;
  host: string;
  term: number;
  courses: RawCourse[];
  error?: string;
}

/** One assignment, with the only number that matters: what it is worth. */
export interface ItemResult {
  name: string;
  group: string;
  points: number | null;
  /** Share of the final grade, 0..100. */
  weight: number;
  due_at: string | null;
  score: number | null;
  is_scored: boolean;
  state: string;
}

export interface GroupResult {
  name: string;
  weight: number;
  is_bonus: boolean;
  scored_count: number;
  expected_count: number | null;
  /** 0..1 across scored work; null when nothing is scored yet. */
  earned_fraction: number | null;
  settled_weight: number;
  remaining_weight: number;
  note: string;
  items: ItemResult[];
}

export interface CourseResult {
  code: string;
  course_name: string;
  rules: CourseRules;
  /** How much of the course is actually decided, 0..100. */
  settled_pct: number;
  /** Points banked, out of 100. */
  earned_pct: number;
  /** Final % if everything remaining scores zero. */
  floor: number;
  /** Final % if everything remaining is perfect. */
  ceiling: number;
  /** Final % if the rest matches performance so far. */
  on_pace: number;
  floor_letter: string;
  ceiling_letter: string;
  on_pace_letter: string;
  groups: GroupResult[];
  warnings: string[];
  canvas_says: { current: number | null; final: number | null };
  /** Too little settled for any number to mean anything. */
  is_noise: boolean;
  /** The range has collapsed to a single letter. */
  is_decided: boolean;
  /** Average % needed on all remaining work to finish at `letter`. */
  needed_for(letter: string): number | null;
  /** Points of remaining course you can throw away and keep `letter`. */
  slack_for(letter: string): number | null;
  /** Everything still to play for, biggest first. */
  upcoming: ItemResult[];
  /** What you need on one assignment to finish at `letter`, assuming the rest
   *  of the course goes at `restRate` (default: your current pace). */
  needed_on(item: ItemResult, restRate?: number, letter?: string): number | null;
}

export type NarrationState = 'wrong' | 'noise' | 'watch' | 'clear' | 'guess';

export interface Narration {
  state: NarrationState;
  claim: string;
  because: string;
}

export type TriageVerdict =
  | 'tight' | 'watch' | 'comfortable' | 'locked' | 'gone' | 'settled';

export interface TriageRow {
  code: string;
  need: number | null;
  slack: number | null;
  remaining: number;
  verdict: TriageVerdict;
  rank: number;
  result: CourseResult;
}

export interface TriageReport {
  rows: TriageRow[];
  /** True when every course needs roughly the same thing, so ranking is noise. */
  tooCloseToCall: boolean;
  spread: number;
}
