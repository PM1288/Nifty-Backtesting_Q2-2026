from __future__ import annotations

from pathlib import Path

from alembic import op

from papertrade.config import get_settings

revision = "001_universal_paper_trading"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    schema = get_settings().PAPER_TRADING_SCHEMA
    sql = (Path(__file__).resolve().parents[2] / "migrations" / "001_init.sql").read_text()
    op.execute(sql.replace("__SCHEMA__", schema))


def downgrade() -> None:
    schema = get_settings().PAPER_TRADING_SCHEMA
    if not schema.replace("_", "").isalnum():
        raise RuntimeError("unsafe schema identifier")
    op.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
