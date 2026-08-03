package backtest

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"trading-stack/internal/store"
)

type optionBTContract struct {
	Exchange      string
	Token         string
	TradingSymbol string
	Underlying    string
	Expiry        time.Time
	Strike        float64
	Right         string
	LotSize       int
}

type OptionBTTrade struct {
	Strategy        string
	TradeDate       time.Time
	EntryTime       time.Time
	ExitTime        time.Time
	MaxPnLTime      time.Time
	ExitReason      string
	Trigger         string
	Underlying      string
	UnderlyingPrice float64
	Level           float64
	Strike          float64
	CEExchange      string
	PEExchange      string
	CEToken         string
	PEToken         string
	CESymbol        string
	PESymbol        string
	CEEntry         float64
	PEEntry         float64
	CEExit          float64
	PEExit          float64
	Qty             int64
	EntryCombo      float64
	ExitCombo       float64
	PnL             float64
	MaxPnL          float64
	Success         bool
	RSI             float64
	WillR           float64
	CENorm          float64
	PENorm          float64
	NormDiff        float64
	Raw             []byte
}

type OptionBTSummary struct {
	TotalTrades int
	Wins        int
	Losses      int
	WinRate     float64
	TotalPnL    float64
	AvgPnL      float64
	MaxDrawdown float64
	AvgNormDiff float64
}

type OptionBTRunResult struct {
	RunID     string
	TradeDate time.Time
	Trades    []OptionBTTrade
	Summary   OptionBTSummary
}

func (r *Runner) runOptionBacktest(ctx context.Context, tradeDate time.Time) (OptionBTRunResult, error) {
	cfg := r.cfg.Backtest.OptionBacktest
	result := OptionBTRunResult{
		RunID:     fmt.Sprintf("options-%s", tradeDate.In(r.loc).Format("20060102")),
		TradeDate: tradeDate,
		Trades:    nil,
		Summary:   OptionBTSummary{},
	}
	if !cfg.Enable {
		return result, nil
	}
	if cfg.RunTuesdayOnly && tradeDate.In(r.loc).Weekday() != time.Tuesday {
		return result, nil
	}
	underlying := strings.ToUpper(strings.TrimSpace(cfg.Underlying))
	if underlying == "" {
		underlying = "NIFTY50"
	}
	indexToken := strings.TrimSpace(cfg.IndexToken)
	if indexToken == "" {
		return result, nil
	}
	step := cfg.Step
	if step <= 0 {
		step = 100
	}
	buffer := cfg.Buffer
	if buffer < 0 {
		buffer = 0
	}
	entryStart, err := parseClockTime(tradeDate, cfg.EntryStart, r.loc)
	if err != nil {
		return result, err
	}
	entryEnd, err := parseClockTime(tradeDate, cfg.EntryEnd, r.loc)
	if err != nil {
		return result, err
	}
	exitAt, err := parseClockTime(tradeDate, cfg.ExitTime, r.loc)
	if err != nil {
		return result, err
	}
	windowStart, windowEnd, err := tradingWindowForDate(tradeDate, r.cfg.Runtime.TradingStart, r.cfg.Runtime.TradingEnd, r.loc)
	if err != nil {
		return result, err
	}

	underlyingBarsMap, err := fetchMinuteBars(ctx, r.store, []instrumentRef{{Exchange: "NSE", Token: indexToken, Symbol: underlying, TradingSymbol: underlying}}, windowStart.UTC(), windowEnd.UTC())
	if err != nil {
		return result, err
	}
	underlyingBars := underlyingBarsMap[indexToken]
	if len(underlyingBars) == 0 {
		return result, nil
	}

	rsiVals, willrVals := buildUnderlyingIndicators(underlyingBars, cfg.RSIPeriod, cfg.WILLRPeriod)

	contracts, err := fetchOptionContractsForBacktest(ctx, r.store, underlying, tradeDate)
	if err != nil {
		return result, err
	}
	if len(contracts) == 0 {
		return result, nil
	}
	selectedExpiry, ok := selectExpiryByRank(contracts, cfg.ExpiryRank, tradeDate)
	if !ok {
		return result, nil
	}
	contracts = filterContractsByExpiry(contracts, selectedExpiry)
	if len(contracts) == 0 {
		return result, nil
	}

	contractsByExchange := map[string][]string{}
	for _, c := range contracts {
		contractsByExchange[c.Exchange] = append(contractsByExchange[c.Exchange], c.Token)
	}
	optionBars := map[string][]minuteBar{}
	for exchange, tokens := range contractsByExchange {
		barsByToken, fetchErr := fetchMinuteBarsByExchange(ctx, r.store, exchange, dedupeStrings(tokens), windowStart.UTC(), windowEnd.UTC())
		if fetchErr != nil {
			return result, fetchErr
		}
		for token, rows := range barsByToken {
			optionBars[token] = rows
		}
	}

	normClock := cfg.NormalizationStart
	if strings.TrimSpace(normClock) == "" {
		normClock = "09:15"
	}
	normStart, err := parseClockTime(tradeDate, normClock, r.loc)
	if err != nil {
		return result, err
	}
	openStart, err := parseClockTime(tradeDate, "09:15", r.loc)
	if err != nil {
		return result, err
	}

	entered := map[string]bool{}
	trades := make([]OptionBTTrade, 0, 3)
	for i := range underlyingBars {
		bar := underlyingBars[i]
		local := bar.Ts.In(r.loc)
		if local.Before(entryStart) || local.After(entryEnd) {
			continue
		}
		rsiVal := rsiVals[i]
		willrVal := willrVals[i]
		if math.IsNaN(rsiVal) || math.IsNaN(willrVal) {
			continue
		}
		underlyingPrice := bar.Close
		if underlyingPrice <= 0 {
			continue
		}
		level := math.Round(underlyingPrice/step) * step
		nearLevel := math.Abs(underlyingPrice-level) <= buffer

		ce, pe, okStraddle := selectATMStraddleContracts(contracts, underlyingPrice)
		if !okStraddle {
			continue
		}
		ceRows := optionBars[ce.Token]
		peRows := optionBars[pe.Token]
		ceEntry, okCEPrice := priceAtOrBefore(ceRows, bar.Ts)
		peEntry, okPEPrice := priceAtOrBefore(peRows, bar.Ts)
		if !okCEPrice || !okPEPrice || ceEntry <= 0 || peEntry <= 0 {
			continue
		}

		ceNorm, ceNormOK := normalizedOptionValueAt(ceRows, normStart, openStart, bar.Ts, ceEntry)
		peNorm, peNormOK := normalizedOptionValueAt(peRows, normStart, openStart, bar.Ts, peEntry)
		normDiff := math.NaN()
		if ceNormOK && peNormOK {
			normDiff = math.Abs(ceNorm - peNorm)
		}

		ceAngle := optionSlopeAngle(ceRows, normStart, bar.Ts)
		peAngle := optionSlopeAngle(peRows, normStart, bar.Ts)
		if cfg.SlopeGuardEnable && optionSlopeGuardBlocks(ceAngle, peAngle, cfg.SlopeGuardMinAngle) {
			continue
		}

		triggered := optionTriggers(entered, nearLevel, rsiVal, willrVal, cfg.RSILowThreshold, cfg.RSIHighThreshold, normDiff, cfg.EquilibriumDiffThreshold, cfg.IncludeRSI80WillR40)
		if len(triggered) == 0 {
			continue
		}

		lotSize := ce.LotSize
		if lotSize <= 0 {
			lotSize = pe.LotSize
		}
		if lotSize <= 0 {
			lotSize = cfg.LotSize
		}
		if lotSize <= 0 {
			lotSize = 50
		}
		lots := cfg.Lots
		if lots <= 0 {
			lots = 1
		}
		qty := int64(lotSize * lots)
		if qty <= 0 {
			continue
		}

		for _, strategyName := range triggered {
			trade := OptionBTTrade{
				Strategy:        strategyName,
				TradeDate:       tradeDate,
				EntryTime:       bar.Ts.UTC(),
				ExitTime:        bar.Ts.UTC(),
				MaxPnLTime:      bar.Ts.UTC(),
				ExitReason:      "eod",
				Trigger:         strategyName,
				Underlying:      underlying,
				UnderlyingPrice: underlyingPrice,
				Level:           level,
				Strike:          ce.Strike,
				CEExchange:      ce.Exchange,
				PEExchange:      pe.Exchange,
				CEToken:         ce.Token,
				PEToken:         pe.Token,
				CESymbol:        ce.TradingSymbol,
				PESymbol:        pe.TradingSymbol,
				CEEntry:         ceEntry,
				PEEntry:         peEntry,
				Qty:             qty,
				EntryCombo:      ceEntry + peEntry,
				RSI:             rsiVal,
				WillR:           willrVal,
				CENorm:          ceNorm,
				PENorm:          peNorm,
				NormDiff:        normDiff,
			}
			trade = exitOptionTrade(trade, underlyingBars, i, ceRows, peRows, exitAt, cfg.TargetRupees, r.loc)
			trade.Success = trade.PnL > 0
			trade.Raw = mustJSONOptionTrade(map[string]any{
				"strategy":         trade.Strategy,
				"underlying":       trade.Underlying,
				"underlying_price": trade.UnderlyingPrice,
				"level":            trade.Level,
				"strike":           trade.Strike,
				"rsi":              trade.RSI,
				"willr":            trade.WillR,
				"ce_norm":          trade.CENorm,
				"pe_norm":          trade.PENorm,
				"norm_diff":        trade.NormDiff,
				"ce_slope_angle":   ceAngle,
				"pe_slope_angle":   peAngle,
				"exit_reason":      trade.ExitReason,
				"entry_time":       trade.EntryTime,
				"exit_time":        trade.ExitTime,
				"max_pnl":          trade.MaxPnL,
				"max_pnl_time":     trade.MaxPnLTime,
			})
			trades = append(trades, trade)
			entered[strategyName] = true
		}
	}

	result.Trades = trades
	result.Summary = summarizeOptionTrades(trades)
	return result, nil
}

func (r *Runner) persistOptionBacktest(ctx context.Context, result OptionBTRunResult) error {
	if strings.TrimSpace(result.RunID) == "" {
		return nil
	}
	started := time.Now().UTC()
	return r.store.WithTx(ctx, func(tx pgx.Tx) error {
		tradeLocal := result.TradeDate
		if r.loc != nil {
			tradeLocal = result.TradeDate.In(r.loc)
		}
		tradeDateUTC := time.Date(tradeLocal.Year(), tradeLocal.Month(), tradeLocal.Day(), 0, 0, 0, 0, time.UTC)
		deleteTrades := fmt.Sprintf(`DELETE FROM %s WHERE trade_date = $1`, pgx.Identifier{r.store.Schema, "option_backtest_trades"}.Sanitize())
		if _, err := tx.Exec(ctx, deleteTrades, tradeDateUTC); err != nil {
			return err
		}
		deleteRuns := fmt.Sprintf(`DELETE FROM %s WHERE trade_date = $1`, pgx.Identifier{r.store.Schema, "option_backtest_runs"}.Sanitize())
		if _, err := tx.Exec(ctx, deleteRuns, tradeDateUTC); err != nil {
			return err
		}

		stmtRun := fmt.Sprintf(`
INSERT INTO %s
  (run_id, trade_date, started_at, finished_at, status, total_trades, wins, losses, win_rate, total_pnl, avg_pnl, max_drawdown, avg_norm_diff)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
ON CONFLICT (run_id) DO UPDATE SET
  trade_date = EXCLUDED.trade_date,
  finished_at = EXCLUDED.finished_at,
  status = EXCLUDED.status,
  total_trades = EXCLUDED.total_trades,
  wins = EXCLUDED.wins,
  losses = EXCLUDED.losses,
  win_rate = EXCLUDED.win_rate,
  total_pnl = EXCLUDED.total_pnl,
  avg_pnl = EXCLUDED.avg_pnl,
  max_drawdown = EXCLUDED.max_drawdown,
  avg_norm_diff = EXCLUDED.avg_norm_diff`, pgx.Identifier{r.store.Schema, "option_backtest_runs"}.Sanitize())
		finished := time.Now().UTC()
		summary := result.Summary
		if _, err := tx.Exec(ctx, stmtRun, result.RunID, result.TradeDate, started, finished, "complete", summary.TotalTrades, summary.Wins, summary.Losses, summary.WinRate, summary.TotalPnL, summary.AvgPnL, summary.MaxDrawdown, summary.AvgNormDiff); err != nil {
			return err
		}

		stmtTrade := fmt.Sprintf(`
INSERT INTO %s
  (run_id, strategy, trade_date, entry_time, exit_time, exit_reason, trigger, underlying, underlying_price, level, strike,
   ce_exchange, pe_exchange, ce_token, pe_token, ce_symbol, pe_symbol,
   ce_entry, pe_entry, ce_exit, pe_exit, qty, entry_combo, exit_combo, pnl, success,
   rsi, willr, ce_norm, pe_norm, norm_diff, raw)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
        $12,$13,$14,$15,$16,$17,
        $18,$19,$20,$21,$22,$23,$24,$25,$26,
        $27,$28,$29,$30,$31,$32)
ON CONFLICT (run_id, strategy, entry_time) DO NOTHING`, pgx.Identifier{r.store.Schema, "option_backtest_trades"}.Sanitize())
		for _, trade := range result.Trades {
			if _, err := tx.Exec(ctx, stmtTrade,
				result.RunID,
				trade.Strategy,
				trade.TradeDate,
				trade.EntryTime,
				trade.ExitTime,
				trade.ExitReason,
				trade.Trigger,
				trade.Underlying,
				trade.UnderlyingPrice,
				trade.Level,
				trade.Strike,
				trade.CEExchange,
				trade.PEExchange,
				trade.CEToken,
				trade.PEToken,
				trade.CESymbol,
				trade.PESymbol,
				trade.CEEntry,
				trade.PEEntry,
				trade.CEExit,
				trade.PEExit,
				trade.Qty,
				trade.EntryCombo,
				trade.ExitCombo,
				trade.PnL,
				trade.Success,
				trade.RSI,
				trade.WillR,
				trade.CENorm,
				trade.PENorm,
				trade.NormDiff,
				trade.Raw,
			); err != nil {
				return err
			}
		}
		return nil
	})
}

func (r *Runner) sendOptionDailyAlert(ctx context.Context, result OptionBTRunResult) {
	if r.eodAlerts == nil {
		return
	}
	summary := result.Summary
	msg := fmt.Sprintf("OPTIONS %s trades=%d win=%.1f%% net=%.2f", result.TradeDate.In(r.loc).Format("2006-01-02"), summary.TotalTrades, summary.WinRate, summary.TotalPnL)
	if err := r.eodAlerts.Send(ctx, r.cfg.Backtest.Alerts.TitlePrefix+" options eod", msg); err != nil && r.logger != nil {
		r.logger.Warn("backtest_options_alert_failed", "err", err)
	}
}

func buildUnderlyingIndicators(bars []minuteBar, rsiPeriod, willrPeriod int) ([]float64, []float64) {
	closes := make([]float64, 0, len(bars))
	highs := make([]float64, 0, len(bars))
	lows := make([]float64, 0, len(bars))
	for _, bar := range bars {
		closes = append(closes, bar.Close)
		highs = append(highs, bar.High)
		lows = append(lows, bar.Low)
	}
	return rsiSeries(closes, rsiPeriod), willrSeries(highs, lows, closes, willrPeriod)
}

func fetchOptionContractsForBacktest(ctx context.Context, st *store.Store, underlying string, tradeDate time.Time) ([]optionBTContract, error) {
	querySubs := fmt.Sprintf(`SELECT exchange, symbol_token, COALESCE(tradingsymbol,''), upper(underlying), expiry, strike, upper("right"), 0
FROM %s
WHERE kind LIKE 'OPT%%'
  AND upper(underlying) = $1
  AND expiry IS NOT NULL
  AND strike IS NOT NULL
  AND "right" IN ('CE','PE')
  AND expiry >= $2`, pgx.Identifier{st.Schema, "subscriptions"}.Sanitize())
	rows, err := st.Pool.Query(ctx, querySubs, strings.ToUpper(strings.TrimSpace(underlying)), tradeDate.In(time.UTC))
	if err == nil {
		defer rows.Close()
		out := make([]optionBTContract, 0)
		for rows.Next() {
			var row optionBTContract
			if scanErr := rows.Scan(&row.Exchange, &row.Token, &row.TradingSymbol, &row.Underlying, &row.Expiry, &row.Strike, &row.Right, &row.LotSize); scanErr != nil {
				return nil, scanErr
			}
			out = append(out, row)
		}
		if rows.Err() != nil {
			return nil, rows.Err()
		}
		if len(out) > 0 {
			sortOptionContracts(out)
			return dedupeOptionContracts(out), nil
		}
	}

	queryInst := fmt.Sprintf(`SELECT exchange, symbol_token, COALESCE(tradingsymbol,''), COALESCE(name,''), expiry, strike, COALESCE(lotsize,0)
FROM %s
WHERE instrumenttype ILIKE 'OPT%%'
  AND expiry IS NOT NULL
  AND strike IS NOT NULL
  AND expiry >= $2
  AND (upper(name) = $1 OR upper(tradingsymbol) LIKE $1 || '%%')`, pgx.Identifier{st.Schema, "instruments"}.Sanitize())
	rows, err = st.Pool.Query(ctx, queryInst, strings.ToUpper(strings.TrimSpace(underlying)), tradeDate.In(time.UTC))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]optionBTContract, 0)
	for rows.Next() {
		var row optionBTContract
		var name string
		if scanErr := rows.Scan(&row.Exchange, &row.Token, &row.TradingSymbol, &name, &row.Expiry, &row.Strike, &row.LotSize); scanErr != nil {
			return nil, scanErr
		}
		right, ok := parseOptionRight(row.TradingSymbol)
		if !ok {
			continue
		}
		row.Right = right
		row.Underlying = strings.ToUpper(strings.TrimSpace(name))
		if row.Underlying == "" {
			row.Underlying = strings.ToUpper(strings.TrimSpace(underlying))
		}
		out = append(out, row)
	}
	if rows.Err() != nil {
		return nil, rows.Err()
	}
	sortOptionContracts(out)
	return dedupeOptionContracts(out), nil
}

func parseOptionRight(tradingSymbol string) (string, bool) {
	sym := strings.ToUpper(strings.TrimSpace(tradingSymbol))
	if strings.HasSuffix(sym, "CE") {
		return "CE", true
	}
	if strings.HasSuffix(sym, "PE") {
		return "PE", true
	}
	return "", false
}

func sortOptionContracts(contracts []optionBTContract) {
	sort.SliceStable(contracts, func(i, j int) bool {
		a, b := contracts[i], contracts[j]
		if !a.Expiry.Equal(b.Expiry) {
			return a.Expiry.Before(b.Expiry)
		}
		if a.Strike != b.Strike {
			return a.Strike < b.Strike
		}
		if a.Right != b.Right {
			return a.Right < b.Right
		}
		return a.Token < b.Token
	})
}

func dedupeOptionContracts(contracts []optionBTContract) []optionBTContract {
	seen := map[string]struct{}{}
	out := make([]optionBTContract, 0, len(contracts))
	for _, c := range contracts {
		if strings.TrimSpace(c.Token) == "" {
			continue
		}
		if _, ok := seen[c.Token]; ok {
			continue
		}
		seen[c.Token] = struct{}{}
		out = append(out, c)
	}
	return out
}

func selectExpiryByRank(contracts []optionBTContract, rank int, tradeDate time.Time) (time.Time, bool) {
	if len(contracts) == 0 {
		return time.Time{}, false
	}
	if rank < 0 {
		rank = 0
	}
	unique := make([]time.Time, 0)
	seen := map[string]struct{}{}
	for _, c := range contracts {
		if c.Expiry.Before(tradeDate.In(time.UTC)) {
			continue
		}
		k := c.Expiry.Format("2006-01-02")
		if _, ok := seen[k]; ok {
			continue
		}
		seen[k] = struct{}{}
		unique = append(unique, c.Expiry)
	}
	if len(unique) == 0 {
		return time.Time{}, false
	}
	sort.Slice(unique, func(i, j int) bool { return unique[i].Before(unique[j]) })
	if rank >= len(unique) {
		rank = len(unique) - 1
	}
	return unique[rank], true
}

func filterContractsByExpiry(contracts []optionBTContract, expiry time.Time) []optionBTContract {
	out := make([]optionBTContract, 0)
	for _, c := range contracts {
		if c.Expiry.Equal(expiry) {
			out = append(out, c)
		}
	}
	return out
}

func selectNearestOptionContract(contracts []optionBTContract, underlyingPrice float64, right string) (optionBTContract, bool) {
	right = strings.ToUpper(strings.TrimSpace(right))
	best := optionBTContract{}
	bestDist := math.MaxFloat64
	for _, c := range contracts {
		if strings.ToUpper(strings.TrimSpace(c.Right)) != right {
			continue
		}
		dist := math.Abs(c.Strike - underlyingPrice)
		if dist < bestDist {
			best = c
			bestDist = dist
		}
	}
	if best.Token == "" {
		return optionBTContract{}, false
	}
	return best, true
}

func selectATMStraddleContracts(contracts []optionBTContract, underlyingPrice float64) (optionBTContract, optionBTContract, bool) {
	type strikePair struct {
		strike float64
		ce     optionBTContract
		pe     optionBTContract
		hasCE  bool
		hasPE  bool
	}
	pairs := make(map[string]*strikePair)
	for _, c := range contracts {
		key := fmt.Sprintf("%.6f", c.Strike)
		pair, ok := pairs[key]
		if !ok {
			pair = &strikePair{strike: c.Strike}
			pairs[key] = pair
		}
		switch strings.ToUpper(strings.TrimSpace(c.Right)) {
		case "CE":
			pair.ce = c
			pair.hasCE = true
		case "PE":
			pair.pe = c
			pair.hasPE = true
		}
	}
	bestDist := math.MaxFloat64
	bestStrike := math.MaxFloat64
	bestCE := optionBTContract{}
	bestPE := optionBTContract{}
	for _, pair := range pairs {
		if !pair.hasCE || !pair.hasPE {
			continue
		}
		dist := math.Abs(pair.strike - underlyingPrice)
		if dist < bestDist || (dist == bestDist && pair.strike < bestStrike) {
			bestDist = dist
			bestStrike = pair.strike
			bestCE = pair.ce
			bestPE = pair.pe
		}
	}
	if bestCE.Token == "" || bestPE.Token == "" {
		return optionBTContract{}, optionBTContract{}, false
	}
	return bestCE, bestPE, true
}

func fetchMinuteBarsByExchange(ctx context.Context, st *store.Store, exchange string, tokens []string, start, end time.Time) (map[string][]minuteBar, error) {
	if len(tokens) == 0 {
		return map[string][]minuteBar{}, nil
	}
	query := fmt.Sprintf(`SELECT symbol_token, ts, open, high, low, close, volume
FROM %s
WHERE exchange = $1
  AND symbol_token = ANY($2)
  AND ts >= $3
  AND ts < $4
ORDER BY symbol_token, ts ASC`, pgx.Identifier{st.Schema, "bars_1m"}.Sanitize())
	rows, err := st.Pool.Query(ctx, query, exchange, tokens, start.UTC(), end.UTC())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make(map[string][]minuteBar)
	for rows.Next() {
		var token string
		var bar minuteBar
		if scanErr := rows.Scan(&token, &bar.Ts, &bar.Open, &bar.High, &bar.Low, &bar.Close, &bar.Volume); scanErr != nil {
			return nil, scanErr
		}
		out[token] = append(out[token], bar)
	}
	return out, rows.Err()
}

func parseClockTime(tradeDate time.Time, hhmm string, loc *time.Location) (time.Time, error) {
	parsed, err := time.ParseInLocation("15:04", strings.TrimSpace(hhmm), loc)
	if err != nil {
		return time.Time{}, err
	}
	localDate := tradeDate.In(loc)
	return time.Date(localDate.Year(), localDate.Month(), localDate.Day(), parsed.Hour(), parsed.Minute(), 0, 0, loc), nil
}

func priceAtOrBefore(bars []minuteBar, ts time.Time) (float64, bool) {
	if len(bars) == 0 {
		return 0, false
	}
	target := ts.UTC()
	idx := sort.Search(len(bars), func(i int) bool { return !bars[i].Ts.Before(target) })
	if idx < len(bars) && bars[idx].Ts.Equal(target) {
		return bars[idx].Close, true
	}
	idx--
	if idx < 0 {
		return 0, false
	}
	return bars[idx].Close, true
}

func normalizedOptionValueAt(bars []minuteBar, normStart, openStart, ts time.Time, current float64) (float64, bool) {
	minV, maxV, ok := minMaxBetween(bars, normStart, ts)
	if !ok {
		minV, maxV, ok = minMaxBetween(bars, openStart, ts)
		if !ok {
			return math.NaN(), false
		}
	}
	if maxV <= minV {
		return 50, true
	}
	v := (current - minV) / (maxV - minV) * 100
	if v < 0 {
		v = 0
	}
	if v > 100 {
		v = 100
	}
	return v, true
}

func minMaxBetween(bars []minuteBar, from, to time.Time) (float64, float64, bool) {
	fromUTC := from.UTC()
	toUTC := to.UTC()
	minV := math.MaxFloat64
	maxV := -math.MaxFloat64
	found := false
	for _, bar := range bars {
		ts := bar.Ts.UTC()
		if ts.Before(fromUTC) || ts.After(toUTC) {
			continue
		}
		if bar.Close < minV {
			minV = bar.Close
		}
		if bar.Close > maxV {
			maxV = bar.Close
		}
		found = true
	}
	return minV, maxV, found
}

func optionTriggers(entered map[string]bool, nearLevel bool, rsiVal, willrVal, lowThr, highThr, normDiff, normDiffThr float64, includeRSI80WillR40 bool) []string {
	out := make([]string, 0, 4)
	if !entered["near_100_rsi_low"] && nearLevel && rsiVal < lowThr {
		out = append(out, "near_100_rsi_low")
	}
	if !entered["near_100_rsi_high"] && nearLevel && rsiVal > highThr {
		out = append(out, "near_100_rsi_high")
	}
	if !entered["equilibrium_diff_gt60"] && !math.IsNaN(normDiff) && normDiff >= normDiffThr {
		out = append(out, "equilibrium_diff_gt60")
	}
	if includeRSI80WillR40 && !entered["rsi80_willr40"] && rsiVal > 80 && willrVal > -40 {
		out = append(out, "rsi80_willr40")
	}
	return out
}

func optionSlopeAngle(bars []minuteBar, from, to time.Time) float64 {
	fromUTC := from.UTC()
	toUTC := to.UTC()
	var first minuteBar
	var last minuteBar
	found := false
	for _, bar := range bars {
		ts := bar.Ts.UTC()
		if ts.Before(fromUTC) || ts.After(toUTC) {
			continue
		}
		if !found {
			first = bar
			found = true
		}
		last = bar
	}
	if !found {
		return math.NaN()
	}
	deltaMin := last.Ts.Sub(first.Ts).Minutes()
	if deltaMin <= 0 {
		return 0
	}
	slope := (last.Close - first.Close) / deltaMin
	return math.Atan(slope) * 180 / math.Pi
}

func optionSlopeGuardBlocks(ceAngle, peAngle, minAngle float64) bool {
	threshold := math.Abs(minAngle)
	if threshold == 0 {
		return false
	}
	ceDown := !math.IsNaN(ceAngle) && ceAngle <= -threshold
	peDown := !math.IsNaN(peAngle) && peAngle <= -threshold
	return ceDown || peDown
}

func exitOptionTrade(trade OptionBTTrade, underlyingBars []minuteBar, entryIdx int, ceRows, peRows []minuteBar, exitAt time.Time, targetRupees float64, loc *time.Location) OptionBTTrade {
	lastCE := trade.CEEntry
	lastPE := trade.PEEntry
	lastTs := trade.EntryTime
	maxPnL := 0.0
	maxPnLTs := trade.EntryTime
	for i := entryIdx; i < len(underlyingBars); i++ {
		ts := underlyingBars[i].Ts
		local := ts.In(loc)
		if local.After(exitAt) {
			break
		}
		cePx, okCE := priceAtOrBefore(ceRows, ts)
		pePx, okPE := priceAtOrBefore(peRows, ts)
		if !okCE || !okPE || cePx <= 0 || pePx <= 0 {
			continue
		}
		lastCE = cePx
		lastPE = pePx
		lastTs = ts.UTC()
		pnl := ((cePx - trade.CEEntry) + (pePx - trade.PEEntry)) * float64(trade.Qty)
		if pnl > maxPnL {
			maxPnL = pnl
			maxPnLTs = ts.UTC()
		}
		if targetRupees > 0 && pnl >= targetRupees {
			trade.ExitTime = ts.UTC()
			trade.ExitReason = "target"
			trade.CEExit = cePx
			trade.PEExit = pePx
			trade.ExitCombo = cePx + pePx
			trade.PnL = pnl
			trade.MaxPnL = maxPnL
			trade.MaxPnLTime = maxPnLTs
			return trade
		}
	}
	trade.ExitTime = lastTs
	trade.ExitReason = "eod"
	trade.CEExit = lastCE
	trade.PEExit = lastPE
	trade.ExitCombo = lastCE + lastPE
	trade.PnL = ((lastCE - trade.CEEntry) + (lastPE - trade.PEEntry)) * float64(trade.Qty)
	trade.MaxPnL = maxPnL
	trade.MaxPnLTime = maxPnLTs
	return trade
}

func summarizeOptionTrades(trades []OptionBTTrade) OptionBTSummary {
	summary := OptionBTSummary{}
	if len(trades) == 0 {
		return summary
	}
	sorted := make([]OptionBTTrade, len(trades))
	copy(sorted, trades)
	sort.SliceStable(sorted, func(i, j int) bool { return sorted[i].ExitTime.Before(sorted[j].ExitTime) })
	equity := 0.0
	peak := 0.0
	normCount := 0
	for _, trade := range sorted {
		summary.TotalTrades++
		summary.TotalPnL += trade.PnL
		if trade.PnL > 0 {
			summary.Wins++
		} else {
			summary.Losses++
		}
		if !math.IsNaN(trade.NormDiff) {
			summary.AvgNormDiff += trade.NormDiff
			normCount++
		}
		equity += trade.PnL
		if equity > peak {
			peak = equity
		}
		drawdown := peak - equity
		if drawdown > summary.MaxDrawdown {
			summary.MaxDrawdown = drawdown
		}
	}
	if summary.TotalTrades > 0 {
		summary.WinRate = float64(summary.Wins) / float64(summary.TotalTrades) * 100
		summary.AvgPnL = summary.TotalPnL / float64(summary.TotalTrades)
	}
	if normCount > 0 {
		summary.AvgNormDiff = summary.AvgNormDiff / float64(normCount)
	}
	return summary
}

func dedupeStrings(values []string) []string {
	if len(values) == 0 {
		return values
	}
	seen := map[string]struct{}{}
	out := make([]string, 0, len(values))
	for _, v := range values {
		v = strings.TrimSpace(v)
		if v == "" {
			continue
		}
		if _, ok := seen[v]; ok {
			continue
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}
	return out
}

func mustJSONOptionTrade(v any) []byte {
	raw, _ := json.Marshal(v)
	return raw
}
