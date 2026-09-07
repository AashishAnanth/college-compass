"""Turn a CourseResult into something a person would actually say.

The design rule: every course gets one claim you can act on, and the claim is
never a number on its own. Where the engine is uncertain, the copy says so
plainly rather than hiding behind a confidence bar.

No red, ever -- see web/design-direction.html. States are:
    wrong   Canvas is reporting something misleading; we have a correction
    noise   too little is decided for any number to mean anything
    watch   the target is slipping
    clear   on track, or nothing to say
    guess   we do not have the syllabus and are inferring
"""

from __future__ import annotations

from typing import Dict

from .grade import CourseResult

PILL_LABEL = {
    "wrong": "Canvas is wrong",
    "noise": "Too early to tell",
    "watch": "Worth a look",
    "clear": "On track",
    "guess": "Guessing",
}


def _biggest_remaining(result: CourseResult):
    live = [g for g in result.groups if not g.is_bonus and g.remaining_weight > 0.01]
    return max(live, key=lambda g: g.remaining_weight) if live else None


NOISE_CEILING = 25.0


def _canvas_is_misleading(result: CourseResult) -> bool:
    """Canvas is misleading when it shows a number that a reasonable person
    would read as their grade, while almost nothing is actually decided.

    Canvas's two numbers stay far apart for most of a term, so the settled
    ceiling matters: once a real share of the course is graded, the useful thing
    to say is what you need from here, and the discrepancy moves to the receipt.
    """
    cur = result.canvas_says.get("current")
    fin = result.canvas_says.get("final")
    if result.settled_pct >= NOISE_CEILING:
        return False
    if cur is not None and fin is not None and abs(cur - fin) > 25:
        return True                      # two numbers, wildly different
    if cur is not None and result.settled_pct < 15:
        return True                      # a confident number built on nothing
    return False


def narrate(result: CourseResult) -> Dict[str, str]:
    r = result
    big = _biggest_remaining(r)
    cur = r.canvas_says.get("current")
    fin = r.canvas_says.get("final")

    # ── low-confidence rules: say so before saying anything else ──────────
    if r.rules.confidence < 0.5:
        return {
            "state": "guess",
            "claim": "We don't have the syllabus for this one.",
            "because": "Canvas's own group weights don't add up to 100%, so any "
                       "number here would be invented. Send the syllabus and this "
                       "becomes real.",
        }

    # ── Canvas showing something misleading ───────────────────────────────
    if _canvas_is_misleading(r):
        if cur is not None and fin is not None and abs(cur - fin) > 25:
            claim = ("Canvas is showing you %g%% and %g%% for this course. "
                     "Neither is your grade." % (cur, fin))
            because = ("The first ignores everything not yet graded, the second "
                       "counts it all as zero. Only %.1f%% of the course has "
                       "actually been decided." % r.settled_pct)
        else:
            claim = "That %g%% in Canvas is noise." % cur
            because = ("It's computed from %.1f%% of the course — the handful of "
                       "things graded so far. It will swing wildly for weeks."
                       % r.settled_pct)
        if big:
            because += " %s is %.0f%% of your grade and none of it is in yet." % (
                big.name, big.remaining_weight)
        return {"state": "wrong", "claim": claim, "because": because}

    # ── nothing decided yet ───────────────────────────────────────────────
    if r.is_noise:
        if big:
            claim = "%s decides this course — %.0f%% of it." % (big.name, big.weight)
            because = ("Nothing meaningful is graded yet (%.1f%% settled). Which "
                       "means everything you do between now and the first %s is "
                       "preparation, not performance."
                       % (r.settled_pct, big.name.rstrip("s").lower()))
        else:
            claim = "Nothing is decided in this course yet."
            because = "Check back once work starts being graded."
        return {"state": "noise", "claim": claim, "because": because}

    # ── enough settled to say something real ──────────────────────────────
    # Nothing left to play for: report the outcome rather than advice.
    if r.needed_for("A") is None:
        article = "an" if r.floor_letter[:1] in "AEIOU" else "a"
        return {"state": "clear",
                "claim": "Finished at %.1f%% — %s %s." % (r.floor, article, r.floor_letter),
                "because": "Every graded item is in. Nothing you do now changes this one."}

    need_a = r.needed_for("A")
    if need_a is not None and need_a <= 0:
        return {"state": "clear",
                "claim": "The A is locked in.",
                "because": "Even a zero on everything remaining leaves you above "
                           "the cutoff. Spend your time elsewhere."}
    if need_a is not None and need_a > 100:
        # Late in a term the required rate explodes as the denominator shrinks,
        # so quote a target only while it is still achievable.
        reachable = None
        for letter in sorted(r.rules.letter_cutoffs,
                             key=lambda k: -r.rules.letter_cutoffs[k]):
            need = r.needed_for(letter)
            if need is not None and 0 < need <= 100:
                reachable = (letter, need)
                break
        if reachable is None:
            return {"state": "watch",
                    "claim": "This one is settled — you finish between %.0f%% and %.0f%%."
                             % (r.floor, r.ceiling),
                    "because": "Too little is left to move the letter. Nothing here "
                               "is worth your next hour."}
        return {"state": "watch",
                "claim": "The A is out of reach here — the %s needs %.0f%% from now on."
                         % (reachable[0], reachable[1]),
                "because": "That's not a failure, it's a reallocation. This is the "
                           "course to spend less on."}
    if need_a is not None:
        slack = r.slack_for("A") or 0
        claim = "You need %.0f%% on everything left to hold the A." % need_a
        because = ("That's %.0f points of slack across the rest of the course. "
                   "Right now you're banking %.1f of a possible %.1f."
                   % (slack, r.earned_pct, r.settled_pct))
        state = "clear" if need_a <= 85 else "watch"
        return {"state": state, "claim": claim, "because": because}

    return {"state": "clear", "claim": "Nothing to flag.", "because": ""}


def headline(results) -> Dict[str, str]:
    """One sentence for the top of the page, across every course."""
    settled = [r.settled_pct for r in results]
    worst_gap = 0.0
    for r in results:
        cur, fin = r.canvas_says.get("current"), r.canvas_says.get("final")
        if cur is not None and fin is not None:
            worst_gap = max(worst_gap, abs(cur - fin))
    return {
        "claim": "Nothing is decided yet — and Canvas is already showing you grades.",
        "detail": ("Across %d courses, the most any one of them has settled is "
                   "%.1f%%. Canvas is reporting numbers %.0f points apart for the "
                   "same course on the same day."
                   % (len(results), max(settled) if settled else 0, worst_gap)),
    }
