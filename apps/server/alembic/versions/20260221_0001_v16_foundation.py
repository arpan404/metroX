"""v1.6 foundation objects

Revision ID: 20260221_0001
Revises:
Create Date: 2026-02-21
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260221_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Baseline migration marker. The current project still supports create_all fallback,
    # and this revision is used to establish alembic control for subsequent diffs.
    pass


def downgrade() -> None:
    pass
