BEGIN;

CREATE SCHEMA IF NOT EXISTS ai_stock_research;

CREATE TABLE IF NOT EXISTS ai_stock_research.prompt_version (
  prompt_version text PRIMARY KEY,
  prompt_sha256 text NOT NULL UNIQUE,
  prompt_text text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RETIRED')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_stock_research.evaluation (
  evaluation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_date date NOT NULL,
  symbol text NOT NULL,
  company_name text,
  exchange text NOT NULL DEFAULT 'NSE',
  direction text,
  strategy_status text,
  ofactor numeric(12,4),
  xfactor numeric(12,4),
  reference_price numeric(18,8),
  source_data_through date,
  history_session_count integer NOT NULL,
  input_snapshot jsonb NOT NULL,
  input_sha256 text NOT NULL,
  prompt_version text NOT NULL REFERENCES ai_stock_research.prompt_version(prompt_version),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','RUNNING','PARTIAL','COMPLETED','DATA_INSUFFICIENT','DEAD')),
  discovered_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trade_date, symbol),
  CHECK (history_session_count >= 0 AND history_session_count <= 30)
);

CREATE INDEX IF NOT EXISTS ai_stock_research_evaluation_status_idx
  ON ai_stock_research.evaluation(status,trade_date,discovered_at);

CREATE TABLE IF NOT EXISTS ai_stock_research.evaluation_source (
  evaluation_id uuid NOT NULL REFERENCES ai_stock_research.evaluation(evaluation_id) ON DELETE CASCADE,
  source_strategy text NOT NULL CHECK (source_strategy IN ('OIIS','OISS')),
  source_run_id uuid NOT NULL,
  source_candidate_id uuid NOT NULL,
  source_slot text,
  trigger_kind text NOT NULL,
  source_observed_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_strategy,source_candidate_id),
  UNIQUE (evaluation_id,source_strategy,source_run_id,source_candidate_id)
);

CREATE INDEX IF NOT EXISTS ai_stock_research_source_eval_idx
  ON ai_stock_research.evaluation_source(evaluation_id,source_observed_at);

CREATE TABLE IF NOT EXISTS ai_stock_research.provider_evaluation (
  provider_evaluation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid NOT NULL REFERENCES ai_stock_research.evaluation(evaluation_id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('CLAUDE','QWEN','DEEPSEEK')),
  model text NOT NULL,
  endpoint text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','PROCESSING','RETRY','SUCCEEDED','DEAD')),
  request_payload jsonb,
  raw_response jsonb,
  output_text text,
  parsed_output jsonb,
  whatsapp_message text,
  chat_id text,
  attempt_count integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  last_error_class text,
  last_error_detail text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evaluation_id,provider)
);

CREATE INDEX IF NOT EXISTS ai_stock_research_provider_queue_idx
  ON ai_stock_research.provider_evaluation(provider,status,available_at,created_at);

CREATE TABLE IF NOT EXISTS ai_stock_research.delivery_outbox (
  delivery_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_evaluation_id uuid NOT NULL UNIQUE
    REFERENCES ai_stock_research.provider_evaluation(provider_evaluation_id) ON DELETE CASCADE,
  chat_id text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','PROCESSING','RETRY','DELIVERED','DEAD')),
  attempt_count integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_expires_at timestamptz,
  delivered_at timestamptz,
  last_error_class text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_stock_research_delivery_queue_idx
  ON ai_stock_research.delivery_outbox(status,available_at,created_at);

CREATE TABLE IF NOT EXISTS ai_stock_research.delivery_attempt (
  attempt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES ai_stock_research.delivery_outbox(delivery_id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  response_status integer,
  response_excerpt text,
  error_class text,
  duration_ms integer NOT NULL,
  UNIQUE (delivery_id,attempt_number)
);

CREATE TABLE IF NOT EXISTS ai_stock_research.service_heartbeat (
  service_name text PRIMARY KEY,
  status text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_success_at timestamptz,
  last_error_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
