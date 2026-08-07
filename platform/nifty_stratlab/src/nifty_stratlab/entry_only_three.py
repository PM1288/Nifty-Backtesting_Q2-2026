"""Immutable entry-only detectors for the three supplied Nifty strategies.

These functions decide entries only.  Exit, ladder and H30 evaluation are
owned by the shared Rules-of-Engagement modules.
"""
from __future__ import annotations
from typing import Any
import numpy as np
import pandas as pd

EMA61 = "EMA61_OHLC_ZONE_RECLAIM_RSI_WILLR_V1"
ICE = "ICE_SIDEWAYS_ACCUMULATION_TWO_CLOSE_V1"
MONTHLY = "MONTHLY_TWO_RED_ONE_GREEN_WEEKLY_GREEN_V1"

def _rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff(); gain = delta.clip(lower=0); loss = -delta.clip(upper=0)
    ag = pd.Series(np.nan, index=close.index); al = pd.Series(np.nan, index=close.index)
    if len(close) > period:
        ag.iloc[period] = gain.iloc[1:period + 1].mean(); al.iloc[period] = loss.iloc[1:period + 1].mean()
        for i in range(period + 1, len(close)):
            ag.iloc[i] = (ag.iloc[i - 1] * (period - 1) + gain.iloc[i]) / period
            al.iloc[i] = (al.iloc[i - 1] * (period - 1) + loss.iloc[i]) / period
    rs = ag / al.replace(0, np.nan); result = 100 - 100 / (1 + rs)
    return result.mask((al == 0) & (ag > 0), 100).mask((al == 0) & (ag == 0), 50)

def _prepared(rows: pd.DataFrame) -> pd.DataFrame:
    df = rows.rename(columns={"trade_date":"date", "open_price":"open", "high_price":"high", "low_price":"low", "close_price":"close", "volume":"volume"}).copy()
    return df.sort_values("date").reset_index(drop=True)

def ema61_zone_reclaim(rows: pd.DataFrame) -> list[dict[str, Any]]:
    df = _prepared(rows)
    for col in ("open", "high", "low", "close"):
        df[f"ema_{col}"] = df[col].ewm(span=61, adjust=False, min_periods=61).mean()
    df["zone_lower"] = df[["ema_open","ema_high","ema_low","ema_close"]].min(axis=1)
    df["zone_upper"] = df[["ema_open","ema_high","ema_low","ema_close"]].max(axis=1)
    df["rsi14"] = _rsi(df.close); hh=df.high.rolling(14,min_periods=14).max(); ll=df.low.rolling(14,min_periods=14).min()
    df["willr14"] = -100 * (hh-df.close) / (hh-ll).replace(0,np.nan)
    signals=[]
    for i in range(11, len(df)-1):
        base=df.iloc[i-11:i-1]
        if len(base)!=10 or base.zone_lower.isna().any(): continue
        passed=bool((base.close < base.zone_lower).all() and df.loc[i-1,"close"] > df.loc[i-1,"zone_upper"] and df.loc[i,"close"] > df.loc[i,"zone_upper"] and df.loc[i,"rsi14"] < 30 and df.loc[i,"willr14"] < -80)
        if passed: signals.append({"trade_date":pd.Timestamp(df.loc[i,"date"]).date(),"evidence":{"strategy":EMA61,"base_below_count":10,"rsi14":float(df.loc[i,"rsi14"]),"willr14":float(df.loc[i,"willr14"]),"zone_upper":float(df.loc[i,"zone_upper"]),"condition_pass":True}})
    return signals

def _efficiency(close: pd.Series) -> float:
    changes=close.diff().abs().sum(); return 0.0 if changes == 0 else float(abs(close.iloc[-1]-close.iloc[0])/changes)

def ice_sideways_accumulation(rows: pd.DataFrame) -> list[dict[str, Any]]:
    df=_prepared(rows); df["return_pct"]=df.close.pct_change()*100; df["vol_ratio"]=df.volume/df.volume.shift(1).rolling(20,min_periods=20).median(); df["obv"]=(np.sign(df.close.diff()).fillna(0)*df.volume).cumsum()
    df["shock"]=(df.return_pct<=-3)&(df.vol_ratio>=1.5)&(df.close<df.open); signals=[]; used=None
    for i in range(18,len(df)-1):
        candidates=df.index[(df.index<=i-18)&df.shock].tolist()
        if not candidates: continue
        shock=candidates[-1]
        if shock==used: continue
        base=df.iloc[shock+1:i-1]
        if len(base)<16: continue
        median=float(base.close.median()); width=100*(base.high.max()-base.low.min())/median; er=_efficiency(base.close); prev=base.close.shift(1)
        up=float(base.loc[base.close>prev,"volume"].sum()); down=float(base.loc[base.close<prev,"volume"].sum()); ratio=up/down if down else float("inf"); obv=float(base.obv.iloc[-1]-base.obv.iloc[0]); c1=df.iloc[i-1]; c2=df.iloc[i]
        passed=width<=8 and er<=.30 and ratio>=1.10 and obv>=0 and c1.close>median and c1.close>base.close.iloc[-1] and c2.close>median and c2.close>c1.close
        if passed:
            signals.append({"trade_date":pd.Timestamp(c2.date).date(),"evidence":{"strategy":ICE,"shock_date":str(pd.Timestamp(df.loc[shock,"date"]).date()),"shock_return_pct":float(df.loc[shock,"return_pct"]),"shock_volume_ratio":float(df.loc[shock,"vol_ratio"]),"base_sessions":len(base),"base_range_width_pct":float(width),"base_efficiency_ratio":float(er),"up_down_volume_ratio":float(ratio),"obv_change":obv,"condition_pass":True}}); used=shock
    return signals

def monthly_two_red_one_green(rows: pd.DataFrame) -> list[dict[str, Any]]:
    df=_prepared(rows); df["date"]=pd.to_datetime(df.date); df["month"]=df.date.dt.to_period("M"); df["week"]=df.date.dt.to_period("W-FRI")
    monthly=df.groupby("month").agg(open=("open","first"),close=("close","last")); signals=[]; used=set()
    for (month,week), group in df.groupby(["month","week"],sort=True):
        group=group.sort_values("date"); end=group.date.iloc[-1]; last=df.loc[df.month==month,"date"].max()
        if month in used or not (end.weekday()==4 or end==last): continue
        prior=[month-3,month-2,month-1]
        if any(p not in monthly.index for p in prior): continue
        m3,m2,m1=(monthly.loc[p] for p in prior)
        if not (m3.close<m3.open and m2.close<m2.open and m1.close>m1.open and group.close.iloc[-1]>group.open.iloc[0]): continue
        signals.append({"trade_date":pd.Timestamp(end).date(),"evidence":{"strategy":MONTHLY,"current_month":str(month),"week_start":str(group.date.iloc[0].date()),"week_end":str(end.date()),"m3":"RED","m2":"RED","m1":"GREEN","week":"GREEN","condition_pass":True}}); used.add(month)
    return signals

DETECTORS={EMA61:ema61_zone_reclaim, ICE:ice_sideways_accumulation, MONTHLY:monthly_two_red_one_green}
