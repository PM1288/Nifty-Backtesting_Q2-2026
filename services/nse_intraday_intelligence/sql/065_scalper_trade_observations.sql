create table if not exists nse_ops.scalper_trade_observation (
  signal_key text primary key references nse_ops.scalper_entry_signal(signal_key) on delete cascade,
  ce_symbol text not null,
  ce_token text not null,
  pe_symbol text not null,
  pe_token text not null,
  ce_entry_open numeric,
  pe_entry_open numeric,
  condition_evidence jsonb not null default '{}'::jsonb,
  indicator_evidence jsonb not null default '{}'::jsonb,
  outcome_evidence jsonb not null default '{}'::jsonb,
  outcome_state text not null default 'DEVELOPING',
  outcome_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ix_scalper_trade_observation_outcome
  on nse_ops.scalper_trade_observation(outcome_state, outcome_updated_at desc);

update nse_ops.job_definition
set title='F&O universe EMA9 entries and paper-style observation outcomes',
    description='Evaluates complete 1m/5m/15m underlying and exact paired-option candles. Option precursor colour/EMA is context only. Persists RSI/MACD entry evidence and refreshes 15m/30m/EOD CE/PE excursions.',
    updated_at=now()
where job_key='scalper_entry_evaluate';
