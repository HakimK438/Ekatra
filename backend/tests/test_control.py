"""Policy console (propose, preview, approve by a second person), the closure check and the repeat radar."""


def test_preview_changes_nothing(as_user):
    admin = as_user("vjoshi")
    before = admin.get("/api/v1/meta").json()["settings"]["defaultDays"]
    r = admin.post("/api/v1/policy/preview", json={"values": {"defaultDays": 20}})
    assert r.status_code == 200, r.text
    over = next(c for c in r.json()["changes"] if c["key"] == "overdue")
    assert over["after"] >= over["before"]  # a shorter limit can only make more cases late
    assert admin.get("/api/v1/meta").json()["settings"]["defaultDays"] == before


def test_maker_and_checker(as_user):
    admin, senior = as_user("vjoshi"), as_user("rdas")
    assert as_user("arao").post("/api/v1/policy/proposals", json={"values": {"defaultDays": 20}, "reason": "Faster replies wanted"}).status_code == 403
    assert admin.post("/api/v1/policy/proposals", json={"values": {"defaultDays": 20}, "reason": "short"}).status_code == 422
    r = admin.post("/api/v1/policy/proposals", json={"values": {"defaultDays": 20}, "reason": "AICTE set 20 days for these complaints"})
    pid = r.json()["pending"][0]["id"]
    assert admin.get("/api/v1/meta").json()["settings"]["defaultDays"] == 30  # nothing changes before approval
    assert admin.post(f"/api/v1/policy/proposals/{pid}/decide", json={"approve": True}).status_code == 403  # the maker cannot check
    assert senior.post(f"/api/v1/policy/proposals/{pid}/decide", json={"approve": False}).status_code == 422  # a rejection needs a reason
    assert senior.post(f"/api/v1/policy/proposals/{pid}/decide", json={"approve": True}).json()["history"][0]["state"] == "approved"
    assert admin.get("/api/v1/meta").json()["settings"]["defaultDays"] == 20
    actions = {e["action"] for e in as_user("mkhan").get("/api/v1/audit").json()["rows"]}
    assert {"Rule change proposed", "Rule changed"} <= actions


def test_closure_check_names_the_facts(as_user):
    pgrc = as_user("arao")
    cid = next(c["id"] for c in pgrc.get("/api/v1/cases", params={"unit": "PGRC", "lifecycle": "under_examination"}).json()["items"])
    f = pgrc.post(f"/api/v1/cases/{cid}/closure-check", json={"reason": "Advised to approach the state government"}).json()
    assert any("another office" in x["text"] for x in f["facts"])
    f = pgrc.post(f"/api/v1/cases/{cid}/closure-check", json={"reason": "closed"}).json()
    assert any("does not say what was done" in x["text"] for x in f["facts"])


def test_radar_finds_the_repeat(as_user):
    r = as_user("mkhan").get("/api/v1/radar").json()
    assert any("arrived 8 days after" in x["text"] for x in r["repeats"])
    assert all(s["count"] >= 3 for s in r["systemic"])


def test_nodal_officer_marks_work(as_user):
    nodal, dealing = as_user("arao"), as_user("pnair")
    b = nodal.get("/api/v1/allocation").json()
    assert b["unit"] == "PGRC" and b["canMark"] and any(o["name"] == "Pradeep Nair" for o in b["officers"])
    cid = (b["unassigned"] or [{"id": next(c["id"] for o in b["officers"] for c in o["cases"])}])[0]["id"]
    assert dealing.post(f"/api/v1/cases/{cid}/mark", json={"officer": "Pradeep Nair"}).status_code == 403  # only the nodal officer marks
    assert as_user("siyer").post(f"/api/v1/cases/{cid}/mark", json={"officer": "Pradeep Nair"}).status_code == 403  # not another unit's nodal officer
    assert nodal.post(f"/api/v1/cases/{cid}/mark", json={"officer": "Somebody Else"}).status_code == 422
    r = nodal.post(f"/api/v1/cases/{cid}/mark", json={"officer": "Pradeep Nair", "note": "Fee matter, urgent"})
    assert r.status_code in (200, 422), r.text
    if r.status_code == 200:
        assert any(g["key"] == "mine" for g in dealing.get("/api/v1/digest").json()["groups"])
        other = next(o["name"] for o in b["officers"] if o["name"] != "Pradeep Nair")
        assert nodal.post(f"/api/v1/cases/{cid}/mark", json={"officer": other}).status_code == 422  # moving it needs a reason
        assert nodal.post(f"/api/v1/cases/{cid}/mark", json={"officer": other, "note": "Pradeep on leave"}).status_code == 200


def test_who_is_working_on_what(as_user):
    r = as_user("siyer").get("/api/v1/people").json()
    assert any(u["unit"] == "PGRC" for u in r["units"]) and r["total"] > 0
    assert all("sensitive" not in i and "complainant" not in i for u in r["units"] for o in u["officers"] for i in o["items"])
    sahyadri = next(a for a in r["alsoOnMine"] if a["institution"] == "Sahyadri Institute of Technology")
    assert any(o["unit"] == "PGRC" for o in sahyadri["others"])  # RB-WR sees PGRC is working on its institution
    assert as_user("siyer").get("/api/v1/people", params={"q": "sahyadri"}).json()["total"] < r["total"]
    assert as_user("vjoshi").get("/api/v1/people").status_code == 403  # the administrator sees no case content
