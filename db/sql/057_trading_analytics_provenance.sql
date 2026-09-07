-- Additive source provenance; existing market facts remain in their canonical tables.
CREATE SCHEMA IF NOT EXISTS audit;
CREATE TABLE IF NOT EXISTS audit.trading_analytics_artifacts (
  artifact_id text PRIMARY KEY,
  report_date date NOT NULL,
  source_kind text NOT NULL,
  source_path text NOT NULL,
  sha256 text NOT NULL CHECK (length(sha256)=64),
  retrieved_at timestamptz NOT NULL,
  published_at timestamptz,
  known_at timestamptz NOT NULL,
  parser_version text NOT NULL,
  row_count integer NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  UNIQUE (source_kind, report_date, sha256)
);
CREATE TABLE IF NOT EXISTS audit.trading_analytics_evidence (
  evidence_id text PRIMARY KEY,
  strategy_version text NOT NULL,
  instrument_identity text NOT NULL,
  evaluated_at timestamptz NOT NULL,
  known_at timestamptz NOT NULL,
  state text NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trading_analytics_evidence_asof ON audit.trading_analytics_evidence (evaluated_at, instrument_identity);
