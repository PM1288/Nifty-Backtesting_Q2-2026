-- Operational logging

CREATE TABLE IF NOT EXISTS nse_reco_ops.job_run (
  id BIGSERIAL PRIMARY KEY,
  job_name TEXT NOT NULL,
  trade_date DATE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'RUNNING',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_code TEXT,
  error_detail TEXT
);

CREATE INDEX IF NOT EXISTS idx_reco_job_run_job_date ON nse_reco_ops.job_run(job_name, trade_date, started_at DESC);

CREATE TABLE IF NOT EXISTS nse_reco_ops.job_step_run (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES nse_reco_ops.job_run(id) ON DELETE CASCADE,
  step_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'RUNNING',
  rows_written INTEGER,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_code TEXT,
  error_detail TEXT
);

CREATE INDEX IF NOT EXISTS idx_reco_job_step_run_run ON nse_reco_ops.job_step_run(run_id);

CREATE TABLE IF NOT EXISTS nse_reco_ops.quality_check_result (
  id BIGSERIAL PRIMARY KEY,
  trade_date DATE,
  check_name TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reco_qc_trade_date ON nse_reco_ops.quality_check_result(trade_date, created_at DESC);

-- Core reco tables

CREATE TABLE IF NOT EXISTS nse_reco.market_regime_snapshot (
  trade_date DATE NOT NULL,
  index_code TEXT NOT NULL,
  regime TEXT NOT NULL,
  direction TEXT NOT NULL,
  accent_token TEXT NOT NULL,
  score NUMERIC(8,3) NOT NULL,
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (trade_date, index_code)
);

CREATE TABLE IF NOT EXISTS nse_reco.anomaly_event (
  id BIGSERIAL PRIMARY KEY,
  trade_date DATE NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  severity TEXT NOT NULL,
  score NUMERIC(10,4),
  reason TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trade_date, ts, scope, key, reason)
);

CREATE INDEX IF NOT EXISTS idx_anomaly_date_scope ON nse_reco.anomaly_event(trade_date, scope, created_at DESC);

-- Recommendation snapshot (latest as-of minute; updated every run)
CREATE TABLE IF NOT EXISTS nse_reco.recommendation_snapshot (
  trade_date DATE NOT NULL,
  index_code TEXT NOT NULL,
  horizon TEXT NOT NULL,
  symbol TEXT NOT NULL,
  asof_ts TIMESTAMPTZ NOT NULL,
  signal_family TEXT NOT NULL,
  signal_quality NUMERIC(8,3) NOT NULL,
  regime_fit NUMERIC(8,3) NOT NULL,
  historical_edge NUMERIC(8,3) NOT NULL,
  risk_penalty NUMERIC(8,3) NOT NULL,
  anomaly_penalty NUMERIC(8,3) NOT NULL,
  final_score NUMERIC(8,3) NOT NULL,
  action TEXT NOT NULL,
  direction TEXT NOT NULL,
  accent_token TEXT NOT NULL,
  arrow TEXT NOT NULL,
  explanation JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (trade_date, index_code, horizon, symbol)
);

CREATE INDEX IF NOT EXISTS idx_reco_date_action ON nse_reco.recommendation_snapshot(trade_date, index_code, action, final_score DESC);

CREATE TABLE IF NOT EXISTS nse_reco.bucket_scorecard (
  horizon TEXT NOT NULL,
  regime TEXT NOT NULL,
  signal_family TEXT NOT NULL,
  sample_count INTEGER NOT NULL,
  win_rate NUMERIC(8,4) NOT NULL,
  avg_return_pct NUMERIC(10,4) NOT NULL,
  p50_return_pct NUMERIC(10,4) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (horizon, regime, signal_family)
);

CREATE TABLE IF NOT EXISTS nse_reco.watchlist_def (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  query_kind TEXT NOT NULL,
  query_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nse_reco.watchlist_snapshot (
  trade_date DATE NOT NULL,
  index_code TEXT NOT NULL,
  slug TEXT NOT NULL REFERENCES nse_reco.watchlist_def(slug) ON DELETE CASCADE,
  asof_ts TIMESTAMPTZ NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (trade_date, index_code, slug)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_date ON nse_reco.watchlist_snapshot(trade_date, index_code);

-- Exports

CREATE TABLE IF NOT EXISTS nse_exports.export_manifest (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  trade_date DATE,
  kind TEXT NOT NULL,
  format TEXT NOT NULL,
  path TEXT NOT NULL,
  params JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_export_manifest_created ON nse_exports.export_manifest(created_at DESC);

-- Minute-of-day baselines (computed from historical data; improves over time)

CREATE TABLE IF NOT EXISTS nse_reco.stock_minute_profile (
  symbol TEXT NOT NULL,
  minute_of_day INTEGER NOT NULL,
  mean_volume NUMERIC(18,4) NOT NULL,
  std_volume NUMERIC(18,4) NOT NULL,
  sample_count INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, minute_of_day)
);

CREATE TABLE IF NOT EXISTS nse_reco.market_minute_profile (
  index_code TEXT NOT NULL,
  minute_of_day INTEGER NOT NULL,
  mean_breadth_up_pct NUMERIC(10,4) NOT NULL,
  std_breadth_up_pct NUMERIC(10,4) NOT NULL,
  mean_dispersion_pctile NUMERIC(10,4) NOT NULL,
  std_dispersion_pctile NUMERIC(10,4) NOT NULL,
  sample_count INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (index_code, minute_of_day)
);
