from __future__ import annotations

import json
from decimal import Decimal

from nifty_stratlab.calibration.model import ChronologicalProbabilityModel
from nifty_stratlab.contracts import ProductType
from nifty_stratlab.demo.config import demo_fee_registry
from nifty_stratlab.demo.synthetic import synthetic_equity_frame
from nifty_stratlab.discovery.labels import OpportunityLabelConfig, build_executable_opportunity_labels
from nifty_stratlab.discovery.walkforward import expanding_walk_forward_splits
from nifty_stratlab.features.technical import compute_technical_features


def main() -> int:
    import numpy as np
    import pandas as pd

    raw = synthetic_equity_frame(symbols=("AAA",), bars_per_symbol=700, seed=11)
    labels = build_executable_opportunity_labels(
        raw,
        config=OpportunityLabelConfig(
            ticket_size=Decimal("200000"), target_net_pnl=Decimal("100"),
            stop_loss_pct=Decimal("1"), horizon_bars=20, tick_size=Decimal("0.05"),
            exchange="NSE", product=ProductType.EQUITY_INTRADAY,
        ),
        fee_registry=demo_fee_registry(ProductType.EQUITY_INTRADAY),
    )
    features = compute_technical_features(raw)
    features["decision_ts"] = pd.to_datetime(features["event_ts"], utc=True)
    joined = labels.merge(features, on=["symbol", "decision_ts"], how="left")
    names = ("rsi_14", "willr_14", "return_1", "range_pct", "close_location_pct")
    X = joined[list(names)].to_numpy(float)
    y = joined["target_hit"].to_numpy(int)
    splits = expanding_walk_forward_splits(len(joined), minimum_train=250, test_size=80, purge=20)
    model = ChronologicalProbabilityModel(names, random_state=11)
    evidence = model.fit(X, y, splits)
    assert evidence.sample_count > 0
    print(json.dumps({"phase": 4, "status": "PASS", "labels": len(labels), "oof_samples": evidence.sample_count, "brier": evidence.brier_score}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
