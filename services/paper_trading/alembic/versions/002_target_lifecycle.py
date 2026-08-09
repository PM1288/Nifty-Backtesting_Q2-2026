from __future__ import annotations

from pathlib import Path

from alembic import op

from papertrade.config import get_settings

revision = "002_target_lifecycle"
down_revision = "001_universal_paper_trading"
branch_labels = None
depends_on = None


def upgrade() -> None:
    schema = get_settings().PAPER_TRADING_SCHEMA
    sql = (Path(__file__).resolve().parents[2] / "migrations" / "002_target_lifecycle.sql").read_text()
    op.execute(sql.replace("__SCHEMA__", schema))


def downgrade() -> None:
    schema = get_settings().PAPER_TRADING_SCHEMA
    if not schema.replace("_", "").isalnum():
        raise RuntimeError("unsafe schema identifier")
    op.execute(f'ALTER TABLE "{schema}".execution_exit_rules DROP COLUMN IF EXISTS target_lifecycle')
