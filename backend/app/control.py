"""Decisions about the rules themselves, the closure check, and the repeat radar.

Policy console: rule values change only by a proposal (administrator or coordinator) that a second person in senior
management approves (maker and checker, as in government offices). Before approving, both see what the change would
do to today's records ("what if"). Every step is in the audit log; an approved change can be rolled back the same way.

Closure check: before a case is closed, the facts that matter (reply received? reason that sends the complainant
elsewhere? inside the time limit? an undecided overlap?). It advises, never blocks.

Repeat radar: complaints that come back after closure, and three or more complaints on one issue at one institution
(a systemic problem, better handled once than case by case).
"""
from __future__ import annotations

import re
from typing import Any

from sqlalchemy import select

from . import models as m
from . import services as S
from .engine import logic as L
from .engine import rules
from .engine.dates import add_days, days_between, now_at, short_date
from .engine.demands import ITEM_LABEL, find_clashes, steps_from
from .engine.insights import tag_issues
from .engine.labels import category_label
from .errors import ApiError
from .store import State, get_json, set_json

PROPOSERS = ("admin", "coordinator")
APPROVERS = ("senior_management",)


# ---------------------------------------------------------------- what a set of rule values does to today's records
def _measure(st: State) -> dict:
    open_ = [c for c in st.cases if L.is_open(c)]
    clocks = [L.deadline_for(c, st.today) for c in open_]
    alerts = L.detect_overlaps(st.cases, st.units, st.today)
    rows = [R_dict(r, st.today) for r in st.db.scalars(select(m.Demand)).all()]
    findings = 0
    for iid in {d["institutionId"] for d in rows}:
        ds = [d for d in rows if d["institutionId"] == iid]
        findings += len(find_clashes(ds, steps_from(ds, []), st.today))
    return {
        "overdue": sum(1 for d in clocks if d["state"] == "overdue"),
        "dueSoon": sum(1 for d in clocks if d["state"] == "approaching"),
        "raised": sum(1 for d in clocks if d["state"] == "overdue" and L.escalation_for(d)["level"] >= 1),
        "overlaps": len(alerts),
        "overlapInstitutions": sorted({a["institutionId"] for a in alerts}),
        "requestFindings": findings,
    }


def R_dict(r: m.Demand, today: str) -> dict:
    from .letters_service import demand_to_dict
    return demand_to_dict(r, today)


LABELS = {"overdue": "Cases past their time limit", "dueSoon": "Cases due soon", "raised": "Cases raised to a nodal officer or above",
          "overlaps": "Overlap alerts", "requestFindings": "Findings on requests to institutions"}


def preview(st: State, values: dict[str, Any]) -> dict:
    """POST /policy/preview. The same records, counted under today's rules and under the proposed values. Nothing is saved."""
    proposed = rules.validate(values)
    current = get_json(st.db, "rule_overrides", {})
    before = _measure(st)
    try:
        rules.apply({**current, **proposed})
        after = _measure(st)
    finally:
        rules.apply(current)
    gone = [i for i in before["overlapInstitutions"] if i not in after["overlapInstitutions"]]
    new = [i for i in after["overlapInstitutions"] if i not in before["overlapInstitutions"]]
    changes = [{"key": k, "label": LABELS[k], "before": before[k], "after": after[k], "diff": after[k] - before[k]} for k in LABELS]
    lines = [f"{c['label']}: {c['before']} → {c['after']}" for c in changes if c["diff"]]
    return {
        "values": [{"key": k, "label": rules.BY_KEY[k]["label"], "from": rules.display(rules.BY_KEY[k], rules.SETTINGS[k]), "to": rules.display(rules.BY_KEY[k], v)}
                   for k, v in proposed.items() if v != rules.SETTINGS[k]],
        "changes": changes,
        "overlapsGone": [st.inst_by[i]["name"] for i in gone], "overlapsNew": [st.inst_by[i]["name"] for i in new],
        "summary": "; ".join(lines) if lines else "No count on today's records changes.",
    }


# ---------------------------------------------------------------- proposals (maker and checker)
def _proposals(st: State) -> list[dict]:
    return list(get_json(st.db, "rule_proposals", []))


def policy_view(st: State) -> dict:
    ps = _proposals(st)
    return {"rules": rules.items(), "pending": [p for p in ps if p["state"] == "pending"], "history": [p for p in reversed(ps) if p["state"] != "pending"][:30],
            "who": {"propose": "Administrator or coordinator", "approve": "Senior management (a second person)"}}


def propose(st: State, user: dict, values: dict[str, Any], reason: str, effective: str | None) -> dict:
    if user["role"] not in PROPOSERS:
        raise ApiError(403, "forbidden", "Only the administrator or the coordinator can propose a rule change.")
    if len(reason.strip()) < 10:
        raise ApiError(422, "validation_error", "Say why the rule should change (at least a sentence).")
    clean = rules.validate(values)
    if not any(v != rules.SETTINGS[k] for k, v in clean.items()):
        raise ApiError(422, "validation_error", "The proposed values are the same as the rules in force.")
    if effective and effective < st.today:
        raise ApiError(422, "validation_error", "The date it takes effect cannot be in the past.")
    ps = _proposals(st)
    impact = preview(st, clean)
    p = {"id": (max((x["id"] for x in ps), default=0) + 1), "values": clean, "reason": reason.strip(), "by": S.who(user), "byId": user["id"], "at": now_at(st.today),
         "effective": effective or st.today, "state": "pending", "impact": impact}
    set_json(st.db, "rule_proposals", [*ps, p])
    S.audit(st, S.who(user), "Rule change proposed", "settings", f"Proposal #{p['id']}: {'; '.join(v['label'] + ' ' + v['from'] + ' -> ' + v['to'] for v in impact['values'])}. "
            f"Expected: {impact['summary']} Reason: {p['reason']}")
    return policy_view(st)


def decide_proposal(st: State, user: dict, pid: int, approve: bool, note: str) -> dict:
    ps = _proposals(st)
    p = next((x for x in ps if x["id"] == pid), None)
    if not p or p["state"] != "pending":
        raise ApiError(404, "not_found", "No pending proposal with this number.")
    if user["role"] not in APPROVERS:
        raise ApiError(403, "forbidden", "Only senior management can approve or reject a rule change.")
    if user["id"] == p["byId"]:
        raise ApiError(403, "forbidden", "The person who proposed a change cannot approve it.")
    if not approve and not note.strip():
        raise ApiError(422, "validation_error", "Say why the proposal is rejected.")
    p.update(state="approved" if approve else "rejected", decidedBy=S.who(user), decidedAt=now_at(st.today), note=note.strip())
    set_json(st.db, "rule_proposals", ps)
    if approve:
        S.update_rules(st, user, p["values"], f"Approved proposal #{pid} from {p['by']}: {p['reason']}" + (f" ({note.strip()})" if note.strip() else ""))
    else:
        S.audit(st, S.who(user), "Rule change rejected", "settings", f"Proposal #{pid} from {p['by']} rejected: {note.strip()}")
    return policy_view(st)


# ---------------------------------------------------------------- closure check
ELSEWHERE = re.compile(r"\b(approach|contact|refer(red)?|outside (our|the) (purview|jurisdiction)|not (under|within) (our|the)|state government|concerned (university|authority|department)|"
                       r"forward(ed)? to|another (office|authority|department)|not related to aicte)\b", re.I)
EMPTY_REASON = re.compile(r"^\s*(closed|disposed|resolved|done|ok|noted|action taken|nfa|filed)\W*$", re.I)


def closure_check(st: State, cid: str, reason: str, disposal_type: str | None) -> dict:
    """POST /cases/{id}/closure-check. Facts before a case is closed. Never blocks; the officer decides."""
    c = S.case_of(st, cid)
    facts: list[dict] = []

    def add(level: str, text: str) -> None:
        facts.append({"level": level, "text": text})

    d = L.deadline_for(c, st.today)
    if c["channel"] == "CPGRAMS":
        add("ok" if d["age"] <= d["days"] else "check", f"Day {d['age']} of the verified {d['days']}-day CPGRAMS limit.")
        add("info", "The complainant can appeal within 30 days of closure.")
    r = reason.strip()
    if r and ELSEWHERE.search(r):
        add("check", "The reason sends the complainant to another office. A case that belongs to another office is a transfer, and is counted apart from disposals.")
    if r and (len(r) < 20 or EMPTY_REASON.match(r)):
        add("check", "The reason does not say what was done. Grievance guidelines ask for a valid reason for every closure.")
    for q in st.db.scalars(select(m.Demand).where(m.Demand.case_id == cid, m.Demand.state == "open")).all():
        asked = ", ".join(ITEM_LABEL.get(k, k).lower() for k in q.items) or "a reply"
        add("check", f"The institution has not replied to {q.unit}’s letter of {short_date(q.letter_date)} ({asked}).")
    for a in st.alerts():
        if cid in a["caseIds"] and not st.settled(a["id"]):
            others = [u for u in st.units_of(a) if u != c["ownerUnit"]]
            add("check", f"This case is in an overlap with {', '.join(others) or 'another case'} that nobody has decided yet.")
    same = [x for x in st.cases if x.get("institutionId") and x.get("institutionId") == c.get("institutionId") and x["id"] != cid and L.is_active(x) and x["category"] == c["category"]]
    for x in same:
        add("info", f"{x['ownerUnit']} keeps an open case on the same issue ({x['uid']}). Closing this one does not close theirs.")
    if disposal_type == "closed_as_duplicate_by_owner" and not any(dd["decision"] == "duplicate" and any(cid in (a.get("caseIds") or []) for a in st.known_alerts() if a["id"] == dd["alertId"]) for dd in st.decisions):
        add("check", "Closed as a duplicate, but no “same complaint” decision is on record.")
    if not any(e["type"] in ("action_recorded", "status_changed") for e in c["events"]):
        add("check", "No action is on record for this case yet.")
    checks = sum(1 for f in facts if f["level"] == "check")
    return {"caseId": cid, "facts": facts, "checks": checks, "headline": "Nothing stands in the way of closing." if not checks else f"{checks} thing{'s' if checks != 1 else ''} to look at before closing."}


# ---------------------------------------------------------------- repeat radar
def radar(st: State) -> dict:
    """GET /radar. Complaints that came back after closure, and issues that keep arriving at one institution."""
    repeats = []
    closed = [c for c in st.cases if c["lifecycle"] == "disposed" and c.get("institutionId")]
    for c in st.cases:
        if not c.get("institutionId"):
            continue
        for p in closed:
            if p["id"] == c["id"] or p["institutionId"] != c["institutionId"]:
                continue
            same_ref = bool(c.get("sourceComplaintRef")) and L.normalise_id(c["sourceComplaintRef"] or "") == L.normalise_id(p.get("sourceComplaintRef") or "")
            if (p["category"] == c["category"] or same_ref) and 0 <= days_between(p["lastActionOn"], c["receivedOn"]) <= 30:
                repeats.append({"case": {"id": c["id"], "uid": c["uid"], "unit": c["ownerUnit"], "receivedOn": c["receivedOn"]},
                                "earlier": {"id": p["id"], "uid": p["uid"], "unit": p["ownerUnit"], "closedOn": p["lastActionOn"], "how": p.get("disposalType")},
                                "institution": st.inst_by[c["institutionId"]]["name"], "institutionId": c["institutionId"],
                                "text": f"{c['uid']} ({c['ownerUnit']}) arrived {days_between(p['lastActionOn'], c['receivedOn'])} days after {p['uid']} ({p['ownerUnit']}) was closed, "
                                        f"on the same {'complaint number' if same_ref else 'issue'} ({category_label(c['category']).lower()})."})
    since = add_days(st.today, -180)
    groups: dict[tuple[str, str], list[dict]] = {}
    for c in st.cases:
        if not c.get("institutionId") or c["receivedOn"] < since:
            continue
        tags = tag_issues(c["summary"], c["category"])
        if tags:
            groups.setdefault((c["institutionId"], tags[0]["issue"]), []).append({**c, "_label": tags[0]["label"]})
    systemic = []
    for (iid, _), cs in groups.items():
        if len(cs) >= 3:
            units = list(dict.fromkeys(x["ownerUnit"] for x in cs))
            systemic.append({"institutionId": iid, "institution": st.inst_by[iid]["name"], "issue": cs[0]["_label"], "count": len(cs), "units": units,
                             "open": sum(1 for x in cs if L.is_active(x)), "cases": [{"id": x["id"], "uid": x["uid"], "unit": x["ownerUnit"], "stage": x["lifecycle"]} for x in cs],
                             "text": f"{len(cs)} complaints about {cs[0]['_label'].lower()} at {st.inst_by[iid]['name']} in 180 days, held by {', '.join(units)}."})
    systemic.sort(key=lambda s: -s["count"])
    return {"repeats": repeats, "systemic": systemic, "howCounted": "A repeat is a case received within 30 days after a closed case at the same institution on the same issue or "
            "complaint number. A systemic issue is three or more cases on one issue at one institution in 180 days (issue words from the case summary)."}


__all__ = ["preview", "policy_view", "propose", "decide_proposal", "closure_check", "radar"]
