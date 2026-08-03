package store

import (
	"context"
	"fmt"
	"time"
)

type NiftyWatcherRun struct {
	ID              int64      `json:"id"`
	Strategy        string     `json:"strategy"`
	TradeDate       time.Time  `json:"tradeDate"`
	EntryTs         time.Time  `json:"entryTs"`
	ExitTs          *time.Time `json:"exitTs"`
	EODTs           *time.Time `json:"eodTs"`
	ExitReason      *string    `json:"exitReason"`
	Underlying      string     `json:"underlying"`
	UnderlyingPrice *float64   `json:"underlyingPrice"`
	Level           *float64   `json:"level"`
	Strike          *float64   `json:"strike"`
	CEToken         *string    `json:"ceToken"`
	PEToken         *string    `json:"peToken"`
	CESymbol        *string    `json:"ceSymbol"`
	PESymbol        *string    `json:"peSymbol"`
	CEPrice         *float64   `json:"cePrice"`
	PEPrice         *float64   `json:"pePrice"`
	Qty             int64      `json:"qty"`
	EntryCombo      *float64   `json:"entryCombo"`
	ExitCombo       *float64   `json:"exitCombo"`
	PnL             *float64   `json:"pnl"`
	MaxPnL          *float64   `json:"maxPnl"`
	MaxPnLTs        *time.Time `json:"maxPnlTs"`
	MaxLoss         *float64   `json:"maxLoss"`
	MaxLossTs       *time.Time `json:"maxLossTs"`
	EODPnL          *float64   `json:"eodPnl"`
	RSI             *float64   `json:"rsi"`
	WILLR           *float64   `json:"willr"`
	CENorm          *float64   `json:"ceNorm"`
	PENorm          *float64   `json:"peNorm"`
	NormDiff        *float64   `json:"normDiff"`
	TargetRupees    *float64   `json:"targetRupees"`
	Raw             []byte     `json:"raw"`
	CreatedAt       time.Time  `json:"createdAt"`
	UpdatedAt       time.Time  `json:"updatedAt"`
}

type NiftyWatcherSummary struct {
	TotalPnL    float64            `json:"totalPnl"`
	TotalEODPnL float64            `json:"totalEodPnl"`
	TotalRuns   int64              `json:"totalRuns"`
	ByStrategy  map[string]float64 `json:"byStrategy"`
}

func (s *Store) InsertNiftyWatcherRun(ctx context.Context, run NiftyWatcherRun) (int64, error) {
	stmt := fmt.Sprintf(`
INSERT INTO %s.nifty_watcher_runs
  (strategy, trade_date, entry_ts, underlying, underlying_price, level, strike, ce_token, pe_token, ce_symbol, pe_symbol, ce_price, pe_price, qty, entry_combo, max_loss, max_loss_ts, rsi, willr, ce_norm, pe_norm, norm_diff, target_rupees, raw)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
RETURNING id`, quoteIdent(s.Schema))
	var id int64
	err := s.Pool.QueryRow(ctx, stmt,
		run.Strategy,
		run.TradeDate,
		run.EntryTs,
		run.Underlying,
		run.UnderlyingPrice,
		run.Level,
		run.Strike,
		run.CEToken,
		run.PEToken,
		run.CESymbol,
		run.PESymbol,
		run.CEPrice,
		run.PEPrice,
		run.Qty,
		run.EntryCombo,
		run.MaxLoss,
		run.MaxLossTs,
		run.RSI,
		run.WILLR,
		run.CENorm,
		run.PENorm,
		run.NormDiff,
		run.TargetRupees,
		run.Raw,
	).Scan(&id)
	return id, err
}

func (s *Store) UpdateNiftyWatcherRunTrack(ctx context.Context, id int64, maxPnL float64, maxPnLTs *time.Time, maxLoss float64, maxLossTs *time.Time) error {
	stmt := fmt.Sprintf(`
UPDATE %s.nifty_watcher_runs
SET max_pnl = $2,
    max_pnl_ts = $3,
    max_loss = $4,
    max_loss_ts = $5,
    updated_at = now()
WHERE id = $1`, quoteIdent(s.Schema))
	_, err := s.exec(ctx, "update_nifty_watcher_track", stmt, id, maxPnL, maxPnLTs, maxLoss, maxLossTs)
	return err
}

func (s *Store) UpdateNiftyWatcherRunExit(ctx context.Context, id int64, exitTs time.Time, exitReason string, exitCombo, pnl, maxPnL float64, maxPnLTs *time.Time, maxLoss float64, maxLossTs *time.Time) error {
	stmt := fmt.Sprintf(`
UPDATE %s.nifty_watcher_runs
SET exit_ts = $2,
    exit_reason = $3,
    exit_combo = $4,
    pnl = $5,
    max_pnl = $6,
    max_pnl_ts = $7,
    max_loss = $8,
    max_loss_ts = $9,
    updated_at = now()
WHERE id = $1`, quoteIdent(s.Schema))
	_, err := s.exec(ctx, "update_nifty_watcher_exit", stmt, id, exitTs, exitReason, exitCombo, pnl, maxPnL, maxPnLTs, maxLoss, maxLossTs)
	return err
}

func (s *Store) UpdateNiftyWatcherRunEOD(ctx context.Context, id int64, eodTs time.Time, eodPnL, maxPnL float64, maxPnLTs *time.Time, maxLoss float64, maxLossTs *time.Time) error {
	stmt := fmt.Sprintf(`
UPDATE %s.nifty_watcher_runs
SET eod_ts = $2,
    eod_pnl = $3,
    max_pnl = $4,
    max_pnl_ts = $5,
    max_loss = $6,
    max_loss_ts = $7,
    updated_at = now()
WHERE id = $1`, quoteIdent(s.Schema))
	_, err := s.exec(ctx, "update_nifty_watcher_eod", stmt, id, eodTs, eodPnL, maxPnL, maxPnLTs, maxLoss, maxLossTs)
	return err
}

func (s *Store) ListNiftyWatcherRuns(ctx context.Context, limit int) ([]NiftyWatcherRun, error) {
	if limit <= 0 {
		limit = 100
	}
	query := fmt.Sprintf(`SELECT id, strategy, trade_date, entry_ts, exit_ts, eod_ts, exit_reason, underlying, underlying_price, level, strike,
       ce_token, pe_token, ce_symbol, pe_symbol, ce_price, pe_price, qty, entry_combo, exit_combo, pnl, max_pnl, max_pnl_ts, max_loss, max_loss_ts, eod_pnl,
       rsi, willr, ce_norm, pe_norm, norm_diff, target_rupees, raw, created_at, updated_at
FROM %s.nifty_watcher_runs
ORDER BY entry_ts DESC
LIMIT $1`, quoteIdent(s.Schema))
	rows, err := s.Pool.Query(ctx, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []NiftyWatcherRun{}
	for rows.Next() {
		var row NiftyWatcherRun
		if err := rows.Scan(
			&row.ID,
			&row.Strategy,
			&row.TradeDate,
			&row.EntryTs,
			&row.ExitTs,
			&row.EODTs,
			&row.ExitReason,
			&row.Underlying,
			&row.UnderlyingPrice,
			&row.Level,
			&row.Strike,
			&row.CEToken,
			&row.PEToken,
			&row.CESymbol,
			&row.PESymbol,
			&row.CEPrice,
			&row.PEPrice,
			&row.Qty,
			&row.EntryCombo,
			&row.ExitCombo,
			&row.PnL,
			&row.MaxPnL,
			&row.MaxPnLTs,
			&row.MaxLoss,
			&row.MaxLossTs,
			&row.EODPnL,
			&row.RSI,
			&row.WILLR,
			&row.CENorm,
			&row.PENorm,
			&row.NormDiff,
			&row.TargetRupees,
			&row.Raw,
			&row.CreatedAt,
			&row.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func (s *Store) FetchNiftyWatcherSummary(ctx context.Context) (NiftyWatcherSummary, error) {
	summary := NiftyWatcherSummary{ByStrategy: map[string]float64{}}
	query := fmt.Sprintf(`SELECT COALESCE(sum(pnl),0), COALESCE(sum(eod_pnl),0), COALESCE(count(*),0) FROM %s.nifty_watcher_runs`, quoteIdent(s.Schema))
	if err := s.Pool.QueryRow(ctx, query).Scan(&summary.TotalPnL, &summary.TotalEODPnL, &summary.TotalRuns); err != nil {
		return summary, err
	}
	query = fmt.Sprintf(`SELECT strategy, COALESCE(sum(pnl),0) FROM %s.nifty_watcher_runs GROUP BY strategy`, quoteIdent(s.Schema))
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
		if strategy == "" {
			strategy = "unknown"
		}
		summary.ByStrategy[strategy] = pnl
	}
	return summary, rows.Err()
}
