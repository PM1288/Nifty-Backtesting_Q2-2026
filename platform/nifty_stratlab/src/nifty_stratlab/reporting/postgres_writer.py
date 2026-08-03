from __future__ import annotations

import json
import os
from dataclasses import asdict
from typing import Iterable

from nifty_stratlab.contracts import SignalIntent, TradeResult
from nifty_stratlab.data.postgres import _psycopg
from nifty_stratlab.simulation.models import EquityPoint, SkippedSignal
from nifty_stratlab.util.hashing import stable_id


class PostgresResultWriter:
    """Idempotent persistence for canonical simulation evidence."""

    def __init__(self, dsn: str | None = None) -> None:
        self.dsn = dsn or os.getenv("TRADING_DATABASE_URL")
        if not self.dsn:
            raise ValueError("TRADING_DATABASE_URL is not set")

    def write(
        self,
        *,
        run_id: str,
        scenario_key: str,
        signals: Iterable[SignalIntent],
        trades: Iterable[TradeResult],
        equity: Iterable[EquityPoint],
        skipped: Iterable[SkippedSignal],
    ) -> None:
        psycopg, _ = _psycopg()
        with psycopg.connect(self.dsn, autocommit=False) as conn:
            try:
                with conn.cursor() as cur:
                    for signal in signals:
                        payload = signal.model_dump(mode="json")
                        original_signal_id = payload["signal_id"]
                        payload["signal_id"] = stable_id(
                            "runsig", {"run_id": run_id, "signal_id": original_signal_id}, 32
                        )
                        payload["metadata"] = {**payload["metadata"], "original_signal_id": original_signal_id}
                        cur.execute(
                            """
                            INSERT INTO simulation.signal_intent(
                                signal_id, run_id, strategy_version_id, symbol,
                                instrument_id, decision_ts, available_at,
                                intent_type, side, reason_codes, feature_snapshot_id,
                                confidence_score, metadata
                            ) VALUES (
                                %(signal_id)s, %(run_id)s, %(strategy_version_id)s,
                                %(symbol)s, %(instrument_id)s, %(decision_ts)s,
                                %(available_at)s, %(intent_type)s, %(side)s,
                                %(reason_codes)s::jsonb, %(feature_snapshot_id)s,
                                %(confidence_score)s, %(metadata)s::jsonb
                            ) ON CONFLICT (signal_id) DO NOTHING
                            """,
                            {
                                **payload,
                                "run_id": run_id,
                                "reason_codes": json.dumps(payload["reason_codes"]),
                                "metadata": json.dumps(payload["metadata"]),
                            },
                        )
                    for trade in trades:
                        payload = trade.model_dump(mode="json")
                        original_trade_id = payload["trade_id"]
                        payload["trade_id"] = stable_id(
                            "runtrade", {"run_id": run_id, "trade_id": original_trade_id}, 32
                        )
                        payload["metadata"] = {**payload["metadata"], "original_trade_id": original_trade_id}
                        cur.execute(
                            """
                            INSERT INTO simulation.trade_result(
                                trade_id, run_id, strategy_version_id, scenario_key,
                                symbol, entry_ts, exit_ts, entry_price, exit_price,
                                quantity, exit_reason, gross_pnl, total_cost, net_pnl,
                                bars_held, ambiguous_path, cost_breakdown, metadata
                            ) VALUES (
                                %(trade_id)s, %(run_id)s, %(strategy_version_id)s,
                                %(scenario_key)s, %(symbol)s, %(entry_ts)s,
                                %(exit_ts)s, %(entry_price)s, %(exit_price)s,
                                %(quantity)s, %(exit_reason)s, %(gross_pnl)s,
                                %(total_cost)s, %(net_pnl)s, %(bars_held)s,
                                %(ambiguous_path)s, %(cost_breakdown)s::jsonb,
                                %(metadata)s::jsonb
                            ) ON CONFLICT (trade_id) DO NOTHING
                            """,
                            {
                                **payload,
                                "run_id": run_id,
                                "scenario_key": scenario_key,
                                "total_cost": payload["cost"]["total_cost"],
                                "cost_breakdown": json.dumps(payload["cost"]),
                                "metadata": json.dumps(payload["metadata"]),
                            },
                        )
                    for point in equity:
                        payload = asdict(point)
                        cur.execute(
                            """
                            INSERT INTO simulation.equity_point(
                                run_id, scenario_key, event_ts, cash,
                                gross_market_value, gross_equity,
                                net_liquidation_equity, open_positions
                            ) VALUES (
                                %(run_id)s, %(scenario_key)s, %(event_ts)s,
                                %(cash)s, %(gross_market_value)s, %(gross_equity)s,
                                %(net_liquidation_equity)s, %(open_positions)s
                            ) ON CONFLICT (run_id, scenario_key, event_ts)
                            DO UPDATE SET
                                cash = EXCLUDED.cash,
                                gross_market_value = EXCLUDED.gross_market_value,
                                gross_equity = EXCLUDED.gross_equity,
                                net_liquidation_equity = EXCLUDED.net_liquidation_equity,
                                open_positions = EXCLUDED.open_positions
                            """,
                            {**payload, "run_id": run_id, "scenario_key": scenario_key},
                        )
                    for item in skipped:
                        persisted_signal_id = stable_id(
                            "runsig", {"run_id": run_id, "signal_id": item.signal.signal_id}, 32
                        )
                        cur.execute(
                            """
                            INSERT INTO simulation.skipped_signal(run_id, signal_id, reason, details)
                            VALUES (%s, %s, %s, %s::jsonb)
                            ON CONFLICT (run_id, signal_id, reason)
                            DO UPDATE SET details = EXCLUDED.details
                            """,
                            (run_id, persisted_signal_id, item.reason, json.dumps(item.details, default=str)),
                        )
                conn.commit()
            except Exception:
                conn.rollback()
                raise
