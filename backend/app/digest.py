"""The daily digest (what each officer must do today and what will go late this week) and "what changed" for reports.

The digest is built from the same worklist the dashboard shows, so the e-mail and the screen can never disagree. Sending it
needs an e-mail service account (not set up in the prototype), so GET /digest returns it, ready to send, as data and plain text.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import select

from . import letters_service as R
from . import models as m
from .engine import logic as L
from .engine import precheck
from .engine.dates import add_days, short_date
from .services import plural, worklist
from .store import State

KIND_GROUP = {
    "overdue": "late", "interim": "late", "soon": "late", "task": "follow_up", "unassigned": "assign", "no_next_step": "assign", "stale": "assign",
    "match": "data", "import": "data", "stale_source": "data",
}
GROUP_TITLE = {
    "mine": "Your cases", "decide": "Decisions waiting for you", "late": "Time limits", "requests": "Replies from institutions",
    "follow_up": "Follow-ups", "collisions": "Two units acting in the same week", "assign": "Cases without an officer or next step",
    "data": "Records to check",
}


def _item(title: str, what: str, when: str = "", to: str = "/", late: bool = False) -> dict:
    """One row: who or where (title), what is due (what), by when (when). `text` is the same row for the e-mail."""
    return {"title": title, "what": what, "when": when, "late": late, "to": to, "text": f"{title}: {what}" + (f" ({when})" if when else "")}


def digest(st: State, user: dict) -> dict:
    unit = user.get("unit")
    sections: dict[str, list[dict]] = {k: [] for k in GROUP_TITLE}

    def inst_name(c: dict) -> str:
        return (st.inst_by.get(c.get("institutionId") or "") or {}).get("name") or c["recorded"]["name"]

    mine = []
    for c in st.cases:
        if L.is_active(c) and c.get("officer") == user["name"]:
            d = L.deadline_for(c, st.today)
            late = d["state"] == "overdue"
            mine.append((d["dueOn"], _item(inst_name(c), c["nextAction"] if c["nextAction"].strip() not in ("", "—") else "No next step recorded",
                                           f"{plural(-d['daysToDue'], 'day')} late" if late else f"due {short_date(d['dueOn'])}", f"/cases/{c['id']}", late)))
    sections["mine"] = [x for _, x in sorted(mine, key=lambda t: t[0])]
    for a in st.alerts():
        if st.settled(a["id"]) or not (L.can_decide(user, st.units_of(a)) or user["role"] == "senior_management"):
            continue
        due = st.due_of(a)
        sections["decide"].append(_item(st.inst_by[a["institutionId"]]["name"], f"{' and '.join(st.units_of(a))} both have open cases. Choose who leads.",
                                        f"decide by {short_date(due)}", f"/overlaps/{a['id']}", due < st.today))
    for it in worklist(st, user, limit=200)["items"]:
        key = KIND_GROUP.get(it["kind"])
        if key and not (key == "late" and any(x["to"] == it["to"] for x in sections["mine"])):
            sections[key].append(_item(it["title"], it["sub"], it["chip"], it["to"], it.get("tone") == "tape"))

    week = add_days(st.today, 7)
    for r in st.db.scalars(select(m.Demand).where(m.Demand.state == "open")).all():
        if unit and r.unit != unit:
            continue
        name = st.inst_by[r.institution_id]["name"]
        to = f"/institutions/{r.institution_id}"
        if r.due_on and r.due_on < st.today:
            sections["requests"].append(_item(name, f"No reply to {r.unit}’s letter of {short_date(r.letter_date)}", f"was due {short_date(r.due_on)}", to, True))
        elif r.due_on and r.due_on <= week:
            sections["requests"].append(_item(name, f"Reply to {r.unit}’s letter of {short_date(r.letter_date)}", f"due {short_date(r.due_on)}", to))
    for row in R.listing(st, user, None, unit, "open")["rows"]:
        for f in row["findings"]:
            if f["code"] in ("D1", "D2", "D3"):
                sections["requests"].append(_item(row["institution"], f["text"], "", f"/institutions/{row['institutionId']}"))

    horizon = add_days(st.today, 14)
    for a in st.alerts():
        if st.settled(a["id"]):
            continue
        for col in precheck.find_collisions(precheck.dated_actions([st.case(i) for i in a["caseIds"]], st.today, horizon)):
            if not unit or unit in col["units"]:
                steps = " · ".join(f"{x['unit']}: {x['what']}, {short_date(x['date'])}" for x in col["actions"])
                sections["collisions"].append(_item(st.inst_by[a["institutionId"]]["name"], steps, f"from {short_date(col['from'])}", "/calendar"))

    for k in sections:  # one row per fact
        sections[k] = list({x["text"]: x for x in sections[k]}.values())
    groups: list[dict[str, Any]] = [{"key": k, "title": GROUP_TITLE[k], "items": v, "late": sum(1 for x in v if x["late"])} for k, v in sections.items() if v]
    total = sum(len(g["items"]) for g in groups)
    late = sum(g["late"] for g in groups)
    lines = [f"Ekatra daily digest for {user['name']}" + (f", {unit}" if unit else ""), f"As of {st.today}. Prototype, synthetic data.", ""]
    if not groups:
        lines.append("Nothing needs you today.")
    for g in groups:
        lines.append(f"{g['title']} ({len(g['items'])})")
        lines += [f"  - {x['text']}" for x in g["items"][:15]]
        if len(g["items"]) > 15:
            lines.append(f"  … and {len(g['items']) - 15} more on the dashboard")
        lines.append("")
    headline = "Nothing needs you today." if not total else f"{plural(total, 'item')} need{'s' if total == 1 else ''} you today" + (f", {late} already late." if late else ".")
    return {"for": {"name": user["name"], "unit": unit, "role": user["role"]}, "date": st.today, "total": total, "late": late, "headline": headline,
            "groups": groups, "text": "\n".join(lines).strip() + "\n", "sent": False, "sendNote": "Sending needs an e-mail service account; not set up in the prototype."}


def _window(st: State, start: str, end: str) -> dict:
    """Counts for start < day <= end, all from the records."""
    def inside(d: str | None) -> bool:
        return bool(d) and start < d[:10] <= end  # type: ignore[index]

    decisions = [d for d in st.decisions if inside(d["at"])]
    demands = st.db.scalars(select(m.Demand)).all()
    return {
        "received": sum(1 for c in st.cases if inside(c["receivedOn"])),
        "disposed": sum(1 for c in st.cases if c["lifecycle"] == "disposed" and inside(c["lastActionOn"])),
        "transferred": sum(1 for c in st.cases if c["lifecycle"] == "transferred" and inside(c["lastActionOn"])),
        "decisions": sum(1 for d in decisions if d["decision"] != "request_further_review"),
        "requestsSent": sum(1 for r in demands if inside(r.letter_date)),
        "requestsAnswered": sum(1 for r in demands if inside(r.answered_on)),
        "newOverlaps": sum(1 for a in st.alerts() if inside(st.since_of(a))),
    }


WORDS = [("received", "case received", "cases received"), ("disposed", "disposed", "disposed"), ("transferred", "transferred", "transferred"),
         ("newOverlaps", "new overlap", "new overlaps"), ("decisions", "overlap decision", "overlap decisions"),
         ("requestsSent", "letter to institutions recorded", "letters to institutions recorded"), ("requestsAnswered", "reply received", "replies received")]


def changes(st: State, days: int) -> dict:
    """GET /reports/changes: this period against the one before it, same length. Transfers are counted apart from disposals."""
    days = max(1, min(days, 90))
    now = _window(st, add_days(st.today, -days), st.today)
    before = _window(st, add_days(st.today, -2 * days), add_days(st.today, -days))
    parts = []
    for k, one, many in WORDS:
        if now[k] or before[k]:
            parts.append(f"{now[k]} {one if now[k] == 1 else many} ({before[k]} before)")
    line = f"In the last {plural(days, 'day')}: " + ("; ".join(parts) if parts else "no change") + "."
    return {"days": days, "from": add_days(st.today, -days), "to": st.today, "now": now, "before": before, "line": line,
            "overdueNow": sum(1 for c in st.cases if L.is_open(c) and L.deadline_for(c, st.today)["state"] == "overdue"),
            "howCounted": "A case counts in the period when its received date, or the date of its last action for closed and transferred cases, falls in it. "
                          "An overlap counts when its newest open case arrived in the period."}
