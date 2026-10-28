"""Marking work, as in a government office: the nodal officer of a unit marks each case to a named dealing officer.

The nodal officer sees every officer's load first (open, late, due this week) and the cases nobody holds, then marks
a case to one person with an optional note. Re-marking a case that someone already holds needs a reason. Only the
unit's nodal officer, or the coordinator, can mark; every marking is in the case history and the audit log.
Ekatra shows the load; it never picks the officer.

How AICTE marks work internally (e-Office "mark to") is assumed from general government office practice, not confirmed.
"""
from __future__ import annotations

from sqlalchemy import select

from . import models as m
from . import services as S
from .engine import logic as L
from .engine.dates import add_days
from .errors import ApiError
from .store import State


def _can_mark(user: dict, unit: str) -> bool:
    return user["role"] == "coordinator" or (user["role"] == "nodal_officer" and user.get("unit") == unit)


def roster(st: State, unit: str) -> list[str]:
    """The unit's officers: its signed-in dealing and nodal officers, and every officer named on its cases (synthetic staff)."""
    users = [u.name for u in st.db.scalars(select(m.User).where(m.User.unit == unit)).all() if u.role in ("dealing_officer", "nodal_officer")]
    named = sorted({c["officer"] for c in st.cases if c["ownerUnit"] == unit and c.get("officer")})
    return list(dict.fromkeys([*users, *named]))


def board(st: State, user: dict, unit: str | None) -> dict:
    """GET /allocation. Every officer's load and the unit's open cases nobody holds."""
    unit = unit or user.get("unit")
    if not unit:
        raise ApiError(422, "validation_error", "Choose a unit.")
    if user["role"] not in ("nodal_officer", "coordinator", "senior_management", "dealing_officer"):
        raise ApiError(403, "forbidden", "This page is for unit officers, the coordinator and senior management.")
    week = add_days(st.today, 7)
    open_ = [c for c in st.cases if c["ownerUnit"] == unit and L.is_active(c)]
    clock = {c["id"]: L.deadline_for(c, st.today) for c in open_}
    officers = []
    for name in roster(st, unit):
        mine = [c for c in open_ if c.get("officer") == name]
        officers.append({
            "name": name, "open": len(mine),
            "late": sum(1 for c in mine if clock[c["id"]]["state"] == "overdue"),
            "dueThisWeek": sum(1 for c in mine if clock[c["id"]]["state"] != "overdue" and clock[c["id"]]["dueOn"] <= week),
            "cases": [{"id": c["id"], "uid": c["uid"], "dueOn": clock[c["id"]]["dueOn"], "state": clock[c["id"]]["state"]} for c in sorted(mine, key=lambda c: clock[c["id"]]["dueOn"])],
        })
    waiting = sorted((c for c in open_ if not c.get("officer")), key=lambda c: clock[c["id"]]["dueOn"])
    return {
        "unit": unit, "canMark": _can_mark(user, unit),
        "officers": sorted(officers, key=lambda o: -o["open"]),
        "unassigned": [{"id": c["id"], "uid": c["uid"], "institution": (st.inst_by.get(c.get("institutionId") or "") or {}).get("name") or c["recorded"]["name"],
                        "category": c["category"], "channel": c["channel"], "receivedOn": c["receivedOn"], "deadline": clock[c["id"]]} for c in waiting],
        "rule": f"A new case with no officer is flagged after {S.SETTINGS['unassignedDays']} days (prototype setting).",
    }


def mark(st: State, cid: str, officer: str, note: str, user: dict) -> dict:
    """POST /cases/{id}/mark. The nodal officer marks a case to an officer of the unit."""
    c = S.case_of(st, cid)
    if not _can_mark(user, c["ownerUnit"]):
        raise ApiError(403, "forbidden", f"Only the nodal officer of {c['ownerUnit']} or the coordinator can mark this case.")
    if not L.is_active(c):
        raise ApiError(422, "validation_error", "This case is closed or transferred.")
    if officer not in roster(st, c["ownerUnit"]):
        raise ApiError(422, "validation_error", f"Choose an officer of {c['ownerUnit']}.")
    if c.get("officer") == officer:
        raise ApiError(422, "validation_error", f"The case is already with {officer}.")
    if c.get("officer") and len(note.strip()) < 5:
        raise ApiError(422, "validation_error", f"The case is with {c['officer']}. Say why it is being moved.")
    before = c.get("officer")
    c["officer"] = officer
    text = f"Marked to {officer}" + (f" (was with {before})" if before else "") + (f": {note.strip()}" if note.strip() else "")
    S.event(c, "action_recorded", st.today, S.who(user), text, S.audit(st, S.who(user), "Case marked", c["uid"], text))
    st.save_case(c)
    return {"caseId": cid, "officer": officer, "was": before}


# ---------------------------------------------------------------- who is working on what
def who_works(st: State, user: dict, q: str | None) -> dict:
    """GET /people. Every open case by department and officer (no complainant details), and, for the signed-in person,
    the institutions they handle where a colleague or another department also has an open case (work that may duplicate)."""
    if user["role"] == "admin":
        raise ApiError(403, "forbidden", "The administrator role does not see case content.")
    from .engine.labels import STAGE_LABEL, category_label
    open_ = [c for c in st.cases if L.is_active(c)]
    clock = {c["id"]: L.deadline_for(c, st.today) for c in open_}

    def inst_name(c: dict) -> str:
        return (st.inst_by.get(c.get("institutionId") or "") or {}).get("name") or c["recorded"]["name"]

    def item(c: dict) -> dict:
        d = clock[c["id"]]
        nxt = c.get("scheduled") or None
        return {"caseId": c["id"], "uid": c["uid"], "unit": c["ownerUnit"], "officer": c.get("officer"), "institutionId": c.get("institutionId"),
                "institution": inst_name(c), "issue": category_label(c["category"]), "stage": STAGE_LABEL[c["lifecycle"]],
                "next": f"{nxt['what']} on {nxt['on']}" if nxt else c["nextAction"], "dueOn": d["dueOn"], "late": d["state"] == "overdue"}

    def holder(c: dict) -> str:
        return f"{c.get('officer') or 'no one yet'} ({c['ownerUnit']})"

    plural = S.plural
    ql = (q or "").strip().lower()
    shown = [c for c in open_ if not ql or ql in f"{inst_name(c)} {category_label(c['category'])} {c['uid']} {c.get('officer') or ''}".lower()]
    units = []
    for u in st.units:
        cs = [c for c in shown if c["ownerUnit"] == u["code"]]
        if not cs:
            continue
        people: dict[str, list[dict]] = {}
        for c in sorted(cs, key=lambda c: clock[c["id"]]["dueOn"]):
            people.setdefault(c.get("officer") or "Not yet marked to anyone", []).append(item(c))
        units.append({"unit": u["code"], "name": u["name"], "open": len(cs),
                      "officers": [{"name": n, "items": its} for n, its in sorted(people.items(), key=lambda p: (p[0].startswith("Not yet"), -len(p[1])))]})

    # Mine: the cases I hold (an officer), or my unit's (a nodal officer); then who else is on the same institutions.
    mine = [c for c in open_ if c.get("officer") == user["name"] or (user["role"] == "nodal_officer" and c["ownerUnit"] == user.get("unit"))]
    also = []
    for iid in dict.fromkeys(c["institutionId"] for c in mine if c.get("institutionId")):
        my_ids = {c["id"] for c in mine if c.get("institutionId") == iid}
        others = [c for c in open_ if c.get("institutionId") == iid and c["id"] not in my_ids]
        if others:
            my_cases = [item(c) for c in mine if c["id"] in my_ids]
            same_issue = {c["category"] for c in mine if c["id"] in my_ids} & {c["category"] for c in others}
            also.append({"institutionId": iid, "institution": st.inst_by[iid]["name"], "mine": my_cases, "others": [item(c) for c in others],
                         "sameIssue": bool(same_issue),
                         "text": f"{plural(len(others), 'other open case')} here, held by {', '.join(dict.fromkeys(holder(c) for c in others))}"
                                 + ("; at least one on the same issue as yours." if same_issue else ".")})
    also.sort(key=lambda a: (not a["sameIssue"], a["institution"]))
    return {"units": units, "alsoOnMine": also, "total": len(shown), "me": {"name": user["name"], "unit": user.get("unit"), "role": user["role"]}}
