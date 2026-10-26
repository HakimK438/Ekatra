import os

# Must be set before the app is imported: an in-memory database and a fixed working date, so every test sees the same data.
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["DEMO_TODAY"] = "2026-10-23"
os.environ["DEMO_PASSWORD"] = "demo"
os.environ["CRON_SECRET"] = "test-cron-secret"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import (
    models,  # noqa: E402,F401
    triggers,  # noqa: E402
)
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import seed  # noqa: E402


@pytest.fixture()
def db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with engine.begin() as conn:
        triggers.install(conn)
    with SessionLocal() as s:
        seed(s, "2026-10-23")
        s.commit()
    with SessionLocal() as s:
        yield s


@pytest.fixture()
def client(db):
    return TestClient(app)


def login(client: TestClient, username: str) -> TestClient:
    r = client.post("/api/v1/auth/login", json={"username": username, "password": "demo"})
    assert r.status_code == 200, r.text
    return client


@pytest.fixture()
def as_user(client):
    def _as(username: str) -> TestClient:
        c = TestClient(app)
        login(c, username)
        return c
    return _as
