BEGIN;

CREATE TABLE IF NOT EXISTS public.scalper_oi_history (
  id bigserial PRIMARY KEY,
  symbol text NOT NULL,
  expiry_date date NOT NULL,
  trade_date date NOT NULL,
  captured_at timestamptz NOT NULL,
  source text NOT NULL,
  baseline_kind text NOT NULL,
  unit text NOT NULL DEFAULT 'contracts',
  strikes_around integer NOT NULL,
  strike_count integer NOT NULL,
  ce_contract_count integer NOT NULL,
  ce_observed_count integer NOT NULL,
  ce_oi bigint,
  pe_contract_count integer NOT NULL,
  pe_observed_count integer NOT NULL,
  pe_oi bigint,
  ce_change_observed_count integer NOT NULL,
  ce_change_oi bigint,
  pe_change_observed_count integer NOT NULL,
  pe_change_oi bigint,
  cohort jsonb NOT NULL DEFAULT '[]'::jsonb,
  quality jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scalper_oi_history_unit_check CHECK (unit = 'contracts'),
  CONSTRAINT scalper_oi_history_source_key UNIQUE (symbol, expiry_date, captured_at, source)
);

CREATE INDEX IF NOT EXISTS scalper_oi_history_lookup_idx
  ON public.scalper_oi_history (symbol, expiry_date, captured_at);

CREATE INDEX IF NOT EXISTS scalper_oi_history_trade_date_idx
  ON public.scalper_oi_history (trade_date, symbol, expiry_date);

COMMENT ON TABLE public.scalper_oi_history IS
  'Derived, read-only Scalper OI history for sessions missing native option-chain snapshots. Raw quote_snapshots remain authoritative.';
COMMENT ON COLUMN public.scalper_oi_history.ce_change_oi IS
  'Sum of exact-contract current OI minus the declared pre-session baseline, in contracts; null unless every cohort leg is comparable.';
COMMENT ON COLUMN public.scalper_oi_history.pe_change_oi IS
  'Sum of exact-contract current OI minus the declared pre-session baseline, in contracts; null unless every cohort leg is comparable.';

COMMIT;
