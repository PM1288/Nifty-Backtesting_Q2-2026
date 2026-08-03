package store

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type StrategyRun struct {
	RunID      string
	StartedAt  time.Time
	FinishedAt *time.Time
	Status     string
	Error      *string
	ConfigHash string
}

type StrategyState struct {
	Ts    time.Time
	Name  string
	Value string
	Raw   []byte
}

type StrategySignal struct {
	Ts          time.Time
	Strategy    string
	Exchange    string
	SymbolToken string
	Side        string
	Confidence  float64
	EntryPrice  float64
	StopLoss    float64
	TakeProfit  float64
	Timeframe   string
	Reason      string
	Raw         []byte
}

type StrategyCooldown struct {
	Strategy      string
	Exchange      string
	SymbolToken   string
	CooldownUntil time.Time
}

type PaperOrder struct {
	OrderID     string
	CreatedAt   time.Time
	Strategy    string
	Exchange    string
	SymbolToken string
	Side        string
	Qty         int64
	OrderType   string
	Price       float64
	Status      string
	FilledQty   int64
	FilledPrice float64
	Raw         []byte
}

type PaperTrade struct {
	TradeID     string
	OrderID     string
	Ts          time.Time
	Strategy    string
	Exchange    string
	SymbolToken string
	Side        string
	Qty         int64
	Price       float64
	Fees        float64
	Raw         []byte
}

type PaperPosition struct {
	Exchange      string
	SymbolToken   string
	Strategy      string
	Side          string
	Qty           int64
	AvgPrice      float64
	EntryPrice    *float64
	EntryTs       *time.Time
	StopLoss      *float64
	TakeProfit    *float64
	RealizedPNL   float64
	UnrealizedPNL float64
	UpdatedAt     time.Time
}

type PaperTradeView struct {
	TradeID       string     `json:"tradeId"`
	OrderID       string     `json:"orderId"`
	Ts            time.Time  `json:"ts"`
	Strategy      string     `json:"strategy"`
	Exchange      string     `json:"exchange"`
	SymbolToken   string     `json:"symbolToken"`
	Side          string     `json:"side"`
	Qty           int64      `json:"qty"`
	Price         float64    `json:"price"`
	Fees          float64    `json:"fees"`
	TradingSymbol string     `json:"tradingSymbol"`
	Underlying    string     `json:"underlying"`
	Right         string     `json:"right"`
	Expiry        *time.Time `json:"expiry,omitempty"`
	Strike        float64    `json:"strike"`
	Raw           []byte     `json:"-"`
}

type PaperSummary struct {
	TotalRealized   float64            `json:"totalRealized"`
	TotalUnrealized float64            `json:"totalUnrealized"`
	TotalPnL        float64            `json:"totalPnL"`
	OpenPositions   int64              `json:"openPositions"`
	ClosedPositions int64              `json:"closedPositions"`
	TradeCount      int64              `json:"tradeCount"`
	OrderCount      int64              `json:"orderCount"`
	ByStrategy      map[string]float64 `json:"byStrategy"`
}

func (s *Store) InsertStrategyRun(ctx context.Context, run StrategyRun) error {
	stmt := fmt.Sprintf(`
INSERT INTO %s.strategy_runs
  (run_id, started_at, status, error, config_hash)
VALUES ($1,$2,$3,$4,$5)
ON CONFLICT (run_id) DO NOTHING`, quoteIdent(s.Schema))
	_, err := s.exec(ctx, "insert_strategy_run", stmt, run.RunID, run.StartedAt, run.Status, run.Error, run.ConfigHash)
	return err
}

func (s *Store) FinishStrategyRun(ctx context.Context, runID, status string, errMsg *string) error {
	stmt := fmt.Sprintf(`
UPDATE %s.strategy_runs
SET finished_at = now(), status = $2, error = $3
WHERE run_id = $1`, quoteIdent(s.Schema))
	_, err := s.exec(ctx, "finish_strategy_run", stmt, runID, status, errMsg)
	return err
}

func (s *Store) UpsertStrategyStates(ctx context.Context, states []StrategyState) error {
	if len(states) == 0 {
		return nil
	}
	stmt := fmt.Sprintf(`
INSERT INTO %s.strategy_state
  (ts, name, value, raw)
VALUES ($1,$2,$3,$4)
ON CONFLICT (ts, name) DO UPDATE SET value = EXCLUDED.value, raw = EXCLUDED.raw`, quoteIdent(s.Schema))
	batch := &pgx.Batch{}
	for _, state := range states {
		batch.Queue(stmt, state.Ts, state.Name, state.Value, state.Raw)
	}
	return s.execBatch(ctx, "upsert_strategy_state", batch)
}

func (s *Store) InsertStrategySignals(ctx context.Context, signals []StrategySignal) error {
	if len(signals) == 0 {
		return nil
	}
	stmt := fmt.Sprintf(`
INSERT INTO %s.strategy_signals
  (ts, strategy, exchange, symbol_token, side, confidence, entry_price, stop_loss, take_profit, timeframe, reason, raw)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
ON CONFLICT (ts, strategy, exchange, symbol_token) DO NOTHING`, quoteIdent(s.Schema))
	batch := &pgx.Batch{}
	for _, sig := range signals {
		batch.Queue(stmt, sig.Ts, sig.Strategy, sig.Exchange, sig.SymbolToken, sig.Side, sig.Confidence, sig.EntryPrice, sig.StopLoss, sig.TakeProfit, sig.Timeframe, sig.Reason, sig.Raw)
	}
	return s.execBatch(ctx, "insert_strategy_signals", batch)
}

func (s *Store) GetLatestStrategyState(ctx context.Context, name string) (*StrategyState, error) {
	query := fmt.Sprintf(`SELECT ts, name, value, raw
FROM %s.strategy_state
WHERE name = $1
ORDER BY ts DESC
LIMIT 1`, quoteIdent(s.Schema))
	var state StrategyState
	if err := s.Pool.QueryRow(ctx, query, name).Scan(&state.Ts, &state.Name, &state.Value, &state.Raw); err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &state, nil
}

func (s *Store) ListLatestStrategyStatesByPrefix(ctx context.Context, prefix string, limit int) ([]StrategyState, error) {
	prefix = strings.TrimSpace(prefix)
	if prefix == "" {
		return []StrategyState{}, nil
	}
	if limit <= 0 {
		limit = 500
	}
	cacheKey := fmt.Sprintf("%s|%d", prefix, limit)
	if rows, ok := s.stateCache.get(cacheKey); ok {
		return rows, nil
	}
	loaded, err, _ := s.stateCache.loader.Do(cacheKey, func() (any, error) {
		query := fmt.Sprintf(`WITH names AS (
  SELECT DISTINCT name
  FROM %s.strategy_state
  WHERE name LIKE $1
)
SELECT latest.ts, latest.name, latest.value, latest.raw
FROM names
CROSS JOIN LATERAL (
  SELECT ts, name, value, raw
  FROM %s.strategy_state
  WHERE name = names.name
  ORDER BY ts DESC
  LIMIT 1
) latest
ORDER BY latest.ts DESC
LIMIT $2`, quoteIdent(s.Schema), quoteIdent(s.Schema))
		rows, err := s.Pool.Query(ctx, query, prefix+"%", limit)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		out := []StrategyState{}
		for rows.Next() {
			var row StrategyState
			if err := rows.Scan(&row.Ts, &row.Name, &row.Value, &row.Raw); err != nil {
				return nil, err
			}
			out = append(out, row)
		}
		if err := rows.Err(); err != nil {
			return nil, err
		}
		s.stateCache.set(cacheKey, out)
		return out, nil
	})
	if err != nil {
		return nil, err
	}
	result, _ := loaded.([]StrategyState)
	return result, nil
}

func (s *Store) UpsertStrategyCooldowns(ctx context.Context, cooldowns []StrategyCooldown) error {
	if len(cooldowns) == 0 {
		return nil
	}
	stmt := fmt.Sprintf(`
INSERT INTO %s.strategy_cooldowns
  (strategy, exchange, symbol_token, cooldown_until, updated_at)
VALUES ($1,$2,$3,$4, now())
ON CONFLICT (strategy, exchange, symbol_token)
DO UPDATE SET cooldown_until = EXCLUDED.cooldown_until, updated_at = now()`, quoteIdent(s.Schema))
	batch := &pgx.Batch{}
	for _, cd := range cooldowns {
		batch.Queue(stmt, cd.Strategy, cd.Exchange, cd.SymbolToken, cd.CooldownUntil)
	}
	return s.execBatch(ctx, "upsert_strategy_cooldowns", batch)
}

func (s *Store) ListPaperPositions(ctx context.Context) (map[string]PaperPosition, error) {
	query := fmt.Sprintf(`SELECT exchange, symbol_token, COALESCE(strategy, ''), COALESCE(side, ''),
       qty, avg_price, entry_price, entry_ts, stop_loss, take_profit, realized_pnl, unrealized_pnl, updated_at
FROM %s.paper_positions`, quoteIdent(s.Schema))
	rows, err := s.Pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]PaperPosition{}
	for rows.Next() {
		var pos PaperPosition
		if err := rows.Scan(
			&pos.Exchange,
			&pos.SymbolToken,
			&pos.Strategy,
			&pos.Side,
			&pos.Qty,
			&pos.AvgPrice,
			&pos.EntryPrice,
			&pos.EntryTs,
			&pos.StopLoss,
			&pos.TakeProfit,
			&pos.RealizedPNL,
			&pos.UnrealizedPNL,
			&pos.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out[positionKey(pos.Exchange, pos.SymbolToken)] = pos
	}
	return out, rows.Err()
}

func (s *Store) RecordPaperBatch(ctx context.Context, orders []PaperOrder, trades []PaperTrade, positions []PaperPosition) error {
	if len(orders) == 0 {
		return nil
	}
	return s.WithTx(ctx, func(tx pgx.Tx) error {
		if err := insertPaperOrdersTx(ctx, s.Schema, tx, orders); err != nil {
			return err
		}
		if err := insertPaperTradesTx(ctx, s.Schema, tx, trades); err != nil {
			return err
		}
		if err := upsertPaperPositionsTx(ctx, s.Schema, tx, positions); err != nil {
			return err
		}
		return nil
	})
}

func (s *Store) UpsertPaperPositions(ctx context.Context, positions []PaperPosition) error {
	if len(positions) == 0 {
		return nil
	}
	stmt := fmt.Sprintf(`
INSERT INTO %s.paper_positions
  (exchange, symbol_token, strategy, side, qty, avg_price, entry_price, entry_ts, stop_loss, take_profit, realized_pnl, unrealized_pnl, updated_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
ON CONFLICT (exchange, symbol_token)
DO UPDATE SET qty = EXCLUDED.qty,
              avg_price = EXCLUDED.avg_price,
              entry_price = COALESCE(EXCLUDED.entry_price, %s.paper_positions.entry_price),
              entry_ts = COALESCE(EXCLUDED.entry_ts, %s.paper_positions.entry_ts),
              stop_loss = COALESCE(EXCLUDED.stop_loss, %s.paper_positions.stop_loss),
              take_profit = COALESCE(EXCLUDED.take_profit, %s.paper_positions.take_profit),
              strategy = COALESCE(EXCLUDED.strategy, %s.paper_positions.strategy),
              side = COALESCE(EXCLUDED.side, %s.paper_positions.side),
              realized_pnl = EXCLUDED.realized_pnl,
              unrealized_pnl = EXCLUDED.unrealized_pnl,
              updated_at = EXCLUDED.updated_at`, quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema))
	batch := &pgx.Batch{}
	for _, pos := range positions {
		batch.Queue(stmt,
			pos.Exchange,
			pos.SymbolToken,
			nullableString(pos.Strategy),
			nullableString(pos.Side),
			pos.Qty,
			pos.AvgPrice,
			pos.EntryPrice,
			pos.EntryTs,
			pos.StopLoss,
			pos.TakeProfit,
			pos.RealizedPNL,
			pos.UnrealizedPNL,
			pos.UpdatedAt,
		)
	}
	return s.execBatch(ctx, "upsert_paper_positions", batch)
}

func (s *Store) ListPaperTrades(ctx context.Context, limit int) ([]PaperTradeView, error) {
	if limit <= 0 {
		limit = 100
	}
	query := fmt.Sprintf(`SELECT t.trade_id, t.order_id, t.ts, COALESCE(t.strategy, ''), t.exchange, t.symbol_token, t.side, t.qty, t.price, t.fees,
       COALESCE(s.tradingsymbol, ''), COALESCE(upper(s.underlying), ''), COALESCE(s."right", ''), s.expiry, s.strike, t.raw
FROM %s.paper_trades t
LEFT JOIN %s.subscriptions s ON s.symbol_token = t.symbol_token AND s.exchange = t.exchange
ORDER BY t.ts DESC
LIMIT $1`, quoteIdent(s.Schema), quoteIdent(s.Schema))
	rows, err := s.Pool.Query(ctx, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []PaperTradeView{}
	for rows.Next() {
		var row PaperTradeView
		var expiry *time.Time
		var strike *float64
		if err := rows.Scan(&row.TradeID, &row.OrderID, &row.Ts, &row.Strategy, &row.Exchange, &row.SymbolToken, &row.Side, &row.Qty, &row.Price, &row.Fees,
			&row.TradingSymbol, &row.Underlying, &row.Right, &expiry, &strike, &row.Raw); err != nil {
			return nil, err
		}
		if expiry != nil && !expiry.IsZero() && expiry.Year() > 1970 {
			row.Expiry = expiry
		}
		if strike != nil {
			row.Strike = *strike
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func (s *Store) ListPaperPositionsFlat(ctx context.Context) ([]PaperPosition, error) {
	query := fmt.Sprintf(`SELECT exchange, symbol_token, COALESCE(strategy, ''), COALESCE(side, ''),
       qty, avg_price, entry_price, entry_ts, stop_loss, take_profit, realized_pnl, unrealized_pnl, updated_at
FROM %s.paper_positions`, quoteIdent(s.Schema))
	rows, err := s.Pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PaperPosition
	for rows.Next() {
		var pos PaperPosition
		if err := rows.Scan(
			&pos.Exchange,
			&pos.SymbolToken,
			&pos.Strategy,
			&pos.Side,
			&pos.Qty,
			&pos.AvgPrice,
			&pos.EntryPrice,
			&pos.EntryTs,
			&pos.StopLoss,
			&pos.TakeProfit,
			&pos.RealizedPNL,
			&pos.UnrealizedPNL,
			&pos.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, pos)
	}
	return out, rows.Err()
}

func (s *Store) FetchPaperSummary(ctx context.Context) (PaperSummary, error) {
	summary := PaperSummary{ByStrategy: map[string]float64{}}
	query := fmt.Sprintf(`SELECT COALESCE(sum(realized_pnl),0), COALESCE(sum(unrealized_pnl),0),
       COALESCE(sum(CASE WHEN qty != 0 THEN 1 ELSE 0 END),0),
       COALESCE(sum(CASE WHEN qty = 0 THEN 1 ELSE 0 END),0)
FROM %s.paper_positions`, quoteIdent(s.Schema))
	if err := s.Pool.QueryRow(ctx, query).Scan(&summary.TotalRealized, &summary.TotalUnrealized, &summary.OpenPositions, &summary.ClosedPositions); err != nil {
		return summary, err
	}
	summary.TotalPnL = summary.TotalRealized + summary.TotalUnrealized
	query = fmt.Sprintf(`SELECT COALESCE(count(*),0) FROM %s.paper_trades`, quoteIdent(s.Schema))
	if err := s.Pool.QueryRow(ctx, query).Scan(&summary.TradeCount); err != nil {
		return summary, err
	}
	query = fmt.Sprintf(`SELECT COALESCE(count(*),0) FROM %s.paper_orders`, quoteIdent(s.Schema))
	if err := s.Pool.QueryRow(ctx, query).Scan(&summary.OrderCount); err != nil {
		return summary, err
	}
	query = fmt.Sprintf(`SELECT COALESCE(strategy,''), COALESCE(sum(realized_pnl + unrealized_pnl),0)
FROM %s.paper_positions
GROUP BY COALESCE(strategy,'')`, quoteIdent(s.Schema))
	rows, err := s.Pool.Query(ctx, query)
	if err != nil {
		return summary, err
	}
	defer rows.Close()
	for rows.Next() {
		var strategy string
		var pnl float64
		if err := rows.Scan(&strategy, &pnl); err != nil {
			return summary, err
		}
		if strings.TrimSpace(strategy) == "" {
			strategy = "unknown"
		}
		summary.ByStrategy[strategy] = pnl
	}
	return summary, rows.Err()
}

func insertPaperOrdersTx(ctx context.Context, schema string, tx pgx.Tx, orders []PaperOrder) error {
	if len(orders) == 0 {
		return nil
	}
	stmt := fmt.Sprintf(`
INSERT INTO %s.paper_orders
  (order_id, created_at, strategy, exchange, symbol_token, side, qty, order_type, price, status, filled_qty, filled_price, raw)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
ON CONFLICT (order_id) DO NOTHING`, quoteIdent(schema))
	for _, order := range orders {
		if _, err := tx.Exec(ctx, stmt, order.OrderID, order.CreatedAt, order.Strategy, order.Exchange, order.SymbolToken, order.Side, order.Qty, order.OrderType, order.Price, order.Status, order.FilledQty, order.FilledPrice, order.Raw); err != nil {
			return err
		}
	}
	return nil
}

func insertPaperTradesTx(ctx context.Context, schema string, tx pgx.Tx, trades []PaperTrade) error {
	if len(trades) == 0 {
		return nil
	}
	stmt := fmt.Sprintf(`
INSERT INTO %s.paper_trades
  (trade_id, order_id, ts, strategy, exchange, symbol_token, side, qty, price, fees, raw)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
ON CONFLICT (trade_id) DO NOTHING`, quoteIdent(schema))
	for _, trade := range trades {
		if _, err := tx.Exec(ctx, stmt, trade.TradeID, trade.OrderID, trade.Ts, trade.Strategy, trade.Exchange, trade.SymbolToken, trade.Side, trade.Qty, trade.Price, trade.Fees, trade.Raw); err != nil {
			return err
		}
	}
	return nil
}

func upsertPaperPositionsTx(ctx context.Context, schema string, tx pgx.Tx, positions []PaperPosition) error {
	if len(positions) == 0 {
		return nil
	}
	stmt := fmt.Sprintf(`
INSERT INTO %s.paper_positions
  (exchange, symbol_token, strategy, side, qty, avg_price, entry_price, entry_ts, stop_loss, take_profit, realized_pnl, unrealized_pnl, updated_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
ON CONFLICT (exchange, symbol_token)
DO UPDATE SET qty = EXCLUDED.qty,
              avg_price = EXCLUDED.avg_price,
              entry_price = COALESCE(EXCLUDED.entry_price, %s.paper_positions.entry_price),
              entry_ts = COALESCE(EXCLUDED.entry_ts, %s.paper_positions.entry_ts),
              stop_loss = COALESCE(EXCLUDED.stop_loss, %s.paper_positions.stop_loss),
              take_profit = COALESCE(EXCLUDED.take_profit, %s.paper_positions.take_profit),
              strategy = COALESCE(EXCLUDED.strategy, %s.paper_positions.strategy),
              side = COALESCE(EXCLUDED.side, %s.paper_positions.side),
              realized_pnl = EXCLUDED.realized_pnl,
              unrealized_pnl = EXCLUDED.unrealized_pnl,
              updated_at = EXCLUDED.updated_at`, quoteIdent(schema), quoteIdent(schema), quoteIdent(schema), quoteIdent(schema), quoteIdent(schema), quoteIdent(schema), quoteIdent(schema))
	for _, pos := range positions {
		if _, err := tx.Exec(ctx, stmt,
			pos.Exchange,
			pos.SymbolToken,
			nullableString(pos.Strategy),
			nullableString(pos.Side),
			pos.Qty,
			pos.AvgPrice,
			pos.EntryPrice,
			pos.EntryTs,
			pos.StopLoss,
			pos.TakeProfit,
			pos.RealizedPNL,
			pos.UnrealizedPNL,
			pos.UpdatedAt,
		); err != nil {
			return err
		}
	}
	return nil
}

func positionKey(exchange, token string) string {
	return strings.ToUpper(exchange) + ":" + token
}
