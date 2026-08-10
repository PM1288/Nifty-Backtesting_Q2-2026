BEGIN;

ALTER TABLE oiis_live.selection_run
  ADD COLUMN IF NOT EXISTS decision_as_of timestamptz,
  ADD COLUMN IF NOT EXISTS execution_timestamp timestamptz,
  ADD COLUMN IF NOT EXISTS requested_universe text,
  ADD COLUMN IF NOT EXISTS universe_counts jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE oiis_live.selection_run
SET decision_as_of = COALESCE(decision_as_of,as_of_ts),
    execution_timestamp = COALESCE(execution_timestamp,started_at),
    requested_universe = COALESCE(requested_universe,'LEGACY_UNSPECIFIED')
WHERE decision_as_of IS NULL
   OR execution_timestamp IS NULL
   OR requested_universe IS NULL;

ALTER TABLE oiis_live.daily_candidate
  ADD COLUMN IF NOT EXISTS structural_direction text,
  ADD COLUMN IF NOT EXISTS session_direction text,
  ADD COLUMN IF NOT EXISTS direction_state text,
  ADD COLUMN IF NOT EXISTS session_direction_score numeric(10,4),
  ADD COLUMN IF NOT EXISTS opportunity_rank integer,
  ADD COLUMN IF NOT EXISTS execution_rank integer,
  ADD COLUMN IF NOT EXISTS data_coverage numeric(10,6),
  ADD COLUMN IF NOT EXISTS setup_id text,
  ADD COLUMN IF NOT EXISTS setup_state text;

CREATE INDEX IF NOT EXISTS oiis_live_candidate_opportunity_rank_idx
  ON oiis_live.daily_candidate(trade_date,opportunity_rank);
CREATE INDEX IF NOT EXISTS oiis_live_candidate_direction_state_idx
  ON oiis_live.daily_candidate(trade_date,direction,direction_state);

-- PostgreSQL expands SELECT * when a view is created, so rebuild the view to
-- expose the additive V3 columns while preserving the existing latest-run rule.
CREATE OR REPLACE VIEW oiis_live.v_latest_daily_candidate AS
SELECT c.*
FROM oiis_live.daily_candidate c
JOIN LATERAL (
  SELECT r.run_id
  FROM oiis_live.selection_run r
  WHERE r.trade_date=c.trade_date AND r.status='COMPLETED'
  ORDER BY r.completed_at DESC NULLS LAST,r.started_at DESC
  LIMIT 1
) latest ON latest.run_id=c.run_id;

CREATE OR REPLACE VIEW oiis_live.v_current_watchlist AS
SELECT w.*, c.signal_date, c.sector, c.data_quality, c.data_permission,
       c.ofactor, c.xfactor_snapshot, c.directional_edge, c.reference_price,
       c.component_scores, c.market_context, c.reason_codes,
       e.status AS entry_status, e.signal_ts, e.paper_trade_group_id,
       c.ofactor_level, c.directional_edge_level, c.extension_level,
       c.volume_level, c.feature_values, c.gate_evidence, c.universe_flags,
       c.direction, c.structural_direction, c.session_direction,
       c.direction_state, c.session_direction_score, c.opportunity_rank,
       c.execution_rank, c.data_coverage, c.setup_id, c.setup_state
FROM oiis_live.watchlist_item w
LEFT JOIN oiis_live.daily_candidate c ON c.candidate_id=w.candidate_id
LEFT JOIN oiis_live.entry_claim e
  ON e.policy_id=w.policy_id AND e.trade_date=w.trade_date AND e.symbol=w.symbol;

COMMIT;
