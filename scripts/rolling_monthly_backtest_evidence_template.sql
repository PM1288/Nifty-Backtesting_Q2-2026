BEGIN;

CREATE TABLE IF NOT EXISTS rolling_monthly.backtest_band_summary (
  factor_version text NOT NULL,
  side text NOT NULL CHECK (side IN ('LONG','SHORT')),
  quality_band text NOT NULL CHECK (quality_band IN ('BASELINE','HIGH','MEDIUM','LOW')),
  scope text NOT NULL CHECK (scope IN ('ALL','HOLDOUT')),
  trades integer NOT NULL,
  success_count integer NOT NULL,
  failure_count integer NOT NULL,
  share_pct numeric,
  clean_1_pct numeric,
  clean_3_pct numeric,
  clean_5_pct numeric,
  adverse_2_pct numeric,
  median_mfe_5d_pct numeric,
  median_mae_5d_pct numeric,
  t3_s2_mean numeric,
  t3_s2_profit_factor numeric,
  t5_s2_mean numeric,
  t5_s2_profit_factor numeric,
  source_as_of date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (factor_version,side,quality_band,scope)
);

CREATE TABLE IF NOT EXISTS rolling_monthly.backtest_condition_evidence (
  factor_version text NOT NULL,
  side text NOT NULL CHECK (side IN ('LONG','SHORT')),
  scope text NOT NULL CHECK (scope IN ('ALL','HOLDOUT')),
  condition_name text NOT NULL,
  pass_n integer NOT NULL,
  fail_n integer NOT NULL,
  pass_clean_3_pct numeric,
  fail_clean_3_pct numeric,
  uplift_pp numeric,
  pass_t3_s2_mean numeric,
  fail_t3_s2_mean numeric,
  return_uplift numeric,
  pass_profit_factor numeric,
  fail_profit_factor numeric,
  pass_median_mae_pct numeric,
  fail_median_mae_pct numeric,
  source_as_of date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (factor_version,side,scope,condition_name)
);

CREATE TABLE IF NOT EXISTS rolling_monthly.backtest_indicator_correlation (
  factor_version text NOT NULL,
  side text NOT NULL CHECK (side IN ('LONG','SHORT')),
  indicator_name text NOT NULL,
  sample_size integer NOT NULL,
  spearman_clean_3 numeric,
  spearman_t3_s2 numeric,
  median_good numeric,
  median_bad numeric,
  median_difference numeric,
  good_n integer,
  bad_n integer,
  interpretation text NOT NULL,
  source_as_of date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (factor_version,side,indicator_name)
);

CREATE TABLE IF NOT EXISTS rolling_monthly.backtest_yearly_summary (
  factor_version text NOT NULL,
  side text NOT NULL CHECK (side IN ('LONG','SHORT')),
  quality_band text NOT NULL CHECK (quality_band IN ('HIGH','MEDIUM')),
  year integer NOT NULL,
  trades integer NOT NULL,
  clean_3_pct numeric,
  clean_5_pct numeric,
  adverse_2_pct numeric,
  t5_s2_mean numeric,
  t5_s2_profit_factor numeric,
  median_mae_5d_pct numeric,
  source_as_of date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (factor_version,side,quality_band,year)
);

INSERT INTO rolling_monthly.backtest_band_summary
  (factor_version,side,quality_band,scope,trades,success_count,failure_count,share_pct,
   clean_1_pct,clean_3_pct,clean_5_pct,adverse_2_pct,median_mfe_5d_pct,median_mae_5d_pct,
   t3_s2_mean,t3_s2_profit_factor,t5_s2_mean,t5_s2_profit_factor,source_as_of)
VALUES
__BAND_ROWS__
ON CONFLICT (factor_version,side,quality_band,scope) DO UPDATE SET
  trades=excluded.trades,success_count=excluded.success_count,failure_count=excluded.failure_count,
  share_pct=excluded.share_pct,clean_1_pct=excluded.clean_1_pct,clean_3_pct=excluded.clean_3_pct,
  clean_5_pct=excluded.clean_5_pct,adverse_2_pct=excluded.adverse_2_pct,
  median_mfe_5d_pct=excluded.median_mfe_5d_pct,median_mae_5d_pct=excluded.median_mae_5d_pct,
  t3_s2_mean=excluded.t3_s2_mean,t3_s2_profit_factor=excluded.t3_s2_profit_factor,
  t5_s2_mean=excluded.t5_s2_mean,t5_s2_profit_factor=excluded.t5_s2_profit_factor,
  source_as_of=excluded.source_as_of;

INSERT INTO rolling_monthly.backtest_condition_evidence
  (factor_version,side,scope,condition_name,pass_n,fail_n,pass_clean_3_pct,fail_clean_3_pct,
   uplift_pp,pass_t3_s2_mean,fail_t3_s2_mean,return_uplift,pass_profit_factor,
   fail_profit_factor,pass_median_mae_pct,fail_median_mae_pct,source_as_of)
VALUES
__CONDITION_ROWS__
ON CONFLICT (factor_version,side,scope,condition_name) DO UPDATE SET
  pass_n=excluded.pass_n,fail_n=excluded.fail_n,pass_clean_3_pct=excluded.pass_clean_3_pct,
  fail_clean_3_pct=excluded.fail_clean_3_pct,uplift_pp=excluded.uplift_pp,
  pass_t3_s2_mean=excluded.pass_t3_s2_mean,fail_t3_s2_mean=excluded.fail_t3_s2_mean,
  return_uplift=excluded.return_uplift,pass_profit_factor=excluded.pass_profit_factor,
  fail_profit_factor=excluded.fail_profit_factor,pass_median_mae_pct=excluded.pass_median_mae_pct,
  fail_median_mae_pct=excluded.fail_median_mae_pct,source_as_of=excluded.source_as_of;

INSERT INTO rolling_monthly.backtest_indicator_correlation
  (factor_version,side,indicator_name,sample_size,spearman_clean_3,spearman_t3_s2,
   median_good,median_bad,median_difference,good_n,bad_n,interpretation,source_as_of)
VALUES
__CORRELATION_ROWS__
ON CONFLICT (factor_version,side,indicator_name) DO UPDATE SET
  sample_size=excluded.sample_size,spearman_clean_3=excluded.spearman_clean_3,
  spearman_t3_s2=excluded.spearman_t3_s2,median_good=excluded.median_good,
  median_bad=excluded.median_bad,median_difference=excluded.median_difference,
  good_n=excluded.good_n,bad_n=excluded.bad_n,interpretation=excluded.interpretation,
  source_as_of=excluded.source_as_of;

INSERT INTO rolling_monthly.backtest_yearly_summary
  (factor_version,side,quality_band,year,trades,clean_3_pct,clean_5_pct,adverse_2_pct,
   t5_s2_mean,t5_s2_profit_factor,median_mae_5d_pct,source_as_of)
VALUES
__YEARLY_ROWS__
ON CONFLICT (factor_version,side,quality_band,year) DO UPDATE SET
  trades=excluded.trades,clean_3_pct=excluded.clean_3_pct,clean_5_pct=excluded.clean_5_pct,
  adverse_2_pct=excluded.adverse_2_pct,t5_s2_mean=excluded.t5_s2_mean,
  t5_s2_profit_factor=excluded.t5_s2_profit_factor,median_mae_5d_pct=excluded.median_mae_5d_pct,
  source_as_of=excluded.source_as_of;

COMMIT;
