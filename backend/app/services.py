"""Application services: every read and write the API exposes. Pure engines do the thinking; this layer loads, saves and audits.

Responses use the same camelCase shapes as the frontend types, so the dashboard needs no translation.
"""
from __future__ import annotations

import time
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import models as m
from .audit import verify_chain, write_audit
from .config import settings
from .engine import logic as L
from .engine import precheck, rules
from .engine.dates import add_days, days_between, js_round, now_at, short_date, to_date
from .engine.insights import main_issue, overlap_note, overlap_story, shared_issues
from .engine.labels import CATEGORIES, CATEGORY_LABEL, CHANNEL_LABEL, DECISION_LABEL, DISPOSAL_LABEL, RULE_SHORT, STAGE_LABEL, category_label, local_status
from .errors import ApiError
from .store import State, get_json, public_case, set_json

PAGE = 15
SETTINGS = L.SETTINGS


def who(u: dict) -> str:
    return u["name"] + (f", {u['unit']}" if u.get("unit") else "")


def plural(n: int, w: str) -> str:
    return f"{n} {w}{'' if n == 1 else 's'}"


def audit(st: State, actor: str, action: str, entity: str, details: str) -> str:
    return write_audit(st.db, now_at(st.today), actor, action, entity, details)


def hours_ago(ts: str) -> int:
    try:
        return max(0, int((datetime.now() - datetime.fromisoformat(ts)).total_seconds() // 3600))
    except ValueError:
        return 0


def sources(st: State) -> list[dict]:
    rows = st.db.scalars(select(m.SourceSync)).all()
    order = {u["code"]: i for i, u in enumerate(st.units)}
    return [{"unit": r.unit, "hoursAgo": hours_ago(r.last_import_at), "stale": hours_ago(r.last_import_at) > SETTINGS["staleHours"]}
            for r in sorted(rows, key=lambda r: order.get(r.unit, 99))]


def case_of(st: State, cid: str) -> dict:
    c = st.case_by.get(cid)
    if not c:
        raise ApiError(404, "not_found", "This case could not be found. It may have been removed.")
    return c


def inst_of(st: State, iid: str | None) -> dict | None:
    return st.inst_by.get(iid) if iid else None


def event(c: dict, type_: str, at: str, actor: str, text: str, audit_ref: str | None = None) -> None:
    e = {"type": type_, "at": at, "actor": actor, "text": text}
    if audit_ref:
        e["auditRef"] = audit_ref
    c["events"].append(e)


# ---------------------------------------------------------------- meta
def meta(st: State) -> dict:
    return {"units": st.units, "categories": CATEGORIES, "regions": sorted({i["region"] for i in st.insts}), "today": st.today, "settings": dict(SETTINGS)}


def search_index(st: State) -> dict:
    return {
        "today": st.today, "units": [u["code"] for u in st.units], "regions": sorted({i["region"] for i in st.insts}),
        "institutions": [{"id": i["id"], "name": i["name"], "permanentId": i["permanentId"]} for i in st.insts],
        "cases": [{"id": c["id"], "uid": c["uid"]} for c in st.cases],
    }


# ---------------------------------------------------------------- worklist (pending actions)
def worklist(st: State, user: dict, limit: int = 8) -> dict:
    today = st.today
    out: list[dict] = []
    read_only = user["role"] == "senior_management"

    def scope(c: dict) -> bool:
        return not user.get("unit") or c["ownerUnit"] == user["unit"]

    def label(c: dict) -> str:
        i = inst_of(st, c.get("institutionId"))
        return i["name"] if i else f"“{c['recorded']['name']}”"

    decide_count = 0
    for a in st.alerts():
        if st.settled(a["id"]):
            continue
        if not read_only and not L.can_decide(user, st.units_of(a)):
            continue
        decide_count += 1

    if user["role"] not in ("admin", "data_steward"):
        per_case: dict[str, dict] = {}

        def put(c: dict, it: dict) -> None:
            ex = per_case.get(c["id"])
            if not ex or it["urgency"] > ex["urgency"]:
                per_case[c["id"]] = it

        for c in [x for x in st.cases if L.is_open(x) and scope(x)]:
            d = L.deadline_for(c, today)
            base = {"title": label(c), "uid": c["uid"], "instId": c.get("institutionId"), "to": f"/cases/{c['id']}", "action": "Open"}
            if d["state"] == "overdue":
                late = -d["daysToDue"]
                put(c, {**base, "id": "c" + c["id"], "kind": "overdue", "chip": f"{plural(late, 'day')} overdue", "sub": f"Next action: {c['nextAction']}", "urgency": 80 + min(15, late), "tone": "tape"})
            elif d["interimDue"]:
                put(c, {**base, "id": "c" + c["id"], "kind": "interim", "chip": "Interim reply due", "sub": f"CPGRAMS interim reply, due by day {d['interimDay']}", "urgency": 78, "tone": "turmeric"})
            elif d["state"] == "approaching" and d["daysToDue"] <= 3:
                put(c, {**base, "id": "c" + c["id"], "kind": "soon", "chip": "Due today" if d["daysToDue"] == 0 else f"Due in {plural(d['daysToDue'], 'day')}", "sub": f"Next action: {c['nextAction']}", "urgency": 60 - d["daysToDue"], "tone": "turmeric"})
            elif not c.get("officer") and not read_only and user.get("unit"):
                put(c, {**base, "id": "c" + c["id"], "kind": "unassigned", "chip": "Unassigned", "sub": "Assign a dealing officer", "urgency": 40, "tone": "plain"})
            elif L.is_active(c) and c["nextAction"].strip() in ("", "—") and days_between(c["receivedOn"], today) >= SETTINGS["unassignedDays"]:
                put(c, {**base, "id": "c" + c["id"], "kind": "no_next_step", "chip": "No next step recorded", "sub": "Record what happens next", "urgency": 45, "tone": "plain"})
            elif L.is_active(c) and days_between(c["lastActionOn"], today) >= SETTINGS["staleActionDays"]:
                put(c, {**base, "id": "c" + c["id"], "kind": "stale", "chip": f"No update for {days_between(c['lastActionOn'], today)} days", "sub": f"Last action: {c['lastAction']}", "urgency": 42, "tone": "plain"})
        out.extend(per_case.values())

        for t in st.db.scalars(select(m.Task).where(m.Task.state == "open")).all():
            if user.get("unit") and t.owner_unit != user["unit"] and user["role"] != "coordinator":
                continue
            late = days_between(t.due_on, today)
            inst = inst_of(st, t.institution_id)
            out.append({"id": f"t{t.id}", "kind": "task", "title": inst["name"] if inst else "Follow-up", "uid": None, "instId": t.institution_id,
                        "chip": f"Follow-up overdue by {plural(late, 'day')}" if late > 0 else f"Follow-up due {short_date(t.due_on)}",
                        "sub": t.action, "to": f"/overlaps/{t.alert_id}", "action": "Open",
                        "urgency": 85 if late > 0 else 66, "tone": "tape" if late > 0 else "turmeric"})

    if L.can_confirm_match(user):
        for c in [x for x in st.cases if x["matchState"] in ("pending_review", "unresolved")]:
            out.append({"id": "m" + c["id"], "kind": "match", "title": f"“{c['recorded']['name']}”", "uid": c["uid"], "instId": None,
                        "chip": "Institution not identified", "sub": "Confirm the institution name", "to": "/matching", "action": "Check name", "urgency": 65, "tone": "turmeric"})
    if user["role"] == "data_steward":
        for b in st.db.scalars(select(m.ImportBatch)).all():
            if b.rejected > 0:
                out.append({"id": "b" + b.id, "kind": "import", "title": b.file_name, "uid": None, "instId": None, "chip": f"{plural(b.rejected, 'row')} not saved",
                            "sub": "Each row has a suggested fix", "to": f"/import/{b.id}", "action": "Fix rows", "urgency": 62, "tone": "turmeric"})
    for s in sources(st):
        if s["stale"] and (not user.get("unit") or s["unit"] == user["unit"] or user["role"] in ("coordinator", "data_steward")):
            out.append({"id": "s" + s["unit"], "kind": "stale_source", "title": f"{s['unit']} has not sent data for {max(1, s['hoursAgo'] // 24)} days", "uid": None, "instId": None,
                        "chip": "Data may be behind", "sub": "Ask the unit to send an update", "to": f"/cases?unit={s['unit']}", "action": "See cases", "urgency": 55, "tone": "turmeric"})
    out.sort(key=lambda i: -i["urgency"])
    return {"items": out[:limit], "total": len(out), "decideCount": decide_count}


# ---------------------------------------------------------------- dashboard
def summary(st: State, user: dict) -> dict:
    """Every headline number, counted once. Dashboards, banners, nav badges and reports read these, so no two screens can disagree.
    Scopes are explicit: `all` is every unit; `mine` is the signed-in user's unit (everything, for roles without a unit)."""
    today = st.today
    live = st.alerts()
    awaiting = [a for a in live if not st.settled(a["id"])]
    unit = user.get("unit")
    mine = [a for a in awaiting if not unit or unit in st.units_of(a)]
    open_ = [c for c in st.cases if L.is_open(c)]
    clock = {c["id"]: L.deadline_for(c, today) for c in open_}
    own = [c for c in open_ if not unit or c["ownerUnit"] == unit]
    s = L.summarise(st.cases, live, [d for d in st.decisions if st.settled(d["alertId"])], st.insts, st.units, today)
    return {
        "asOf": last_sweep_at(st.db, today), "unit": unit,
        "overlaps": {
            "all": len(live), "awaiting": len(awaiting), "decided": len(live) - len(awaiting), "mine": len(mine),
            "needMyDecision": sum(1 for a in awaiting if L.can_decide(user, st.units_of(a))),
            "pastDue": sum(1 for a in awaiting if days_between(st.due_of(a), today) > 0),
            # Counted from the audit log: warnings an officer saw and went ahead against.
            "wentAhead": st.db.scalar(select(func.count()).select_from(m.AuditEvent).where(m.AuditEvent.details.like(f"%[{WENT_AHEAD} %"))) or 0,
        },
        "cases": {k: s[k] for k in ("total", "pending", "underProcess", "transferred", "escalated", "disposed", "overdue")} | {"open": len(open_)},
        "mine": {
            "open": len(own),
            "overdue": sum(1 for c in own if clock[c["id"]]["state"] == "overdue"),
            "approaching": sum(1 for c in own if clock[c["id"]]["state"] == "approaching"),
            "interimDue": sum(1 for c in own if clock[c["id"]]["interimDue"]),
            "waitingOnOthers": sum(1 for c in own if c["lifecycle"] in ("awaiting_party", "inspection_hearing")),
            "unassigned": sum(1 for c in own if not c.get("officer")),
        },
        "matching": {"toConfirm": sum(1 for c in st.cases if c["matchState"] in ("pending_review", "unresolved"))},
        "sources": {"total": len(sources(st)), "stale": [{"unit": x["unit"], "hoursAgo": x["hoursAgo"]} for x in sources(st) if x["stale"]]},
        "outcomes": outcomes(st),
    }


def outcomes(st: State) -> dict:
    """What AICTE cares about, not what the software did: CPGRAMS cases closed inside the verified 21 days, and overlaps decided in time."""
    today = st.today
    cp = [c for c in st.cases if c["channel"] == "CPGRAMS" and c["lifecycle"] == "disposed"]
    on_time = sum(1 for c in cp if days_between(c["receivedOn"], c["lastActionOn"]) <= SETTINGS["cpgramsDays"])
    known = {a["id"]: a for a in st.known_alerts()}
    decided = [(known[d["alertId"]], d) for d in st.decisions if d["decision"] != "request_further_review" and d["alertId"] in known]
    in_target = sum(1 for a, d in decided if days_between(st.since_of(a), d["at"][:10]) <= SETTINGS["coordDueDays"])
    return {
        "cpgrams": {"closed": len(cp), "onTime": on_time, "limitDays": SETTINGS["cpgramsDays"]},
        "overlaps": {"decided": len(decided), "inTarget": in_target, "targetDays": SETTINGS["coordDueDays"]},
        "asOf": today,
    }


def dashboard(st: State, f: dict) -> dict:
    today = st.today
    scoped = L.filter_cases(st.cases, f, st.insts, st.units, today)
    ids = {c["id"] for c in scoped}
    al = [a for a in st.alerts() if any(i in ids for i in a["caseIds"])]
    open_ = [c for c in scoped if L.is_open(c)]
    settled_decisions = [d for d in st.decisions if st.settled(d["alertId"])]
    s = L.summarise(scoped, al, settled_decisions, st.insts, st.units, today)

    def week_of(d: str) -> int:
        return days_between(d, today) // 7

    weekly: list[dict[str, Any]] = [{"week": 25 - i, "label": add_days(today, -(25 - i) * 7), "received": 0, "disposed": 0, "transferred": 0} for i in range(26)]
    for c in scoped:
        r = week_of(c["receivedOn"])
        if 0 <= r < 26:
            weekly[25 - r]["received"] += 1
        w = week_of(c["lastActionOn"])
        if 0 <= w < 26 and c["lifecycle"] == "disposed":
            weekly[25 - w]["disposed"] += 1
        if 0 <= w < 26 and c["lifecycle"] == "transferred":
            weekly[25 - w]["transferred"] += 1
    ages = [days_between(c["receivedOn"], today) for c in scoped]
    decided = [d for d in st.decisions if d["decision"] != "request_further_review"]
    unit_name = {u["code"]: u["name"] for u in st.units}
    return {
        **s,
        "weekly": weekly,
        "newThisWeek": sum(1 for a in ages if a < 7),
        "newLastWeek": sum(1 for a in ages if 7 <= a < 14),
        "disposed30": sum(1 for c in scoped if c["lifecycle"] == "disposed" and days_between(c["lastActionOn"], today) < 30),
        "dueSoon": sum(1 for c in open_ if L.deadline_for(c, today)["state"] == "approaching"),
        "totalCases": len(scoped),
        "pipeline": [{"stage": stg, "count": sum(1 for c in scoped if c["lifecycle"] == stg)} for stg in ["received", "under_examination", "awaiting_party", "inspection_hearing", "escalated"]],
        "workloadAgeing": [{
            "unit": w["unit"], "name": unit_name.get(w["unit"], w["unit"]), "open": w["open"],
            "overdue": sum(1 for c in open_ if c["ownerUnit"] == w["unit"] and L.deadline_for(c, today)["state"] == "overdue"),
            "buckets": [sum(1 for c in open_ if c["ownerUnit"] == w["unit"] and L.age_bucket(days_between(c["receivedOn"], today)) == i) for i in range(len(L.AGEING))],
        } for w in s["workload"]],
        "coordination": {
            "byType": [{"type": t, "count": sum(1 for d in decided if d["decision"] == t)} for t in DECISION_LABEL],
            "rules": L.rule_performance(st.known_alerts(), st.decisions),
        },
        "dataAsOf": last_sweep_at(st.db, today),
        "sources": sources(st),
    }


def last_sweep_at(db: Session, today: str) -> str:
    return get_json(db, "last_sweep_at", f"{today}T00:00")


# ---------------------------------------------------------------- cases
def cases_list(st: State, f: dict) -> dict:
    lst = L.filter_cases(st.cases, f, st.insts, st.units, st.today)
    sort = f.get("sort") or "-receivedOn"
    if sort == "due":  # most urgent first: the least time left on the clock, closed cases last
        lst = sorted(lst, key=lambda c: (L.deadline_for(c, st.today)["state"] == "closed", L.deadline_for(c, st.today)["daysToDue"]))
    else:
        key = sort.lstrip("-")
        key = key if key in ("receivedOn", "uid") else "receivedOn"
        lst = sorted(lst, key=lambda c: c[key], reverse=sort.startswith("-"))
    page = int(f.get("page") or 1)
    size = max(1, min(200, int(f.get("size") or PAGE)))
    items = lst[(page - 1) * size: page * size]
    return {"total": len(lst), "page": page, "pageSize": size,
            "items": [{**public_case(c), "deadline": L.deadline_for(c, st.today), "institution": inst_of(st, c.get("institutionId")), "alertInfo": st.alert_info_for(c["id"]), "replies": []} for c in items]}


def export_cases(st: State, f: dict, user: dict) -> dict:
    lst = L.filter_cases(st.cases, f, st.insts, st.units, st.today)
    rows: list[list] = [["Case", "Unit", "Institution", "Permanent ID", "Category", "Received", "Stage", "Timeline"]]
    for c in lst:
        d = L.deadline_for(c, st.today)
        i = inst_of(st, c.get("institutionId"))
        tl = "Closed" if d["state"] == "closed" else f"{-d['daysToDue']} days overdue" if d["state"] == "overdue" else f"{d['daysToDue']} days left"
        rows.append([c["uid"], c["ownerUnit"], i["name"] if i else c["recorded"]["name"], i["permanentId"] if i else "", category_label(c["category"]), c["receivedOn"], STAGE_LABEL[c["lifecycle"]], tl])
    ref = audit(st, who(user), "Report exported", "case list", f"{len(lst)} cases")
    return export_text(st, "Case list", rows, user, ref)


def case_detail(st: State, cid: str, user: dict | None) -> dict:
    c = case_of(st, cid)
    linked = []
    for d in st.decisions:
        if d["decision"] not in ("related", "duplicate", "designate_lead_unit"):
            continue
        a = next((x for x in st.known_alerts() if x["id"] == d["alertId"]), None)
        if a and cid in a["caseIds"]:
            for rid in a["caseIds"]:
                if rid != cid and rid in st.case_by:
                    r = st.case(rid)
                    linked.append({"id": r["id"], "uid": r["uid"], "ownerUnit": r["ownerUnit"], "localStatus": r["localStatus"], "how": d["decision"], "lead": d["leadUnit"]})
    dl = L.deadline_for(c, st.today)
    info = st.alert_info_for(cid)
    case_decisions = [d for a in info for d in st.history_of(a["id"])]
    return {
        **public_case(c), "deadline": dl, "escalation": L.escalation_for(dl), "institution": inst_of(st, c.get("institutionId")),
        "lanes": st.lanes_for(c["institutionId"]) if c.get("institutionId") else [], "linked": linked, "alertInfo": info, "replies": [],
        "closureChecks": L.closure_checks(c, case_decisions), "canAct": bool(user and L.can_act_on_case(user, c)),
        "alertsForCase": [{"id": a["id"], "severity": a["severity"], "rules": [r["code"] for r in a["rules"]], "decided": st.settled(a["id"])} for a in st.alerts() if cid in a["caseIds"]],
        "units": [u["code"] for u in st.units if u["code"] != c["ownerUnit"]],
    }


def sensitive(st: State, cid: str, user: dict) -> dict:
    c = case_of(st, cid)
    ok = user["role"] in ("dealing_officer", "nodal_officer") and user.get("unit") == c["ownerUnit"]
    if not ok:
        raise ApiError(403, "forbidden", f"Only officers of {c['ownerUnit']} can see who filed this complaint.")
    ref = audit(st, who(user), "Complainant details viewed", c["uid"], "Restricted details opened")
    return {**c["sensitive"], "auditRef": ref}


def _need_act(st: State, user: dict, c: dict, what: str) -> None:
    if not L.can_act_on_case(user, c):
        raise ApiError(403, "forbidden", f"Only officers of {c['ownerUnit']} can {what}.")


WENT_AHEAD = "Went ahead on a"


def _went_ahead(st: State, c: dict, action: str, target_stage: str | None = None) -> str:
    """The pre-action check, run on the server at the moment of the action. Green adds nothing. On amber or red the audit entry says the
    officer went ahead, and what the warning was, so a warning that was ignored can be found later. It advises; it never blocks."""
    if not c.get("institutionId"):
        return ""
    r = precheck.pre_action_check(action, c["ownerUnit"], st.lanes_for(c["institutionId"]), c["id"], c["category"], target_stage)
    return "" if r["light"] == "green" else f" [{WENT_AHEAD} {r['light']} check: {r['headline']}]"


def assign_to_me(st: State, cid: str, user: dict) -> bool:
    c = case_of(st, cid)
    _need_act(st, user, c, "pick up this case")
    c["officer"] = user["name"]
    event(c, "action_recorded", st.today, who(user), f"Picked up by {user['name']}", audit(st, who(user), "Action recorded", c["uid"], "Picked up the case"))
    st.save_case(c)
    return True


def record_action(st: State, cid: str, text: str, nxt: str, user: dict) -> bool:
    c = case_of(st, cid)
    _need_act(st, user, c, "record actions on this case")
    if not text.strip():
        raise ApiError(422, "validation_error", "Say what was done.")
    c["lastAction"], c["lastActionOn"] = text.strip(), st.today
    if nxt.strip():
        c["nextAction"] = nxt.strip()
    event(c, "action_recorded", st.today, who(user), text.strip(), audit(st, who(user), "Action recorded", c["uid"], text.strip()))
    st.save_case(c)
    return True


def change_stage(st: State, cid: str, stage: str, reason: str, user: dict) -> bool:
    c = case_of(st, cid)
    _need_act(st, user, c, "change this case")
    if stage in ("disposed", "transferred") or stage not in STAGE_LABEL:
        raise ApiError(422, "validation_error", "Use Close or Transfer for that.")
    if not reason.strip():
        raise ApiError(422, "validation_error", "Add a reason.")
    frm = c["lifecycle"]
    c["lifecycle"], c["localStatus"], c["lastAction"], c["lastActionOn"] = stage, local_status(c["ownerUnit"], stage), f"Moved to “{STAGE_LABEL[stage]}”", st.today
    event(c, "status_changed", st.today, who(user), f"{STAGE_LABEL[frm]} → {STAGE_LABEL[stage]}: {reason.strip()}", audit(st, who(user), "Stage changed", c["uid"], f"{STAGE_LABEL[frm]} → {STAGE_LABEL[stage]}{_went_ahead(st, c, 'stage', stage)}"))
    st.save_case(c)
    return True


def schedule_step(st: State, cid: str, on: str | None, what: str, user: dict) -> bool:
    """Book (or clear) the next dated step of a case: a hearing, a visit or a reply date. It appears on the calendar and in the clash checks."""
    import re
    c = case_of(st, cid)
    _need_act(st, user, c, "book a date on this case")
    if not L.is_open(c) or c["lifecycle"] == "transferred":
        raise ApiError(422, "validation_error", "This case is closed or transferred, so no date can be booked.")
    if not on:
        c["scheduled"] = None
        event(c, "action_recorded", st.today, who(user), "Booked date removed", audit(st, who(user), "Date cleared", c["uid"], "The booked date was removed"))
        st.save_case(c)
        return True
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", on):
        raise ApiError(422, "validation_error", "Write the date as YYYY-MM-DD.")
    try:
        to_date(on)
    except ValueError:
        raise ApiError(422, "validation_error", "That is not a real date.") from None
    if on < st.today:
        raise ApiError(422, "validation_error", "The date has already passed. Choose today or a later date.")
    if not what.strip() or len(what.strip()) > 80:
        raise ApiError(422, "validation_error", "Say what happens on that date, in under 80 characters.")
    c["scheduled"] = {"on": on, "what": what.strip()}
    c["nextAction"] = f"{what.strip()} on {short_date(on)}"
    event(c, "action_recorded", st.today, who(user), f"Booked: {what.strip()} on {short_date(on)}", audit(st, who(user), "Date booked", c["uid"], f"{what.strip()} on {on}"))
    st.save_case(c)
    return True


def transfer(st: State, cid: str, to: str, reason: str, user: dict) -> bool:
    c = case_of(st, cid)
    _need_act(st, user, c, "transfer this case")
    if not to or to == c["ownerUnit"] or to not in {u["code"] for u in st.units}:
        raise ApiError(422, "validation_error", "Choose the unit to send it to.")
    if not reason.strip():
        raise ApiError(422, "validation_error", "Add a reason.")
    c["lifecycle"], c["localStatus"], c["lastAction"], c["lastActionOn"], c["nextAction"] = "transferred", local_status(c["ownerUnit"], "transferred"), f"Transferred to {to}", st.today, "—"
    event(c, "transferred", st.today, who(user), f"Transferred to {to}: {reason.strip()}", audit(st, who(user), "Case transferred", c["uid"], f"to {to}{_went_ahead(st, c, 'transfer')}"))
    st.save_case(c)
    return True


def dispose(st: State, cid: str, type_: str, reason: str, user: dict) -> bool:
    c = case_of(st, cid)
    _need_act(st, user, c, "close this case")
    if type_ not in DISPOSAL_LABEL:
        raise ApiError(422, "validation_error", "Choose how the case was closed.")
    if not reason.strip():
        raise ApiError(422, "validation_error", "Say why the case is being closed.")
    c["lifecycle"], c["disposalType"], c["localStatus"], c["lastAction"], c["lastActionOn"], c["nextAction"] = "disposed", type_, local_status(c["ownerUnit"], "disposed"), f"Closed: {DISPOSAL_LABEL[type_]}", st.today, "—"
    event(c, "disposed", st.today, who(user), f"Closed ({DISPOSAL_LABEL[type_]}): {reason.strip()}", audit(st, who(user), "Case closed", c["uid"], f"{DISPOSAL_LABEL[type_]}{_went_ahead(st, c, 'close')}"))
    st.save_case(c)
    return True


# ---------------------------------------------------------------- arrival pipeline (create / import / demo)
def _next_case_no(st: State) -> int:
    return max((int(c["id"][1:]) for c in st.cases), default=0) + 1


def arrival(st: State, d: dict, actor: str, how: str) -> dict:
    """What runs on every incoming case: register, find the institution, check overlaps, set the clock, tell the right people."""
    today = st.today
    t0 = time.perf_counter()
    lap = lambda: max(1, round((time.perf_counter() - t0) * 1000))  # noqa: E731
    before = {a["id"] for a in st.alerts()}
    n = _next_case_no(st)
    uid = f"CC-{to_date(today).year}-{n:06d}"
    steps = [{"key": "receive", "title": "Received and checked", "detail": f"{uid}, from {'CPGRAMS' if d['channel'] == 'CPGRAMS' else d['unit']}", "outcome": "auto", "ms": lap()}]

    res = L.resolve_institution(d["recorded"], st.insts)
    inst = inst_of(st, res.get("institutionId"))
    if inst:
        steps.append({"key": "match", "title": "Institution found", "detail": f"{inst['name']}, by {'Permanent ID' if res['method'] == 'T1_exact' else 'another verified ID'}", "outcome": "auto", "ms": lap()})
    else:
        k = len(res["suggestions"])
        steps.append({"key": "match", "title": "Institution needs a person", "detail": f"{k} likely {'match' if k == 1 else 'matches'}. A coordinator chooses." if k else "No close match found.", "outcome": "person", "ms": lap()})

    lifecycle = d.get("lifecycle") or "received"
    case_id = f"c{n}"
    c = {
        "id": case_id, "uid": uid, "sourceUnit": d["unit"], "ownerUnit": d["unit"], "sourceRef": d.get("sourceRef") or f"{d['unit']}/{to_date(today).year}/{n}",
        "sourceComplaintRef": d.get("complaintRef") or None, "channel": d["channel"], "receivedOn": d["receivedOn"], "category": d["category"],
        "summary": d.get("summary") or "No summary given.", "localStatus": d.get("localStatus") or local_status(d["unit"], lifecycle), "lifecycle": lifecycle, "officer": None,
        "lastAction": "Registered", "lastActionOn": today, "nextAction": "Examine and respond", "institutionId": inst["id"] if inst else None,
        "recorded": d["recorded"], "matchState": res["state"], "matchMethod": res.get("method"), "matchEvidence": res["evidence"],
        "sensitive": {"complainant": d.get("complainant") or "Not given", "narrative": d.get("narrative") or "Not given"},
        "events": [], "disposalType": None, "documents": [], "scheduled": d.get("scheduled"),
    }
    t = "imported" if how == "import" else "created"
    event(c, t, today, "system" if how == "demo" else actor,
          f"Imported from a {d['unit']} file" if how == "import" else f"Added by {actor}" if how == "form" else "Received and registered automatically",
          audit(st, actor, "Case imported" if how == "import" else "Case registered", uid, f"{d['unit']}, {d['channel']}"))
    event(c, "match_resolved", today, "system",
          f"Institution found automatically ({'Permanent ID' if res.get('method') == 'T1_exact' else 'another verified ID'})" if inst else "Institution could not be found automatically",
          audit(st, "Ekatra (automatic)", "Institution matched", uid, inst["name"] if inst else "Needs a person"))
    row = m.Case(id=case_id, uid=uid, source_unit=c["sourceUnit"], owner_unit=c["ownerUnit"], source_ref=c["sourceRef"], source_complaint_ref=c["sourceComplaintRef"],
                 channel=c["channel"], received_on=c["receivedOn"], category=c["category"], summary=c["summary"], local_status=c["localStatus"], lifecycle=lifecycle,
                 officer=None, last_action=c["lastAction"], last_action_on=today, next_action=c["nextAction"], institution_id=c["institutionId"], recorded=c["recorded"],
                 match_state=c["matchState"], match_method=c["matchMethod"], match_evidence=c["matchEvidence"], sensitive=c["sensitive"], events=c["events"], documents=[], scheduled=c.get("scheduled"))
    st.db.add(row)
    st.db.flush()
    st.cases.append(c)
    st._case_rows[case_id] = row
    st.invalidate()

    fresh = next((a for a in st.alerts() if a["id"] not in before and case_id in a["caseIds"]), None)
    units = st.units_of(fresh) if fresh else []
    if not inst:
        steps.append({"key": "overlap", "title": "Overlap check waits", "detail": "It runs once the institution is confirmed.", "outcome": "person", "ms": lap()})
    elif fresh:
        steps.append({"key": "overlap", "title": "Possible overlap found", "detail": f"{' and '.join(units)} are working on {inst['name']}.", "outcome": "auto", "ms": lap()})
    else:
        steps.append({"key": "overlap", "title": "No overlap", "detail": "No other unit is working on this institution.", "outcome": "auto", "ms": lap()})
    dl = L.deadline_for(c, today)
    steps.append({"key": "deadline", "title": "Clock set", "detail": f"Due {short_date(dl['dueOn'])}{', interim reply by day ' + str(dl['interimDay']) if dl['interimDay'] else ' (prototype time limit)'}.", "outcome": "auto", "ms": lap()})
    if fresh:
        steps.append({"key": "notify", "title": "People told", "detail": f"Nodal officers of {' and '.join(units)} have a review waiting.", "outcome": "auto", "ms": lap()})
    elif not inst:
        steps.append({"key": "notify", "title": "Sent to institution matching", "detail": "It waits in the coordinator’s list.", "outcome": "person", "ms": lap()})
    else:
        steps.append({"key": "notify", "title": f"Added to {d['unit']}’s list", "detail": "Waiting for an officer to pick it up.", "outcome": "auto", "ms": lap()})
    return {"caseId": case_id, "uid": uid, "steps": steps, "overlapId": fresh["id"] if fresh else None, "matched": bool(inst)}


def check_new_case(st: State, d: dict) -> dict:
    """'Already known?': shown live while an officer types a new case. Nothing is saved."""
    rec = {"name": d.get("name") or "", "district": d.get("district") or None, "permanentId": d.get("permanentId") or None, "currentId": d.get("currentId") or None}
    res = L.resolve_institution(rec, st.insts) if (rec["name"] or rec["permanentId"] or rec["currentId"]) else None
    inst = inst_of(st, res.get("institutionId")) if res else None
    ref = (d.get("complaintRef") or "").strip()
    return {
        "institution": inst, "method": res.get("method") if res else None,
        "suggestions": [] if inst else [{**s, "institution": st.inst_by[s["institutionId"]]} for s in (res["suggestions"] if res else [])],
        "openElsewhere": [{"id": c["id"], "uid": c["uid"], "unit": c["ownerUnit"], "stage": c["lifecycle"], "category": c["category"]} for c in st.cases if inst and c.get("institutionId") == inst["id"] and L.is_active(c)],
        "sameRef": [{"id": c["id"], "uid": c["uid"], "unit": c["ownerUnit"], "stage": c["lifecycle"]} for c in st.cases if ref and c.get("sourceComplaintRef") and L.normalise_id(c["sourceComplaintRef"]) == L.normalise_id(ref)],
    }


def create_case(st: State, d: dict, user: dict) -> dict:
    if not user.get("unit") or user["role"] not in ("dealing_officer", "nodal_officer"):
        raise ApiError(403, "forbidden", "Only officers of a unit can add cases for that unit.")
    rec = d["recorded"]
    if not (rec.get("name") or "").strip() and not rec.get("permanentId"):
        raise ApiError(422, "validation_error", "Give the institution’s name or Permanent ID.")
    if not d.get("receivedOn") or d["receivedOn"] > st.today:
        raise ApiError(422, "validation_error", "The received date cannot be in the future.")
    if d["channel"] not in CHANNEL_LABEL or d["category"] not in CATEGORY_LABEL:
        raise ApiError(422, "validation_error", "Choose a known source and category.")
    return arrival(st, {**d, "unit": user["unit"]}, who(user), "form")


DEMO_SCENARIOS: dict[str, dict[str, Any] | None] = {
    "current_id": {"name": "Sahyadri Inst of Tech, Pune", "district": "Pune", "currentId": "1 2201455"},
    "permanent_id": None,  # built from the register below
    "name_only": {"name": "Malnad Polytechnic", "district": "Bengaluru"},
}


def ingest_demo(st: State, scenario: str, user: dict) -> dict:
    """Runs a demo CPGRAMS case through the arrival steps. The case is kept, so every screen updates."""
    if scenario == "permanent_id":
        pid = next(i["permanentId"] for i in st.insts if i["name"] == "Hooghly Polytechnic")
        rec: dict[str, Any] = {"name": "Hoogly Polytechnic", "permanentId": f" {pid.replace('-', ' ')} "}
    elif scenario in DEMO_SCENARIOS:
        rec = DEMO_SCENARIOS[scenario] or {}
    else:
        raise ApiError(422, "validation_error", "Unknown demo scenario.")
    n = _next_case_no(st)
    return arrival(st, {"unit": "PGRC", "channel": "CPGRAMS", "complaintRef": f"DARPG/E/{to_date(st.today).year}/{n:04d}", "category": "norm_violation",
                        "summary": "Demo case created by the automation preview.", "receivedOn": st.today, "recorded": rec}, "Ekatra (demo)", "demo")


# ---------------------------------------------------------------- imports
IMPORT_COLUMNS = [
    ("source_reference", "Your reference", True, "The case number in your unit, e.g. PGRC/2026/1234"),
    ("received_on", "Received on", True, "Date as YYYY-MM-DD, e.g. 2026-10-01"),
    ("channel", "How it came in", True, "CPGRAMS, CSS, EMAIL_POST, APH_COMPLAINT, VIP_MINISTRY, COURT, RTI or OTHER"),
    ("category", "Category", True, "e.g. norm_violation, fee_refund, faculty_salary"),
    ("local_status", "Status in your unit", True, "Your own wording, e.g. Under scrutiny"),
    ("institution_name", "Institution name", True, "As written in your file"),
    ("permanent_id", "Permanent ID", False, "Best way to find the institution, e.g. 1-2201234"),
    ("current_id", "Current ID", False, "Used if there is no Permanent ID"),
    ("complaint_ref", "Complaint number", False, "e.g. the CPGRAMS registration number"),
    ("summary", "Short summary", False, "One line, no personal details"),
    ("next_step_on", "Next step on", False, "Date of the next hearing, visit or reply deadline as YYYY-MM-DD. It then appears on the calendar. Fill in with Next step"),
    ("next_step", "Next step", False, "What happens on that date, e.g. SHC hearing. Fill in with Next step on"),
]
MAX_IMPORT_ROWS = 2000


def status_map(db: Session, unit: str) -> dict[str, str]:
    return {r.word: r.stage for r in db.scalars(select(m.StatusMapping).where(m.StatusMapping.unit == unit)).all()}


def check_row(data: dict, row: int, today: str, existing: set[str], mapping: dict[str, str]) -> dict:
    import re
    problems: list[dict] = []

    def p(field: str, problem: str, fix: str) -> None:
        problems.append({"row": row, "field": field, "problem": problem, "fix": fix})

    for key, label, required, hint in IMPORT_COLUMNS:
        if required and not (data.get(key) or "").strip():
            p(label, "This is empty.", f"Fill it in. {hint}.")
    d = (data.get("received_on") or "").strip()
    if d:
        try:
            ok = bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", d)) and bool(to_date(d))
        except ValueError:
            ok = False
        if not ok:
            p("Received on", f"“{d}” is not a date we can read.", "Write it as YYYY-MM-DD, e.g. 2026-10-01.")
        elif d > today:
            p("Received on", "This date is in the future.", "Check the date. A case cannot arrive after today.")
    ch = (data.get("channel") or "").strip()
    if ch and ch.upper() not in CHANNEL_LABEL:
        p("How it came in", f"“{ch}” is not a known source.", "Use one of: CPGRAMS, CSS, EMAIL_POST, APH_COMPLAINT, VIP_MINISTRY, COURT, RTI, OTHER.")
    cat = (data.get("category") or "").strip()
    if cat and cat not in CATEGORY_LABEL:
        p("Category", f"“{cat}” is not a known category.", "Use a category code from the template, e.g. fee_refund.")
    pid = (data.get("permanent_id") or "").strip()
    if pid and not re.fullmatch(r"1-\d{5,12}", re.sub(r"\s+", "-", pid)):
        p("Permanent ID", f"“{pid}” does not look like a Permanent ID.", "It starts with 1- and then 5 to 12 digits, e.g. 1-2201234. Leave it empty if unknown.")
    ls = (data.get("local_status") or "").strip()
    if ls and ls.lower() not in mapping:
        p("Status in your unit", f"We do not know what “{ls}” means yet.", "Tell us once in the next step and we will remember it.")
    ns_on, ns_what = (data.get("next_step_on") or "").strip(), (data.get("next_step") or "").strip()
    if ns_on or ns_what:
        if not (ns_on and ns_what):
            p("Next step" if ns_on else "Next step on", "Give both the date and what happens on it, or leave both empty.", "Fill in Next step on and Next step together.")
        else:
            try:
                ok = bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", ns_on)) and bool(to_date(ns_on))
            except ValueError:
                ok = False
            if not ok:
                p("Next step on", f"“{ns_on}” is not a date we can read.", "Write it as YYYY-MM-DD, e.g. 2026-11-02.")
            elif ns_on < today:
                p("Next step on", "This date has already passed.", "Give today or a later date. Past events are not put on the calendar.")
            if len(ns_what) > 80:
                p("Next step", "This is too long.", "Keep it under 80 characters, e.g. SHC hearing.")
    outcome = "reject" if problems else "update" if (data.get("source_reference") or "") in existing else "new"
    return {"row": row, "data": data, "outcome": outcome, "problems": problems, "notes": []}


def _annotate(st: State, unit: str, checked: list[dict]) -> list[dict]:
    """Add what a person needs to know about each row before saving: a repeat inside the file, an institution Ekatra will or will not recognise, and a
    complaint number another unit already holds. Nothing here changes a row's outcome except a repeat of the same reference inside one file."""
    seen: dict[str, int] = {}
    for r in checked:
        ref = (r["data"].get("source_reference") or "").strip()
        if ref and ref in seen and r["outcome"] != "reject":
            r["problems"].append({"row": r["row"], "field": "Your reference", "problem": f"The same reference appears on row {seen[ref]} of this file.", "fix": "Keep one row for each case. Delete or correct the repeat."})
            r["outcome"] = "reject"
        elif ref:
            seen.setdefault(ref, r["row"])
        if r["outcome"] == "reject":
            continue
        d = r["data"]
        rec = {"name": d.get("institution_name") or "", "district": None, "permanentId": (d.get("permanent_id") or "").strip() or None, "currentId": (d.get("current_id") or "").strip() or None}
        res = L.resolve_institution(rec, st.insts)
        inst = inst_of(st, res.get("institutionId"))
        if inst:
            r["notes"].append(f"Will be linked to {inst['name']} ({'Permanent ID' if res.get('method') == 'T1_exact' else 'another verified ID'}).")
        else:
            r["notes"].append("The institution is found by name only, so a coordinator will be asked to confirm it before overlap checks can run.")
        cref = (d.get("complaint_ref") or "").strip()
        if cref:
            held = [c for c in st.cases if c.get("sourceComplaintRef") and L.normalise_id(c["sourceComplaintRef"]) == L.normalise_id(cref) and c["ownerUnit"] != unit and L.is_open(c)]
            for c in held[:2]:
                r["notes"].append(f"The same complaint number is already on {c['uid']} in {c['ownerUnit']}. Ekatra will show the two together as a clash.")
    return checked


def import_check(st: State, unit: str, rows: list[dict]) -> dict:
    if len(rows) > MAX_IMPORT_ROWS:
        raise ApiError(413, "too_large", f"A file can have at most {MAX_IMPORT_ROWS} rows. Split it and import in parts.")
    existing = {c["sourceRef"] for c in st.cases if c["sourceUnit"] == unit}
    mp = status_map(st.db, unit)
    checked = _annotate(st, unit, [check_row(r, i + 2, st.today, existing, mp) for i, r in enumerate(rows)])
    unknown = list(dict.fromkeys(r["local_status"].strip() for r in rows if (r.get("local_status") or "").strip() and r["local_status"].strip().lower() not in mp))
    return {"rows": checked, "unknownStatuses": unknown}


def save_status_meaning(st: State, unit: str, word: str, stage: str, user: dict) -> bool:
    if stage not in STAGE_LABEL:
        raise ApiError(422, "validation_error", "Choose a stage.")
    w = word.strip().lower()
    row = st.db.get(m.StatusMapping, (unit, w))
    if row:
        row.stage = stage
    else:
        st.db.add(m.StatusMapping(unit=unit, word=w, stage=stage))
    audit(st, who(user), "Status meaning saved", unit, f"“{word}” means {STAGE_LABEL[stage]}")
    return True


def import_commit(st: State, unit: str, file_name: str, rows: list[dict], user: dict) -> dict:
    """Valid rows go through the same pipeline as a new case; invalid rows are quarantined with a reason. Re-importing never duplicates."""
    if len(rows) > MAX_IMPORT_ROWS:
        raise ApiError(413, "too_large", f"A file can have at most {MAX_IMPORT_ROWS} rows. Split it and import in parts.")
    mp = status_map(st.db, unit)
    existing = {c["sourceRef"]: c for c in st.cases if c["sourceUnit"] == unit}
    before = {a["id"] for a in st.alerts()}
    last_id = st.db.scalars(select(m.ImportBatch.id).order_by(m.ImportBatch.id.desc())).first() or "b200"
    bid = f"b{int(last_id[1:]) + 1}" if last_id[1:].isdigit() else f"b{int(time.time())}"
    b: dict[str, Any] = {"id": bid, "unit": unit, "fileName": file_name, "by": who(user), "at": now_at(st.today), "rows": len(rows), "created": 0, "updated": 0, "rejected": 0, "rejects": [],
         "autoMatched": 0, "namesToCheck": 0, "newOverlaps": 0, "caseIds": []}
    checked = _annotate(st, unit, [check_row(r, i + 2, st.today, set(existing), mp) for i, r in enumerate(rows)])
    for r, chk in zip(rows, checked, strict=True):
        if chk["outcome"] == "reject":
            b["rejected"] += 1
            b["rejects"].extend(chk["problems"])
            continue
        stage = mp[r["local_status"].strip().lower()]
        if chk["outcome"] == "update":
            c = existing[r["source_reference"]]
            c["localStatus"] = r["local_status"]
            if c["lifecycle"] != stage:
                event(c, "status_changed", st.today, who(user), f"Updated by import: {STAGE_LABEL[c['lifecycle']]} → {STAGE_LABEL[stage]}")
                c["lifecycle"] = stage
            if r.get("summary"):
                c["summary"] = r["summary"]
            if (r.get("next_step_on") or "").strip():
                c["scheduled"] = {"on": r["next_step_on"].strip(), "what": r["next_step"].strip()}
            st.save_case(c)
            b["updated"] += 1
            b["caseIds"].append(c["id"])
            continue
        res = arrival(st, {"unit": unit, "channel": r["channel"].upper(), "sourceRef": r["source_reference"], "complaintRef": r.get("complaint_ref"), "category": r["category"],
                           "summary": r.get("summary") or "", "receivedOn": r["received_on"], "localStatus": r["local_status"], "lifecycle": stage,
                           "scheduled": {"on": r["next_step_on"].strip(), "what": r["next_step"].strip()} if (r.get("next_step_on") or "").strip() else None,
                           "recorded": {"name": r["institution_name"], "permanentId": r.get("permanent_id") or None, "currentId": r.get("current_id") or None}}, who(user), "import")
        existing[r["source_reference"]] = st.case(res["caseId"])
        b["created"] += 1
        b["caseIds"].append(res["caseId"])
        if res["matched"]:
            b["autoMatched"] += 1
        else:
            b["namesToCheck"] += 1
    b["newOverlaps"] = sum(1 for a in st.alerts() if a["id"] not in before)
    st.db.add(m.ImportBatch(id=b["id"], unit=unit, file_name=file_name, by=b["by"], at=b["at"], rows=b["rows"], created=b["created"], updated=b["updated"],
                            rejected=b["rejected"], rejects=b["rejects"], auto_matched=b["autoMatched"], names_to_check=b["namesToCheck"], new_overlaps=b["newOverlaps"], case_ids=b["caseIds"]))
    sync = st.db.get(m.SourceSync, unit)
    stamp = datetime.now().strftime("%Y-%m-%dT%H:%M")
    if sync:
        sync.last_import_at = stamp
    else:
        st.db.add(m.SourceSync(unit=unit, last_import_at=stamp))
    audit(st, who(user), "Import finished", file_name, f"{b['rows']} rows: {b['created']} new, {b['updated']} updated, {b['rejected']} not saved")
    return b


def batch_dict(r: m.ImportBatch) -> dict:
    return {"id": r.id, "unit": r.unit, "fileName": r.file_name, "by": r.by, "at": r.at, "rows": r.rows, "created": r.created, "updated": r.updated, "rejected": r.rejected,
            "rejects": r.rejects, "autoMatched": r.auto_matched, "namesToCheck": r.names_to_check, "newOverlaps": r.new_overlaps, "caseIds": r.case_ids}


def imports_list(st: State) -> list[dict]:
    rows = st.db.scalars(select(m.ImportBatch)).all()
    return [batch_dict(r) for r in sorted(rows, key=lambda r: (r.at, r.id), reverse=True)]


def import_batch(st: State, bid: str) -> dict:
    r = st.db.get(m.ImportBatch, bid)
    if not r:
        raise ApiError(404, "not_found", "This import receipt could not be found.")
    b = batch_dict(r)
    cs = []
    for cid in b["caseIds"]:
        c = st.case_by.get(cid)
        if c:
            i = inst_of(st, c.get("institutionId"))
            cs.append({"id": c["id"], "uid": c["uid"], "institution": i["name"] if i else f"“{c['recorded']['name']}”", "matched": bool(i)})
    return {**b, "cases": cs}


# ---------------------------------------------------------------- deadlines
def deadlines(st: State, user: dict, unit: str | None) -> dict:
    scope_unit = unit or user.get("unit")
    rows = []
    for c in [x for x in st.cases if L.is_open(x) and (not scope_unit or x["ownerUnit"] == scope_unit)]:
        d = L.deadline_for(c, st.today)
        if d["state"] == "closed":
            continue
        i = inst_of(st, c.get("institutionId"))
        rows.append({"id": c["id"], "uid": c["uid"], "unit": c["ownerUnit"], "institution": i["name"] if i else f"“{c['recorded']['name']}”", "stage": c["lifecycle"],
                     "deadline": d, "escalation": L.escalation_for(d), "officer": c.get("officer"), "stageSince": L.stage_since(c),
                     "channel": c["channel"], "institutionId": c.get("institutionId"), "permanentId": i["permanentId"] if i else None, "nextAction": c["nextAction"], "category": c["category"]})
    strip = [{"date": add_days(st.today, i), "count": sum(1 for r in rows if r["deadline"]["dueOn"] == add_days(st.today, i))} for i in range(30)]
    return {
        "unit": scope_unit, "overdue": sorted((r for r in rows if r["deadline"]["state"] == "overdue"), key=lambda r: r["deadline"]["daysToDue"]),
        "thisWeek": sorted((r for r in rows if r["deadline"]["state"] != "overdue" and r["deadline"]["daysToDue"] <= 7), key=lambda r: r["deadline"]["daysToDue"]),
        "interim": [r for r in rows if r["deadline"]["interimDue"]], "raised": sorted((r for r in rows if r["escalation"]["level"] > 0), key=lambda r: -r["escalation"]["late"]),
        "all": rows, "strip": strip,
    }


# ---------------------------------------------------------------- institutions
def next_dated(cases: list[dict], today: str) -> dict | None:
    """The next deliberate step still ahead for an institution: a booked hearing or visit, a reply due, or the CPGRAMS interim reply."""
    found: list[tuple[str, str, str]] = []
    for c in cases:
        sched = c.get("scheduled")
        if sched and sched["on"] >= today:
            found.append((sched["on"], c["ownerUnit"], sched["what"]))
        interim = L.deadline_for(c, today).get("interimDay")
        if interim and add_days(c["receivedOn"], interim) >= today:
            found.append((add_days(c["receivedOn"], interim), c["ownerUnit"], "CPGRAMS interim reply due"))
    if not found:
        return None
    on, unit, what = min(found)
    return {"date": on, "unit": unit, "what": what}


def institutions_list(st: State, f: dict) -> dict:
    q = (f.get("q") or "").strip().lower()
    live = st.alerts()
    rows = []
    for i in st.insts:
        lst = [c for c in st.cases if c.get("institutionId") == i["id"]]
        active = [c for c in lst if L.is_active(c)]
        rows.append({"id": i["id"], "name": i["name"], "permanentId": i["permanentId"], "district": i["district"], "state": i["state"], "region": i["region"], "type": i["type"],
                     "total": len(lst), "open": len(active), "units": list(dict.fromkeys(c["ownerUnit"] for c in active)),
                     "overlap": any(a["institutionId"] == i["id"] and not st.settled(a["id"]) for a in live),
                     "overlapNote": next((overlap_note([st.case(x) for x in a["caseIds"]]) for a in live if a["institutionId"] == i["id"] and not st.settled(a["id"])), None),
                     "next": next_dated(active, st.today)})
    only = f.get("only")
    rows = [r for r in rows if (not q or q in f"{r['name']} {r['permanentId']} {r['district']}".lower()) and (not f.get("region") or r["region"] == f["region"])
            and (not f.get("type") or r["type"] == f["type"]) and (only != "overlap" or r["overlap"]) and (only != "open" or r["open"] > 0)]
    rows.sort(key=lambda r: (-int(r["overlap"]), -r["open"], r["name"]))
    return {"rows": rows, "types": sorted({i["type"] for i in st.insts})}


def institution_detail(st: State, iid: str) -> dict:
    i = inst_of(st, iid)
    if not i:
        raise ApiError(404, "not_found", "No institution with this ID.")
    lst = [c for c in st.cases if c.get("institutionId") == iid]
    live = [a for a in st.alerts() if a["institutionId"] == iid]
    known = [a for a in st.known_alerts() if a["institutionId"] == iid]
    shown = [a for a in known if any(l["id"] == a["id"] for l in live) or st.settled(a["id"])]
    active = [c for c in lst if L.is_active(c)]
    return {
        **i,
        "cases": sorted(({**public_case(c), "deadline": L.deadline_for(c, st.today)} for c in lst), key=lambda c: c["receivedOn"], reverse=True),
        "lanes": st.lanes_for(iid),
        "alerts": [{"id": a["id"], "severity": a["severity"], "rules": [r["code"] for r in a["rules"]], "decided": st.settled(a["id"]), "decision": st.latest_decision(a["id"])} for a in shown],
        "openUnits": list(dict.fromkeys(c["ownerUnit"] for c in active)),
        "issue": (main_issue(active) or {}).get("label"),
        "stories": [{"id": a["id"], "story": overlap_story([st.case(x) for x in a["caseIds"]]), "decided": st.settled(a["id"])} for a in live],
        "replies": [], "watchers": [], "watching": False,
    }


# ---------------------------------------------------------------- overlaps, decisions, tasks
def unit_contacts(st: State, units: list[str]) -> list[dict]:
    """Whom to call in each unit: its nodal officer, or the coordinator when the unit has none on record."""
    users = st.db.scalars(select(m.User)).all()
    coord = next((u for u in users if u.role == "coordinator"), None)
    out = []
    for un in units:
        nodal = next((u for u in users if u.role == "nodal_officer" and u.unit == un), None)
        if nodal:
            out.append({"unit": un, "name": nodal.name, "role": "Nodal officer"})
        elif coord:
            out.append({"unit": un, "name": coord.name, "role": "Coordinator (no nodal officer on record for this unit)"})
    return out


def pre_action_check(st: State, user: dict, b: dict) -> dict:
    """The traffic light before an action: whether another unit's open work could clash. Advises only; it never blocks."""
    if b.get("action") not in precheck.ACTIONS:
        raise ApiError(400, "validation_error", "Say which action you are about to take.")
    unit = b.get("unit") or user.get("unit")
    if not unit:
        raise ApiError(400, "validation_error", "Say which unit is acting.")
    if not st.inst_by.get(b.get("institutionId") or ""):
        raise ApiError(404, "not_found", "No institution with this ID.")
    res = precheck.pre_action_check(b["action"], unit, st.lanes_for(b["institutionId"]), b.get("caseId"), b.get("category"), b.get("targetStage"))
    return {**res, "contacts": unit_contacts(st, res["askUnits"])}


def calendar(st: State, frm: str | None, to: str | None) -> dict:
    """Dated steps of every unit, by institution, for institutions where more than one unit is working, with the weeks where two units collide."""
    start = frm or st.today
    end = to or add_days(start, 41)
    out = []
    for a in st.alerts():
        if st.settled(a["id"]):
            continue
        acts = precheck.dated_actions([st.case(i) for i in a["caseIds"]], start)
        steps = [x for x in acts if x["kind"] != "deadline" and x["date"] <= end]
        if steps:
            out.append({"overlapId": a["id"], "institution": st.inst_by[a["institutionId"]], "actions": steps, "collisions": precheck.find_collisions(acts)})
    out.sort(key=lambda r: r["actions"][0]["date"])
    return {"from": start, "to": end, "institutions": out}


def deciders(st: State, units: list[str]) -> list[dict]:
    """Who may decide an overlap: the nodal officer of each unit involved. Units with no nodal officer on record fall to the coordinator."""
    users = st.db.scalars(select(m.User)).all()
    nodal = [u for u in users if u.role == "nodal_officer" and u.unit in units]
    out = [{"name": u.name, "unit": u.unit, "role": "nodal_officer"} for u in nodal]
    if any(not any(n.unit == un for n in nodal) for un in units):
        out += [{"name": u.name, "unit": None, "role": "coordinator"} for u in users if u.role == "coordinator"]
    return out


def _enrich(st: State, a: dict) -> dict:
    cs = [st.case(i) for i in a["caseIds"] if i in st.case_by]
    return {
        **a, "institution": st.inst_by[a["institutionId"]], "units": st.units_of(a),
        "decision": st.latest_decision(a["id"]) if st.settled(a["id"]) else None, "lastNote": st.latest_decision(a["id"]),
        "earlierDecision": st.earlier_decision(a), "state": st.board_state(a), "dueOn": st.due_of(a), "lanes": st.lanes_for(a["institutionId"]),
        "cases": [{"id": c["id"], "uid": c["uid"], "unit": c["ownerUnit"], "lifecycle": c["lifecycle"], "category": c["category"], "receivedOn": c["receivedOn"],
                   "officer": c.get("officer"), "deadline": L.deadline_for(c, st.today),
                   "channel": c["channel"], "nextAction": c["nextAction"], "scheduled": c.get("scheduled")} for c in cs],
        "deciders": deciders(st, st.units_of(a)),
        "since": st.since_of(a), "story": overlap_story(cs), "issue": (main_issue(cs) or {}).get("label"),
    }


def overlaps(st: State) -> dict:
    live = st.alerts()
    decided_ids = list(dict.fromkeys(d["alertId"] for d in st.decisions if st.settled(d["alertId"])))
    known = {a["id"]: a for a in st.known_alerts()}
    decided = [known[i] for i in decided_ids if i in known]
    done = [d for d in st.decisions if d["decision"] != "request_further_review"]
    days = []
    for d in done:
        a = known.get(d["alertId"])
        if a:
            days.append(max(0, days_between(st.since_of(a), d["at"][:10])))
    days.sort()
    median = days[len(days) // 2] if len(days) >= 3 else None  # one or two decisions say nothing about the usual time
    return {"decisionsCount": len(days), "open": [_enrich(st, a) for a in live if not st.settled(a["id"])], "decided": [_enrich(st, a) for a in reversed(decided)], "medianDaysToDecide": median}


def overlap_detail(st: State, aid: str, user: dict | None) -> dict:
    a = next((x for x in st.alerts() if x["id"] == aid), None) or next((x for x in st.known_alerts() if x["id"] == aid), None)
    if not a:
        raise ApiError(404, "not_found", "This overlap is no longer open. A case may have changed since you opened it.")
    if user and L.can_decide(user, st.units_of(a)) and aid not in st.seen:
        st.db.add(m.AlertView(alert_id=aid))
        st.seen.add(aid)
    cs = [{**public_case(st.case(i)), "deadline": L.deadline_for(st.case(i), st.today)} for i in a["caseIds"] if i in st.case_by]
    merged = sorted(({**e, "unit": c["ownerUnit"], "uid": c["uid"]} for c in cs for e in c["events"]), key=lambda e: e["at"], reverse=True)
    tasks = [task_dict(st, t) for t in st.db.scalars(select(m.Task).where(m.Task.alert_id == aid)).all()]
    return {
        **a, "institution": st.inst_by[a["institutionId"]], "lanes": st.lanes_for(a["institutionId"]), "cases": cs, "merged": merged, "units": st.units_of(a),
        "state": st.board_state(a), "since": st.since_of(a), "dueOn": st.due_of(a), "decision": st.latest_decision(aid) if st.settled(aid) else None,
        "history": st.history_of(aid), "earlierDecision": st.earlier_decision(a), "story": overlap_story(cs), "issue": (main_issue(cs) or {}).get("label"),
        "sharedIssues": shared_issues(cs), "tasks": tasks, "edges": L.pair_edges({c["id"]: c for c in cs}, a),
    }


def task_dict(st: State, t: m.Task) -> dict:
    return {"id": t.id, "action": t.action, "ownerUnit": t.owner_unit, "dueOn": t.due_on, "state": t.state, "alertId": t.alert_id, "doneAt": t.done_at, "doneBy": t.done_by,
            "late": t.state == "open" and days_between(t.due_on, st.today) > 0}


def decide(st: State, aid: str, decision: str, reason: str, lead: str | None, follow_up: dict | None, user: dict) -> dict:
    a = next((x for x in st.alerts() if x["id"] == aid), None)
    if not a:
        raise ApiError(404, "not_found", "This overlap is no longer open.")
    involved = st.units_of(a)
    if decision not in DECISION_LABEL:
        raise ApiError(422, "validation_error", "Choose a decision.")
    if not L.can_decide(user, involved):
        raise ApiError(403, "forbidden", f"Only a coordinator or a nodal officer of {' or '.join(involved)} can record this decision.")
    if decision != "related" and not reason.strip():
        raise ApiError(422, "validation_error", "Add a reason. It is required for this decision.")
    if decision == "designate_lead_unit" and (not lead or lead not in involved):
        raise ApiError(422, "validation_error", "Choose a lead unit from the units involved.")
    if st.settled(aid):
        raise ApiError(409, "conflict", "A decision is already recorded for this overlap.")
    if follow_up and (not follow_up.get("action") or not follow_up.get("ownerUnit") or not follow_up.get("dueOn")):
        raise ApiError(422, "validation_error", "A follow-up needs an action, an owner unit and a due date.")
    by = who(user)
    ref = audit(st, by, "Decision recorded", st.inst_by[a["institutionId"]]["name"],
                f"{DECISION_LABEL[decision]}{', ' + lead + ' leads' if lead else ''} (chosen by the officer)")
    row = m.Decision(alert_id=aid, institution_id=a["institutionId"], case_ids=a["caseIds"], rules=a["rules"], severity=a["severity"], decision=decision,
                     lead_unit=lead if decision == "designate_lead_unit" else None, reason=reason.strip(), by=by, at=datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
                     follow_up=follow_up if decision != "not_related" else None)
    st.db.add(row)
    st.db.flush()
    if follow_up and decision not in ("not_related", "request_further_review"):
        st.db.add(m.Task(decision_id=row.id, alert_id=aid, institution_id=a["institutionId"], action=follow_up["action"], owner_unit=follow_up["ownerUnit"], due_on=follow_up["dueOn"]))
    # Decisions never change ownership or stage: they only add a timeline entry on each case.
    for cid in a["caseIds"]:
        c = st.case(cid)
        event(c, "linked", st.today, by, f"Coordination: {DECISION_LABEL[decision]}{' (' + lead + ' leads)' if lead and decision == 'designate_lead_unit' else ''}", ref)
        st.save_case(c)
    from .store import decision_to_dict
    st.decision_rows = list(st.decision_rows) + [row]
    st.decisions.append(decision_to_dict(row))
    return {**decision_to_dict(row), "auditRef": ref}


def tasks_list(st: State, user: dict) -> list[dict]:
    rows = st.db.scalars(select(m.Task).order_by(m.Task.due_on)).all()
    return [{**task_dict(st, t), "institution": (inst_of(st, t.institution_id) or {}).get("name")} for t in rows
            if user["role"] in ("coordinator", "senior_management", "admin") or t.owner_unit == user.get("unit")]


def complete_task(st: State, tid: int, user: dict) -> dict:
    t = st.db.get(m.Task, tid)
    if not t:
        raise ApiError(404, "not_found", "This follow-up could not be found.")
    if not (user["role"] == "coordinator" or (user["role"] in ("dealing_officer", "nodal_officer") and user.get("unit") == t.owner_unit)):
        raise ApiError(403, "forbidden", f"Only officers of {t.owner_unit}, or the coordinator, can complete this follow-up.")
    if t.state == "done":
        raise ApiError(409, "conflict", "This follow-up is already complete.")
    t.state, t.done_at, t.done_by = "done", now_at(st.today), who(user)
    audit(st, who(user), "Follow-up completed", st.inst_by[t.institution_id]["name"], t.action)
    return task_dict(st, t)


# ---------------------------------------------------------------- institution matching (T3 suggestions, T4 person)
def matching_queue(st: State) -> list[dict]:
    q = [c for c in st.cases if c["matchState"] in ("pending_review", "unresolved")]
    out = []
    for c in q:
        sug = L.suggestions_for(c["recorded"], st.insts, st.rejected.get(c["id"]))
        out.append({**public_case(c), "suggestions": [{**s, "institution": st.inst_by[s["institutionId"]], "check": L.compare_fields(c["recorded"], st.inst_by[s["institutionId"]])} for s in sug]})
    return out


def _need_confirm(user: dict, what: str) -> None:
    if not L.can_confirm_match(user):
        raise ApiError(403, "forbidden", f"Only a coordinator or data steward can {what}.")


def accept_match(st: State, cid: str, iid: str, user: dict) -> dict:
    _need_confirm(user, "confirm an institution")
    c, i = case_of(st, cid), inst_of(st, iid)
    if not i:
        raise ApiError(404, "not_found", "No institution with this ID.")
    s = next((x for x in L.suggestions_for(c["recorded"], st.insts, st.rejected.get(cid)) if x["institutionId"] == iid), None)
    c["institutionId"], c["matchState"], c["matchMethod"] = iid, "resolved_confirmed", "T4_confirmed"
    c["matchEvidence"] = [*(s["evidence"] if s else []), f"Confirmed by {user['name']}", "The recorded name is now remembered, so it will match automatically next time"]
    row = st.db.get(m.Institution, iid)
    assert row is not None
    row.identifiers = [*row.identifiers, {"type": "confirmed_alias", "value": c["recorded"]["name"], "verified": True}]
    i["identifiers"].append({"type": "confirmed_alias", "value": c["recorded"]["name"], "verified": True})
    event(c, "match_resolved", st.today, who(user), f"Institution confirmed: {i['name']}", audit(st, who(user), "Institution confirmed", c["uid"], i["name"]))
    st.save_case(c)
    st.invalidate()
    return {"uid": c["uid"], "institution": i["name"], "alias": c["recorded"]["name"]}


def reject_match(st: State, cid: str, iid: str, user: dict) -> bool:
    _need_confirm(user, "rule out a suggestion")
    c = case_of(st, cid)
    if not st.db.get(m.RejectedSuggestion, (cid, iid)):
        st.db.add(m.RejectedSuggestion(case_id=cid, institution_id=iid))
    audit(st, who(user), "Suggestion ruled out", c["uid"], (inst_of(st, iid) or {}).get("name", iid))
    return True


def mark_unresolved(st: State, cid: str, reason: str, user: dict) -> bool:
    _need_confirm(user, "do this")
    if not reason.strip():
        raise ApiError(422, "validation_error", "Add a reason.")
    c = case_of(st, cid)
    c["matchState"] = "unresolved"
    event(c, "match_resolved", st.today, who(user), f"Left unmatched: {reason}", audit(st, who(user), "Left unmatched", c["uid"], reason))
    st.save_case(c)
    return True


# ---------------------------------------------------------------- reports
REPORTS = [
    ("workload", "Unit workload", "Cases in and out per unit, and what is still open"),
    ("ageing", "Age of open cases", "How long open cases have been waiting, per unit"),
    ("disposal", "Disposals over time", "Received, disposed and transferred per period"),
    ("overlaps", "Overlaps and decisions", "What each overlap rule found, and what people decided"),
    ("regions", "Regions", "Open and overdue cases by region"),
]


def _periods(kind: str, today: str) -> list[dict]:
    import calendar
    t = to_date(today)
    out = []
    if kind == "monthly":
        for i in range(5, -1, -1):
            mm = t.month - 1 - i
            y, mo = t.year + mm // 12, mm % 12 + 1
            last = calendar.monthrange(y, mo)[1]
            out.append({"label": f"{calendar.month_abbr[mo]} {y}", "from": f"{y:04d}-{mo:02d}-01", "to": f"{y:04d}-{mo:02d}-{last:02d}"})
    else:
        for i in range(3, -1, -1):
            q0 = (t.month - 1) // 3 - i
            y, q = t.year + q0 // 4, q0 % 4
            mo1, mo2 = q * 3 + 1, q * 3 + 3
            out.append({"label": f"Q{q + 1} {y}", "from": f"{y:04d}-{mo1:02d}-01", "to": f"{y:04d}-{mo2:02d}-{calendar.monthrange(y, mo2)[1]:02d}"})
    return out


def build_report(st: State, rtype: str, period: str, unit: str | None, region: str | None) -> dict:
    today = st.today
    meta_ = next((r for r in REPORTS if r[0] == rtype), None)
    if not meta_:
        raise ApiError(422, "validation_error", "Unknown report.")
    scoped = L.filter_cases(st.cases, {"unit": unit, "region": region}, st.insts, st.units, today)
    active = [c for c in scoped if L.is_active(c)]
    ps = _periods(period, today)
    in_p = lambda d, p: p["from"] <= d <= p["to"]  # noqa: E731
    pct = lambda a, b: f"{js_round(a / b * 100)}%" if b else "—"  # noqa: E731
    live = st.alerts()
    if rtype == "workload":
        frm = ps[0]["from"]
        cols = ["Unit", "Received", "Disposed", "Transferred", "Open now", "Overdue now", "Disposal rate"]
        rows = []
        for u in sorted({c["ownerUnit"] for c in scoped}):
            mine = [c for c in scoped if c["ownerUnit"] == u]
            disp = sum(1 for c in mine if c["lifecycle"] == "disposed" and c["lastActionOn"] >= frm)
            op = sum(1 for c in mine if L.is_active(c))
            rows.append([u, sum(1 for c in mine if c["receivedOn"] >= frm), disp, sum(1 for c in mine if c["lifecycle"] == "transferred" and c["lastActionOn"] >= frm), op,
                         sum(1 for c in mine if L.is_active(c) and L.deadline_for(c, today)["state"] == "overdue"), pct(disp, disp + op)])
        rows.sort(key=lambda r: -r[4])
        takeaway = f"{rows[0][0]} has the most open cases ({rows[0][4]})." if rows else "No cases in this selection."
    elif rtype == "ageing":
        cols = ["Unit", *[b["label"].replace(" d", " days") for b in L.AGEING], "Open"]
        rows = []
        for u in sorted({c["ownerUnit"] for c in active}):
            mine = [c for c in active if c["ownerUnit"] == u]
            rows.append([u, *[sum(1 for c in mine if L.age_bucket(days_between(c["receivedOn"], today)) == i) for i in range(len(L.AGEING))], len(mine)])
        old = sum(1 for c in active if days_between(c["receivedOn"], today) > 45)
        takeaway = f"{plural(old, 'open case')} {'is' if old == 1 else 'are'} older than 45 days."
    elif rtype == "disposal":
        cols = ["Period", "Received", "Disposed", "Transferred (apart)", "Disposal rate"]
        rows = []
        for p in ps:
            rec = sum(1 for c in scoped if in_p(c["receivedOn"], p))
            disp = sum(1 for c in scoped if c["lifecycle"] == "disposed" and in_p(c["lastActionOn"], p))
            tr = sum(1 for c in scoped if c["lifecycle"] == "transferred" and in_p(c["lastActionOn"], p))
            open_end = sum(1 for c in scoped if c["receivedOn"] <= p["to"] and not (c["lifecycle"] in ("disposed", "transferred") and c["lastActionOn"] <= p["to"]))
            rows.append([p["label"], rec, disp, tr, pct(disp, disp + open_end)])
        takeaway = f"In {rows[-1][0]}: {rows[-1][1]} received, {rows[-1][2]} disposed. Transfers are shown apart, never as disposals."
    elif rtype == "overlaps":
        cols = ["Rule", "Found", "Decided", "Related", "Same complaint", "Not related", "One unit leads", "Waiting"]
        known = st.known_alerts()
        rows = []
        for r in L.rule_performance(known, st.decisions):
            fired = [a for a in known if any(x["code"] == r["code"] for x in a["rules"])]
            last = [(st.latest_decision(a["id"]) or {}).get("decision") if st.settled(a["id"]) else None for a in fired]
            rows.append([f"{r['code']}: {RULE_SHORT[r['code']]}", r["fired"], r["decided"], last.count("related"), last.count("duplicate"), last.count("not_related"), last.count("designate_lead_unit"), last.count(None)])
        waiting = sum(1 for a in live if not st.settled(a["id"]))
        takeaway = f"{plural(waiting, 'overlap')} still {'waits' if waiting == 1 else 'wait'} for a decision." if waiting else "Every overlap found has a decision."
    else:
        cols = ["Region", "Open", "Overdue", "Institutions with open cases", "Overlaps waiting"]
        rows = []
        for r in sorted({i["region"] for i in st.insts}):
            mine = [c for c in active if (inst_of(st, c.get("institutionId")) or {}).get("region") == r]
            rows.append([r, len(mine), sum(1 for c in mine if L.deadline_for(c, today)["state"] == "overdue"), len({c.get("institutionId") for c in mine}),
                         sum(1 for a in live if st.inst_by[a["institutionId"]]["region"] == r and not st.settled(a["id"]))])
        rows = [r for r in rows if not region or r[0] == region]
        top = max(rows, key=lambda r: r[1], default=None)
        takeaway = f"The {top[0]} region has the most open cases ({top[1]})." if top else "No cases in this selection."
    note = f"Since {short_date(ps[0]['from'])}" if rtype == "workload" else f"{len(ps)} {'months' if period == 'monthly' else 'quarters'}" if rtype == "disposal" else f"As of {short_date(today)}"
    return {"type": meta_[0], "title": meta_[1], "about": meta_[2], "columns": cols, "rows": rows, "takeaway": takeaway, "period": period, "periodNote": note}


def to_csv(rows: list[list]) -> str:
    def cell(v: Any) -> str:
        s = str(v)
        return '"' + s.replace('"', '""') + '"' if any(ch in s for ch in ',"\n') else s
    return "\r\n".join(",".join(cell(v) for v in r) for r in rows)


def export_text(st: State, title: str, rows: list[list], user: dict, ref: str) -> dict:
    import re
    head = [[f"# {title}"], ["# Synthetic prototype data. Not real AICTE figures."],
            [f"# Exported by {who(user)} on {now_at(st.today).replace('T', ' at ')}. Audit entry {ref}."], ["# Complainant names and complaint text are never included."]]
    return {"fileName": f"ekatra-{re.sub('[^a-z]+', '-', title.lower())}-{st.today}.csv", "text": to_csv([*head, *rows]), "auditRef": ref}


def export_report(st: State, rtype: str, period: str, unit: str | None, region: str | None, user: dict) -> dict:
    r = build_report(st, rtype, period, unit, region)
    ref = audit(st, who(user), "Report exported", r["title"], f"{period}{', ' + unit if unit else ''}{', ' + region if region else ''}")
    return export_text(st, r["title"], [r["columns"], *[[str(v) for v in row] for row in r["rows"]]], user, ref)


def numbers_check(st: State) -> list[dict]:
    """Every dashboard number counted a second, independent way. Both must agree."""
    today = st.today
    live = st.alerts()
    s = L.summarise(st.cases, live, [d for d in st.decisions if st.settled(d["alertId"])], st.insts, st.units, today)
    open_ = pending = disposed = transferred = overdue = unmatched = 0
    for c in st.cases:
        if c["lifecycle"] == "disposed":
            disposed += 1
        elif c["lifecycle"] == "transferred":
            transferred += 1
        else:
            open_ += 1
            pending += c["lifecycle"] == "received"
            if days_between(c["receivedOn"], today) > (SETTINGS["cpgramsDays"] if c["channel"] == "CPGRAMS" else SETTINGS["defaultDays"]):
                overdue += 1
        unmatched += not c.get("institutionId")
    waiting = sum(1 for a in live if not st.settled(a["id"]))
    rows = [
        ("Open now", s["pending"] + s["underProcess"] + s["escalated"], open_, "Counted every case that is not disposed and not transferred"),
        ("New, not yet picked up", s["pending"], pending, "Counted cases in the “New” stage"),
        ("Past their timeline", s["overdue"], overdue, "Compared each open case’s age with its time limit"),
        ("Overlaps to decide", s["overlapsAwaiting"], waiting, "Counted possible overlaps with no final decision"),
        ("Names to check", s["unresolvedMatches"], unmatched, "Counted cases with no institution linked"),
        ("Disposed", s["disposed"], disposed, "Counted cases with a final action"),
        ("Transferred (apart)", s["transferred"], transferred, "Counted transferred cases separately"),
    ]
    return [{"tile": t, "shown": a, "recount": b, "how": h, "ok": a == b} for t, a, b, h in rows]


# ---------------------------------------------------------------- settings, audit, users
def settings_view(st: State) -> dict:
    sm: dict[str, list] = {}
    for r in st.db.scalars(select(m.StatusMapping)).all():
        sm.setdefault(r.unit, []).append({"word": r.word, "stage": r.stage})
    return {
        "items": rules.items(),
        "values": dict(SETTINGS),
        "rules": [{**r, "label": RULE_SHORT[r["code"]]} for r in L.rule_performance(st.known_alerts(), st.decisions)],
        "statusMap": [{"unit": u, "words": w} for u, w in sm.items()],
    }


def update_rules(st: State, user: dict, values: dict[str, Any], reason: str) -> dict:
    """An administrator changes prototype settings. Needs a reason; the audit log keeps old and new values."""
    if not reason.strip():
        raise ApiError(400, "validation_error", "Say why the rule is changing.")
    clean = rules.validate(values)
    changes = {k: v for k, v in clean.items() if v != SETTINGS[k]}
    if not changes:
        raise ApiError(400, "validation_error", "Nothing was changed.")
    overrides = {**get_json(st.db, "rule_overrides", {}), **changes}
    overrides = {k: v for k, v in overrides.items() if v != rules.DEFAULTS[k]}
    text = "; ".join(f"{rules.BY_KEY[k]['label']}: {rules.display(rules.BY_KEY[k], SETTINGS[k])} -> {rules.display(rules.BY_KEY[k], v)}" for k, v in changes.items())
    set_json(st.db, "rule_overrides", overrides)
    rules.apply(overrides)
    audit(st, who(user), "Rule changed", "settings", f"{text}. Reason: {reason.strip()}")
    return settings_view(st)


def reset_rules(st: State, user: dict, reason: str) -> dict:
    if not reason.strip():
        raise ApiError(400, "validation_error", "Say why the rules are being reset.")
    set_json(st.db, "rule_overrides", {})
    rules.apply({})
    audit(st, who(user), "Rules reset", "settings", f"All editable rules went back to their defaults. Reason: {reason.strip()}")
    return settings_view(st)


def audit_log(st: State, q: str | None, action: str | None) -> dict:
    rows = st.db.scalars(select(m.AuditEvent).order_by(m.AuditEvent.seq)).all()
    ql = (q or "").strip().lower()
    shown = [e for e in reversed(rows) if (not action or e.action == action) and (not ql or ql in f"{e.actor} {e.entity} {e.details}".lower())]
    return {"rows": [{"seq": e.seq, "at": e.at, "actor": e.actor, "action": e.action, "entity": e.entity, "details": e.details, "prevHash": e.prev_hash, "hash": e.hash} for e in shown[:200]],
            "total": len(shown), "actions": sorted({e.action for e in rows}), "check": verify_chain(st.db)}


# ---------------------------------------------------------------- hourly sweep (deadline and follow-up monitoring)
def automation_stats(st: State) -> dict:
    cs = st.cases
    open_ = [c for c in cs if L.is_open(c)]
    dl = [L.deadline_for(c, st.today) for c in open_]
    live = st.alerts()
    last = get_json(st.db, "last_sweep_at", None)
    mins = max(0, int((datetime.now() - datetime.fromisoformat(last)).total_seconds() // 60)) if last else 0
    return {
        "autoMatched": sum(1 for c in cs if c["matchState"] == "resolved_auto"), "totalCases": len(cs),
        "autoPct": js_round(sum(1 for c in cs if c["matchState"] == "resolved_auto") / len(cs) * 100) if cs else 0,
        "needsPerson": sum(1 for c in cs if c["matchState"] in ("pending_review", "unresolved")), "overlaps": len(live),
        "overlapsWaiting": sum(1 for a in live if not st.settled(a["id"])), "tracked": len(open_), "overdue": sum(1 for d in dl if d["state"] == "overdue"),
        "decisions": len(st.decisions), "minutesSinceSweep": mins, "minutesToNext": max(1, 60 - mins),
    }


def simulate_feeds(st: State) -> None:
    """Demo only (see config): healthy units "send data" each hour, so they never all look stale. The silent unit keeps its age."""
    if not settings.simulate_feeds:
        return
    now = datetime.now()
    for r in st.db.scalars(select(m.SourceSync)).all():
        if r.unit not in settings.silent_units:
            r.last_import_at = (now - timedelta(hours=2 + sum(map(ord, r.unit)) % 16)).strftime("%Y-%m-%dT%H:%M")


def run_sweep(st: State, trigger: str, actor: str = "Ekatra (automatic)") -> dict:
    """Re-checks every open case, follow-up and review. Idempotent: a condition that is already raised is never raised twice,
    and an alert whose condition has cleared is resolved. Escalation steps: owner, nodal officer (+7 days), senior management (+7 more)."""
    today, db = st.today, st.db
    simulate_feeds(st)
    want: dict[str, dict] = {}
    c_over = c_soon = c_interim = c_esc = c_open = 0
    for c in st.cases:
        if not L.is_open(c):
            continue
        c_open += 1
        d = L.deadline_for(c, today)
        base = {"case_id": c["id"], "owner_unit": c["ownerUnit"]}
        if d["state"] == "overdue":
            c_over += 1
            late = -d["daysToDue"]
            want[f"overdue:{c['id']}"] = {**base, "kind": "overdue", "message": f"{c['uid']} is {plural(late, 'day')} past its time limit"}
            lvl = L.escalation_for(d)["level"]
            if lvl >= 1:
                c_esc += 1
                want[f"esc1:{c['id']}"] = {**base, "kind": "escalation_1", "message": f"{c['uid']} raised to the nodal officer of {c['ownerUnit']}"}
            if lvl >= 2:
                want[f"esc2:{c['id']}"] = {**base, "kind": "escalation_2", "message": f"{c['uid']} raised to senior management"}
        elif d["state"] == "approaching":
            c_soon += 1
            want[f"soon:{c['id']}"] = {**base, "kind": "approaching", "message": f"{c['uid']} has used {js_round(d['age'] / d['days'] * 100)}% of its time limit"}
        if d["interimDue"]:
            c_interim += 1
            want[f"interim:{c['id']}"] = {**base, "kind": "interim", "message": f"{c['uid']}: CPGRAMS interim reply is due"}
        if L.is_active(c):
            if c["nextAction"].strip() in ("", "—") and days_between(c["receivedOn"], today) >= SETTINGS["unassignedDays"]:
                want[f"nonext:{c['id']}"] = {**base, "kind": "no_next_step", "message": f"{c['uid']} has no next step recorded"}
            if days_between(c["lastActionOn"], today) >= SETTINGS["staleActionDays"]:
                want[f"stale:{c['id']}"] = {**base, "kind": "stale", "message": f"{c['uid']} has had no update for {days_between(c['lastActionOn'], today)} days"}
    for t in db.scalars(select(m.Task).where(m.Task.state == "open")).all():
        if days_between(t.due_on, today) > 0:
            want[f"task:{t.id}"] = {"case_id": None, "owner_unit": t.owner_unit, "kind": "task_overdue", "ref": t.alert_id, "message": f"Follow-up overdue for {t.owner_unit}: {t.action}"}
    for a in st.alerts():
        if st.settled(a["id"]):
            continue
        late = days_between(st.due_of(a), today)
        if late > 0:
            want[f"review:{a['id']}"] = {"case_id": None, "owner_unit": None, "kind": "review_overdue", "ref": a["id"], "message": f"Overlap decision for {st.inst_by[a['institutionId']]['name']} is {plural(late, 'day')} late; sent to the coordinator"}
        if late >= SETTINGS["coordSecondLevelDays"] - SETTINGS["coordDueDays"]:
            want[f"review2:{a['id']}"] = {"case_id": None, "owner_unit": None, "kind": "review_overdue", "ref": a["id"], "message": f"Overlap decision for {st.inst_by[a['institutionId']]['name']} still open; sent to senior management"}

    stamp = now_at(today)
    new = resolved = 0
    existing = {r.fingerprint: r for r in db.scalars(select(m.CaseAlert)).all()}
    for fp, w in want.items():
        r = existing.get(fp)
        if r is None:
            db.add(m.CaseAlert(fingerprint=fp, kind=w["kind"], case_id=w.get("case_id"), ref=w.get("ref"), owner_unit=w.get("owner_unit"), message=w["message"], state="open", raised_at=stamp))
            new += 1
        elif r.state == "resolved":
            r.state, r.resolved_at, r.message, r.raised_at = "open", None, w["message"], stamp
            new += 1
        elif r.message != w["message"]:
            r.message = w["message"]  # same condition, fresher wording (for example more days late)
    for fp, r in existing.items():
        if r.state == "open" and fp not in want:
            r.state, r.resolved_at = "resolved", stamp
            resolved += 1
    result = {"checked": c_open, "overdue": c_over, "soon": c_soon, "interim": c_interim, "escalate": c_esc, "newAlerts": new, "resolvedAlerts": resolved}
    db.add(m.JobRun(at=stamp, trigger=trigger, checked=c_open, overdue=c_over, due_soon=c_soon, interim=c_interim, escalated=c_esc, new_alerts=new, resolved_alerts=resolved))
    set_json(db, "last_sweep_at", datetime.now().strftime("%Y-%m-%dT%H:%M"))
    audit(st, actor, "Hourly check run", "all open cases", f"{c_open} checked, {c_over} overdue, {c_esc} raised, {new} new alerts")
    return result


def job_runs(st: State) -> list[dict]:
    rows = st.db.scalars(select(m.JobRun).order_by(m.JobRun.id.desc()).limit(24)).all()
    return [{"at": r.at, "trigger": r.trigger, "checked": r.checked, "overdue": r.overdue, "dueSoon": r.due_soon, "interim": r.interim, "escalated": r.escalated,
             "newAlerts": r.new_alerts, "resolvedAlerts": r.resolved_alerts} for r in rows]


def open_alerts(st: State, unit: str | None) -> list[dict]:
    rows = st.db.scalars(select(m.CaseAlert).where(m.CaseAlert.state == "open").order_by(m.CaseAlert.id.desc())).all()
    return [{"id": r.id, "kind": r.kind, "caseId": r.case_id, "ref": r.ref, "ownerUnit": r.owner_unit, "message": r.message, "raisedAt": r.raised_at}
            for r in rows if not unit or r.owner_unit in (unit, None)]
