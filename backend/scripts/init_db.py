"""Create or update the database schema (Alembic) and load the synthetic demo data when the database is empty.

    python -m scripts.init_db            # migrate, seed if empty
    python -m scripts.init_db --reset    # migrate, then reload the demo data
"""
import sys
from pathlib import Path

from alembic.config import Config
from sqlalchemy import inspect, select

from alembic import command
from app import models as m
from app.db import SessionLocal, engine
from app.seed import seed


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    cfg = Config(str(root / "alembic.ini"))
    cfg.set_main_option("script_location", str(root / "alembic"))
    command.upgrade(cfg, "head")
    reset = "--reset" in sys.argv
    with SessionLocal() as db:
        empty = not inspect(engine).has_table("users") or db.execute(select(m.User.id).limit(1)).first() is None
        if reset or empty:
            print("Loading synthetic demo data:", seed(db))
            db.commit()
        else:
            print("Database already has data. Use --reset to reload the demo data.")


if __name__ == "__main__":
    main()
