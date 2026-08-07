"""Immutable D0..D+29 maximum-official-close opportunity evaluation.

This evaluator is intentionally blind to execution exits.  It produces
hindsight entry-quality evidence and never creates realised P&L or releases
capital.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from datetime import date
from decimal import Decimal, ROUND_FLOOR
from typing import Iterable

POLICY_ID = "FULL-PATH-LADDER-PLUS-H30T-MAX-CLOSE-OPPORTUNITY-V3"
OUTCOME_LABEL = "HYPOTHETICAL_MAX_CLOSE_OPPORTUNITY_NOT_REALISED_PNL"


@dataclass(frozen=True)
class HorizonDailyBar:
    session_index: int
    trade_date: date
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    nifty_close: Decimal | None = None
    sector_close: Decimal | None = None
    data_quality_ok: bool = True
    corporate_action_ok: bool = True

    def validate(self) -> None:
        if self.session_index < 0 or min(self.open, self.high, self.low, self.close) <= 0:
            raise ValueError("session index and OHLC values must be valid")
        if self.high < max(self.open, self.close, self.low) or self.low > min(self.open, self.close, self.high):
            raise ValueError("invalid OHLC ordering")


@dataclass(frozen=True)
class HorizonEconomicsPolicy:
    ticket_limit: Decimal = Decimal("200000")
    intraday_round_trip_cost_bps: Decimal = Decimal("8")
    delivery_round_trip_cost_bps: Decimal = Decimal("22")
    tax_reserve_rate: Decimal = Decimal("0.35")
    policy_id: str = "NON-CERTIFIED-PROXY-8BPS-22BPS-TAX35-V1"
    certification_status: str = "NON_CERTIFIED_PROXY"


def _pct(value: Decimal, base: Decimal) -> Decimal:
    return (value / base - Decimal("1")) * Decimal("100")


def _as_float(value: Decimal | None) -> float | None:
    return None if value is None else round(float(value), 8)


def _economics(entry: Decimal, exit_: Decimal, session_index: int, quantity: int, policy: HorizonEconomicsPolicy) -> dict:
    bps = policy.intraday_round_trip_cost_bps if session_index == 0 else policy.delivery_round_trip_cost_bps
    profile = "INTRADAY" if session_index == 0 else "DELIVERY_SWING"
    notional = entry * quantity
    gross = (exit_ - entry) * quantity
    costs = notional * bps / Decimal("10000")
    pre_tax = gross - costs
    reserve = max(pre_tax, Decimal("0")) * policy.tax_reserve_rate
    after_tax = pre_tax - reserve
    return {
        "cost_profile": profile, "fee_profile_id": policy.policy_id,
        "fee_certification_status": policy.certification_status,
        "cost_breakdown": {"round_trip_proxy_bps": float(bps), "total_costs": _as_float(costs)},
        "gross_pnl": _as_float(gross), "pre_tax_pnl": _as_float(pre_tax),
        "tax_policy_id": f"POSITIVE-PROFIT-RESERVE-{float(policy.tax_reserve_rate)*100:.0f}PCT-V1",
        "tax_reserve": _as_float(reserve), "after_tax_pnl": _as_float(after_tax),
        "gross_upside_pct": _as_float(_pct(exit_, entry)),
        "net_upside_pct": _as_float(pre_tax / notional * Decimal("100")),
        "after_tax_upside_pct": _as_float(after_tax / notional * Decimal("100")),
        "denominator_definition": "ENTRY_NOTIONAL_PROXY_EXCLUDES_BUY_SIDE_CHARGES",
    }


def _longest(values: list[bool]) -> int:
    best = current = 0
    for value in values:
        current = current + 1 if value else 0
        best = max(best, current)
    return best


def evaluate_long_horizon(
    *, entry_path_id: str, run_id: str, strategy_version_id: str, symbol: str,
    entry_price: Decimal, entry_date: date, daily_bars: Iterable[HorizonDailyBar],
    quantity: int | None = None, economics_policy: HorizonEconomicsPolicy | None = None,
    data_snapshot_hash: str = "UNSPECIFIED", sector: str | None = None,
    corporate_action_policy_id: str = "CA-GAP-HEURISTIC-35PCT-V1",
    benchmark_source_id: str = "STRATEGY-EVAL-MARKET-REGIME-DAILY",
    sector_benchmark_source_id: str = "SECTOR-EQUAL-WEIGHT-PROXY-V1",
    horizon_sessions: int = 30,
) -> dict:
    """Evaluate H30 without accepting any execution-scenario state."""
    if entry_price <= 0 or horizon_sessions != 30:
        raise ValueError("H30 requires positive entry and exactly 30 sessions")
    policy = economics_policy or HorizonEconomicsPolicy()
    qty = quantity or int((policy.ticket_limit / entry_price).to_integral_value(rounding=ROUND_FLOOR))
    if qty <= 0:
        raise ValueError("quantity must be positive")
    bars = sorted((bar for bar in daily_bars if 0 <= bar.session_index < horizon_sessions), key=lambda x: x.session_index)
    seen: set[int] = set()
    for bar in bars:
        bar.validate()
        if bar.session_index in seen:
            raise ValueError(f"duplicate session index {bar.session_index}")
        seen.add(bar.session_index)
    missing = sorted(set(range(horizon_sessions)) - seen)
    if any(not bar.corporate_action_ok for bar in bars):
        coverage = "CORPORATE_ACTION_BLOCKED"
    elif any(not bar.data_quality_ok for bar in bars):
        coverage = "DATA_GAP_H30"
    elif not missing:
        coverage = "MATURE_H30_COMPLETE"
    elif bars and seen == set(range(max(seen) + 1)):
        coverage = "RIGHT_CENSORED"
    elif not bars:
        coverage = "NOT_APPLICABLE"
    else:
        coverage = "DATA_GAP_H30"
    blockers = []
    if coverage != "MATURE_H30_COMPLETE": blockers.append(coverage)
    if policy.certification_status != "CERTIFIED": blockers.append("NON_CERTIFIED_COST_PROFILE")
    if not bars or bars[0].nifty_close is None: blockers.append("NIFTY_BENCHMARK_MISSING")
    if not bars or bars[0].sector_close is None: blockers.append("SECTOR_BENCHMARK_MISSING")
    if sector_benchmark_source_id.endswith("PROXY-V1"): blockers.append("SECTOR_BENCHMARK_PROXY")
    if corporate_action_policy_id.endswith("HEURISTIC-35PCT-V1"): blockers.append("CORPORATE_ACTION_POLICY_NOT_CERTIFIED")

    if not bars:
        observation = {
            "entry_path_id": entry_path_id, "run_id": run_id, "strategy_version_id": strategy_version_id,
            "symbol": symbol, "sector": sector, "horizon_policy_id": POLICY_ID, "entry_date": entry_date.isoformat(),
            "entry_price": float(entry_price), "quantity": qty, "sessions_expected": 30, "sessions_observed": 0,
            "coverage_status": coverage, "maturity_status": "NOT_MATURE", "rankable_flag": False,
            "missing_session_indices": missing, "rank_blockers": blockers, "checkpoints": [],
            "outcome_label": OUTCOME_LABEL, "data_snapshot_hash": data_snapshot_hash,
        }
    else:
        max_close = max(bar.close for bar in bars)
        maxima = [bar for bar in bars if bar.close == max_close]
        maximum = maxima[0]
        before_max = [bar for bar in bars if bar.session_index <= maximum.session_index]
        post_d0 = [bar for bar in bars if bar.session_index >= 1]
        d5 = [bar for bar in bars if 1 <= bar.session_index <= 5]
        swing_max = max((bar.close for bar in d5), default=None)
        swing_row = next((bar for bar in d5 if bar.close == swing_max), None)
        max_post = max((bar.close for bar in post_d0), default=None)
        flags = [bar.close < entry_price for bar in bars]
        underwater_seen = False
        recovery = None
        for bar in bars:
            if bar.close < entry_price: underwater_seen = True
            elif underwater_seen and recovery is None: recovery = bar.session_index
        base = next((bar for bar in bars if bar.session_index == 0), bars[0])
        nifty_return = sector_return = None
        if base.nifty_close and maximum.nifty_close:
            nifty_return = _pct(maximum.nifty_close, base.nifty_close)
        if base.sector_close and maximum.sector_close:
            sector_return = _pct(maximum.sector_close, base.sector_close)
        max_econ = _economics(entry_price, max_close, maximum.session_index, qty, policy)
        swing_econ = _economics(entry_price, swing_max, swing_row.session_index, qty, policy) if swing_row else None
        running_max = Decimal("0"); running_min_close = running_min_low = None; checkpoints = []
        for bar in bars:
            running_max = max(running_max, bar.close)
            running_min_close = bar.close if running_min_close is None else min(running_min_close, bar.close)
            running_min_low = bar.low if running_min_low is None else min(running_min_low, bar.low)
            checkpoint = {
                "entry_path_id": entry_path_id, "horizon_policy_id": POLICY_ID,
                "session_index": bar.session_index, "trade_date": bar.trade_date.isoformat(),
                "close_price": float(bar.close), "close_return_pct": _as_float(_pct(bar.close, entry_price)),
                "max_close_so_far": float(running_max), "max_close_return_so_far_pct": _as_float(_pct(running_max, entry_price)),
                "min_close_so_far": float(running_min_close), "min_low_so_far": float(running_min_low),
                "underwater_flag": bar.close < entry_price, "nifty_close": _as_float(bar.nifty_close),
                "sector_close": _as_float(bar.sector_close), "corporate_action_flag": not bar.corporate_action_ok,
                "data_quality_status": "PASS" if bar.data_quality_ok else "FAIL",
            }
            checkpoint["checkpoint_hash"] = hashlib.sha256(json.dumps(checkpoint, sort_keys=True).encode()).hexdigest()
            checkpoints.append(checkpoint)
        close_d29 = next((bar.close for bar in bars if bar.session_index == 29), None)
        after_tax_pct = Decimal(str(max_econ["after_tax_upside_pct"]))
        mae_before = _pct(min(bar.low for bar in before_max), entry_price)
        observation = {
            "entry_path_id": entry_path_id, "run_id": run_id, "strategy_version_id": strategy_version_id,
            "symbol": symbol, "sector": sector, "horizon_policy_id": POLICY_ID,
            "entry_date": entry_date.isoformat(), "entry_month": entry_date.month,
            "entry_price": float(entry_price), "quantity": qty, "entry_notional": float(entry_price * qty),
            "window_start_date": bars[0].trade_date.isoformat(), "window_end_actual_date": bars[-1].trade_date.isoformat(),
            "sessions_expected": 30, "sessions_observed": len(bars), "coverage_status": coverage,
            "maturity_status": "MATURE_H30" if coverage == "MATURE_H30_COMPLETE" else "NOT_MATURE",
            "rankable_flag": not blockers, "rank_blockers": sorted(set(blockers)), "missing_session_indices": missing,
            "max_close_price": float(max_close), "max_close_date": maximum.trade_date.isoformat(),
            "max_close_session_index": maximum.session_index, "max_close_tie_count": len(maxima),
            "max_close_post_d0_price": _as_float(max_post), "swing_d5_max_close_price": _as_float(swing_max),
            "close_d29": _as_float(close_d29), "return_d29_pct": _as_float(_pct(close_d29, entry_price)) if close_d29 else None,
            "giveback_from_max_to_d29_pct": _as_float(_pct(close_d29, max_close)) if close_d29 else None,
            "minimum_close_30t": float(min(bar.close for bar in bars)), "minimum_low_30t": float(min(bar.low for bar in bars)),
            "maximum_high_30t": float(max(bar.high for bar in bars)), "mae_before_max_close_pct": _as_float(mae_before),
            "mae_30t_pct": _as_float(_pct(min(bar.low for bar in bars), entry_price)),
            "underwater_session_count": sum(flags), "longest_underwater_streak": _longest(flags),
            "first_recovery_session_index": recovery, "sessions_to_max_close": maximum.session_index,
            "calendar_days_to_max_close": (maximum.trade_date - entry_date).days,
            "capital_days_to_max": float(entry_price * qty * max(maximum.session_index, 1)),
            "profit_per_capital_day": _as_float(Decimal(str(max_econ["after_tax_pnl"])) / (entry_price * qty * max(maximum.session_index, 1))),
            "max_close_to_mae_ratio": _as_float(max(after_tax_pct, Decimal("0")) / max(abs(mae_before), Decimal("0.000001"))),
            "nifty_return_to_stock_max_date_pct": _as_float(nifty_return),
            "sector_return_to_stock_max_date_pct": _as_float(sector_return),
            "stock_excess_vs_nifty_at_max_pct": _as_float(_pct(max_close, entry_price) - nifty_return) if nifty_return is not None else None,
            "stock_excess_vs_sector_at_max_pct": _as_float(_pct(max_close, entry_price) - sector_return) if sector_return is not None else None,
            "benchmark_source_id": benchmark_source_id, "sector_benchmark_source_id": sector_benchmark_source_id,
            "corporate_action_policy_id": corporate_action_policy_id, "data_snapshot_hash": data_snapshot_hash,
            "max_close_economics": max_econ, "swing_d5_economics": swing_econ,
            "opportunity_bands": {f"H30_N{int(level*100):04d}": float(after_tax_pct) >= level for level in (1,2,5,10,15,20)},
            "checkpoints": checkpoints, "outcome_label": OUTCOME_LABEL,
        }
    hash_payload = {key: value for key, value in observation.items() if key not in {"observation_hash"}}
    observation["observation_hash"] = hashlib.sha256(json.dumps(hash_payload, sort_keys=True).encode()).hexdigest()
    return observation
