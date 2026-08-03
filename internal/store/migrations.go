package store

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

type migration struct {
	Version  string
	SQL      string
	Checksum string
}

func (s *Store) Migrate(ctx context.Context) error {
	lockKey := fmt.Sprintf("%s:migrate", s.Schema)
	return s.withAdvisoryLock(ctx, lockKey, func() error {
		return s.migrateUnlocked(ctx)
	})
}

func (s *Store) WithTx(ctx context.Context, fn func(pgx.Tx) error) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Store) withAdvisoryLock(ctx context.Context, key string, fn func() error) error {
	lockSQL := "SELECT pg_advisory_lock(hashtext($1))"
	unlockSQL := "SELECT pg_advisory_unlock(hashtext($1))"
	if _, err := s.exec(ctx, "advisory_lock", lockSQL, key); err != nil {
		return err
	}
	defer func() { _, _ = s.exec(ctx, "advisory_unlock", unlockSQL, key) }()
	return fn()
}

func (s *Store) ensureSchema(ctx context.Context) error {
	schema := quoteIdent(s.Schema)
	_, err := s.exec(ctx, "ensure_schema", fmt.Sprintf("CREATE SCHEMA IF NOT EXISTS %s", schema))
	return err
}

func (s *Store) ensureMigrationTable(ctx context.Context) error {
	stmt := fmt.Sprintf(`
CREATE TABLE IF NOT EXISTS %s.schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checksum TEXT NOT NULL
)`, quoteIdent(s.Schema))
	_, err := s.exec(ctx, "ensure_schema_migrations", stmt)
	return err
}

func (s *Store) listAppliedMigrations(ctx context.Context) (map[string]string, error) {
	query := fmt.Sprintf(`SELECT version, checksum FROM %s.schema_migrations`, quoteIdent(s.Schema))
	start := time.Now()
	rows, err := s.Pool.Query(ctx, query)
	if err != nil {
		s.logQuery("list_schema_migrations", start, 0, err)
		return nil, err
	}
	defer rows.Close()
	applied := map[string]string{}
	for rows.Next() {
		var version, checksum string
		if err := rows.Scan(&version, &checksum); err != nil {
			return nil, err
		}
		applied[version] = checksum
	}
	err = rows.Err()
	s.logQuery("list_schema_migrations", start, 0, err)
	return applied, err
}

func buildMigrations(schema string) []migration {
	qualifiedSubs := pgx.Identifier{schema, "subscriptions"}.Sanitize()
	schemaIdent := quoteIdent(schema)
	initSQL := fmt.Sprintf(`
CREATE SCHEMA IF NOT EXISTS %[1]s;

CREATE TABLE IF NOT EXISTS %[1]s.instruments (
  exchange TEXT NOT NULL,
  symbol_token TEXT NOT NULL,
  tradingsymbol TEXT NOT NULL,
  name TEXT NULL,
  instrumenttype TEXT NULL,
  expiry DATE NULL,
  strike NUMERIC NULL,
  lotsize INT NULL,
  tick_size NUMERIC NULL,
  raw JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (exchange, symbol_token)
);
CREATE INDEX IF NOT EXISTS instruments_tradingsymbol_idx ON %[1]s.instruments (exchange, tradingsymbol);
CREATE INDEX IF NOT EXISTS instruments_name_idx ON %[1]s.instruments (exchange, name);
CREATE INDEX IF NOT EXISTS instruments_type_expiry_idx ON %[1]s.instruments (exchange, instrumenttype, expiry);

CREATE TABLE IF NOT EXISTS %[1]s.universe_underlyings (
  underlying TEXT PRIMARY KEY,
  equity_exchange TEXT NOT NULL,
  equity_token TEXT NOT NULL,
  is_index BOOLEAN NOT NULL DEFAULT false,
  is_fno BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS %[1]s.subscriptions (
  exchange TEXT NOT NULL,
  symbol_token TEXT NOT NULL,
  mode TEXT NOT NULL,
  kind TEXT NOT NULL,
  instrumenttype TEXT NULL,
  underlying TEXT NULL,
  expiry DATE NULL,
  strike NUMERIC NULL,
  "right" TEXT NULL,
  priority INT NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT true,
  reason TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (exchange, symbol_token, mode)
);
ALTER TABLE %[1]s.subscriptions ADD COLUMN IF NOT EXISTS instrumenttype TEXT NULL;
ALTER TABLE %[1]s.subscriptions ADD COLUMN IF NOT EXISTS underlying TEXT NULL;
ALTER TABLE %[1]s.subscriptions ADD COLUMN IF NOT EXISTS expiry DATE NULL;
ALTER TABLE %[1]s.subscriptions ADD COLUMN IF NOT EXISTS strike NUMERIC NULL;
ALTER TABLE %[1]s.subscriptions ADD COLUMN IF NOT EXISTS "right" TEXT NULL;
ALTER TABLE %[1]s.subscriptions ADD COLUMN IF NOT EXISTS priority INT NOT NULL DEFAULT 100;
ALTER TABLE %[1]s.subscriptions ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE %[1]s.subscriptions ADD COLUMN IF NOT EXISTS reason TEXT NULL;
CREATE INDEX IF NOT EXISTS subs_active_idx ON %[1]s.subscriptions (active, priority);
CREATE INDEX IF NOT EXISTS subs_kind_idx ON %[1]s.subscriptions (kind, active);
CREATE INDEX IF NOT EXISTS subs_underlying_expiry_idx ON %[1]s.subscriptions (underlying, expiry, active);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subs_right_chk' AND conrelid = '%[2]s'::regclass
  ) THEN
    ALTER TABLE %[1]s.subscriptions ADD CONSTRAINT subs_right_chk CHECK ("right" IS NULL OR "right" IN ('CE','PE'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subs_kind_chk' AND conrelid = '%[2]s'::regclass
  ) THEN
    ALTER TABLE %[1]s.subscriptions ADD CONSTRAINT subs_kind_chk CHECK (kind IN ('EQUITY','INDEX','FUT','OPT','OPTIDX','OPTSTK'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS %[1]s.bars_1m (
  ts TIMESTAMPTZ NOT NULL,
  exchange TEXT NOT NULL,
  symbol_token TEXT NOT NULL,
  open NUMERIC NOT NULL,
  high NUMERIC NOT NULL,
  low NUMERIC NOT NULL,
  close NUMERIC NOT NULL,
  volume BIGINT NOT NULL DEFAULT 0,
  oi BIGINT NULL,
  source TEXT NOT NULL DEFAULT 'ws',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ts, exchange, symbol_token)
) PARTITION BY RANGE (ts);
ALTER TABLE %[1]s.bars_1m ADD COLUMN IF NOT EXISTS oi BIGINT NULL;
CREATE INDEX IF NOT EXISTS bars_token_ts_idx ON %[1]s.bars_1m (symbol_token, ts DESC);
CREATE INDEX IF NOT EXISTS bars_ts_idx ON %[1]s.bars_1m (ts DESC);

CREATE TABLE IF NOT EXISTS %[1]s.quote_snapshots (
  ts TIMESTAMPTZ NOT NULL,
  exchange TEXT NOT NULL,
  symbol_token TEXT NOT NULL,
  ltp NUMERIC NULL,
  open NUMERIC NULL,
  high NUMERIC NULL,
  low NUMERIC NULL,
  close NUMERIC NULL,
  volume BIGINT NULL,
  oi BIGINT NULL,
  bid NUMERIC NULL,
  ask NUMERIC NULL,
  bid_qty BIGINT NULL,
  ask_qty BIGINT NULL,
  raw JSONB NOT NULL,
  PRIMARY KEY (ts, exchange, symbol_token)
) PARTITION BY RANGE (ts);
CREATE INDEX IF NOT EXISTS quote_snapshots_token_ts_idx ON %[1]s.quote_snapshots (symbol_token, ts DESC);

CREATE TABLE IF NOT EXISTS %[1]s.option_greeks (
  ts TIMESTAMPTZ NOT NULL,
  underlying TEXT NOT NULL,
  expiry DATE NOT NULL,
  tradingsymbol TEXT NOT NULL,
  strike NUMERIC NULL,
  "right" TEXT NULL,
  iv NUMERIC NULL,
  delta NUMERIC NULL,
  gamma NUMERIC NULL,
  theta NUMERIC NULL,
  vega NUMERIC NULL,
  ltp NUMERIC NULL,
  trade_volume NUMERIC NULL,
  raw JSONB NOT NULL,
  PRIMARY KEY (ts, tradingsymbol)
) PARTITION BY RANGE (ts);
CREATE INDEX IF NOT EXISTS greeks_underlying_expiry_ts_idx ON %[1]s.option_greeks (underlying, expiry, ts DESC);

CREATE TABLE IF NOT EXISTS %[1]s.watermarks (
  exchange TEXT NOT NULL,
  symbol_token TEXT NOT NULL,
  last_completed_minute TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (exchange, symbol_token)
);

CREATE TABLE IF NOT EXISTS %[1]s.bars_1d (
  trade_date DATE NOT NULL,
  exchange TEXT NOT NULL,
  symbol_token TEXT NOT NULL,
  open NUMERIC NOT NULL,
  high NUMERIC NOT NULL,
  low NUMERIC NOT NULL,
  close NUMERIC NOT NULL,
  volume BIGINT NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'rest',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (trade_date, exchange, symbol_token)
);
CREATE INDEX IF NOT EXISTS bars1d_token_date_idx ON %[1]s.bars_1d (symbol_token, trade_date DESC);
CREATE INDEX IF NOT EXISTS bars1d_exchange_token_date_idx ON %[1]s.bars_1d (exchange, symbol_token, trade_date DESC);

CREATE TABLE IF NOT EXISTS %[1]s.oi_snapshots_equity (
  ts TIMESTAMPTZ NOT NULL,
  exchange TEXT NOT NULL,
  symbol_token TEXT NOT NULL,
  oi BIGINT NULL,
  oi_change BIGINT NULL,
  oi_change_pct NUMERIC NULL,
  raw JSONB NOT NULL,
  PRIMARY KEY (ts, exchange, symbol_token)
);
CREATE TABLE IF NOT EXISTS %[1]s.oi_snapshots_index (
  ts TIMESTAMPTZ NOT NULL,
  exchange TEXT NOT NULL,
  symbol_token TEXT NOT NULL,
  oi BIGINT NULL,
  oi_change BIGINT NULL,
  oi_change_pct NUMERIC NULL,
  raw JSONB NOT NULL,
  PRIMARY KEY (ts, exchange, symbol_token)
);
CREATE TABLE IF NOT EXISTS %[1]s.oi_snapshots_futures (
  ts TIMESTAMPTZ NOT NULL,
  exchange TEXT NOT NULL,
  symbol_token TEXT NOT NULL,
  oi BIGINT NULL,
  oi_change BIGINT NULL,
  oi_change_pct NUMERIC NULL,
  raw JSONB NOT NULL,
  PRIMARY KEY (ts, exchange, symbol_token)
);
CREATE TABLE IF NOT EXISTS %[1]s.oi_snapshots_options (
  ts TIMESTAMPTZ NOT NULL,
  exchange TEXT NOT NULL,
  symbol_token TEXT NOT NULL,
  oi BIGINT NULL,
  oi_change BIGINT NULL,
  oi_change_pct NUMERIC NULL,
  raw JSONB NOT NULL,
  PRIMARY KEY (ts, exchange, symbol_token)
);

CREATE TABLE IF NOT EXISTS %[1]s.pcr_snapshots (
  ts TIMESTAMPTZ NOT NULL,
  underlying TEXT NOT NULL,
  expiry DATE NOT NULL,
  pcr NUMERIC NULL,
  ce_oi BIGINT NULL,
  pe_oi BIGINT NULL,
  raw JSONB NOT NULL,
  PRIMARY KEY (ts, underlying, expiry)
);

CREATE TABLE IF NOT EXISTS %[1]s.backfill_runs (
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NULL,
  tokens_considered INT NOT NULL DEFAULT 0,
  candle_requests INT NOT NULL DEFAULT 0,
  bars_upserted INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  error TEXT NULL,
  PRIMARY KEY (started_at)
);

CREATE TABLE IF NOT EXISTS %[1]s.app_runs (
  run_id TEXT PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ NULL,
  service_version TEXT NOT NULL,
  config_hash TEXT NOT NULL,
  host TEXT NULL,
  notes TEXT NULL
);
`, schemaIdent, qualifiedSubs)

	aggregatesSQL := fmt.Sprintf(`
CREATE TABLE IF NOT EXISTS %[1]s.gainers_losers_snapshots (
  ts TIMESTAMPTZ NOT NULL,
  exchange TEXT NOT NULL,
  label TEXT NOT NULL,
  params JSONB NOT NULL,
  raw JSONB NOT NULL,
  PRIMARY KEY (ts, exchange, label)
);
CREATE INDEX IF NOT EXISTS gainers_losers_ts_idx ON %[1]s.gainers_losers_snapshots (ts DESC);

CREATE TABLE IF NOT EXISTS %[1]s.oibuildup_snapshots (
  ts TIMESTAMPTZ NOT NULL,
  exchange TEXT NOT NULL,
  label TEXT NOT NULL,
  params JSONB NOT NULL,
  raw JSONB NOT NULL,
  PRIMARY KEY (ts, exchange, label)
);
CREATE INDEX IF NOT EXISTS oibuildup_ts_idx ON %[1]s.oibuildup_snapshots (ts DESC);

CREATE TABLE IF NOT EXISTS %[1]s.putcallratio_snapshots (
  ts TIMESTAMPTZ NOT NULL,
  label TEXT NOT NULL,
  params JSONB NOT NULL,
  raw JSONB NOT NULL,
  PRIMARY KEY (ts, label)
);
CREATE INDEX IF NOT EXISTS putcallratio_ts_idx ON %[1]s.putcallratio_snapshots (ts DESC);
`, schemaIdent)

	metricsSQL := fmt.Sprintf(`
CREATE TABLE IF NOT EXISTS %[1]s.instrument_universe (
  universe_name TEXT NOT NULL,
  exchange TEXT NOT NULL,
  symbol_token TEXT NOT NULL,
  tradingsymbol TEXT NULL,
  underlying TEXT NULL,
  expiry DATE NULL,
  strike NUMERIC NULL,
  "right" TEXT NULL,
  instrumenttype TEXT NULL,
  weight NUMERIC NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  active_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  active_to TIMESTAMPTZ NULL,
  PRIMARY KEY (universe_name, exchange, symbol_token)
);
CREATE INDEX IF NOT EXISTS instrument_universe_active_idx ON %[1]s.instrument_universe (universe_name, active_to);
CREATE INDEX IF NOT EXISTS instrument_universe_token_idx ON %[1]s.instrument_universe (exchange, symbol_token);

CREATE TABLE IF NOT EXISTS %[1]s.source_sla (
  source_name TEXT NOT NULL,
  universe_name TEXT NOT NULL,
  dataset TEXT NOT NULL,
  expected_interval_seconds INT NOT NULL,
  max_staleness_seconds INT NOT NULL,
  bar_late_seconds INT NULL,
  endpoint TEXT NULL,
  priority TEXT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source_name, universe_name)
);

CREATE TABLE IF NOT EXISTS %[1]s.trading_calendar (
  trade_date DATE PRIMARY KEY,
  market_open_ts TIMESTAMPTZ NOT NULL,
  market_close_ts TIMESTAMPTZ NOT NULL,
  is_trading_day BOOLEAN NOT NULL DEFAULT true,
  note TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS %[1]s.instrument_state (
  exchange TEXT NOT NULL,
  symbol_token TEXT NOT NULL,
  last_seen_ts TIMESTAMPTZ NOT NULL,
  last_price NUMERIC NULL,
  last_source TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (exchange, symbol_token)
);
CREATE INDEX IF NOT EXISTS instrument_state_seen_idx ON %[1]s.instrument_state (last_seen_ts DESC);

CREATE TABLE IF NOT EXISTS %[1]s.api_request_log (
  ts TIMESTAMPTZ NOT NULL,
  endpoint TEXT NOT NULL,
  name TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  throttled BOOLEAN NOT NULL DEFAULT false,
  latency_ms INT NOT NULL,
  symbols_requested INT NOT NULL DEFAULT 0,
  symbols_returned INT NOT NULL DEFAULT 0,
  http_status INT NULL,
  error_message TEXT NULL
);
CREATE INDEX IF NOT EXISTS api_request_log_ts_idx ON %[1]s.api_request_log (ts DESC);
CREATE INDEX IF NOT EXISTS api_request_log_endpoint_ts_idx ON %[1]s.api_request_log (endpoint, ts DESC);

CREATE TABLE IF NOT EXISTS %[1]s.metrics_1m (
  minute_ts TIMESTAMPTZ NOT NULL,
  source_name TEXT NOT NULL,
  universe_name TEXT NOT NULL,
  expected_instruments INT NOT NULL,
  seen_instruments INT NOT NULL,
  coverage_ratio NUMERIC NOT NULL,
  staleness_p50_sec NUMERIC NULL,
  staleness_p95_sec NUMERIC NULL,
  staleness_max_sec NUMERIC NULL,
  missing_instruments INT NOT NULL,
  api_429_count INT NOT NULL,
  api_error_count INT NOT NULL,
  api_latency_p95_ms NUMERIC NULL,
  bars_expected INT NULL,
  bars_written INT NULL,
  bars_missing INT NULL,
  bars_late INT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (minute_ts, source_name, universe_name)
);
CREATE INDEX IF NOT EXISTS metrics_1m_ts_idx ON %[1]s.metrics_1m (minute_ts DESC);

CREATE OR REPLACE VIEW %[1]s.bar_1m_derived AS
  SELECT * FROM %[1]s.bars_1m WHERE source = 'ws';

CREATE OR REPLACE VIEW %[1]s.bar_1m_official AS
  SELECT * FROM %[1]s.bars_1m WHERE source IN ('rest', 'rest_fallback');
`, schemaIdent)

	marketDataSQL := fmt.Sprintf(`
ALTER TABLE %[1]s.quote_snapshots ADD COLUMN IF NOT EXISTS last_trade_qty BIGINT NULL;
ALTER TABLE %[1]s.quote_snapshots ADD COLUMN IF NOT EXISTS exch_feed_time TIMESTAMPTZ NULL;
ALTER TABLE %[1]s.quote_snapshots ADD COLUMN IF NOT EXISTS exch_trade_time TIMESTAMPTZ NULL;
ALTER TABLE %[1]s.quote_snapshots ADD COLUMN IF NOT EXISTS net_change NUMERIC NULL;
ALTER TABLE %[1]s.quote_snapshots ADD COLUMN IF NOT EXISTS percent_change NUMERIC NULL;
ALTER TABLE %[1]s.quote_snapshots ADD COLUMN IF NOT EXISTS avg_price NUMERIC NULL;
ALTER TABLE %[1]s.quote_snapshots ADD COLUMN IF NOT EXISTS total_buy_qty BIGINT NULL;
ALTER TABLE %[1]s.quote_snapshots ADD COLUMN IF NOT EXISTS total_sell_qty BIGINT NULL;
ALTER TABLE %[1]s.quote_snapshots ADD COLUMN IF NOT EXISTS upper_circuit NUMERIC NULL;
ALTER TABLE %[1]s.quote_snapshots ADD COLUMN IF NOT EXISTS lower_circuit NUMERIC NULL;
ALTER TABLE %[1]s.quote_snapshots ADD COLUMN IF NOT EXISTS week52_high NUMERIC NULL;
ALTER TABLE %[1]s.quote_snapshots ADD COLUMN IF NOT EXISTS week52_low NUMERIC NULL;

CREATE TABLE IF NOT EXISTS %[1]s.depth_5_snapshots (
  ts TIMESTAMPTZ NOT NULL,
  exchange TEXT NOT NULL,
  symbol_token TEXT NOT NULL,
  side TEXT NOT NULL,
  level SMALLINT NOT NULL,
  price NUMERIC NULL,
  quantity BIGINT NULL,
  orders BIGINT NULL,
  PRIMARY KEY (ts, exchange, symbol_token, side, level)
) PARTITION BY RANGE (ts);
CREATE INDEX IF NOT EXISTS depth_5_snapshots_token_ts_idx ON %[1]s.depth_5_snapshots (symbol_token, ts DESC);
CREATE INDEX IF NOT EXISTS depth_5_snapshots_side_level_idx ON %[1]s.depth_5_snapshots (side, level, ts DESC);

ALTER TABLE %[1]s.instrument_state ADD COLUMN IF NOT EXISTS last_bid NUMERIC NULL;
ALTER TABLE %[1]s.instrument_state ADD COLUMN IF NOT EXISTS last_ask NUMERIC NULL;
ALTER TABLE %[1]s.instrument_state ADD COLUMN IF NOT EXISTS last_bid_qty BIGINT NULL;
ALTER TABLE %[1]s.instrument_state ADD COLUMN IF NOT EXISTS last_ask_qty BIGINT NULL;
ALTER TABLE %[1]s.instrument_state ADD COLUMN IF NOT EXISTS last_trade_qty BIGINT NULL;
ALTER TABLE %[1]s.instrument_state ADD COLUMN IF NOT EXISTS total_buy_qty BIGINT NULL;
ALTER TABLE %[1]s.instrument_state ADD COLUMN IF NOT EXISTS total_sell_qty BIGINT NULL;
ALTER TABLE %[1]s.instrument_state ADD COLUMN IF NOT EXISTS avg_price NUMERIC NULL;
ALTER TABLE %[1]s.instrument_state ADD COLUMN IF NOT EXISTS net_change NUMERIC NULL;
ALTER TABLE %[1]s.instrument_state ADD COLUMN IF NOT EXISTS percent_change NUMERIC NULL;
ALTER TABLE %[1]s.instrument_state ADD COLUMN IF NOT EXISTS upper_circuit NUMERIC NULL;
ALTER TABLE %[1]s.instrument_state ADD COLUMN IF NOT EXISTS lower_circuit NUMERIC NULL;
ALTER TABLE %[1]s.instrument_state ADD COLUMN IF NOT EXISTS week52_high NUMERIC NULL;
ALTER TABLE %[1]s.instrument_state ADD COLUMN IF NOT EXISTS week52_low NUMERIC NULL;
`, schemaIdent)

	strategySQL := fmt.Sprintf(`
CREATE TABLE IF NOT EXISTS %[1]s.strategy_runs (
  run_id TEXT PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NULL,
  status TEXT NOT NULL,
  error TEXT NULL,
  config_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS strategy_runs_started_idx ON %[1]s.strategy_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS %[1]s.strategy_state (
  ts TIMESTAMPTZ NOT NULL,
  name TEXT NOT NULL,
  value TEXT NULL,
  raw JSONB NOT NULL,
  PRIMARY KEY (ts, name)
);
CREATE INDEX IF NOT EXISTS strategy_state_name_ts_idx ON %[1]s.strategy_state (name, ts DESC);
CREATE INDEX IF NOT EXISTS strategy_state_name_pattern_ts_idx ON %[1]s.strategy_state (name text_pattern_ops, ts DESC);

CREATE TABLE IF NOT EXISTS %[1]s.strategy_cooldowns (
  strategy TEXT NOT NULL,
  exchange TEXT NOT NULL,
  symbol_token TEXT NOT NULL,
  cooldown_until TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (strategy, exchange, symbol_token)
);

CREATE TABLE IF NOT EXISTS %[1]s.strategy_signals (
  ts TIMESTAMPTZ NOT NULL,
  strategy TEXT NOT NULL,
  exchange TEXT NOT NULL,
  symbol_token TEXT NOT NULL,
  side TEXT NOT NULL,
  confidence NUMERIC NULL,
  entry_price NUMERIC NULL,
  stop_loss NUMERIC NULL,
  take_profit NUMERIC NULL,
  timeframe TEXT NULL,
  reason TEXT NULL,
  raw JSONB NOT NULL,
  PRIMARY KEY (ts, strategy, exchange, symbol_token)
);
CREATE INDEX IF NOT EXISTS strategy_signals_ts_idx ON %[1]s.strategy_signals (ts DESC);
CREATE INDEX IF NOT EXISTS strategy_signals_symbol_idx ON %[1]s.strategy_signals (exchange, symbol_token, ts DESC);

CREATE TABLE IF NOT EXISTS %[1]s.paper_orders (
  order_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL,
  strategy TEXT NOT NULL,
  exchange TEXT NOT NULL,
  symbol_token TEXT NOT NULL,
  side TEXT NOT NULL,
  qty BIGINT NOT NULL,
  order_type TEXT NOT NULL,
  price NUMERIC NULL,
  status TEXT NOT NULL,
  filled_qty BIGINT NOT NULL DEFAULT 0,
  filled_price NUMERIC NULL,
  raw JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS paper_orders_ts_idx ON %[1]s.paper_orders (created_at DESC);

CREATE TABLE IF NOT EXISTS %[1]s.paper_trades (
  trade_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  strategy TEXT NOT NULL,
  exchange TEXT NOT NULL,
  symbol_token TEXT NOT NULL,
  side TEXT NOT NULL,
  qty BIGINT NOT NULL,
  price NUMERIC NOT NULL,
  fees NUMERIC NULL,
  raw JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS paper_trades_ts_idx ON %[1]s.paper_trades (ts DESC);

CREATE TABLE IF NOT EXISTS %[1]s.paper_positions (
  exchange TEXT NOT NULL,
  symbol_token TEXT NOT NULL,
  qty BIGINT NOT NULL,
  avg_price NUMERIC NOT NULL,
  realized_pnl NUMERIC NOT NULL,
  unrealized_pnl NUMERIC NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (exchange, symbol_token)
);
CREATE INDEX IF NOT EXISTS paper_positions_updated_idx ON %[1]s.paper_positions (updated_at DESC);

CREATE OR REPLACE VIEW %[1]s.paper_pnl AS
SELECT
  p.exchange,
  p.symbol_token,
  p.qty,
  p.avg_price,
  p.realized_pnl,
  COALESCE(s.last_price, p.avg_price) AS mark_price,
  (COALESCE(s.last_price, p.avg_price) - p.avg_price) * p.qty AS unrealized_calc,
  p.realized_pnl + (COALESCE(s.last_price, p.avg_price) - p.avg_price) * p.qty AS total_pnl,
  p.updated_at
FROM %[1]s.paper_positions p
LEFT JOIN %[1]s.instrument_state s
  ON s.exchange = p.exchange AND s.symbol_token = p.symbol_token;
`, schemaIdent)

	instrumentStateExtSQL := fmt.Sprintf(`
ALTER TABLE %[1]s.instrument_state ADD COLUMN IF NOT EXISTS last_open NUMERIC NULL;
ALTER TABLE %[1]s.instrument_state ADD COLUMN IF NOT EXISTS last_high NUMERIC NULL;
ALTER TABLE %[1]s.instrument_state ADD COLUMN IF NOT EXISTS last_low NUMERIC NULL;
ALTER TABLE %[1]s.instrument_state ADD COLUMN IF NOT EXISTS last_close NUMERIC NULL;
ALTER TABLE %[1]s.instrument_state ADD COLUMN IF NOT EXISTS last_volume BIGINT NULL;
ALTER TABLE %[1]s.instrument_state ADD COLUMN IF NOT EXISTS last_oi BIGINT NULL;
ALTER TABLE %[1]s.instrument_state ADD COLUMN IF NOT EXISTS last_oi_change_pct NUMERIC NULL;
`, schemaIdent)

	paperPositionsExtSQL := fmt.Sprintf(`
ALTER TABLE %[1]s.paper_positions ADD COLUMN IF NOT EXISTS strategy TEXT NULL;
ALTER TABLE %[1]s.paper_positions ADD COLUMN IF NOT EXISTS side TEXT NULL;
ALTER TABLE %[1]s.paper_positions ADD COLUMN IF NOT EXISTS entry_price NUMERIC NULL;
ALTER TABLE %[1]s.paper_positions ADD COLUMN IF NOT EXISTS entry_ts TIMESTAMPTZ NULL;
ALTER TABLE %[1]s.paper_positions ADD COLUMN IF NOT EXISTS stop_loss NUMERIC NULL;
ALTER TABLE %[1]s.paper_positions ADD COLUMN IF NOT EXISTS take_profit NUMERIC NULL;

DROP VIEW IF EXISTS %[1]s.paper_pnl;
CREATE VIEW %[1]s.paper_pnl AS
SELECT
  p.exchange,
  p.symbol_token,
  p.strategy,
  p.side,
  p.qty,
  p.avg_price,
  p.entry_price,
  p.entry_ts,
  p.stop_loss,
  p.take_profit,
  p.realized_pnl,
  COALESCE(s.last_price, p.avg_price) AS mark_price,
  CASE
    WHEN COALESCE(upper(p.side), 'BUY') = 'SELL'
      THEN (p.avg_price - COALESCE(s.last_price, p.avg_price)) * p.qty
    ELSE (COALESCE(s.last_price, p.avg_price) - p.avg_price) * p.qty
  END AS unrealized_calc,
  p.realized_pnl + CASE
    WHEN COALESCE(upper(p.side), 'BUY') = 'SELL'
      THEN (p.avg_price - COALESCE(s.last_price, p.avg_price)) * p.qty
    ELSE (COALESCE(s.last_price, p.avg_price) - p.avg_price) * p.qty
  END AS total_pnl,
  p.updated_at
FROM %[1]s.paper_positions p
LEFT JOIN %[1]s.instrument_state s
  ON s.exchange = p.exchange AND s.symbol_token = p.symbol_token;
`, schemaIdent)

	optionGreeksExtSQL := fmt.Sprintf(`
ALTER TABLE %[1]s.option_greeks ADD COLUMN IF NOT EXISTS trade_volume NUMERIC NULL;
`, schemaIdent)

	watchlistSQL := fmt.Sprintf(`
CREATE TABLE IF NOT EXISTS %[1]s.watchlist_targets (
  id BIGSERIAL PRIMARY KEY,
  exchange TEXT NOT NULL,
  symbol TEXT NOT NULL,
  symbol_token TEXT NOT NULL,
  tradingsymbol TEXT NOT NULL,
  display_name TEXT NULL,
  threshold NUMERIC NOT NULL,
  direction TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT NULL,
  last_alert_date DATE NULL,
  last_alert_price NUMERIC NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exchange, symbol)
);
CREATE INDEX IF NOT EXISTS watchlist_targets_active_idx ON %[1]s.watchlist_targets (active, exchange, symbol);

CREATE TABLE IF NOT EXISTS %[1]s.watchlist_alert_events (
  id BIGSERIAL PRIMARY KEY,
  target_id BIGINT NOT NULL REFERENCES %[1]s.watchlist_targets(id) ON DELETE CASCADE,
  alert_ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  trade_date DATE NOT NULL,
  price NUMERIC NULL,
  message TEXT NOT NULL,
  payload JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS watchlist_alert_events_ts_idx ON %[1]s.watchlist_alert_events (alert_ts DESC);
CREATE INDEX IF NOT EXISTS watchlist_alert_events_target_idx ON %[1]s.watchlist_alert_events (target_id, alert_ts DESC);
`, schemaIdent)

	rsiWillrMonitorSQL := fmt.Sprintf(`
CREATE TABLE IF NOT EXISTS %[1]s.rsi_willr_targets (
  id BIGSERIAL PRIMARY KEY,
  exchange TEXT NOT NULL,
  symbol TEXT NOT NULL,
  symbol_token TEXT NOT NULL,
  tradingsymbol TEXT NOT NULL,
  display_name TEXT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT NULL,
  last_bar_ts TIMESTAMPTZ NULL,
  last_close NUMERIC NULL,
  last_rsi NUMERIC NULL,
  last_willr NUMERIC NULL,
  last_condition_met BOOLEAN NOT NULL DEFAULT false,
  pending_alert BOOLEAN NOT NULL DEFAULT false,
  last_alert_ts TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exchange, symbol)
);
CREATE INDEX IF NOT EXISTS rsi_willr_targets_active_idx ON %[1]s.rsi_willr_targets (active, exchange, symbol);
CREATE INDEX IF NOT EXISTS rsi_willr_targets_token_idx ON %[1]s.rsi_willr_targets (exchange, symbol_token);

CREATE TABLE IF NOT EXISTS %[1]s.rsi_willr_alert_events (
  id BIGSERIAL PRIMARY KEY,
  target_id BIGINT NOT NULL REFERENCES %[1]s.rsi_willr_targets(id) ON DELETE CASCADE,
  alert_ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  trade_date DATE NOT NULL,
  bar_ts TIMESTAMPTZ NULL,
  close NUMERIC NULL,
  rsi NUMERIC NULL,
  willr NUMERIC NULL,
  message TEXT NOT NULL,
  payload JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rsi_willr_alert_events_ts_idx ON %[1]s.rsi_willr_alert_events (alert_ts DESC);
CREATE INDEX IF NOT EXISTS rsi_willr_alert_events_target_idx ON %[1]s.rsi_willr_alert_events (target_id, alert_ts DESC);
`, schemaIdent)

	sectorHeatmapSQL := fmt.Sprintf(`
CREATE TABLE IF NOT EXISTS %[1]s.index_constituents (
  index_name TEXT NOT NULL,
  exchange TEXT NOT NULL,
  symbol TEXT NOT NULL,
  symbol_token TEXT NULL,
  weight NUMERIC NULL,
  macro_sector TEXT NULL,
  sector TEXT NULL,
  industry TEXT NULL,
  basic_industry TEXT NULL,
  as_of_date DATE NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (index_name, exchange, symbol)
);
CREATE INDEX IF NOT EXISTS index_constituents_symbol_idx ON %[1]s.index_constituents (symbol);
CREATE INDEX IF NOT EXISTS index_constituents_sector_idx ON %[1]s.index_constituents (index_name, sector);

CREATE TABLE IF NOT EXISTS %[1]s.symbol_perf_snapshot (
  ts TIMESTAMPTZ NOT NULL,
  index_name TEXT NOT NULL,
  exchange TEXT NOT NULL,
  symbol TEXT NOT NULL,
  symbol_token TEXT NULL,
  last_price NUMERIC NULL,
  pct_intraday NUMERIC NULL,
  pct_1d NUMERIC NULL,
  pct_1w NUMERIC NULL,
  volume_today BIGINT NULL,
  quality_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (ts, index_name, exchange, symbol)
);
CREATE INDEX IF NOT EXISTS symbol_perf_snapshot_latest_idx ON %[1]s.symbol_perf_snapshot (index_name, symbol, ts DESC);
CREATE INDEX IF NOT EXISTS symbol_perf_snapshot_ts_idx ON %[1]s.symbol_perf_snapshot (ts DESC);
`, schemaIdent)

	backtestSQL := fmt.Sprintf(`
CREATE TABLE IF NOT EXISTS %[1]s.daily_close_position (
  exchange TEXT NOT NULL,
  symbol_token TEXT NOT NULL,
  symbol TEXT NULL,
  tradingsymbol TEXT NULL,
  current_close NUMERIC NOT NULL,
  current_percentile NUMERIC NOT NULL,
  year_high NUMERIC NULL,
  year_low NUMERIC NULL,
  median_close NUMERIC NULL,
  mean_close NUMERIC NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (exchange, symbol_token)
);
CREATE INDEX IF NOT EXISTS daily_close_position_pct_idx ON %[1]s.daily_close_position (current_percentile);

CREATE TABLE IF NOT EXISTS %[1]s.a02_backtest_runs (
  run_id TIMESTAMPTZ PRIMARY KEY,
  trade_date DATE NULL,
  total_trades INT NOT NULL DEFAULT 0,
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  win_rate NUMERIC NULL,
  total_gross_profit NUMERIC NULL,
  total_charges NUMERIC NULL,
  total_net_profit NUMERIC NULL,
  average_breakeven_points NUMERIC NULL,
  capital_trades INT NOT NULL DEFAULT 0,
  capital_wins INT NOT NULL DEFAULT 0,
  capital_losses INT NOT NULL DEFAULT 0,
  capital_net_profit NUMERIC NULL,
  symbols_evaluated INT NOT NULL DEFAULT 0,
  symbols_with_trades INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS a02_backtest_runs_trade_date_idx ON %[1]s.a02_backtest_runs (trade_date DESC);

CREATE TABLE IF NOT EXISTS %[1]s.a02_backtest_results (
  run_id TIMESTAMPTZ NOT NULL,
  trade_date DATE NULL,
  exchange TEXT NULL,
  symbol_token TEXT NOT NULL,
  symbol TEXT NULL,
  tradingsymbol TEXT NULL,
  entry_time TIMESTAMPTZ NOT NULL,
  entry_close NUMERIC NULL,
  exit_time TIMESTAMPTZ NULL,
  exit_close NUMERIC NULL,
  success BOOLEAN NULL,
  gain_pct NUMERIC NULL,
  duration_minutes NUMERIC NULL,
  rsi NUMERIC NULL,
  prev_rsi NUMERIC NULL,
  willr NUMERIC NULL,
  prev_volume NUMERIC NULL,
  volume_median NUMERIC NULL,
  quantity INT NULL,
  investment_amount NUMERIC NULL,
  exit_value NUMERIC NULL,
  turnover NUMERIC NULL,
  gross_profit NUMERIC NULL,
  total_charges NUMERIC NULL,
  net_profit NUMERIC NULL,
  net_gain_pct NUMERIC NULL,
  target_price NUMERIC NULL,
  breakeven_points NUMERIC NULL,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, symbol_token, entry_time)
);
CREATE INDEX IF NOT EXISTS a02_backtest_results_trade_date_idx ON %[1]s.a02_backtest_results (trade_date DESC);
CREATE INDEX IF NOT EXISTS a02_backtest_results_symbol_idx ON %[1]s.a02_backtest_results (symbol_token, trade_date DESC);

CREATE TABLE IF NOT EXISTS %[1]s.a02_backtest_daily_stats (
  run_id TIMESTAMPTZ PRIMARY KEY,
  trade_date DATE NULL,
  duration_min_minutes NUMERIC NULL,
  duration_max_minutes NUMERIC NULL,
  duration_avg_minutes NUMERIC NULL,
  duration_median_minutes NUMERIC NULL,
  duration_std_minutes NUMERIC NULL,
  total_gross_profit NUMERIC NULL,
  total_charges NUMERIC NULL,
  total_net_profit NUMERIC NULL,
  average_breakeven_points NUMERIC NULL,
  capital_trades INT NOT NULL DEFAULT 0,
  capital_wins INT NOT NULL DEFAULT 0,
  capital_losses INT NOT NULL DEFAULT 0,
  capital_net_profit NUMERIC NULL,
  symbols_evaluated INT NOT NULL DEFAULT 0,
  symbols_with_trades INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS %[1]s.a02_backtest_live_signals (
  run_id TIMESTAMPTZ NOT NULL,
  exchange TEXT NULL,
  symbol_token TEXT NOT NULL,
  symbol TEXT NULL,
  tradingsymbol TEXT NULL,
  entry_time TIMESTAMPTZ NOT NULL,
  entry_close NUMERIC NULL,
  success BOOLEAN NULL,
  gain_pct NUMERIC NULL,
  percentile NUMERIC NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, symbol_token, entry_time)
);
CREATE INDEX IF NOT EXISTS a02_backtest_live_signals_symbol_idx ON %[1]s.a02_backtest_live_signals (symbol_token, entry_time DESC);

CREATE TABLE IF NOT EXISTS %[1]s.a02_backtest_live_status (
  key TEXT PRIMARY KEY,
  exchange TEXT NULL,
  symbol_token TEXT NULL,
  symbol TEXT NULL,
  tradingsymbol TEXT NULL,
  last_entry_time TIMESTAMPTZ NULL,
  last_run_id TIMESTAMPTZ NULL,
  last_entry_close NUMERIC NULL,
  last_success BOOLEAN NULL,
  last_gain_pct NUMERIC NULL,
  last_insert_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS %[1]s.a02_backtest_live_stream (
  run_id TIMESTAMPTZ NOT NULL,
  exchange TEXT NULL,
  symbol_token TEXT NOT NULL,
  symbol TEXT NULL,
  tradingsymbol TEXT NULL,
  entry_time TIMESTAMPTZ NOT NULL,
  entry_close NUMERIC NULL,
  success BOOLEAN NULL,
  gain_pct NUMERIC NULL,
  percentile NUMERIC NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, symbol_token, entry_time)
);
CREATE INDEX IF NOT EXISTS a02_backtest_live_stream_symbol_idx ON %[1]s.a02_backtest_live_stream (symbol_token, entry_time DESC);
`, schemaIdent)

	swingSQL := fmt.Sprintf(`
CREATE TABLE IF NOT EXISTS %[1]s.a02_archive_swing_runs (
  run_id TIMESTAMPTZ PRIMARY KEY,
  trade_date DATE NULL,
  total_trades INT NOT NULL DEFAULT 0,
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  win_rate NUMERIC NULL,
  total_gross_profit NUMERIC NULL,
  total_charges NUMERIC NULL,
  total_net_profit NUMERIC NULL,
  average_breakeven_points NUMERIC NULL,
  capital_trades INT NOT NULL DEFAULT 0,
  capital_wins INT NOT NULL DEFAULT 0,
  capital_losses INT NOT NULL DEFAULT 0,
  capital_net_profit NUMERIC NULL,
  symbols_evaluated INT NOT NULL DEFAULT 0,
  symbols_with_trades INT NOT NULL DEFAULT 0,
  index_trades INT NOT NULL DEFAULT 0,
  stock_trades INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS a02_archive_swing_runs_trade_date_idx ON %[1]s.a02_archive_swing_runs (trade_date DESC);

CREATE TABLE IF NOT EXISTS %[1]s.a02_archive_swing_results (
  run_id TIMESTAMPTZ NOT NULL,
  trade_date DATE NULL,
  exchange TEXT NULL,
  symbol_token TEXT NOT NULL,
  symbol TEXT NULL,
  tradingsymbol TEXT NULL,
  instrument_type TEXT NULL,
  entry_time TIMESTAMPTZ NOT NULL,
  entry_close NUMERIC NULL,
  exit_time TIMESTAMPTZ NULL,
  exit_close NUMERIC NULL,
  success BOOLEAN NULL,
  gain_pct NUMERIC NULL,
  duration_minutes NUMERIC NULL,
  holding_days INT NULL,
  rsi NUMERIC NULL,
  prev_rsi NUMERIC NULL,
  willr NUMERIC NULL,
  prev_volume NUMERIC NULL,
  volume_median NUMERIC NULL,
  quantity INT NULL,
  investment_amount NUMERIC NULL,
  exit_value NUMERIC NULL,
  turnover NUMERIC NULL,
  gross_profit NUMERIC NULL,
  total_charges NUMERIC NULL,
  net_profit NUMERIC NULL,
  net_gain_pct NUMERIC NULL,
  brokerage NUMERIC NULL,
  brokerage_entry NUMERIC NULL,
  brokerage_exit NUMERIC NULL,
  stt NUMERIC NULL,
  exchange_txn NUMERIC NULL,
  sebi_fee NUMERIC NULL,
  stamp_duty NUMERIC NULL,
  gst NUMERIC NULL,
  breakeven_points NUMERIC NULL,
  target_price_same_day NUMERIC NULL,
  target_price_swing NUMERIC NULL,
  exit_reason TEXT NULL,
  strategy_id TEXT NOT NULL DEFAULT 'SWING',
  strategy_name TEXT NULL,
  exit_rule TEXT NULL,
  stop_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, symbol_token, entry_time, strategy_id)
);
CREATE INDEX IF NOT EXISTS a02_archive_swing_results_trade_date_idx ON %[1]s.a02_archive_swing_results (trade_date DESC);
CREATE INDEX IF NOT EXISTS a02_archive_swing_results_symbol_idx ON %[1]s.a02_archive_swing_results (symbol_token, trade_date DESC);

CREATE TABLE IF NOT EXISTS %[1]s.a02_archive_swing_daily_stats (
  run_id TIMESTAMPTZ PRIMARY KEY,
  trade_date DATE NULL,
  duration_min_minutes NUMERIC NULL,
  duration_max_minutes NUMERIC NULL,
  duration_avg_minutes NUMERIC NULL,
  duration_median_minutes NUMERIC NULL,
  duration_std_minutes NUMERIC NULL,
  total_gross_profit NUMERIC NULL,
  total_charges NUMERIC NULL,
  total_net_profit NUMERIC NULL,
  average_breakeven_points NUMERIC NULL,
  capital_trades INT NOT NULL DEFAULT 0,
  capital_wins INT NOT NULL DEFAULT 0,
  capital_losses INT NOT NULL DEFAULT 0,
  capital_net_profit NUMERIC NULL,
  symbols_evaluated INT NOT NULL DEFAULT 0,
  symbols_with_trades INT NOT NULL DEFAULT 0,
  index_trades INT NOT NULL DEFAULT 0,
  stock_trades INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`, schemaIdent)

	portfolioSQL := fmt.Sprintf(`
CREATE TABLE IF NOT EXISTS %[1]s.portfolio_positions (
  id BIGSERIAL PRIMARY KEY,
  exchange TEXT NOT NULL,
  symbol TEXT NOT NULL,
  symbol_token TEXT NOT NULL,
  tradingsymbol TEXT NULL,
  display_name TEXT NULL,
  quantity NUMERIC NOT NULL,
  entry_price NUMERIC NOT NULL,
  entry_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  exit_price NUMERIC NULL,
  exit_time TIMESTAMPTZ NULL,
  status TEXT NOT NULL DEFAULT 'open',
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT portfolio_status_chk CHECK (status IN ('open','closed'))
);
CREATE INDEX IF NOT EXISTS idx_portfolio_positions_status ON %[1]s.portfolio_positions (status);
CREATE INDEX IF NOT EXISTS idx_portfolio_positions_symbol ON %[1]s.portfolio_positions (symbol_token, status);
`, schemaIdent)

	paramsSQL := fmt.Sprintf(`
CREATE TABLE IF NOT EXISTS %[1]s.strategy_parameters (
  scope TEXT NOT NULL,
  name TEXT NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NULL,
  PRIMARY KEY (scope, name)
);
CREATE INDEX IF NOT EXISTS strategy_parameters_scope_idx ON %[1]s.strategy_parameters (scope);

CREATE TABLE IF NOT EXISTS %[1]s.strategy_parameter_history (
  id BIGSERIAL PRIMARY KEY,
  scope TEXT NOT NULL,
  name TEXT NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NULL
);
CREATE INDEX IF NOT EXISTS strategy_parameter_history_scope_ts_idx ON %[1]s.strategy_parameter_history (scope, updated_at DESC);
`, schemaIdent)

	equilibriumSQL := fmt.Sprintf(`
CREATE TABLE IF NOT EXISTS %[1]s.equilibrium_mean_series (
  ts TIMESTAMPTZ NOT NULL,
  underlying TEXT NOT NULL,
  expiry DATE NOT NULL,
  ce_mean_norm NUMERIC NULL,
  pe_mean_norm NUMERIC NULL,
  ce_count INT NULL,
  pe_count INT NULL,
  lookback_minutes INT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ts, underlying, expiry)
);
CREATE INDEX IF NOT EXISTS equilibrium_mean_series_lookup_idx ON %[1]s.equilibrium_mean_series (underlying, expiry, ts DESC);

CREATE TABLE IF NOT EXISTS %[1]s.equilibrium_strike_snapshot (
  underlying TEXT NOT NULL,
  expiry DATE NOT NULL,
  strike NUMERIC NOT NULL,
  ce_close NUMERIC NULL,
  pe_close NUMERIC NULL,
  ce_norm NUMERIC NULL,
  pe_norm NUMERIC NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (underlying, expiry, strike)
);
CREATE INDEX IF NOT EXISTS equilibrium_strike_snapshot_idx ON %[1]s.equilibrium_strike_snapshot (underlying, expiry, strike);

CREATE TABLE IF NOT EXISTS %[1]s.equilibrium_summary (
  underlying TEXT NOT NULL,
  expiry DATE NOT NULL,
  mean_ce_norm NUMERIC NULL,
  mean_pe_norm NUMERIC NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (underlying, expiry)
);

CREATE TABLE IF NOT EXISTS %[1]s.equilibrium_current_snapshot (
  underlying TEXT PRIMARY KEY,
  expiry DATE NOT NULL,
  strike NUMERIC NOT NULL,
  ref_price NUMERIC NULL,
  strike_step NUMERIC NULL,
  ce_norm NUMERIC NULL,
  pe_norm NUMERIC NULL,
  ce_close NUMERIC NULL,
  pe_close NUMERIC NULL,
  reason TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`, schemaIdent)

	maxPainSQL := fmt.Sprintf(`
CREATE TABLE IF NOT EXISTS %[1]s.max_pain_runs (
  run_id TEXT PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NULL,
  underlying TEXT NOT NULL,
  expiry DATE NOT NULL,
  spot_price NUMERIC NULL,
  strike_count INT NOT NULL DEFAULT 0,
  option_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  error TEXT NULL
);
CREATE INDEX IF NOT EXISTS max_pain_runs_underlying_idx ON %[1]s.max_pain_runs (underlying, expiry, started_at DESC);

CREATE TABLE IF NOT EXISTS %[1]s.max_pain_levels (
  run_id TEXT NOT NULL,
  underlying TEXT NOT NULL,
  expiry DATE NOT NULL,
  strike NUMERIC NOT NULL,
  ce_oi BIGINT NULL,
  pe_oi BIGINT NULL,
  ce_pain NUMERIC NULL,
  pe_pain NUMERIC NULL,
  total_pain NUMERIC NULL,
  PRIMARY KEY (run_id, strike)
);
CREATE INDEX IF NOT EXISTS max_pain_levels_underlying_idx ON %[1]s.max_pain_levels (underlying, expiry, strike);

CREATE TABLE IF NOT EXISTS %[1]s.max_pain_summary (
  underlying TEXT NOT NULL,
  expiry DATE NOT NULL,
  max_pain_strike NUMERIC NULL,
  total_pain NUMERIC NULL,
  ce_oi BIGINT NULL,
  pe_oi BIGINT NULL,
  spot_price NUMERIC NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (underlying, expiry)
);
`, schemaIdent)

	strategyBacktestSQL := fmt.Sprintf(`
CREATE TABLE IF NOT EXISTS %[1]s.strategy_backtest_runs (
  run_id TEXT PRIMARY KEY,
  trade_date DATE NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NULL,
  status TEXT NOT NULL DEFAULT 'running',
  error TEXT NULL,
  symbols_evaluated INT NOT NULL DEFAULT 0,
  total_trades INT NOT NULL DEFAULT 0,
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  win_rate NUMERIC NULL,
  total_pnl NUMERIC NULL,
  max_drawdown NUMERIC NULL
);
CREATE INDEX IF NOT EXISTS strategy_backtest_runs_date_idx ON %[1]s.strategy_backtest_runs (trade_date DESC);

CREATE TABLE IF NOT EXISTS %[1]s.strategy_backtest_trades (
  run_id TEXT NOT NULL,
  strategy TEXT NOT NULL,
  exchange TEXT NOT NULL,
  symbol_token TEXT NOT NULL,
  symbol TEXT NULL,
  tradingsymbol TEXT NULL,
  direction TEXT NOT NULL,
  entry_time TIMESTAMPTZ NOT NULL,
  entry_price NUMERIC NOT NULL,
  exit_time TIMESTAMPTZ NOT NULL,
  exit_price NUMERIC NOT NULL,
  qty BIGINT NOT NULL,
  pnl NUMERIC NOT NULL,
  pnl_pct NUMERIC NOT NULL,
  exit_reason TEXT NULL,
  raw JSONB NULL,
  PRIMARY KEY (run_id, strategy, symbol_token, entry_time)
);
CREATE INDEX IF NOT EXISTS strategy_backtest_trades_exit_idx ON %[1]s.strategy_backtest_trades (exit_time DESC);

CREATE TABLE IF NOT EXISTS %[1]s.strategy_backtest_equity (
  run_id TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  equity NUMERIC NOT NULL,
  drawdown NUMERIC NOT NULL,
  PRIMARY KEY (run_id, ts)
);
CREATE INDEX IF NOT EXISTS strategy_backtest_equity_ts_idx ON %[1]s.strategy_backtest_equity (ts DESC);
`, schemaIdent)

	niftyWatcherSQL := fmt.Sprintf(`
CREATE TABLE IF NOT EXISTS %[1]s.nifty_watcher_runs (
  id BIGSERIAL PRIMARY KEY,
  strategy TEXT NOT NULL,
  trade_date DATE NOT NULL,
  entry_ts TIMESTAMPTZ NOT NULL,
  exit_ts TIMESTAMPTZ NULL,
  eod_ts TIMESTAMPTZ NULL,
  exit_reason TEXT NULL,
  underlying TEXT NOT NULL,
  underlying_price NUMERIC NULL,
  level NUMERIC NULL,
  strike NUMERIC NULL,
  ce_token TEXT NULL,
  pe_token TEXT NULL,
  ce_symbol TEXT NULL,
  pe_symbol TEXT NULL,
  ce_price NUMERIC NULL,
  pe_price NUMERIC NULL,
  qty BIGINT NOT NULL DEFAULT 0,
  entry_combo NUMERIC NULL,
  exit_combo NUMERIC NULL,
  pnl NUMERIC NULL,
  max_pnl NUMERIC NULL,
  max_pnl_ts TIMESTAMPTZ NULL,
  eod_pnl NUMERIC NULL,
  rsi NUMERIC NULL,
  willr NUMERIC NULL,
  ce_norm NUMERIC NULL,
  pe_norm NUMERIC NULL,
  norm_diff NUMERIC NULL,
  target_rupees NUMERIC NULL,
  raw JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nifty_watcher_runs_date_idx ON %[1]s.nifty_watcher_runs (trade_date DESC);
CREATE INDEX IF NOT EXISTS nifty_watcher_runs_strategy_idx ON %[1]s.nifty_watcher_runs (strategy, entry_ts DESC);
`, schemaIdent)

	optionBacktestSQL := fmt.Sprintf(`
CREATE TABLE IF NOT EXISTS %[1]s.option_backtest_runs (
  run_id TEXT PRIMARY KEY,
  trade_date DATE NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NULL,
  status TEXT NOT NULL DEFAULT 'running',
  total_trades INT NOT NULL DEFAULT 0,
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  win_rate NUMERIC NULL,
  total_pnl NUMERIC NULL,
  avg_pnl NUMERIC NULL,
  max_drawdown NUMERIC NULL,
  avg_norm_diff NUMERIC NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS option_backtest_runs_trade_date_idx ON %[1]s.option_backtest_runs (trade_date DESC);

CREATE TABLE IF NOT EXISTS %[1]s.option_backtest_trades (
  run_id TEXT NOT NULL,
  strategy TEXT NOT NULL,
  trade_date DATE NOT NULL,
  entry_time TIMESTAMPTZ NOT NULL,
  exit_time TIMESTAMPTZ NOT NULL,
  exit_reason TEXT NULL,
  trigger TEXT NULL,
  underlying TEXT NOT NULL,
  underlying_price NUMERIC NULL,
  level NUMERIC NULL,
  strike NUMERIC NULL,
  ce_exchange TEXT NULL,
  pe_exchange TEXT NULL,
  ce_token TEXT NULL,
  pe_token TEXT NULL,
  ce_symbol TEXT NULL,
  pe_symbol TEXT NULL,
  ce_entry NUMERIC NULL,
  pe_entry NUMERIC NULL,
  ce_exit NUMERIC NULL,
  pe_exit NUMERIC NULL,
  qty BIGINT NOT NULL DEFAULT 0,
  entry_combo NUMERIC NULL,
  exit_combo NUMERIC NULL,
  pnl NUMERIC NULL,
  success BOOLEAN NOT NULL DEFAULT false,
  rsi NUMERIC NULL,
  willr NUMERIC NULL,
  ce_norm NUMERIC NULL,
  pe_norm NUMERIC NULL,
  norm_diff NUMERIC NULL,
  raw JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, strategy, entry_time)
);
CREATE INDEX IF NOT EXISTS option_backtest_trades_trade_date_idx ON %[1]s.option_backtest_trades (trade_date DESC);
CREATE INDEX IF NOT EXISTS option_backtest_trades_exit_idx ON %[1]s.option_backtest_trades (exit_time DESC);
`, schemaIdent)

	migrations := []migration{
		newMigration("001_init", initSQL),
		newMigration("002_aggregates", aggregatesSQL),
		newMigration("003_metrics", metricsSQL),
		newMigration("004_market_data_fields", marketDataSQL),
		newMigration("005_strategy", strategySQL),
		newMigration("006_instrument_state_ext", instrumentStateExtSQL),
		newMigration("007_paper_positions_ext", paperPositionsExtSQL),
		newMigration("008_sector_heatmap", sectorHeatmapSQL),
		newMigration("009_option_greeks_trade_volume", optionGreeksExtSQL),
		newMigration("010_watchlist", watchlistSQL),
		newMigration("011_backtest", backtestSQL),
		newMigration("012_portfolio", portfolioSQL),
		newMigration("013_backtest_swing", swingSQL),
		newMigration("014_strategy_params", paramsSQL),
		newMigration("015_equilibrium", equilibriumSQL),
		newMigration("016_max_pain", maxPainSQL),
		newMigration("017_strategy_backtest", strategyBacktestSQL),
		newMigration("018_nifty_watcher", niftyWatcherSQL),
		newMigration("019_rsi_willr_monitor", rsiWillrMonitorSQL),
		newMigration("020_rsi_willr_monitor_fields", fmt.Sprintf(`
ALTER TABLE %[1]s.rsi_willr_targets ADD COLUMN IF NOT EXISTS enable_rsi_willr BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE %[1]s.rsi_willr_targets ADD COLUMN IF NOT EXISTS rsi_threshold NUMERIC NULL;
ALTER TABLE %[1]s.rsi_willr_targets ADD COLUMN IF NOT EXISTS willr_threshold NUMERIC NULL;
ALTER TABLE %[1]s.rsi_willr_targets ADD COLUMN IF NOT EXISTS enable_price BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE %[1]s.rsi_willr_targets ADD COLUMN IF NOT EXISTS price_threshold NUMERIC NULL;
ALTER TABLE %[1]s.rsi_willr_targets ADD COLUMN IF NOT EXISTS price_direction TEXT NULL;
  `, schemaIdent)),
		newMigration("021_option_backtest", optionBacktestSQL),
		newMigration("022_nifty_watcher_max_loss", fmt.Sprintf(`
ALTER TABLE %[1]s.nifty_watcher_runs ADD COLUMN IF NOT EXISTS max_loss NUMERIC NULL;
ALTER TABLE %[1]s.nifty_watcher_runs ADD COLUMN IF NOT EXISTS max_loss_ts TIMESTAMPTZ NULL;
  `, schemaIdent)),
		newMigration("023_rsi_willr_monitor_retirement", fmt.Sprintf(`
ALTER TABLE %[1]s.rsi_willr_targets ADD COLUMN IF NOT EXISTS hit_count INT NOT NULL DEFAULT 0;
ALTER TABLE %[1]s.rsi_willr_targets ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ NULL;
ALTER TABLE %[1]s.rsi_willr_targets ADD COLUMN IF NOT EXISTS retire_reason TEXT NULL;
CREATE INDEX IF NOT EXISTS rsi_willr_targets_retired_idx ON %[1]s.rsi_willr_targets (active, retired_at DESC);
  `, schemaIdent)),
		newMigration("024_derivative_token_plan", fmt.Sprintf(`
CREATE TABLE IF NOT EXISTS %[1]s.derivative_token_plan (
  plan_name TEXT NOT NULL,
  plan_date DATE NOT NULL,
  underlying TEXT NOT NULL,
  exchange TEXT NOT NULL,
  symbol_token TEXT NOT NULL,
  mode TEXT NOT NULL,
  tradingsymbol TEXT NOT NULL,
  contract_kind TEXT NOT NULL,
  selection_label TEXT NOT NULL,
  expiry DATE NULL,
  expiry_rank INT NOT NULL DEFAULT 0,
  is_monthly_expiry BOOLEAN NOT NULL DEFAULT false,
  strike NUMERIC NULL,
  "right" TEXT NULL,
  strike_step NUMERIC NULL,
  strike_offset INT NULL,
  underlying_price NUMERIC NULL,
  instrumenttype TEXT NULL,
  lotsize INT NULL,
  priority INT NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT true,
  reason TEXT NULL,
  metadata JSONB NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_name, plan_date, exchange, symbol_token)
);
CREATE INDEX IF NOT EXISTS derivative_token_plan_lookup_idx ON %[1]s.derivative_token_plan (plan_name, plan_date DESC, active, priority);
CREATE INDEX IF NOT EXISTS derivative_token_plan_underlying_idx ON %[1]s.derivative_token_plan (underlying, plan_date DESC, contract_kind);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'derivative_token_plan_kind_chk' AND conrelid = '%[1]s.derivative_token_plan'::regclass
  ) THEN
    ALTER TABLE %[1]s.derivative_token_plan ADD CONSTRAINT derivative_token_plan_kind_chk CHECK (contract_kind IN ('FUT','OPTSTK'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'derivative_token_plan_right_chk' AND conrelid = '%[1]s.derivative_token_plan'::regclass
  ) THEN
    ALTER TABLE %[1]s.derivative_token_plan ADD CONSTRAINT derivative_token_plan_right_chk CHECK ("right" IS NULL OR "right" IN ('CE','PE'));
  END IF;
END $$;
  `, schemaIdent)),
	}
	return migrations
}

func newMigration(version, sql string) migration {
	sum := sha256.Sum256([]byte(sql))
	return migration{
		Version:  version,
		SQL:      sql,
		Checksum: hex.EncodeToString(sum[:]),
	}
}
