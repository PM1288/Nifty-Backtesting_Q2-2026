# Market-data adapter

Production maps to `public.bars_1m`: `ts`, `exchange`, `symbol_token`, OHLC, `volume`, `source`; instrument identity is snapshotted from the submitting strategy and may be reconciled against `public.instruments`. SQL identifiers are allowlisted by validated configuration. A durable cursor plus `processed_market_bars` prevents missed or duplicate processing after restart. Missing, stale or out-of-order data is recorded; prices are never invented.
