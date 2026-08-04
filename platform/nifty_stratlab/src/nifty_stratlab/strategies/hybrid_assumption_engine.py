"""Deterministic v1 compiler for the narrative hybrid catalogue.

This is an explicitly assumed research interpretation, not the source author's
only possible interpretation.  It converts recognised phrases to frozen,
point-in-time feature clauses and records every applied assumption.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd


ASSUMPTION_VERSION = "hybrid_narrative_assumptions_v1"


@dataclass(frozen=True)
class CompiledRule:
    strategy_id: str
    assumptions: tuple[str, ...]
    ignored_phrases: tuple[str, ...] = ()


def _rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff(); gain = delta.clip(lower=0); loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    avg_loss = loss.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return (100 - 100 / (1 + rs)).fillna(100)


def build_feature_frame(raw: pd.DataFrame, market_raw: pd.DataFrame | None = None, vix_raw: pd.DataFrame | None = None) -> pd.DataFrame:
    f = raw.copy().sort_values("date").reset_index(drop=True)
    f["date"] = pd.to_datetime(f["date"])
    for c in ("open", "high", "low", "close", "volume"): f[c] = pd.to_numeric(f[c], errors="coerce")
    f["session"] = f.date.dt.date; f["clock"] = f.date.dt.strftime("%H:%M")
    g = f.groupby("session", sort=False)
    close = f.close
    f["rsi14"] = g.close.transform(_rsi)
    hh = g.high.transform(lambda s: s.rolling(14, min_periods=14).max())
    ll = g.low.transform(lambda s: s.rolling(14, min_periods=14).min())
    f["willr14"] = -100 * (hh - close) / (hh - ll).replace(0, np.nan)
    for n in (9, 13, 20, 21, 50): f[f"ema{n}"] = g.close.transform(lambda s, n=n: s.ewm(span=n, adjust=False).mean())
    f["sma20"] = g.close.transform(lambda s: s.rolling(20, min_periods=20).mean())
    std20 = g.close.transform(lambda s: s.rolling(20, min_periods=20).std(ddof=0))
    f["bb_lower"] = f.sma20 - 2 * std20; f["bb_upper"] = f.sma20 + 2 * std20
    f["bb_width"] = (f.bb_upper - f.bb_lower) / f.sma20.replace(0, np.nan)
    typical = (f.high + f.low + f.close) / 3
    f["vwap"] = (typical * f.volume).groupby(f.session).cumsum() / f.volume.groupby(f.session).cumsum().replace(0, np.nan)
    f["vwap"] = f.vwap.fillna(f.close)
    f["volume_ratio"] = f.volume / g.volume.transform(lambda s: s.rolling(20, min_periods=5).mean()).replace(0, np.nan)
    f["close_location"] = (f.close - f.low) / (f.high - f.low).replace(0, np.nan)
    prev_close = g.close.shift(1); tr = pd.concat([(f.high-f.low), (f.high-prev_close).abs(), (f.low-prev_close).abs()], axis=1).max(axis=1)
    f["atr14"] = tr.groupby(f.session).transform(lambda s: s.rolling(14, min_periods=14).mean())
    low14 = g.low.transform(lambda s: s.rolling(14, min_periods=14).min()); high14 = g.high.transform(lambda s: s.rolling(14, min_periods=14).max())
    f["stoch_k"] = 100 * (f.close-low14)/(high14-low14).replace(0,np.nan); f["stoch_d"] = f.stoch_k.groupby(f.session).transform(lambda s:s.rolling(3).mean())
    tp = typical; tpma = tp.groupby(f.session).transform(lambda s:s.rolling(20,min_periods=20).mean()); md=(tp-tpma).abs().groupby(f.session).transform(lambda s:s.rolling(20,min_periods=20).mean())
    f["cci20"] = (tp-tpma)/(0.015*md.replace(0,np.nan))
    ema12=g.close.transform(lambda s:s.ewm(span=12,adjust=False).mean()); ema26=g.close.transform(lambda s:s.ewm(span=26,adjust=False).mean())
    f["macd"] = ema12-ema26; f["macd_signal"] = f.macd.groupby(f.session).transform(lambda s:s.ewm(span=9,adjust=False).mean()); f["macd_hist"] = f.macd-f.macd_signal
    f["green"] = f.close > f.open; f["red"] = f.close < f.open
    body=(f.close-f.open).abs(); f["hammer"]=(np.minimum(f.open,f.close)-f.low >= 2*body) & (f.close_location>=.65)
    f["doji"] = body <= .15*(f.high-f.low); f["marubozu"] = body >= .85*(f.high-f.low)
    f["engulfing"] = f.green & g.red.shift(1).eq(True) & (f.open<=g.close.shift(1)) & (f.close>=g.open.shift(1))
    f["inside"]=(f.high<g.high.shift(1))&(f.low>g.low.shift(1)); f["outside"]=(f.high>g.high.shift(1))&(f.low<g.low.shift(1))
    f["cross_vwap_up"]=(f.close>f.vwap)&(g.close.shift(1)<=g.vwap.shift(1)); f["cross_bb_up"]=(f.close>f.bb_lower)&(g.close.shift(1)<=g.bb_lower.shift(1))
    f["cross_ema_up"]=(f.ema9>f.ema21)&(g.ema9.shift(1)<=g.ema21.shift(1)); f["cross_macd_up"]=(f.macd_hist>0)&(g.macd_hist.shift(1)<=0)
    f["cross_rsi30_up"]=(f.rsi14>30)&(g.rsi14.shift(1)<=30); f["cross_willr80_up"]=(f.willr14>-80)&(g.willr14.shift(1)<=-80)
    f["cross_stoch_up"]=(f.stoch_k>f.stoch_d)&(g.stoch_k.shift(1)<=g.stoch_d.shift(1))
    first15=f.clock.between("09:15","09:29"); first30=f.clock.between("09:15","09:44"); first60=f.clock.between("09:15","10:14")
    for name,mask in (("or15",first15),("or30",first30),("first60",first60)):
        highs=f.high.where(mask).groupby(f.session).transform("max"); lows=f.low.where(mask).groupby(f.session).transform("min")
        f[f"{name}_high"]=highs; f[f"{name}_low"]=lows
    daily=g.agg(open=("open","first"),high=("high","max"),low=("low","min"),close=("close","last"),volume=("volume","sum"))
    daily["daily_rsi"]=_rsi(daily.close); daily["daily_ema20"]=daily.close.ewm(span=20,adjust=False).mean(); daily["daily_ema50"]=daily.close.ewm(span=50,adjust=False).mean()
    daily["daily_atr"] = pd.concat([(daily.high-daily.low),(daily.high-daily.close.shift()).abs(),(daily.low-daily.close.shift()).abs()],axis=1).max(axis=1).rolling(14).mean()
    daily["daily_high20"] = daily.high.shift(1).rolling(20).max(); daily["daily_high252"] = daily.high.shift(1).rolling(252,min_periods=100).max(); daily["daily_low20"] = daily.low.shift(1).rolling(20).min()
    daily["daily_vol20"] = daily.volume.shift(1).rolling(20).mean(); daily["prev_high"]=daily.high.shift(1); daily["prev_low"]=daily.low.shift(1); daily["prev_close"]=daily.close.shift(1)
    daily["prev2_high"]=daily.high.shift(2); daily["prev2_low"]=daily.low.shift(2)
    lag=daily.shift(1)
    for col in lag.columns: f[col] = f.session.map(lag[col])
    f["gap_atr"]=(f.open.groupby(f.session).transform("first")-f.prev_close)/f.daily_atr.replace(0,np.nan)
    f["ret15"] = g.close.pct_change(15, fill_method=None)*100; f["ret60"] = g.close.pct_change(60, fill_method=None)*100
    f["above_vwap_time"] = f.close.gt(f.vwap).groupby(f.session).expanding().mean().reset_index(level=0,drop=True)
    f["vwap_cross_count"] = f.cross_vwap_up.groupby(f.session).cumsum()
    if market_raw is not None and not market_raw.empty:
        market=market_raw.copy(); market["date"]=pd.to_datetime(market.date); market=market.sort_values("date")
        market["session"]=market.date.dt.date; market["close"]=pd.to_numeric(market.close,errors="coerce")
        market["index_ret15"]=market.groupby("session").close.pct_change(15,fill_method=None)*100
        f=f.merge(market[["date","close","index_ret15"]].rename(columns={"close":"index_close"}),on="date",how="left")
    else:
        f["index_close"]=np.nan; f["index_ret15"]=0.0
    if vix_raw is not None and not vix_raw.empty:
        vix=vix_raw.copy(); vix["date"]=pd.to_datetime(vix.date); vix["vix_close"]=pd.to_numeric(vix.close,errors="coerce")
        f=f.merge(vix[["date","vix_close"]],on="date",how="left")
    else: f["vix_close"]=np.nan
    f["residual_ret15"] = f.ret15-f.index_ret15.fillna(0)
    f["breadth_proxy_pct"] = np.where(f.index_ret15.fillna(0)>=0,60.0,40.0)
    return f


def compile_rule(strategy: dict[str, Any]) -> CompiledRule:
    text = " ".join(str(strategy.get(k, "")) for k in ("context_filter","setup_and_trigger","confirmation","entry_window")).lower()
    assumptions = [f"family_profile:{strategy['family'].lower().replace(' ','_')}"]
    phrases = {
        "rsi": "rsi_wilder_14", "williams": "willr_14", "vwap": "session_vwap",
        "bollinger": "bollinger_20_2_population", "ema": "ema_completed_bar",
        "macd": "macd_12_26_9", "opening range": "opening_range_clock_ist",
        "volume": "volume_ratio_20bar", "hammer": "hammer_wick_2x_body",
        "engulf": "real_body_engulfing", "inside bar": "strict_inside_bar",
        "52-week": "rolling_252_session_high", "20-day": "rolling_20_session_level",
        "sector": "static_sector_map_and_nifty_proxy_if_missing", "breadth": "nifty100_current_panel_proxy",
        "residual": "stock_return_minus_nifty_return_beta1_proxy", "adx": "trend_strength_proxy_ema_spread",
        "supertrend": "atr_trend_proxy", "stochastic": "stochastic_14_3", "cci": "cci_20",
    }
    assumptions.extend(v for k,v in phrases.items() if k in text)
    return CompiledRule(strategy["strategy_id"], tuple(dict.fromkeys(assumptions)))


def evaluate_strategy(strategy: dict[str, Any], f: pd.DataFrame) -> tuple[pd.Series, CompiledRule]:
    sid=strategy["strategy_id"]; family=strategy["family"]; text=" ".join([strategy["context_filter"],strategy["setup_and_trigger"],strategy["confirmation"]]).lower()
    mask=pd.Series(True,index=f.index); rule=compile_rule(strategy)
    windows={"Control":"09:15-15:00","Mean reversion":"09:20-13:00","Trend continuation":"09:30-14:00","Breakout":"09:30-14:00","Time pattern":"09:15-15:00","Gap pattern":"09:15-15:00","Candlestick hybrid":"09:30-14:00","Relative strength":"09:45-14:00","Swing":"15:20-15:29"}
    start,end=windows[family].split("-"); mask &= f.clock.between(start,end)
    if family=="Control":
        profiles={"CTL01":f.clock.eq("10:00"),"CTL02":f.clock.eq("09:16"),"CTL03":f.cross_vwap_up,"CTL04":f.rsi14.lt(15)&f.daily_rsi.gt(40),"CTL05":f.cross_ema_up,"CTL06":f.close.gt(f.or15_high)}
        return (mask & profiles[sid]).fillna(False),rule
    if family=="Mean reversion": mask &= (f.rsi14<35)|(f.close<f.bb_lower)|(f.gap_atr<-.5)
    elif family=="Trend continuation": mask &= (f.close>f.vwap)&(f.ema9>f.ema21)
    elif family=="Breakout": mask &= (f.close>f.or15_high)|(f.close>f.prev_high)|(f.close>f.bb_upper)
    elif family in ("Time pattern","Gap pattern"): mask &= f.green if "continuation" in text else (f.cross_vwap_up|f.green)
    elif family=="Candlestick hybrid": mask &= f.hammer|f.engulfing|f.inside|f.outside|f.marubozu|f.doji
    elif family=="Relative strength": mask &= (f.residual_ret15>0.3)&(f.close>f.vwap)
    elif family=="Swing": mask &= f.clock.between("15:20","15:29") & ((f.close>f.daily_ema20)|(f.close>f.daily_high20))
    if "vwap" in text: mask &= f.close>=f.vwap
    if "volume" in text: mask &= f.volume_ratio.fillna(0)>=1.0
    if "hammer" in text or "pin bar" in text: mask &= f.hammer
    if "engulf" in text: mask &= f.engulfing
    if "inside bar" in text: mask &= f.inside
    if "macd" in text: mask &= f.macd_hist>0
    if "stochastic" in text: mask &= f.cross_stoch_up
    if "williams" in text: mask &= f.willr14>-80
    if "lower bollinger" in text: mask &= f.cross_bb_up|f.close.le(f.bb_lower)
    if "previous-day high" in text or "prior-day high" in text: mask &= f.close>f.prev_high
    if "52-week high" in text: mask &= f.close>=f.daily_high252
    if "20-day high" in text: mask &= f.close>=f.daily_high20
    if "gap up" in text: mask &= f.gap_atr>0.1
    if "gap down" in text: mask &= f.gap_atr<-.1
    if "breadth" in text or "participation" in text: mask &= f.breadth_proxy_pct>=55
    if "market not in" in text and "panic" in text: mask &= f.index_ret15.fillna(0)>-1.0
    if "nifty" in text and "non-negative" in text: mask &= f.index_ret15.fillna(0)>=0
    if "daily rsi" in text and "50–70" in text: mask &= f.daily_rsi.between(50,70)
    return mask.fillna(False),rule
