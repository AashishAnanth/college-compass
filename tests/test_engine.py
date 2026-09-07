"""Engine tests. Hand-computed expectations, not snapshots of whatever it does."""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from engine.model import CourseRules, Group
from engine.canvas import CanvasCourse, Item
from engine.grade import evaluate

FAILURES = []

def check(label, got, want, tol=0.01):
    ok = abs(got - want) <= tol if isinstance(want, float) else got == want
    print("  %-52s %-12s %s" % (label, ("%.4g" % got) if isinstance(got, float) else got,
                                "ok" if ok else "FAIL want %s" % (want,)))
    if not ok:
        FAILURES.append(label)


def course(items, weights_applied=True, cur=None, fin=None):
    return CanvasCourse(id=1, code="X", name="X", weights_applied=weights_applied,
                        items=items, canvas_current_score=cur, canvas_final_score=fin)


def item(gid, pts, score, state="graded", name="i"):
    return Item(id=id(object()), name=name, group_id=gid, group_name="g",
                points_possible=pts, due_at=None, score=score, state=state)


print("\n[1] weighted: one of two exams scored 80%, exams are 100% of grade")
rules = CourseRules("T", groups=[Group("Exams", 100.0, expected_count=2,
                                       canvas_group_ids=[1])])
r = evaluate(rules, course([item(1, 100, 80)]))
check("settled (half the exams)", r.settled_pct, 50.0)
check("earned (80% of that half)", r.earned_pct, 40.0)
check("floor  (zero on exam 2)", r.floor, 40.0)
check("ceiling (100 on exam 2)", r.ceiling, 90.0)
check("on pace (80% throughout)", r.on_pace, 80.0)
check("floor letter", r.floor_letter, "F")
check("ceiling letter", r.ceiling_letter, "A")

print("\n[2] needed / slack")
check("need on remaining for an A", r.needed_for("A"), 100.0)
check("need on remaining for a B", r.needed_for("B"), 80.0)
check("slack against B", r.slack_for("B"), 10.0)

print("\n[3] rounding gives the student the 0.5")
rr = CourseRules("T", rounding="nearest_int",
                 groups=[Group("E", 100.0, expected_count=2, canvas_group_ids=[1])])
r2 = evaluate(rr, course([item(1, 100, 80)]))
check("89.5 target -> need 99%", r2.needed_for("A"), 99.0)
check("89.5 rounds up to an A", rr.letter_for(89.5), "A")
check("89.49 stays a B", rr.letter_for(89.49), "B")

print("\n[4] bonus lifts the ceiling but is never required")
rb = CourseRules("T", max_percent=102.0, groups=[
    Group("Exams", 100.0, expected_count=1, canvas_group_ids=[1]),
    Group("Pop", 2.0, is_bonus=True, canvas_group_ids=[2]),
])
r3 = evaluate(rb, course([item(1, 100, 100)]))
check("settled excludes bonus", r3.settled_pct, 100.0)
check("perfect score plus bonus, capped", r3.ceiling, 102.0)
check("floor unaffected by unearned bonus", r3.floor, 100.0)

print("\n[5] ungraded work is never counted as zero")
r4 = evaluate(CourseRules("T", groups=[Group("E", 100.0, expected_count=2,
                                             canvas_group_ids=[1])]),
              course([item(1, 100, 90), item(1, 100, None, state="unsubmitted")]))
check("only the graded exam settles", r4.settled_pct, 50.0)
check("earned", r4.earned_pct, 45.0)

print("\n[6] 'graded' with no score is not a zero either")
r5 = evaluate(CourseRules("T", groups=[Group("E", 100.0, expected_count=2,
                                             canvas_group_ids=[1])]),
              course([item(1, 100, 90), item(1, 100, None, state="graded")]))
check("graded-but-unscored ignored", r5.settled_pct, 50.0)

print("\n[7] drop-lowest only applies once the set is complete")
rd = CourseRules("T", groups=[Group("Q", 100.0, expected_count=3, drop_lowest=1,
                                    canvas_group_ids=[1])])
partial = evaluate(rd, course([item(1, 10, 10), item(1, 10, 0)]))
check("partial set: nothing dropped yet", partial.earned_pct, 50.0)
full = evaluate(rd, course([item(1, 10, 10), item(1, 10, 0), item(1, 10, 10)]))
check("full set: lowest dropped -> 100%", full.earned_pct, 100.0)

print("\n[8] points scheme: 195-point course, 7 of 9 graded points earned")
rp = CourseRules("P", scheme="points", total_points=195.0,
                 groups=[Group("All", canvas_group_ids=[1])])
r6 = evaluate(rp, course([item(1, 5, 5), item(1, 1, 1), item(1, 1, 1),
                          item(1, 1, 0), item(1, 1, 0)]))
check("settled = 9/195 of the course", r6.settled_pct, 9 / 195 * 100)
check("earned  = 7/195", r6.earned_pct, 7 / 195 * 100)
check("ceiling = 7 banked + 186 available", r6.ceiling, (7 + 186) / 195 * 100)
check("on pace = 77.8% of 195", r6.on_pace, 7 / 9 * 100)
check("flagged as noise (<15% settled)", r6.is_noise, True)

print("\n[9] weights that do not sum to 100 are reported, not swallowed")
bad = CourseRules("T", groups=[Group("A", 10.0, canvas_group_ids=[1])])
r7 = evaluate(bad, course([]))
check("warning raised", any("sum to 10" in w for w in r7.warnings), True)

print("\n[10] weighting switched off in Canvas is surfaced")
r8 = evaluate(CourseRules("T", groups=[Group("E", 100.0, canvas_group_ids=[1])]),
              course([], weights_applied=False))
check("warning raised", any("weighting switched off" in w for w in r8.warnings), True)

print("\n[11] a category weights by points, not per assignment")
# Canvas scores a group as sum(earned)/sum(possible). Averaging the fractions
# instead reports a course tens of points wrong when items differ in size.
rw3 = CourseRules("T", groups=[Group("Projects", 100.0, expected_count=3,
                                     canvas_group_ids=[1])])
r11 = evaluate(rw3, course([item(1, 10, 10), item(1, 30, 30), item(1, 60, 0)]))
check("aced 10 and 30, bombed 60 -> 40%", r11.earned_pct, 40.0)
check("group fraction is points-weighted", r11.groups[0].earned_fraction, 0.4)
r11b = evaluate(rw3, course([item(1, 10, 0), item(1, 30, 0), item(1, 60, 60)]))
check("mirror image -> 60%", r11b.earned_pct, 60.0)

print("\n[12] a half-finished category settles by points, not by count")
rw4 = CourseRules("T", groups=[Group("Exams", 100.0, expected_count=2,
                                     expected_points_each=100, canvas_group_ids=[1])])
r12 = evaluate(rw4, course([item(1, 100, 90)]))
check("one of two exams scored", r12.settled_pct, 50.0)
check("earned", r12.earned_pct, 45.0)

print("\n[13] projection at 100% must reach the ceiling, including unlisted work")
from engine.grade import project
rp2 = CourseRules("P", scheme="points", total_points=195.0,
                  groups=[Group("All", canvas_group_ids=[1])])
r9 = evaluate(rp2, course([item(1, 5, 5), item(1, 1, 1), item(1, 1, 1),
                           item(1, 1, 0), item(1, 1, 0)]))
check("project@1.0 == ceiling", project(r9, 1.0), r9.ceiling)
check("project@0.0 == floor", project(r9, 0.0), r9.floor)
rw2 = CourseRules("W", groups=[Group("E", 100.0, expected_count=2, canvas_group_ids=[1])])
r10 = evaluate(rw2, course([item(1, 100, 80)]))
check("weighted project@1.0 == ceiling", project(r10, 1.0), r10.ceiling)
check("weighted project@0.0 == floor", project(r10, 0.0), r10.floor)

print("\n" + ("ALL PASS" if not FAILURES else "FAILED: %s" % FAILURES))
sys.exit(1 if FAILURES else 0)
