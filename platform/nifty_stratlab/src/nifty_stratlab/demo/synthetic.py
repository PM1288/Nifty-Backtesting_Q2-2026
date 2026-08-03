from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

from nifty_stratlab.strategy.sdk import StrategyBar


def synthetic_equity_frame(
    *,
    symbols: tuple[str, ...] = ("AAA", "BBB"),
    bars_per_symbol: int = 180,
    seed: int = 7,
    interval_minutes: int = 1,
) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows = []
    tz = ZoneInfo("Asia/Kolkata")
    base_start = datetime(2026, 8, 4, 9, 15, tzinfo=tz)
    for symbol_index, symbol in enumerate(symbols):
        price = 100.0 + symbol_index * 50
        start = base_start
        for index in range(bars_per_symbol):
            if index and index % 375 == 0:
                start += timedelta(days=1)
            shock = rng.normal(0.0001, 0.003)
            if 50 <= index < 65:
                shock -= 0.004
            if 65 <= index < 85:
                shock += 0.005
            open_px = price
            close = max(1.0, price * (1 + shock))
            spread = abs(rng.normal(0.002, 0.001))
            high = max(open_px, close) * (1 + spread)
            low = min(open_px, close) * (1 - spread)
            event_ts = start + timedelta(minutes=index * interval_minutes)
            rows.append(
                {
                    "symbol": symbol,
                    "instrument_id": f"NSE:{symbol}",
                    "event_ts": event_ts,
                    "available_at": event_ts + timedelta(minutes=interval_minutes),
                    "open": round(open_px, 4),
                    "high": round(high, 4),
                    "low": round(low, 4),
                    "close": round(close, 4),
                    "volume": int(rng.integers(10_000, 200_000)),
                }
            )
            price = close
    return pd.DataFrame(rows)


def frame_to_strategy_bars(frame: pd.DataFrame) -> list[StrategyBar]:
    from nifty_stratlab.features.technical import compute_technical_features

    featured = compute_technical_features(frame)
    bars = []
    base_columns = {"symbol", "instrument_id", "event_ts", "available_at", "open", "high", "low", "close", "volume"}
    for row in featured.to_dict(orient="records"):
        features = {
            key: (None if pd.isna(value) else value)
            for key, value in row.items()
            if key not in base_columns
        }
        bars.append(
            StrategyBar(
                symbol=row["symbol"],
                instrument_id=row.get("instrument_id", f"NSE:{row['symbol']}"),
                event_ts=pd.Timestamp(row["event_ts"]).to_pydatetime(),
                available_at=pd.Timestamp(row.get("available_at", row["event_ts"])).to_pydatetime(),
                interval="1m",
                open=float(row["open"]),
                high=float(row["high"]),
                low=float(row["low"]),
                close=float(row["close"]),
                volume=int(row["volume"]),
                features=features,
            )
        )
    return bars


def synthetic_option_premium_bars(count: int = 80, seed: int = 5):
    from nifty_stratlab.options.simulator import OptionPremiumBar

    rng = np.random.default_rng(seed)
    tz = ZoneInfo("Asia/Kolkata")
    start = datetime(2026, 8, 4, 9, 15, tzinfo=tz)
    price = Decimal("120")
    rows = []
    for index in range(count):
        change = Decimal(str(rng.normal(0.001, 0.025)))
        open_px = price
        close = max(Decimal("0.05"), open_px * (Decimal("1") + change))
        width = abs(Decimal(str(rng.normal(0.01, 0.005))))
        high = max(open_px, close) * (Decimal("1") + width)
        low = max(Decimal("0.05"), min(open_px, close) * (Decimal("1") - width))
        rows.append(
            OptionPremiumBar(
                event_ts=start + timedelta(minutes=index),
                open=open_px.quantize(Decimal("0.05")),
                high=high.quantize(Decimal("0.05")),
                low=low.quantize(Decimal("0.05")),
                close=close.quantize(Decimal("0.05")),
            )
        )
        price = close
    return rows
