"""Normalise a Canvas collector dump into something the engine can reason about.

Canvas's own grade numbers are deliberately not trusted here -- we keep them
only so we can show the user how far off they are.
"""

from __future__ import annotations

import html as _html
import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

# Canvas marks work "graded" even when no score was entered (an excused or
# ungraded-but-submitted item). Those must not count toward the denominator --
# treating them as zeros is exactly the bug that makes Canvas's numbers useless.
GRADED_STATES = {"graded"}


@dataclass
class Item:
    id: int
    name: str
    group_id: Optional[int]
    group_name: str
    points_possible: Optional[float]
    due_at: Optional[str]
    score: Optional[float]
    state: str
    excused: bool = False

    @property
    def is_scored(self) -> bool:
        """Has this actually produced a number that affects the grade?"""
        return (self.score is not None
                and not self.excused
                and self.state in GRADED_STATES
                and (self.points_possible or 0) > 0)

    @property
    def fraction(self) -> Optional[float]:
        if not self.is_scored:
            return None
        return self.score / self.points_possible

    @property
    def due(self) -> Optional[datetime]:
        if not self.due_at:
            return None
        try:
            return datetime.fromisoformat(self.due_at.replace("Z", "+00:00"))
        except ValueError:
            return None

    @property
    def is_past_due(self) -> bool:
        d = self.due
        return bool(d and d < datetime.now(timezone.utc))


@dataclass
class CanvasCourse:
    id: int
    code: str
    name: str
    weights_applied: bool
    items: List[Item] = field(default_factory=list)
    canvas_group_weights: Dict[int, float] = field(default_factory=dict)
    canvas_group_names: Dict[int, str] = field(default_factory=dict)
    canvas_current_score: Optional[float] = None
    canvas_final_score: Optional[float] = None
    canvas_current_grade: Optional[str] = None
    syllabus_body: Optional[str] = None
    # v2 collector: professors hide syllabi in Pages, Files and module items.
    syllabus_pages: List[dict] = field(default_factory=list)
    syllabus_files: List[dict] = field(default_factory=list)
    syllabus_module_items: List[dict] = field(default_factory=list)

    @property
    def syllabus_text(self) -> str:
        """Every syllabus-ish source this course exposes, as plain text.

        This is what gets handed to extraction. An empty string means the
        syllabus is somewhere the API cannot reach -- a linked PDF, a course
        website, a handout -- and the user has to supply it.
        """
        chunks = []
        if self.syllabus_body:
            chunks.append(("Syllabus", self.syllabus_body))
        for p in self.syllabus_pages:
            if p.get("body"):
                chunks.append((p.get("title") or "Page", p["body"]))
        return "\n\n".join("## %s\n\n%s" % (t, strip_html(b)) for t, b in chunks)

    @property
    def unreachable_syllabus(self) -> List[dict]:
        """Syllabus-looking things we found but cannot read (PDFs, links)."""
        return list(self.syllabus_files) + list(self.syllabus_module_items)

    def items_for(self, group_ids: List[int]) -> List[Item]:
        wanted = set(group_ids)
        return [i for i in self.items if i.group_id in wanted]


_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"[ \t]*\n[ \t]*")


def strip_html(fragment: str) -> str:
    """Canvas page bodies are HTML. Keep the text and the line breaks."""
    if not fragment:
        return ""
    text = re.sub(r"<(br|/p|/div|/li|/tr|/h[1-6])[^>]*>", "\n", fragment, flags=re.I)
    text = re.sub(r"<li[^>]*>", "- ", text, flags=re.I)
    text = _TAG.sub("", text)
    text = _html.unescape(text)
    text = _WS.sub("\n", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def load_dump(path) -> List[CanvasCourse]:
    raw = json.loads(Path(path).read_text())
    courses = []
    for c in raw["courses"]:
        gnames = {g["id"]: g["name"] for g in c["assignment_groups"]}
        gweights = {g["id"]: (g.get("group_weight") or 0.0)
                    for g in c["assignment_groups"]}
        subs = {s["assignment_id"]: s for s in c.get("submissions", [])}

        items = []
        for a in c["assignments"]:
            s = subs.get(a["id"], {})
            items.append(Item(
                id=a["id"],
                name=a["name"].strip(),
                group_id=a.get("assignment_group_id"),
                group_name=gnames.get(a.get("assignment_group_id"), "?"),
                points_possible=a.get("points_possible"),
                due_at=a.get("due_at"),
                score=s.get("score"),
                state=s.get("workflow_state", "unsubmitted"),
                excused=bool(s.get("excused")),
            ))

        grades = (c["enrollments"][0].get("grades", {})
                  if c.get("enrollments") else {})
        courses.append(CanvasCourse(
            id=c["id"],
            code=c["course_code"].split()[0] if c["course_code"] else str(c["id"]),
            name=c["name"],
            weights_applied=bool(c.get("apply_assignment_group_weights")),
            items=items,
            canvas_group_weights=gweights,
            canvas_group_names=gnames,
            canvas_current_score=grades.get("current_score"),
            canvas_final_score=grades.get("final_score"),
            canvas_current_grade=grades.get("current_grade"),
            syllabus_body=c.get("syllabus_body"),
            syllabus_pages=c.get("syllabus_pages") or [],
            syllabus_files=c.get("syllabus_files") or [],
            syllabus_module_items=c.get("syllabus_module_items") or [],
        ))
    return courses
