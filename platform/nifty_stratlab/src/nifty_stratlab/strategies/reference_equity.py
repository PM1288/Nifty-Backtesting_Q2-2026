from __future__ import annotations

from datetime import time
from typing import Sequence
from zoneinfo import ZoneInfo

from nifty_stratlab.contracts import SignalIntent
from nifty_stratlab.strategy.sdk import BaseStrategy, StrategyContext, StrategyManifest


class FastOversoldReboundStrategy(BaseStrategy):
    """Port of the useful legacy signal semantics, separated from execution."""

    def __init__(self, manifest: StrategyManifest) -> None:
        super().__init__(manifest)
        self.rsi_threshold = float(manifest.parameters.get("rsi_below", 30))
        self.willr_threshold = float(manifest.parameters.get("willr_below", -80))

    def on_bar(self, context: StrategyContext) -> Sequence[SignalIntent]:
        if context.position_open:
            return ()
        values = context.current.features
        rsi = values.get("rsi_14")
        willr = values.get("willr_14")
        prev_close = values.get("prev_close")
        if any(value is None for value in (rsi, willr, prev_close)):
            return ()
        if (
            float(rsi) < self.rsi_threshold
            and float(willr) < self.willr_threshold
            and context.current.close > float(prev_close)
        ):
            return (
                self.entry_signal(
                    context,
                    ("rsi_below_threshold", "willr_below_threshold", "close_above_previous_close"),
                    {"rsi_14": float(rsi), "willr_14": float(willr)},
                ),
            )
        return ()


class ConfirmedOversoldRecoveryStrategy(BaseStrategy):
    def on_bar(self, context: StrategyContext) -> Sequence[SignalIntent]:
        if context.position_open or context.previous is None:
            return ()
        current = context.current.features
        previous = context.previous.features
        required = (
            current.get("rsi_14"),
            current.get("willr_14"),
            current.get("prev_close"),
            previous.get("rsi_14"),
            previous.get("willr_14"),
        )
        if any(value is None for value in required):
            return ()
        if (
            float(previous["rsi_14"]) < 30 <= float(current["rsi_14"])
            and float(previous["willr_14"]) < -80 <= float(current["willr_14"])
            and context.current.close > context.current.open
            and context.current.close > float(current["prev_close"])
        ):
            return (
                self.entry_signal(
                    context,
                    ("rsi_reclaim_30", "willr_reclaim_minus_80", "green_close", "close_above_previous_close"),
                ),
            )
        return ()


class RsiIntradayDailyRegimeStrategy(BaseStrategy):
    """Buy on 1-minute oversold RSI and exit on overbought RSI.

    Entries require a bullish daily regime derived exclusively from the prior
    completed trading day's RSI.  Both entry and exit execute at next-bar open.
    """

    def __init__(self, manifest: StrategyManifest) -> None:
        super().__init__(manifest)
        self.entry_below = float(manifest.parameters.get("minute_rsi_below", 30))
        self.exit_above = float(manifest.parameters.get("minute_rsi_above", 70))
        self.daily_above = float(manifest.parameters.get("prior_daily_rsi_above", 45))
        self.entry_start = time.fromisoformat(str(manifest.parameters.get("entry_start", "09:15:00")))
        self.entry_end = time.fromisoformat(str(manifest.parameters.get("entry_end", "15:29:00")))
        forced = manifest.parameters.get("forced_exit_decision_time")
        self.forced_exit_time = time.fromisoformat(str(forced)) if forced else None
        self.one_trade_per_day = bool(manifest.parameters.get("one_trade_per_symbol_per_day", False))
        self._entered_sessions: set[tuple[str, object]] = set()

    def on_bar(self, context: StrategyContext) -> Sequence[SignalIntent]:
        minute_rsi = context.current.features.get("rsi_14")
        daily_rsi = context.current.features.get("daily_rsi_14_prior")
        if minute_rsi is None or daily_rsi is None:
            return ()
        local = context.current.event_ts.astimezone(ZoneInfo("Asia/Kolkata"))
        session_key = (context.current.symbol, local.date())
        metadata = {
            "minute_rsi_14": float(minute_rsi),
            "prior_daily_rsi_14": float(daily_rsi),
            "signal_bar_event_ts": context.current.event_ts.isoformat(),
        }
        if context.position_open:
            if self.forced_exit_time is not None and local.time() >= self.forced_exit_time:
                return (self.exit_signal(context, ("forced_session_exit",), metadata),)
            if float(minute_rsi) > self.exit_above:
                return (self.exit_signal(context, ("minute_rsi_above_exit",), metadata),)
            return ()
        if self.one_trade_per_day and session_key in self._entered_sessions:
            return ()
        if not self.entry_start <= local.time() <= self.entry_end:
            return ()
        if float(minute_rsi) < self.entry_below and float(daily_rsi) > self.daily_above:
            self._entered_sessions.add(session_key)
            return (
                self.entry_signal(
                    context,
                    ("minute_rsi_below_entry", "prior_daily_rsi_above_regime"),
                    metadata,
                ),
            )
        return ()


class DailyRisingOversoldIntradayStrategy(BaseStrategy):
    """Daily oversold-and-rising setup confirmed by a 09:30-12:00 pullback."""

    def __init__(self, manifest: StrategyManifest) -> None:
        super().__init__(manifest)
        self.minute_below = float(manifest.parameters.get("minute_rsi_below", 25))
        self.willr_below = float(manifest.parameters.get("minute_willr_below", -80))
        self.entry_start = time.fromisoformat(str(manifest.parameters.get("entry_start", "09:30:00")))
        self.entry_end = time.fromisoformat(str(manifest.parameters.get("entry_end", "12:00:00")))

    def on_bar(self, context: StrategyContext) -> Sequence[SignalIntent]:
        values = context.current.features
        local_time = context.current.event_ts.astimezone(ZoneInfo("Asia/Kolkata")).time()
        if context.position_open:
            # This strategy is target-only. The simulator owns intraday/swing
            # target detection from the actual entry price; no RSI exit signal.
            return ()
        required = (
            values.get("setup_rsi"), values.get("setup_rsi_prev1"), values.get("setup_close"),
            values.get("rsi_14"), values.get("willr_14"), values.get("bollinger_lower_20_2"),
        )
        if any(value is None for value in required) or not self.entry_start <= local_time <= self.entry_end:
            return ()
        setup_rsi, prev1, setup_close, minute_rsi, willr, lower_band = map(float, required)
        if (
            setup_rsi > prev1
            and context.current.open > setup_close
            and minute_rsi < self.minute_below and willr < self.willr_below
            and context.current.low > lower_band
        ):
            return (self.entry_signal(context, (
                "daily_rsi_gt_yesterday", "open_gt_previous_day_close",
                "minute_rsi_lt_25", "minute_willr_lt_minus80", "low_gt_bollinger_lower",
            ), {"setup_rsi": setup_rsi, "setup_rsi_prev1": prev1,
                "minute_rsi_14": minute_rsi, "willr_14": willr, "bollinger_lower_20_2": lower_band}),)
        return ()
