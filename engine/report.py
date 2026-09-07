"""Run the engine over a collector dump and print what it found."""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine.canvas import load_dump
from engine.grade import evaluate
from engine.model import CourseRules

RULES_DIR = Path(__file__).parent / "rules"


def load_rules():
    by_id, by_code = {}, {}
    for f in sorted(RULES_DIR.glob("*.json")):
        r = CourseRules.load(f)
        by_code[r.course_code.replace(" ", "").upper()] = r
    return by_code


def match(course, by_code):
    key = course.code.replace("-", "").replace(" ", "").upper()
    full = course.name.replace("-", "").replace(" ", "").upper()
    for code, rules in by_code.items():
        if key.startswith(code) or code.startswith(key) or full.startswith(code):
            return rules
    return None


def run(dump_path):
    by_code = load_rules()
    out = []
    for c in load_dump(dump_path):
        rules = match(c, by_code)
        if not rules:
            print("no rules for %s -- skipping" % c.code, file=sys.stderr)
            continue
        out.append((c, evaluate(rules, c)))
    return out


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "data/canvas-term239.json"
    for c, r in run(path):
        print("=" * 74)
        print("%s   (%s)" % (r.code, c.name))
        cs, cf = r.canvas_says["current"], r.canvas_says["final"]
        print("  canvas says       current=%s  final=%s" % (cs, cf))
        print("  settled           %.1f%% of the course is decided" % r.settled_pct)
        print("  banked            %.2f%%" % r.earned_pct)
        print("  range             %.1f%% (%s)  ..  %.1f%% (%s)"
              % (r.floor, r.floor_letter, r.ceiling, r.ceiling_letter))
        print("  on pace           %.1f%% (%s)" % (r.on_pace, r.on_pace_letter))
        for letter in ("A", "B"):
            need = r.needed_for(letter)
            if need is None:
                continue
            if need > 100:
                print("  for an %s          out of reach (would need %.0f%%)" % (letter, need))
            elif need <= 0:
                print("  for an %s          already locked in" % letter)
            else:
                print("  for an %s          need %.1f%% average on what's left "
                      "(slack %.1f pts)" % (letter, need, r.slack_for(letter)))
        for g in r.groups:
            frac = "--" if g.earned_fraction is None else "%.0f%%" % (g.earned_fraction * 100)
            print("     %-24s %5.1f%%  scored %d/%s  at %s%s"
                  % (g.name, g.weight, g.scored_count,
                     g.expected_count if g.expected_count else "?", frac,
                     "  (bonus)" if g.is_bonus else ""))
        for w in r.warnings:
            print("  ! %s" % w)
