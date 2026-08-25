-- Paper Trading evidence inspector joins the entry-time OIIS candidate for
-- every durable trade.  Without a symbol/direction/time index PostgreSQL scans
-- and sorts the complete candidate history once per trade, which amplifies
-- database contention during market hours.
CREATE INDEX IF NOT EXISTS oiis_live_candidate_symbol_direction_available_idx
  ON oiis_live.daily_candidate (upper(symbol), direction, available_at DESC, created_at DESC);

-- These indexes keep the ledger's correlated cost and fill lookups bounded as
-- the durable paper history grows. They do not change stored values or trading
-- semantics.
CREATE INDEX IF NOT EXISTS paper_charge_ledger_trade_group_idx
  ON paper_trading.charge_ledger (trade_group_id);

CREATE INDEX IF NOT EXISTS paper_fills_trade_leg_idx
  ON paper_trading.paper_fills (trade_leg_id);

CREATE INDEX IF NOT EXISTS paper_pnl_ledger_trade_group_kind_idx
  ON paper_trading.pnl_ledger (trade_group_id, entry_kind);
