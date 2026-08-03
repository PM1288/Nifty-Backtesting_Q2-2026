package store

import (
	"context"
	"fmt"
	"strings"
	"time"
)

type PortfolioPosition struct {
	ID            int64      `json:"id"`
	Exchange      string     `json:"exchange"`
	Symbol        string     `json:"symbol"`
	SymbolToken   string     `json:"symbol_token"`
	TradingSymbol string     `json:"tradingsymbol"`
	DisplayName   string     `json:"display_name"`
	Quantity      float64    `json:"quantity"`
	EntryPrice    float64    `json:"entry_price"`
	EntryTime     time.Time  `json:"entry_time"`
	ExitPrice     *float64   `json:"exit_price,omitempty"`
	ExitTime      *time.Time `json:"exit_time,omitempty"`
	Status        string     `json:"status"`
	Notes         string     `json:"notes,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
	LastPrice     *float64   `json:"last_price,omitempty"`
	LastSeen      *time.Time `json:"last_seen,omitempty"`
	PNL           *float64   `json:"pnl,omitempty"`
}

func (s *Store) AddPortfolioPosition(ctx context.Context, symbol string, inst InstrumentLookup, quantity, entryPrice float64, entryTime time.Time, notes string) (PortfolioPosition, error) {
	start := time.Now()
	symbol = strings.TrimSpace(symbol)
	if entryTime.IsZero() {
		entryTime = time.Now().UTC()
	}
	notes = strings.TrimSpace(notes)
	q := fmt.Sprintf(`
INSERT INTO %s.portfolio_positions
  (exchange, symbol, symbol_token, tradingsymbol, display_name, quantity, entry_price, entry_time, status, notes)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open',NULLIF($9,''))
RETURNING id, exchange, symbol, symbol_token, tradingsymbol, display_name, quantity, entry_price, entry_time, exit_price, exit_time, status, notes, created_at, updated_at
`, quoteIdent(s.Schema))

	row := s.Pool.QueryRow(ctx, q, inst.Exchange, symbol, inst.SymbolToken, inst.TradingSymbol, inst.Name, quantity, entryPrice, entryTime, notes)
	var p PortfolioPosition
	err := row.Scan(
		&p.ID,
		&p.Exchange,
		&p.Symbol,
		&p.SymbolToken,
		&p.TradingSymbol,
		&p.DisplayName,
		&p.Quantity,
		&p.EntryPrice,
		&p.EntryTime,
		&p.ExitPrice,
		&p.ExitTime,
		&p.Status,
		&p.Notes,
		&p.CreatedAt,
		&p.UpdatedAt,
	)
	s.logQuery("add_portfolio_position", start, 1, err)
	return p, err
}

func (s *Store) ClosePortfolioPosition(ctx context.Context, id int64, exitPrice float64, exitTime time.Time, notes string) error {
	start := time.Now()
	if exitTime.IsZero() {
		exitTime = time.Now().UTC()
	}
	notes = strings.TrimSpace(notes)
	q := fmt.Sprintf(`
UPDATE %s.portfolio_positions
SET exit_price = $2,
    exit_time = $3,
    status = 'closed',
    notes = COALESCE(NULLIF($4,''), notes),
    updated_at = now()
WHERE id = $1
`, quoteIdent(s.Schema))
	_, err := s.exec(ctx, "close_portfolio_position", q, id, exitPrice, exitTime, notes)
	s.logQuery("close_portfolio_position", start, 4, err)
	return err
}

func (s *Store) ListPortfolioPositions(ctx context.Context, status string) ([]PortfolioPosition, error) {
	start := time.Now()
	status = strings.ToLower(strings.TrimSpace(status))
	filter := ""
	args := []any{}
	if status != "" && status != "all" {
		filter = "WHERE p.status = $1"
		args = append(args, status)
	}
	q := fmt.Sprintf(`
SELECT
  p.id, p.exchange, p.symbol, p.symbol_token, p.tradingsymbol, p.display_name,
  p.quantity, p.entry_price, p.entry_time, p.exit_price, p.exit_time, p.status, p.notes,
  p.created_at, p.updated_at,
  s.last_price, s.last_seen_ts,
  CASE
    WHEN p.status = 'closed' THEN (COALESCE(p.exit_price, p.entry_price) - p.entry_price) * p.quantity
    ELSE (COALESCE(s.last_price, p.entry_price) - p.entry_price) * p.quantity
  END AS pnl
FROM %s.portfolio_positions p
LEFT JOIN %s.instrument_state s
  ON s.exchange = p.exchange AND s.symbol_token = p.symbol_token
%s
ORDER BY p.created_at DESC
`, quoteIdent(s.Schema), quoteIdent(s.Schema), filter)

	rows, err := s.Pool.Query(ctx, q, args...)
	if err != nil {
		s.logQuery("list_portfolio_positions", start, len(args), err)
		return nil, err
	}
	defer rows.Close()

	var out []PortfolioPosition
	for rows.Next() {
		var p PortfolioPosition
		err := rows.Scan(
			&p.ID,
			&p.Exchange,
			&p.Symbol,
			&p.SymbolToken,
			&p.TradingSymbol,
			&p.DisplayName,
			&p.Quantity,
			&p.EntryPrice,
			&p.EntryTime,
			&p.ExitPrice,
			&p.ExitTime,
			&p.Status,
			&p.Notes,
			&p.CreatedAt,
			&p.UpdatedAt,
			&p.LastPrice,
			&p.LastSeen,
			&p.PNL,
		)
		if err != nil {
			s.logQuery("list_portfolio_positions", start, len(args), err)
			return nil, err
		}
		out = append(out, p)
	}
	err = rows.Err()
	s.logQuery("list_portfolio_positions", start, len(args), err)
	return out, err
}
