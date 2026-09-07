"""Emit the Python engine's numbers so the TypeScript port can be diffed.

Runs over every demo fixture (committed, so CI always has data) plus the real
Canvas dump when one is present locally.
"""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from engine.canvas import load_dump
from engine.grade import evaluate, project
from engine.model import CourseRules

def norm(s):
    return s.replace("-", "").replace(" ", "").upper()

def match(course, rules):
    for r in rules:
        if norm(course.code).startswith(norm(r.course_code)):
            return r
        if norm(course.name).startswith(norm(r.course_code)):
            return r
    return None

def run(dump_path, rules):
    out = {}
    for c in load_dump(dump_path):
        r = match(c, rules)
        if not r:
            continue
        res = evaluate(r, c)
        out[res.code] = {
            "settled_pct": res.settled_pct, "earned_pct": res.earned_pct,
            "floor": res.floor, "ceiling": res.ceiling, "on_pace": res.on_pace,
            "floor_letter": res.floor_letter, "ceiling_letter": res.ceiling_letter,
            "on_pace_letter": res.on_pace_letter,
            "need_A": res.needed_for("A"), "need_B": res.needed_for("B"),
            "slack_A": res.slack_for("A"),
            "groups": {g.name: [g.weight, g.scored_count, g.earned_fraction,
                                g.settled_weight, g.remaining_weight]
                       for g in res.groups},
            "warnings": len(res.warnings),
            "project": {str(int(rate * 100)): project(res, rate)
                        for rate in (0.0, 0.5, 0.7, 0.9, 1.0)},
        }
    return out

datasets = {}

demo_rules = [CourseRules.from_dict(d)
              for d in json.loads((ROOT / "demo/fixtures/rules.json").read_text())]
for scenario in ("week2", "midterms", "finals"):
    datasets[f"demo:{scenario}"] = run(ROOT / f"demo/fixtures/{scenario}.json", demo_rules)

real = ROOT / "data/canvas-term239.json"
if real.exists():
    real_rules = [CourseRules.load(f) for f in sorted((ROOT / "engine/rules").glob("*.json"))]
    datasets["real"] = run(real, real_rules)

print(json.dumps(datasets, indent=1))
