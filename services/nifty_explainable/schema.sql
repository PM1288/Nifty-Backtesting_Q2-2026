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
