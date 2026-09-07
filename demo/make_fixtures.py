"""Generate the demo data.

Nothing here is a real student. Every course, name, id and score is invented.
But the *shapes* are taken from real Canvas responses: the same field names, the
same quirks, the same ways a course can be misconfigured. A demo built on tidy
data would misrepresent the problem, because the problem is that real Canvas
data is not tidy.

Three scenarios trace one term:

    week2      almost nothing graded; Canvas already reporting grades
    midterms   enough settled to rank courses against each other
    finals     one A locked in, one out of reach — the reallocation case

Deterministic: same seed, same output, so builds are reproducible.
"""

from __future__ import annotations

import json
import random
from datetime import datetime, timedelta
from pathlib import Path

SEED = 20260906
OUT = Path(__file__).parent / "fixtures"
TERM_START = datetime(2026, 8, 17, 5, 0)          # Monday of week 1
HOST = "https://canvas.example.edu"

rng = random.Random(SEED)

# Canvas ids look like this: six digits, unrelated to anything.
_next_id = iter(range(500100, 600000))
def nid() -> int:
    return next(_next_id)


def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def wk(week: float, hour: int = 23, minute: int = 59) -> str:
    """A due date `week` weeks into term."""
    d = TERM_START + timedelta(days=7 * (week - 1))
    return iso(d.replace(hour=hour, minute=minute, second=59))


def score(out_of: float, mean: float, sd: float, floor: float = 0.0) -> float:
    """A plausible score: not a round number, occasionally a bad day."""
    frac = rng.gauss(mean, sd)
    frac = max(floor, min(1.0, frac))
    raw = frac * out_of
    # Graders give halves and whole points, not six decimals.
    step = 0.5 if out_of <= 30 else 1.0
    return round(round(raw / step) * step, 2)


class Course:
    def __init__(self, code, name, weights_applied, scheme="weighted", total_points=None):
        self.id = nid()
        self.code = code
        self.name = name
        self.weights_applied = weights_applied
        self.scheme = scheme
        self.total_points = total_points
        self.groups = []          # (id, name, canvas_weight, syllabus_weight, is_bonus)
        self.items = []           # dicts

    def group(self, name, canvas_weight, syllabus_weight=None, is_bonus=False):
        gid = nid()
        self.groups.append({
            "id": gid, "name": name, "group_weight": canvas_weight,
            "_syllabus_weight": syllabus_weight if syllabus_weight is not None else canvas_weight,
            "_bonus": is_bonus,
        })
        return gid

    def item(self, gid, name, points, due, submission_types=("online_upload",)):
        self.items.append({
            "id": nid(), "name": name, "assignment_group_id": gid,
            "points_possible": points, "due_at": due,
            "submission_types": list(submission_types),
            "_score": None, "_state": "unsubmitted", "_excused": False,
        })
        return self.items[-1]


# ── the five courses ─────────────────────────────────────────────────────────

def build_courses():
    cs = []

    # 1. The hook. Weighting switched off in Canvas, bonus quizzes filed as a
    #    normal graded group, only one of five exams created so far.
    c = Course("CS 2110", "Computer Organization & Programming - CS-2110-A", False)
    g_ex = c.group("Exams", 0, 76)
    g_hw = c.group("Homework", 0, 14)
    g_lab = c.group("Labs", 0, 10)
    g_bonus = c.group("Pop Quizzes", 0, 3, is_bonus=True)
    for i in range(1, 5):
        c.item(g_ex, f"Exam {i}", 100, wk(3 + i * 3, 13, 15), ("on_paper",))
    c.item(g_ex, "Final Exam", 100, wk(16, 14, 20), ("on_paper",))
    for i in range(1, 12):
        c.item(g_hw, f"Homework {i:02d}", 20, wk(1.5 + i), ("external_tool",))
    for i in range(1, 11):
        c.item(g_lab, f"Lab {i:02d}", 10, wk(2 + i, 17, 0))
    for i in range(1, 7):
        c.item(g_bonus, f"Pop Quiz {i}", 5, wk(2 + i * 2, 13, 15), ("on_paper",))
    cs.append(c)

    # 2. Canvas configured correctly. The control case — nothing to correct.
    c = Course("CS 3600", "Introduction to Artificial Intelligence - CS-3600-B", True)
    g_pr = c.group("Projects", 45)
    g_ex = c.group("Exams", 40)
    g_hw = c.group("Homework", 15)
    for i, (nm, w) in enumerate([("Search", 4), ("Logic", 7), ("Planning", 10),
                                 ("Learning", 13)], start=1):
        c.item(g_pr, f"Project {i}: {nm}", 100, wk(w), ("online_upload",))
    c.item(g_ex, "Midterm", 100, wk(8, 13, 15), ("on_paper",))
    c.item(g_ex, "Final Exam", 100, wk(16, 11, 30), ("on_paper",))
    for i in range(1, 8):
        c.item(g_hw, f"HW {i}", 25, wk(2 + i * 1.5), ("external_tool",))
    cs.append(c)

    # 3. Points scheme. 500 raw points, no percentages anywhere.
    c = Course("MATH 2551", "Multivariable Calculus - MATH-2551-D", False,
               scheme="points", total_points=500)
    g_q = c.group("Quizzes", 0)
    g_ex = c.group("Midterms", 0)
    g_fin = c.group("Final Exam", 0)
    g_wh = c.group("WebAssign", 0)
    g_ec = c.group("Extra Credit", 0, is_bonus=True)
    for i in range(1, 9):
        c.item(g_q, f"Quiz {i}", 15, wk(2 + i * 1.5, 9, 5), ("online_quiz",))
    for i in range(1, 4):
        c.item(g_ex, f"Midterm {i}", 80, wk(4 + i * 3.5, 18, 30), ("on_paper",))
    c.item(g_fin, "Final Exam", 100, wk(16, 8, 0), ("on_paper",))
    for i in range(1, 9):
        c.item(g_wh, f"WebAssign Set {i:02d}", 5, wk(1.5 + i), ("external_tool",))
    c.item(g_ec, "Course Survey", 5, wk(15), ("online_quiz",))
    cs.append(c)

    # 4. Drop-lowest, which nothing else models correctly.
    c = Course("PHYS 2211", "Introductory Physics I - PHYS-2211-G", True)
    g_q = c.group("Quizzes", 20)
    g_ex = c.group("Tests", 50)
    g_lab = c.group("Lab", 20)
    g_hw = c.group("Homework", 10)
    for i in range(1, 11):
        c.item(g_q, f"Quiz {i:02d}", 10, wk(1.5 + i, 8, 5), ("online_quiz",))
    for i in range(1, 4):
        c.item(g_ex, f"Test {i}", 100, wk(4 + i * 3.5, 18, 0), ("on_paper",))
    c.item(g_ex, "Final Exam", 100, wk(16, 14, 40), ("on_paper",))
    for i in range(1, 12):
        c.item(g_lab, f"Lab Report {i:02d}", 20, wk(2 + i, 17, 0))
    for i in range(1, 12):
        c.item(g_hw, f"WebAssign {i:02d}", 10, wk(1.5 + i))
    cs.append(c)

    # 5. Small course that finishes early — the locked-in A.
    c = Course("ENGL 1102", "English Composition II - ENGL-1102-K", True)
    g_es = c.group("Essays", 60)
    g_pt = c.group("Participation", 15)
    g_pr = c.group("Peer Review", 10)
    g_pf = c.group("Portfolio", 15)
    for i, w in enumerate([4, 8, 12], start=1):
        c.item(g_es, f"Essay {i}", 100, wk(w))
    for i in range(1, 13):
        c.item(g_pt, f"Discussion Week {i}", 10, wk(1 + i, 22, 0), ("discussion_topic",))
    for i in range(1, 4):
        c.item(g_pr, f"Peer Review {i}", 20, wk(4.5 + (i - 1) * 4))
    c.item(g_pf, "Final Portfolio", 100, wk(15))
    cs.append(c)

    return cs


# ── grading a scenario ───────────────────────────────────────────────────────

# How each student performs per course, and how far the term has run.
PROFILE = {
    "CS 2110":  dict(mean=0.86, sd=0.09),
    "CS 3600":  dict(mean=0.93, sd=0.05),
    "MATH 2551": dict(mean=0.78, sd=0.12),
    "PHYS 2211": dict(mean=0.71, sd=0.15),   # the one that slips away
    "ENGL 1102": dict(mean=0.95, sd=0.04),
}

WEEK = {"week2": 2.6, "midterms": 9.5, "finals": 16.5}


def due_week(due: str) -> float:
    d = datetime.strptime(due, "%Y-%m-%dT%H:%M:%SZ")
    return (d - TERM_START).days / 7 + 1


def apply_scenario(courses, scenario):
    """Score everything due before `now`, leave the rest untouched."""
    now = WEEK[scenario]
    rng.seed(SEED + len(scenario))

    for c in courses:
        prof = PROFILE[c.code]
        for it in c.items:
            it["_score"] = None
            it["_state"] = "unsubmitted"
            it["_excused"] = False

            w = due_week(it["due_at"])
            if w > now:
                continue                                  # not due yet

            # Grading lags the deadline by a few days.
            if w > now - 0.4:
                it["_state"] = "submitted"
                continue

            grp = next(g for g in c.groups if g["id"] == it["assignment_group_id"])

            # Bonus and extra credit are opt-in; most people skip most of them.
            if grp["_bonus"] and rng.random() < 0.45:
                continue

            # A small number of things get marked graded with nothing entered —
            # attendance, an excused absence. Canvas does this constantly and it
            # is exactly what a naive calculator turns into a zero.
            r = rng.random()
            if r < 0.04:
                it["_state"] = "graded"
                continue
            if r < 0.06:
                it["_state"] = "graded"
                it["_excused"] = True
                continue

            it["_state"] = "graded"
            it["_score"] = score(it["points_possible"], prof["mean"], prof["sd"])

        # One real zero apiece by midterms: a missed deadline.
        if now > 5:
            gradable = [i for i in c.items if i["_state"] == "graded"
                        and i["_score"] is not None and i["points_possible"] <= 25]
            if gradable:
                gradable[rng.randrange(len(gradable))]["_score"] = 0.0


def to_dump(courses, scenario):
    out = {"collected_at": iso(TERM_START + timedelta(days=7 * (WEEK[scenario] - 1))),
           "host": HOST, "term": 239, "collector_version": 2, "courses": []}

    for c in courses:
        groups = []
        for g in c.groups:
            gid = g["id"]
            groups.append({
                "id": gid, "name": g["name"], "group_weight": g["group_weight"],
                "position": len(groups) + 1, "rules": {},
                "assignments": [
                    {k: v for k, v in it.items() if not k.startswith("_")}
                    for it in c.items if it["assignment_group_id"] == gid
                ],
            })

        assignments = [{k: v for k, v in it.items() if not k.startswith("_")}
                       for it in c.items]
        submissions = []
        for it in c.items:
            submissions.append({
                "id": nid(), "assignment_id": it["id"], "user_id": 4408217,
                "score": it["_score"], "grade": (None if it["_score"] is None
                                                 else str(it["_score"])),
                "workflow_state": it["_state"], "excused": it["_excused"],
                "late": False, "missing": False,
                "submitted_at": None if it["_state"] == "unsubmitted" else it["due_at"],
            })

        # Canvas's own two numbers, computed exactly the way Canvas computes them.
        scored = [it for it in c.items
                  if it["_state"] == "graded" and it["_score"] is not None
                  and not it["_excused"]]
        earned = sum(it["_score"] for it in scored)
        poss_graded = sum(it["points_possible"] for it in scored)
        poss_all = sum(it["points_possible"] for it in c.items)
        cur = round(earned / poss_graded * 100, 2) if poss_graded else None
        fin = round(earned / poss_all * 100, 2) if poss_all else 0

        out["courses"].append({
            # Real Canvas course_code looks like "CS-2110-A", not "CS 2110".
            "id": c.id, "name": c.name, "course_code": c.name.split(" - ")[-1],
            "apply_assignment_group_weights": c.weights_applied,
            "syllabus_body": None, "syllabus_pages": [], "syllabus_files": [],
            "assignment_groups": groups,
            "assignments": assignments,
            "submissions": submissions,
            "enrollments": [{
                "type": "student", "role": "StudentEnrollment",
                "enrollment_state": "active", "user_id": 4408217,
                "grades": {"current_score": cur, "final_score": fin,
                           "current_grade": None, "final_grade": None},
            }],
        })
    return out


def to_rules(courses):
    """The syllabus half — what a correct extraction would produce."""
    specs = {
        "CS 2110": dict(
            expected={"Exams": 5, "Homework": 11, "Labs": 10},
            rounding="nearest_int", max_percent=103.0,
            notes=["Four midterms and a final, weighted equally at 15.2% each.",
                   "Rounds to the nearest integer: 89.5 is an A, 89.49 is a B.",
                   "Pop quizzes are bonus and cannot lower your grade."],
            late="Homework is accepted up to 48 hours late for 80% credit."),
        "CS 3600": dict(
            expected={"Projects": 4, "Exams": 2, "Homework": 7},
            notes=["Canvas is configured correctly for this course."],
            late="Five late days for the semester, at most three on one project."),
        "MATH 2551": dict(
            points=500,
            expected={"Quizzes": 8, "Midterms": 3, "WebAssign": 8},
            notes=["Graded out of 500 raw points, not percentages. The A starts at 450.",
                   "The lowest quiz is dropped."],
            drops={"Quizzes": 1},
            late="WebAssign closes at the deadline. No extensions."),
        "PHYS 2211": dict(
            expected={"Quizzes": 10, "Tests": 4, "Lab": 11, "Homework": 11},
            drops={"Quizzes": 2},
            notes=["The two lowest quizzes are dropped.",
                   "The final replaces your lowest test if it is higher."],
            late="Labs lose 10% per day."),
        "ENGL 1102": dict(
            expected={"Essays": 3, "Participation": 12, "Peer Review": 3, "Portfolio": 1},
            notes=["Participation is graded on completion."],
            late="Essays lose one letter grade per day."),
    }

    rules = []
    for c in courses:
        s = specs[c.code]
        groups = []
        for g in c.groups:
            groups.append({
                "name": g["name"],
                "weight": 0.0 if s.get("points") else float(g["_syllabus_weight"]),
                "expected_count": s.get("expected", {}).get(g["name"]),
                "drop_lowest": s.get("drops", {}).get(g["name"], 0),
                "canvas_group_ids": [g["id"]],
                "is_bonus": g["_bonus"],
                "note": "",
            })
        rules.append({
            "course_code": c.code,
            "scheme": "points" if s.get("points") else "weighted",
            "total_points": s.get("points"),
            "groups": groups,
            "letter_cutoffs": ({"A": 90.0, "B": 80.0, "C": 70.0, "D": 60.0}
                               if not s.get("points")
                               else {"A": 90.0, "B": 80.0, "C": 70.0, "D": 60.0}),
            "rounding": s.get("rounding", "none"),
            "max_percent": s.get("max_percent"),
            "late_policy": s.get("late", ""),
            "notes": s.get("notes", []),
            "source": "syllabus",
            "confidence": 0.95,
        })
    return rules


def main():
    OUT.mkdir(exist_ok=True)
    courses = build_courses()
    (OUT / "rules.json").write_text(json.dumps(to_rules(courses), indent=1))
    for scenario in WEEK:
        apply_scenario(courses, scenario)
        (OUT / f"{scenario}.json").write_text(
            json.dumps(to_dump(courses, scenario), indent=1))
        print("wrote %-9s %6d KB" % (scenario,
              len(json.dumps(to_dump(courses, scenario))) // 1024))
    print("wrote rules.json (%d courses)" % len(courses))


if __name__ == "__main__":
    main()
