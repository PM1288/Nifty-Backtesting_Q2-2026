from decimal import Decimal

import pandas as pd

from nifty_stratlab.contracts import ProductType
from nifty_stratlab.demo.synthetic import synthetic_equity_frame
from nifty_stratlab.discovery.labels import OpportunityLabelConfig, build_executable_opportunity_labels
from nifty_stratlab.discovery.patterns import rank_candidate_features


def test_labels_enter_after_decision_and_use_cost_adjusted_target(intraday_registry):
    frame = synthetic_equity_frame(symbols=("AAA",), bars_per_symbol=80, seed=2)
    labels = build_executable_opportunity_labels(
        frame,
        config=OpportunityLabelConfig(
            ticket_size=Decimal("200000"), target_net_pnl=Decimal("100"),
            stop_loss_pct=Decimal("2"), horizon_bars=10, tick_size=Decimal("0.05"),
            exchange="NSE", product=ProductType.EQUITY_INTRADAY,
        ),
        fee_registry=intraday_registry,
    )
    assert not labels.empty
    assert (pd.to_datetime(labels["entry_ts"]) > pd.to_datetime(labels["decision_ts"])).all()
    assert (labels["total_cost"] >= 0).all()


def test_pattern_ranker_uses_only_requested_feature_columns():
    frame = pd.DataFrame({"target_hit": [0, 0, 1, 1] * 30, "feature": [0, 1, 9, 10] * 30})
    ranked = rank_candidate_features(frame, feature_columns=["feature"], minimum_non_null=20)
    assert ranked[0].feature == "feature"
    assert ranked[0].robust_effect > 0
