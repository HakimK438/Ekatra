"""The server runs the pre-action check at the moment of an action and records an ignored warning on the audit entry."""


def inst_id(c, name: str) -> str:
    return next(i["id"] for i in c.get("/api/v1/institutions?all=1").json()["rows"] if i["name"] == name)


def test_closing_a_case_against_a_warning_is_noted_in_the_audit_log_and_counted(as_user):
    c, reader = as_user("arao"), as_user("mkhan")  # only a coordinator, admin or senior manager reads the audit log
    before = c.get("/api/v1/summary").json()["overlaps"]["wentAhead"]
    sahyadri = inst_id(c, "Sahyadri Institute of Technology")
    case = next(x for x in c.get("/api/v1/cases?size=200").json()["items"] if x["institution"] and x["institution"]["id"] == sahyadri and x["ownerUnit"] == "PGRC" and x["lifecycle"] not in ("disposed", "transferred"))
    assert c.post(f"/api/v1/cases/{case['id']}/dispose", json={"type": "resolved", "reason": "Institution replied"}).status_code == 200
    assert c.get("/api/v1/summary").json()["overlaps"]["wentAhead"] == before + 1
    entries = reader.get("/api/v1/audit?action=Case closed").json()["rows"]
    assert any("Went ahead on a" in e["details"] and "RB-WR" in e["details"] for e in entries)


def test_a_clear_action_adds_no_warning_note(as_user):
    c = as_user("arao")
    before = c.get("/api/v1/summary").json()["overlaps"]["wentAhead"]
    case = next(x for x in c.get("/api/v1/cases?size=200").json()["items"] if x["ownerUnit"] == "PGRC" and not x["institution"] and x["lifecycle"] == "received")
    assert c.post(f"/api/v1/cases/{case['id']}/action", json={"text": "Noted", "next": ""}).status_code == 200
    assert c.get("/api/v1/summary").json()["overlaps"]["wentAhead"] == before
