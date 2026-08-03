package store

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type RSIWillRTarget struct {
	ID               int64      `json:"id"`
	Exchange         string     `json:"exchange"`
	Symbol           string     `json:"symbol"`
	SymbolToken      string     `json:"symbol_token"`
	TradingSymbol    string     `json:"tradingsymbol"`
	DisplayName      string     `json:"display_name"`
	Active           bool       `json:"active"`
	Notes            string     `json:"notes"`
	EnableRSIWillR   bool       `json:"enable_rsi_willr"`
	RSIThreshold     *float64   `json:"rsi_threshold"`
	WillRThreshold   *float64   `json:"willr_threshold"`
	EnablePrice      bool       `json:"enable_price"`
	PriceThreshold   *float64   `json:"price_threshold"`
	PriceDirection   string     `json:"price_direction"`
	LastBarTS        *time.Time `json:"last_bar_ts"`
	LastClose        *float64   `json:"last_close"`
	LastRSI          *float64   `json:"last_rsi"`
	LastWillR        *float64   `json:"last_willr"`
	LastConditionMet bool       `json:"last_condition_met"`
	PendingAlert     bool       `json:"pending_alert"`
	LastAlertTS      *time.Time `json:"last_alert_ts"`
	HitCount         int        `json:"hit_count"`
	RetiredAt        *time.Time `json:"retired_at"`
	RetireReason     string     `json:"retire_reason"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

type RSIWillRAlertEvent struct {
	ID          int64      `json:"id"`
	TargetID    int64      `json:"target_id"`
	AlertTS     time.Time  `json:"alert_ts"`
	TradeDate   time.Time  `json:"trade_date"`
	BarTS       *time.Time `json:"bar_ts"`
	Close       *float64   `json:"close"`
	RSI         *float64   `json:"rsi"`
	WillR       *float64   `json:"willr"`
	Message     string     `json:"message"`
	Payload     []byte     `json:"payload"`
	Symbol      string     `json:"symbol"`
	DisplayName string     `json:"display_name"`
}

func (s *Store) ListRSIWillRTargets(ctx context.Context, includeInactive bool) ([]RSIWillRTarget, error) {
	start := time.Now()
	cond := ""
	if !includeInactive {
		cond = "WHERE t.active = true"
	}
	q := fmt.Sprintf(`
SELECT t.id, t.exchange, t.symbol, t.symbol_token, t.tradingsymbol,
       COALESCE(t.display_name, ''), t.active, COALESCE(t.notes, ''),
       t.enable_rsi_willr, t.rsi_threshold, t.willr_threshold,
       t.enable_price, t.price_threshold, COALESCE(t.price_direction, ''),
       t.last_bar_ts, t.last_close, t.last_rsi, t.last_willr,
       t.last_condition_met, t.pending_alert, t.last_alert_ts,
       t.hit_count, t.retired_at, COALESCE(t.retire_reason, ''),
       t.created_at, t.updated_at
FROM %s.rsi_willr_targets t
%s
ORDER BY t.active DESC, t.symbol
`, quoteIdent(s.Schema), cond)
	rows, err := s.Pool.Query(ctx, q)
	if err != nil {
		s.logQuery("list_rsi_willr_targets", start, 0, err)
		return nil, err
	}
	defer rows.Close()

	var out []RSIWillRTarget
	for rows.Next() {
		var row RSIWillRTarget
		if err := rows.Scan(
			&row.ID,
			&row.Exchange,
			&row.Symbol,
			&row.SymbolToken,
			&row.TradingSymbol,
			&row.DisplayName,
			&row.Active,
			&row.Notes,
			&row.EnableRSIWillR,
			&row.RSIThreshold,
			&row.WillRThreshold,
			&row.EnablePrice,
			&row.PriceThreshold,
			&row.PriceDirection,
			&row.LastBarTS,
			&row.LastClose,
			&row.LastRSI,
			&row.LastWillR,
			&row.LastConditionMet,
			&row.PendingAlert,
			&row.LastAlertTS,
			&row.HitCount,
			&row.RetiredAt,
			&row.RetireReason,
			&row.CreatedAt,
			&row.UpdatedAt,
		); err != nil {
			s.logQuery("list_rsi_willr_targets", start, 0, err)
			return nil, err
		}
		out = append(out, row)
	}
	err = rows.Err()
	s.logQuery("list_rsi_willr_targets", start, 0, err)
	return out, err
}

func (s *Store) GetRSIWillRTarget(ctx context.Context, id int64) (RSIWillRTarget, error) {
	start := time.Now()
	out := RSIWillRTarget{}
	q := fmt.Sprintf(`
SELECT t.id, t.exchange, t.symbol, t.symbol_token, t.tradingsymbol,
       COALESCE(t.display_name, ''), t.active, COALESCE(t.notes, ''),
       t.enable_rsi_willr, t.rsi_threshold, t.willr_threshold,
       t.enable_price, t.price_threshold, COALESCE(t.price_direction, ''),
       t.last_bar_ts, t.last_close, t.last_rsi, t.last_willr,
       t.last_condition_met, t.pending_alert, t.last_alert_ts,
       t.hit_count, t.retired_at, COALESCE(t.retire_reason, ''),
       t.created_at, t.updated_at
FROM %s.rsi_willr_targets t
WHERE t.id = $1
`, quoteIdent(s.Schema))
	err := s.Pool.QueryRow(ctx, q, id).Scan(
		&out.ID,
		&out.Exchange,
		&out.Symbol,
		&out.SymbolToken,
		&out.TradingSymbol,
		&out.DisplayName,
		&out.Active,
		&out.Notes,
		&out.EnableRSIWillR,
		&out.RSIThreshold,
		&out.WillRThreshold,
		&out.EnablePrice,
		&out.PriceThreshold,
		&out.PriceDirection,
		&out.LastBarTS,
		&out.LastClose,
		&out.LastRSI,
		&out.LastWillR,
		&out.LastConditionMet,
		&out.PendingAlert,
		&out.LastAlertTS,
		&out.HitCount,
		&out.RetiredAt,
		&out.RetireReason,
		&out.CreatedAt,
		&out.UpdatedAt,
	)
	if err != nil {
		s.logQuery("get_rsi_willr_target", start, 1, err)
		if err == pgx.ErrNoRows {
			return out, fmt.Errorf("target not found")
		}
		return out, err
	}
	s.logQuery("get_rsi_willr_target", start, 1, nil)
	return out, nil
}

func (s *Store) InsertRSIWillRTarget(ctx context.Context, target RSIWillRTarget) (int64, error) {
	start := time.Now()
	q := fmt.Sprintf(`
INSERT INTO %s.rsi_willr_targets
  (exchange, symbol, symbol_token, tradingsymbol, display_name, active, notes,
   enable_rsi_willr, rsi_threshold, willr_threshold,
   enable_price, price_threshold, price_direction)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
RETURNING id
`, quoteIdent(s.Schema))
	var id int64
	err := s.Pool.QueryRow(ctx, q,
		target.Exchange,
		target.Symbol,
		target.SymbolToken,
		target.TradingSymbol,
		nullableString(target.DisplayName),
		target.Active,
		nullableString(target.Notes),
		target.EnableRSIWillR,
		target.RSIThreshold,
		target.WillRThreshold,
		target.EnablePrice,
		target.PriceThreshold,
		nullableString(target.PriceDirection),
	).Scan(&id)
	s.logQuery("insert_rsi_willr_target", start, 13, err)
	return id, err
}

func (s *Store) UpsertRSIWillRTarget(ctx context.Context, target RSIWillRTarget) (int64, error) {
	start := time.Now()
	q := fmt.Sprintf(`
INSERT INTO %s.rsi_willr_targets
  (exchange, symbol, symbol_token, tradingsymbol, display_name, active, notes,
   enable_rsi_willr, rsi_threshold, willr_threshold,
   enable_price, price_threshold, price_direction)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
ON CONFLICT (exchange, symbol) DO UPDATE
SET symbol_token = EXCLUDED.symbol_token,
    tradingsymbol = EXCLUDED.tradingsymbol,
    display_name = COALESCE(EXCLUDED.display_name, %s.rsi_willr_targets.display_name),
    active = EXCLUDED.active,
    notes = COALESCE(EXCLUDED.notes, %s.rsi_willr_targets.notes),
    enable_rsi_willr = EXCLUDED.enable_rsi_willr,
    rsi_threshold = EXCLUDED.rsi_threshold,
    willr_threshold = EXCLUDED.willr_threshold,
    enable_price = EXCLUDED.enable_price,
    price_threshold = EXCLUDED.price_threshold,
    price_direction = COALESCE(EXCLUDED.price_direction, %s.rsi_willr_targets.price_direction),
    retired_at = CASE WHEN EXCLUDED.active THEN NULL ELSE %s.rsi_willr_targets.retired_at END,
    retire_reason = CASE WHEN EXCLUDED.active THEN NULL ELSE %s.rsi_willr_targets.retire_reason END,
    updated_at = now()
RETURNING id
`, quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema), quoteIdent(s.Schema))
	var id int64
	err := s.Pool.QueryRow(ctx, q,
		target.Exchange,
		target.Symbol,
		target.SymbolToken,
		target.TradingSymbol,
		nullableString(target.DisplayName),
		target.Active,
		nullableString(target.Notes),
		target.EnableRSIWillR,
		target.RSIThreshold,
		target.WillRThreshold,
		target.EnablePrice,
		target.PriceThreshold,
		nullableString(target.PriceDirection),
	).Scan(&id)
	s.logQuery("upsert_rsi_willr_target", start, 13, err)
	return id, err
}

func (s *Store) UpdateRSIWillRTarget(ctx context.Context, target RSIWillRTarget) error {
	start := time.Now()
	q := fmt.Sprintf(`
UPDATE %s.rsi_willr_targets
SET display_name = $1,
    active = $2,
    notes = $3,
    enable_rsi_willr = $4,
    rsi_threshold = $5,
    willr_threshold = $6,
    enable_price = $7,
    price_threshold = $8,
    price_direction = $9,
    retired_at = CASE WHEN $2 THEN NULL ELSE retired_at END,
    retire_reason = CASE WHEN $2 THEN NULL ELSE retire_reason END,
    updated_at = now()
WHERE id = $10
`, quoteIdent(s.Schema))
	_, err := s.Pool.Exec(ctx, q,
		nullableString(target.DisplayName),
		target.Active,
		nullableString(target.Notes),
		target.EnableRSIWillR,
		target.RSIThreshold,
		target.WillRThreshold,
		target.EnablePrice,
		target.PriceThreshold,
		nullableString(target.PriceDirection),
		target.ID,
	)
	s.logQuery("update_rsi_willr_target", start, 10, err)
	return err
}

func (s *Store) DeleteRSIWillRTarget(ctx context.Context, id int64) error {
	start := time.Now()
	q := fmt.Sprintf(`DELETE FROM %s.rsi_willr_targets WHERE id = $1`, quoteIdent(s.Schema))
	_, err := s.Pool.Exec(ctx, q, id)
	s.logQuery("delete_rsi_willr_target", start, 1, err)
	return err
}

func (s *Store) UpdateRSIWillRTargetState(ctx context.Context, id int64, lastBarTS *time.Time, lastClose, lastRSI, lastWillR *float64, conditionMet bool, pendingAlert bool, lastAlertTS *time.Time) error {
	start := time.Now()
	q := fmt.Sprintf(`
UPDATE %s.rsi_willr_targets
SET last_bar_ts = $1,
    last_close = $2,
    last_rsi = $3,
    last_willr = $4,
    last_condition_met = $5,
    pending_alert = $6,
    last_alert_ts = COALESCE($7, last_alert_ts),
    updated_at = now()
WHERE id = $8
`, quoteIdent(s.Schema))
	_, err := s.Pool.Exec(ctx, q,
		lastBarTS,
		lastClose,
		lastRSI,
		lastWillR,
		conditionMet,
		pendingAlert,
		lastAlertTS,
		id,
	)
	s.logQuery("update_rsi_willr_target_state", start, 8, err)
	return err
}

func (s *Store) RetireExpiredRSIWillRTargets(ctx context.Context, cutoff time.Time, reason string) (int64, error) {
	start := time.Now()
	q := fmt.Sprintf(`
UPDATE %s.rsi_willr_targets
SET active = false,
    pending_alert = false,
    retired_at = COALESCE(retired_at, now()),
    retire_reason = COALESCE(NULLIF(retire_reason, ''), $2),
    updated_at = now()
WHERE active = true
  AND created_at <= $1
`, quoteIdent(s.Schema))
	tag, err := s.Pool.Exec(ctx, q, cutoff, reason)
	s.logQuery("retire_expired_rsi_willr_targets", start, 2, err)
	return tag.RowsAffected(), err
}

func (s *Store) RetireRSIWillRTargetOnHit(ctx context.Context, id int64, lastBarTS *time.Time, lastClose, lastRSI, lastWillR *float64, lastAlertTS time.Time) error {
	start := time.Now()
	q := fmt.Sprintf(`
UPDATE %s.rsi_willr_targets
SET active = false,
    last_bar_ts = $1,
    last_close = $2,
    last_rsi = $3,
    last_willr = $4,
    last_condition_met = true,
    pending_alert = false,
    last_alert_ts = $5,
    hit_count = hit_count + 1,
    retired_at = COALESCE(retired_at, $5),
    retire_reason = 'hit',
    updated_at = now()
WHERE id = $6
`, quoteIdent(s.Schema))
	_, err := s.Pool.Exec(ctx, q, lastBarTS, lastClose, lastRSI, lastWillR, lastAlertTS, id)
	s.logQuery("retire_rsi_willr_target_on_hit", start, 6, err)
	return err
}

func (s *Store) InsertRSIWillRAlertEvent(ctx context.Context, event RSIWillRAlertEvent) error {
	start := time.Now()
	q := fmt.Sprintf(`
INSERT INTO %s.rsi_willr_alert_events
  (target_id, alert_ts, trade_date, bar_ts, close, rsi, willr, message, payload)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
`, quoteIdent(s.Schema))
	_, err := s.Pool.Exec(ctx, q,
		event.TargetID,
		event.AlertTS,
		event.TradeDate,
		event.BarTS,
		event.Close,
		event.RSI,
		event.WillR,
		event.Message,
		event.Payload,
	)
	s.logQuery("insert_rsi_willr_alert_event", start, 9, err)
	return err
}

func (s *Store) ListRSIWillRAlertEvents(ctx context.Context, limit int) ([]RSIWillRAlertEvent, error) {
	start := time.Now()
	if limit < 1 {
		limit = 50
	}
	q := fmt.Sprintf(`
SELECT e.id, e.target_id, e.alert_ts, e.trade_date, e.bar_ts, e.close, e.rsi, e.willr, e.message, e.payload,
       COALESCE(t.symbol, ''), COALESCE(t.display_name, '')
FROM %s.rsi_willr_alert_events e
LEFT JOIN %s.rsi_willr_targets t ON t.id = e.target_id
ORDER BY e.alert_ts DESC
LIMIT $1
`, quoteIdent(s.Schema), quoteIdent(s.Schema))
	rows, err := s.Pool.Query(ctx, q, limit)
	if err != nil {
		s.logQuery("list_rsi_willr_alert_events", start, 1, err)
		return nil, err
	}
	defer rows.Close()

	var out []RSIWillRAlertEvent
	for rows.Next() {
		var row RSIWillRAlertEvent
		if err := rows.Scan(
			&row.ID,
			&row.TargetID,
			&row.AlertTS,
			&row.TradeDate,
			&row.BarTS,
			&row.Close,
			&row.RSI,
			&row.WillR,
			&row.Message,
			&row.Payload,
			&row.Symbol,
			&row.DisplayName,
		); err != nil {
			s.logQuery("list_rsi_willr_alert_events", start, 1, err)
			return nil, err
		}
		out = append(out, row)
	}
	err = rows.Err()
	s.logQuery("list_rsi_willr_alert_events", start, 1, err)
	return out, err
}

func (s *Store) ResolveRSIWillREquityToken(ctx context.Context, exchange, symbol string) (InstrumentLookup, error) {
	// Wrapper for clarity at call sites.
	exchange = strings.TrimSpace(exchange)
	symbol = strings.TrimSpace(symbol)
	if exchange == "" || symbol == "" {
		return InstrumentLookup{}, fmt.Errorf("exchange and symbol are required")
	}
	return s.ResolveEquityToken(ctx, exchange, symbol)
}
