CREATE TABLE IF NOT EXISTS __SCHEMA__.entry_market_evidence (
  entry_market_evidence_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_leg_id uuid NOT NULL UNIQUE REFERENCES __SCHEMA__.trade_legs(trade_leg_id) ON DELETE RESTRICT,
  opening_fill_id uuid NOT NULL UNIQUE REFERENCES __SCHEMA__.paper_fills(paper_fill_id) ON DELETE RESTRICT,
  fill_at timestamptz NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  quote_ts timestamptz,
  quote_age_ms bigint,
  quote_source text NOT NULL DEFAULT 'SMARTAPI_QUOTE_SNAPSHOT',
  availability_status text NOT NULL CHECK (availability_status IN (
    'CAPTURED','PARTIAL_DEPTH','NO_TWO_SIDED_BOOK','NO_NEARBY_QUOTE'
  )),
  ltp numeric,
  last_trade_qty bigint,
  cumulative_volume bigint,
  total_buy_qty bigint,
  total_sell_qty bigint,
  best_bid_price numeric,
  best_bid_qty bigint,
  best_ask_price numeric,
  best_ask_qty bigint,
  bid_levels jsonb NOT NULL DEFAULT '[]'::jsonb,
  ask_levels jsonb NOT NULL DEFAULT '[]'::jsonb,
  bid_level_count smallint NOT NULL DEFAULT 0,
  ask_level_count smallint NOT NULL DEFAULT 0,
  detail jsonb NOT NULL DEFAULT '{}',
  CHECK (quote_age_ms IS NULL OR quote_age_ms >= 0),
  CHECK (jsonb_typeof(bid_levels) = 'array'),
  CHECK (jsonb_typeof(ask_levels) = 'array')
);

CREATE INDEX IF NOT EXISTS entry_market_evidence_fill_at_idx
  ON __SCHEMA__.entry_market_evidence(fill_at DESC);
CREATE INDEX IF NOT EXISTS entry_market_evidence_quote_ts_idx
  ON __SCHEMA__.entry_market_evidence(quote_ts DESC);

INSERT INTO __SCHEMA__.schema_migrations(version)
VALUES ('013_entry_market_book_evidence')
ON CONFLICT DO NOTHING;
