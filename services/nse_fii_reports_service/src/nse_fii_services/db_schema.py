from __future__ import annotations

from typing import Final

DEFAULT_DATA_SCHEMA: Final[str] = "market_data"
DEFAULT_AUDIT_SCHEMA: Final[str] = "audit"

DATASET_TABLE_SUFFIXES: Final[dict[str, tuple[str, str]]] = {
    "participant_open_interest": ("data", "nse_fii_participant_open_interest"),
    "participant_volume": ("data", "nse_fii_participant_volume"),
    "derivatives_stats": ("data", "nse_fii_derivatives_stats"),
    "manifest": ("audit", "load_manifest"),
}


def dataset_to_table_map(
    data_schema: str = DEFAULT_DATA_SCHEMA, audit_schema: str = DEFAULT_AUDIT_SCHEMA
) -> dict[str, str]:
    table_map: dict[str, str] = {}
    for dataset_name, (scope, table_name) in DATASET_TABLE_SUFFIXES.items():
        schema = data_schema if scope == "data" else audit_schema
        table_map[dataset_name] = f"{schema}.{table_name}"
    return table_map
