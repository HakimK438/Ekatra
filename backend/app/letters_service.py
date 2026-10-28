"""Letters in, requests register out.

An officer pastes a letter; Ekatra reads the facts (engine/letters.py), finds the institution the same way as for a case
(IDs link on their own, a name is only a suggestion), and shows what other units have already asked that institution
(engine/demands.py). Nothing is saved until the officer records the request. The letter's text is never stored.
"""
from __future__ import annotations

import hashlib
import re
from typing import Any

from sqlalchemy import select

from . import models as m
from .engine import logic as L
from .engine import precheck
from .engine.dates import days_between, now_at, short_date, to_date
from .engine.demands import ITEM_LABEL, find_clashes, steps_from
from .engine.letters import KINDS, read_letter
from .errors import ApiError
from .services import audit, case_of, event, inst_of, plural, who
from .store import State

KIND_LABEL = {k: label for k, label, _ in KINDS} | {"other": "Other letter"}
MAX_LETTER_CHARS = 20000
WRITERS = ("dealing_officer", "nodal_officer", "coordinator", "data_steward")


def demand_to_dict(r: m.Demand, today: str) -> dict:
    late = days_between(r.due_on, today) if r.state == "open" and r.due_on else 0
    return {
        "id": r.id, "institutionId": r.institution_id, "unit": r.unit, "caseId": r.case_id, "kind": r.kind, "kindLabel": KIND_LABEL.get(r.kind, r.kind),
        "letterRef": r.letter_ref, "letterDate": r.letter_date, "items": list(r.items or []), "itemLabels": [ITEM_LABEL.get(k, k) for k in r.items or []],
        "otherItems": list(r.other_items or []), "dueOn": r.due_on, "hearingOn": r.hearing_on, "hearingWhat": r.hearing_what, "state": r.state,
        "answeredOn": r.answered_on, "note": r.note, "source": r.source, "by": r.by, "at": r.at, "daysLate": max(0, late),
    }


def _rows(st: State, iid: str | None = None) -> list[m.Demand]:
    q = select(m.Demand).order_by(m.Demand.letter_date, m.Demand.id)
    if iid:
        q = q.where(m.Demand.institution_id == iid)
    return list(st.db.scalars(q).all())


def _scheduled(st: State, iid: str) -> list[dict]:
    """Booked hearings and visits on the institution's open cases (the same steps the collision calendar shows)."""
    acts = precheck.dated_actions([c for c in st.cases if c.get("institutionId") == iid], st.today)
    return [{"date": a["date"], "unit": a["unit"], "what": a["what"]} for a in acts if a["kind"] == "hearing"]


def register_for(st: State, iid: str, focus: dict | None = None) -> dict:
    """An institution's requests from every unit, and the findings where they meet."""
    ds = [demand_to_dict(r, st.today) for r in _rows(st, iid)]
    steps = steps_from([*ds, *([focus] if focus else [])], _scheduled(st, iid))
    return {"requests": ds, "findings": find_clashes(ds, steps, st.today, focus)}


def _resolve(st: State, facts: dict) -> dict:
    ids, name = facts["ids"], facts["institutionName"]
    rec = {"name": name["value"] if name else "", "district": name.get("district") if name else None,
           "permanentId": ids.get("permanentId", {}).get("value"), "currentId": (ids.get("currentId") or ids.get("aisheCode") or {}).get("value")}
    if not (rec["name"] or rec["permanentId"] or rec["currentId"]):
        return {"institution": None, "method": None, "evidence": ["The letter names no institution and has no Permanent ID."], "suggestions": []}
    res = L.resolve_institution(rec, st.insts)
    inst = inst_of(st, res.get("institutionId"))
    return {"institution": inst, "method": res.get("method"), "evidence": res["evidence"],
            "suggestions": [] if inst else [{**s, "institution": st.inst_by[s["institutionId"]]} for s in res["suggestions"]]}


def _linked_case(st: State, facts: dict, iid: str | None) -> dict | None:
    """The case the letter belongs to: its file or case number is a unit's case number, or its CPGRAMS number is on a case."""
    for ref in facts["refs"]:
        v = L.normalise_id(ref["value"])
        for c in st.cases:
            if (iid is None or c.get("institutionId") == iid) and (L.normalise_id(c["sourceRef"]) == v or (c.get("sourceComplaintRef") and L.normalise_id(c["sourceComplaintRef"]) == v)):
                return {"id": c["id"], "uid": c["uid"], "unit": c["ownerUnit"], "stage": c["lifecycle"], "from": ref["value"]}
    return None


def letter_hash(text: str) -> str:
    return hashlib.sha256(" ".join(text.split()).lower().encode("utf-8")).hexdigest()


def read(st: State, text: str, user: dict) -> dict:
    """POST /letters/read. Reads the facts and shows what other units already asked. Nothing is saved."""
    text = (text or "").strip()
    if len(text) < 40:
        raise ApiError(422, "validation_error", "Paste the letter's full text (at least a few lines).")
    if len(text) > MAX_LETTER_CHARS:
        raise ApiError(413, "too_large", f"A letter can have at most {MAX_LETTER_CHARS} characters. Paste the first pages.")
    facts = read_letter(text, st.units)
    found = _resolve(st, facts)
    case = _linked_case(st, facts, None)
    if not found["institution"] and case:
        c = st.case(case["id"])
        if c.get("institutionId") and c["matchState"] in ("resolved_auto", "resolved_confirmed"):
            # A reference number already on a matched case is as good as an ID: that case's institution.
            found = {"institution": st.inst_by[c["institutionId"]], "method": "case_ref", "suggestions": [],
                     "evidence": [f"Reference {case['from']} is on case {c['uid']} ({c['ownerUnit']}), already matched to this institution"]}
    inst = found["institution"]
    unit = (facts["unit"] or {}).get("unit") or user.get("unit")
    draft = {"id": "draft", "unit": unit, "letterDate": (facts["letterDate"] or {}).get("on") or st.today, "items": [i["key"] for i in facts["items"]],
             "dueOn": (facts["dueOn"] or {}).get("on"), "hearingOn": (facts["hearing"] or {}).get("on"), "hearingWhat": (facts["hearing"] or {}).get("what"),
             "state": "open", "letterRef": next((r["value"] for r in facts["refs"] if r["kind"] in ("file_no", "case_no")), None)}
    dup = st.db.scalars(select(m.Demand).where(m.Demand.letter_sha256 == letter_hash(text))).first()
    out: dict[str, Any] = {"facts": facts, "match": found, "draft": draft, "case": case if case and (not inst or st.case(case["id"]).get("institutionId") == inst["id"]) else None,
                           "alreadyRecorded": demand_to_dict(dup, st.today) if dup else None, "openCases": [], "requests": [], "findings": []}
    if inst and unit:
        reg = register_for(st, inst["id"], draft)
        out.update(requests=reg["requests"], findings=reg["findings"])
        out["openCases"] = [{"id": c["id"], "uid": c["uid"], "unit": c["ownerUnit"], "stage": c["lifecycle"], "category": c["category"]}
                            for c in st.cases if c.get("institutionId") == inst["id"] and L.is_active(c)]
    return out


def _iso(v: str | None, what: str) -> str | None:
    if not v:
        return None
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
        raise ApiError(422, "validation_error", f"Write the {what} as YYYY-MM-DD.")
    try:
        to_date(v)
    except ValueError:
        raise ApiError(422, "validation_error", f"The {what} is not a real date.") from None
    return v


def create(st: State, b: dict, user: dict) -> dict:
    """POST /requests. Records what a unit asked an institution for. Audited; shown to every unit that works on the institution."""
    if user["role"] not in WRITERS:
        raise ApiError(403, "forbidden", "Only unit officers, the coordinator and the data steward can record requests.")
    unit = user.get("unit") if user["role"] in ("dealing_officer", "nodal_officer") else b.get("unit")
    if user["role"] in ("dealing_officer", "nodal_officer") and b.get("unit") and b["unit"] != unit:
        raise ApiError(403, "forbidden", f"Officers of {unit} can record only {unit}'s own letters.")
    if not unit or unit not in {u["code"] for u in st.units}:
        raise ApiError(422, "validation_error", "Choose the unit that sent the letter.")
    inst = inst_of(st, b.get("institutionId"))
    if not inst:
        raise ApiError(422, "validation_error", "Choose the institution the letter was sent to.")
    letter_date = _iso(b.get("letterDate"), "letter date")
    if not letter_date or letter_date > st.today:
        raise ApiError(422, "validation_error", "The letter date is needed and cannot be in the future.")
    due = _iso(b.get("dueOn"), "reply date")
    if due and due < letter_date:
        raise ApiError(422, "validation_error", "The reply date cannot be before the letter date.")
    hearing = _iso(b.get("hearingOn"), "hearing date")
    items = list(dict.fromkeys(b.get("items") or []))
    if any(k not in ITEM_LABEL for k in items):
        raise ApiError(422, "validation_error", "One of the documents asked for is not on the list.")
    other = [" ".join(str(x).split())[:200] for x in b.get("otherItems") or [] if str(x).strip()][:20]
    if not items and not other and b.get("kind") not in ("hearing_notice", "inspection", "closure"):
        raise ApiError(422, "validation_error", "Say what the institution is asked to send or do.")
    kind = b.get("kind") or "other"
    if kind not in KIND_LABEL:
        raise ApiError(422, "validation_error", "Choose what kind of letter this is.")
    case_id = b.get("caseId")
    if case_id:
        c = case_of(st, case_id)
        if c.get("institutionId") != inst["id"]:
            raise ApiError(422, "validation_error", "That case belongs to another institution.")
        if c["ownerUnit"] != unit:
            raise ApiError(422, "validation_error", f"That case is held by {c['ownerUnit']}, not by {unit}.")
    sha = letter_hash(b["text"]) if b.get("text") else None
    if sha and st.db.scalars(select(m.Demand).where(m.Demand.letter_sha256 == sha)).first():
        raise ApiError(409, "conflict", "This letter has already been recorded.")
    ref = (b.get("letterRef") or "").strip()[:80] or None
    r = m.Demand(institution_id=inst["id"], unit=unit, case_id=case_id, kind=kind, letter_ref=ref, letter_date=letter_date, items=items, other_items=other,
                 due_on=due, hearing_on=hearing, hearing_what=(b.get("hearingWhat") or "").strip()[:80] or None, state="open", note="",
                 source="letter" if b.get("text") else "form", letter_sha256=sha, by=who(user), at=now_at(st.today))
    st.db.add(r)
    st.db.flush()
    asked = ", ".join(ITEM_LABEL[k].lower() for k in items) or "; ".join(other) or KIND_LABEL[kind].lower()
    when = f", reply by {due}" if due else ""
    ref_audit = audit(st, who(user), "Request recorded", inst["name"], f"{unit} {KIND_LABEL[kind].lower()} of {letter_date}{f' ({ref})' if ref else ''}: {asked}{when}")
    if case_id:
        c = case_of(st, case_id)
        event(c, "action_recorded", st.today, who(user), f"{KIND_LABEL[kind]} sent to the institution{when.replace(', reply', '; reply')}", ref_audit)
        st.save_case(c)
    d = demand_to_dict(r, st.today)
    reg = register_for(st, inst["id"], d)
    return {"request": d, "findings": reg["findings"]}


def _need_owner(st: State, r: m.Demand, user: dict, what: str) -> None:
    if user["role"] == "coordinator" or (user["role"] in ("dealing_officer", "nodal_officer") and user.get("unit") == r.unit):
        return
    raise ApiError(403, "forbidden", f"Only officers of {r.unit} or the coordinator can {what}.")


def _get(st: State, rid: int) -> m.Demand:
    r = st.db.get(m.Demand, rid)
    if not r:
        raise ApiError(404, "not_found", "This request could not be found.")
    return r


def answered(st: State, rid: int, on: str | None, note: str, user: dict) -> dict:
    """The institution replied. Other units can now see that the document exists and when it was sent."""
    r = _get(st, rid)
    _need_owner(st, r, user, "mark this request answered")
    if r.state != "open":
        raise ApiError(422, "validation_error", "This request is not open.")
    day = _iso(on, "reply date") or st.today
    if day > st.today or day < r.letter_date:
        raise ApiError(422, "validation_error", "The reply date must be between the letter date and today.")
    r.state, r.answered_on, r.note = "answered", day, note.strip()[:500]
    audit(st, who(user), "Request answered", st.inst_by[r.institution_id]["name"], f"{r.unit} request of {r.letter_date} answered on {day}" + (f": {r.note}" if r.note else ""))
    return demand_to_dict(r, st.today)


def withdraw(st: State, rid: int, reason: str, user: dict) -> dict:
    r = _get(st, rid)
    _need_owner(st, r, user, "withdraw this request")
    if r.state != "open":
        raise ApiError(422, "validation_error", "This request is not open.")
    if not reason.strip():
        raise ApiError(422, "validation_error", "Add a reason.")
    r.state, r.note = "withdrawn", reason.strip()[:500]
    audit(st, who(user), "Request withdrawn", st.inst_by[r.institution_id]["name"], f"{r.unit} request of {r.letter_date} withdrawn: {r.note}")
    return demand_to_dict(r, st.today)


def listing(st: State, user: dict, iid: str | None, unit: str | None, state: str | None) -> dict:
    """GET /requests. Every request, newest first, with the findings for each institution that has them."""
    rows = [demand_to_dict(r, st.today) for r in _rows(st, iid)]
    by_inst: dict[str, list[dict]] = {}
    for d in rows:
        by_inst.setdefault(d["institutionId"], []).append(d)
    findings: dict[str, list[dict]] = {}
    for i, ds in by_inst.items():
        f = find_clashes(ds, steps_from(ds, _scheduled(st, i)), st.today)
        if f:
            findings[i] = f
    shown = [d for d in rows if (not unit or d["unit"] == unit) and (not state or d["state"] == state)]
    shown.sort(key=lambda d: (d["letterDate"], d["id"]), reverse=True)
    open_ = [d for d in rows if d["state"] == "open"]
    return {
        "rows": [{**d, "institution": st.inst_by[d["institutionId"]]["name"], "findings": [f for f in findings.get(d["institutionId"], []) if d["id"] in f["demandIds"]]} for d in shown],
        "counts": {"open": len(open_), "late": sum(1 for d in open_ if d["daysLate"] > 0),
                   "institutionsWithFindings": len(findings), "askedAgain": sum(1 for fs in findings.values() for f in fs if f["code"] == "D1")},
        "items": [{"key": k, "label": v} for k, v in ITEM_LABEL.items()],
        "kinds": [{"key": k, "label": v} for k, v in KIND_LABEL.items()],
    }


def sweep_alerts(st: State) -> dict[str, dict]:
    """For the hourly check: an institution's reply that is past its date goes to the unit that asked."""
    out = {}
    for r in st.db.scalars(select(m.Demand).where(m.Demand.state == "open")).all():
        if r.due_on and days_between(r.due_on, st.today) > 0:
            late = days_between(r.due_on, st.today)
            out[f"request:{r.id}"] = {"case_id": r.case_id, "owner_unit": r.unit, "kind": "request_overdue", "ref": str(r.id),
                                      "message": f"{st.inst_by[r.institution_id]['name']} has not replied to {r.unit}’s letter of {short_date(r.letter_date)}; {plural(late, 'day')} past the reply date"}
    return out
