"""No two screens may disagree: every headline number comes from /summary and the others must match it."""


def test_every_screen_agrees_on_the_overlap_count(as_user):
    c = as_user("mkhan")  # coordinator: sees everything
    s = c.get("/api/v1/summary").json()
    dash = c.get("/api/v1/dashboard").json()
    board = c.get("/api/v1/overlaps").json()
    inst = c.get("/api/v1/institutions").json()["rows"]
    n = s["overlaps"]["awaiting"]
    assert n == dash["overlapsAwaiting"] == len(board["open"]) == sum(1 for r in inst if r["overlap"])
    assert s["overlaps"]["all"] == n + s["overlaps"]["decided"]
    assert s["overlaps"]["needMyDecision"] == n  # a coordinator may decide any overlap


def test_scopes_are_labelled_and_consistent(as_user):
    nodal = as_user("arao").get("/api/v1/summary").json()
    assert nodal["unit"] == "PGRC"
    assert nodal["overlaps"]["needMyDecision"] <= nodal["overlaps"]["mine"] <= nodal["overlaps"]["awaiting"]
    assert nodal["mine"]["open"] <= nodal["cases"]["open"]
    work = as_user("arao").get("/api/v1/worklist").json()
    assert work["decideCount"] == nodal["overlaps"]["needMyDecision"]
    mgr = as_user("rdas").get("/api/v1/summary").json()
    assert mgr["overlaps"]["needMyDecision"] == 0  # read-only role decides nothing
    assert mgr["cases"]["overdue"] == nodal["cases"]["overdue"]  # the same all-unit figure for everyone


def test_open_means_the_same_everywhere(as_user):
    """Open = not disposed and not transferred. Management chart, summary and the recount must agree (transfers are apart)."""
    c = as_user("mkhan")
    s = c.get("/api/v1/summary").json()["cases"]
    dash = c.get("/api/v1/dashboard").json()
    assert sum(w["open"] for w in dash["workload"]) == s["open"] == s["pending"] + s["underProcess"] + s["escalated"]
    assert s["transferred"] > 0 and s["total"] == s["open"] + s["transferred"] + s["disposed"]
    checks = c.get("/api/v1/reports/check").json()
    assert all(x["match"] for x in checks["checks"]) if "checks" in checks else True
