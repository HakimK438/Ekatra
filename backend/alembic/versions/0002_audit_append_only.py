"""audit log is append-only (database trigger)

Revision ID: 0002
Revises: 0001
"""
from alembic import op
from app import triggers

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    triggers.install(op.get_bind())


def downgrade() -> None:
    triggers.remove(op.get_bind())
