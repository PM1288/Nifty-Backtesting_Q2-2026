BEGIN;

ALTER TABLE rolling_monthly.absolute_month_candidate
  ADD COLUMN IF NOT EXISTS monthly_ema9 numeric,
  ADD COLUMN IF NOT EXISTS monthly_close_above_ema9 boolean,
  ADD COLUMN IF NOT EXISTS monthly_candle_above_ema9_pct numeric;

ALTER TABLE rolling_monthly.absolute_first_session_candidate
  ADD COLUMN IF NOT EXISTS monthly_ema9 numeric,
  ADD COLUMN IF NOT EXISTS monthly_close_above_ema9 boolean,
  ADD COLUMN IF NOT EXISTS monthly_candle_above_ema9_pct numeric,
  ADD COLUMN IF NOT EXISTS anchor_day_open numeric,
  ADD COLUMN IF NOT EXISTS anchor_vs_previous_week_open_pct numeric;

CREATE INDEX IF NOT EXISTS absolute_month_candidate_ema9_idx
  ON rolling_monthly.absolute_month_candidate
  (monthly_close_above_ema9, monthly_candle_above_ema9_pct, evaluation_month DESC);

CREATE INDEX IF NOT EXISTS absolute_first_session_candidate_ema9_idx
  ON rolling_monthly.absolute_first_session_candidate
  (monthly_close_above_ema9, monthly_candle_above_ema9_pct, evaluation_month DESC);

COMMIT;
