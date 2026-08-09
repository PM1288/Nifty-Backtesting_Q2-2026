from __future__ import annotations

import hashlib
import json
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
from nifty_stratlab.oiis import OIISFeature, evaluate_feature

from .policy import classify_daily

IST = ZoneInfo("Asia/Kolkata")


def _frame(conn: Any, query: str, params: tuple[Any, ...] = ()) -> pd.DataFrame:
    with conn.cursor() as cur:
        cur.execute(query, params)
        rows = cur.fetchall()
        return pd.DataFrame(rows, columns=[column.name for column in cur.description])


def load_prices(conn: Any, signal_date: date) -> pd.DataFrame:
    warmup = signal_date - timedelta(days=180)
    return _frame(conn, """
      WITH universe AS (
        SELECT DISTINCT UPPER(REGEXP_REPLACE(yahoo_symbol,'\\.NS$','')) symbol
        FROM strategy_eval.stock_daily_regime
        WHERE trade_date >= %s - 30
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
    """, (signal_date, warmup, signal_date, warmup, signal_date))


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
    prices["volume_ratio_20"] = prices.volume / grouped.volume.transform(lambda value: value.shift(1).rolling(20,min_periods=20).mean())
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


def evaluate_latest(conn: Any, signal_date: date) -> list[dict[str, Any]]:
    prices = derive_features(conn, load_prices(conn, signal_date))
    latest = prices[prices.trade_date.dt.date == signal_date].copy()
    output=[]
    for row in latest.itertuples(index=False):
        feature=OIISFeature(symbol=row.symbol,trade_date=signal_date.isoformat(),open_price=float(row.open_price),high_price=float(row.high_price),low_price=float(row.low_price),close_price=float(row.close_price),prev_close=float(row.prev_close or row.open_price),volume_ratio_20=_number(row.volume_ratio_20),delivery_ratio_20=_number(row.delivery_ratio_20),turnover_percentile=_number(row.turnover_percentile),close_location=_number(row.close_location),return_1d_pct=_number(row.return_1d_pct),return_5d_pct=_number(row.return_5d_pct),return_21d_pct=_number(row.return_21d_pct),return_63d_pct=_number(row.return_63d_pct),nifty_return_21d_pct=_number(row.nifty_return_21d_pct),sector_return_21d_pct=_number(row.sector_return_21d_pct),rsi_14=_number(row.rsi_14),sma20=_number(row.sma20),sma50=_number(row.sma50),atr14=_number(row.atr14),prior_high_20=_number(row.prior_high_20),prior_low_20=_number(row.prior_low_20),stock_trend=None if pd.isna(row.stock_trend) else str(row.stock_trend),stock_zone=None if pd.isna(row.stock_zone) else str(row.stock_zone),nifty_trend=None if pd.isna(row.nifty_trend) else str(row.nifty_trend),nifty_zone=None if pd.isna(row.nifty_zone) else str(row.nifty_zone),bank_nifty_trend=None if pd.isna(row.bank_nifty_trend) else str(row.bank_nifty_trend),bank_nifty_zone=None if pd.isna(row.bank_nifty_zone) else str(row.bank_nifty_zone),vix_regime=None if pd.isna(row.vix_regime) else str(row.vix_regime),source_reliability=85.0 if row.source=="YFINANCE_FALLBACK" else 98.0)
        result=evaluate_feature(feature); direction=result["direction"]; ofactor=result["ofactor_long"] if direction=="LONG" else result["ofactor_short"]
        values={"selected_direction":direction,"selected_ofactor":ofactor["final_score"],"selected_xfactor":result["xfactor"]["score"],"data_quality_score":result["dq"]["score"],"data_permission":result["dq"]["permission"],"hard_gates":result["xfactor"]["hard_gates"],"rsi_14":row.rsi_14,"willr_14":row.willr_14,"close_vs_ema61_pct":row.close_vs_ema61_pct,"macd_line_pct_close":row.macd_line_pct_close,"atr14":row.atr14,"close_price":row.close_price,"volume_vs_sma20":row.volume_ratio_20,"selected_mrs":ofactor["components"]["market_regime_support"],"selected_siq":result["xfactor"]["components"]["stop_invalidation_quality"],"selected_elq":result["xfactor"]["components"]["entry_location_quality"],"selected_mss":result["xfactor"]["components"]["market_sector_synchronisation"]}
        classification=classify_daily(values)
        token=conn.execute("SELECT symbol_token FROM public.instruments WHERE exchange='NSE' AND (tradingsymbol=%s OR tradingsymbol=%s) ORDER BY updated_at DESC LIMIT 1",(row.symbol,row.symbol+'-EQ')).fetchone()
        output.append({"symbol":row.symbol,"sector":row.sector,"instrument_token":token["symbol_token"] if token else None,"signal_date":signal_date,"direction":direction,"daily_level":classification.level,"canonical_status":classification.canonical_status,"selected":classification.selected,"data_quality":result["dq"]["score"],"data_permission":result["dq"]["permission"],"ofactor":ofactor["final_score"],"xfactor":result["xfactor"]["score"],"directional_edge":result["directional_edge"],"rsi14":_number(row.rsi_14),"willr14":_number(row.willr_14),"ema61":_number(row.ema61),"macd_line":_number(row.macd_line),"atr14":_number(row.atr14),"volume_vs_sma20":_number(row.volume_ratio_20),"reference_price":float(row.close_price),"component_scores":{"ofactor":ofactor["components"],"xfactor":result["xfactor"]["components"]},"market_context":{"nifty_trend":feature.nifty_trend,"stock_trend":feature.stock_trend,"vix_regime":feature.vix_regime,"source":row.source},"conditions":classification.conditions,"reason_codes":result["xfactor"]["hard_gates"],"evidence":result})
    output.sort(key=lambda item:(-item["ofactor"],-item["directional_edge"],-item["data_quality"],item["symbol"]))
    rank=0
    for item in output:
        if item["selected"]:
            rank+=1; item["rank"]=rank
        else: item["rank"]=None
    return output


def result_hash(rows: list[dict[str, Any]]) -> str:
    return hashlib.sha256(json.dumps(rows,sort_keys=True,default=str,separators=(",",":")).encode()).hexdigest()
