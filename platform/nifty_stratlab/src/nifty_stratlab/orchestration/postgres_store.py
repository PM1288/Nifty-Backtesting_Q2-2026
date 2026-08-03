from __future__ import annotations

import os
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Iterator

from nifty_stratlab.data.postgres import PostgresDependencyError, _psycopg
from nifty_stratlab.orchestration.models import RunSpec, ShardRecord, ShardSpec


class PostgresRunStore:
    """Production run/shard ledger using PostgreSQL row locks and SKIP LOCKED."""

    def __init__(self, dsn: str | None = None) -> None:
        self.dsn = dsn or os.getenv("TRADING_DATABASE_URL")
        if not self.dsn:
            raise ValueError("TRADING_DATABASE_URL is not set")

    @contextmanager
    def _connection(self):
        psycopg, dict_row = _psycopg()
        with psycopg.connect(self.dsn, row_factory=dict_row, autocommit=False) as conn:
            yield conn

    def create_run(self, spec: RunSpec, shards: list[ShardSpec]) -> str:
        with self._connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO research.experiment_run(
                        run_id, run_spec, strategy_version_id, data_snapshot_id,
                        universe_snapshot_id, feature_set_id, feature_version,
                        fee_profile_id, execution_model_id, scenario_key,
                        date_start, date_end, code_hash, random_seed, requested_by
                    ) VALUES (
                        %(run_id)s, %(run_spec)s::jsonb, %(strategy_version_id)s,
                        %(data_snapshot_id)s, %(universe_snapshot_id)s,
                        %(feature_set_id)s, %(feature_version)s, %(fee_profile_id)s,
                        %(execution_model_id)s, %(scenario_key)s, %(date_start)s,
                        %(date_end)s, %(code_hash)s, %(random_seed)s, %(requested_by)s
                    )
                    ON CONFLICT (run_id) DO NOTHING
                    """,
                    {
                        "run_id": spec.run_id,
                        "run_spec": spec.model_dump_json(),
                        **spec.model_dump(exclude={"symbols", "simulation_config", "metadata"}),
                    },
                )
                for shard in shards:
                    cur.execute(
                        """
                        INSERT INTO research.run_shard(
                            shard_id, run_id, ordinal, date_start, date_end,
                            symbols, input_hash
                        ) VALUES (
                            %(shard_id)s, %(run_id)s, %(ordinal)s,
                            %(date_start)s, %(date_end)s, %(symbols)s::jsonb,
                            %(input_hash)s
                        ) ON CONFLICT (shard_id) DO NOTHING
                        """,
                        {
                            "shard_id": shard.shard_id,
                            "run_id": shard.run_id,
                            "ordinal": shard.ordinal,
                            "date_start": shard.date_start,
                            "date_end": shard.date_end,
                            "symbols": __import__("json").dumps(shard.symbols),
                            "input_hash": shard.input_hash,
                        },
                    )
            conn.commit()
        return spec.run_id

    def claim_next(self, run_id: str, worker_id: str, lease_seconds: int = 120) -> dict | None:
        now = datetime.now(timezone.utc)
        expiry = now + timedelta(seconds=lease_seconds)
        with self._connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    WITH candidate AS (
                        SELECT shard_id
                          FROM research.run_shard
                         WHERE run_id = %(run_id)s
                           AND (
                                status IN ('planned','failed')
                                OR (status = 'running' AND lease_expires_at <= %(now)s)
                           )
                         ORDER BY ordinal
                         FOR UPDATE SKIP LOCKED
                         LIMIT 1
                    )
                    UPDATE research.run_shard s
                       SET status = 'running',
                           attempt_no = attempt_no + 1,
                           lease_owner = %(worker_id)s,
                           lease_expires_at = %(expiry)s,
                           heartbeat_at = %(now)s,
                           started_at = COALESCE(started_at, %(now)s),
                           error_message = NULL
                      FROM candidate c
                     WHERE s.shard_id = c.shard_id
                    RETURNING s.*
                    """,
                    {"run_id": run_id, "worker_id": worker_id, "now": now, "expiry": expiry},
                )
                row = cur.fetchone()
                if row:
                    cur.execute(
                        """
                        UPDATE research.experiment_run
                           SET status = 'running', started_at = COALESCE(started_at, %(now)s)
                         WHERE run_id = %(run_id)s AND status = 'planned'
                        """,
                        {"run_id": run_id, "now": now},
                    )
            conn.commit()
            return dict(row) if row else None

    def heartbeat(self, shard_id: str, worker_id: str, cursor: dict, lease_seconds: int = 120) -> None:
        now = datetime.now(timezone.utc)
        expiry = now + timedelta(seconds=lease_seconds)
        with self._connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                UPDATE research.run_shard
                   SET heartbeat_at = %(now)s,
                       lease_expires_at = %(expiry)s,
                       cursor_json = %(cursor)s::jsonb
                 WHERE shard_id = %(shard_id)s
                   AND status = 'running'
                   AND lease_owner = %(worker_id)s
                """,
                {
                    "now": now,
                    "expiry": expiry,
                    "cursor": __import__("json").dumps(cursor),
                    "shard_id": shard_id,
                    "worker_id": worker_id,
                },
            )
            if cur.rowcount != 1:
                raise RuntimeError("running shard lease is not owned by worker")
            conn.commit()

    def complete_shard(
        self,
        shard_id: str,
        worker_id: str,
        *,
        output_uri: str,
        output_checksum: str,
        output_row_count: int,
    ) -> None:
        with self._connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                UPDATE research.run_shard
                   SET status = 'completed', finished_at = now(),
                       output_uri = %(output_uri)s,
                       output_checksum = %(output_checksum)s,
                       output_row_count = %(output_row_count)s,
                       lease_owner = NULL, lease_expires_at = NULL
                 WHERE shard_id = %(shard_id)s
                   AND status = 'running'
                   AND lease_owner = %(worker_id)s
                """,
                {
                    "output_uri": output_uri,
                    "output_checksum": output_checksum,
                    "output_row_count": output_row_count,
                    "shard_id": shard_id,
                    "worker_id": worker_id,
                },
            )
            if cur.rowcount != 1:
                raise RuntimeError("running shard lease is not owned by worker")
            conn.commit()

    def publish(self, run_id: str, publication_key: str, published_by: str | None = None) -> None:
        with self._connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT research.publish_validated_run(%s, %s, %s)", (run_id, publication_key, published_by))
            conn.commit()
