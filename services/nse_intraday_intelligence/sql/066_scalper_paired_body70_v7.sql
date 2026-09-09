-- V6 admitted selected-option precursor patterns as context only. Those rows do
-- not satisfy V7's mandatory paired precursor-position rule and must not remain
-- presented as accepted observations.
delete from nse_ops.scalper_entry_signal
where rule_version = 'FNO_UNDERLYING_OPTION_CONTEXT_BODY80_NEXT_OPEN_V6';

update nse_ops.job_definition
set title='F&O paired EMA9 70% entries and paper-style observation outcomes',
    description='Evaluates complete 1m/5m/15m underlying and exact CE/PE candles. Both prior candle bodies must be wholly beyond EMA9; colour is context only. Underlying and selected option require paired 70% setup crossovers. Persists RSI/MACD plus 15m/30m/EOD maximum, endpoint trend and thesis alignment.',
    updated_at=now()
where job_key='scalper_entry_evaluate';
