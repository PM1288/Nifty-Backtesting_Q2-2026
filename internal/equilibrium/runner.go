package equilibrium

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

	"trading-stack/internal/config"
	"trading-stack/internal/store"
	"trading-stack/internal/universe"
)

type Runner struct {
	cfg    config.EquilibriumConfig
	store  *store.Store
	logger *slog.Logger
	loc    *time.Location
}

type barRow struct {
	Ts     time.Time
	Token  string
	Close  float64
	Strike float64
	Right  string
}

type underlyingBar struct {
	Ts    time.Time
	Close float64
}

type tokenStats struct {
	Min float64
	Max float64
}

type seriesAccum struct {
	CERawSum float64
	CECount  int
	PERawSum float64
	PECount  int
}

type seriesRow struct {
	Ts      time.Time
	CEMean  *float64
	PEMean  *float64
	CECount int
	PECount int
}

type latestToken struct {
	Ts     time.Time
	Close  float64
	Norm   float64
	Strike float64
	Right  string
}

type strikeSnapshot struct {
	Strike  float64
	CeClose *float64
	PeClose *float64
	CeNorm  *float64
	PeNorm  *float64
	Updated time.Time
}

type currentSnapshot struct {
	Underlying string
	Expiry     time.Time
	Strike     float64
	RefPrice   *float64
	StrikeStep *float64
	CeNorm     *float64
	PeNorm     *float64
	CeClose    *float64
	PeClose    *float64
	Reason     string
	UpdatedAt  time.Time
}

func NewRunner(cfg *config.Config, st *store.Store, logger *slog.Logger, loc *time.Location) *Runner {
	moduleLogger := logger
	if moduleLogger != nil {
		moduleLogger = moduleLogger.With("module", "equilibrium")
	}
	return &Runner{
		cfg:    cfg.Equilibrium,
		store:  st,
		logger: moduleLogger,
		loc:    loc,
	}
}

func (r *Runner) Run(ctx context.Context) error {
	if !r.cfg.Enable {
		if r.logger != nil {
			r.logger.Info("equilibrium_disabled")
		}
		return nil
	}

	interval := time.Duration(r.cfg.RunIntervalSeconds) * time.Second
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	if err := r.runOnce(ctx); err != nil && r.logger != nil {
		r.logger.Warn("equilibrium_run_failed", "err", err)
	}

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			if err := r.runOnce(ctx); err != nil {
				if r.logger != nil {
					r.logger.Warn("equilibrium_run_failed", "err", err)
				}
			}
		}
	}
}

func (r *Runner) runOnce(ctx context.Context) error {
	start := time.Now()
	underlyings := normalizeUnderlyings(r.cfg.Underlyings)
	var totalSeries int
	var totalStrikes int
	for _, underlying := range underlyings {
		series, strikes, err := r.processUnderlying(ctx, underlying)
		if err != nil {
			return err
		}
		totalSeries += series
		totalStrikes += strikes
	}
	if r.logger != nil {
		r.logger.Info("equilibrium_run_complete",
			"underlyings", len(underlyings),
			"series_rows", totalSeries,
			"strike_rows", totalStrikes,
			"duration_ms", time.Since(start).Milliseconds(),
		)
	}
	return nil
}

func (r *Runner) processUnderlying(ctx context.Context, underlying string) (int, int, error) {
	expiry, err := r.findExpiry(ctx, underlying)
	if err != nil {
		return 0, 0, err
	}
	if expiry == nil {
		if r.logger != nil {
			r.logger.Warn("equilibrium_no_expiry", "underlying", underlying)
		}
		return 0, 0, nil
	}

	cutoff := time.Now().Add(-time.Duration(r.cfg.MaxDataStalenessMinutes) * time.Minute)
	endTs, err := r.findLatestBarTs(ctx, underlying, *expiry, cutoff)
	if err != nil {
		return 0, 0, err
	}
	if endTs.IsZero() {
		if r.logger != nil {
			r.logger.Warn("equilibrium_no_bars", "underlying", underlying, "expiry", expiry.Format("2006-01-02"))
		}
		return 0, 0, nil
	}

	startTs := endTs.Add(-time.Duration(r.cfg.LookbackMinutes) * time.Minute)
	rows, err := r.fetchBars(ctx, underlying, *expiry, startTs, endTs)
	if err != nil {
		return 0, 0, err
	}
	if len(rows) == 0 {
		if r.logger != nil {
			r.logger.Warn("equilibrium_no_rows", "underlying", underlying, "expiry", expiry.Format("2006-01-02"))
		}
		return 0, 0, nil
	}

	// Normalize from market open (09:15 IST). This matches the runtime trading_start and
	// avoids the "start at 09:30" gap that makes charts look discontinuous.
	normStart := normalizationStartTs(endTs, r.loc, 9, 15)
	result := computeEquilibrium(rows, endTs, normStart)

	// Compute an ATM-only normalized series (CE/PE independently scaled 0..100) using the underlying
	// index price over the lookback window. This makes the CE/PE equilibrium chart interpretable and
	// avoids OTM strikes dominating the average.
	if spotBars, err := r.fetchUnderlyingBars(ctx, underlying, startTs, endTs); err == nil && len(spotBars) > 0 {
		if atmSeries := computeATMSeries(rows, result.StrikeList, spotBars, normStart); len(atmSeries) > 0 {
			result.Series = atmSeries

			var ceSum float64
			var ceCount int
			var peSum float64
			var peCount int
			for _, row := range atmSeries {
				if row.CEMean != nil {
					ceSum += *row.CEMean
					ceCount++
				}
				if row.PEMean != nil {
					peSum += *row.PEMean
					peCount++
				}
			}
			result.Summary.MeanCENorm = avgOrNil(ceSum, ceCount)
			result.Summary.MeanPENorm = avgOrNil(peSum, peCount)
			result.Summary.UpdatedAt = endTs
		}
	} else if err != nil && r.logger != nil {
		r.logger.Warn("equilibrium_underlying_bars_failed", "underlying", underlying, "err", err)
	}
	seriesRows := result.Series
	strikeRows := result.Strikes
	summary := result.Summary
	summary.Underlying = underlying
	summary.Expiry = *expiry
	current := r.buildCurrentSnapshotWithUnderlying(ctx, underlying, *expiry, result.StrikeList, result.StrikeMap, endTs)
	if len(seriesRows) == 0 || len(strikeRows) == 0 {
		if r.logger != nil {
			r.logger.Warn("equilibrium_empty_compute", "underlying", underlying, "expiry", expiry.Format("2006-01-02"))
		}
		return 0, 0, nil
	}

	if err := r.store.WithTx(ctx, func(tx pgx.Tx) error {
		if err := upsertMeanSeries(ctx, tx, r.store.Schema, underlying, *expiry, r.cfg.LookbackMinutes, seriesRows); err != nil {
			return err
		}
		if err := upsertStrikeSnapshot(ctx, tx, r.store.Schema, underlying, *expiry, strikeRows); err != nil {
			return err
		}
		if err := upsertSummary(ctx, tx, r.store.Schema, summary); err != nil {
			return err
		}
		if current != nil {
			if err := upsertCurrentSnapshot(ctx, tx, r.store.Schema, *current); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		return 0, 0, err
	}

	if r.logger != nil {
		r.logger.Info("equilibrium_refresh",
			"underlying", underlying,
			"expiry", expiry.Format("2006-01-02"),
			"series_rows", len(seriesRows),
			"strike_rows", len(strikeRows),
		)
	}
	return len(seriesRows), len(strikeRows), nil
}

func (r *Runner) findExpiry(ctx context.Context, underlying string) (*time.Time, error) {
	kinds := normalizeKinds(r.cfg.Kinds)
	if len(kinds) == 0 {
		return nil, nil
	}
	table := qualified(r.store.Schema, "subscriptions")
	query := fmt.Sprintf(`
SELECT expiry
FROM %s
WHERE active = true
  AND underlying = $1
  AND kind = ANY($2)
  AND expiry IS NOT NULL
  AND expiry >= CURRENT_DATE
ORDER BY expiry
OFFSET $3
LIMIT 1`, table)
	var expiry pgtype.Date
	err := r.store.Pool.QueryRow(ctx, query, underlying, kinds, r.cfg.ExpiryRank).Scan(&expiry)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if !expiry.Valid {
		return nil, nil
	}
	t := expiry.Time
	return &t, nil
}

func (r *Runner) findLatestBarTs(ctx context.Context, underlying string, expiry time.Time, cutoff time.Time) (time.Time, error) {
	kinds := normalizeKinds(r.cfg.Kinds)
	bars := qualified(r.store.Schema, "bars_1m")
	subs := qualified(r.store.Schema, "subscriptions")
	query := fmt.Sprintf(`
SELECT max(b.ts)
FROM %s b
JOIN %s s ON s.exchange = b.exchange AND s.symbol_token = b.symbol_token
WHERE s.active = true
  AND s.underlying = $1
  AND s.expiry = $2
  AND s.kind = ANY($3)
  AND b.ts >= $4`, bars, subs)
	var ts pgtype.Timestamptz
	if err := r.store.Pool.QueryRow(ctx, query, underlying, expiry, kinds, cutoff).Scan(&ts); err != nil {
		return time.Time{}, err
	}
	if !ts.Valid {
		return time.Time{}, nil
	}
	return ts.Time, nil
}

func (r *Runner) fetchBars(ctx context.Context, underlying string, expiry time.Time, startTs time.Time, endTs time.Time) ([]barRow, error) {
	kinds := normalizeKinds(r.cfg.Kinds)
	bars := qualified(r.store.Schema, "bars_1m")
	subs := qualified(r.store.Schema, "subscriptions")
	query := fmt.Sprintf(`
SELECT b.ts, b.symbol_token, b.close::float8, s.strike::float8, s.right
FROM %s b
JOIN %s s ON s.exchange = b.exchange AND s.symbol_token = b.symbol_token
WHERE s.active = true
  AND s.underlying = $1
  AND s.expiry = $2
  AND s.kind = ANY($3)
  AND s.right IN ('CE','PE')
  AND b.ts >= $4
  AND b.ts <= $5
ORDER BY b.ts`, bars, subs)
	rows, err := r.store.Pool.Query(ctx, query, underlying, expiry, kinds, startTs, endTs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []barRow
	for rows.Next() {
		var row barRow
		if err := rows.Scan(&row.Ts, &row.Token, &row.Close, &row.Strike, &row.Right); err != nil {
			return nil, err
		}
		row.Right = strings.ToUpper(strings.TrimSpace(row.Right))
		if row.Right != "CE" && row.Right != "PE" {
			continue
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

type equilibriumResult struct {
	Series     []seriesRow
	Strikes    []strikeSnapshot
	StrikeMap  map[float64]*strikeSnapshot
	StrikeList []float64
	Summary    equilibriumSummary
}

func computeEquilibrium(rows []barRow, endTs time.Time, normStart time.Time) equilibriumResult {
	stats := map[string]*tokenStats{}
	fallbackStats := map[string]*tokenStats{}
	latest := map[string]latestToken{}
	for _, row := range rows {
		fb, ok := fallbackStats[row.Token]
		if !ok {
			fallbackStats[row.Token] = &tokenStats{Min: row.Close, Max: row.Close}
		} else {
			if row.Close < fb.Min {
				fb.Min = row.Close
			}
			if row.Close > fb.Max {
				fb.Max = row.Close
			}
		}
		// Ignore the first few minutes after market open when computing min/max
		// for normalization, otherwise the opening spike compresses the rest of day.
		if !normStart.IsZero() && row.Ts.Before(normStart) {
			continue
		}
		stat, ok := stats[row.Token]
		if !ok {
			stats[row.Token] = &tokenStats{Min: row.Close, Max: row.Close}
		} else {
			if row.Close < stat.Min {
				stat.Min = row.Close
			}
			if row.Close > stat.Max {
				stat.Max = row.Close
			}
		}
	}

	accum := map[time.Time]*seriesAccum{}
	for _, row := range rows {
		stat := stats[row.Token]
		if stat == nil {
			stat = fallbackStats[row.Token]
		}
		if stat == nil {
			continue
		}
		norm := normalizeValue(row.Close, stat.Min, stat.Max)
		acc := accum[row.Ts]
		if acc == nil {
			acc = &seriesAccum{}
			accum[row.Ts] = acc
		}
		if row.Right == "CE" {
			acc.CERawSum += row.Close
			acc.CECount++
		} else {
			acc.PERawSum += row.Close
			acc.PECount++
		}
		existing, ok := latest[row.Token]
		if !ok || row.Ts.After(existing.Ts) {
			latest[row.Token] = latestToken{
				Ts:     row.Ts,
				Close:  row.Close,
				Norm:   norm,
				Strike: row.Strike,
				Right:  row.Right,
			}
		}
	}

	series := make([]seriesRow, 0, len(accum))
	for ts, acc := range accum {
		row := seriesRow{Ts: ts, CECount: acc.CECount, PECount: acc.PECount}
		if acc.CECount > 0 {
			value := acc.CERawSum / float64(acc.CECount)
			row.CEMean = &value
		}
		if acc.PECount > 0 {
			value := acc.PERawSum / float64(acc.PECount)
			row.PEMean = &value
		}
		series = append(series, row)
	}
	sort.Slice(series, func(i, j int) bool {
		return series[i].Ts.Before(series[j].Ts)
	})

	// Normalize the aggregated CE/PE mean series itself (instead of mean of per-token normalized values).
	// This guarantees the series spans 0..100 within the normalization window.
	ceMin, ceMax, okCE := minMaxSeries(series, normStart, true)
	peMin, peMax, okPE := minMaxSeries(series, normStart, false)
	for i := range series {
		if okCE && series[i].CEMean != nil {
			v := normalizeValue(*series[i].CEMean, ceMin, ceMax)
			series[i].CEMean = &v
		}
		if okPE && series[i].PEMean != nil {
			v := normalizeValue(*series[i].PEMean, peMin, peMax)
			series[i].PEMean = &v
		}
	}

	var meanCeSum float64
	var meanCeCount int
	var meanPeSum float64
	var meanPeCount int
	for _, row := range series {
		if row.CEMean != nil {
			meanCeSum += *row.CEMean
			meanCeCount++
		}
		if row.PEMean != nil {
			meanPeSum += *row.PEMean
			meanPeCount++
		}
	}

	strikeMap := map[float64]*strikeSnapshot{}
	for _, item := range latest {
		if item.Strike == 0 {
			continue
		}
		snap := strikeMap[item.Strike]
		if snap == nil {
			snap = &strikeSnapshot{Strike: item.Strike, Updated: endTs}
			strikeMap[item.Strike] = snap
		}
		valueClose := item.Close
		valueNorm := item.Norm
		if item.Right == "CE" {
			snap.CeClose = &valueClose
			snap.CeNorm = &valueNorm
		} else if item.Right == "PE" {
			snap.PeClose = &valueClose
			snap.PeNorm = &valueNorm
		}
	}

	strikeRows := make([]strikeSnapshot, 0, len(strikeMap))
	strikes := make([]float64, 0, len(strikeMap))
	for strike, snap := range strikeMap {
		strikeRows = append(strikeRows, *snap)
		strikes = append(strikes, strike)
	}
	sort.Float64s(strikes)

	summary := equilibriumSummary{
		MeanCENorm: avgOrNil(meanCeSum, meanCeCount),
		MeanPENorm: avgOrNil(meanPeSum, meanPeCount),
		UpdatedAt:  endTs,
	}

	return equilibriumResult{
		Series:     series,
		Strikes:    strikeRows,
		StrikeMap:  strikeMap,
		StrikeList: strikes,
		Summary:    summary,
	}
}

type optionPointKey struct {
	Ts     time.Time
	Strike float64
	Right  string
}

func nearestStrike(strikes []float64, spot float64) float64 {
	if len(strikes) == 0 {
		return 0
	}
	idx := sort.SearchFloat64s(strikes, spot)
	if idx <= 0 {
		return strikes[0]
	}
	if idx >= len(strikes) {
		return strikes[len(strikes)-1]
	}
	lo := strikes[idx-1]
	hi := strikes[idx]
	if math.Abs(spot-lo) <= math.Abs(hi-spot) {
		return lo
	}
	return hi
}

// computeATMSeries builds a CE/PE series by picking the nearest-to-spot strike per minute (ATM),
// then normalizes CE and PE independently to 0..100 within the normalization window.
func computeATMSeries(optionRows []barRow, strikes []float64, spotBars []underlyingBar, normStart time.Time) []seriesRow {
	if len(optionRows) == 0 || len(strikes) == 0 || len(spotBars) == 0 {
		return nil
	}

	// Map option closes by (ts,strike,right) for quick lookup.
	closeByKey := make(map[optionPointKey]float64, len(optionRows))
	for _, row := range optionRows {
		if row.Strike == 0 {
			continue
		}
		right := strings.ToUpper(strings.TrimSpace(row.Right))
		if right != "CE" && right != "PE" {
			continue
		}
		closeByKey[optionPointKey{Ts: row.Ts, Strike: row.Strike, Right: right}] = row.Close
	}

	series := make([]seriesRow, 0, len(spotBars))
	for _, spot := range spotBars {
		atmStrike := nearestStrike(strikes, spot.Close)
		if atmStrike == 0 {
			continue
		}

		row := seriesRow{Ts: spot.Ts}
		if v, ok := closeByKey[optionPointKey{Ts: spot.Ts, Strike: atmStrike, Right: "CE"}]; ok {
			val := v
			row.CEMean = &val
			row.CECount = 1
		}
		if v, ok := closeByKey[optionPointKey{Ts: spot.Ts, Strike: atmStrike, Right: "PE"}]; ok {
			val := v
			row.PEMean = &val
			row.PECount = 1
		}
		series = append(series, row)
	}

	if len(series) == 0 {
		return nil
	}

	ceMin, ceMax, okCE := minMaxSeries(series, normStart, true)
	peMin, peMax, okPE := minMaxSeries(series, normStart, false)
	for i := range series {
		if okCE && series[i].CEMean != nil {
			v := normalizeValue(*series[i].CEMean, ceMin, ceMax)
			series[i].CEMean = &v
		}
		if okPE && series[i].PEMean != nil {
			v := normalizeValue(*series[i].PEMean, peMin, peMax)
			series[i].PEMean = &v
		}
	}

	return series
}

func normalizationStartTs(endTs time.Time, loc *time.Location, hour, minute int) time.Time {
	if loc == nil {
		loc = time.UTC
	}
	local := endTs.In(loc)
	return time.Date(local.Year(), local.Month(), local.Day(), hour, minute, 0, 0, loc).UTC()
}

func minMaxSeries(series []seriesRow, normStart time.Time, forCE bool) (min float64, max float64, ok bool) {
	apply := func(filter bool) (float64, float64, bool) {
		var minV float64
		var maxV float64
		has := false
		for _, row := range series {
			if filter && !normStart.IsZero() && row.Ts.Before(normStart) {
				continue
			}
			var ptr *float64
			if forCE {
				ptr = row.CEMean
			} else {
				ptr = row.PEMean
			}
			if ptr == nil {
				continue
			}
			v := *ptr
			if !has {
				minV = v
				maxV = v
				has = true
				continue
			}
			if v < minV {
				minV = v
			}
			if v > maxV {
				maxV = v
			}
		}
		return minV, maxV, has
	}

	// Prefer the post-09:30 window; if missing (e.g. pre-market) fall back to whatever we have.
	min, max, ok = apply(true)
	if ok {
		return min, max, true
	}
	return apply(false)
}

type equilibriumSummary struct {
	Underlying string
	Expiry     time.Time
	MeanCENorm *float64
	MeanPENorm *float64
	UpdatedAt  time.Time
}

func upsertMeanSeries(ctx context.Context, tx pgx.Tx, schema string, underlying string, expiry time.Time, lookback int, rows []seriesRow) error {
	if len(rows) == 0 {
		return nil
	}
	table := qualified(schema, "equilibrium_mean_series")
	query := fmt.Sprintf(`
INSERT INTO %s
  (ts, underlying, expiry, ce_mean_norm, pe_mean_norm, ce_count, pe_count, lookback_minutes, updated_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
ON CONFLICT (ts, underlying, expiry) DO UPDATE
  SET ce_mean_norm = EXCLUDED.ce_mean_norm,
      pe_mean_norm = EXCLUDED.pe_mean_norm,
      ce_count = EXCLUDED.ce_count,
      pe_count = EXCLUDED.pe_count,
      lookback_minutes = EXCLUDED.lookback_minutes,
      updated_at = now()
`, table)

	batch := &pgx.Batch{}
	for _, row := range rows {
		batch.Queue(query,
			row.Ts,
			underlying,
			expiry,
			row.CEMean,
			row.PEMean,
			row.CECount,
			row.PECount,
			lookback,
		)
	}
	return execBatch(ctx, tx, batch)
}

func upsertStrikeSnapshot(ctx context.Context, tx pgx.Tx, schema string, underlying string, expiry time.Time, rows []strikeSnapshot) error {
	if len(rows) == 0 {
		return nil
	}
	table := qualified(schema, "equilibrium_strike_snapshot")
	deleteSQL := fmt.Sprintf("DELETE FROM %s WHERE underlying = $1 AND expiry = $2", table)
	if _, err := tx.Exec(ctx, deleteSQL, underlying, expiry); err != nil {
		return err
	}
	query := fmt.Sprintf(`
INSERT INTO %s
  (underlying, expiry, strike, ce_close, pe_close, ce_norm, pe_norm, updated_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
ON CONFLICT (underlying, expiry, strike) DO UPDATE
  SET ce_close = EXCLUDED.ce_close,
      pe_close = EXCLUDED.pe_close,
      ce_norm = EXCLUDED.ce_norm,
      pe_norm = EXCLUDED.pe_norm,
      updated_at = EXCLUDED.updated_at
`, table)

	batch := &pgx.Batch{}
	for _, row := range rows {
		batch.Queue(query,
			underlying,
			expiry,
			row.Strike,
			row.CeClose,
			row.PeClose,
			row.CeNorm,
			row.PeNorm,
			row.Updated,
		)
	}
	return execBatch(ctx, tx, batch)
}

func upsertSummary(ctx context.Context, tx pgx.Tx, schema string, summary equilibriumSummary) error {
	table := qualified(schema, "equilibrium_summary")
	query := fmt.Sprintf(`
INSERT INTO %s
  (underlying, expiry, mean_ce_norm, mean_pe_norm, updated_at)
VALUES ($1,$2,$3,$4,$5)
ON CONFLICT (underlying, expiry) DO UPDATE
  SET mean_ce_norm = EXCLUDED.mean_ce_norm,
      mean_pe_norm = EXCLUDED.mean_pe_norm,
      updated_at = EXCLUDED.updated_at
`, table)
	_, err := tx.Exec(ctx, query, summary.Underlying, summary.Expiry, summary.MeanCENorm, summary.MeanPENorm, summary.UpdatedAt)
	return err
}

func upsertCurrentSnapshot(ctx context.Context, tx pgx.Tx, schema string, snap currentSnapshot) error {
	table := qualified(schema, "equilibrium_current_snapshot")
	query := fmt.Sprintf(`
INSERT INTO %s
  (underlying, expiry, strike, ref_price, strike_step, ce_norm, pe_norm, ce_close, pe_close, reason, updated_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
ON CONFLICT (underlying) DO UPDATE
  SET expiry = EXCLUDED.expiry,
      strike = EXCLUDED.strike,
      ref_price = EXCLUDED.ref_price,
      strike_step = EXCLUDED.strike_step,
      ce_norm = EXCLUDED.ce_norm,
      pe_norm = EXCLUDED.pe_norm,
      ce_close = EXCLUDED.ce_close,
      pe_close = EXCLUDED.pe_close,
      reason = EXCLUDED.reason,
      updated_at = EXCLUDED.updated_at
`, table)
	_, err := tx.Exec(ctx, query, snap.Underlying, snap.Expiry, snap.Strike, snap.RefPrice, snap.StrikeStep, snap.CeNorm, snap.PeNorm, snap.CeClose, snap.PeClose, snap.Reason, snap.UpdatedAt)
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

func normalizeKinds(kinds []string) []string {
	out := make([]string, 0, len(kinds))
	for _, kind := range kinds {
		trimmed := strings.TrimSpace(strings.ToUpper(kind))
		if trimmed == "" {
			continue
		}
		out = append(out, trimmed)
	}
	return out
}

func normalizeUnderlyings(values []string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		norm := universe.NormalizeIndexUnderlying(trimmed)
		if norm == "" {
			norm = strings.ToUpper(trimmed)
		}
		out = append(out, norm)
	}
	return out
}

func normalizeValue(value, min, max float64) float64 {
	if max <= min {
		return 50
	}
	norm := (value - min) / (max - min) * 100
	if norm < 0 {
		return 0
	}
	if norm > 100 {
		return 100
	}
	return norm
}

func avgOrNil(sum float64, count int) *float64 {
	if count == 0 {
		return nil
	}
	value := sum / float64(count)
	return &value
}

func qualified(schema, table string) string {
	if strings.TrimSpace(schema) == "" {
		return pgx.Identifier{table}.Sanitize()
	}
	return pgx.Identifier{schema, table}.Sanitize()
}

func (r *Runner) buildCurrentSnapshotWithUnderlying(ctx context.Context, underlying string, expiry time.Time, strikes []float64, strikeMap map[float64]*strikeSnapshot, endTs time.Time) *currentSnapshot {
	if len(strikes) == 0 {
		return nil
	}
	var refPrice *float64
	var refReason string
	var stepPtr *float64
	step := universe.InferStrikeStep(strikes)
	if step > 0 {
		stepCopy := step
		stepPtr = &stepCopy
	}

	price, priceSeen, ok := r.fetchUnderlyingPrice(ctx, underlying)
	if ok {
		if priceSeen.Add(time.Duration(r.cfg.UnderlyingStaleSeconds) * time.Second).After(endTs) {
			refPrice = &price
		}
	}

	strike := strikes[len(strikes)/2]
	if refPrice != nil && step > 0 {
		atm := universe.RoundToStep(*refPrice, step)
		nearest := strike
		minDiff := math.Abs(nearest - atm)
		for _, candidate := range strikes {
			diff := math.Abs(candidate - atm)
			if diff < minDiff {
				minDiff = diff
				nearest = candidate
			}
		}
		strike = nearest
		refReason = "atm"
	} else {
		refReason = "median_strike"
	}

	snap := strikeMap[strike]
	if snap == nil {
		return nil
	}
	if snap.CeNorm == nil && snap.PeNorm == nil {
		return nil
	}
	return &currentSnapshot{
		Underlying: underlying,
		Expiry:     expiry,
		Strike:     strike,
		RefPrice:   refPrice,
		StrikeStep: stepPtr,
		CeNorm:     snap.CeNorm,
		PeNorm:     snap.PeNorm,
		CeClose:    snap.CeClose,
		PeClose:    snap.PeClose,
		Reason:     refReason,
		UpdatedAt:  endTs,
	}
}

func (r *Runner) fetchUnderlyingPrice(ctx context.Context, underlying string) (float64, time.Time, bool) {
	subs := qualified(r.store.Schema, "subscriptions")
	state := qualified(r.store.Schema, "instrument_state")
	query := fmt.Sprintf(`
SELECT st.last_price, st.last_seen_ts
FROM %s s
JOIN %s st ON st.exchange = s.exchange AND st.symbol_token = s.symbol_token
WHERE s.active = true
  AND s.kind = 'INDEX'
  AND s.underlying = $1
ORDER BY st.last_seen_ts DESC
LIMIT 1`, subs, state)
	var price pgtype.Numeric
	var seen pgtype.Timestamptz
	if err := r.store.Pool.QueryRow(ctx, query, underlying).Scan(&price, &seen); err != nil {
		return 0, time.Time{}, false
	}
	if !price.Valid || !seen.Valid {
		return 0, time.Time{}, false
	}
	value, err := price.Float64Value()
	if err != nil {
		return 0, time.Time{}, false
	}
	return value.Float64, seen.Time, true
}

func (r *Runner) fetchUnderlyingBars(ctx context.Context, underlying string, startTs, endTs time.Time) ([]underlyingBar, error) {
	subs := qualified(r.store.Schema, "subscriptions")
	bars := qualified(r.store.Schema, "bars_1m")
	query := fmt.Sprintf(`
SELECT b.ts, b.close::float8
FROM %s b
JOIN %s s ON s.exchange = b.exchange AND s.symbol_token = b.symbol_token
WHERE s.active = true
  AND s.kind = 'INDEX'
  AND s.underlying = $1
  AND b.ts >= $2
  AND b.ts <= $3
ORDER BY b.ts`, bars, subs)

	rows, err := r.store.Pool.Query(ctx, query, underlying, startTs, endTs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []underlyingBar{}
	for rows.Next() {
		var b underlyingBar
		if err := rows.Scan(&b.Ts, &b.Close); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}
