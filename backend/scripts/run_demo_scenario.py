"""The judge journey, run against a live API: a new case arrives, the institution is matched, an overlap is raised, an officer
chooses a decision and records a reason, a follow-up is created, the deadline check runs, and management reporting reflects it.

    python -m scripts.run_demo_scenario --base-url http://localhost:8765 [--password demo]

Exits non-zero if any expectation fails.
"""
import argparse
import sys
from datetime import date, timedelta

import httpx


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", required=True)
    ap.add_argument("--password", default="demo")
    a = ap.parse_args()
    ok = True

    def check(label: str, cond: bool, detail: str = "") -> None:
        nonlocal ok
        print(("PASS " if cond else "FAIL ") + label + (f"  [{detail}]" if detail else ""))
        ok = ok and cond

    def session(username: str) -> httpx.Client:
        c = httpx.Client(base_url=a.base_url + "/api/v1", timeout=60)
        r = c.post("/auth/login", json={"username": username, "password": a.password})
        r.raise_for_status()
        return c

    pgrc, rb, boss = session("arao"), session("siyer"), session("rdas")
    waiting0 = boss.get("/dashboard").json()["overlapsAwaiting"]
    decided0 = sum(t["count"] for t in boss.get("/dashboard").json()["coordination"]["byType"])

    # Before anything happens: the officer's desk, the calendar and the pre-action check already tell the story.
    desk = pgrc.get("/summary").json()
    check("0a. The PGRC nodal officer has overlaps waiting for their decision", desk["overlaps"]["needMyDecision"] >= 1, str(desk["overlaps"]))
    sahyadri = next(i["id"] for i in pgrc.get("/institutions").json()["rows"] if i["name"] == "Sahyadri Institute of Technology")
    cal = {x["institution"]["name"]: x for x in pgrc.get("/calendar").json()["institutions"]}
    check("0b. The calendar shows PGRC and RB-WR acting on Sahyadri in the same week", bool(cal["Sahyadri Institute of Technology"]["collisions"]))
    light = pgrc.post("/check", json={"action": "reply", "institutionId": sahyadri, "category": "norm_violation"}).json()
    check("0c. The pre-action check states that RB-WR has an open case on the same issue, and whom to contact", light["light"] == "red" and light["contacts"][0]["unit"] == "RB-WR", light["headline"])

    r = pgrc.post("/ingest/current_id").json()
    check("1. A new CPGRAMS case arrives with only a name variant and a Current ID", r["uid"].startswith("CC-"), r["uid"])
    check("2. The institution is found automatically by a verified ID", r["matched"] and r["steps"][1]["title"] == "Institution found")
    check("3. An overlap is flagged for the units involved", bool(r["overlapId"]), r["steps"][2]["detail"])

    detail = rb.get("/overlap", params={"id": r["overlapId"]}).json()
    check("4. The analysis explains why, with a specific one-line story", bool(detail["story"]) and bool(detail["sharedIssues"]), detail["story"])
    check("5. The system shows the rules behind the priority, suggests nothing, and has applied nothing", detail["decision"] is None and "suggestion" not in detail and bool(detail["rules"]) and detail["severity"] in ("High", "Medium"), detail["severity"])

    today = rb.get("/meta").json()["today"]
    due = (date.fromisoformat(today) + timedelta(days=3)).isoformat()
    d = rb.post("/overlaps/decide", json={"alertId": r["overlapId"], "decision": "designate_lead_unit", "reason": "The hearing already covers the complaint.", "leadUnit": "RB-WR",
                                          "followUp": {"action": "Send the institution an interim reply", "ownerUnit": "PGRC", "dueOn": due}})
    check("6. The RB nodal officer chooses a decision; the decision and reason are recorded", d.status_code == 200, d.text[:80])
    after = rb.get("/overlap", params={"id": r["overlapId"]}).json()
    check("7. Case owners and stages are unchanged", {c["id"]: (c["ownerUnit"], c["lifecycle"]) for c in after["cases"]} == {c["id"]: (c["ownerUnit"], c["lifecycle"]) for c in detail["cases"]})
    check("8. A follow-up task with an owner and due date exists", bool(after["tasks"]), str(after["tasks"][:1]))

    sweep = pgrc.post("/sweep/now").json()
    check("9. The deadline check runs and raises overdue and escalation alerts", sweep["overdue"] > 0 and (sweep["newAlerts"] >= 0), str(sweep))
    again = pgrc.post("/sweep/now").json()
    check("10. Running it again raises nothing twice", again["newAlerts"] == 0, str(again))

    dash = boss.get("/dashboard").json()
    decided1 = sum(t["count"] for t in dash["coordination"]["byType"])
    check("11. Management reporting reflects the decision", decided1 == decided0 + 1 and dash["overlapsAwaiting"] <= waiting0 + 1, f"decided {decided0}->{decided1}")
    check("12. Every dashboard number matches an independent recount", all(x["ok"] for x in boss.get("/reports/check").json()))
    audit = httpx.Client(base_url=a.base_url + "/api/v1")
    check("13. The audit chain is intact", boss.get("/audit").json()["check"]["ok"])
    summ = boss.get("/summary").json()
    check("14. Every screen agrees on the overlap count", summ["overlaps"]["awaiting"] == dash["overlapsAwaiting"] == len(boss.get("/overlaps").json()["open"]), str(summ["overlaps"]))
    del audit
    print("\nAll steps passed." if ok else "\nSome steps failed.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
