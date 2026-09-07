"""Bounded, resumable daily preservation. No delete or approval operations."""
from datetime import timedelta
from time import monotonic
from .db import get_conn


def archive_recent_sessions(today, days=15, budget_seconds=90):
    started = monotonic()
    result = {'state': 'COMPLETED', 'sessions': []}
    for offset in range(1, days + 1):
        if monotonic() - started >= budget_seconds:
            return {**result, 'state': 'INCOMPLETE_TIME_BUDGET'}
        session = today - timedelta(days=offset)
        # Each session commits independently. A later timeout does not undo prior
        # preservation; recent checkpoints let the next run resume the backlog.
        with get_conn() as conn, conn.transaction():
            conn.execute("SET LOCAL lock_timeout='1s'; SET LOCAL statement_timeout='8s'")
            ready = conn.execute("""SELECT to_regprocedure('public.archive_minute_session(date)') IS NOT NULL
                AND to_regclass('public.minute_daily_archive_run') IS NOT NULL AS present""").fetchone()['present']
            if not ready:
                return {**result, 'state': 'BLOCKED_ARCHIVE_NOT_INSTALLED'}
            recent = conn.execute("""SELECT 1 FROM public.minute_daily_archive_run
                WHERE trade_date=%s AND completed_at>now()-interval '24 hours'""", (session,)).fetchone()
            if recent:
                result['sessions'].append({'date': str(session), 'state': 'RECENT_CHECKPOINT'})
                continue
            count = conn.execute('SELECT public.archive_minute_session(%s) AS count', (session,)).fetchone()['count']
            result['sessions'].append({'date': str(session), 'state': 'ARCHIVED' if count else 'NO_ROWS_CHANGED', 'rows': count})
    return result
