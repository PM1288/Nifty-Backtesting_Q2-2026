from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
import time
from threading import Lock
from typing import Any

from psycopg.errors import UndefinedTable

from .config import Settings
from .db import db_conn
from .models import (
    AnomalyItem,
    BreadthState,
    LeaderPoint,
    MarketState,
    Snapshot,
    StockBar1m,
    StockDetail,
    StockSignal,
    StockSnapshot,
    TickerItem,
)


def _safe_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    return float(value)


def _pct_to_ratio(value: Any) -> float:
    return _safe_float(value) / 100.0


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _normalize_symbol(symbol: str) -> str:
    return symbol.upper().replace(" ", "")


def _bucket_text(value: Any, default: str = "neutral") -> str:
    text = str(value or default).replace("_", " ").replace("-", " ").strip().lower()
    return text or default


def _normalize_regime(value: Any) -> str:
    label = _bucket_text(value, "neutral")
    replacements = {
        "high volatility chop": "high volatility churn",
        "bearish expansion": "bear expansion",
        "bullish expansion": "bull expansion",
    }
    return replacements.get(label, label)


def _reason_tags(explanation: Any) -> list[str]:
    if isinstance(explanation, dict):
        tags: list[str] = []
        for key in ("drivers", "reasons", "tags"):
            value = explanation.get(key)
            if isinstance(value, list):
                tags.extend(str(item) for item in value if item)
        if tags:
            return tags[:3]
    return ["observe"]


def _build_stock_snapshot(row: dict[str, Any]) -> StockSnapshot:
    residual_strength = _safe_float(row["residual_strength"])
    volume_ratio = _safe_float(row["volume_ratio"])
    delivery_ratio = _safe_float(row["delivery_ratio"])
    continuation_score = _safe_float(row["continuation_score"])
    weakness_score = _safe_float(row["weakness_score"])
    mean_reversion_score = _safe_float(row["mean_reversion_score"])
    reversal_score = _safe_float(row["reversal_score"])
    vwap_control_score = _safe_float(row["vwap_control_score"])
    persistence_score = _safe_float(row["relative_strength_persistence_score"])
    vwap_hold_quality_score = _safe_float(row["vwap_hold_quality_score"])
    time_above_vwap_pct = _safe_float(row["time_above_vwap_pct"])
    headline_spike_score = _safe_float(row["headline_spike_score"])
    catch_up_score = _safe_float(row["catch_up_score"])
    close_location_quality_pct = _safe_float(row["close_location_quality_pct"])
    volume_curve_surprise = abs(_safe_float(row["volume_curve_surprise"]))
    anomaly_base = _safe_float(row["base_anomaly_score"])
    vwap_dev_bps = abs(_safe_float(row["vwap_dev_bps"]))

    trend_score = _clamp(
        0.42 * continuation_score
        + 0.18 * vwap_control_score
        + 0.20 * persistence_score
        + 0.20 * max(residual_strength, 0.0) * 10.0,
        0.0,
        100.0,
    )
    conviction_score = _clamp(
        0.34 * abs(residual_strength) * 10.0
        + 0.26 * max(volume_ratio, 0.0) * 24.0
        + 0.20 * vwap_hold_quality_score
        + 0.20 * min(100.0, time_above_vwap_pct * 100.0),
        0.0,
        100.0,
    )
    risk_score = _clamp(
        0.34 * weakness_score
        + 0.26 * reversal_score
        + 0.20 * volume_curve_surprise * 12.0
        + 0.20 * max(0.0, 50.0 - close_location_quality_pct / 2.0),
        0.0,
        100.0,
    )
    event_score = _clamp(
        0.70 * headline_spike_score
        + 0.20 * catch_up_score
        + 0.10 * anomaly_base,
        0.0,
        100.0,
    )
    anomaly_score = _clamp(
        anomaly_base
        + abs(residual_strength) * 6.0
        + max(volume_ratio - 1.0, 0.0) * 18.0
        + max(vwap_dev_bps - 10.0, 0.0) / 4.0
        + headline_spike_score * 0.15,
        0.0,
        100.0,
    )

    return StockSnapshot(
        symbol=str(row["symbol"]),
        security_name=str(row["security_name"]),
        sector=row.get("sector_name"),
        price=_safe_float(row["price"]),
        change_pct=_pct_to_ratio(row["change_pct"]),
        volume=_safe_float(row["volume"]),
        vwap=_safe_float(row["vwap"], _safe_float(row["price"])),
        residual_strength=residual_strength,
        anomaly_score=anomaly_score,
        signal_bucket=_bucket_text(row.get("signal_bucket"), "neutral"),
        volume_ratio=volume_ratio,
        delivery_ratio=delivery_ratio,
        trend_score=trend_score,
        conviction_score=conviction_score,
        risk_score=risk_score,
        event_score=event_score,
        momentum_5m=_pct_to_ratio(row["momentum_5m"]),
        momentum_15m=_pct_to_ratio(row["momentum_15m"]),
        momentum_30m=_pct_to_ratio(row["momentum_30m"]),
        above_vwap=bool(row["above_vwap"]),
    )


@dataclass
class SnapshotProvider:
    settings: Settings
    _snapshot_lock: Lock = field(default_factory=Lock, init=False, repr=False)
    _snapshot_cache: Snapshot | None = field(default=None, init=False, repr=False)
    _snapshot_cache_at: float = field(default=0.0, init=False, repr=False)

    def _snapshot_cache_ttl(self) -> float:
        return min(max(self.settings.snapshot_interval_sec, 1.0), 5.0)

    def latest_trade_date(self) -> date:
        with db_conn() as conn, conn.cursor() as cur:
            cur.execute(
                """
                select coalesce(
                  (select max(trade_date) from nse_intraday.market_session_summary where index_code = %s),
                  (select max(trade_date) from nse_ops.dashboard_snapshot_intraday where index_code = %s)
                ) as trade_date
                """,
                (self.settings.default_index_code, self.settings.default_index_code),
            )
            row = cur.fetchone()
            if not row or not row["trade_date"]:
                raise RuntimeError("No intraday trade date available in warehouse")
            return row["trade_date"]

    def load_snapshot(self) -> Snapshot:
        now = time.monotonic()
        cached_snapshot = self._snapshot_cache
        if cached_snapshot is not None and now-self._snapshot_cache_at < self._snapshot_cache_ttl():
            return cached_snapshot

        with self._snapshot_lock:
            now = time.monotonic()
            cached_snapshot = self._snapshot_cache
            if cached_snapshot is not None and now-self._snapshot_cache_at < self._snapshot_cache_ttl():
                return cached_snapshot

        trade_date = self.latest_trade_date()
        with db_conn() as conn, conn.cursor() as cur:
            stock_rows = self._load_stock_universe(cur, trade_date)
            breadth = self._compute_breadth(stock_rows)
            market = self._load_market(cur, trade_date, breadth)
            stocks = [_build_stock_snapshot(row) for row in stock_rows]

        ticker = self._build_ticker(market, stocks)
        leaders = self._build_leaders(stocks)
        ladder = self._build_ladder(stock_rows, stocks)
        anomalies = self._build_anomalies(stock_rows, stocks)
        snapshot = Snapshot(
            ts=market.ts,
            timestamp=market.ts,
            ticker=ticker,
            market=market,
            market_state=market,
            breadth=breadth,
            leaders=leaders,
            ladder=ladder,
            anomalies=anomalies,
            stocks=stocks,
        )
        self._snapshot_cache = snapshot
        self._snapshot_cache_at = time.monotonic()
        return snapshot

    def load_stock_detail(self, symbol: str, minutes: int = 240) -> StockDetail:
        normalized_symbol = _normalize_symbol(symbol)
        is_index = normalized_symbol in {"NIFTY50", "NIFTY", "NIFTY 50".replace(" ", "")}
        trade_date = self.latest_trade_date()
        with db_conn() as conn, conn.cursor() as cur:
            if is_index:
                bars = self._load_index_bars(cur, trade_date, minutes)
                if not bars:
                    raise RuntimeError(f"No index minute bars found for trade_date={trade_date}")
                last_bar = bars[-1]
                prev_close = self._load_index_prev_close(cur, trade_date)
                return StockDetail(
                    symbol="NIFTY50",
                    security_name="Nifty 50",
                    sector=None,
                    last=last_bar.close,
                    change_pct=_safe_float(last_bar.close / prev_close - 1.0 if prev_close else 0.0),
                    day_open=bars[0].open,
                    day_high=max(bar.high for bar in bars),
                    day_low=min(bar.low for bar in bars),
                    bars=bars,
                )

            stock_rows = self._load_stock_universe(cur, trade_date, symbol=normalized_symbol)
            if not stock_rows:
                raise RuntimeError(f"No stock metadata found for trade_date={trade_date} symbol={normalized_symbol}")
            stock = _build_stock_snapshot(stock_rows[0])
            bars = self._load_stock_bars(cur, trade_date, normalized_symbol, minutes)
            if not bars:
                raise RuntimeError(f"No stock minute bars found for trade_date={trade_date} symbol={normalized_symbol}")
            return StockDetail(
                symbol=stock.symbol,
                security_name=stock.security_name,
                sector=stock.sector,
                last=stock.price,
                change_pct=stock.change_pct,
                day_open=bars[0].open,
                day_high=max(bar.high for bar in bars),
                day_low=min(bar.low for bar in bars),
                bars=bars,
                signal_bucket=stock.signal_bucket,
                residual_strength=stock.residual_strength,
                volume_ratio=stock.volume_ratio,
                delivery_ratio=stock.delivery_ratio,
                trend_score=stock.trend_score,
                conviction_score=stock.conviction_score,
                risk_score=stock.risk_score,
                event_score=stock.event_score,
                anomaly_score=stock.anomaly_score,
            )

    def _load_stock_universe(self, cur: Any, trade_date: date, symbol: str | None = None) -> list[dict[str, Any]]:
        symbol_sql = ""
        params: list[Any] = [trade_date]
        if symbol:
            symbol_sql = "and s.symbol = %s"
            params.append(symbol)
        params.extend(
            [
                trade_date,
                trade_date,
                trade_date,
                self.settings.default_index_code,
                self.settings.default_horizon,
                trade_date,
                trade_date,
            ]
        )

        try:
            cur.execute(
                f"""
                with live as (
                  select
                    s.*
                  from nse_intraday.stock_intraday_live s
                  where s.trade_date = %s
                    {symbol_sql}
                ),
                latest_bar as (
                  select distinct on (r.symbol)
                    r.symbol,
                    r.minute_ts,
                    r.close_px,
                    r.high_px,
                    r.low_px,
                    r.volume,
                    r.vwap
                  from nse_intraday.raw_security_1m r
                  where r.trade_date = %s
                  order by r.symbol, r.minute_ts desc
                ),
                session_extrema as (
                  select
                    r.symbol,
                    max(r.high_px) as session_high,
                    min(r.low_px) as session_low
                  from nse_intraday.raw_security_1m r
                  where r.trade_date = %s
                  group by r.symbol
                ),
                reco as (
                  select
                    r.symbol,
                    r.signal_family,
                    r.final_score,
                    r.explanation
                  from nse_reco.recommendation_snapshot r
                  where r.trade_date = %s
                    and r.index_code = %s
                    and r.horizon = %s
                ),
                anomaly as (
                  select
                    coalesce(a.details->>'symbol', split_part(a.key, ':', 1), a.key) as symbol,
                    max(coalesce(a.score, 0)) as anomaly_score,
                    array_remove(array_agg(distinct a.reason), null) as reasons
                  from nse_reco.anomaly_event a
                  where a.trade_date = %s
                    and a.scope in ('single_stock', 'cross_section')
                  group by 1
                ),
                security as (
                  select distinct on (sec.symbol)
                    sec.symbol,
                    sec.security_name
                  from nse.vw_security_current sec
                  order by sec.symbol, sec.security_name
                ),
                daily as (
                  select distinct on (d.symbol)
                    d.symbol,
                    d.deliverable_pct
                  from nse.vw_stock_features_daily d
                  where d.trade_date = %s
                  order by d.symbol, d.deliverable_pct desc nulls last
                )
                select
                  s.symbol,
                  coalesce(sec.security_name, s.symbol) as security_name,
                  s.sector_name,
                  coalesce(lb.close_px, s.last_price, 0) as price,
                  coalesce(s.change_pct_from_prev_close, 0) as change_pct,
                  coalesce(lb.volume, 0) as volume,
                  coalesce(lb.vwap, lb.close_px, s.last_price, 0) as vwap,
                  coalesce(s.relative_strength_bps, 0) / 100.0 as residual_strength,
                  coalesce(a.anomaly_score, 0) as base_anomaly_score,
                  coalesce(r.signal_family, s.dominant_signal, 'neutral') as signal_bucket,
                  coalesce(r.final_score, 0) as final_score,
                  r.explanation,
                  coalesce(s.volume_ratio_day, 0) as volume_ratio,
                  coalesce(d.deliverable_pct, 0) / 100.0 as delivery_ratio,
                  coalesce(s.continuation_score, 0) as continuation_score,
                  coalesce(s.weakness_score, 0) as weakness_score,
                  coalesce(s.mean_reversion_score, 0) as mean_reversion_score,
                  coalesce(s.reversal_score, 0) as reversal_score,
                  coalesce(s.headline_spike_score, 0) as headline_spike_score,
                  coalesce(s.catch_up_score, 0) as catch_up_score,
                  coalesce(s.vwap_control_score, 0) as vwap_control_score,
                  coalesce(s.vwap_hold_quality_score, 0) as vwap_hold_quality_score,
                  coalesce(s.relative_strength_persistence_score, 0) as relative_strength_persistence_score,
                  coalesce(s.close_location_quality_pct, 0) as close_location_quality_pct,
                  coalesce(s.time_above_vwap_pct, 0) as time_above_vwap_pct,
                  coalesce(s.volume_curve_surprise, 0) as volume_curve_surprise,
                  coalesce(s.vwap_dev_bps, 0) as vwap_dev_bps,
                  coalesce(s.residual_return_5m_pct, 0) as momentum_5m,
                  coalesce(s.residual_return_15m_pct, 0) as momentum_15m,
                  coalesce(s.residual_return_30m_pct, 0) as momentum_30m,
                  coalesce(s.above_vwap, false) as above_vwap,
                  coalesce(se.session_high, coalesce(lb.high_px, s.last_price, 0)) as session_high,
                  coalesce(se.session_low, coalesce(lb.low_px, s.last_price, 0)) as session_low,
                  coalesce(a.reasons, array[]::text[]) as anomaly_reasons
                from live s
                left join latest_bar lb
                  on lb.symbol = s.symbol
                left join session_extrema se
                  on se.symbol = s.symbol
                left join security sec
                  on sec.symbol = s.symbol
                left join daily d
                  on d.symbol = s.symbol
                left join reco r
                  on r.symbol = s.symbol
                left join anomaly a
                  on a.symbol = s.symbol
                order by abs(coalesce(s.relative_strength_bps, 0)) desc, s.symbol
                """,
                params,
            )
        except UndefinedTable as exc:
            raise RuntimeError(f"Required realtime tables are missing: {exc}") from exc
        return list(cur.fetchall() or [])

    def _compute_breadth(self, stock_rows: list[dict[str, Any]]) -> BreadthState:
        total = max(len(stock_rows), 1)
        up_count = 0
        above_vwap_count = 0
        new_high_count = 0
        new_low_count = 0
        up_volume = 0.0
        down_volume = 0.0
        volume_ratios: list[float] = []

        for row in stock_rows:
            price = _safe_float(row["price"])
            change_pct = _safe_float(row["change_pct"])
            session_high = _safe_float(row["session_high"], price)
            session_low = _safe_float(row["session_low"], price)
            volume = _safe_float(row["volume"])
            volume_ratio = _safe_float(row["volume_ratio"])
            volume_ratios.append(volume_ratio)

            if change_pct > 0:
                up_count += 1
                up_volume += volume
            else:
                down_volume += volume
            if bool(row["above_vwap"]):
                above_vwap_count += 1
            if price >= session_high * 0.9995:
                new_high_count += 1
            if price <= session_low * 1.0005:
                new_low_count += 1

        mean_ratio = sum(volume_ratios) / total
        variance = sum((value - mean_ratio) ** 2 for value in volume_ratios) / total
        total_volume = up_volume + down_volume

        return BreadthState(
            pct_up=up_count / total,
            pct_above_vwap=above_vwap_count / total,
            pct_new_highs=new_high_count / total,
            pct_new_lows=new_low_count / total,
            up_volume_ratio=(up_volume / total_volume) if total_volume > 0 else 0.5,
            down_volume_ratio=(down_volume / total_volume) if total_volume > 0 else 0.5,
            volume_dispersion=variance**0.5,
        )

    def _load_market(self, cur: Any, trade_date: date, breadth: BreadthState) -> MarketState:
        cur.execute(
            """
            select
              ms.as_of_ts,
              ms.last_price,
              ms.change_pct,
              ms.dispersion_pct,
              ms.top10_concentration_pct,
              ms.session_range_pct,
              ms.open_range_15_pct,
              ms.participation_label,
              coalesce(r.regime, ms.primary_state) as regime_label,
              coalesce(r.score, ms.confidence_score, 50.0) as regime_score
            from nse_intraday.market_session_summary ms
            left join nse_reco.market_regime_snapshot r
              on r.trade_date = ms.trade_date
             and r.index_code = ms.index_code
            where ms.trade_date = %s
              and ms.index_code = %s
            """,
            (trade_date, self.settings.default_index_code),
        )
        row = cur.fetchone()
        if not row:
            raise RuntimeError(f"No market session summary found for trade_date={trade_date}")

        concentration = _pct_to_ratio(row["top10_concentration_pct"])
        volatility_pulse = _clamp(_safe_float(row["dispersion_pct"]) / 2.0, 0.0, 1.0)
        change_pct = _pct_to_ratio(row["change_pct"])
        volatility_ratio = _safe_float(row["session_range_pct"]) / max(_safe_float(row["open_range_15_pct"], 0.2), 0.2)
        heat = _clamp(
            100.0
            * (
                0.28 * breadth.pct_up
                + 0.22 * breadth.pct_above_vwap
                + 0.14 * breadth.up_volume_ratio
                + 0.12 * breadth.pct_new_highs
                + 0.10 * (1.0 - breadth.pct_new_lows)
                + 0.14 * (0.5 + 0.5 * _clamp(change_pct / 0.01, -1.0, 1.0))
            ),
            0.0,
            100.0,
        )

        return MarketState(
            ts=row["as_of_ts"],
            index_last=_safe_float(row["last_price"]),
            index_change_pct=change_pct,
            breadth_pct_advancers=breadth.pct_up,
            breadth_pct_above_vwap=breadth.pct_above_vwap,
            volatility_pulse=volatility_pulse,
            leadership_concentration=concentration,
            regime_label=_normalize_regime(row["regime_label"]),
            market_heat_score=heat if heat > 0 else _clamp(_safe_float(row["regime_score"]), 0.0, 100.0),
            volatility_ratio=volatility_ratio,
            pct_new_highs=breadth.pct_new_highs,
            pct_new_lows=breadth.pct_new_lows,
            up_volume_ratio=breadth.up_volume_ratio,
            down_volume_ratio=breadth.down_volume_ratio,
            volume_dispersion=breadth.volume_dispersion,
            participation_label=row.get("participation_label"),
        )

    def _build_ticker(self, market: MarketState, stocks: list[StockSnapshot]) -> list[TickerItem]:
        items = [
            TickerItem(
                symbol="NIFTY50",
                last=market.index_last,
                change_pct=market.index_change_pct,
            )
        ]
        movers = sorted(stocks, key=lambda stock: abs(stock.change_pct), reverse=True)[:19]
        items.extend(
            TickerItem(symbol=stock.symbol, last=stock.price, change_pct=stock.change_pct)
            for stock in movers
        )
        return items

    def _build_leaders(self, stocks: list[StockSnapshot]) -> list[LeaderPoint]:
        ranked = sorted(
            stocks,
            key=lambda stock: (stock.anomaly_score, abs(stock.residual_strength), stock.conviction_score),
            reverse=True,
        )[:40]
        return [
            LeaderPoint(
                symbol=stock.symbol,
                security_name=stock.security_name,
                residual_strength=stock.residual_strength,
                volume_ratio=stock.volume_ratio,
                anomaly_score=stock.anomaly_score,
                change_pct=stock.change_pct,
                last=stock.price,
            )
            for stock in ranked
        ]

    def _build_ladder(self, stock_rows: list[dict[str, Any]], stocks: list[StockSnapshot]) -> list[StockSignal]:
        stock_map = {stock.symbol: stock for stock in stocks}
        ranked_rows = sorted(
            [row for row in stock_rows if _safe_float(row["final_score"]) > 0],
            key=lambda row: (
                _safe_float(row["final_score"]),
                abs(_safe_float(row["residual_strength"])),
            ),
            reverse=True,
        )[:24]
        ladder: list[StockSignal] = []
        for row in ranked_rows:
            stock = stock_map.get(str(row["symbol"]))
            if not stock:
                continue
            ladder.append(
                StockSignal(
                    symbol=stock.symbol,
                    security_name=stock.security_name,
                    bucket=stock.signal_bucket,
                    score=_clamp(_safe_float(row["final_score"]), 0.0, 100.0),
                    change_pct=stock.change_pct,
                    last=stock.price,
                    reason_tags=_reason_tags(row.get("explanation")),
                )
            )
        return ladder

    def _build_anomalies(self, stock_rows: list[dict[str, Any]], stocks: list[StockSnapshot]) -> list[AnomalyItem]:
        stock_map = {stock.symbol: stock for stock in stocks}
        ranked_rows = sorted(
            stock_rows,
            key=lambda row: (
                stock_map.get(str(row["symbol"])).anomaly_score if stock_map.get(str(row["symbol"])) else 0.0,
                abs(_safe_float(row["residual_strength"])),
            ),
            reverse=True,
        )[:20]
        anomalies: list[AnomalyItem] = []
        for row in ranked_rows:
            stock = stock_map.get(str(row["symbol"]))
            if not stock or stock.anomaly_score <= 0:
                continue
            reasons = [str(item) for item in (row.get("anomaly_reasons") or []) if item]
            if not reasons:
                if stock.event_score >= 50:
                    reasons.append("headline_spike")
                if stock.volume_ratio >= 1.5:
                    reasons.append("volume_shock")
                if abs(stock.residual_strength) >= 1.5:
                    reasons.append("cross_section_divergence")
            anomalies.append(
                AnomalyItem(
                    symbol=stock.symbol,
                    security_name=stock.security_name,
                    anomaly_score=stock.anomaly_score,
                    reasons=reasons[:3] or ["observe"],
                )
            )
        return anomalies

    def _load_stock_bars(self, cur: Any, trade_date: date, symbol: str, minutes: int) -> list[StockBar1m]:
        cur.execute(
            """
            with recent as (
              select
                r.minute_ts,
                r.open_px,
                r.high_px,
                r.low_px,
                r.close_px,
                r.vwap,
                r.volume
              from nse_intraday.raw_security_1m r
              where r.trade_date = %s
                and r.symbol = %s
              order by r.minute_ts desc
              limit %s
            )
            select *
            from recent
            order by minute_ts
            """,
            (trade_date, symbol, minutes),
        )
        return [
            StockBar1m(
                ts=row["minute_ts"],
                symbol=symbol,
                open=_safe_float(row["open_px"]),
                high=_safe_float(row["high_px"]),
                low=_safe_float(row["low_px"]),
                close=_safe_float(row["close_px"]),
                vwap=_safe_float(row["vwap"], _safe_float(row["close_px"])),
                volume=_safe_float(row["volume"]),
            )
            for row in (cur.fetchall() or [])
        ]

    def _load_index_bars(self, cur: Any, trade_date: date, minutes: int) -> list[StockBar1m]:
        cur.execute(
            """
            with recent as (
              select
                r.minute_ts,
                r.open_px,
                r.high_px,
                r.low_px,
                r.close_px,
                null::numeric as vwap,
                0::numeric as volume
              from nse_intraday.raw_index_1m r
              where r.trade_date = %s
                and r.index_code = %s
              order by r.minute_ts desc
              limit %s
            )
            select *
            from recent
            order by minute_ts
            """,
            (trade_date, self.settings.default_index_code, minutes),
        )
        return [
            StockBar1m(
                ts=row["minute_ts"],
                symbol="NIFTY50",
                open=_safe_float(row["open_px"]),
                high=_safe_float(row["high_px"]),
                low=_safe_float(row["low_px"]),
                close=_safe_float(row["close_px"]),
                vwap=_safe_float(row["vwap"], _safe_float(row["close_px"])),
                volume=_safe_float(row["volume"]),
            )
            for row in (cur.fetchall() or [])
        ]

    def _load_index_prev_close(self, cur: Any, trade_date: date) -> float:
        cur.execute(
            """
            select prev_close
            from nse_intraday.market_minute_feature
            where trade_date = %s
              and index_code = %s
            order by minute_ts desc
            limit 1
            """,
            (trade_date, self.settings.default_index_code),
        )
        row = cur.fetchone()
        if not row:
            return 0.0
        return _safe_float(row["prev_close"])
