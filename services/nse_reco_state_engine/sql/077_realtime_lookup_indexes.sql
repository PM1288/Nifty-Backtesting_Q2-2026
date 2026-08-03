create index if not exists idx_recommendation_snapshot_trade_index_horizon_symbol_updated
  on nse_reco.recommendation_snapshot (
    trade_date,
    index_code,
    horizon,
    symbol,
    updated_at desc,
    created_at desc,
    asof_ts desc
  );
