"""v1.11 runtime/detector/key lifecycle

Revision ID: 20260221_0003
Revises: 20260221_0002
Create Date: 2026-02-21
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260221_0003"
down_revision = "20260221_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("detections", sa.Column("disagreement_score", sa.Float(), nullable=False, server_default="0.0"))
    op.add_column("detections", sa.Column("uncertainty", sa.Float(), nullable=False, server_default="0.0"))

    op.create_table(
        "detection_votes",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("execution_id", sa.String(length=36), nullable=False),
        sa.Column("detector_name", sa.String(length=80), nullable=False),
        sa.Column("failure_flags", sa.JSON(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("evidence", sa.JSON(), nullable=False),
        sa.Column("latency_ms", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["execution_id"], ["executions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_detection_votes_execution_id", "detection_votes", ["execution_id"], unique=False)

    op.create_table(
        "secret_keys",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("version", sa.String(length=40), nullable=False),
        sa.Column("encrypted_material", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("activated_at", sa.DateTime(), nullable=True),
        sa.Column("retired_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "secret_key_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("key_id", sa.String(length=36), nullable=False),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("actor", sa.String(length=120), nullable=False),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["key_id"], ["secret_keys.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_secret_key_events_key_id", "secret_key_events", ["key_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_secret_key_events_key_id", table_name="secret_key_events")
    op.drop_table("secret_key_events")
    op.drop_table("secret_keys")

    op.drop_index("ix_detection_votes_execution_id", table_name="detection_votes")
    op.drop_table("detection_votes")

    op.drop_column("detections", "uncertainty")
    op.drop_column("detections", "disagreement_score")
