from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from nifty_stratlab.features.technical import compute_technical_features


@dataclass(frozen=True)
class ParityDifference:
    symbol: str
    event_ts: str
    feature: str
    batch_value: float | None
    online_value: float | None
    absolute_difference: float | None


class ReferenceOnlineFeatureReplayer:
    """Correctness-first incremental replay using the canonical batch function.

    It is intentionally not the final low-latency implementation. Its role is to
    provide a golden oracle against which an optimised online state machine is
    certified before deployment.
    """

    def __init__(self) -> None:
        self._rows: list[dict] = []

    def update(self, row: dict) -> dict:
        self._rows.append(dict(row))
        output = compute_technical_features(pd.DataFrame(self._rows))
        return output.iloc[-1].to_dict()


def compare_batch_and_online(
    frame: pd.DataFrame,
    *,
    features: tuple[str, ...] = ("rsi_14", "willr_14", "sma20", "sma50", "macd_line", "macd_signal", "session_vwap"),
    tolerance: float = 1e-10,
) -> list[ParityDifference]:
    data = frame.copy()
    data["event_ts"] = pd.to_datetime(data["event_ts"], utc=True)
    data = data.sort_values(["symbol", "event_ts"], kind="mergesort").reset_index(drop=True)
    batch = compute_technical_features(data)
    differences: list[ParityDifference] = []
    for symbol, group in data.groupby("symbol", sort=False):
        replayer = ReferenceOnlineFeatureReplayer()
        batch_group = batch[batch["symbol"] == symbol].reset_index(drop=True)
        for index, (_, row) in enumerate(group.reset_index(drop=True).iterrows()):
            online = replayer.update(row.to_dict())
            expected = batch_group.iloc[index]
            for feature in features:
                left, right = expected.get(feature), online.get(feature)
                if pd.isna(left) and pd.isna(right):
                    continue
                if pd.isna(left) != pd.isna(right) or not np.isclose(float(left), float(right), rtol=tolerance, atol=tolerance):
                    differences.append(
                        ParityDifference(
                            symbol=symbol,
                            event_ts=str(row["event_ts"]),
                            feature=feature,
                            batch_value=None if pd.isna(left) else float(left),
                            online_value=None if pd.isna(right) else float(right),
                            absolute_difference=None if pd.isna(left) or pd.isna(right) else abs(float(left) - float(right)),
                        )
                    )
    return differences
