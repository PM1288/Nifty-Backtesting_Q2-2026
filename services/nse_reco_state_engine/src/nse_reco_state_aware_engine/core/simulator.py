from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from math import floor
from typing import Any, Dict, Iterable, List, Literal, Optional

from sqlalchemy.engine import Connection

from nse_reco_state_aware_engine.db.sql import fetch_all, fetch_one

InstrumentType = Literal["equity", "index"]

DELIVERY_STT_RATE = 0.001
DELIVERY_TRANSACTION_RATE = 0.0000307
DELIVERY_SEBI_RATE = 0.000001
DELIVERY_STAMP_BUY_RATE = 0.00015
GST_RATE = 0.18
DELIVERY_DP_CHARGE_TOTAL = 15.34


def _r2(value: float) -> float:
    return round(float(value) + 1e-12, 2)


def _stt_round(value: float) -> float:
    whole = floor(value)
    return float(whole + (1 if value - whole >= 0.5 else 0))


def _safe_float(value: Any) -> Optional[float]:
    try:
        return None if value is None else float(value)
    except (TypeError, ValueError):
        return None


def _safe_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _date_text(value: date | None) -> Optional[str]:
    return value.isoformat() if isinstance(value, date) else None


def _fd_value(principal: float, start: date, end: date, annual_rate_pct: float) -> float:
    days = max((end - start).days, 0)
    if principal <= 0:
        return 0.0
    return round(principal * ((1.0 + annual_rate_pct / 100.0) ** (days / 365.0)), 2)


def _accumulate_charge_bucket(target: Dict[str, float], source: Dict[str, float]) -> None:
    for key, value in source.items():
        target[key] = _r2(target.get(key, 0.0) + value)


def _empty_charge_bucket() -> Dict[str, float]:
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


def _delivery_charge_breakdown(
    turnover: float,
    *,
    side: Literal["buy", "sell"],
    instrument_type: InstrumentType,
    apply_dp: bool = False,
) -> Dict[str, float]:
    if turnover <= 0:
        return _empty_charge_bucket()
    if instrument_type == "index":
        return _empty_charge_bucket()

    brokerage = 0.0
    stt = _stt_round(turnover * DELIVERY_STT_RATE)
    transaction_charges = _r2(turnover * DELIVERY_TRANSACTION_RATE)
    sebi_charges = _r2(turnover * DELIVERY_SEBI_RATE)
    gst = _r2((brokerage + transaction_charges + sebi_charges) * GST_RATE)
    stamp_duty = _r2(turnover * DELIVERY_STAMP_BUY_RATE) if side == "buy" else 0.0
    dp_charges = DELIVERY_DP_CHARGE_TOTAL if side == "sell" and apply_dp else 0.0
    total = _r2(brokerage + stt + transaction_charges + sebi_charges + gst + stamp_duty + dp_charges)
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


@dataclass
class PriceBar:
    trade_date: date
    symbol: str
    display_name: str
    series: Optional[str]
    prev_close: Optional[float]
    high: float
    low: float
    close: float


@dataclass
class OpenLot:
    lot_id: int
    buy_date: date
    entry_price: float
    quantity: float
    principal: float
    buy_outflow: float
    buy_charges_total: float
    target_price: float
    matched_fd_value_today: float = 0.0


def list_simulation_universe(conn: Connection) -> List[Dict[str, Any]]:
    rows = fetch_all(
        conn,
        """
        WITH
        latest_trade_date AS (
          SELECT max(trade_date) AS trade_date
          FROM nse_app.security_daily_features
        ),
        equities AS (
          SELECT
            f.symbol,
            COALESCE(NULLIF(f.security_name, ''), f.symbol) AS display_name,
            'equity'::text AS instrument_type
          FROM nse_app.security_daily_features f
          WHERE f.trade_date = (SELECT trade_date FROM latest_trade_date)
            AND f.series = 'EQ'
        ),
        indices AS (
          SELECT *
          FROM (
            VALUES
              ('NIFTY 50'::text, 'NIFTY 50'::text, 'index'::text),
              ('NIFTY BANK'::text, 'NIFTY BANK'::text, 'index'::text),
              ('INDIA VIX'::text, 'INDIA VIX'::text, 'index'::text)
          ) AS idx(symbol, display_name, instrument_type)
        )
        SELECT *
        FROM (
          SELECT * FROM indices
          UNION ALL
          SELECT * FROM equities
        ) items
        ORDER BY CASE WHEN instrument_type = 'index' THEN 0 ELSE 1 END, display_name ASC, symbol ASC
        """,
    )
    return rows


def _resolve_instrument(
    conn: Connection, symbol: str, instrument_type: Optional[InstrumentType]
) -> tuple[InstrumentType, str, Optional[str], str]:
    normalized = symbol.strip()
    if not normalized:
        raise ValueError("symbol is required")

    if instrument_type == "index":
        row = fetch_one(
            conn,
            """
            SELECT index_code AS symbol, index_code AS display_name
            FROM integration.v_index_daily_history
            WHERE upper(index_code) = upper(:symbol)
            ORDER BY trade_date DESC
            LIMIT 1
            """,
            {"symbol": normalized},
        )
        if not row:
            raise ValueError("unknown index symbol")
        return "index", str(row["symbol"]), None, str(row["display_name"])

    if instrument_type == "equity":
        row = fetch_one(
            conn,
            """
            SELECT symbol, series, security_name
            FROM integration.v_stock_daily_history
            WHERE upper(symbol) = upper(:symbol)
            ORDER BY (series = 'EQ') DESC, trade_date DESC
            LIMIT 1
            """,
            {"symbol": normalized},
        )
        if not row:
            raise ValueError("unknown equity symbol")
        return "equity", str(row["symbol"]), str(row["series"]), str(row["security_name"] or row["symbol"])

    index_row = fetch_one(
        conn,
        """
        SELECT index_code AS symbol, index_code AS display_name
        FROM integration.v_index_daily_history
        WHERE upper(index_code) = upper(:symbol)
        ORDER BY trade_date DESC
        LIMIT 1
        """,
        {"symbol": normalized},
    )
    if index_row:
        return "index", str(index_row["symbol"]), None, str(index_row["display_name"])

    equity_row = fetch_one(
        conn,
        """
        SELECT symbol, series, security_name
        FROM integration.v_stock_daily_history
        WHERE upper(symbol) = upper(:symbol)
        ORDER BY (series = 'EQ') DESC, trade_date DESC
        LIMIT 1
        """,
        {"symbol": normalized},
    )
    if equity_row:
        return "equity", str(equity_row["symbol"]), str(equity_row["series"]), str(
            equity_row["security_name"] or equity_row["symbol"]
        )

    raise ValueError("unknown symbol")


def _load_history(
    conn: Connection,
    *,
    instrument_type: InstrumentType,
    symbol: str,
    series: Optional[str],
    lookback_days: int,
    end_date: Optional[date],
) -> List[PriceBar]:
    if instrument_type == "index":
        max_row = fetch_one(
            conn,
            "SELECT max(trade_date) AS trade_date FROM integration.v_index_daily_history WHERE index_code = :symbol",
            {"symbol": symbol},
        )
        resolved_end = end_date or (max_row["trade_date"] if max_row else None)
        if not resolved_end:
            return []
        start_date = resolved_end - timedelta(days=lookback_days)
        rows = fetch_all(
            conn,
            """
            WITH hist AS (
              SELECT
                trade_date,
                index_code AS symbol,
                index_code AS display_name,
                close,
                high,
                low
              FROM integration.v_index_daily_history
              WHERE index_code = :symbol
                AND trade_date BETWEEN :start_date AND :end_date
            )
            SELECT
              trade_date,
              symbol,
              display_name,
              lag(close) OVER (ORDER BY trade_date) AS prev_close,
              high,
              low,
              close
            FROM hist
            ORDER BY trade_date
            """,
            {"symbol": symbol, "start_date": start_date, "end_date": resolved_end},
        )
        return [
            PriceBar(
                trade_date=row["trade_date"],
                symbol=str(row["symbol"]),
                display_name=str(row["display_name"]),
                series=None,
                prev_close=_safe_float(row["prev_close"]),
                high=_safe_float(row["high"]) or 0.0,
                low=_safe_float(row["low"]) or 0.0,
                close=_safe_float(row["close"]) or 0.0,
            )
            for row in rows
            if row.get("trade_date") and _safe_float(row.get("close")) is not None
        ]

    max_row = fetch_one(
        conn,
        """
        SELECT max(trade_date) AS trade_date
        FROM integration.v_stock_daily_history
        WHERE symbol = :symbol
          AND series = :series
        """,
        {"symbol": symbol, "series": series},
    )
    resolved_end = end_date or (max_row["trade_date"] if max_row else None)
    if not resolved_end:
        return []
    start_date = resolved_end - timedelta(days=lookback_days)
    rows = fetch_all(
        conn,
        """
        SELECT
          trade_date,
          symbol,
          series,
          security_name,
          coalesce(prev_close, lag(close) OVER (ORDER BY trade_date)) AS prev_close,
          high,
          low,
          close
        FROM integration.v_stock_daily_history
        WHERE symbol = :symbol
          AND series = :series
          AND trade_date BETWEEN :start_date AND :end_date
        ORDER BY trade_date
        """,
        {"symbol": symbol, "series": series, "start_date": start_date, "end_date": resolved_end},
    )
    return [
        PriceBar(
            trade_date=row["trade_date"],
            symbol=str(row["symbol"]),
            display_name=str(row["security_name"] or row["symbol"]),
            series=str(row["series"]),
            prev_close=_safe_float(row["prev_close"]),
            high=_safe_float(row["high"]) or 0.0,
            low=_safe_float(row["low"]) or 0.0,
            close=_safe_float(row["close"]) or 0.0,
        )
        for row in rows
        if row.get("trade_date") and _safe_float(row.get("close")) is not None
    ]


def _allocate_sell_charges(total: float, shares: Iterable[float]) -> List[float]:
    weights = list(shares)
    if not weights or total <= 0:
        return [0.0 for _ in weights]
    total_weight = sum(weights)
    if total_weight <= 0:
        return [0.0 for _ in weights]

    allocated: List[float] = []
    running = 0.0
    for idx, weight in enumerate(weights):
        if idx == len(weights) - 1:
            piece = _r2(total - running)
        else:
            piece = _r2(total * (weight / total_weight))
            running += piece
        allocated.append(piece)
    return allocated


def _make_trade_row(
    *,
    lot: OpenLot,
    sell_date: Optional[date] = None,
    sell_price: Optional[float] = None,
    sell_turnover: Optional[float] = None,
    sell_charge: Optional[float] = None,
    net_proceeds: Optional[float] = None,
    status: str,
) -> Dict[str, Any]:
    net_pnl = None
    holding_days = None
    if sell_date and net_proceeds is not None:
        net_pnl = _r2(net_proceeds - lot.buy_outflow)
        holding_days = max((sell_date - lot.buy_date).days, 0)

    return {
        "lot_id": lot.lot_id,
        "buy_date": lot.buy_date.isoformat(),
        "entry_price": round(lot.entry_price, 4),
        "quantity": round(lot.quantity, 6),
        "principal": _r2(lot.principal),
        "buy_charges": _r2(lot.buy_charges_total),
        "buy_outflow": _r2(lot.buy_outflow),
        "target_price": round(lot.target_price, 4),
        "sell_date": _date_text(sell_date),
        "sell_price": round(sell_price, 4) if sell_price is not None else None,
        "sell_turnover": _r2(sell_turnover or 0.0) if sell_turnover is not None else None,
        "sell_charges": _r2(sell_charge or 0.0) if sell_charge is not None else None,
        "net_proceeds": _r2(net_proceeds or 0.0) if net_proceeds is not None else None,
        "net_pnl": net_pnl,
        "holding_days": holding_days,
        "status": status,
    }


def _simulate_path(
    history: List[PriceBar],
    *,
    instrument_type: InstrumentType,
    lot_amount: float,
    dip_pct: float,
    fd_rate_pct: float,
    target_pct: Optional[float],
    capital_amount: Optional[float],
) -> Dict[str, Any]:
    open_lots: List[OpenLot] = []
    trade_rows: List[Dict[str, Any]] = []
    fee_totals = _empty_charge_bucket()
    timeline: List[Dict[str, Any]] = []
    total_buy_outflow = 0.0
    total_principal = 0.0
    total_sell_net = 0.0
    total_trigger_count = 0
    executed_buys = 0
    skipped_triggers = 0
    available_cash = capital_amount
    lot_id = 0

    for bar in history:
        if target_pct is not None and open_lots:
            sellable = [lot for lot in open_lots if lot.buy_date < bar.trade_date and bar.high >= lot.target_price]
            if sellable:
                sell_turnovers = [lot.quantity * lot.target_price for lot in sellable]
                total_sell_turnover = sum(sell_turnovers)
                sell_charges = _delivery_charge_breakdown(
                    total_sell_turnover,
                    side="sell",
                    instrument_type=instrument_type,
                    apply_dp=instrument_type == "equity",
                )
                _accumulate_charge_bucket(fee_totals, sell_charges)
                allocated_sell_charges = _allocate_sell_charges(sell_charges["total"], sell_turnovers)

                for lot, turnover, charge in zip(sellable, sell_turnovers, allocated_sell_charges, strict=True):
                    proceeds = _r2(turnover - charge)
                    total_sell_net = _r2(total_sell_net + proceeds)
                    if available_cash is not None:
                        available_cash = _r2(available_cash + proceeds)
                    trade_rows.append(
                        _make_trade_row(
                            lot=lot,
                            sell_date=bar.trade_date,
                            sell_price=lot.target_price,
                            sell_turnover=turnover,
                            sell_charge=charge,
                            net_proceeds=proceeds,
                            status="closed",
                        )
                    )
                    open_lots.remove(lot)

        prev_close = bar.prev_close
        if prev_close is not None and prev_close > 0:
            daily_return_pct = ((bar.close / prev_close) - 1.0) * 100.0
            if daily_return_pct <= -abs(dip_pct):
                total_trigger_count += 1
                quantity = (lot_amount / bar.close) if instrument_type == "index" else floor(lot_amount / bar.close)
                if quantity <= 0:
                    skipped_triggers += 1
                else:
                    principal = round(quantity * bar.close, 6)
                    buy_charges = _delivery_charge_breakdown(
                        principal, side="buy", instrument_type=instrument_type, apply_dp=False
                    )
                    outflow = _r2(principal + buy_charges["total"])
                    if available_cash is not None and available_cash + 1e-9 < outflow:
                        skipped_triggers += 1
                    else:
                        if available_cash is not None:
                            available_cash = _r2(available_cash - outflow)
                        _accumulate_charge_bucket(fee_totals, buy_charges)
                        total_buy_outflow = _r2(total_buy_outflow + outflow)
                        total_principal = _r2(total_principal + principal)
                        executed_buys += 1
                        lot_id += 1
                        lot = OpenLot(
                            lot_id=lot_id,
                            buy_date=bar.trade_date,
                            entry_price=bar.close,
                            quantity=float(quantity),
                            principal=principal,
                            buy_outflow=outflow,
                            buy_charges_total=buy_charges["total"],
                            target_price=round(bar.close * (1.0 + (target_pct or 0.0) / 100.0), 6),
                        )
                        open_lots.append(lot)

        gross_open_value = _r2(sum(lot.quantity * bar.close for lot in open_lots))
        estimated_exit = _delivery_charge_breakdown(
            gross_open_value,
            side="sell",
            instrument_type=instrument_type,
            apply_dp=instrument_type == "equity" and gross_open_value > 0,
        )
        strategy_net_value = _r2(total_sell_net + gross_open_value - estimated_exit["total"])
        fd_value = _r2(sum(_fd_value(lot.principal, lot.buy_date, bar.trade_date, fd_rate_pct) for lot in open_lots) + sum(
            _fd_value(_safe_float(trade["principal"]) or 0.0, date.fromisoformat(trade["buy_date"]), bar.trade_date, fd_rate_pct)
            for trade in trade_rows
        ))
        timeline.append(
            {
                "date": bar.trade_date.isoformat(),
                "close": round(bar.close, 4),
                "invested_principal": _r2(total_principal),
                "cash_outflow": _r2(total_buy_outflow),
                "strategy_value": strategy_net_value,
                "strategy_profit": _r2(strategy_net_value - total_buy_outflow),
                "fd_value": fd_value,
                "fd_profit": _r2(fd_value - total_principal),
                "open_lots": len(open_lots),
                "cash_remaining": available_cash,
                "executed_buys": executed_buys,
                "skipped_triggers": skipped_triggers,
            }
        )

    end_bar = history[-1]
    exit_estimate = _delivery_charge_breakdown(
        _r2(sum(lot.quantity * end_bar.close for lot in open_lots)),
        side="sell",
        instrument_type=instrument_type,
        apply_dp=instrument_type == "equity" and len(open_lots) > 0,
    )
    strategy_value = timeline[-1]["strategy_value"] if timeline else 0.0
    fd_value = timeline[-1]["fd_value"] if timeline else 0.0

    for lot in open_lots:
        trade_rows.append(_make_trade_row(lot=lot, status="open"))

    return {
        "invested_principal": _r2(total_principal),
        "cash_outflow": _r2(total_buy_outflow),
        "net_strategy_value": _r2(strategy_value),
        "net_profit": _r2(strategy_value - total_buy_outflow),
        "net_return_pct": _r2(((strategy_value / total_buy_outflow) - 1.0) * 100.0) if total_buy_outflow > 0 else 0.0,
        "fd_value": _r2(fd_value),
        "fd_profit": _r2(fd_value - total_principal),
        "fd_return_pct": _r2(((fd_value / total_principal) - 1.0) * 100.0) if total_principal > 0 else 0.0,
        "fd_delta_vs_strategy": _r2(strategy_value - fd_value),
        "charges_paid": fee_totals,
        "estimated_exit_charges_today": exit_estimate,
        "open_lots": len(open_lots),
        "closed_lots": len([row for row in trade_rows if row["status"] == "closed"]),
        "trigger_count": total_trigger_count,
        "executed_buys": executed_buys,
        "skipped_triggers": skipped_triggers,
        "cash_remaining": available_cash,
        "timeline": timeline,
        "trades": trade_rows,
    }


def run_strategy_simulation(
    conn: Connection,
    *,
    symbol: str,
    instrument_type: Optional[InstrumentType] = None,
    lot_amount: float = 100000.0,
    dip_pct: float = 1.0,
    target_pct: float = 1.25,
    fd_rate_pct: float = 7.0,
    lookback_days: int = 365,
    capital_caps: Optional[List[float]] = None,
    include_infinite: bool = True,
    end_date: Optional[date] = None,
) -> Dict[str, Any]:
    resolved_type, resolved_symbol, series, display_name = _resolve_instrument(conn, symbol, instrument_type)
    history = _load_history(
        conn,
        instrument_type=resolved_type,
        symbol=resolved_symbol,
        series=series,
        lookback_days=lookback_days,
        end_date=end_date,
    )
    if len(history) < 2:
        raise ValueError("not enough historical data for simulation")

    caps = [cap for cap in (capital_caps or []) if cap > 0]
    scenario_caps: List[tuple[str, Optional[float]]] = []
    if include_infinite:
        scenario_caps.append(("Infinite", None))
    scenario_caps.extend((f"₹{int(cap):,}", float(cap)) for cap in caps)

    scenarios = []
    for label, cap in scenario_caps:
        hold = _simulate_path(
            history,
            instrument_type=resolved_type,
            lot_amount=lot_amount,
            dip_pct=dip_pct,
            fd_rate_pct=fd_rate_pct,
            target_pct=None,
            capital_amount=cap,
        )
        target = _simulate_path(
            history,
            instrument_type=resolved_type,
            lot_amount=lot_amount,
            dip_pct=dip_pct,
            fd_rate_pct=fd_rate_pct,
            target_pct=target_pct,
            capital_amount=cap,
        )
        scenarios.append(
            {
                "capital_label": label,
                "capital_amount": cap,
                "buy_and_hold": hold,
                "buy_on_dip_sell_on_target": target,
            }
        )

    trigger_dates = [
        bar.trade_date.isoformat()
        for bar in history
        if bar.prev_close is not None and bar.prev_close > 0 and ((bar.close / bar.prev_close) - 1.0) * 100.0 <= -abs(dip_pct)
    ]
    last_trade_date = history[-1].trade_date
    latest_close = history[-1].close

    return {
        "as_of": last_trade_date.isoformat(),
        "symbol": resolved_symbol,
        "display_name": display_name,
        "instrument_type": resolved_type,
        "series": series,
        "window": {
            "start_date": history[0].trade_date.isoformat(),
            "end_date": last_trade_date.isoformat(),
            "trading_days": len(history),
        },
        "latest_close": round(latest_close, 4),
        "assumptions": {
            "dip_pct": dip_pct,
            "target_pct": target_pct,
            "fd_rate_pct": fd_rate_pct,
            "lot_amount": lot_amount,
            "lookback_days": lookback_days,
            "capital_caps": caps,
            "include_infinite": include_infinite,
            "trigger_logic": "Buy on days where close-to-previous-close return is <= negative dip threshold.",
            "exit_logic": "Target exits trigger on the first later trading day where daily high reaches the target price.",
            "index_note": "Index simulations are synthetic cash-index benchmarks and do not apply delivery brokerage or DP charges.",
        },
        "charges_model": {
            "brokerage_delivery_equity": 0.0,
            "stt_delivery_rate": 0.1,
            "transaction_charge_rate_nse_equity_cash": 0.00307,
            "sebi_charge_per_crore": 10.0,
            "gst_rate": 18.0,
            "stamp_duty_buy_rate_delivery": 0.015,
            "dp_charge_sell_order_total": DELIVERY_DP_CHARGE_TOTAL,
        },
        "trigger_dates": trigger_dates,
        "capital_scenarios": scenarios,
    }
