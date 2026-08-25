BEGIN;

-- Repair only missing historical calendar rows from the canonical NIFTY daily
-- series. Existing holiday/special-session records remain authoritative.
INSERT INTO market_status.exchange_session_calendar (
  trade_date,is_trading_day,regular_open_time,regular_close_trigger_time,
  finalisation_not_before_time,finalisation_cutoff_time,delayed_cutoff_time,
  special_session,session_label,source,source_version
)
SELECT DISTINCT b.trade_date,true,TIME '09:15:00',TIME '15:30:00',
  TIME '15:42:00',TIME '15:50:00',TIME '18:00:00',false,'REGULAR',
  'CANONICAL_NIFTY_DAILY_BAR_RECOVERY','v1'
FROM public.bars_1d b
JOIN public.instruments i
  ON i.exchange=b.exchange AND i.symbol_token=b.symbol_token
LEFT JOIN market_status.exchange_session_calendar c ON c.trade_date=b.trade_date
WHERE b.exchange='NSE' AND i.name='NIFTY' AND c.trade_date IS NULL
ON CONFLICT (trade_date) DO NOTHING;

ALTER TABLE rolling_monthly.run
  ADD COLUMN IF NOT EXISTS signal_model text NOT NULL
    DEFAULT 'CONFIRMED_CLOSE_NEXT_SESSION_OPEN',
  ADD COLUMN IF NOT EXISTS signal_information_cutoff text NOT NULL
    DEFAULT 'SIGNAL_SESSION_CLOSE',
  ADD COLUMN IF NOT EXISTS entry_price_source text NOT NULL
    DEFAULT 'NEXT_VALID_SESSION_OPEN';

ALTER TABLE rolling_monthly.candidate
  ADD COLUMN IF NOT EXISTS signal_model text NOT NULL
    DEFAULT 'CONFIRMED_CLOSE_NEXT_SESSION_OPEN',
  ADD COLUMN IF NOT EXISTS maturity_state text NOT NULL
    DEFAULT 'LIVE_UNMATURED';

CREATE TABLE IF NOT EXISTS rolling_monthly.evidence_release (
  factor_version text PRIMARY KEY,
  status text NOT NULL CHECK (status IN (
    'APPROVED','DEGRADED','BLOCKED_DATA_QUALITY_REBUILD','SUPERSEDED'
  )),
  source_label text NOT NULL,
  source_sha256 text,
  evaluated_through date,
  maturity_policy text NOT NULL,
  audit_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  blocking_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  audited_at timestamptz NOT NULL,
  approved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO rolling_monthly.evidence_release (
  factor_version,status,source_label,source_sha256,evaluated_through,
  maturity_policy,audit_metrics,blocking_reasons,audited_at
)
VALUES (
  '2.0.0-research',
  'BLOCKED_DATA_QUALITY_REBUILD',
  'Supplied five-year Rolling Monthly technical fixture',
  '6cc44db26ed1ec9d1209c19f7d837554fc3833c72b068cb3e3600eb3e9a615c5',
  DATE '2026-08-07',
  'LIVE_SIGNALS_SEPARATE_FROM_MATURED_D5_D30_EVALUATION',
  jsonb_build_object(
    'source_equity_symbols',230,
    'normal_equity_rows_per_session',230,
    'degraded_equity_rows_per_session',12,
    'degraded_session_start','2026-06-12',
    'degraded_session_end','2026-07-17',
    'scored_trade_rows',23069,
    'scored_max_signal_date','2026-07-31'
  ),
  jsonb_build_array(
    'SOURCE_SESSION_COVERAGE_COLLAPSE',
    'MONTHLY_OPEN_NOT_CALENDAR_VALIDATED',
    'TECHNICAL_INDICATORS_REQUIRE_REBUILD',
    'QUALITY_THRESHOLDS_REQUIRE_REVALIDATION'
  ),
  TIMESTAMPTZ '2026-08-13 09:25:00+00'
)
ON CONFLICT (factor_version) DO UPDATE SET
  status=excluded.status,
  source_label=excluded.source_label,
  source_sha256=excluded.source_sha256,
  evaluated_through=excluded.evaluated_through,
  maturity_policy=excluded.maturity_policy,
  audit_metrics=excluded.audit_metrics,
  blocking_reasons=excluded.blocking_reasons,
  audited_at=excluded.audited_at,
  approved_at=NULL,
  updated_at=now();

COMMIT;
