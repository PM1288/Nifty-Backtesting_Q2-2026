create index if not exists idx_raw_security_1m_trade_symbol_minute
  on nse_intraday.raw_security_1m (trade_date, symbol, minute_ts desc);
