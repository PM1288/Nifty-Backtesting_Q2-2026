-- Additive research ledger; no order/strategy/source tables are modified.
BEGIN;
CREATE SCHEMA IF NOT EXISTS market_predictor;
CREATE TABLE IF NOT EXISTS market_predictor.forecast (
  id bigserial PRIMARY KEY,
  session_date date NOT NULL,
  symbol text NOT NULL,
  token text NOT NULL,
  model text NOT NULL CHECK(model IN ('no-change','ridge','similar-days')),
  version text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deadline timestamptz NOT NULL,
  target_at timestamptz NOT NULL,
  source_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  UNIQUE(session_date,symbol,model,version),
  CHECK(published_at<=deadline AND deadline<target_at AND source_at<=published_at)
);
CREATE TABLE IF NOT EXISTS market_predictor.outcome (
  forecast_id bigint PRIMARY KEY REFERENCES market_predictor.forecast(id),
  evaluated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  source text NOT NULL,
  payload jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS market_predictor.study (
  session_date date NOT NULL, symbol text NOT NULL, version text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT clock_timestamp(), payload jsonb NOT NULL,
  PRIMARY KEY(session_date,symbol,version)
);
CREATE TABLE IF NOT EXISTS market_predictor.job_status (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(), payload jsonb NOT NULL
);
CREATE OR REPLACE FUNCTION market_predictor.prevent_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Predictor evidence is append-only'; END $$;
CREATE OR REPLACE FUNCTION market_predictor.stamp_publication() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.published_at := clock_timestamp();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS predictor_stamp_publication ON market_predictor.forecast;
CREATE TRIGGER predictor_stamp_publication BEFORE INSERT ON market_predictor.forecast
  FOR EACH ROW EXECUTE FUNCTION market_predictor.stamp_publication();
DROP TRIGGER IF EXISTS predictor_forecast_immutable ON market_predictor.forecast;
CREATE TRIGGER predictor_forecast_immutable BEFORE UPDATE OR DELETE ON market_predictor.forecast
  FOR EACH ROW EXECUTE FUNCTION market_predictor.prevent_rewrite();
DROP TRIGGER IF EXISTS predictor_outcome_immutable ON market_predictor.outcome;
CREATE TRIGGER predictor_outcome_immutable BEFORE UPDATE OR DELETE ON market_predictor.outcome
  FOR EACH ROW EXECUTE FUNCTION market_predictor.prevent_rewrite();
COMMIT;
