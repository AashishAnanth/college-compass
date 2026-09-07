"""Extract grading rules from a syllabus with Claude.

Every syllabus is laid out differently -- a table, a bulleted list, three
paragraphs of prose, or a points total with no percentages anywhere. Rather
than write a parser per shape, we hand Claude the text and a strict schema and
make it fill in the same structure every time.

Two things make the output trustworthy rather than plausible:

  strict tool use   the model cannot return a shape that does not validate
  confidence + notes  it must say how sure it is, and quote what it relied on

Anything below the confidence floor is surfaced for review instead of used.

    python -m engine.extract path/to/syllabus.txt --code "CS 1234"
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

MODEL = "claude-opus-5"
CONFIDENCE_FLOOR = 0.6

RULES_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["course_code", "scheme", "groups", "letter_cutoffs",
                 "rounding", "confidence", "notes"],
    "properties": {
        "course_code": {"type": "string"},
        "scheme": {"type": "string", "enum": ["weighted", "points"],
                   "description": "weighted when categories carry percentages "
                                  "summing to 100; points when the course is "
                                  "graded out of a fixed raw point total"},
        "total_points": {"type": ["number", "null"],
                         "description": "required for the points scheme"},
        "groups": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["name", "weight", "is_bonus"],
                "properties": {
                    "name": {"type": "string"},
                    "weight": {"type": "number",
                               "description": "percent of the final grade; 0 for points courses"},
                    "expected_count": {"type": ["integer", "null"],
                                       "description": "how many of these exist by end of term, "
                                                      "per the syllabus -- not per Canvas"},
                    "drop_lowest": {"type": ["integer", "null"]},
                    "is_bonus": {"type": "boolean",
                                 "description": "true only if it can add to the grade "
                                                "but never subtract"},
                    "note": {"type": ["string", "null"],
                             "description": "any rule that a normal grade calculator "
                                            "would get wrong: multipliers, minimums, "
                                            "forgiveness, caps"},
                },
            },
        },
        "letter_cutoffs": {
            "type": "object", "additionalProperties": {"type": "number"},
            "description": "e.g. {\"A\": 90, \"B\": 80}",
        },
        "rounding": {"type": "string", "enum": ["none", "nearest_int"]},
        "max_percent": {"type": ["number", "null"],
                        "description": "cap when bonus can push above 100"},
        "late_policy": {"type": ["string", "null"]},
        "confidence": {"type": "number",
                       "description": "0-1. Low when the syllabus is vague, "
                                      "contradictory, or defers to another document."},
        "notes": {"type": "array", "items": {"type": "string"},
                  "description": "quote the syllabus for anything unusual"},
    },
}

SYSTEM = """You read course syllabi and extract exactly how the course is graded.

Rules:
- Report what the syllabus says, never what is typical. If it does not state a
  letter cutoff, leave it out rather than assuming 90/80/70.
- expected_count is what will exist by the end of term. A syllabus saying "four
  exams plus a final" means expected_count 5, even in week two.
- is_bonus is true only when a category can raise the grade and never lower it.
- Put anything a normal calculator would get wrong in `note`: score multipliers,
  minimum floors, dropped items, penalty forgiveness, caps above 100.
- Set confidence below 0.6 if the syllabus is vague, self-contradictory, or
  points at a separate schedule you were not given. Say why in notes.
- Percentages for a weighted course must sum to 100 excluding bonus. If they do
  not, keep what the syllabus says and flag it in notes."""


def _load_env(path=None):
    """Read a .env at the project root. Avoids a python-dotenv dependency for
    the one variable this script needs."""
    import os
    path = path or Path(__file__).resolve().parent.parent / ".env"
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        os.environ.setdefault(key.strip(), val.strip().strip("'\""))


def extract(text: str, course_code: str, model: str = MODEL) -> dict:
    _load_env()
    try:
        from anthropic import Anthropic
    except ImportError:
        sys.exit("pip install anthropic")

    client = Anthropic()
    tool = {
        "name": "record_grading_rules",
        "description": "Record how this course computes the final grade.",
        "input_schema": RULES_SCHEMA,
        "strict": True,
    }
    resp = client.messages.create(
        model=model,
        max_tokens=8000,
        system=SYSTEM,
        thinking={"type": "adaptive"},
        tools=[tool],
        tool_choice={"type": "tool", "name": "record_grading_rules"},
        messages=[{"role": "user",
                   "content": "Course: %s\n\nSyllabus:\n\n%s" % (course_code, text)}],
    )
    for block in resp.content:
        if getattr(block, "type", None) == "tool_use":
            return block.input
    raise RuntimeError("model returned no rules: stop_reason=%s" % resp.stop_reason)


def normalise(raw: dict, canvas_group_ids=None) -> dict:
    """Fill in the fields the engine needs that the model does not supply."""
    out = dict(raw)
    out.setdefault("source", "syllabus")
    for g in out.get("groups", []):
        g.setdefault("canvas_group_ids", [])
        g["drop_lowest"] = g.get("drop_lowest") or 0
        g["note"] = g.get("note") or ""
        if g.get("expected_count") is None:
            g.pop("expected_count", None)
    out["notes"] = out.get("notes") or []
    if out.get("late_policy") is None:
        out["late_policy"] = ""
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("syllabus", type=Path)
    ap.add_argument("--code", required=True)
    ap.add_argument("--out", type=Path)
    ap.add_argument("--model", default=MODEL)
    args = ap.parse_args()

    raw = extract(args.syllabus.read_text(), args.code, args.model)
    rules = normalise(raw)

    conf = rules.get("confidence", 0)
    if conf < CONFIDENCE_FLOOR:
        print("confidence %.2f is below the floor -- review before using:" % conf,
              file=sys.stderr)
        for n in rules.get("notes", []):
            print("  - %s" % n, file=sys.stderr)

    text = json.dumps(rules, indent=2)
    if args.out:
        args.out.write_text(text)
        print("wrote %s (confidence %.2f)" % (args.out, conf))
    else:
        print(text)
    print("\nNOTE: canvas_group_ids are left empty. Map each group to its Canvas "
          "assignment group before the engine can use this file.", file=sys.stderr)


if __name__ == "__main__":
    main()
