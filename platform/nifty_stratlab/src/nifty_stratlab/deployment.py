from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from nifty_stratlab.data.postgres import _psycopg
from nifty_stratlab.orchestration.models import RunSpec
from nifty_stratlab.orchestration.planner import plan_shards
from nifty_stratlab.orchestration.postgres_store import PostgresRunStore
from nifty_stratlab.reporting.postgres_writer import PostgresResultWriter
from nifty_stratlab.util.hashing import sha256_file, sha256_text, stable_id


def persist_bounded_equity_research_run(
    *,
    dsn_env: str,
    source_path: Path,
    source_hash: str,
    manifest_path: Path,
    manifest: Any,
    result: Any,
    metrics: Any,
    symbol: str,
    date_start,
    date_end,
    scenario_key: str,
    output_uri: str,
    output_checksum: str,
) -> dict[str, Any]:
    dsn = os.getenv(dsn_env)
    if not dsn:
        raise ValueError(f"{dsn_env} is not set")
    strategy_source = Path(__file__).parent / "strategies" / "reference_equity.py"
    feature_source = Path(__file__).parent / "features" / "technical.py"
    strategy_source_hash = sha256_file(strategy_source)
    manifest_hash = sha256_file(manifest_path)
    data_snapshot_id = stable_id("snapshot", {"source": source_hash, "start": date_start, "end": date_end}, 32)
    members = [{"symbol": symbol, "instrument_id": f"NSE:{symbol}"}]
    membership_hash = sha256_text(json.dumps(members, sort_keys=True, separators=(",", ":")))
    universe_snapshot_id = stable_id("universe", {"as_of": date_start, "members": members}, 32)
    fee_profile_id = "TEST_ONLY_EQUITY_DELIVERY_V1"
    execution_model_id = "next_bar_rsi_signal_only_v1"
    governed_code = [
        strategy_source, feature_source,
        Path(__file__).parent / "simulation" / "engine.py",
        Path(__file__).parent / "costs" / "engine.py",
        Path(__file__).parent / "reporting" / "research_pack.py",
        Path(__file__).parent / "reporting" / "postgres_writer.py",
        Path(__file__).parent / "orchestration" / "postgres_store.py",
        Path(__file__),
    ]
    immutable_hash = sha256_text(":".join([manifest_hash, *(sha256_file(path) for path in governed_code)]))
    source_file_id = stable_id("source", {"path": str(source_path.resolve()), "sha256": source_hash}, 32)
    psycopg, _ = _psycopg()
    already_published = False
    with psycopg.connect(dsn, autocommit=False) as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO catalog.session_profile(
                profile_id, exchange, segment, timezone_name, effective_from,
                regular_open, regular_close, bar_timestamp_semantics, source_ref
            ) VALUES ('NSE_CM_RESEARCH_STANDARD_V1','NSE','NSE_CM','Asia/Kolkata',
                      DATE '2000-01-01', TIME '09:15', TIME '15:30','bar_start',
                      'internal research profile; authoritative special sessions pending')
            ON CONFLICT (profile_id) DO NOTHING
            """
        )
        cur.execute(
            """
            INSERT INTO catalog.data_snapshot(snapshot_id, created_at, as_of, source_hashes, quality_status, notes)
            VALUES (%s, now(), %s, %s::jsonb, 'WARN', %s)
            ON CONFLICT (snapshot_id) DO NOTHING
            """,
            (data_snapshot_id, datetime.combine(date_end, datetime.max.time(), tzinfo=timezone.utc),
             json.dumps({str(source_path.resolve()): source_hash}),
             "bounded explicit-symbol source; missing-minute warnings retained; not a point-in-time index snapshot"),
        )
        stat = source_path.stat()
        cur.execute(
            """
            INSERT INTO catalog.source_file(
                source_file_id, snapshot_id, dataset_name, relative_path, absolute_path,
                bytes, modified_at_utc, mime_type, sha256, parser_version, row_count
            ) VALUES (%s,%s,'aaditya555_nifty50',%s,%s,%s,to_timestamp(%s),'text/csv',%s,'rsi_bounded_v1',NULL)
            ON CONFLICT (source_file_id) DO NOTHING
            """,
            (source_file_id, data_snapshot_id, source_path.name, str(source_path.resolve()), stat.st_size, stat.st_mtime, source_hash),
        )
        cur.execute(
            """
            INSERT INTO catalog.universe_snapshot(
                universe_snapshot_id, universe_name, as_of, membership_hash,
                member_count, source_ref, members
            ) VALUES (%s,'EXPLICIT_SINGLE_SYMBOL_RESEARCH',%s,%s,1,%s,%s::jsonb)
            ON CONFLICT (universe_snapshot_id) DO NOTHING
            """,
            (universe_snapshot_id, date_start, membership_hash,
             "explicit user-authorised RELIANCE bounded test; not historical NIFTY membership", json.dumps(members)),
        )
        cur.execute(
            """
            INSERT INTO catalog.fee_schedule(
                schedule_id, exchange, product, effective_from, brokerage_rate,
                brokerage_cap_per_order, stt_buy_rate, stt_sell_rate,
                exchange_transaction_rate, sebi_rate, stamp_buy_rate, gst_rate,
                dp_sell_flat, source_ref, status
            ) VALUES (%s,'NSE','equity_delivery',DATE '2000-01-01',0,0,0.001,0.001,
                      0.0000307,0.000001,0.00015,0.18,15.34,
                      'TEST ONLY; broker contract-note reconciliation pending','draft')
            ON CONFLICT (schedule_id) DO NOTHING
            """,
            (fee_profile_id,),
        )
        for feature_id, lookback, description in (
            ("rsi_14", 15, "Wilder RSI over completed 1-minute bars"),
            ("daily_rsi_14_prior", 15, "Wilder daily RSI shifted by one completed session"),
        ):
            cur.execute(
                """
                INSERT INTO catalog.feature_definition(
                    feature_id, feature_version, display_name, description, lookback_bars,
                    required_inputs, availability_policy, implementation_ref, source_hash,
                    parity_status, status
                ) VALUES (%s,'1',%s,%s,%s,'["close"]'::jsonb,'completed_bar_only',%s,%s,'passed','active')
                ON CONFLICT (feature_id, feature_version) DO NOTHING
                """,
                (feature_id, feature_id, description, lookback, str(feature_source), sha256_file(feature_source)),
            )
        cur.execute(
            """
            INSERT INTO catalog.strategy(strategy_id, display_name, archetype, owner, description, status)
            VALUES (%s,%s,%s,%s,%s,'research') ON CONFLICT (strategy_id) DO NOTHING
            """,
            (manifest.strategy_id, manifest.display_name, manifest.archetype, manifest.owner,
             "Bounded real-data RSI research strategy; no order authority"),
        )
        cur.execute(
            """
            INSERT INTO catalog.strategy_version(
                strategy_version_id, strategy_id, version_number, plugin_ref, source_hash,
                manifest_json, required_feature_versions, fee_profile_id, immutable_hash, status
            ) VALUES (%s,%s,%s,%s,%s,%s::jsonb,%s::jsonb,%s,%s,'active')
            ON CONFLICT (strategy_version_id) DO NOTHING
            """,
            (manifest.strategy_version_id, manifest.strategy_id, manifest.version, manifest.plugin,
             strategy_source_hash, manifest.model_dump_json(),
             json.dumps({name: "1" for name in manifest.required_features}), fee_profile_id, immutable_hash),
        )
        cur.execute(
            """
            INSERT INTO catalog.execution_model(
                execution_model_id, display_name, version, configuration, assumptions,
                source_hash, validation_status
            ) VALUES (%s,'Next-bar RSI signal-only execution','1',%s::jsonb,%s::jsonb,%s,'passed')
            ON CONFLICT (execution_model_id) DO NOTHING
            """,
            (execution_model_id,
             json.dumps({"target_exit": False, "stop_exit": False, "max_positions": 1}),
             json.dumps({"entry": "next_bar_open", "exit": "next_bar_open", "order_authority": False}),
             sha256_file(Path(__file__).parent / "simulation" / "engine.py")),
        )
        conn.commit()

    spec = RunSpec(
        strategy_version_id=manifest.strategy_version_id, data_snapshot_id=data_snapshot_id,
        feature_set_id="rsi_multitimeframe", feature_version="1", fee_profile_id=fee_profile_id,
        execution_model_id=execution_model_id, universe_snapshot_id=universe_snapshot_id,
        date_start=date_start, date_end=date_end, symbols=(symbol,), scenario_key=scenario_key,
        simulation_config={"product": "equity_delivery", "target_exit": False, "stop_exit": False},
        code_hash=immutable_hash, requested_by="user_authorised_research_deployment",
        metadata={"order_authority": False, "source_quality": "WARN"},
    )
    shards = plan_shards(spec, days_per_shard=10_000, symbols_per_shard=1)
    store = PostgresRunStore(dsn)
    store.create_run(spec, shards)
    claimed = store.claim_next(spec.run_id, "bounded-rsi-deployer", lease_seconds=600)
    PostgresResultWriter(dsn).write(
        run_id=spec.run_id, scenario_key=scenario_key, signals=result.signals,
        trades=result.trades, equity=result.equity_curve, skipped=result.skipped_signals,
    )
    if claimed is not None:
        store.complete_shard(
            claimed["shard_id"], "bounded-rsi-deployer", output_uri=output_uri,
            output_checksum=output_checksum,
            output_row_count=len(result.signals) + len(result.trades) + len(result.equity_curve),
        )
    metrics_payload = metrics.to_dict()
    with psycopg.connect(dsn, autocommit=False) as conn, conn.cursor() as cur:
        for name, value in metrics_payload.items():
            numeric = value if isinstance(value, (int, float)) or (isinstance(value, str) and value.replace("-", "", 1).replace(".", "", 1).isdigit()) else None
            cur.execute(
                """
                INSERT INTO research.metric_result(
                    run_id, metric_scope, scope_key, metric_name,
                    metric_value_numeric, metric_value_text, sample_count
                ) VALUES (%s,'portfolio','all',%s,%s,%s,%s)
                ON CONFLICT (run_id, metric_scope, scope_key, metric_name)
                DO UPDATE SET metric_value_numeric=EXCLUDED.metric_value_numeric,
                              metric_value_text=EXCLUDED.metric_value_text,
                              sample_count=EXCLUDED.sample_count
                """,
                (spec.run_id, name, numeric, None if numeric is not None else str(value), metrics.trade_count),
            )
        cur.execute(
            "SELECT status, validation_status, published FROM research.experiment_run WHERE run_id=%s FOR UPDATE",
            (spec.run_id,),
        )
        state = cur.fetchone()
        already_published = bool(state and state[0] == "published" and state[1] == "passed" and state[2])
        if not already_published:
            cur.execute(
                """
                SELECT
                    (SELECT count(*) FROM simulation.signal_intent WHERE run_id=%s),
                    (SELECT count(*) FROM simulation.trade_result WHERE run_id=%s),
                    (SELECT count(*) FROM simulation.equity_point WHERE run_id=%s)
                """,
                (spec.run_id, spec.run_id, spec.run_id),
            )
            observed_counts = cur.fetchone()
            expected_counts = (len(result.signals), len(result.trades), len(result.equity_curve))
            if tuple(observed_counts) != expected_counts:
                cur.execute(
                    """
                    UPDATE research.experiment_run
                       SET status='failed', validation_status='failed', finished_at=now(),
                           error_message=%s
                     WHERE run_id=%s
                    """,
                    (f"result count mismatch: expected={expected_counts} observed={tuple(observed_counts)}", spec.run_id),
                )
                conn.commit()
                raise RuntimeError(f"result count mismatch: expected={expected_counts} observed={tuple(observed_counts)}")
            cur.execute(
                """
                UPDATE research.experiment_run
                   SET status='validated', validation_status='passed', finished_at=now(), summary=%s::jsonb
                 WHERE run_id=%s
                   AND NOT EXISTS (SELECT 1 FROM research.run_shard WHERE run_id=%s AND status<>'completed')
                """,
                (json.dumps(metrics_payload, default=str), spec.run_id, spec.run_id),
            )
            if cur.rowcount != 1:
                raise RuntimeError("run validation blocked by incomplete shard")
        conn.commit()
    if not already_published:
        store.publish(spec.run_id, f"research:{manifest.strategy_version_id}:{symbol}", "user-authorised-deployment")
    return {
        "run_id": spec.run_id, "data_snapshot_id": data_snapshot_id,
        "universe_snapshot_id": universe_snapshot_id, "publication_key": f"research:{manifest.strategy_version_id}:{symbol}",
        "database": "tradingdb", "published": True, "reused_published_run": already_published,
        "order_authority": False,
    }
