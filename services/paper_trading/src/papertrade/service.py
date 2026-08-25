from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from .contracts import BuildingGroupRequest, CloseIntent, Leg, TradeIntent
from .events import append_event, request_hash


class IdempotencyConflict(ValueError):
    pass


class NotFound(ValueError):
    pass


def _json(value: Any) -> str:
    return json.dumps(value, default=str, sort_keys=True)


def _analytical_ladders(
    intraday: list[Decimal] | list[str], swing: list[Decimal] | list[str], apply_defaults: bool
) -> tuple[list[Decimal], list[Decimal]]:
    intraday_values = {Decimal(str(value)) for value in intraday}
    swing_values = {Decimal(str(value)) for value in swing}
    if apply_defaults:
        intraday_values.update(
            {Decimal("0.003"), Decimal("0.004"), Decimal("0.005"), Decimal("0.010")}
        )
        swing_values.update({Decimal("0.010"), Decimal("0.030"), Decimal("0.050")})
    return sorted(intraday_values), sorted(swing_values)


class PaperService:
    def __init__(self, db: Any, schema: str) -> None:
        self.db, self.schema = db, schema

    def create_trade(
        self, intent: TradeIntent, idempotency_key: str, correlation_id: str | None = None
    ) -> tuple[dict[str, Any], int]:
        payload = intent.model_dump(mode="json")
        digest, corr = request_hash(payload), correlation_id or str(uuid.uuid4())
        with self.db.connection() as conn:
            existing = conn.execute(
                f"SELECT request_hash,response_json,response_code FROM {self.schema}.idempotency_records WHERE source_service=%s AND idempotency_key=%s",
                (intent.source.service, idempotency_key),
            ).fetchone()
            if existing:
                if existing["request_hash"] != digest:
                    raise IdempotencyConflict("idempotency key reused with a different request")
                return existing["response_json"], int(existing["response_code"])
            account = conn.execute(
                f"SELECT account_id FROM {self.schema}.accounts WHERE account_id=%s AND status='ACTIVE'",
                (intent.account_id,),
            ).fetchone()
            if not account:
                raise ValueError("account is missing or inactive")
            cost = conn.execute(
                f"SELECT 1 FROM {self.schema}.cost_profiles WHERE cost_profile_id=%s AND asset_class=%s AND enabled AND effective_from<=%s AND (effective_to IS NULL OR effective_to>=%s) LIMIT 1",
                (
                    intent.cost_profile_id,
                    intent.trade_group.asset_class,
                    intent.signal.occurred_at.date(),
                    intent.signal.occurred_at.date(),
                ),
            ).fetchone()
            if not cost:
                raise ValueError(
                    "effective enabled cost profile is required; zero-cost fallback is forbidden"
                )
            tax = conn.execute(
                f"SELECT 1 FROM {self.schema}.tax_profiles WHERE tax_profile_id=%s", (intent.tax_profile_id,)
            ).fetchone()
            if not tax:
                raise ValueError("tax profile not found")
            conn.execute(
                f"INSERT INTO {self.schema}.strategy_registry(strategy_id,strategy_name,family) VALUES (%s,%s,%s) ON CONFLICT(strategy_id) DO NOTHING",
                (intent.strategy.strategy_id, intent.strategy.strategy_name, intent.strategy.strategy_family),
            )
            conn.execute(
                f"INSERT INTO {self.schema}.strategy_versions(strategy_id,version,config,immutable_hash) VALUES (%s,%s,%s::jsonb,%s) ON CONFLICT(strategy_id,version) DO NOTHING",
                (
                    intent.strategy.strategy_id,
                    intent.strategy.strategy_version,
                    _json(intent.strategy.model_dump(mode="json")),
                    request_hash(intent.strategy.model_dump(mode="json")),
                ),
            )
            intent_id, group_id = str(uuid.uuid4()), str(uuid.uuid4())
            conn.execute(
                f"INSERT INTO {self.schema}.trade_intents(trade_intent_id,client_event_id,account_id,source_service,idempotency_key,request_hash,strategy_id,strategy_version,signal_id,environment,status,request_json,correlation_id) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'PAPER','ACCEPTED',%s::jsonb,%s)",
                (
                    intent_id,
                    intent.client_event_id,
                    intent.account_id,
                    intent.source.service,
                    idempotency_key,
                    digest,
                    intent.strategy.strategy_id,
                    intent.strategy.strategy_version,
                    intent.strategy.signal_id,
                    _json(payload),
                    corr,
                ),
            )
            basis = intent.trade_group.performance_basis
            conn.execute(
                f"INSERT INTO {self.schema}.trade_groups(trade_group_id,trade_intent_id,account_id,client_group_id,strategy_id,strategy_version,asset_class,expected_leg_count,entry_policy,close_policy,performance_basis_type,performance_basis_amount,status,metadata) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'PENDING_ENTRY',%s::jsonb)",
                (
                    group_id,
                    intent_id,
                    intent.account_id,
                    intent.trade_group.client_group_id,
                    intent.strategy.strategy_id,
                    intent.strategy.strategy_version,
                    intent.trade_group.asset_class,
                    intent.trade_group.expected_leg_count,
                    intent.trade_group.group_entry_policy,
                    intent.trade_group.group_close_policy,
                    basis.type,
                    basis.amount,
                    _json(intent.metadata),
                ),
            )
            for leg in intent.legs:
                inst, leg_id = str(uuid.uuid4()), str(uuid.uuid4())
                i = leg.instrument
                conn.execute(
                    f"INSERT INTO {self.schema}.instrument_snapshots(instrument_snapshot_id,instrument_id,instrument_token,exchange,segment,symbol,underlying,expiry,strike,option_type,lot_size,multiplier,master_version,snapshot) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'ENTRY_V1',%s::jsonb)",
                    (
                        inst,
                        i.instrument_id,
                        i.instrument_token,
                        i.exchange,
                        i.segment,
                        i.symbol,
                        i.underlying,
                        i.expiry,
                        i.strike,
                        i.option_type,
                        i.lot_size,
                        i.contract_multiplier,
                        _json(i.model_dump(mode="json")),
                    ),
                )
                units = leg.quantity.value * i.lot_size if leg.quantity.unit == "LOTS" else leg.quantity.value
                conn.execute(
                    f"INSERT INTO {self.schema}.trade_legs(trade_leg_id,trade_group_id,client_leg_id,instrument_snapshot_id,role,side,quantity_unit,requested_quantity,total_units,remaining_quantity,status) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'PENDING_ENTRY')",
                    (
                        leg_id,
                        group_id,
                        leg.client_leg_id,
                        inst,
                        leg.role,
                        leg.side,
                        leg.quantity.unit,
                        leg.quantity.value,
                        units,
                        units,
                    ),
                )
                order = leg.entry_order
                conn.execute(
                    f"INSERT INTO {self.schema}.paper_orders(trade_group_id,trade_leg_id,position_effect,side,order_type,time_in_force,price_source,limit_price,stop_price,requested_quantity,status,accepted_at,source_request_id) VALUES (%s,%s,'OPEN',%s,%s,%s,%s,%s,%s,%s,'ACCEPTED',%s,%s)",
                    (
                        group_id,
                        leg_id,
                        leg.side,
                        order.type,
                        order.time_in_force,
                        order.price_source,
                        order.limit_price,
                        order.stop_price,
                        units,
                        datetime.now(UTC),
                        intent_id,
                    ),
                )
                intraday, swing = _analytical_ladders(
                    intent.analytics_policy.intraday_targets_pct,
                    intent.analytics_policy.swing_targets_pct,
                    intent.analytics_policy.apply_default_ladders
                    or intent.trade_group.asset_class == "EQUITY",
                )
                for lifecycle, targets in (("INTRADAY", intraday), ("SWING", swing)):
                    for target in sorted(set(targets)):
                        code = f"{lifecycle}_{target}"
                        definition_id = conn.execute(
                            f"INSERT INTO {self.schema}.target_definitions(target_definition_id,trade_group_id,target_code,lifecycle,target_pct) VALUES (%s,%s,%s,%s,%s) ON CONFLICT(trade_group_id,target_code) DO UPDATE SET target_pct=EXCLUDED.target_pct RETURNING target_definition_id",
                            (str(uuid.uuid4()), group_id, code, lifecycle, target),
                        ).fetchone()["target_definition_id"]
                        conn.execute(
                            f"INSERT INTO {self.schema}.target_tracks(target_definition_id,trade_leg_id,status) VALUES (%s,%s,'PENDING_ENTRY')",
                            (definition_id, leg_id),
                        )
                conn.execute(
                    f"INSERT INTO {self.schema}.observation_trackers(trade_leg_id,status) VALUES (%s,'PENDING')",
                    (leg_id,),
                )
            for rule in intent.execution_policy.exit_rules:
                conn.execute(
                    f"INSERT INTO {self.schema}.execution_exit_rules(trade_group_id,client_rule_id,kind,value,action,quantity_pct,target_lifecycle) VALUES (%s,%s,%s,%s,%s,%s,%s)",
                    (group_id, rule.rule_id, rule.kind, rule.value, rule.action, rule.quantity_pct, rule.target_lifecycle),
                )
                if (
                    intent.trade_group.asset_class == "EQUITY"
                    and rule.kind == "TARGET_PCT"
                    and rule.action != "TRACK_ONLY"
                ):
                    selected = conn.execute(
                        f"""UPDATE {self.schema}.target_definitions SET execution_action=%s
                            WHERE target_definition_id=(
                                SELECT target_definition_id FROM {self.schema}.target_definitions
                                WHERE trade_group_id=%s AND target_pct=%s
                                  AND (%s::text IS NULL OR lifecycle=%s::text)
                                ORDER BY CASE lifecycle WHEN 'INTRADAY' THEN 0 ELSE 1 END LIMIT 1
                            ) RETURNING target_definition_id""",
                        (rule.action, group_id, rule.value, rule.target_lifecycle, rule.target_lifecycle),
                    ).fetchone()
                    if not selected:
                        definition_id = conn.execute(
                            f"INSERT INTO {self.schema}.target_definitions(target_definition_id,trade_group_id,target_code,lifecycle,target_pct,execution_action) VALUES (%s,%s,%s,%s,%s,%s) RETURNING target_definition_id",
                            (str(uuid.uuid4()), group_id, f"EXECUTION_{rule.target_lifecycle or 'SWING'}_{rule.value}", rule.target_lifecycle or "SWING", rule.value, rule.action),
                        ).fetchone()["target_definition_id"]
                        conn.execute(
                            f"INSERT INTO {self.schema}.target_tracks(target_definition_id,trade_leg_id,status) SELECT %s,trade_leg_id,'PENDING_ENTRY' FROM {self.schema}.trade_legs WHERE trade_group_id=%s",
                            (definition_id, group_id),
                        )
            append_event(
                conn,
                self.schema,
                "trade_group",
                group_id,
                "com.papertrading.trade_intent.accepted.v1",
                corr,
                {
                    "event_name": "trade_intent.accepted",
                    "account_id": intent.account_id,
                    "strategy": intent.strategy.model_dump(mode="json"),
                    "trade_group": {"trade_group_id": group_id, "status": "PENDING_ENTRY"},
                    "actual_execution": {"status": "NOT_FILLED"},
                    "analytics": intent.analytics_policy.model_dump(mode="json"),
                },
            )
            append_event(
                conn,
                self.schema,
                "trade_group",
                group_id,
                "com.papertrading.trade_group.pending_entry.v1",
                corr,
                {
                    "event_name": "trade_group.pending_entry",
                    "account_id": intent.account_id,
                    "trade_group_id": group_id,
                    "fully_open": False,
                },
            )
            response = {
                "environment": "PAPER",
                "trade_intent_id": intent_id,
                "trade_group_id": group_id,
                "status": "PENDING_ENTRY",
                "correlation_id": corr,
            }
            conn.execute(
                f"INSERT INTO {self.schema}.idempotency_records(source_service,idempotency_key,request_hash,resource_type,resource_id,response_code,response_json) VALUES (%s,%s,%s,'trade_group',%s,202,%s::jsonb)",
                (intent.source.service, idempotency_key, digest, group_id, _json(response)),
            )
            conn.execute(
                f"INSERT INTO {self.schema}.request_audit(source_service,correlation_id,authentication_result,operation,result) VALUES (%s,%s,'PASS','CREATE_TRADE_INTENT','ACCEPTED')",
                (intent.source.service, corr),
            )
            return response, 202

    def create_building_group(
        self, request: BuildingGroupRequest, idempotency_key: str
    ) -> tuple[dict[str, Any], int]:
        """Create an audited empty group for incremental option-leg assembly."""
        payload = request.model_dump(mode="json")
        digest = request_hash(payload)
        correlation_id = str(uuid.uuid4())
        with self.db.connection() as conn:
            prior = conn.execute(
                f"SELECT response_json,response_code,request_hash FROM {self.schema}.idempotency_records WHERE source_service=%s AND idempotency_key=%s",
                (request.source.service, idempotency_key),
            ).fetchone()
            if prior:
                if prior["request_hash"] != digest:
                    raise IdempotencyConflict("idempotency key reused with a different request")
                return prior["response_json"], int(prior["response_code"])
            if request.trade_group.asset_class == "EQUITY":
                raise ValueError("incremental assembly is reserved for multi-leg derivative groups")
            if not conn.execute(
                f"SELECT 1 FROM {self.schema}.accounts WHERE account_id=%s AND status='ACTIVE'",
                (request.account_id,),
            ).fetchone():
                raise ValueError("account is missing or inactive")
            if not conn.execute(
                f"SELECT 1 FROM {self.schema}.cost_profiles WHERE cost_profile_id=%s AND asset_class=%s AND enabled AND effective_from<=%s AND (effective_to IS NULL OR effective_to>=%s)",
                (
                    request.cost_profile_id,
                    request.trade_group.asset_class,
                    request.signal.occurred_at.date(),
                    request.signal.occurred_at.date(),
                ),
            ).fetchone():
                raise ValueError("matching effective cost profile is required")
            conn.execute(
                f"INSERT INTO {self.schema}.strategy_registry(strategy_id,strategy_name,family) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING",
                (
                    request.strategy.strategy_id,
                    request.strategy.strategy_name,
                    request.strategy.strategy_family,
                ),
            )
            conn.execute(
                f"INSERT INTO {self.schema}.strategy_versions(strategy_id,version,config,immutable_hash) VALUES (%s,%s,%s::jsonb,%s) ON CONFLICT DO NOTHING",
                (
                    request.strategy.strategy_id,
                    request.strategy.strategy_version,
                    _json(request.strategy.model_dump(mode="json")),
                    request_hash(request.strategy.model_dump(mode="json")),
                ),
            )
            intent_id, group_id = str(uuid.uuid4()), str(uuid.uuid4())
            conn.execute(
                f"INSERT INTO {self.schema}.trade_intents(trade_intent_id,client_event_id,account_id,source_service,idempotency_key,request_hash,strategy_id,strategy_version,signal_id,environment,status,request_json,correlation_id) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'PAPER','VALIDATED',%s::jsonb,%s)",
                (
                    intent_id,
                    request.client_event_id,
                    request.account_id,
                    request.source.service,
                    idempotency_key,
                    digest,
                    request.strategy.strategy_id,
                    request.strategy.strategy_version,
                    request.strategy.signal_id,
                    _json(payload),
                    correlation_id,
                ),
            )
            group = request.trade_group
            conn.execute(
                f"INSERT INTO {self.schema}.trade_groups(trade_group_id,trade_intent_id,account_id,client_group_id,strategy_id,strategy_version,asset_class,expected_leg_count,entry_policy,close_policy,performance_basis_type,performance_basis_amount,status,metadata) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'BUILDING',%s::jsonb)",
                (
                    group_id,
                    intent_id,
                    request.account_id,
                    group.client_group_id,
                    request.strategy.strategy_id,
                    request.strategy.strategy_version,
                    group.asset_class,
                    group.expected_leg_count,
                    group.group_entry_policy,
                    group.group_close_policy,
                    group.performance_basis.type,
                    group.performance_basis.amount,
                    _json(request.metadata),
                ),
            )
            response = {
                "environment": "PAPER",
                "trade_intent_id": intent_id,
                "trade_group_id": group_id,
                "status": "BUILDING",
                "correlation_id": correlation_id,
            }
            conn.execute(
                f"INSERT INTO {self.schema}.idempotency_records(source_service,idempotency_key,request_hash,resource_type,resource_id,response_code,response_json) VALUES (%s,%s,%s,'trade_group',%s,201,%s::jsonb)",
                (request.source.service, idempotency_key, digest, group_id, _json(response)),
            )
            return response, 201

    def add_building_leg(self, group_id: str, leg: Leg) -> dict[str, Any]:
        with self.db.connection() as conn:
            group = conn.execute(
                f"SELECT asset_class,expected_leg_count,(SELECT count(*) FROM {self.schema}.trade_legs WHERE trade_group_id=%s) leg_count FROM {self.schema}.trade_groups WHERE trade_group_id=%s AND status='BUILDING' FOR UPDATE",
                (group_id, group_id),
            ).fetchone()
            if not group:
                raise ValueError("group is not in BUILDING state")
            if int(group["leg_count"]) >= int(group["expected_leg_count"]):
                raise ValueError("expected leg count already reached")
            if group["asset_class"] == "OPTION" and leg.instrument.segment != "OPT":
                raise ValueError("OPTION group requires option legs")
            inst_id, leg_id = str(uuid.uuid4()), str(uuid.uuid4())
            instrument = leg.instrument
            snapshot = leg.model_dump(mode="json")
            conn.execute(
                f"INSERT INTO {self.schema}.instrument_snapshots(instrument_snapshot_id,instrument_id,instrument_token,exchange,segment,symbol,underlying,expiry,strike,option_type,lot_size,multiplier,master_version,snapshot) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'ASSEMBLY_V1',%s::jsonb)",
                (
                    inst_id,
                    instrument.instrument_id,
                    instrument.instrument_token,
                    instrument.exchange,
                    instrument.segment,
                    instrument.symbol,
                    instrument.underlying,
                    instrument.expiry,
                    instrument.strike,
                    instrument.option_type,
                    instrument.lot_size,
                    instrument.contract_multiplier,
                    _json(snapshot),
                ),
            )
            units = (
                leg.quantity.value * instrument.lot_size
                if leg.quantity.unit == "LOTS"
                else leg.quantity.value
            )
            conn.execute(
                f"INSERT INTO {self.schema}.trade_legs(trade_leg_id,trade_group_id,client_leg_id,instrument_snapshot_id,role,side,quantity_unit,requested_quantity,total_units,remaining_quantity,status) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'PENDING_ENTRY')",
                (
                    leg_id,
                    group_id,
                    leg.client_leg_id,
                    inst_id,
                    leg.role,
                    leg.side,
                    leg.quantity.unit,
                    leg.quantity.value,
                    units,
                    units,
                ),
            )
            return {
                "environment": "PAPER",
                "trade_group_id": group_id,
                "trade_leg_id": leg_id,
                "status": "BUILDING",
            }

    def commit_building_group(self, group_id: str) -> dict[str, Any]:
        with self.db.connection() as conn:
            group = conn.execute(
                f"SELECT g.*,ti.request_json,ti.correlation_id FROM {self.schema}.trade_groups g JOIN {self.schema}.trade_intents ti ON ti.trade_intent_id=g.trade_intent_id WHERE g.trade_group_id=%s FOR UPDATE OF g",
                (group_id,),
            ).fetchone()
            if not group:
                raise NotFound("trade group not found")
            if group["status"] != "BUILDING":
                return {"environment": "PAPER", "trade_group_id": group_id, "status": group["status"]}
            legs = conn.execute(
                f"SELECT l.*,i.snapshot FROM {self.schema}.trade_legs l JOIN {self.schema}.instrument_snapshots i ON i.instrument_snapshot_id=l.instrument_snapshot_id WHERE l.trade_group_id=%s FOR UPDATE OF l",
                (group_id,),
            ).fetchall()
            if len(legs) != int(group["expected_leg_count"]):
                raise ValueError("expected leg count not met")
            policy = group["request_json"]
            for leg in legs:
                order = leg["snapshot"]["entry_order"]
                conn.execute(
                    f"INSERT INTO {self.schema}.paper_orders(trade_group_id,trade_leg_id,position_effect,side,order_type,time_in_force,price_source,limit_price,stop_price,requested_quantity,status,accepted_at,source_request_id) VALUES (%s,%s,'OPEN',%s,%s,%s,%s,%s,%s,%s,'ACCEPTED',now(),%s)",
                    (
                        group_id,
                        leg["trade_leg_id"],
                        leg["side"],
                        order["type"],
                        order["time_in_force"],
                        order["price_source"],
                        order.get("limit_price"),
                        order.get("stop_price"),
                        leg["total_units"],
                        group["trade_intent_id"],
                    ),
                )
                intraday, swing = _analytical_ladders(
                    policy["analytics_policy"]["intraday_targets_pct"],
                    policy["analytics_policy"]["swing_targets_pct"],
                    bool(policy["analytics_policy"].get("apply_default_ladders", False))
                    or group["asset_class"] == "EQUITY",
                )
                for lifecycle, targets in (("INTRADAY", intraday), ("SWING", swing)):
                    for target in sorted(set(targets), key=Decimal):
                        definition_id = conn.execute(
                            f"INSERT INTO {self.schema}.target_definitions(target_definition_id,trade_group_id,target_code,lifecycle,target_pct) VALUES (%s,%s,%s,%s,%s) ON CONFLICT(trade_group_id,target_code) DO UPDATE SET target_pct=EXCLUDED.target_pct RETURNING target_definition_id",
                            (str(uuid.uuid4()), group_id, f"{lifecycle}_{target}", lifecycle, target),
                        ).fetchone()["target_definition_id"]
                        conn.execute(
                            f"INSERT INTO {self.schema}.target_tracks(target_definition_id,trade_leg_id,status) VALUES (%s,%s,'PENDING_ENTRY')",
                            (definition_id, leg["trade_leg_id"]),
                        )
                conn.execute(
                    f"INSERT INTO {self.schema}.observation_trackers(trade_leg_id,status) VALUES (%s,'PENDING')",
                    (leg["trade_leg_id"],),
                )
            conn.execute(
                f"UPDATE {self.schema}.trade_groups SET status='PENDING_ENTRY',version=version+1 WHERE trade_group_id=%s",
                (group_id,),
            )
            conn.execute(
                f"UPDATE {self.schema}.trade_intents SET status='ACCEPTED' WHERE trade_intent_id=%s",
                (group["trade_intent_id"],),
            )
            append_event(
                conn,
                self.schema,
                "trade_group",
                group_id,
                "com.papertrading.trade_group.pending_entry.v1",
                str(group["correlation_id"]),
                {"event_name": "trade_group.pending_entry", "trade_group_id": group_id, "fully_open": False},
            )
            return {"environment": "PAPER", "trade_group_id": group_id, "status": "PENDING_ENTRY"}

    def get_group(self, group_id: str) -> dict[str, Any]:
        with self.db.connection() as conn:
            group = conn.execute(
                f"SELECT * FROM {self.schema}.trade_groups WHERE trade_group_id=%s", (group_id,)
            ).fetchone()
            if not group:
                raise NotFound("trade group not found")
            legs = conn.execute(
                f"SELECT l.*,i.instrument_id,i.instrument_token,i.exchange,i.segment,i.symbol,i.expiry,i.strike,i.option_type,i.lot_size,i.multiplier,p.remaining_quantity,p.realised_pnl,p.unrealised_pnl FROM {self.schema}.trade_legs l JOIN {self.schema}.instrument_snapshots i USING(instrument_snapshot_id) LEFT JOIN {self.schema}.positions p USING(trade_leg_id) WHERE trade_group_id=%s ORDER BY client_leg_id",
                (group_id,),
            ).fetchall()
            tracks = conn.execute(
                f"SELECT * FROM {self.schema}.v_target_track_results WHERE trade_group_id=%s ORDER BY lifecycle,target_pct",
                (group_id,),
            ).fetchall()
            return {
                "environment": "PAPER",
                "trade_group": dict(group),
                "legs": [dict(x) for x in legs],
                "target_tracks": [dict(x) for x in tracks],
            }

    def list_groups(
        self, account_id: str | None, status: str | None, limit: int = 100
    ) -> list[dict[str, Any]]:
        clauses: list[str] = ["1=1"]
        params: list[Any] = []
        if account_id:
            clauses.append("account_id=%s")
            params.append(account_id)
        if status:
            clauses.append("status=%s")
            params.append(status)
        params.append(min(limit, 500))
        with self.db.connection() as conn:
            return [
                dict(x)
                for x in conn.execute(
                    f"SELECT * FROM {self.schema}.trade_groups WHERE {' AND '.join(clauses)} ORDER BY created_at DESC LIMIT %s",
                    params,
                ).fetchall()
            ]

    def close_trade(
        self, group_id: str, request: CloseIntent, idempotency_key: str
    ) -> tuple[dict[str, Any], int]:
        payload, digest = request.model_dump(mode="json"), request_hash(request.model_dump(mode="json"))
        with self.db.connection() as conn:
            group = conn.execute(
                f"SELECT * FROM {self.schema}.trade_groups WHERE trade_group_id=%s FOR UPDATE", (group_id,)
            ).fetchone()
            if not group:
                raise NotFound("trade group not found")
            prior = conn.execute(
                f"SELECT request_hash,close_intent_id,status FROM {self.schema}.close_intents WHERE trade_group_id=%s AND idempotency_key=%s",
                (group_id, idempotency_key),
            ).fetchone()
            if prior:
                if prior["request_hash"] != digest:
                    raise IdempotencyConflict("close idempotency conflict")
                return {
                    "environment": "PAPER",
                    "close_intent_id": str(prior["close_intent_id"]),
                    "status": prior["status"],
                }, 202
            close_id = str(uuid.uuid4())
            conn.execute(
                f"INSERT INTO {self.schema}.close_intents(close_intent_id,trade_group_id,client_event_id,idempotency_key,request_hash,scope,reason,price_policy,request_json,status) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,'ACCEPTED')",
                (
                    close_id,
                    group_id,
                    request.client_event_id,
                    idempotency_key,
                    digest,
                    request.scope,
                    request.reason,
                    request.price_policy,
                    _json(payload),
                ),
            )
            selected = {x.client_leg_id: x.quantity for x in request.legs}
            legs = conn.execute(
                f"SELECT l.trade_leg_id,l.client_leg_id,l.side,p.remaining_quantity FROM {self.schema}.trade_legs l JOIN {self.schema}.positions p USING(trade_leg_id) WHERE l.trade_group_id=%s AND p.remaining_quantity>0 FOR UPDATE",
                (group_id,),
            ).fetchall()
            for leg in legs:
                if request.scope == "LEGS" and leg["client_leg_id"] not in selected:
                    continue
                qty = selected.get(leg["client_leg_id"], leg["remaining_quantity"])
                if qty > leg["remaining_quantity"]:
                    raise ValueError("close quantity exceeds remaining quantity")
                side = "SELL" if leg["side"] == "BUY" else "BUY"
                conn.execute(
                    f"INSERT INTO {self.schema}.paper_orders(trade_group_id,trade_leg_id,position_effect,side,order_type,time_in_force,price_source,requested_quantity,status,accepted_at,source_request_id) VALUES (%s,%s,'CLOSE',%s,'MARKET','DAY',%s,%s,'ACCEPTED',now(),%s)",
                    (group_id, leg["trade_leg_id"], side, request.price_policy, qty, close_id),
                )
            return {
                "environment": "PAPER",
                "close_intent_id": close_id,
                "status": "ACCEPTED",
                "trade_group_status": group["status"],
            }, 202
