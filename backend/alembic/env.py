"""Alembic environment. Uses DIRECT_DATABASE_URL when set (Neon: the non-pooled host), else DATABASE_URL."""
import os

from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool

from alembic import context
from app import models  # noqa: F401  (registers the tables)
from app.config import settings
from app.db import Base

config = context.config
target_metadata = Base.metadata


def _url() -> str:
    url = os.getenv("DIRECT_DATABASE_URL") or settings.database_url
    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url[len("postgres://"):]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


def run_migrations_online() -> None:
    engine = create_engine(_url(), poolclass=NullPool)
    with engine.connect() as conn:
        context.configure(connection=conn, target_metadata=target_metadata, render_as_batch=conn.dialect.name == "sqlite")
        with context.begin_transaction():
            context.run_migrations()


run_migrations_online()
