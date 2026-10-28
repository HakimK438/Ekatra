"""Letters in, requests register out: reading facts, recording, the D1-D4 checks, the digest, 'what changed' and the cache."""
from pathlib import Path

from app.engine.letters import find_dates, read_letter
from app.store import State

LETTERS = Path(__file__).resolve().parents[2] / "documents" / "sample-data" / "letters"
UNITS = [{"code": "PGRC", "name": "Public Grievance Redressal Cell"}, {"code": "RB-WR", "name": "Regulation Bureau — Western"},
         {"code": "RB-NWR", "name": "Regulation Bureau — North-West"}, {"code": "RB-SWR", "name": "Regulation Bureau — South-West"}]


def letter(n: str) -> str:
    return next(LETTERS.glob(f"{n}-*.txt")).read_text(encoding="utf-8")


def test_dates_in_indian_formats():
    got = [d["on"] for d in find_dates("12.10.2026, 05/10/2026, 2026-10-01, 20 October 2026, 3rd Nov, 2026, Oct 9, 2026, 31.02.2026")]
    assert got == ["2026-10-12", "2026-10-05", "2026-10-01", "2026-10-20", "2026-11-03", "2026-10-09"]  # 31 Feb is not a date


def test_reads_show_cause_notice():
    f = read_letter(letter("01"), UNITS)
    assert f["kind"]["kind"] == "show_cause" and f["unit"]["unit"] == "RB-WR"
    assert f["letterDate"]["on"] == "2026-10-12"
    assert f["dueOn"]["on"] == "2026-10-27" and f["dueOn"]["days"] == 15
    assert f["hearing"] == {**f["hearing"], "on": "2026-11-02", "what": "SHC hearing"}
    assert f["ids"]["permanentId"]["value"] == "1-2210239"
    assert [i["key"] for i in f["items"]] == ["faculty_list", "salary_records", "affidavit", "reply"]
    assert len(f["listed"]) == 3
    assert all(i["from"] for i in f["items"])  # every fact shows the words it came from


def test_region_names_do_not_mix():
    assert read_letter("Regulation Bureau, North-West Region\nDated 01.10.2026", UNITS)["unit"]["unit"] == "RB-NWR"
    assert read_letter("Regulation Bureau (Western Region)\nDated 01.10.2026", UNITS)["unit"]["unit"] == "RB-WR"


def test_read_finds_institution_and_what_other_units_asked(as_user):
    pgrc = as_user("arao")
    r = pgrc.post("/api/v1/letters/read", json={"text": letter("02")})
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["match"]["institution"]["name"] == "Sahyadri Institute of Technology"
    assert b["match"]["method"] == "case_ref"  # the name alone is only a suggestion; the CPGRAMS number is on a matched case
    assert b["case"]["unit"] == "PGRC" and b["case"]["from"] in ("PGRC/2026/1002", "DARPG/E/2026/0481")
    codes = {f["code"] for f in b["findings"]}
    assert "D1" in codes  # RB-WR asked for the faculty list first
    d1 = next(f for f in b["findings"] if f["code"] == "D1")
    assert d1["text"].startswith("RB-WR already asked for the faculty list with qualifications")
    assert "D2" in codes  # two reply dates for the faculty list
    assert any(c["unit"] == "RB-WR" for c in b["openCases"])


def test_name_only_letter_is_a_suggestion(as_user):
    b = as_user("siyer").post("/api/v1/letters/read", json={"text": letter("03")}).json()
    assert b["match"]["institution"] is None  # look-alike names exist: a name never links on its own
    assert any(s["institution"]["name"] == "Malnad Polytechnic" for s in b["match"]["suggestions"])


def test_record_answer_and_audit(as_user):
    pgrc = as_user("arao")
    read = pgrc.post("/api/v1/letters/read", json={"text": letter("02")}).json()
    d = read["draft"]
    body = {"institutionId": read["match"]["institution"]["id"], "caseId": read["case"]["id"], "kind": read["facts"]["kind"]["kind"], "letterRef": d["letterRef"],
            "letterDate": d["letterDate"], "items": d["items"], "dueOn": d["dueOn"], "text": letter("02")}
    r = pgrc.post("/api/v1/requests", json=body)
    assert r.status_code == 200, r.text
    rid = r.json()["request"]["id"]
    assert {"D1", "D2"} <= {f["code"] for f in r.json()["findings"]}
    assert pgrc.post("/api/v1/requests", json=body).status_code == 409  # the same letter twice
    assert pgrc.post("/api/v1/letters/read", json={"text": letter("02")}).json()["alreadyRecorded"]["id"] == rid
    # Another unit cannot close PGRC's request; PGRC can.
    assert as_user("siyer").post(f"/api/v1/requests/{rid}/answered", json={}).status_code == 403
    assert pgrc.post(f"/api/v1/requests/{rid}/answered", json={"note": "Faculty list received"}).json()["state"] == "answered"
    inst = pgrc.get(f"/api/v1/institutions/{body['institutionId']}").json()
    assert any(x["id"] == rid and x["state"] == "answered" for x in inst["requests"])
    log = as_user("mkhan").get("/api/v1/audit", params={"q": "Request"}).json()
    actions = {e["action"] for e in log["rows"]} if "rows" in log else {e["action"] for e in log["events"]}
    assert {"Request recorded", "Request answered"} <= actions


def test_request_rules(as_user):
    pgrc = as_user("arao")
    inst = pgrc.get("/api/v1/institutions").json()["rows"][0]["id"]
    base = {"institutionId": inst, "letterDate": "2026-10-20", "items": ["faculty_list"]}
    assert pgrc.post("/api/v1/requests", json={**base, "unit": "RB-WR"}).status_code == 403  # own unit's letters only
    assert pgrc.post("/api/v1/requests", json={**base, "letterDate": "2030-01-01"}).status_code == 422
    assert pgrc.post("/api/v1/requests", json={**base, "dueOn": "2026-10-01"}).status_code == 422
    assert pgrc.post("/api/v1/requests", json={**base, "items": ["unknown"]}).status_code == 422
    assert as_user("rdas").post("/api/v1/requests", json=base).status_code == 403  # senior management is read-only


def test_overdue_reply_raises_alert_for_asking_unit(as_user):
    coord = as_user("mkhan")
    assert coord.post("/api/v1/sweep/now").status_code == 200
    assert any(a["kind"] == "request_overdue" and a["ownerUnit"] == "RB-SWR" and "Malnad Polytechnic" in a["message"] for a in coord.get("/api/v1/alerts").json())
    assert not any(a["kind"] == "request_overdue" for a in as_user("siyer").get("/api/v1/alerts").json())  # RB-WR does not see RB-SWR's


def test_digest_and_changes(as_user):
    d = as_user("siyer").get("/api/v1/digest").json()
    assert d["total"] == sum(len(g["items"]) for g in d["groups"]) and d["text"].startswith("Ekatra daily digest for Suresh Iyer, RB-WR")
    assert d["sent"] is False
    ch = as_user("rdas").get("/api/v1/reports/changes", params={"days": 7}).json()
    assert ch["line"].startswith("In the last 7 days:") and set(ch["now"]) == set(ch["before"])


def test_cache_sees_every_write(db):
    a = State(db, "2026-10-23")
    c = a.cases[0]
    c["summary"] = "changed in memory only"  # never saved: the cache must not keep it
    assert State(db, "2026-10-23").case(c["id"])["summary"] != "changed in memory only"
    c["summary"] = "saved"
    a.save_case(c)
    db.commit()
    b = State(db, "2026-10-23")
    assert b.token != a.token and b.case(c["id"])["summary"] == "saved"
