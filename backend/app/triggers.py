"""Database triggers that make the audit log append-only: UPDATE and DELETE on audit_events are refused.

Used by the Alembic migration 0002 and by the tests (which build the schema directly).
"""
from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Connection

PG_UP = [
    """
    CREATE OR REPLACE FUNCTION audit_events_block_change() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'audit_events is append-only';
    END;
    $$ LANGUAGE plpgsql
    """,
    "DROP TRIGGER IF EXISTS audit_events_no_update ON audit_events",
    "DROP TRIGGER IF EXISTS audit_events_no_delete ON audit_events",
    "CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events FOR EACH ROW EXECUTE FUNCTION audit_events_block_change()",
    "CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION audit_events_block_change()",
]
PG_DOWN = [
    "DROP TRIGGER IF EXISTS audit_events_no_update ON audit_events",
    "DROP TRIGGER IF EXISTS audit_events_no_delete ON audit_events",
    "DROP FUNCTION IF EXISTS audit_events_block_change()",
]
SQLITE_UP = [
    "CREATE TRIGGER IF NOT EXISTS audit_events_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END",
    "CREATE TRIGGER IF NOT EXISTS audit_events_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END",
]
SQLITE_DOWN = ["DROP TRIGGER IF EXISTS audit_events_no_update", "DROP TRIGGER IF EXISTS audit_events_no_delete"]


def install(conn: Connection) -> None:
    for sql in (PG_UP if conn.dialect.name == "postgresql" else SQLITE_UP):
        conn.execute(text(sql))


def remove(conn: Connection) -> None:
    for sql in (PG_DOWN if conn.dialect.name == "postgresql" else SQLITE_DOWN):
        conn.execute(text(sql))
