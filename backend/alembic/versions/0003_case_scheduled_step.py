"""cases get a next dated step (hearing, visit, reply due) for the collision calendar

Revision ID: 0003
Revises: 0002
"""
import sqlalchemy as sa

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("cases", sa.Column("scheduled", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("cases", "scheduled")
