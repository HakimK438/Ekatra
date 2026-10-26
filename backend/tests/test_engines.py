"""The rules engines, checked against the same expectations as the frontend tests (parity)."""
from app.engine import logic as L
from app.engine.insights import overlap_story, shared_issues, tag_issues
from app.store import State

TODAY = "2026-10-23"


def state(db):
    return State(db, TODAY)


def test_seed_overlaps_match_the_frontend_demo(db):
    st = state(db)
    got = {a["institutionId"]: [r["code"] for r in a["rules"]] for a in st.alerts()}
    by_name = {st.inst_by[i]["name"]: codes for i, codes in got.items()}
    assert by_name["Sahyadri Institute of Technology"] == ["O1", "O3", "O4"]
    assert by_name["Aravali Institute of Management"] == ["O1", "O3", "O4", "O5"]
    assert by_name["Gomti College of Engineering"] == ["O3"]
    assert by_name["Hooghly Polytechnic"] == ["O2", "O4"]
    assert by_name["Sabarmati Polytechnic"] == ["O2", "O3", "O4"]
    assert len(got) == 5


def test_cpgrams_clock_is_21_days_and_verified_others_are_prototype():
    cp = L.deadline_for({"channel": "CPGRAMS", "receivedOn": "2026-10-05", "lifecycle": "under_examination"}, TODAY)
    assert cp["days"] == 21 and cp["verified"] and cp["state"] == "approaching" and cp["daysToDue"] == 3
    other = L.deadline_for({"channel": "CSS", "receivedOn": "2026-10-05", "lifecycle": "under_examination"}, TODAY)
    assert other["days"] == 30 and not other["verified"] and "Prototype" in other["basis"]
    late = L.deadline_for({"channel": "CPGRAMS", "receivedOn": "2026-09-01", "lifecycle": "received"}, TODAY)
    assert late["state"] == "overdue" and L.escalation_for(late)["level"] == 2


def test_t1_normalises_noise_and_t2_ignores_unverified_ids(db):
    st = state(db)
    pid = st.inst_by["inst-2"]["permanentId"]
    r = L.resolve_institution({"name": "x", "permanentId": f" {pid.replace('-', ' ')} "}, st.insts)
    assert r["method"] == "T1_exact" and r["institutionId"] == "inst-2"
    t2 = L.resolve_institution({"name": "Sahyadri Inst of Tech", "currentId": "1 2201455"}, st.insts)
    assert t2["method"] == "T2_crosswalk"
    insts = [{**i, "identifiers": [{**x, "verified": False} for x in i["identifiers"]]} for i in st.insts]
    assert L.resolve_institution({"name": "zzz", "currentId": "1-2201455"}, insts)["state"] == "unresolved"


def test_lookalike_names_give_a_ranked_list_and_never_a_link(db):
    st = state(db)
    r = L.resolve_institution({"name": "Malnad Polytechnic", "district": "Bengaluru"}, st.insts)
    assert r["state"] == "pending_review" and "institutionId" not in r and len(r["suggestions"]) >= 2


def test_issue_tagging_and_shared_issues(db):
    st = state(db)
    a = next(x for x in st.alerts() if st.inst_by[x["institutionId"]]["name"] == "Sahyadri Institute of Technology")
    cs = [st.case(i) for i in a["caseIds"]]
    assert {t["issue"] for t in tag_issues(cs[1]["summary"])} >= {"faculty", "laboratory"}
    assert shared_issues(cs)[0]["issue"] == "faculty"
    assert "faculty" in overlap_story(cs).lower() or "Faculty" in overlap_story(cs)


def test_dashboard_numbers_equal_an_independent_recount(db):
    from app import services as S
    assert all(r["ok"] for r in S.numbers_check(state(db)))


STORIES = {
    "Sahyadri Institute of Technology": "Faculty and staff: PGRC received a CPGRAMS grievance on 18 Oct; RB-WR has the SHC hearing fixed for 2 Nov.",
    "Aravali Institute of Management": "Admission process: RB-NWR was forwarded grievance DARPG/E/2026/0377 on 18 Oct and has the EVC visit fixed for 29 Oct; PGRC is examining its case.",
    "Sabarmati Polytechnic": "Approval and compliance: RO-WR received an Approval process complaint on 20 Oct and has the Compliance review hearing fixed for 2 Nov; PGRC is waiting for the institution’s reply (due 27 Oct).",
    "Gomti College of Engineering": "Fees and refunds: PGRC received a CPGRAMS grievance on 15 Oct; RB-NR closed a fee refund case on 24 Aug.",
}


def test_overlap_stories_are_correct_and_name_every_unit(db):
    from app.engine.insights import overlap_story
    st = state(db)
    got = {st.inst_by[a["institutionId"]]["name"]: overlap_story([st.case(i) for i in a["caseIds"]]) for a in st.alerts()}
    for name, story in STORIES.items():
        assert got[name] == story
    assert "CPGRAMS" not in got["Aravali Institute of Management"].split(";")[0] or "forwarded" in got["Aravali Institute of Management"]  # only PGRC receives CPGRAMS


def test_matching_never_makes_a_weak_name_look_certain(db):
    st = state(db)
    rec = {"name": "Sabarmati College of Engineering & Technology Trust", "district": "Ahmedabad", "pin": "380001"}
    for s in L.suggestions_for(rec, st.insts):
        assert s["score"] <= round(L.name_score(rec["name"], st.inst_by[s["institutionId"]]["name"]) + 0.04, 2) + 1e-9
    assert L.suggestions_for(rec, st.insts)[0]["score"] <= 0.90
    malnad = {"name": "Malnad Polytechnic", "district": "Bengaluru", "pin": "560001"}
    by_name = {st.inst_by[s["institutionId"]]["name"]: s["score"] for s in L.suggestions_for(malnad, st.insts)}
    assert abs(by_name["Malnad Polytechnic College"] - by_name["Malnad Polytechnic Institute"]) <= 0.05
    assert [L.name_verdict(x) for x in (0.95, 0.94, 0.75, 0.74)] == ["same", "similar", "similar", "different"]
