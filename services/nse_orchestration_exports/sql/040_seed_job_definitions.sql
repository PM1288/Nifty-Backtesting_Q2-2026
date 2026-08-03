insert into nse_ops.job_definition (job_key, title, cron_expr, enabled, timeout_sec, command_text, description)
values
  ('ingest_recent', 'Ingest recent daily files', null, true, 5400, null, 'Loads the last 7 days if missing'),
  ('refresh_features', 'Refresh compact features', null, true, 5400, null, 'Rebuilds compact daily features'),
  ('refresh_summaries', 'Refresh dashboard summaries', null, true, 3600, null, 'Populates dashboard snapshot tables'),
  ('refresh_watchlists', 'Refresh watchlist snapshots', null, true, 3600, null, 'Builds latest system and manual watchlists'),
  ('refresh_exports', 'Refresh export cache', null, true, 3600, null, 'Builds JSON/CSV exports and manifest rows'),
  ('refresh_quality', 'Run quality checks', null, true, 1800, null, 'Evaluates pipeline completeness and freshness'),
  ('retention', 'Retention cleanup', null, true, 3600, null, 'Purges stale export files and old ops logs'),
  ('weekly_history', 'Refresh historical learner metrics', null, true, 7200, null, 'Recomputes historical signal performance')
on conflict (job_key) do nothing;
