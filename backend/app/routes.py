"""HTTP endpoints (/api/v1). Thin: authenticate, load the State, call a service, return JSON. Roles are checked in the services."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import allocation as A
from . import control as C
from . import digest as D
from . import letters_service as R
from . import models as m
from . import services as S
from .audit import verify_chain
from .config import settings
from .config import today as today_fn
from .db import get_db
from .errors import ApiError
from .security import COOKIE, authenticate, cron_or_admin, current_user, make_token, optional_user, require_roles
from .seed import seed
from .store import State, get_json, user_to_dict

router = APIRouter(prefix="/api/v1")


def get_state(db: Session = Depends(get_db)) -> State:
    return State(db, today_fn())


def lazy_sweep(st: State) -> None:
    """If the hourly check has not run for an hour (the scheduler may be late or off), run it now. Safe to repeat."""
    last = get_json(st.db, "last_sweep_at", None)
    if last is None or (datetime.now() - datetime.fromisoformat(last)).total_seconds() > 3600:
        S.run_sweep(st, "lazy")


# ---------------------------------------------------------------- auth
class Login(BaseModel):
    username: str
    password: str


@router.post("/auth/login")
def login(body: Login, response: Response, db: Session = Depends(get_db)) -> dict:
    u = authenticate(db, body.username, body.password)
    st = State(db, today_fn())
    S.audit(st, u.name, "Signed in", "session", "Sign-in")
    response.set_cookie(COOKIE, make_token(u.id), httponly=True, samesite="lax", secure=settings.cookie_secure, max_age=settings.token_hours * 3600, path="/")
    return user_to_dict(u)


@router.post("/auth/logout")
def logout(response: Response) -> dict:
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.get("/auth/me")
def me(u: dict | None = Depends(optional_user)) -> dict | None:
    """The signed-in user, or null when nobody is signed in (so the sign-in check is not an error)."""
    return u


@router.get("/auth/demo-users")
def demo_users(db: Session = Depends(get_db)) -> list[dict]:
    return [user_to_dict(u) for u in db.scalars(select(m.User).order_by(m.User.id)).all()]


# ---------------------------------------------------------------- reference data
@router.get("/meta")
def meta(st: State = Depends(get_state)) -> dict:
    return S.meta(st)


@router.get("/search-index")
def search_index(st: State = Depends(get_state), _: dict = Depends(current_user)) -> dict:
    return S.search_index(st)


class RulesBody(BaseModel):
    values: dict[str, float] = {}
    reason: str = ""


@router.put("/settings/rules")
def settings_update(b: RulesBody, st: State = Depends(get_state), u: dict = Depends(require_roles("admin"))) -> dict:
    return S.update_rules(st, u, b.values, b.reason)


@router.post("/settings/rules/reset")
def settings_reset(b: RulesBody, st: State = Depends(get_state), u: dict = Depends(require_roles("admin"))) -> dict:
    return S.reset_rules(st, u, b.reason)


@router.get("/settings")
def settings_view(st: State = Depends(get_state), _: dict = Depends(current_user)) -> dict:
    return S.settings_view(st)


@router.get("/users")
def users(db: Session = Depends(get_db), _: dict = Depends(current_user)) -> list[dict]:
    return [user_to_dict(u) for u in db.scalars(select(m.User).order_by(m.User.id)).all()]


@router.get("/audit")
def audit_log(q: str | None = None, action: str | None = None, st: State = Depends(get_state), u: dict = Depends(require_roles("admin", "senior_management", "coordinator"))) -> dict:
    return S.audit_log(st, q, action)


# ---------------------------------------------------------------- dashboard, pending actions, automation
class CaseQuery:
    def __init__(self, q: str | None = None, unit: str | None = None, region: str | None = None, category: str | None = None, lifecycle: str | None = None,
                 deadline: str | None = None, match: str | None = None, from_: str | None = Query(default=None, alias="from"), to: str | None = None,
                 channel: str | None = None, sort: str | None = None, page: int | None = None, size: int | None = None) -> None:
        self.f = {"q": q, "unit": unit, "region": region, "category": category, "lifecycle": lifecycle, "deadline": deadline, "match": match,
                  "from": from_, "to": to, "channel": channel, "sort": sort, "page": page, "size": size}


@router.get("/dashboard")
def dashboard(cq: CaseQuery = Depends(), st: State = Depends(get_state), _: dict = Depends(current_user)) -> dict:
    lazy_sweep(st)
    return S.dashboard(st, cq.f)


@router.get("/summary")
def summary(st: State = Depends(get_state), u: dict = Depends(current_user)) -> dict:
    return S.summary(st, u)


class CheckBody(BaseModel):
    action: str
    institutionId: str
    unit: str | None = None
    caseId: str | None = None
    category: str | None = None
    targetStage: str | None = None


@router.post("/check")
def check(b: CheckBody, st: State = Depends(get_state), u: dict = Depends(current_user)) -> dict:
    return S.pre_action_check(st, u, b.model_dump())


@router.get("/calendar")
def calendar(from_: str | None = Query(default=None, alias="from"), to: str | None = None, st: State = Depends(get_state), _: dict = Depends(current_user)) -> dict:
    return S.calendar(st, from_, to)


@router.get("/worklist")
def worklist(limit: int = Query(default=8, ge=1, le=200), st: State = Depends(get_state), u: dict = Depends(current_user)) -> dict:
    return S.worklist(st, u, limit)


@router.get("/automation")
def automation(st: State = Depends(get_state), _: dict = Depends(current_user)) -> dict:
    return S.automation_stats(st)


@router.get("/job-runs")
def job_runs(st: State = Depends(get_state), _: dict = Depends(current_user)) -> list[dict]:
    return S.job_runs(st)


@router.get("/alerts")
def alerts(st: State = Depends(get_state), u: dict = Depends(current_user)) -> list[dict]:
    return S.open_alerts(st, u.get("unit"))


@router.post("/ingest/{scenario}")
def ingest(scenario: str, st: State = Depends(get_state), u: dict = Depends(current_user)) -> dict:
    return S.ingest_demo(st, scenario, u)


@router.post("/sweep/now")
def sweep_now(st: State = Depends(get_state), u: dict = Depends(current_user)) -> dict:
    """'Check now': any signed-in user can ask for the hourly check to run immediately. It is idempotent, so it is safe to repeat."""
    return S.run_sweep(st, "manual", u["name"])


@router.post("/admin/sweep")
def sweep(st: State = Depends(get_state), who: dict = Depends(cron_or_admin)) -> dict:
    return S.run_sweep(st, "cron" if who["id"] == "cron" else "manual", who["name"])


@router.post("/admin/reset")
def reset(db: Session = Depends(get_db), u: dict = Depends(require_roles("admin"))) -> dict:
    """Reload the synthetic demo dataset (dates shifted to today). Everything entered since is cleared."""
    info = seed(db, today_fn())
    return {"ok": True, **info}


# ---------------------------------------------------------------- cases
@router.get("/cases")
def cases(cq: CaseQuery = Depends(), st: State = Depends(get_state), _: dict = Depends(current_user)) -> dict:
    return S.cases_list(st, cq.f)


@router.get("/cases/export")
def cases_export(cq: CaseQuery = Depends(), st: State = Depends(get_state), u: dict = Depends(current_user)) -> dict:
    return S.export_cases(st, cq.f, u)


class NewCase(BaseModel):
    channel: str
    category: str
    summary: str = ""
    receivedOn: str
    sourceRef: str | None = None
    complaintRef: str | None = None
    recorded: dict[str, Any]
    complainant: str | None = None
    narrative: str | None = None


@router.post("/cases")
def create_case(body: NewCase, st: State = Depends(get_state), u: dict = Depends(current_user)) -> dict:
    return S.create_case(st, body.model_dump(), u)


@router.get("/cases/check-new")
def check_new(permanentId: str | None = None, currentId: str | None = None, name: str | None = None, district: str | None = None, complaintRef: str | None = None,
              st: State = Depends(get_state), _: dict = Depends(current_user)) -> dict:
    return S.check_new_case(st, {"permanentId": permanentId, "currentId": currentId, "name": name, "district": district, "complaintRef": complaintRef})


@router.get("/cases/{cid}")
def case_detail(cid: str, st: State = Depends(get_state), u: dict = Depends(current_user)) -> dict:
    return S.case_detail(st, cid, u)


@router.get("/cases/{cid}/sensitive")
def case_sensitive(cid: str, st: State = Depends(get_state), u: dict = Depends(current_user)) -> dict:
    return S.sensitive(st, cid, u)


class ActionBody(BaseModel):
    text: str
    next: str = ""


class StageBody(BaseModel):
    stage: str
    reason: str = ""


class ScheduleBody(BaseModel):
    on: str | None = None
    what: str = ""


class TransferBody(BaseModel):
    to: str
    reason: str = ""


class DisposeBody(BaseModel):
    type: str
    reason: str = ""


@router.post("/cases/{cid}/assign")
def assign(cid: str, st: State = Depends(get_state), u: dict = Depends(current_user)) -> bool:
    return S.assign_to_me(st, cid, u)


@router.post("/cases/{cid}/action")
def record_action(cid: str, b: ActionBody, st: State = Depends(get_state), u: dict = Depends(current_user)) -> bool:
    return S.record_action(st, cid, b.text, b.next, u)


@router.post("/cases/{cid}/stage")
def change_stage(cid: str, b: StageBody, st: State = Depends(get_state), u: dict = Depends(current_user)) -> bool:
    return S.change_stage(st, cid, b.stage, b.reason, u)


@router.post("/cases/{cid}/schedule")
def schedule(cid: str, b: ScheduleBody, st: State = Depends(get_state), u: dict = Depends(current_user)) -> bool:
    return S.schedule_step(st, cid, b.on, b.what, u)


@router.post("/cases/{cid}/transfer")
def transfer(cid: str, b: TransferBody, st: State = Depends(get_state), u: dict = Depends(current_user)) -> bool:
    return S.transfer(st, cid, b.to, b.reason, u)


@router.post("/cases/{cid}/dispose")
def dispose(cid: str, b: DisposeBody, st: State = Depends(get_state), u: dict = Depends(current_user)) -> bool:
    return S.dispose(st, cid, b.type, b.reason, u)


# ---------------------------------------------------------------- institutions
@router.get("/institutions")
def institutions(q: str | None = None, region: str | None = None, type: str | None = None, only: str | None = None,
                 st: State = Depends(get_state), _: dict = Depends(current_user)) -> dict:
    return S.institutions_list(st, {"q": q, "region": region, "type": type, "only": only})


@router.get("/institutions/{iid}")
def institution(iid: str, st: State = Depends(get_state), _: dict = Depends(current_user)) -> dict:
    return S.institution_detail(st, iid)


# ---------------------------------------------------------------- overlaps, decisions, follow-ups
@router.get("/overlaps")
def overlaps(st: State = Depends(get_state), _: dict = Depends(current_user)) -> dict:
    return S.overlaps(st)


@router.get("/overlap")
def overlap(id: str, st: State = Depends(get_state), u: dict = Depends(current_user)) -> dict:
    return S.overlap_detail(st, id, u)


class DecideBody(BaseModel):
    alertId: str
    decision: str
    reason: str = ""
    leadUnit: str | None = None
    followUp: dict[str, str] | None = None


@router.post("/overlaps/decide")
def decide(b: DecideBody, st: State = Depends(get_state), u: dict = Depends(current_user)) -> dict:
    return S.decide(st, b.alertId, b.decision, b.reason, b.leadUnit, b.followUp, u)


@router.get("/tasks")
def tasks(st: State = Depends(get_state), u: dict = Depends(current_user)) -> list[dict]:
    return S.tasks_list(st, u)


@router.post("/tasks/{tid}/complete")
def complete_task(tid: int, st: State = Depends(get_state), u: dict = Depends(current_user)) -> dict:
    return S.complete_task(st, tid, u)


# ---------------------------------------------------------------- institution matching
@router.get("/matching")
def matching(st: State = Depends(get_state), _: dict = Depends(current_user)) -> list[dict]:
    return S.matching_queue(st)


class MatchBody(BaseModel):
    institutionId: str | None = None
    reason: str = ""


@router.post("/matching/{cid}/accept")
def accept(cid: str, b: MatchBody, st: State = Depends(get_state), u: dict = Depends(current_user)) -> dict:
    return S.accept_match(st, cid, b.institutionId or "", u)


@router.post("/matching/{cid}/reject")
def reject(cid: str, b: MatchBody, st: State = Depends(get_state), u: dict = Depends(current_user)) -> bool:
    return S.reject_match(st, cid, b.institutionId or "", u)


@router.post("/matching/{cid}/unresolved")
def unresolved(cid: str, b: MatchBody, st: State = Depends(get_state), u: dict = Depends(current_user)) -> bool:
    return S.mark_unresolved(st, cid, b.reason, u)


# ---------------------------------------------------------------- deadlines
@router.get("/deadlines")
def deadlines(unit: str | None = None, st: State = Depends(get_state), u: dict = Depends(current_user)) -> dict:
    return S.deadlines(st, u, unit)


# ---------------------------------------------------------------- imports
class ImportBody(BaseModel):
    unit: str
    fileName: str = "upload.csv"
    rows: list[dict[str, str]]


class StatusBody(BaseModel):
    unit: str
    word: str
    stage: str


@router.post("/imports/check")
def import_check(b: ImportBody, st: State = Depends(get_state), _: dict = Depends(current_user)) -> dict:
    return S.import_check(st, b.unit, b.rows)


@router.post("/imports/status-meaning")
def status_meaning(b: StatusBody, st: State = Depends(get_state), u: dict = Depends(current_user)) -> bool:
    return S.save_status_meaning(st, b.unit, b.word, b.stage, u)


@router.post("/imports/commit")
def import_commit(b: ImportBody, st: State = Depends(get_state), u: dict = Depends(current_user)) -> dict:
    if u["role"] not in ("dealing_officer", "nodal_officer", "data_steward", "coordinator"):
        raise ApiError(403, "forbidden", "Your role cannot import files.")
    if u["role"] in ("dealing_officer", "nodal_officer") and u.get("unit") != b.unit:
        raise ApiError(403, "forbidden", f"You can only import files for {u.get('unit')}.")
    return S.import_commit(st, b.unit, b.fileName, b.rows, u)


@router.get("/imports")
def imports(st: State = Depends(get_state), _: dict = Depends(current_user)) -> list[dict]:
    return S.imports_list(st)


@router.get("/imports/{bid}")
def import_batch(bid: str, st: State = Depends(get_state), _: dict = Depends(current_user)) -> dict:
    return S.import_batch(st, bid)


# ---------------------------------------------------------------- reports
@router.get("/reports/check")
def reports_check(st: State = Depends(get_state), _: dict = Depends(current_user)) -> list[dict]:
    return S.numbers_check(st)


@router.get("/reports")
def report(type: str = "workload", period: str = "monthly", unit: str | None = None, region: str | None = None,
           st: State = Depends(get_state), _: dict = Depends(current_user)) -> dict:
    return S.build_report(st, type, period, unit, region)


@router.get("/reports/export")
def report_export(type: str = "workload", period: str = "monthly", unit: str | None = None, region: str | None = None,
                  st: State = Depends(get_state), u: dict = Depends(current_user)) -> dict:
    return S.export_report(st, type, period, unit, region, u)


@router.get("/reports/changes")
def report_changes(days: int = 7, st: State = Depends(get_state), _: dict = Depends(current_user)) -> dict:
    return D.changes(st, days)


@router.get("/digest")
def digest(st: State = Depends(get_state), u: dict = Depends(current_user)) -> dict:
    return D.digest(st, u)


# ---------------------------------------------------------------- letters and requests to institutions
class LetterBody(BaseModel):
    text: str


@router.post("/letters/read")
def letter_read(b: LetterBody, st: State = Depends(get_state), u: dict = Depends(current_user)) -> dict:
    return R.read(st, b.text, u)


class RequestBody(BaseModel):
    institutionId: str
    unit: str | None = None
    caseId: str | None = None
    kind: str = "information_request"
    letterRef: str | None = None
    letterDate: str
    items: list[str] = []
    otherItems: list[str] = []
    dueOn: str | None = None
    hearingOn: str | None = None
    hearingWhat: str | None = None
    text: str | None = None  # only hashed, so the same letter is not recorded twice; never stored


@router.get("/requests")
def requests_list(institutionId: str | None = None, unit: str | None = None, state: str | None = None,
                  st: State = Depends(get_state), u: dict = Depends(current_user)) -> dict:
    return R.listing(st, u, institutionId, unit, state)


@router.post("/requests")
def request_create(b: RequestBody, st: State = Depends(get_state), u: dict = Depends(current_user)) -> dict:
    return R.create(st, b.model_dump(), u)


class AnsweredBody(BaseModel):
    on: str | None = None
    note: str = ""


@router.post("/requests/{rid}/answered")
def request_answered(rid: int, b: AnsweredBody, st: State = Depends(get_state), u: dict = Depends(current_user)) -> dict:
    return R.answered(st, rid, b.on, b.note, u)


class ReasonBody(BaseModel):
    reason: str = ""


@router.post("/requests/{rid}/withdraw")
def request_withdraw(rid: int, b: ReasonBody, st: State = Depends(get_state), u: dict = Depends(current_user)) -> dict:
    return R.withdraw(st, rid, b.reason, u)


# ---------------------------------------------------------------- policy console, closure check, repeat radar
class PolicyBody(BaseModel):
    values: dict[str, float] = {}
    reason: str = ""
    effective: str | None = None


@router.get("/policy")
def policy(st: State = Depends(get_state), _: dict = Depends(require_roles("admin", "coordinator", "senior_management"))) -> dict:
    return C.policy_view(st)


@router.post("/policy/preview")
def policy_preview(b: PolicyBody, st: State = Depends(get_state), _: dict = Depends(require_roles("admin", "coordinator", "senior_management"))) -> dict:
    return C.preview(st, b.values)


@router.post("/policy/proposals")
def policy_propose(b: PolicyBody, st: State = Depends(get_state), u: dict = Depends(current_user)) -> dict:
    return C.propose(st, u, b.values, b.reason, b.effective)


class ProposalDecision(BaseModel):
    approve: bool
    note: str = ""


@router.post("/policy/proposals/{pid}/decide")
def policy_decide(pid: int, b: ProposalDecision, st: State = Depends(get_state), u: dict = Depends(current_user)) -> dict:
    return C.decide_proposal(st, u, pid, b.approve, b.note)


class ClosureBody(BaseModel):
    reason: str = ""
    disposalType: str | None = None


@router.post("/cases/{cid}/closure-check")
def closure_check(cid: str, b: ClosureBody, st: State = Depends(get_state), _: dict = Depends(current_user)) -> dict:
    return C.closure_check(st, cid, b.reason, b.disposalType)


@router.get("/radar")
def radar(st: State = Depends(get_state), _: dict = Depends(current_user)) -> dict:
    return C.radar(st)


# ---------------------------------------------------------------- marking work to officers
@router.get("/allocation")
def allocation(unit: str | None = None, st: State = Depends(get_state), u: dict = Depends(current_user)) -> dict:
    return A.board(st, u, unit)


class MarkBody(BaseModel):
    officer: str
    note: str = ""


@router.get("/people")
def people(q: str | None = None, st: State = Depends(get_state), u: dict = Depends(current_user)) -> dict:
    return A.who_works(st, u, q)


@router.post("/cases/{cid}/mark")
def mark_case(cid: str, b: MarkBody, st: State = Depends(get_state), u: dict = Depends(current_user)) -> dict:
    return A.mark(st, cid, b.officer, b.note, u)


@router.get("/health")
def health(db: Session = Depends(get_db)) -> dict:
    return {"ok": True, "audit": verify_chain(db)["ok"], "at": datetime.now().isoformat(timespec="seconds")}


__all__ = ["router", "optional_user"]
