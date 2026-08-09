from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

from psycopg import sql

from .domain import adverse_return, favourable_return, leg_pnl, money, target_crossed, tax_provision
from .events import append_event


def _bar_id(row: dict[str, Any]) -> str:
    return f"{row['exchange']}:{row['symbol_token']}:{row['ts'].isoformat()}:{row.get('source', 'unknown')}"


def _cost(
    conn: Any, schema: str, profile_id: str, turnover: Decimal, sell_turnover: Decimal
) -> tuple[Decimal, dict[str, Decimal]]:
    row = conn.execute(
        f"SELECT rates FROM {schema}.cost_profiles WHERE cost_profile_id=%s AND enabled ORDER BY version DESC LIMIT 1",
        (profile_id,),
    ).fetchone()
    if not row:
        raise RuntimeError("enabled cost profile missing")
    rates = row["rates"]
    brokerage = Decimal(str(rates["brokerage_flat_per_order"]))
    exchange = turnover * Decimal(str(rates["exchange_turnover_rate"]))
    sebi = turnover * Decimal(str(rates["sebi_turnover_rate"]))
    stt = sell_turnover * Decimal(str(rates["stt_sell_rate"]))
    stamp = max(turnover - sell_turnover, Decimal("0")) * Decimal(str(rates["stamp_buy_rate"]))
    gst = (brokerage + exchange + sebi) * Decimal(str(rates["gst_rate"]))
    parts = {
        "brokerage": money(brokerage),
        "exchange": money(exchange),
        "sebi": money(sebi),
        "stt": money(stt),
        "stamp": money(stamp),
        "gst": money(gst),
    }
    return money(sum(parts.values(), Decimal("0"))), parts


class Monitor:
    def __init__(self, db: Any, settings: Any, worker_id: str | None = None) -> None:
        self.db, self.settings, self.schema = db, settings, settings.PAPER_TRADING_SCHEMA
        self.worker_id = worker_id or f"monitor-{uuid.uuid4()}"

    def _market_table(self) -> sql.Composed:
        return sql.SQL("{}.{}").format(
            sql.Identifier(self.settings.MARKET_DATA_SCHEMA),
            sql.Identifier(self.settings.MARKET_DATA_BAR_TABLE),
        )

    def _candidate(self, conn: Any, order: dict[str, Any]) -> dict[str, Any] | None:
        query = sql.SQL(
            "SELECT ts,exchange,symbol_token,open,high,low,close,volume,source FROM {} WHERE exchange=%s AND symbol_token=%s AND ts>%s ORDER BY ts LIMIT 1"
        ).format(self._market_table())
        return conn.execute(
            query, (order["exchange"], order["instrument_token"], order["accepted_at"])
        ).fetchone()

    def fill_orders(self, limit: int = 100) -> int:
        count = 0
        with self.db.connection() as conn:
            # Lock concrete group rows; PostgreSQL cannot lock a derived-table alias.
            groups = conn.execute(
                f"""SELECT tg.trade_group_id,tg.entry_policy,ti.correlation_id
                    FROM {self.schema}.trade_groups tg
                    JOIN {self.schema}.trade_intents ti USING(trade_intent_id)
                    WHERE EXISTS (
                        SELECT 1 FROM {self.schema}.paper_orders o
                        WHERE o.trade_group_id=tg.trade_group_id AND o.status='ACCEPTED'
                    )
                    ORDER BY tg.trade_group_id LIMIT %s
                    FOR UPDATE OF tg SKIP LOCKED""",
                (limit,),
            ).fetchall()
            for group in groups:
                orders = conn.execute(
                    f"""SELECT o.*,l.side leg_side,i.exchange,i.instrument_token,
                               i.segment,i.multiplier,g.account_id,
                               ti.correlation_id,
                               ti.request_json->>'cost_profile_id' cost_profile_id,
                               ti.request_json->>'tax_profile_id' tax_profile_id
                        FROM {self.schema}.paper_orders o
                        JOIN {self.schema}.trade_legs l ON l.trade_leg_id=o.trade_leg_id
                        JOIN {self.schema}.instrument_snapshots i
                          ON i.instrument_snapshot_id=l.instrument_snapshot_id
                        JOIN {self.schema}.trade_groups g ON g.trade_group_id=o.trade_group_id
                        JOIN {self.schema}.trade_intents ti
                          ON ti.trade_intent_id=g.trade_intent_id
                        WHERE o.trade_group_id=%s AND o.status='ACCEPTED'
                        ORDER BY o.accepted_at FOR UPDATE OF o""",
                    (group["trade_group_id"],),
                ).fetchall()
                candidates = [self._candidate(conn, o) for o in orders]
                if group["entry_policy"] in {"ATOMIC", "ALL_OR_NONE"} and (
                    any(x is None for x in candidates) or len({x["ts"] for x in candidates if x}) != 1
                ):
                    continue
                for order, bar in zip(orders, candidates, strict=True):
                    if bar is None:
                        continue
                    price = Decimal(bar["open"])
                    qty = Decimal(order["requested_quantity"])
                    if order["order_type"] in {"LIMIT", "STOP_LIMIT"}:
                        limit_price = Decimal(order["limit_price"])
                        if order["side"] == "BUY" and Decimal(bar["low"]) > limit_price:
                            continue
                        if order["side"] == "SELL" and Decimal(bar["high"]) < limit_price:
                            continue
                        price = min(price, limit_price) if order["side"] == "BUY" else max(price, limit_price)
                    if order["order_type"] in {"STOP", "STOP_LIMIT"}:
                        stop = Decimal(order["stop_price"])
                        triggered = (
                            Decimal(bar["high"]) >= stop
                            if order["side"] == "BUY"
                            else Decimal(bar["low"]) <= stop
                        )
                        if not triggered:
                            continue
                        price = max(price, stop) if order["side"] == "BUY" else min(price, stop)
                    self._fill(conn, order, bar, price, qty)
                    count += 1
                remaining = conn.execute(
                    f"SELECT count(*) n FROM {self.schema}.paper_orders WHERE trade_group_id=%s AND position_effect='OPEN' AND status!='FILLED'",
                    (group["trade_group_id"],),
                ).fetchone()["n"]
                had_entry_order = any(order["position_effect"] == "OPEN" for order in orders)
                if remaining == 0 and had_entry_order:
                    changed = conn.execute(
                        f"UPDATE {self.schema}.trade_groups SET status='OPEN',opened_at=COALESCE(opened_at,now()),version=version+1 WHERE trade_group_id=%s AND status IN ('PENDING_ENTRY','PARTIALLY_OPEN') RETURNING trade_group_id",
                        (group["trade_group_id"],),
                    ).fetchone()
                    if not changed:
                        continue
                    append_event(
                        conn,
                        self.schema,
                        "trade_group",
                        str(group["trade_group_id"]),
                        "com.papertrading.trade_group.opened.v1",
                        str(group["correlation_id"]),
                        {
                            "event_name": "trade_group.opened",
                            "trade_group_id": str(group["trade_group_id"]),
                            "fully_open": True,
                            "actual_execution": {"status": "OPEN"},
                        },
                    )
        return count

    def _fill(
        self, conn: Any, order: dict[str, Any], bar: dict[str, Any], price: Decimal, qty: Decimal
    ) -> None:
        fill_id = str(uuid.uuid4())
        bar_id = _bar_id(bar)
        conn.execute(
            f"INSERT INTO {self.schema}.paper_fills(paper_fill_id,paper_order_id,trade_leg_id,source_bar_id,filled_at,quantity,price,fill_model_version) VALUES (%s,%s,%s,%s,%s,%s,%s,'BAR_OPEN_CONSERVATIVE_V1') ON CONFLICT DO NOTHING",
            (fill_id, order["paper_order_id"], order["trade_leg_id"], bar_id, bar["ts"], qty, price),
        )
        conn.execute(
            f"UPDATE {self.schema}.paper_orders SET filled_quantity=filled_quantity+%s,status=CASE WHEN filled_quantity+%s=requested_quantity THEN 'FILLED' ELSE 'PARTIALLY_FILLED' END,version=version+1 WHERE paper_order_id=%s",
            (qty, qty, order["paper_order_id"]),
        )
        if order["position_effect"] == "OPEN":
            conn.execute(
                f"UPDATE {self.schema}.trade_legs SET filled_quantity=filled_quantity+%s,average_entry_price=%s,status=CASE WHEN filled_quantity+%s=requested_quantity THEN 'OPEN' ELSE 'PARTIALLY_OPEN' END,opened_at=COALESCE(opened_at,%s),version=version+1 WHERE trade_leg_id=%s",
                (qty, price, qty, bar["ts"], order["trade_leg_id"]),
            )
            position = conn.execute(
                f"INSERT INTO {self.schema}.positions(trade_leg_id,opened_quantity,remaining_quantity,average_entry_price,last_mark,last_mark_at) VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT(trade_leg_id) DO UPDATE SET opened_quantity={self.schema}.positions.opened_quantity+excluded.opened_quantity,remaining_quantity={self.schema}.positions.remaining_quantity+excluded.remaining_quantity,average_entry_price=excluded.average_entry_price,last_mark=excluded.last_mark,last_mark_at=excluded.last_mark_at,version={self.schema}.positions.version+1 RETURNING position_id",
                (order["trade_leg_id"], qty, qty, price, price, bar["ts"]),
            ).fetchone()
            conn.execute(
                f"INSERT INTO {self.schema}.position_lots(position_id,opening_fill_id,opened_quantity,remaining_quantity,entry_price) VALUES (%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                (position["position_id"], fill_id, qty, qty, price),
            )
            sign = Decimal("1") if order["leg_side"] == "BUY" else Decimal("-1")
            conn.execute(
                f"UPDATE {self.schema}.target_tracks t SET status='ACTIVE',entry_price=%s,target_price=%s*(1+(d.target_pct*%s)),activated_at=%s,version=version+1 FROM {self.schema}.target_definitions d WHERE t.target_definition_id=d.target_definition_id AND t.trade_leg_id=%s AND t.status='PENDING_ENTRY'",
                (price, price, sign, bar["ts"], order["trade_leg_id"]),
            )
            conn.execute(
                f"UPDATE {self.schema}.observation_trackers SET status='ACTIVE',entry_session=(%s AT TIME ZONE %s)::date,last_session_date=(%s AT TIME ZONE %s)::date,sessions_observed=1,highest_price=%s,lowest_price=%s WHERE trade_leg_id=%s",
                (
                    bar["ts"],
                    self.settings.EXCHANGE_TIMEZONE,
                    bar["ts"],
                    self.settings.EXCHANGE_TIMEZONE,
                    price,
                    price,
                    order["trade_leg_id"],
                ),
            )
            append_event(
                conn,
                self.schema,
                "trade_group",
                str(order["trade_group_id"]),
                "com.papertrading.trade_leg.opened.v1",
                str(order["correlation_id"]),
                {
                    "event_name": "trade_leg.opened",
                    "trade_leg_id": str(order["trade_leg_id"]),
                    "fill_price": str(price),
                    "fill_quantity": str(qty),
                    "fill_time": bar["ts"],
                },
            )
        else:
            pos = conn.execute(
                f"SELECT * FROM {self.schema}.positions WHERE trade_leg_id=%s FOR UPDATE",
                (order["trade_leg_id"],),
            ).fetchone()
            close_qty = min(qty, Decimal(pos["remaining_quantity"]))
            gross = leg_pnl(
                order["leg_side"],
                Decimal(pos["average_entry_price"]),
                price,
                close_qty,
                Decimal(order["multiplier"]),
            )
            turnover = (
                (Decimal(pos["average_entry_price"]) + price) * close_qty * Decimal(order["multiplier"])
            )
            sell_turnover = (
                (price if order["side"] == "SELL" else Decimal(pos["average_entry_price"]))
                * close_qty
                * Decimal(order["multiplier"])
            )
            costs, parts = _cost(conn, self.schema, order["cost_profile_id"], turnover, sell_turnover)
            net = gross - costs
            tax_rate = Decimal(
                conn.execute(
                    f"SELECT positive_profit_rate FROM {self.schema}.tax_profiles WHERE tax_profile_id=%s",
                    (order["tax_profile_id"],),
                ).fetchone()["positive_profit_rate"]
            )
            tax = tax_provision(net, tax_rate)
            conn.execute(
                f"UPDATE {self.schema}.positions SET closed_quantity=closed_quantity+%s,remaining_quantity=remaining_quantity-%s,average_exit_price=%s,realised_pnl=realised_pnl+%s,version=version+1 WHERE trade_leg_id=%s",
                (close_qty, close_qty, price, net - tax, order["trade_leg_id"]),
            )
            conn.execute(
                f"UPDATE {self.schema}.trade_legs SET remaining_quantity=remaining_quantity-%s,average_exit_price=%s,status=CASE WHEN remaining_quantity-%s=0 THEN 'CLOSED' ELSE 'PARTIALLY_CLOSED' END,closed_at=CASE WHEN remaining_quantity-%s=0 THEN %s ELSE NULL END,version=version+1 WHERE trade_leg_id=%s",
                (close_qty, price, close_qty, close_qty, bar["ts"], order["trade_leg_id"]),
            )
            leg_remaining = Decimal(pos["remaining_quantity"]) - close_qty
            append_event(
                conn,
                self.schema,
                "trade_group",
                str(order["trade_group_id"]),
                "com.papertrading.trade_leg.closed.v1"
                if leg_remaining == 0
                else "com.papertrading.trade_leg.partially_closed.v1",
                str(order["correlation_id"]),
                {
                    "event_name": "trade_leg.closed" if leg_remaining == 0 else "trade_leg.partially_closed",
                    "trade_leg_id": str(order["trade_leg_id"]),
                    "closed_quantity": str(close_qty),
                    "remaining_quantity": str(leg_remaining),
                    "fill_price": str(price),
                },
            )
            account = order["account_id"]
            now = bar["ts"]
            conn.execute(
                f"INSERT INTO {self.schema}.pnl_ledger(account_id,trade_group_id,trade_leg_id,entry_kind,amount,effective_at) VALUES (%s,%s,%s,'REALISED_GROSS',%s,%s),(%s,%s,%s,'REALISED_AFTER_TAX',%s,%s)",
                (
                    account,
                    order["trade_group_id"],
                    order["trade_leg_id"],
                    gross,
                    now,
                    account,
                    order["trade_group_id"],
                    order["trade_leg_id"],
                    net - tax,
                    now,
                ),
            )
            for kind, value in parts.items():
                conn.execute(
                    f"INSERT INTO {self.schema}.charge_ledger(account_id,trade_group_id,trade_leg_id,charge_kind,amount,cost_profile_id,effective_at) VALUES (%s,%s,%s,%s,%s,%s,%s)",
                    (
                        account,
                        order["trade_group_id"],
                        order["trade_leg_id"],
                        kind,
                        value,
                        order["cost_profile_id"],
                        now,
                    ),
                )
            conn.execute(
                f"INSERT INTO {self.schema}.income_tax_provision_ledger(account_id,trade_group_id,tax_profile_id,taxable_net_profit,provision_amount,effective_at) VALUES (%s,%s,%s,%s,%s,%s)",
                (account, order["trade_group_id"], order["tax_profile_id"], max(net, Decimal(0)), tax, now),
            )
            remaining = conn.execute(
                f"SELECT coalesce(sum(remaining_quantity),0) q FROM {self.schema}.trade_legs WHERE trade_group_id=%s",
                (order["trade_group_id"],),
            ).fetchone()["q"]
            if Decimal(remaining) == 0:
                conn.execute(
                    f"UPDATE {self.schema}.trade_groups SET status='CLOSED',fully_closed=true,closed_at=%s,version=version+1 WHERE trade_group_id=%s AND NOT fully_closed",
                    (now, order["trade_group_id"]),
                )
                corr = conn.execute(
                    f"SELECT correlation_id FROM {self.schema}.trade_intents ti JOIN {self.schema}.trade_groups tg USING(trade_intent_id) WHERE trade_group_id=%s",
                    (order["trade_group_id"],),
                ).fetchone()["correlation_id"]
                append_event(
                    conn,
                    self.schema,
                    "trade_group",
                    str(order["trade_group_id"]),
                    "com.papertrading.trade_group.closed.v1",
                    str(corr),
                    {
                        "event_name": "trade_group.closed",
                        "fully_closed": True,
                        "gross_realised_pnl": str(gross),
                        "trading_costs": str(costs),
                        "income_tax_provision": str(tax),
                        "net_after_tax": str(net - tax),
                    },
                )
            else:
                conn.execute(
                    f"UPDATE {self.schema}.trade_groups SET status='PARTIALLY_CLOSED',version=version+1 WHERE trade_group_id=%s AND status!='PARTIALLY_CLOSED'",
                    (order["trade_group_id"],),
                )
                append_event(
                    conn,
                    self.schema,
                    "trade_group",
                    str(order["trade_group_id"]),
                    "com.papertrading.trade_group.partially_closed.v1",
                    str(order["correlation_id"]),
                    {"event_name": "trade_group.partially_closed", "remaining_quantity": str(remaining)},
                )

    def process_bars(self, limit_per_instrument: int = 1000) -> int:
        processed = 0
        with self.db.connection() as conn:
            monitored = conn.execute(
                f"SELECT DISTINCT i.exchange,i.instrument_token FROM {self.schema}.trade_legs l JOIN {self.schema}.instrument_snapshots i USING(instrument_snapshot_id) JOIN {self.schema}.observation_trackers o USING(trade_leg_id) WHERE o.status IN ('ACTIVE','INTRADAY_COMPLETE','FIVE_SESSION_COMPLETE') AND i.instrument_token IS NOT NULL"
            ).fetchall()
            for instrument in monitored:
                cursor = conn.execute(
                    f"INSERT INTO {self.schema}.instrument_monitor_cursors(exchange,instrument_token) VALUES (%s,%s) ON CONFLICT DO NOTHING RETURNING last_bar_ts",
                    (instrument["exchange"], instrument["instrument_token"]),
                ).fetchone()
                cursor = (
                    cursor
                    or conn.execute(
                        f"SELECT last_bar_ts FROM {self.schema}.instrument_monitor_cursors WHERE exchange=%s AND instrument_token=%s FOR UPDATE",
                        (instrument["exchange"], instrument["instrument_token"]),
                    ).fetchone()
                )
                bars = conn.execute(
                    sql.SQL(
                        "SELECT ts,exchange,symbol_token,open,high,low,close,volume,source FROM {} WHERE exchange=%s AND symbol_token=%s AND ts>COALESCE(%s::timestamptz,'epoch'::timestamptz) ORDER BY ts LIMIT %s"
                    ).format(self._market_table()),
                    (
                        instrument["exchange"],
                        instrument["instrument_token"],
                        cursor["last_bar_ts"],
                        limit_per_instrument,
                    ),
                ).fetchall()
                for bar in bars:
                    self._process_bar(conn, bar)
                    processed += 1
                if bars:
                    conn.execute(
                        f"UPDATE {self.schema}.instrument_monitor_cursors SET last_bar_ts=%s,last_bar_id=%s,updated_at=now() WHERE exchange=%s AND instrument_token=%s",
                        (
                            bars[-1]["ts"],
                            _bar_id(bars[-1]),
                            instrument["exchange"],
                            instrument["instrument_token"],
                        ),
                    )
        return processed

    def _process_bar(self, conn: Any, bar: dict[str, Any]) -> None:
        bar_id = _bar_id(bar)
        inserted = conn.execute(
            f"INSERT INTO {self.schema}.processed_market_bars(exchange,instrument_token,source_bar_id,bar_ts) VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING RETURNING source_bar_id",
            (bar["exchange"], bar["symbol_token"], bar_id, bar["ts"]),
        ).fetchone()
        if not inserted:
            return
        legs = conn.execute(
            f"SELECT l.trade_leg_id,l.trade_group_id,l.side,l.total_units,l.remaining_quantity,p.average_entry_price,ot.*,ti.correlation_id,ti.request_json->>'cost_profile_id' cost_profile_id,ti.request_json->>'tax_profile_id' tax_profile_id FROM {self.schema}.trade_legs l JOIN {self.schema}.instrument_snapshots i USING(instrument_snapshot_id) JOIN {self.schema}.positions p USING(trade_leg_id) JOIN {self.schema}.observation_trackers ot USING(trade_leg_id) JOIN {self.schema}.trade_groups g USING(trade_group_id) JOIN {self.schema}.trade_intents ti USING(trade_intent_id) WHERE i.exchange=%s AND i.instrument_token=%s AND ot.status IN ('ACTIVE','INTRADAY_COMPLETE','FIVE_SESSION_COMPLETE') FOR UPDATE OF ot",
            (bar["exchange"], bar["symbol_token"]),
        ).fetchall()
        for leg in legs:
            entry = Decimal(leg["average_entry_price"])
            high, low, close = Decimal(bar["high"]), Decimal(bar["low"]), Decimal(bar["close"])
            mfe = favourable_return(leg["side"], entry, high, low)
            mae = adverse_return(leg["side"], entry, high, low)
            session = (
                bar["ts"].astimezone(__import__("zoneinfo").ZoneInfo(self.settings.EXCHANGE_TIMEZONE)).date()
            )
            new_session = session != leg["last_session_date"]
            sessions = int(leg["sessions_observed"]) + (1 if new_session else 0)
            conn.execute(
                f"UPDATE {self.schema}.observation_trackers SET bars_observed=bars_observed+1,sessions_observed=%s,last_session_date=%s,highest_price=greatest(highest_price,%s),lowest_price=least(lowest_price,%s),mfe=greatest(COALESCE(mfe,-1),%s),mae=least(COALESCE(mae,0),%s),time_below_entry_minutes=time_below_entry_minutes+CASE WHEN %s THEN 1 ELSE 0 END,version=version+1 WHERE observation_tracker_id=%s",
                (
                    sessions,
                    session,
                    high,
                    low,
                    mfe,
                    mae,
                    (close < entry if leg["side"] == "BUY" else close > entry),
                    leg["observation_tracker_id"],
                ),
            )
            tracks = conn.execute(
                f"""SELECT t.*,d.target_code,d.lifecycle,d.execution_action,d.target_pct,
                           (SELECT r.quantity_pct FROM {self.schema}.execution_exit_rules r
                            WHERE r.trade_group_id=d.trade_group_id AND r.kind='TARGET_PCT'
                              AND r.value=d.target_pct
                              AND (r.target_lifecycle IS NULL OR r.target_lifecycle=d.lifecycle)
                              AND r.active LIMIT 1) execution_quantity_pct
                    FROM {self.schema}.target_tracks t
                    JOIN {self.schema}.target_definitions d USING(target_definition_id)
                    WHERE t.trade_leg_id=%s AND t.status='ACTIVE'
                    ORDER BY d.target_pct FOR UPDATE OF t""",
                (leg["trade_leg_id"],),
            ).fetchall()
            hit_tracks = []
            for track in tracks:
                if track["lifecycle"] == "INTRADAY" and session != leg["entry_session"]:
                    conn.execute(
                        f"UPDATE {self.schema}.target_tracks SET status='NOT_HIT_INTRADAY',version=version+1 WHERE target_track_id=%s",
                        (track["target_track_id"],),
                    )
                    continue
                # Swing targets begin on the session after entry. This keeps the
                # authoritative I030-then-S100 lifecycle distinct: an entry-day
                # 1% move is opportunity evidence, not an S100 execution exit.
                if track["lifecycle"] == "SWING" and session == leg["entry_session"]:
                    continue
                if not target_crossed(leg["side"], Decimal(track["target_price"]), high, low):
                    continue
                exit_price = Decimal(track["target_price"])
                gross = leg_pnl(leg["side"], entry, exit_price, Decimal(leg["total_units"]))
                turnover = (entry + exit_price) * Decimal(leg["total_units"])
                sell = (
                    exit_price * Decimal(leg["total_units"])
                    if leg["side"] == "BUY"
                    else entry * Decimal(leg["total_units"])
                )
                costs, _ = _cost(conn, self.schema, leg["cost_profile_id"], turnover, sell)
                rate = Decimal(
                    conn.execute(
                        f"SELECT positive_profit_rate FROM {self.schema}.tax_profiles WHERE tax_profile_id=%s",
                        (leg["tax_profile_id"],),
                    ).fetchone()["positive_profit_rate"]
                )
                tax = tax_provision(gross - costs, rate)
                row = conn.execute(
                    f"INSERT INTO {self.schema}.target_hits(target_track_id,source_bar_id,hit_at,source_price,assumed_exit_price,gross_pnl,estimated_costs,tax_provision,after_tax_pnl,sequence_ambiguous,calculation_version) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,false,'TARGET_V1') ON CONFLICT DO NOTHING RETURNING target_hit_id",
                    (
                        track["target_track_id"],
                        bar_id,
                        bar["ts"],
                        high if leg["side"] == "BUY" else low,
                        exit_price,
                        gross,
                        costs,
                        tax,
                        gross - costs - tax,
                    ),
                ).fetchone()
                if row:
                    conn.execute(
                        f"UPDATE {self.schema}.target_tracks SET status='CLOSED_AT_TARGET',first_hit_at=%s,elapsed_bars=%s,mfe_before_target=%s,mae_before_target=%s,version=version+1 WHERE target_track_id=%s",
                        (bar["ts"], int(leg["bars_observed"]) + 1, mfe, mae, track["target_track_id"]),
                    )
                    hit_tracks.append(
                        {
                            "target_id": track["target_code"],
                            "target_pct": str(track["target_pct"]),
                            "hypothetical_after_tax_pnl": str(gross - costs - tax),
                        }
                    )
                    if track["execution_action"] != "TRACK_ONLY" and Decimal(leg["remaining_quantity"]) > 0:
                        quantity = Decimal(leg["remaining_quantity"])
                        if track["execution_action"] == "PARTIAL_CLOSE":
                            quantity *= Decimal(track["execution_quantity_pct"] or "0.5")
                        exists = conn.execute(
                            f"SELECT 1 FROM {self.schema}.paper_orders WHERE trade_leg_id=%s AND position_effect='CLOSE' AND status IN ('NEW','ACCEPTED','PARTIALLY_FILLED')",
                            (leg["trade_leg_id"],),
                        ).fetchone()
                        if not exists and quantity > 0:
                            conn.execute(
                                f"INSERT INTO {self.schema}.paper_orders(trade_group_id,trade_leg_id,position_effect,side,order_type,time_in_force,price_source,requested_quantity,status,accepted_at) VALUES (%s,%s,'CLOSE',%s,'MARKET','DAY','NEXT_AVAILABLE_BAR_OPEN',%s,'ACCEPTED',%s)",
                                (
                                    leg["trade_group_id"],
                                    leg["trade_leg_id"],
                                    "SELL" if leg["side"] == "BUY" else "BUY",
                                    quantity,
                                    bar["ts"],
                                ),
                            )
                            append_event(
                                conn,
                                self.schema,
                                "trade_group",
                                str(leg["trade_group_id"]),
                                "com.papertrading.execution_target.hit.v1",
                                str(leg["correlation_id"]),
                                {
                                    "event_name": "execution_target.hit",
                                    "target_id": track["target_code"],
                                    "target_pct": str(track["target_pct"]),
                                    "execution_action": track["execution_action"],
                                    "close_order_status": "ACCEPTED",
                                },
                            )
            if hit_tracks:
                append_event(
                    conn,
                    self.schema,
                    "trade_group",
                    str(leg["trade_group_id"]),
                    "com.papertrading.target_track.closed.v1",
                    str(leg["correlation_id"]),
                    {
                        "event_name": "target_track.closed",
                        "result_kind": "HYPOTHETICAL",
                        "newly_closed_target_tracks": hit_tracks,
                        "actual_execution_position_status": "OPEN"
                        if Decimal(leg["remaining_quantity"]) > 0
                        else "CLOSED",
                        "higher_tracks_remain_active": len(tracks) > len(hit_tracks),
                        "source_bar_id": bar_id,
                        "mfe": str(mfe),
                        "mae": str(mae),
                    },
                )
            for horizon, status, event_type in (
                (5, "FIVE_SESSION_COMPLETE", "com.papertrading.observation.five_session_completed.v1"),
                (30, "THIRTY_SESSION_COMPLETE", "com.papertrading.observation.thirty_session_completed.v1"),
            ):
                if sessions >= horizon:
                    inserted = conn.execute(
                        f"INSERT INTO {self.schema}.horizon_outcomes(observation_tracker_id,horizon_sessions,status,completed_at,max_high_return,mae,closing_return,sessions_below_entry,detail) VALUES (%s,%s,'COMPLETED',%s,%s,%s,%s,%s,%s::jsonb) ON CONFLICT DO NOTHING RETURNING horizon_outcome_id",
                        (
                            leg["observation_tracker_id"],
                            horizon,
                            bar["ts"],
                            mfe,
                            mae,
                            (close - entry) / entry if leg["side"] == "BUY" else (entry - close) / entry,
                            leg["time_below_entry_minutes"],
                            json.dumps({"source_bar_id": bar_id}),
                        ),
                    ).fetchone()
                    if inserted:
                        conn.execute(
                            f"UPDATE {self.schema}.observation_trackers SET status=%s,completed_at=CASE WHEN %s=30 THEN %s ELSE completed_at END WHERE observation_tracker_id=%s",
                            (status, horizon, bar["ts"], leg["observation_tracker_id"]),
                        )
                        append_event(
                            conn,
                            self.schema,
                            "trade_group",
                            str(leg["trade_group_id"]),
                            event_type,
                            str(leg["correlation_id"]),
                            {
                                "event_name": event_type.split("com.papertrading.")[1].rsplit(".v1", 1)[0],
                                "horizon_sessions": horizon,
                                "mfe": str(mfe),
                                "mae": str(mae),
                            },
                        )

    def check_freshness(self, force: bool = False) -> dict[str, int]:
        """Create one stale incident and one recovery event per degraded interval."""
        local_now = datetime.now(UTC).astimezone(ZoneInfo(self.settings.EXCHANGE_TIMEZONE))
        in_session = local_now.weekday() < 5 and (9, 15) <= (local_now.hour, local_now.minute) <= (15, 30)
        if not force and not in_session:
            return {"stale": 0, "recovered": 0}
        result = {"stale": 0, "recovered": 0}
        with self.db.connection() as conn:
            instruments = conn.execute(
                f"SELECT exchange,instrument_token FROM {self.schema}.instrument_monitor_cursors"
            ).fetchall()
            for instrument in instruments:
                latest = conn.execute(
                    sql.SQL("SELECT max(ts) ts FROM {} WHERE exchange=%s AND symbol_token=%s").format(
                        self._market_table()
                    ),
                    (instrument["exchange"], instrument["instrument_token"]),
                ).fetchone()["ts"]
                stale = latest is None or (datetime.now(UTC) - latest).total_seconds() > int(
                    self.settings.MARKET_DATA_STALE_SECONDS
                )
                current = conn.execute(
                    f"SELECT incident_id FROM {self.schema}.data_quality_incidents WHERE exchange=%s AND instrument_token=%s AND incident_type='STALE' AND status='OPEN' FOR UPDATE",
                    (instrument["exchange"], instrument["instrument_token"]),
                ).fetchone()
                aggregate = str(
                    uuid.uuid5(
                        uuid.NAMESPACE_URL,
                        f"market-data:{instrument['exchange']}:{instrument['instrument_token']}",
                    )
                )
                if stale and not current:
                    conn.execute(
                        f"INSERT INTO {self.schema}.data_quality_incidents(exchange,instrument_token,incident_type,status,detail) VALUES (%s,%s,'STALE','OPEN',%s::jsonb)",
                        (
                            instrument["exchange"],
                            instrument["instrument_token"],
                            json.dumps(
                                {
                                    "last_source_timestamp": latest,
                                    "threshold_seconds": self.settings.MARKET_DATA_STALE_SECONDS,
                                },
                                default=str,
                            ),
                        ),
                    )
                    append_event(
                        conn,
                        self.schema,
                        "market_data",
                        aggregate,
                        "com.papertrading.market_data.stale.v1",
                        str(uuid.uuid4()),
                        {
                            "event_name": "market_data.stale",
                            **dict(instrument),
                            "last_source_timestamp": latest,
                        },
                    )
                    result["stale"] += 1
                elif not stale and current:
                    conn.execute(
                        f"UPDATE {self.schema}.data_quality_incidents SET status='RECOVERED',recovered_at=now() WHERE incident_id=%s",
                        (current["incident_id"],),
                    )
                    append_event(
                        conn,
                        self.schema,
                        "market_data",
                        aggregate,
                        "com.papertrading.market_data.recovered.v1",
                        str(uuid.uuid4()),
                        {
                            "event_name": "market_data.recovered",
                            **dict(instrument),
                            "last_source_timestamp": latest,
                        },
                    )
                    result["recovered"] += 1
        return result

    def once(self) -> dict[str, int]:
        result = {"fills": self.fill_orders(), "bars": self.process_bars()}
        result.update(self.check_freshness())
        return result
