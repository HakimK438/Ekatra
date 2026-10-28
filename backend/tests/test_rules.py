"""Rules are edited in one place (the database), by an administrator, with a reason and an audit entry."""
import json
from pathlib import Path

from app.engine import rules

FRONTEND_COPY = Path(__file__).resolve().parents[2] / "frontend" / "src" / "lib" / "rules.json"


def put(c, values, reason="Aligning with the new circular"):
    return c.put("/api/v1/settings/rules", json={"values": values, "reason": reason})


def non_cpgrams_days(c) -> int:
    cases = c.get("/api/v1/cases?page=1").json()["items"]
    case = next(x for x in cases if x["channel"] != "CPGRAMS" and x["lifecycle"] != "disposed")
    return c.get(f"/api/v1/cases/{case['id']}").json()["deadline"]["days"]


def test_frontend_copy_of_the_rules_table_is_identical():
    assert json.loads(FRONTEND_COPY.read_text(encoding="utf-8")) == rules.RULES


def test_defaults_are_served_and_verified_limits_are_locked(as_user):
    c = as_user("vjoshi")
    s = c.get("/api/v1/settings").json()
    cp = next(i for i in s["items"] if i["key"] == "cpgramsDays")
    assert (cp["current"], cp["verified"], cp["editable"], cp["changed"]) == (21, True, False, False)
    assert s["values"]["defaultDays"] == 30
    assert c.get("/api/v1/meta").json()["settings"]["defaultDays"] == 30
    r = put(c, {"cpgramsDays": 25})
    assert r.status_code == 400 and "verified" in r.json()["message"]


def test_admin_change_takes_effect_everywhere_and_is_audited(as_user):
    c = as_user("vjoshi")
    assert non_cpgrams_days(c) == 30
    s = put(c, {"defaultDays": 45, "approachingPct": 80}).json()
    assert s["values"]["defaultDays"] == 45 and s["values"]["approachingPct"] == 0.8
    assert next(i for i in s["items"] if i["key"] == "approachingPct")["value"] == "80%"
    assert next(i for i in s["items"] if i["key"] == "defaultDays")["changed"] is True
    assert c.get("/api/v1/meta").json()["settings"]["defaultDays"] == 45
    log = c.get("/api/v1/audit").json()["rows"]
    entry = next(e for e in log if e["action"] == "Rule changed")
    assert "30 days -> 45 days" in entry["details"] and "Aligning with the new circular" in entry["details"]
    assert as_user("mkhan").get("/api/v1/meta").json()["settings"]["defaultDays"] == 45
    assert non_cpgrams_days(as_user("mkhan")) == 45


def test_bad_values_are_refused_with_a_reason_to_fix(as_user):
    c = as_user("vjoshi")
    assert put(c, {"defaultDays": 0}).status_code == 400
    assert put(c, {"defaultDays": 12.5}).status_code == 400
    assert put(c, {"nonsense": 3}).status_code == 400
    assert put(c, {"defaultDays": 40}, reason=" ").status_code == 400
    assert put(c, {"defaultDays": 30}).status_code == 400  # same as now: nothing to change
    assert put(c, {"coordDueDays": 12}).status_code == 400  # would pass the second-level reminder (10 days)
    assert put(c, {"cpgramsInterimDay": 25}).status_code == 400  # interim reminder after the CPGRAMS limit


def test_only_administrators_can_change_rules(as_user):
    for u in ("arao", "mkhan", "rdas"):
        assert put(as_user(u), {"defaultDays": 40}).status_code == 403


def test_reset_puts_every_default_back(as_user):
    c = as_user("vjoshi")
    put(c, {"defaultDays": 45, "topN": 5})
    s = c.post("/api/v1/settings/rules/reset", json={"reason": "Back to defaults"}).json()
    assert s["values"]["defaultDays"] == 30 and s["values"]["topN"] == 3 and not any(i.get("changed") for i in s["items"])
    assert non_cpgrams_days(c) == 30
