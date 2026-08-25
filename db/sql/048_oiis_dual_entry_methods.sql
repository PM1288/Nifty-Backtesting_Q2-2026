BEGIN;

ALTER TABLE oiis_live.selection_run
  DROP CONSTRAINT IF EXISTS selection_run_auto_paper_status_check;
ALTER TABLE oiis_live.selection_run
  ADD CONSTRAINT selection_run_auto_paper_status_check CHECK (auto_paper_status IN
    ('NOT_EVALUATED','BELOW_THRESHOLD','INELIGIBLE','STALE','DUPLICATE','SUBMITTED','FAILED','MONITORING'));

ALTER TABLE oiis_live.entry_claim
  ADD COLUMN IF NOT EXISTS entry_method text;
UPDATE oiis_live.entry_claim
SET entry_method=coalesce(nullif(request_payload->'metadata'->>'entry_rule',''),'RSI_WILLR')
WHERE entry_method IS NULL;
ALTER TABLE oiis_live.entry_claim
  ALTER COLUMN entry_method SET DEFAULT 'RSI_WILLR',
  ALTER COLUMN entry_method SET NOT NULL;
ALTER TABLE oiis_live.entry_claim
  DROP CONSTRAINT IF EXISTS entry_claim_policy_id_trade_date_symbol_key;
ALTER TABLE oiis_live.entry_claim
  DROP CONSTRAINT IF EXISTS entry_claim_entry_method_check;
ALTER TABLE oiis_live.entry_claim
  ADD CONSTRAINT entry_claim_entry_method_check CHECK (entry_method IN
    ('RSI_WILLR','PRICE_MOMENTUM_1D_1H_15M','QUALITY_SUM_THRESHOLD'));
CREATE UNIQUE INDEX IF NOT EXISTS oiis_live_entry_claim_method_uidx
  ON oiis_live.entry_claim(policy_id,trade_date,symbol,entry_method);

ALTER TABLE oiis_live.intraday_evaluation
  ADD COLUMN IF NOT EXISTS entry_method text;
UPDATE oiis_live.intraday_evaluation
SET entry_method='RSI_WILLR'
WHERE entry_method IS NULL;
ALTER TABLE oiis_live.intraday_evaluation
  ALTER COLUMN entry_method SET DEFAULT 'RSI_WILLR',
  ALTER COLUMN entry_method SET NOT NULL,
  ADD COLUMN IF NOT EXISTS previous_daily_close numeric(18,8),
  ADD COLUMN IF NOT EXISTS current_hour_close numeric(18,8),
  ADD COLUMN IF NOT EXISTS previous_hour_close numeric(18,8),
  ADD COLUMN IF NOT EXISTS current_15m_close numeric(18,8),
  ADD COLUMN IF NOT EXISTS previous_15m_close numeric(18,8),
  ADD COLUMN IF NOT EXISTS daily_price_pass boolean,
  ADD COLUMN IF NOT EXISTS hourly_price_pass boolean,
  ADD COLUMN IF NOT EXISTS fifteen_minute_price_pass boolean;
ALTER TABLE oiis_live.intraday_evaluation
  DROP CONSTRAINT IF EXISTS intraday_evaluation_watchlist_item_id_source_bar_id_key;
ALTER TABLE oiis_live.intraday_evaluation
  DROP CONSTRAINT IF EXISTS intraday_evaluation_entry_method_check;
ALTER TABLE oiis_live.intraday_evaluation
  ADD CONSTRAINT intraday_evaluation_entry_method_check CHECK (entry_method IN
    ('RSI_WILLR','PRICE_MOMENTUM_1D_1H_15M'));
CREATE UNIQUE INDEX IF NOT EXISTS oiis_live_intraday_evaluation_method_uidx
  ON oiis_live.intraday_evaluation(watchlist_item_id,source_bar_id,entry_method);

CREATE OR REPLACE VIEW oiis_live.v_current_watchlist AS
SELECT w.*, c.signal_date, c.sector, c.data_quality, c.data_permission,
       c.ofactor, c.xfactor_snapshot, c.directional_edge, c.reference_price,
       c.component_scores, c.market_context, c.reason_codes,
       entry_state.entry_status, entry_state.signal_ts, entry_state.paper_trade_group_id,
       c.ofactor_level, c.directional_edge_level, c.extension_level,
       c.volume_level, c.feature_values, c.gate_evidence, c.universe_flags,
       c.direction, c.structural_direction, c.session_direction,
       c.direction_state, c.session_direction_score, c.opportunity_rank,
       c.execution_rank, c.data_coverage, c.setup_id, c.setup_state,
       c.quality_score, c.auto_paper_eligible, c.auto_paper_selected,
       entry_state.entry_method_statuses
FROM oiis_live.watchlist_item w
LEFT JOIN oiis_live.daily_candidate c ON c.candidate_id=w.candidate_id
LEFT JOIN LATERAL (
  SELECT max(e.signal_ts) AS signal_ts,
         (array_agg(e.status ORDER BY e.updated_at DESC))[1] AS entry_status,
         (array_agg(e.paper_trade_group_id ORDER BY e.updated_at DESC)
           FILTER (WHERE e.paper_trade_group_id IS NOT NULL))[1] AS paper_trade_group_id,
         jsonb_object_agg(e.entry_method,e.status ORDER BY e.entry_method) AS entry_method_statuses
  FROM oiis_live.entry_claim e
  WHERE e.policy_id=w.policy_id AND e.trade_date=w.trade_date AND e.symbol=w.symbol
) entry_state ON true;

COMMIT;
