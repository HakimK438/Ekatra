"""Tables. Dates are ISO strings (YYYY-MM-DD) so day maths is identical on every database.

Complainant details live in `cases.sensitive` and are never returned by list, dashboard, report or export code.
"""
from __future__ import annotations

from sqlalchemy import JSON, Boolean, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class Unit(Base):
    __tablename__ = "units"
    code: Mapped[str] = mapped_column(String(20), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(30))
    region: Mapped[str | None] = mapped_column(String(40), nullable=True)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    username: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(30))
    unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    title: Mapped[str] = mapped_column(String(200))
    password_hash: Mapped[str] = mapped_column(String(100))
    failed_logins: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[str | None] = mapped_column(String(30), nullable=True)


class Institution(Base):
    __tablename__ = "institutions"
    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    permanent_id: Mapped[str] = mapped_column(String(30), unique=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    type: Mapped[str] = mapped_column(String(40))
    region: Mapped[str] = mapped_column(String(40))
    state: Mapped[str] = mapped_column(String(60))
    district: Mapped[str] = mapped_column(String(60))
    pin: Mapped[str] = mapped_column(String(10))
    identifiers: Mapped[list] = mapped_column(JSON, default=list)  # [{type, value, verified}]
    is_synthetic: Mapped[bool] = mapped_column(Boolean, default=True)


class Case(Base):
    __tablename__ = "cases"
    __table_args__ = (UniqueConstraint("source_unit", "source_ref", name="uq_case_source"),)
    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    uid: Mapped[str] = mapped_column(String(30), unique=True)
    source_unit: Mapped[str] = mapped_column(String(20), ForeignKey("units.code"))
    owner_unit: Mapped[str] = mapped_column(String(20), ForeignKey("units.code"), index=True)
    source_ref: Mapped[str] = mapped_column(String(60))
    source_complaint_ref: Mapped[str | None] = mapped_column(String(60), nullable=True, index=True)
    channel: Mapped[str] = mapped_column(String(20))
    received_on: Mapped[str] = mapped_column(String(10), index=True)
    category: Mapped[str] = mapped_column(String(40))
    summary: Mapped[str] = mapped_column(Text)
    local_status: Mapped[str] = mapped_column(String(60))
    lifecycle: Mapped[str] = mapped_column(String(30), index=True)
    officer: Mapped[str | None] = mapped_column(String(120), nullable=True)
    last_action: Mapped[str] = mapped_column(Text)
    last_action_on: Mapped[str] = mapped_column(String(10))
    next_action: Mapped[str] = mapped_column(Text)
    institution_id: Mapped[str | None] = mapped_column(String(20), ForeignKey("institutions.id"), nullable=True, index=True)
    recorded: Mapped[dict] = mapped_column(JSON)
    match_state: Mapped[str] = mapped_column(String(20))
    match_method: Mapped[str | None] = mapped_column(String(20), nullable=True)
    match_evidence: Mapped[list] = mapped_column(JSON, default=list)
    sensitive: Mapped[dict] = mapped_column(JSON)  # complainant + narrative: owning unit only
    events: Mapped[list] = mapped_column(JSON, default=list)  # append-only timeline
    disposal_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    documents: Mapped[list] = mapped_column(JSON, default=list)  # references only: name, size, sha256
    scheduled: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # the next dated step: {"on": "2026-11-02", "what": "SHC hearing"}
    is_synthetic: Mapped[bool] = mapped_column(Boolean, default=True)


class Decision(Base):
    """A recorded coordination decision. Also keeps a snapshot of the alert it was about."""
    __tablename__ = "decisions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    alert_id: Mapped[str] = mapped_column(String(400), index=True)
    institution_id: Mapped[str] = mapped_column(String(20))
    case_ids: Mapped[list] = mapped_column(JSON)
    rules: Mapped[list] = mapped_column(JSON)
    severity: Mapped[str] = mapped_column(String(10))
    decision: Mapped[str] = mapped_column(String(30))
    lead_unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    reason: Mapped[str] = mapped_column(Text, default="")
    by: Mapped[str] = mapped_column(String(160))
    at: Mapped[str] = mapped_column(String(30))
    follow_up: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    accepted_suggestion: Mapped[bool | None] = mapped_column(Boolean, nullable=True)


class Task(Base):
    """A follow-up action created by a decision, with an owner unit and a due date."""
    __tablename__ = "coordination_tasks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    decision_id: Mapped[int] = mapped_column(Integer, ForeignKey("decisions.id"))
    alert_id: Mapped[str] = mapped_column(String(400))
    institution_id: Mapped[str] = mapped_column(String(20))
    action: Mapped[str] = mapped_column(Text)
    owner_unit: Mapped[str] = mapped_column(String(20), index=True)
    due_on: Mapped[str] = mapped_column(String(10))
    state: Mapped[str] = mapped_column(String(10), default="open")  # open | done
    done_at: Mapped[str | None] = mapped_column(String(30), nullable=True)
    done_by: Mapped[str | None] = mapped_column(String(160), nullable=True)


class RejectedSuggestion(Base):
    __tablename__ = "rejected_suggestions"
    case_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    institution_id: Mapped[str] = mapped_column(String(20), primary_key=True)


class AlertView(Base):
    """An overlap that someone who can decide has opened ('being looked at' on the board)."""
    __tablename__ = "alert_views"
    alert_id: Mapped[str] = mapped_column(String(400), primary_key=True)


class ImportBatch(Base):
    __tablename__ = "import_batches"
    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    unit: Mapped[str] = mapped_column(String(20))
    file_name: Mapped[str] = mapped_column(String(200))
    by: Mapped[str] = mapped_column(String(160))
    at: Mapped[str] = mapped_column(String(30))
    rows: Mapped[int] = mapped_column(Integer)
    created: Mapped[int] = mapped_column(Integer)
    updated: Mapped[int] = mapped_column(Integer)
    rejected: Mapped[int] = mapped_column(Integer)
    rejects: Mapped[list] = mapped_column(JSON, default=list)  # quarantine: row, field, problem, fix
    auto_matched: Mapped[int] = mapped_column(Integer)
    names_to_check: Mapped[int] = mapped_column(Integer)
    new_overlaps: Mapped[int] = mapped_column(Integer)
    case_ids: Mapped[list] = mapped_column(JSON, default=list)


class StatusMapping(Base):
    __tablename__ = "status_mappings"
    unit: Mapped[str] = mapped_column(String(20), primary_key=True)
    word: Mapped[str] = mapped_column(String(80), primary_key=True)
    stage: Mapped[str] = mapped_column(String(30))


class SourceSync(Base):
    __tablename__ = "source_sync_status"
    unit: Mapped[str] = mapped_column(String(20), primary_key=True)
    last_import_at: Mapped[str] = mapped_column(String(30))  # ISO timestamp


class AuditEvent(Base):
    """Append-only, hash-chained. A database trigger (see migration) blocks UPDATE and DELETE."""
    __tablename__ = "audit_events"
    seq: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    at: Mapped[str] = mapped_column(String(30))
    actor: Mapped[str] = mapped_column(String(160))
    action: Mapped[str] = mapped_column(String(80), index=True)
    entity: Mapped[str] = mapped_column(String(200))
    details: Mapped[str] = mapped_column(Text)
    prev_hash: Mapped[str] = mapped_column(String(64))
    hash: Mapped[str] = mapped_column(String(64))


class JobRun(Base):
    __tablename__ = "job_runs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    at: Mapped[str] = mapped_column(String(30))
    trigger: Mapped[str] = mapped_column(String(20))  # cron | manual | lazy
    checked: Mapped[int] = mapped_column(Integer)
    overdue: Mapped[int] = mapped_column(Integer)
    due_soon: Mapped[int] = mapped_column(Integer)
    interim: Mapped[int] = mapped_column(Integer)
    escalated: Mapped[int] = mapped_column(Integer)
    new_alerts: Mapped[int] = mapped_column(Integer, default=0)
    resolved_alerts: Mapped[int] = mapped_column(Integer, default=0)


class CaseAlert(Base):
    """A deadline or follow-up alert. The fingerprint makes the sweep idempotent: the same condition is never raised twice."""
    __tablename__ = "case_alerts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    fingerprint: Mapped[str] = mapped_column(String(200), unique=True)
    kind: Mapped[str] = mapped_column(String(30), index=True)  # overdue | approaching | interim | escalation_1 | escalation_2 | no_next_step | stale | task_overdue | review_overdue
    case_id: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    ref: Mapped[str | None] = mapped_column(String(400), nullable=True)
    owner_unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    message: Mapped[str] = mapped_column(Text)
    state: Mapped[str] = mapped_column(String(10), default="open")  # open | resolved
    raised_at: Mapped[str] = mapped_column(String(30))
    resolved_at: Mapped[str | None] = mapped_column(String(30), nullable=True)


class AppState(Base):
    __tablename__ = "app_state"
    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[str] = mapped_column(Text)


class Demand(Base):
    """What a unit asked an institution to send or do, by when (read from a letter or typed in).

    Only facts are kept: the letter's text is not stored (it may name a complainant), only its SHA-256 so the same letter is not recorded twice."""
    __tablename__ = "demands"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    institution_id: Mapped[str] = mapped_column(String(20), ForeignKey("institutions.id"), index=True)
    unit: Mapped[str] = mapped_column(String(20), ForeignKey("units.code"), index=True)
    case_id: Mapped[str | None] = mapped_column(String(20), ForeignKey("cases.id"), nullable=True)
    kind: Mapped[str] = mapped_column(String(30))  # show_cause | hearing_notice | inspection | information_request | reminder | warning | closure | other
    letter_ref: Mapped[str | None] = mapped_column(String(80), nullable=True)
    letter_date: Mapped[str] = mapped_column(String(10))
    items: Mapped[list] = mapped_column(JSON, default=list)  # item keys, see engine/letters.ITEMS
    other_items: Mapped[list] = mapped_column(JSON, default=list)  # asks in the letter's own words that match no known item
    due_on: Mapped[str | None] = mapped_column(String(10), nullable=True)
    hearing_on: Mapped[str | None] = mapped_column(String(10), nullable=True)
    hearing_what: Mapped[str | None] = mapped_column(String(80), nullable=True)
    state: Mapped[str] = mapped_column(String(12), default="open")  # open | answered | withdrawn
    answered_on: Mapped[str | None] = mapped_column(String(10), nullable=True)
    note: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(10), default="letter")  # letter | form
    letter_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    by: Mapped[str] = mapped_column(String(160))
    at: Mapped[str] = mapped_column(String(30))


__all__ = ["Float"]
