BEGIN;

CREATE TABLE IF NOT EXISTS research.opportunity_label (
    label_id text PRIMARY KEY,
    run_id text REFERENCES research.experiment_run(run_id) ON DELETE CASCADE,
    label_definition_id text NOT NULL,
    symbol text NOT NULL,
    decision_ts timestamptz NOT NULL,
    entry_ts timestamptz NOT NULL,
    exit_ts timestamptz NOT NULL,
    entry_price numeric NOT NULL,
    target_price numeric NOT NULL,
    stop_price numeric NOT NULL,
    exit_price numeric NOT NULL,
    quantity bigint NOT NULL CHECK (quantity > 0),
    target_hit boolean NOT NULL,
    exit_reason text NOT NULL,
    net_pnl numeric NOT NULL,
    total_cost numeric NOT NULL,
    bars_to_exit integer NOT NULL CHECK (bars_to_exit > 0),
    mfe_pct numeric,
    mae_pct numeric,
    ambiguous_path boolean NOT NULL DEFAULT false,
    feature_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (entry_ts > decision_ts),
    CHECK (exit_ts >= entry_ts)
);

CREATE INDEX IF NOT EXISTS opportunity_label_definition_idx
    ON research.opportunity_label (label_definition_id, decision_ts, symbol);

CREATE TABLE IF NOT EXISTS research.validation_split (
    model_run_id text NOT NULL,
    split_no integer NOT NULL,
    train_start_ts timestamptz NOT NULL,
    train_end_ts timestamptz NOT NULL,
    test_start_ts timestamptz NOT NULL,
    test_end_ts timestamptz NOT NULL,
    purge_observations integer NOT NULL DEFAULT 0,
    embargo_observations integer NOT NULL DEFAULT 0,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (model_run_id, split_no),
    CHECK (train_start_ts <= train_end_ts),
    CHECK (train_end_ts < test_start_ts),
    CHECK (test_start_ts <= test_end_ts)
);

CREATE TABLE IF NOT EXISTS research.feature_association (
    model_run_id text NOT NULL,
    feature_name text NOT NULL,
    sample_count bigint NOT NULL,
    positive_count bigint NOT NULL,
    coverage_pct numeric NOT NULL,
    positive_median numeric,
    negative_median numeric,
    robust_effect numeric,
    spearman_correlation numeric,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (model_run_id, feature_name)
);

CREATE TABLE IF NOT EXISTS research.model_version (
    model_id text PRIMARY KEY,
    model_family text NOT NULL,
    target_definition jsonb NOT NULL,
    feature_versions jsonb NOT NULL,
    training_scope jsonb NOT NULL,
    data_snapshot_id text NOT NULL REFERENCES catalog.data_snapshot(snapshot_id),
    code_hash text NOT NULL,
    artifact_uri text NOT NULL,
    artifact_checksum text NOT NULL,
    out_of_fold_metrics jsonb NOT NULL,
    holdout_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'research' CHECK (status IN ('research','validated','paper','shadow','approved','suspended','retired')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS research.calibration_bin (
    model_id text NOT NULL REFERENCES research.model_version(model_id) ON DELETE CASCADE,
    dataset_scope text NOT NULL,
    bin_no integer NOT NULL,
    lower_bound numeric NOT NULL,
    upper_bound numeric NOT NULL,
    sample_count bigint NOT NULL,
    mean_prediction numeric,
    observed_rate numeric,
    confidence_interval_low numeric,
    confidence_interval_high numeric,
    PRIMARY KEY (model_id, dataset_scope, bin_no)
);

COMMIT;
