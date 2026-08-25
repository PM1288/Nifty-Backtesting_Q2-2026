BEGIN;

ALTER TABLE oiis_live.selection_run
  ADD COLUMN IF NOT EXISTS previous_run_id uuid REFERENCES oiis_live.selection_run(run_id),
  ADD COLUMN IF NOT EXISTS auto_paper_threshold numeric(10,4) NOT NULL DEFAULT 185,
  ADD COLUMN IF NOT EXISTS auto_paper_candidate_id uuid,
  ADD COLUMN IF NOT EXISTS auto_paper_status text NOT NULL DEFAULT 'NOT_EVALUATED',
  ADD COLUMN IF NOT EXISTS auto_paper_eligible_symbols integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_paper_submitted_symbols integer NOT NULL DEFAULT 0;

ALTER TABLE oiis_live.selection_run
  DROP CONSTRAINT IF EXISTS selection_run_auto_paper_status_check;
ALTER TABLE oiis_live.selection_run
  ADD CONSTRAINT selection_run_auto_paper_status_check CHECK (auto_paper_status IN
    ('NOT_EVALUATED','BELOW_THRESHOLD','INELIGIBLE','STALE','DUPLICATE','SUBMITTED','FAILED'));

ALTER TABLE oiis_live.daily_candidate
  ADD COLUMN IF NOT EXISTS quality_score numeric(12,4),
  ADD COLUMN IF NOT EXISTS auto_paper_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_paper_selected boolean NOT NULL DEFAULT false;

UPDATE oiis_live.daily_candidate
SET quality_score=coalesce(ofactor,0)+coalesce(xfactor_snapshot,0)+coalesce(data_quality,0)
WHERE quality_score IS NULL;

ALTER TABLE oiis_live.selection_run
  DROP CONSTRAINT IF EXISTS selection_run_auto_paper_candidate_fk;
ALTER TABLE oiis_live.selection_run
  ADD CONSTRAINT selection_run_auto_paper_candidate_fk
  FOREIGN KEY (auto_paper_candidate_id) REFERENCES oiis_live.daily_candidate(candidate_id);

CREATE TABLE IF NOT EXISTS oiis_live.candidate_run_change (
  run_id uuid NOT NULL REFERENCES oiis_live.selection_run(run_id),
  previous_run_id uuid REFERENCES oiis_live.selection_run(run_id),
  candidate_id uuid NOT NULL REFERENCES oiis_live.daily_candidate(candidate_id),
  trade_date date NOT NULL,
  symbol text NOT NULL,
  direction text NOT NULL,
  previous_direction text,
  ofactor numeric(10,4),
  previous_ofactor numeric(10,4),
  ofactor_delta numeric(10,4),
  xfactor numeric(10,4),
  previous_xfactor numeric(10,4),
  xfactor_delta numeric(10,4),
  data_quality numeric(10,4),
  previous_data_quality numeric(10,4),
  data_quality_delta numeric(10,4),
  quality_score numeric(12,4) NOT NULL,
  previous_quality_score numeric(12,4),
  quality_score_delta numeric(12,4),
  opportunity_rank integer,
  previous_opportunity_rank integer,
  change_kind text NOT NULL CHECK (change_kind IN ('NEW','IMPROVED','DECLINED','UNCHANGED')),
  crossed_above_threshold boolean NOT NULL DEFAULT false,
  auto_paper_selected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id,symbol)
);
CREATE INDEX IF NOT EXISTS candidate_run_change_trade_idx
  ON oiis_live.candidate_run_change(trade_date,run_id);
CREATE INDEX IF NOT EXISTS candidate_run_change_quality_idx
  ON oiis_live.candidate_run_change(run_id,quality_score DESC);

CREATE OR REPLACE VIEW oiis_live.v_current_watchlist AS
SELECT w.*, c.signal_date, c.sector, c.data_quality, c.data_permission,
       c.ofactor, c.xfactor_snapshot, c.directional_edge, c.reference_price,
       c.component_scores, c.market_context, c.reason_codes,
       e.status AS entry_status, e.signal_ts, e.paper_trade_group_id,
       c.ofactor_level, c.directional_edge_level, c.extension_level,
       c.volume_level, c.feature_values, c.gate_evidence, c.universe_flags,
       c.direction, c.structural_direction, c.session_direction,
       c.direction_state, c.session_direction_score, c.opportunity_rank,
       c.execution_rank, c.data_coverage, c.setup_id, c.setup_state,
       c.quality_score, c.auto_paper_eligible, c.auto_paper_selected
FROM oiis_live.watchlist_item w
LEFT JOIN oiis_live.daily_candidate c ON c.candidate_id=w.candidate_id
LEFT JOIN oiis_live.entry_claim e
  ON e.policy_id=w.policy_id AND e.trade_date=w.trade_date AND e.symbol=w.symbol;

COMMIT;
