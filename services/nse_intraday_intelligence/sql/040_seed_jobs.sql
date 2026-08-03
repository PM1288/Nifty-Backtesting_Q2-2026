insert into nse_ops.job_definition (job_key, title, cron_expr, enabled, timeout_sec, command_text, description)
values
  ('intraday_sync_raw', 'Intraday sync raw minute bars', '*/1 9-15 * * 1-5', true, 600, 'python -m nse_intraday_intelligence.manual_jobs sync-raw', 'Syncs raw 1-minute index and stock bars from integration views'),
  ('intraday_refresh_features', 'Intraday refresh features', '*/1 9-15 * * 1-5', true, 900, 'python -m nse_intraday_intelligence.manual_jobs refresh-features', 'Refreshes minute-level stock and market features'),
  ('intraday_refresh_dashboard', 'Intraday refresh dashboard', '*/1 9-15 * * 1-5', true, 900, 'python -m nse_intraday_intelligence.manual_jobs refresh-dashboard', 'Builds live market state, sections, and stock live tables'),
  ('intraday_refresh_watchlists', 'Intraday refresh watchlists', '*/2 9-15 * * 1-5', true, 900, 'python -m nse_intraday_intelligence.manual_jobs refresh-watchlists', 'Refreshes intraday watchlist snapshots'),
  ('intraday_run_quality', 'Intraday quality checks', '*/5 9-15 * * 1-5', true, 600, 'python -m nse_intraday_intelligence.manual_jobs run-quality-checks', 'Runs data freshness and integrity checks'),
  ('intraday_finalize_session', 'Intraday finalize session', '40 15 * * 1-5', true, 900, 'python -m nse_intraday_intelligence.manual_jobs finalize-session', 'Finalizes the session summary after market close'),
  ('intraday_retention', 'Intraday retention cleanup', '25 2 * * *', true, 1200, 'python -m nse_intraday_intelligence.manual_jobs retention', 'Drops or deletes old raw partitions and old live snapshots'),
  ('intraday_backfill_history', 'Intraday backfill history', '20 3 * * 6', true, 7200, 'python -m nse_intraday_intelligence.manual_jobs backfill-history --days 90', 'Replays recent history to refresh compact features and state summaries')
on conflict (job_key) do update
set title = excluded.title,
    cron_expr = excluded.cron_expr,
    enabled = excluded.enabled,
    timeout_sec = excluded.timeout_sec,
    command_text = excluded.command_text,
    description = excluded.description,
    updated_at = now();
