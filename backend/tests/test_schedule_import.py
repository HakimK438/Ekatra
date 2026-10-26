"""Booking a date on a case, and the next-step columns and duplicate checks on a CSV import. These are what make the calendar real for a user's own data."""
from datetime import date, timedelta


def day(n: int) -> str:
    return (date(2026, 10, 23) + timedelta(days=n)).isoformat()  # the tests run on a fixed demo date


def row(ref: str, **kw) -> dict:
    return {"source_reference": ref, "received_on": day(-5), "channel": "CPGRAMS", "category": "fee_refund", "local_status": "Comments sought",
            "institution_name": "Sahyadri Institute of Technology", "permanent_id": "1-2210239", **kw}


def test_an_officer_can_book_and_clear_a_date_and_it_is_audited(as_user):
    c = as_user("arao")
    case = next(x for x in c.get("/api/v1/cases?size=200").json()["items"] if x["ownerUnit"] == "PGRC" and x["lifecycle"] not in ("disposed", "transferred"))
    r = c.post(f"/api/v1/cases/{case['id']}/schedule", json={"on": day(10), "what": "Hearing"})
    assert r.status_code == 200
    got = c.get(f"/api/v1/cases/{case['id']}").json()
    assert got["scheduled"] == {"on": day(10), "what": "Hearing"} and "Hearing" in got["nextAction"]
    assert c.post(f"/api/v1/cases/{case['id']}/schedule", json={"on": None}).status_code == 200
    assert c.get(f"/api/v1/cases/{case['id']}").json()["scheduled"] is None
    entries = as_user("mkhan").get("/api/v1/audit").json()["rows"]
    assert {"Date booked", "Date cleared"} <= {e["action"] for e in entries}


def test_a_past_date_or_a_missing_description_is_refused_with_a_reason(as_user):
    c = as_user("arao")
    case = next(x for x in c.get("/api/v1/cases?size=200").json()["items"] if x["ownerUnit"] == "PGRC" and x["lifecycle"] not in ("disposed", "transferred"))
    assert c.post(f"/api/v1/cases/{case['id']}/schedule", json={"on": day(-2), "what": "Hearing"}).status_code == 422
    assert c.post(f"/api/v1/cases/{case['id']}/schedule", json={"on": day(3), "what": ""}).status_code == 422
    assert c.post(f"/api/v1/cases/{case['id']}/schedule", json={"on": "03/11/2026", "what": "Hearing"}).status_code == 422


def test_only_the_owning_unit_can_book_a_date(as_user):
    owner, other = as_user("arao"), as_user("siyer")
    case = next(x for x in owner.get("/api/v1/cases?size=200").json()["items"] if x["ownerUnit"] == "PGRC" and x["lifecycle"] not in ("disposed", "transferred"))
    assert other.post(f"/api/v1/cases/{case['id']}/schedule", json={"on": day(5), "what": "Visit"}).status_code == 403


def test_import_reads_next_step_columns_and_shows_what_will_happen(as_user):
    c = as_user("arao")
    res = c.post("/api/v1/imports/check", json={"unit": "PGRC", "rows": [row("T/1", next_step_on=day(7), next_step="SHC hearing")]}).json()
    r = res["rows"][0]
    assert r["outcome"] == "new" and not r["problems"]
    assert any("Sahyadri" in n for n in r["notes"])
    done = c.post("/api/v1/imports/commit", json={"unit": "PGRC", "fileName": "t.csv", "rows": [row("T/1", next_step_on=day(7), next_step="SHC hearing")]}).json()
    assert done["created"] == 1
    case = c.get(f"/api/v1/cases/{done['caseIds'][0]}").json()
    assert case["scheduled"] == {"on": day(7), "what": "SHC hearing"}


def test_import_flags_half_filled_or_past_next_steps_and_repeats_inside_the_file(as_user):
    c = as_user("arao")
    rows = [row("T/2", next_step_on=day(7)), row("T/3", next_step_on=day(-1), next_step="Hearing"), row("T/4"), row("T/4")]
    res = c.post("/api/v1/imports/check", json={"unit": "PGRC", "rows": rows}).json()["rows"]
    assert res[0]["outcome"] == "reject" and any("both" in p["problem"] for p in res[0]["problems"])
    assert res[1]["outcome"] == "reject" and any("passed" in p["problem"] for p in res[1]["problems"])
    assert res[2]["outcome"] == "new"
    assert res[3]["outcome"] == "reject" and any("row 4" in p["problem"] for p in res[3]["problems"])


def test_import_says_when_another_unit_already_holds_the_complaint_number(as_user):
    c = as_user("siyer")
    held = next(x for x in as_user("mkhan").get("/api/v1/cases?size=200").json()["items"] if x["ownerUnit"] != "RB-WR" and x.get("sourceComplaintRef") and x["lifecycle"] not in ("disposed", "transferred"))
    res = c.post("/api/v1/imports/check", json={"unit": "RB-WR", "rows": [row("T/9", complaint_ref=held["sourceComplaintRef"], local_status="Under scrutiny")]}).json()["rows"][0]
    assert any("same complaint number" in n for n in res["notes"])
