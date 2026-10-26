"""The pre-action check and the collision calendar on the server, with the same expectations as the frontend tests."""


def body(**kw):
    return {"action": "reply", "institutionId": "inst-57", "unit": "PGRC", "category": "norm_violation", **kw}


def inst_id(c, name: str) -> str:
    return next(i["id"] for i in c.get("/api/v1/institutions?all=1").json()["rows"] if i["name"] == name)


def test_check_is_red_when_another_unit_handles_the_same_issue_and_names_whom_to_call(as_user):
    c = as_user("arao")
    sahyadri = inst_id(c, "Sahyadri Institute of Technology")
    r = c.post("/api/v1/check", json=body(institutionId=sahyadri)).json()
    assert r["light"] == "red" and r["askUnits"] == ["RB-WR"]
    assert r["contacts"] == [{"unit": "RB-WR", "name": "Suresh Iyer", "role": "Nodal officer"}]
    assert "never blocks" not in r["headline"] and r["because"]


def test_check_is_amber_for_a_different_issue_and_green_for_a_note(as_user):
    c = as_user("arao")
    sahyadri = inst_id(c, "Sahyadri Institute of Technology")
    assert c.post("/api/v1/check", json=body(institutionId=sahyadri, category="fee_refund")).json()["light"] == "amber"
    assert c.post("/api/v1/check", json=body(institutionId=sahyadri, action="record")).json()["light"] == "green"
    stage = c.post("/api/v1/check", json=body(institutionId=sahyadri, action="stage", category="fee_refund", targetStage="under_examination")).json()
    assert stage["light"] == "green"  # an internal step is not noticed by the other unit


def test_check_without_a_unit_or_with_an_unknown_institution_says_what_is_wrong(as_user):
    c = as_user("mkhan")  # the coordinator has no unit of their own
    assert c.post("/api/v1/check", json=body(unit=None)).status_code == 400
    assert as_user("arao").post("/api/v1/check", json=body(institutionId="nope")).status_code == 404


def test_calendar_marks_the_weeks_where_two_units_act_on_one_institution(as_user):
    c = as_user("arao")
    cal = c.get("/api/v1/calendar").json()
    by = {r["institution"]["name"]: r for r in cal["institutions"]}
    assert cal["from"] == "2026-10-23"
    sahyadri = by["Sahyadri Institute of Technology"]
    assert [x["kind"] for x in sahyadri["actions"]] == ["hearing", "interim"]  # RB-WR hearing on 2 Nov, then PGRC interim reply on 5 Nov
    assert len(sahyadri["collisions"]) == 1 and sorted(sahyadri["collisions"][0]["units"]) == ["PGRC", "RB-WR"]
    assert by["Aravali Institute of Management"]["collisions"]  # PGRC reply and the RB-NWR EVC visit fall in the same week
    assert not by.get("Hooghly Polytechnic", {"collisions": []})["collisions"]  # two units, but weeks apart
