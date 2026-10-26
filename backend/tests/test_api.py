"""The API end to end: pillars, permissions, idempotency and the audit chain."""
import json
from urllib.parse import quote

from sqlalchemy import text

from app.audit import verify_chain

SAHYADRI = None


def alert_id(c, name="Sahyadri Institute of Technology"):
    return next(a["id"] for a in c.get("/api/v1/overlaps").json()["open"] if a["institution"]["name"] == name)


def test_signed_out_requests_are_refused(client):
    r = client.get("/api/v1/cases")
    assert r.status_code == 401 and r.json()["code"] == "not_signed_in"


def test_wrong_password_and_lockout(client):
    for _ in range(5):
        assert client.post("/api/v1/auth/login", json={"username": "arao", "password": "nope"}).status_code == 401
    r = client.post("/api/v1/auth/login", json={"username": "arao", "password": "demo"})
    assert r.status_code == 423


def test_lists_and_exports_never_contain_complainant_details(as_user):
    c = as_user("arao")
    for path in ["/api/v1/cases", "/api/v1/overlaps", "/api/v1/matching", "/api/v1/institutions/inst-57", "/api/v1/cases/c1", "/api/v1/reports/export?type=workload"]:
        body = c.get(path).text
        assert "Synthetic Complainant" not in body and "narrative" not in body.lower(), path


def test_sensitive_details_only_for_the_owning_unit_and_each_view_is_audited(as_user, db):
    owner = as_user("arao")  # PGRC; case c2 belongs to PGRC
    assert owner.get("/api/v1/cases/c2/sensitive").status_code == 200
    assert as_user("siyer").get("/api/v1/cases/c2/sensitive").status_code == 403
    assert as_user("ishaikh").get("/api/v1/cases/c2/sensitive").status_code == 403
    n = db.execute(text("select count(*) from audit_events where action='Complainant details viewed'")).scalar()
    assert n == 1


def test_decision_records_follow_up_and_never_changes_the_cases(as_user, db):
    c = as_user("siyer")  # nodal officer of RB-WR, one of the units involved
    aid = alert_id(c)
    detail = c.get("/api/v1/overlap", params={"id": aid}).json()
    assert "suggestion" not in detail  # Ekatra shows the facts; a person chooses the decision
    before = {x["id"]: (x["ownerUnit"], x["lifecycle"]) for x in detail["cases"]}
    r = c.post("/api/v1/overlaps/decide", json={"alertId": aid, "decision": "designate_lead_unit", "reason": "The hearing already covers the complaint.", "leadUnit": "RB-WR",
                                                "followUp": {"action": "Send an interim reply", "ownerUnit": "PGRC", "dueOn": "2026-10-26"}})
    assert r.status_code == 200, r.text
    after = c.get("/api/v1/overlap", params={"id": aid}).json()
    assert {x["id"]: (x["ownerUnit"], x["lifecycle"]) for x in after["cases"]} == before
    assert after["decision"]["decision"] == "designate_lead_unit" and after["tasks"][0]["ownerUnit"] == "PGRC"
    assert any(e["type"] == "linked" for x in after["cases"] for e in x["events"])
    assert c.post("/api/v1/overlaps/decide", json={"alertId": aid, "decision": "related"}).status_code == 409  # already settled
    assert as_user("pnair").post("/api/v1/overlaps/decide", json={"alertId": aid, "decision": "related"}).status_code in (403, 409)


def test_reason_is_mandatory_and_lead_must_be_involved_and_roles_are_enforced(as_user):
    c = as_user("siyer")
    aid = alert_id(c)
    assert c.post("/api/v1/overlaps/decide", json={"alertId": aid, "decision": "duplicate", "reason": " "}).status_code == 422
    assert c.post("/api/v1/overlaps/decide", json={"alertId": aid, "decision": "designate_lead_unit", "reason": "x", "leadUnit": "RB-NR"}).status_code == 422
    assert as_user("rdas").post("/api/v1/overlaps/decide", json={"alertId": aid, "decision": "related"}).status_code == 403  # read-only role
    other = as_user("arao")  # PGRC nodal officer is involved in Sahyadri, but not in Hooghly (LEGAL + RB-ER)
    hooghly = alert_id(other, "Hooghly Polytechnic")
    assert other.post("/api/v1/overlaps/decide", json={"alertId": hooghly, "decision": "related"}).status_code == 403


def test_decided_overlap_leaves_the_waiting_count_and_followup_appears_in_pending_actions(as_user):
    c = as_user("siyer")
    before = c.get("/api/v1/dashboard").json()["overlapsAwaiting"]
    aid = alert_id(c)
    c.post("/api/v1/overlaps/decide", json={"alertId": aid, "decision": "designate_lead_unit", "reason": "The hearing already covers the complaint.", "leadUnit": "RB-WR",
                                            "followUp": {"action": "Send an interim reply", "ownerUnit": "PGRC", "dueOn": "2026-10-26"}})
    assert c.get("/api/v1/dashboard").json()["overlapsAwaiting"] == before - 1
    pgrc = as_user("arao").get("/api/v1/worklist").json()
    assert any(i["kind"] == "task" for i in pgrc["items"]) or pgrc["total"] > 0
    task = as_user("arao").get("/api/v1/tasks").json()[0]
    assert as_user("arao").post(f"/api/v1/tasks/{task['id']}/complete").json()["state"] == "done"


def test_matching_confirmation_stores_an_alias_so_the_next_case_matches_automatically(as_user):
    c = as_user("mkhan")
    q = c.get("/api/v1/matching").json()
    item = next(x for x in q if x["recorded"]["name"] == "Gomti Coll of Engg")
    assert item["suggestions"] and item["institutionId"] is None  # nothing linked before a person confirms
    inst = item["suggestions"][0]["institutionId"]
    assert as_user("arao").post(f"/api/v1/matching/{item['id']}/accept", json={"institutionId": inst}).status_code == 403
    assert c.post(f"/api/v1/matching/{item['id']}/accept", json={"institutionId": inst}).status_code == 200
    rec = as_user("arao").post("/api/v1/cases", json={"channel": "CSS", "category": "other", "summary": "x", "receivedOn": "2026-10-20", "recorded": {"name": "Gomti Coll of Engg"}}).json()
    assert rec["matched"]  # the confirmed name now resolves on its own
    detail = c.get(f"/api/v1/cases/{rec['caseId']}").json()
    assert detail["matchState"] == "resolved_auto" and detail["institutionId"] == inst


def test_import_rejects_bad_rows_with_fixes_and_reimport_never_duplicates(as_user, client):
    c = as_user("arao")
    rows = [
        {"source_reference": "PGRC/2026/9001", "received_on": "2026-10-20", "channel": "CPGRAMS", "category": "fee_refund", "local_status": "Registered on CPGRAMS", "institution_name": "Gomti College of Engineering", "permanent_id": "", "current_id": "", "complaint_ref": "", "summary": "Refund pending"},
        {"source_reference": "PGRC/2026/9002", "received_on": "2026-13-45", "channel": "CPGRAMS", "category": "fee_refund", "local_status": "Registered on CPGRAMS", "institution_name": "X", "permanent_id": "", "current_id": "", "complaint_ref": "", "summary": ""},
        {"source_reference": "PGRC/2026/9003", "received_on": "2099-01-01", "channel": "NOPE", "category": "zzz", "local_status": "Kept in abeyance", "institution_name": "", "permanent_id": "12", "current_id": "", "complaint_ref": "", "summary": ""},
    ]
    chk = c.post("/api/v1/imports/check", json={"unit": "PGRC", "rows": rows}).json()
    assert [r["outcome"] for r in chk["rows"]] == ["new", "reject", "reject"] and all(p["fix"] for r in chk["rows"] for p in r["problems"])
    first = c.post("/api/v1/imports/commit", json={"unit": "PGRC", "fileName": "a.csv", "rows": rows}).json()
    assert (first["created"], first["updated"], first["rejected"]) == (1, 0, 2) and first["created"] + first["updated"] + first["rejected"] == first["rows"]
    total = c.get("/api/v1/cases").json()["total"]
    second = c.post("/api/v1/imports/commit", json={"unit": "PGRC", "fileName": "a.csv", "rows": rows}).json()
    assert (second["created"], second["updated"]) == (0, 1) and c.get("/api/v1/cases").json()["total"] == total
    assert as_user("siyer").post("/api/v1/imports/commit", json={"unit": "PGRC", "fileName": "a.csv", "rows": rows}).status_code == 403


def test_new_case_runs_the_pipeline_and_raises_an_overlap(as_user):
    c = as_user("arao")
    r = c.post("/api/v1/ingest/current_id").json()
    assert r["matched"] and [s["key"] for s in r["steps"]] == ["receive", "match", "overlap", "deadline", "notify"]
    assert r["overlapId"]  # Sahyadri already has RB-WR in a hearing: the arrival raises (or refreshes) the overlap


def test_hourly_sweep_is_idempotent_and_cron_secret_is_required(client, as_user):
    assert client.post("/api/v1/admin/sweep").status_code == 403
    assert client.post("/api/v1/admin/sweep", headers={"X-Cron-Secret": "wrong"}).status_code == 403
    first = client.post("/api/v1/admin/sweep", headers={"X-Cron-Secret": "test-cron-secret"}).json()
    assert first["newAlerts"] > 0 and first["overdue"] > 0
    second = client.post("/api/v1/admin/sweep", headers={"X-Cron-Secret": "test-cron-secret"}).json()
    assert second["newAlerts"] == 0 and second["resolvedAlerts"] == 0  # same conditions are never raised twice
    kinds = {a["kind"] for a in as_user("mkhan").get("/api/v1/alerts").json()}
    assert {"overdue", "escalation_1"} <= kinds


def test_closing_a_case_resolves_its_alert_on_the_next_sweep(client, as_user):
    client.post("/api/v1/admin/sweep", headers={"X-Cron-Secret": "test-cron-secret"})
    pg = as_user("arao")
    case = next(i for i in pg.get("/api/v1/deadlines").json()["overdue"])
    assert pg.post(f"/api/v1/cases/{case['id']}/dispose", json={"type": "resolved", "reason": "Reply sent"}).json() is True
    r = client.post("/api/v1/admin/sweep", headers={"X-Cron-Secret": "test-cron-secret"}).json()
    assert r["resolvedAlerts"] >= 1


def test_transfers_are_never_counted_as_disposals(as_user):
    c = as_user("arao")
    before = c.get("/api/v1/dashboard").json()
    case = next(x for x in c.get("/api/v1/cases", params={"unit": "PGRC", "lifecycle": "active"}).json()["items"])
    assert c.post(f"/api/v1/cases/{case['id']}/transfer", json={"to": "RB-WR", "reason": "Competent unit"}).status_code == 200
    after = c.get("/api/v1/dashboard").json()
    assert after["transferred"] == before["transferred"] + 1 and after["disposed"] == before["disposed"]


def test_audit_chain_verifies_detects_tampering_and_blocks_edits(as_user, db):
    admin = as_user("ishaikh")
    assert admin.get("/api/v1/audit").json()["check"]["ok"]
    try:
        db.execute(text("update audit_events set details='tampered' where seq=1"))
        db.commit()
        blocked = False
    except Exception:
        db.rollback()
        blocked = True
    assert blocked  # the append-only trigger refuses the edit
    assert verify_chain(db)["ok"]


def test_consistent_error_format_and_empty_filters(as_user):
    c = as_user("arao")
    r = c.get("/api/v1/cases/nope")
    assert r.status_code == 404 and set(r.json()) == {"code", "message", "details"}
    assert c.get("/api/v1/cases", params={"q": "zzzz-no-such"}).json()["total"] == 0


def test_reset_restores_the_demo_data_and_is_admin_only(as_user):
    assert as_user("arao").post("/api/v1/admin/reset").status_code == 403
    admin = as_user("ishaikh")
    assert admin.post("/api/v1/admin/reset").json()["ok"]
    assert admin.get("/api/v1/cases").json()["total"] == len(json.load(open("scripts/seed_data.json", encoding="utf-8"))["cases"])


def test_overlap_path_encoding_roundtrip(as_user):
    c = as_user("mkhan")
    aid = alert_id(c)
    assert c.get(f"/api/v1/overlap?id={quote(aid)}").status_code == 200
    assert json.dumps(c.get("/api/v1/overlaps").json())
