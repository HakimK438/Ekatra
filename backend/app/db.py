"""Database engine and session. Serverless-friendly: a tiny pool, so a warm function reuses its connection instead of paying
the connect and TLS handshake on every request; pre-ping replaces a connection that died while the function was frozen."""
from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool

from .config import settings


class Base(DeclarativeBase):
    pass


def make_engine(url: str | None = None):
    url = url or settings.database_url
    if url.startswith("sqlite"):
        kwargs: dict = {"connect_args": {"check_same_thread": False}}
        if ":memory:" in url:
            kwargs["poolclass"] = StaticPool  # one shared in-memory database (tests)
        return create_engine(url, **kwargs)
    # prepare_threshold=None: no server-side prepared statements, which a reused connection behind the Neon pooler can trip on
    return create_engine(url, connect_args={"prepare_threshold": None}, pool_size=1, max_overflow=4, pool_recycle=240, pool_pre_ping=True)


engine = make_engine()
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
