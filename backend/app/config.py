"""Settings come from environment variables only. No secrets in code; see .env.example."""
from __future__ import annotations

import os
from datetime import date


class Settings:
    def __init__(self) -> None:
        # Neon / Postgres in production; a local SQLite file for development and tests.
        url = os.getenv("DATABASE_URL", "sqlite:///./ekatra.db")
        # Neon gives postgres:// or postgresql://; SQLAlchemy needs the psycopg 3 driver name.
        if url.startswith("postgres://"):
            url = "postgresql+psycopg://" + url[len("postgres://"):]
        elif url.startswith("postgresql://"):
            url = "postgresql+psycopg://" + url[len("postgresql://"):]
        self.database_url = url
        self.jwt_secret = os.getenv("JWT_SECRET", "dev-only-change-me")
        self.cron_secret = os.getenv("CRON_SECRET", "")
        # Every demo account shares this password. Set it in the host's environment variables.
        self.demo_password = os.getenv("DEMO_PASSWORD", "demo")
        self.cookie_secure = os.getenv("COOKIE_SECURE", "false").lower() == "true"
        self.fixed_today = os.getenv("DEMO_TODAY")  # optional, e.g. 2026-10-23 for repeatable demos
        # Demo only: the hourly check pretends healthy units keep sending data, so the "data is old" warning means something.
        # Units listed in SILENT_UNITS are left alone and really go quiet. Turn off with SIMULATE_SOURCE_FEEDS=false.
        self.simulate_feeds = os.getenv("SIMULATE_SOURCE_FEEDS", "true").lower() == "true"
        self.silent_units = [u.strip() for u in os.getenv("SILENT_UNITS", "RB-SWR").split(",") if u.strip()]
        self.max_failed_logins = int(os.getenv("MAX_FAILED_LOGINS", "5"))
        self.token_hours = int(os.getenv("TOKEN_HOURS", "12"))

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


settings = Settings()


def today() -> str:
    """The working date. Clocks run from real time, so overdue counts grow as days pass."""
    return settings.fixed_today or date.today().isoformat()
