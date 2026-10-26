"""Loads the SYNTHETIC demo dataset (exported from the frontend fixtures) into the database.

Every record is fictional. Dates are shifted so the data is 'as of today': clocks, overdue counts and the demo story all look live.
Safe to run again: it clears the demo tables first (use it for 'Reset demo data').
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path

import bcrypt
from sqlalchemy import delete
from sqlalchemy.orm import Session

from . import models as m
from . import triggers
from .audit import GENESIS, chain_hash
from .config import settings
from .config import today as today_fn
from .engine.dates import add_days, days_between

DATA = Path(__file__).resolve().parent.parent / "scripts" / "seed_data.json"

# Formal designations. Every demo account shares the password in the DEMO_PASSWORD environment variable.
DEMO_USERS = [
    ("u1", "arao", "Anjali Rao", "nodal_officer", "PGRC", "Nodal Officer — Public Grievance Redressal Cell (PGRC)"),
    ("u2", "siyer", "Suresh Iyer", "nodal_officer", "RB-WR", "Nodal Officer — Regulation Bureau, Western Region (RB-WR)"),
    ("u3", "mkhan", "Meher Khan", "coordinator", None, "Cross-Unit Coordinator"),
    ("u4", "pnair", "Pradeep Nair", "dealing_officer", "PGRC", "Dealing Officer — Public Grievance Redressal Cell (PGRC)"),
    ("u5", "rdas", "Ritu Das", "senior_management", None, "Senior Management (view only)"),
    ("u6", "kmenon", "Kavya Menon", "data_steward", None, "Data Steward — Imports and Institution Records"),
    ("u7", "ishaikh", "Imran Shaikh", "admin", None, "System Administrator — Settings and Users"),
]

EVENT_ACTION = {
    "created": "Case registered", "imported": "Case imported", "status_changed": "Stage changed", "action_recorded": "Action recorded",
    "transferred": "Case transferred", "escalated": "Case escalated", "disposed": "Case closed", "reopened": "Case reopened",
    "linked": "Decision recorded", "match_resolved": "Institution matched",
}

CLEAR_ORDER = [m.CaseAlert, m.JobRun, m.Task, m.Decision, m.RejectedSuggestion, m.AlertView, m.ImportBatch, m.StatusMapping, m.SourceSync,
               m.AuditEvent, m.Case, m.Institution, m.User, m.Unit, m.AppState]


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt(rounds=10)).decode("ascii")


def seed(db: Session, today: str | None = None) -> dict:
    today = today or today_fn()
    data = json.loads(DATA.read_text(encoding="utf-8"))
    delta = days_between(data["today"], today)

    def shift(s: str | None) -> str | None:
        return None if s is None else add_days(s[:10], delta) + s[10:]

    # Resetting is a deliberate administrator action: lift the append-only trigger for this transaction only.
    triggers.remove(db.connection())
    for model in CLEAR_ORDER:
        db.execute(delete(model))
    db.flush()

    for u in data["units"]:
        db.add(m.Unit(code=u["code"], name=u["name"], kind=u["kind"], region=u.get("region")))
    pw = hash_password(settings.demo_password)
    for uid, username, name, role, unit, title in DEMO_USERS:
        db.add(m.User(id=uid, username=username, name=name, role=role, unit=unit, title=title, password_hash=pw))
    for i in data["institutions"]:
        db.add(m.Institution(id=i["id"], permanent_id=i["permanentId"], name=i["name"], type=i["type"], region=i["region"], state=i["state"],
                             district=i["district"], pin=i["pin"], identifiers=i["identifiers"]))
    db.flush()

    cases = data["cases"]
    for c in cases:
        for e in c["events"]:
            e["at"] = shift(e["at"])
        for d in c.get("documents", []) or []:
            d["at"] = shift(d["at"])
    for c in cases:
        db.add(m.Case(
            id=c["id"], uid=c["uid"], source_unit=c["sourceUnit"], owner_unit=c["ownerUnit"], source_ref=c["sourceRef"],
            source_complaint_ref=c.get("sourceComplaintRef"), channel=c["channel"], received_on=shift(c["receivedOn"]), category=c["category"],
            summary=c["summary"], local_status=c["localStatus"], lifecycle=c["lifecycle"], officer=c.get("officer"), last_action=c["lastAction"],
            last_action_on=shift(c["lastActionOn"]), next_action=c["nextAction"], institution_id=c.get("institutionId"), recorded=c["recorded"],
            match_state=c["matchState"], match_method=c.get("matchMethod"), match_evidence=c["matchEvidence"], sensitive=c["sensitive"],
            events=c["events"], disposal_type=c.get("disposalType"), documents=c.get("documents") or [],
            scheduled=({**c["scheduled"], "on": shift(c["scheduled"]["on"])} if c.get("scheduled") else None),
        ))
    for unit, words in data["statusMap"].items():
        for word, stage in words.items():
            db.add(m.StatusMapping(unit=unit, word=word, stage=stage))
    now = datetime.now()
    for s in data["sourceSync"]:
        db.add(m.SourceSync(unit=s["unit"], last_import_at=(now - timedelta(hours=s["lastImportHoursAgo"])).strftime("%Y-%m-%dT%H:%M")))
    for b in data["imports"]:
        db.add(m.ImportBatch(id=b["id"], unit=b["unit"], file_name=b["fileName"], by=b["by"], at=shift(b["at"]), rows=b["rows"], created=b["created"],
                             updated=b["updated"], rejected=b["rejected"], rejects=b["rejects"], auto_matched=b["autoMatched"],
                             names_to_check=b["namesToCheck"], new_overlaps=b["newOverlaps"], case_ids=b["caseIds"]))
    db.flush()

    # Rebuild the audit chain from the history already in the records, oldest first.
    past: list[tuple[dict | None, dict]] = [(c, e) for c in cases for e in c["events"]]
    for b in reversed(data["imports"]):
        past.append((None, {"type": "imported", "at": (shift(b["at"]) or "")[:10], "actor": b["by"], "text": f"{b['fileName']}: {b['rows']} rows, {b['rejected']} not saved"}))
    past.sort(key=lambda p: p[1]["at"])
    prev, seq = GENESIS, 0
    row_by_id = {c["id"]: c for c in cases}
    for c, e in past:
        seq += 1
        at = f"{e['at'][:10]}T09:00"
        actor = "Ekatra (automatic)" if e["actor"] == "system" else e["actor"]
        action = EVENT_ACTION.get(e["type"], e["type"]) if c else "Import finished"
        entity = c["uid"] if c else "import"
        h = chain_hash(prev, seq, at, actor, action, entity, e["text"])
        db.add(m.AuditEvent(seq=seq, at=at, actor=actor, action=action, entity=entity, details=e["text"], prev_hash=prev, hash=h))
        prev = h
        if c:
            e["auditRef"] = f"#{seq}"
    for c in cases:  # store the audit references on the case events
        case_row = db.get(m.Case, c["id"])
        assert case_row is not None
        case_row.events = list(row_by_id[c["id"]]["events"])
    db.flush()
    triggers.install(db.connection())
    return {"cases": len(cases), "institutions": len(data["institutions"]), "today": today, "audit": seq}
