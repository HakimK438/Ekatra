"""Loading records into the plain dicts the engines use, and saving them back.

Each request loads the whole (small) dataset into a `State`, runs the pure engines on it and writes only what changed.
"""
from __future__ import annotations

from copy import deepcopy
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models as m
from .engine import rules
from .engine.dates import add_days, days_between
from .engine.logic import SETTINGS, detect_overlaps, is_active


def case_to_dict(r: m.Case) -> dict:
    d = {
        "id": r.id, "uid": r.uid, "sourceUnit": r.source_unit, "ownerUnit": r.owner_unit, "sourceRef": r.source_ref,
        "sourceComplaintRef": r.source_complaint_ref, "channel": r.channel, "receivedOn": r.received_on, "category": r.category,
        "summary": r.summary, "localStatus": r.local_status, "lifecycle": r.lifecycle, "officer": r.officer,
        "lastAction": r.last_action, "lastActionOn": r.last_action_on, "nextAction": r.next_action, "institutionId": r.institution_id,
        "recorded": deepcopy(r.recorded), "matchState": r.match_state, "matchMethod": r.match_method, "matchEvidence": deepcopy(r.match_evidence),
        "sensitive": deepcopy(r.sensitive), "events": deepcopy(r.events), "disposalType": r.disposal_type, "documents": deepcopy(r.documents or []),
        "scheduled": deepcopy(r.scheduled),
    }
    return d


def apply_case(r: m.Case, c: dict) -> None:
    r.owner_unit = c["ownerUnit"]
    r.summary = c["summary"]
    r.local_status = c["localStatus"]
    r.lifecycle = c["lifecycle"]
    r.officer = c.get("officer")
    r.last_action = c["lastAction"]
    r.last_action_on = c["lastActionOn"]
    r.next_action = c["nextAction"]
    r.institution_id = c.get("institutionId")
    r.recorded = c["recorded"]
    r.match_state = c["matchState"]
    r.match_method = c.get("matchMethod")
    r.match_evidence = c["matchEvidence"]
    r.events = list(c["events"])  # new list object so the JSON change is detected
    r.disposal_type = c.get("disposalType")
    r.documents = list(c.get("documents") or [])
    r.scheduled = c.get("scheduled")


def public_case(c: dict) -> dict:
    """A case without complainant details. Lists, dashboards, reports and exports only ever see this."""
    return {k: v for k, v in c.items() if k != "sensitive"}


def inst_to_dict(r: m.Institution) -> dict:
    return {"id": r.id, "permanentId": r.permanent_id, "name": r.name, "type": r.type, "region": r.region, "state": r.state,
            "district": r.district, "pin": r.pin, "identifiers": deepcopy(r.identifiers or [])}


def decision_to_dict(r: m.Decision) -> dict:
    return {"id": r.id, "alertId": r.alert_id, "decision": r.decision, "leadUnit": r.lead_unit, "reason": r.reason, "by": r.by, "at": r.at,
            "followUp": r.follow_up}


def user_to_dict(r: m.User) -> dict:
    return {"id": r.id, "username": r.username, "name": r.name, "role": r.role, "unit": r.unit, "title": r.title}


def unit_to_dict(r: m.Unit) -> dict:
    d = {"code": r.code, "name": r.name, "kind": r.kind}
    if r.region:
        d["region"] = r.region
    return d


class State:
    """Everything one request needs, loaded once."""

    def __init__(self, db: Session, today: str) -> None:
        self.db, self.today = db, today
        rules.apply(get_json(db, "rule_overrides", {}))  # administrators' changes, so every request sees the same rules
        self.units = [unit_to_dict(u) for u in db.scalars(select(m.Unit)).all()]
        self.insts = [inst_to_dict(i) for i in db.scalars(select(m.Institution).order_by(m.Institution.id)).all()]
        self.inst_by = {i["id"]: i for i in self.insts}
        self._case_rows = {r.id: r for r in db.scalars(select(m.Case)).all()}
        self.cases = sorted((case_to_dict(r) for r in self._case_rows.values()), key=lambda c: int(c["id"][1:]))
        self.case_by = {c["id"]: c for c in self.cases}
        self.decision_rows = db.scalars(select(m.Decision).order_by(m.Decision.id)).all()
        self.decisions = [decision_to_dict(r) for r in self.decision_rows]
        self.rejected: dict[str, list[str]] = {}
        for r in db.scalars(select(m.RejectedSuggestion)).all():
            self.rejected.setdefault(r.case_id, []).append(r.institution_id)
        self.seen = {r.alert_id for r in db.scalars(select(m.AlertView)).all()}
        self._alerts: list[dict] | None = None

    # ----- overlaps -----
    def alerts(self) -> list[dict]:
        if self._alerts is None:
            self._alerts = detect_overlaps(self.cases, self.units, self.today)
        return self._alerts

    def invalidate(self) -> None:
        self._alerts = None
        self.case_by = {c["id"]: c for c in self.cases}

    def known_alerts(self) -> list[dict]:
        """Live alerts plus the snapshot of every alert a decision was recorded on (its case set may have changed since)."""
        known = {a["id"]: a for a in self.alerts()}
        for r in self.decision_rows:
            known.setdefault(r.alert_id, {"id": r.alert_id, "institutionId": r.institution_id, "caseIds": r.case_ids, "rules": r.rules, "severity": r.severity})
        return list(known.values())

    def history_of(self, alert_id: str) -> list[dict]:
        return [d for d in self.decisions if d["alertId"] == alert_id]

    def latest_decision(self, alert_id: str) -> dict | None:
        h = self.history_of(alert_id)
        return h[-1] if h else None

    def settled(self, alert_id: str) -> bool:
        d = self.latest_decision(alert_id)
        return d is not None and d["decision"] != "request_further_review"

    def case(self, cid: str) -> dict:
        return self.case_by[cid]

    def units_of(self, a: dict) -> list[str]:
        return list(dict.fromkeys(self.case(i)["ownerUnit"] for i in a["caseIds"] if i in self.case_by))

    def since_of(self, a: dict) -> str:
        dates = sorted(self.case(i)["receivedOn"] for i in a["caseIds"] if i in self.case_by and is_active(self.case(i)))
        return dates[-1] if dates else self.today

    def due_of(self, a: dict) -> str:
        return add_days(self.since_of(a), SETTINGS["coordDueDays"])

    def earlier_decision(self, a: dict) -> dict | None:
        """A new case joined an overlap that was already decided: the earlier decision is carried along."""
        prior = []
        for r in self.decision_rows:
            if r.alert_id != a["id"] and r.institution_id == a["institutionId"] and all(i in a["caseIds"] for i in r.case_ids):
                prior.append(decision_to_dict(r))
        return prior[-1] if prior else None

    def board_state(self, a: dict) -> str:
        if self.settled(a["id"]):
            return "decided"
        if days_between(self.due_of(a), self.today) > 0:
            return "escalated"
        if a["id"] in self.seen or self.latest_decision(a["id"]):
            return "in_review"
        return "waiting"

    def lanes_for(self, inst_id: str) -> list[dict]:
        return [{
            "id": c["id"], "uid": c["uid"], "unit": c["ownerUnit"], "lifecycle": c["lifecycle"], "category": c["category"],
            "start": c["receivedOn"], "end": c["lastActionOn"] if c["lifecycle"] in ("disposed", "transferred") else None,
        } for c in self.cases if c.get("institutionId") == inst_id]

    def alert_info_for(self, case_id: str) -> list[dict]:
        """Every overlap a case is part of, shaped for the Proof Trail (live ones, plus decided ones whose case set has changed)."""
        live = [a for a in self.alerts() if case_id in a["caseIds"]]
        old = [a for a in self.known_alerts() if case_id in a["caseIds"] and not any(l["id"] == a["id"] for l in live) and self.settled(a["id"])]
        return [{"id": a["id"], "rules": a["rules"], "units": self.units_of(a), "since": self.since_of(a), "decision": self.latest_decision(a["id"])} for a in [*old, *live]]

    # ----- saving -----
    def save_case(self, c: dict) -> None:
        apply_case(self._case_rows[c["id"]], c)


def get_json(db: Session, key: str, default: Any = None) -> Any:
    import json
    r = db.get(m.AppState, key)
    return json.loads(r.value) if r else default


def set_json(db: Session, key: str, value: Any) -> None:
    import json
    r = db.get(m.AppState, key)
    if r:
        r.value = json.dumps(value)
    else:
        db.add(m.AppState(key=key, value=json.dumps(value)))
