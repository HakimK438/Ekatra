"""The sample files in documents/sample-data/ must keep behaving as their README says, so they stay honest test material."""
import csv
from pathlib import Path

DATA = Path(__file__).resolve().parents[2] / "documents" / "sample-data"


def rows_of(name: str) -> list[dict]:
    with open(DATA / name, newline="", encoding="utf-8") as f:
        return [{k.strip().lower(): (v or "").strip() for k, v in r.items()} for r in csv.DictReader(f)]


def check(c, unit: str, name: str) -> dict:
    return c.post("/api/v1/imports/check", json={"unit": unit, "rows": rows_of(name)}).json()


def commit(c, unit: str, name: str) -> dict:
    return c.post("/api/v1/imports/commit", json={"unit": unit, "fileName": name, "rows": rows_of(name)}).json()


def test_clean_file_has_no_problems(as_user):
    c = as_user("mkhan")
    chk = check(c, "PGRC", "01_pgrc_clean.csv")
    assert [r["outcome"] for r in chk["rows"]] == ["new"] * 6
    r = commit(c, "PGRC", "01_pgrc_clean.csv")
    assert (r["created"], r["updated"], r["rejected"]) == (6, 0, 0)
    assert r["autoMatched"] == 4  # three Permanent IDs and one Current ID
    assert r["namesToCheck"] >= 1  # the "Vindhya Inst of Tech" row is only a suggestion


def test_error_file_rejects_each_bad_row_with_a_fix(as_user):
    c = as_user("mkhan")
    chk = check(c, "PGRC", "02_pgrc_with_errors.csv")
    outcomes = [r["outcome"] for r in chk["rows"]]
    assert outcomes == ["new"] + ["reject"] * 8
    for r in chk["rows"][1:]:
        assert r["problems"] and all(p["fix"] for p in r["problems"])
    r = commit(c, "PGRC", "02_pgrc_with_errors.csv")
    assert (r["created"], r["rejected"]) == (1, 8) and r["created"] + r["updated"] + r["rejected"] == r["rows"]


def test_new_status_words_are_asked_about_and_a_shared_complaint_number_is_flagged(as_user):
    c = as_user("mkhan")
    commit(c, "PGRC", "01_pgrc_clean.csv")
    chk = check(c, "RB-WR", "03_rb_wr_duplicate_and_new_words.csv")
    assert [r["outcome"] for r in chk["rows"]] == ["new", "reject", "reject"]
    assert {p["field"] for r in chk["rows"] for p in r["problems"]} == {"Status in your unit"}
    commit(c, "RB-WR", "03_rb_wr_duplicate_and_new_words.csv")
    alerts = c.get("/api/v1/overlaps").json()["open"]
    flagged = [a for a in alerts if any(r["code"] == "O5" for r in a["rules"])]
    assert flagged, "the same complaint number in PGRC and RB-WR must raise rule O5"


def test_existing_reference_updates_and_never_duplicates(as_user):
    c = as_user("mkhan")
    before = c.get("/api/v1/cases").json()["total"]
    assert [r["outcome"] for r in check(c, "PGRC", "04_pgrc_update_existing.csv")["rows"]] == ["update"]
    r = commit(c, "PGRC", "04_pgrc_update_existing.csv")
    assert (r["created"], r["updated"]) == (0, 1)
    assert c.get("/api/v1/cases").json()["total"] == before


def test_importing_the_same_file_twice_adds_nothing(as_user):
    c = as_user("mkhan")
    commit(c, "RO-WR", "05_ro_wr_small.csv")
    total = c.get("/api/v1/cases").json()["total"]
    again = commit(c, "RO-WR", "05_ro_wr_small.csv")
    assert (again["created"], again["updated"]) == (0, 2)
    assert c.get("/api/v1/cases").json()["total"] == total
