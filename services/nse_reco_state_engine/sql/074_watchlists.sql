-- Default watchlist definitions

INSERT INTO nse_reco.watchlist_def (slug, name, description, query_kind, query_params)
VALUES
  ('reco-buy-now', 'Buy now', 'Top candidates where state+signal align.', 'action_rank', '{"action":"buy_now","limit":25}'::jsonb),
  ('reco-wait-pullback', 'Wait for pullback', 'Strong setups but prefer better entry.', 'action_rank', '{"action":"wait_for_pullback","limit":25}'::jsonb),
  ('reco-watch-only', 'Watch only', 'Informational watchlist; do not act yet.', 'action_rank', '{"action":"watch_only","limit":25}'::jsonb),
  ('reco-anomaly-review', 'Anomaly review required', 'Abnormal behavior; needs human review.', 'action_rank', '{"action":"anomaly_review_required","limit":50}'::jsonb),
  ('reco-residual-leaders', 'Residual leaders', 'Stocks leading after removing index effect.', 'metric_rank', '{"metric":"residual_ret_30m_pct","limit":25}'::jsonb),
  ('reco-headline-spikes', 'Headline spikes', 'Large move with noisy path / low efficiency.', 'flag', '{"flag":"headline_spike","limit":25}'::jsonb)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  query_kind = EXCLUDED.query_kind,
  query_params = EXCLUDED.query_params;
