BEGIN;

CREATE SCHEMA IF NOT EXISTS oiis_doe;

CREATE TABLE IF NOT EXISTS oiis_doe.experiment (
    experiment_id text PRIMARY KEY,
    created_at timestamptz NOT NULL,
    code_commit text NOT NULL,
    dependency_lock_hash text NOT NULL,
    data_snapshot_id text NOT NULL,
    status text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS oiis_doe.trial (
    experiment_id text NOT NULL REFERENCES oiis_doe.experiment(experiment_id),
    trial_id text NOT NULL,
    trial_type text NOT NULL,
    parent_trial_id text,
    production_valid boolean NOT NULL DEFAULT false,
    research_ablation_valid boolean NOT NULL DEFAULT false,
    configuration jsonb NOT NULL,
    result_hash text,
    run_status text NOT NULL,
    started_at timestamptz,
    ended_at timestamptz,
    rejection_reason text,
    PRIMARY KEY (experiment_id, trial_id)
);

CREATE TABLE IF NOT EXISTS oiis_doe.data_snapshot (
    data_snapshot_id text PRIMARY KEY,
    generated_at timestamptz NOT NULL,
    manifest jsonb NOT NULL,
    manifest_sha256 text NOT NULL
);

CREATE TABLE IF NOT EXISTS oiis_doe.trial_parameter (
    experiment_id text NOT NULL,
    trial_id text NOT NULL,
    parameter_name text NOT NULL,
    parameter_value jsonb NOT NULL,
    PRIMARY KEY (experiment_id, trial_id, parameter_name),
    FOREIGN KEY (experiment_id, trial_id)
      REFERENCES oiis_doe.trial(experiment_id, trial_id)
);

-- High-volume component/decision/path evidence is stored as immutable
-- partitioned Parquet. These catalogues retain queryable identity and hashes
-- without duplicating tens of gigabytes into the research database.
CREATE TABLE IF NOT EXISTS oiis_doe.component_event (
    experiment_id text NOT NULL,
    trial_id text NOT NULL,
    artifact_path text NOT NULL,
    row_count bigint NOT NULL,
    sha256 text NOT NULL,
    PRIMARY KEY (experiment_id, trial_id, artifact_path)
);

CREATE TABLE IF NOT EXISTS oiis_doe.decision_event (LIKE oiis_doe.component_event INCLUDING ALL);
CREATE TABLE IF NOT EXISTS oiis_doe.entry_path (LIKE oiis_doe.component_event INCLUDING ALL);
CREATE TABLE IF NOT EXISTS oiis_doe.target_event (LIKE oiis_doe.component_event INCLUDING ALL);
CREATE TABLE IF NOT EXISTS oiis_doe.adverse_event (LIKE oiis_doe.component_event INCLUDING ALL);
CREATE TABLE IF NOT EXISTS oiis_doe.capital_event (LIKE oiis_doe.component_event INCLUDING ALL);

CREATE TABLE IF NOT EXISTS oiis_doe.validation_result (
    experiment_id text NOT NULL,
    trial_id text NOT NULL,
    validation_name text NOT NULL,
    status text NOT NULL,
    evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (experiment_id, trial_id, validation_name),
    FOREIGN KEY (experiment_id, trial_id)
      REFERENCES oiis_doe.trial(experiment_id, trial_id)
);

CREATE TABLE IF NOT EXISTS oiis_doe.factor_effect (
    experiment_id text NOT NULL,
    trial_id text NOT NULL,
    component text NOT NULL,
    response_name text NOT NULL,
    signed_effect double precision,
    evidence_status text NOT NULL,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (experiment_id, trial_id, response_name),
    FOREIGN KEY (experiment_id, trial_id)
      REFERENCES oiis_doe.trial(experiment_id, trial_id)
);

CREATE TABLE IF NOT EXISTS oiis_doe.interaction_effect (
    experiment_id text NOT NULL REFERENCES oiis_doe.experiment(experiment_id),
    design_id text NOT NULL,
    response_name text NOT NULL,
    effect double precision,
    evidence_status text NOT NULL,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (experiment_id, design_id, response_name)
);

CREATE TABLE IF NOT EXISTS oiis_doe.regime_effect (
    experiment_id text NOT NULL REFERENCES oiis_doe.experiment(experiment_id),
    trial_id text NOT NULL,
    regime_dimension text NOT NULL,
    regime_value text NOT NULL,
    response_name text NOT NULL,
    effect double precision,
    effective_trades integer NOT NULL DEFAULT 0,
    evidence_status text NOT NULL,
    PRIMARY KEY (experiment_id, trial_id, regime_dimension, regime_value, response_name)
);

CREATE TABLE IF NOT EXISTS oiis_doe.artifact_manifest (
    experiment_id text NOT NULL REFERENCES oiis_doe.experiment(experiment_id),
    relative_path text NOT NULL,
    size_bytes bigint NOT NULL,
    sha256 text NOT NULL,
    row_count bigint,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (experiment_id, relative_path)
);

COMMIT;
