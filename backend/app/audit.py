"""Append-only audit log with a hash chain: each entry stores the fingerprint of the one before it,
so editing or removing any entry breaks the chain from that point. A database trigger also blocks UPDATE/DELETE."""
from __future__ import annotations

import hashlib

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import AuditEvent

GENESIS = "genesis"


def payload(seq: int, at: str, actor: str, action: str, entity: str, details: str) -> str:
    return f"{seq}|{at}|{actor}|{action}|{entity}|{details}"


def chain_hash(prev: str, seq: int, at: str, actor: str, action: str, entity: str, details: str) -> str:
    return hashlib.sha256((prev + "|" + payload(seq, at, actor, action, entity, details)).encode("utf-8")).hexdigest()


def write_audit(db: Session, at: str, actor: str, action: str, entity: str, details: str) -> str:
    """Append one entry. Returns its reference, e.g. '#412'."""
    last = db.execute(select(AuditEvent).order_by(AuditEvent.seq.desc()).limit(1)).scalar_one_or_none()
    seq = (last.seq if last else 0) + 1
    prev = last.hash if last else GENESIS
    h = chain_hash(prev, seq, at, actor, action, entity, details)
    db.add(AuditEvent(seq=seq, at=at, actor=actor, action=action, entity=entity, details=details, prev_hash=prev, hash=h))
    db.flush()
    return f"#{seq}"


def verify_chain(db: Session) -> dict:
    rows = db.execute(select(AuditEvent).order_by(AuditEvent.seq)).scalars().all()
    prev = GENESIS
    for e in rows:
        if e.prev_hash != prev or e.hash != chain_hash(prev, e.seq, e.at, e.actor, e.action, e.entity, e.details):
            return {"ok": False, "count": len(rows), "brokenAt": e.seq}
        prev = e.hash
    return {"ok": True, "count": len(rows)}


def count(db: Session) -> int:
    return db.execute(select(func.count()).select_from(AuditEvent)).scalar_one()
