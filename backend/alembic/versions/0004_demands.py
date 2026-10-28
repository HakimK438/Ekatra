"""demands: what each unit asked an institution for, by when (from letters)

Revision ID: 0004
Revises: 0003
"""
import sqlalchemy as sa

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "demands",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("institution_id", sa.String(20), sa.ForeignKey("institutions.id"), nullable=False),
        sa.Column("unit", sa.String(20), sa.ForeignKey("units.code"), nullable=False),
        sa.Column("case_id", sa.String(20), sa.ForeignKey("cases.id"), nullable=True),
        sa.Column("kind", sa.String(30), nullable=False),
        sa.Column("letter_ref", sa.String(80), nullable=True),
        sa.Column("letter_date", sa.String(10), nullable=False),
        sa.Column("items", sa.JSON(), nullable=False),
        sa.Column("other_items", sa.JSON(), nullable=False),
        sa.Column("due_on", sa.String(10), nullable=True),
        sa.Column("hearing_on", sa.String(10), nullable=True),
        sa.Column("hearing_what", sa.String(80), nullable=True),
        sa.Column("state", sa.String(12), nullable=False),
        sa.Column("answered_on", sa.String(10), nullable=True),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("source", sa.String(10), nullable=False),
        sa.Column("letter_sha256", sa.String(64), nullable=True),
        sa.Column("by", sa.String(160), nullable=False),
        sa.Column("at", sa.String(30), nullable=False),
    )
    op.create_index("ix_demands_institution_id", "demands", ["institution_id"])
    op.create_index("ix_demands_unit", "demands", ["unit"])
    op.create_index("ix_demands_letter_sha256", "demands", ["letter_sha256"])


def downgrade() -> None:
    op.drop_table("demands")
