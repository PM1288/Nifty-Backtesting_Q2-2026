create index if not exists idx_index_constituents_upper_symbol_updated
  on public.index_constituents ((upper(trim(symbol))), updated_at desc);

create index if not exists idx_instrument_universe_refresh_lookup
  on public.instrument_universe (exchange, universe_name, active_to, active_from desc, symbol_token);

create index if not exists idx_market_summary_daily_updated_at
  on nse_app.market_summary_daily (updated_at desc);

create index if not exists idx_signal_performance_summary_latest
  on nse_app.signal_performance_summary (as_of_date desc, analysis_type, signal_name, signal_direction);

create index if not exists idx_stock_analysis_signals_symbol_date
  on nse_app.stock_analysis_signals_daily (symbol, series, trade_date desc);
