from __future__ import annotations

import json
import logging
import math
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import yaml

from .db import fetch_value, query_df

logger = logging.getLogger(__name__)

BATCH_NAME = "indicator_strategy_precompute"
STALE_AFTER_DAYS = 5
EVIDENCE_HORIZONS = [5, 10, 20, 40]
RETURN_DISTRIBUTION_BUCKETS = [
    ("< -10%", float("-inf"), -10.0),
    ("-10% to -5%", -10.0, -5.0),
    ("-5% to -2%", -5.0, -2.0),
    ("-2% to 0%", -2.0, 0.0),
    ("0% to 2%", 0.0, 2.0),
    ("2% to 5%", 2.0, 5.0),
    ("5% to 10%", 5.0, 10.0),
    ("> 10%", 10.0, float("inf")),
]
HOLDING_DURATION_BUCKETS = [
    ("1-5d", 1, 5),
    ("6-10d", 6, 10),
    ("11-20d", 11, 20),
    ("21-40d", 21, 40),
    ("41d+", 41, float("inf")),
]


@dataclass(frozen=True)
class ThresholdBand:
    key: str
    label: str
    range_label: str
    interpretation: str
    lower_bound: float | None
    upper_bound: float | None
    tone: str


@dataclass(frozen=True)
class ExpandedScenario:
    scenario_id: str
    indicator_slug: str
    scenario_key: str
    page_key: str
    label: str
    short_description: str
    universe: str
    universe_membership_mode: str
    benchmark_label: str
    lookback_years: int
    entry_rule: str
    exit_rule: str
    capital_model: str
    starting_capital: float | None
    ticket_size_rule: str
    max_open_positions: int | None
    priority_rule: str
    priority_rule_note: str
    transaction_cost_bps: float
    slippage_bps: float
    execution_assumption: dict[str, Any]
    entry_config: dict[str, Any]
    exit_config: dict[str, Any]
    active_flag: bool
    include_on_indicator_page: bool
    capital_variant_key: str
    max_hold_days: int


@dataclass(frozen=True)
class IndicatorConfig:
    slug: str
    indicator_type: str
    indicator_params: dict[str, Any]
    validation_range: tuple[float | None, float | None]
    display_name: str
    short_description: str
    one_line_summary: str
    formula_text: str
    what_it_is: list[str]
    how_to_read: list[str]
    threshold_bands: list[ThresholdBand]
    chart_labels: dict[str, str]
    chart_help_text: dict[str, str]
    glossary_terms: list[dict[str, str]]
    assumptions_text: list[str]
    limitations_text: list[str]
    evidence_years: int
    warmup_days: int
    max_forward_days: int
    current_value_label: str
    universe: str
    universe_display_name: str
    universe_membership_mode: str
    benchmark_index_name: str
    benchmark_index_label: str
    scenarios: list[ExpandedScenario]


@dataclass(frozen=True)
class IndicatorRegistry:
    config_version: str
    indicators: dict[str, IndicatorConfig]

    @property
    def available_indicators(self) -> list[dict[str, str]]:
        return [
            {
                "slug": indicator.slug,
                "displayName": indicator.display_name,
                "shortDescription": indicator.short_description,
            }
            for indicator in self.indicators.values()
        ]


@dataclass
class BarPoint:
    trade_date: date
    symbol: str
    security_name: str
    sector: str
    open_price: float | None
    high_price: float | None
    low_price: float | None
    close_price: float | None
    total_traded_qty: int | None
    change_pct: float | None
    indicator_value: float | None = None
    previous_indicator_value: float | None = None
    band_key: str | None = None
    band_label: str | None = None
    data_quality_flag: str = "ok"


@dataclass
class PendingEntry:
    symbol: str
    security_name: str
    sector: str
    signal_trade_date: date
    signal_value: float | None
    priority_value: float | None


@dataclass
class OpenPosition:
    symbol: str
    security_name: str
    sector: str
    signal_trade_date: date
    signal_value: float | None
    priority_value: float | None
    entry_date: date
    entry_index: int
    entry_price: float
    entry_shares: float
    gross_entry_value: float
    entry_fee: float
    ticket_size: float | None
    target_price: float | None
    pending_exit_reason: str | None = None
    pending_exit_signal_date: date | None = None
    return_basis_value: float = 0.0
    last_close_market_value: float = 0.0
    last_indicator_value: float | None = None
    exit_signal_trade_date: date | None = None
    notes: dict[str, Any] = field(default_factory=dict)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _stale_after(data_as_of_date: date) -> datetime:
    return datetime.combine(data_as_of_date + timedelta(days=STALE_AFTER_DAYS), time.min, tzinfo=timezone.utc)


def _as_date(value: Any) -> date:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if value is None:
        raise ValueError("Expected a date value, received None.")
    return pd.Timestamp(value).date()


def _safe_float(value: Any) -> float | None:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    try:
        result = float(value)
    except Exception:
        return None
    if math.isnan(result) or math.isinf(result):
        return None
    return result


def _safe_int(value: Any) -> int | None:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    try:
        return int(value)
    except Exception:
        return None


def _round_or_none(value: float | None, digits: int = 2) -> float | None:
    if value is None or math.isnan(value) or math.isinf(value):
        return None
    return round(value, digits)


def _average(values: list[float]) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)


def _median(values: list[float]) -> float | None:
    if not values:
        return None
    sorted_values = sorted(values)
    mid = len(sorted_values) // 2
    if len(sorted_values) % 2 == 0:
        return (sorted_values[mid - 1] + sorted_values[mid]) / 2
    return sorted_values[mid]


def _percentile_rank(value: float, sample: list[float]) -> float | None:
    if not sample:
        return None
    count = sum(1 for item in sample if item <= value)
    return (count / len(sample)) * 100.0


def _format_number(value: float | None, digits: int = 1) -> str:
    if value is None:
        return "--"
    return f"{value:.{digits}f}"


def _format_signed_pct(value: float | None, digits: int = 2) -> str:
    if value is None:
        return "--"
    sign = "+" if value > 0 else ""
    return f"{sign}{value:.{digits}f}%"


def _format_pct(value: float | None, digits: int = 1) -> str:
    if value is None:
        return "--"
    return f"{value:.{digits}f}%"


def _format_integer(value: int | float | None) -> str:
    if value is None:
        return "--"
    return f"{int(round(value)):,}"


def _format_currency(value: float | None) -> str:
    if value is None:
        return "--"
    return f"₹{value:,.0f}"


def _format_days(value: float | None) -> str:
    if value is None:
        return "--"
    return f"{value:.1f}d"


def _tone_from_value(value: float | None) -> str:
    if value is None:
        return "white"
    if value > 0:
        return "green"
    if value < 0:
        return "red"
    return "white"


def _distribution(values: list[float], buckets: list[tuple[str, float, float]]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for label, minimum, maximum in buckets:
        count = sum(1 for value in values if value >= minimum and value < maximum)
        output.append({"bucketLabel": label, "count": count})
    return output


def _band_for_value(value: float | None, bands: list[ThresholdBand]) -> ThresholdBand | None:
    if value is None:
        return None
    for band in bands:
        lower_ok = band.lower_bound is None or value >= band.lower_bound
        upper_ok = band.upper_bound is None or value < band.upper_bound
        if lower_ok and upper_ok:
            return band
    return bands[-1] if bands else None


def _compute_rsi_series(closes: list[float | None], period: int) -> list[float | None]:
    output: list[float | None] = [None] * len(closes)
    if len(closes) <= period:
        return output
    if any(close is None for close in closes[: period + 1]):
        return output

    gain_sum = 0.0
    loss_sum = 0.0
    for idx in range(1, period + 1):
        current = closes[idx]
        previous = closes[idx - 1]
        if current is None or previous is None:
            return output
        delta = current - previous
        if delta > 0:
            gain_sum += delta
        else:
            loss_sum += abs(delta)

    avg_gain = gain_sum / period
    avg_loss = loss_sum / period
    output[period] = 100.0 if avg_loss == 0 else 100.0 - 100.0 / (1.0 + avg_gain / avg_loss)

    for idx in range(period + 1, len(closes)):
        current = closes[idx]
        previous = closes[idx - 1]
        if current is None or previous is None:
            output[idx] = None
            continue
        delta = current - previous
        gain = delta if delta > 0 else 0.0
        loss = abs(delta) if delta < 0 else 0.0
        avg_gain = ((avg_gain * (period - 1)) + gain) / period
        avg_loss = ((avg_loss * (period - 1)) + loss) / period
        output[idx] = 100.0 if avg_loss == 0 else 100.0 - 100.0 / (1.0 + avg_gain / avg_loss)
    return [None if value is None else max(0.0, min(100.0, value)) for value in output]


def _compute_willr_series(highs: list[float | None], lows: list[float | None], closes: list[float | None], period: int) -> list[float | None]:
    output: list[float | None] = [None] * len(closes)
    for idx in range(period - 1, len(closes)):
        window_highs = highs[idx - period + 1 : idx + 1]
        window_lows = lows[idx - period + 1 : idx + 1]
        window_closes = closes[idx - period + 1 : idx + 1]
        if any(value is None for value in window_highs + window_lows + window_closes):
            continue
        highest_high = max(value for value in window_highs if value is not None)
        lowest_low = min(value for value in window_lows if value is not None)
        close_value = closes[idx]
        if close_value is None or highest_high == lowest_low:
            continue
        output[idx] = -100.0 * ((highest_high - close_value) / (highest_high - lowest_low))
    return output


def _ema(values: list[float | None], period: int) -> list[float | None]:
    output: list[float | None] = [None] * len(values)
    valid_values = [value for value in values[:period] if value is not None]
    if len(valid_values) < period:
        return output
    multiplier = 2.0 / (period + 1.0)
    seed = sum(valid_values) / period
    output[period - 1] = seed
    previous = seed
    for idx in range(period, len(values)):
        current = values[idx]
        if current is None:
            output[idx] = None
            continue
        previous = ((current - previous) * multiplier) + previous
        output[idx] = previous
    return output


def _compute_macd_series(closes: list[float | None], fast_period: int, slow_period: int, signal_period: int, component: str) -> list[float | None]:
    fast = _ema(closes, fast_period)
    slow = _ema(closes, slow_period)
    macd_line: list[float | None] = []
    for fast_value, slow_value in zip(fast, slow, strict=False):
        if fast_value is None or slow_value is None:
            macd_line.append(None)
        else:
            macd_line.append(fast_value - slow_value)
    signal_line = _ema(macd_line, signal_period)
    histogram: list[float | None] = []
    for macd_value, signal_value in zip(macd_line, signal_line, strict=False):
        if macd_value is None or signal_value is None:
            histogram.append(None)
        else:
            histogram.append(macd_value - signal_value)

    if component == "signal":
        return signal_line
    if component == "histogram":
        return histogram
    return macd_line


def _compute_indicator_series(indicator: IndicatorConfig, bars: list[BarPoint]) -> list[float | None]:
    closes = [bar.close_price for bar in bars]
    highs = [bar.high_price for bar in bars]
    lows = [bar.low_price for bar in bars]
    params = indicator.indicator_params
    if indicator.indicator_type == "rsi":
        return _compute_rsi_series(closes, int(params.get("period", 14)))
    if indicator.indicator_type == "willr":
        return _compute_willr_series(highs, lows, closes, int(params.get("period", 14)))
    if indicator.indicator_type == "macd":
        return _compute_macd_series(
            closes,
            int(params.get("fast_period", 12)),
            int(params.get("slow_period", 26)),
            int(params.get("signal_period", 9)),
            str(params.get("component", "line")),
        )
    raise ValueError(f"Unsupported indicator_type '{indicator.indicator_type}'.")


def load_indicator_registry(path: Path) -> IndicatorRegistry:
    payload = yaml.safe_load(path.read_text(encoding="utf-8"))
    config_version = str(payload.get("config_version", "unknown"))
    capital_variants = payload.get("capital_variants", {})
    indicators: dict[str, IndicatorConfig] = {}

    for raw_indicator in payload.get("indicators", []):
        bands = [
            ThresholdBand(
                key=str(raw_band["key"]),
                label=str(raw_band["label"]),
                range_label=str(raw_band["range_label"]),
                interpretation=str(raw_band["interpretation"]),
                lower_bound=_safe_float(raw_band.get("lower_bound")),
                upper_bound=_safe_float(raw_band.get("upper_bound")),
                tone=str(raw_band.get("tone", "white")),
            )
            for raw_band in raw_indicator.get("threshold_bands", [])
        ]

        scenarios: list[ExpandedScenario] = []
        for template in raw_indicator.get("scenario_templates", []):
            indicator_page_variant = str(template.get("indicator_page_variant", ""))
            for capital_variant_key in template.get("capital_variants", []):
                capital_variant = capital_variants[capital_variant_key]
                scenario_id = (
                    f"{raw_indicator['slug']}_{template['key']}_{raw_indicator['universe']}_{capital_variant['scenario_suffix']}"
                    .replace("-", "_")
                    .lower()
                )
                scenarios.append(
                    ExpandedScenario(
                        scenario_id=scenario_id,
                        indicator_slug=str(raw_indicator["slug"]),
                        scenario_key=str(template["key"]),
                        page_key=str(template["key"]),
                        label=f"{template['label']}{capital_variant.get('label_suffix', '')}",
                        short_description=str(template["short_description"]),
                        universe=str(raw_indicator["universe"]),
                        universe_membership_mode=str(raw_indicator["universe_membership_mode"]),
                        benchmark_label=str(raw_indicator["benchmark_index_label"]),
                        lookback_years=int(raw_indicator["evidence_years"]),
                        entry_rule=str(template["entry_rule"]),
                        exit_rule=str(template["exit_rule"]),
                        capital_model=str(capital_variant["capital_model"]),
                        starting_capital=_safe_float(capital_variant.get("starting_capital")),
                        ticket_size_rule=str(capital_variant["ticket_size_rule"]),
                        max_open_positions=_safe_int(capital_variant.get("max_open_positions")),
                        priority_rule=str(template["priority_rule"]),
                        priority_rule_note=str(template.get("priority_rule_note", "")),
                        transaction_cost_bps=_safe_float(
                            template.get("transaction_cost_bps", payload.get("default_transaction_cost_bps", 0.0))
                        )
                        or 0.0,
                        slippage_bps=_safe_float(
                            template.get("slippage_bps", payload.get("default_slippage_bps", 0.0))
                        )
                        or 0.0,
                        execution_assumption={
                            **payload.get("default_execution_assumptions", {}),
                            "priority_rule": template["priority_rule"],
                            "priority_rule_note": template.get("priority_rule_note", ""),
                            "capital_model": capital_variant["capital_model"],
                            "starting_capital": capital_variant.get("starting_capital"),
                            "ticket_size_rule": capital_variant["ticket_size_rule"],
                            "max_open_positions": capital_variant.get("max_open_positions"),
                            "transaction_cost_bps": template.get(
                                "transaction_cost_bps", payload.get("default_transaction_cost_bps", 0.0)
                            ),
                            "slippage_bps": template.get(
                                "slippage_bps", payload.get("default_slippage_bps", 0.0)
                            ),
                        },
                        entry_config=dict(template.get("entry_config", {})),
                        exit_config=dict(template.get("exit_config", {})),
                        active_flag=bool(template.get("active_flag", True)),
                        include_on_indicator_page=bool(template.get("show_on_indicator_page", False))
                        and capital_variant_key == indicator_page_variant,
                        capital_variant_key=str(capital_variant_key),
                        max_hold_days=int(template.get("max_hold_days", template.get("exit_config", {}).get("max_hold_days", 0))),
                    )
                )

        indicators[str(raw_indicator["slug"])] = IndicatorConfig(
            slug=str(raw_indicator["slug"]),
            indicator_type=str(raw_indicator["indicator_type"]),
            indicator_params=dict(raw_indicator.get("indicator_params", {})),
            validation_range=(
                _safe_float(raw_indicator.get("validation_range", {}).get("min")),
                _safe_float(raw_indicator.get("validation_range", {}).get("max")),
            ),
            display_name=str(raw_indicator["display_name"]),
            short_description=str(raw_indicator["short_description"]),
            one_line_summary=str(raw_indicator["one_line_summary"]),
            formula_text=str(raw_indicator["formula_text"]),
            what_it_is=[str(item) for item in raw_indicator.get("what_it_is", [])],
            how_to_read=[str(item) for item in raw_indicator.get("how_to_read", [])],
            threshold_bands=bands,
            chart_labels={str(key): str(value) for key, value in raw_indicator.get("chart_labels", {}).items()},
            chart_help_text={str(key): str(value) for key, value in raw_indicator.get("chart_help_text", {}).items()},
            glossary_terms=[
                {"term": str(item["term"]), "definition": str(item["definition"])}
                for item in raw_indicator.get("glossary_terms", [])
            ],
            assumptions_text=[str(item) for item in raw_indicator.get("assumptions_text", [])],
            limitations_text=[str(item) for item in raw_indicator.get("limitations_text", [])],
            evidence_years=int(raw_indicator["evidence_years"]),
            warmup_days=int(raw_indicator["warmup_days"]),
            max_forward_days=int(raw_indicator["max_forward_days"]),
            current_value_label=str(raw_indicator["current_value_label"]),
            universe=str(raw_indicator["universe"]),
            universe_display_name=str(raw_indicator["universe_display_name"]),
            universe_membership_mode=str(raw_indicator["universe_membership_mode"]),
            benchmark_index_name=str(raw_indicator["benchmark_index_name"]),
            benchmark_index_label=str(raw_indicator["benchmark_index_label"]),
            scenarios=scenarios,
        )

    return IndicatorRegistry(config_version=config_version, indicators=indicators)


def _fetch_universe_history(conn, indicator: IndicatorConfig, start_date: date, end_date: date) -> pd.DataFrame:
    sql = """
    WITH universe AS (
        SELECT DISTINCT ON (iu.symbol_token)
            UPPER(REGEXP_REPLACE(TRIM(iu.tradingsymbol), '-EQ$', '')) AS symbol,
            iu.tradingsymbol AS display_name
        FROM public.instrument_universe iu
        WHERE iu.exchange = 'NSE'
          AND iu.universe_name = %(universe)s
          AND iu.active_to IS NULL
          AND COALESCE(TRIM(iu.tradingsymbol), '') <> ''
        ORDER BY iu.symbol_token, iu.active_from DESC NULLS LAST
    ),
    sector_map AS (
        SELECT DISTINCT ON (UPPER(TRIM(c.symbol)))
            UPPER(TRIM(c.symbol)) AS symbol,
            COALESCE(
                NULLIF(TRIM(c.sector), ''),
                NULLIF(TRIM(c.industry), ''),
                NULLIF(TRIM(c.basic_industry), ''),
                'OTHER'
            ) AS sector
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
        f.total_traded_qty,
        (COALESCE(f.daily_return, 0)::double precision * 100.0) AS change_pct
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
    return query_df(conn, sql, {"universe": indicator.universe, "start_date": start_date, "end_date": end_date})


def _fetch_benchmark_history(conn, indicator: IndicatorConfig, start_date: date, end_date: date) -> pd.DataFrame:
    sql = """
    SELECT
        trade_date,
        open_price::double precision AS open_price,
        high_price::double precision AS high_price,
        low_price::double precision AS low_price,
        close_price::double precision AS close_price
    FROM (
        SELECT
            trade_date,
            open_price,
            high_price,
            low_price,
            close_price,
            ROW_NUMBER() OVER (
                PARTITION BY trade_date
                ORDER BY CASE
                    WHEN LOWER(index_name) = LOWER(%(benchmark_index_name)s) THEN 0
                    WHEN LOWER(index_name) LIKE LOWER(%(benchmark_index_name)s) || '%%' THEN 1
                    ELSE 99
                END
            ) AS rn
        FROM nse.fact_market_activity_index
        WHERE trade_date >= %(start_date)s
          AND trade_date <= %(end_date)s
    ) ranked
    WHERE rn = 1
    ORDER BY trade_date ASC
    """
    return query_df(
        conn,
        sql,
        {
            "benchmark_index_name": indicator.benchmark_index_name,
            "start_date": start_date,
            "end_date": end_date,
        },
    )


def _build_symbol_histories(indicator: IndicatorConfig, history_df: pd.DataFrame, evidence_start: date) -> tuple[dict[str, list[BarPoint]], list[dict[str, Any]], dict[str, Any]]:
    histories: dict[str, list[BarPoint]] = {}
    indicator_rows: list[dict[str, Any]] = []
    validation_stats = {"invalid_indicator_count": 0, "latest_indicator_null_count": 0, "latest_universe_size": 0}

    if history_df.empty:
        return histories, indicator_rows, validation_stats

    latest_trade_date = _as_date(history_df["trade_date"].max())

    for symbol, group in history_df.groupby("symbol", sort=True):
        bars: list[BarPoint] = []
        for record in group.sort_values("trade_date").to_dict(orient="records"):
            open_price = _safe_float(record.get("open_price"))
            high_price = _safe_float(record.get("high_price"))
            low_price = _safe_float(record.get("low_price"))
            close_price = _safe_float(record.get("close_price"))
            data_quality_flag = "ok" if None not in (open_price, high_price, low_price, close_price) else "missing_ohlc"
            bars.append(
                BarPoint(
                    trade_date=_as_date(record["trade_date"]),
                    symbol=str(record["symbol"]),
                    security_name=str(record.get("security_name") or record["symbol"]),
                    sector=str(record.get("sector") or "OTHER"),
                    open_price=open_price,
                    high_price=high_price,
                    low_price=low_price,
                    close_price=close_price,
                    total_traded_qty=_safe_int(record.get("total_traded_qty")),
                    change_pct=_safe_float(record.get("change_pct")),
                    data_quality_flag=data_quality_flag,
                )
            )

        indicator_values = _compute_indicator_series(indicator, bars)
        filtered_bars: list[BarPoint] = []
        for idx, (bar, indicator_value) in enumerate(zip(bars, indicator_values, strict=False)):
            if idx > 0:
                bar.previous_indicator_value = indicator_values[idx - 1]
            bar.indicator_value = _round_or_none(indicator_value, 4)
            band = _band_for_value(indicator_value, indicator.threshold_bands)
            bar.band_key = band.key if band else None
            bar.band_label = band.label if band else None
            if bar.trade_date < evidence_start:
                continue
            filtered_bars.append(bar)
            indicator_rows.append(
                {
                    "indicator_slug": indicator.slug,
                    "universe": indicator.universe,
                    "trade_date": bar.trade_date,
                    "symbol": bar.symbol,
                    "security_name": bar.security_name,
                    "sector": bar.sector,
                    "open_price": _round_or_none(bar.open_price, 4),
                    "high_price": _round_or_none(bar.high_price, 4),
                    "low_price": _round_or_none(bar.low_price, 4),
                    "close_price": _round_or_none(bar.close_price, 4),
                    "total_traded_qty": bar.total_traded_qty,
                    "indicator_value": bar.indicator_value,
                    "signal_rank_value": bar.indicator_value,
                    "band_key": bar.band_key,
                    "band_label": bar.band_label,
                    "data_quality_flag": bar.data_quality_flag,
                }
            )
            minimum, maximum = indicator.validation_range
            if indicator_value is not None:
                if minimum is not None and indicator_value < minimum:
                    validation_stats["invalid_indicator_count"] += 1
                if maximum is not None and indicator_value > maximum:
                    validation_stats["invalid_indicator_count"] += 1

        if filtered_bars:
            histories[symbol] = filtered_bars
            latest_bar = filtered_bars[-1]
            if latest_bar.trade_date == latest_trade_date:
                validation_stats["latest_universe_size"] += 1
                if latest_bar.indicator_value is None:
                    validation_stats["latest_indicator_null_count"] += 1

    return histories, indicator_rows, validation_stats


def _build_benchmark_series(indicator: IndicatorConfig, benchmark_df: pd.DataFrame, evidence_start: date) -> list[dict[str, Any]]:
    if benchmark_df.empty:
        return []
    bars = [
        BarPoint(
            trade_date=_as_date(record["trade_date"]),
            symbol=indicator.benchmark_index_label,
            security_name=indicator.benchmark_index_label,
            sector=indicator.benchmark_index_label,
            open_price=_safe_float(record.get("open_price")),
            high_price=_safe_float(record.get("high_price")),
            low_price=_safe_float(record.get("low_price")),
            close_price=_safe_float(record.get("close_price")),
            total_traded_qty=None,
            change_pct=None,
            data_quality_flag="ok",
        )
        for record in benchmark_df.to_dict(orient="records")
    ]
    indicator_values = _compute_indicator_series(indicator, bars)
    points: list[dict[str, Any]] = []
    for bar, indicator_value in zip(bars, indicator_values, strict=False):
        if bar.trade_date < evidence_start or bar.close_price is None:
            continue
        points.append(
            {
                "date": bar.trade_date.isoformat(),
                "price": round(bar.close_price, 2),
                "indicatorValue": _round_or_none(indicator_value, 2),
            }
        )
    return points


def _build_current_status(indicator: IndicatorConfig, latest_rows: list[BarPoint], snapshot_generated_at: str) -> dict[str, Any]:
    current_values = [row.indicator_value for row in latest_rows if row.indicator_value is not None]
    average_value = _average([value for value in current_values if value is not None]) or 0.0
    band_counts: list[dict[str, Any]] = []
    for band in indicator.threshold_bands:
        count = sum(1 for row in latest_rows if row.band_key == band.key)
        band_counts.append(
            {
                "key": band.key,
                "label": band.label,
                "tone": band.tone,
                "count": count,
                "sharePct": round((count / len(latest_rows)) * 100.0, 2) if latest_rows else 0.0,
            }
        )

    sector_map: dict[str, list[float]] = {}
    for row in latest_rows:
        if row.indicator_value is None:
            continue
        sector_map.setdefault(row.sector, []).append(row.indicator_value)

    sector_snapshots = [
        {
            "sector": sector,
            "avgValue": round(_average(values) or 0.0, 2),
            "count": len(values),
        }
        for sector, values in sector_map.items()
    ]
    sector_snapshots.sort(key=lambda item: item["avgValue"], reverse=True)
    strongest = sorted(
        [row for row in latest_rows if row.indicator_value is not None],
        key=lambda row: row.indicator_value or float("-inf"),
        reverse=True,
    )[:5]
    weakest = sorted(
        [row for row in latest_rows if row.indicator_value is not None],
        key=lambda row: row.indicator_value or float("inf"),
    )[:5]
    reversals = sorted(
        [
            row
            for row in latest_rows
            if row.indicator_value is not None
            and row.previous_indicator_value is not None
            and (row.indicator_value - row.previous_indicator_value) > 0
        ],
        key=lambda row: ((row.indicator_value or 0.0) - (row.previous_indicator_value or 0.0), -(row.indicator_value or 0.0), row.symbol),
        reverse=True,
    )[:5]
    dominant_band = sorted(band_counts, key=lambda item: item["count"], reverse=True)[0] if band_counts else None
    oversold_band = indicator.threshold_bands[0] if indicator.threshold_bands else None
    stretched_band = indicator.threshold_bands[-1] if indicator.threshold_bands else None
    oversold_count = next((item["count"] for item in band_counts if item["key"] == oversold_band.key), 0) if oversold_band else 0
    stretched_count = next((item["count"] for item in band_counts if item["key"] == stretched_band.key), 0) if stretched_band else 0
    trade_date = latest_rows[0].trade_date.isoformat() if latest_rows else ""

    return {
        "asOf": snapshot_generated_at,
        "tradeDate": trade_date,
        "isStale": False,
        "lastUpdatedDate": trade_date,
        "narrative": (
            f"{dominant_band['count'] if dominant_band else 0} of {len(latest_rows)} stocks sit in the "
            f"{dominant_band['label'].lower() if dominant_band else 'neutral'} band. "
            f"{oversold_count} are below {oversold_band.range_label if oversold_band else 'the oversold threshold'}, "
            f"{stretched_count} are in {stretched_band.label.lower() if stretched_band else 'the stretched band'}, "
            f"and the universe average is {average_value:.1f}."
        ),
        "metrics": [
            {"label": "Tracked symbols", "value": _format_integer(len(latest_rows)), "helper": "Current tracked universe size.", "tone": "white"},
            {
                "label": indicator.current_value_label,
                "value": _format_number(average_value, 1),
                "helper": "Average live indicator reading across the tracked universe.",
                "tone": (_band_for_value(average_value, indicator.threshold_bands) or ThresholdBand("", "", "", "", None, None, "white")).tone,
            },
            {
                "label": oversold_band.label if oversold_band else "Oversold",
                "value": _format_integer(oversold_count),
                "helper": f"Symbols currently in the {oversold_band.range_label if oversold_band else 'oversold'} band.",
                "tone": oversold_band.tone if oversold_band else "white",
            },
            {
                "label": stretched_band.label if stretched_band else "Stretched",
                "value": _format_integer(stretched_count),
                "helper": f"Symbols currently in the {stretched_band.range_label if stretched_band else 'stretched'} band.",
                "tone": stretched_band.tone if stretched_band else "white",
            },
        ],
        "bandCounts": band_counts,
        "strongestReadings": [
            {"symbol": row.symbol, "name": row.security_name, "sector": row.sector, "currentValue": _round_or_none(row.indicator_value, 2), "changePct": _round_or_none(row.change_pct, 2), "tone": _tone_from_value(row.change_pct)}
            for row in strongest
        ],
        "weakestReadings": [
            {"symbol": row.symbol, "name": row.security_name, "sector": row.sector, "currentValue": _round_or_none(row.indicator_value, 2), "changePct": _round_or_none(row.change_pct, 2), "tone": _tone_from_value(row.change_pct)}
            for row in weakest
        ],
        "oversoldNames": [
            {"symbol": row.symbol, "name": row.security_name, "sector": row.sector, "currentValue": _round_or_none(row.indicator_value, 2), "changePct": _round_or_none(row.change_pct, 2), "tone": _tone_from_value(row.change_pct)}
            for row in weakest
        ],
        "overboughtNames": [
            {"symbol": row.symbol, "name": row.security_name, "sector": row.sector, "currentValue": _round_or_none(row.indicator_value, 2), "changePct": _round_or_none(row.change_pct, 2), "tone": _tone_from_value(row.change_pct)}
            for row in strongest
        ],
        "strongestReversals": [
            {
                "symbol": row.symbol,
                "name": row.security_name,
                "sector": row.sector,
                "currentValue": _round_or_none(row.indicator_value, 2),
                "changePct": _round_or_none(row.change_pct, 2),
                "delta": _round_or_none((row.indicator_value or 0.0) - (row.previous_indicator_value or 0.0), 2),
                "tone": "green",
            }
            for row in reversals
        ],
        "sectorLeaders": [{**item, "tone": "green"} for item in sector_snapshots[:3]],
        "sectorLaggards": [{**item, "tone": "red"} for item in list(reversed(sector_snapshots[-3:]))],
    }


def _entry_condition(entry_config: dict[str, Any], current_value: float | None, previous_value: float | None) -> bool:
    if current_value is None:
        return False
    entry_type = str(entry_config.get("type", "indicator_below"))
    threshold = _safe_float(entry_config.get("threshold"))
    if threshold is None:
        return False
    if entry_type == "indicator_below":
        return current_value < threshold
    if entry_type == "indicator_above":
        return current_value > threshold
    if entry_type == "cross_above":
        return previous_value is not None and previous_value < threshold <= current_value
    if entry_type == "cross_below":
        return previous_value is not None and previous_value > threshold >= current_value
    raise ValueError(f"Unsupported entry type '{entry_type}'.")


def _exit_condition(exit_config: dict[str, Any], current_value: float | None, previous_value: float | None) -> bool:
    if current_value is None:
        return False
    if "cross_above" in exit_config:
        threshold = _safe_float(exit_config.get("cross_above"))
        return threshold is not None and previous_value is not None and previous_value < threshold <= current_value
    if "cross_below" in exit_config:
        threshold = _safe_float(exit_config.get("cross_below"))
        return threshold is not None and previous_value is not None and previous_value > threshold >= current_value
    if "indicator_above_or_equal" in exit_config:
        threshold = _safe_float(exit_config.get("indicator_above_or_equal"))
        return threshold is not None and current_value >= threshold
    if "indicator_below" in exit_config:
        threshold = _safe_float(exit_config.get("indicator_below"))
        return threshold is not None and current_value < threshold
    if "indicator_below_or_equal" in exit_config:
        threshold = _safe_float(exit_config.get("indicator_below_or_equal"))
        return threshold is not None and current_value <= threshold
    if "indicator_above" in exit_config:
        threshold = _safe_float(exit_config.get("indicator_above"))
        return threshold is not None and current_value > threshold
    return False


def _sort_pending_entries(entries: list[PendingEntry], priority_rule: str) -> list[PendingEntry]:
    if priority_rule == "lowest_indicator_first":
        return sorted(entries, key=lambda item: ((item.priority_value if item.priority_value is not None else float("inf")), item.symbol))
    if priority_rule == "highest_indicator_first":
        return sorted(entries, key=lambda item: ((-(item.priority_value if item.priority_value is not None else float("-inf"))), item.symbol))
    return sorted(entries, key=lambda item: item.symbol)


def _fee_for_notional(notional: float, bps: float) -> float:
    return notional * (bps / 10_000.0)


def _entry_execution_price(raw_open: float, slippage_bps: float) -> float:
    return raw_open * (1.0 + (slippage_bps / 10_000.0))


def _exit_execution_price(raw_price: float, slippage_bps: float) -> float:
    return raw_price * (1.0 - (slippage_bps / 10_000.0))


def _init_position(scenario: ExpandedScenario, candidate: PendingEntry, trade_date: date, trade_index: int, raw_open_price: float) -> OpenPosition:
    entry_price = _entry_execution_price(raw_open_price, scenario.slippage_bps)
    ticket_size = None if scenario.capital_model == "no_capital_limit" else (scenario.starting_capital or 0.0) / 10.0
    shares = 1.0 if scenario.capital_model == "no_capital_limit" else math.floor((ticket_size or 0.0) / entry_price)
    gross_entry_value = entry_price * shares
    entry_fee = _fee_for_notional(gross_entry_value, scenario.transaction_cost_bps)
    target_pct = _safe_float(scenario.exit_config.get("take_profit_pct"))
    target_price = entry_price * (1.0 + (target_pct or 0.0) / 100.0) if target_pct else None
    return OpenPosition(
        symbol=candidate.symbol,
        security_name=candidate.security_name,
        sector=candidate.sector,
        signal_trade_date=candidate.signal_trade_date,
        signal_value=candidate.signal_value,
        priority_value=candidate.priority_value,
        entry_date=trade_date,
        entry_index=trade_index,
        entry_price=entry_price,
        entry_shares=shares,
        gross_entry_value=gross_entry_value,
        entry_fee=entry_fee,
        ticket_size=ticket_size,
        target_price=target_price,
        return_basis_value=gross_entry_value + entry_fee,
        last_close_market_value=gross_entry_value,
        last_indicator_value=candidate.signal_value,
    )


def _close_trade_row(
    scenario: ExpandedScenario,
    position: OpenPosition,
    exit_date: date,
    exit_reason: str,
    raw_exit_price: float,
    holding_days: int,
) -> dict[str, Any]:
    exit_price = _exit_execution_price(raw_exit_price, scenario.slippage_bps)
    gross_exit_value = exit_price * position.entry_shares
    exit_fee = _fee_for_notional(gross_exit_value, scenario.transaction_cost_bps)
    total_fees = position.entry_fee + exit_fee
    invested_basis = position.gross_entry_value + position.entry_fee
    exit_proceeds = gross_exit_value - exit_fee
    net_pnl = exit_proceeds - invested_basis
    net_return_pct = (net_pnl / invested_basis) * 100.0 if invested_basis > 0 else None
    return {
        "scenario_id": scenario.scenario_id,
        "indicator_slug": scenario.indicator_slug,
        "universe": scenario.universe,
        "symbol": position.symbol,
        "security_name": position.security_name,
        "sector": position.sector,
        "signal_trade_date": position.signal_trade_date,
        "signal_value": _round_or_none(position.signal_value, 4),
        "priority_value": _round_or_none(position.priority_value, 4),
        "entry_date": position.entry_date,
        "entry_price": _round_or_none(position.entry_price, 4),
        "entry_shares": _round_or_none(position.entry_shares, 4),
        "gross_entry_value": _round_or_none(position.gross_entry_value, 4),
        "ticket_size": _round_or_none(position.ticket_size, 4),
        "target_price": _round_or_none(position.target_price, 4),
        "exit_signal_date": position.exit_signal_trade_date,
        "exit_date": exit_date,
        "exit_reason": exit_reason,
        "exit_price": _round_or_none(exit_price, 4),
        "gross_exit_value": _round_or_none(gross_exit_value, 4),
        "total_fees": _round_or_none(total_fees, 4),
        "net_pnl": _round_or_none(net_pnl, 4),
        "net_return_pct": _round_or_none(net_return_pct, 4),
        "holding_days": holding_days,
        "trade_status": "closed",
        "execution_notes": position.notes,
        "exit_proceeds": exit_proceeds,
    }


def _open_position_row(position: OpenPosition, scenario: ExpandedScenario, as_of_date: date, current_bar: BarPoint | None, current_index: int) -> dict[str, Any]:
    current_price = current_bar.close_price if current_bar and current_bar.close_price is not None else (position.last_close_market_value / position.entry_shares if position.entry_shares else None)
    market_value = current_price * position.entry_shares if current_price is not None else position.last_close_market_value
    invested_basis = position.gross_entry_value + position.entry_fee
    unrealized_pnl = market_value - invested_basis if market_value is not None else None
    unrealized_return_pct = ((unrealized_pnl / invested_basis) * 100.0) if unrealized_pnl is not None and invested_basis > 0 else None
    days_open = current_index - position.entry_index + 1
    return {
        "scenario_id": scenario.scenario_id,
        "as_of_date": as_of_date,
        "symbol": position.symbol,
        "security_name": position.security_name,
        "sector": position.sector,
        "signal_trade_date": position.signal_trade_date,
        "entry_date": position.entry_date,
        "entry_price": _round_or_none(position.entry_price, 4),
        "current_price": _round_or_none(current_price, 4),
        "current_indicator_value": _round_or_none(current_bar.indicator_value if current_bar else position.last_indicator_value, 4),
        "target_price": _round_or_none(position.target_price, 4),
        "days_open": days_open,
        "entry_shares": _round_or_none(position.entry_shares, 4),
        "allocated_capital": _round_or_none(position.gross_entry_value + position.entry_fee, 4),
        "market_value": _round_or_none(market_value, 4),
        "unrealized_pnl": _round_or_none(unrealized_pnl, 4),
        "unrealized_return_pct": _round_or_none(unrealized_return_pct, 4),
        "priority_value": _round_or_none(position.priority_value, 4),
    }


def _build_signal_chart(
    scenario: ExpandedScenario,
    histories: dict[str, list[BarPoint]],
    closed_trades: list[dict[str, Any]],
    open_positions: list[dict[str, Any]],
) -> dict[str, Any] | None:
    symbol_counts: dict[str, int] = {}
    symbol_names: dict[str, tuple[str, str]] = {}
    for trade in closed_trades:
        symbol_counts[trade["symbol"]] = symbol_counts.get(trade["symbol"], 0) + 1
        symbol_names[trade["symbol"]] = (trade["security_name"], trade["sector"])
    for row in open_positions:
        symbol_counts[row["symbol"]] = symbol_counts.get(row["symbol"], 0) + 1
        symbol_names[row["symbol"]] = (row["security_name"], row["sector"])
    if not symbol_counts:
        return None

    selected_symbol = sorted(symbol_counts.items(), key=lambda item: (-item[1], item[0]))[0][0]
    selected_history = histories.get(selected_symbol, [])
    if not selected_history:
        return None

    entry_markers = [
        {
            "date": trade["entry_date"].isoformat(),
            "price": _round_or_none(trade["entry_price"], 2),
            "indicatorValue": _round_or_none(trade["signal_value"], 2),
            "label": "Entry",
        }
        for trade in closed_trades
        if trade["symbol"] == selected_symbol
    ]
    entry_markers.extend(
        [
            {
                "date": row["entry_date"].isoformat(),
                "price": _round_or_none(row["entry_price"], 2),
                "indicatorValue": _round_or_none(row["current_indicator_value"], 2),
                "label": "Entry",
            }
            for row in open_positions
            if row["symbol"] == selected_symbol
        ]
    )
    exit_markers = [
        {
            "date": trade["exit_date"].isoformat(),
            "price": _round_or_none(trade["exit_price"], 2),
            "indicatorValue": None,
            "label": str(trade["exit_reason"]).replace("_", " "),
        }
        for trade in closed_trades
        if trade["symbol"] == selected_symbol and trade["exit_date"] is not None
    ]
    exit_markers.extend(
        [
            {
                "date": row["as_of_date"].isoformat(),
                "price": _round_or_none(row["current_price"], 2),
                "indicatorValue": _round_or_none(row["current_indicator_value"], 2),
                "label": "Open",
            }
            for row in open_positions
            if row["symbol"] == selected_symbol
        ]
    )

    if not entry_markers and not exit_markers:
        return None

    return {
        "symbol": selected_symbol,
        "name": symbol_names[selected_symbol][0],
        "sector": symbol_names[selected_symbol][1],
        "entryRule": scenario.entry_rule,
        "exitRule": scenario.exit_rule,
        "thresholdLines": {
            "entryThreshold": _safe_float(scenario.entry_config.get("threshold")),
            "exitThresholdAbove": _safe_float(
                scenario.exit_config.get("cross_above")
                if "cross_above" in scenario.exit_config
                else (
                scenario.exit_config.get("indicator_above")
                if "indicator_above" in scenario.exit_config
                else scenario.exit_config.get("indicator_above_or_equal")
                )
            ),
            "exitThresholdBelow": _safe_float(
                scenario.exit_config.get("cross_below")
                if "cross_below" in scenario.exit_config
                else (
                scenario.exit_config.get("indicator_below")
                if "indicator_below" in scenario.exit_config
                else scenario.exit_config.get("indicator_below_or_equal")
                )
            ),
        },
        "points": [
            {
                "date": bar.trade_date.isoformat(),
                "price": _round_or_none(bar.close_price, 2),
                "indicatorValue": _round_or_none(bar.indicator_value, 2),
            }
            for bar in selected_history
            if bar.close_price is not None
        ],
        "entryMarkers": entry_markers,
        "exitMarkers": exit_markers,
    }


def _capital_mode_label(scenario: ExpandedScenario) -> str:
    if scenario.capital_variant_key == "no_capital_limit":
        return "No capital limit"
    if scenario.capital_variant_key == "finite_10l":
        return "10 lakh"
    if scenario.capital_variant_key == "finite_20l":
        return "20 lakh"
    if scenario.capital_variant_key == "finite_50l":
        return "50 lakh"
    return scenario.capital_variant_key.replace("_", " ")


def simulate_strategy(
    scenario: ExpandedScenario,
    histories: dict[str, list[BarPoint]],
    calendar_dates: list[date],
    benchmark_close_by_date: dict[date, float | None],
) -> dict[str, Any]:
    bars_by_symbol_date = {symbol: {bar.trade_date: bar for bar in bars} for symbol, bars in histories.items()}
    pending_entries_by_date: dict[date, list[PendingEntry]] = {}
    open_positions: dict[str, OpenPosition] = {}
    closed_trades: list[dict[str, Any]] = []
    open_position_rows: list[dict[str, Any]] = []
    daily_rows: list[dict[str, Any]] = []

    cash = scenario.starting_capital if scenario.capital_model == "finite_capital_portfolio" else None
    equity_index = 100.0
    peak_equity = 100.0
    previous_total_equity = scenario.starting_capital if scenario.capital_model == "finite_capital_portfolio" else 100.0

    for trade_index, trade_date in enumerate(calendar_dates):
        daily_signal_returns: list[float] = []

        for symbol, position in list(open_positions.items()):
            bar = bars_by_symbol_date[symbol].get(trade_date)
            if position.pending_exit_reason and bar and bar.open_price is not None:
                holding_days = trade_index - position.entry_index + 1
                trade_row = _close_trade_row(scenario, position, trade_date, position.pending_exit_reason, bar.open_price, holding_days)
                if scenario.capital_model == "finite_capital_portfolio":
                    cash = (cash or 0.0) + trade_row["exit_proceeds"]
                else:
                    daily_return = ((trade_row["exit_proceeds"] / position.return_basis_value) - 1.0) * 100.0 if position.return_basis_value > 0 else 0.0
                    daily_signal_returns.append(daily_return)
                closed_trades.append(trade_row)
                del open_positions[symbol]

        for symbol, position in list(open_positions.items()):
            bar = bars_by_symbol_date[symbol].get(trade_date)
            if position.target_price is None or bar is None:
                continue
            if bar.open_price is not None and bar.open_price >= position.target_price:
                holding_days = trade_index - position.entry_index + 1
                trade_row = _close_trade_row(scenario, position, trade_date, "take_profit_gap_open", bar.open_price, holding_days)
                if scenario.capital_model == "finite_capital_portfolio":
                    cash = (cash or 0.0) + trade_row["exit_proceeds"]
                else:
                    daily_return = ((trade_row["exit_proceeds"] / position.return_basis_value) - 1.0) * 100.0 if position.return_basis_value > 0 else 0.0
                    daily_signal_returns.append(daily_return)
                closed_trades.append(trade_row)
                del open_positions[symbol]

        pending_entries = _sort_pending_entries(pending_entries_by_date.pop(trade_date, []), scenario.priority_rule)
        for candidate in pending_entries:
            if candidate.symbol in open_positions:
                continue
            bar = bars_by_symbol_date[candidate.symbol].get(trade_date)
            if bar is None or bar.open_price is None or bar.open_price <= 0:
                continue
            position = _init_position(scenario, candidate, trade_date, trade_index, bar.open_price)
            if position.entry_shares < 1:
                continue
            if scenario.capital_model == "finite_capital_portfolio":
                max_positions = scenario.max_open_positions or 0
                total_outlay = position.gross_entry_value + position.entry_fee
                if len(open_positions) >= max_positions:
                    continue
                if (cash or 0.0) + 1e-9 < total_outlay:
                    continue
                cash = (cash or 0.0) - total_outlay
            open_positions[candidate.symbol] = position

        for symbol, position in list(open_positions.items()):
            bar = bars_by_symbol_date[symbol].get(trade_date)
            if position.target_price is None or bar is None or bar.high_price is None:
                continue
            if bar.high_price >= position.target_price:
                holding_days = trade_index - position.entry_index + 1
                trade_row = _close_trade_row(scenario, position, trade_date, "take_profit_intraday", position.target_price, holding_days)
                if scenario.capital_model == "finite_capital_portfolio":
                    cash = (cash or 0.0) + trade_row["exit_proceeds"]
                else:
                    daily_return = ((trade_row["exit_proceeds"] / position.return_basis_value) - 1.0) * 100.0 if position.return_basis_value > 0 else 0.0
                    daily_signal_returns.append(daily_return)
                closed_trades.append(trade_row)
                del open_positions[symbol]

        market_value = 0.0
        for symbol, position in list(open_positions.items()):
            bar = bars_by_symbol_date[symbol].get(trade_date)
            current_close = bar.close_price if bar and bar.close_price is not None else None
            if current_close is not None:
                current_market_value = current_close * position.entry_shares
                position.last_close_market_value = current_market_value
                position.last_indicator_value = bar.indicator_value
                if scenario.capital_model == "no_capital_limit" and position.return_basis_value > 0:
                    daily_signal_returns.append(((current_market_value / position.return_basis_value) - 1.0) * 100.0)
                    position.return_basis_value = current_market_value
            else:
                current_market_value = position.last_close_market_value
                if scenario.capital_model == "no_capital_limit":
                    daily_signal_returns.append(0.0)
            market_value += current_market_value
            holding_days = trade_index - position.entry_index + 1
            if bar and _exit_condition(scenario.exit_config, bar.indicator_value, bar.previous_indicator_value):
                position.pending_exit_reason = "indicator_exit_open"
                position.pending_exit_signal_date = trade_date
                position.exit_signal_trade_date = trade_date
            elif holding_days >= scenario.max_hold_days:
                position.pending_exit_reason = "max_hold_open"
                position.pending_exit_signal_date = trade_date
                position.exit_signal_trade_date = trade_date

        next_date = calendar_dates[trade_index + 1] if trade_index + 1 < len(calendar_dates) else None
        if next_date is not None:
            next_entries: list[PendingEntry] = []
            for symbol in histories:
                if symbol in open_positions:
                    continue
                bar = bars_by_symbol_date[symbol].get(trade_date)
                if bar is None:
                    continue
                if _entry_condition(scenario.entry_config, bar.indicator_value, bar.previous_indicator_value):
                    next_entries.append(PendingEntry(symbol=symbol, security_name=bar.security_name, sector=bar.sector, signal_trade_date=trade_date, signal_value=bar.indicator_value, priority_value=bar.indicator_value))
            if next_entries:
                pending_entries_by_date.setdefault(next_date, []).extend(next_entries)

        if scenario.capital_model == "finite_capital_portfolio":
            total_equity = (cash or 0.0) + market_value
            daily_return_pct = ((total_equity / previous_total_equity) - 1.0) * 100.0 if previous_total_equity else 0.0
            previous_total_equity = total_equity
            equity_index = ((total_equity / (scenario.starting_capital or 1.0)) * 100.0) if scenario.starting_capital else 100.0
            deployed_capital = market_value
            available_cash = cash
            active_pct = ((deployed_capital / (scenario.starting_capital or 1.0)) * 100.0) if scenario.starting_capital else 0.0
        else:
            mean_signal_return = _average(daily_signal_returns) or 0.0
            equity_index *= 1.0 + (mean_signal_return / 100.0)
            total_equity = equity_index
            daily_return_pct = mean_signal_return
            deployed_capital = None
            available_cash = None
            active_pct = ((len(open_positions) / max(1, len(histories))) * 100.0) if histories else 0.0

        peak_equity = max(peak_equity, total_equity)
        drawdown_pct = ((total_equity / peak_equity) - 1.0) * 100.0 if peak_equity else 0.0
        benchmark_close = benchmark_close_by_date.get(trade_date)
        previous_benchmark = benchmark_close_by_date.get(calendar_dates[trade_index - 1]) if trade_index > 0 else None
        benchmark_return_pct = ((benchmark_close / previous_benchmark) - 1.0) * 100.0 if benchmark_close is not None and previous_benchmark not in (None, 0) else None

        daily_rows.append(
            {
                "scenario_id": scenario.scenario_id,
                "trade_date": trade_date,
                "active_positions": len(open_positions),
                "deployed_capital": _round_or_none(deployed_capital, 4),
                "available_cash": _round_or_none(available_cash, 4),
                "market_value": _round_or_none(market_value, 4),
                "total_equity": _round_or_none(total_equity, 4),
                "equity_index": _round_or_none(equity_index, 4),
                "daily_return_pct": _round_or_none(daily_return_pct, 4),
                "drawdown_pct": _round_or_none(drawdown_pct, 4),
                "benchmark_close": _round_or_none(benchmark_close, 4),
                "benchmark_return_pct": _round_or_none(benchmark_return_pct, 4),
                "active_pct": _round_or_none(active_pct, 4),
            }
        )

    if calendar_dates:
        final_date = calendar_dates[-1]
        final_index = len(calendar_dates) - 1
        for symbol, position in open_positions.items():
            current_bar = bars_by_symbol_date[symbol].get(final_date)
            open_position_rows.append(_open_position_row(position, scenario, final_date, current_bar, final_index))

    trade_returns = [trade["net_return_pct"] for trade in closed_trades if trade["net_return_pct"] is not None]
    holding_days = [trade["holding_days"] for trade in closed_trades if trade["holding_days"] is not None]
    closed_count = len(closed_trades)
    winning_count = sum(1 for trade in closed_trades if (trade["net_return_pct"] or 0.0) > 0)
    total_return_pct = (daily_rows[-1]["equity_index"] - 100.0) if daily_rows else 0.0
    max_drawdown = min((row["drawdown_pct"] or 0.0) for row in daily_rows) if daily_rows else 0.0
    max_holding_days = max(holding_days) if holding_days else None
    realized_pnl = sum((trade["net_pnl"] or 0.0) for trade in closed_trades)
    unrealized_pnl = sum((row["unrealized_pnl"] or 0.0) for row in open_position_rows)
    current_invested_amount = sum((row["allocated_capital"] or 0.0) for row in open_position_rows) if scenario.capital_model == "finite_capital_portfolio" else None
    cash_balance = _round_or_none(cash, 2) if scenario.capital_model == "finite_capital_portfolio" else None
    current_portfolio_value = _round_or_none((daily_rows[-1]["total_equity"] if daily_rows else None), 2)
    active_points = [
        {
            "date": row["trade_date"].isoformat(),
            "activePositions": row["active_positions"],
            "activePct": round((row["active_pct"] or 0.0), 2),
            "deployedCapital": _round_or_none(row["deployed_capital"], 2),
            "totalEquity": _round_or_none(row["total_equity"], 2),
        }
        for row in daily_rows
    ]
    summary = {
        "totalTrades": closed_count + len(open_position_rows),
        "closedTrades": closed_count,
        "winRatePct": _round_or_none((winning_count / closed_count) * 100.0 if closed_count else None, 2),
        "avgReturnPct": _round_or_none(_average([value for value in trade_returns if value is not None]), 2),
        "medianReturnPct": _round_or_none(_median([value for value in trade_returns if value is not None]), 2),
        "totalReturnPct": _round_or_none(total_return_pct, 2),
        "maxDrawdownPct": _round_or_none(max_drawdown, 2),
        "avgHoldingDays": _round_or_none(_average([float(value) for value in holding_days if value is not None]), 2),
        "maxHoldingDays": max_holding_days,
        "currentPortfolioValue": current_portfolio_value,
        "currentInvestedAmount": _round_or_none(current_invested_amount, 2),
        "cashBalance": cash_balance,
        "realizedPnl": _round_or_none(realized_pnl, 2),
        "unrealizedPnl": _round_or_none(unrealized_pnl, 2),
        "openPositionsCount": len(open_position_rows),
        "valueMode": "currency" if scenario.capital_model == "finite_capital_portfolio" else "index",
    }
    open_symbols = [row["symbol"] for row in open_position_rows]
    scenario_payload = {
        "scenarioId": scenario.scenario_id,
        "key": scenario.page_key,
        "label": scenario.label,
        "capitalModeKey": scenario.capital_variant_key,
        "capitalModeLabel": _capital_mode_label(scenario),
        "shortDescription": scenario.short_description,
        "entryRule": scenario.entry_rule,
        "exitRule": scenario.exit_rule,
        "maxHoldDays": scenario.max_hold_days,
        "capitalModel": scenario.capital_model,
        "startingCapital": _round_or_none(scenario.starting_capital, 2),
        "ticketSizeRule": scenario.ticket_size_rule,
        "maxOpenPositions": scenario.max_open_positions,
        "priorityRule": scenario.priority_rule,
        "priorityRuleNote": scenario.priority_rule_note,
        "transactionCostBps": scenario.transaction_cost_bps,
        "slippageBps": scenario.slippage_bps,
        "executionAssumptions": scenario.execution_assumption,
        "isStale": False,
        "tradeCount": closed_count + len(open_position_rows),
        "summary": summary,
        "summaryMetrics": [
            {"label": "Total trades", "value": _format_integer(summary["totalTrades"]), "helper": "Closed plus still-open trades in the evidence window.", "tone": "white"},
            {"label": "Win rate", "value": _format_pct((winning_count / closed_count) * 100.0 if closed_count else None, 1), "helper": "Share of closed trades with a positive net return.", "tone": "green" if closed_count and (winning_count / closed_count) >= 0.5 else "red"},
            {"label": "Avg trade", "value": _format_signed_pct(_average([value for value in trade_returns if value is not None]), 2), "helper": "Average net return per closed trade.", "tone": _tone_from_value(_average([value for value in trade_returns if value is not None]))},
            {"label": "Median trade", "value": _format_signed_pct(_median([value for value in trade_returns if value is not None]), 2), "helper": "Middle closed-trade outcome after sorting net returns.", "tone": _tone_from_value(_median([value for value in trade_returns if value is not None]))},
            {"label": "Total return", "value": _format_signed_pct(total_return_pct, 2), "helper": "Net equity change across the full evidence window.", "tone": _tone_from_value(total_return_pct)},
            {"label": "Max drawdown", "value": _format_pct(abs(max_drawdown) if max_drawdown is not None else None, 2), "helper": "Worst peak-to-trough drawdown on the scenario equity curve.", "tone": _tone_from_value(max_drawdown)},
            {"label": "Avg hold", "value": _format_days(_average([float(value) for value in holding_days if value is not None])), "helper": "Average holding period for closed trades.", "tone": "white"},
            {"label": "Max hold", "value": _format_days(float(max_holding_days) if max_holding_days is not None else None), "helper": "Longest closed trade in the evidence window.", "tone": "white"},
            {"label": "Current portfolio", "value": _format_currency(current_portfolio_value) if scenario.capital_model == "finite_capital_portfolio" else _format_number(current_portfolio_value, 2), "helper": "Latest portfolio value from the selected precomputed scenario.", "tone": _tone_from_value(total_return_pct)},
            {"label": "Invested now", "value": _format_currency(current_invested_amount) if scenario.capital_model == "finite_capital_portfolio" else "Normalized", "helper": "Capital currently allocated to open positions.", "tone": "white"},
            {"label": "Cash balance", "value": _format_currency(cash_balance) if scenario.capital_model == "finite_capital_portfolio" else "Not capped", "helper": "Available cash remaining after current open positions.", "tone": "white"},
            {"label": "Realized P/L", "value": _format_currency(realized_pnl) if scenario.capital_model == "finite_capital_portfolio" else _format_signed_pct(_average([value for value in trade_returns if value is not None]), 2), "helper": "Booked P/L from closed trades.", "tone": _tone_from_value(realized_pnl)},
            {"label": "Unrealized P/L", "value": _format_currency(unrealized_pnl) if scenario.capital_model == "finite_capital_portfolio" else "Open only", "helper": "Mark-to-market P/L on currently open positions.", "tone": _tone_from_value(unrealized_pnl)},
            {"label": "Open positions", "value": _format_integer(len(open_position_rows)), "helper": "Positions still active as of the latest market date.", "tone": "white"},
        ],
        "equityCurve": [
            {
                "date": row["trade_date"].isoformat(),
                "equityIndex": round(row["equity_index"] or 0.0, 2),
                "strategyValue": _round_or_none(row["total_equity"], 2),
                "benchmarkIndex": _round_or_none(
                    (
                        ((row["benchmark_close"] or 0.0) / (daily_rows[0]["benchmark_close"] or 1.0)) * 100.0
                        if daily_rows and daily_rows[0]["benchmark_close"] not in (None, 0)
                        else None
                    ),
                    2,
                ),
            }
            for row in daily_rows
        ],
        "drawdownSeries": [{"date": row["trade_date"].isoformat(), "drawdownPct": round(row["drawdown_pct"] or 0.0, 2)} for row in daily_rows],
        "tradeReturnDistribution": _distribution([value for value in trade_returns if value is not None], RETURN_DISTRIBUTION_BUCKETS),
        "holdingDurationDistribution": _distribution([float(value) for value in holding_days if value is not None], HOLDING_DURATION_BUCKETS),
        "capitalDeployment": active_points,
        "currentStatus": {
            "asOfDate": calendar_dates[-1].isoformat() if calendar_dates else "",
            "currentPortfolioValue": current_portfolio_value,
            "currentInvestedAmount": _round_or_none(current_invested_amount, 2),
            "cashBalance": cash_balance,
            "realizedPnl": _round_or_none(realized_pnl, 2),
            "unrealizedPnl": _round_or_none(unrealized_pnl, 2),
            "openPositionsCount": len(open_position_rows),
            "activeSymbols": open_symbols,
            "averageDaysInTrade": _round_or_none(_average([float(row["days_open"]) for row in open_position_rows]), 2),
            "maxDaysInTrade": max([row["days_open"] for row in open_position_rows], default=None),
        },
        "perStockSummary": [],
        "currentOpenPositions": [],
        "tradeLog": [],
        "signalChart": None,
    }

    stock_summary_rows: list[dict[str, Any]] = []
    symbol_groups: dict[str, dict[str, Any]] = {}
    for trade in closed_trades:
        symbol_group = symbol_groups.setdefault(
            trade["symbol"],
            {
                "security_name": trade["security_name"],
                "sector": trade["sector"],
                "returns": [],
                "holding_days": [],
                "closed_trade_count": 0,
                "open_trade_count": 0,
                "last_entry_date": None,
                "last_exit_date": None,
                "max_gain": None,
                "max_loss": None,
                "total_invested": 0.0,
                "realized_pnl": 0.0,
                "unrealized_pnl": 0.0,
                "current_value": 0.0,
                "open_position_flag": False,
                "last_signal_date": None,
            },
        )
        symbol_group["returns"].append(trade["net_return_pct"])
        symbol_group["holding_days"].append(trade["holding_days"])
        symbol_group["closed_trade_count"] += 1
        symbol_group["last_entry_date"] = trade["entry_date"]
        symbol_group["last_exit_date"] = trade["exit_date"]
        symbol_group["max_gain"] = max(symbol_group["max_gain"], trade["net_return_pct"]) if symbol_group["max_gain"] is not None else trade["net_return_pct"]
        symbol_group["max_loss"] = min(symbol_group["max_loss"], trade["net_return_pct"]) if symbol_group["max_loss"] is not None else trade["net_return_pct"]
        symbol_group["total_invested"] += trade["gross_entry_value"] or 0.0
        symbol_group["realized_pnl"] += trade["net_pnl"] or 0.0
        symbol_group["last_signal_date"] = max(symbol_group["last_signal_date"], trade["signal_trade_date"]) if symbol_group["last_signal_date"] else trade["signal_trade_date"]

    for open_position in open_position_rows:
        symbol_group = symbol_groups.setdefault(
            open_position["symbol"],
            {
                "security_name": open_position["security_name"],
                "sector": open_position["sector"],
                "returns": [],
                "holding_days": [],
                "closed_trade_count": 0,
                "open_trade_count": 0,
                "last_entry_date": None,
                "last_exit_date": None,
                "max_gain": None,
                "max_loss": None,
                "total_invested": 0.0,
                "realized_pnl": 0.0,
                "unrealized_pnl": 0.0,
                "current_value": 0.0,
                "open_position_flag": False,
                "last_signal_date": None,
            },
        )
        symbol_group["open_trade_count"] += 1
        symbol_group["last_entry_date"] = open_position["entry_date"]
        symbol_group["total_invested"] += open_position["allocated_capital"] or 0.0
        symbol_group["unrealized_pnl"] += open_position["unrealized_pnl"] or 0.0
        symbol_group["current_value"] += open_position["market_value"] or 0.0
        symbol_group["open_position_flag"] = True
        symbol_group["last_signal_date"] = max(symbol_group["last_signal_date"], open_position["signal_trade_date"]) if symbol_group["last_signal_date"] else open_position["signal_trade_date"]

    for symbol, details in symbol_groups.items():
        returns = [value for value in details["returns"] if value is not None]
        holds = [float(value) for value in details["holding_days"] if value is not None]
        stock_summary_rows.append(
            {
                "scenario_id": scenario.scenario_id,
                "symbol": symbol,
                "security_name": details["security_name"],
                "sector": details["sector"],
                "trade_count": details["closed_trade_count"] + details["open_trade_count"],
                "closed_trade_count": details["closed_trade_count"],
                "open_trade_count": details["open_trade_count"],
                "win_rate_pct": _round_or_none((sum(1 for value in returns if value > 0) / len(returns)) * 100.0 if returns else None, 4),
                "avg_return_pct": _round_or_none(_average(returns), 4),
                "median_return_pct": _round_or_none(_median(returns), 4),
                "max_gain_pct": _round_or_none(details["max_gain"], 4),
                "max_loss_pct": _round_or_none(details["max_loss"], 4),
                "total_invested": _round_or_none(details["total_invested"], 4),
                "current_value": _round_or_none(details["current_value"], 4),
                "realized_pnl": _round_or_none(details["realized_pnl"], 4),
                "unrealized_pnl": _round_or_none(details["unrealized_pnl"], 4),
                "total_net_pnl": _round_or_none(details["realized_pnl"] + details["unrealized_pnl"], 4),
                "avg_holding_days": _round_or_none(_average(holds), 4),
                "max_holding_days": _round_or_none(max(holds) if holds else None, 4),
                "last_entry_date": details["last_entry_date"],
                "last_exit_date": details["last_exit_date"],
                "last_signal_date": details["last_signal_date"],
                "open_position_flag": details["open_position_flag"],
                "current_status": "open" if details["open_trade_count"] else "closed",
            }
        )

    scenario_payload["perStockSummary"] = [
        {
            "symbol": row["symbol"],
            "name": row["security_name"],
            "sector": row["sector"],
            "tradeCount": row["trade_count"],
            "closedTradeCount": row["closed_trade_count"],
            "openTradeCount": row["open_trade_count"],
            "winRatePct": _round_or_none(row["win_rate_pct"], 2),
            "avgReturnPct": _round_or_none(row["avg_return_pct"], 2),
            "medianReturnPct": _round_or_none(row["median_return_pct"], 2),
            "maxGainPct": _round_or_none(row["max_gain_pct"], 2),
            "maxLossPct": _round_or_none(row["max_loss_pct"], 2),
            "avgHoldingDays": _round_or_none(row["avg_holding_days"], 2),
            "maxHoldingDays": _round_or_none(row["max_holding_days"], 2),
            "totalInvested": _round_or_none(row["total_invested"], 2),
            "currentValue": _round_or_none(row["current_value"], 2),
            "realizedPnl": _round_or_none(row["realized_pnl"], 2),
            "unrealizedPnl": _round_or_none(row["unrealized_pnl"], 2),
            "totalNetPnl": _round_or_none(row["total_net_pnl"], 2),
            "openPositionFlag": bool(row["open_position_flag"]),
            "lastSignalDate": row["last_signal_date"].isoformat() if row["last_signal_date"] else None,
            "currentStatus": row["current_status"],
        }
        for row in sorted(stock_summary_rows, key=lambda item: (-item["trade_count"], item["symbol"]))
    ]
    scenario_payload["currentOpenPositions"] = [
        {
            "symbol": row["symbol"],
            "name": row["security_name"],
            "sector": row["sector"],
            "signalTradeDate": row["signal_trade_date"].isoformat(),
            "entryDate": row["entry_date"].isoformat(),
            "asOfDate": row["as_of_date"].isoformat(),
            "entryPrice": _round_or_none(row["entry_price"], 2),
            "currentPrice": _round_or_none(row["current_price"], 2),
            "currentIndicatorValue": _round_or_none(row["current_indicator_value"], 2),
            "targetPrice": _round_or_none(row["target_price"], 2),
            "daysOpen": row["days_open"],
            "entryShares": _round_or_none(row["entry_shares"], 2),
            "allocatedCapital": _round_or_none(row["allocated_capital"], 2),
            "marketValue": _round_or_none(row["market_value"], 2),
            "unrealizedPnl": _round_or_none(row["unrealized_pnl"], 2),
            "unrealizedReturnPct": _round_or_none(row["unrealized_return_pct"], 2),
        }
        for row in sorted(open_position_rows, key=lambda item: (-(item["unrealized_return_pct"] or float("-inf")), item["symbol"]))
    ]
    scenario_payload["signalChart"] = _build_signal_chart(scenario, histories, closed_trades, open_position_rows)
    scenario_payload["tradeLog"] = [
        {
            "symbol": trade["symbol"],
            "name": trade["security_name"],
            "sector": trade["sector"],
            "signalTradeDate": trade["signal_trade_date"].isoformat(),
            "signalValue": _round_or_none(trade["signal_value"], 2),
            "entryDate": trade["entry_date"].isoformat(),
            "entryPrice": _round_or_none(trade["entry_price"], 2),
            "exitDate": trade["exit_date"].isoformat() if trade["exit_date"] else None,
            "exitPrice": _round_or_none(trade["exit_price"], 2),
            "exitReason": trade["exit_reason"],
            "holdingDays": trade["holding_days"],
            "netReturnPct": _round_or_none(trade["net_return_pct"], 2),
            "netPnl": _round_or_none(trade["net_pnl"], 2),
        }
        for trade in sorted(closed_trades, key=lambda item: (item["entry_date"], item["symbol"]))
    ]

    return {"scenario": scenario, "closed_trades": closed_trades, "open_positions": open_position_rows, "daily_rows": daily_rows, "stock_summary_rows": stock_summary_rows, "payload": scenario_payload}


def _build_heatmap_cells(indicator: IndicatorConfig, histories: dict[str, list[BarPoint]], evidence_end: date) -> list[dict[str, Any]]:
    buckets: dict[tuple[str, int], list[float]] = {}
    for bars in histories.values():
        for idx, bar in enumerate(bars):
            if bar.indicator_value is None or bar.close_price is None or bar.trade_date > evidence_end:
                continue
            band = _band_for_value(bar.indicator_value, indicator.threshold_bands)
            if band is None:
                continue
            for horizon in EVIDENCE_HORIZONS:
                target_idx = idx + horizon
                if target_idx >= len(bars):
                    continue
                target_bar = bars[target_idx]
                if target_bar.trade_date > evidence_end or target_bar.close_price is None:
                    continue
                forward_return = ((target_bar.close_price / bar.close_price) - 1.0) * 100.0
                buckets.setdefault((band.key, horizon), []).append(forward_return)

    cells: list[dict[str, Any]] = []
    for band in indicator.threshold_bands:
        for horizon in EVIDENCE_HORIZONS:
            values = buckets.get((band.key, horizon), [])
            hit_rate = (sum(1 for value in values if value > 0) / len(values)) * 100.0 if values else None
            cells.append({"bandKey": band.key, "bandLabel": band.label, "horizonDays": horizon, "avgReturnPct": _round_or_none(_average(values), 2), "medianReturnPct": _round_or_none(_median(values), 2), "hitRatePct": _round_or_none(hit_rate, 2), "sampleSize": len(values)})
    return cells


def _build_stock_results(indicator: IndicatorConfig, histories: dict[str, list[BarPoint]], latest_rows: list[BarPoint], evidence_end: date) -> list[dict[str, Any]]:
    latest_map = {row.symbol: row for row in latest_rows}
    stock_results: list[dict[str, Any]] = []
    for symbol, bars in histories.items():
        latest_bar = latest_map.get(symbol) or (bars[-1] if bars else None)
        if latest_bar is None or latest_bar.indicator_value is None:
            continue
        band = _band_for_value(latest_bar.indicator_value, indicator.threshold_bands)
        historical_values: list[float] = []
        same_band_forward_20: list[float] = []
        for idx, bar in enumerate(bars):
            if bar.indicator_value is None or bar.close_price is None or bar.trade_date > evidence_end:
                continue
            historical_values.append(bar.indicator_value)
            observed_band = _band_for_value(bar.indicator_value, indicator.threshold_bands)
            target_idx = idx + 20
            if observed_band and observed_band.key == (band.key if band else None) and target_idx < len(bars):
                target_bar = bars[target_idx]
                if target_bar.trade_date <= evidence_end and target_bar.close_price is not None:
                    same_band_forward_20.append(((target_bar.close_price / bar.close_price) - 1.0) * 100.0)
        stock_results.append(
            {
                "symbol": symbol,
                "name": latest_bar.security_name,
                "sector": latest_bar.sector,
                "last": _round_or_none(latest_bar.close_price, 2),
                "changePct": _round_or_none(latest_bar.change_pct, 2),
                "currentValue": _round_or_none(latest_bar.indicator_value, 2),
                "bandLabel": band.label if band else "Unclassified",
                "percentile3y": _round_or_none(_percentile_rank(latest_bar.indicator_value, historical_values), 1),
                "sampleSize3y": len(historical_values),
                "avgForwardReturn20dSameBand": _round_or_none(_average(same_band_forward_20), 2),
                "hitRate20dSameBand": _round_or_none((sum(1 for value in same_band_forward_20 if value > 0) / len(same_band_forward_20)) * 100.0 if same_band_forward_20 else None, 1),
            }
        )
    return sorted(stock_results, key=lambda item: (-(item["currentValue"] or float("-inf")), item["symbol"]))


def _build_indicator_payload(
    indicator: IndicatorConfig,
    registry: IndicatorRegistry,
    histories: dict[str, list[BarPoint]],
    latest_rows: list[BarPoint],
    benchmark_points: list[dict[str, Any]],
    scenario_results: list[dict[str, Any]],
    data_as_of_date: date,
    snapshot_generated_at: str,
) -> dict[str, Any]:
    evidence_start = data_as_of_date - timedelta(days=(indicator.evidence_years * 365) - 1)
    current_status = _build_current_status(indicator, latest_rows, snapshot_generated_at)
    heatmap_cells = _build_heatmap_cells(indicator, histories, data_as_of_date)
    stock_results = _build_stock_results(indicator, histories, latest_rows, data_as_of_date)
    family_map: dict[str, dict[str, Any]] = {}
    for result in scenario_results:
        scenario = result["scenario"]
        if not scenario.include_on_indicator_page:
            continue
        family = family_map.setdefault(
            scenario.page_key,
            {
                "key": scenario.page_key,
                "label": scenario.label.split(" - ")[0],
                "shortDescription": scenario.short_description,
                "entryRule": scenario.entry_rule,
                "exitRule": scenario.exit_rule,
                "capitalModes": [],
            },
        )
        family["capitalModes"].append(
            {
                "key": scenario.capital_variant_key,
                "label": _capital_mode_label(scenario),
                "scenarioId": scenario.scenario_id,
                "capitalModel": scenario.capital_model,
                "startingCapital": _round_or_none(scenario.starting_capital, 2),
                "isDefault": scenario.capital_variant_key == "no_capital_limit",
            }
        )
    scenario_families = list(family_map.values())
    default_family = scenario_families[0] if scenario_families else None
    default_capital = next((mode for mode in (default_family or {}).get("capitalModes", []) if mode["isDefault"]), None)
    return {
        "slug": indicator.slug,
        "displayName": indicator.display_name,
        "shortDescription": indicator.short_description,
        "oneLineSummary": indicator.one_line_summary,
        "formulaText": indicator.formula_text,
        "whatItIs": indicator.what_it_is,
        "howToRead": indicator.how_to_read,
        "thresholdBands": [{"key": band.key, "label": band.label, "rangeLabel": band.range_label, "interpretation": band.interpretation, "lowerBound": band.lower_bound, "upperBound": band.upper_bound, "tone": band.tone} for band in indicator.threshold_bands],
        "chartLabels": {"priceAxis": indicator.chart_labels["price_axis"], "indicatorAxis": indicator.chart_labels["indicator_axis"], "heatmapLegend": indicator.chart_labels["heatmap_legend"], "equityAxis": indicator.chart_labels["equity_axis"], "drawdownAxis": indicator.chart_labels["drawdown_axis"], "capitalAxis": indicator.chart_labels["capital_axis"], "returnAxis": indicator.chart_labels["return_axis"], "holdingAxis": indicator.chart_labels["holding_axis"]},
        "chartHelpText": {"priceIndicatorSignalChart": indicator.chart_help_text["price_indicator_signal_chart"], "forwardReturnHeatmap": indicator.chart_help_text["forward_return_heatmap"], "equityCurveChart": indicator.chart_help_text["equity_curve_chart"], "drawdownChart": indicator.chart_help_text["drawdown_chart"], "tradeReturnDistribution": indicator.chart_help_text["trade_return_distribution"], "holdingDurationChart": indicator.chart_help_text["holding_duration_chart"], "capitalDeploymentChart": indicator.chart_help_text["capital_deployment_chart"]},
        "glossaryTerms": indicator.glossary_terms,
        "availableIndicators": registry.available_indicators,
        "freshness": {"snapshotGeneratedAt": snapshot_generated_at, "lastMarketDate": data_as_of_date.isoformat(), "currentStatusDate": data_as_of_date.isoformat(), "evidenceStartDate": evidence_start.isoformat(), "evidenceEndDate": data_as_of_date.isoformat(), "evidenceRangeLabel": f"{evidence_start.isoformat()} to {data_as_of_date.isoformat()}"},
        "currentStatus": current_status,
        "evidence": {"isStale": False, "sampleSize": sum(cell["sampleSize"] for cell in heatmap_cells), "priceSeries": benchmark_points, "heatmapCells": heatmap_cells},
        "strategyEvaluator": {
            "defaultScenarioKey": default_family["key"] if default_family else "",
            "defaultCapitalModeKey": default_capital["key"] if default_capital else "",
            "scenarioFamilies": scenario_families,
        },
        "assumptions": indicator.assumptions_text,
        "limitations": indicator.limitations_text,
        "stockResults": stock_results,
    }


def _upsert_scenario_catalog(conn, indicator: IndicatorConfig) -> None:
    with conn.cursor() as cur:
        for scenario in indicator.scenarios:
            cur.execute(
                """
                INSERT INTO nse_app.strategy_scenario_catalog (
                    scenario_id,
                    indicator_slug,
                    scenario_key,
                    scenario_label,
                    short_description,
                    universe,
                    universe_membership_mode,
                    benchmark_symbol,
                    benchmark_label,
                    lookback_years,
                    entry_rule,
                    exit_rule,
                    capital_model,
                    starting_capital,
                    ticket_size_rule,
                    max_open_positions,
                    priority_rule,
                    priority_rule_note,
                    transaction_cost_bps,
                    slippage_bps,
                    execution_assumption,
                    scenario_metadata,
                    include_on_indicator_page,
                    active_flag,
                    updated_at
                )
                VALUES (
                    %(scenario_id)s, %(indicator_slug)s, %(scenario_key)s, %(scenario_label)s, %(short_description)s,
                    %(universe)s, %(universe_membership_mode)s, %(benchmark_symbol)s, %(benchmark_label)s, %(lookback_years)s,
                    %(entry_rule)s, %(exit_rule)s, %(capital_model)s, %(starting_capital)s, %(ticket_size_rule)s,
                    %(max_open_positions)s, %(priority_rule)s, %(priority_rule_note)s, %(transaction_cost_bps)s, %(slippage_bps)s,
                    %(execution_assumption)s::jsonb, %(scenario_metadata)s::jsonb, %(include_on_indicator_page)s, %(active_flag)s, NOW()
                )
                ON CONFLICT (scenario_id)
                DO UPDATE SET
                    indicator_slug = EXCLUDED.indicator_slug,
                    scenario_key = EXCLUDED.scenario_key,
                    scenario_label = EXCLUDED.scenario_label,
                    short_description = EXCLUDED.short_description,
                    universe = EXCLUDED.universe,
                    universe_membership_mode = EXCLUDED.universe_membership_mode,
                    benchmark_symbol = EXCLUDED.benchmark_symbol,
                    benchmark_label = EXCLUDED.benchmark_label,
                    lookback_years = EXCLUDED.lookback_years,
                    entry_rule = EXCLUDED.entry_rule,
                    exit_rule = EXCLUDED.exit_rule,
                    capital_model = EXCLUDED.capital_model,
                    starting_capital = EXCLUDED.starting_capital,
                    ticket_size_rule = EXCLUDED.ticket_size_rule,
                    max_open_positions = EXCLUDED.max_open_positions,
                    priority_rule = EXCLUDED.priority_rule,
                    priority_rule_note = EXCLUDED.priority_rule_note,
                    transaction_cost_bps = EXCLUDED.transaction_cost_bps,
                    slippage_bps = EXCLUDED.slippage_bps,
                    execution_assumption = EXCLUDED.execution_assumption,
                    scenario_metadata = EXCLUDED.scenario_metadata,
                    include_on_indicator_page = EXCLUDED.include_on_indicator_page,
                    active_flag = EXCLUDED.active_flag,
                    updated_at = NOW()
                """,
                {
                    "scenario_id": scenario.scenario_id,
                    "indicator_slug": scenario.indicator_slug,
                    "scenario_key": scenario.scenario_key,
                    "scenario_label": scenario.label,
                    "short_description": scenario.short_description,
                    "universe": scenario.universe,
                    "universe_membership_mode": scenario.universe_membership_mode,
                    "benchmark_symbol": indicator.benchmark_index_name,
                    "benchmark_label": scenario.benchmark_label,
                    "lookback_years": scenario.lookback_years,
                    "entry_rule": scenario.entry_rule,
                    "exit_rule": scenario.exit_rule,
                    "capital_model": scenario.capital_model,
                    "starting_capital": scenario.starting_capital,
                    "ticket_size_rule": scenario.ticket_size_rule,
                    "max_open_positions": scenario.max_open_positions,
                    "priority_rule": scenario.priority_rule,
                    "priority_rule_note": scenario.priority_rule_note,
                    "transaction_cost_bps": scenario.transaction_cost_bps,
                    "slippage_bps": scenario.slippage_bps,
                    "execution_assumption": json.dumps(scenario.execution_assumption),
                    "scenario_metadata": json.dumps({"capital_variant_key": scenario.capital_variant_key, "page_key": scenario.page_key, "entry_config": scenario.entry_config, "exit_config": scenario.exit_config, "max_hold_days": scenario.max_hold_days}),
                    "include_on_indicator_page": scenario.include_on_indicator_page,
                    "active_flag": scenario.active_flag,
                },
            )


def _insert_many(cur, sql: str, rows: list[tuple[Any, ...]]) -> None:
    if rows:
        cur.executemany(sql, rows)


def _begin_batch(conn, job_run_id: int, data_as_of_date: date, registry: IndicatorRegistry) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO nse_app.batch_run_audit (
                job_run_id, batch_name, batch_scope, data_as_of_date, status, validation_status, published_flag,
                generated_at, stale_after, config_version, assumptions_json
            )
            VALUES (
                %(job_run_id)s, %(batch_name)s, 'daily_eod', %(data_as_of_date)s, 'running', 'pending', FALSE,
                NOW(), %(stale_after)s, %(config_version)s, %(assumptions_json)s::jsonb
            )
            RETURNING batch_run_id
            """,
            {
                "job_run_id": job_run_id,
                "batch_name": BATCH_NAME,
                "data_as_of_date": data_as_of_date,
                "stale_after": _stale_after(data_as_of_date),
                "config_version": registry.config_version,
                "assumptions_json": json.dumps({"batch_name": BATCH_NAME, "published_model": "latest_published_batch_only", "last_good_fallback": True, "registry_version": registry.config_version}),
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
                validation_status = 'passed',
                published_flag = TRUE,
                published_at = NOW(),
                row_counts = %(row_counts)s::jsonb,
                validation_metrics = %(validation_metrics)s::jsonb,
                error_message = NULL
            WHERE batch_run_id = %(batch_run_id)s
            """,
            {"batch_run_id": batch_run_id, "row_counts": json.dumps(row_counts), "validation_metrics": json.dumps(validation_metrics)},
        )


def _validate_batch(registry: IndicatorRegistry, validation_stats: dict[str, dict[str, Any]], indicator_snapshots: int, strategy_snapshots: int, data_as_of_date: date) -> dict[str, Any]:
    expected_indicator_count = len(registry.indicators)
    expected_strategy_count = sum(1 for indicator in registry.indicators.values() for scenario in indicator.scenarios if scenario.active_flag)
    failures: list[str] = []
    metrics: dict[str, Any] = {
        "data_as_of_date": data_as_of_date.isoformat(),
        "expected_indicator_count": expected_indicator_count,
        "expected_strategy_count": expected_strategy_count,
        "indicator_snapshot_count": indicator_snapshots,
        "strategy_snapshot_count": strategy_snapshots,
        "per_indicator": validation_stats,
    }
    if indicator_snapshots != expected_indicator_count:
        failures.append(f"Expected {expected_indicator_count} indicator snapshots, found {indicator_snapshots}.")
    if strategy_snapshots != expected_strategy_count:
        failures.append(f"Expected {expected_strategy_count} strategy snapshots, found {strategy_snapshots}.")
    for slug, stats in validation_stats.items():
        if stats["indicator_daily_rows"] <= 0:
            failures.append(f"{slug}: no indicator_daily_values rows were generated.")
        if stats["latest_universe_size"] <= 0:
            failures.append(f"{slug}: no latest-date universe rows were generated.")
        if stats["latest_indicator_null_count"] > 0:
            failures.append(f"{slug}: latest-date indicator values contain {stats['latest_indicator_null_count']} null rows.")
        if stats["invalid_indicator_count"] > 0:
            failures.append(f"{slug}: {stats['invalid_indicator_count']} indicator values fell outside the configured range.")
    metrics["validation_passed"] = not failures
    metrics["validation_failures"] = failures
    if failures:
        raise RuntimeError("Indicator strategy validation failed: " + " | ".join(failures))
    return metrics


def refresh_indicator_strategy_snapshots(conn, registry_path: Path, job_run_id: int) -> dict[str, Any]:
    registry = load_indicator_registry(registry_path)
    data_as_of_value = fetch_value(conn, "SELECT MAX(trade_date) FROM nse_app.security_daily_features")
    if data_as_of_value is None:
        raise RuntimeError("security_daily_features is empty; refresh features before indicator strategy snapshots.")
    data_as_of_date = _as_date(data_as_of_value)

    for indicator in registry.indicators.values():
        _upsert_scenario_catalog(conn, indicator)
    conn.commit()
    batch_run_id = _begin_batch(conn, job_run_id=job_run_id, data_as_of_date=data_as_of_date, registry=registry)

    try:
        snapshot_generated_at = _utc_now().isoformat()
        indicator_snapshot_rows: list[tuple[Any, ...]] = []
        strategy_snapshot_rows: list[tuple[Any, ...]] = []
        indicator_daily_rows: list[tuple[Any, ...]] = []
        strategy_trade_rows: list[tuple[Any, ...]] = []
        strategy_daily_rows: list[tuple[Any, ...]] = []
        strategy_stock_rows: list[tuple[Any, ...]] = []
        strategy_open_rows: list[tuple[Any, ...]] = []
        validation_stats: dict[str, dict[str, Any]] = {}
        row_counts = {"indicator_daily_values": 0, "indicator_summary_snapshot": 0, "strategy_trade_log": 0, "strategy_daily_equity": 0, "strategy_summary_snapshot": 0, "strategy_stock_summary": 0, "strategy_open_positions": 0}

        for indicator in registry.indicators.values():
            evidence_start = data_as_of_date - timedelta(days=(indicator.evidence_years * 365) - 1)
            query_start = evidence_start - timedelta(days=indicator.warmup_days)
            history_df = _fetch_universe_history(conn, indicator, query_start, data_as_of_date)
            benchmark_df = _fetch_benchmark_history(conn, indicator, query_start, data_as_of_date)
            histories, indicator_rows_for_indicator, stats = _build_symbol_histories(indicator, history_df, evidence_start)
            latest_rows = [bars[-1] for bars in histories.values() if bars and bars[-1].trade_date == data_as_of_date]
            benchmark_points = _build_benchmark_series(indicator, benchmark_df, evidence_start)
            benchmark_close_by_date = {_as_date(record["trade_date"]): _safe_float(record.get("close_price")) for record in benchmark_df.to_dict(orient="records")}
            calendar_dates = sorted({bar.trade_date for bars in histories.values() for bar in bars if bar.trade_date >= evidence_start})

            scenario_results: list[dict[str, Any]] = []
            for scenario in indicator.scenarios:
                if not scenario.active_flag:
                    continue
                result = simulate_strategy(scenario, histories, calendar_dates, benchmark_close_by_date)
                payload = {"indicatorSlug": indicator.slug, "displayName": indicator.display_name, "scenarioId": scenario.scenario_id, "generatedAt": snapshot_generated_at, "dataAsOfDate": data_as_of_date.isoformat(), "evidenceRange": {"startDate": evidence_start.isoformat(), "endDate": data_as_of_date.isoformat(), "label": f"{evidence_start.isoformat()} to {data_as_of_date.isoformat()}"}, **result["payload"]}
                result["payload"] = payload
                scenario_results.append(result)
                strategy_snapshot_rows.append((batch_run_id, scenario.scenario_id, indicator.slug, indicator.universe, data_as_of_date, data_as_of_date, False, json.dumps(payload), json.dumps({"generatedAt": snapshot_generated_at, "priorityRule": scenario.priority_rule, "priorityRuleNote": scenario.priority_rule_note, "capitalVariantKey": scenario.capital_variant_key})))
                strategy_trade_rows.extend([
                    (batch_run_id, scenario.scenario_id, indicator.slug, indicator.universe, trade["symbol"], trade["security_name"], trade["sector"], trade["signal_trade_date"], trade["signal_value"], trade["priority_value"], trade["entry_date"], trade["entry_price"], trade["entry_shares"], trade["gross_entry_value"], trade["ticket_size"], trade["target_price"], trade["exit_signal_date"], trade["exit_date"], trade["exit_reason"], trade["exit_price"], trade["gross_exit_value"], trade["total_fees"], trade["net_pnl"], trade["net_return_pct"], trade["holding_days"], trade["trade_status"], json.dumps(trade["execution_notes"]))
                    for trade in result["closed_trades"]
                ])
                strategy_daily_rows.extend([
                    (batch_run_id, scenario.scenario_id, row["trade_date"], row["active_positions"], row["deployed_capital"], row["available_cash"], row["market_value"], row["total_equity"], row["equity_index"], row["daily_return_pct"], row["drawdown_pct"], row["benchmark_close"], row["benchmark_return_pct"])
                    for row in result["daily_rows"]
                ])
                strategy_stock_rows.extend([
                    (batch_run_id, scenario.scenario_id, row["symbol"], row["security_name"], row["sector"], row["trade_count"], row["closed_trade_count"], row["open_trade_count"], row["win_rate_pct"], row["avg_return_pct"], row["median_return_pct"], row["total_net_pnl"], row["avg_holding_days"], row["last_entry_date"], row["last_exit_date"], row["current_status"])
                    for row in result["stock_summary_rows"]
                ])
                strategy_open_rows.extend([
                    (batch_run_id, scenario.scenario_id, row["as_of_date"], row["symbol"], row["security_name"], row["sector"], row["signal_trade_date"], row["entry_date"], row["entry_price"], row["current_price"], row["current_indicator_value"], row["target_price"], row["days_open"], row["entry_shares"], row["allocated_capital"], row["market_value"], row["unrealized_pnl"], row["unrealized_return_pct"], row["priority_value"])
                    for row in result["open_positions"]
                ])

            indicator_payload = _build_indicator_payload(indicator, registry, histories, latest_rows, benchmark_points, scenario_results, data_as_of_date, snapshot_generated_at)
            indicator_snapshot_rows.append((batch_run_id, indicator.slug, indicator.universe, data_as_of_date, data_as_of_date, False, json.dumps(indicator_payload), json.dumps({"generatedAt": snapshot_generated_at, "universe": indicator.universe, "universeMembershipMode": indicator.universe_membership_mode, "benchmarkIndexName": indicator.benchmark_index_name})))
            indicator_daily_rows.extend([
                (batch_run_id, row["indicator_slug"], row["universe"], row["trade_date"], row["symbol"], row["security_name"], row["sector"], row["open_price"], row["high_price"], row["low_price"], row["close_price"], row["total_traded_qty"], row["indicator_value"], row["signal_rank_value"], row["band_key"], row["band_label"], row["data_quality_flag"])
                for row in indicator_rows_for_indicator
            ])
            stats["indicator_daily_rows"] = len(indicator_rows_for_indicator)
            validation_stats[indicator.slug] = stats

        row_counts["indicator_daily_values"] = len(indicator_daily_rows)
        row_counts["indicator_summary_snapshot"] = len(indicator_snapshot_rows)
        row_counts["strategy_trade_log"] = len(strategy_trade_rows)
        row_counts["strategy_daily_equity"] = len(strategy_daily_rows)
        row_counts["strategy_summary_snapshot"] = len(strategy_snapshot_rows)
        row_counts["strategy_stock_summary"] = len(strategy_stock_rows)
        row_counts["strategy_open_positions"] = len(strategy_open_rows)

        with conn.cursor() as cur:
            _insert_many(cur, "INSERT INTO nse_app.indicator_daily_values (batch_run_id, indicator_slug, universe, trade_date, symbol, security_name, sector, open_price, high_price, low_price, close_price, total_traded_qty, indicator_value, signal_rank_value, band_key, band_label, data_quality_flag) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)", indicator_daily_rows)
            _insert_many(cur, "INSERT INTO nse_app.indicator_summary_snapshot (batch_run_id, indicator_slug, universe, snapshot_date, data_as_of_date, is_stale, payload_json, metadata_json) VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb)", indicator_snapshot_rows)
            _insert_many(cur, "INSERT INTO nse_app.strategy_trade_log (batch_run_id, scenario_id, indicator_slug, universe, symbol, security_name, sector, signal_trade_date, signal_value, priority_value, entry_date, entry_price, entry_shares, gross_entry_value, ticket_size, target_price, exit_signal_date, exit_date, exit_reason, exit_price, gross_exit_value, total_fees, net_pnl, net_return_pct, holding_days, trade_status, execution_notes) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)", strategy_trade_rows)
            _insert_many(cur, "INSERT INTO nse_app.strategy_daily_equity (batch_run_id, scenario_id, trade_date, active_positions, deployed_capital, available_cash, market_value, total_equity, equity_index, daily_return_pct, drawdown_pct, benchmark_close, benchmark_return_pct) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)", strategy_daily_rows)
            _insert_many(cur, "INSERT INTO nse_app.strategy_summary_snapshot (batch_run_id, scenario_id, indicator_slug, universe, snapshot_date, data_as_of_date, is_stale, payload_json, metadata_json) VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb)", strategy_snapshot_rows)
            _insert_many(cur, "INSERT INTO nse_app.strategy_stock_summary (batch_run_id, scenario_id, symbol, security_name, sector, trade_count, closed_trade_count, open_trade_count, win_rate_pct, avg_return_pct, median_return_pct, total_net_pnl, avg_holding_days, last_entry_date, last_exit_date, current_status) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)", strategy_stock_rows)
            _insert_many(cur, "INSERT INTO nse_app.strategy_open_positions (batch_run_id, scenario_id, as_of_date, symbol, security_name, sector, signal_trade_date, entry_date, entry_price, current_price, current_indicator_value, target_price, days_open, entry_shares, allocated_capital, market_value, unrealized_pnl, unrealized_return_pct, priority_value) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)", strategy_open_rows)
            validation_metrics = _validate_batch(registry, validation_stats, len(indicator_snapshot_rows), len(strategy_snapshot_rows), data_as_of_date)
            _publish_batch(conn, batch_run_id=batch_run_id, row_counts=row_counts, validation_metrics=validation_metrics)
        conn.commit()

        return {"indicator_strategy_batch_run_id": batch_run_id, "indicator_strategy_published_batch_run_id": batch_run_id, "indicator_strategy_data_as_of_date": data_as_of_date.isoformat(), "indicator_strategy_registry_version": registry.config_version, **row_counts}
    except Exception as exc:
        conn.rollback()
        _mark_batch_failed(conn, batch_run_id, str(exc))
        raise
