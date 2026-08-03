from __future__ import annotations

import math
import random
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from .schemas import (
    AnomalyItem,
    LeaderPoint,
    MarketState,
    Snapshot,
    StockBar1m,
    StockDetail,
    StockSignal,
    TickerItem,
)

NIFTY_100_SAMPLE = [
    ("RELIANCE", "Reliance Industries"),
    ("TCS", "Tata Consultancy Services"),
    ("INFY", "Infosys"),
    ("HDFCBANK", "HDFC Bank"),
    ("ICICIBANK", "ICICI Bank"),
    ("SBIN", "State Bank of India"),
    ("LT", "Larsen & Toubro"),
    ("ITC", "ITC"),
    ("BHARTIARTL", "Bharti Airtel"),
    ("AXISBANK", "Axis Bank"),
    ("KOTAKBANK", "Kotak Mahindra Bank"),
    ("MARUTI", "Maruti Suzuki"),
    ("SUNPHARMA", "Sun Pharma"),
    ("HINDUNILVR", "Hindustan Unilever"),
    ("TITAN", "Titan Company"),
    ("WIPRO", "Wipro"),
]

_BUCKETS = [
    "breakout continuation",
    "quiet accumulation",
    "mean reversion",
    "squeeze watch",
    "breakdown risk",
    "event watch",
    "observe",
]


@dataclass
class MockState:
    ts: datetime
    index_last: float
    prev_close: float
    minute: int
    base: dict[str, float]
    vwap: dict[str, float]
    vol_profile: dict[str, float]
    drift: dict[str, float]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def init_mock_state() -> MockState:
    now = _utcnow().replace(second=0, microsecond=0)
    base = {s: random.uniform(100, 2500) for s, _ in NIFTY_100_SAMPLE}
    vwap = base.copy()
    vol_profile = {s: random.uniform(0.8, 1.2) for s, _ in NIFTY_100_SAMPLE}
    drift = {s: random.uniform(-0.0008, 0.0008) for s, _ in NIFTY_100_SAMPLE}
    index_last = 24000.0 + random.uniform(-100, 100)
    prev_close = index_last / (1.0 + random.uniform(-0.006, 0.006))
    return MockState(ts=now, index_last=index_last, prev_close=prev_close, minute=0, base=base, vwap=vwap, vol_profile=vol_profile, drift=drift)


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def _regime_label(breadth: float, heat: float, vol_pulse: float) -> str:
    if breadth >= 0.62 and heat >= 60:
        return "bull expansion"
    if breadth <= 0.38 and heat <= 40:
        return "bear expansion"
    if vol_pulse >= 0.70 and 45 <= heat <= 55:
        return "high-volatility churn"
    if 0.45 <= breadth <= 0.55 and heat > 50:
        return "rotation / selective strength"
    return "mixed / neutral"


def step_mock_state(st: MockState) -> MockState:
    st.minute += 1
    st.ts = st.ts + timedelta(minutes=1)

    wave = math.sin(st.minute / 18.0) * 0.0008 + math.sin(st.minute / 5.5) * 0.00025
    shock = 0.0
    if st.minute % 53 == 0:
        shock = random.choice([-1, 1]) * random.uniform(0.002, 0.006)

    st.index_last *= (1.0 + wave + shock * 0.35)
    idx_change_pct = (st.index_last - st.prev_close) / st.prev_close

    for sym in st.base:
        beta = random.uniform(0.8, 1.3)
        idio = random.gauss(0, 0.0009) * st.vol_profile[sym]
        drift = st.drift[sym]
        st.base[sym] *= (1.0 + beta * wave + idio + drift + shock * random.uniform(0.05, 0.2))
        st.vwap[sym] = st.vwap[sym] * 0.997 + st.base[sym] * 0.003

    # keep things bounded
    st.index_last = max(1000.0, st.index_last)
    for sym in st.base:
        st.base[sym] = max(10.0, st.base[sym])

    return st


def build_snapshot_from_mock(st: MockState) -> Snapshot:
    idx_change_pct = (st.index_last - st.prev_close) / st.prev_close
    changes = []
    above_vwap = 0
    for sym, _ in NIFTY_100_SAMPLE:
        ch = random.uniform(-0.03, 0.03) + idx_change_pct * random.uniform(0.4, 1.4)
        changes.append(ch)
        if st.base[sym] >= st.vwap[sym]:
            above_vwap += 1

    adv = sum(1 for c in changes if c > 0)
    breadth = adv / max(1, len(changes))
    pct_above = above_vwap / max(1, len(changes))

    mean = sum(changes) / len(changes)
    var = sum((c - mean) ** 2 for c in changes) / max(1, len(changes) - 1)
    vol_pulse = _clamp(math.sqrt(var) / 0.02, 0.0, 1.0)

    abs_sorted = sorted([abs(c) for c in changes], reverse=True)
    concentration = _clamp(sum(abs_sorted[:5]) / (sum(abs_sorted) + 1e-9), 0.0, 1.0)

    heat = _clamp(
        100.0 * (0.45 * breadth + 0.25 * pct_above + 0.15 * (1.0 - concentration) + 0.15 * (0.5 + 0.5 * _clamp(idx_change_pct / 0.01, -1, 1))),
        0.0,
        100.0,
    )
    regime = _regime_label(breadth, heat, vol_pulse)

    market = MarketState(
        ts=st.ts,
        index_last=float(st.index_last),
        index_change_pct=float(idx_change_pct),
        breadth_pct_advancers=float(breadth),
        breadth_pct_above_vwap=float(pct_above),
        volatility_pulse=float(vol_pulse),
        leadership_concentration=float(concentration),
        regime_label=regime,
        market_heat_score=float(heat),
    )

    ticker = [TickerItem(symbol="NIFTY50", last=float(st.index_last), change_pct=float(idx_change_pct))]
    for sym, _name in NIFTY_100_SAMPLE[:15]:
        ch = random.uniform(-0.03, 0.03) + idx_change_pct * random.uniform(0.4, 1.4)
        ticker.append(TickerItem(symbol=sym, last=float(st.base[sym]), change_pct=float(ch)))

    leaders = []
    for sym, name in NIFTY_100_SAMPLE:
        resid = random.uniform(-1.2, 1.2) + idx_change_pct * 10 * random.uniform(-0.3, 0.3)
        vol_ratio = _clamp(random.gauss(1.0, 0.35) + (abs(resid) * 0.12), 0.1, 3.0)
        anomaly = _clamp(abs(resid) * 22 + (vol_ratio - 1.0) * 18 + (vol_pulse * 10), 0.0, 100.0)
        ch = random.uniform(-0.04, 0.04) + idx_change_pct * random.uniform(0.3, 1.6)
        leaders.append(
            LeaderPoint(
                symbol=sym,
                security_name=name,
                residual_strength=float(resid),
                volume_ratio=float(vol_ratio),
                anomaly_score=float(anomaly),
                change_pct=float(ch),
                last=float(st.base[sym]),
            )
        )
    leaders = sorted(leaders, key=lambda x: (x.anomaly_score, x.residual_strength), reverse=True)[:40]

    ladder = []
    for p in leaders[:24]:
        bucket = random.choices(_BUCKETS, weights=[14, 12, 10, 7, 7, 6, 44])[0]
        score = _clamp(0.55 * p.anomaly_score + 0.45 * (50 + p.residual_strength * 18), 0, 100)
        tags = []
        if p.volume_ratio >= 1.4:
            tags.append("Volume Surprise")
        if p.residual_strength >= 0.6:
            tags.append("Residual Leader")
        if p.residual_strength <= -0.6:
            tags.append("Residual Laggard")
        if p.anomaly_score >= 70:
            tags.append("Anomaly Pressure")
        if not tags:
            tags = ["Observe"]
        ladder.append(
            StockSignal(
                symbol=p.symbol,
                security_name=p.security_name,
                bucket=bucket,
                score=float(score),
                change_pct=float(p.change_pct),
                last=float(p.last),
                reason_tags=tags[:3],
            )
        )
    ladder = sorted(ladder, key=lambda x: x.score, reverse=True)

    anomalies = []
    for p in leaders[:25]:
        if p.anomaly_score < 55:
            continue
        reasons = []
        if abs(p.residual_strength) >= 1.0:
            reasons.append("Residual Shock")
        if p.volume_ratio >= 1.6:
            reasons.append("Volume Shock")
        if p.anomaly_score >= 80:
            reasons.append("Cluster Break")
        if not reasons:
            reasons = ["Review"]
        anomalies.append(AnomalyItem(symbol=p.symbol, security_name=p.security_name, anomaly_score=float(p.anomaly_score), reasons=reasons))
    anomalies = sorted(anomalies, key=lambda x: x.anomaly_score, reverse=True)[:20]

    return Snapshot(ts=st.ts, ticker=ticker, market=market, leaders=leaders, ladder=ladder, anomalies=anomalies)


def build_stock_detail_from_mock(st: MockState, symbol: str, minutes: int = 240) -> StockDetail:
    symbol = symbol.upper()
    name = next((n for s, n in NIFTY_100_SAMPLE if s == symbol), symbol)
    now = st.ts.replace(second=0, microsecond=0)
    close = st.base.get(symbol, st.index_last if symbol in ("NIFTY50", "NIFTY") else 1000.0)
    prev_close = close / (1.0 + random.uniform(-0.01, 0.01))
    day_open = prev_close * (1.0 + random.uniform(-0.004, 0.004))
    day_high = max(close, day_open) * (1.0 + random.uniform(0.001, 0.009))
    day_low = min(close, day_open) * (1.0 - random.uniform(0.001, 0.009))
    ch_pct = (close - prev_close) / prev_close

    bars: list[StockBar1m] = []
    px = day_open
    vwap = day_open
    for i in range(minutes):
        t = now - timedelta(minutes=(minutes - 1 - i))
        drift = math.sin(i / 25.0) * 0.0008 + random.gauss(0, 0.0009)
        px2 = px * (1.0 + drift)
        hi = max(px, px2) * (1.0 + random.uniform(0.0, 0.0012))
        lo = min(px, px2) * (1.0 - random.uniform(0.0, 0.0012))
        vol = abs(random.gauss(1.0, 0.35)) * 10000
        vwap = vwap * 0.996 + px2 * 0.004
        bars.append(StockBar1m(ts=t, symbol=symbol, open=float(px), high=float(hi), low=float(lo), close=float(px2), vwap=float(vwap), volume=float(vol)))
        px = px2

    last = bars[-1].close if bars else close
    return StockDetail(
        symbol=symbol,
        security_name=name,
        sector=None,
        last=float(last),
        change_pct=float(ch_pct),
        day_open=float(day_open),
        day_high=float(day_high),
        day_low=float(day_low),
        bars=bars,
    )
