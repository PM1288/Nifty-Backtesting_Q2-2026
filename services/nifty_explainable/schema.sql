CREATE SCHEMA IF NOT EXISTS nifty_context;
CREATE TABLE IF NOT EXISTS nifty_context.runs (
 id text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), report jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS nifty_context.models (
 id text PRIMARY KEY, run_id text NOT NULL REFERENCES nifty_context.runs(id), specification jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS nifty_context.snapshots (
 id text PRIMARY KEY, cutoff timestamptz NOT NULL, generated_at timestamptz NOT NULL DEFAULT now(),
 mode text NOT NULL, evidence jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS nifty_context.predictions (
 id text PRIMARY KEY, run_id text NOT NULL REFERENCES nifty_context.runs(id),
 snapshot_id text NOT NULL REFERENCES nifty_context.snapshots(id), model_id text NOT NULL REFERENCES nifty_context.models(id),
 cutoff timestamptz NOT NULL, window_end timestamptz NOT NULL, result jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS nifty_context.explanations (
 prediction_id text PRIMARY KEY REFERENCES nifty_context.predictions(id), evidence jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS nifty_context.evaluations (
 run_id text PRIMARY KEY REFERENCES nifty_context.runs(id), evidence jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS nifty_context.run_snapshots (
 run_id text NOT NULL REFERENCES nifty_context.runs(id),
 snapshot_id text NOT NULL REFERENCES nifty_context.snapshots(id),
 PRIMARY KEY(run_id,snapshot_id)
);
CREATE TABLE IF NOT EXISTS nifty_context.outcomes (
 snapshot_id text PRIMARY KEY REFERENCES nifty_context.snapshots(id),
 evaluated_at timestamptz NOT NULL DEFAULT now(), evidence jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS context_prediction_time ON nifty_context.predictions(cutoff DESC);
CREATE INDEX IF NOT EXISTS context_snapshot_time ON nifty_context.snapshots(cutoff DESC);
CREATE UNIQUE INDEX IF NOT EXISTS context_capture_planned_unique
  ON nifty_context.snapshots(mode,(evidence->>'planned_cutoff'))
  WHERE mode IN ('PROSPECTIVE_CAPTURE','RECOVERED_CAPTURE')
    AND evidence ? 'planned_cutoff';
CREATE TABLE IF NOT EXISTS nifty_context.trade_quality_runs (
 id text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), report jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS nifty_context.trade_quality_examples (
 run_id text NOT NULL REFERENCES nifty_context.trade_quality_runs(id),
 signal_key text NOT NULL, evidence jsonb NOT NULL, PRIMARY KEY(run_id,signal_key)
);
CREATE TABLE IF NOT EXISTS nifty_context.trade_quality_predictions (
 run_id text NOT NULL REFERENCES nifty_context.trade_quality_runs(id), signal_key text NOT NULL,
 result jsonb NOT NULL, explanation jsonb NOT NULL, PRIMARY KEY(run_id,signal_key),
 FOREIGN KEY(run_id,signal_key) REFERENCES nifty_context.trade_quality_examples(run_id,signal_key)
);
CREATE INDEX IF NOT EXISTS trade_quality_run_created ON nifty_context.trade_quality_runs(created_at DESC);
