package maxpain

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"trading-stack/internal/alerts"
	"trading-stack/internal/config"
	"trading-stack/internal/store"
	"trading-stack/internal/universe"
)

type Runner struct {
	cfg      config.MaxPainConfig
	runtime  config.RuntimeConfig
	universe config.UniverseConfig
	store    *store.Store
	logger   *slog.Logger
	loc      *time.Location
	alerts   *alerts.Client
}

type optionRow struct {
	Strike float64
	Right  string
	OI     int64
}

type strikeAggregate struct {
	Strike float64
	CEOI   int64
	PEOI   int64
}

type levelRow struct {
	Strike    float64
	CEOI      int64
	PEOI      int64
	CEPain    float64
	PEPain    float64
	TotalPain float64
}

type summaryRow struct {
	Underlying    string
	Expiry        time.Time
	MaxPainStrike float64
	TotalPain     float64
	CEOI          int64
	PEOI          int64
	SpotPrice     float64
}

func NewRunner(cfg *config.Config, st *store.Store, logger *slog.Logger, loc *time.Location) *Runner {
	moduleLogger := logger
	if moduleLogger != nil {
		moduleLogger = moduleLogger.With("module", "max_pain")
	}
	return &Runner{
		cfg:      cfg.MaxPain,
		runtime:  cfg.Runtime,
		universe: cfg.Universe,
		store:    st,
		logger:   moduleLogger,
		loc:      loc,
		alerts:   alerts.NewClient(cfg.MaxPain.Alerts),
	}
}

func (r *Runner) Run(ctx context.Context) error {
	if !r.cfg.Enable {
		if r.logger != nil {
			r.logger.Info("max_pain_disabled")
		}
		return nil
	}

	interval := time.Duration(r.cfg.RunIntervalSeconds) * time.Second
	if interval <= 0 {
		interval = 5 * time.Minute
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	if err := r.runOnce(ctx); err != nil && r.logger != nil {
		r.logger.Warn("max_pain_run_failed", "err", err)
	}

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			if err := r.runOnce(ctx); err != nil {
				if r.logger != nil {
					r.logger.Warn("max_pain_run_failed", "err", err)
				}
			}
		}
	}
}

func (r *Runner) runOnce(ctx context.Context) error {
	now := time.Now().In(r.loc)
	if !r.cfg.RunOutsideMarketHours && outsideMarketHours(now, r.runtime.TradingStart, r.runtime.TradingEnd, r.loc) {
		if r.logger != nil {
			r.logger.Info("max_pain_skipped_outside_market_hours")
		}
		return nil
	}

	underlyings := normalizeUnderlyings(r.cfg.Underlyings)
	expiryRanks := normalizeExpiryRanks(r.cfg.ExpiryRanks)
	alertBudget := r.cfg.Alerts.MaxPerRun
	if alertBudget < 0 {
		alertBudget = 0
	}

	start := time.Now()
	var runs int
	for _, underlying := range underlyings {
		for _, rank := range expiryRanks {
			if err := r.processUnderlying(ctx, underlying, rank, &alertBudget); err != nil {
				if r.logger != nil {
					r.logger.Warn("max_pain_underlying_failed", "underlying", underlying, "expiry_rank", rank, "err", err)
				}
				continue
			}
			runs++
		}
	}
	if r.logger != nil {
		r.logger.Info("max_pain_run_complete", "underlyings", len(underlyings), "runs", runs, "duration_ms", time.Since(start).Milliseconds())
	}
	return nil
}

func (r *Runner) processUnderlying(ctx context.Context, underlying string, expiryRank int, alertBudget *int) error {
	expiry, err := r.findExpiry(ctx, underlying, expiryRank)
	if err != nil {
		return err
	}
	if expiry == nil {
		if r.logger != nil {
			r.logger.Warn("max_pain_no_expiry", "underlying", underlying, "expiry_rank", expiryRank)
		}
		return nil
	}

	started := time.Now().UTC()
	runID := fmt.Sprintf("maxpain-%s-%s-%s", underlying, expiry.Format("20060102"), started.Format("20060102T150405.000Z0700"))
	status := "success"
	var errMsg string

	cutoff := time.Now().Add(-time.Duration(r.cfg.MaxDataStalenessMinutes) * time.Minute)
	rows, err := r.fetchOptionOI(ctx, underlying, *expiry, cutoff)
	if err != nil {
		status = "error"
		errMsg = err.Error()
	}
	if status == "success" && len(rows) == 0 {
		status = "skipped"
		errMsg = "no_recent_oi"
	}

	var (
		spotPrice   *float64
		spotSeen    time.Time
		strikeCount int
		optionCount int
		levels      []levelRow
		summary     *summaryRow
		changed     bool
	)

	if status == "success" {
		price, seen, ok, err := r.fetchSpotPrice(ctx, underlying)
		if err != nil {
			status = "error"
			errMsg = err.Error()
		} else if !ok {
			status = "skipped"
			errMsg = "spot_price_unavailable"
		} else if seen.Before(cutoff) {
			status = "skipped"
			errMsg = "spot_price_stale"
		} else {
			spotPrice = &price
			spotSeen = seen
		}
	}

	if status == "success" {
		optionCount = len(rows)
		strikeMap := map[float64]*strikeAggregate{}
		for _, row := range rows {
			agg := strikeMap[row.Strike]
			if agg == nil {
				agg = &strikeAggregate{Strike: row.Strike}
				strikeMap[row.Strike] = agg
			}
			if row.Right == "CE" {
				agg.CEOI += row.OI
			} else if row.Right == "PE" {
				agg.PEOI += row.OI
			}
		}

		strikes := make([]float64, 0, len(strikeMap))
		for strike := range strikeMap {
			strikes = append(strikes, strike)
		}
		sort.Float64s(strikes)
		strikeCount = len(strikes)
		if strikeCount == 0 || spotPrice == nil {
			status = "skipped"
			errMsg = "no_valid_strikes"
		} else {
			minTotal := math.Inf(1)
			var bestStrike float64
			var bestCEOI, bestPEOI int64
			for _, strike := range strikes {
				agg := strikeMap[strike]
				cePain := float64(agg.CEOI) * math.Max(0, *spotPrice-strike)
				pePain := float64(agg.PEOI) * math.Max(0, strike-*spotPrice)
				total := cePain + pePain
				levels = append(levels, levelRow{
					Strike:    strike,
					CEOI:      agg.CEOI,
					PEOI:      agg.PEOI,
					CEPain:    cePain,
					PEPain:    pePain,
					TotalPain: total,
				})
				if total < minTotal || (total == minTotal && (bestStrike == 0 || strike < bestStrike)) {
					minTotal = total
					bestStrike = strike
					bestCEOI = agg.CEOI
					bestPEOI = agg.PEOI
				}
			}
			summary = &summaryRow{
				Underlying:    underlying,
				Expiry:        *expiry,
				MaxPainStrike: bestStrike,
				TotalPain:     minTotal,
				CEOI:          bestCEOI,
				PEOI:          bestPEOI,
				SpotPrice:     *spotPrice,
			}
			prevStrike, ok, err := r.fetchSummaryStrike(ctx, underlying, *expiry)
			if err == nil && ok {
				if math.Abs(prevStrike-bestStrike) >= 0.0001 {
					changed = true
				}
			}
		}
	}

	finished := time.Now().UTC()
	writeErr := r.store.WithTx(ctx, func(tx pgx.Tx) error {
		if err := insertRun(ctx, tx, r.store.Schema, runID, started, finished, underlying, *expiry, spotPrice, strikeCount, optionCount, status, errMsg); err != nil {
			return err
		}
		if status != "success" || summary == nil {
			return nil
		}
		if err := insertLevels(ctx, tx, r.store.Schema, runID, underlying, *expiry, levels); err != nil {
			return err
		}
		if err := upsertSummary(ctx, tx, r.store.Schema, *summary); err != nil {
			return err
		}
		return nil
	})
	if writeErr != nil {
		return writeErr
	}

	if status == "success" && summary != nil {
		if r.logger != nil {
			r.logger.Info("max_pain_refresh",
				"underlying", underlying,
				"expiry", expiry.Format("2006-01-02"),
				"max_pain_strike", summary.MaxPainStrike,
				"spot_price", summary.SpotPrice,
				"strike_count", strikeCount,
				"option_count", optionCount,
				"spot_seen", spotSeen,
			)
		}
		if changed && r.cfg.Alerts.EnableWebhook && r.alerts != nil && alertBudget != nil && *alertBudget > 0 {
			title := fmt.Sprintf("%s %s", r.cfg.Alerts.TitlePrefix, underlying)
			message := fmt.Sprintf("Max pain %s %s: %.2f spot %.2f", underlying, expiry.Format("2006-01-02"), summary.MaxPainStrike, summary.SpotPrice)
			if err := r.alerts.Send(ctx, title, message); err != nil && r.logger != nil {
				r.logger.Warn("max_pain_alert_failed", "underlying", underlying, "err", err)
			} else {
				*alertBudget--
			}
		}
	}
	return nil
}

func (r *Runner) findExpiry(ctx context.Context, underlying string, rank int) (*time.Time, error) {
	names := underlyingAliases(underlying)
	if len(names) == 0 {
		return nil, nil
	}
	table := qualified(r.store.Schema, "instruments")
	currentMonthClause := ""
	if r.universe.FNOCurrentMonthOnly {
		currentMonthClause = "AND date_trunc('month', expiry) = date_trunc('month', CURRENT_DATE)"
	}
	query := fmt.Sprintf(`
SELECT DISTINCT expiry
FROM %s
WHERE exchange = $1
  AND upper(name) = ANY($2)
  AND instrumenttype IN ('OPTIDX','OPTSTK')
  AND expiry IS NOT NULL
  AND expiry >= CURRENT_DATE
  %s
ORDER BY expiry
OFFSET $3
LIMIT 1`, table, currentMonthClause)
	var expiry pgtype.Date
	err := r.store.Pool.QueryRow(ctx, query, r.universe.DerivativesExchange, names, rank).Scan(&expiry)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if !expiry.Valid {
		return nil, nil
	}
	value := expiry.Time
	return &value, nil
}

func (r *Runner) fetchOptionOI(ctx context.Context, underlying string, expiry time.Time, cutoff time.Time) ([]optionRow, error) {
	names := underlyingAliases(underlying)
	if len(names) == 0 {
		return nil, nil
	}
	table := qualified(r.store.Schema, "oi_snapshots_options")
	instTable := qualified(r.store.Schema, "instruments")
	query := fmt.Sprintf(`
WITH latest AS (
  SELECT DISTINCT ON (exchange, symbol_token) exchange, symbol_token, oi, ts
  FROM %s
  WHERE ts >= $1
  ORDER BY exchange, symbol_token, ts DESC
)
SELECT i.tradingsymbol, i.strike, l.oi
FROM latest l
JOIN %s i ON i.exchange = l.exchange AND i.symbol_token = l.symbol_token
WHERE i.exchange = $2
  AND upper(i.name) = ANY($3)
  AND i.instrumenttype IN ('OPTIDX','OPTSTK')
  AND i.expiry = $4
  AND i.strike IS NOT NULL
`, table, instTable)
	rows, err := r.store.Pool.Query(ctx, query, cutoff, r.universe.DerivativesExchange, names, expiry)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []optionRow
	for rows.Next() {
		var symbol string
		var strike pgtype.Numeric
		var oi pgtype.Int8
		if err := rows.Scan(&symbol, &strike, &oi); err != nil {
			return nil, err
		}
		right := optionRight(symbol)
		if right == "" || !strike.Valid || !oi.Valid {
			continue
		}
		strikeValue, err := strike.Float64Value()
		if err != nil {
			continue
		}
		if oi.Int64 <= 0 {
			continue
		}
		out = append(out, optionRow{
			Strike: strikeValue.Float64,
			Right:  right,
			OI:     oi.Int64,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func (r *Runner) fetchSpotPrice(ctx context.Context, underlying string) (float64, time.Time, bool, error) {
	exchange, token, err := r.resolveUnderlyingToken(ctx, underlying)
	if err != nil {
		return 0, time.Time{}, false, err
	}
	table := qualified(r.store.Schema, "instrument_state")
	query := fmt.Sprintf(`
SELECT last_price, last_seen_ts
FROM %s
WHERE exchange = $1 AND symbol_token = $2
LIMIT 1`, table)
	var price pgtype.Numeric
	var seen pgtype.Timestamptz
	if err := r.store.Pool.QueryRow(ctx, query, exchange, token).Scan(&price, &seen); err != nil {
		if err == pgx.ErrNoRows {
			return 0, time.Time{}, false, nil
		}
		return 0, time.Time{}, false, err
	}
	if !price.Valid || !seen.Valid {
		return 0, time.Time{}, false, nil
	}
	value, err := price.Float64Value()
	if err != nil {
		return 0, time.Time{}, false, nil
	}
	return value.Float64, seen.Time, true, nil
}

func (r *Runner) resolveUnderlyingToken(ctx context.Context, underlying string) (string, string, error) {
	exchange := strings.TrimSpace(r.universe.EquitiesExchange)
	if exchange == "" {
		exchange = "NSE"
	}
	if r.universe.IndexTokens != nil {
		if token, ok := r.universe.IndexTokens[underlying]; ok && strings.TrimSpace(token) != "" {
			return exchange, token, nil
		}
	}
	lookup, err := r.store.ResolveEquityToken(ctx, exchange, underlying)
	if err != nil {
		return "", "", err
	}
	return lookup.Exchange, lookup.SymbolToken, nil
}

func (r *Runner) fetchSummaryStrike(ctx context.Context, underlying string, expiry time.Time) (float64, bool, error) {
	table := qualified(r.store.Schema, "max_pain_summary")
	query := fmt.Sprintf(`SELECT max_pain_strike FROM %s WHERE underlying = $1 AND expiry = $2`, table)
	var strike pgtype.Numeric
	if err := r.store.Pool.QueryRow(ctx, query, underlying, expiry).Scan(&strike); err != nil {
		if err == pgx.ErrNoRows {
			return 0, false, nil
		}
		return 0, false, err
	}
	if !strike.Valid {
		return 0, false, nil
	}
	value, err := strike.Float64Value()
	if err != nil {
		return 0, false, nil
	}
	return value.Float64, true, nil
}

func insertRun(ctx context.Context, tx pgx.Tx, schema, runID string, started, finished time.Time, underlying string, expiry time.Time, spot *float64, strikeCount, optionCount int, status, errMsg string) error {
	table := qualified(schema, "max_pain_runs")
	query := fmt.Sprintf(`
INSERT INTO %s
  (run_id, started_at, finished_at, underlying, expiry, spot_price, strike_count, option_count, status, error)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
`, table)
	_, err := tx.Exec(ctx, query,
		runID,
		started,
		finished,
		underlying,
		expiry,
		spot,
		strikeCount,
		optionCount,
		status,
		nullableString(errMsg),
	)
	return err
}

func insertLevels(ctx context.Context, tx pgx.Tx, schema, runID, underlying string, expiry time.Time, levels []levelRow) error {
	if len(levels) == 0 {
		return nil
	}
	table := qualified(schema, "max_pain_levels")
	query := fmt.Sprintf(`
INSERT INTO %s
  (run_id, underlying, expiry, strike, ce_oi, pe_oi, ce_pain, pe_pain, total_pain)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
ON CONFLICT (run_id, strike) DO UPDATE
  SET ce_oi = EXCLUDED.ce_oi,
      pe_oi = EXCLUDED.pe_oi,
      ce_pain = EXCLUDED.ce_pain,
      pe_pain = EXCLUDED.pe_pain,
      total_pain = EXCLUDED.total_pain
`, table)
	batch := &pgx.Batch{}
	for _, level := range levels {
		batch.Queue(query,
			runID,
			underlying,
			expiry,
			level.Strike,
			level.CEOI,
			level.PEOI,
			level.CEPain,
			level.PEPain,
			level.TotalPain,
		)
	}
	return execBatch(ctx, tx, batch)
}

func upsertSummary(ctx context.Context, tx pgx.Tx, schema string, summary summaryRow) error {
	table := qualified(schema, "max_pain_summary")
	query := fmt.Sprintf(`
INSERT INTO %s
  (underlying, expiry, max_pain_strike, total_pain, ce_oi, pe_oi, spot_price, updated_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,now())
ON CONFLICT (underlying, expiry) DO UPDATE
  SET max_pain_strike = EXCLUDED.max_pain_strike,
      total_pain = EXCLUDED.total_pain,
      ce_oi = EXCLUDED.ce_oi,
      pe_oi = EXCLUDED.pe_oi,
      spot_price = EXCLUDED.spot_price,
      updated_at = now()
`, table)
	_, err := tx.Exec(ctx, query,
		summary.Underlying,
		summary.Expiry,
		summary.MaxPainStrike,
		summary.TotalPain,
		summary.CEOI,
		summary.PEOI,
		summary.SpotPrice,
	)
	return err
}

func execBatch(ctx context.Context, tx pgx.Tx, batch *pgx.Batch) error {
	br := tx.SendBatch(ctx, batch)
	defer br.Close()
	for i := 0; i < batch.Len(); i++ {
		if _, err := br.Exec(); err != nil {
			return err
		}
	}
	return nil
}

func normalizeUnderlyings(values []string) []string {
	seen := map[string]struct{}{}
	var out []string
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		norm := universe.NormalizeIndexUnderlying(trimmed)
		if norm == "" {
			norm = strings.ToUpper(trimmed)
		}
		if _, ok := seen[norm]; ok {
			continue
		}
		seen[norm] = struct{}{}
		out = append(out, norm)
	}
	return out
}

func normalizeExpiryRanks(values []int) []int {
	if len(values) == 0 {
		return []int{0}
	}
	seen := map[int]struct{}{}
	var out []int
	for _, value := range values {
		if value < 0 {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	sort.Ints(out)
	if len(out) == 0 {
		return []int{0}
	}
	return out
}

func underlyingAliases(underlying string) []string {
	norm := universe.NormalizeIndexUnderlying(underlying)
	if norm == "" {
		norm = strings.ToUpper(strings.TrimSpace(underlying))
	}
	switch norm {
	case "NIFTY50", "NIFTY":
		return []string{"NIFTY", "NIFTY50"}
	default:
		if norm == "" {
			return nil
		}
		return []string{norm}
	}
}

func optionRight(symbol string) string {
	upper := strings.ToUpper(symbol)
	if strings.HasSuffix(upper, "CE") {
		return "CE"
	}
	if strings.HasSuffix(upper, "PE") {
		return "PE"
	}
	return ""
}

func outsideMarketHours(now time.Time, tradingStart, tradingEnd string, loc *time.Location) bool {
	start, end, err := tradingWindow(now, tradingStart, tradingEnd, loc)
	if err != nil {
		return false
	}
	return now.Before(start) || now.After(end)
}

func tradingWindow(now time.Time, tradingStart, tradingEnd string, loc *time.Location) (time.Time, time.Time, error) {
	startParsed, err := time.ParseInLocation("15:04", tradingStart, loc)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("invalid trading_start: %w", err)
	}
	endParsed, err := time.ParseInLocation("15:04", tradingEnd, loc)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("invalid trading_end: %w", err)
	}
	start := time.Date(now.Year(), now.Month(), now.Day(), startParsed.Hour(), startParsed.Minute(), 0, 0, loc)
	end := time.Date(now.Year(), now.Month(), now.Day(), endParsed.Hour(), endParsed.Minute(), 0, 0, loc)
	return start, end, nil
}

func qualified(schema, table string) string {
	if strings.TrimSpace(schema) == "" {
		return pgx.Identifier{table}.Sanitize()
	}
	return pgx.Identifier{schema, table}.Sanitize()
}

func nullableString(value string) *string {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	return &value
}
