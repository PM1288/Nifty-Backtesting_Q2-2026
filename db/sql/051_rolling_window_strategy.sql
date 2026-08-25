BEGIN;

CREATE TABLE IF NOT EXISTS rolling_monthly.rolling_window_candidate (
  candidate_id text PRIMARY KEY,
  strategy_version text NOT NULL,
  symbol text NOT NULL,
  signal_date date NOT NULL,
  entry_date date NOT NULL,
  entry_price numeric,
  signal_close numeric,
  older_block_open numeric,
  older_block_close numeric,
  recent_block_open numeric,
  prior_week_open numeric,
  current_week_open numeric,
  previous_day_open numeric,
  signal_day_open numeric,
  path_end_date date,
  path_end_price numeric,
  observed_sessions integer NOT NULL DEFAULT 0,
  evaluation_status text NOT NULL,
  end_return_pct numeric,
  max_profit_pct numeric,
  max_drawdown_pct numeric,
  max_profit_date date,
  max_drawdown_date date,
  profit_per_share numeric,
  quantity_10000 integer,
  pnl_10000 numeric,
  max_profit_10000 numeric,
  max_drawdown_10000 numeric,
  hit_1_pct boolean,
  hit_3_pct boolean,
  hit_5_pct boolean,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  signal_source text NOT NULL,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(strategy_version,symbol,signal_date)
);
CREATE INDEX IF NOT EXISTS ix_rolling_window_candidate_signal
  ON rolling_monthly.rolling_window_candidate(strategy_version,signal_date DESC,symbol);
CREATE INDEX IF NOT EXISTS ix_rolling_window_candidate_entry
  ON rolling_monthly.rolling_window_candidate(entry_date DESC,symbol);
CREATE TABLE IF NOT EXISTS rolling_monthly.rolling_window_refresh (
  strategy_version text PRIMARY KEY,
  source_end_date date NOT NULL,
  universe_size integer NOT NULL,
  candidate_count integer NOT NULL,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE rolling_monthly.rolling_window_candidate IS
  'Persisted calendar-independent 5/30/60-session research. Independent from monthly anchors and OIIS.';
COMMIT;
