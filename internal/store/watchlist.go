package store

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type InstrumentLookup struct {
	Exchange      string
	SymbolToken   string
	TradingSymbol string
	Name          string
}

type WatchlistTarget struct {
	ID             int64
	Exchange       string
	Symbol         string
	SymbolToken    string
	TradingSymbol  string
	DisplayName    string
	Threshold      float64
	Direction      string
	Active         bool
	Notes          string
	LastAlertDate  *time.Time
	LastAlertPrice *float64
	CreatedAt      time.Time
	UpdatedAt      time.Time
	LastPrice      *float64
	LastSeen       *time.Time
}

type WatchlistAlertEvent struct {
	ID          int64
	TargetID    int64
	AlertTS     time.Time
	TradeDate   time.Time
	Price       *float64
	Message     string
	Payload     []byte
	Symbol      string
	DisplayName string
}

func (s *Store) ResolveEquityToken(ctx context.Context, exchange, symbol string) (InstrumentLookup, error) {
	start := time.Now()
	out := InstrumentLookup{}
	exchange = strings.TrimSpace(exchange)
	symbol = strings.TrimSpace(symbol)
	if exchange == "" || symbol == "" {
		return out, fmt.Errorf("exchange and symbol are required")
	}
	q := fmt.Sprintf(`
SELECT exchange, symbol_token, tradingsymbol, COALESCE(name, tradingsymbol)
FROM %s.instruments
WHERE exchange = $1
  AND (upper(tradingsymbol) = upper($2) OR upper(name) = upper($2))
  AND (instrumenttype IS NULL OR instrumenttype ILIKE '%%EQ%%' OR tradingsymbol ILIKE '%%-EQ')
ORDER BY tradingsymbol
LIMIT 1
`, quoteIdent(s.Schema))
	err := s.Pool.QueryRow(ctx, q, exchange, symbol).Scan(
		&out.Exchange,
		&out.SymbolToken,
		&out.TradingSymbol,
		&out.Name,
	)
	if err != nil {
		s.logQuery("resolve_equity_token", start, 2, err)
		if err == pgx.ErrNoRows {
			return out, fmt.Errorf("equity token not found for %s:%s", exchange, symbol)
		}
		return out, err
	}
	s.logQuery("resolve_equity_token", start, 2, nil)
	return out, nil
}

func (s *Store) ListWatchlistTargets(ctx context.Context, includeInactive bool) ([]WatchlistTarget, error) {
	start := time.Now()
	cond := ""
	if !includeInactive {
		cond = "WHERE t.active = true"
	}
	q := fmt.Sprintf(`
SELECT t.id, t.exchange, t.symbol, t.symbol_token, t.tradingsymbol,
       COALESCE(t.display_name, ''), t.threshold, t.direction, t.active,
       COALESCE(t.notes, ''), t.last_alert_date, t.last_alert_price,
       t.created_at, t.updated_at, s.last_price, s.last_seen_ts
FROM %s.watchlist_targets t
LEFT JOIN %s.instrument_state s
  ON s.exchange = t.exchange AND s.symbol_token = t.symbol_token
%s
ORDER BY t.active DESC, t.symbol
`, quoteIdent(s.Schema), quoteIdent(s.Schema), cond)
	rows, err := s.Pool.Query(ctx, q)
	if err != nil {
		s.logQuery("list_watchlist_targets", start, 0, err)
		return nil, err
	}
	defer rows.Close()

	var out []WatchlistTarget
	for rows.Next() {
		var row WatchlistTarget
		var lastAlertDate *time.Time
		var lastAlertPrice *float64
		var lastPrice *float64
		var lastSeen *time.Time
		if err := rows.Scan(
			&row.ID,
			&row.Exchange,
			&row.Symbol,
			&row.SymbolToken,
			&row.TradingSymbol,
			&row.DisplayName,
			&row.Threshold,
			&row.Direction,
			&row.Active,
			&row.Notes,
			&lastAlertDate,
			&lastAlertPrice,
			&row.CreatedAt,
			&row.UpdatedAt,
			&lastPrice,
			&lastSeen,
		); err != nil {
			s.logQuery("list_watchlist_targets", start, 0, err)
			return nil, err
		}
		row.LastAlertDate = lastAlertDate
		row.LastAlertPrice = lastAlertPrice
		row.LastPrice = lastPrice
		row.LastSeen = lastSeen
		out = append(out, row)
	}
	err = rows.Err()
	s.logQuery("list_watchlist_targets", start, 0, err)
	return out, err
}

func (s *Store) InsertWatchlistTarget(ctx context.Context, target WatchlistTarget) (int64, error) {
	start := time.Now()
	q := fmt.Sprintf(`
INSERT INTO %s.watchlist_targets
  (exchange, symbol, symbol_token, tradingsymbol, display_name, threshold, direction, active, notes)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
RETURNING id
`, quoteIdent(s.Schema))
	var id int64
	err := s.Pool.QueryRow(ctx, q,
		target.Exchange,
		target.Symbol,
		target.SymbolToken,
		target.TradingSymbol,
		nullableString(target.DisplayName),
		target.Threshold,
		target.Direction,
		target.Active,
		nullableString(target.Notes),
	).Scan(&id)
	s.logQuery("insert_watchlist_target", start, 9, err)
	return id, err
}

func (s *Store) UpsertWatchlistTarget(ctx context.Context, target WatchlistTarget) (int64, error) {
	start := time.Now()
	q := fmt.Sprintf(`
INSERT INTO %s.watchlist_targets
  (exchange, symbol, symbol_token, tradingsymbol, display_name, threshold, direction, active, notes)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
ON CONFLICT (exchange, symbol) DO UPDATE
SET symbol_token = EXCLUDED.symbol_token,
    tradingsymbol = EXCLUDED.tradingsymbol,
    display_name = COALESCE(EXCLUDED.display_name, %s.watchlist_targets.display_name),
    threshold = EXCLUDED.threshold,
    direction = EXCLUDED.direction,
    active = EXCLUDED.active,
    notes = COALESCE(EXCLUDED.notes, %s.watchlist_targets.notes),
    updated_at = now()
RETURNING id
`, quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema))
	var id int64
	err := s.Pool.QueryRow(ctx, q,
		target.Exchange,
		target.Symbol,
		target.SymbolToken,
		target.TradingSymbol,
		nullableString(target.DisplayName),
		target.Threshold,
		target.Direction,
		target.Active,
		nullableString(target.Notes),
	).Scan(&id)
	s.logQuery("upsert_watchlist_target", start, 9, err)
	return id, err
}

func (s *Store) UpdateWatchlistTarget(ctx context.Context, target WatchlistTarget) error {
	start := time.Now()
	q := fmt.Sprintf(`
UPDATE %s.watchlist_targets
SET display_name = $1,
    threshold = $2,
    direction = $3,
    active = $4,
    notes = $5,
    updated_at = now()
WHERE id = $6
`, quoteIdent(s.Schema))
	_, err := s.Pool.Exec(ctx, q,
		nullableString(target.DisplayName),
		target.Threshold,
		target.Direction,
		target.Active,
		nullableString(target.Notes),
		target.ID,
	)
	s.logQuery("update_watchlist_target", start, 6, err)
	return err
}

func (s *Store) DeleteWatchlistTarget(ctx context.Context, id int64) error {
	start := time.Now()
	q := fmt.Sprintf(`DELETE FROM %s.watchlist_targets WHERE id = $1`, quoteIdent(s.Schema))
	_, err := s.Pool.Exec(ctx, q, id)
	s.logQuery("delete_watchlist_target", start, 1, err)
	return err
}

func (s *Store) UpdateWatchlistAlert(ctx context.Context, id int64, tradeDate time.Time, price *float64) error {
	start := time.Now()
	q := fmt.Sprintf(`
UPDATE %s.watchlist_targets
SET last_alert_date = $1,
    last_alert_price = $2,
    updated_at = now()
WHERE id = $3
`, quoteIdent(s.Schema))
	_, err := s.Pool.Exec(ctx, q, tradeDate, price, id)
	s.logQuery("update_watchlist_alert", start, 3, err)
	return err
}

func (s *Store) InsertWatchlistAlertEvent(ctx context.Context, event WatchlistAlertEvent) error {
	start := time.Now()
	q := fmt.Sprintf(`
INSERT INTO %s.watchlist_alert_events
  (target_id, alert_ts, trade_date, price, message, payload)
VALUES ($1,$2,$3,$4,$5,$6)
`, quoteIdent(s.Schema))
	_, err := s.Pool.Exec(ctx, q,
		event.TargetID,
		event.AlertTS,
		event.TradeDate,
		event.Price,
		event.Message,
		event.Payload,
	)
	s.logQuery("insert_watchlist_alert_event", start, 6, err)
	return err
}

func (s *Store) CountWatchlistAlerts(ctx context.Context, tradeDate time.Time) (int, error) {
	start := time.Now()
	q := fmt.Sprintf(`SELECT COUNT(*) FROM %s.watchlist_alert_events WHERE trade_date = $1`, quoteIdent(s.Schema))
	var count int
	err := s.Pool.QueryRow(ctx, q, tradeDate).Scan(&count)
	s.logQuery("count_watchlist_alerts", start, 1, err)
	return count, err
}

func (s *Store) ListWatchlistAlertEvents(ctx context.Context, limit int) ([]WatchlistAlertEvent, error) {
	start := time.Now()
	if limit < 1 {
		limit = 50
	}
	q := fmt.Sprintf(`
SELECT e.id, e.target_id, e.alert_ts, e.trade_date, e.price, e.message, e.payload,
       COALESCE(t.symbol, ''), COALESCE(t.display_name, '')
FROM %s.watchlist_alert_events e
LEFT JOIN %s.watchlist_targets t ON t.id = e.target_id
ORDER BY e.alert_ts DESC
LIMIT $1
`, quoteIdent(s.Schema), quoteIdent(s.Schema))
	rows, err := s.Pool.Query(ctx, q, limit)
	if err != nil {
		s.logQuery("list_watchlist_alert_events", start, 1, err)
		return nil, err
	}
	defer rows.Close()
	var out []WatchlistAlertEvent
	for rows.Next() {
		var row WatchlistAlertEvent
		if err := rows.Scan(
			&row.ID,
			&row.TargetID,
			&row.AlertTS,
			&row.TradeDate,
			&row.Price,
			&row.Message,
			&row.Payload,
			&row.Symbol,
			&row.DisplayName,
		); err != nil {
			s.logQuery("list_watchlist_alert_events", start, 1, err)
			return nil, err
		}
		out = append(out, row)
	}
	err = rows.Err()
	s.logQuery("list_watchlist_alert_events", start, 1, err)
	return out, err
}
