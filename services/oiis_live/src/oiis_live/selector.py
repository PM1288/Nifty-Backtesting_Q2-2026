from __future__ import annotations

import hashlib
import io
import json
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
import httpx
from nifty_stratlab.oiis import OIISFeature, evaluate_feature

from .policy import (
    DIRECTIONAL_EDGE_THRESHOLDS,
    EXTENSION_ATR_THRESHOLDS,
    OFACTOR_THRESHOLDS,
    VOLUME_PERCENTILE_THRESHOLDS,
    classify_daily,
    extension_level,
    minimum_level,
)

IST = ZoneInfo("Asia/Kolkata")
NIFTY50_CSV_URL = "https://archives.nseindia.com/content/indices/ind_nifty50list.csv"


def _frame(conn: Any, query: str, params: tuple[Any, ...] = ()) -> pd.DataFrame:
    with conn.cursor() as cur:
        cur.execute(query, params)
        rows = cur.fetchall()
        return pd.DataFrame(rows, columns=[column.name for column in cur.description])


def refresh_universe(conn: Any) -> dict[str, int]:
    """Refresh the current F&O plus NIFTY 50 research universe."""
    conn.execute("UPDATE oiis_live.universe_member SET is_fno=false, active=is_nifty50 WHERE is_fno")
    fno = conn.execute("""SELECT DISTINCT UPPER(TRIM(name)) symbol
      FROM public.instruments WHERE exchange='NFO'
        AND instrumenttype IN ('FUTSTK','OPTSTK') AND expiry>=current_date
        AND name !~ 'NSETEST$' ORDER BY 1""").fetchall()
    for row in fno:
        conn.execute("""INSERT INTO oiis_live.universe_member(symbol,is_fno,is_nifty50,active,source,refreshed_at)
          VALUES (%s,true,false,true,'SMARTAPI_INSTRUMENT_MASTER',now())
          ON CONFLICT(symbol) DO UPDATE SET is_fno=true,active=true,
            source=CASE WHEN oiis_live.universe_member.is_nifty50 THEN 'FNO_AND_NIFTY50' ELSE excluded.source END,
            refreshed_at=now()""", (row["symbol"],))
    try:
        response = httpx.get(NIFTY50_CSV_URL, timeout=20, follow_redirects=True)
        response.raise_for_status()
        frame = pd.read_csv(io.StringIO(response.text))
        symbols = sorted({str(value).strip().upper() for value in frame["Symbol"] if str(value).strip()})
        if not 45 <= len(symbols) <= 55:
            raise ValueError(f"unexpected NIFTY 50 constituent count: {len(symbols)}")
        conn.execute(
            "UPDATE oiis_live.universe_member SET is_nifty50=false, active=is_fno WHERE is_nifty50"
        )
        for symbol in symbols:
            conn.execute("""INSERT INTO oiis_live.universe_member(symbol,is_fno,is_nifty50,active,source,refreshed_at)
              VALUES (%s,false,true,true,'NSE_NIFTY50_CONSTITUENTS',now())
              ON CONFLICT(symbol) DO UPDATE SET is_nifty50=true,active=true,
                source=CASE WHEN oiis_live.universe_member.is_fno THEN 'FNO_AND_NIFTY50' ELSE excluded.source END,
                refreshed_at=now()""", (symbol,))
    except Exception:
        pass
    conn.execute("UPDATE oiis_live.universe_member SET active=(is_fno OR is_nifty50)")
    counts = conn.execute("""SELECT count(*) FILTER (WHERE active AND (is_fno OR is_nifty50)) total,
      count(*) FILTER (WHERE active AND is_fno) fno,
      count(*) FILTER (WHERE active AND is_nifty50) nifty50
      FROM oiis_live.universe_member""").fetchone()
    return {key: int(counts[key] or 0) for key in ("total", "fno", "nifty50")}


def load_prices(conn: Any, signal_date: date, as_of_ts: datetime | None = None) -> pd.DataFrame:
    warmup = signal_date - timedelta(days=180)
    history = _frame(conn, """
      WITH universe AS (
        SELECT symbol FROM oiis_live.universe_member
        WHERE active AND (is_fno OR is_nifty50)
      ), canonical AS (
        SELECT DISTINCT ON (e.trade_date,UPPER(TRIM(e.symbol))) e.trade_date,
          UPPER(TRIM(e.symbol)) symbol,e.open_price::double precision open_price,
          e.high_price::double precision high_price,e.low_price::double precision low_price,
          e.close_price::double precision close_price,e.prev_close::double precision prev_close,
          e.total_traded_qty::double precision volume,e.turnover_lacs::double precision turnover_lacs,
          e.deliverable_pct::double precision deliverable_pct,'NSE_EOD' source
        FROM nse.fact_eod_prices e JOIN universe u ON u.symbol=UPPER(TRIM(e.symbol))
        WHERE e.trade_date BETWEEN %s AND %s AND COALESCE(e.series,'EQ')='EQ'
          AND UPPER(TRIM(e.symbol)) <> 'TMPV'
        ORDER BY e.trade_date,UPPER(TRIM(e.symbol)),e.loaded_at DESC
      ), fallback AS (
        SELECT y.trade_date,UPPER(REGEXP_REPLACE(y.yahoo_symbol,'\\.NS$','')) symbol,
          y.open_price::double precision,y.high_price::double precision,y.low_price::double precision,
          y.close_price::double precision,
          lag(y.close_price) OVER (PARTITION BY y.yahoo_symbol ORDER BY y.trade_date)::double precision prev_close,
          y.volume::double precision volume,(y.close_price*y.volume/100000.0)::double precision turnover_lacs,
          NULL::double precision deliverable_pct,'YFINANCE_FALLBACK' source
        FROM strategy_eval.stock_daily_regime y
        WHERE y.trade_date BETWEEN %s AND %s
          AND NOT EXISTS (SELECT 1 FROM canonical c WHERE c.trade_date=y.trade_date
                          AND c.symbol=UPPER(REGEXP_REPLACE(y.yahoo_symbol,'\\.NS$','')))
      )
      SELECT * FROM canonical UNION ALL SELECT * FROM fallback
      ORDER BY symbol,trade_date
    """, (warmup, signal_date, warmup, signal_date))
    if as_of_ts is None or as_of_ts.date() <= signal_date or as_of_ts.time() < datetime.strptime("09:15", "%H:%M").time():
        return history
    session_open = datetime.combine(as_of_ts.date(), datetime.strptime("09:15", "%H:%M").time(), tzinfo=IST)
    partial = _frame(conn, """WITH inst AS (
        SELECT DISTINCT ON (symbol_token) symbol_token,
          UPPER(REGEXP_REPLACE(tradingsymbol,'-EQ$','')) symbol
        FROM public.instruments WHERE exchange='NSE' ORDER BY symbol_token,updated_at DESC
      ), scoped AS (
        SELECT b.ts,b.open,b.high,b.low,b.close,b.volume,i.symbol
        FROM public.bars_1m b JOIN inst i USING(symbol_token)
        JOIN oiis_live.universe_member u ON u.symbol=i.symbol AND u.active
        WHERE b.exchange='NSE' AND b.ts>=%s AND b.ts<=%s
      ), aggregate AS (
        SELECT symbol,(array_agg(open ORDER BY ts))[1]::double precision open_price,
          max(high)::double precision high_price,min(low)::double precision low_price,
          (array_agg(close ORDER BY ts DESC))[1]::double precision close_price,
          sum(volume)::double precision volume
        FROM scoped GROUP BY symbol
      ), historical_daily AS (
        SELECT i.symbol,(b.ts AT TIME ZONE 'Asia/Kolkata')::date trade_date,
          sum(b.volume)::double precision daily_volume
        FROM public.bars_1m b JOIN inst i USING(symbol_token)
        JOIN oiis_live.universe_member u ON u.symbol=i.symbol AND u.active
        WHERE b.exchange='NSE'
          AND (b.ts AT TIME ZONE 'Asia/Kolkata')::date BETWEEN %s::date-140 AND %s::date-1
          AND (b.ts AT TIME ZONE 'Asia/Kolkata')::time BETWEEN time '09:15' AND %s::time
        GROUP BY i.symbol,(b.ts AT TIME ZONE 'Asia/Kolkata')::date
      )
      SELECT %s::date trade_date,a.symbol,a.open_price,a.high_price,a.low_price,a.close_price,
        e.close_price::double precision prev_close,a.volume,
        (a.close_price*a.volume/100000.0)::double precision turnover_lacs,
        NULL::double precision deliverable_pct,'SMARTAPI_INTRADAY_PARTIAL' source,
        h.average_20 intraday_volume_average_20,h.median_90 intraday_volume_median_90,
        h.previous_1d intraday_volume_previous_1d,h.previous_2d intraday_volume_previous_2d,
        h.percentile_90 intraday_volume_percentile_90
      FROM aggregate a LEFT JOIN LATERAL (
        SELECT close_price FROM nse.fact_eod_prices
        WHERE UPPER(TRIM(symbol))=a.symbol AND trade_date<%s
        ORDER BY trade_date DESC,loaded_at DESC LIMIT 1
      ) e ON true LEFT JOIN LATERAL (
        SELECT avg(daily_volume) FILTER (WHERE rn<=20)::double precision average_20,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY daily_volume)::double precision median_90,
          max(daily_volume) FILTER (WHERE rn=1)::double precision previous_1d,
          max(daily_volume) FILTER (WHERE rn=2)::double precision previous_2d,
          avg(CASE WHEN daily_volume<=a.volume THEN 1.0 ELSE 0.0 END)::double precision percentile_90
        FROM (SELECT daily_volume,row_number() OVER (ORDER BY trade_date DESC) rn
          FROM historical_daily WHERE symbol=a.symbol ORDER BY trade_date DESC LIMIT 90) history
      ) h ON true ORDER BY a.symbol""", (
        session_open, as_of_ts, as_of_ts.date(), as_of_ts.date(), as_of_ts.timetz().replace(tzinfo=None),
        as_of_ts.date(), as_of_ts.date()
      ))
    return pd.concat([history, partial], ignore_index=True) if not partial.empty else history


def derive_features(conn: Any, prices: pd.DataFrame) -> pd.DataFrame:
    if prices.empty:
        return prices
    prices = prices.sort_values(["symbol", "trade_date"]).copy()
    prices["trade_date"] = pd.to_datetime(prices["trade_date"])
    grouped = prices.groupby("symbol", sort=False)
    for period in (1, 5, 21, 63):
        prices[f"return_{period}d_pct"] = grouped["close_price"].pct_change(period, fill_method=None) * 100
    prices["sma20"] = grouped["close_price"].transform(lambda value: value.rolling(20, min_periods=20).mean())
    prices["sma50"] = grouped["close_price"].transform(lambda value: value.rolling(50, min_periods=50).mean())
    prices["ema61"] = grouped["close_price"].transform(lambda value: value.ewm(span=61, adjust=False, min_periods=61).mean())
    ema12 = grouped["close_price"].transform(lambda value: value.ewm(span=12, adjust=False, min_periods=26).mean())
    ema26 = grouped["close_price"].transform(lambda value: value.ewm(span=26, adjust=False, min_periods=26).mean())
    prices["macd_line"] = ema12 - ema26
    prices["macd_line_pct_close"] = 100 * prices["macd_line"] / prices["close_price"]
    prices["close_vs_ema61_pct"] = 100 * (prices["close_price"] / prices["ema61"] - 1)
    prior = grouped["close_price"].shift(1)
    true_range = pd.concat([(prices.high_price-prices.low_price), (prices.high_price-prior).abs(),
                            (prices.low_price-prior).abs()], axis=1).max(axis=1)
    prices["atr14"] = true_range.groupby(prices.symbol).transform(lambda value: value.rolling(14, min_periods=14).mean())
    delta = grouped["close_price"].diff(); gain = delta.clip(lower=0); loss = -delta.clip(upper=0)
    avg_gain = gain.groupby(prices.symbol).transform(lambda value: value.ewm(alpha=1/14, adjust=False, min_periods=14).mean())
    avg_loss = loss.groupby(prices.symbol).transform(lambda value: value.ewm(alpha=1/14, adjust=False, min_periods=14).mean())
    prices["rsi_14"] = (100 - 100/(1+avg_gain/avg_loss.replace(0,np.nan))).where(avg_loss != 0, 100)
    high14 = grouped["high_price"].transform(lambda value: value.rolling(14,min_periods=14).max())
    low14 = grouped["low_price"].transform(lambda value: value.rolling(14,min_periods=14).min())
    prices["willr_14"] = -100 * (high14-prices.close_price)/(high14-low14).replace(0,np.nan)
    prices["volume_average_20"] = grouped.volume.transform(lambda value: value.shift(1).rolling(20,min_periods=20).mean())
    prices["volume_ratio_20"] = prices.volume / prices["volume_average_20"]
    prices["volume_median_90"] = grouped.volume.transform(lambda value: value.shift(1).rolling(90,min_periods=20).median())
    prices["volume_previous_1d"] = grouped.volume.shift(1)
    prices["volume_previous_2d"] = grouped.volume.shift(2)
    prices["volume_percentile_90"] = grouped.volume.transform(
        lambda value: value.rolling(91, min_periods=21).apply(
            lambda window: float(np.mean(window[:-1] <= window[-1])), raw=True
        )
    )
    partial_mask = prices.source.eq("SMARTAPI_INTRADAY_PARTIAL")
    for target, intraday in (
        ("volume_average_20", "intraday_volume_average_20"),
        ("volume_median_90", "intraday_volume_median_90"),
        ("volume_previous_1d", "intraday_volume_previous_1d"),
        ("volume_previous_2d", "intraday_volume_previous_2d"),
        ("volume_percentile_90", "intraday_volume_percentile_90"),
    ):
        if intraday in prices:
            prices.loc[partial_mask & prices[intraday].notna(), target] = prices.loc[partial_mask & prices[intraday].notna(), intraday]
    prices.loc[partial_mask, "volume_ratio_20"] = prices.loc[partial_mask, "volume"] / prices.loc[partial_mask, "volume_average_20"]
    prices["delivery_ratio_20"] = prices.deliverable_pct / grouped.deliverable_pct.transform(lambda value: value.shift(1).rolling(20,min_periods=20).mean())
    prices["prior_high_20"] = grouped.high_price.transform(lambda value: value.shift(1).rolling(20,min_periods=20).max())
    prices["prior_low_20"] = grouped.low_price.transform(lambda value: value.shift(1).rolling(20,min_periods=20).min())
    spread = prices.high_price-prices.low_price
    prices["close_location"] = ((prices.close_price-prices.low_price)/spread.replace(0,np.nan)).clip(0,1)
    prices["turnover_percentile"] = prices.groupby("trade_date").turnover_lacs.rank(pct=True)
    sectors = _frame(conn, """SELECT DISTINCT ON (UPPER(TRIM(symbol))) UPPER(TRIM(symbol)) symbol,
      COALESCE(NULLIF(TRIM(sector),''),NULLIF(TRIM(industry),''),NULLIF(TRIM(basic_industry),''),'OTHER') sector
      FROM public.index_constituents ORDER BY UPPER(TRIM(symbol)),updated_at DESC""")
    prices = prices.merge(sectors,on="symbol",how="left"); prices["sector"] = prices.sector.fillna("OTHER")
    prices["sector_return_21d_pct"] = prices.groupby(["trade_date","sector"]).return_21d_pct.transform("mean")
    regime = _frame(conn, """SELECT trade_date,instrument_type,symbol,return_21d_pct,primary_trend,market_zone,vix_regime
      FROM strategy_eval.market_regime_daily WHERE policy_version='NIFTY-SEROE-V1.0'
      AND trade_date BETWEEN %s AND %s""", (prices.trade_date.min().date(), prices.trade_date.max().date()))
    regime["trade_date"] = pd.to_datetime(regime.trade_date)
    for symbol,prefix in (("NIFTY 50","nifty"),("BANK NIFTY","bank_nifty"),("INDIA VIX","vix")):
        subset=regime[(regime.instrument_type=="INDEX")&(regime.symbol==symbol)][["trade_date","return_21d_pct","primary_trend","market_zone","vix_regime"]].rename(columns={"return_21d_pct":f"{prefix}_return_21d_pct","primary_trend":f"{prefix}_trend","market_zone":f"{prefix}_zone","vix_regime":f"{prefix}_regime"}).sort_values("trade_date")
        prices=pd.merge_asof(prices.sort_values("trade_date"),subset,on="trade_date",direction="backward",tolerance=pd.Timedelta(days=7))
    stock=_frame(conn, """SELECT trade_date,
      UPPER(REGEXP_REPLACE(yahoo_symbol,'\\.NS$','')) symbol,
      CASE primary_trend WHEN 'UP_TREND' THEN 'UPWARD' WHEN 'DOWN_TREND' THEN 'DOWNWARD'
        ELSE primary_trend END stock_trend,
      market_zone stock_zone
      FROM strategy_eval.stock_daily_regime
      WHERE trade_date BETWEEN %s AND %s""",
      (prices.trade_date.min().date(),prices.trade_date.max().date()))
    stock["trade_date"]=pd.to_datetime(stock.trade_date)
    prices=prices.merge(stock,on=["trade_date","symbol"],how="left")
    prices["nifty_return_21d_pct"] = prices.nifty_return_21d_pct.fillna(prices.groupby("trade_date").return_21d_pct.transform("mean"))
    return prices


def _number(value: Any) -> float | None:
    return None if value is None or pd.isna(value) else float(value)


def _gate(passed: bool, blocking: bool, actual: Any, rule: str, fields: list[str], source: str) -> dict[str, Any]:
    return {"passed": bool(passed), "blocking": blocking, "actual": actual, "rule": rule, "fields": fields, "source_table": source}


def evaluate_latest(conn: Any, signal_date: date, as_of_ts: datetime | None = None) -> list[dict[str, Any]]:
    prices = derive_features(conn, load_prices(conn, signal_date, as_of_ts))
    feature_date = prices.trade_date.max().date() if not prices.empty else signal_date
    latest = prices[prices.trade_date.dt.date == feature_date].copy()
    signal_date = feature_date
    universe = {row["symbol"]: row for row in conn.execute(
        "SELECT symbol,is_fno,is_nifty50,source,refreshed_at FROM oiis_live.universe_member WHERE active"
    ).fetchall()}
    output = []
    for row in latest.itertuples(index=False):
        feature=OIISFeature(symbol=row.symbol,trade_date=feature_date.isoformat(),open_price=float(row.open_price),high_price=float(row.high_price),low_price=float(row.low_price),close_price=float(row.close_price),prev_close=float(row.prev_close or row.open_price),volume_ratio_20=_number(row.volume_ratio_20),delivery_ratio_20=_number(row.delivery_ratio_20),turnover_percentile=_number(row.turnover_percentile),close_location=_number(row.close_location),return_1d_pct=_number(row.return_1d_pct),return_5d_pct=_number(row.return_5d_pct),return_21d_pct=_number(row.return_21d_pct),return_63d_pct=_number(row.return_63d_pct),nifty_return_21d_pct=_number(row.nifty_return_21d_pct),sector_return_21d_pct=_number(row.sector_return_21d_pct),rsi_14=_number(row.rsi_14),sma20=_number(row.sma20),sma50=_number(row.sma50),atr14=_number(row.atr14),prior_high_20=_number(row.prior_high_20),prior_low_20=_number(row.prior_low_20),stock_trend=None if pd.isna(row.stock_trend) else str(row.stock_trend),stock_zone=None if pd.isna(row.stock_zone) else str(row.stock_zone),nifty_trend=None if pd.isna(row.nifty_trend) else str(row.nifty_trend),nifty_zone=None if pd.isna(row.nifty_zone) else str(row.nifty_zone),bank_nifty_trend=None if pd.isna(row.bank_nifty_trend) else str(row.bank_nifty_trend),bank_nifty_zone=None if pd.isna(row.bank_nifty_zone) else str(row.bank_nifty_zone),vix_regime=None if pd.isna(row.vix_regime) else str(row.vix_regime),source_reliability=85.0 if row.source=="YFINANCE_FALLBACK" else 98.0)
        result = evaluate_feature(feature, {
            "ofactor_min": OFACTOR_THRESHOLDS["LOW"],
            "directional_edge_min": DIRECTIONAL_EDGE_THRESHOLDS["LOW"],
            "disabled_gates": ["TRIGGER_CONFIRMATION_MISSING", "STOP_TOO_WIDE"],
        })
        edge = float(result["directional_edge"])
        direction = "LONG" if edge >= DIRECTIONAL_EDGE_THRESHOLDS["LOW"] else "SHORT" if edge <= -DIRECTIONAL_EDGE_THRESHOLDS["LOW"] else "NEUTRAL"
        ofactor = result["ofactor_short"] if direction == "SHORT" else result["ofactor_long"]
        volume_ratio = _number(row.volume_ratio_20)
        turnover_percentile = _number(row.turnover_percentile)
        volume_percentile = _number(row.volume_percentile_90)
        volume_good = bool((volume_ratio is not None and volume_ratio >= 1.2) or (volume_percentile is not None and volume_percentile >= 0.30))
        long_breakout = bool(_number(row.prior_high_20) is not None and row.close_price > row.prior_high_20 and volume_good)
        long_pullback = bool(_number(row.sma20) is not None and _number(row.sma50) is not None and row.low_price <= row.sma20 < row.close_price and row.sma20 > row.sma50 and volume_good)
        short_breakdown = bool(_number(row.prior_low_20) is not None and row.close_price < row.prior_low_20 and volume_good)
        short_pullback = bool(_number(row.sma20) is not None and _number(row.sma50) is not None and row.high_price >= row.sma20 > row.close_price and row.sma20 < row.sma50 and volume_good)
        setup_pass = (long_breakout or long_pullback) if direction != "SHORT" else (short_breakdown or short_pullback)
        primary_liquidity_available = volume_ratio is not None and turnover_percentile is not None
        primary_liquidity_pass = bool(primary_liquidity_available and volume_ratio >= 0.75 and turnover_percentile >= 0.10)
        fallback_liquidity_pass = bool(volume_percentile is not None and volume_percentile >= VOLUME_PERCENTILE_THRESHOLDS["MEDIUM"])
        liquidity_pass = primary_liquidity_pass if primary_liquidity_available else fallback_liquidity_pass
        extension_atr = result["xfactor"].get("extension_atr")
        reward_risk = _number(result["xfactor"].get("reward_risk"))
        risk_per_share = _number(result["xfactor"].get("risk_per_share"))
        risk_atr = None if _number(row.atr14) in (None, 0) or risk_per_share is None else risk_per_share / float(row.atr14)
        o_level = minimum_level(float(ofactor["final_score"]), OFACTOR_THRESHOLDS)
        edge_level = minimum_level(abs(edge), DIRECTIONAL_EDGE_THRESHOLDS)
        volume_level = minimum_level(volume_percentile, VOLUME_PERCENTILE_THRESHOLDS)
        extension_band = extension_level(_number(extension_atr))
        gate_evidence = {
            "OFACTOR_BELOW_MINIMUM": _gate(o_level != "BELOW_MINIMUM", True, {"selected": ofactor["final_score"], "long": result["ofactor_long"]["final_score"], "short": result["ofactor_short"]["final_score"], "level": o_level}, "selected OFactor >= 54; LOW 54, MEDIUM 64, HIGH 74", ["ofactor_long", "ofactor_short", "selected_ofactor"], "oiis_live.daily_candidate.component_scores/evidence"),
            "DIRECTIONAL_EDGE_BELOW_MINIMUM": _gate(edge_level != "BELOW_MINIMUM", True, {"edge": edge, "absolute_edge": abs(edge), "level": edge_level}, "abs(long OFactor - short OFactor) >= 6; LOW 6, MEDIUM 7, HIGH 8", ["ofactor_long", "ofactor_short", "directional_edge"], "oiis_live.daily_candidate"),
            "NO_VALID_SETUP": _gate(setup_pass, True, {"direction": direction, "long_breakout": long_breakout, "long_pullback": long_pullback, "short_breakdown": short_breakdown, "short_pullback": short_pullback, "volume_good": volume_good}, "directional breakout/breakdown or SMA20/SMA50 pullback with good volume", ["open", "high", "low", "close", "sma20", "sma50", "prior_high_20", "prior_low_20", "volume_ratio_20", "volume_percentile_90"], "nse.fact_eod_prices + derived rolling features"),
            "INSUFFICIENT_LIQUIDITY": _gate(liquidity_pass, True, {"volume_ratio_20": volume_ratio, "turnover_percentile": turnover_percentile, "volume_percentile_90": volume_percentile, "primary_used": primary_liquidity_available, "volume_level": volume_level}, "primary: volume ratio >= 0.75 and turnover percentile >= 0.10; fallback: 90-day volume percentile >= 0.30", ["volume", "volume_average_20", "turnover_lacs", "volume_percentile_90"], "nse.fact_eod_prices"),
            "REWARD_RISK_BELOW_MINIMUM": _gate(reward_risk is not None and reward_risk >= 1.5, True, {"reward_risk": reward_risk, "risk_per_share": risk_per_share, "structural_stop": result["xfactor"].get("structural_stop")}, "reward/risk >= 1.5", ["close", "low/high", "sma20", "prior_high_20/prior_low_20", "atr14"], "nse.fact_eod_prices + derived rolling features"),
            "EXCESSIVE_EXTENSION": _gate(extension_atr is not None and extension_atr <= 1.5, True, {"extension_atr": extension_atr, "level": extension_band, "close": float(row.close_price), "sma20": _number(row.sma20), "atr14": _number(row.atr14)}, "abs(close - SMA20) / ATR14 <= 1.5; profiles 1.2/1.4/1.5", ["close", "sma20", "atr14"], "nse.fact_eod_prices + derived rolling features"),
            "STOP_TOO_WIDE": _gate(risk_atr is not None and risk_atr <= 2.5, False, {"risk_atr": risk_atr, "risk_per_share": risk_per_share, "atr14": _number(row.atr14)}, "risk per share / ATR14 <= 2.5; recorded but non-blocking", ["structural_stop", "risk_per_share", "atr14"], "oiis_live.daily_candidate.evidence"),
            "XFACTOR_BELOW_MINIMUM": _gate(float(result["xfactor"]["score"]) >= 76, True, {"xfactor": result["xfactor"]["score"]}, "XFactor >= 76", ["xfactor_snapshot"], "oiis_live.daily_candidate.component_scores/evidence"),
            "DATA_QUALITY_BELOW_MINIMUM": _gate(float(result["dq"]["score"]) >= 85 and result["dq"]["permission"] == "FULL", True, {"score": result["dq"]["score"], "permission": result["dq"]["permission"]}, "data quality >= 85 and permission FULL", ["data_quality", "data_permission"], "oiis_live.daily_candidate"),
        }
        blocking_reasons = [code for code, detail in gate_evidence.items() if detail["blocking"] and not detail["passed"]]
        all_reasons = [code for code, detail in gate_evidence.items() if not detail["passed"]]
        values={"selected_direction":direction,"selected_ofactor":ofactor["final_score"],"selected_xfactor":result["xfactor"]["score"],"data_quality_score":result["dq"]["score"],"data_permission":result["dq"]["permission"],"blocking_reasons":blocking_reasons,"directional_edge":edge,"volume_percentile_90":volume_percentile,"extension_atr":extension_atr}
        classification=classify_daily(values)
        token=conn.execute("SELECT symbol_token FROM public.instruments WHERE exchange='NSE' AND (tradingsymbol=%s OR tradingsymbol=%s) ORDER BY updated_at DESC LIMIT 1",(row.symbol,row.symbol+'-EQ')).fetchone()
        member = universe.get(row.symbol) or {}
        feature_values = {"open": float(row.open_price), "high": float(row.high_price), "low": float(row.low_price), "close": float(row.close_price), "previous_close": _number(row.prev_close), "volume_current": _number(row.volume), "volume_previous_1d": _number(row.volume_previous_1d), "volume_previous_2d": _number(row.volume_previous_2d), "volume_average_20": _number(row.volume_average_20), "volume_median_90": _number(row.volume_median_90), "volume_ratio_20": volume_ratio, "volume_percentile_90": volume_percentile, "turnover_lacs": _number(row.turnover_lacs), "turnover_percentile": turnover_percentile, "sma20": _number(row.sma20), "sma50": _number(row.sma50), "ema61": _number(row.ema61), "atr14": _number(row.atr14), "prior_high_20": _number(row.prior_high_20), "prior_low_20": _number(row.prior_low_20), "rsi14": _number(row.rsi_14), "willr14": _number(row.willr_14), "macd_line": _number(row.macd_line), "close_vs_ema61_pct": _number(row.close_vs_ema61_pct), "reward_risk": reward_risk, "extension_atr": extension_atr, "risk_atr": risk_atr}
        output.append({"symbol":row.symbol,"sector":row.sector,"instrument_token":token["symbol_token"] if token else None,"signal_date":signal_date,"direction":direction,"daily_level":classification.level,"ofactor_level":o_level,"directional_edge_level":edge_level,"extension_level":extension_band,"volume_level":volume_level,"canonical_status":classification.canonical_status,"selected":classification.selected,"data_quality":result["dq"]["score"],"data_permission":result["dq"]["permission"],"ofactor":ofactor["final_score"],"xfactor":result["xfactor"]["score"],"directional_edge":edge,"rsi14":_number(row.rsi_14),"willr14":_number(row.willr_14),"ema61":_number(row.ema61),"macd_line":_number(row.macd_line),"atr14":_number(row.atr14),"volume_vs_sma20":volume_ratio,"volume_percentile_90":volume_percentile,"reference_price":float(row.close_price),"failed_gate_count":len(all_reasons),"blocking_gate_count":len(blocking_reasons),"component_scores":{"ofactor_long":result["ofactor_long"],"ofactor_short":result["ofactor_short"],"xfactor":result["xfactor"]},"market_context":{"nifty_trend":feature.nifty_trend,"stock_trend":feature.stock_trend,"vix_regime":feature.vix_regime,"source":row.source},"conditions":classification.conditions,"reason_codes":all_reasons,"gate_evidence":gate_evidence,"feature_values":feature_values,"universe_flags":{"is_fno":bool(member.get("is_fno")),"is_nifty50":bool(member.get("is_nifty50")),"source":member.get("source")},"evidence":result})
    evaluated_symbols = {item["symbol"] for item in output}
    for symbol, member in sorted(universe.items()):
        if symbol in evaluated_symbols or not (member.get("is_fno") or member.get("is_nifty50")):
            continue
        token = conn.execute(
            """SELECT symbol_token FROM public.instruments WHERE exchange='NSE'
               AND (tradingsymbol=%s OR tradingsymbol=%s)
               ORDER BY updated_at DESC LIMIT 1""",
            (symbol, symbol + "-EQ"),
        ).fetchone()
        gate_evidence = {
            "DATA_QUALITY_BELOW_MINIMUM": _gate(
                False,
                True,
                {"score": 0, "permission": "DATA_INSUFFICIENT"},
                "a current daily or intraday feature row is required",
                ["trade_date", "open", "high", "low", "close", "volume"],
                "nse.fact_eod_prices / strategy_eval.stock_daily_regime / public.bars_1m",
            )
        }
        output.append(
            {
                "symbol": symbol,
                "sector": "UNKNOWN",
                "instrument_token": token["symbol_token"] if token else None,
                "signal_date": signal_date,
                "direction": "NEUTRAL",
                "daily_level": "NO_CANDIDATE",
                "ofactor_level": "NOT_ESTIMABLE",
                "directional_edge_level": "NOT_ESTIMABLE",
                "extension_level": "NOT_ESTIMABLE",
                "volume_level": "NOT_ESTIMABLE",
                "canonical_status": "RESEARCH_ONLY",
                "selected": False,
                "data_quality": 0,
                "data_permission": "DATA_INSUFFICIENT",
                "ofactor": 0,
                "xfactor": 0,
                "directional_edge": 0,
                "rsi14": None,
                "willr14": None,
                "ema61": None,
                "macd_line": None,
                "atr14": None,
                "volume_vs_sma20": None,
                "volume_percentile_90": None,
                "reference_price": None,
                "failed_gate_count": 1,
                "blocking_gate_count": 1,
                "component_scores": {},
                "market_context": {"source": "DATA_UNAVAILABLE"},
                "conditions": {"DATA_AVAILABLE": False},
                "reason_codes": ["DATA_QUALITY_BELOW_MINIMUM"],
                "gate_evidence": gate_evidence,
                "feature_values": {},
                "universe_flags": {
                    "is_fno": bool(member.get("is_fno")),
                    "is_nifty50": bool(member.get("is_nifty50")),
                    "source": member.get("source"),
                },
                "evidence": {"status": "DATA_INSUFFICIENT"},
            }
        )

    output.sort(
        key=lambda item: (
            item["data_permission"] == "DATA_INSUFFICIENT",
            item["blocking_gate_count"],
            item["failed_gate_count"],
            -item["ofactor"],
            -abs(item["directional_edge"]),
            -item["data_quality"],
            item["symbol"],
        )
    )
    selected_rank = 0
    for index, item in enumerate(output, start=1):
        item["recommended"] = index <= 10
        item["recommendation_rank"] = index if index <= 10 else None
        if item["selected"]:
            selected_rank += 1
            item["rank"] = selected_rank
        else:
            item["rank"] = None
    return output


def result_hash(rows: list[dict[str, Any]]) -> str:
    return hashlib.sha256(json.dumps(rows,sort_keys=True,default=str,separators=(",",":")).encode()).hexdigest()
