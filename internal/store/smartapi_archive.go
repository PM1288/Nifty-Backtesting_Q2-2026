package store

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"trading-stack/internal/instruments"
)

type MarketTick struct {
	ExchangeTs       time.Time
	ReceivedTs       time.Time
	ConnectionID     string
	SequenceNo       int64
	SubscriptionMode int16
	Exchange         string
	SymbolToken      string
	SessionPhase     string
	LTP              float64
	LastTradeQty     *int64
	AvgPrice         *float64
	DayVolume        *int64
	TotalBuyQty      *int64
	TotalSellQty     *int64
	Open             *float64
	High             *float64
	Low              *float64
	Close            *float64
	LastTradeTs      *time.Time
	OI               *int64
	OIChangePct      *float64
	UpperCircuit     *float64
	LowerCircuit     *float64
	Week52High       *float64
	Week52Low        *float64
	Raw              []byte
}

type Depth5Metric struct {
	Ts             time.Time
	Exchange       string
	SymbolToken    string
	BestBid        *float64
	BestAsk        *float64
	Midpoint       *float64
	Spread         *float64
	SpreadPct      *float64
	BidNotional5   *float64
	AskNotional5   *float64
	DepthImbalance *float64
	Microprice     *float64
	SessionPhase   string
}

type WebsocketHealth struct {
	Ts                 time.Time
	ConnectionID       string
	Status             string
	SubscriptionsCount int
	LastTickTs         *time.Time
	TicksReceived      int64
	SequenceGaps       int64
	ArchiveDropped     int64
	StaleTokenCount    int
	Detail             []byte
}

type OptionChainGreekInput struct {
	Exchange    string
	SymbolToken string
	Expiry      time.Time
	Strike      float64
	Right       string
	FuturePrice *float64
	SpotPrice   *float64
	Midpoint    *float64
}

type OptionChainLocalGreeks struct {
	Exchange    string
	SymbolToken string
	IV          float64
	Delta       float64
	Gamma       float64
	Theta       float64
	Vega        float64
}

func InstrumentMasterHash(rows []instruments.Instrument) string {
	hash := sha256.New()
	for _, row := range rows {
		_, _ = hash.Write(row.Raw)
	}
	return hex.EncodeToString(hash.Sum(nil))
}

func (s *Store) UpsertInstrumentMasterSnapshot(ctx context.Context, snapshotDate time.Time, capturedAt time.Time, sourceHash string, rows []instruments.Instrument) error {
	if len(rows) == 0 {
		return nil
	}
	q := fmt.Sprintf(`
    INSERT INTO %s.instrument_master_snapshot
      (snapshot_date,captured_at,source_hash,exchange,symbol_token,tradingsymbol,name,instrumenttype,expiry,strike,lotsize,tick_size,is_cas_enabled,raw)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    ON CONFLICT (snapshot_date,exchange,symbol_token) DO UPDATE SET
      captured_at=EXCLUDED.captured_at, source_hash=EXCLUDED.source_hash,
      tradingsymbol=EXCLUDED.tradingsymbol, name=EXCLUDED.name,
      instrumenttype=EXCLUDED.instrumenttype, expiry=EXCLUDED.expiry,
      strike=EXCLUDED.strike, lotsize=EXCLUDED.lotsize,
      tick_size=EXCLUDED.tick_size, is_cas_enabled=EXCLUDED.is_cas_enabled,
      raw=EXCLUDED.raw
  `, quoteIdent(s.Schema))
	batch := &pgx.Batch{}
	for _, row := range rows {
		batch.Queue(q, snapshotDate, capturedAt, sourceHash, row.Exchange, row.SymbolToken,
			row.TradingSymbol, nullableString(row.Name), nullableString(row.InstrumentType),
			row.Expiry, row.Strike, row.LotSize, row.TickSize, row.IsCASEnabled, row.Raw)
	}
	return s.execBatch(ctx, "upsert_instrument_master_snapshot", batch)
}

func (s *Store) InsertMarketTicks(ctx context.Context, rows []MarketTick) error {
	if len(rows) == 0 {
		return nil
	}
	columns := []string{
		"exchange_ts", "received_ts", "connection_id", "sequence_no", "subscription_mode", "exchange", "symbol_token", "session_phase",
		"ltp", "last_trade_qty", "avg_price", "day_volume", "total_buy_qty", "total_sell_qty", "open", "high", "low", "close", "last_trade_ts",
		"oi", "oi_change_pct", "upper_circuit", "lower_circuit", "week52_high", "week52_low", "raw",
	}
	values := make([][]any, 0, len(rows))
	for _, row := range rows {
		values = append(values, []any{
			row.ExchangeTs, row.ReceivedTs, row.ConnectionID, row.SequenceNo, row.SubscriptionMode, row.Exchange, row.SymbolToken, row.SessionPhase,
			row.LTP, row.LastTradeQty, row.AvgPrice, row.DayVolume, row.TotalBuyQty, row.TotalSellQty, row.Open, row.High, row.Low, row.Close,
			row.LastTradeTs, row.OI, row.OIChangePct, row.UpperCircuit, row.LowerCircuit, row.Week52High, row.Week52Low, row.Raw,
		})
	}
	start := time.Now()
	if _, err := s.Pool.CopyFrom(ctx, pgx.Identifier{s.Schema, "market_ticks"}, columns, pgx.CopyFromRows(values)); err == nil {
		s.logQuery("copy_market_ticks", start, len(rows), nil)
		return nil
	} else {
		// A reconnect can replay an already archived event. Fall back to the
		// idempotent insert path so a duplicate never loses the rest of the batch.
		s.logQuery("copy_market_ticks_fallback", start, len(rows), err)
	}
	q := fmt.Sprintf(`
    INSERT INTO %s.market_ticks
      (exchange_ts,received_ts,connection_id,sequence_no,subscription_mode,exchange,symbol_token,session_phase,
       ltp,last_trade_qty,avg_price,day_volume,total_buy_qty,total_sell_qty,open,high,low,close,last_trade_ts,
       oi,oi_change_pct,upper_circuit,lower_circuit,week52_high,week52_low,raw)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
    ON CONFLICT DO NOTHING
  `, quoteIdent(s.Schema))
	batch := &pgx.Batch{}
	for _, row := range rows {
		batch.Queue(q, row.ExchangeTs, row.ReceivedTs, row.ConnectionID, row.SequenceNo,
			row.SubscriptionMode, row.Exchange, row.SymbolToken, row.SessionPhase, row.LTP,
			row.LastTradeQty, row.AvgPrice, row.DayVolume, row.TotalBuyQty, row.TotalSellQty,
			row.Open, row.High, row.Low, row.Close, row.LastTradeTs, row.OI, row.OIChangePct,
			row.UpperCircuit, row.LowerCircuit, row.Week52High, row.Week52Low, row.Raw)
	}
	return s.execBatch(ctx, "insert_market_ticks", batch)
}

func (s *Store) UpsertDepth5Metrics(ctx context.Context, rows []Depth5Metric) error {
	if len(rows) == 0 {
		return nil
	}
	q := fmt.Sprintf(`
    INSERT INTO %s.depth_5_metrics
      (ts,exchange,symbol_token,best_bid,best_ask,midpoint,spread,spread_pct,bid_notional_5,
       ask_notional_5,depth_imbalance,microprice,session_phase)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    ON CONFLICT (ts,exchange,symbol_token) DO UPDATE SET
      best_bid=EXCLUDED.best_bid,best_ask=EXCLUDED.best_ask,midpoint=EXCLUDED.midpoint,
      spread=EXCLUDED.spread,spread_pct=EXCLUDED.spread_pct,bid_notional_5=EXCLUDED.bid_notional_5,
      ask_notional_5=EXCLUDED.ask_notional_5,depth_imbalance=EXCLUDED.depth_imbalance,
      microprice=EXCLUDED.microprice,session_phase=EXCLUDED.session_phase
  `, quoteIdent(s.Schema))
	batch := &pgx.Batch{}
	for _, row := range rows {
		batch.Queue(q, row.Ts, row.Exchange, row.SymbolToken, row.BestBid, row.BestAsk,
			row.Midpoint, row.Spread, row.SpreadPct, row.BidNotional5, row.AskNotional5,
			row.DepthImbalance, row.Microprice, row.SessionPhase)
	}
	return s.execBatch(ctx, "upsert_depth_5_metrics", batch)
}

func (s *Store) SnapshotOptionChain(ctx context.Context, ts time.Time, sessionPhase string) (int64, error) {
	q := fmt.Sprintf(`
WITH latest_plan AS (
  SELECT max(plan_date) AS plan_date FROM %[1]s.derivative_token_plan
  WHERE plan_name='NIFTY250_STOCK_DERIVATIVES' AND plan_date <= ($1 AT TIME ZONE 'Asia/Kolkata')::date
), options AS (
  SELECT p.* FROM %[1]s.derivative_token_plan p JOIN latest_plan l USING(plan_date)
  WHERE p.plan_name='NIFTY250_STOCK_DERIVATIVES' AND p.contract_kind='OPTSTK'
), futures AS (
  SELECT DISTINCT ON (upper(fp.underlying))
         upper(fp.underlying) underlying_key, fs.last_price
  FROM %[1]s.derivative_token_plan fp
  JOIN latest_plan l USING(plan_date)
  JOIN %[1]s.instrument_state fs
    ON fs.exchange=fp.exchange AND fs.symbol_token=fp.symbol_token
  WHERE fp.plan_name='NIFTY250_STOCK_DERIVATIVES' AND fp.contract_kind='FUT'
  ORDER BY upper(fp.underlying),fp.expiry NULLS LAST
), latest_depth AS (
  SELECT DISTINCT ON (d.exchange,d.symbol_token)
         d.exchange,d.symbol_token,d.depth_imbalance
  FROM %[1]s.depth_5_metrics d
  JOIN options o ON o.exchange=d.exchange AND o.symbol_token=d.symbol_token
  WHERE d.ts BETWEEN $1-interval '10 minutes' AND $1
  ORDER BY d.exchange,d.symbol_token,d.ts DESC
), latest_greeks AS (
  SELECT DISTINCT ON (upper(og.tradingsymbol))
         upper(og.tradingsymbol) symbol_key,
         og.iv,og.delta,og.gamma,og.theta,og.vega
  FROM %[1]s.option_greeks og
  JOIN options o ON upper(o.tradingsymbol)=upper(og.tradingsymbol)
  WHERE og.ts BETWEEN $1-interval '30 minutes' AND $1
  ORDER BY upper(og.tradingsymbol),og.ts DESC
), sources AS (
  SELECT o.*, s.last_seen_ts quote_ts,s.last_bid bid,s.last_ask ask,
         s.last_volume volume,s.last_oi oi,s.total_buy_qty,s.total_sell_qty,
         s.last_oi_change_pct,
         spot.last_price spot_price, fut.last_price futures_price,
         dm.depth_imbalance,
         g.iv broker_iv,g.delta broker_delta,g.gamma broker_gamma,g.theta broker_theta,g.vega broker_vega
  FROM options o
  LEFT JOIN %[1]s.instrument_state s ON s.exchange=o.exchange AND s.symbol_token=o.symbol_token
  LEFT JOIN %[1]s.universe_underlyings u ON upper(u.underlying)=upper(o.underlying)
  LEFT JOIN %[1]s.instrument_state spot ON spot.exchange=u.equity_exchange AND spot.symbol_token=u.equity_token
  LEFT JOIN futures fut ON fut.underlying_key=upper(o.underlying)
  LEFT JOIN latest_depth dm ON dm.exchange=o.exchange AND dm.symbol_token=o.symbol_token
  LEFT JOIN latest_greeks g ON g.symbol_key=upper(o.tradingsymbol)
)
INSERT INTO %[1]s.smartapi_option_chain_snapshots
  (ts,underlying,expiry,exchange,symbol_token,tradingsymbol,strike,"right",lotsize,
   spot_price,futures_price,bid,ask,midpoint,spread,spread_pct,volume,oi,oi_change_pct,
   total_buy_qty,total_sell_qty,depth_imbalance,broker_iv,broker_delta,broker_gamma,broker_theta,broker_vega,
   greek_validation_status,quote_age_seconds,source_quote_ts,session_phase,data_quality_status)
SELECT $1,underlying,expiry,exchange,symbol_token,tradingsymbol,strike,"right",lotsize,
       spot_price,futures_price,bid,ask,
       CASE WHEN bid>0 AND ask>0 THEN (bid+ask)/2 END,
       CASE WHEN bid>0 AND ask>0 THEN ask-bid END,
       CASE WHEN bid>0 AND ask>0 AND (bid+ask)>0 THEN (ask-bid)/((bid+ask)/2) END,
       volume,oi,last_oi_change_pct,total_buy_qty,total_sell_qty,depth_imbalance,
       broker_iv,broker_delta,broker_gamma,broker_theta,broker_vega,
       CASE WHEN broker_iv IS NULL THEN 'BROKER_GREEKS_MISSING'
            WHEN broker_iv<=0 OR broker_gamma<0 OR ("right"='CE' AND (broker_delta<0 OR broker_delta>1))
              OR ("right"='PE' AND (broker_delta < -1 OR broker_delta>0)) THEN 'BROKER_GREEKS_INVALID'
            ELSE 'BROKER_GREEKS_VALID' END,
       CASE WHEN quote_ts IS NOT NULL THEN greatest(0,extract(epoch FROM ($1-quote_ts))::int) END,
       quote_ts,$2,
       CASE WHEN quote_ts IS NULL THEN 'QUOTE_MISSING'
            WHEN $1-quote_ts > interval '120 seconds' THEN 'QUOTE_STALE'
            WHEN bid IS NULL OR ask IS NULL OR bid<=0 OR ask<=0 THEN 'TWO_SIDED_QUOTE_MISSING'
            ELSE 'FULL' END
FROM sources
ON CONFLICT (ts,exchange,symbol_token) DO NOTHING
  `, quoteIdent(s.Schema))
	result, err := s.Pool.Exec(ctx, q, ts, sessionPhase)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected(), nil
}

func (s *Store) LatestOptionChainSnapshotTime(ctx context.Context) (*time.Time, error) {
	q := fmt.Sprintf(`SELECT max(ts) FROM %s.smartapi_option_chain_snapshots`, quoteIdent(s.Schema))
	var latest *time.Time
	if err := s.Pool.QueryRow(ctx, q).Scan(&latest); err != nil {
		return nil, err
	}
	return latest, nil
}

func (s *Store) ListOptionChainGreekInputs(ctx context.Context, ts time.Time) ([]OptionChainGreekInput, error) {
	q := fmt.Sprintf(`
SELECT exchange,symbol_token,expiry,strike,"right",futures_price,spot_price,midpoint
FROM %s.smartapi_option_chain_snapshots WHERE ts=$1 AND midpoint>0 AND coalesce(futures_price,spot_price)>0
`, quoteIdent(s.Schema))
	rows, err := s.Pool.Query(ctx, q, ts)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []OptionChainGreekInput
	for rows.Next() {
		var row OptionChainGreekInput
		if err := rows.Scan(&row.Exchange, &row.SymbolToken, &row.Expiry, &row.Strike, &row.Right,
			&row.FuturePrice, &row.SpotPrice, &row.Midpoint); err != nil {
			return nil, err
		}
		result = append(result, row)
	}
	return result, rows.Err()
}

func (s *Store) UpdateOptionChainLocalGreeks(ctx context.Context, ts time.Time, rows []OptionChainLocalGreeks) error {
	if len(rows) == 0 {
		return nil
	}
	q := fmt.Sprintf(`
UPDATE %s.smartapi_option_chain_snapshots SET
  local_iv=$4,local_delta=$5,local_gamma=$6,local_theta=$7,local_vega=$8,
  greek_validation_status=CASE
    WHEN greek_validation_status='BROKER_GREEKS_VALID' THEN 'BROKER_AND_LOCAL_VALID'
    ELSE greek_validation_status || '_LOCAL_VALID'
  END
WHERE ts=$1 AND exchange=$2 AND symbol_token=$3
`, quoteIdent(s.Schema))
	batch := &pgx.Batch{}
	for _, row := range rows {
		batch.Queue(q, ts, row.Exchange, row.SymbolToken, row.IV, row.Delta, row.Gamma, row.Theta, row.Vega)
	}
	return s.execBatch(ctx, "update_option_chain_local_greeks", batch)
}

func (s *Store) InsertWebsocketHealth(ctx context.Context, row WebsocketHealth) error {
	q := fmt.Sprintf(`
    INSERT INTO %s.websocket_health
      (ts,connection_id,status,subscriptions_count,last_tick_ts,ticks_received,sequence_gaps,archive_dropped,stale_token_count,detail)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT (ts,connection_id) DO UPDATE SET
      status=EXCLUDED.status,subscriptions_count=EXCLUDED.subscriptions_count,last_tick_ts=EXCLUDED.last_tick_ts,
      ticks_received=EXCLUDED.ticks_received,sequence_gaps=EXCLUDED.sequence_gaps,
      archive_dropped=EXCLUDED.archive_dropped,stale_token_count=EXCLUDED.stale_token_count,detail=EXCLUDED.detail
  `, quoteIdent(s.Schema))
	_, err := s.Pool.Exec(ctx, q, row.Ts, row.ConnectionID, row.Status, row.SubscriptionsCount,
		row.LastTickTs, row.TicksReceived, row.SequenceGaps, row.ArchiveDropped,
		row.StaleTokenCount, row.Detail)
	return err
}

func (s *Store) ListLatestVolatilityShortlist(ctx context.Context, limit int) ([]string, error) {
	if limit <= 0 {
		return nil, nil
	}
	var relation *string
	if err := s.Pool.QueryRow(ctx, `SELECT to_regclass('fno_volatility.movement_prediction')::text`).Scan(&relation); err != nil {
		return nil, err
	}
	if relation == nil {
		return nil, nil
	}
	q := `
SELECT p.underlying
FROM fno_volatility.movement_prediction p
JOIN fno_volatility.signal_run r ON r.run_id=p.run_id
WHERE r.stage='PREMARKET' AND r.status='COMPLETED' AND p.shortlisted
  AND r.run_id=(SELECT run_id FROM fno_volatility.signal_run WHERE stage='PREMARKET' AND status='COMPLETED' ORDER BY trade_date DESC,completed_at DESC LIMIT 1)
ORDER BY p.movement_rank NULLS LAST,p.underlying LIMIT $1`
	rows, err := s.Pool.Query(ctx, q, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var values []string
	for rows.Next() {
		var value string
		if err := rows.Scan(&value); err != nil {
			return nil, err
		}
		values = append(values, value)
	}
	return values, rows.Err()
}
