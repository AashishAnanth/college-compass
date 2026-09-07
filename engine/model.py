"""The grading-rule model.

A syllabus describes how a course is graded. Canvas describes what you have
scored. Neither alone can answer "am I on track" -- Canvas doesn't know what is
still coming, and the syllabus doesn't know what you got. This module is the
shape of the syllabus half.

Two schemes cover every course we have seen:

  weighted  categories carry percentages that sum to 100
  points    everything is raw points out of a fixed total, e.g. 195

The difference matters. In a weighted course a missed 10-point homework may be
worth almost nothing; in a points course it is exactly 10/total of your grade.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Dict, List, Optional


@dataclass
class Group:
    """One graded category."""

    name: str
    weight: float = 0.0
    # What the syllabus says will exist by the end of term. Canvas usually only
    # knows about what has been created so far -- CS 3510 lists one exam in
    # September and five in the syllabus. Without this, projection is fiction.
    expected_count: Optional[int] = None
    expected_points_each: Optional[float] = None
    drop_lowest: int = 0
    # Canvas group ids this maps to; several Canvas groups can feed one
    # syllabus category, and some Canvas groups are junk we ignore.
    canvas_group_ids: List[int] = field(default_factory=list)
    # Bonus categories add on top and can never reduce the grade.
    is_bonus: bool = False
    note: str = ""


@dataclass
class CourseRules:
    course_code: str
    scheme: str = "weighted"                     # "weighted" | "points"
    groups: List[Group] = field(default_factory=list)
    total_points: Optional[float] = None         # points scheme only
    letter_cutoffs: Dict[str, float] = field(
        default_factory=lambda: {"A": 90.0, "B": 80.0, "C": 70.0, "D": 60.0})
    rounding: str = "none"                       # "none" | "nearest_int"
    max_percent: Optional[float] = None          # e.g. 102 when bonus is capped
    late_policy: str = ""
    notes: List[str] = field(default_factory=list)
    source: str = "syllabus"                     # syllabus | canvas | manual
    confidence: float = 1.0

    # ── letters ──────────────────────────────────────────────────────────
    def round_score(self, pct: float) -> float:
        if self.rounding == "nearest_int":
            return float(round(pct))
        return pct

    def letter_for(self, pct: float) -> str:
        pct = self.round_score(pct)
        for letter in sorted(self.letter_cutoffs, key=lambda k: -self.letter_cutoffs[k]):
            if pct >= self.letter_cutoffs[letter]:
                return letter
        return "F"

    def cutoff_for(self, letter: str) -> Optional[float]:
        return self.letter_cutoffs.get(letter)

    def next_letter_up(self, letter: str) -> Optional[str]:
        """The letter above `letter`, or None if already at the top."""
        ordered = sorted(self.letter_cutoffs.items(), key=lambda kv: kv[1])
        names = [k for k, _ in ordered] + []
        if letter == "F":
            return names[0] if names else None
        if letter not in names:
            return None
        i = names.index(letter)
        return names[i + 1] if i + 1 < len(names) else None

    # ── io ───────────────────────────────────────────────────────────────
    @classmethod
    def from_dict(cls, d: dict) -> "CourseRules":
        groups = [Group(**g) for g in d.get("groups", [])]
        payload = {k: v for k, v in d.items() if k != "groups"}
        return cls(groups=groups, **payload)

    @classmethod
    def load(cls, path) -> "CourseRules":
        return cls.from_dict(json.loads(Path(path).read_text()))

    def to_dict(self) -> dict:
        return asdict(self)

    # ── sanity ───────────────────────────────────────────────────────────
    def validate(self) -> List[str]:
        """Problems worth showing the user rather than silently tolerating."""
        problems = []
        if self.scheme == "weighted":
            total = sum(g.weight for g in self.groups if not g.is_bonus)
            if abs(total - 100.0) > 0.01:
                problems.append(
                    "graded weights sum to %g%%, not 100%%" % total)
        elif self.scheme == "points":
            if not self.total_points:
                problems.append("points course with no total_points")
        else:
            problems.append("unknown scheme %r" % self.scheme)
        for g in self.groups:
            if g.drop_lowest and g.expected_count and g.drop_lowest >= g.expected_count:
                problems.append("%s drops %d of %d" %
                                (g.name, g.drop_lowest, g.expected_count))
        return problems
