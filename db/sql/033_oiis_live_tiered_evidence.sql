BEGIN;

CREATE TABLE IF NOT EXISTS oiis_live.universe_member (
  symbol text PRIMARY KEY,
  is_fno boolean NOT NULL DEFAULT false,
  is_nifty50 boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  source text NOT NULL,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE oiis_live.selection_run
  ADD COLUMN IF NOT EXISTS run_slot text NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN IF NOT EXISTS as_of_ts timestamptz;

ALTER TABLE oiis_live.selection_run
  DROP CONSTRAINT IF EXISTS selection_run_policy_id_policy_version_signal_date_trade_da_key;
CREATE UNIQUE INDEX IF NOT EXISTS oiis_live_selection_run_slot_uidx
  ON oiis_live.selection_run(policy_id,policy_version,signal_date,trade_date,run_slot);

ALTER TABLE oiis_live.daily_candidate
  ADD COLUMN IF NOT EXISTS ofactor_level text,
  ADD COLUMN IF NOT EXISTS directional_edge_level text,
  ADD COLUMN IF NOT EXISTS extension_level text,
  ADD COLUMN IF NOT EXISTS volume_level text,
  ADD COLUMN IF NOT EXISTS volume_percentile_90 numeric(18,8),
  ADD COLUMN IF NOT EXISTS failed_gate_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS blocking_gate_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recommended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recommendation_rank integer,
  ADD COLUMN IF NOT EXISTS feature_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS gate_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS universe_flags jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS oiis_live_candidate_recommendation_idx
  ON oiis_live.daily_candidate(trade_date,recommended,recommendation_rank);
CREATE INDEX IF NOT EXISTS oiis_live_candidate_failure_count_idx
  ON oiis_live.daily_candidate(trade_date,blocking_gate_count,failed_gate_count);

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
       c.volume_level, c.feature_values, c.gate_evidence, c.universe_flags
FROM oiis_live.watchlist_item w
LEFT JOIN oiis_live.daily_candidate c ON c.candidate_id=w.candidate_id
LEFT JOIN oiis_live.entry_claim e
  ON e.policy_id=w.policy_id AND e.trade_date=w.trade_date AND e.symbol=w.symbol;

COMMIT;
