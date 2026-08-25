"""Preserve repeated data-quality recovery history while allowing one open incident."""

from pathlib import Path

from alembic import op

revision = "003_data_quality_incident_history"
down_revision = "002_target_lifecycle"
branch_labels = None
depends_on = None


def upgrade() -> None:
    schema = op.get_context().config.get_main_option("paper_schema", "paper_trading")
    sql = (Path(__file__).resolve().parents[2] / "migrations" / "003_data_quality_incident_history.sql").read_text()
    op.execute(sql.replace("__SCHEMA__", schema))


def downgrade() -> None:
    schema = op.get_context().config.get_main_option("paper_schema", "paper_trading")
    op.execute(f"DROP INDEX IF EXISTS {schema}.data_quality_incidents_one_open_idx")
    op.execute(
        f"ALTER TABLE {schema}.data_quality_incidents ADD CONSTRAINT "
        "data_quality_incidents_exchange_instrument_token_incident_t_key "
        "UNIQUE(exchange,instrument_token,incident_type,status)"
    )
