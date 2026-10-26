"""The pre-action check and the collision calendar, on the server. Same rules as frontend/src/lib/solution.ts and calendar.ts.

The check advises and never blocks: an officer can always go ahead, with the reason recorded. The clash table is a prototype
setting until AICTE approves it.
"""
from __future__ import annotations

from typing import Any

from .dates import add_days, days_between
from .labels import STAGE_LABEL, category_label

Case = dict[str, Any]

ACTIONS = ("record", "stage", "reply", "transfer", "close")
_PENDING = ("awaiting_party", "inspection_hearing")


def _live(lane: dict) -> bool:
    return lane["lifecycle"] not in ("disposed", "transferred")


def _join(words: list[str]) -> str:
    return words[0] if len(words) <= 1 else ", ".join(words[:-1]) + " and " + words[-1]


def pre_action_check(action: str, unit: str, lanes: list[dict], case_id: str | None = None, category: str | None = None, target_stage: str | None = None) -> dict:
    """green: clear; amber: another unit is active, check with them; red: another unit handles the same issue, talk first."""
    others = [x for x in lanes if _live(x) and x["unit"] != unit and x["id"] != case_id]
    same_issue = [x for x in others if category and x["category"] == category]
    if action == "record":
        return {"light": "green", "headline": "A note is only a record. It cannot clash with another unit.", "because": [], "askUnits": []}
    if not others:
        return {"light": "green", "headline": "No other unit has an open case for this institution.", "because": [], "askUnits": []}
    mild = action == "stage" and target_stage not in _PENDING
    light = ("amber" if mild else "red") if same_issue else ("green" if mild else "amber")
    if light == "green":
        return {"light": light, "headline": "This is an internal step. Other units are not affected by it.", "because": [], "askUnits": []}
    focus = same_issue if light == "red" else others
    ask = list(dict.fromkeys(x["unit"] for x in focus))
    because = [f"{x['unit']} case {x['uid']} is “{STAGE_LABEL[x['lifecycle']].lower()}” ({category_label(x['category']).lower()})" for x in focus]
    headline = f"{_join(ask)} already {'has' if len(ask) == 1 else 'have'} an open case on the same issue." if light == "red" else f"{_join(ask)} {'has' if len(ask) == 1 else 'have'} an open case for this institution."
    return {"light": light, "headline": headline, "because": because, "askUnits": ask}


# ---------------------------------------------------------------- collision calendar
def dated_actions(cases: list[Case], today: str, to: str | None = None) -> list[dict]:
    """The dated steps of the open cases: a booked hearing or visit, a reply due, the CPGRAMS interim reply, and the final time limit."""
    from .logic import deadline_for, is_open
    out: list[dict] = []

    def add(c: Case, date: str, what: str, kind: str) -> None:
        if date >= today and (not to or date <= to):
            out.append({"date": date, "unit": c["ownerUnit"], "caseId": c["id"], "uid": c["uid"], "what": what, "kind": kind})

    for c in (x for x in cases if is_open(x) and x["lifecycle"] != "transferred"):
        d = deadline_for(c, today)
        sched = c.get("scheduled")
        if sched:
            add(c, sched["on"], sched["what"], "reply" if "reply" in sched["what"].lower() else "hearing")
        if d.get("interimDay"):
            add(c, add_days(c["receivedOn"], d["interimDay"]), "CPGRAMS interim reply due", "interim")
        add(c, d["dueOn"], "CPGRAMS time limit ends" if c["channel"] == "CPGRAMS" else "Time limit ends", "deadline")
    return sorted(out, key=lambda a: (a["date"], a["unit"]))


def find_collisions(actions: list[dict], gap: int = 7) -> list[dict]:
    """Two or more different units acting on one institution within `gap` days of each other. Final time limits are not deliberate steps."""
    steps = [a for a in actions if a["kind"] != "deadline"]
    out: list[dict] = []
    group: list[dict] = []

    def flush() -> None:
        units = list(dict.fromkeys(a["unit"] for a in group))
        if len(units) >= 2:
            out.append({"from": group[0]["date"], "to": group[-1]["date"], "units": units, "actions": group})

    for a in steps:
        if group and days_between(group[-1]["date"], a["date"]) > gap:
            flush()
            group = []
        group.append(a)
    if group:
        flush()
    return out
