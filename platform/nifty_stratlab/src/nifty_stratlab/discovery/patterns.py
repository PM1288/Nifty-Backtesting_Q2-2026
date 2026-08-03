from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class FeatureAssociation:
    feature: str
    sample_count: int
    positive_count: int
    coverage_pct: float
    positive_median: float
    negative_median: float
    robust_effect: float
    spearman_correlation: float | None


def rank_candidate_features(
    frame: pd.DataFrame,
    *,
    label_column: str = "target_hit",
    feature_columns: list[str] | None = None,
    minimum_non_null: int = 50,
) -> list[FeatureAssociation]:
    """Rank pre-entry features without claiming causality or defining a strategy."""

    if label_column not in frame:
        raise ValueError(f"missing label column {label_column}")
    labels = pd.to_numeric(frame[label_column], errors="coerce")
    if feature_columns is None:
        excluded = {label_column, "symbol", "decision_ts", "entry_ts", "exit_ts", "exit_reason"}
        feature_columns = [name for name in frame.columns if name not in excluded]
    associations: list[FeatureAssociation] = []
    for feature in feature_columns:
        values = pd.to_numeric(frame[feature], errors="coerce")
        valid = values.notna() & labels.notna()
        if int(valid.sum()) < minimum_non_null:
            continue
        x = values[valid]
        y = labels[valid].astype(int)
        positive = x[y == 1]
        negative = x[y == 0]
        if positive.empty or negative.empty:
            continue
        q75, q25 = np.nanpercentile(x, [75, 25])
        scale = float(q75 - q25)
        effect = float((positive.median() - negative.median()) / scale) if scale > 0 else 0.0
        corr = x.corr(y, method="spearman")
        associations.append(
            FeatureAssociation(
                feature=feature,
                sample_count=len(x),
                positive_count=int(y.sum()),
                coverage_pct=float(len(x) / len(frame) * 100),
                positive_median=float(positive.median()),
                negative_median=float(negative.median()),
                robust_effect=effect,
                spearman_correlation=None if pd.isna(corr) else float(corr),
            )
        )
    return sorted(associations, key=lambda item: (abs(item.robust_effect), item.sample_count), reverse=True)
