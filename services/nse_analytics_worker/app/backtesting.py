from __future__ import annotations

import json
import hashlib
import logging
import math
import sys
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

import pandas as pd

from .db import fetch_value, query_df
from .indicator_strategy import _as_date, _compute_rsi_series, _compute_willr_series, _round_or_none

logger = logging.getLogger(__name__)

BATCH_NAME = "backtesting_precompute"
DEFAULT_STRATEGY_ID = "rsi30_willr80_closegtprev_tp125"
DEFAULT_STRATEGY_VERSION_ID = "rsi30_willr80_closegtprev_tp125_v1"
DEFAULT_UNIVERSE_NAME = "nifty100_equity"
EVIDENCE_YEARS = 3
WARMUP_DAYS = 370
STALE_AFTER_DAYS = 5
FD_ANNUAL_RATE_PCT = 6.0
PROFIT_TAX_RESERVE_RATE = 0.35

_ChargeFn = Callable[..., dict[str, float]]
_DELIVERY_CHARGE_BREAKDOWN: _ChargeFn | None = None


def _strategy_definitions() -> list[dict[str, Any]]:
    shared_capital_modes = ["no_capital_limit", "capital_16l", "capital_10l", "capital_20l", "capital_50l"]
    shared_universe_modes = ["single_stock", "nifty_100"]
    return [
        {
            "strategy_id": "rsi30_willr80_closegtprev_tp125",
            "strategy_version_id": "rsi30_willr80_closegtprev_tp125_v1",
            "display_name": "Fast Oversold Rebound",
            "description": "Aggressive oversold rebound capture using RSI, WILLR, and positive close confirmation with a +1.25% target.",
            "archetype": "mean_reversion_fast",
            "config": {
                "instrument_scope": "stock_only",
                "universe_name": DEFAULT_UNIVERSE_NAME,
                "universe_modes": shared_universe_modes,
                "capital_modes": shared_capital_modes,
                "indicator_periods": {"rsi": 14, "willr": 14},
                "entry_kind": "fast_oversold_rebound",
                "entry_rules": {
                    "rsi_max_exclusive": 30.0,
                    "willr_max_exclusive": -80.0,
                    "require_close_above_previous": True,
                },
                "exit_rules": {"take_profit_pct": 1.25},
                "priority_rule": [
                    "entry_date_asc",
                    "lower_rsi_first",
                    "lower_willr_first",
                    "higher_close_vs_prev_close_pct_first",
                    "symbol_asc",
                ],
                "benchmark": {
                    "primary": {"type": "nifty50_price_index", "dividends_included": False},
                    "secondary": {"type": "fd_daily_compound", "annual_rate_pct": FD_ANNUAL_RATE_PCT},
                },
                "profit_tax_reserve_rate": PROFIT_TAX_RESERVE_RATE,
                "regime_config_ref": "market_regime_v1",
            },
            "assumptions": {
                "execution_timing": "Signal on T close, entry on T+1 open.",
                "exit_logic": "Gap-open target exit first, else intraday target exit at target price.",
                "ranking_rule": "Lower RSI, lower WILLR, larger positive close-vs-prev-close, then symbol.",
                "universe_membership": "Current members only via instrument_universe for v1.",
                "fee_source": "Delivery-equity charge breakdown reused from simulator when importable.",
            },
        },
        {
            "strategy_id": "rsi_reclaim30_willr_reclaim80_greenclose_tp200_sl200_max10",
            "strategy_version_id": "rsi_reclaim30_willr_reclaim80_greenclose_tp200_sl200_max10_v1",
            "display_name": "Confirmed Oversold Recovery",
            "description": "Selective mean-reversion strategy that waits for RSI and WILLR reclaim plus a green confirmation candle, then uses +2% / -2% / 10-day controls.",
            "archetype": "mean_reversion_confirmed",
            "config": {
                "instrument_scope": "stock_only",
                "universe_name": DEFAULT_UNIVERSE_NAME,
                "universe_modes": shared_universe_modes,
                "capital_modes": shared_capital_modes,
                "indicator_periods": {"rsi": 14, "willr": 14},
                "entry_kind": "confirmed_oversold_recovery",
                "entry_rules": {
                    "rsi_reclaim_level": 30.0,
                    "willr_reclaim_level": -80.0,
                    "require_green_close": True,
                    "require_close_above_previous": True,
                },
                "exit_rules": {"take_profit_pct": 2.0, "stop_loss_pct": 2.0, "max_hold_days": 10},
                "priority_rule": [
                    "entry_date_asc",
                    "lower_rsi_first",
                    "lower_willr_first",
                    "higher_close_vs_prev_close_pct_first",
                    "symbol_asc",
                ],
                "benchmark": {
                    "finite_capital": {"type": "fd_daily_compound", "annual_rate_pct": FD_ANNUAL_RATE_PCT},
                    "no_capital_limit": {"type": "normalized_fd", "base_index": 100, "annual_rate_pct": FD_ANNUAL_RATE_PCT},
                },
                "regime_config_ref": "market_regime_v1",
            },
            "assumptions": {
                "execution_timing": "Signal on T close, entry on T+1 open.",
                "exit_logic": "Target, stop, then conservative stop-first conflict handling; timeout exits on the next session open after 10 completed sessions.",
                "ranking_rule": "Lower RSI, lower WILLR, larger positive close-vs-prev-close, then symbol.",
                "conflict_rule": "If target and stop both hit intraday, stop wins conservatively.",
                "universe_membership": "Current members only via instrument_universe for v1.",
            },
        },
        {
            "strategy_id": "macd_bullcross_above50dma_rsi55to70_tp400_sl300_max20",
            "strategy_version_id": "macd_bullcross_above50dma_rsi55to70_tp400_sl300_max20_v1",
            "display_name": "MACD Trend Continuation",
            "description": "Trend-following strategy that buys bullish MACD continuation above the 50DMA and exits on target, stop, trend failure, or timeout.",
            "archetype": "trend_continuation",
            "config": {
                "instrument_scope": "stock_only",
                "universe_name": DEFAULT_UNIVERSE_NAME,
                "universe_modes": shared_universe_modes,
                "capital_modes": shared_capital_modes,
                "indicator_periods": {"rsi": 14, "macd_fast": 12, "macd_slow": 26, "macd_signal": 9, "sma20": 20, "sma50": 50},
                "entry_kind": "macd_trend_continuation",
                "entry_rules": {"rsi_min_inclusive": 55.0, "rsi_max_inclusive": 70.0},
                "exit_rules": {"take_profit_pct": 4.0, "stop_loss_pct": 3.0, "max_hold_days": 20},
                "priority_rule": [
                    "entry_date_asc",
                    "larger_macd_spread_first",
                    "stronger_rsi_first",
                    "larger_distance_above_sma50_first",
                    "symbol_asc",
                ],
                "benchmark": {
                    "finite_capital": {"type": "fd_daily_compound", "annual_rate_pct": FD_ANNUAL_RATE_PCT},
                    "no_capital_limit": {"type": "normalized_fd", "base_index": 100, "annual_rate_pct": FD_ANNUAL_RATE_PCT},
                },
                "regime_config_ref": "market_regime_v1",
            },
            "assumptions": {
                "execution_timing": "Signal on T close, entry on T+1 open.",
                "exit_logic": "Target and stop use conservative stop-first conflict handling; bearish MACD cross, close below SMA20, and timeout exit on next-session open.",
                "ranking_rule": "Larger MACD spread, stronger RSI within 55-70, larger distance above SMA50, then symbol.",
                "macd_definition": "Standard 12/26/9 MACD with EMA-based line and signal.",
                "universe_membership": "Current members only via instrument_universe for v1.",
            },
        },
    ]


@dataclass(frozen=True)
class ScenarioSpec:
    strategy_id: str
    strategy_version_id: str
    strategy_name: str
    archetype: str
    scenario_key: str
    scenario_label: str
    universe_mode: str
    capital_mode: str
    stock_symbol: str | None
    ticket_size: float | None
    starting_cash: float | None
    max_open_positions: int | None
    benchmark_mode: str


@dataclass
class SymbolBar:
    trade_date: date
    symbol: str
    security_name: str
    sector: str
    open_price: float | None
    high_price: float | None
    low_price: float | None
    close_price: float | None
    prev_close: float | None
    close_vs_prev_close_pct: float | None
    rsi_14: float | None = None
    willr_14: float | None = None
    sma20: float | None = None
    sma50: float | None = None
    macd_line: float | None = None
    macd_signal: float | None = None
    macd_hist: float | None = None
    regime_label: str = "Neutral"
    data_quality_flag: str = "ok"


@dataclass
class PendingSignal:
    symbol: str
    security_name: str
    sector: str
    signal_date: date
    entry_date: date
    signal_rsi: float | None
    signal_willr: float | None
    close_vs_prev_close_pct: float | None
    regime_label: str


@dataclass
class OpenPosition:
    symbol: str
    security_name: str
    sector: str
    signal_date: date
    entry_date: date
    signal_rsi: float | None
    signal_willr: float | None
    close_vs_prev_close_pct: float | None
    regime_label: str
    quantity: float
    entry_price: float
    target_price: float
    gross_entry_value: float
    entry_charges: float
    mark_basis_value: float
    entry_index: int
    last_market_value: float
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class TradeTemplate:
    trade_template_id: str
    strategy_id: str
    strategy_version_id: str
    symbol: str
    security_name: str
    sector: str
    signal_date: date
    entry_date: date
    regime_on_entry: str
    signal_rsi: float | None
    signal_willr: float | None
    signal_macd_line: float | None
    signal_macd_signal: float | None
    signal_sma20: float | None
    signal_sma50: float | None
    close_vs_prev_close_pct: float | None
    rank_inputs: dict[str, Any]
    entry_price: float
    target_price: float | None
    stop_price: float | None
    theoretical_exit_date: date | None
    theoretical_exit_price: float | None
    exit_reason: str | None
    exit_timing: str | None
    hold_days: int | None
    gross_return_pct: float | None
    open_trade_flag_at_asof: bool
    mark_to_market_price: float | None
    mark_to_market_return_pct: float | None
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class ReplayPosition:
    template: TradeTemplate
    quantity: float
    entry_charges: float
    gross_entry_value: float
    invested_basis: float
    last_market_value: float


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _stale_after(data_as_of_date: date) -> datetime:
    return datetime.combine(data_as_of_date + timedelta(days=STALE_AFTER_DAYS), time.min, tzinfo=timezone.utc)


def _safe_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        result = float(value)
    except Exception:
        return None
    if math.isnan(result) or math.isinf(result):
        return None
    return result


def _delivery_charge_breakdown() -> _ChargeFn:
    global _DELIVERY_CHARGE_BREAKDOWN
    if _DELIVERY_CHARGE_BREAKDOWN is not None:
        return _DELIVERY_CHARGE_BREAKDOWN

    try:
        from nse_reco_state_aware_engine.core.simulator import _delivery_charge_breakdown as fn

        _DELIVERY_CHARGE_BREAKDOWN = fn
        return fn
    except Exception:
        pass

    sibling_src = Path(__file__).resolve().parents[2] / "nse_reco_state_engine" / "src"
    if sibling_src.exists():
        sibling_path = str(sibling_src)
        if sibling_path not in sys.path:
            sys.path.append(sibling_path)
        try:
            from nse_reco_state_aware_engine.core.simulator import _delivery_charge_breakdown as fn

            _DELIVERY_CHARGE_BREAKDOWN = fn
            return fn
        except Exception:
            pass

    def fallback(turnover: float, *, side: str, instrument_type: str, apply_dp: bool = False) -> dict[str, float]:
        if turnover <= 0 or instrument_type == "index":
            return {
                "brokerage": 0.0,
                "stt": 0.0,
                "transaction_charges": 0.0,
                "sebi_charges": 0.0,
                "gst": 0.0,
                "stamp_duty": 0.0,
                "dp_charges": 0.0,
                "total": 0.0,
            }
        stt_raw = turnover * 0.001
        whole = math.floor(stt_raw)
        stt = float(whole + (1 if stt_raw - whole >= 0.5 else 0))
        transaction_charges = round(turnover * 0.0000307, 2)
        sebi_charges = round(turnover * 0.000001, 2)
        brokerage = 0.0
        gst = round((brokerage + transaction_charges + sebi_charges) * 0.18, 2)
        stamp_duty = round(turnover * 0.00015, 2) if side == "buy" else 0.0
        dp_charges = 15.34 if side == "sell" and apply_dp else 0.0
        total = round(brokerage + stt + transaction_charges + sebi_charges + gst + stamp_duty + dp_charges, 2)
        return {
            "brokerage": brokerage,
            "stt": stt,
            "transaction_charges": transaction_charges,
            "sebi_charges": sebi_charges,
            "gst": gst,
            "stamp_duty": stamp_duty,
            "dp_charges": dp_charges,
            "total": total,
        }

    _DELIVERY_CHARGE_BREAKDOWN = fallback
    return fallback


def _insert_many(cur, sql: str, rows: list[tuple[Any, ...]]) -> None:
    if rows:
        cur.executemany(sql, rows)


def _ensure_default_strategy(conn) -> None:
    with conn.cursor() as cur:
        for strategy in _strategy_definitions():
            cur.execute(
                """
                INSERT INTO nse_app.backtest_strategy (
                    strategy_id, strategy_slug, display_name, description, status, created_at, updated_at
                )
                VALUES (%s, %s, %s, %s, 'active', NOW(), NOW())
                ON CONFLICT (strategy_id)
                DO UPDATE SET
                    strategy_slug = EXCLUDED.strategy_slug,
                    display_name = EXCLUDED.display_name,
                    description = EXCLUDED.description,
                    status = 'active',
                    updated_at = NOW()
                """,
                (
                    strategy["strategy_id"],
                    strategy["strategy_id"],
                    strategy["display_name"],
                    strategy["description"],
                ),
            )
            cur.execute(
                """
                INSERT INTO nse_app.backtest_strategy_version (
                    strategy_version_id, strategy_id, version_number, config_json, assumptions_json,
                    fee_profile_id, created_at, created_by, is_active_version
                )
                VALUES (%s, %s, 1, %s::jsonb, %s::jsonb, %s, NOW(), 'analytics_worker', TRUE)
                ON CONFLICT (strategy_version_id)
                DO UPDATE SET
                    config_json = EXCLUDED.config_json,
                    assumptions_json = EXCLUDED.assumptions_json,
                    fee_profile_id = EXCLUDED.fee_profile_id,
                    is_active_version = TRUE
                """,
                (
                    strategy["strategy_version_id"],
                    strategy["strategy_id"],
                    json.dumps(strategy["config"]),
                    json.dumps(strategy["assumptions"]),
                    "simulator_delivery_equity_v1",
                ),
            )
    conn.commit()


def _load_active_versions(conn) -> list[dict[str, Any]]:
    _ensure_default_strategy(conn)
    df = query_df(
        conn,
        """
        SELECT
            s.strategy_id,
            s.strategy_slug,
            s.display_name,
            s.description,
            v.strategy_version_id,
            v.version_number,
            v.config_json,
            v.assumptions_json,
            v.fee_profile_id
        FROM nse_app.backtest_strategy s
        JOIN nse_app.backtest_strategy_version v
          ON v.strategy_id = s.strategy_id
        WHERE s.status = 'active'
          AND v.is_active_version = TRUE
        ORDER BY s.updated_at DESC, s.strategy_id ASC
        """,
    )
    return df.to_dict(orient="records")


def _fetch_symbol_history(conn, universe_name: str, start_date: date, end_date: date) -> pd.DataFrame:
    sql = """
    WITH universe AS (
        SELECT DISTINCT ON (UPPER(REGEXP_REPLACE(TRIM(iu.tradingsymbol), '-EQ$', '')))
            UPPER(REGEXP_REPLACE(TRIM(iu.tradingsymbol), '-EQ$', '')) AS symbol,
            iu.tradingsymbol AS display_name
        FROM public.instrument_universe iu
        WHERE iu.exchange = 'NSE'
          AND iu.universe_name = %(universe_name)s
          AND iu.active_to IS NULL
          AND COALESCE(TRIM(iu.tradingsymbol), '') <> ''
        ORDER BY UPPER(REGEXP_REPLACE(TRIM(iu.tradingsymbol), '-EQ$', '')), iu.symbol_token, iu.active_from DESC NULLS LAST
    ),
    sector_map AS (
        SELECT DISTINCT ON (UPPER(TRIM(c.symbol)))
            UPPER(TRIM(c.symbol)) AS symbol,
            COALESCE(NULLIF(TRIM(c.sector), ''), NULLIF(TRIM(c.industry), ''), NULLIF(TRIM(c.basic_industry), ''), 'OTHER') AS sector
        FROM public.index_constituents c
        ORDER BY
            UPPER(TRIM(c.symbol)),
            CASE WHEN UPPER(TRIM(c.index_name)) IN ('NIFTY100', 'NIFTY 100') THEN 0 ELSE 1 END,
            c.updated_at DESC
    )
    SELECT
        f.trade_date,
        u.symbol,
        COALESCE(NULLIF(TRIM(f.security_name), ''), NULLIF(TRIM(u.display_name), ''), u.symbol) AS security_name,
        COALESCE(sm.sector, 'OTHER') AS sector,
        f.open_price::double precision AS open_price,
        f.high_price::double precision AS high_price,
        f.low_price::double precision AS low_price,
        f.close_price::double precision AS close_price,
        f.prev_close::double precision AS prev_close
    FROM nse_app.security_daily_features f
    JOIN universe u
      ON UPPER(TRIM(f.symbol)) = u.symbol
    LEFT JOIN sector_map sm
      ON sm.symbol = u.symbol
    WHERE COALESCE(f.series, '') = 'EQ'
      AND f.trade_date >= %(start_date)s
      AND f.trade_date <= %(end_date)s
    ORDER BY u.symbol ASC, f.trade_date ASC
    """
    return query_df(conn, sql, {"universe_name": universe_name, "start_date": start_date, "end_date": end_date})


def _fetch_market_regime_inputs(conn, start_date: date, end_date: date) -> pd.DataFrame:
    sql = """
    WITH ranked AS (
        SELECT
            trade_date,
            index_name,
            close_price::double precision AS close_price,
            ROW_NUMBER() OVER (
                PARTITION BY trade_date,
                CASE
                    WHEN LOWER(index_name) = 'nifty 50' THEN 'nifty50'
                    WHEN LOWER(index_name) LIKE 'nifty 50%%' THEN 'nifty50'
                    WHEN LOWER(index_name) = 'india vix' THEN 'indiavix'
                    WHEN LOWER(index_name) LIKE 'india vix%%' THEN 'indiavix'
                    ELSE LOWER(index_name)
                END
                ORDER BY CASE
                    WHEN LOWER(index_name) = 'nifty 50' THEN 0
                    WHEN LOWER(index_name) = 'india vix' THEN 0
                    ELSE 1
                END
            ) AS rn,
            CASE
                WHEN LOWER(index_name) = 'nifty 50' THEN 'nifty50'
                WHEN LOWER(index_name) LIKE 'nifty 50%%' THEN 'nifty50'
                WHEN LOWER(index_name) = 'india vix' THEN 'indiavix'
                WHEN LOWER(index_name) LIKE 'india vix%%' THEN 'indiavix'
                ELSE LOWER(index_name)
            END AS key_name
        FROM nse.fact_market_activity_index
        WHERE trade_date >= %(start_date)s
          AND trade_date <= %(end_date)s
          AND (
            LOWER(index_name) = 'nifty 50'
            OR LOWER(index_name) LIKE 'nifty 50%%'
            OR LOWER(index_name) = 'india vix'
            OR LOWER(index_name) LIKE 'india vix%%'
          )
    )
    SELECT
        trade_date,
        MAX(close_price) FILTER (WHERE key_name = 'nifty50' AND rn = 1) AS nifty_close,
        MAX(close_price) FILTER (WHERE key_name = 'indiavix' AND rn = 1) AS vix_close
    FROM ranked
    GROUP BY trade_date
    ORDER BY trade_date ASC
    """
    return query_df(conn, sql, {"start_date": start_date, "end_date": end_date})


def _build_regime_map(regime_df: pd.DataFrame) -> dict[date, str]:
    if regime_df.empty:
        return {}
    frame = regime_df.copy()
    frame["trade_date"] = pd.to_datetime(frame["trade_date"]).dt.date
    frame = frame.sort_values("trade_date")
    frame["nifty_return_pct"] = frame["nifty_close"].pct_change() * 100.0
    frame["vix_change_pct"] = frame["vix_close"].pct_change() * 100.0
    frame["nifty_20dma"] = frame["nifty_close"].rolling(20, min_periods=20).mean()
    frame["nifty_50dma"] = frame["nifty_close"].rolling(50, min_periods=50).mean()
    frame["nifty_20d_return_pct"] = (frame["nifty_close"] / frame["nifty_close"].shift(20) - 1.0) * 100.0
    frame["vix_prev75"] = frame["vix_close"].shift(1).rolling(252, min_periods=60).quantile(0.75)

    regimes: dict[date, str] = {}
    for row in frame.to_dict(orient="records"):
        trade_date = _as_date(row["trade_date"])
        nifty_ret = _safe_float(row.get("nifty_return_pct")) or 0.0
        vix_change = _safe_float(row.get("vix_change_pct")) or 0.0
        vix_close = _safe_float(row.get("vix_close"))
        vix_prev75 = _safe_float(row.get("vix_prev75"))
        nifty_close = _safe_float(row.get("nifty_close"))
        dma20 = _safe_float(row.get("nifty_20dma"))
        dma50 = _safe_float(row.get("nifty_50dma"))
        ret20 = _safe_float(row.get("nifty_20d_return_pct")) or 0.0

        if abs(nifty_ret) >= 1.75 or vix_change >= 15.0:
            regimes[trade_date] = "Shock"
        elif vix_close is not None and vix_prev75 is not None and vix_close >= vix_prev75:
            regimes[trade_date] = "Volatile"
        elif nifty_close is not None and dma20 is not None and dma50 is not None and nifty_close > dma50 and dma20 > dma50 and ret20 > 0:
            regimes[trade_date] = "Rising"
        elif nifty_close is not None and dma20 is not None and dma50 is not None and nifty_close < dma50 and dma20 < dma50 and ret20 < 0:
            regimes[trade_date] = "Falling"
        else:
            regimes[trade_date] = "Neutral"
    return regimes


def _build_symbol_bars(history_df: pd.DataFrame, regime_map: dict[date, str]) -> tuple[dict[str, list[SymbolBar]], list[tuple[Any, ...]], list[str]]:
    bars_by_symbol: dict[str, list[SymbolBar]] = {}
    symbol_rows: list[tuple[Any, ...]] = []
    symbols: list[str] = []
    if history_df.empty:
        return bars_by_symbol, symbol_rows, symbols

    for symbol, group in history_df.groupby("symbol", sort=True):
        symbols.append(str(symbol))
        ordered = group.sort_values("trade_date")
        bars: list[SymbolBar] = []
        for record in ordered.to_dict(orient="records"):
            open_price = _safe_float(record.get("open_price"))
            high_price = _safe_float(record.get("high_price"))
            low_price = _safe_float(record.get("low_price"))
            close_price = _safe_float(record.get("close_price"))
            prev_close = _safe_float(record.get("prev_close"))
            close_vs_prev = None
            if close_price is not None and prev_close not in (None, 0):
                close_vs_prev = ((close_price - prev_close) / prev_close) * 100.0
            bars.append(
                SymbolBar(
                    trade_date=_as_date(record["trade_date"]),
                    symbol=str(record["symbol"]),
                    security_name=str(record.get("security_name") or record["symbol"]),
                    sector=str(record.get("sector") or "OTHER"),
                    open_price=open_price,
                    high_price=high_price,
                    low_price=low_price,
                    close_price=close_price,
                    prev_close=prev_close,
                    close_vs_prev_close_pct=_round_or_none(close_vs_prev, 4),
                    data_quality_flag="ok" if None not in (open_price, high_price, low_price, close_price) else "missing_ohlc",
                )
            )

        close_series = pd.Series([bar.close_price for bar in bars], dtype="float64")
        rsi_series = _compute_rsi_series([bar.close_price for bar in bars], 14)
        willr_series = _compute_willr_series(
            [bar.high_price for bar in bars],
            [bar.low_price for bar in bars],
            [bar.close_price for bar in bars],
            14,
        )
        sma20_series = close_series.rolling(20, min_periods=20).mean().tolist()
        sma50_series = close_series.rolling(50, min_periods=50).mean().tolist()
        ema12 = close_series.ewm(span=12, adjust=False, min_periods=12).mean()
        ema26 = close_series.ewm(span=26, adjust=False, min_periods=26).mean()
        macd_line_series = (ema12 - ema26).tolist()
        macd_signal_series = (ema12 - ema26).ewm(span=9, adjust=False, min_periods=9).mean().tolist()

        for index, bar in enumerate(bars):
            bar.rsi_14 = _round_or_none(rsi_series[index], 4)
            bar.willr_14 = _round_or_none(willr_series[index], 4)
            bar.sma20 = _round_or_none(sma20_series[index], 4)
            bar.sma50 = _round_or_none(sma50_series[index], 4)
            bar.macd_line = _round_or_none(macd_line_series[index], 4)
            bar.macd_signal = _round_or_none(macd_signal_series[index], 4)
            bar.macd_hist = _round_or_none(
                (macd_line_series[index] - macd_signal_series[index])
                if macd_line_series[index] is not None and macd_signal_series[index] is not None
                else None,
                4,
            )
            bar.regime_label = regime_map.get(bar.trade_date, "Neutral")

        bars_by_symbol[str(symbol)] = bars
        symbol_rows.extend(
            [
                (
                    bar.trade_date,
                    bar.symbol,
                    bar.security_name,
                    bar.sector,
                    bar.open_price,
                    bar.high_price,
                    bar.low_price,
                    bar.close_price,
                    bar.prev_close,
                    bar.close_vs_prev_close_pct,
                    bar.rsi_14,
                    bar.willr_14,
                    bar.sma20,
                    bar.sma50,
                    bar.macd_line,
                    bar.macd_signal,
                    bar.macd_hist,
                    bar.regime_label,
                    bar.data_quality_flag,
                )
                for bar in bars
            ]
        )

    return bars_by_symbol, symbol_rows, symbols


def _build_scenarios(strategy: dict[str, Any], symbols: list[str]) -> list[ScenarioSpec]:
    scenarios: list[ScenarioSpec] = [
        ScenarioSpec(strategy["strategy_id"], strategy["strategy_version_id"], strategy["display_name"], strategy["archetype"], "nifty_100:no_capital_limit", "Nifty 100 • No Capital Limit", "nifty_100", "no_capital_limit", None, None, None, None, "nifty50_price"),
        ScenarioSpec(strategy["strategy_id"], strategy["strategy_version_id"], strategy["display_name"], strategy["archetype"], "nifty_100:capital_16l", "Nifty 100 • ₹16L / ₹2L tickets / max 8", "nifty_100", "capital_16l", None, 200000.0, 1600000.0, 8, "nifty50_price"),
        ScenarioSpec(strategy["strategy_id"], strategy["strategy_version_id"], strategy["display_name"], strategy["archetype"], "nifty_100:capital_10l", "Nifty 100 • 10L", "nifty_100", "capital_10l", None, 100000.0, 1000000.0, 10, "nifty50_price"),
        ScenarioSpec(strategy["strategy_id"], strategy["strategy_version_id"], strategy["display_name"], strategy["archetype"], "nifty_100:capital_20l", "Nifty 100 • 20L", "nifty_100", "capital_20l", None, 200000.0, 2000000.0, 10, "nifty50_price"),
        ScenarioSpec(strategy["strategy_id"], strategy["strategy_version_id"], strategy["display_name"], strategy["archetype"], "nifty_100:capital_50l", "Nifty 100 • 50L", "nifty_100", "capital_50l", None, 500000.0, 5000000.0, 10, "nifty50_price"),
    ]
    for symbol in sorted(symbols):
        scenarios.extend(
            [
                ScenarioSpec(strategy["strategy_id"], strategy["strategy_version_id"], strategy["display_name"], strategy["archetype"], f"single_stock:no_capital_limit:{symbol}", f"{symbol} • No Capital Limit", "single_stock", "no_capital_limit", symbol, None, None, None, "nifty50_price"),
                ScenarioSpec(strategy["strategy_id"], strategy["strategy_version_id"], strategy["display_name"], strategy["archetype"], f"single_stock:capital_16l:{symbol}", f"{symbol} • ₹16L / ₹2L tickets", "single_stock", "capital_16l", symbol, 200000.0, 1600000.0, 8, "nifty50_price"),
                ScenarioSpec(strategy["strategy_id"], strategy["strategy_version_id"], strategy["display_name"], strategy["archetype"], f"single_stock:capital_10l:{symbol}", f"{symbol} • 10L", "single_stock", "capital_10l", symbol, 100000.0, 1000000.0, 10, "finite_fd"),
                ScenarioSpec(strategy["strategy_id"], strategy["strategy_version_id"], strategy["display_name"], strategy["archetype"], f"single_stock:capital_20l:{symbol}", f"{symbol} • 20L", "single_stock", "capital_20l", symbol, 200000.0, 2000000.0, 10, "finite_fd"),
                ScenarioSpec(strategy["strategy_id"], strategy["strategy_version_id"], strategy["display_name"], strategy["archetype"], f"single_stock:capital_50l:{symbol}", f"{symbol} • 50L", "single_stock", "capital_50l", symbol, 500000.0, 5000000.0, 10, "finite_fd"),
            ]
        )
    return scenarios


def _scenario_symbols(scenario: ScenarioSpec, bars_by_symbol: dict[str, list[SymbolBar]]) -> dict[str, list[SymbolBar]]:
    if scenario.universe_mode == "single_stock" and scenario.stock_symbol:
        return {scenario.stock_symbol: bars_by_symbol.get(scenario.stock_symbol, [])}
    return bars_by_symbol


def _sort_candidates(candidates: list[PendingSignal]) -> list[PendingSignal]:
    return sorted(
        candidates,
        key=lambda item: (
            item.signal_date,
            item.signal_rsi if item.signal_rsi is not None else float("inf"),
            item.signal_willr if item.signal_willr is not None else float("inf"),
            -1.0 * (item.close_vs_prev_close_pct if item.close_vs_prev_close_pct is not None else float("-inf")),
            item.symbol,
        ),
    )


def _fd_value(start_value: float, start_date: date, end_date: date) -> float:
    if start_value <= 0:
        return 0.0
    day_count = max((end_date - start_date).days, 0)
    return round(start_value * ((1.0 + FD_ANNUAL_RATE_PCT / 100.0) ** (day_count / 365.0)), 2)


def _json_hash(value: Any) -> str:
    return hashlib.md5(json.dumps(value, sort_keys=True, default=str).encode("utf-8")).hexdigest()


def _build_feature_rows(strategy_version_id: str, symbol_rows: list[tuple[Any, ...]]) -> list[tuple[Any, ...]]:
    return [
        (
            row[0],
            row[1],
            row[2],
            row[3],
            "stock_only",
            True,
            row[4],
            row[5],
            row[6],
            row[7],
            row[8],
            row[9],
            row[10],
            row[11],
            row[12],
            row[13],
            row[14],
            row[15],
            row[16],
            row[17],
            row[18],
        )
        for row in symbol_rows
    ]


def _count_feature_null_issues(
    histories_with_warmup: dict[str, list[SymbolBar]],
    evidence_start: date,
    min_indicator_history: int = 60,
) -> int:
    issues = 0
    for bars in histories_with_warmup.values():
        warmup_start_index = min_indicator_history
        for index, bar in enumerate(bars):
            if bar.trade_date < evidence_start or index < warmup_start_index:
                continue
            if any(
                value is None
                for value in (
                    bar.rsi_14,
                    bar.willr_14,
                    bar.sma20,
                    bar.sma50,
                    bar.macd_line,
                    bar.macd_signal,
                    bar.macd_hist,
                )
            ):
                issues += 1
    return issues


def _evaluate_signal_candidate(strategy: dict[str, Any], bars: list[SymbolBar], index: int) -> dict[str, Any] | None:
    if index + 1 >= len(bars):
        return None
    bar = bars[index]
    prev_bar = bars[index - 1] if index > 0 else None
    next_bar = bars[index + 1]
    if next_bar.open_price is None or next_bar.open_price <= 0:
        return None

    entry_kind = str(strategy["config"].get("entry_kind") or "")
    entry_rules = dict(strategy["config"].get("entry_rules") or {})
    eligible = False
    rank_inputs: dict[str, Any] = {}
    reason_json: dict[str, Any] = {"entry_kind": entry_kind, "conditions": []}

    if entry_kind == "fast_oversold_rebound":
        rsi_max = float(entry_rules.get("rsi_max_exclusive", 30.0))
        willr_max = float(entry_rules.get("willr_max_exclusive", -80.0))
        require_close_above_previous = bool(entry_rules.get("require_close_above_previous", True))
        eligible = bool(
            bar.rsi_14 is not None
            and bar.willr_14 is not None
            and bar.close_price is not None
            and bar.prev_close is not None
            and bar.rsi_14 < rsi_max
            and bar.willr_14 < willr_max
            and (not require_close_above_previous or bar.close_price > bar.prev_close)
        )
        rank_inputs = {
            "rsi": bar.rsi_14,
            "willr": bar.willr_14,
            "close_vs_prev_close_pct": bar.close_vs_prev_close_pct,
        }
        reason_json["conditions"] = ["rsi_lt_30", "willr_lt_minus80", "close_gt_prev_close"]
    elif entry_kind == "confirmed_oversold_recovery":
        rsi_reclaim = float(entry_rules.get("rsi_reclaim_level", 30.0))
        willr_reclaim = float(entry_rules.get("willr_reclaim_level", -80.0))
        require_green_close = bool(entry_rules.get("require_green_close", True))
        require_close_above_previous = bool(entry_rules.get("require_close_above_previous", True))
        eligible = bool(
            prev_bar is not None
            and prev_bar.rsi_14 is not None
            and bar.rsi_14 is not None
            and prev_bar.willr_14 is not None
            and bar.willr_14 is not None
            and prev_bar.rsi_14 < rsi_reclaim
            and bar.rsi_14 >= rsi_reclaim
            and prev_bar.willr_14 < willr_reclaim
            and bar.willr_14 >= willr_reclaim
            and bar.close_price is not None
            and bar.prev_close is not None
            and bar.open_price is not None
            and (not require_close_above_previous or bar.close_price > bar.prev_close)
            and (not require_green_close or bar.close_price > bar.open_price)
        )
        rank_inputs = {
            "rsi": bar.rsi_14,
            "willr": bar.willr_14,
            "close_vs_prev_close_pct": bar.close_vs_prev_close_pct,
        }
        reason_json["conditions"] = ["rsi_reclaim_30", "willr_reclaim_minus80", "green_close", "close_gt_prev_close"]
    elif entry_kind == "macd_trend_continuation":
        rsi_min = float(entry_rules.get("rsi_min_inclusive", 55.0))
        rsi_max = float(entry_rules.get("rsi_max_inclusive", 70.0))
        macd_spread = (
            (bar.macd_line - bar.macd_signal)
            if bar.macd_line is not None and bar.macd_signal is not None
            else None
        )
        distance_above_sma50_pct = (
            ((bar.close_price - bar.sma50) / bar.sma50) * 100.0
            if bar.close_price is not None and bar.sma50 not in (None, 0)
            else None
        )
        eligible = bool(
            prev_bar is not None
            and bar.close_price is not None
            and bar.sma20 is not None
            and bar.sma50 is not None
            and bar.close_price > bar.sma50
            and bar.sma20 > bar.sma50
            and prev_bar.macd_line is not None
            and prev_bar.macd_signal is not None
            and bar.macd_line is not None
            and bar.macd_signal is not None
            and prev_bar.macd_line <= prev_bar.macd_signal
            and bar.macd_line > bar.macd_signal
            and bar.rsi_14 is not None
            and rsi_min <= bar.rsi_14 <= rsi_max
        )
        rank_inputs = {
            "macd_spread": _round_or_none(macd_spread, 4),
            "rsi": bar.rsi_14,
            "distance_above_sma50_pct": _round_or_none(distance_above_sma50_pct, 4),
        }
        reason_json["conditions"] = ["close_gt_sma50", "sma20_gt_sma50", "bullish_macd_cross", "rsi_55_to_70"]
    else:
        return None

    if not eligible:
        return None

    return {
        "strategy_id": strategy["strategy_id"],
        "strategy_version_id": strategy["strategy_version_id"],
        "symbol": bar.symbol,
        "security_name": bar.security_name,
        "sector": bar.sector,
        "signal_date": bar.trade_date,
        "entry_date": next_bar.trade_date,
        "regime_on_signal": bar.regime_label,
        "signal_rsi": bar.rsi_14,
        "signal_willr": bar.willr_14,
        "signal_macd_line": bar.macd_line,
        "signal_macd_signal": bar.macd_signal,
        "signal_sma20": bar.sma20,
        "signal_sma50": bar.sma50,
        "close_vs_prev_close_pct": bar.close_vs_prev_close_pct,
        "rank_inputs": rank_inputs,
        "entry_reason_json": reason_json,
        "feature_snapshot_json": {
            "close_price": bar.close_price,
            "prev_close": bar.prev_close,
            "open_price": bar.open_price,
            "rsi_14": bar.rsi_14,
            "willr_14": bar.willr_14,
            "sma20": bar.sma20,
            "sma50": bar.sma50,
            "macd_line": bar.macd_line,
            "macd_signal": bar.macd_signal,
        },
    }


def _build_signal_candidates(strategy: dict[str, Any], histories: dict[str, list[SymbolBar]]) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    for bars in histories.values():
        for index in range(len(bars)):
            candidate = _evaluate_signal_candidate(strategy, bars, index)
            if candidate is not None:
                candidates.append(candidate)
    return sorted(candidates, key=lambda item: (item["signal_date"], item["entry_date"], item["symbol"]))


def _template_exit_from_bar(
    entry_price: float,
    target_price: float | None,
    stop_price: float | None,
    bar: SymbolBar,
) -> tuple[date, float, str, str] | None:
    if target_price is not None and bar.open_price is not None and bar.open_price >= target_price:
        return (bar.trade_date, round(bar.open_price, 4), "target_gap_open", "open")
    if stop_price is not None and bar.open_price is not None and bar.open_price <= stop_price:
        return (bar.trade_date, round(bar.open_price, 4), "stop_gap_open", "open")
    if stop_price is not None and target_price is not None and bar.low_price is not None and bar.high_price is not None and bar.low_price <= stop_price and bar.high_price >= target_price:
        return (bar.trade_date, round(stop_price, 4), "stop_intraday_conflict_conservative", "intraday")
    if stop_price is not None and bar.low_price is not None and bar.low_price <= stop_price:
        return (bar.trade_date, round(stop_price, 4), "stop_intraday_hit", "intraday")
    if target_price is not None and bar.high_price is not None and bar.high_price >= target_price:
        return (bar.trade_date, round(target_price, 4), "target_intraday_hit", "intraday")
    return None


def _build_trade_templates(
    batch_run_id: int,
    strategy: dict[str, Any],
    histories: dict[str, list[SymbolBar]],
    candidates: list[dict[str, Any]],
) -> list[TradeTemplate]:
    entry_kind = str(strategy["config"].get("entry_kind") or "")
    exit_config = dict(strategy["config"].get("exit_rules") or {})
    target_pct = _safe_float(exit_config.get("take_profit_pct"))
    stop_pct = _safe_float(exit_config.get("stop_loss_pct"))
    max_hold_days = int(exit_config.get("max_hold_days") or 0)
    index_by_symbol_date = {
        symbol: {bar.trade_date: idx for idx, bar in enumerate(bars)}
        for symbol, bars in histories.items()
    }
    templates: list[TradeTemplate] = []

    for candidate in candidates:
        bars = histories.get(candidate["symbol"], [])
        entry_index = index_by_symbol_date.get(candidate["symbol"], {}).get(candidate["entry_date"])
        if entry_index is None or entry_index >= len(bars):
            continue
        entry_bar = bars[entry_index]
        if entry_bar.open_price is None or entry_bar.open_price <= 0:
            continue

        entry_price = round(entry_bar.open_price, 4)
        target_price = round(entry_price * (1.0 + target_pct / 100.0), 4) if target_pct is not None else None
        stop_price = round(entry_price * (1.0 - stop_pct / 100.0), 4) if stop_pct is not None else None
        scheduled_exit_reason: str | None = None
        exit_date: date | None = None
        exit_price: float | None = None
        exit_reason: str | None = None
        exit_timing: str | None = None

        for idx in range(entry_index, len(bars)):
            bar = bars[idx]
            if scheduled_exit_reason and idx > entry_index:
                open_or_close = bar.open_price if bar.open_price is not None else bar.close_price
                if open_or_close is not None:
                    exit_date = bar.trade_date
                    exit_price = round(open_or_close, 4)
                    exit_reason = scheduled_exit_reason
                    exit_timing = "open"
                    break

            price_exit = _template_exit_from_bar(entry_price, target_price, stop_price, bar)
            if price_exit is not None:
                exit_date, exit_price, exit_reason, exit_timing = price_exit
                break

            if entry_kind == "confirmed_oversold_recovery":
                if max_hold_days and idx - entry_index >= max_hold_days:
                    scheduled_exit_reason = "max_hold_timeout"
            elif entry_kind == "macd_trend_continuation":
                bearish_cross = bool(
                    bar.macd_line is not None
                    and bar.macd_signal is not None
                    and bar.macd_line < bar.macd_signal
                )
                close_below_sma20 = bool(
                    bar.close_price is not None
                    and bar.sma20 is not None
                    and bar.close_price < bar.sma20
                )
                if bearish_cross:
                    scheduled_exit_reason = "macd_bearish_cross"
                elif close_below_sma20:
                    scheduled_exit_reason = "close_below_sma20"
                elif max_hold_days and idx - entry_index >= max_hold_days:
                    scheduled_exit_reason = "max_hold_timeout"

        last_bar = bars[-1]
        open_flag = exit_date is None
        mark_price = last_bar.close_price if open_flag else exit_price
        gross_return_pct = _round_or_none(((exit_price / entry_price) - 1.0) * 100.0 if exit_price is not None else None, 4)
        mark_return_pct = _round_or_none(((mark_price / entry_price) - 1.0) * 100.0 if mark_price is not None else None, 4)
        hold_days = (exit_date - candidate["entry_date"]).days + 1 if exit_date is not None else (last_bar.trade_date - candidate["entry_date"]).days + 1

        templates.append(
            TradeTemplate(
                # Batch-scope the template id so reruns can publish safely without
                # colliding with prior batches that represent the same signal.
                trade_template_id=f"{batch_run_id}:{strategy['strategy_version_id']}:{candidate['symbol']}:{candidate['signal_date'].isoformat()}",
                strategy_id=strategy["strategy_id"],
                strategy_version_id=strategy["strategy_version_id"],
                symbol=candidate["symbol"],
                security_name=candidate["security_name"],
                sector=candidate["sector"],
                signal_date=candidate["signal_date"],
                entry_date=candidate["entry_date"],
                regime_on_entry=candidate["regime_on_signal"],
                signal_rsi=candidate["signal_rsi"],
                signal_willr=candidate["signal_willr"],
                signal_macd_line=candidate["signal_macd_line"],
                signal_macd_signal=candidate["signal_macd_signal"],
                signal_sma20=candidate["signal_sma20"],
                signal_sma50=candidate["signal_sma50"],
                close_vs_prev_close_pct=candidate["close_vs_prev_close_pct"],
                rank_inputs=dict(candidate["rank_inputs"]),
                entry_price=entry_price,
                target_price=target_price,
                stop_price=stop_price,
                theoretical_exit_date=exit_date,
                theoretical_exit_price=exit_price,
                exit_reason=exit_reason,
                exit_timing=exit_timing,
                hold_days=max(hold_days, 1),
                gross_return_pct=gross_return_pct,
                open_trade_flag_at_asof=open_flag,
                mark_to_market_price=_round_or_none(mark_price, 4),
                mark_to_market_return_pct=mark_return_pct,
                details={
                    "entry_kind": entry_kind,
                    "scheduled_exit_reason": scheduled_exit_reason,
                    "rank_inputs": candidate["rank_inputs"],
                },
            )
        )
    return templates


def _build_benchmark_rows(calendar_dates: list[date]) -> list[tuple[str, date, float, float, str]]:
    if not calendar_dates:
        return []
    capital_specs = {
        "no_capital_limit": (100.0, "normalized_fd"),
        "capital_16l": (1600000.0, "finite_fd"),
        "capital_10l": (1000000.0, "finite_fd"),
        "capital_20l": (2000000.0, "finite_fd"),
        "capital_50l": (5000000.0, "finite_fd"),
    }
    start_date = calendar_dates[0]
    rows: list[tuple[str, date, float, float, str]] = []
    for capital_mode, (start_value, benchmark_mode) in capital_specs.items():
        for trade_date in calendar_dates:
            rows.append((capital_mode, trade_date, start_value, _fd_value(start_value, start_date, trade_date), benchmark_mode))
    return rows


def _template_priority_key(template: TradeTemplate, scenario: ScenarioSpec) -> tuple[Any, ...]:
    if scenario.archetype == "trend_continuation":
        return (
            template.entry_date,
            -1.0 * (template.rank_inputs.get("macd_spread") or float("-inf")),
            -1.0 * (template.rank_inputs.get("rsi") or float("-inf")),
            -1.0 * (template.rank_inputs.get("distance_above_sma50_pct") or float("-inf")),
            template.symbol,
        )
    return (
        template.entry_date,
        template.rank_inputs.get("rsi") if template.rank_inputs.get("rsi") is not None else float("inf"),
        template.rank_inputs.get("willr") if template.rank_inputs.get("willr") is not None else float("inf"),
        -1.0 * (template.rank_inputs.get("close_vs_prev_close_pct") or float("-inf")),
        template.symbol,
    )


def _close_replay_position(
    position: ReplayPosition,
    exit_date: date,
    exit_price: float,
    exit_reason: str,
    cash: float | None,
    charge_fn: _ChargeFn,
) -> tuple[dict[str, Any], float | None]:
    sell_turnover = round(exit_price * position.quantity, 4)
    sell_charges = charge_fn(sell_turnover, side="sell", instrument_type="equity", apply_dp=True)
    if cash is not None:
        cash = round(cash + sell_turnover - sell_charges["total"], 4)
    net_pnl = round(sell_turnover - sell_charges["total"] - position.invested_basis, 4)
    profit_tax_reserve = round(max(net_pnl, 0.0) * PROFIT_TAX_RESERVE_RATE, 4)
    after_tax_net_pnl = round(net_pnl - profit_tax_reserve, 4)
    if cash is not None:
        cash = round(cash - profit_tax_reserve, 4)
    return_pct = round((after_tax_net_pnl / position.invested_basis) * 100.0, 4) if position.invested_basis > 0 else None
    return (
        {
            "symbol": position.template.symbol,
            "security_name": position.template.security_name,
            "sector": position.template.sector,
            "signal_date": position.template.signal_date,
            "entry_date": position.template.entry_date,
            "exit_date": exit_date,
            "exit_reason": exit_reason,
            "regime_on_entry": position.template.regime_on_entry,
            "signal_rsi": position.template.signal_rsi,
            "signal_willr": position.template.signal_willr,
            "close_vs_prev_close_pct": position.template.close_vs_prev_close_pct,
            "entry_price": position.template.entry_price,
            "exit_price": round(exit_price, 4),
            "quantity": position.quantity,
            "gross_entry_value": position.gross_entry_value,
            "gross_exit_value": sell_turnover,
            "total_charges": round(position.entry_charges + sell_charges["total"], 4),
            "net_pnl": net_pnl,
            "profit_tax_rate": PROFIT_TAX_RESERVE_RATE,
            "profit_tax_amount": profit_tax_reserve,
            "after_tax_net_pnl": after_tax_net_pnl,
            "return_pct": return_pct,
            "holding_days": max((exit_date - position.template.entry_date).days + 1, 1),
            "trade_status": "closed",
            "metadata": {
                "strategy_id": position.template.strategy_id,
                "strategy_version_id": position.template.strategy_version_id,
                "trade_template_id": position.template.trade_template_id,
            },
        },
        cash,
    )


def _replay_scenario_from_templates(
    strategy: dict[str, Any],
    scenario: ScenarioSpec,
    calendar_dates: list[date],
    histories: dict[str, list[SymbolBar]],
    templates: list[TradeTemplate],
    nifty_close_by_date: dict[date, float] | None = None,
) -> dict[str, Any]:
    charge_fn = _delivery_charge_breakdown()
    bars_by_symbol_date = {symbol: {bar.trade_date: bar for bar in bars} for symbol, bars in histories.items()}
    template_map = {template.trade_template_id: template for template in templates}
    entry_dates: dict[date, list[TradeTemplate]] = {}
    for template in templates:
        entry_dates.setdefault(template.entry_date, []).append(template)

    open_positions: dict[str, ReplayPosition] = {}
    closed_trades: list[dict[str, Any]] = []
    skipped_rows: list[dict[str, Any]] = []
    daily_rows: list[dict[str, Any]] = []
    accepted_templates: list[TradeTemplate] = []

    cash = scenario.starting_cash
    start_value = scenario.starting_cash if scenario.starting_cash is not None else 100.0
    total_equity = start_value
    equity_peak = start_value
    max_open_positions_reached = 0
    benchmark_source = nifty_close_by_date or {}
    first_nifty_close = next((benchmark_source.get(day) for day in calendar_dates if benchmark_source.get(day)), None)

    for trade_date in calendar_dates:
        for symbol, position in list(open_positions.items()):
            template = position.template
            if template.theoretical_exit_date == trade_date and template.exit_timing == "open" and template.theoretical_exit_price is not None:
                trade_row, cash = _close_replay_position(position, trade_date, template.theoretical_exit_price, template.exit_reason or "open_exit", cash, charge_fn)
                closed_trades.append(trade_row)
                del open_positions[symbol]

        for template in sorted(entry_dates.get(trade_date, []), key=lambda item: _template_priority_key(item, scenario)):
            if template.symbol in open_positions:
                skipped_rows.append(
                    {
                        "signal_date": template.signal_date,
                        "entry_date": template.entry_date,
                        "symbol": template.symbol,
                        "reason": "skipped_due_to_existing_position",
                        "regime_label": template.regime_on_entry,
                        "signal_rsi": template.signal_rsi,
                        "signal_willr": template.signal_willr,
                        "close_vs_prev_close_pct": template.close_vs_prev_close_pct,
                        "details": {"message": "Open position already exists for the symbol.", "trade_template_id": template.trade_template_id},
                    }
                )
                continue
            if scenario.max_open_positions is not None and len(open_positions) >= scenario.max_open_positions:
                skipped_rows.append(
                    {
                        "signal_date": template.signal_date,
                        "entry_date": template.entry_date,
                        "symbol": template.symbol,
                        "reason": "skipped_due_to_max_open_positions",
                        "regime_label": template.regime_on_entry,
                        "signal_rsi": template.signal_rsi,
                        "signal_willr": template.signal_willr,
                        "close_vs_prev_close_pct": template.close_vs_prev_close_pct,
                        "details": {"message": "Maximum open positions reached.", "trade_template_id": template.trade_template_id},
                    }
                )
                continue

            quantity = 1.0 if scenario.capital_mode == "no_capital_limit" else float(math.floor((scenario.ticket_size or 0.0) / template.entry_price))
            if quantity < 1:
                skipped_rows.append(
                    {
                        "signal_date": template.signal_date,
                        "entry_date": template.entry_date,
                        "symbol": template.symbol,
                        "reason": "skipped_due_to_ticket_too_small",
                        "regime_label": template.regime_on_entry,
                        "signal_rsi": template.signal_rsi,
                        "signal_willr": template.signal_willr,
                        "close_vs_prev_close_pct": template.close_vs_prev_close_pct,
                        "details": {"message": "Fixed ticket size could not buy one full share.", "trade_template_id": template.trade_template_id},
                    }
                )
                continue

            gross_entry_value = round(template.entry_price * quantity, 4)
            buy_charges = charge_fn(gross_entry_value, side="buy", instrument_type="equity", apply_dp=False)
            total_outlay = round(gross_entry_value + buy_charges["total"], 4)
            if cash is not None and cash + 1e-9 < total_outlay:
                skipped_rows.append(
                    {
                        "signal_date": template.signal_date,
                        "entry_date": template.entry_date,
                        "symbol": template.symbol,
                        "reason": "skipped_due_to_cash_constraint",
                        "regime_label": template.regime_on_entry,
                        "signal_rsi": template.signal_rsi,
                        "signal_willr": template.signal_willr,
                        "close_vs_prev_close_pct": template.close_vs_prev_close_pct,
                        "details": {"message": "Finite-capital bucket had insufficient free cash.", "trade_template_id": template.trade_template_id},
                    }
                )
                continue

            if cash is not None:
                cash = round(cash - total_outlay, 4)
            position = ReplayPosition(
                template=template,
                quantity=quantity,
                entry_charges=round(buy_charges["total"], 4),
                gross_entry_value=gross_entry_value,
                invested_basis=round(gross_entry_value + buy_charges["total"], 4),
                last_market_value=gross_entry_value,
            )
            open_positions[template.symbol] = position
            accepted_templates.append(template)

        for symbol, position in list(open_positions.items()):
            template = position.template
            if template.theoretical_exit_date == trade_date and template.exit_timing == "intraday" and template.theoretical_exit_price is not None:
                trade_row, cash = _close_replay_position(position, trade_date, template.theoretical_exit_price, template.exit_reason or "intraday_exit", cash, charge_fn)
                closed_trades.append(trade_row)
                del open_positions[symbol]

        market_value = 0.0
        no_limit_returns: list[float] = []
        for symbol, position in open_positions.items():
            bar = bars_by_symbol_date.get(symbol, {}).get(trade_date)
            current_price = bar.close_price if bar and bar.close_price is not None else position.template.entry_price
            current_market_value = round(current_price * position.quantity, 4)
            if scenario.capital_mode == "no_capital_limit":
                basis = position.last_market_value if position.last_market_value > 0 else position.invested_basis
                no_limit_returns.append(((current_market_value / basis) - 1.0) * 100.0 if basis > 0 else 0.0)
            position.last_market_value = current_market_value
            market_value += current_market_value

        nifty_close = benchmark_source.get(trade_date)
        benchmark_value = (
            round(start_value * nifty_close / first_nifty_close, 4)
            if first_nifty_close and nifty_close
            else _fd_value(start_value, calendar_dates[0], trade_date) if calendar_dates else start_value
        )
        if scenario.capital_mode == "no_capital_limit":
            daily_return_pct = sum(no_limit_returns) / len(no_limit_returns) if no_limit_returns else 0.0
            total_equity = round(total_equity * (1.0 + daily_return_pct / 100.0), 4)
            deployed_capital = float(len(open_positions))
            available_cash = None
        else:
            previous_total = daily_rows[-1]["total_equity"] if daily_rows else float(start_value)
            total_equity = round((cash or 0.0) + market_value, 4)
            daily_return_pct = ((total_equity / previous_total) - 1.0) * 100.0 if previous_total else 0.0
            deployed_capital = market_value
            available_cash = cash

        equity_peak = max(equity_peak, total_equity)
        drawdown_pct = round(((total_equity - equity_peak) / equity_peak) * 100.0, 4) if equity_peak > 0 else 0.0
        max_open_positions_reached = max(max_open_positions_reached, len(open_positions))
        daily_rows.append(
            {
                "trade_date": trade_date,
                "active_positions": len(open_positions),
                "deployed_capital": _round_or_none(deployed_capital, 4),
                "available_cash": _round_or_none(available_cash, 4),
                "market_value": _round_or_none(market_value, 4),
                "total_equity": _round_or_none(total_equity, 4),
                "benchmark_value": _round_or_none(benchmark_value, 4),
                "daily_return_pct": _round_or_none(daily_return_pct, 4),
                "drawdown_pct": _round_or_none(drawdown_pct, 4),
            }
        )

    open_rows: list[dict[str, Any]] = []
    as_of_date = daily_rows[-1]["trade_date"] if daily_rows else None
    for position in open_positions.values():
        current_price = position.last_market_value / position.quantity if position.quantity else position.template.entry_price
        unrealized_pnl = round(position.last_market_value - position.invested_basis, 4)
        unrealized_return_pct = round((unrealized_pnl / position.invested_basis) * 100.0, 4) if position.invested_basis > 0 else None
        open_rows.append(
            {
                "as_of_date": as_of_date,
                "symbol": position.template.symbol,
                "security_name": position.template.security_name,
                "sector": position.template.sector,
                "signal_date": position.template.signal_date,
                "entry_date": position.template.entry_date,
                "regime_on_entry": position.template.regime_on_entry,
                "signal_rsi": position.template.signal_rsi,
                "signal_willr": position.template.signal_willr,
                "close_vs_prev_close_pct": position.template.close_vs_prev_close_pct,
                "entry_price": position.template.entry_price,
                "current_price": _round_or_none(current_price, 4),
                "quantity": position.quantity,
                "allocated_capital": position.invested_basis,
                "market_value": position.last_market_value,
                "unrealized_pnl": unrealized_pnl,
                "unrealized_return_pct": unrealized_return_pct,
                "target_price": position.template.target_price,
                "days_open": max((as_of_date - position.template.entry_date).days + 1, 1) if as_of_date else 0,
            }
        )

    closed_returns = [float(trade["return_pct"]) for trade in closed_trades if trade["return_pct"] is not None]
    closed_holds = [int(trade["holding_days"]) for trade in closed_trades if trade["holding_days"] is not None]
    current_value = float(daily_rows[-1]["total_equity"]) if daily_rows else float(start_value)
    benchmark_final = float(daily_rows[-1]["benchmark_value"]) if daily_rows else (start_value if not calendar_dates else _fd_value(start_value, calendar_dates[0], calendar_dates[-1]))
    pre_tax_realized_pnl = round(sum(float(trade["net_pnl"]) for trade in closed_trades), 4)
    tax_deducted = round(sum(float(trade["profit_tax_amount"]) for trade in closed_trades), 4)
    after_tax_realized_pnl = round(sum(float(trade["after_tax_net_pnl"]) for trade in closed_trades), 4)
    return {
        "daily_rows": daily_rows,
        "closed_trades": closed_trades,
        "open_positions": open_rows,
        "skipped_rows": skipped_rows,
        "accepted_templates": accepted_templates,
        "summary": {
            "symbolsCovered": len(histories),
            "investedAmount": start_value,
            "currentValue": current_value,
            "realizedPnl": after_tax_realized_pnl,
            "preTaxRealizedPnl": pre_tax_realized_pnl,
            "profitTaxRate": PROFIT_TAX_RESERVE_RATE,
            "taxDeducted": tax_deducted,
            "afterTaxRealizedPnl": after_tax_realized_pnl,
            "unrealizedPnl": round(sum(float(row["unrealized_pnl"]) for row in open_rows), 4),
            "totalReturnPct": _round_or_none(((current_value / start_value) - 1.0) * 100.0 if start_value else 0.0, 4),
            "winRatePct": _round_or_none((sum(1 for value in closed_returns if value > 0) / len(closed_returns) * 100.0) if closed_returns else 0.0, 4),
            "maxDrawdownPct": _round_or_none(min((float(row["drawdown_pct"]) for row in daily_rows), default=0.0), 4),
            "totalCharges": round(sum(float(trade["total_charges"]) for trade in closed_trades), 4) + round(sum(max(float(row["allocated_capital"]) - (float(row["entry_price"]) * float(row["quantity"])), 0.0) for row in open_rows), 4),
            "openPositions": len(open_rows),
            "maxOpenPositionsReached": max_open_positions_reached,
            "avgHoldDays": _round_or_none((sum(closed_holds) / len(closed_holds)) if closed_holds else 0.0, 2),
            "minHoldDays": min(closed_holds) if closed_holds else 0,
            "maxHoldDays": max(closed_holds) if closed_holds else 0,
            "cashBalance": _round_or_none(cash, 4),
            "exposurePct": _round_or_none(((float(daily_rows[-1]["deployed_capital"]) / start_value) * 100.0) if daily_rows and start_value and daily_rows[-1]["deployed_capital"] is not None else 0.0, 4),
            "fdFinalValue": _round_or_none(benchmark_final, 4),
            "benchmarkFinalValue": _round_or_none(benchmark_final, 4),
            "excessOverBenchmark": _round_or_none(current_value - benchmark_final, 4),
            "excessOverFd": _round_or_none(current_value - benchmark_final, 4),
            "benchmarkLabel": "NIFTY 50 price index (dividends excluded)" if first_nifty_close else "6% FD fallback (NIFTY unavailable)",
            "totalClosedTrades": len(closed_trades),
            "avgExposurePct": _round_or_none((sum(float(row["deployed_capital"] or 0.0) for row in daily_rows) / len(daily_rows) / start_value * 100.0) if daily_rows and start_value else 0.0, 4),
        },
    }


def _begin_batch(conn, job_run_id: int, data_as_of_date: date, config_version: str) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO nse_app.batch_run_audit (
                job_run_id, batch_name, batch_scope, data_as_of_date, status, validation_status,
                published_flag, generated_at, stale_after, config_version, assumptions_json
            )
            VALUES (
                %(job_run_id)s, %(batch_name)s, 'daily_eod', %(data_as_of_date)s, 'running', 'pending',
                FALSE, NOW(), %(stale_after)s, %(config_version)s, %(assumptions_json)s::jsonb
            )
            RETURNING batch_run_id
            """,
            {
                "job_run_id": job_run_id,
                "batch_name": BATCH_NAME,
                "data_as_of_date": data_as_of_date,
                "stale_after": _stale_after(data_as_of_date),
                "config_version": config_version,
                "assumptions_json": json.dumps(
                    {
                        "batch_name": BATCH_NAME,
                        "published_model": "latest_published_batch_only",
                        "last_good_fallback": True,
                        "data_frequency": "daily",
                        "strategy_version": DEFAULT_STRATEGY_VERSION_ID,
                    }
                ),
            },
        )
        batch_run_id = cur.fetchone()[0]
    conn.commit()
    return int(batch_run_id)


def _mark_batch_failed(conn, batch_run_id: int, message: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE nse_app.batch_run_audit
            SET status = 'failed',
                validation_status = 'failed',
                error_message = %(message)s
            WHERE batch_run_id = %(batch_run_id)s
            """,
            {"batch_run_id": batch_run_id, "message": message[:2000]},
        )
    conn.commit()


def _publish_batch(conn, batch_run_id: int, row_counts: dict[str, Any], validation_metrics: dict[str, Any]) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE nse_app.batch_run_audit
            SET published_flag = FALSE,
                superseded_at = NOW()
            WHERE batch_name = %(batch_name)s
              AND published_flag = TRUE
            """,
            {"batch_name": BATCH_NAME},
        )
        cur.execute(
            """
            UPDATE nse_app.batch_run_audit
            SET status = 'published',
                validation_status = CASE WHEN COALESCE((%(validation_metrics)s::jsonb ->> 'failed_count')::int, 0) = 0 THEN 'passed' ELSE 'failed' END,
                published_flag = TRUE,
                published_at = NOW(),
                row_counts = %(row_counts)s::jsonb,
                validation_metrics = %(validation_metrics)s::jsonb,
                error_message = NULL
            WHERE batch_run_id = %(batch_run_id)s
            """,
            {"batch_run_id": batch_run_id, "row_counts": json.dumps(row_counts), "validation_metrics": json.dumps(validation_metrics)},
        )
    conn.commit()


def _simulate_scenario(
    scenario: ScenarioSpec,
    calendar_dates: list[date],
    histories: dict[str, list[SymbolBar]],
) -> dict[str, Any]:
    charge_fn = _delivery_charge_breakdown()
    bars_by_symbol_date = {symbol: {bar.trade_date: bar for bar in bars} for symbol, bars in histories.items()}
    pending_by_date: dict[date, list[PendingSignal]] = {}
    open_positions: dict[str, OpenPosition] = {}
    closed_trades: list[dict[str, Any]] = []
    skipped_rows: list[dict[str, Any]] = []
    daily_rows: list[dict[str, Any]] = []

    cash = scenario.starting_cash
    start_value = scenario.starting_cash if scenario.starting_cash is not None else 100.0
    total_equity = start_value
    equity_peak = start_value
    max_open_positions_reached = 0

    for trade_index, trade_date in enumerate(calendar_dates):
        for symbol, position in list(open_positions.items()):
            bar = bars_by_symbol_date.get(symbol, {}).get(trade_date)
            if bar is None or bar.open_price is None or bar.open_price < position.target_price:
                continue
            sell_turnover = bar.open_price * position.quantity
            sell_charges = charge_fn(sell_turnover, side="sell", instrument_type="equity", apply_dp=True)
            gross_exit_value = round(sell_turnover, 4)
            invested_basis = position.gross_entry_value + position.entry_charges
            net_pnl = round(gross_exit_value - sell_charges["total"] - invested_basis, 4)
            return_pct = round((net_pnl / invested_basis) * 100.0, 4) if invested_basis > 0 else None
            if cash is not None:
                cash = round((cash or 0.0) + gross_exit_value - sell_charges["total"], 4)
            closed_trades.append(
                {
                    "symbol": symbol,
                    "security_name": position.security_name,
                    "sector": position.sector,
                    "signal_date": position.signal_date,
                    "entry_date": position.entry_date,
                    "exit_date": trade_date,
                    "exit_reason": "target_gap_open",
                    "regime_on_entry": position.regime_label,
                    "signal_rsi": position.signal_rsi,
                    "signal_willr": position.signal_willr,
                    "close_vs_prev_close_pct": position.close_vs_prev_close_pct,
                    "entry_price": position.entry_price,
                    "exit_price": round(bar.open_price, 4),
                    "quantity": position.quantity,
                    "gross_entry_value": round(position.gross_entry_value, 4),
                    "gross_exit_value": gross_exit_value,
                    "total_charges": round(position.entry_charges + sell_charges["total"], 4),
                    "net_pnl": net_pnl,
                    "return_pct": return_pct,
                    "holding_days": max((trade_date - position.entry_date).days, 1),
                    "trade_status": "closed",
                }
            )
            del open_positions[symbol]

        for candidate in _sort_candidates(pending_by_date.pop(trade_date, [])):
            if candidate.symbol in open_positions:
                skipped_rows.append(
                    {
                        "signal_date": candidate.signal_date,
                        "entry_date": trade_date,
                        "symbol": candidate.symbol,
                        "reason": "skipped_due_to_existing_position",
                        "regime_label": candidate.regime_label,
                        "signal_rsi": candidate.signal_rsi,
                        "signal_willr": candidate.signal_willr,
                        "close_vs_prev_close_pct": candidate.close_vs_prev_close_pct,
                        "details": {"message": "Open position already exists for the symbol."},
                    }
                )
                continue

            bar = bars_by_symbol_date.get(candidate.symbol, {}).get(trade_date)
            if bar is None or bar.open_price is None or bar.open_price <= 0:
                skipped_rows.append(
                    {
                        "signal_date": candidate.signal_date,
                        "entry_date": trade_date,
                        "symbol": candidate.symbol,
                        "reason": "skipped_due_to_missing_open",
                        "regime_label": candidate.regime_label,
                        "signal_rsi": candidate.signal_rsi,
                        "signal_willr": candidate.signal_willr,
                        "close_vs_prev_close_pct": candidate.close_vs_prev_close_pct,
                        "details": {"message": "Next-session open price is unavailable."},
                    }
                )
                continue

            quantity = 1.0 if scenario.capital_mode == "no_capital_limit" else float(math.floor((scenario.ticket_size or 0.0) / bar.open_price))
            if quantity < 1:
                skipped_rows.append(
                    {
                        "signal_date": candidate.signal_date,
                        "entry_date": trade_date,
                        "symbol": candidate.symbol,
                        "reason": "skipped_due_to_ticket_too_small",
                        "regime_label": candidate.regime_label,
                        "signal_rsi": candidate.signal_rsi,
                        "signal_willr": candidate.signal_willr,
                        "close_vs_prev_close_pct": candidate.close_vs_prev_close_pct,
                        "details": {"message": "Fixed ticket size could not buy one full share."},
                    }
                )
                continue

            if scenario.max_open_positions is not None and len(open_positions) >= scenario.max_open_positions:
                skipped_rows.append(
                    {
                        "signal_date": candidate.signal_date,
                        "entry_date": trade_date,
                        "symbol": candidate.symbol,
                        "reason": "skipped_due_to_max_open_positions",
                        "regime_label": candidate.regime_label,
                        "signal_rsi": candidate.signal_rsi,
                        "signal_willr": candidate.signal_willr,
                        "close_vs_prev_close_pct": candidate.close_vs_prev_close_pct,
                        "details": {"message": "Maximum open positions reached."},
                    }
                )
                continue

            gross_entry_value = round(bar.open_price * quantity, 4)
            buy_charges = charge_fn(gross_entry_value, side="buy", instrument_type="equity", apply_dp=False)
            total_outlay = round(gross_entry_value + buy_charges["total"], 4)
            if cash is not None and (cash or 0.0) + 1e-9 < total_outlay:
                skipped_rows.append(
                    {
                        "signal_date": candidate.signal_date,
                        "entry_date": trade_date,
                        "symbol": candidate.symbol,
                        "reason": "skipped_due_to_cash_constraint",
                        "regime_label": candidate.regime_label,
                        "signal_rsi": candidate.signal_rsi,
                        "signal_willr": candidate.signal_willr,
                        "close_vs_prev_close_pct": candidate.close_vs_prev_close_pct,
                        "details": {"message": "Finite-capital bucket had insufficient free cash."},
                    }
                )
                continue

            if cash is not None:
                cash = round((cash or 0.0) - total_outlay, 4)
            open_positions[candidate.symbol] = OpenPosition(
                symbol=candidate.symbol,
                security_name=candidate.security_name,
                sector=candidate.sector,
                signal_date=candidate.signal_date,
                entry_date=trade_date,
                signal_rsi=candidate.signal_rsi,
                signal_willr=candidate.signal_willr,
                close_vs_prev_close_pct=candidate.close_vs_prev_close_pct,
                regime_label=candidate.regime_label,
                quantity=quantity,
                entry_price=round(bar.open_price, 4),
                target_price=round(bar.open_price * 1.0125, 4),
                gross_entry_value=gross_entry_value,
                entry_charges=round(buy_charges["total"], 4),
                mark_basis_value=round(gross_entry_value + buy_charges["total"], 4),
                entry_index=trade_index,
                last_market_value=gross_entry_value,
            )

        for symbol, position in list(open_positions.items()):
            bar = bars_by_symbol_date.get(symbol, {}).get(trade_date)
            if bar is None or bar.high_price is None or bar.high_price < position.target_price:
                continue
            sell_turnover = position.target_price * position.quantity
            sell_charges = charge_fn(sell_turnover, side="sell", instrument_type="equity", apply_dp=True)
            gross_exit_value = round(sell_turnover, 4)
            invested_basis = position.gross_entry_value + position.entry_charges
            net_pnl = round(gross_exit_value - sell_charges["total"] - invested_basis, 4)
            return_pct = round((net_pnl / invested_basis) * 100.0, 4) if invested_basis > 0 else None
            if cash is not None:
                cash = round((cash or 0.0) + gross_exit_value - sell_charges["total"], 4)
            closed_trades.append(
                {
                    "symbol": symbol,
                    "security_name": position.security_name,
                    "sector": position.sector,
                    "signal_date": position.signal_date,
                    "entry_date": position.entry_date,
                    "exit_date": trade_date,
                    "exit_reason": "target_intraday_hit",
                    "regime_on_entry": position.regime_label,
                    "signal_rsi": position.signal_rsi,
                    "signal_willr": position.signal_willr,
                    "close_vs_prev_close_pct": position.close_vs_prev_close_pct,
                    "entry_price": position.entry_price,
                    "exit_price": position.target_price,
                    "quantity": position.quantity,
                    "gross_entry_value": round(position.gross_entry_value, 4),
                    "gross_exit_value": gross_exit_value,
                    "total_charges": round(position.entry_charges + sell_charges["total"], 4),
                    "net_pnl": net_pnl,
                    "return_pct": return_pct,
                    "holding_days": max((trade_date - position.entry_date).days + 1, 1),
                    "trade_status": "closed",
                }
            )
            del open_positions[symbol]

        if trade_index + 1 < len(calendar_dates):
            next_date = calendar_dates[trade_index + 1]
            reserved_symbols = set(open_positions.keys())
            reserved_symbols.update(candidate.symbol for candidate in pending_by_date.get(next_date, []))
            next_candidates: list[PendingSignal] = []
            for symbol, bars in histories.items():
                bar = bars_by_symbol_date.get(symbol, {}).get(trade_date)
                if bar is None:
                    continue
                if (
                    bar.rsi_14 is not None
                    and bar.willr_14 is not None
                    and bar.close_price is not None
                    and bar.prev_close is not None
                    and bar.rsi_14 < 30
                    and bar.willr_14 < -80
                    and bar.close_price > bar.prev_close
                ):
                    if symbol in reserved_symbols:
                        skipped_rows.append(
                            {
                                "signal_date": trade_date,
                                "entry_date": next_date,
                                "symbol": symbol,
                                "reason": "skipped_due_to_existing_position",
                                "regime_label": bar.regime_label,
                                "signal_rsi": bar.rsi_14,
                                "signal_willr": bar.willr_14,
                                "close_vs_prev_close_pct": bar.close_vs_prev_close_pct,
                                "details": {"message": "Signal ignored because symbol already has an open or pending position."},
                            }
                        )
                        continue
                    next_candidates.append(
                        PendingSignal(
                            symbol=symbol,
                            security_name=bar.security_name,
                            sector=bar.sector,
                            signal_date=trade_date,
                            entry_date=next_date,
                            signal_rsi=bar.rsi_14,
                            signal_willr=bar.willr_14,
                            close_vs_prev_close_pct=bar.close_vs_prev_close_pct,
                            regime_label=bar.regime_label,
                        )
                    )
            if next_candidates:
                pending_by_date.setdefault(next_date, []).extend(next_candidates)

        market_value = 0.0
        no_limit_returns: list[float] = []
        for symbol, position in open_positions.items():
            bar = bars_by_symbol_date.get(symbol, {}).get(trade_date)
            current_price = bar.close_price if bar and bar.close_price is not None else position.entry_price
            current_market_value = round(current_price * position.quantity, 4)
            if scenario.capital_mode == "no_capital_limit":
                basis = position.mark_basis_value
                no_limit_returns.append(((current_market_value / basis) - 1.0) * 100.0 if basis > 0 else 0.0)
                position.mark_basis_value = current_market_value
            position.last_market_value = current_market_value
            market_value += current_market_value

        if scenario.capital_mode == "no_capital_limit":
            daily_return_pct = sum(no_limit_returns) / len(no_limit_returns) if no_limit_returns else 0.0
            total_equity = round(total_equity * (1.0 + daily_return_pct / 100.0), 4)
            benchmark_value = _fd_value(100.0, calendar_dates[0], trade_date)
            deployed_capital = float(len(open_positions))
            available_cash = None
        else:
            previous_total = daily_rows[-1]["total_equity"] if daily_rows else float(start_value)
            total_equity = round((cash or 0.0) + market_value, 4)
            daily_return_pct = ((total_equity / previous_total) - 1.0) * 100.0 if previous_total else 0.0
            benchmark_value = _fd_value(scenario.starting_cash or 0.0, calendar_dates[0], trade_date)
            deployed_capital = market_value
            available_cash = cash

        equity_peak = max(equity_peak, total_equity)
        drawdown_pct = round(((total_equity - equity_peak) / equity_peak) * 100.0, 4) if equity_peak > 0 else 0.0
        max_open_positions_reached = max(max_open_positions_reached, len(open_positions))
        daily_rows.append(
            {
                "trade_date": trade_date,
                "active_positions": len(open_positions),
                "deployed_capital": _round_or_none(deployed_capital, 4),
                "available_cash": _round_or_none(available_cash, 4),
                "market_value": _round_or_none(market_value, 4),
                "total_equity": _round_or_none(total_equity, 4),
                "benchmark_value": _round_or_none(benchmark_value, 4),
                "daily_return_pct": _round_or_none(daily_return_pct, 4),
                "drawdown_pct": _round_or_none(drawdown_pct, 4),
            }
        )

    open_rows = []
    as_of_date = daily_rows[-1]["trade_date"] if daily_rows else None
    for position in open_positions.values():
        current_price = position.last_market_value / position.quantity if position.quantity else position.entry_price
        invested_basis = position.gross_entry_value + position.entry_charges
        unrealized_pnl = round(position.last_market_value - invested_basis, 4)
        unrealized_return_pct = round((unrealized_pnl / invested_basis) * 100.0, 4) if invested_basis > 0 else None
        open_rows.append(
            {
                "as_of_date": as_of_date,
                "symbol": position.symbol,
                "security_name": position.security_name,
                "sector": position.sector,
                "signal_date": position.signal_date,
                "entry_date": position.entry_date,
                "regime_on_entry": position.regime_label,
                "signal_rsi": position.signal_rsi,
                "signal_willr": position.signal_willr,
                "close_vs_prev_close_pct": position.close_vs_prev_close_pct,
                "entry_price": position.entry_price,
                "current_price": _round_or_none(current_price, 4),
                "quantity": position.quantity,
                "allocated_capital": invested_basis,
                "market_value": position.last_market_value,
                "unrealized_pnl": unrealized_pnl,
                "unrealized_return_pct": unrealized_return_pct,
                "target_price": position.target_price,
                "days_open": max((as_of_date - position.entry_date).days + 1, 1) if as_of_date else 0,
            }
        )

    closed_returns = [float(trade["return_pct"]) for trade in closed_trades if trade["return_pct"] is not None]
    closed_holds = [int(trade["holding_days"]) for trade in closed_trades if trade["holding_days"] is not None]
    current_value = float(daily_rows[-1]["total_equity"]) if daily_rows else float(start_value)
    benchmark_final = float(daily_rows[-1]["benchmark_value"]) if daily_rows else _fd_value(start_value, calendar_dates[0], calendar_dates[-1])
    return {
        "daily_rows": daily_rows,
        "closed_trades": closed_trades,
        "open_positions": open_rows,
        "skipped_rows": skipped_rows,
        "summary": {
            "investedAmount": start_value,
            "currentValue": current_value,
            "realizedPnl": round(sum(float(trade["net_pnl"]) for trade in closed_trades), 4),
            "unrealizedPnl": round(sum(float(row["unrealized_pnl"]) for row in open_rows), 4),
            "totalReturnPct": _round_or_none(((current_value / start_value) - 1.0) * 100.0 if start_value else 0.0, 4),
            "winRatePct": _round_or_none((sum(1 for value in closed_returns if value > 0) / len(closed_returns) * 100.0) if closed_returns else 0.0, 4),
            "maxDrawdownPct": _round_or_none(min((float(row["drawdown_pct"]) for row in daily_rows), default=0.0), 4),
            "totalCharges": round(sum(float(trade["total_charges"]) for trade in closed_trades), 4),
            "openPositions": len(open_rows),
            "maxOpenPositionsReached": max_open_positions_reached,
            "avgHoldDays": _round_or_none((sum(closed_holds) / len(closed_holds)) if closed_holds else 0.0, 2),
            "maxHoldDays": max(closed_holds) if closed_holds else 0,
            "cashBalance": _round_or_none(cash, 4),
            "exposurePct": _round_or_none(((float(daily_rows[-1]["deployed_capital"]) / start_value) * 100.0) if daily_rows and start_value and daily_rows[-1]["deployed_capital"] is not None else 0.0, 4),
            "fdFinalValue": _round_or_none(benchmark_final, 4),
            "excessOverFd": _round_or_none(current_value - benchmark_final, 4),
        },
    }


def _build_stock_summary(histories: dict[str, list[SymbolBar]], scenario_result: dict[str, Any]) -> list[dict[str, Any]]:
    by_symbol = {
        symbol: {
            "symbol": symbol,
            "security_name": bars[-1].security_name if bars else symbol,
            "sector": bars[-1].sector if bars else "OTHER",
            "signal_count": 0,
            "accepted_trades": 0,
            "skipped_trades": 0,
            "returns": [],
            "holds": [],
            "total_invested": 0.0,
            "current_value": 0.0,
            "realized_pnl": 0.0,
            "unrealized_pnl": 0.0,
            "charges": 0.0,
            "last_signal_date": None,
            "open_position_flag": False,
        }
        for symbol, bars in histories.items()
    }

    for row in scenario_result["skipped_rows"]:
        bucket = by_symbol.setdefault(row["symbol"], {**by_symbol.get(row["symbol"], {}), "symbol": row["symbol"], "security_name": row["symbol"], "sector": "OTHER", "returns": [], "holds": []})
        bucket["signal_count"] += 1
        bucket["skipped_trades"] += 1
        bucket["last_signal_date"] = max(bucket["last_signal_date"], row["signal_date"]) if bucket.get("last_signal_date") else row["signal_date"]

    for trade in scenario_result["closed_trades"]:
        bucket = by_symbol[trade["symbol"]]
        bucket["signal_count"] += 1
        bucket["accepted_trades"] += 1
        bucket["returns"].append(float(trade["return_pct"]) if trade["return_pct"] is not None else 0.0)
        bucket["holds"].append(int(trade["holding_days"]) if trade["holding_days"] is not None else 0)
        bucket["total_invested"] += float(trade["gross_entry_value"])
        bucket["realized_pnl"] += float(trade["net_pnl"])
        bucket["charges"] += float(trade["total_charges"])
        bucket["last_signal_date"] = max(bucket["last_signal_date"], trade["signal_date"]) if bucket.get("last_signal_date") else trade["signal_date"]

    for row in scenario_result["open_positions"]:
        bucket = by_symbol[row["symbol"]]
        bucket["signal_count"] += 1
        bucket["accepted_trades"] += 1
        bucket["total_invested"] += float(row["allocated_capital"])
        bucket["current_value"] += float(row["market_value"])
        bucket["unrealized_pnl"] += float(row["unrealized_pnl"])
        bucket["open_position_flag"] = True
        bucket["last_signal_date"] = max(bucket["last_signal_date"], row["signal_date"]) if bucket.get("last_signal_date") else row["signal_date"]

    summaries: list[dict[str, Any]] = []
    for bucket in by_symbol.values():
        returns = list(bucket["returns"])
        holds = list(bucket["holds"])
        summaries.append(
            {
                "symbol": bucket["symbol"],
                "security_name": bucket["security_name"],
                "sector": bucket["sector"],
                "signal_count": bucket["signal_count"],
                "accepted_trades": bucket["accepted_trades"],
                "skipped_trades": bucket["skipped_trades"],
                "win_rate_pct": _round_or_none((sum(1 for value in returns if value > 0) / len(returns) * 100.0) if returns else 0.0, 4),
                "avg_return_pct": _round_or_none((sum(returns) / len(returns)) if returns else 0.0, 4),
                "median_return_pct": _round_or_none(float(pd.Series(returns).median()) if returns else 0.0, 4),
                "max_gain_pct": _round_or_none(max(returns) if returns else 0.0, 4),
                "max_loss_pct": _round_or_none(min(returns) if returns else 0.0, 4),
                "avg_hold_days": _round_or_none((sum(holds) / len(holds)) if holds else 0.0, 2),
                "max_hold_days": max(holds) if holds else 0,
                "total_invested": _round_or_none(bucket["total_invested"], 4),
                "current_value": _round_or_none(bucket["current_value"], 4),
                "realized_pnl": _round_or_none(bucket["realized_pnl"], 4),
                "unrealized_pnl": _round_or_none(bucket["unrealized_pnl"], 4),
                "charges": _round_or_none(bucket["charges"], 4),
                "last_signal_date": bucket["last_signal_date"],
                "open_position_flag": bucket["open_position_flag"],
            }
        )
    return summaries


def _build_regime_summary(scenario_result: dict[str, Any]) -> list[dict[str, Any]]:
    by_regime: dict[str, dict[str, Any]] = {}
    for trade in scenario_result["closed_trades"]:
        regime = trade["regime_on_entry"] or "Neutral"
        bucket = by_regime.setdefault(regime, {"returns": [], "holds": [], "charges": 0.0})
        bucket["returns"].append(float(trade["return_pct"]) if trade["return_pct"] is not None else 0.0)
        bucket["holds"].append(int(trade["holding_days"]) if trade["holding_days"] is not None else 0)
        bucket["charges"] += float(trade["total_charges"])
    return [
        {
            "regime_label": regime,
            "trade_count": len(bucket["returns"]),
            "win_rate_pct": _round_or_none((sum(1 for value in bucket["returns"] if value > 0) / len(bucket["returns"]) * 100.0) if bucket["returns"] else 0.0, 4),
            "avg_return_pct": _round_or_none((sum(bucket["returns"]) / len(bucket["returns"])) if bucket["returns"] else 0.0, 4),
            "median_return_pct": _round_or_none(float(pd.Series(bucket["returns"]).median()) if bucket["returns"] else 0.0, 4),
            "max_drawdown_contribution_pct": _round_or_none(abs(min(bucket["returns"])) if bucket["returns"] else 0.0, 4),
            "avg_hold_days": _round_or_none((sum(bucket["holds"]) / len(bucket["holds"])) if bucket["holds"] else 0.0, 2),
            "total_charges": _round_or_none(bucket["charges"], 4),
        }
        for regime in ["Rising", "Falling", "Volatile", "Shock", "Neutral"]
        for bucket in [by_regime.get(regime, {"returns": [], "holds": [], "charges": 0.0})]
    ]


def _build_stock_summary_mart_rows(
    stock_summary_rows: list[dict[str, Any]],
    scenario_result: dict[str, Any],
) -> list[dict[str, Any]]:
    regime_by_symbol: dict[str, dict[str, list[float]]] = {}
    for trade in scenario_result["closed_trades"]:
        bucket = regime_by_symbol.setdefault(trade["symbol"], {})
        bucket.setdefault(trade["regime_on_entry"] or "Neutral", []).append(float(trade["return_pct"] or 0.0))
    for row in scenario_result["open_positions"]:
        bucket = regime_by_symbol.setdefault(row["symbol"], {})
        bucket.setdefault(row["regime_on_entry"] or "Neutral", []).append(float(row["unrealized_return_pct"] or 0.0))

    enriched: list[dict[str, Any]] = []
    for row in stock_summary_rows:
        regimes = regime_by_symbol.get(row["symbol"], {})
        ranked = sorted(
            ((regime, sum(values) / len(values)) for regime, values in regimes.items() if values),
            key=lambda item: item[1],
        )
        enriched.append(
            {
                **row,
                "total_net_pnl": _round_or_none(float(row["realized_pnl"] or 0.0) + float(row["unrealized_pnl"] or 0.0), 4),
                "best_regime": ranked[-1][0] if ranked else "Neutral",
                "worst_regime": ranked[0][0] if ranked else "Neutral",
            }
        )
    return enriched


def _build_compare_summary(
    scenario: ScenarioSpec,
    strategy: dict[str, Any],
    scenario_result: dict[str, Any],
    stock_summary_rows: list[dict[str, Any]],
    regime_summary_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    ranked_stocks = sorted(stock_summary_rows, key=lambda item: float(item.get("total_net_pnl") or 0.0))
    strongest_regime = max(regime_summary_rows, key=lambda item: float(item.get("avg_return_pct") or 0.0), default=None)
    weakest_regime = min(regime_summary_rows, key=lambda item: float(item.get("avg_return_pct") or 0.0), default=None)
    summary = scenario_result["summary"]
    return {
        "strategyId": strategy["strategy_id"],
        "strategyVersionId": strategy["strategy_version_id"],
        "displayName": strategy["display_name"],
        "archetype": strategy["archetype"],
        "versionNumber": 1,
        "universeMode": scenario.universe_mode,
        "capitalMode": scenario.capital_mode,
        "stock": scenario.stock_symbol,
        "currentValue": summary["currentValue"],
        "realizedPnl": summary["realizedPnl"],
        "unrealizedPnl": summary["unrealizedPnl"],
        "totalReturnPct": summary["totalReturnPct"],
        "excessOverFd": summary["excessOverFd"],
        "winRatePct": summary["winRatePct"],
        "totalClosedTrades": summary["totalClosedTrades"],
        "openPositions": summary["openPositions"],
        "maxDrawdownPct": summary["maxDrawdownPct"],
        "avgHoldDays": summary["avgHoldDays"],
        "minHoldDays": summary["minHoldDays"],
        "maxHoldDays": summary["maxHoldDays"],
        "totalCharges": summary["totalCharges"],
        "avgExposurePct": summary["avgExposurePct"],
        "topPerformingStock": ranked_stocks[-1]["symbol"] if ranked_stocks else None,
        "worstPerformingStock": ranked_stocks[0]["symbol"] if ranked_stocks else None,
        "regimeStrengthSummary": {
            "bestRegime": strongest_regime["regime_label"] if strongest_regime else None,
            "worstRegime": weakest_regime["regime_label"] if weakest_regime else None,
        },
    }


def _build_daily_summary_payload(scenario_result: dict[str, Any]) -> dict[str, Any]:
    latest_entries = sorted(scenario_result["open_positions"], key=lambda row: (row["entry_date"], row["symbol"]), reverse=True)[:5]
    latest_exits = sorted(
        [trade for trade in scenario_result["closed_trades"] if trade["exit_date"] is not None],
        key=lambda row: (row["exit_date"], row["symbol"]),
        reverse=True,
    )[:5]
    daily_rows = scenario_result["daily_rows"]
    last_row = daily_rows[-1] if daily_rows else None
    prev_row = daily_rows[-2] if len(daily_rows) > 1 else None
    return {
        "latestEntries": [
            {"symbol": row["symbol"], "entryDate": row["entry_date"].isoformat(), "returnPct": row["unrealized_return_pct"] or 0.0}
            for row in latest_entries
        ],
        "latestExits": [
            {"symbol": row["symbol"], "exitDate": row["exit_date"].isoformat() if row["exit_date"] else None, "exitReason": row["exit_reason"], "returnPct": row["return_pct"] or 0.0}
            for row in latest_exits
        ],
        "currentOpenPositions": len(scenario_result["open_positions"]),
        "skippedSignals": len(scenario_result["skipped_rows"]),
        "dailyPortfolioDelta": round((float(last_row["total_equity"]) - float(prev_row["total_equity"])) if last_row and prev_row else 0.0, 4),
        "dailyBenchmarkDelta": round((float(last_row["benchmark_value"]) - float(prev_row["benchmark_value"])) if last_row and prev_row else 0.0, 4),
    }


def _validate_batch(results: list[dict[str, Any]]) -> dict[str, Any]:
    failures: list[str] = []
    for item in results:
        scenario = item["scenario"]
        scenario_result = item["result"]
        if scenario.capital_mode != "no_capital_limit":
            min_cash = min((float(row["available_cash"]) for row in scenario_result["daily_rows"] if row["available_cash"] is not None), default=0.0)
            if min_cash < -0.01:
                failures.append(f"{scenario.scenario_key}: finite-capital cash went negative ({min_cash}).")
        for trade in scenario_result["closed_trades"]:
            if trade["entry_date"] <= trade["signal_date"]:
                failures.append(f"{scenario.scenario_key}: entry date not after signal date for {trade['symbol']}.")
                break
            if trade["exit_date"] is not None and trade["exit_date"] < trade["entry_date"]:
                failures.append(f"{scenario.scenario_key}: exit date before entry date for {trade['symbol']}.")
                break
    return {"scenario_count": len(results), "failed_count": len(failures), "failures": failures[:50]}


def refresh_backtesting_snapshots(conn, job_run_id: int) -> dict[str, Any]:
    _ensure_default_strategy(conn)
    active_versions = _load_active_versions(conn)
    if not active_versions:
        raise RuntimeError("No active backtesting strategy versions are configured.")

    data_as_of_value = fetch_value(conn, "SELECT MAX(trade_date) FROM nse_app.security_daily_features")
    if data_as_of_value is None:
        raise RuntimeError("security_daily_features is empty; refresh features before backtesting snapshots.")
    data_as_of_date = _as_date(data_as_of_value)
    evidence_start = data_as_of_date - timedelta(days=(EVIDENCE_YEARS * 365) - 1)
    query_start = evidence_start - timedelta(days=WARMUP_DAYS)
    config_version = ",".join(sorted(str(version["strategy_version_id"]) for version in active_versions))
    batch_run_id = _begin_batch(conn, job_run_id=job_run_id, data_as_of_date=data_as_of_date, config_version=config_version)

    try:
        strategy_lookup = {
            str(version["strategy_version_id"]): {
                "strategy_id": str(version["strategy_id"]),
                "strategy_version_id": str(version["strategy_version_id"]),
                "display_name": str(version["display_name"]),
                "description": str(version.get("description") or ""),
                "version_number": int(version.get("version_number") or 1),
                "config": version.get("config_json") if isinstance(version.get("config_json"), dict) else {},
                "assumptions": version.get("assumptions_json") if isinstance(version.get("assumptions_json"), dict) else {},
                "fee_profile_id": version.get("fee_profile_id"),
            }
            for version in active_versions
        }
        archetype_lookup = {item["strategy_version_id"]: item["archetype"] for item in _strategy_definitions()}
        for strategy_version_id, strategy in strategy_lookup.items():
            strategy["archetype"] = archetype_lookup.get(strategy_version_id, "custom")

        regime_inputs = _fetch_market_regime_inputs(conn, start_date=query_start, end_date=data_as_of_date)
        regime_map = _build_regime_map(regime_inputs)
        nifty_close_by_date = {
            _as_date(row["trade_date"]): float(row["nifty_close"])
            for row in regime_inputs.to_dict(orient="records")
            if _safe_float(row.get("nifty_close")) is not None
        }
        universe_name = str(
            next(
                (
                    strategy.get("config", {}).get("universe_name")
                    for strategy in strategy_lookup.values()
                    if isinstance(strategy.get("config", {}).get("universe_name"), str)
                ),
                DEFAULT_UNIVERSE_NAME,
            )
        )
        history_df = _fetch_symbol_history(conn, universe_name=universe_name, start_date=query_start, end_date=data_as_of_date)
        histories_with_warmup, symbol_rows_all, symbols = _build_symbol_bars(history_df, regime_map)
        if not symbols:
            raise RuntimeError("No tradable symbols were available for backtesting snapshot generation.")

        evidence_symbol_rows = [row for row in symbol_rows_all if row[0] >= evidence_start]
        histories = {
            symbol: [bar for bar in bars if bar.trade_date >= evidence_start]
            for symbol, bars in histories_with_warmup.items()
            if any(bar.trade_date >= evidence_start for bar in bars)
        }
        if not histories:
            raise RuntimeError("No evidence-window histories were available for backtesting snapshot generation.")
        calendar_dates = sorted({bar.trade_date for bars in histories.values() for bar in bars})
        if not calendar_dates:
            raise RuntimeError("No calendar dates were available for backtesting snapshot generation.")

        feature_rows = _build_feature_rows("shared", evidence_symbol_rows)
        benchmark_rows = _build_benchmark_rows(calendar_dates)
        feature_duplicate_keys = len(feature_rows) - len({(row[0], row[1]) for row in feature_rows})
        feature_null_issues = _count_feature_null_issues(histories_with_warmup, evidence_start)

        run_rows: list[tuple[Any, ...]] = []
        validation_rows: list[tuple[Any, ...]] = []
        feature_daily_rows: list[tuple[Any, ...]] = [(batch_run_id, *row) for row in feature_rows]
        signal_candidate_rows: list[tuple[Any, ...]] = []
        trade_template_rows: list[tuple[Any, ...]] = []
        benchmark_fd_rows: list[tuple[Any, ...]] = [
            (batch_run_id, capital_mode, trade_date, start_value, benchmark_value, FD_ANNUAL_RATE_PCT, benchmark_mode)
            for capital_mode, trade_date, start_value, benchmark_value, benchmark_mode in benchmark_rows
        ]
        strategy_summary_mart_rows: list[tuple[Any, ...]] = []
        stock_summary_mart_rows: list[tuple[Any, ...]] = []
        regime_summary_mart_rows: list[tuple[Any, ...]] = []
        compare_summary_mart_rows: list[tuple[Any, ...]] = []
        daily_summary_mart_rows: list[tuple[Any, ...]] = []
        symbol_daily_rows: list[tuple[Any, ...]] = []
        daily_equity_rows: list[tuple[Any, ...]] = []
        trade_log_rows: list[tuple[Any, ...]] = []
        open_position_rows: list[tuple[Any, ...]] = []
        stock_summary_rows: list[tuple[Any, ...]] = []
        regime_summary_rows: list[tuple[Any, ...]] = []
        skipped_signal_rows: list[tuple[Any, ...]] = []
        validation_targets: list[dict[str, Any]] = []
        compare_strategy_ids: set[str] = set()

        for version in active_versions:
            strategy_version_id = str(version["strategy_version_id"])
            strategy = strategy_lookup[strategy_version_id]
            strategy_hash = _json_hash(
                {
                    "strategy_id": strategy["strategy_id"],
                    "strategy_version_id": strategy["strategy_version_id"],
                    "config": strategy["config"],
                    "assumptions": strategy["assumptions"],
                }
            )
            universe_hash = _json_hash({"universe_name": universe_name, "symbols": symbols})

            symbol_daily_rows.extend(
                [
                    (
                        batch_run_id,
                        strategy_version_id,
                        row[0],
                        row[1],
                        row[2],
                        row[3],
                        row[4],
                        row[5],
                        row[6],
                        row[7],
                        row[8],
                        row[9],
                        row[10],
                        row[11],
                        row[17],
                        row[18],
                    )
                    for row in evidence_symbol_rows
                ]
            )

            candidates = _build_signal_candidates(strategy, histories)
            signal_candidate_rows.extend(
                [
                    (
                        batch_run_id,
                        strategy_version_id,
                        candidate["symbol"],
                        candidate["signal_date"],
                        candidate["entry_date"],
                        True,
                        candidate["regime_on_signal"],
                        json.dumps(candidate["rank_inputs"]),
                        json.dumps(candidate["entry_reason_json"]),
                        json.dumps(candidate["feature_snapshot_json"]),
                    )
                    for candidate in candidates
                ]
            )
            templates = _build_trade_templates(batch_run_id, strategy, histories, candidates)
            trade_template_rows.extend(
                [
                    (
                        template.trade_template_id,
                        batch_run_id,
                        strategy_version_id,
                        template.symbol,
                        template.signal_date,
                        template.entry_date,
                        template.entry_price,
                        template.target_price,
                        template.stop_price,
                        template.theoretical_exit_date,
                        template.theoretical_exit_price,
                        template.exit_reason,
                        template.exit_timing,
                        template.hold_days,
                        template.gross_return_pct,
                        template.regime_on_entry,
                        template.open_trade_flag_at_asof,
                        template.mark_to_market_price,
                        template.mark_to_market_return_pct,
                        json.dumps(template.rank_inputs),
                        json.dumps(template.details),
                    )
                    for template in templates
                ]
            )

            for scenario in _build_scenarios(strategy, symbols):
                scenario_histories = _scenario_symbols(scenario, histories)
                if not scenario_histories or not any(scenario_histories.values()):
                    continue

                scenario_templates = [template for template in templates if template.symbol in scenario_histories]
                scenario_result = _replay_scenario_from_templates(
                    strategy,
                    scenario,
                    calendar_dates,
                    scenario_histories,
                    scenario_templates,
                    nifty_close_by_date,
                )
                scenario_stock_summary = _build_stock_summary(scenario_histories, scenario_result)
                scenario_stock_summary_mart = _build_stock_summary_mart_rows(scenario_stock_summary, scenario_result)
                scenario_regime_summary = _build_regime_summary(scenario_result)
                compare_summary = _build_compare_summary(
                    scenario,
                    strategy,
                    scenario_result,
                    scenario_stock_summary_mart,
                    scenario_regime_summary,
                )
                daily_summary_payload = _build_daily_summary_payload(scenario_result)
                validation_targets.append({"scenario": scenario, "result": scenario_result})
                compare_strategy_ids.add(strategy["strategy_id"])
                run_scope_hash = _json_hash(
                    {
                        "strategy_version_id": strategy_version_id,
                        "scenario_key": scenario.scenario_key,
                        "universe_mode": scenario.universe_mode,
                        "capital_mode": scenario.capital_mode,
                        "stock_symbol": scenario.stock_symbol,
                        "as_of_date": data_as_of_date,
                    }
                )
                summary_json = {
                    **scenario_result["summary"],
                    "benchmarkMode": scenario.benchmark_mode,
                    "label": scenario.scenario_label,
                    "archetype": scenario.archetype,
                }

                rows_processed = (
                    len(scenario_result["daily_rows"])
                    + len(scenario_result["closed_trades"])
                    + len(scenario_result["open_positions"])
                    + len(scenario_result["skipped_rows"])
                )
                run_rows.append(
                    (
                        batch_run_id,
                        strategy_version_id,
                        scenario.scenario_key,
                        scenario.scenario_label,
                        scenario.universe_mode,
                        scenario.capital_mode,
                        scenario.stock_symbol,
                        data_as_of_date,
                        rows_processed,
                        0,
                        0,
                        json.dumps(summary_json),
                        strategy_hash,
                        data_as_of_date,
                        universe_hash,
                        run_scope_hash,
                    )
                )
                strategy_summary_mart_rows.append(
                    (
                        batch_run_id,
                        strategy_version_id,
                        scenario.scenario_key,
                        strategy["strategy_id"],
                        strategy["display_name"],
                        strategy["archetype"],
                        scenario.universe_mode,
                        scenario.capital_mode,
                        scenario.stock_symbol,
                        data_as_of_date,
                        json.dumps(summary_json),
                        json.dumps(
                            {
                                "scenarioLabel": scenario.scenario_label,
                                "versionNumber": strategy["version_number"],
                                "description": strategy["description"],
                                "benchmarkMode": scenario.benchmark_mode,
                            }
                        ),
                    )
                )
                compare_summary_mart_rows.append(
                    (
                        batch_run_id,
                        strategy_version_id,
                        scenario.scenario_key,
                        strategy["strategy_id"],
                        strategy["display_name"],
                        strategy["archetype"],
                        scenario.universe_mode,
                        scenario.capital_mode,
                        data_as_of_date,
                        json.dumps(compare_summary),
                    )
                )
                daily_summary_mart_rows.append(
                    (
                        batch_run_id,
                        strategy_version_id,
                        scenario.scenario_key,
                        data_as_of_date,
                        json.dumps(daily_summary_payload),
                    )
                )

                daily_equity_rows.extend(
                    [
                        (
                            batch_run_id,
                            strategy_version_id,
                            scenario.scenario_key,
                            row["trade_date"],
                            row["active_positions"],
                            row["deployed_capital"],
                            row["available_cash"],
                            row["market_value"],
                            row["total_equity"],
                            row["benchmark_value"],
                            row["daily_return_pct"],
                            row["drawdown_pct"],
                        )
                        for row in scenario_result["daily_rows"]
                    ]
                )
                trade_log_rows.extend(
                    [
                        (
                            batch_run_id,
                            strategy_version_id,
                            scenario.scenario_key,
                            trade["symbol"],
                            trade["security_name"],
                            trade["sector"],
                            trade["signal_date"],
                            trade["entry_date"],
                            trade["exit_date"],
                            trade["exit_reason"],
                            trade["regime_on_entry"],
                            trade["signal_rsi"],
                            trade["signal_willr"],
                            trade["close_vs_prev_close_pct"],
                            trade["entry_price"],
                            trade["exit_price"],
                            trade["quantity"],
                            trade["gross_entry_value"],
                            trade["gross_exit_value"],
                            trade["total_charges"],
                            trade["net_pnl"],
                            trade["profit_tax_rate"],
                            trade["profit_tax_amount"],
                            trade["after_tax_net_pnl"],
                            trade["return_pct"],
                            trade["holding_days"],
                            trade["trade_status"],
                            json.dumps({"source": "published_backtest", "scenarioLabel": scenario.scenario_label}),
                        )
                        for trade in scenario_result["closed_trades"]
                    ]
                )
                open_position_rows.extend(
                    [
                        (
                            batch_run_id,
                            strategy_version_id,
                            scenario.scenario_key,
                            row["as_of_date"],
                            row["symbol"],
                            row["security_name"],
                            row["sector"],
                            row["signal_date"],
                            row["entry_date"],
                            row["regime_on_entry"],
                            row["signal_rsi"],
                            row["signal_willr"],
                            row["close_vs_prev_close_pct"],
                            row["entry_price"],
                            row["current_price"],
                            row["quantity"],
                            row["allocated_capital"],
                            row["market_value"],
                            row["unrealized_pnl"],
                            row["unrealized_return_pct"],
                            row["target_price"],
                            row["days_open"],
                        )
                        for row in scenario_result["open_positions"]
                    ]
                )
                stock_summary_rows.extend(
                    [
                        (
                            batch_run_id,
                            strategy_version_id,
                            scenario.scenario_key,
                            row["symbol"],
                            row["security_name"],
                            row["sector"],
                            row["signal_count"],
                            row["accepted_trades"],
                            row["skipped_trades"],
                            row["win_rate_pct"],
                            row["avg_return_pct"],
                            row["median_return_pct"],
                            row["max_gain_pct"],
                            row["max_loss_pct"],
                            row["avg_hold_days"],
                            row["max_hold_days"],
                            row["total_invested"],
                            row["current_value"],
                            row["realized_pnl"],
                            row["unrealized_pnl"],
                            row["charges"],
                            row["last_signal_date"],
                            row["open_position_flag"],
                        )
                        for row in scenario_stock_summary
                    ]
                )
                stock_summary_mart_rows.extend(
                    [
                        (
                            batch_run_id,
                            strategy_version_id,
                            scenario.scenario_key,
                            row["symbol"],
                            json.dumps(row, default=str),
                        )
                        for row in scenario_stock_summary_mart
                    ]
                )
                regime_summary_rows.extend(
                    [
                        (
                            batch_run_id,
                            strategy_version_id,
                            scenario.scenario_key,
                            row["regime_label"],
                            row["trade_count"],
                            row["win_rate_pct"],
                            row["avg_return_pct"],
                            row["median_return_pct"],
                            row["max_drawdown_contribution_pct"],
                            row["avg_hold_days"],
                            row["total_charges"],
                        )
                        for row in scenario_regime_summary
                    ]
                )
                regime_summary_mart_rows.extend(
                    [
                        (
                            batch_run_id,
                            strategy_version_id,
                            scenario.scenario_key,
                            row["regime_label"],
                            json.dumps(row),
                        )
                        for row in scenario_regime_summary
                    ]
                )
                skipped_signal_rows.extend(
                    [
                        (
                            batch_run_id,
                            strategy_version_id,
                            scenario.scenario_key,
                            row["signal_date"],
                            row["entry_date"],
                            row["symbol"],
                            row["reason"],
                            row["regime_label"],
                            row["signal_rsi"],
                            row["signal_willr"],
                            row["close_vs_prev_close_pct"],
                            json.dumps(row["details"]),
                        )
                        for row in scenario_result["skipped_rows"]
                    ]
                )
                validation_rows.append(
                    (
                        batch_run_id,
                        strategy_version_id,
                        scenario.scenario_key,
                        "scenario_ready",
                        "passed",
                        json.dumps(
                            {
                                "daily_rows": len(scenario_result["daily_rows"]),
                                "closed_trades": len(scenario_result["closed_trades"]),
                                "open_positions": len(scenario_result["open_positions"]),
                                "skipped_signals": len(scenario_result["skipped_rows"]),
                                "accepted_templates": len(scenario_result["accepted_templates"]),
                                "candidate_templates": len(scenario_templates),
                                "summary": scenario_result["summary"],
                            }
                        ),
                    )
                )

        validation_metrics = _validate_batch(validation_targets)
        failures = list(validation_metrics["failures"])
        if feature_duplicate_keys > 0:
            failures.append(f"feature_daily contains {feature_duplicate_keys} duplicate symbol-date keys.")
        if feature_null_issues > 0:
            failures.append(f"feature_daily contains {feature_null_issues} rows with null indicators after warm-up.")
        if len(compare_strategy_ids) < 3:
            failures.append(f"compare mart only produced {len(compare_strategy_ids)} strategies; expected at least 3.")
        for item in validation_targets:
            scenario = item["scenario"]
            scenario_result = item["result"]
            if scenario.capital_mode == "no_capital_limit":
                cash_skips = sum(1 for row in scenario_result["skipped_rows"] if row["reason"] == "skipped_due_to_cash_constraint")
                if cash_skips:
                    failures.append(f"{scenario.scenario_key}: no-capital-limit scenario skipped {cash_skips} trades for cash reasons.")
            template_count = len(scenario_result["accepted_templates"]) + len(scenario_result["skipped_rows"])
            candidate_count = len(
                [
                    row
                    for row in trade_template_rows
                    if row[2] == scenario.strategy_version_id
                    and (scenario.universe_mode != "single_stock" or row[3] == scenario.stock_symbol)
                ]
            )
            if template_count != candidate_count:
                failures.append(
                    f"{scenario.scenario_key}: accepted+skipped ({template_count}) did not reconcile to candidate templates ({candidate_count})."
                )
                break
        validation_metrics.update(
            {
                "feature_duplicate_keys": feature_duplicate_keys,
                "feature_null_issues": feature_null_issues,
                "compare_strategy_count": len(compare_strategy_ids),
                "signal_candidate_count": len(signal_candidate_rows),
                "trade_template_count": len(trade_template_rows),
                "failed_count": len(failures),
                "failures": failures[:50],
            }
        )
        if validation_metrics["failed_count"] > 0:
            raise RuntimeError("Backtesting validation failed: " + " | ".join(validation_metrics["failures"]))

        for version in active_versions:
            validation_rows.append(
                (
                    batch_run_id,
                    str(version["strategy_version_id"]),
                    None,
                    "batch_validation",
                    "passed",
                    json.dumps(validation_metrics),
                )
            )

        row_counts = {
            "backtest_runs": len(run_rows),
            "backtest_run_validation": len(validation_rows),
            "backtest_feature_daily": len(feature_daily_rows),
            "backtest_signal_candidate": len(signal_candidate_rows),
            "backtest_trade_template": len(trade_template_rows),
            "backtest_benchmark_fd": len(benchmark_fd_rows),
            "backtest_symbol_daily": len(symbol_daily_rows),
            "backtest_daily_equity": len(daily_equity_rows),
            "backtest_trade_log": len(trade_log_rows),
            "backtest_open_position": len(open_position_rows),
            "backtest_stock_summary": len(stock_summary_rows),
            "backtest_regime_summary": len(regime_summary_rows),
            "backtest_skipped_signal": len(skipped_signal_rows),
            "backtest_strategy_summary_mart": len(strategy_summary_mart_rows),
            "backtest_stock_summary_mart": len(stock_summary_mart_rows),
            "backtest_regime_summary_mart": len(regime_summary_mart_rows),
            "backtest_compare_summary_mart": len(compare_summary_mart_rows),
            "backtest_daily_summary_mart": len(daily_summary_mart_rows),
        }

        with conn.cursor() as cur:
            _insert_many(
                cur,
                "INSERT INTO nse_app.backtest_run (batch_run_id, strategy_version_id, scenario_key, scenario_label, universe_mode, capital_mode, stock_symbol, as_of_date, rows_processed, warnings_count, errors_count, summary_json, strategy_version_hash, feature_data_asof, universe_hash, run_scope_hash) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s, %s)",
                run_rows,
            )
            _insert_many(
                cur,
                "INSERT INTO nse_app.backtest_run_validation (batch_run_id, strategy_version_id, scenario_key, validation_name, status, details_json) VALUES (%s, %s, %s, %s, %s, %s::jsonb)",
                validation_rows,
            )
            _insert_many(
                cur,
                "INSERT INTO nse_app.backtest_feature_daily (batch_run_id, trade_date, symbol, security_name, sector, instrument_scope, tradable_flag, open_price, high_price, low_price, close_price, prev_close, close_vs_prev_close_pct, rsi_14, willr_14, sma20, sma50, macd_line, macd_signal, macd_hist, regime_label, data_quality_flag) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                feature_daily_rows,
            )
            _insert_many(
                cur,
                "INSERT INTO nse_app.backtest_signal_candidate (batch_run_id, strategy_version_id, symbol, signal_date, entry_date, entry_eligible_flag, regime_on_signal, signal_rank_inputs_json, entry_reason_json, feature_snapshot_json) VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb)",
                signal_candidate_rows,
            )
            _insert_many(
                cur,
                "INSERT INTO nse_app.backtest_trade_template (trade_template_id, batch_run_id, strategy_version_id, symbol, signal_date, entry_date, entry_price, target_price, stop_price, theoretical_exit_date, theoretical_exit_price, exit_reason, exit_timing, hold_days, gross_return_pct, regime_on_entry, open_trade_flag_at_asof, mark_to_market_price, mark_to_market_return_pct, rank_inputs_json, details_json) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb)",
                trade_template_rows,
            )
            _insert_many(
                cur,
                "INSERT INTO nse_app.backtest_benchmark_fd (batch_run_id, capital_mode, trade_date, start_value, benchmark_value, annual_rate_pct, benchmark_mode) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                benchmark_fd_rows,
            )
            _insert_many(
                cur,
                "INSERT INTO nse_app.backtest_symbol_daily (batch_run_id, strategy_version_id, trade_date, symbol, security_name, sector, open_price, high_price, low_price, close_price, prev_close, close_vs_prev_close_pct, rsi_14, willr_14, regime_label, data_quality_flag) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                symbol_daily_rows,
            )
            _insert_many(
                cur,
                "INSERT INTO nse_app.backtest_daily_equity (batch_run_id, strategy_version_id, scenario_key, trade_date, active_positions, deployed_capital, available_cash, market_value, total_equity, benchmark_value, daily_return_pct, drawdown_pct) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                daily_equity_rows,
            )
            _insert_many(
                cur,
                "INSERT INTO nse_app.backtest_trade_log (batch_run_id, strategy_version_id, scenario_key, symbol, security_name, sector, signal_date, entry_date, exit_date, exit_reason, regime_on_entry, signal_rsi, signal_willr, close_vs_prev_close_pct, entry_price, exit_price, quantity, gross_entry_value, gross_exit_value, total_charges, net_pnl, profit_tax_rate, profit_tax_amount, after_tax_net_pnl, return_pct, holding_days, trade_status, metadata_json) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)",
                trade_log_rows,
            )
            _insert_many(
                cur,
                "INSERT INTO nse_app.backtest_open_position (batch_run_id, strategy_version_id, scenario_key, as_of_date, symbol, security_name, sector, signal_date, entry_date, regime_on_entry, signal_rsi, signal_willr, close_vs_prev_close_pct, entry_price, current_price, quantity, allocated_capital, market_value, unrealized_pnl, unrealized_return_pct, target_price, days_open) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                open_position_rows,
            )
            _insert_many(
                cur,
                "INSERT INTO nse_app.backtest_stock_summary (batch_run_id, strategy_version_id, scenario_key, symbol, security_name, sector, signal_count, accepted_trades, skipped_trades, win_rate_pct, avg_return_pct, median_return_pct, max_gain_pct, max_loss_pct, avg_hold_days, max_hold_days, total_invested, current_value, realized_pnl, unrealized_pnl, charges, last_signal_date, open_position_flag) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                stock_summary_rows,
            )
            _insert_many(
                cur,
                "INSERT INTO nse_app.backtest_regime_summary (batch_run_id, strategy_version_id, scenario_key, regime_label, trade_count, win_rate_pct, avg_return_pct, median_return_pct, max_drawdown_contribution_pct, avg_hold_days, total_charges) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                regime_summary_rows,
            )
            _insert_many(
                cur,
                "INSERT INTO nse_app.backtest_skipped_signal (batch_run_id, strategy_version_id, scenario_key, signal_date, entry_date, symbol, reason, regime_label, signal_rsi, signal_willr, close_vs_prev_close_pct, details_json) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)",
                skipped_signal_rows,
            )
            _insert_many(
                cur,
                "INSERT INTO nse_app.backtest_strategy_summary_mart (batch_run_id, strategy_version_id, scenario_key, strategy_id, display_name, archetype, universe_mode, capital_mode, stock_symbol, as_of_date, summary_json, metadata_json) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb)",
                strategy_summary_mart_rows,
            )
            _insert_many(
                cur,
                "INSERT INTO nse_app.backtest_stock_summary_mart (batch_run_id, strategy_version_id, scenario_key, symbol, summary_json) VALUES (%s, %s, %s, %s, %s::jsonb)",
                stock_summary_mart_rows,
            )
            _insert_many(
                cur,
                "INSERT INTO nse_app.backtest_regime_summary_mart (batch_run_id, strategy_version_id, scenario_key, regime_label, summary_json) VALUES (%s, %s, %s, %s, %s::jsonb)",
                regime_summary_mart_rows,
            )
            _insert_many(
                cur,
                "INSERT INTO nse_app.backtest_compare_summary_mart (batch_run_id, strategy_version_id, scenario_key, strategy_id, display_name, archetype, universe_mode, capital_mode, as_of_date, compare_json) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)",
                compare_summary_mart_rows,
            )
            _insert_many(
                cur,
                "INSERT INTO nse_app.backtest_daily_summary_mart (batch_run_id, strategy_version_id, scenario_key, as_of_date, payload_json) VALUES (%s, %s, %s, %s, %s::jsonb)",
                daily_summary_mart_rows,
            )
            _publish_batch(conn, batch_run_id=batch_run_id, row_counts=row_counts, validation_metrics=validation_metrics)
        conn.commit()

        return {
            "backtesting_batch_run_id": batch_run_id,
            "backtesting_published_batch_run_id": batch_run_id,
            "backtesting_data_as_of_date": data_as_of_date.isoformat(),
            "backtesting_strategy_versions": len(active_versions),
            "backtesting_compare_strategy_count": len(compare_strategy_ids),
            "backtesting_evidence_start": evidence_start.isoformat(),
            **row_counts,
        }
    except Exception as exc:
        conn.rollback()
        _mark_batch_failed(conn, batch_run_id, str(exc))
        raise
