package store

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/sync/singleflight"

	"trading-stack/internal/config"
	"trading-stack/internal/instruments"
)

type Store struct {
	Pool       *pgxpool.Pool
	Schema     string
	Logger     *slog.Logger
	SlowQuery  time.Duration
	stateCache *strategyStatePrefixCache
}

type strategyStateCacheEntry struct {
	rows      []StrategyState
	expiresAt time.Time
}

type strategyStatePrefixCache struct {
	ttl    time.Duration
	mu     sync.RWMutex
	data   map[string]strategyStateCacheEntry
	loader singleflight.Group
}

func newStrategyStatePrefixCache(ttl time.Duration) *strategyStatePrefixCache {
	if ttl <= 0 {
		return nil
	}
	return &strategyStatePrefixCache{
		ttl:  ttl,
		data: make(map[string]strategyStateCacheEntry),
	}
}

func (c *strategyStatePrefixCache) get(key string) ([]StrategyState, bool) {
	if c == nil {
		return nil, false
	}
	now := time.Now()
	c.mu.RLock()
	entry, ok := c.data[key]
	c.mu.RUnlock()
	if !ok || !entry.expiresAt.After(now) {
		return nil, false
	}
	rows := make([]StrategyState, len(entry.rows))
	copy(rows, entry.rows)
	return rows, true
}

func (c *strategyStatePrefixCache) set(key string, rows []StrategyState) {
	if c == nil {
		return
	}
	copied := make([]StrategyState, len(rows))
	copy(copied, rows)
	c.mu.Lock()
	c.data[key] = strategyStateCacheEntry{
		rows:      copied,
		expiresAt: time.Now().Add(c.ttl),
	}
	c.mu.Unlock()
}

type Subscription struct {
	Exchange       string
	SymbolToken    string
	Mode           string
	Kind           string
	TradingSymbol  string
	Active         bool
	Underlying     string
	Expiry         *time.Time
	Strike         *float64
	Right          string
	InstrumentType string
	Priority       int
	Reason         string
}

type Bar struct {
	Ts          time.Time
	Exchange    string
	SymbolToken string
	Open        float64
	High        float64
	Low         float64
	Close       float64
	Volume      int64
	OI          *int64
	Source      string
}

type Bar1D struct {
	TradeDate   time.Time
	Exchange    string
	SymbolToken string
	Open        float64
	High        float64
	Low         float64
	Close       float64
	Volume      int64
	Source      string
}

type QuoteSnapshot struct {
	Ts                  time.Time
	Exchange            string
	SymbolToken         string
	LTP                 *float64
	Open                *float64
	High                *float64
	Low                 *float64
	Close               *float64
	LastTradeQty        *int64
	ExchFeedTime        *time.Time
	ExchTradeTime       *time.Time
	NetChange           *float64
	PercentChange       *float64
	AvgPrice            *float64
	Volume              *int64
	OI                  *int64
	TotalBuyQty         *int64
	TotalSellQty        *int64
	UpperCircuit        *float64
	LowerCircuit        *float64
	Week52High          *float64
	Week52Low           *float64
	Bid                 *float64
	Ask                 *float64
	BidQty              *int64
	AskQty              *int64
	ReferenceLimitPrice *float64
	SessionPhase        string
	Raw                 []byte
}

type Depth5Snapshot struct {
	Ts                 time.Time
	Exchange           string
	SymbolToken        string
	Side               string
	Level              int16
	Price              *float64
	Quantity           *int64
	Orders             *int64
	CumulativeQuantity *int64
	CumulativeNotional *float64
	SessionPhase       string
}

type OISnapshot struct {
	Ts          time.Time
	Exchange    string
	SymbolToken string
	OI          *int64
	OIChange    *int64
	OIChangePct *float64
	Raw         []byte
}

type PCRSnapshot struct {
	Ts         time.Time
	Underlying string
	Expiry     time.Time
	PCR        *float64
	CEOI       *int64
	PEOI       *int64
	Raw        []byte
}

type OptionGreek struct {
	Ts            time.Time
	Underlying    string
	Expiry        time.Time
	TradingSymbol string
	Strike        *float64
	Right         string
	IV            *float64
	Delta         *float64
	Gamma         *float64
	Theta         *float64
	Vega          *float64
	LTP           *float64
	TradeVolume   *float64
	Raw           []byte
}

type GainersLosersSnapshot struct {
	Ts       time.Time
	Exchange string
	Label    string
	Params   []byte
	Raw      []byte
}

type OIBuildupSnapshot struct {
	Ts       time.Time
	Exchange string
	Label    string
	Params   []byte
	Raw      []byte
}

type PutCallRatioSnapshot struct {
	Ts     time.Time
	Label  string
	Params []byte
	Raw    []byte
}

type InstrumentUniverseEntry struct {
	UniverseName   string
	Exchange       string
	SymbolToken    string
	TradingSymbol  string
	Underlying     string
	Expiry         *time.Time
	Strike         *float64
	Right          string
	InstrumentType string
	Weight         *float64
	Metadata       []byte
}

type IndexConstituent struct {
	IndexName     string
	Exchange      string
	Symbol        string
	SymbolToken   string
	Weight        *float64
	MacroSector   string
	Sector        string
	Industry      string
	BasicIndustry string
	AsOfDate      *time.Time
	Metadata      []byte
}

type DerivativeTokenPlanEntry struct {
	PlanName        string
	PlanDate        time.Time
	Underlying      string
	Exchange        string
	SymbolToken     string
	Mode            string
	TradingSymbol   string
	ContractKind    string
	SelectionLabel  string
	Expiry          *time.Time
	ExpiryRank      int
	IsMonthlyExpiry bool
	Strike          *float64
	Right           string
	StrikeStep      *float64
	StrikeOffset    *int
	UnderlyingPrice *float64
	InstrumentType  string
	LotSize         *int
	Priority        int
	Active          bool
	Reason          string
	Metadata        []byte
}

type SourceSLA struct {
	SourceName              string
	UniverseName            string
	Dataset                 string
	ExpectedIntervalSeconds int
	MaxStalenessSeconds     int
	BarLateSeconds          *int
	Endpoint                string
	Priority                string
	Enabled                 bool
}

type TradingDay struct {
	TradeDate    time.Time
	MarketOpen   time.Time
	MarketClose  time.Time
	IsTradingDay bool
	Note         string
}

type InstrumentState struct {
	Exchange        string
	SymbolToken     string
	LastSeen        time.Time
	LastPrice       *float64
	LastSource      string
	LastBid         *float64
	LastAsk         *float64
	LastBidQty      *int64
	LastAskQty      *int64
	LastTradeQty    *int64
	LastOpen        *float64
	LastHigh        *float64
	LastLow         *float64
	LastClose       *float64
	LastVolume      *int64
	LastOI          *int64
	LastOIChangePct *float64
	TotalBuyQty     *int64
	TotalSellQty    *int64
	AvgPrice        *float64
	NetChange       *float64
	PercentChange   *float64
	UpperCircuit    *float64
	LowerCircuit    *float64
	Week52High      *float64
	Week52Low       *float64
}

type APIRequestLog struct {
	Ts               time.Time
	Endpoint         string
	Name             string
	Success          bool
	Throttled        bool
	LatencyMs        int64
	SymbolsRequested int
	SymbolsReturned  int
	HTTPStatus       *int
	RetryCount       int
	CacheHit         bool
	APIErrorCode     string
	ErrorMessage     string
}

type MetricsRow struct {
	MinuteTs            time.Time
	SourceName          string
	UniverseName        string
	ExpectedInstruments int
	SeenInstruments     int
	CoverageRatio       float64
	StalenessP50Sec     *float64
	StalenessP95Sec     *float64
	StalenessMaxSec     *float64
	MissingInstruments  int
	API429Count         int
	APIErrorCount       int
	APILatencyP95Ms     *float64
	BarsExpected        *int
	BarsWritten         *int
	BarsMissing         *int
	BarsLate            *int
}

type InstrumentStateStats struct {
	Expected int
	Seen     int
	P50      *float64
	P95      *float64
	Max      *float64
}

type Bars1mStats struct {
	Expected int
	Written  int
	Late     int
}

type APIRequestStats struct {
	Throttled int
	Errors    int
	P95Ms     *float64
}

func New(ctx context.Context, cfg config.PostgresConfig, logger *slog.Logger) (*Store, error) {
	dsn := fmt.Sprintf("postgres://%s:%s@%s:%d/%s?sslmode=%s",
		cfg.User,
		cfg.Password,
		cfg.Host,
		cfg.Port,
		cfg.Database,
		cfg.SSLMode,
	)
	poolCfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse dsn: %w", err)
	}
	if cfg.ConnectTimeoutSeconds > 0 {
		poolCfg.ConnConfig.ConnectTimeout = time.Duration(cfg.ConnectTimeoutSeconds) * time.Second
	}
	if cfg.AppName != "" {
		poolCfg.ConnConfig.RuntimeParams["application_name"] = cfg.AppName
	}
	if cfg.Schema != "" {
		poolCfg.ConnConfig.RuntimeParams["search_path"] = cfg.Schema
	}
	if cfg.MaxConns > 0 {
		poolCfg.MaxConns = cfg.MaxConns
	}
	if cfg.MinConns > 0 {
		poolCfg.MinConns = cfg.MinConns
	}
	if cfg.MaxConnIdleSeconds > 0 {
		poolCfg.MaxConnIdleTime = time.Duration(cfg.MaxConnIdleSeconds) * time.Second
	}
	if cfg.HealthCheckSeconds > 0 {
		poolCfg.HealthCheckPeriod = time.Duration(cfg.HealthCheckSeconds) * time.Second
	}
	if cfg.MaxConnLifetimeMinutes > 0 {
		poolCfg.MaxConnLifetime = time.Duration(cfg.MaxConnLifetimeMinutes) * time.Minute
	}
	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		return nil, fmt.Errorf("connect postgres: %w", err)
	}
	storeLogger := logger
	if storeLogger != nil {
		storeLogger = storeLogger.With(
			"module", "store",
			"schema", cfg.Schema,
			"db_host", cfg.Host,
		)
	}
	return &Store{
		Pool:       pool,
		Schema:     cfg.Schema,
		Logger:     storeLogger,
		SlowQuery:  time.Duration(cfg.SlowQueryMilliseconds) * time.Millisecond,
		stateCache: newStrategyStatePrefixCache(2 * time.Second),
	}, nil
}

func (s *Store) Close() {
	if s.Pool != nil {
		s.Pool.Close()
	}
}

func (s *Store) Ping(ctx context.Context) error {
	return s.Pool.Ping(ctx)
}

func (s *Store) UpsertInstruments(ctx context.Context, instruments []instruments.Instrument) error {
	if len(instruments) == 0 {
		return nil
	}
	q := fmt.Sprintf(`
    INSERT INTO %s.instruments
      (exchange, symbol_token, tradingsymbol, name, instrumenttype, expiry, strike, lotsize, tick_size, is_cas_enabled, raw)
    VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (exchange, symbol_token) DO UPDATE
      SET tradingsymbol = EXCLUDED.tradingsymbol,
          name = EXCLUDED.name,
          instrumenttype = EXCLUDED.instrumenttype,
          expiry = EXCLUDED.expiry,
          strike = EXCLUDED.strike,
          lotsize = EXCLUDED.lotsize,
          tick_size = EXCLUDED.tick_size,
          is_cas_enabled = EXCLUDED.is_cas_enabled,
          raw = EXCLUDED.raw,
          updated_at = now()
  `, quoteIdent(s.Schema))

	batch := &pgx.Batch{}
	for _, inst := range instruments {
		batch.Queue(q,
			inst.Exchange,
			inst.SymbolToken,
			inst.TradingSymbol,
			nullableString(inst.Name),
			nullableString(inst.InstrumentType),
			inst.Expiry,
			inst.Strike,
			inst.LotSize,
			inst.TickSize,
			inst.IsCASEnabled,
			inst.Raw,
		)
	}
	return s.execBatch(ctx, "upsert_instruments", batch)
}

func (s *Store) UpsertSubscriptions(ctx context.Context, subs []Subscription) error {
	if len(subs) == 0 {
		return nil
	}
	q := fmt.Sprintf(`
    INSERT INTO %s.subscriptions
      (exchange, symbol_token, mode, kind, active, tradingsymbol, underlying, expiry, strike, "right", instrumenttype, priority, reason)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    ON CONFLICT (exchange, symbol_token, mode) DO UPDATE
      SET kind = EXCLUDED.kind,
          active = EXCLUDED.active,
          tradingsymbol = EXCLUDED.tradingsymbol,
          underlying = EXCLUDED.underlying,
          expiry = EXCLUDED.expiry,
          strike = EXCLUDED.strike,
          "right" = EXCLUDED."right",
          instrumenttype = EXCLUDED.instrumenttype,
          priority = EXCLUDED.priority,
          reason = EXCLUDED.reason,
          updated_at = now()
  `, quoteIdent(s.Schema))

	batch := &pgx.Batch{}
	for _, sub := range subs {
		batch.Queue(q,
			sub.Exchange,
			sub.SymbolToken,
			sub.Mode,
			sub.Kind,
			sub.Active,
			nullableString(sub.TradingSymbol),
			nullableString(sub.Underlying),
			sub.Expiry,
			sub.Strike,
			nullableString(sub.Right),
			nullableString(sub.InstrumentType),
			sub.Priority,
			nullableString(sub.Reason),
		)
	}
	return s.execBatch(ctx, "upsert_subscriptions", batch)
}

func (s *Store) ListActiveSubscriptions(ctx context.Context) ([]Subscription, error) {
	q := fmt.Sprintf(`
    SELECT
      exchange,
      symbol_token,
      mode,
      kind,
      COALESCE(tradingsymbol, ''),
      COALESCE(underlying, ''),
      expiry,
      strike,
      COALESCE("right", ''),
      COALESCE(instrumenttype, ''),
      priority,
      COALESCE(reason, '')
    FROM %s.subscriptions
    WHERE active = true
  `, quoteIdent(s.Schema))
	start := time.Now()
	rows, err := s.Pool.Query(ctx, q)
	if err != nil {
		s.logQuery("list_subscriptions", start, 0, err)
		return nil, err
	}
	defer rows.Close()

	var subs []Subscription
	for rows.Next() {
		var sub Subscription
		if err := rows.Scan(
			&sub.Exchange,
			&sub.SymbolToken,
			&sub.Mode,
			&sub.Kind,
			&sub.TradingSymbol,
			&sub.Underlying,
			&sub.Expiry,
			&sub.Strike,
			&sub.Right,
			&sub.InstrumentType,
			&sub.Priority,
			&sub.Reason,
		); err != nil {
			return nil, err
		}
		subs = append(subs, sub)
	}
	err = rows.Err()
	s.logQuery("list_subscriptions", start, 0, err)
	return subs, err
}

// ListOIISLiveSubscriptions returns active cash-equity watchlist instruments.
// The to_regclass guard keeps the collector deployable before the optional
// OIIS migration is installed; the next refresh picks up rows once it exists.
func (s *Store) ListOIISLiveSubscriptions(ctx context.Context) ([]Subscription, error) {
	var present bool
	if err := s.Pool.QueryRow(ctx, "SELECT to_regclass('oiis_live.watchlist_item') IS NOT NULL").Scan(&present); err != nil || !present {
		return nil, err
	}
	q := fmt.Sprintf(`
    SELECT i.exchange,i.symbol_token,COALESCE(i.tradingsymbol,w.symbol)
    FROM oiis_live.watchlist_item w
    JOIN %s.instruments i
      ON i.exchange='NSE' AND i.symbol_token=w.instrument_token
    WHERE w.active=true
      AND w.trade_date=(now() AT TIME ZONE 'Asia/Kolkata')::date
    ORDER BY w.trade_date,w.rank NULLS LAST,w.symbol
  `, quoteIdent(s.Schema))
	rows, err := s.Pool.Query(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var output []Subscription
	for rows.Next() {
		var sub Subscription
		if err := rows.Scan(&sub.Exchange, &sub.SymbolToken, &sub.TradingSymbol); err != nil {
			return nil, err
		}
		sub.Mode = "LTP"
		sub.Kind = "EQUITY"
		sub.Active = true
		sub.Underlying = strings.TrimSuffix(sub.TradingSymbol, "-EQ")
		sub.Priority = 1000
		sub.Reason = "oiis_live_watchlist"
		output = append(output, sub)
	}
	return output, rows.Err()
}

func (s *Store) ListSubscriptionsWithStaleWatermarks(ctx context.Context, cutoff, activeSince time.Time, kinds []string) ([]Subscription, error) {
	normalizedKinds := make([]string, 0, len(kinds))
	for _, kind := range kinds {
		kind = strings.ToUpper(strings.TrimSpace(kind))
		if kind == "" {
			continue
		}
		normalizedKinds = append(normalizedKinds, kind)
	}
	q := fmt.Sprintf(`
    SELECT
      sub.exchange,
      sub.symbol_token,
      sub.mode,
      sub.kind,
      COALESCE(sub.tradingsymbol, ''),
      COALESCE(sub.underlying, ''),
      sub.expiry,
      sub.strike,
      COALESCE(sub."right", ''),
      COALESCE(sub.instrumenttype, ''),
      sub.priority,
      COALESCE(sub.reason, '')
    FROM %s.subscriptions sub
    JOIN %s.watermarks w
      ON w.exchange = sub.exchange AND w.symbol_token = sub.symbol_token
    WHERE sub.active = true
      AND w.last_completed_minute >= $2
      AND w.last_completed_minute < $1
      AND (COALESCE(array_length($3::text[], 1), 0) = 0 OR UPPER(sub.kind) = ANY($3))
  `, quoteIdent(s.Schema), quoteIdent(s.Schema))
	start := time.Now()
	rows, err := s.Pool.Query(ctx, q, cutoff, activeSince, normalizedKinds)
	if err != nil {
		s.logQuery("list_stale_watermark_subscriptions", start, 3, err)
		return nil, err
	}
	defer rows.Close()

	var subs []Subscription
	for rows.Next() {
		var sub Subscription
		if err := rows.Scan(
			&sub.Exchange,
			&sub.SymbolToken,
			&sub.Mode,
			&sub.Kind,
			&sub.TradingSymbol,
			&sub.Underlying,
			&sub.Expiry,
			&sub.Strike,
			&sub.Right,
			&sub.InstrumentType,
			&sub.Priority,
			&sub.Reason,
		); err != nil {
			return nil, err
		}
		subs = append(subs, sub)
	}
	err = rows.Err()
	s.logQuery("list_stale_watermark_subscriptions", start, 3, err)
	return subs, err
}

func (s *Store) UpsertBars(ctx context.Context, bars []Bar) error {
	if len(bars) == 0 {
		return nil
	}
	q := fmt.Sprintf(`
    INSERT INTO %s.bars_1m
      (ts, exchange, symbol_token, open, high, low, close, volume, oi, source)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT (ts, exchange, symbol_token) DO UPDATE
      SET open = EXCLUDED.open,
          high = EXCLUDED.high,
          low = EXCLUDED.low,
          close = EXCLUDED.close,
          volume = EXCLUDED.volume,
          oi = COALESCE(EXCLUDED.oi, %s.bars_1m.oi),
          source = EXCLUDED.source
  `, quoteIdent(s.Schema), quoteIdent(s.Schema))

	batch := &pgx.Batch{}
	for _, bar := range bars {
		batch.Queue(q,
			bar.Ts,
			bar.Exchange,
			bar.SymbolToken,
			bar.Open,
			bar.High,
			bar.Low,
			bar.Close,
			bar.Volume,
			bar.OI,
			bar.Source,
		)
	}
	return s.execBatch(ctx, "upsert_bars_1m", batch)
}

func (s *Store) UpsertBars1D(ctx context.Context, bars []Bar1D) error {
	if len(bars) == 0 {
		return nil
	}
	q := fmt.Sprintf(`
    INSERT INTO %s.bars_1d
      (trade_date, exchange, symbol_token, open, high, low, close, volume, source)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (trade_date, exchange, symbol_token) DO UPDATE
      SET open = EXCLUDED.open,
          high = EXCLUDED.high,
          low = EXCLUDED.low,
          close = EXCLUDED.close,
          volume = EXCLUDED.volume,
          source = EXCLUDED.source
  `, quoteIdent(s.Schema))

	batch := &pgx.Batch{}
	for _, bar := range bars {
		batch.Queue(q,
			bar.TradeDate,
			bar.Exchange,
			bar.SymbolToken,
			bar.Open,
			bar.High,
			bar.Low,
			bar.Close,
			bar.Volume,
			bar.Source,
		)
	}
	return s.execBatch(ctx, "upsert_bars_1d", batch)
}

// LatestBar1DDate is the resume checkpoint for idempotent historical backfill.
func (s *Store) LatestBar1DDate(ctx context.Context, exchange, symbolToken string) (*time.Time, error) {
	q := fmt.Sprintf(`SELECT MAX(trade_date) FROM %s.bars_1d WHERE exchange=$1 AND symbol_token=$2`, quoteIdent(s.Schema))
	var latest *time.Time
	err := s.Pool.QueryRow(ctx, q, exchange, symbolToken).Scan(&latest)
	return latest, err
}

func (s *Store) UpsertQuoteSnapshots(ctx context.Context, snaps []QuoteSnapshot) error {
	if len(snaps) == 0 {
		return nil
	}
	q := fmt.Sprintf(`
    INSERT INTO %s.quote_snapshots
      (ts, exchange, symbol_token, ltp, open, high, low, close, last_trade_qty, exch_feed_time, exch_trade_time, net_change, percent_change, avg_price, volume, oi, total_buy_qty, total_sell_qty, upper_circuit, lower_circuit, week52_high, week52_low, bid, ask, bid_qty, ask_qty, reference_limit_price, session_phase, raw)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
    ON CONFLICT (ts, exchange, symbol_token) DO UPDATE
      SET ltp = EXCLUDED.ltp,
          open = EXCLUDED.open,
          high = EXCLUDED.high,
          low = EXCLUDED.low,
          close = EXCLUDED.close,
          last_trade_qty = EXCLUDED.last_trade_qty,
          exch_feed_time = EXCLUDED.exch_feed_time,
          exch_trade_time = EXCLUDED.exch_trade_time,
          net_change = EXCLUDED.net_change,
          percent_change = EXCLUDED.percent_change,
          avg_price = EXCLUDED.avg_price,
          volume = EXCLUDED.volume,
          oi = EXCLUDED.oi,
          total_buy_qty = EXCLUDED.total_buy_qty,
          total_sell_qty = EXCLUDED.total_sell_qty,
          upper_circuit = EXCLUDED.upper_circuit,
          lower_circuit = EXCLUDED.lower_circuit,
          week52_high = EXCLUDED.week52_high,
          week52_low = EXCLUDED.week52_low,
          bid = EXCLUDED.bid,
          ask = EXCLUDED.ask,
          bid_qty = EXCLUDED.bid_qty,
          ask_qty = EXCLUDED.ask_qty,
          reference_limit_price = EXCLUDED.reference_limit_price,
          session_phase = EXCLUDED.session_phase,
          raw = EXCLUDED.raw
  `, quoteIdent(s.Schema))

	batch := &pgx.Batch{}
	for _, snap := range snaps {
		batch.Queue(q,
			snap.Ts,
			snap.Exchange,
			snap.SymbolToken,
			snap.LTP,
			snap.Open,
			snap.High,
			snap.Low,
			snap.Close,
			snap.LastTradeQty,
			snap.ExchFeedTime,
			snap.ExchTradeTime,
			snap.NetChange,
			snap.PercentChange,
			snap.AvgPrice,
			snap.Volume,
			snap.OI,
			snap.TotalBuyQty,
			snap.TotalSellQty,
			snap.UpperCircuit,
			snap.LowerCircuit,
			snap.Week52High,
			snap.Week52Low,
			snap.Bid,
			snap.Ask,
			snap.BidQty,
			snap.AskQty,
			snap.ReferenceLimitPrice,
			nullableString(snap.SessionPhase),
			snap.Raw,
		)
	}
	return s.execBatch(ctx, "upsert_quote_snapshots", batch)
}

func (s *Store) UpsertDepth5Snapshots(ctx context.Context, rows []Depth5Snapshot) error {
	if len(rows) == 0 {
		return nil
	}
	q := fmt.Sprintf(`
    INSERT INTO %s.depth_5_snapshots
      (ts, exchange, symbol_token, side, level, price, quantity, orders, cumulative_quantity, cumulative_notional)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT (ts, exchange, symbol_token, side, level) DO UPDATE
      SET price = EXCLUDED.price,
          quantity = EXCLUDED.quantity,
          orders = EXCLUDED.orders,
          cumulative_quantity = EXCLUDED.cumulative_quantity,
          cumulative_notional = EXCLUDED.cumulative_notional
  `, quoteIdent(s.Schema))

	batch := &pgx.Batch{}
	for _, row := range rows {
		batch.Queue(q,
			row.Ts,
			row.Exchange,
			row.SymbolToken,
			row.Side,
			row.Level,
			row.Price,
			row.Quantity,
			row.Orders,
			row.CumulativeQuantity,
			row.CumulativeNotional,
		)
	}
	return s.execBatch(ctx, "upsert_depth_5_snapshots", batch)
}

func (s *Store) UpsertOISnapshots(ctx context.Context, table string, snaps []OISnapshot) error {
	if len(snaps) == 0 {
		return nil
	}
	target := fmt.Sprintf("%s.%s", quoteIdent(s.Schema), pgx.Identifier{table}.Sanitize())
	q := fmt.Sprintf(`
    INSERT INTO %s
      (ts, exchange, symbol_token, oi, oi_change, oi_change_pct, raw)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (ts, exchange, symbol_token) DO UPDATE
      SET oi = EXCLUDED.oi,
          oi_change = EXCLUDED.oi_change,
          oi_change_pct = EXCLUDED.oi_change_pct,
          raw = EXCLUDED.raw
  `, target)

	batch := &pgx.Batch{}
	for _, snap := range snaps {
		batch.Queue(q,
			snap.Ts,
			snap.Exchange,
			snap.SymbolToken,
			snap.OI,
			snap.OIChange,
			snap.OIChangePct,
			snap.Raw,
		)
	}
	return s.execBatch(ctx, "upsert_oi_snapshots_"+table, batch)
}

func (s *Store) UpsertPCRSnapshots(ctx context.Context, snaps []PCRSnapshot) error {
	if len(snaps) == 0 {
		return nil
	}
	q := fmt.Sprintf(`
    INSERT INTO %s.pcr_snapshots
      (ts, underlying, expiry, pcr, ce_oi, pe_oi, raw)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (ts, underlying, expiry) DO UPDATE
      SET pcr = EXCLUDED.pcr,
          ce_oi = EXCLUDED.ce_oi,
          pe_oi = EXCLUDED.pe_oi,
          raw = EXCLUDED.raw
  `, quoteIdent(s.Schema))

	batch := &pgx.Batch{}
	for _, snap := range snaps {
		batch.Queue(q,
			snap.Ts,
			snap.Underlying,
			snap.Expiry,
			snap.PCR,
			snap.CEOI,
			snap.PEOI,
			snap.Raw,
		)
	}
	return s.execBatch(ctx, "upsert_pcr_snapshots", batch)
}

func (s *Store) UpsertOptionGreeks(ctx context.Context, snaps []OptionGreek) error {
	if len(snaps) == 0 {
		return nil
	}
	q := fmt.Sprintf(`
    INSERT INTO %s.option_greeks
      (ts, underlying, expiry, tradingsymbol, strike, "right", iv, delta, gamma, theta, vega, ltp, trade_volume, raw)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    ON CONFLICT (ts, tradingsymbol) DO UPDATE
      SET underlying = EXCLUDED.underlying,
          expiry = EXCLUDED.expiry,
          strike = EXCLUDED.strike,
          "right" = EXCLUDED."right",
          iv = EXCLUDED.iv,
          delta = EXCLUDED.delta,
          gamma = EXCLUDED.gamma,
          theta = EXCLUDED.theta,
          vega = EXCLUDED.vega,
          ltp = EXCLUDED.ltp,
          trade_volume = EXCLUDED.trade_volume,
          raw = EXCLUDED.raw
  `, quoteIdent(s.Schema))

	batch := &pgx.Batch{}
	for _, snap := range snaps {
		batch.Queue(q,
			snap.Ts,
			snap.Underlying,
			snap.Expiry,
			snap.TradingSymbol,
			snap.Strike,
			nullableString(snap.Right),
			snap.IV,
			snap.Delta,
			snap.Gamma,
			snap.Theta,
			snap.Vega,
			snap.LTP,
			snap.TradeVolume,
			snap.Raw,
		)
	}
	return s.execBatch(ctx, "upsert_option_greeks", batch)
}

func (s *Store) UpsertGainersLosersSnapshots(ctx context.Context, snaps []GainersLosersSnapshot) error {
	if len(snaps) == 0 {
		return nil
	}
	q := fmt.Sprintf(`
    INSERT INTO %s.gainers_losers_snapshots
      (ts, exchange, label, params, raw)
    VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (ts, exchange, label) DO UPDATE
      SET params = EXCLUDED.params,
          raw = EXCLUDED.raw
  `, quoteIdent(s.Schema))

	batch := &pgx.Batch{}
	for _, snap := range snaps {
		batch.Queue(q,
			snap.Ts,
			snap.Exchange,
			snap.Label,
			snap.Params,
			snap.Raw,
		)
	}
	return s.execBatch(ctx, "upsert_gainers_losers_snapshots", batch)
}

func (s *Store) UpsertOIBuildupSnapshots(ctx context.Context, snaps []OIBuildupSnapshot) error {
	if len(snaps) == 0 {
		return nil
	}
	q := fmt.Sprintf(`
    INSERT INTO %s.oibuildup_snapshots
      (ts, exchange, label, params, raw)
    VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (ts, exchange, label) DO UPDATE
      SET params = EXCLUDED.params,
          raw = EXCLUDED.raw
  `, quoteIdent(s.Schema))

	batch := &pgx.Batch{}
	for _, snap := range snaps {
		batch.Queue(q,
			snap.Ts,
			snap.Exchange,
			snap.Label,
			snap.Params,
			snap.Raw,
		)
	}
	return s.execBatch(ctx, "upsert_oibuildup_snapshots", batch)
}

func (s *Store) UpsertPutCallRatioSnapshots(ctx context.Context, snaps []PutCallRatioSnapshot) error {
	if len(snaps) == 0 {
		return nil
	}
	q := fmt.Sprintf(`
    INSERT INTO %s.putcallratio_snapshots
      (ts, label, params, raw)
    VALUES ($1,$2,$3,$4)
    ON CONFLICT (ts, label) DO UPDATE
      SET params = EXCLUDED.params,
          raw = EXCLUDED.raw
  `, quoteIdent(s.Schema))

	batch := &pgx.Batch{}
	for _, snap := range snaps {
		batch.Queue(q,
			snap.Ts,
			snap.Label,
			snap.Params,
			snap.Raw,
		)
	}
	return s.execBatch(ctx, "upsert_putcallratio_snapshots", batch)
}

func (s *Store) SyncInstrumentUniverse(ctx context.Context, entries []InstrumentUniverseEntry) error {
	if len(entries) == 0 {
		return nil
	}
	universeNames := map[string]struct{}{}
	for _, entry := range entries {
		name := strings.TrimSpace(entry.UniverseName)
		if name == "" {
			continue
		}
		universeNames[name] = struct{}{}
	}
	for name := range universeNames {
		q := fmt.Sprintf(`
    UPDATE %s.instrument_universe
      SET active_to = now()
    WHERE universe_name = $1 AND active_to IS NULL
  `, quoteIdent(s.Schema))
		if _, err := s.exec(ctx, "deactivate_universe", q, name); err != nil {
			return err
		}
	}
	q := fmt.Sprintf(`
    INSERT INTO %s.instrument_universe
      (universe_name, exchange, symbol_token, tradingsymbol, underlying, expiry, strike, "right", instrumenttype, weight, metadata, active_from, active_to)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),NULL)
    ON CONFLICT (universe_name, exchange, symbol_token) DO UPDATE
      SET tradingsymbol = EXCLUDED.tradingsymbol,
          underlying = EXCLUDED.underlying,
          expiry = EXCLUDED.expiry,
          strike = EXCLUDED.strike,
          "right" = EXCLUDED."right",
          instrumenttype = EXCLUDED.instrumenttype,
          weight = EXCLUDED.weight,
          metadata = EXCLUDED.metadata,
          active_to = NULL,
          active_from = COALESCE(%s.instrument_universe.active_from, EXCLUDED.active_from)
  `, quoteIdent(s.Schema), quoteIdent(s.Schema))
	batch := &pgx.Batch{}
	for _, entry := range entries {
		meta := entry.Metadata
		if len(meta) == 0 {
			meta = []byte(`{}`)
		}
		batch.Queue(q,
			entry.UniverseName,
			entry.Exchange,
			entry.SymbolToken,
			nullableString(entry.TradingSymbol),
			nullableString(entry.Underlying),
			entry.Expiry,
			entry.Strike,
			nullableString(entry.Right),
			nullableString(entry.InstrumentType),
			entry.Weight,
			meta,
		)
	}
	return s.execBatch(ctx, "sync_instrument_universe", batch)
}

func (s *Store) UpsertIndexConstituents(ctx context.Context, rows []IndexConstituent) error {
	if len(rows) == 0 {
		return nil
	}
	q := fmt.Sprintf(`
    INSERT INTO %s.index_constituents
      (index_name, exchange, symbol, symbol_token, weight, macro_sector, sector, industry, basic_industry, as_of_date, metadata)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (index_name, exchange, symbol) DO UPDATE
      SET symbol_token = EXCLUDED.symbol_token,
          weight = EXCLUDED.weight,
          macro_sector = EXCLUDED.macro_sector,
          sector = EXCLUDED.sector,
          industry = EXCLUDED.industry,
          basic_industry = EXCLUDED.basic_industry,
          as_of_date = EXCLUDED.as_of_date,
          metadata = EXCLUDED.metadata,
          updated_at = now()
  `, quoteIdent(s.Schema))

	batch := &pgx.Batch{}
	for _, row := range rows {
		meta := row.Metadata
		if len(meta) == 0 {
			meta = []byte(`{}`)
		}
		batch.Queue(q,
			row.IndexName,
			row.Exchange,
			row.Symbol,
			nullableString(row.SymbolToken),
			row.Weight,
			nullableString(row.MacroSector),
			nullableString(row.Sector),
			nullableString(row.Industry),
			nullableString(row.BasicIndustry),
			row.AsOfDate,
			meta,
		)
	}
	return s.execBatch(ctx, "upsert_index_constituents", batch)
}

func (s *Store) ReplaceDerivativeTokenPlan(ctx context.Context, planName string, planDate time.Time, rows []DerivativeTokenPlanEntry) error {
	planName = strings.TrimSpace(planName)
	if planName == "" {
		return fmt.Errorf("plan name is required")
	}
	normalizedPlanDate := time.Date(planDate.Year(), planDate.Month(), planDate.Day(), 0, 0, 0, 0, time.UTC)
	return s.WithTx(ctx, func(tx pgx.Tx) error {
		deleteSQL := fmt.Sprintf(`DELETE FROM %s.derivative_token_plan WHERE plan_name = $1 AND plan_date = $2`, quoteIdent(s.Schema))
		if _, err := tx.Exec(ctx, deleteSQL, planName, normalizedPlanDate); err != nil {
			return err
		}
		if len(rows) == 0 {
			return nil
		}
		insertSQL := fmt.Sprintf(`
    INSERT INTO %s.derivative_token_plan
      (plan_name, plan_date, underlying, exchange, symbol_token, mode, tradingsymbol, contract_kind, selection_label, expiry, expiry_rank, is_monthly_expiry, strike, "right", strike_step, strike_offset, underlying_price, instrumenttype, lotsize, priority, active, reason, metadata)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
  `, quoteIdent(s.Schema))
		batch := &pgx.Batch{}
		for _, row := range rows {
			row.PlanName = planName
			row.PlanDate = normalizedPlanDate
			batch.Queue(insertSQL,
				row.PlanName,
				row.PlanDate,
				row.Underlying,
				row.Exchange,
				row.SymbolToken,
				row.Mode,
				row.TradingSymbol,
				row.ContractKind,
				row.SelectionLabel,
				row.Expiry,
				row.ExpiryRank,
				row.IsMonthlyExpiry,
				row.Strike,
				nullableString(row.Right),
				row.StrikeStep,
				row.StrikeOffset,
				row.UnderlyingPrice,
				nullableString(row.InstrumentType),
				row.LotSize,
				row.Priority,
				row.Active,
				nullableString(row.Reason),
				row.Metadata,
			)
		}
		br := tx.SendBatch(ctx, batch)
		defer br.Close()
		for i := 0; i < batch.Len(); i++ {
			if _, err := br.Exec(); err != nil {
				return err
			}
		}
		return nil
	})
}

func (s *Store) ListLatestDerivativeTokenPlan(ctx context.Context, planName string) ([]DerivativeTokenPlanEntry, error) {
	planName = strings.TrimSpace(planName)
	if planName == "" {
		return nil, fmt.Errorf("plan name is required")
	}
	q := fmt.Sprintf(`
    SELECT
      plan_name,
      plan_date,
      underlying,
      exchange,
      symbol_token,
      mode,
      tradingsymbol,
      contract_kind,
      selection_label,
      expiry,
      expiry_rank,
      is_monthly_expiry,
      strike,
      COALESCE("right", ''),
      strike_step,
      strike_offset,
      underlying_price,
      COALESCE(instrumenttype, ''),
      lotsize,
      priority,
      active,
      COALESCE(reason, ''),
      metadata
    FROM %s.derivative_token_plan
    WHERE plan_name = $1
      AND plan_date = (
        SELECT MAX(plan_date) FROM %s.derivative_token_plan WHERE plan_name = $1
      )
    ORDER BY underlying, contract_kind, expiry_rank, strike NULLS FIRST, "right"
  `, quoteIdent(s.Schema), quoteIdent(s.Schema))
	start := time.Now()
	rows, err := s.Pool.Query(ctx, q, planName)
	if err != nil {
		s.logQuery("list_derivative_token_plan", start, 1, err)
		return nil, err
	}
	defer rows.Close()
	entries := make([]DerivativeTokenPlanEntry, 0)
	for rows.Next() {
		var entry DerivativeTokenPlanEntry
		if err := rows.Scan(
			&entry.PlanName,
			&entry.PlanDate,
			&entry.Underlying,
			&entry.Exchange,
			&entry.SymbolToken,
			&entry.Mode,
			&entry.TradingSymbol,
			&entry.ContractKind,
			&entry.SelectionLabel,
			&entry.Expiry,
			&entry.ExpiryRank,
			&entry.IsMonthlyExpiry,
			&entry.Strike,
			&entry.Right,
			&entry.StrikeStep,
			&entry.StrikeOffset,
			&entry.UnderlyingPrice,
			&entry.InstrumentType,
			&entry.LotSize,
			&entry.Priority,
			&entry.Active,
			&entry.Reason,
			&entry.Metadata,
		); err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}
	err = rows.Err()
	s.logQuery("list_derivative_token_plan", start, 1, err)
	return entries, err
}

func (s *Store) RefreshSymbolPerfSnapshot(ctx context.Context, indexName string, snapshot time.Time, tradeDate time.Time, tzName string) error {
	if strings.TrimSpace(indexName) == "" {
		return nil
	}
	if tzName == "" {
		tzName = "Asia/Kolkata"
	}
	tradeDateStr := tradeDate.Format("2006-01-02")
	q := fmt.Sprintf(`
    INSERT INTO %s.symbol_perf_snapshot
      (ts, index_name, exchange, symbol, symbol_token, last_price, pct_intraday, pct_1d, pct_1w, volume_today, quality_flags)
    SELECT
      $2::timestamptz,
      c.index_name,
      c.exchange,
      c.symbol,
      c.symbol_token,
      c.last_price,
      CASE
        WHEN c.open_price IS NULL OR c.open_price = 0 OR c.last_price IS NULL THEN NULL
        ELSE (c.last_price - c.open_price) / c.open_price * 100
      END AS pct_intraday,
      CASE
        WHEN c.prev_close IS NULL OR c.prev_close = 0 OR c.last_price IS NULL THEN NULL
        ELSE (c.last_price - c.prev_close) / c.prev_close * 100
      END AS pct_1d,
      CASE
        WHEN c.week_close IS NULL OR c.week_close = 0 OR c.last_price IS NULL THEN NULL
        ELSE (c.last_price - c.week_close) / c.week_close * 100
      END AS pct_1w,
      c.volume_today,
      jsonb_build_object(
        'stale', (c.last_seen_ts IS NULL OR c.last_seen_ts < ($2::timestamptz - interval '120 seconds')),
        'last_seen_ts', c.last_seen_ts,
        'last_source', c.last_source
      ) AS quality_flags
    FROM (
      SELECT
        ic.index_name,
        ic.exchange,
        ic.symbol,
        ic.symbol_token,
        s.last_seen_ts,
        s.last_source,
        COALESCE(s.last_price, day_close.close) AS last_price,
        COALESCE(s.last_open, day_open.open) AS open_price,
        COALESCE(s.last_close, prev.close) AS prev_close,
        week.close AS week_close,
        COALESCE(s.last_volume, day_volume.volume_today) AS volume_today
      FROM %s.index_constituents ic
      LEFT JOIN %s.instrument_state s
        ON s.exchange = ic.exchange AND s.symbol_token = ic.symbol_token
      LEFT JOIN LATERAL (
        SELECT b.open
        FROM %s.bars_1m b
        WHERE b.exchange = ic.exchange
          AND b.symbol_token = ic.symbol_token
          AND b.ts >= ($3::date::timestamp AT TIME ZONE $4)
          AND b.ts < (($3::date + 1)::timestamp AT TIME ZONE $4)
        ORDER BY b.ts ASC
        LIMIT 1
      ) AS day_open ON true
      LEFT JOIN LATERAL (
        SELECT b.close
        FROM %s.bars_1m b
        WHERE b.exchange = ic.exchange
          AND b.symbol_token = ic.symbol_token
          AND b.ts >= ($3::date::timestamp AT TIME ZONE $4)
          AND b.ts < (($3::date + 1)::timestamp AT TIME ZONE $4)
        ORDER BY b.ts DESC
        LIMIT 1
      ) AS day_close ON true
      LEFT JOIN LATERAL (
        SELECT SUM(b.volume) AS volume_today
        FROM %s.bars_1m b
        WHERE b.exchange = ic.exchange
          AND b.symbol_token = ic.symbol_token
          AND b.ts >= ($3::date::timestamp AT TIME ZONE $4)
          AND b.ts < (($3::date + 1)::timestamp AT TIME ZONE $4)
      ) AS day_volume ON true
      LEFT JOIN LATERAL (
        SELECT b.close
        FROM %s.bars_1d b
        WHERE b.exchange = ic.exchange
          AND b.symbol_token = ic.symbol_token
          AND b.trade_date < $3::date
        ORDER BY b.trade_date DESC
        LIMIT 1
      ) AS prev ON true
      LEFT JOIN LATERAL (
        SELECT b.close
        FROM %s.bars_1d b
        WHERE b.exchange = ic.exchange
          AND b.symbol_token = ic.symbol_token
          AND b.trade_date < $3::date
        ORDER BY b.trade_date DESC
        OFFSET 4
        LIMIT 1
      ) AS week ON true
      WHERE ic.index_name = $1
    ) c
  `, quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema))

	_, err := s.exec(ctx, "refresh_symbol_perf_snapshot", q, indexName, snapshot, tradeDateStr, tzName)
	return err
}

func (s *Store) UpsertSourceSLAs(ctx context.Context, slas []SourceSLA) error {
	if len(slas) == 0 {
		return nil
	}
	q := fmt.Sprintf(`
    INSERT INTO %s.source_sla
      (source_name, universe_name, dataset, expected_interval_seconds, max_staleness_seconds, bar_late_seconds, endpoint, priority, enabled)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (source_name, universe_name) DO UPDATE
      SET dataset = EXCLUDED.dataset,
          expected_interval_seconds = EXCLUDED.expected_interval_seconds,
          max_staleness_seconds = EXCLUDED.max_staleness_seconds,
          bar_late_seconds = EXCLUDED.bar_late_seconds,
          endpoint = EXCLUDED.endpoint,
          priority = EXCLUDED.priority,
          enabled = EXCLUDED.enabled,
          updated_at = now()
  `, quoteIdent(s.Schema))
	batch := &pgx.Batch{}
	for _, sla := range slas {
		batch.Queue(q,
			sla.SourceName,
			sla.UniverseName,
			sla.Dataset,
			sla.ExpectedIntervalSeconds,
			sla.MaxStalenessSeconds,
			sla.BarLateSeconds,
			nullableString(sla.Endpoint),
			nullableString(sla.Priority),
			sla.Enabled,
		)
	}
	return s.execBatch(ctx, "upsert_source_sla", batch)
}

func (s *Store) UpsertTradingCalendar(ctx context.Context, days []TradingDay) error {
	if len(days) == 0 {
		return nil
	}
	q := fmt.Sprintf(`
    INSERT INTO %s.trading_calendar
      (trade_date, market_open_ts, market_close_ts, is_trading_day, note)
    VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (trade_date) DO UPDATE
      SET market_open_ts = EXCLUDED.market_open_ts,
          market_close_ts = EXCLUDED.market_close_ts,
          is_trading_day = EXCLUDED.is_trading_day,
          note = EXCLUDED.note,
          updated_at = now()
  `, quoteIdent(s.Schema))
	batch := &pgx.Batch{}
	for _, day := range days {
		tradeDate := time.Date(day.TradeDate.Year(), day.TradeDate.Month(), day.TradeDate.Day(), 0, 0, 0, 0, time.UTC)
		batch.Queue(q,
			tradeDate,
			day.MarketOpen,
			day.MarketClose,
			day.IsTradingDay,
			nullableString(day.Note),
		)
	}
	return s.execBatch(ctx, "upsert_trading_calendar", batch)
}

func (s *Store) UpsertInstrumentStates(ctx context.Context, states []InstrumentState) error {
	if len(states) == 0 {
		return nil
	}
	q := fmt.Sprintf(`
    INSERT INTO %s.instrument_state
      (exchange, symbol_token, last_seen_ts, last_price, last_source, last_bid, last_ask, last_bid_qty, last_ask_qty, last_trade_qty, last_open, last_high, last_low, last_close, last_volume, last_oi, last_oi_change_pct, total_buy_qty, total_sell_qty, avg_price, net_change, percent_change, upper_circuit, lower_circuit, week52_high, week52_low)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
    ON CONFLICT (exchange, symbol_token) DO UPDATE
      SET last_seen_ts = EXCLUDED.last_seen_ts,
          last_price = EXCLUDED.last_price,
          last_source = EXCLUDED.last_source,
          last_bid = COALESCE(EXCLUDED.last_bid, %s.instrument_state.last_bid),
          last_ask = COALESCE(EXCLUDED.last_ask, %s.instrument_state.last_ask),
          last_bid_qty = COALESCE(EXCLUDED.last_bid_qty, %s.instrument_state.last_bid_qty),
          last_ask_qty = COALESCE(EXCLUDED.last_ask_qty, %s.instrument_state.last_ask_qty),
          last_trade_qty = COALESCE(EXCLUDED.last_trade_qty, %s.instrument_state.last_trade_qty),
          last_open = COALESCE(EXCLUDED.last_open, %s.instrument_state.last_open),
          last_high = COALESCE(EXCLUDED.last_high, %s.instrument_state.last_high),
          last_low = COALESCE(EXCLUDED.last_low, %s.instrument_state.last_low),
          last_close = COALESCE(EXCLUDED.last_close, %s.instrument_state.last_close),
          last_volume = COALESCE(EXCLUDED.last_volume, %s.instrument_state.last_volume),
          last_oi = COALESCE(EXCLUDED.last_oi, %s.instrument_state.last_oi),
          last_oi_change_pct = COALESCE(EXCLUDED.last_oi_change_pct, %s.instrument_state.last_oi_change_pct),
          total_buy_qty = COALESCE(EXCLUDED.total_buy_qty, %s.instrument_state.total_buy_qty),
          total_sell_qty = COALESCE(EXCLUDED.total_sell_qty, %s.instrument_state.total_sell_qty),
          avg_price = COALESCE(EXCLUDED.avg_price, %s.instrument_state.avg_price),
          net_change = COALESCE(EXCLUDED.net_change, %s.instrument_state.net_change),
          percent_change = COALESCE(EXCLUDED.percent_change, %s.instrument_state.percent_change),
          upper_circuit = COALESCE(EXCLUDED.upper_circuit, %s.instrument_state.upper_circuit),
          lower_circuit = COALESCE(EXCLUDED.lower_circuit, %s.instrument_state.lower_circuit),
          week52_high = COALESCE(EXCLUDED.week52_high, %s.instrument_state.week52_high),
          week52_low = COALESCE(EXCLUDED.week52_low, %s.instrument_state.week52_low),
          updated_at = now()
  `, quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema))
	batch := &pgx.Batch{}
	for _, state := range states {
		batch.Queue(q,
			state.Exchange,
			state.SymbolToken,
			state.LastSeen,
			state.LastPrice,
			nullableString(state.LastSource),
			state.LastBid,
			state.LastAsk,
			state.LastBidQty,
			state.LastAskQty,
			state.LastTradeQty,
			state.LastOpen,
			state.LastHigh,
			state.LastLow,
			state.LastClose,
			state.LastVolume,
			state.LastOI,
			state.LastOIChangePct,
			state.TotalBuyQty,
			state.TotalSellQty,
			state.AvgPrice,
			state.NetChange,
			state.PercentChange,
			state.UpperCircuit,
			state.LowerCircuit,
			state.Week52High,
			state.Week52Low,
		)
	}
	return s.execBatch(ctx, "upsert_instrument_state", batch)
}

func (s *Store) InsertAPIRequestLogs(ctx context.Context, logs []APIRequestLog) error {
	if len(logs) == 0 {
		return nil
	}
	q := fmt.Sprintf(`
    INSERT INTO %s.api_request_log
      (ts, endpoint, name, success, throttled, latency_ms, symbols_requested, symbols_returned, http_status,
       retry_count, cache_hit, api_error_code, error_message)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
  `, quoteIdent(s.Schema))
	batch := &pgx.Batch{}
	for _, log := range logs {
		batch.Queue(q,
			log.Ts,
			log.Endpoint,
			log.Name,
			log.Success,
			log.Throttled,
			log.LatencyMs,
			log.SymbolsRequested,
			log.SymbolsReturned,
			log.HTTPStatus,
			log.RetryCount,
			log.CacheHit,
			nullableString(log.APIErrorCode),
			nullableString(log.ErrorMessage),
		)
	}
	return s.execBatch(ctx, "insert_api_request_log", batch)
}

func (s *Store) UpsertMetrics1m(ctx context.Context, rows []MetricsRow) error {
	if len(rows) == 0 {
		return nil
	}
	q := fmt.Sprintf(`
    INSERT INTO %s.metrics_1m
      (minute_ts, source_name, universe_name, expected_instruments, seen_instruments, coverage_ratio, staleness_p50_sec, staleness_p95_sec, staleness_max_sec, missing_instruments, api_429_count, api_error_count, api_latency_p95_ms, bars_expected, bars_written, bars_missing, bars_late)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
    ON CONFLICT (minute_ts, source_name, universe_name) DO UPDATE
      SET expected_instruments = EXCLUDED.expected_instruments,
          seen_instruments = EXCLUDED.seen_instruments,
          coverage_ratio = EXCLUDED.coverage_ratio,
          staleness_p50_sec = EXCLUDED.staleness_p50_sec,
          staleness_p95_sec = EXCLUDED.staleness_p95_sec,
          staleness_max_sec = EXCLUDED.staleness_max_sec,
          missing_instruments = EXCLUDED.missing_instruments,
          api_429_count = EXCLUDED.api_429_count,
          api_error_count = EXCLUDED.api_error_count,
          api_latency_p95_ms = EXCLUDED.api_latency_p95_ms,
          bars_expected = EXCLUDED.bars_expected,
          bars_written = EXCLUDED.bars_written,
          bars_missing = EXCLUDED.bars_missing,
          bars_late = EXCLUDED.bars_late,
          created_at = now()
  `, quoteIdent(s.Schema))
	batch := &pgx.Batch{}
	for _, row := range rows {
		batch.Queue(q,
			row.MinuteTs,
			row.SourceName,
			row.UniverseName,
			row.ExpectedInstruments,
			row.SeenInstruments,
			row.CoverageRatio,
			row.StalenessP50Sec,
			row.StalenessP95Sec,
			row.StalenessMaxSec,
			row.MissingInstruments,
			row.API429Count,
			row.APIErrorCount,
			row.APILatencyP95Ms,
			row.BarsExpected,
			row.BarsWritten,
			row.BarsMissing,
			row.BarsLate,
		)
	}
	return s.execBatch(ctx, "upsert_metrics_1m", batch)
}

func (s *Store) InstrumentStateStats(ctx context.Context, universeName string, now time.Time, staleBefore time.Time) (InstrumentStateStats, error) {
	stats := InstrumentStateStats{}
	q := fmt.Sprintf(`
    WITH expected AS (
      SELECT exchange, symbol_token
      FROM %s.instrument_universe
      WHERE universe_name = $1 AND active_to IS NULL
    ),
    state AS (
      SELECT e.exchange, e.symbol_token, s.last_seen_ts
      FROM expected e
      LEFT JOIN %s.instrument_state s
        ON s.exchange = e.exchange AND s.symbol_token = e.symbol_token
    )
    SELECT
      COUNT(*) AS expected,
      COUNT(*) FILTER (WHERE last_seen_ts >= $2) AS seen,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ($3 - last_seen_ts))) FILTER (WHERE last_seen_ts IS NOT NULL) AS p50,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ($3 - last_seen_ts))) FILTER (WHERE last_seen_ts IS NOT NULL) AS p95,
      MAX(EXTRACT(EPOCH FROM ($3 - last_seen_ts))) FILTER (WHERE last_seen_ts IS NOT NULL) AS max
    FROM state
  `, quoteIdent(s.Schema), quoteIdent(s.Schema))
	start := time.Now()
	row := s.Pool.QueryRow(ctx, q, universeName, staleBefore, now)
	if err := row.Scan(&stats.Expected, &stats.Seen, &stats.P50, &stats.P95, &stats.Max); err != nil {
		s.logQuery("instrument_state_stats", start, 3, err)
		return stats, err
	}
	s.logQuery("instrument_state_stats", start, 3, nil)
	return stats, nil
}

func (s *Store) Bars1mStats(ctx context.Context, universeName string, minute time.Time, lateAfter time.Time) (Bars1mStats, error) {
	stats := Bars1mStats{}
	q := fmt.Sprintf(`
    WITH expected AS (
      SELECT exchange, symbol_token
      FROM %s.instrument_universe
      WHERE universe_name = $1 AND active_to IS NULL
    )
    SELECT
      (SELECT COUNT(*) FROM expected) AS expected,
      (SELECT COUNT(*) FROM %s.bars_1m b
        JOIN expected e ON b.exchange = e.exchange AND b.symbol_token = e.symbol_token
        WHERE b.ts = $2) AS written,
      (SELECT COUNT(*) FROM %s.bars_1m b
        JOIN expected e ON b.exchange = e.exchange AND b.symbol_token = e.symbol_token
        WHERE b.ts = $2 AND b.created_at > $3) AS late
  `, quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema))
	start := time.Now()
	row := s.Pool.QueryRow(ctx, q, universeName, minute, lateAfter)
	if err := row.Scan(&stats.Expected, &stats.Written, &stats.Late); err != nil {
		s.logQuery("bars_1m_stats", start, 3, err)
		return stats, err
	}
	s.logQuery("bars_1m_stats", start, 3, nil)
	return stats, nil
}

func (s *Store) SnapshotLastSeen(ctx context.Context, table string) (time.Time, error) {
	var last pgtype.Timestamptz
	q := fmt.Sprintf("SELECT max(ts) FROM %s.%s", quoteIdent(s.Schema), table)
	start := time.Now()
	row := s.Pool.QueryRow(ctx, q)
	if err := row.Scan(&last); err != nil {
		s.logQuery("snapshot_last_seen", start, 0, err)
		return time.Time{}, err
	}
	s.logQuery("snapshot_last_seen", start, 0, nil)
	if !last.Valid {
		return time.Time{}, nil
	}
	return last.Time, nil
}

func (s *Store) APIRequestStats(ctx context.Context, endpoint string, startTime, endTime time.Time) (APIRequestStats, error) {
	stats := APIRequestStats{}
	q := fmt.Sprintf(`
    SELECT
      COUNT(*) FILTER (WHERE throttled) AS throttled,
      COUNT(*) FILTER (WHERE NOT success) AS errors,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95
    FROM %s.api_request_log
    WHERE ts >= $1 AND ts < $2 AND endpoint = $3
  `, quoteIdent(s.Schema))
	start := time.Now()
	row := s.Pool.QueryRow(ctx, q, startTime, endTime, endpoint)
	if err := row.Scan(&stats.Throttled, &stats.Errors, &stats.P95Ms); err != nil {
		s.logQuery("api_request_stats", start, 3, err)
		return stats, err
	}
	s.logQuery("api_request_stats", start, 3, nil)
	return stats, nil
}

func (s *Store) UpsertWatermark(ctx context.Context, exchange, token string, ts time.Time) error {
	q := fmt.Sprintf(`
    INSERT INTO %s.watermarks (exchange, symbol_token, last_completed_minute)
    VALUES ($1,$2,$3)
    ON CONFLICT (exchange, symbol_token) DO UPDATE
      SET last_completed_minute = EXCLUDED.last_completed_minute,
          updated_at = now()
  `, quoteIdent(s.Schema))
	_, err := s.exec(ctx, "upsert_watermark", q, exchange, token, ts)
	return err
}

func (s *Store) UpsertWatermarks(ctx context.Context, bars []Bar) error {
	if len(bars) == 0 {
		return nil
	}
	latest := map[string]time.Time{}
	for _, bar := range bars {
		key := bar.Exchange + ":" + bar.SymbolToken
		if current, ok := latest[key]; !ok || bar.Ts.After(current) {
			latest[key] = bar.Ts
		}
	}
	q := fmt.Sprintf(`
    INSERT INTO %s.watermarks (exchange, symbol_token, last_completed_minute)
    VALUES ($1,$2,$3)
    ON CONFLICT (exchange, symbol_token) DO UPDATE
      SET last_completed_minute = EXCLUDED.last_completed_minute,
          updated_at = now()
  `, quoteIdent(s.Schema))

	batch := &pgx.Batch{}
	for key, ts := range latest {
		parts := strings.SplitN(key, ":", 2)
		exchange := parts[0]
		token := ""
		if len(parts) > 1 {
			token = parts[1]
		}
		batch.Queue(q, exchange, token, ts)
	}
	return s.execBatch(ctx, "upsert_watermarks", batch)
}

func (s *Store) exec(ctx context.Context, op string, sql string, args ...any) (pgconn.CommandTag, error) {
	start := time.Now()
	tag, err := s.Pool.Exec(ctx, sql, args...)
	s.logQuery(op, start, len(args), err)
	return tag, err
}

func (s *Store) execBatch(ctx context.Context, op string, batch *pgx.Batch) error {
	start := time.Now()
	br := s.Pool.SendBatch(ctx, batch)
	defer br.Close()
	var err error
	for i := 0; i < batch.Len(); i++ {
		if _, execErr := br.Exec(); execErr != nil {
			err = execErr
			break
		}
	}
	s.logQuery(op, start, batch.Len(), err)
	return err
}

func (s *Store) logQuery(op string, start time.Time, argsCount int, err error) {
	if s.Logger == nil {
		return
	}
	duration := time.Since(start)
	fields := []any{
		"op", op,
		"duration_ms", duration.Milliseconds(),
		"args_count", argsCount,
	}
	if err != nil {
		s.Logger.Warn("sql_error", append(fields, "err", err)...)
		return
	}
	if s.SlowQuery > 0 && duration >= s.SlowQuery {
		s.Logger.Warn("sql_slow", fields...)
		return
	}
	s.Logger.Debug("sql_ok", fields...)
}

func quoteIdent(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "public"
	}
	return pgx.Identifier{value}.Sanitize()
}

func nullableString(value string) *string {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	return &value
}
