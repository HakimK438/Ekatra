"""Bring an older deployed database up to date when the API starts (Vercel deploys the code but never runs Alembic).

One step so far: a database left at migration 0003 gets the 0004 `demands` table, is marked 0004, and its SYNTHETIC demo data
is reloaded once (current demo users, sample letters). Everything else still goes through `python -m scripts.init_db`."""
from __future__ import annotations

import logging

from sqlalchemy import inspect, text

from . import models as m
from .db import SessionLocal, engine
from .seed import seed

log = logging.getLogger("ekatra")


def upgrade_old_database() -> None:
    insp = inspect(engine)
    if not insp.has_table("alembic_version") or insp.has_table("demands"):
        return
    lock = " FOR UPDATE" if engine.dialect.name == "postgresql" else ""  # a second instance starting at once waits here, then sees 0004
    with SessionLocal() as db:
        if db.execute(text("SELECT version_num FROM alembic_version" + lock)).scalar() != "0003":
            return
        m.Demand.__table__.create(db.connection(), checkfirst=True)
        db.execute(text("UPDATE alembic_version SET version_num = '0004'"))
        log.info("Upgraded the database from 0003 to 0004; demo data reloaded: %s", seed(db))
        db.commit()
