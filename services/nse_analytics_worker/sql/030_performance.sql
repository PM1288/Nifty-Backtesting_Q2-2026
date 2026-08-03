CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

CREATE INDEX IF NOT EXISTS idx_index_constituents_upper_symbol_updated
    ON public.index_constituents ((UPPER(TRIM(symbol))), updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_instrument_universe_refresh_lookup
    ON public.instrument_universe (exchange, universe_name, active_to, active_from DESC, symbol_token);

CREATE INDEX IF NOT EXISTS idx_market_summary_daily_updated_at
    ON nse_app.market_summary_daily (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_signal_performance_summary_latest
    ON nse_app.signal_performance_summary (as_of_date DESC, analysis_type, signal_name, signal_direction);

CREATE INDEX IF NOT EXISTS idx_stock_analysis_signals_symbol_date
    ON nse_app.stock_analysis_signals_daily (symbol, series, trade_date DESC);
