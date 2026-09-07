# College Compass

**Canvas told me I had a 100% and a 6.58% in the same course, on the same day.**

Both numbers were real. Neither was my grade. Canvas computes one figure that
ignores everything ungraded and another that counts it all as zero — and in
September the gap between them is the entire course.

College Compass reads your Canvas data through the session you are already
signed into, reconciles it against the grading rules in your syllabus, and
refuses to show a single number. It shows the range, how much of the course is
actually settled, and what you can afford to let up on.

**[Live demo →](https://college-compass.vercel.app)**

![College Compass](docs/screenshot.png)

---

## The problem, measured

Run against a real Georgia Tech account in week two of the semester:

| Course | Canvas reported | Actually decided |
|---|---|---|
| Systems & Networks | **100% (A)** and **6.58% (F)** | 1.8% |
| Science of Health | **77.78%** | 4.6% |
| Algorithms | *no grade at all* | 0% |

The 77.78% is computed from 9 points out of 195 — under 5% of the course.
It reads like a C+. It means nothing.

## What it does

- **Reconciles two sources.** Canvas knows your scores; the syllabus knows the
  weights, how many exams are coming, and what the cutoffs are. Neither alone
  can project a grade.
- **Reports a range, never one number.** A floor, a ceiling, and how much is
  settled. When too little is decided to say anything useful, it says that.
- **What-if.** *If I average 85% on everything left, where do I finish?* Bonus
  is assumed forfeited, so the answer is the floor of that scenario.
- **Triage across courses.** Ranked by slack: how many points of the remaining
  course you can throw away and still hold an A. It refuses to rank when every
  course needs roughly the same thing, which is most of September.

## Grading rules it actually models

Real syllabi break every assumption a normal grade calculator makes:

| Rule | Example |
|---|---|
| Bonus that cannot hurt you | Pop quizzes worth +3%, capped at 103% |
| Raw points, not percentages | 500-point course where the A starts at 450 |
| Score multipliers | Project grade is `max(raw, 25%) × demo score` |
| Penalty forgiveness | One late penalty dropped per term — whichever helps most |
| Rounding at the boundary | 89.5 is an A, 89.49 is a B |
| Dropped scores | Lowest two quizzes, but only once the set is complete |
| Excused work | Removed from the grade, so it shrinks the denominator |
| Ungraded ≠ zero | Canvas marks work "graded" with no score entered |

## Architecture

```
extension/            React 18 + TypeScript, Manifest V3
  src/background.ts   finds a Canvas tab, injects the collector
  src/collect.ts      runs inside Canvas — same-origin, session-authenticated
  src/engine/         the engine in TypeScript, so there is no backend
  src/app/            the full-page tab
  src/demo/           the public demo: landing, scenarios, engineering notes

engine/               the same engine in Python, for analysis and extraction
  grade.py            settled / floor / ceiling / on-pace / needed / slack
  model.py            the grading-rule schema
  extract.py          syllabus -> rules, via Claude with strict tool use

demo/make_fixtures.py generates the demo data
tests/                engine assertions + cross-language parity
```

**No backend, no account, no credentials.** The extension runs inside the Canvas
tab you are already signed into, so requests are same-origin and carry the
session cookie. No access token to generate, nothing stored, nothing sent
anywhere — the engine runs in your browser.

## The engine exists twice, on purpose

Python for analysis and offline work, TypeScript so the extension needs no
server. A parity harness runs both over every scenario and diffs **753 values**
— every percentage, letter, group breakdown and projection — so the two cannot
silently drift.

It has already earned its keep. It pinned a projection bug where a 500-point
course collapsed to an F at 100% effort, because the projection only counted
assignments Canvas had created so far and the course was two months from
creating the rest.

## Run it

```bash
# tests
python3 tests/test_engine.py
cd extension && npm install && npm test

# the extension
cd extension && npm run build
# then chrome://extensions -> Developer mode -> Load unpacked -> extension/dist

# the demo
cd extension && npm run build:demo && npx serve dist-demo
```

The engine, tests and fixture generator use only the Python standard library.
`engine/extract.py` is the one thing that needs a dependency and an API key.

## About the demo data

Synthetic. Invented courses, invented scores, no real student.

The *shapes* are taken from real Canvas API responses, including the ways a
course can be misconfigured: weighting switched off, category weights left at
zero, bonus work filed as ordinary graded work, assignments marked graded with
no score entered. A demo built on tidy data would misrepresent the problem,
because the problem is that the real data is not tidy.

Real Canvas data is never committed — `data/` is gitignored in full.

## Status

Working, and I use it. Not on the Chrome Web Store yet.

Known gaps: grading rules are hand-authored per course today, and
`engine/extract.py` automates that but has not been run against a wide enough
sample to trust unattended. Gradescope has no public API; where a course uses
the Canvas LTI integration its deadlines arrive anyway.

## Licence

MIT
