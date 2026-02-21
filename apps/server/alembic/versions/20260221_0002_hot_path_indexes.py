"""hot path indexes for runs/events/costs

Revision ID: 20260221_0002
Revises: 20260221_0001
Create Date: 2026-02-21
"""

from __future__ import annotations

from alembic import op


# revision identifiers, used by Alembic.
revision = "20260221_0002"
down_revision = "20260221_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_run_events_run_id_id", "run_events", ["run_id", "id"], unique=False)
    op.create_index("ix_execution_costs_run_id_created_at", "execution_costs", ["run_id", "created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_execution_costs_run_id_created_at", table_name="execution_costs")
    op.drop_index("ix_run_events_run_id_id", table_name="run_events")
