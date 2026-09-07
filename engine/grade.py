"""The grade engine.

Canvas shows two numbers and both are wrong in opposite directions:

  current_score  ignores everything ungraded  -> absurdly optimistic
  final_score    treats ungraded as zero      -> absurdly pessimistic

Early in a term the gap between them is the whole grade. CS 2200 currently
reports 100% (an A) and 6.58% (an F) for the same student on the same day.

So this module refuses to produce one number. It produces a *range* plus the
one fact that makes the range meaningful: how much of the course has actually
been decided.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

from .canvas import CanvasCourse, Item
from .model import CourseRules, Group


@dataclass
class ItemResult:
    """One assignment, with the only number that matters: what it is worth."""
    name: str
    group: str
    points: Optional[float]
    weight: float                    # share of the final grade, 0..100
    due_at: Optional[str]
    score: Optional[float]
    is_scored: bool
    state: str


@dataclass
class GroupResult:
    name: str
    weight: float
    is_bonus: bool
    scored_count: int
    expected_count: Optional[int]
    earned_fraction: Optional[float]      # 0..1 across scored work, None if nothing scored
    settled_weight: float                 # weight already decided
    remaining_weight: float               # weight still to play for
    note: str = ""
    items: List[ItemResult] = field(default_factory=list)


@dataclass
class CourseResult:
    code: str
    rules: CourseRules

    settled_pct: float          # how much of the course is decided (0..100)
    earned_pct: float           # points banked, out of 100
    floor: float                # final % if everything remaining scores 0
    ceiling: float              # final % if everything remaining scores 100
    on_pace: float              # final % if the rest matches performance so far

    floor_letter: str
    ceiling_letter: str
    on_pace_letter: str

    groups: List[GroupResult] = field(default_factory=list)
    canvas_says: Dict[str, Optional[float]] = field(default_factory=dict)
    warnings: List[str] = field(default_factory=list)

    @property
    def upcoming(self) -> List[ItemResult]:
        """Everything still to play for, biggest first. This is what answers
        "what do I need on the final" -- you cannot say it without knowing what
        the final is actually worth."""
        out = [i for g in self.groups for i in g.items if not i.is_scored]
        return sorted(out, key=lambda i: -i.weight)

    def needed_on(self, item: "ItemResult",
                  rest_rate: Optional[float] = None,
                  letter: str = "A") -> Optional[float]:
        """What you need on one assignment to finish at `letter`, assuming the
        rest of the course goes at `rest_rate` (default: your current pace)."""
        cutoff = self.rules.cutoff_for(letter)
        if cutoff is None or item.weight <= 0:
            return None
        target = cutoff - 0.5 if self.rules.rounding == "nearest_int" else cutoff
        if rest_rate is None:
            rest_rate = (self.earned_pct / self.settled_pct) if self.settled_pct > 0 else 0.9
        other = max(0.0, (100.0 - self.settled_pct) - item.weight)
        return (target - self.earned_pct - other * rest_rate) / item.weight * 100.0

    @property
    def is_decided(self) -> bool:
        """True once the range has collapsed to a single letter."""
        return self.floor_letter == self.ceiling_letter

    @property
    def is_noise(self) -> bool:
        """Too little settled for any number to mean anything."""
        return self.settled_pct < 15.0

    def needed_for(self, letter: str) -> Optional[float]:
        """Average % required on all remaining work to finish at `letter`.

        None when the letter is already locked in; >100 when it is gone.
        """
        cutoff = self.rules.cutoff_for(letter)
        if cutoff is None:
            return None
        remaining = 100.0 - self.settled_pct
        if remaining <= 0.0001:
            return None
        # Rounding is in the student's favour at the boundary: if the course
        # rounds to the nearest integer, 89.5 really is an A.
        target = cutoff - 0.5 if self.rules.rounding == "nearest_int" else cutoff
        return (target - self.earned_pct) / remaining * 100.0

    def slack_for(self, letter: str) -> Optional[float]:
        """How many points of the remaining course you can throw away and keep
        `letter`. Negative means you are already below it."""
        need = self.needed_for(letter)
        if need is None:
            return None
        return (100.0 - need) / 100.0 * (100.0 - self.settled_pct)


def project(result: "CourseResult", default_rate: float,
            assume: Optional[Dict[str, float]] = None) -> float:
    """Final percentage if the rest of the course goes a given way.

    `default_rate` is the fraction (0..1) assumed on all remaining work;
    `assume` overrides it per group name. Bonus groups are assumed forfeited
    unless named explicitly -- a projection should never flatter you with
    points you have not earned.
    """
    assume = assume or {}
    total = result.earned_pct
    accounted = result.settled_pct
    for g in result.groups:
        if g.is_bonus:
            rate = assume.get(g.name)
            if rate is not None and g.remaining_weight > 0:
                total += g.remaining_weight * rate
            continue
        accounted += g.remaining_weight
        if g.remaining_weight > 0:
            total += g.remaining_weight * assume.get(g.name, default_rate)

    # Points courses list only the assignments Canvas has created so far, so a
    # 195-point course may show 40 points of work in September. Whatever is
    # unaccounted for is still coming, and has to be projected too or the
    # ceiling collapses.
    unlisted = 100.0 - accounted
    if unlisted > 0.0001:
        total += unlisted * default_rate

    if result.rules.max_percent is not None:
        total = min(total, result.rules.max_percent)
    return total


def _weighted(rules: CourseRules, course: CanvasCourse) -> CourseResult:
    settled = earned = 0.0
    ceiling_extra = 0.0
    bonus_ceiling = 0.0
    results: List[GroupResult] = []
    warnings: List[str] = []

    for g in rules.groups:
        items = course.items_for(g.canvas_group_ids)
        scored = [i for i in items if i.is_scored]
        # Canvas removes excused work from the grade entirely, so it must shrink
        # the denominator -- otherwise it looks like work still to come and
        # permanently holds the course below 100% settled.
        excused = sum(1 for i in items if i.excused)

        # Within a category, weight is distributed by points, not per item:
        # a 60-point project is worth six times a 10-point one. Averaging the
        # fractions instead would misreport a course by tens of points.
        kept = sorted(scored, key=lambda i: i.fraction)
        if g.drop_lowest and g.expected_count and len(scored) >= g.expected_count:
            kept = kept[g.drop_lowest:]

        scored_pts = sum(i.points_possible for i in kept)
        earned_pts = sum(i.score for i in kept)

        # How many points this category will be worth in total. Canvas only
        # creates assignments as the term goes, so fall back to the size of the
        # ones we can see.
        n_expected = g.expected_count or max(len(items), len(scored))
        if n_expected:
            n_expected = max(len(kept), n_expected - excused)
        per_item = g.expected_points_each
        if per_item is None:
            sizes = [i.points_possible for i in items
                     if not i.excused and (i.points_possible or 0) > 0]
            per_item = (sum(sizes) / len(sizes)) if sizes else None
        if n_expected and per_item:
            expected_pts = per_item * max(0, n_expected - g.drop_lowest)
        else:
            expected_pts = sum(i.points_possible or 0 for i in items if not i.excused)
        expected_pts = max(expected_pts, scored_pts)

        if scored_pts > 0:
            frac = earned_pts / scored_pts
            settled_w = g.weight * min(1.0, scored_pts / expected_pts)
        else:
            frac = None
            settled_w = 0.0

        n_scored = len(kept)
        remaining_w = max(0.0, g.weight - settled_w)

        if g.is_bonus:
            # Bonus can only ever add, so it never enters settled/earned --
            # it lifts the ceiling instead.
            bonus_ceiling += g.weight
            if frac is not None:
                earned += settled_w * frac
        else:
            settled += settled_w
            if frac is not None:
                earned += settled_w * frac
            ceiling_extra += remaining_w

        # Each item's share of the final grade: its points as a fraction of the
        # category, times the category's weight.
        item_results = []
        for i in items:
            share = ((i.points_possible or 0) / expected_pts * g.weight
                     if expected_pts > 0 else 0.0)
            item_results.append(ItemResult(
                name=i.name, group=g.name, points=i.points_possible,
                weight=0.0 if i.excused else share, due_at=i.due_at,
                score=i.score, is_scored=i.is_scored, state=i.state))

        results.append(GroupResult(
            name=g.name, weight=g.weight, is_bonus=g.is_bonus,
            scored_count=n_scored, expected_count=g.expected_count,
            earned_fraction=frac, settled_weight=settled_w,
            remaining_weight=remaining_w, note=g.note, items=item_results,
        ))

        if g.expected_count and len(items) < g.expected_count:
            warnings.append(
                "Canvas lists %d of %d %s -- the rest come from the syllabus"
                % (len(items), g.expected_count, g.name.lower()))

    floor = earned
    ceiling = earned + ceiling_extra + bonus_ceiling
    if rules.max_percent is not None:
        ceiling = min(ceiling, rules.max_percent)

    pace_rate = (earned / settled) if settled > 0 else 0.0
    on_pace = earned + (100.0 - settled) * pace_rate

    return CourseResult(
        code=rules.course_code, rules=rules,
        settled_pct=settled, earned_pct=earned,
        floor=floor, ceiling=ceiling, on_pace=on_pace,
        floor_letter=rules.letter_for(floor),
        ceiling_letter=rules.letter_for(ceiling),
        on_pace_letter=rules.letter_for(on_pace),
        groups=results, warnings=warnings,
        canvas_says={"current": course.canvas_current_score,
                     "final": course.canvas_final_score},
    )


def _points(rules: CourseRules, course: CanvasCourse) -> CourseResult:
    total = float(rules.total_points or 0) or 1.0
    counted_ids = {gid for g in rules.groups for gid in g.canvas_group_ids}
    bonus_ids = {gid for g in rules.groups if g.is_bonus for gid in g.canvas_group_ids}

    earned_pts = settled_pts = bonus_pts = 0.0
    for i in course.items:
        if counted_ids and i.group_id not in counted_ids:
            continue
        pp = i.points_possible or 0.0
        if i.group_id in bonus_ids:
            if i.is_scored:
                bonus_pts += i.score
            continue
        if i.is_scored:
            settled_pts += pp
            earned_pts += i.score

    listed = sum(i.points_possible or 0 for i in course.items
                 if not counted_ids or i.group_id in counted_ids)
    settled = settled_pts / total * 100.0
    earned = earned_pts / total * 100.0
    floor = earned + bonus_pts / total * 100.0
    ceiling = min(100.0 + bonus_pts / total * 100.0,
                  floor + (total - settled_pts - earned_pts + earned_pts) / total * 100.0)
    ceiling = floor + (total - settled_pts) / total * 100.0
    if rules.max_percent is not None:
        ceiling = min(ceiling, rules.max_percent)
    pace_rate = (earned_pts / settled_pts) if settled_pts > 0 else 0.0
    on_pace = (earned_pts + (total - settled_pts) * pace_rate) / total * 100.0

    groups: List[GroupResult] = []
    for g in rules.groups:
        items = course.items_for(g.canvas_group_ids)
        scored = [i for i in items if i.is_scored]
        pp_all = sum(i.points_possible or 0 for i in items)
        frac = (sum(i.score for i in scored) /
                sum(i.points_possible for i in scored)) if scored else None
        item_results = [
            ItemResult(name=i.name, group=g.name, points=i.points_possible,
                       weight=(0.0 if i.excused
                               else (i.points_possible or 0) / total * 100.0),
                       due_at=i.due_at, score=i.score, is_scored=i.is_scored,
                       state=i.state)
            for i in items
        ]
        groups.append(GroupResult(
            name=g.name,
            weight=pp_all / total * 100.0,
            is_bonus=g.is_bonus,
            scored_count=len(scored),
            expected_count=g.expected_count or len(items),
            earned_fraction=frac,
            settled_weight=sum(i.points_possible for i in scored) / total * 100.0,
            remaining_weight=(pp_all - sum(i.points_possible for i in scored)) / total * 100.0,
            note=g.note, items=item_results,
        ))

    warns = []
    if listed - (rules.total_points or 0) > 0.5:
        warns.append("Canvas lists %g points but the syllabus says %g -- using the "
                     "syllabus." % (listed, rules.total_points or 0))
    settled = min(settled, 100.0)
    ceiling = max(ceiling, floor)

    return CourseResult(
        code=rules.course_code, rules=rules,
        settled_pct=settled, earned_pct=floor,
        floor=floor, ceiling=ceiling, on_pace=on_pace,
        floor_letter=rules.letter_for(floor),
        ceiling_letter=rules.letter_for(ceiling),
        on_pace_letter=rules.letter_for(on_pace),
        groups=groups, warnings=warns,
        canvas_says={"current": course.canvas_current_score,
                     "final": course.canvas_final_score},
    )


def evaluate(rules: CourseRules, course: CanvasCourse) -> CourseResult:
    result = _points(rules, course) if rules.scheme == "points" else _weighted(rules, course)
    result.warnings = list(rules.validate()) + result.warnings
    if not course.weights_applied and rules.scheme == "weighted":
        result.warnings.insert(
            0, "Canvas has weighting switched off for this course, so its own "
               "grade is a flat points average.")
    return result
