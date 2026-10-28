"""Business rules: deadlines, overlap detection (O1-O5), institution matching (T1-T3) and dashboard counts.

A faithful port of the tested frontend rules (frontend/src/lib/logic.ts), so the backend and the demo behave the same.
Cases and institutions are plain dicts in the same camelCase shape the frontend uses.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from .dates import add_days, days_between, iso, js_round, to_date
from .labels import category_label

Case = dict[str, Any]
Inst = dict[str, Any]

PROTOTYPE_LABEL = "Prototype setting — not an AICTE-approved timeline"
OVERLAP_TITLE = "Potential Overlapping Cases — Coordination Required"

# The single table of tunable rules (defaults, limits, labels). The frontend keeps an identical copy, checked by a test.
RULES: list[dict[str, Any]] = json.loads(Path(__file__).with_name("rules.json").read_text(encoding="utf-8"))
DEFAULTS: dict[str, Any] = {r["key"]: r["default"] for r in RULES if r["key"]}
# Live values: the defaults, with whatever an administrator has changed on top (see rules.apply).
SETTINGS: dict[str, Any] = dict(DEFAULTS)

AGEING: list[dict[str, Any]] = [
    {"label": "0–7 d", "max": 7}, {"label": "8–21 d", "max": 21}, {"label": "22–45 d", "max": 45},
    {"label": "46–90 d", "max": 90}, {"label": ">90 d", "max": float("inf")},
]


def stage_since(c: Case) -> str:
    """The day the case entered the stage it is in now, from its own history (not from the day it was received)."""
    for e in reversed(c["events"]):
        if e["type"] in ("status_changed", "escalated", "reopened"):
            return str(e["at"])
    return str(c["receivedOn"])


def is_active(c: Case) -> bool:
    """Open: not disposed and not transferred away. Transfers are counted apart, never as open or disposed."""
    return c["lifecycle"] not in ("disposed", "transferred")


is_open = is_active  # one definition of "open" everywhere, so the management chart, Reports and Data health agree


# ---------- Permissions (enforced in every endpoint, never only in the UI) ----------
def can_decide(u: dict, units: list[str]) -> bool:
    return u["role"] == "coordinator" or (u["role"] == "nodal_officer" and bool(u.get("unit")) and u["unit"] in units)


def can_act_on_case(u: dict, c: Case) -> bool:
    return u["role"] in ("dealing_officer", "nodal_officer") and u.get("unit") == c["ownerUnit"]


def can_confirm_match(u: dict) -> bool:
    return u["role"] in ("coordinator", "data_steward")


# ---------- Deadlines ----------
def deadline_for(c: Case, today: str) -> dict:
    cp = c["channel"] == "CPGRAMS"
    closed = c["lifecycle"] in ("disposed", "transferred")
    days = SETTINGS["cpgramsDays"] if cp else SETTINGS["defaultDays"]
    return dict(_deadline(cp, c["receivedOn"], closed, today, days, SETTINGS["cpgramsInterimDay"], SETTINGS["approachingPct"]))


@lru_cache(maxsize=16384)  # called several times per case per request; the answer depends only on these values
def _deadline(cp: bool, received: str, closed: bool, today: str, days: int, interim_day: int, pct: float) -> dict:
    age = days_between(received, today)
    due_on = add_days(received, days)
    days_to_due = days_between(today, due_on)
    base = {
        "age": age, "days": days, "dueOn": due_on, "daysToDue": days_to_due,
        "interimDay": interim_day if cp else None,
        "verified": cp,
        "basis": "Verified: DARPG guidelines 23 Aug 2024 (CPGRAMS cases only)" if cp else PROTOTYPE_LABEL,
    }
    if closed:
        return {**base, "state": "closed", "interimDue": False}
    interim_due = cp and interim_day <= age <= days
    if age > days:
        state = "overdue"
    elif age >= days * pct:
        state = "approaching"
    else:
        state = "on_track"
    return {**base, "state": state, "interimDue": interim_due}


def escalation_for(d: dict) -> dict:
    """Who should be chasing an overdue case: owner, then nodal officer (+7 days), then senior management (+7 more)."""
    late = -d["daysToDue"] if d["state"] == "overdue" else 0
    step = SETTINGS["escalateAfterOverdue"]
    level = 2 if late >= step * 2 else 1 if late >= step else 0
    return {"level": level, "late": late, "label": ["With the dealing officer", "Raised to the nodal officer", "Raised to senior management"][level]}


# ---------- Overlap detection ----------
_RB, _GR = "regulation_bureau", "grievance_cell"


def detect_overlaps(cases: list[Case], units: list[dict], today: str) -> list[dict]:
    """One alert per institution: every rule that fired and every case involved.

    The alert id (fingerprint) is the institution plus the sorted case ids, so when a new case joins,
    the alert comes back for review once.
    """
    kind_of = {u["code"]: u["kind"] for u in units}
    by_inst: dict[str, list[Case]] = {}
    for c in cases:
        if c.get("institutionId"):
            by_inst.setdefault(c["institutionId"], []).append(c)

    found: dict[str, dict] = {}

    def add(inst_id: str, ids: list[str], rule: dict) -> None:
        f = found.setdefault(inst_id, {"ids": set(), "rules": []})
        f["ids"].update(ids)
        if not any(r["code"] == rule["code"] for r in f["rules"]):
            f["rules"].append(rule)

    for inst_id, lst in by_inst.items():
        active = [c for c in lst if is_active(c)]
        owners = {c["ownerUnit"] for c in active}
        pg = [c for c in active if kind_of.get(c["ownerUnit"]) == _GR]
        rb = [c for c in active if kind_of.get(c["ownerUnit"]) == _RB]

        o1 = False
        if pg and rb:
            o1 = True
            add(inst_id, [c["id"] for c in pg + rb], {
                "code": "O1", "severity": "High",
                "why": "A Grievance Cell (PGRC) case and a Regulation Bureau case are both open for the same institution, so two units may act on one matter.",
                "nextStep": "PGRC and RB nodal officers to compare the cases and decide whether one unit should lead.",
            })
        if not o1 and len(owners) >= 2:
            add(inst_id, [c["id"] for c in active], {
                "code": "O2", "severity": "Medium",
                "why": f"Open cases are held by {len(owners)} different units for the same institution.",
                "nextStep": "Nodal officers of the involved units to check whether the cases concern the same matter.",
            })

        by_cat: dict[str, list[Case]] = {}
        for c in lst:
            if c["lifecycle"] == "transferred":
                continue
            if c["lifecycle"] == "disposed" and days_between(c["lastActionOn"], today) > SETTINGS["o3WindowDays"]:
                continue
            by_cat.setdefault(c["category"], []).append(c)
        for cat, g in by_cat.items():
            n_units = len({c["ownerUnit"] for c in g})
            if n_units >= 2 and any(is_active(c) for c in g):
                add(inst_id, [c["id"] for c in g], {
                    "code": "O3", "severity": "Medium",
                    "why": f"The same category ({category_label(cat).lower()}) appears in {n_units} units within {SETTINGS['o3WindowDays']} days.",
                    "nextStep": "Review whether the earlier case already covers the new one before more work is done.",
                })

        pending = [c for c in active if c["lifecycle"] in ("awaiting_party", "inspection_hearing")]
        for n in [c for c in active if days_between(c["receivedOn"], today) <= SETTINGS["o4NewWithinDays"]]:
            others = [p for p in pending if p["ownerUnit"] != n["ownerUnit"]]
            if others:
                add(inst_id, [n["id"]] + [p["id"] for p in others], {
                    "code": "O4", "severity": "High",
                    "why": "A newly received case arrived while another unit has a regulatory step pending (notice sent or inspection/hearing stage).",
                    "nextStep": "Inform the unit running the pending step and agree who should respond, before any parallel action.",
                })

        by_ref: dict[str, list[Case]] = {}
        for c in lst:
            if c.get("sourceComplaintRef"):
                by_ref.setdefault(c["sourceComplaintRef"], []).append(c)
        for ref, g in by_ref.items():
            if len({c["ownerUnit"] for c in g}) >= 2:
                add(inst_id, [c["id"] for c in g], {
                    "code": "O5", "severity": "High",
                    "why": f"Complaint reference {ref} is held by more than one unit — likely duplicate, please confirm.",
                    "nextStep": "Confirm whether these are the same complaint; if so record a duplicate decision (owners close their own case).",
                })

    out = []
    for inst_id, f in found.items():
        ids = sorted(f["ids"])
        rules = sorted(f["rules"], key=lambda r: r["code"])
        out.append({
            "id": f"{inst_id}|{','.join(ids)}", "institutionId": inst_id, "caseIds": ids, "rules": rules,
            "severity": "High" if any(r["severity"] == "High" for r in rules) else "Medium", "title": OVERLAP_TITLE,
        })
    return sorted(out, key=lambda a: 0 if a["severity"] == "High" else 1)  # stable: High first


def pair_edges(cases_by_id: dict[str, Case], alert: dict) -> list[dict]:
    """Which cases of an alert are related to each other by pair-level evidence (same complaint number or issue)."""
    from .insights import shared_issues  # local import: insights uses logic helpers too

    ids = alert["caseIds"]
    edges = []
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            a, b = cases_by_id[ids[i]], cases_by_id[ids[j]]
            if a["ownerUnit"] == b["ownerUnit"]:
                continue
            evidence = []
            if a.get("sourceComplaintRef") and a.get("sourceComplaintRef") == b.get("sourceComplaintRef"):
                evidence.append(f"Same complaint number {a['sourceComplaintRef']}")
            for s in shared_issues([a, b]):
                evidence.append(f"Same issue: {s['label']}")
            if evidence:
                edges.append({"a": a["id"], "b": b["id"], "evidence": evidence})
    return edges


# ---------- Institution matching ----------
_ABBR = {
    "engg": "engineering", "eng": "engineering", "inst": "institute", "tech": "technology", "mgmt": "management",
    "poly": "polytechnic", "govt": "government", "coll": "college", "univ": "university",
}
_STOP = {"the", "of", "and", "trust", "society", "education", "educational", "a"}


def normalise_id(s: str) -> str:
    """Trim, upper-case, and unify spaces, underscores and unicode dashes so '1 2201455' equals '1-2201455'."""
    return re.sub(r"[\s_‐-―−]+", "-", s.strip().upper())


def normalise_name(s: str) -> list[str]:
    toks = [t for t in re.sub(r"[^a-z0-9 ]", " ", s.lower()).split() if t]
    return [t for t in (_ABBR.get(t, t) for t in toks) if t not in _STOP]


def _bigrams(s: str) -> set[str]:
    return {s[i:i + 2] for i in range(len(s) - 1)}


def name_score(a: str, b: str) -> float:
    ta, tb = set(normalise_name(a)), set(normalise_name(b))
    if not ta or not tb:
        return 0.0
    inter = len(ta & tb)
    token_set = inter / min(len(ta), len(tb)) * 0.5 + inter / len(ta | tb) * 0.5
    # Same order as the frontend: the joined string follows the order tokens first appear in.
    ba, bb =_bigrams("".join(_ordered(normalise_name(a)))), _bigrams("".join(_ordered(normalise_name(b))))
    dice = (2 * len(ba & bb)) / ((len(ba) + len(bb)) or 1)
    return 0.6 * token_set + 0.4 * dice


def _ordered(tokens: list[str]) -> list[str]:
    seen: dict[str, None] = {}
    for t in tokens:
        seen.setdefault(t, None)
    return list(seen)


def suggestions_for(recorded: dict, insts: list[Inst], rejected: list[str] | None = None) -> list[dict]:
    """T3: ranked name suggestions. Nothing is linked from these; a person confirms (T4)."""
    out = []
    for i in insts:
        if rejected and i["id"] in rejected:
            continue
        base = name_score(recorded["name"], i["name"])
        evidence = [f"Name similarity {base:.2f} after normalisation"]
        s = base
        if recorded.get("district"):
            same = recorded["district"].lower() == i["district"].lower()
            s += 0.02 if same else -0.05
            evidence.append(f"Same district ({i['district']})" if same else f"District differs (recorded {recorded['district']}, institution {i['district']})")
        if recorded.get("pin"):
            same = recorded["pin"] == i["pin"]
            s += 0.01 if same else -0.01
            evidence.append("Same PIN" if same else "PIN differs")
        s = max(0.0, min(1.0, s))
        if s >= SETTINGS["suggestMinScore"]:
            out.append({"institutionId": i["id"], "score": round(s, 2), "evidence": evidence})
    return sorted(out, key=lambda x: -x["score"])[: SETTINGS["topN"]]


def resolve_institution(rec: dict, insts: list[Inst]) -> dict:
    """T1 exact Permanent ID; T2 a VERIFIED alternate identifier; T3 suggestions only (nothing linked)."""
    if rec.get("permanentId"):
        want = normalise_id(rec["permanentId"])
        for i in insts:
            if normalise_id(i["permanentId"]) == want:
                return {"state": "resolved_auto", "method": "T1_exact", "institutionId": i["id"], "suggestions": [],
                        "evidence": [f"Recorded Permanent ID {i['permanentId']} matches exactly"]}
    if rec.get("currentId"):
        want = normalise_id(rec["currentId"])
        for i in insts:
            for x in i["identifiers"]:
                if x["verified"] and x["type"] != "former_name" and normalise_id(x["value"]) == want:
                    label = "AISHE code" if x["type"] == "aishe_code" else "Current ID"
                    return {"state": "resolved_auto", "method": "T2_crosswalk", "institutionId": i["id"], "suggestions": [],
                            "evidence": ["No Permanent ID recorded", f"Recorded {label} {x['value']} matches a verified identifier of this institution"]}
    # A name a person already confirmed for this institution (T4) now resolves automatically, the same way as a verified ID.
    if rec.get("name"):
        want_name = " ".join(normalise_name(rec["name"]))
        for i in insts:
            for x in i["identifiers"]:
                if x["verified"] and x["type"] == "confirmed_alias" and " ".join(normalise_name(x["value"])) == want_name and want_name:
                    return {"state": "resolved_auto", "method": "T2_crosswalk", "institutionId": i["id"], "suggestions": [],
                            "evidence": ["No Permanent ID recorded", f"The name “{x['value']}” was confirmed by a person earlier, so it matches automatically"]}
    sug = suggestions_for(rec, insts)
    return {
        "state": "pending_review" if sug else "unresolved", "suggestions": sug,
        "evidence": ["No exact or verified identifier matched. Name suggestions need a coordinator to confirm."] if sug else ["No identifier and no close name match."],
    }


# ---------- Filtering and dashboard aggregates ----------
def filter_cases(cases: list[Case], f: dict, insts: list[Inst], units: list[dict], today: str) -> list[Case]:
    q = (f.get("q") or "").strip().lower()
    unit_region = {u["code"]: u.get("region") for u in units}
    inst_by = {i["id"]: i for i in insts}
    out = []
    for c in cases:
        inst = inst_by.get(c.get("institutionId"))
        if q:
            hay = " ".join(str(x) for x in [c["uid"], c["sourceRef"], c["recorded"]["name"], inst and inst["name"], inst and inst["permanentId"]] if x).lower()
            if q not in hay:
                continue
        if f.get("unit") and c["ownerUnit"] != f["unit"]:
            continue
        if f.get("region") and ((inst["region"] if inst else unit_region.get(c["ownerUnit"])) != f["region"]):
            continue
        if f.get("category") and c["category"] != f["category"]:
            continue
        if f.get("channel") and c["channel"] != f["channel"]:
            continue
        lc = f.get("lifecycle")
        lc = None if lc == "any" else lc
        if lc:
            if lc == "pending":
                bad = c["lifecycle"] != "received"
            elif lc == "under_process":
                bad = c["lifecycle"] not in ("under_examination", "awaiting_party", "inspection_hearing")
            elif lc == "active":
                bad = not is_active(c)
            elif lc == "open":
                bad = not is_open(c)
            else:
                bad = c["lifecycle"] != lc
            if bad:
                continue
        m = f.get("match")
        if m:
            bad = c["matchState"] not in ("pending_review", "unresolved") if m == "unresolved" else c["matchState"] != m
            if bad:
                continue
        if f.get("deadline") and deadline_for(c, today)["state"] != f["deadline"]:
            continue
        if f.get("from") and c["receivedOn"] < f["from"]:
            continue
        if f.get("to") and c["receivedOn"] > f["to"]:
            continue
        out.append(c)
    return out


def _group(lc: str) -> str:
    return {"received": "pending", "disposed": "disposed", "transferred": "transferred", "escalated": "escalated"}.get(lc, "under_process")


def age_bucket(age: int) -> int:
    lo = -1
    for i, b in enumerate(AGEING):
        if lo < age <= b["max"]:
            return i
        lo = b["max"]
    return len(AGEING) - 1


def summarise(cases: list[Case], alerts: list[dict], decisions: list[dict], insts: list[Inst], units: list[dict], today: str) -> dict:
    """Dashboard counts, computed from records. Transfers are counted apart and never as disposals."""
    open_ = [c for c in cases if is_open(c)]
    disposed = sum(1 for c in cases if c["lifecycle"] == "disposed")
    unit_codes = [u["code"] for u in units if any(c["ownerUnit"] == u["code"] for c in cases)]

    t = to_date(today)
    months = []
    y, m = t.year, t.month
    for i in range(11, -1, -1):
        mm = m - i
        yy = y + (mm - 1) // 12
        mm = (mm - 1) % 12 + 1
        months.append(f"{yy:04d}-{mm:02d}")
    trend = [{
        "month": mo,
        "disposed": sum(1 for c in cases if c["lifecycle"] == "disposed" and c["lastActionOn"].startswith(mo)),
        "transferred": sum(1 for c in cases if c["lifecycle"] == "transferred" and c["lastActionOn"].startswith(mo)),
    } for mo in months]

    inst_by = {i["id"]: i for i in insts}
    regions: dict[str, int] = {}
    for c in open_:
        r = inst_by[c["institutionId"]]["region"] if c.get("institutionId") in inst_by else "Unmatched"
        regions[r] = regions.get(r, 0) + 1

    workload = sorted(({"unit": u, "open": sum(1 for c in open_ if c["ownerUnit"] == u)} for u in unit_codes), key=lambda w: -w["open"])
    ageing = []
    for i, b in enumerate(AGEING):
        ageing.append({"bucket": b["label"], "count": sum(1 for c in open_ if age_bucket(days_between(c["receivedOn"], today)) == i)})
    decided_ids = {d["alertId"] for d in decisions}
    return {
        "total": len(cases),
        "pending": sum(1 for c in cases if _group(c["lifecycle"]) == "pending"),
        "underProcess": sum(1 for c in cases if _group(c["lifecycle"]) == "under_process"),
        "disposed": disposed,
        "transferred": sum(1 for c in cases if c["lifecycle"] == "transferred"),
        "escalated": sum(1 for c in cases if c["lifecycle"] == "escalated"),
        "overdue": sum(1 for c in cases if deadline_for(c, today)["state"] == "overdue"),
        "overlapsAwaiting": sum(1 for a in alerts if a["id"] not in decided_ids),
        "unresolvedMatches": sum(1 for c in cases if c["matchState"] in ("pending_review", "unresolved")),
        "disposalRate": disposed / (disposed + len(open_)) if disposed + len(open_) else 0,
        "workload": workload,
        "ageing": ageing,
        "regions": sorted(({"region": r, "count": n} for r, n in regions.items()), key=lambda x: -x["count"]),
        "trend": trend,
    }


def rule_performance(known: list[dict], decisions: list[dict]) -> list[dict]:
    """How often each overlap rule turned out to matter. Advisory only."""
    out = []
    for code in ["O1", "O2", "O3", "O4", "O5"]:
        fired = [a for a in known if any(r["code"] == code for r in a["rules"])]
        decided = []
        for a in fired:
            last = next((d for d in reversed(decisions) if d["alertId"] == a["id"]), None)
            if last and last["decision"] != "request_further_review":
                decided.append(last)
        not_related = sum(1 for d in decided if d["decision"] == "not_related")
        out.append({"code": code, "fired": len(fired), "decided": len(decided), "notRelated": not_related,
                    "dismissRate": (not_related / len(decided)) if decided else None})
    return out


def name_verdict(score: float) -> str:
    """Same (95 or more), Similar (75 to 94), Different (below 75)."""
    return "same" if score >= 0.95 else "similar" if score >= 0.75 else "different"


def compare_values(values: list[str | None]) -> str:
    norm = [(v or "").strip().lower() for v in values]
    if len(norm) < 2 or any(not v for v in norm):
        return "not_given"
    return "same" if all(v == norm[0] for v in norm) else "different"


def compare_fields(rec: dict, inst: Inst) -> dict:
    """Name check, field by field. A missing value is 'not given', never 'same'."""
    score = name_score(rec["name"], inst["name"])
    cur = next((i["value"] for i in inst["identifiers"] if i["type"] == "current_id" and i["verified"]), None)
    aishe = next((i["value"] for i in inst["identifiers"] if i["type"] == "aishe_code" and i["verified"]), None)
    rows = [
        {"label": "Name", "recorded": rec["name"], "institution": inst["name"], "verdict": name_verdict(score), "note": f"{js_round(score * 100)}% similar after tidying abbreviations"},
        {"label": "District", "recorded": rec.get("district") or "", "institution": inst["district"], "verdict": compare_values([rec.get("district"), inst["district"]])},
        {"label": "PIN", "recorded": rec.get("pin") or "", "institution": inst["pin"], "verdict": compare_values([rec.get("pin"), inst["pin"]])},
        {"label": "Current ID", "recorded": rec.get("currentId") or "", "institution": cur or "", "verdict": compare_values([re.sub(r"\s", "-", rec["currentId"]) if rec.get("currentId") else None, cur])},
        {"label": "Permanent ID", "recorded": rec.get("permanentId") or "", "institution": inst["permanentId"], "verdict": compare_values([rec.get("permanentId"), inst["permanentId"]])},
        {"label": "AISHE code", "recorded": "", "institution": aishe or "", "verdict": "not_given"},
    ]
    given = [r for r in rows if r["verdict"] != "not_given"]
    return {"rows": rows, "agree": sum(1 for r in given if r["verdict"] == "same"), "given": len(given), "nameScore": score}


def closure_checks(c: Case, decisions: list[dict]) -> list[str]:
    """Hints, never blocks: closures that may not reflect real resolution."""
    if c["lifecycle"] != "disposed":
        return []
    out = []
    if not any(e["type"] in ("action_recorded", "status_changed") for e in c["events"]):
        out.append("Closed with no action on record.")
    if c.get("disposalType") == "closed_as_duplicate_by_owner" and not any(d["decision"] == "duplicate" for d in decisions):
        out.append("Closed as a duplicate, but no one recorded a “same complaint” decision.")
    return out


__all__ = ["iso"]
