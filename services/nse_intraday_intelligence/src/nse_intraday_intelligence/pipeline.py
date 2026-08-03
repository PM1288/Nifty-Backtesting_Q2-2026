
from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from .alerts import send_webhook_alert
from .config import get_settings
from .db import execute, execute_many, fetch_all, fetch_one, fetch_val, get_conn
from .logging_utils import get_logger
from .partitioning import drop_monthly_partitions_older_than, ensure_monthly_partitions
from .utils import csv_bytes, dumps_json, flatten_dict, sha256_bytes, write_bytes

log = get_logger(__name__)

DISCLAIMER = (
    "Educational purpose only • Not financial advice • Do not trade based on internet advice • "
    "Do not follow any instruction on the website • Verify with licensed professionals"
)

SECTION_META = {
    "market-state": {"title": "Market State"},
    "breadth-participation": {"title": "Breadth & Participation"},
    "open-drive": {"title": "Open Drive"},
    "leadership-dispersion": {"title": "Leadership & Dispersion"},
    "reversals-failures": {"title": "Reversals & Failures"},
    "stock-opportunities": {"title": "Stock Opportunities"},
    "history-context": {"title": "History Context"},
}

LIVE_ALERT_CHECK_KEYS = {
    "intraday_source_freshness",
    "intraday_raw_sync_lag",
    "intraday_snapshot_freshness",
    "intraday_live_stock_rows",
}


def _direction(value: Any) -> str:
    try:
        value_f = float(value)
    except Exception:
        return "neutral"
    if value_f > 0:
        return "up"
    if value_f < 0:
        return "down"
    return "neutral"


def _accent(direction: str) -> str:
    return {"up": "green", "down": "red"}.get(direction, "white")


def _arrow(direction: str) -> str:
    return {"up": "▲", "down": "▼"}.get(direction, "•")


def _iso(value: Any) -> Any:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def _serialize_row(row: dict) -> dict:
    return {k: _iso(v) for k, v in row.items()}


def _scalar(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except Exception:
        return default


def _safe_pct(num: float, den: float) -> float | None:
    if den == 0:
        return None
    return num / den


def latest_trade_date(table: str = "nse_intraday.raw_security_1m") -> date:
    row = fetch_one(f"select max(trade_date) as trade_date from {table}")
    if not row or not row.get("trade_date"):
        raise RuntimeError(f"No trade_date found in {table}")
    return row["trade_date"]


def latest_source_trade_date() -> date | None:
    return fetch_val(
        """
        select (ts at time zone 'Asia/Kolkata')::date
        from public.bars_1m
        where exchange = 'NSE'
        order by ts desc
        limit 1
        """
    )


def _local_now() -> datetime:
    return datetime.now(ZoneInfo(get_settings().timezone))


def _is_market_open(now_local: datetime | None = None) -> bool:
    settings = get_settings()
    now_local = now_local or _local_now()
    return (
        now_local.isoweekday() <= 5
        and settings.market_alert_start_time <= now_local.timetz().replace(tzinfo=None) <= settings.market_alert_end_time
    )


def _guard_result(
    *,
    key: str,
    severity: str,
    passed: bool,
    observed: Any,
    threshold: str,
    message: str,
    detail: dict | None = None,
) -> dict:
    return {
        "key": key,
        "severity": severity,
        "passed": passed,
        "observed": _iso(observed),
        "threshold": threshold,
        "message": message,
        "detail": detail or {},
    }


def get_live_guard_status(trade_date: date | None = None, index_code: str | None = None) -> dict:
    settings = get_settings()
    index_code = index_code or settings.default_index_code
    now_local = _local_now()
    now_utc = now_local.astimezone(timezone.utc)
    market_open = _is_market_open(now_local)
    trade_date = trade_date or latest_source_trade_date()

    latest_source_minute = fetch_val("select max(ts) from public.bars_1m where exchange = 'NSE'")
    latest_raw_security_minute = (
        fetch_val(
            "select max(minute_ts) from nse_intraday.raw_security_1m where trade_date = %(trade_date)s",
            {"trade_date": trade_date},
        )
        if trade_date
        else None
    )
    latest_snapshot = (
        fetch_val(
            """
            select max(as_of_ts)
            from nse_ops.dashboard_snapshot_intraday
            where trade_date = %(trade_date)s and index_code = %(index_code)s
            """,
            {"trade_date": trade_date, "index_code": index_code},
        )
        if trade_date
        else None
    )
    live_count = (
        fetch_val(
            "select count(*) from nse_intraday.stock_intraday_live where trade_date = %(trade_date)s",
            {"trade_date": trade_date},
        )
        if trade_date
        else 0
    ) or 0

    source_age_seconds = None
    raw_lag_minutes = None
    snapshot_lag_minutes = None
    if latest_source_minute:
        source_age_seconds = max(0, int((now_utc - latest_source_minute).total_seconds()))
    if latest_source_minute and latest_raw_security_minute:
        raw_lag_minutes = max(0, int((latest_source_minute - latest_raw_security_minute).total_seconds() // 60))
    if latest_raw_security_minute and latest_snapshot:
        snapshot_lag_minutes = max(0, int((latest_raw_security_minute - latest_snapshot).total_seconds() // 60))

    checks = [
        _guard_result(
            key="intraday_source_freshness",
            severity="error",
            passed=(latest_source_minute is not None and (not market_open or (source_age_seconds or 0) <= settings.live_source_max_delay_seconds)),
            observed=source_age_seconds if latest_source_minute is not None else "missing",
            threshold=f"<={settings.live_source_max_delay_seconds}s while market open",
            message="Collector source bars must keep advancing during market hours",
            detail={"latest_source_minute": _iso(latest_source_minute), "market_open": market_open},
        ),
        _guard_result(
            key="intraday_raw_sync_lag",
            severity="error",
            passed=(
                not market_open
                or (
                    latest_raw_security_minute is not None
                    and latest_source_minute is not None
                    and raw_lag_minutes is not None
                    and raw_lag_minutes <= settings.raw_sync_max_lag_minutes
                )
            ),
            observed=raw_lag_minutes if raw_lag_minutes is not None else "missing",
            threshold=f"<={settings.raw_sync_max_lag_minutes}m while market open",
            message="Intraday raw tables must stay close to the source minute feed during market hours",
            detail={"latest_source_minute": _iso(latest_source_minute), "latest_raw_security_minute": _iso(latest_raw_security_minute), "market_open": market_open},
        ),
        _guard_result(
            key="intraday_snapshot_freshness",
            severity="warn",
            passed=(
                not market_open
                or (
                    latest_snapshot is not None
                    and latest_raw_security_minute is not None
                    and snapshot_lag_minutes is not None
                    and snapshot_lag_minutes <= settings.snapshot_max_lag_minutes
                )
            ),
            observed=snapshot_lag_minutes if snapshot_lag_minutes is not None else "missing",
            threshold=f"<={settings.snapshot_max_lag_minutes}m while market open",
            message="Dashboard snapshot should stay near the latest raw security minute during market hours",
            detail={"latest_raw_security_minute": _iso(latest_raw_security_minute), "latest_snapshot": _iso(latest_snapshot), "index_code": index_code, "market_open": market_open},
        ),
        _guard_result(
            key="intraday_live_stock_rows",
            severity="warn",
            passed=(not market_open or live_count >= settings.market_open_live_stock_min_rows),
            observed=live_count,
            threshold=f">={settings.market_open_live_stock_min_rows} rows while market open",
            message="Live stock table should contain a broad intraday universe during market hours",
            detail={"trade_date": _iso(trade_date), "market_open": market_open},
        ),
    ]

    return {
        "trade_date": _iso(trade_date),
        "index_code": index_code,
        "market_open": market_open,
        "checked_at": _iso(now_utc),
        "metrics": {
            "latest_source_minute": _iso(latest_source_minute),
            "latest_raw_security_minute": _iso(latest_raw_security_minute),
            "latest_snapshot": _iso(latest_snapshot),
            "source_age_seconds": source_age_seconds,
            "raw_lag_minutes": raw_lag_minutes,
            "snapshot_lag_minutes": snapshot_lag_minutes,
            "live_stock_count": live_count,
        },
        "checks": checks,
    }


def _emit_live_guard_alerts(run_id: str | None, guard_status: dict) -> list[dict]:
    settings = get_settings()
    if not guard_status.get("checks"):
        return []

    now_utc = datetime.now(timezone.utc)
    emitted: list[dict] = []
    for check in guard_status["checks"]:
        if check["key"] not in LIVE_ALERT_CHECK_KEYS:
            continue

        existing = fetch_one(
            """
            select *
            from nse_ops.alert_state_intraday
            where alert_key = %(alert_key)s
            """,
            {"alert_key": check["key"]},
        )
        status = "ok" if check["passed"] else "alerting"
        status_changed = not existing or existing["status"] != status
        last_alert_at = existing.get("last_alert_at") if existing else None
        cooldown_elapsed = not last_alert_at or (now_utc - last_alert_at) >= timedelta(minutes=settings.alerts_cooldown_minutes)

        event_type = None
        should_notify = False
        if status == "alerting" and (status_changed or cooldown_elapsed):
            should_notify = True
            event_type = "alert" if status_changed else "reminder"
        elif status == "ok" and existing and existing["status"] == "alerting" and settings.alerts_send_recovery:
            should_notify = True
            event_type = "recovery"

        payload = {
            "service": "nse_intraday_intelligence",
            "kind": "intraday_live_guard",
            "event_type": event_type,
            "alert_key": check["key"],
            "status": status,
            "severity": check["severity"],
            "message": check["message"],
            "observed": check["observed"],
            "threshold": check["threshold"],
            "trade_date": guard_status.get("trade_date"),
            "index_code": guard_status.get("index_code"),
            "market_open": guard_status.get("market_open"),
            "run_id": run_id,
            "checked_at": guard_status.get("checked_at"),
            "metrics": guard_status.get("metrics"),
            "detail": check.get("detail", {}),
        }

        execute(
            """
            insert into nse_ops.alert_state_intraday (
              alert_key, status, severity, message, last_observed_at, last_status_change_at,
              last_alert_at, last_recovery_at, last_payload_json, last_message, updated_at
            )
            values (
              %(alert_key)s, %(status)s, %(severity)s, %(message)s, %(last_observed_at)s, %(last_status_change_at)s,
              %(last_alert_at)s, %(last_recovery_at)s, %(last_payload_json)s::jsonb, %(last_message)s, now()
            )
            on conflict (alert_key) do update
            set status = excluded.status,
                severity = excluded.severity,
                message = excluded.message,
                last_observed_at = excluded.last_observed_at,
                last_status_change_at = excluded.last_status_change_at,
                last_alert_at = excluded.last_alert_at,
                last_recovery_at = excluded.last_recovery_at,
                last_payload_json = excluded.last_payload_json,
                last_message = excluded.last_message,
                updated_at = now()
            """,
            {
                "alert_key": check["key"],
                "status": status,
                "severity": check["severity"],
                "message": check["message"],
                "last_observed_at": now_utc,
                "last_status_change_at": now_utc if status_changed else existing.get("last_status_change_at"),
                "last_alert_at": now_utc if should_notify and status == "alerting" else (existing.get("last_alert_at") if existing else None),
                "last_recovery_at": now_utc if should_notify and status == "ok" else (existing.get("last_recovery_at") if existing else None),
                "last_payload_json": dumps_json(payload),
                "last_message": f"{event_type or 'state'}: {check['message']}",
            },
        )

        if should_notify:
            send_webhook_alert(
                enabled=settings.alerts_enable_webhook,
                webhook_url=settings.alerts_webhook_url,
                timeout_seconds=settings.alerts_webhook_timeout_seconds,
                headers=settings.alerts_webhook_headers,
                payload=payload,
            )
            log.warning(
                "intraday live guard %s for %s observed=%s threshold=%s",
                event_type or "state",
                check["key"],
                check["observed"],
                check["threshold"],
            )
            emitted.append({"alert_key": check["key"], "event_type": event_type, "status": status})
    return emitted


def _ensure_partitions_for_trade_date(trade_date: date) -> None:
    start = trade_date.replace(day=1)
    end = trade_date + timedelta(days=31)
    ensure_monthly_partitions(start, end)


def _start_job(job_key: str, trigger_type: str, command_text: str | None = None, meta: dict | None = None) -> str:
    run_id = str(uuid.uuid4())
    execute(
        """
        insert into nse_ops.job_run (
          run_id, job_key, trigger_type, host_name, status, command_text, requested_at, started_at, meta_json
        )
        values (
          %(run_id)s, %(job_key)s, %(trigger_type)s, %(host_name)s, 'running', %(command_text)s, now(), now(), %(meta_json)s::jsonb
        )
        """,
        {
            "run_id": run_id,
            "job_key": job_key,
            "trigger_type": trigger_type,
            "host_name": "nse_intraday_intelligence",
            "command_text": command_text,
            "meta_json": dumps_json(meta or {}),
        },
    )
    return run_id


def _finish_job(run_id: str, status: str, detail: str | None = None, exit_code: int | None = None) -> None:
    execute(
        """
        update nse_ops.job_run
        set status = %(status)s,
            finished_at = now(),
            duration_ms = (extract(epoch from (now() - started_at)) * 1000)::bigint,
            exit_code = %(exit_code)s,
            stdout_tail = coalesce(stdout_tail, %(detail)s)
        where run_id = %(run_id)s::uuid
        """,
        {"run_id": run_id, "status": status, "detail": detail, "exit_code": exit_code},
    )


def _step(run_id: str, step_no: int, step_key: str, status: str, message: str, detail: dict | None = None) -> None:
    execute(
        """
        insert into nse_ops.job_step_log (
          run_id, step_no, step_key, status, started_at, finished_at, message, detail_json
        )
        values (
          %(run_id)s::uuid, %(step_no)s, %(step_key)s, %(status)s, now(), now(), %(message)s, %(detail_json)s::jsonb
        )
        on conflict (run_id, step_no) do update
        set status = excluded.status,
            finished_at = excluded.finished_at,
            message = excluded.message,
            detail_json = excluded.detail_json
        """,
        {
            "run_id": run_id,
            "step_no": step_no,
            "step_key": step_key,
            "status": status,
            "message": message,
            "detail_json": dumps_json(detail or {}),
        },
    )


def _quality(run_id: str | None, check_key: str, severity: str, passed: bool, observed: str | None, threshold: str | None, detail: str | None) -> None:
    execute(
        """
        insert into nse_ops.quality_check_result (
          run_id, check_key, severity, passed, observed_value, threshold_value, detail
        )
        values (
          %(run_id)s::uuid, %(check_key)s, %(severity)s, %(passed)s, %(observed)s, %(threshold)s, %(detail)s
        )
        """,
        {
            "run_id": run_id,
            "check_key": check_key,
            "severity": severity,
            "passed": passed,
            "observed": observed,
            "threshold": threshold,
            "detail": detail,
        },
    )


def sync_raw_minute(trade_date: date | None = None) -> dict:
    trade_date = trade_date or latest_source_trade_date()
    if not trade_date:
        raise RuntimeError("No trade_date found in public.bars_1m")
    _ensure_partitions_for_trade_date(trade_date)

    execute(
        """
        insert into nse_intraday.universe_membership (
          universe_name, symbol, weight, sector_name, effective_from, effective_to, source_system
        )
        select
          universe_name, symbol, weight, sector_name, effective_from, effective_to, source_system
        from integration.v_universe_membership
        on conflict (universe_name, symbol, effective_from) do update
        set weight = excluded.weight,
            sector_name = excluded.sector_name,
            effective_to = excluded.effective_to,
            source_system = excluded.source_system,
            updated_at = now()
        """
    )

    execute(
        """
        insert into nse_intraday.raw_security_1m (
          trade_date, minute_ts, symbol, open_px, high_px, low_px, close_px, volume, turnover,
          vwap, trades, source_pk, source_system
        )
        select
          trade_date, minute_ts, symbol, open_px, high_px, low_px, close_px,
          coalesce(volume, 0), turnover, vwap, trades, source_pk, source_system
        from integration.v_source_security_1m
        where trade_date = %(trade_date)s
        on conflict (trade_date, minute_ts, symbol) do update
        set open_px = excluded.open_px,
            high_px = excluded.high_px,
            low_px = excluded.low_px,
            close_px = excluded.close_px,
            volume = excluded.volume,
            turnover = excluded.turnover,
            vwap = excluded.vwap,
            trades = excluded.trades,
            source_pk = excluded.source_pk,
            source_system = excluded.source_system,
            ingested_at = now()
        """,
        {"trade_date": trade_date},
    )

    execute(
        """
        insert into nse_intraday.raw_index_1m (
          trade_date, minute_ts, index_code, index_name, open_px, high_px, low_px, close_px, volume,
          turnover, vwap, trades, source_pk, source_system
        )
        select
          trade_date, minute_ts, index_code, index_name, open_px, high_px, low_px, close_px,
          volume, turnover, vwap, trades, source_pk, source_system
        from integration.v_source_index_1m
        where trade_date = %(trade_date)s
        on conflict (trade_date, minute_ts, index_code) do update
        set index_name = excluded.index_name,
            open_px = excluded.open_px,
            high_px = excluded.high_px,
            low_px = excluded.low_px,
            close_px = excluded.close_px,
            volume = excluded.volume,
            turnover = excluded.turnover,
            vwap = excluded.vwap,
            trades = excluded.trades,
            source_pk = excluded.source_pk,
            source_system = excluded.source_system,
            ingested_at = now()
        """,
        {"trade_date": trade_date},
    )

    return {
        "trade_date": trade_date.isoformat(),
        "security_rows": fetch_val("select count(*) from nse_intraday.raw_security_1m where trade_date = %(trade_date)s", {"trade_date": trade_date}),
        "index_rows": fetch_val("select count(*) from nse_intraday.raw_index_1m where trade_date = %(trade_date)s", {"trade_date": trade_date}),
    }


SECURITY_FEATURE_SQL = """
delete from nse_intraday.security_minute_feature where trade_date = %(trade_date)s;

with base as (
  select
    r.trade_date,
    r.minute_ts,
    r.symbol,
    r.high_px,
    r.low_px,
    r.close_px,
    coalesce(r.volume, 0) as volume,
    coalesce(r.turnover, coalesce(r.vwap, r.close_px) * coalesce(r.volume, 0)) as turnover_value,
    p.prev_close,
    p.avg_daily_volume_20d,
    p.sector_name,
    p.universe_weight,
    first_value(r.open_px) over (partition by r.trade_date, r.symbol order by r.minute_ts) as session_open,
    sum(coalesce(r.volume, 0)) over (partition by r.trade_date, r.symbol order by r.minute_ts) as cum_volume,
    sum(coalesce(r.turnover, coalesce(r.vwap, r.close_px) * coalesce(r.volume, 0))) over (partition by r.trade_date, r.symbol order by r.minute_ts) as cum_turnover,
    max(r.high_px) over (partition by r.trade_date, r.symbol order by r.minute_ts rows between unbounded preceding and current row) as session_high_so_far,
    min(r.low_px) over (partition by r.trade_date, r.symbol order by r.minute_ts rows between unbounded preceding and current row) as session_low_so_far,
    row_number() over (partition by r.trade_date, r.symbol order by r.minute_ts) as minute_no,
    lag(r.close_px, 5) over (partition by r.trade_date, r.symbol order by r.minute_ts) as close_5m_ago,
    lag(r.close_px, 15) over (partition by r.trade_date, r.symbol order by r.minute_ts) as close_15m_ago,
    lag(r.close_px, 30) over (partition by r.trade_date, r.symbol order by r.minute_ts) as close_30m_ago
  from nse_intraday.raw_security_1m r
  left join integration.v_prev_security_daily p
    on p.trade_date = r.trade_date
   and p.symbol = r.symbol
  where r.trade_date = %(trade_date)s
),
orb as (
  select
    trade_date,
    symbol,
    max(high_px) filter (where minute_no <= 15) as open_range_high_15,
    min(low_px) filter (where minute_no <= 15) as open_range_low_15
  from base
  group by trade_date, symbol
)
insert into nse_intraday.security_minute_feature (
  trade_date, minute_ts, symbol, sector_name, universe_weight, last_price, prev_close,
  session_open, session_high_so_far, session_low_so_far, day_vwap, cum_volume, cum_turnover,
  change_pct_from_prev_close, change_pct_from_open, change_pct_5m, change_pct_15m, change_pct_30m,
  vwap_dev_bps, above_vwap, open_range_high_15, open_range_low_15, above_open_range_high,
  below_open_range_low, range_position_pct, volume_ratio_day, minute_no, generated_at
)
select
  b.trade_date,
  b.minute_ts,
  b.symbol,
  b.sector_name,
  coalesce(b.universe_weight, um.weight, 1.0) as universe_weight,
  b.close_px as last_price,
  b.prev_close,
  b.session_open,
  b.session_high_so_far,
  b.session_low_so_far,
  (b.cum_turnover / nullif(b.cum_volume, 0)) as day_vwap,
  b.cum_volume,
  b.cum_turnover,
  100.0 * (b.close_px / nullif(b.prev_close, 0) - 1.0) as change_pct_from_prev_close,
  100.0 * (b.close_px / nullif(b.session_open, 0) - 1.0) as change_pct_from_open,
  100.0 * (b.close_px / nullif(b.close_5m_ago, 0) - 1.0) as change_pct_5m,
  100.0 * (b.close_px / nullif(b.close_15m_ago, 0) - 1.0) as change_pct_15m,
  100.0 * (b.close_px / nullif(b.close_30m_ago, 0) - 1.0) as change_pct_30m,
  10000.0 * (b.close_px / nullif((b.cum_turnover / nullif(b.cum_volume, 0)), 0) - 1.0) as vwap_dev_bps,
  b.close_px >= (b.cum_turnover / nullif(b.cum_volume, 0)) as above_vwap,
  o.open_range_high_15,
  o.open_range_low_15,
  b.close_px > o.open_range_high_15 as above_open_range_high,
  b.close_px < o.open_range_low_15 as below_open_range_low,
  100.0 * (b.close_px - b.session_low_so_far) / nullif((b.session_high_so_far - b.session_low_so_far), 0) as range_position_pct,
  case when coalesce(b.avg_daily_volume_20d, 0) > 0 then b.cum_volume::numeric / b.avg_daily_volume_20d else null end as volume_ratio_day,
  b.minute_no,
  now()
from base b
join orb o
  on o.trade_date = b.trade_date
 and o.symbol = b.symbol
left join lateral (
  select weight
  from nse_intraday.universe_membership um
  where um.universe_name = 'NIFTY100'
    and um.symbol = b.symbol
    and um.effective_from <= b.trade_date
    and (um.effective_to is null or um.effective_to >= b.trade_date)
  order by um.effective_from desc
  limit 1
) um on true
on conflict (trade_date, minute_ts, symbol) do update
set sector_name = excluded.sector_name,
    universe_weight = excluded.universe_weight,
    last_price = excluded.last_price,
    prev_close = excluded.prev_close,
    session_open = excluded.session_open,
    session_high_so_far = excluded.session_high_so_far,
    session_low_so_far = excluded.session_low_so_far,
    day_vwap = excluded.day_vwap,
    cum_volume = excluded.cum_volume,
    cum_turnover = excluded.cum_turnover,
    change_pct_from_prev_close = excluded.change_pct_from_prev_close,
    change_pct_from_open = excluded.change_pct_from_open,
    change_pct_5m = excluded.change_pct_5m,
    change_pct_15m = excluded.change_pct_15m,
    change_pct_30m = excluded.change_pct_30m,
    vwap_dev_bps = excluded.vwap_dev_bps,
    above_vwap = excluded.above_vwap,
    open_range_high_15 = excluded.open_range_high_15,
    open_range_low_15 = excluded.open_range_low_15,
    above_open_range_high = excluded.above_open_range_high,
    below_open_range_low = excluded.below_open_range_low,
    range_position_pct = excluded.range_position_pct,
    volume_ratio_day = excluded.volume_ratio_day,
    minute_no = excluded.minute_no,
    generated_at = now()
"""

MARKET_FEATURE_SQL = """
delete from nse_intraday.market_minute_feature
where trade_date = %(trade_date)s
  and (%(index_code)s::text is null or index_code = %(index_code)s::text);

with idx_base as (
  select
    r.trade_date,
    r.minute_ts,
    r.index_code,
    r.index_name,
    r.close_px,
    r.high_px,
    r.low_px,
    p.prev_close,
    first_value(r.open_px) over (partition by r.trade_date, r.index_code order by r.minute_ts) as session_open,
    max(r.high_px) over (partition by r.trade_date, r.index_code order by r.minute_ts rows between unbounded preceding and current row) as session_high_so_far,
    min(r.low_px) over (partition by r.trade_date, r.index_code order by r.minute_ts rows between unbounded preceding and current row) as session_low_so_far,
    row_number() over (partition by r.trade_date, r.index_code order by r.minute_ts) as minute_no,
    lag(r.close_px, 5) over (partition by r.trade_date, r.index_code order by r.minute_ts) as close_5m_ago,
    lag(r.close_px, 15) over (partition by r.trade_date, r.index_code order by r.minute_ts) as close_15m_ago,
    lag(r.close_px, 30) over (partition by r.trade_date, r.index_code order by r.minute_ts) as close_30m_ago
  from nse_intraday.raw_index_1m r
  left join integration.v_prev_index_daily p
    on p.trade_date = r.trade_date
   and p.index_code = r.index_code
  where r.trade_date = %(trade_date)s
    and (%(index_code)s::text is null or r.index_code = %(index_code)s::text)
),
idx_orb as (
  select
    trade_date,
    index_code,
    max(high_px) filter (where minute_no <= 15) as open_range_high_15,
    min(low_px) filter (where minute_no <= 15) as open_range_low_15
  from idx_base
  group by trade_date, index_code
),
stock as (
  select *
  from nse_intraday.security_minute_feature
  where trade_date = %(trade_date)s
),
agg as (
  select
    trade_date,
    minute_ts,
    100.0 * avg((change_pct_from_prev_close > 0)::int) as breadth_up_pct,
    100.0 * avg((above_vwap)::int) as breadth_above_vwap_pct,
    100.0 * avg((above_open_range_high)::int) as breadth_above_or_high_pct,
    100.0 * avg((below_open_range_low)::int) as breadth_below_or_low_pct,
    stddev_samp(change_pct_from_prev_close) as dispersion_pct
  from stock
  group by trade_date, minute_ts
),
signagg as (
  select
    i.trade_date,
    i.minute_ts,
    i.index_code,
    100.0 * avg(
      case
        when i.prev_close is null or i.prev_close = 0 or i.close_px = i.prev_close then 0
        when sign(s.change_pct_from_prev_close) = sign(100.0 * (i.close_px / nullif(i.prev_close, 0) - 1.0)) then 1
        else 0
      end
    ) as sign_agreement_pct,
    100.0 * sum(
      case
        when i.prev_close is null or i.prev_close = 0 or i.close_px = i.prev_close then 0
        when sign(s.change_pct_from_prev_close) = sign(100.0 * (i.close_px / nullif(i.prev_close, 0) - 1.0))
          then coalesce(nullif(s.universe_weight, 0), 1.0)
        else 0
      end
    ) / nullif(sum(coalesce(nullif(s.universe_weight, 0), 1.0)), 0) as weighted_participation_pct
  from idx_base i
  join stock s
    on s.trade_date = i.trade_date
   and s.minute_ts = i.minute_ts
  group by i.trade_date, i.minute_ts, i.index_code
),
topc as (
  select
    trade_date,
    minute_ts,
    100.0 * sum(abs(contribution)) filter (where rn <= 10) / nullif(sum(abs(contribution)), 0) as top10_concentration_pct
  from (
    select
      s.trade_date,
      s.minute_ts,
      s.symbol,
      coalesce(nullif(s.universe_weight, 0), 1.0) * coalesce(s.change_pct_from_prev_close, 0) as contribution,
      row_number() over (
        partition by s.trade_date, s.minute_ts
        order by abs(coalesce(nullif(s.universe_weight, 0), 1.0) * coalesce(s.change_pct_from_prev_close, 0)) desc
      ) as rn
    from stock s
  ) q
  group by trade_date, minute_ts
)
insert into nse_intraday.market_minute_feature (
  trade_date, minute_ts, index_code, index_name, last_price, prev_close, session_open,
  session_high_so_far, session_low_so_far, change_pct_from_prev_close, change_pct_from_open,
  change_pct_5m, change_pct_15m, change_pct_30m, gap_pct, open_range_high_15, open_range_low_15,
  open_range_15_pct, breadth_up_pct, breadth_above_vwap_pct, breadth_above_or_high_pct,
  breadth_below_or_low_pct, dispersion_pct, sign_agreement_pct, weighted_participation_pct,
  top10_concentration_pct, minute_no, generated_at
)
select
  i.trade_date,
  i.minute_ts,
  i.index_code,
  i.index_name,
  i.close_px,
  i.prev_close,
  i.session_open,
  i.session_high_so_far,
  i.session_low_so_far,
  100.0 * (i.close_px / nullif(i.prev_close, 0) - 1.0) as change_pct_from_prev_close,
  100.0 * (i.close_px / nullif(i.session_open, 0) - 1.0) as change_pct_from_open,
  100.0 * (i.close_px / nullif(i.close_5m_ago, 0) - 1.0) as change_pct_5m,
  100.0 * (i.close_px / nullif(i.close_15m_ago, 0) - 1.0) as change_pct_15m,
  100.0 * (i.close_px / nullif(i.close_30m_ago, 0) - 1.0) as change_pct_30m,
  100.0 * (i.session_open / nullif(i.prev_close, 0) - 1.0) as gap_pct,
  o.open_range_high_15,
  o.open_range_low_15,
  100.0 * (o.open_range_high_15 - o.open_range_low_15) / nullif(i.prev_close, 0) as open_range_15_pct,
  a.breadth_up_pct,
  a.breadth_above_vwap_pct,
  a.breadth_above_or_high_pct,
  a.breadth_below_or_low_pct,
  a.dispersion_pct,
  s.sign_agreement_pct,
  s.weighted_participation_pct,
  t.top10_concentration_pct,
  i.minute_no,
  now()
from idx_base i
join idx_orb o
  on o.trade_date = i.trade_date
 and o.index_code = i.index_code
left join agg a
  on a.trade_date = i.trade_date
 and a.minute_ts = i.minute_ts
left join signagg s
  on s.trade_date = i.trade_date
 and s.minute_ts = i.minute_ts
 and s.index_code = i.index_code
left join topc t
  on t.trade_date = i.trade_date
 and t.minute_ts = i.minute_ts
"""


def refresh_feature_tables(trade_date: date | None = None, index_code: str | None = None) -> dict:
    trade_date = trade_date or latest_trade_date("nse_intraday.raw_security_1m")
    _ensure_partitions_for_trade_date(trade_date)
    execute(SECURITY_FEATURE_SQL, {"trade_date": trade_date})
    execute(MARKET_FEATURE_SQL, {"trade_date": trade_date, "index_code": index_code})
    return {
        "trade_date": trade_date.isoformat(),
        "security_feature_rows": fetch_val("select count(*) from nse_intraday.security_minute_feature where trade_date = %(trade_date)s", {"trade_date": trade_date}),
        "market_feature_rows": fetch_val(
            "select count(*) from nse_intraday.market_minute_feature where trade_date = %(trade_date)s and (%(index_code)s::text is null or index_code = %(index_code)s::text)",
            {"trade_date": trade_date, "index_code": index_code},
        ),
    }


def _sign(value: float) -> int:
    if value > 0:
        return 1
    if value < 0:
        return -1
    return 0


def _market_state_labels(rows: list[dict]) -> dict:
    if not rows:
        raise RuntimeError("No market rows available to classify state")
    latest = rows[-1]
    session_ret = _scalar(latest.get("change_pct_from_prev_close"))
    gap_pct = _scalar(latest.get("gap_pct"))
    breadth_up = _scalar(latest.get("breadth_up_pct"))
    breadth_vwap = _scalar(latest.get("breadth_above_vwap_pct"))
    breadth_or = _scalar(latest.get("breadth_above_or_high_pct"))
    breadth_or_down = _scalar(latest.get("breadth_below_or_low_pct"))
    dispersion = _scalar(latest.get("dispersion_pct"))
    weighted_participation = _scalar(latest.get("weighted_participation_pct"))
    top10_concentration = _scalar(latest.get("top10_concentration_pct"))

    session_high = _scalar(latest.get("session_high_so_far"))
    session_low = _scalar(latest.get("session_low_so_far"))
    last_price = _scalar(latest.get("last_price"))
    prev_close = _scalar(latest.get("prev_close"))
    open_range_15_pct = _scalar(latest.get("open_range_15_pct"))
    session_range_pct = 100.0 * ((session_high / prev_close) - (session_low / prev_close)) if prev_close else 0.0
    close_location_pct = 100.0 * _safe_pct(last_price - session_low, (session_high - session_low)) if session_high != session_low else 50.0

    gap_filled = False
    if gap_pct > 0 and prev_close:
        gap_filled = any(_scalar(r.get("last_price")) <= prev_close for r in rows)
    elif gap_pct < 0 and prev_close:
        gap_filled = any(_scalar(r.get("last_price")) >= prev_close for r in rows)

    mid_idx = max(0, len(rows) // 2)
    midday_ret = _scalar(rows[mid_idx].get("change_pct_from_prev_close"))
    last_hour_start_ret = _scalar(rows[-60].get("change_pct_from_prev_close")) if len(rows) > 60 else _scalar(rows[0].get("change_pct_from_prev_close"))
    last_hour_ret = session_ret - last_hour_start_ret

    flips = 0
    last_sign = None
    for row in rows:
        current_sign = _sign(_scalar(row.get("change_pct_5m")))
        if current_sign == 0:
            continue
        if last_sign is not None and current_sign != last_sign:
            flips += 1
        last_sign = current_sign

    trend_up = (
        session_ret >= 0.80
        and close_location_pct >= 75
        and breadth_vwap >= 60
        and weighted_participation >= 60
        and not gap_filled
    )
    trend_down = (
        session_ret <= -0.80
        and close_location_pct <= 25
        and breadth_vwap <= 40
        and weighted_participation >= 60
        and not gap_filled
    )
    gap_and_go = (
        abs(gap_pct) >= 0.35
        and _sign(gap_pct) == _sign(session_ret)
        and not gap_filled
        and abs(session_ret) >= max(0.60, abs(gap_pct) * 0.80)
    )
    failed_open = abs(gap_pct) >= 0.35 and (_sign(gap_pct) != _sign(session_ret) or gap_filled)
    late_day_reversal = _sign(midday_ret) != 0 and _sign(midday_ret) != _sign(session_ret) and abs(last_hour_ret) >= max(0.25, abs(session_ret) * 0.50)
    high_vol_chop = session_range_pct >= 1.0 and abs(session_ret) <= 0.35 and flips >= 4
    broad_participation = breadth_up >= 60 and breadth_vwap >= 60 and top10_concentration <= 55
    narrow_leadership = abs(session_ret) >= 0.40 and top10_concentration >= 65 and breadth_up <= 60

    participation_label = "balanced"
    if broad_participation:
        participation_label = "broad_participation"
    elif narrow_leadership:
        participation_label = "narrow_leadership"

    primary_state = "balanced-session"
    if high_vol_chop:
        primary_state = "high-volatility-chop"
    elif late_day_reversal:
        primary_state = "late-day-reversal-up" if session_ret > 0 else "late-day-reversal-down" if session_ret < 0 else "late-day-reversal"
    elif gap_and_go:
        primary_state = "gap-and-go-up" if session_ret > 0 else "gap-and-go-down"
    elif trend_up:
        primary_state = "trend-day-up"
    elif trend_down:
        primary_state = "trend-day-down"
    elif failed_open:
        primary_state = "gap-fill-or-failed-open"

    secondary: list[str] = []
    if broad_participation:
        secondary.append("broad-participation")
    if narrow_leadership:
        secondary.append("narrow-leadership")
    if gap_filled and "gap-fill" not in secondary:
        secondary.append("gap-fill")
    if late_day_reversal and "late-reversal" not in secondary:
        secondary.append("late-reversal")
    if high_vol_chop and "chop" not in secondary:
        secondary.append("chop")

    confidence_raw = 20.0
    if trend_up or trend_down:
        confidence_raw += 30.0
    if gap_and_go:
        confidence_raw += 25.0
    if late_day_reversal:
        confidence_raw += 20.0
    if broad_participation or narrow_leadership:
        confidence_raw += 15.0
    if high_vol_chop:
        confidence_raw += 20.0
    confidence_score = min(100.0, confidence_raw)

    direction = _direction(session_ret)
    narrative_bits = [
        f"Index move {session_ret:.2f}%",
        f"gap {gap_pct:.2f}%",
        f"Nifty100 breadth up {breadth_up:.1f}%",
        f"above VWAP {breadth_vwap:.1f}%",
        f"top10 concentration {top10_concentration:.1f}%",
    ]
    if broad_participation:
        narrative_bits.append("participation is broad enough to support the move")
    if narrow_leadership:
        narrative_bits.append("leadership is concentrated in a few heavyweights")
    if high_vol_chop:
        narrative_bits.append("session is volatile with multiple sign flips")
    if late_day_reversal:
        narrative_bits.append("the final phase of the session reversed the earlier tone")
    if failed_open:
        narrative_bits.append("the opening move was not fully accepted")

    return {
        "trade_date": latest["trade_date"],
        "index_code": latest["index_code"],
        "index_name": latest["index_name"],
        "as_of_ts": latest["minute_ts"],
        "last_price": latest.get("last_price"),
        "prev_close": latest.get("prev_close"),
        "change_pct": session_ret,
        "gap_pct": gap_pct,
        "session_range_pct": session_range_pct,
        "close_location_pct": close_location_pct,
        "open_range_15_pct": open_range_15_pct,
        "breadth_up_pct": breadth_up,
        "breadth_above_vwap_pct": breadth_vwap,
        "breadth_above_or_high_pct": breadth_or,
        "breadth_below_or_low_pct": breadth_or_down,
        "dispersion_pct": dispersion,
        "weighted_participation_pct": weighted_participation,
        "top10_concentration_pct": top10_concentration,
        "participation_label": participation_label,
        "primary_state": primary_state,
        "secondary_states": secondary,
        "confidence_score": confidence_score,
        "gap_filled": gap_filled,
        "failed_open": failed_open,
        "late_day_reversal": late_day_reversal,
        "high_volatility_chop": high_vol_chop,
        "narrow_leadership": narrow_leadership,
        "broad_participation": broad_participation,
        "narrative": ". ".join(narrative_bits) + ".",
        "direction": direction,
        "accent_token": _accent(direction),
        "arrow": _arrow(direction),
    }


def _history_context(index_code: str, primary_state: str) -> dict:
    row = fetch_one(
        """
        select *
        from nse_intraday.vw_market_state_history_stats
        where index_code = %(index_code)s
          and primary_state = %(primary_state)s
        """,
        {"index_code": index_code, "primary_state": primary_state},
    )
    return _serialize_row(row) if row else {}


def _build_stock_live_rows(trade_date: date, as_of_ts: datetime, index_code: str) -> list[dict]:
    market_row = fetch_one(
        """
        select *
        from nse_intraday.market_minute_feature
        where trade_date = %(trade_date)s and minute_ts = %(as_of_ts)s and index_code = %(index_code)s
        """,
        {"trade_date": trade_date, "as_of_ts": as_of_ts, "index_code": index_code},
    )
    if not market_row:
        return []

    stock_rows = fetch_all(
        """
        select *
        from nse_intraday.security_minute_feature
        where trade_date = %(trade_date)s and minute_ts = %(as_of_ts)s
        order by symbol
        """,
        {"trade_date": trade_date, "as_of_ts": as_of_ts},
    )
    index_change = _scalar(market_row.get("change_pct_from_prev_close"))
    live_rows: list[dict] = []
    for row in stock_rows:
        stock_change = _scalar(row.get("change_pct_from_prev_close"))
        rel_strength_bps = 100.0 * (stock_change - index_change)
        change_15m = _scalar(row.get("change_pct_15m"))
        change_open = _scalar(row.get("change_pct_from_open"))
        vwap_dev_bps = _scalar(row.get("vwap_dev_bps"))
        volume_ratio_day = _scalar(row.get("volume_ratio_day"))
        above_vwap = bool(row.get("above_vwap"))
        above_or = bool(row.get("above_open_range_high"))
        below_or = bool(row.get("below_open_range_low"))
        range_position = _scalar(row.get("range_position_pct"), 50.0)

        continuation_score = 0.0
        weakness_score = 0.0
        mean_reversion_score = 0.0
        reversal_score = 0.0

        if stock_change > 0:
            continuation_score += 20.0
        if stock_change < 0:
            weakness_score += 20.0
        if above_vwap:
            continuation_score += 20.0
        else:
            weakness_score += 10.0
        if above_or and stock_change > 0:
            continuation_score += 20.0
        if below_or and stock_change < 0:
            weakness_score += 20.0
        if change_15m > 0:
            continuation_score += 15.0
        if change_15m < 0:
            weakness_score += 15.0
        if rel_strength_bps > 25:
            continuation_score += 15.0
        if rel_strength_bps < -25:
            weakness_score += 15.0
        if volume_ratio_day > 0.50:
            continuation_score += 10.0
            weakness_score += 10.0

        if not above_vwap and change_15m > 0 and vwap_dev_bps > -75:
            mean_reversion_score += 30.0
        if abs(change_open) > 0.70 and _sign(change_open) != _sign(change_15m):
            mean_reversion_score += 20.0
            reversal_score += 20.0
        if 20 <= range_position <= 60:
            mean_reversion_score += 10.0
        if abs(_scalar(row.get("change_pct_30m"))) >= 0.30 and _sign(_scalar(row.get("change_pct_30m"))) != _sign(stock_change):
            reversal_score += 25.0
        if range_position <= 20 and change_15m > 0:
            reversal_score += 15.0
        if range_position >= 80 and change_15m < 0:
            reversal_score += 15.0
        if above_vwap and _sign(change_open) != _sign(stock_change):
            reversal_score += 10.0

        dominant_signal = "balanced"
        max_score = max(continuation_score, weakness_score, mean_reversion_score, reversal_score)
        if max_score == continuation_score and continuation_score >= 40:
            dominant_signal = "intraday-strength"
        elif max_score == weakness_score and weakness_score >= 40:
            dominant_signal = "intraday-weakness"
        elif max_score == mean_reversion_score and mean_reversion_score >= 35:
            dominant_signal = "mean-reversion-candidate"
        elif max_score == reversal_score and reversal_score >= 35:
            dominant_signal = "late-reversal-candidate"

        direction = _direction(stock_change)
        tags: list[str] = []
        if above_vwap:
            tags.append("above-vwap")
        if above_or:
            tags.append("above-open-range")
        if below_or:
            tags.append("below-open-range")
        if rel_strength_bps > 50:
            tags.append("relative-strength")
        if rel_strength_bps < -50:
            tags.append("relative-weakness")
        if mean_reversion_score >= 35:
            tags.append("mean-reversion")
        if reversal_score >= 35:
            tags.append("reversal-risk")

        conclusion = {
            "intraday-strength": "Current move is confirming the session direction and participation signals.",
            "intraday-weakness": "Current weakness is aligned with adverse intraday structure.",
            "mean-reversion-candidate": "Price action is improving versus the early move and may suit mean-reversion study.",
            "late-reversal-candidate": "Recent move is materially different from the earlier session path.",
            "balanced": "No dominant intraday pattern currently stands out.",
        }[dominant_signal]

        payload = {
            "trade_date": trade_date,
            "as_of_ts": as_of_ts,
            "symbol": row["symbol"],
            "sector_name": row.get("sector_name"),
            "last_price": row.get("last_price"),
            "change_pct_from_prev_close": stock_change,
            "change_pct_from_open": change_open,
            "change_pct_15m": change_15m,
            "change_pct_30m": _scalar(row.get("change_pct_30m")),
            "vwap_dev_bps": vwap_dev_bps,
            "relative_strength_bps": rel_strength_bps,
            "above_vwap": above_vwap,
            "above_open_range_high": above_or,
            "below_open_range_low": below_or,
            "range_position_pct": range_position,
            "volume_ratio_day": volume_ratio_day,
            "continuation_score": continuation_score,
            "weakness_score": weakness_score,
            "mean_reversion_score": mean_reversion_score,
            "reversal_score": reversal_score,
            "dominant_signal": dominant_signal,
            "tags": tags,
        }
        live_rows.append(
            {
                "trade_date": trade_date,
                "as_of_ts": as_of_ts,
                "symbol": row["symbol"],
                "sector_name": row.get("sector_name"),
                "last_price": row.get("last_price"),
                "change_pct_from_prev_close": stock_change,
                "change_pct_from_open": change_open,
                "change_pct_15m": change_15m,
                "vwap_dev_bps": vwap_dev_bps,
                "relative_strength_bps": rel_strength_bps,
                "above_vwap": above_vwap,
                "above_open_range_high": above_or,
                "below_open_range_low": below_or,
                "volume_ratio_day": volume_ratio_day,
                "continuation_score": continuation_score,
                "weakness_score": weakness_score,
                "mean_reversion_score": mean_reversion_score,
                "reversal_score": reversal_score,
                "dominant_signal": dominant_signal,
                "direction": direction,
                "accent_token": _accent(direction),
                "tags_json": tags,
                "conclusion": conclusion,
                "payload_json": payload,
            }
        )
    return live_rows


def _persist_stock_live_rows(live_rows: list[dict]) -> None:
    if not live_rows:
        return
    trade_date = live_rows[0]["trade_date"]
    execute("delete from nse_intraday.stock_intraday_live where trade_date = %(trade_date)s", {"trade_date": trade_date})
    execute_many(
        """
        insert into nse_intraday.stock_intraday_live (
          trade_date, as_of_ts, symbol, sector_name, last_price, change_pct_from_prev_close,
          change_pct_from_open, change_pct_15m, vwap_dev_bps, relative_strength_bps, above_vwap,
          above_open_range_high, below_open_range_low, volume_ratio_day, continuation_score,
          weakness_score, mean_reversion_score, reversal_score, dominant_signal, direction,
          accent_token, tags_json, conclusion, payload_json
        )
        values (
          %(trade_date)s, %(as_of_ts)s, %(symbol)s, %(sector_name)s, %(last_price)s, %(change_pct_from_prev_close)s,
          %(change_pct_from_open)s, %(change_pct_15m)s, %(vwap_dev_bps)s, %(relative_strength_bps)s, %(above_vwap)s,
          %(above_open_range_high)s, %(below_open_range_low)s, %(volume_ratio_day)s, %(continuation_score)s,
          %(weakness_score)s, %(mean_reversion_score)s, %(reversal_score)s, %(dominant_signal)s, %(direction)s,
          %(accent_token)s, %(tags_json)s::jsonb, %(conclusion)s, %(payload_json)s::jsonb
        )
        on conflict (trade_date, symbol) do update
        set as_of_ts = excluded.as_of_ts,
            sector_name = excluded.sector_name,
            last_price = excluded.last_price,
            change_pct_from_prev_close = excluded.change_pct_from_prev_close,
            change_pct_from_open = excluded.change_pct_from_open,
            change_pct_15m = excluded.change_pct_15m,
            vwap_dev_bps = excluded.vwap_dev_bps,
            relative_strength_bps = excluded.relative_strength_bps,
            above_vwap = excluded.above_vwap,
            above_open_range_high = excluded.above_open_range_high,
            below_open_range_low = excluded.below_open_range_low,
            volume_ratio_day = excluded.volume_ratio_day,
            continuation_score = excluded.continuation_score,
            weakness_score = excluded.weakness_score,
            mean_reversion_score = excluded.mean_reversion_score,
            reversal_score = excluded.reversal_score,
            dominant_signal = excluded.dominant_signal,
            direction = excluded.direction,
            accent_token = excluded.accent_token,
            tags_json = excluded.tags_json,
            conclusion = excluded.conclusion,
            payload_json = excluded.payload_json,
            generated_at = now()
        """,
        [
            {
                **row,
                "tags_json": dumps_json(row["tags_json"]),
                "payload_json": dumps_json(row["payload_json"]),
            }
            for row in live_rows
        ],
    )


def _persist_market_session_summary(summary: dict) -> None:
    execute(
        """
        insert into nse_intraday.market_session_summary (
          trade_date, index_code, as_of_ts, index_name, last_price, prev_close, change_pct, gap_pct,
          session_range_pct, close_location_pct, open_range_15_pct, breadth_up_pct, breadth_above_vwap_pct,
          breadth_above_or_high_pct, breadth_below_or_low_pct, dispersion_pct, weighted_participation_pct,
          top10_concentration_pct, participation_label, primary_state, secondary_states_json, confidence_score,
          gap_filled, failed_open, late_day_reversal, high_volatility_chop, narrow_leadership, broad_participation,
          narrative, payload_json, generated_at
        )
        values (
          %(trade_date)s, %(index_code)s, %(as_of_ts)s, %(index_name)s, %(last_price)s, %(prev_close)s, %(change_pct)s, %(gap_pct)s,
          %(session_range_pct)s, %(close_location_pct)s, %(open_range_15_pct)s, %(breadth_up_pct)s, %(breadth_above_vwap_pct)s,
          %(breadth_above_or_high_pct)s, %(breadth_below_or_low_pct)s, %(dispersion_pct)s, %(weighted_participation_pct)s,
          %(top10_concentration_pct)s, %(participation_label)s, %(primary_state)s, %(secondary_states_json)s::jsonb, %(confidence_score)s,
          %(gap_filled)s, %(failed_open)s, %(late_day_reversal)s, %(high_volatility_chop)s, %(narrow_leadership)s, %(broad_participation)s,
          %(narrative)s, %(payload_json)s::jsonb, now()
        )
        on conflict (trade_date, index_code) do update
        set as_of_ts = excluded.as_of_ts,
            index_name = excluded.index_name,
            last_price = excluded.last_price,
            prev_close = excluded.prev_close,
            change_pct = excluded.change_pct,
            gap_pct = excluded.gap_pct,
            session_range_pct = excluded.session_range_pct,
            close_location_pct = excluded.close_location_pct,
            open_range_15_pct = excluded.open_range_15_pct,
            breadth_up_pct = excluded.breadth_up_pct,
            breadth_above_vwap_pct = excluded.breadth_above_vwap_pct,
            breadth_above_or_high_pct = excluded.breadth_above_or_high_pct,
            breadth_below_or_low_pct = excluded.breadth_below_or_low_pct,
            dispersion_pct = excluded.dispersion_pct,
            weighted_participation_pct = excluded.weighted_participation_pct,
            top10_concentration_pct = excluded.top10_concentration_pct,
            participation_label = excluded.participation_label,
            primary_state = excluded.primary_state,
            secondary_states_json = excluded.secondary_states_json,
            confidence_score = excluded.confidence_score,
            gap_filled = excluded.gap_filled,
            failed_open = excluded.failed_open,
            late_day_reversal = excluded.late_day_reversal,
            high_volatility_chop = excluded.high_volatility_chop,
            narrow_leadership = excluded.narrow_leadership,
            broad_participation = excluded.broad_participation,
            narrative = excluded.narrative,
            payload_json = excluded.payload_json,
            generated_at = now()
        """,
        {
            **summary,
            "secondary_states_json": dumps_json(summary["secondary_states"]),
            "payload_json": dumps_json(summary),
        },
    )


def _seed_watchlists_if_missing() -> None:
    execute(
        """
        insert into nse_ops.watchlist (slug, title, description, watchlist_kind, rule_key, selection_limit, is_active, ui_rank)
        values
          ('intraday-strength', 'Intraday Strength', 'Nifty 100 names showing strong continuation characteristics', 'system', 'intraday_strength', 20, true, 10),
          ('intraday-weakness', 'Intraday Weakness', 'Nifty 100 names showing persistent intraday weakness', 'system', 'intraday_weakness', 20, true, 20),
          ('vwap-reclaim', 'VWAP Reclaim', 'Names showing recovery toward or through VWAP after early weakness', 'system', 'vwap_reclaim', 20, true, 30),
          ('late-reversal', 'Late Reversal', 'Names with meaningful reversal probability into the final phase of the session', 'system', 'late_reversal', 20, true, 40)
        on conflict (slug) do nothing
        """
    )


def _watchlist_rows_for_rule(rule_key: str, live_rows: list[dict], limit: int) -> list[dict]:
    ranked = []
    if rule_key == "intraday_strength":
        ranked = [r for r in live_rows if r["direction"] == "up"]
        ranked.sort(key=lambda r: (r["continuation_score"], r["relative_strength_bps"], r["change_pct_from_prev_close"]), reverse=True)
    elif rule_key == "intraday_weakness":
        ranked = [r for r in live_rows if r["direction"] == "down"]
        ranked.sort(key=lambda r: (r["weakness_score"], -r["relative_strength_bps"], -r["change_pct_from_prev_close"]), reverse=True)
    elif rule_key == "vwap_reclaim":
        ranked = [r for r in live_rows if r["mean_reversion_score"] >= 35]
        ranked.sort(key=lambda r: (r["mean_reversion_score"], r["change_pct_15m"]), reverse=True)
    elif rule_key == "late_reversal":
        ranked = [r for r in live_rows if r["reversal_score"] >= 35]
        ranked.sort(key=lambda r: (r["reversal_score"], abs(r["change_pct_15m"])), reverse=True)
    return ranked[:limit]


def _persist_watchlists(trade_date: date, as_of_ts: datetime, live_rows: list[dict]) -> None:
    _seed_watchlists_if_missing()
    watchlists = fetch_all(
        """
        select watchlist_id, slug, title, rule_key, selection_limit
        from nse_ops.watchlist
        where is_active = true
          and slug in ('intraday-strength', 'intraday-weakness', 'vwap-reclaim', 'late-reversal')
        order by ui_rank asc, title asc
        """
    )
    execute("delete from nse_ops.watchlist_snapshot_intraday where trade_date = %(trade_date)s", {"trade_date": trade_date})
    rows_to_insert: list[dict] = []
    for wl in watchlists:
        picks = _watchlist_rows_for_rule(wl["rule_key"], live_rows, int(wl.get("selection_limit") or 20))
        for rank_no, item in enumerate(picks, start=1):
            score_map = {
                "intraday_strength": item["continuation_score"],
                "intraday_weakness": item["weakness_score"],
                "vwap_reclaim": item["mean_reversion_score"],
                "late_reversal": item["reversal_score"],
            }
            rows_to_insert.append(
                {
                    "trade_date": trade_date,
                    "as_of_ts": as_of_ts,
                    "watchlist_id": wl["watchlist_id"],
                    "symbol": item["symbol"],
                    "rank_no": rank_no,
                    "direction": item["direction"],
                    "accent_token": item["accent_token"],
                    "signal_score": score_map.get(wl["rule_key"], 0.0),
                    "last_price": item["last_price"],
                    "change_pct": item["change_pct_from_prev_close"],
                    "volume_ratio_day": item["volume_ratio_day"],
                    "vwap_dev_bps": item["vwap_dev_bps"],
                    "sector_name": item["sector_name"],
                    "tags_json": dumps_json(item["tags_json"]),
                    "notes": item["conclusion"],
                    "payload_json": dumps_json(item["payload_json"]),
                }
            )
    execute_many(
        """
        insert into nse_ops.watchlist_snapshot_intraday (
          trade_date, as_of_ts, watchlist_id, symbol, rank_no, direction, accent_token, signal_score, last_price,
          change_pct, volume_ratio_day, vwap_dev_bps, sector_name, tags_json, notes, payload_json
        )
        values (
          %(trade_date)s, %(as_of_ts)s, %(watchlist_id)s, %(symbol)s, %(rank_no)s, %(direction)s, %(accent_token)s, %(signal_score)s, %(last_price)s,
          %(change_pct)s, %(volume_ratio_day)s, %(vwap_dev_bps)s, %(sector_name)s, %(tags_json)s::jsonb, %(notes)s, %(payload_json)s::jsonb
        )
        """,
        rows_to_insert,
    )


def _leader_rows(live_rows: list[dict], direction: str, limit: int = 8) -> list[dict]:
    if direction == "up":
        rows = sorted(live_rows, key=lambda r: (r["continuation_score"], r["relative_strength_bps"], r["change_pct_from_prev_close"]), reverse=True)
    else:
        rows = sorted(live_rows, key=lambda r: (r["weakness_score"], -r["relative_strength_bps"], -r["change_pct_from_prev_close"]), reverse=True)
    styled = []
    for row in rows[:limit]:
        styled.append(
            {
                "symbol": row["symbol"],
                "sector_name": row["sector_name"],
                "last_price": row["last_price"],
                "change_pct": row["change_pct_from_prev_close"],
                "relative_strength_bps": row["relative_strength_bps"],
                "dominant_signal": row["dominant_signal"],
                "direction": row["direction"],
                "accent_token": row["accent_token"],
                "arrow": _arrow(row["direction"]),
            }
        )
    return styled


def _ticker_tape(live_rows: list[dict], limit: int = 24) -> list[dict]:
    rows = sorted(live_rows, key=lambda r: abs(_scalar(r["change_pct_from_prev_close"])), reverse=True)[:limit]
    return [
        {
            "symbol": row["symbol"],
            "last_value": row["last_price"],
            "change_pct": row["change_pct_from_prev_close"],
            "direction": row["direction"],
            "accent_token": row["accent_token"],
            "arrow": _arrow(row["direction"]),
        }
        for row in rows
    ]


def _summary_table(summary: dict) -> list[dict]:
    metrics = [
        ("Primary state", summary["primary_state"], "neutral", "Session classification"),
        ("Gap %", round(_scalar(summary["gap_pct"]), 4), _direction(summary["gap_pct"]), "Opening gap versus prior close"),
        ("15m range %", round(_scalar(summary["open_range_15_pct"]), 4), "neutral", "Expansion of the first 15 minutes"),
        ("Breadth up %", round(_scalar(summary["breadth_up_pct"]), 2), _direction(summary["change_pct"]), "Nifty100 names above prior close"),
        ("Above VWAP %", round(_scalar(summary["breadth_above_vwap_pct"]), 2), _direction(summary["change_pct"]), "Nifty100 names above session VWAP"),
        ("Weighted participation %", round(_scalar(summary["weighted_participation_pct"]), 2), _direction(summary["change_pct"]), "Weighted share moving with the index"),
        ("Top10 concentration %", round(_scalar(summary["top10_concentration_pct"]), 2), "neutral", "How much of the move is carried by the ten biggest contributors"),
        ("Dispersion %", round(_scalar(summary["dispersion_pct"]), 4), "neutral", "Cross-sectional return dispersion"),
    ]
    rows = []
    for label, value, direction, note in metrics:
        rows.append(
            {
                "label": label,
                "value": value,
                "direction": direction,
                "accent_token": _accent(direction),
                "arrow": _arrow(direction),
                "note": note,
            }
        )
    return rows


def _build_sections(summary: dict, market_rows: list[dict], live_rows: list[dict]) -> list[dict]:
    latest = market_rows[-1]
    direction = summary["direction"]
    history = _history_context(summary["index_code"], summary["primary_state"])
    timeline = [
        {
            "minute_ts": _iso(row["minute_ts"]),
            "index_change_pct": row.get("change_pct_from_prev_close"),
            "breadth_up_pct": row.get("breadth_up_pct"),
            "breadth_above_vwap_pct": row.get("breadth_above_vwap_pct"),
            "weighted_participation_pct": row.get("weighted_participation_pct"),
            "top10_concentration_pct": row.get("top10_concentration_pct"),
        }
        for row in market_rows
    ]

    sections = [
        {
            "section_slug": "market-state",
            "title": SECTION_META["market-state"]["title"],
            "direction": direction,
            "accent_token": _accent(direction),
            "summary_metrics": {
                "primary_state": summary["primary_state"],
                "confidence_score": summary["confidence_score"],
                "change_pct": summary["change_pct"],
                "gap_pct": summary["gap_pct"],
            },
            "highlights": [
                f"Primary state: {summary['primary_state']}",
                f"Confidence: {summary['confidence_score']:.1f}",
                f"Gap: {summary['gap_pct']:.2f}%",
                f"Close location: {summary['close_location_pct']:.1f}%",
            ],
            "narrative": summary["narrative"],
            "rows": _summary_table(summary),
            "charts": [{"kind": "timeline", "series_key": "market_state_timeline", "rows": timeline}],
            "historical_context": history,
        },
        {
            "section_slug": "breadth-participation",
            "title": SECTION_META["breadth-participation"]["title"],
            "direction": direction,
            "accent_token": _accent(direction),
            "summary_metrics": {
                "breadth_up_pct": summary["breadth_up_pct"],
                "breadth_above_vwap_pct": summary["breadth_above_vwap_pct"],
                "weighted_participation_pct": summary["weighted_participation_pct"],
                "participation_label": summary["participation_label"],
            },
            "highlights": [
                f"Breadth up: {summary['breadth_up_pct']:.1f}%",
                f"Above VWAP: {summary['breadth_above_vwap_pct']:.1f}%",
                f"Weighted participation: {summary['weighted_participation_pct']:.1f}%",
                f"Participation label: {summary['participation_label']}",
            ],
            "narrative": "Large-cap breadth is measured only on the Nifty 100 basket and should be interpreted as large-cap participation, not full-market breadth.",
            "rows": [
                {
                    "metric": "Breadth up %",
                    "value": summary["breadth_up_pct"],
                    "direction": direction,
                    "accent_token": _accent(direction),
                },
                {
                    "metric": "Above VWAP %",
                    "value": summary["breadth_above_vwap_pct"],
                    "direction": direction,
                    "accent_token": _accent(direction),
                },
                {
                    "metric": "Above open range %",
                    "value": summary["breadth_above_or_high_pct"],
                    "direction": direction,
                    "accent_token": _accent(direction),
                },
                {
                    "metric": "Below open range %",
                    "value": summary["breadth_below_or_low_pct"],
                    "direction": "down" if summary["breadth_below_or_low_pct"] > 0 else "neutral",
                    "accent_token": _accent("down" if summary["breadth_below_or_low_pct"] > 0 else "neutral"),
                },
            ],
            "charts": [{"kind": "timeline", "series_key": "breadth", "rows": timeline}],
            "historical_context": history,
        },
        {
            "section_slug": "open-drive",
            "title": SECTION_META["open-drive"]["title"],
            "direction": direction,
            "accent_token": _accent(direction),
            "summary_metrics": {
                "gap_pct": summary["gap_pct"],
                "open_range_15_pct": summary["open_range_15_pct"],
                "gap_filled": summary["gap_filled"],
                "failed_open": summary["failed_open"],
            },
            "highlights": [
                f"Gap: {summary['gap_pct']:.2f}%",
                f"First 15m range: {summary['open_range_15_pct']:.2f}%",
                f"Gap filled: {summary['gap_filled']}",
                f"Failed open: {summary['failed_open']}",
            ],
            "narrative": "This section tells you whether the opening move was accepted, extended, or rejected.",
            "rows": [
                {
                    "metric": "Gap vs prior close",
                    "value": summary["gap_pct"],
                    "direction": _direction(summary["gap_pct"]),
                    "accent_token": _accent(_direction(summary["gap_pct"])),
                },
                {
                    "metric": "15m range expansion",
                    "value": summary["open_range_15_pct"],
                    "direction": "neutral",
                    "accent_token": "white",
                },
                {
                    "metric": "Gap filled",
                    "value": summary["gap_filled"],
                    "direction": "neutral",
                    "accent_token": "white",
                },
                {
                    "metric": "Failed open",
                    "value": summary["failed_open"],
                    "direction": "down" if summary["failed_open"] else "neutral",
                    "accent_token": _accent("down" if summary["failed_open"] else "neutral"),
                },
            ],
            "charts": [{"kind": "timeline", "series_key": "open_drive", "rows": timeline}],
            "historical_context": history,
        },
        {
            "section_slug": "leadership-dispersion",
            "title": SECTION_META["leadership-dispersion"]["title"],
            "direction": direction,
            "accent_token": _accent(direction),
            "summary_metrics": {
                "top10_concentration_pct": summary["top10_concentration_pct"],
                "dispersion_pct": summary["dispersion_pct"],
                "participation_label": summary["participation_label"],
            },
            "highlights": [
                f"Top10 concentration: {summary['top10_concentration_pct']:.1f}%",
                f"Dispersion: {summary['dispersion_pct']:.3f}%",
                f"Narrow leadership: {summary['narrow_leadership']}",
                f"Broad participation: {summary['broad_participation']}",
            ],
            "narrative": "This section separates broad confirmation from a move driven by a small number of large-cap names.",
            "rows": _leader_rows(live_rows, "up", limit=8) + _leader_rows(live_rows, "down", limit=8),
            "charts": [{"kind": "timeline", "series_key": "leadership_dispersion", "rows": timeline}],
            "historical_context": history,
        },
        {
            "section_slug": "reversals-failures",
            "title": SECTION_META["reversals-failures"]["title"],
            "direction": direction,
            "accent_token": _accent(direction),
            "summary_metrics": {
                "late_day_reversal": summary["late_day_reversal"],
                "high_volatility_chop": summary["high_volatility_chop"],
                "failed_open": summary["failed_open"],
            },
            "highlights": [
                f"Late-day reversal: {summary['late_day_reversal']}",
                f"High-volatility chop: {summary['high_volatility_chop']}",
                f"Failed open: {summary['failed_open']}",
            ],
            "narrative": "This section focuses on rejected opens, reversals, and conditions where continuation setups should be down-weighted.",
            "rows": [
                {
                    "symbol": row["symbol"],
                    "dominant_signal": row["dominant_signal"],
                    "change_pct": row["change_pct_from_prev_close"],
                    "change_pct_15m": row["change_pct_15m"],
                    "vwap_dev_bps": row["vwap_dev_bps"],
                    "direction": row["direction"],
                    "accent_token": row["accent_token"],
                    "notes": row["conclusion"],
                }
                for row in sorted(live_rows, key=lambda r: (r["reversal_score"], r["mean_reversion_score"]), reverse=True)[:20]
            ],
            "charts": [{"kind": "timeline", "series_key": "reversal_risk", "rows": timeline}],
            "historical_context": history,
        },
        {
            "section_slug": "stock-opportunities",
            "title": SECTION_META["stock-opportunities"]["title"],
            "direction": direction,
            "accent_token": _accent(direction),
            "summary_metrics": {
                "strong_names": len([r for r in live_rows if r["dominant_signal"] == "intraday-strength"]),
                "weak_names": len([r for r in live_rows if r["dominant_signal"] == "intraday-weakness"]),
                "mean_reversion_names": len([r for r in live_rows if r["dominant_signal"] == "mean-reversion-candidate"]),
            },
            "highlights": [
                "Strength list favors continuation study.",
                "Weakness list helps filter against buying strength in narrow leadership.",
                "Mean-reversion and reversal candidates should be treated as learning signals, not instructions.",
            ],
            "narrative": "This section surfaces the strongest intraday pattern candidates inside the Nifty 100 basket.",
            "rows": [
                {
                    "symbol": row["symbol"],
                    "sector_name": row["sector_name"],
                    "last_price": row["last_price"],
                    "change_pct": row["change_pct_from_prev_close"],
                    "relative_strength_bps": row["relative_strength_bps"],
                    "dominant_signal": row["dominant_signal"],
                    "direction": row["direction"],
                    "accent_token": row["accent_token"],
                    "notes": row["conclusion"],
                }
                for row in sorted(
                    live_rows,
                    key=lambda r: max(r["continuation_score"], r["weakness_score"], r["mean_reversion_score"], r["reversal_score"]),
                    reverse=True,
                )[:30]
            ],
            "charts": [],
            "historical_context": {},
        },
        {
            "section_slug": "history-context",
            "title": SECTION_META["history-context"]["title"],
            "direction": "neutral",
            "accent_token": "white",
            "summary_metrics": history,
            "highlights": [
                "Historical context becomes more valuable as more sessions accumulate.",
                "State statistics are computed from prior labeled sessions, not from the current bar stream alone.",
            ],
            "narrative": "This section puts the current session type into historical perspective.",
            "rows": flatten_dict("history_context", history) if history else [],
            "charts": [],
            "historical_context": history,
        },
    ]
    return sections


def _persist_dashboard_summary(summary: dict, live_rows: list[dict]) -> None:
    hero = {
        "index_name": summary["index_name"],
        "last_value": summary["last_price"],
        "change_pct": summary["change_pct"],
        "as_of": _iso(summary["as_of_ts"]),
        "direction": summary["direction"],
        "accent_token": summary["accent_token"],
        "arrow": summary["arrow"],
    }
    state_json = {
        "primary_state": summary["primary_state"],
        "secondary_states": summary["secondary_states"],
        "confidence_score": summary["confidence_score"],
        "narrative": summary["narrative"],
        "direction": summary["direction"],
        "accent_token": summary["accent_token"],
        "arrow": summary["arrow"],
    }
    breadth_json = {
        "large_cap_breadth_up_pct": summary["breadth_up_pct"],
        "above_vwap_pct": summary["breadth_above_vwap_pct"],
        "above_open_range_pct": summary["breadth_above_or_high_pct"],
        "below_open_range_pct": summary["breadth_below_or_low_pct"],
        "weighted_participation_pct": summary["weighted_participation_pct"],
        "top10_concentration_pct": summary["top10_concentration_pct"],
        "dispersion_pct": summary["dispersion_pct"],
        "participation_label": summary["participation_label"],
    }
    leaders_json = {
        "top_strength": _leader_rows(live_rows, "up", limit=8),
        "top_weakness": _leader_rows(live_rows, "down", limit=8),
    }
    execute(
        """
        insert into nse_ops.dashboard_snapshot_intraday (
          trade_date, index_code, as_of_ts, is_stale, hero_json, state_json, summary_table_json, breadth_json, leaders_json,
          ticker_tape_json, footer_disclaimer, accent_token, meta_json, generated_at
        )
        values (
          %(trade_date)s, %(index_code)s, %(as_of_ts)s, false, %(hero_json)s::jsonb, %(state_json)s::jsonb,
          %(summary_table_json)s::jsonb, %(breadth_json)s::jsonb, %(leaders_json)s::jsonb, %(ticker_tape_json)s::jsonb,
          %(footer_disclaimer)s, %(accent_token)s, %(meta_json)s::jsonb, now()
        )
        on conflict (trade_date, index_code) do update
        set as_of_ts = excluded.as_of_ts,
            is_stale = excluded.is_stale,
            hero_json = excluded.hero_json,
            state_json = excluded.state_json,
            summary_table_json = excluded.summary_table_json,
            breadth_json = excluded.breadth_json,
            leaders_json = excluded.leaders_json,
            ticker_tape_json = excluded.ticker_tape_json,
            footer_disclaimer = excluded.footer_disclaimer,
            accent_token = excluded.accent_token,
            meta_json = excluded.meta_json,
            generated_at = now()
        """,
        {
            "trade_date": summary["trade_date"],
            "index_code": summary["index_code"],
            "as_of_ts": summary["as_of_ts"],
            "hero_json": dumps_json(hero),
            "state_json": dumps_json(state_json),
            "summary_table_json": dumps_json(_summary_table(summary)),
            "breadth_json": dumps_json(breadth_json),
            "leaders_json": dumps_json(leaders_json),
            "ticker_tape_json": dumps_json(_ticker_tape(live_rows)),
            "footer_disclaimer": DISCLAIMER,
            "accent_token": summary["accent_token"],
            "meta_json": dumps_json({"source": "nse_intraday_intelligence"}),
        },
    )


def _persist_sections(summary: dict, sections: list[dict]) -> None:
    execute(
        "delete from nse_ops.dashboard_section_intraday where trade_date = %(trade_date)s and index_code = %(index_code)s",
        {"trade_date": summary["trade_date"], "index_code": summary["index_code"]},
    )
    execute_many(
        """
        insert into nse_ops.dashboard_section_intraday (
          trade_date, index_code, section_slug, as_of_ts, title, direction, accent_token,
          summary_metrics_json, highlights_json, narrative, rows_json, charts_json, historical_context_json,
          meta_json, generated_at
        )
        values (
          %(trade_date)s, %(index_code)s, %(section_slug)s, %(as_of_ts)s, %(title)s, %(direction)s, %(accent_token)s,
          %(summary_metrics_json)s::jsonb, %(highlights_json)s::jsonb, %(narrative)s, %(rows_json)s::jsonb,
          %(charts_json)s::jsonb, %(historical_context_json)s::jsonb, %(meta_json)s::jsonb, now()
        )
        """,
        [
            {
                "trade_date": summary["trade_date"],
                "index_code": summary["index_code"],
                "section_slug": section["section_slug"],
                "as_of_ts": summary["as_of_ts"],
                "title": section["title"],
                "direction": section["direction"],
                "accent_token": section["accent_token"],
                "summary_metrics_json": dumps_json(section["summary_metrics"]),
                "highlights_json": dumps_json(section["highlights"]),
                "narrative": section["narrative"],
                "rows_json": dumps_json(section["rows"]),
                "charts_json": dumps_json(section["charts"]),
                "historical_context_json": dumps_json(section["historical_context"]),
                "meta_json": dumps_json({"source": "nse_intraday_intelligence"}),
            }
            for section in sections
        ],
    )


def refresh_live_state(trade_date: date | None = None, index_code: str | None = None) -> dict:
    settings = get_settings()
    trade_date = trade_date or latest_trade_date("nse_intraday.market_minute_feature")
    index_code = index_code or settings.default_index_code
    as_of_ts = fetch_val(
        """
        select max(minute_ts)
        from nse_intraday.market_minute_feature
        where trade_date = %(trade_date)s
          and index_code = %(index_code)s
        """,
        {"trade_date": trade_date, "index_code": index_code},
    )
    if not as_of_ts:
        raise RuntimeError(f"No market minute feature rows found for trade_date={trade_date} index_code={index_code}")

    market_rows = fetch_all(
        """
        select *
        from nse_intraday.market_minute_feature
        where trade_date = %(trade_date)s
          and index_code = %(index_code)s
        order by minute_ts
        """,
        {"trade_date": trade_date, "index_code": index_code},
    )
    summary = _market_state_labels(market_rows)
    _persist_market_session_summary(summary)

    live_rows = _build_stock_live_rows(trade_date, as_of_ts, index_code)
    _persist_stock_live_rows(live_rows)
    _persist_watchlists(trade_date, as_of_ts, live_rows)
    _persist_dashboard_summary(summary, live_rows)
    sections = _build_sections(summary, market_rows, live_rows)
    _persist_sections(summary, sections)

    return {
        "trade_date": trade_date.isoformat(),
        "index_code": index_code,
        "as_of_ts": _iso(as_of_ts),
        "primary_state": summary["primary_state"],
        "confidence_score": summary["confidence_score"],
        "stock_live_rows": len(live_rows),
        "sections": [section["section_slug"] for section in sections],
    }


def refresh_watchlists(trade_date: date | None = None, index_code: str | None = None) -> dict:
    trade_date = trade_date or latest_trade_date("nse_intraday.stock_intraday_live")
    index_code = index_code or get_settings().default_index_code
    market_summary = fetch_one(
        """
        select as_of_ts
        from nse_intraday.market_session_summary
        where trade_date = %(trade_date)s and index_code = %(index_code)s
        """,
        {"trade_date": trade_date, "index_code": index_code},
    )
    if not market_summary:
        refresh_live_state(trade_date, index_code)
        market_summary = fetch_one(
            """
            select as_of_ts
            from nse_intraday.market_session_summary
            where trade_date = %(trade_date)s and index_code = %(index_code)s
            """,
            {"trade_date": trade_date, "index_code": index_code},
        )
    live_rows = fetch_all("select * from nse_intraday.stock_intraday_live where trade_date = %(trade_date)s", {"trade_date": trade_date})
    _persist_watchlists(trade_date, market_summary["as_of_ts"], live_rows)
    return {
        "trade_date": trade_date.isoformat(),
        "watchlist_rows": fetch_val("select count(*) from nse_ops.watchlist_snapshot_intraday where trade_date = %(trade_date)s", {"trade_date": trade_date}),
    }


def run_quality_checks(trade_date: date | None = None, run_id: str | None = None, index_code: str | None = None) -> dict:
    trade_date = trade_date or latest_trade_date("nse_intraday.raw_security_1m")
    index_code = index_code or get_settings().default_index_code

    sec_count = fetch_val("select count(*) from nse_intraday.raw_security_1m where trade_date = %(trade_date)s", {"trade_date": trade_date}) or 0
    idx_count = fetch_val("select count(*) from nse_intraday.raw_index_1m where trade_date = %(trade_date)s", {"trade_date": trade_date}) or 0
    live_count = fetch_val("select count(*) from nse_intraday.stock_intraday_live where trade_date = %(trade_date)s", {"trade_date": trade_date}) or 0
    latest_snapshot = fetch_one(
        """
        select as_of_ts
        from nse_ops.dashboard_snapshot_intraday
        where trade_date = %(trade_date)s and index_code = %(index_code)s
        """,
        {"trade_date": trade_date, "index_code": index_code},
    )
    latest_sec_minute = fetch_val("select max(minute_ts) from nse_intraday.raw_security_1m where trade_date = %(trade_date)s", {"trade_date": trade_date})
    latest_idx_minute = fetch_val("select max(minute_ts) from nse_intraday.raw_index_1m where trade_date = %(trade_date)s and index_code = %(index_code)s", {"trade_date": trade_date, "index_code": index_code})
    missing_prev_close = fetch_val(
        """
        select count(*)
        from nse_intraday.security_minute_feature
        where trade_date = %(trade_date)s and minute_no = 1 and prev_close is null
        """,
        {"trade_date": trade_date},
    ) or 0

    _quality(run_id, "intraday_raw_security_present", "error", sec_count > 0, str(sec_count), ">0", "Raw security minute bars must exist")
    _quality(run_id, "intraday_raw_index_present", "error", idx_count > 0, str(idx_count), ">0", "Raw index minute bars must exist")
    _quality(run_id, "intraday_live_stock_rows", "warn", live_count >= 80, str(live_count), ">=80", "Expected most Nifty100 rows to materialize into the live stock table")
    _quality(run_id, "intraday_prev_close_coverage", "warn", missing_prev_close == 0, str(missing_prev_close), "0", "Prev close should be available from the daily compatibility view")
    if latest_snapshot and latest_sec_minute:
        snapshot_age_min = int((latest_sec_minute - latest_snapshot["as_of_ts"]).total_seconds() // 60)
        _quality(run_id, "intraday_snapshot_freshness", "warn", snapshot_age_min <= 5, str(snapshot_age_min), "<=5", "Live snapshot should trail the latest raw minute by no more than five minutes")
    if latest_sec_minute and latest_idx_minute:
        delta_min = abs(int((latest_sec_minute - latest_idx_minute).total_seconds() // 60))
        _quality(run_id, "intraday_index_security_clock_skew", "warn", delta_min <= 2, str(delta_min), "<=2", "Index and security feeds should remain roughly aligned")

    return {
        "trade_date": trade_date.isoformat(),
        "security_raw_count": sec_count,
        "index_raw_count": idx_count,
        "live_stock_count": live_count,
        "missing_prev_close": missing_prev_close,
    }


def retention_cleanup() -> dict:
    settings = get_settings()
    today = datetime.now(timezone.utc).date()
    raw_cutoff = today - timedelta(days=settings.raw_retention_days)
    feature_cutoff = today - timedelta(days=settings.feature_retention_days)
    snapshot_cutoff = today - timedelta(days=settings.snapshot_retention_days)
    drop_monthly_partitions_older_than(raw_cutoff)

    execute("delete from nse_intraday.stock_intraday_live where trade_date < %(cutoff)s", {"cutoff": feature_cutoff})
    execute("delete from nse_intraday.market_session_summary where trade_date < %(cutoff)s", {"cutoff": feature_cutoff})
    execute("delete from nse_ops.dashboard_snapshot_intraday where trade_date < %(cutoff)s", {"cutoff": snapshot_cutoff})
    execute("delete from nse_ops.dashboard_section_intraday where trade_date < %(cutoff)s", {"cutoff": snapshot_cutoff})
    execute("delete from nse_ops.watchlist_snapshot_intraday where trade_date < %(cutoff)s", {"cutoff": snapshot_cutoff})
    execute("delete from nse_ops.export_manifest where trade_date < %(cutoff)s and export_scope like 'intraday%%'", {"cutoff": snapshot_cutoff})

    return {
        "raw_cutoff": raw_cutoff.isoformat(),
        "feature_cutoff": feature_cutoff.isoformat(),
        "snapshot_cutoff": snapshot_cutoff.isoformat(),
    }


def backfill_history(days: int = 90, index_code: str | None = None) -> dict:
    index_code = index_code or get_settings().default_index_code
    max_trade_date = latest_trade_date("nse_intraday.raw_security_1m")
    start_date = max_trade_date - timedelta(days=days - 1)
    trade_dates = fetch_all(
        """
        select distinct trade_date
        from nse_intraday.raw_security_1m
        where trade_date between %(start_date)s and %(end_date)s
        order by trade_date
        """,
        {"start_date": start_date, "end_date": max_trade_date},
    )
    processed = 0
    for row in trade_dates:
        td = row["trade_date"]
        refresh_feature_tables(td, index_code=index_code)
        refresh_live_state(td, index_code=index_code)
        processed += 1
    return {"start_date": start_date.isoformat(), "end_date": max_trade_date.isoformat(), "processed_trade_dates": processed}


def finalize_session(trade_date: date | None = None, index_code: str | None = None) -> dict:
    # At present this simply rebuilds the latest live state after the close.
    return refresh_live_state(trade_date=trade_date, index_code=index_code)


def build_summary_payload(trade_date: date | None = None, index_code: str | None = None) -> dict:
    trade_date = trade_date or latest_trade_date("nse_ops.dashboard_snapshot_intraday")
    index_code = index_code or get_settings().default_index_code
    row = fetch_one(
        """
        select *
        from nse_ops.dashboard_snapshot_intraday
        where trade_date = %(trade_date)s and index_code = %(index_code)s
        """,
        {"trade_date": trade_date, "index_code": index_code},
    )
    if not row:
        refresh_live_state(trade_date=trade_date, index_code=index_code)
        row = fetch_one(
            """
            select *
            from nse_ops.dashboard_snapshot_intraday
            where trade_date = %(trade_date)s and index_code = %(index_code)s
            """,
            {"trade_date": trade_date, "index_code": index_code},
        )
    if not row:
        raise RuntimeError(f"No intraday summary found for trade_date={trade_date} index_code={index_code}")
    return {
        "trade_date": _iso(row["trade_date"]),
        "index_code": row["index_code"],
        "as_of": _iso(row["as_of_ts"]),
        "is_stale": row["is_stale"],
        "hero": row["hero_json"],
        "state": row["state_json"],
        "summary_table": row["summary_table_json"],
        "breadth": row["breadth_json"],
        "leaders": row["leaders_json"],
        "ticker_tape": row["ticker_tape_json"],
        "accent_token": row["accent_token"],
        "footer_disclaimer": row["footer_disclaimer"],
        "generated_at": _iso(row["generated_at"]),
        "meta": row["meta_json"],
    }


def build_section_payload(section_slug: str, trade_date: date | None = None, index_code: str | None = None) -> dict:
    trade_date = trade_date or latest_trade_date("nse_ops.dashboard_section_intraday")
    index_code = index_code or get_settings().default_index_code
    row = fetch_one(
        """
        select *
        from nse_ops.dashboard_section_intraday
        where trade_date = %(trade_date)s
          and index_code = %(index_code)s
          and section_slug = %(section_slug)s
        """,
        {"trade_date": trade_date, "index_code": index_code, "section_slug": section_slug},
    )
    if not row:
        refresh_live_state(trade_date=trade_date, index_code=index_code)
        row = fetch_one(
            """
            select *
            from nse_ops.dashboard_section_intraday
            where trade_date = %(trade_date)s
              and index_code = %(index_code)s
              and section_slug = %(section_slug)s
            """,
            {"trade_date": trade_date, "index_code": index_code, "section_slug": section_slug},
        )
    if not row:
        raise RuntimeError(f"No intraday section found for trade_date={trade_date} index_code={index_code} section_slug={section_slug}")
    return {
        "trade_date": _iso(row["trade_date"]),
        "index_code": row["index_code"],
        "section_slug": row["section_slug"],
        "as_of": _iso(row["as_of_ts"]),
        "title": row["title"],
        "direction": row["direction"],
        "accent_token": row["accent_token"],
        "summary_metrics": row["summary_metrics_json"],
        "highlights": row["highlights_json"],
        "narrative": row["narrative"],
        "rows": row["rows_json"],
        "charts": row["charts_json"],
        "historical_context": row["historical_context_json"],
        "generated_at": _iso(row["generated_at"]),
    }


def build_stock_payload(symbol: str, trade_date: date | None = None) -> dict:
    trade_date = trade_date or latest_trade_date("nse_intraday.stock_intraday_live")
    stock_row = fetch_one(
        """
        select *
        from nse_intraday.stock_intraday_live
        where trade_date = %(trade_date)s and symbol = %(symbol)s
        """,
        {"trade_date": trade_date, "symbol": symbol},
    )
    if not stock_row:
        raise RuntimeError(f"No intraday stock payload found for trade_date={trade_date} symbol={symbol}")
    series_rows = fetch_all(
        """
        select
          minute_ts,
          last_price,
          change_pct_from_prev_close,
          change_pct_from_open,
          vwap_dev_bps,
          above_vwap,
          above_open_range_high,
          below_open_range_low
        from nse_intraday.security_minute_feature
        where trade_date = %(trade_date)s and symbol = %(symbol)s
        order by minute_ts
        """,
        {"trade_date": trade_date, "symbol": symbol},
    )
    return {
        "trade_date": _iso(stock_row["trade_date"]),
        "as_of": _iso(stock_row["as_of_ts"]),
        "symbol": stock_row["symbol"],
        "sector_name": stock_row["sector_name"],
        "last_price": stock_row["last_price"],
        "change_pct_from_prev_close": stock_row["change_pct_from_prev_close"],
        "change_pct_from_open": stock_row["change_pct_from_open"],
        "dominant_signal": stock_row["dominant_signal"],
        "direction": stock_row["direction"],
        "accent_token": stock_row["accent_token"],
        "tags": stock_row["tags_json"],
        "conclusion": stock_row["conclusion"],
        "payload": stock_row["payload_json"],
        "series": [_serialize_row(row) for row in series_rows],
    }


def get_watchlists_payload(trade_date: date | None = None) -> dict:
    trade_date = trade_date or latest_trade_date("nse_ops.watchlist_snapshot_intraday")
    rows = fetch_all(
        """
        select
          w.slug,
          w.title,
          count(*) as item_count,
          max(s.as_of_ts) as as_of_ts
        from nse_ops.watchlist_snapshot_intraday s
        join nse_ops.watchlist w
          on w.watchlist_id = s.watchlist_id
        where s.trade_date = %(trade_date)s
        group by w.slug, w.title
        order by w.title
        """,
        {"trade_date": trade_date},
    )
    return {
        "trade_date": _iso(trade_date),
        "watchlists": [_serialize_row(row) for row in rows],
    }


def get_watchlist_detail_payload(slug: str, trade_date: date | None = None) -> dict:
    trade_date = trade_date or latest_trade_date("nse_ops.watchlist_snapshot_intraday")
    rows = fetch_all(
        """
        select
          w.slug,
          w.title,
          s.*
        from nse_ops.watchlist_snapshot_intraday s
        join nse_ops.watchlist w
          on w.watchlist_id = s.watchlist_id
        where s.trade_date = %(trade_date)s
          and w.slug = %(slug)s
        order by s.rank_no asc, s.symbol asc
        """,
        {"trade_date": trade_date, "slug": slug},
    )
    if not rows:
        meta = fetch_one(
            """
            select slug, title
            from nse_ops.watchlist
            where slug = %(slug)s
            """,
            {"slug": slug},
        )
        if not meta:
            raise RuntimeError(f"No intraday watchlist found for slug={slug}")
        return {
            "trade_date": _iso(trade_date),
            "slug": slug,
            "title": meta["title"],
            "as_of": None,
            "rows": [],
        }
    return {
        "trade_date": _iso(trade_date),
        "slug": slug,
        "title": rows[0]["title"],
        "as_of": _iso(rows[0]["as_of_ts"]),
        "rows": [_serialize_row(row) for row in rows],
    }


def _export_path(scope: str, key: str, trade_date: date, export_format: str) -> Path:
    root = Path(get_settings().export_root)
    suffix = "json" if export_format == "json" else "csv"
    file_name = f"{scope}__{key}__{trade_date.isoformat()}.{suffix}"
    return root / scope / trade_date.isoformat() / file_name


def _persist_export_manifest(export_scope: str, export_key: str, trade_date: date, export_format: str, path: Path, content_type: str, row_count: int | None, content: bytes) -> dict:
    export_id = str(uuid.uuid4())
    byte_size = write_bytes(path, content)
    checksum = sha256_bytes(content)
    execute(
        """
        insert into nse_ops.export_manifest (
          export_id, export_scope, export_key, trade_date, export_format, storage_path,
          content_type, row_count, byte_size, checksum_sha256, created_at, expires_at, meta_json
        )
        values (
          %(export_id)s::uuid, %(export_scope)s, %(export_key)s, %(trade_date)s, %(export_format)s, %(storage_path)s,
          %(content_type)s, %(row_count)s, %(byte_size)s, %(checksum)s, now(), now() + interval '14 days', %(meta_json)s::jsonb
        )
        """,
        {
            "export_id": export_id,
            "export_scope": export_scope,
            "export_key": export_key,
            "trade_date": trade_date,
            "export_format": export_format,
            "storage_path": str(path),
            "content_type": content_type,
            "row_count": row_count,
            "byte_size": byte_size,
            "checksum": checksum,
            "meta_json": dumps_json({"suite": "nse_intraday_intelligence"}),
        },
    )
    return {
        "export_id": export_id,
        "storage_path": str(path),
        "content_type": content_type,
        "row_count": row_count,
        "byte_size": byte_size,
        "checksum_sha256": checksum,
    }


def export_summary(trade_date: date | None = None, index_code: str | None = None, export_format: str = "json") -> dict:
    payload = build_summary_payload(trade_date=trade_date, index_code=index_code)
    trade_date_obj = date.fromisoformat(payload["trade_date"])
    path = _export_path("intraday_summary", index_code or get_settings().default_index_code, trade_date_obj, export_format)
    if export_format == "json":
        content = dumps_json(payload).encode("utf-8")
        row_count = len(payload.get("summary_table", []))
        content_type = "application/json"
    else:
        rows = []
        rows.extend(flatten_dict("hero", payload.get("hero", {})))
        rows.extend(flatten_dict("state", payload.get("state", {})))
        rows.extend(payload.get("summary_table", []))
        rows.extend(payload.get("ticker_tape", []))
        content = csv_bytes(rows)
        row_count = len(rows)
        content_type = "text/csv"
    meta = _persist_export_manifest("intraday_summary", index_code or get_settings().default_index_code, trade_date_obj, export_format, path, content_type, row_count, content)
    return {"payload": payload, "export": meta}


def export_section(section_slug: str, trade_date: date | None = None, index_code: str | None = None, export_format: str = "json") -> dict:
    payload = build_section_payload(section_slug=section_slug, trade_date=trade_date, index_code=index_code)
    trade_date_obj = date.fromisoformat(payload["trade_date"])
    path = _export_path("intraday_section", f"{index_code or get_settings().default_index_code}_{section_slug}", trade_date_obj, export_format)
    if export_format == "json":
        content = dumps_json(payload).encode("utf-8")
        row_count = len(payload.get("rows", []))
        content_type = "application/json"
    else:
        rows = list(payload.get("rows", []))
        content = csv_bytes(rows)
        row_count = len(rows)
        content_type = "text/csv"
    meta = _persist_export_manifest("intraday_section", section_slug, trade_date_obj, export_format, path, content_type, row_count, content)
    return {"payload": payload, "export": meta}


def export_watchlist(slug: str, trade_date: date | None = None, export_format: str = "json") -> dict:
    payload = get_watchlist_detail_payload(slug=slug, trade_date=trade_date)
    trade_date_obj = date.fromisoformat(payload["trade_date"])
    path = _export_path("intraday_watchlist", slug, trade_date_obj, export_format)
    if export_format == "json":
        content = dumps_json(payload).encode("utf-8")
        row_count = len(payload.get("rows", []))
        content_type = "application/json"
    else:
        rows = list(payload.get("rows", []))
        content = csv_bytes(rows)
        row_count = len(rows)
        content_type = "text/csv"
    meta = _persist_export_manifest("intraday_watchlist", slug, trade_date_obj, export_format, path, content_type, row_count, content)
    return {"payload": payload, "export": meta}


def export_stock(symbol: str, trade_date: date | None = None, export_format: str = "json") -> dict:
    payload = build_stock_payload(symbol=symbol, trade_date=trade_date)
    trade_date_obj = date.fromisoformat(payload["trade_date"])
    path = _export_path("intraday_stock", symbol, trade_date_obj, export_format)
    if export_format == "json":
        content = dumps_json(payload).encode("utf-8")
        row_count = len(payload.get("series", []))
        content_type = "application/json"
    else:
        rows = list(payload.get("series", []))
        content = csv_bytes(rows)
        row_count = len(rows)
        content_type = "text/csv"
    meta = _persist_export_manifest("intraday_stock", symbol, trade_date_obj, export_format, path, content_type, row_count, content)
    return {"payload": payload, "export": meta}


def list_intraday_exports(limit: int = 50) -> list[dict]:
    rows = fetch_all(
        """
        select *
        from nse_ops.export_manifest
        where export_scope like 'intraday%%'
        order by created_at desc
        limit %(limit)s
        """,
        {"limit": limit},
    )
    return [_serialize_row(row) for row in rows]


def run_job_key(job_key: str, trigger_type: str = "manual", **kwargs) -> dict:
    settings = get_settings()
    command_text_map = {
        "intraday_sync_raw": settings.job_cmd_sync_raw,
        "intraday_refresh_features": settings.job_cmd_refresh_features,
        "intraday_refresh_dashboard": settings.job_cmd_refresh_dashboard,
        "intraday_refresh_watchlists": settings.job_cmd_refresh_watchlists,
        "intraday_run_quality": settings.job_cmd_run_quality,
        "intraday_finalize_session": settings.job_cmd_finalize_session,
        "intraday_retention": settings.job_cmd_retention,
        "intraday_backfill_history": settings.job_cmd_backfill_history,
    }
    run_id = _start_job(job_key, trigger_type, command_text=command_text_map.get(job_key), meta=kwargs)
    try:
        if job_key == "intraday_sync_raw":
            _step(run_id, 1, "sync_raw", "running", "Syncing raw minute bars", kwargs)
            result = sync_raw_minute(kwargs.get("trade_date"))
        elif job_key == "intraday_refresh_features":
            _step(run_id, 1, "refresh_features", "running", "Refreshing minute features", kwargs)
            result = refresh_feature_tables(kwargs.get("trade_date"), kwargs.get("index_code"))
        elif job_key == "intraday_refresh_dashboard":
            _step(run_id, 1, "refresh_dashboard", "running", "Refreshing live state and dashboard snapshots", kwargs)
            result = refresh_live_state(kwargs.get("trade_date"), kwargs.get("index_code"))
        elif job_key == "intraday_refresh_watchlists":
            _step(run_id, 1, "refresh_watchlists", "running", "Refreshing intraday watchlists", kwargs)
            result = refresh_watchlists(kwargs.get("trade_date"), kwargs.get("index_code"))
        elif job_key == "intraday_run_quality":
            _step(run_id, 1, "run_quality", "running", "Running intraday quality checks", kwargs)
            result = run_quality_checks(kwargs.get("trade_date"), run_id=run_id, index_code=kwargs.get("index_code"))
        elif job_key == "intraday_finalize_session":
            _step(run_id, 1, "finalize_session", "running", "Finalizing session state", kwargs)
            result = finalize_session(kwargs.get("trade_date"), kwargs.get("index_code"))
        elif job_key == "intraday_retention":
            _step(run_id, 1, "retention", "running", "Running retention cleanup", kwargs)
            result = retention_cleanup()
        elif job_key == "intraday_backfill_history":
            _step(run_id, 1, "backfill_history", "running", "Backfilling recent intraday history", kwargs)
            result = backfill_history(int(kwargs.get("days") or 90), kwargs.get("index_code"))
        else:
            raise RuntimeError(f"Unknown job_key={job_key}")
        _step(run_id, 1, "complete", "success", "Job completed", result)
        _finish_job(run_id, "success", detail=dumps_json(result), exit_code=0)
        return {"run_id": run_id, "status": "success", "result": result}
    except Exception as exc:
        _step(run_id, 1, "failed", "failed", str(exc), {"error": str(exc)})
        _finish_job(run_id, "failed", detail=str(exc), exit_code=1)
        raise


# --- stock alpha / residual-strength upgrade patch ---
SECTION_META.update({
    "stock-quality": {"title": "Stock Quality & Residual Strength"},
})


def _clamp_score(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    if value < lo:
        return lo
    if value > hi:
        return hi
    return value


BETA_PROFILE_SQL = """
delete from nse_intraday.stock_daily_beta_profile
where trade_date = %(trade_date)s
  and index_code = %(index_code)s;

with sec_close as (
  select distinct on (trade_date, symbol)
    trade_date,
    symbol,
    close_px
  from integration.v_source_security_1m
  where trade_date < %(trade_date)s
  order by trade_date, symbol, minute_ts desc
),
idx_close as (
  select distinct on (trade_date, index_code)
    trade_date,
    index_code,
    close_px
  from integration.v_source_index_1m
  where trade_date < %(trade_date)s
    and index_code = %(index_code)s
  order by trade_date, index_code, minute_ts desc
),
sec_rets as (
  select
    s.trade_date,
    s.symbol,
    100.0 * (s.close_px / nullif(lag(s.close_px) over (partition by s.symbol order by s.trade_date), 0) - 1.0) as stock_ret
  from sec_close s
),
idx_rets as (
  select
    i.trade_date,
    i.index_code,
    100.0 * (i.close_px / nullif(lag(i.close_px) over (partition by i.index_code order by i.trade_date), 0) - 1.0) as index_ret
  from idx_close i
),
rets as (
  select
    s.trade_date,
    s.symbol,
    i.index_code,
    s.stock_ret,
    i.index_ret
  from sec_rets s
  join idx_rets i
    on i.trade_date = s.trade_date
),
ranked as (
  select
    symbol,
    index_code,
    stock_ret,
    index_ret,
    row_number() over (partition by symbol, index_code order by trade_date desc) as rn
  from rets
  where stock_ret is not null
    and index_ret is not null
)
insert into nse_intraday.stock_daily_beta_profile (
  trade_date, index_code, symbol, beta_20d, beta_60d, corr_20d, corr_60d, obs_20d, obs_60d, generated_at
)
select
  %(trade_date)s,
  %(index_code)s,
  symbol,
  covar_samp(stock_ret, index_ret) filter (where rn <= 20) / nullif(var_samp(index_ret) filter (where rn <= 20), 0) as beta_20d,
  covar_samp(stock_ret, index_ret) filter (where rn <= 60) / nullif(var_samp(index_ret) filter (where rn <= 60), 0) as beta_60d,
  corr(stock_ret, index_ret) filter (where rn <= 20) as corr_20d,
  corr(stock_ret, index_ret) filter (where rn <= 60) as corr_60d,
  count(*) filter (where rn <= 20) as obs_20d,
  count(*) filter (where rn <= 60) as obs_60d,
  now()
from ranked
group by symbol;
"""

VOLUME_PROFILE_SQL = """
delete from nse_intraday.stock_minute_volume_profile
where trade_date = %(trade_date)s;

with bars as (
  select
    trade_date,
    symbol,
    row_number() over (partition by trade_date, symbol order by minute_ts) as minute_no,
    coalesce(volume, 0) as minute_volume,
    sum(coalesce(volume, 0)) over (partition by trade_date, symbol order by minute_ts) as cum_volume,
    sum(coalesce(volume, 0)) over (partition by trade_date, symbol) as day_volume
  from integration.v_source_security_1m
  where trade_date < %(trade_date)s
),
ranked as (
  select
    trade_date,
    symbol,
    minute_no,
    minute_volume,
    case when day_volume > 0 then 100.0 * cum_volume::numeric / day_volume else null end as cum_volume_share_pct,
    row_number() over (partition by symbol, minute_no order by trade_date desc) as day_rn
  from bars
)
insert into nse_intraday.stock_minute_volume_profile (
  trade_date, symbol, minute_no, avg_minute_volume, avg_cum_volume_share_pct, sample_days, generated_at
)
select
  %(trade_date)s,
  symbol,
  minute_no,
  avg(minute_volume) filter (where day_rn <= 20) as avg_minute_volume,
  avg(cum_volume_share_pct) filter (where day_rn <= 20) as avg_cum_volume_share_pct,
  count(*) filter (where day_rn <= 20) as sample_days,
  now()
from ranked
group by symbol, minute_no;
"""

STOCK_ALPHA_UPDATE_SQL = """
with sec as (
  select
    f.trade_date,
    f.minute_ts,
    f.symbol,
    f.minute_no,
    f.last_price,
    f.prev_close,
    f.session_open,
    f.change_pct_from_open,
    f.change_pct_5m,
    f.change_pct_15m,
    f.change_pct_30m,
    f.day_vwap,
    f.vwap_dev_bps,
    f.cum_volume,
    f.above_vwap,
    f.range_position_pct,
    r.high_px as minute_high_px,
    r.low_px as minute_low_px,
    coalesce(r.volume, 0) as minute_volume,
    lag(f.last_price) over (partition by f.trade_date, f.symbol order by f.minute_ts) as last_price_1m_ago,
    lag(f.last_price, 60) over (partition by f.trade_date, f.symbol order by f.minute_ts) as last_price_60m_ago,
    lag(f.above_vwap) over (partition by f.trade_date, f.symbol order by f.minute_ts) as above_vwap_prev,
    avg(case when f.above_vwap then 1.0 else 0.0 end) over (partition by f.trade_date, f.symbol order by f.minute_ts rows between unbounded preceding and current row) * 100.0 as time_above_vwap_pct
  from nse_intraday.security_minute_feature f
  join nse_intraday.raw_security_1m r
    on r.trade_date = f.trade_date
   and r.minute_ts = f.minute_ts
   and r.symbol = f.symbol
  where f.trade_date = %(trade_date)s
),
sec2 as (
  select
    s.*,
    case when s.last_price_1m_ago is not null and s.last_price_1m_ago <> 0 then 100.0 * (s.last_price / s.last_price_1m_ago - 1.0) else 0.0 end as minute_return_pct,
    case when s.last_price_60m_ago is not null and s.last_price_60m_ago <> 0 then 100.0 * (s.last_price / s.last_price_60m_ago - 1.0) end as change_pct_60m,
    case when s.minute_high_px is not null and s.minute_low_px is not null and s.minute_high_px <> s.minute_low_px then 100.0 * (s.last_price - s.minute_low_px) / nullif((s.minute_high_px - s.minute_low_px), 0) else 50.0 end as bar_close_location_pct,
    case when s.above_vwap_prev is not null and s.above_vwap_prev <> s.above_vwap then 1 else 0 end as vwap_cross_event
  from sec s
),
idx as (
  select
    r.trade_date,
    r.minute_ts,
    case when lag(r.close_px, 1) over (partition by r.trade_date, r.index_code order by r.minute_ts) is not null and lag(r.close_px, 1) over (partition by r.trade_date, r.index_code order by r.minute_ts) <> 0 then 100.0 * (r.close_px / lag(r.close_px, 1) over (partition by r.trade_date, r.index_code order by r.minute_ts) - 1.0) else 0.0 end as index_return_1m_pct,
    case when lag(r.close_px, 5) over (partition by r.trade_date, r.index_code order by r.minute_ts) is not null and lag(r.close_px, 5) over (partition by r.trade_date, r.index_code order by r.minute_ts) <> 0 then 100.0 * (r.close_px / lag(r.close_px, 5) over (partition by r.trade_date, r.index_code order by r.minute_ts) - 1.0) end as index_return_5m_pct,
    case when lag(r.close_px, 15) over (partition by r.trade_date, r.index_code order by r.minute_ts) is not null and lag(r.close_px, 15) over (partition by r.trade_date, r.index_code order by r.minute_ts) <> 0 then 100.0 * (r.close_px / lag(r.close_px, 15) over (partition by r.trade_date, r.index_code order by r.minute_ts) - 1.0) end as index_return_15m_pct,
    case when lag(r.close_px, 30) over (partition by r.trade_date, r.index_code order by r.minute_ts) is not null and lag(r.close_px, 30) over (partition by r.trade_date, r.index_code order by r.minute_ts) <> 0 then 100.0 * (r.close_px / lag(r.close_px, 30) over (partition by r.trade_date, r.index_code order by r.minute_ts) - 1.0) end as index_return_30m_pct,
    case when lag(r.close_px, 60) over (partition by r.trade_date, r.index_code order by r.minute_ts) is not null and lag(r.close_px, 60) over (partition by r.trade_date, r.index_code order by r.minute_ts) <> 0 then 100.0 * (r.close_px / lag(r.close_px, 60) over (partition by r.trade_date, r.index_code order by r.minute_ts) - 1.0) end as index_return_60m_pct
  from nse_intraday.raw_index_1m r
  where r.trade_date = %(trade_date)s
    and r.index_code = %(index_code)s
),
joined as (
  select
    s.trade_date,
    s.minute_ts,
    s.symbol,
    s.minute_no,
    beta.beta_20d,
    beta.beta_60d,
    coalesce(beta.beta_20d, beta.beta_60d, 1.0) as beta_used,
    idx.index_return_1m_pct,
    idx.index_return_5m_pct,
    idx.index_return_15m_pct,
    idx.index_return_30m_pct,
    idx.index_return_60m_pct,
    s.change_pct_5m,
    s.change_pct_15m,
    s.change_pct_30m,
    s.change_pct_60m,
    s.minute_return_pct,
    s.time_above_vwap_pct,
    sum(s.vwap_cross_event) over (partition by s.trade_date, s.symbol order by s.minute_ts rows between unbounded preceding and current row) as vwap_cross_count,
    s.above_vwap,
    s.vwap_dev_bps,
    s.bar_close_location_pct,
    avg(s.bar_close_location_pct) over (partition by s.trade_date, s.symbol order by s.minute_ts rows between 14 preceding and current row) as close_location_quality_pct,
    sum(abs(s.minute_return_pct)) over (partition by s.trade_date, s.symbol order by s.minute_ts rows between unbounded preceding and current row) as cum_abs_minute_return_pct,
    abs(s.change_pct_from_open) as abs_change_from_open,
    s.minute_volume,
    s.cum_volume,
    p.avg_minute_volume,
    p.avg_cum_volume_share_pct,
    d.avg_daily_volume_20d
  from sec2 s
  left join idx
    on idx.trade_date = s.trade_date
   and idx.minute_ts = s.minute_ts
  left join nse_intraday.stock_daily_beta_profile beta
    on beta.trade_date = s.trade_date
   and beta.index_code = %(index_code)s
   and beta.symbol = s.symbol
  left join nse_intraday.stock_minute_volume_profile p
    on p.trade_date = s.trade_date
   and p.symbol = s.symbol
   and p.minute_no = s.minute_no
  left join integration.v_prev_security_daily d
    on d.trade_date = s.trade_date
   and d.symbol = s.symbol
),
scored as (
  select
    j.*,
    coalesce(j.change_pct_5m, 0.0) - coalesce(j.beta_used, 1.0) * coalesce(j.index_return_5m_pct, 0.0) as residual_return_5m_pct,
    coalesce(j.change_pct_15m, 0.0) - coalesce(j.beta_used, 1.0) * coalesce(j.index_return_15m_pct, 0.0) as residual_return_15m_pct,
    coalesce(j.change_pct_30m, 0.0) - coalesce(j.beta_used, 1.0) * coalesce(j.index_return_30m_pct, 0.0) as residual_return_30m_pct,
    coalesce(j.change_pct_60m, 0.0) - coalesce(j.beta_used, 1.0) * coalesce(j.index_return_60m_pct, 0.0) as residual_return_60m_pct,
    coalesce(j.minute_return_pct, 0.0) - coalesce(j.beta_used, 1.0) * coalesce(j.index_return_1m_pct, 0.0) as residual_minute_return_pct,
    case when j.cum_abs_minute_return_pct is not null and j.cum_abs_minute_return_pct > 0 then 100.0 * j.abs_change_from_open / j.cum_abs_minute_return_pct end as range_efficiency_pct,
    case when j.avg_minute_volume is not null and j.avg_minute_volume > 0 then j.minute_volume::numeric / j.avg_minute_volume end as minute_volume_ratio,
    case when j.avg_cum_volume_share_pct is not null and j.avg_cum_volume_share_pct > 0 and j.avg_daily_volume_20d is not null and j.avg_daily_volume_20d > 0 then j.cum_volume::numeric / (j.avg_daily_volume_20d * (j.avg_cum_volume_share_pct / 100.0)) end as cum_volume_vs_profile
  from joined j
),
scored2 as (
  select
    s.*,
    avg(case when s.residual_minute_return_pct > 0 then 1.0 else 0.0 end) over (partition by s.trade_date, s.symbol order by s.minute_ts rows between unbounded preceding and current row) * 100.0 as residual_positive_ratio_pct
  from scored s
),
final as (
  select
    trade_date,
    minute_ts,
    symbol,
    beta_20d,
    beta_60d,
    index_return_5m_pct,
    index_return_15m_pct,
    index_return_30m_pct,
    index_return_60m_pct,
    change_pct_60m,
    residual_return_5m_pct,
    residual_return_15m_pct,
    residual_return_30m_pct,
    residual_return_60m_pct,
    minute_return_pct,
    residual_minute_return_pct,
    time_above_vwap_pct,
    vwap_cross_count,
    least(100.0, greatest(0.0,
      0.55 * coalesce(time_above_vwap_pct, 0.0)
      + case when above_vwap then 20.0 else 0.0 end
      + greatest(-15.0, least(15.0, coalesce(vwap_dev_bps, 0.0) / 8.0))
      + greatest(0.0, 15.0 - 5.0 * coalesce(vwap_cross_count, 0))
    )) as vwap_hold_quality_score,
    residual_positive_ratio_pct,
    least(100.0, greatest(0.0,
      0.50 * coalesce(residual_positive_ratio_pct, 0.0)
      + greatest(-20.0, least(20.0, coalesce(residual_return_15m_pct, 0.0) * 20.0))
      + greatest(-20.0, least(20.0, coalesce(residual_return_30m_pct, 0.0) * 15.0))
      + greatest(-10.0, least(10.0, (coalesce(residual_return_5m_pct, 0.0) - coalesce(residual_return_30m_pct, 0.0)) * 10.0))
    )) as relative_strength_persistence_score,
    least(100.0, greatest(0.0, coalesce(range_efficiency_pct, 0.0))) as range_efficiency_pct,
    minute_volume_ratio,
    cum_volume_vs_profile,
    least(250.0, greatest(0.0, 100.0 * coalesce(cum_volume_vs_profile, minute_volume_ratio, 1.0))) as volume_curve_surprise,
    bar_close_location_pct,
    least(100.0, greatest(0.0, coalesce(close_location_quality_pct, 50.0))) as close_location_quality_pct
  from scored2
)
update nse_intraday.security_minute_feature tgt
set beta_20d = final.beta_20d,
    beta_60d = final.beta_60d,
    index_return_5m_pct = final.index_return_5m_pct,
    index_return_15m_pct = final.index_return_15m_pct,
    index_return_30m_pct = final.index_return_30m_pct,
    index_return_60m_pct = final.index_return_60m_pct,
    change_pct_60m = final.change_pct_60m,
    residual_return_5m_pct = final.residual_return_5m_pct,
    residual_return_15m_pct = final.residual_return_15m_pct,
    residual_return_30m_pct = final.residual_return_30m_pct,
    residual_return_60m_pct = final.residual_return_60m_pct,
    minute_return_pct = final.minute_return_pct,
    residual_minute_return_pct = final.residual_minute_return_pct,
    time_above_vwap_pct = final.time_above_vwap_pct,
    vwap_cross_count = final.vwap_cross_count,
    vwap_hold_quality_score = final.vwap_hold_quality_score,
    residual_positive_ratio_pct = final.residual_positive_ratio_pct,
    relative_strength_persistence_score = final.relative_strength_persistence_score,
    range_efficiency_pct = final.range_efficiency_pct,
    minute_volume_ratio = final.minute_volume_ratio,
    cum_volume_vs_profile = final.cum_volume_vs_profile,
    volume_curve_surprise = final.volume_curve_surprise,
    bar_close_location_pct = final.bar_close_location_pct,
    close_location_quality_pct = final.close_location_quality_pct,
    generated_at = now()
from final
where tgt.trade_date = final.trade_date
  and tgt.minute_ts = final.minute_ts
  and tgt.symbol = final.symbol;
"""


def _refresh_beta_profiles(trade_date: date, index_code: str) -> None:
    execute(BETA_PROFILE_SQL, {"trade_date": trade_date, "index_code": index_code})


def _refresh_volume_profiles(trade_date: date) -> None:
    execute(VOLUME_PROFILE_SQL, {"trade_date": trade_date})


def refresh_feature_tables(trade_date: date | None = None, index_code: str | None = None) -> dict:  # type: ignore[override]
    trade_date = trade_date or latest_trade_date("nse_intraday.raw_security_1m")
    index_code = index_code or get_settings().default_index_code
    _ensure_partitions_for_trade_date(trade_date)
    execute(SECURITY_FEATURE_SQL, {"trade_date": trade_date})
    execute(MARKET_FEATURE_SQL, {"trade_date": trade_date, "index_code": index_code})
    _refresh_beta_profiles(trade_date, index_code)
    _refresh_volume_profiles(trade_date)
    execute(STOCK_ALPHA_UPDATE_SQL, {"trade_date": trade_date, "index_code": index_code})
    return {
        "trade_date": trade_date.isoformat(),
        "security_feature_rows": fetch_val("select count(*) from nse_intraday.security_minute_feature where trade_date = %(trade_date)s", {"trade_date": trade_date}),
        "market_feature_rows": fetch_val(
            "select count(*) from nse_intraday.market_minute_feature where trade_date = %(trade_date)s and (%(index_code)s::text is null or index_code = %(index_code)s::text)",
            {"trade_date": trade_date, "index_code": index_code},
        ),
        "beta_profile_rows": fetch_val(
            "select count(*) from nse_intraday.stock_daily_beta_profile where trade_date = %(trade_date)s and index_code = %(index_code)s",
            {"trade_date": trade_date, "index_code": index_code},
        ),
        "volume_profile_rows": fetch_val(
            "select count(*) from nse_intraday.stock_minute_volume_profile where trade_date = %(trade_date)s",
            {"trade_date": trade_date},
        ),
    }


def _stock_signal_history_context(dominant_signal: str) -> dict:
    row = fetch_one(
        """
        select *
        from nse_intraday.vw_stock_signal_history_stats
        where dominant_signal = %(dominant_signal)s
        """,
        {"dominant_signal": dominant_signal},
    )
    return _serialize_row(row) if row else {}


def _build_stock_live_rows(trade_date: date, as_of_ts: datetime, index_code: str) -> list[dict]:  # type: ignore[override]
    market_row = fetch_one(
        """
        select *
        from nse_intraday.market_minute_feature
        where trade_date = %(trade_date)s and minute_ts = %(as_of_ts)s and index_code = %(index_code)s
        """,
        {"trade_date": trade_date, "as_of_ts": as_of_ts, "index_code": index_code},
    )
    if not market_row:
        return []

    stock_rows = fetch_all(
        """
        select *
        from nse_intraday.security_minute_feature
        where trade_date = %(trade_date)s and minute_ts = %(as_of_ts)s
        order by symbol
        """,
        {"trade_date": trade_date, "as_of_ts": as_of_ts},
    )
    index_change = _scalar(market_row.get("change_pct_from_prev_close"))
    market_state = _market_state_labels(
        fetch_all(
            """
            select * from nse_intraday.market_minute_feature
            where trade_date = %(trade_date)s and index_code = %(index_code)s
            order by minute_ts
            """,
            {"trade_date": trade_date, "index_code": index_code},
        )
    )
    broad_participation = bool(market_state.get("broad_participation"))
    live_rows: list[dict] = []
    for row in stock_rows:
        stock_change = _scalar(row.get("change_pct_from_prev_close"))
        rel_strength_bps = 100.0 * (stock_change - index_change)
        change_15m = _scalar(row.get("change_pct_15m"))
        change_open = _scalar(row.get("change_pct_from_open"))
        vwap_dev_bps = _scalar(row.get("vwap_dev_bps"))
        volume_ratio_day = _scalar(row.get("volume_ratio_day"))
        above_vwap = bool(row.get("above_vwap"))
        above_or = bool(row.get("above_open_range_high"))
        below_or = bool(row.get("below_open_range_low"))
        range_position = _scalar(row.get("range_position_pct"), 50.0)

        continuation_score = 0.0
        weakness_score = 0.0
        mean_reversion_score = 0.0
        reversal_score = 0.0

        if stock_change > 0:
            continuation_score += 20.0
        if stock_change < 0:
            weakness_score += 20.0
        if above_vwap:
            continuation_score += 20.0
        else:
            weakness_score += 10.0
        if above_or and stock_change > 0:
            continuation_score += 20.0
        if below_or and stock_change < 0:
            weakness_score += 20.0
        if change_15m > 0:
            continuation_score += 15.0
        if change_15m < 0:
            weakness_score += 15.0
        if rel_strength_bps > 25:
            continuation_score += 15.0
        if rel_strength_bps < -25:
            weakness_score += 15.0
        if volume_ratio_day > 0.50:
            continuation_score += 10.0
            weakness_score += 10.0

        if not above_vwap and change_15m > 0 and vwap_dev_bps > -75:
            mean_reversion_score += 30.0
        if abs(change_open) > 0.70 and _sign(change_open) != _sign(change_15m):
            mean_reversion_score += 20.0
            reversal_score += 20.0
        if 20 <= range_position <= 60:
            mean_reversion_score += 10.0
        if abs(_scalar(row.get("change_pct_30m"))) >= 0.30 and _sign(_scalar(row.get("change_pct_30m"))) != _sign(stock_change):
            reversal_score += 25.0
        if range_position <= 20 and change_15m > 0:
            reversal_score += 15.0
        if range_position >= 80 and change_15m < 0:
            reversal_score += 15.0
        if above_vwap and _sign(change_open) != _sign(stock_change):
            reversal_score += 10.0

        beta_20d = _scalar(row.get("beta_20d"), 1.0)
        beta_60d = _scalar(row.get("beta_60d"), beta_20d)
        residual_5m = _scalar(row.get("residual_return_5m_pct"))
        residual_15m = _scalar(row.get("residual_return_15m_pct"))
        residual_30m = _scalar(row.get("residual_return_30m_pct"))
        residual_60m = _scalar(row.get("residual_return_60m_pct"))
        time_above_vwap_pct = _scalar(row.get("time_above_vwap_pct"), 50.0)
        vwap_hold_quality_score = _scalar(row.get("vwap_hold_quality_score"), 50.0)
        rs_persistence_score = _scalar(row.get("relative_strength_persistence_score"), 50.0)
        range_efficiency_pct = _scalar(row.get("range_efficiency_pct"), 50.0)
        minute_volume_ratio = _scalar(row.get("minute_volume_ratio"), 1.0)
        cum_volume_vs_profile = _scalar(row.get("cum_volume_vs_profile"), 1.0)
        volume_curve_surprise = _scalar(row.get("volume_curve_surprise"), 100.0)
        close_location_quality_pct = _scalar(row.get("close_location_quality_pct"), 50.0)

        residual_leadership_score = _clamp_score(
            max(0.0, residual_15m) * 28.0
            + max(0.0, residual_30m) * 24.0
            + max(0.0, residual_60m) * 12.0
            + 0.22 * vwap_hold_quality_score
            + 0.22 * rs_persistence_score
            + 0.16 * range_efficiency_pct
            + min(12.0, volume_curve_surprise / 25.0)
        )
        residual_laggard_score = _clamp_score(
            max(0.0, -residual_15m) * 28.0
            + max(0.0, -residual_30m) * 24.0
            + max(0.0, -residual_60m) * 12.0
            + 0.18 * max(0.0, 100.0 - vwap_hold_quality_score)
            + 0.18 * max(0.0, 100.0 - rs_persistence_score)
            + 0.10 * max(0.0, 100.0 - close_location_quality_pct)
        )
        index_beta_follow_score = _clamp_score(
            (20.0 if abs(stock_change) >= 0.50 and _sign(stock_change) == _sign(index_change) else 0.0)
            + min(20.0, max(0.0, beta_20d - 1.0) * 20.0)
            + min(25.0, max(0.0, 0.25 - abs(residual_15m)) * 80.0)
            + min(25.0, max(0.0, 0.30 - abs(residual_30m)) * 70.0)
        )
        vwap_control_score = _clamp_score(
            0.42 * vwap_hold_quality_score
            + 0.18 * time_above_vwap_pct
            + 0.18 * close_location_quality_pct
            + 0.12 * range_efficiency_pct
            + min(10.0, volume_curve_surprise / 30.0)
            + (8.0 if above_or and residual_15m > 0 else 0.0)
        )
        headline_spike_score = _clamp_score(
            max(0.0, abs(residual_5m) - abs(residual_30m)) * 40.0
            + max(0.0, minute_volume_ratio - 1.5) * 18.0
            + max(0.0, 55.0 - vwap_hold_quality_score) * 0.35
            + max(0.0, 55.0 - rs_persistence_score) * 0.35
            + max(0.0, 50.0 - range_efficiency_pct) * 0.20
        )
        catch_up_score = _clamp_score(
            (18.0 if broad_participation and index_change > 0 else 0.0)
            + max(0.0, residual_5m - residual_30m) * 25.0
            + (12.0 if above_vwap or vwap_dev_bps > -40 else 0.0)
            + min(18.0, max(0.0, vwap_hold_quality_score - 50.0) * 0.35)
            + min(18.0, max(0.0, rs_persistence_score - 45.0) * 0.30)
            + min(10.0, max(0.0, volume_curve_surprise - 90.0) * 0.10)
            + (10.0 if stock_change < index_change and stock_change > -1.0 else 0.0)
        )

        dominant_signal = "balanced"
        dominant_score = max(
            residual_leadership_score,
            residual_laggard_score,
            index_beta_follow_score,
            vwap_control_score,
            headline_spike_score,
            catch_up_score,
            continuation_score,
            weakness_score,
            mean_reversion_score,
            reversal_score,
        )
        if residual_leadership_score == dominant_score and residual_leadership_score >= 60 and stock_change >= 0:
            dominant_signal = "residual-leader"
        elif residual_laggard_score == dominant_score and residual_laggard_score >= 60 and stock_change <= 0:
            dominant_signal = "residual-laggard"
        elif vwap_control_score == dominant_score and vwap_control_score >= 65 and stock_change >= 0:
            dominant_signal = "vwap-control-breakout"
        elif headline_spike_score == dominant_score and headline_spike_score >= 55:
            dominant_signal = "headline-spike"
        elif catch_up_score == dominant_score and catch_up_score >= 55:
            dominant_signal = "catch-up-candidate"
        elif index_beta_follow_score == dominant_score and index_beta_follow_score >= 55:
            dominant_signal = "index-beta-follower"
        elif continuation_score == dominant_score and continuation_score >= 40:
            dominant_signal = "intraday-strength"
        elif weakness_score == dominant_score and weakness_score >= 40:
            dominant_signal = "intraday-weakness"
        elif mean_reversion_score == dominant_score and mean_reversion_score >= 35:
            dominant_signal = "mean-reversion-candidate"
        elif reversal_score == dominant_score and reversal_score >= 35:
            dominant_signal = "late-reversal-candidate"

        direction = _direction(stock_change)
        tags: list[str] = []
        if above_vwap:
            tags.append("above-vwap")
        if above_or:
            tags.append("above-open-range")
        if below_or:
            tags.append("below-open-range")
        if residual_15m > 0.20:
            tags.append("residual-strength")
        if residual_15m < -0.20:
            tags.append("residual-weakness")
        if time_above_vwap_pct >= 65:
            tags.append("vwap-control")
        if volume_curve_surprise >= 120:
            tags.append("volume-surprise")
        if headline_spike_score >= 55:
            tags.append("headline-spike-risk")
        if catch_up_score >= 55:
            tags.append("catch-up")

        if dominant_signal == "residual-leader":
            conclusion = "Stock is strong even after removing index effect; the move is being supported by residual strength, persistence, and acceptable intraday quality."
        elif dominant_signal == "residual-laggard":
            conclusion = "Stock is weak even after removing index effect; weakness is not only index beta."
        elif dominant_signal == "vwap-control-breakout":
            conclusion = "This breakout is being supported by sustained volume and VWAP control rather than a brief price spike."
        elif dominant_signal == "headline-spike":
            conclusion = "This looks more like a headline spike than a persistent leader because persistence and VWAP hold quality are weaker than the short-term burst."
        elif dominant_signal == "catch-up-candidate":
            conclusion = "This name is lagging the move so far but intraday quality is improving enough to justify a catch-up study if breadth remains healthy."
        elif dominant_signal == "index-beta-follower":
            conclusion = "The stock is moving mostly because the index is moving; residual leadership is limited after beta adjustment."
        elif dominant_signal == "intraday-strength":
            conclusion = "Current move is confirming the session direction and participation signals."
        elif dominant_signal == "intraday-weakness":
            conclusion = "Current weakness is aligned with adverse intraday structure."
        elif dominant_signal == "mean-reversion-candidate":
            conclusion = "Price action is improving versus the early move and may suit mean-reversion study."
        elif dominant_signal == "late-reversal-candidate":
            conclusion = "Recent move is materially different from the earlier session path."
        else:
            conclusion = "No dominant stock-level quality pattern currently stands out."

        explanation = {
            "raw_vs_residual": {
                "stock_change_pct": stock_change,
                "index_change_pct": index_change,
                "beta_20d": beta_20d,
                "beta_60d": beta_60d,
                "residual_return_5m_pct": residual_5m,
                "residual_return_15m_pct": residual_15m,
                "residual_return_30m_pct": residual_30m,
                "residual_return_60m_pct": residual_60m,
            },
            "quality": {
                "time_above_vwap_pct": time_above_vwap_pct,
                "vwap_hold_quality_score": vwap_hold_quality_score,
                "relative_strength_persistence_score": rs_persistence_score,
                "range_efficiency_pct": range_efficiency_pct,
                "volume_curve_surprise": volume_curve_surprise,
                "close_location_quality_pct": close_location_quality_pct,
            },
            "scores": {
                "continuation_score": continuation_score,
                "weakness_score": weakness_score,
                "mean_reversion_score": mean_reversion_score,
                "reversal_score": reversal_score,
                "residual_leadership_score": residual_leadership_score,
                "residual_laggard_score": residual_laggard_score,
                "index_beta_follow_score": index_beta_follow_score,
                "vwap_control_score": vwap_control_score,
                "headline_spike_score": headline_spike_score,
                "catch_up_score": catch_up_score,
            },
        }

        payload = {
            "trade_date": trade_date,
            "as_of_ts": as_of_ts,
            "symbol": row["symbol"],
            "sector_name": row.get("sector_name"),
            "last_price": row.get("last_price"),
            "change_pct_from_prev_close": stock_change,
            "change_pct_from_open": change_open,
            "change_pct_15m": change_15m,
            "change_pct_30m": _scalar(row.get("change_pct_30m")),
            "change_pct_60m": _scalar(row.get("change_pct_60m")),
            "vwap_dev_bps": vwap_dev_bps,
            "relative_strength_bps": rel_strength_bps,
            "above_vwap": above_vwap,
            "above_open_range_high": above_or,
            "below_open_range_low": below_or,
            "range_position_pct": range_position,
            "volume_ratio_day": volume_ratio_day,
            "beta_20d": beta_20d,
            "beta_60d": beta_60d,
            "residual_return_5m_pct": residual_5m,
            "residual_return_15m_pct": residual_15m,
            "residual_return_30m_pct": residual_30m,
            "residual_return_60m_pct": residual_60m,
            "time_above_vwap_pct": time_above_vwap_pct,
            "vwap_hold_quality_score": vwap_hold_quality_score,
            "relative_strength_persistence_score": rs_persistence_score,
            "range_efficiency_pct": range_efficiency_pct,
            "minute_volume_ratio": minute_volume_ratio,
            "cum_volume_vs_profile": cum_volume_vs_profile,
            "volume_curve_surprise": volume_curve_surprise,
            "close_location_quality_pct": close_location_quality_pct,
            "continuation_score": continuation_score,
            "weakness_score": weakness_score,
            "mean_reversion_score": mean_reversion_score,
            "reversal_score": reversal_score,
            "residual_leadership_score": residual_leadership_score,
            "index_beta_follow_score": index_beta_follow_score,
            "vwap_control_score": vwap_control_score,
            "headline_spike_score": headline_spike_score,
            "catch_up_score": catch_up_score,
            "dominant_signal": dominant_signal,
            "tags": tags,
            "explanation": explanation,
        }
        live_rows.append(
            {
                "trade_date": trade_date,
                "as_of_ts": as_of_ts,
                "symbol": row["symbol"],
                "sector_name": row.get("sector_name"),
                "last_price": row.get("last_price"),
                "change_pct_from_prev_close": stock_change,
                "change_pct_from_open": change_open,
                "change_pct_15m": change_15m,
                "vwap_dev_bps": vwap_dev_bps,
                "relative_strength_bps": rel_strength_bps,
                "above_vwap": above_vwap,
                "above_open_range_high": above_or,
                "below_open_range_low": below_or,
                "volume_ratio_day": volume_ratio_day,
                "continuation_score": continuation_score,
                "weakness_score": weakness_score,
                "mean_reversion_score": mean_reversion_score,
                "reversal_score": reversal_score,
                "beta_20d": beta_20d,
                "beta_60d": beta_60d,
                "residual_return_5m_pct": residual_5m,
                "residual_return_15m_pct": residual_15m,
                "residual_return_30m_pct": residual_30m,
                "residual_return_60m_pct": residual_60m,
                "time_above_vwap_pct": time_above_vwap_pct,
                "vwap_hold_quality_score": vwap_hold_quality_score,
                "relative_strength_persistence_score": rs_persistence_score,
                "range_efficiency_pct": range_efficiency_pct,
                "minute_volume_ratio": minute_volume_ratio,
                "cum_volume_vs_profile": cum_volume_vs_profile,
                "volume_curve_surprise": volume_curve_surprise,
                "close_location_quality_pct": close_location_quality_pct,
                "residual_leadership_score": residual_leadership_score,
                "index_beta_follow_score": index_beta_follow_score,
                "vwap_control_score": vwap_control_score,
                "headline_spike_score": headline_spike_score,
                "catch_up_score": catch_up_score,
                "dominant_signal": dominant_signal,
                "direction": direction,
                "accent_token": _accent(direction),
                "tags_json": tags,
                "conclusion": conclusion,
                "payload_json": payload,
                "explanation_json": explanation,
            }
        )
    return live_rows


def _persist_stock_live_rows(live_rows: list[dict]) -> None:  # type: ignore[override]
    if not live_rows:
        return
    trade_date = live_rows[0]["trade_date"]
    execute("delete from nse_intraday.stock_intraday_live where trade_date = %(trade_date)s", {"trade_date": trade_date})
    execute_many(
        """
        insert into nse_intraday.stock_intraday_live (
          trade_date, as_of_ts, symbol, sector_name, last_price, change_pct_from_prev_close,
          change_pct_from_open, change_pct_15m, vwap_dev_bps, relative_strength_bps, above_vwap,
          above_open_range_high, below_open_range_low, volume_ratio_day, continuation_score,
          weakness_score, mean_reversion_score, reversal_score, beta_20d, beta_60d,
          residual_return_5m_pct, residual_return_15m_pct, residual_return_30m_pct, residual_return_60m_pct,
          time_above_vwap_pct, vwap_hold_quality_score, relative_strength_persistence_score,
          range_efficiency_pct, minute_volume_ratio, cum_volume_vs_profile, volume_curve_surprise,
          close_location_quality_pct, residual_leadership_score, index_beta_follow_score,
          vwap_control_score, headline_spike_score, catch_up_score,
          dominant_signal, direction, accent_token, tags_json, conclusion, payload_json, explanation_json
        )
        values (
          %(trade_date)s, %(as_of_ts)s, %(symbol)s, %(sector_name)s, %(last_price)s, %(change_pct_from_prev_close)s,
          %(change_pct_from_open)s, %(change_pct_15m)s, %(vwap_dev_bps)s, %(relative_strength_bps)s, %(above_vwap)s,
          %(above_open_range_high)s, %(below_open_range_low)s, %(volume_ratio_day)s, %(continuation_score)s,
          %(weakness_score)s, %(mean_reversion_score)s, %(reversal_score)s, %(beta_20d)s, %(beta_60d)s,
          %(residual_return_5m_pct)s, %(residual_return_15m_pct)s, %(residual_return_30m_pct)s, %(residual_return_60m_pct)s,
          %(time_above_vwap_pct)s, %(vwap_hold_quality_score)s, %(relative_strength_persistence_score)s,
          %(range_efficiency_pct)s, %(minute_volume_ratio)s, %(cum_volume_vs_profile)s, %(volume_curve_surprise)s,
          %(close_location_quality_pct)s, %(residual_leadership_score)s, %(index_beta_follow_score)s,
          %(vwap_control_score)s, %(headline_spike_score)s, %(catch_up_score)s,
          %(dominant_signal)s, %(direction)s, %(accent_token)s, %(tags_json)s::jsonb, %(conclusion)s, %(payload_json)s::jsonb, %(explanation_json)s::jsonb
        )
        on conflict (trade_date, symbol) do update
        set as_of_ts = excluded.as_of_ts,
            sector_name = excluded.sector_name,
            last_price = excluded.last_price,
            change_pct_from_prev_close = excluded.change_pct_from_prev_close,
            change_pct_from_open = excluded.change_pct_from_open,
            change_pct_15m = excluded.change_pct_15m,
            vwap_dev_bps = excluded.vwap_dev_bps,
            relative_strength_bps = excluded.relative_strength_bps,
            above_vwap = excluded.above_vwap,
            above_open_range_high = excluded.above_open_range_high,
            below_open_range_low = excluded.below_open_range_low,
            volume_ratio_day = excluded.volume_ratio_day,
            continuation_score = excluded.continuation_score,
            weakness_score = excluded.weakness_score,
            mean_reversion_score = excluded.mean_reversion_score,
            reversal_score = excluded.reversal_score,
            beta_20d = excluded.beta_20d,
            beta_60d = excluded.beta_60d,
            residual_return_5m_pct = excluded.residual_return_5m_pct,
            residual_return_15m_pct = excluded.residual_return_15m_pct,
            residual_return_30m_pct = excluded.residual_return_30m_pct,
            residual_return_60m_pct = excluded.residual_return_60m_pct,
            time_above_vwap_pct = excluded.time_above_vwap_pct,
            vwap_hold_quality_score = excluded.vwap_hold_quality_score,
            relative_strength_persistence_score = excluded.relative_strength_persistence_score,
            range_efficiency_pct = excluded.range_efficiency_pct,
            minute_volume_ratio = excluded.minute_volume_ratio,
            cum_volume_vs_profile = excluded.cum_volume_vs_profile,
            volume_curve_surprise = excluded.volume_curve_surprise,
            close_location_quality_pct = excluded.close_location_quality_pct,
            residual_leadership_score = excluded.residual_leadership_score,
            index_beta_follow_score = excluded.index_beta_follow_score,
            vwap_control_score = excluded.vwap_control_score,
            headline_spike_score = excluded.headline_spike_score,
            catch_up_score = excluded.catch_up_score,
            dominant_signal = excluded.dominant_signal,
            direction = excluded.direction,
            accent_token = excluded.accent_token,
            tags_json = excluded.tags_json,
            conclusion = excluded.conclusion,
            payload_json = excluded.payload_json,
            explanation_json = excluded.explanation_json,
            generated_at = now()
        """,
        [
            {
                **row,
                "tags_json": dumps_json(row["tags_json"]),
                "payload_json": dumps_json(row["payload_json"]),
                "explanation_json": dumps_json(row["explanation_json"]),
            }
            for row in live_rows
        ],
    )


def _seed_watchlists_if_missing() -> None:  # type: ignore[override]
    execute(
        """
        insert into nse_ops.watchlist (slug, title, description, watchlist_kind, rule_key, selection_limit, is_active, ui_rank)
        values
          ('intraday-strength', 'Intraday Strength', 'Nifty 100 names showing strong continuation characteristics', 'system', 'intraday_strength', 20, true, 10),
          ('intraday-weakness', 'Intraday Weakness', 'Nifty 100 names showing persistent intraday weakness', 'system', 'intraday_weakness', 20, true, 20),
          ('vwap-reclaim', 'VWAP Reclaim', 'Names showing recovery toward or through VWAP after early weakness', 'system', 'vwap_reclaim', 20, true, 30),
          ('late-reversal', 'Late Reversal', 'Names with meaningful reversal probability into the final phase of the session', 'system', 'late_reversal', 20, true, 40),
          ('residual-leaders', 'Residual Leaders', 'Names outperforming the index even after beta adjustment', 'system', 'residual_leaders', 20, true, 50),
          ('vwap-control-breakouts', 'VWAP Control Breakouts', 'Breakouts supported by VWAP hold quality and persistent relative strength', 'system', 'vwap_control', 20, true, 60),
          ('headline-spikes', 'Headline Spikes', 'Fast movers whose move quality looks weak after persistence and VWAP checks', 'system', 'headline_spikes', 20, true, 70),
          ('catch-up-candidates', 'Catch-up Candidates', 'Names improving in relative strength that may catch up if participation stays healthy', 'system', 'catch_up', 20, true, 80),
          ('index-beta-followers', 'Index Beta Followers', 'Names moving mostly with index beta rather than independent residual strength', 'system', 'index_beta_followers', 20, true, 90)
        on conflict (slug) do nothing
        """
    )


def _watchlist_rows_for_rule(rule_key: str, live_rows: list[dict], limit: int) -> list[dict]:  # type: ignore[override]
    ranked = []
    if rule_key == "intraday_strength":
        ranked = [r for r in live_rows if r["direction"] == "up"]
        ranked.sort(key=lambda r: (r["continuation_score"], r["relative_strength_bps"], r["change_pct_from_prev_close"]), reverse=True)
    elif rule_key == "intraday_weakness":
        ranked = [r for r in live_rows if r["direction"] == "down"]
        ranked.sort(key=lambda r: (r["weakness_score"], -r["relative_strength_bps"], -r["change_pct_from_prev_close"]), reverse=True)
    elif rule_key == "vwap_reclaim":
        ranked = [r for r in live_rows if r["mean_reversion_score"] >= 35]
        ranked.sort(key=lambda r: (r["mean_reversion_score"], r["change_pct_15m"]), reverse=True)
    elif rule_key == "late_reversal":
        ranked = [r for r in live_rows if r["reversal_score"] >= 35]
        ranked.sort(key=lambda r: (r["reversal_score"], abs(r["change_pct_15m"])), reverse=True)
    elif rule_key == "residual_leaders":
        ranked = [r for r in live_rows if r["residual_leadership_score"] >= 55 and r["change_pct_from_prev_close"] >= 0]
        ranked.sort(key=lambda r: (r["residual_leadership_score"], r["vwap_control_score"], r["residual_return_15m_pct"]), reverse=True)
    elif rule_key == "vwap_control":
        ranked = [r for r in live_rows if r["vwap_control_score"] >= 55 and r["direction"] == "up"]
        ranked.sort(key=lambda r: (r["vwap_control_score"], r["residual_leadership_score"], r["time_above_vwap_pct"]), reverse=True)
    elif rule_key == "headline_spikes":
        ranked = [r for r in live_rows if r["headline_spike_score"] >= 45]
        ranked.sort(key=lambda r: (r["headline_spike_score"], abs(r["residual_return_5m_pct"])), reverse=True)
    elif rule_key == "catch_up":
        ranked = [r for r in live_rows if r["catch_up_score"] >= 45]
        ranked.sort(key=lambda r: (r["catch_up_score"], r["residual_return_5m_pct"], r["vwap_hold_quality_score"]), reverse=True)
    elif rule_key == "index_beta_followers":
        ranked = [r for r in live_rows if r["index_beta_follow_score"] >= 45]
        ranked.sort(key=lambda r: (r["index_beta_follow_score"], r["beta_20d"], abs(r["change_pct_from_prev_close"])), reverse=True)
    return ranked[:limit]


def _persist_watchlists(trade_date: date, as_of_ts: datetime, live_rows: list[dict]) -> None:  # type: ignore[override]
    _seed_watchlists_if_missing()
    watchlists = fetch_all(
        """
        select watchlist_id, slug, title, rule_key, selection_limit
        from nse_ops.watchlist
        where is_active = true
          and slug in (
            'intraday-strength', 'intraday-weakness', 'vwap-reclaim', 'late-reversal',
            'residual-leaders', 'vwap-control-breakouts', 'headline-spikes',
            'catch-up-candidates', 'index-beta-followers'
          )
        order by ui_rank asc, title asc
        """
    )
    execute("delete from nse_ops.watchlist_snapshot_intraday where trade_date = %(trade_date)s", {"trade_date": trade_date})
    rows_to_insert: list[dict] = []
    for wl in watchlists:
        picks = _watchlist_rows_for_rule(wl["rule_key"], live_rows, int(wl.get("selection_limit") or 20))
        for rank_no, item in enumerate(picks, start=1):
            score_map = {
                "intraday_strength": item["continuation_score"],
                "intraday_weakness": item["weakness_score"],
                "vwap_reclaim": item["mean_reversion_score"],
                "late_reversal": item["reversal_score"],
                "residual_leaders": item["residual_leadership_score"],
                "vwap_control": item["vwap_control_score"],
                "headline_spikes": item["headline_spike_score"],
                "catch_up": item["catch_up_score"],
                "index_beta_followers": item["index_beta_follow_score"],
            }
            rows_to_insert.append(
                {
                    "trade_date": trade_date,
                    "as_of_ts": as_of_ts,
                    "watchlist_id": wl["watchlist_id"],
                    "symbol": item["symbol"],
                    "rank_no": rank_no,
                    "direction": item["direction"],
                    "accent_token": item["accent_token"],
                    "signal_score": score_map.get(wl["rule_key"], 0.0),
                    "last_price": item["last_price"],
                    "change_pct": item["change_pct_from_prev_close"],
                    "volume_ratio_day": item["volume_ratio_day"],
                    "vwap_dev_bps": item["vwap_dev_bps"],
                    "sector_name": item["sector_name"],
                    "tags_json": dumps_json(item["tags_json"]),
                    "notes": item["conclusion"],
                    "payload_json": dumps_json(item["payload_json"]),
                }
            )
    if rows_to_insert:
        execute_many(
            """
            insert into nse_ops.watchlist_snapshot_intraday (
              trade_date, as_of_ts, watchlist_id, symbol, rank_no, direction, accent_token, signal_score, last_price,
              change_pct, volume_ratio_day, vwap_dev_bps, sector_name, tags_json, notes, payload_json
            )
            values (
              %(trade_date)s, %(as_of_ts)s, %(watchlist_id)s, %(symbol)s, %(rank_no)s, %(direction)s, %(accent_token)s, %(signal_score)s, %(last_price)s,
              %(change_pct)s, %(volume_ratio_day)s, %(vwap_dev_bps)s, %(sector_name)s, %(tags_json)s::jsonb, %(notes)s, %(payload_json)s::jsonb
            )
            on conflict (trade_date, watchlist_id, symbol) do update
            set as_of_ts = excluded.as_of_ts,
                rank_no = excluded.rank_no,
                direction = excluded.direction,
                accent_token = excluded.accent_token,
                signal_score = excluded.signal_score,
                last_price = excluded.last_price,
                change_pct = excluded.change_pct,
                volume_ratio_day = excluded.volume_ratio_day,
                vwap_dev_bps = excluded.vwap_dev_bps,
                sector_name = excluded.sector_name,
                tags_json = excluded.tags_json,
                notes = excluded.notes,
                payload_json = excluded.payload_json,
                generated_at = now()
            """,
            rows_to_insert,
        )


def _leader_rows(live_rows: list[dict], direction: str, limit: int = 8) -> list[dict]:  # type: ignore[override]
    if direction == "up":
        rows = sorted(
            live_rows,
            key=lambda r: (
                r["residual_leadership_score"],
                r["vwap_control_score"],
                r["relative_strength_persistence_score"],
                r["change_pct_from_prev_close"],
            ),
            reverse=True,
        )
    else:
        rows = sorted(
            live_rows,
            key=lambda r: (
                max(r["weakness_score"], r.get("headline_spike_score", 0.0)),
                abs(r.get("residual_return_15m_pct", 0.0)),
                -r["change_pct_from_prev_close"],
            ),
            reverse=True,
        )
    styled = []
    for row in rows[:limit]:
        styled.append(
            {
                "symbol": row["symbol"],
                "sector_name": row["sector_name"],
                "last_price": row["last_price"],
                "change_pct": row["change_pct_from_prev_close"],
                "relative_strength_bps": row["relative_strength_bps"],
                "residual_return_15m_pct": row.get("residual_return_15m_pct"),
                "vwap_hold_quality_score": row.get("vwap_hold_quality_score"),
                "dominant_signal": row["dominant_signal"],
                "direction": row["direction"],
                "accent_token": row["accent_token"],
                "arrow": _arrow(row["direction"]),
            }
        )
    return styled


def _stock_quality_digest(live_rows: list[dict]) -> dict:
    residual_leaders = sorted([r for r in live_rows if r["residual_leadership_score"] >= 55], key=lambda r: r["residual_leadership_score"], reverse=True)[:5]
    vwap_control = sorted([r for r in live_rows if r["vwap_control_score"] >= 55], key=lambda r: r["vwap_control_score"], reverse=True)[:5]
    headline_spikes = sorted([r for r in live_rows if r["headline_spike_score"] >= 45], key=lambda r: r["headline_spike_score"], reverse=True)[:5]
    catch_up = sorted([r for r in live_rows if r["catch_up_score"] >= 45], key=lambda r: r["catch_up_score"], reverse=True)[:5]
    return {
        "residual_leader_count": len([r for r in live_rows if r["residual_leadership_score"] >= 55]),
        "vwap_control_count": len([r for r in live_rows if r["vwap_control_score"] >= 55]),
        "headline_spike_count": len([r for r in live_rows if r["headline_spike_score"] >= 45]),
        "catch_up_count": len([r for r in live_rows if r["catch_up_score"] >= 45]),
        "residual_leaders": [
            {
                "symbol": r["symbol"],
                "score": r["residual_leadership_score"],
                "residual_return_15m_pct": r["residual_return_15m_pct"],
                "vwap_hold_quality_score": r["vwap_hold_quality_score"],
                "direction": r["direction"],
                "accent_token": r["accent_token"],
            }
            for r in residual_leaders
        ],
        "vwap_control_breakouts": [
            {
                "symbol": r["symbol"],
                "score": r["vwap_control_score"],
                "time_above_vwap_pct": r["time_above_vwap_pct"],
                "volume_curve_surprise": r["volume_curve_surprise"],
                "direction": r["direction"],
                "accent_token": r["accent_token"],
            }
            for r in vwap_control
        ],
        "headline_spikes": [
            {
                "symbol": r["symbol"],
                "score": r["headline_spike_score"],
                "residual_return_5m_pct": r["residual_return_5m_pct"],
                "relative_strength_persistence_score": r["relative_strength_persistence_score"],
                "direction": r["direction"],
                "accent_token": r["accent_token"],
            }
            for r in headline_spikes
        ],
        "catch_up_candidates": [
            {
                "symbol": r["symbol"],
                "score": r["catch_up_score"],
                "residual_return_5m_pct": r["residual_return_5m_pct"],
                "vwap_hold_quality_score": r["vwap_hold_quality_score"],
                "direction": r["direction"],
                "accent_token": r["accent_token"],
            }
            for r in catch_up
        ],
    }


def _build_sections(summary: dict, market_rows: list[dict], live_rows: list[dict]) -> list[dict]:  # type: ignore[override]
    sections = _build_sections.__wrapped__(summary, market_rows, live_rows) if hasattr(_build_sections, "__wrapped__") else []
    if not sections:
        # fall back to the previous implementation by reconstructing from persisted section rows is not possible here;
        # instead rebuild the original section list inline by delegating to the earlier global if stored.
        pass
    # We cannot access the original function object directly after redefinition, so rebuild by calling the previous persisted sections logic pattern.
    # Use the already materialized summary/market/live rows to produce a minimal but complete section set.
    direction = summary["direction"]
    history = _history_context(summary["index_code"], summary["primary_state"])
    timeline = [
        {
            "minute_ts": _iso(row["minute_ts"]),
            "index_change_pct": row.get("change_pct_from_prev_close"),
            "breadth_up_pct": row.get("breadth_up_pct"),
            "breadth_above_vwap_pct": row.get("breadth_above_vwap_pct"),
            "weighted_participation_pct": row.get("weighted_participation_pct"),
            "top10_concentration_pct": row.get("top10_concentration_pct"),
        }
        for row in market_rows
    ]
    sections = [
        {
            "section_slug": "market-state",
            "title": SECTION_META["market-state"]["title"],
            "direction": direction,
            "accent_token": _accent(direction),
            "summary_metrics": {
                "primary_state": summary["primary_state"],
                "confidence_score": summary["confidence_score"],
                "change_pct": summary["change_pct"],
                "gap_pct": summary["gap_pct"],
            },
            "highlights": [
                f"Primary state: {summary['primary_state']}",
                f"Confidence: {summary['confidence_score']:.1f}",
                f"Gap: {summary['gap_pct']:.2f}%",
                f"Close location: {summary['close_location_pct']:.1f}%",
            ],
            "narrative": summary["narrative"],
            "rows": _summary_table(summary),
            "charts": [{"kind": "timeline", "series_key": "market_state_timeline", "rows": timeline}],
            "historical_context": history,
        },
        {
            "section_slug": "breadth-participation",
            "title": SECTION_META["breadth-participation"]["title"],
            "direction": direction,
            "accent_token": _accent(direction),
            "summary_metrics": {
                "breadth_up_pct": summary["breadth_up_pct"],
                "breadth_above_vwap_pct": summary["breadth_above_vwap_pct"],
                "weighted_participation_pct": summary["weighted_participation_pct"],
                "participation_label": summary["participation_label"],
            },
            "highlights": [
                f"Breadth up: {summary['breadth_up_pct']:.1f}%",
                f"Above VWAP: {summary['breadth_above_vwap_pct']:.1f}%",
                f"Weighted participation: {summary['weighted_participation_pct']:.1f}%",
                f"Participation label: {summary['participation_label']}",
            ],
            "narrative": "Large-cap breadth is measured only on the Nifty 100 basket and should be interpreted as large-cap participation, not full-market breadth.",
            "rows": [
                {"metric": "Breadth up %", "value": summary["breadth_up_pct"], "direction": direction, "accent_token": _accent(direction)},
                {"metric": "Above VWAP %", "value": summary["breadth_above_vwap_pct"], "direction": direction, "accent_token": _accent(direction)},
                {"metric": "Above open range %", "value": summary["breadth_above_or_high_pct"], "direction": direction, "accent_token": _accent(direction)},
                {"metric": "Below open range %", "value": summary["breadth_below_or_low_pct"], "direction": "down" if summary["breadth_below_or_low_pct"] > 0 else "neutral", "accent_token": _accent("down" if summary["breadth_below_or_low_pct"] > 0 else "neutral")},
            ],
            "charts": [{"kind": "timeline", "series_key": "breadth", "rows": timeline}],
            "historical_context": history,
        },
        {
            "section_slug": "open-drive",
            "title": SECTION_META["open-drive"]["title"],
            "direction": direction,
            "accent_token": _accent(direction),
            "summary_metrics": {
                "gap_pct": summary["gap_pct"],
                "open_range_15_pct": summary["open_range_15_pct"],
                "gap_filled": summary["gap_filled"],
                "failed_open": summary["failed_open"],
            },
            "highlights": [
                f"Gap: {summary['gap_pct']:.2f}%",
                f"First 15m range: {summary['open_range_15_pct']:.2f}%",
                f"Gap filled: {summary['gap_filled']}",
                f"Failed open: {summary['failed_open']}",
            ],
            "narrative": "This section tells you whether the opening move was accepted, extended, or rejected.",
            "rows": [
                {"metric": "Gap vs prior close", "value": summary["gap_pct"], "direction": _direction(summary["gap_pct"]), "accent_token": _accent(_direction(summary["gap_pct"]))},
                {"metric": "15m range expansion", "value": summary["open_range_15_pct"], "direction": "neutral", "accent_token": "white"},
                {"metric": "Gap filled", "value": summary["gap_filled"], "direction": "neutral", "accent_token": "white"},
                {"metric": "Failed open", "value": summary["failed_open"], "direction": "down" if summary["failed_open"] else "neutral", "accent_token": _accent("down" if summary["failed_open"] else "neutral")},
            ],
            "charts": [{"kind": "timeline", "series_key": "open_drive", "rows": timeline}],
            "historical_context": history,
        },
        {
            "section_slug": "leadership-dispersion",
            "title": SECTION_META["leadership-dispersion"]["title"],
            "direction": direction,
            "accent_token": _accent(direction),
            "summary_metrics": {
                "top10_concentration_pct": summary["top10_concentration_pct"],
                "dispersion_pct": summary["dispersion_pct"],
                "participation_label": summary["participation_label"],
            },
            "highlights": [
                f"Top10 concentration: {summary['top10_concentration_pct']:.1f}%",
                f"Dispersion: {summary['dispersion_pct']:.3f}%",
                f"Narrow leadership: {summary['narrow_leadership']}",
                f"Broad participation: {summary['broad_participation']}",
            ],
            "narrative": "This section separates broad confirmation from a move driven by a small number of large-cap names.",
            "rows": _leader_rows(live_rows, "up", limit=8) + _leader_rows(live_rows, "down", limit=8),
            "charts": [{"kind": "timeline", "series_key": "leadership_dispersion", "rows": timeline}],
            "historical_context": history,
        },
        {
            "section_slug": "reversals-failures",
            "title": SECTION_META["reversals-failures"]["title"],
            "direction": direction,
            "accent_token": _accent(direction),
            "summary_metrics": {
                "late_day_reversal": summary["late_day_reversal"],
                "high_volatility_chop": summary["high_volatility_chop"],
                "failed_open": summary["failed_open"],
            },
            "highlights": [
                f"Late-day reversal: {summary['late_day_reversal']}",
                f"High-volatility chop: {summary['high_volatility_chop']}",
                f"Failed open: {summary['failed_open']}",
            ],
            "narrative": "This section focuses on rejected opens, reversals, and conditions where continuation setups should be down-weighted.",
            "rows": [
                {
                    "symbol": row["symbol"],
                    "dominant_signal": row["dominant_signal"],
                    "change_pct": row["change_pct_from_prev_close"],
                    "change_pct_15m": row["change_pct_15m"],
                    "vwap_dev_bps": row["vwap_dev_bps"],
                    "direction": row["direction"],
                    "accent_token": row["accent_token"],
                    "notes": row["conclusion"],
                }
                for row in sorted(live_rows, key=lambda r: (r["reversal_score"], r["mean_reversion_score"]), reverse=True)[:20]
            ],
            "charts": [{"kind": "timeline", "series_key": "reversal_risk", "rows": timeline}],
            "historical_context": history,
        },
        {
            "section_slug": "stock-opportunities",
            "title": SECTION_META["stock-opportunities"]["title"],
            "direction": direction,
            "accent_token": _accent(direction),
            "summary_metrics": {
                "strong_names": len([r for r in live_rows if r["dominant_signal"] in ("intraday-strength", "residual-leader", "vwap-control-breakout")]),
                "weak_names": len([r for r in live_rows if r["dominant_signal"] in ("intraday-weakness", "residual-laggard")]),
                "mean_reversion_names": len([r for r in live_rows if r["dominant_signal"] == "mean-reversion-candidate"]),
            },
            "highlights": [
                "Strength list favors continuation study.",
                "Weakness list helps filter against buying strength in narrow leadership.",
                "Mean-reversion and reversal candidates should be treated as learning signals, not instructions.",
            ],
            "narrative": "This section surfaces the strongest intraday pattern candidates inside the Nifty 100 basket.",
            "rows": [
                {
                    "symbol": row["symbol"],
                    "sector_name": row["sector_name"],
                    "last_price": row["last_price"],
                    "change_pct": row["change_pct_from_prev_close"],
                    "relative_strength_bps": row["relative_strength_bps"],
                    "residual_return_15m_pct": row["residual_return_15m_pct"],
                    "dominant_signal": row["dominant_signal"],
                    "direction": row["direction"],
                    "accent_token": row["accent_token"],
                    "notes": row["conclusion"],
                }
                for row in sorted(
                    live_rows,
                    key=lambda r: max(
                        r["continuation_score"], r["weakness_score"], r["mean_reversion_score"], r["reversal_score"],
                        r.get("residual_leadership_score", 0.0), r.get("vwap_control_score", 0.0), r.get("headline_spike_score", 0.0), r.get("catch_up_score", 0.0)
                    ),
                    reverse=True,
                )[:30]
            ],
            "charts": [],
            "historical_context": {},
        },
        {
            "section_slug": "stock-quality",
            "title": SECTION_META["stock-quality"]["title"],
            "direction": direction,
            "accent_token": _accent(direction),
            "summary_metrics": _stock_quality_digest(live_rows),
            "highlights": [
                "Residual strength separates stock-specific leadership from index beta.",
                "VWAP hold quality and volume curve surprise help distinguish real breakouts from low-quality spikes.",
                "Close-location quality and range efficiency help identify smooth trends versus mean-reverting bursts.",
            ],
            "narrative": "This section answers whether a stock is strong because the index is strong, or whether the stock is strong even after removing index effect.",
            "rows": [
                {
                    "symbol": row["symbol"],
                    "sector_name": row["sector_name"],
                    "dominant_signal": row["dominant_signal"],
                    "change_pct": row["change_pct_from_prev_close"],
                    "residual_return_15m_pct": row["residual_return_15m_pct"],
                    "residual_return_30m_pct": row["residual_return_30m_pct"],
                    "beta_20d": row["beta_20d"],
                    "vwap_hold_quality_score": row["vwap_hold_quality_score"],
                    "relative_strength_persistence_score": row["relative_strength_persistence_score"],
                    "range_efficiency_pct": row["range_efficiency_pct"],
                    "volume_curve_surprise": row["volume_curve_surprise"],
                    "close_location_quality_pct": row["close_location_quality_pct"],
                    "direction": row["direction"],
                    "accent_token": row["accent_token"],
                    "notes": row["conclusion"],
                }
                for row in sorted(
                    live_rows,
                    key=lambda r: max(
                        r["residual_leadership_score"],
                        r["vwap_control_score"],
                        r["headline_spike_score"],
                        r["catch_up_score"],
                        r["index_beta_follow_score"],
                    ),
                    reverse=True,
                )[:30]
            ],
            "charts": [
                {
                    "kind": "scatter",
                    "series_key": "stock_quality_matrix",
                    "rows": [
                        {
                            "symbol": row["symbol"],
                            "x": row["residual_return_15m_pct"],
                            "y": row["vwap_hold_quality_score"],
                            "size": row["volume_curve_surprise"],
                            "label": row["dominant_signal"],
                            "direction": row["direction"],
                            "accent_token": row["accent_token"],
                        }
                        for row in sorted(live_rows, key=lambda r: abs(r.get("residual_return_15m_pct", 0.0)), reverse=True)[:40]
                    ],
                }
            ],
            "historical_context": {"signal_stats": _serialize_row(_stock_signal_history_context("residual-leader"))},
        },
        {
            "section_slug": "history-context",
            "title": SECTION_META["history-context"]["title"],
            "direction": "neutral",
            "accent_token": "white",
            "summary_metrics": history,
            "highlights": [
                "Historical context becomes more valuable as more sessions accumulate.",
                "State statistics are computed from prior labeled sessions, not from the current bar stream alone.",
                "Stock alpha signals improve when beta and minute-volume baselines are trained on a deeper history.",
            ],
            "narrative": "This section puts the current session type into historical perspective.",
            "rows": flatten_dict("history_context", history) if history else [],
            "charts": [],
            "historical_context": history,
        },
    ]
    return sections


def _persist_dashboard_summary(summary: dict, live_rows: list[dict]) -> None:  # type: ignore[override]
    hero = {
        "index_name": summary["index_name"],
        "last_value": summary["last_price"],
        "change_pct": summary["change_pct"],
        "as_of": _iso(summary["as_of_ts"]),
        "direction": summary["direction"],
        "accent_token": summary["accent_token"],
        "arrow": summary["arrow"],
    }
    state_json = {
        "primary_state": summary["primary_state"],
        "secondary_states": summary["secondary_states"],
        "confidence_score": summary["confidence_score"],
        "narrative": summary["narrative"],
        "direction": summary["direction"],
        "accent_token": summary["accent_token"],
        "arrow": summary["arrow"],
    }
    breadth_json = {
        "large_cap_breadth_up_pct": summary["breadth_up_pct"],
        "above_vwap_pct": summary["breadth_above_vwap_pct"],
        "above_open_range_pct": summary["breadth_above_or_high_pct"],
        "below_open_range_pct": summary["breadth_below_or_low_pct"],
        "weighted_participation_pct": summary["weighted_participation_pct"],
        "top10_concentration_pct": summary["top10_concentration_pct"],
        "dispersion_pct": summary["dispersion_pct"],
        "participation_label": summary["participation_label"],
    }
    stock_quality = _stock_quality_digest(live_rows)
    leaders_json = {
        "top_strength": _leader_rows(live_rows, "up", limit=8),
        "top_weakness": _leader_rows(live_rows, "down", limit=8),
        "residual_leaders": stock_quality["residual_leaders"],
        "vwap_control_breakouts": stock_quality["vwap_control_breakouts"],
        "headline_spikes": stock_quality["headline_spikes"],
        "catch_up_candidates": stock_quality["catch_up_candidates"],
    }
    meta_json = {
        "suite": "nse_intraday_intelligence_stock_alpha",
        "stock_quality": stock_quality,
    }
    execute(
        """
        insert into nse_ops.dashboard_snapshot_intraday (
          trade_date, index_code, as_of_ts, is_stale, hero_json, state_json, summary_table_json, breadth_json, leaders_json,
          ticker_tape_json, footer_disclaimer, accent_token, meta_json, generated_at
        )
        values (
          %(trade_date)s, %(index_code)s, %(as_of_ts)s, false, %(hero_json)s::jsonb, %(state_json)s::jsonb,
          %(summary_table_json)s::jsonb, %(breadth_json)s::jsonb, %(leaders_json)s::jsonb, %(ticker_tape_json)s::jsonb,
          %(footer_disclaimer)s, %(accent_token)s, %(meta_json)s::jsonb, now()
        )
        on conflict (trade_date, index_code) do update
        set as_of_ts = excluded.as_of_ts,
            is_stale = excluded.is_stale,
            hero_json = excluded.hero_json,
            state_json = excluded.state_json,
            summary_table_json = excluded.summary_table_json,
            breadth_json = excluded.breadth_json,
            leaders_json = excluded.leaders_json,
            ticker_tape_json = excluded.ticker_tape_json,
            footer_disclaimer = excluded.footer_disclaimer,
            accent_token = excluded.accent_token,
            meta_json = excluded.meta_json,
            generated_at = now()
        """,
        {
            "trade_date": summary["trade_date"],
            "index_code": summary["index_code"],
            "as_of_ts": summary["as_of_ts"],
            "hero_json": dumps_json(hero),
            "state_json": dumps_json(state_json),
            "summary_table_json": dumps_json(_summary_table(summary)),
            "breadth_json": dumps_json(breadth_json),
            "leaders_json": dumps_json(leaders_json),
            "ticker_tape_json": dumps_json(_ticker_tape(live_rows)),
            "footer_disclaimer": DISCLAIMER,
            "accent_token": summary["accent_token"],
            "meta_json": dumps_json(meta_json),
        },
    )


def run_quality_checks(trade_date: date | None = None, run_id: str | None = None, index_code: str | None = None) -> dict:  # type: ignore[override]
    settings = get_settings()
    trade_date = trade_date or latest_trade_date("nse_intraday.raw_security_1m")
    index_code = index_code or settings.default_index_code

    sec_count = fetch_val("select count(*) from nse_intraday.raw_security_1m where trade_date = %(trade_date)s", {"trade_date": trade_date}) or 0
    idx_count = fetch_val("select count(*) from nse_intraday.raw_index_1m where trade_date = %(trade_date)s", {"trade_date": trade_date}) or 0
    live_count = fetch_val("select count(*) from nse_intraday.stock_intraday_live where trade_date = %(trade_date)s", {"trade_date": trade_date}) or 0
    latest_snapshot = fetch_one(
        """
        select as_of_ts
        from nse_ops.dashboard_snapshot_intraday
        where trade_date = %(trade_date)s and index_code = %(index_code)s
        """,
        {"trade_date": trade_date, "index_code": index_code},
    )
    latest_sec_minute = fetch_val("select max(minute_ts) from nse_intraday.raw_security_1m where trade_date = %(trade_date)s", {"trade_date": trade_date})
    latest_idx_minute = fetch_val("select max(minute_ts) from nse_intraday.raw_index_1m where trade_date = %(trade_date)s and index_code = %(index_code)s", {"trade_date": trade_date, "index_code": index_code})
    missing_prev_close = fetch_val(
        """
        select count(*)
        from nse_intraday.security_minute_feature
        where trade_date = %(trade_date)s and minute_no = 1 and prev_close is null
        """,
        {"trade_date": trade_date},
    ) or 0
    beta_coverage = fetch_val(
        """
        select count(*)
        from nse_intraday.stock_daily_beta_profile
        where trade_date = %(trade_date)s and index_code = %(index_code)s and beta_20d is not null
        """,
        {"trade_date": trade_date, "index_code": index_code},
    ) or 0
    volume_profile_coverage = fetch_val(
        """
        select count(distinct symbol)
        from nse_intraday.stock_minute_volume_profile
        where trade_date = %(trade_date)s
        """,
        {"trade_date": trade_date},
    ) or 0
    stock_alpha_rows = fetch_val(
        """
        select count(*)
        from nse_intraday.security_minute_feature
        where trade_date = %(trade_date)s and residual_return_15m_pct is not null
        """,
        {"trade_date": trade_date},
    ) or 0
    guard_status = get_live_guard_status(trade_date=trade_date, index_code=index_code)

    _quality(run_id, "intraday_raw_security_present", "error", sec_count > 0, str(sec_count), ">0", "Raw security minute bars must exist")
    _quality(run_id, "intraday_raw_index_present", "error", idx_count > 0, str(idx_count), ">0", "Raw index minute bars must exist")
    _quality(run_id, "intraday_prev_close_coverage", "warn", missing_prev_close == 0, str(missing_prev_close), "0", "Prev close should be available from the daily compatibility view")
    _quality(run_id, "stock_alpha_beta_coverage", "warn", beta_coverage >= 60, str(beta_coverage), ">=60", "Most Nifty100 names should have a beta estimate once history is available")
    _quality(run_id, "stock_alpha_volume_profile_coverage", "warn", volume_profile_coverage >= 60, str(volume_profile_coverage), ">=60", "Most Nifty100 names should have minute-volume baselines once history is available")
    _quality(run_id, "stock_alpha_feature_rows", "warn", stock_alpha_rows >= 1000, str(stock_alpha_rows), ">=1000", "Residual and quality fields should populate on minute feature rows")
    if latest_snapshot and latest_sec_minute:
        snapshot_age_min = int((latest_sec_minute - latest_snapshot["as_of_ts"]).total_seconds() // 60)
        _quality(run_id, "intraday_snapshot_freshness", "warn", snapshot_age_min <= 5, str(snapshot_age_min), "<=5", "Live snapshot should trail the latest raw minute by no more than five minutes")
    if latest_sec_minute and latest_idx_minute:
        delta_min = abs(int((latest_sec_minute - latest_idx_minute).total_seconds() // 60))
        _quality(run_id, "intraday_index_security_clock_skew", "warn", delta_min <= 2, str(delta_min), "<=2", "Index and security feeds should remain roughly aligned")
    for check in guard_status["checks"]:
        _quality(
            run_id,
            check["key"],
            check["severity"],
            check["passed"],
            str(check["observed"]),
            check["threshold"],
            dumps_json({"message": check["message"], "detail": check.get("detail", {})}),
        )
    emitted_alerts = _emit_live_guard_alerts(run_id, guard_status)

    return {
        "trade_date": trade_date.isoformat(),
        "index_code": index_code,
        "security_raw_count": sec_count,
        "index_raw_count": idx_count,
        "live_stock_count": live_count,
        "missing_prev_close": missing_prev_close,
        "beta_coverage": beta_coverage,
        "volume_profile_coverage": volume_profile_coverage,
        "stock_alpha_rows": stock_alpha_rows,
        "guard_status": guard_status,
        "alerts": emitted_alerts,
        "thresholds": {
            "live_source_max_delay_seconds": settings.live_source_max_delay_seconds,
            "raw_sync_max_lag_minutes": settings.raw_sync_max_lag_minutes,
            "snapshot_max_lag_minutes": settings.snapshot_max_lag_minutes,
            "market_open_live_stock_min_rows": settings.market_open_live_stock_min_rows,
        },
    }


def retention_cleanup() -> dict:  # type: ignore[override]
    settings = get_settings()
    today = datetime.now(timezone.utc).date()
    raw_cutoff = today - timedelta(days=settings.raw_retention_days)
    minute_cutoff = today - timedelta(days=settings.minute_retention_days)
    feature_cutoff = today - timedelta(days=settings.feature_retention_days)
    snapshot_cutoff = today - timedelta(days=settings.snapshot_retention_days)
    drop_monthly_partitions_older_than(raw_cutoff)

    execute("delete from nse_intraday.raw_security_1m where trade_date < %(cutoff)s", {"cutoff": minute_cutoff})
    execute("delete from nse_intraday.raw_index_1m where trade_date < %(cutoff)s", {"cutoff": minute_cutoff})
    execute("delete from nse_intraday.security_minute_feature where trade_date < %(cutoff)s", {"cutoff": minute_cutoff})
    execute("delete from nse_intraday.market_minute_feature where trade_date < %(cutoff)s", {"cutoff": minute_cutoff})
    execute("delete from nse_intraday.stock_minute_volume_profile where trade_date < %(cutoff)s", {"cutoff": minute_cutoff})
    execute("delete from nse_intraday.stock_intraday_live where trade_date < %(cutoff)s", {"cutoff": feature_cutoff})
    execute("delete from nse_intraday.market_session_summary where trade_date < %(cutoff)s", {"cutoff": feature_cutoff})
    execute("delete from nse_intraday.stock_daily_beta_profile where trade_date < %(cutoff)s", {"cutoff": feature_cutoff})
    execute("delete from nse_ops.dashboard_snapshot_intraday where trade_date < %(cutoff)s", {"cutoff": snapshot_cutoff})
    execute("delete from nse_ops.dashboard_section_intraday where trade_date < %(cutoff)s", {"cutoff": snapshot_cutoff})
    execute("delete from nse_ops.watchlist_snapshot_intraday where trade_date < %(cutoff)s", {"cutoff": snapshot_cutoff})
    execute("delete from nse_ops.export_manifest where trade_date < %(cutoff)s and export_scope like 'intraday%%'", {"cutoff": snapshot_cutoff})

    return {
        "raw_cutoff": raw_cutoff.isoformat(),
        "minute_cutoff": minute_cutoff.isoformat(),
        "feature_cutoff": feature_cutoff.isoformat(),
        "snapshot_cutoff": snapshot_cutoff.isoformat(),
    }


def build_stock_payload(symbol: str, trade_date: date | None = None) -> dict:  # type: ignore[override]
    trade_date = trade_date or latest_trade_date("nse_intraday.stock_intraday_live")
    stock_row = fetch_one(
        """
        select *
        from nse_intraday.stock_intraday_live
        where trade_date = %(trade_date)s and symbol = %(symbol)s
        """,
        {"trade_date": trade_date, "symbol": symbol},
    )
    if not stock_row:
        raise RuntimeError(f"No intraday stock payload found for trade_date={trade_date} symbol={symbol}")
    series_rows = fetch_all(
        """
        select
          minute_ts,
          last_price,
          change_pct_from_prev_close,
          change_pct_from_open,
          change_pct_15m,
          change_pct_30m,
          change_pct_60m,
          vwap_dev_bps,
          above_vwap,
          above_open_range_high,
          below_open_range_low,
          beta_20d,
          beta_60d,
          residual_return_5m_pct,
          residual_return_15m_pct,
          residual_return_30m_pct,
          residual_return_60m_pct,
          time_above_vwap_pct,
          vwap_hold_quality_score,
          relative_strength_persistence_score,
          range_efficiency_pct,
          minute_volume_ratio,
          cum_volume_vs_profile,
          volume_curve_surprise,
          close_location_quality_pct
        from nse_intraday.security_minute_feature
        where trade_date = %(trade_date)s and symbol = %(symbol)s
        order by minute_ts
        """,
        {"trade_date": trade_date, "symbol": symbol},
    )
    history_context = _stock_signal_history_context(stock_row["dominant_signal"])
    return {
        "trade_date": _iso(stock_row["trade_date"]),
        "as_of": _iso(stock_row["as_of_ts"]),
        "symbol": stock_row["symbol"],
        "sector_name": stock_row["sector_name"],
        "last_price": stock_row["last_price"],
        "change_pct_from_prev_close": stock_row["change_pct_from_prev_close"],
        "change_pct_from_open": stock_row["change_pct_from_open"],
        "dominant_signal": stock_row["dominant_signal"],
        "direction": stock_row["direction"],
        "accent_token": stock_row["accent_token"],
        "tags": stock_row["tags_json"],
        "conclusion": stock_row["conclusion"],
        "payload": stock_row["payload_json"],
        "explanation": stock_row["explanation_json"],
        "history_context": history_context,
        "series": [_serialize_row(row) for row in series_rows],
    }
