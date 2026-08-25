BEGIN;

CREATE TABLE IF NOT EXISTS research.trendlyne_recommendation_evaluation (
  report_id text PRIMARY KEY REFERENCES research.trendlyne_reports(report_id) ON DELETE CASCADE,
  report_date date NOT NULL,
  symbol text NOT NULL,
  stock_name text NOT NULL,
  research_house text NOT NULL,
  recommendation text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('LONG','SHORT','NONE')),
  recommended_price numeric,
  target_price numeric,
  target_return_pct numeric,
  entry_session_date date,
  entry_price numeric,
  entry_price_source text,
  latest_session_date date,
  latest_price numeric,
  observed_sessions integer NOT NULL DEFAULT 0,
  target_eligible boolean NOT NULL DEFAULT false,
  target_hit boolean,
  target_hit_date date,
  target_hit_session integer,
  d5_sessions integer NOT NULL DEFAULT 0,
  d5_status text NOT NULL,
  d5_end_return_pct numeric,
  d5_max_profit_pct numeric,
  d5_max_drawdown_pct numeric,
  d5_max_profit_date date,
  d5_max_drawdown_date date,
  d30_sessions integer NOT NULL DEFAULT 0,
  d30_status text NOT NULL,
  d30_end_return_pct numeric,
  d30_max_profit_pct numeric,
  d30_max_drawdown_pct numeric,
  d30_max_profit_date date,
  d30_max_drawdown_date date,
  current_return_pct numeric,
  evaluation_status text NOT NULL,
  data_quality_status text NOT NULL,
  data_quality_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  report_url text,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_trendlyne_reco_eval_report_date
  ON research.trendlyne_recommendation_evaluation(report_date DESC);
CREATE INDEX IF NOT EXISTS ix_trendlyne_reco_eval_house
  ON research.trendlyne_recommendation_evaluation(research_house, report_date DESC);
CREATE INDEX IF NOT EXISTS ix_trendlyne_reco_eval_symbol
  ON research.trendlyne_recommendation_evaluation(symbol, report_date DESC);
CREATE INDEX IF NOT EXISTS ix_trendlyne_reco_eval_status
  ON research.trendlyne_recommendation_evaluation(evaluation_status, direction);

COMMENT ON TABLE research.trendlyne_recommendation_evaluation IS
  'Derived, reproducible 5-session and 30-session price-path evidence for Trendlyne research reports; refreshed after each successful scraper run.';

COMMIT;
