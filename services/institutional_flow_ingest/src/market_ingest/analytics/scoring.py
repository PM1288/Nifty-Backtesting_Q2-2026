from __future__ import annotations

import pandas as pd


def score_institution_signal(frame: pd.DataFrame) -> pd.DataFrame:
    result = frame.copy()
    components = []
    for column in [
        "bulk_deal_flag",
        "block_deal_flag",
        "quarterly_fii_holding_change_pct",
        "quarterly_dii_holding_change_pct",
        "delivery_pct",
    ]:
        if column in result:
            components.append(result[column].fillna(0))
    if components:
        result["institution_signal_score"] = sum(components)
    else:
        result["institution_signal_score"] = 0.0
    result["explainability_notes"] = "Proxy score derived from aggregate flow, holding changes, deals, and delivery context."
    return result
