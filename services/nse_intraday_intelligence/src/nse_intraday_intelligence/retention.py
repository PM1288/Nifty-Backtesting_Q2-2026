"""Bounded retention using the shared explicit evidence gate; no daily data deletion."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from psycopg import sql
from .db import get_conn

MINUTE_TABLES = (
    'raw_security_1m', 'raw_index_1m', 'security_minute_feature',
    'market_minute_feature', 'stock_minute_volume_profile',
)

def cleanup() -> dict:
    today = datetime.now(ZoneInfo('Asia/Kolkata')).date()
    cutoff = today - timedelta(days=15)
    result = {'policy': 'RETENTION-20260907.1', 'cutoff': str(cutoff), 'tables': {}}
    with get_conn() as conn:
        with conn.transaction():
            conn.execute("SET LOCAL lock_timeout='1s'; SET LOCAL statement_timeout='8s'")
            # Transaction-scoped: never leaves a lock attached to a returned pool connection.
            locked = conn.execute("SELECT pg_try_advisory_xact_lock(hashtext('nse_intraday:cleanup')) AS locked").fetchone()['locked']
            if not locked:
                return {**result, 'state': 'SKIPPED_BUSY'}
            archive_ready = conn.execute("SELECT to_regprocedure('public.archive_minute_session(date)') IS NOT NULL AS present").fetchone()['present']
            if archive_ready:
                # Daily scheduled job; replay yesterday to include late bars without
                # changing official EOD/source precedence. An error aborts cleanup.
                archived = conn.execute('SELECT public.archive_minute_session(%s) AS count', (today-timedelta(days=1),)).fetchone()['count']
                result['daily_rows_archived'] = archived
            exists = conn.execute("SELECT to_regclass('operations.retention_gate') IS NOT NULL AS present").fetchone()['present']
            if not exists:
                return {**result, 'state': 'BLOCKED_UNVERIFIED'}
            for table in MINUTE_TABLES:
                name = f'nse_intraday.{table}'
                gate = conn.execute("""SELECT retain_from FROM operations.retention_gate WHERE relation_name=%s
                    AND expires_at>now() AND policy_version='RETENTION-20260907.1'
                    AND daily_coverage_verified AND paper_evidence_verified AND dependencies_verified AND restore_verified""", (name,)).fetchone()
                if not gate:
                    result['tables'][name] = {'state': 'BLOCKED_UNVERIFIED', 'rows_deleted': 0}
                    continue
                effective = min(cutoff, gate['retain_from'].astimezone(ZoneInfo('Asia/Kolkata')).date())
                # tableoid is needed because ctid values repeat between partitions.
                query = sql.SQL('''WITH expired AS (SELECT tableoid,ctid FROM {} WHERE trade_date<%s LIMIT 10000 FOR UPDATE SKIP LOCKED)
                    DELETE FROM {} t USING expired e WHERE t.tableoid=e.tableoid AND t.ctid=e.ctid''').format(
                    sql.Identifier('nse_intraday', table), sql.Identifier('nse_intraday', table))
                count = conn.execute(query, (effective,)).rowcount
                conn.execute('''INSERT INTO operations.retention_result(relation_name,cutoff,rows_deleted,partitions_dropped,partition_bytes_before_drop)
                    VALUES(%s,%s::date::timestamp AT TIME ZONE 'Asia/Kolkata',%s,0,0)''', (name, effective, count))
                result['tables'][name] = {'state': 'BATCH_COMMITTED', 'rows_deleted': count}
    return {**result, 'state': 'COMPLETED_WITH_HOLDS' if any(x['state'].startswith('BLOCKED') for x in result['tables'].values()) else 'COMPLETED'}
