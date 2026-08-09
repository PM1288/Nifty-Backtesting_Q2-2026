BEGIN;

CREATE SCHEMA IF NOT EXISTS oiis_live;

CREATE TABLE IF NOT EXISTS oiis_live.policy_version (
  policy_id text NOT NULL,
  version text NOT NULL,
  status text NOT NULL CHECK (status IN ('SHADOW','PAPER','DISABLED')),
  config jsonb NOT NULL,
  config_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (policy_id, version)
);

CREATE TABLE IF NOT EXISTS oiis_live.selection_run (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id text NOT NULL,
  policy_version text NOT NULL,
  signal_date date NOT NULL,
  trade_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('RUNNING','COMPLETED','FAILED','BLOCKED_DATA')),
  source_max_eod_date date,
  source_max_minute_ts timestamptz,
  requested_symbols integer NOT NULL DEFAULT 0,
  evaluated_symbols integer NOT NULL DEFAULT 0,
  selected_symbols integer NOT NULL DEFAULT 0,
  qualified_symbols integer NOT NULL DEFAULT 0,
  error_detail text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  result_hash text,
  UNIQUE (policy_id, policy_version, signal_date, trade_date)
);

CREATE TABLE IF NOT EXISTS oiis_live.daily_candidate (
  candidate_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES oiis_live.selection_run(run_id),
  policy_id text NOT NULL,
  policy_version text NOT NULL,
  signal_date date NOT NULL,
  trade_date date NOT NULL,
  symbol text NOT NULL,
  instrument_token text,
  sector text,
  direction text NOT NULL DEFAULT 'LONG' CHECK (direction IN ('LONG','SHORT','NEUTRAL')),
  daily_level text NOT NULL CHECK (daily_level IN ('HIGH','MEDIUM','LOW','NO_CANDIDATE')),
  canonical_status text NOT NULL,
  selected boolean NOT NULL DEFAULT false,
  rank integer,
  data_quality numeric(10,4),
  data_permission text,
  ofactor numeric(10,4),
  xfactor_snapshot numeric(10,4),
  directional_edge numeric(10,4),
  rsi14 numeric(18,8),
  willr14 numeric(18,8),
  ema61 numeric(18,8),
  macd_line numeric(18,8),
  atr14 numeric(18,8),
  volume_vs_sma20 numeric(18,8),
  reference_price numeric(18,8),
  buy_limit numeric(18,8),
  no_chase_price numeric(18,8),
  component_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  market_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  condition_results jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at timestamptz NOT NULL,
  available_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, symbol)
);
CREATE INDEX IF NOT EXISTS oiis_live_candidate_trade_date_idx
  ON oiis_live.daily_candidate(trade_date, selected, rank);
ALTER TABLE oiis_live.daily_candidate DROP CONSTRAINT IF EXISTS daily_candidate_direction_check;
ALTER TABLE oiis_live.daily_candidate ADD CONSTRAINT daily_candidate_direction_check
  CHECK (direction IN ('LONG','SHORT','NEUTRAL'));

CREATE TABLE IF NOT EXISTS oiis_live.watchlist_item (
  watchlist_item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid REFERENCES oiis_live.daily_candidate(candidate_id),
  policy_id text NOT NULL,
  trade_date date NOT NULL,
  symbol text NOT NULL,
  instrument_token text,
  source text NOT NULL CHECK (source IN ('DAILY_SELECTION','MANUAL')),
  active boolean NOT NULL DEFAULT true,
  entry_enabled boolean NOT NULL DEFAULT true,
  daily_level text,
  canonical_status text,
  rank integer,
  buy_limit numeric(18,8),
  no_chase_price numeric(18,8),
  rsi_max numeric(10,4) NOT NULL DEFAULT 30,
  willr_max numeric(10,4) NOT NULL DEFAULT -80,
  notes text,
  revision integer NOT NULL DEFAULT 1,
  created_by text NOT NULL DEFAULT 'oiis-live',
  updated_by text NOT NULL DEFAULT 'oiis-live',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (policy_id, trade_date, symbol)
);
CREATE INDEX IF NOT EXISTS oiis_live_watchlist_active_idx
  ON oiis_live.watchlist_item(trade_date, active, entry_enabled);

CREATE TABLE IF NOT EXISTS oiis_live.intraday_evaluation (
  evaluation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_item_id uuid NOT NULL REFERENCES oiis_live.watchlist_item(watchlist_item_id),
  bar_ts timestamptz NOT NULL,
  source_bar_id text NOT NULL,
  close_price numeric(18,8) NOT NULL,
  next_open_price numeric(18,8),
  rsi14 numeric(18,8),
  willr14 numeric(18,8),
  rsi_pass boolean NOT NULL,
  willr_pass boolean NOT NULL,
  price_limit_pass boolean NOT NULL DEFAULT true,
  eligible boolean NOT NULL,
  decision text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (watchlist_item_id, source_bar_id)
);

CREATE TABLE IF NOT EXISTS oiis_live.entry_claim (
  entry_claim_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_item_id uuid NOT NULL REFERENCES oiis_live.watchlist_item(watchlist_item_id),
  policy_id text NOT NULL,
  trade_date date NOT NULL,
  symbol text NOT NULL,
  signal_ts timestamptz NOT NULL,
  source_bar_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('CLAIMED','SUBMITTING','ACCEPTED','FILLED','FAILED_RETRYABLE','REJECTED')),
  idempotency_key text NOT NULL,
  client_event_id text NOT NULL,
  paper_trade_intent_id uuid,
  paper_trade_group_id uuid,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  request_payload jsonb NOT NULL,
  response_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (policy_id, trade_date, symbol),
  UNIQUE (idempotency_key)
);

CREATE TABLE IF NOT EXISTS oiis_live.command_queue (
  command_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  command_type text NOT NULL CHECK (command_type IN ('RUN_SELECTION','REFRESH_MARKET_DATA','RETRY_ENTRY','RECONCILE')),
  requested_by text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','COMPLETED','FAILED')),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS oiis_live_command_claim_idx
  ON oiis_live.command_queue(status, available_at);

CREATE TABLE IF NOT EXISTS oiis_live.service_heartbeat (
  service_name text PRIMARY KEY,
  status text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_success_at timestamptz,
  last_error_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oiis_live.error_outbox (
  error_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('WARNING','ERROR','CRITICAL')),
  error_class text NOT NULL,
  message text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','DELIVERED','DEAD')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dedupe_key)
);
CREATE INDEX IF NOT EXISTS oiis_live_error_claim_idx ON oiis_live.error_outbox(status, available_at);

CREATE TABLE IF NOT EXISTS oiis_live.historical_run (
  historical_run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL,
  candidate_count integer NOT NULL DEFAULT 0,
  qualified_candidate_count integer NOT NULL DEFAULT 0,
  triggered_trade_count integer NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  artifact_path text,
  result_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS oiis_live.historical_trade (
  historical_run_id uuid NOT NULL REFERENCES oiis_live.historical_run(historical_run_id),
  symbol text NOT NULL,
  signal_date date NOT NULL,
  entry_ts timestamptz NOT NULL,
  entry_price numeric(18,8) NOT NULL,
  rsi14 numeric(18,8) NOT NULL,
  willr14 numeric(18,8) NOT NULL,
  exit_state text NOT NULL,
  exit_ts timestamptz,
  exit_price numeric(18,8),
  gross_pnl numeric(18,4),
  tax_provision numeric(18,4),
  after_tax_pnl numeric(18,4),
  outcomes jsonb NOT NULL,
  PRIMARY KEY (historical_run_id, symbol, signal_date)
);
CREATE INDEX IF NOT EXISTS oiis_live_historical_trade_date_idx
  ON oiis_live.historical_trade(signal_date, symbol);

CREATE OR REPLACE VIEW oiis_live.v_current_watchlist AS
SELECT w.*, c.signal_date, c.sector, c.data_quality, c.data_permission,
       c.ofactor, c.xfactor_snapshot, c.directional_edge, c.reference_price,
       c.component_scores, c.market_context, c.reason_codes,
       e.status AS entry_status, e.signal_ts, e.paper_trade_group_id
FROM oiis_live.watchlist_item w
LEFT JOIN oiis_live.daily_candidate c ON c.candidate_id=w.candidate_id
LEFT JOIN oiis_live.entry_claim e
  ON e.policy_id=w.policy_id AND e.trade_date=w.trade_date AND e.symbol=w.symbol;

CREATE OR REPLACE VIEW oiis_live.v_service_diagnostics AS
SELECT service_name, status, detail, last_success_at, last_error_at, updated_at,
       extract(epoch FROM (now()-updated_at))::integer AS age_seconds
FROM oiis_live.service_heartbeat;

COMMIT;
