from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

import pandas as pd

from nifty_stratlab.contracts import ProductType
from nifty_stratlab.features.technical import attach_prior_completed_daily_rsi
from nifty_stratlab.simulation.engine import BacktestEngine
from nifty_stratlab.simulation.models import SimulationConfig
from nifty_stratlab.strategies.reference_equity import RsiIntradayDailyRegimeStrategy
from nifty_stratlab.strategy.sdk import StrategyBar, StrategyContext, StrategyManifest


def _manifest() -> StrategyManifest:
    return StrategyManifest(
        strategy_id="rsi_1m_daily45",
        strategy_version_id="rsi_1m_daily45_v1",
        display_name="RSI 1m/daily",
        version=1,
        archetype="test",
        plugin="nifty_stratlab.strategies.reference_equity:RsiIntradayDailyRegimeStrategy",
        supported_intervals=("1m",),
        required_features=("rsi_14", "daily_rsi_14_prior"),
        parameters={"minute_rsi_below": 30, "minute_rsi_above": 70, "prior_daily_rsi_above": 45},
        assumptions={},
        owner="test",
    )


def _bar(start: datetime, minute: int, minute_rsi: float, daily_rsi: float) -> StrategyBar:
    event_ts = start + timedelta(minutes=minute)
    return StrategyBar(
        "AAA", "NSE:AAA", event_ts, event_ts + timedelta(minutes=1), "1m",
        100, 200, 1, 100, 1000,
        {"rsi_14": minute_rsi, "daily_rsi_14_prior": daily_rsi},
    )


def test_strategy_requires_daily_regime_and_exits_at_next_open(intraday_registry):
    tz = ZoneInfo("Asia/Kolkata")
    start = datetime(2026, 8, 4, 9, 15, tzinfo=tz)
    strategy = RsiIntradayDailyRegimeStrategy(_manifest())
    blocked = strategy.on_bar(StrategyContext(strategy.manifest, _bar(start, 0, 29, 45), None, False))
    assert blocked == ()

    bars = [
        _bar(start, 0, 29, 46),
        _bar(start, 1, 50, 46),
        _bar(start, 2, 71, 46),
        _bar(start, 3, 50, 46),
    ]
    result = BacktestEngine(
        strategy=strategy,
        config=SimulationConfig(
            initial_cash=Decimal("300000"), ticket_size=Decimal("200000"),
            max_open_positions=1, product=ProductType.EQUITY_INTRADAY,
            target_net_pnl=Decimal("0"), stop_loss_pct=Decimal("1"), max_hold_bars=100,
            enable_target_exit=False, enable_stop_exit=False,
        ),
        fee_registry=intraday_registry,
    ).run(bars)
    assert [signal.intent_type for signal in result.signals] == ["enter", "exit"]
    assert len(result.trades) == 1
    assert result.trades[0].entry_ts == bars[1].event_ts
    assert result.trades[0].exit_ts == bars[3].event_ts
    assert result.trades[0].exit_reason == "strategy_rsi_above_70_next_open"


def test_daily_rsi_uses_only_prior_completed_session():
    tz = ZoneInfo("Asia/Kolkata")
    rows = []
    for day in range(20):
        session = datetime(2026, 7, 1, 9, 15, tzinfo=tz) + timedelta(days=day)
        close = 100 + day + (-3 if day % 4 == 0 else 0)
        rows.extend(
            [
                {"symbol": "AAA", "event_ts": session, "close": close - 0.5},
                {"symbol": "AAA", "event_ts": session + timedelta(minutes=1), "close": close},
            ]
        )
    frame = pd.DataFrame(rows)
    first = attach_prior_completed_daily_rsi(frame)
    changed = frame.copy()
    changed.loc[changed.index[-1], "close"] = 10000
    second = attach_prior_completed_daily_rsi(changed)
    last_session = first["session_date"].max()
    first_value = first.loc[first["session_date"] == last_session, "daily_rsi_14_prior"]
    second_value = second.loc[second["session_date"] == last_session, "daily_rsi_14_prior"]
    assert first_value.notna().all()
    assert first_value.nunique() == 1
    assert first_value.tolist() == second_value.tolist()
