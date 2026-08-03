package main

import (
	"context"
	"encoding/csv"
	"flag"
	"fmt"
	"log"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"trading-stack/internal/config"
	"trading-stack/internal/store"
)

type optionRef struct {
	Exchange      string
	Token         string
	TradingSymbol string
	Right         string
	Strike        float64
}

type priceSeries struct {
	Times  []time.Time
	Values []float64
	Index  map[time.Time]float64
}

type ohlcBar struct {
	Ts    time.Time
	Open  float64
	High  float64
	Low   float64
	Close float64
}

type barSeries struct {
	Times []time.Time
	Bars  []ohlcBar
	Index map[time.Time]ohlcBar
}

type eqRow struct {
	Ts         time.Time
	CEMeanNorm *float64
	PEMeanNorm *float64
}

type eqSeries struct {
	Times []time.Time
	Rows  []eqRow
	Index map[time.Time]eqRow
}

type tradeResult struct {
	EntryTs        time.Time
	ExitTs         time.Time
	Underlying     string
	Level          float64
	Strike         float64
	CEToken        string
	PEToken        string
	EntryCE        float64
	EntryPE        float64
	ExitCE         float64
	ExitPE         float64
	Qty            int64
	PnL            float64
	Reason         string
	MaxComboPoints float64
	MaxComboPnL    float64
	MaxComboCE     float64
	MaxComboPE     float64
	RSI            float64
	WILLR          float64
	VIX            float64
	VIXDelta       float64
	VIXDelta3m     float64
	CENorm         float64
	PENorm         float64
	NormDiff       float64
	EODComboPoints float64
	EODComboPnL    float64
	MaxComboTs     time.Time
	DayOpen        float64
	DayHigh        float64
	DayLow         float64
	OpenCombo      float64
	CurrentCombo   float64
	ComboRatio     float64
}

func main() {
	var cfgPath string
	var days int
	var startStr string
	var endStr string
	var stockList string
	flag.StringVar(&cfgPath, "config", "config/config.yaml", "config path")
	flag.IntVar(&days, "days", 5, "lookback days")
	flag.StringVar(&startStr, "start", "", "start date YYYY-MM-DD")
	flag.StringVar(&endStr, "end", "", "end date YYYY-MM-DD")
	flag.StringVar(&stockList, "stock-underlyings", "", "comma-separated stock underlyings for OPTSTK backtest")
	flag.Parse()

	cfg, err := config.Load(cfgPath)
	if err != nil {
		log.Fatalf("load config: %v", err)
	}
	loc, _ := time.LoadLocation(cfg.Runtime.Timezone)
	ctx := context.Background()
	st, err := store.New(ctx, cfg.Postgres, nil)
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}
	defer st.Close()

	start, end := resolveRange(loc, days, startStr, endStr)
	if strings.TrimSpace(stockList) != "" {
		underlyings := splitCSV(stockList)
		if err := runStockEquilibriumBacktest(ctx, st, underlyings, start, end, loc); err != nil {
			log.Fatalf("stock backtest: %v", err)
		}
		return
	}

	underlying := strings.ToUpper(strings.TrimSpace(cfg.Strategy.NiftyLevelStraddleUnderlying))
	if underlying == "" {
		underlying = "NIFTY50"
	}
	optUnderlying := normalizeOptUnderlying(underlying)
	indexToken := strings.TrimSpace(cfg.Strategy.NiftyLevelStraddleToken)
	if indexToken == "" {
		indexToken = "99926000"
	}

	tradingDays, err := fetchTradingDays(ctx, st, indexToken, start, end, loc)
	if err != nil {
		log.Fatalf("fetch trading days: %v", err)
	}

	resultsByScenario := map[string][]tradeResult{
		"equilibrium_diff_gt60": {},
		"rsi30_willr80":         {},
		"rsi80_willr25":         {},
		"near_100_rsi_extreme":  {},
	}
	for _, day := range tradingDays {
		dayStart := time.Date(day.Year(), day.Month(), day.Day(), 9, 15, 0, 0, loc).UTC()
		dayEnd := time.Date(day.Year(), day.Month(), day.Day(), 15, 30, 0, 0, loc).UTC()
		expiry, err := findNearestExpiry(ctx, st, optUnderlying, day)
		if err != nil || expiry.IsZero() {
			continue
		}
		options, strikes, err := fetchOptionRefs(ctx, st, optUnderlying, expiry)
		if err != nil || len(options) == 0 {
			continue
		}
		indexBars, err := fetchBarSeriesOHLC(ctx, st, "NSE", indexToken, dayStart, dayEnd)
		if err != nil || len(indexBars.Times) == 0 {
			continue
		}
		vixBars, _ := fetchBarSeries(ctx, st, "NSE", "99926017", dayStart, dayEnd)
		eqBars, _ := fetchEquilibriumSeries(ctx, st, underlying, expiry, dayStart, dayEnd)
		dayOpen, dayHigh, dayLow := deriveDayOpenHighLow(indexBars)
		lastEntryKey := map[string]string{}
		priceCache := map[string]*priceSeries{}

		for _, ts := range indexBars.Times {
			bar, ok := indexBars.Index[ts]
			if !ok {
				continue
			}
			price := bar.Close
			level := math.Round(price/cfg.Strategy.NiftyLevelStraddleStep) * cfg.Strategy.NiftyLevelStraddleStep
			near100 := math.Abs(price-level) <= cfg.Strategy.NiftyLevelStraddleBuffer

			rsiVal, willrVal := computeIndicators(indexBars, ts, cfg.Strategy.RSIPeriod, cfg.Backtest.WILLRPeriod)
			vixVal, vixDelta := computeVIX(vixBars, ts)
			vixDelta3m := computeVIXDelta(vixBars, ts, 3)
			ceNorm, peNorm, normDiff := computeEquilibrium(eqBars, ts)

			scenarioHits := map[string]bool{
				"equilibrium_diff_gt60": normDiff > 60,
				"rsi30_willr80":         rsiVal > 0 && willrVal < 0 && rsiVal < 30 && willrVal < -70 && willrVal > -90,
				"rsi80_willr25":         rsiVal > 80 && willrVal > -25,
				"near_100_rsi_extreme":  near100 && rsiVal > 0 && (rsiVal < 30 || rsiVal > 75),
			}
			hasScenario := false
			for _, hit := range scenarioHits {
				if hit {
					hasScenario = true
					break
				}
			}
			if !hasScenario {
				continue
			}

			strike := nearestStrike(strikes, price)
			ce := options[fmt.Sprintf("%.0f-CE", strike)]
			pe := options[fmt.Sprintf("%.0f-PE", strike)]
			if ce.Token == "" || pe.Token == "" {
				continue
			}
			cePrice, ok1 := getPrice(ctx, st, priceCache, ce, dayStart, dayEnd, ts)
			pePrice, ok2 := getPrice(ctx, st, priceCache, pe, dayStart, dayEnd, ts)
			if !ok1 || !ok2 {
				continue
			}
			qty := int64(cfg.Strategy.NiftyLevelStraddleLotSize * cfg.Strategy.NiftyLevelStraddleLots)
			openCombo := computeComboAt(ctx, st, priceCache, ce, pe, dayStart, dayEnd, dayStart)
			currCombo := cePrice + pePrice
			comboRatio := 0.0
			if openCombo > 0 {
				comboRatio = currCombo / openCombo
			}
			maxPoints, maxPnL, maxTs, maxCE, maxPE, eodPoints, eodPnL, exitCE, exitPE := computeComboStats(ctx, st, priceCache, ce, pe, dayStart, dayEnd, ts, qty)

			for name, hit := range scenarioHits {
				if !hit {
					continue
				}
				entryKey := fmt.Sprintf("%s-%s", day.Format("2006-01-02"), name)
				if name == "near_100_rsi_extreme" {
					entryKey = fmt.Sprintf("%s-%s-%.0f", day.Format("2006-01-02"), name, level)
				}
				if lastEntryKey[name] == entryKey {
					continue
				}
				resultsByScenario[name] = append(resultsByScenario[name], tradeResult{
					EntryTs:        ts,
					ExitTs:         dayEnd,
					Underlying:     underlying,
					Level:          level,
					Strike:         strike,
					CEToken:        ce.Token,
					PEToken:        pe.Token,
					EntryCE:        cePrice,
					EntryPE:        pePrice,
					ExitCE:         exitCE,
					ExitPE:         exitPE,
					Qty:            qty,
					PnL:            eodPnL,
					Reason:         name,
					MaxComboPoints: maxPoints,
					MaxComboPnL:    maxPnL,
					MaxComboTs:     maxTs,
					MaxComboCE:     maxCE,
					MaxComboPE:     maxPE,
					EODComboPoints: eodPoints,
					EODComboPnL:    eodPnL,
					RSI:            rsiVal,
					WILLR:          willrVal,
					VIX:            vixVal,
					VIXDelta:       vixDelta,
					VIXDelta3m:     vixDelta3m,
					CENorm:         ceNorm,
					PENorm:         peNorm,
					NormDiff:       normDiff,
					DayOpen:        dayOpen,
					DayHigh:        dayHigh,
					DayLow:         dayLow,
					OpenCombo:      openCombo,
					CurrentCombo:   currCombo,
					ComboRatio:     comboRatio,
				})
				lastEntryKey[name] = entryKey
			}
		}
	}

	outputDir := "state"
	var consolidated []tradeResult
	for name, results := range resultsByScenario {
		consolidated = append(consolidated, results...)
		fmt.Printf("\nScenario: %s\n", name)
		printSummary(results)
		printDaywise(results, loc)
	}
	outputPath := filepath.Join(outputDir, "nifty_level_straddle_scenarios.csv")
	if err := writeCSV(outputPath, consolidated, loc); err != nil {
		altPath := filepath.Join(outputDir, fmt.Sprintf("nifty_level_straddle_scenarios_%s.csv", time.Now().Format("20060102_150405")))
		if err2 := writeCSV(altPath, consolidated, loc); err2 != nil {
			log.Fatalf("write csv: %v", err)
		}
		outputPath = altPath
	}
	fmt.Printf("\nConsolidated CSV written: %s\n", outputPath)
}

func resolveRange(loc *time.Location, days int, startStr, endStr string) (time.Time, time.Time) {
	if startStr != "" && endStr != "" {
		start, _ := time.ParseInLocation("2006-01-02", startStr, loc)
		end, _ := time.ParseInLocation("2006-01-02", endStr, loc)
		return start, end.Add(24 * time.Hour)
	}
	today := time.Now().In(loc)
	end := time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, loc)
	start := end.AddDate(0, 0, -days)
	return start, end
}

func normalizeOptUnderlying(underlying string) string {
	u := strings.ToUpper(strings.TrimSpace(underlying))
	switch u {
	case "NIFTY50":
		return "NIFTY"
	default:
		return u
	}
}

func parseOptionRight(tradingsymbol string) string {
	ts := strings.ToUpper(strings.TrimSpace(tradingsymbol))
	if strings.HasSuffix(ts, "CE") {
		return "CE"
	}
	if strings.HasSuffix(ts, "PE") {
		return "PE"
	}
	return ""
}

func fetchTradingDays(ctx context.Context, st *store.Store, token string, start, end time.Time, loc *time.Location) ([]time.Time, error) {
	query := fmt.Sprintf(`SELECT DISTINCT (ts AT TIME ZONE '%s')::date AS d
FROM %s
WHERE exchange = 'NSE'
  AND symbol_token = $1
  AND ts >= $2 AND ts < $3
ORDER BY d`, loc.String(), pgxIdent(st.Schema, "bars_1m"))
	rows, err := st.Pool.Query(ctx, query, token, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var days []time.Time
	for rows.Next() {
		var d time.Time
		if err := rows.Scan(&d); err != nil {
			return nil, err
		}
		days = append(days, d)
	}
	return days, rows.Err()
}

func findNearestExpiry(ctx context.Context, st *store.Store, underlying string, day time.Time) (time.Time, error) {
	query := fmt.Sprintf(`SELECT expiry
FROM %s
WHERE instrumenttype = 'OPTIDX'
  AND upper(name) = $1
  AND expiry >= $2
ORDER BY expiry ASC
LIMIT 1`, pgxIdent(st.Schema, "instruments"))
	var expiry time.Time
	if err := st.Pool.QueryRow(ctx, query, underlying, day).Scan(&expiry); err != nil {
		return time.Time{}, err
	}
	return expiry, nil
}

func fetchOptionRefs(ctx context.Context, st *store.Store, underlying string, expiry time.Time) (map[string]optionRef, []float64, error) {
	query := fmt.Sprintf(`SELECT exchange, symbol_token, tradingsymbol, strike
FROM %s
WHERE instrumenttype = 'OPTIDX'
  AND upper(name) = $1
  AND expiry = $2
  AND strike IS NOT NULL
  AND (tradingsymbol LIKE '%%CE' OR tradingsymbol LIKE '%%PE')`, pgxIdent(st.Schema, "instruments"))
	rows, err := st.Pool.Query(ctx, query, underlying, expiry)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	out := map[string]optionRef{}
	strikesSet := map[float64]struct{}{}
	for rows.Next() {
		var ref optionRef
		if err := rows.Scan(&ref.Exchange, &ref.Token, &ref.TradingSymbol, &ref.Strike); err != nil {
			return nil, nil, err
		}
		right := parseOptionRight(ref.TradingSymbol)
		if right == "" {
			continue
		}
		ref.Right = right
		key := fmt.Sprintf("%.0f-%s", ref.Strike, strings.ToUpper(ref.Right))
		out[key] = ref
		strikesSet[ref.Strike] = struct{}{}
	}
	var strikes []float64
	for k := range strikesSet {
		strikes = append(strikes, k)
	}
	sort.Float64s(strikes)
	return out, strikes, rows.Err()
}

func fetchBarSeries(ctx context.Context, st *store.Store, exchange, token string, start, end time.Time) (*priceSeries, error) {
	query := fmt.Sprintf(`SELECT ts, close
FROM %s
WHERE exchange = $1
  AND symbol_token = $2
  AND ts >= $3 AND ts <= $4
ORDER BY ts`, pgxIdent(st.Schema, "bars_1m"))
	rows, err := st.Pool.Query(ctx, query, exchange, token, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ps := &priceSeries{Index: map[time.Time]float64{}}
	for rows.Next() {
		var ts time.Time
		var close float64
		if err := rows.Scan(&ts, &close); err != nil {
			return nil, err
		}
		ps.Times = append(ps.Times, ts)
		ps.Values = append(ps.Values, close)
		ps.Index[ts] = close
	}
	return ps, rows.Err()
}

func fetchBarSeriesOHLC(ctx context.Context, st *store.Store, exchange, token string, start, end time.Time) (*barSeries, error) {
	query := fmt.Sprintf(`SELECT ts, open, high, low, close
FROM %s
WHERE exchange = $1
  AND symbol_token = $2
  AND ts >= $3 AND ts <= $4
ORDER BY ts`, pgxIdent(st.Schema, "bars_1m"))
	rows, err := st.Pool.Query(ctx, query, exchange, token, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	bs := &barSeries{Index: map[time.Time]ohlcBar{}}
	for rows.Next() {
		var bar ohlcBar
		if err := rows.Scan(&bar.Ts, &bar.Open, &bar.High, &bar.Low, &bar.Close); err != nil {
			return nil, err
		}
		bs.Times = append(bs.Times, bar.Ts)
		bs.Bars = append(bs.Bars, bar)
		bs.Index[bar.Ts] = bar
	}
	return bs, rows.Err()
}

func deriveDayOpenHighLow(series *barSeries) (float64, float64, float64) {
	if series == nil || len(series.Bars) == 0 {
		return 0, 0, 0
	}
	open := series.Bars[0].Open
	high := series.Bars[0].High
	low := series.Bars[0].Low
	for _, bar := range series.Bars[1:] {
		if bar.High > high {
			high = bar.High
		}
		if bar.Low < low {
			low = bar.Low
		}
	}
	return open, high, low
}

func fetchEquilibriumSeries(ctx context.Context, st *store.Store, underlying string, expiry time.Time, start, end time.Time) (*eqSeries, error) {
	query := fmt.Sprintf(`SELECT ts, ce_mean_norm, pe_mean_norm
FROM %s
WHERE upper(underlying) = $1
  AND expiry = $2
  AND ts >= $3 AND ts <= $4
ORDER BY ts`, pgxIdent(st.Schema, "equilibrium_mean_series"))
	rows, err := st.Pool.Query(ctx, query, strings.ToUpper(underlying), expiry, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	es := &eqSeries{Index: map[time.Time]eqRow{}}
	for rows.Next() {
		var row eqRow
		if err := rows.Scan(&row.Ts, &row.CEMeanNorm, &row.PEMeanNorm); err != nil {
			return nil, err
		}
		es.Times = append(es.Times, row.Ts)
		es.Rows = append(es.Rows, row)
		es.Index[row.Ts] = row
	}
	return es, rows.Err()
}

func nearestStrike(strikes []float64, price float64) float64 {
	if len(strikes) == 0 {
		return 0
	}
	best := strikes[0]
	minDiff := math.Abs(best - price)
	for _, s := range strikes[1:] {
		d := math.Abs(s - price)
		if d < minDiff {
			minDiff = d
			best = s
		}
	}
	return best
}

func getPrice(ctx context.Context, st *store.Store, cache map[string]*priceSeries, ref optionRef, start, end, ts time.Time) (float64, bool) {
	key := ref.Exchange + ":" + ref.Token
	ps, ok := cache[key]
	if !ok {
		series, err := fetchBarSeries(ctx, st, ref.Exchange, ref.Token, start, end)
		if err != nil {
			return 0, false
		}
		ps = series
		cache[key] = ps
	}
	return findNearestOrLast(ps, ts, time.Minute, 3*time.Minute)
}

func findNearestOrLast(ps *priceSeries, ts time.Time, maxSkew time.Duration, maxStale time.Duration) (float64, bool) {
	if ps == nil || len(ps.Times) == 0 {
		return 0, false
	}
	if v, ok := ps.Index[ts]; ok {
		return v, true
	}
	idx := sort.Search(len(ps.Times), func(i int) bool { return !ps.Times[i].Before(ts) })
	nearestIdx := -1
	nearestDiff := time.Duration(1<<63 - 1)
	// Check left neighbor
	if idx > 0 {
		diff := ts.Sub(ps.Times[idx-1])
		if diff < 0 {
			diff = -diff
		}
		if diff < nearestDiff {
			nearestDiff = diff
			nearestIdx = idx - 1
		}
	}
	// Check right neighbor
	if idx < len(ps.Times) {
		diff := ps.Times[idx].Sub(ts)
		if diff < 0 {
			diff = -diff
		}
		if diff < nearestDiff {
			nearestDiff = diff
			nearestIdx = idx
		}
	}
	if nearestIdx >= 0 && nearestDiff <= maxSkew {
		return ps.Values[nearestIdx], true
	}
	// fallback: last known price before ts within maxStale
	if idx > 0 {
		diff := ts.Sub(ps.Times[idx-1])
		if diff <= maxStale {
			return ps.Values[idx-1], true
		}
	}
	return 0, false
}

func pgxIdent(schema, table string) string {
	if strings.TrimSpace(schema) == "" {
		return table
	}
	return fmt.Sprintf("%s.%s", schema, table)
}

func computeIndicators(series *barSeries, ts time.Time, rsiPeriod, willrPeriod int) (float64, float64) {
	rsi := 0.0
	willr := 0.0
	if series == nil || len(series.Times) == 0 {
		return rsi, willr
	}
	if rsiPeriod <= 0 {
		rsiPeriod = 14
	}
	if willrPeriod <= 0 {
		willrPeriod = 14
	}
	closes, highs, lows := windowBars(series, ts, maxInt(rsiPeriod+1, willrPeriod))
	if len(closes) >= rsiPeriod+1 {
		if v, ok := calcRSI(closes, rsiPeriod); ok {
			rsi = v
		}
	}
	if len(highs) >= willrPeriod {
		if v, ok := calcWILLR(highs, lows, closes, willrPeriod); ok {
			willr = v
		}
	}
	return rsi, willr
}

func computeEquilibrium(series *eqSeries, ts time.Time) (float64, float64, float64) {
	if series == nil || len(series.Times) == 0 {
		return 0, 0, -1
	}
	if row, ok := series.Index[ts]; ok {
		ce := ptrToFloat(row.CEMeanNorm)
		pe := ptrToFloat(row.PEMeanNorm)
		return ce, pe, math.Abs(ce - pe)
	}
	idx := sort.Search(len(series.Times), func(i int) bool { return !series.Times[i].Before(ts) })
	nearestIdx := -1
	nearestDiff := time.Duration(1<<63 - 1)
	if idx > 0 {
		diff := ts.Sub(series.Times[idx-1])
		if diff < 0 {
			diff = -diff
		}
		if diff < nearestDiff {
			nearestDiff = diff
			nearestIdx = idx - 1
		}
	}
	if idx < len(series.Times) {
		diff := series.Times[idx].Sub(ts)
		if diff < 0 {
			diff = -diff
		}
		if diff < nearestDiff {
			nearestDiff = diff
			nearestIdx = idx
		}
	}
	if nearestIdx >= 0 && nearestDiff <= time.Minute {
		row := series.Rows[nearestIdx]
		ce := ptrToFloat(row.CEMeanNorm)
		pe := ptrToFloat(row.PEMeanNorm)
		return ce, pe, math.Abs(ce - pe)
	}
	if idx > 0 {
		row := series.Rows[idx-1]
		ce := ptrToFloat(row.CEMeanNorm)
		pe := ptrToFloat(row.PEMeanNorm)
		return ce, pe, math.Abs(ce - pe)
	}
	return 0, 0, -1
}

func computeVIX(series *priceSeries, ts time.Time) (float64, float64) {
	if series == nil {
		return 0, 0
	}
	vix, ok := findNearestOrLast(series, ts, time.Minute, 10*time.Minute)
	if !ok {
		return 0, 0
	}
	prev, okPrev := previousValue(series, ts)
	if !okPrev {
		return vix, 0
	}
	return vix, vix - prev
}

func computeVIXDelta(series *priceSeries, ts time.Time, minutes int) float64 {
	if series == nil || minutes <= 0 {
		return 0
	}
	curr, ok := findNearestOrLast(series, ts, time.Minute, 10*time.Minute)
	if !ok {
		return 0
	}
	prevTs := ts.Add(-time.Duration(minutes) * time.Minute)
	prev, okPrev := findNearestOrLast(series, prevTs, time.Minute, 10*time.Minute)
	if !okPrev {
		return 0
	}
	return curr - prev
}

func computeComboStats(ctx context.Context, st *store.Store, cache map[string]*priceSeries, ce optionRef, pe optionRef, start, end, entryTs time.Time, qty int64) (float64, float64, time.Time, float64, float64, float64, float64, float64, float64) {
	maxPoints := 0.0
	maxPnL := 0.0
	eodPoints := 0.0
	eodPnL := 0.0
	exitCE := 0.0
	exitPE := 0.0
	maxTs := time.Time{}
	maxCE := 0.0
	maxPE := 0.0
	ceEntry, ok1 := getPrice(ctx, st, cache, ce, start, end, entryTs)
	peEntry, ok2 := getPrice(ctx, st, cache, pe, start, end, entryTs)
	if !ok1 || !ok2 {
		return maxPoints, maxPnL, maxTs, maxCE, maxPE, eodPoints, eodPnL, exitCE, exitPE
	}
	ts := entryTs
	for ts.Before(end) || ts.Equal(end) {
		cePrice, ok1 := getPrice(ctx, st, cache, ce, start, end, ts)
		pePrice, ok2 := getPrice(ctx, st, cache, pe, start, end, ts)
		if ok1 && ok2 {
			comboMove := (cePrice + pePrice) - (ceEntry + peEntry)
			comboPnL := comboMove * float64(qty)
			if comboMove > maxPoints {
				maxPoints = comboMove
				maxPnL = comboPnL
				maxTs = ts
				maxCE = cePrice
				maxPE = pePrice
			}
			if ts.Equal(end) {
				eodPoints = comboMove
				eodPnL = comboPnL
				exitCE = cePrice
				exitPE = pePrice
			}
		}
		ts = ts.Add(time.Minute)
	}
	return maxPoints, maxPnL, maxTs, maxCE, maxPE, eodPoints, eodPnL, exitCE, exitPE
}

func computeComboAt(ctx context.Context, st *store.Store, cache map[string]*priceSeries, ce optionRef, pe optionRef, start, end, ts time.Time) float64 {
	cePrice, ok1 := getPrice(ctx, st, cache, ce, start, end, ts)
	pePrice, ok2 := getPrice(ctx, st, cache, pe, start, end, ts)
	if !ok1 || !ok2 {
		return 0
	}
	return cePrice + pePrice
}

func previousValue(series *priceSeries, ts time.Time) (float64, bool) {
	if series == nil || len(series.Times) == 0 {
		return 0, false
	}
	idx := sort.Search(len(series.Times), func(i int) bool { return !series.Times[i].Before(ts) })
	if idx == 0 {
		return 0, false
	}
	return series.Values[idx-1], true
}

func windowBars(series *barSeries, ts time.Time, maxCount int) ([]float64, []float64, []float64) {
	if series == nil || len(series.Times) == 0 {
		return nil, nil, nil
	}
	idx := sort.Search(len(series.Times), func(i int) bool { return !series.Times[i].Before(ts) })
	if idx == 0 {
		return nil, nil, nil
	}
	start := idx - maxCount
	if start < 0 {
		start = 0
	}
	closes := make([]float64, 0, idx-start)
	highs := make([]float64, 0, idx-start)
	lows := make([]float64, 0, idx-start)
	for i := start; i < idx; i++ {
		bar := series.Bars[i]
		closes = append(closes, bar.Close)
		highs = append(highs, bar.High)
		lows = append(lows, bar.Low)
	}
	return closes, highs, lows
}

func calcRSI(closes []float64, period int) (float64, bool) {
	if len(closes) < period+1 || period <= 0 {
		return 0, false
	}
	var gainSum float64
	var lossSum float64
	for i := len(closes) - period; i < len(closes); i++ {
		change := closes[i] - closes[i-1]
		if change > 0 {
			gainSum += change
		} else {
			lossSum -= change
		}
	}
	avgGain := gainSum / float64(period)
	avgLoss := lossSum / float64(period)
	if avgLoss == 0 {
		return 100, true
	}
	rs := avgGain / avgLoss
	return 100 - (100 / (1 + rs)), true
}

func calcWILLR(highs, lows, closes []float64, period int) (float64, bool) {
	if len(highs) < period || len(lows) < period || len(closes) < period {
		return 0, false
	}
	start := len(closes) - period
	highest := highs[start]
	lowest := lows[start]
	for i := start; i < len(closes); i++ {
		if highs[i] > highest {
			highest = highs[i]
		}
		if lows[i] < lowest {
			lowest = lows[i]
		}
	}
	close := closes[len(closes)-1]
	if highest == lowest {
		return 0, true
	}
	return (highest - close) / (highest - lowest) * -100.0, true
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func ptrToFloat(v *float64) float64 {
	if v == nil {
		return 0
	}
	return *v
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

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		trimmed := strings.TrimSpace(p)
		if trimmed == "" {
			continue
		}
		out = append(out, strings.ToUpper(trimmed))
	}
	return out
}

func fetchEquityToken(ctx context.Context, st *store.Store, underlying string) (string, error) {
	query := fmt.Sprintf(`SELECT symbol_token
FROM %s
WHERE universe_name = 'nifty100_equity'
  AND upper(underlying) = $1
  AND active_to IS NULL
LIMIT 1`, pgxIdent(st.Schema, "instrument_universe"))
	var token string
	if err := st.Pool.QueryRow(ctx, query, strings.ToUpper(underlying)).Scan(&token); err != nil {
		return "", err
	}
	return token, nil
}

func fetchStockTradingDays(ctx context.Context, st *store.Store, underlying string, start, end time.Time, loc *time.Location) ([]time.Time, error) {
	token, err := fetchEquityToken(ctx, st, underlying)
	if err != nil || token == "" {
		return nil, err
	}
	return fetchTradingDays(ctx, st, token, start, end, loc)
}

func findNearestExpiryStock(ctx context.Context, st *store.Store, underlying string, day time.Time) (time.Time, error) {
	query := fmt.Sprintf(`SELECT expiry
FROM %s
WHERE active = true
  AND upper(underlying) = $1
  AND kind = 'OPTSTK'
  AND expiry >= $2
ORDER BY expiry ASC
LIMIT 1`, pgxIdent(st.Schema, "subscriptions"))
	var expiry time.Time
	if err := st.Pool.QueryRow(ctx, query, strings.ToUpper(underlying), day).Scan(&expiry); err != nil {
		return time.Time{}, err
	}
	return expiry, nil
}

func fetchOptionRefsStock(ctx context.Context, st *store.Store, underlying string, expiry time.Time) (map[string]optionRef, []float64, error) {
	query := fmt.Sprintf(`SELECT exchange, symbol_token, tradingsymbol, "right", strike
FROM %s
WHERE active = true
  AND upper(underlying) = $1
  AND kind = 'OPTSTK'
  AND expiry = $2
  AND strike IS NOT NULL
  AND "right" IN ('CE','PE')`, pgxIdent(st.Schema, "subscriptions"))
	rows, err := st.Pool.Query(ctx, query, strings.ToUpper(underlying), expiry)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	out := map[string]optionRef{}
	strikesSet := map[float64]struct{}{}
	for rows.Next() {
		var ref optionRef
		if err := rows.Scan(&ref.Exchange, &ref.Token, &ref.TradingSymbol, &ref.Right, &ref.Strike); err != nil {
			return nil, nil, err
		}
		key := fmt.Sprintf("%.0f-%s", ref.Strike, strings.ToUpper(ref.Right))
		out[key] = ref
		strikesSet[ref.Strike] = struct{}{}
	}
	var strikes []float64
	for k := range strikesSet {
		strikes = append(strikes, k)
	}
	sort.Float64s(strikes)
	return out, strikes, rows.Err()
}

func fetchLotSize(ctx context.Context, st *store.Store, cache map[string]int, tokens ...string) int {
	for _, token := range tokens {
		if v, ok := cache[token]; ok && v > 0 {
			return v
		}
	}
	query := fmt.Sprintf(`SELECT symbol_token, COALESCE(lotsize, 0)
FROM %s
WHERE symbol_token = ANY($1)`, pgxIdent(st.Schema, "instruments"))
	rows, err := st.Pool.Query(ctx, query, tokens)
	if err != nil {
		return 0
	}
	defer rows.Close()
	for rows.Next() {
		var token string
		var lot int
		if err := rows.Scan(&token, &lot); err != nil {
			continue
		}
		cache[token] = lot
	}
	for _, token := range tokens {
		if v, ok := cache[token]; ok && v > 0 {
			return v
		}
	}
	return 0
}

func computeEquilibriumSeriesFromBars(ctx context.Context, st *store.Store, options map[string]optionRef, expiry time.Time, start, end time.Time) (*eqSeries, error) {
	tokens := make([]string, 0, len(options))
	for _, opt := range options {
		tokens = append(tokens, opt.Token)
	}
	barsByToken, err := fetchOptionBars(ctx, st, tokens, start, end)
	if err != nil {
		return nil, err
	}
	stats := map[string]struct{ Min, Max float64 }{}
	for token, bars := range barsByToken {
		min := math.MaxFloat64
		max := -math.MaxFloat64
		for _, b := range bars {
			if b.Close < min {
				min = b.Close
			}
			if b.Close > max {
				max = b.Close
			}
		}
		if min == math.MaxFloat64 || max == -math.MaxFloat64 {
			continue
		}
		stats[token] = struct{ Min, Max float64 }{Min: min, Max: max}
	}
	acc := map[time.Time]struct {
		CESum float64
		CECnt int
		PESum float64
		PECnt int
	}{}
	for _, opt := range options {
		bars := barsByToken[opt.Token]
		stat, ok := stats[opt.Token]
		if !ok {
			continue
		}
		for _, b := range bars {
			norm := normalizeValue(b.Close, stat.Min, stat.Max)
			row := acc[b.Ts]
			if strings.ToUpper(opt.Right) == "CE" {
				row.CESum += norm
				row.CECnt++
			} else {
				row.PESum += norm
				row.PECnt++
			}
			acc[b.Ts] = row
		}
	}
	es := &eqSeries{Index: map[time.Time]eqRow{}}
	for ts, row := range acc {
		var ce *float64
		var pe *float64
		if row.CECnt > 0 {
			v := row.CESum / float64(row.CECnt)
			ce = &v
		}
		if row.PECnt > 0 {
			v := row.PESum / float64(row.PECnt)
			pe = &v
		}
		if ce == nil && pe == nil {
			continue
		}
		e := eqRow{Ts: ts, CEMeanNorm: ce, PEMeanNorm: pe}
		es.Times = append(es.Times, ts)
		es.Rows = append(es.Rows, e)
		es.Index[ts] = e
	}
	sort.Slice(es.Times, func(i, j int) bool { return es.Times[i].Before(es.Times[j]) })
	return es, nil
}

func fetchOptionBars(ctx context.Context, st *store.Store, tokens []string, start, end time.Time) (map[string][]ohlcBar, error) {
	if len(tokens) == 0 {
		return map[string][]ohlcBar{}, nil
	}
	query := fmt.Sprintf(`SELECT symbol_token, ts, open, high, low, close
FROM %s
WHERE exchange = 'NFO'
  AND symbol_token = ANY($1)
  AND ts >= $2 AND ts <= $3
ORDER BY symbol_token, ts`, pgxIdent(st.Schema, "bars_1m"))
	rows, err := st.Pool.Query(ctx, query, tokens, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string][]ohlcBar{}
	for rows.Next() {
		var token string
		var bar ohlcBar
		if err := rows.Scan(&token, &bar.Ts, &bar.Open, &bar.High, &bar.Low, &bar.Close); err != nil {
			return nil, err
		}
		out[token] = append(out[token], bar)
	}
	return out, rows.Err()
}

func computeATMDiffSeriesFromBars(ctx context.Context, st *store.Store, indexBars *barSeries, options map[string]optionRef, strikes []float64, start, end time.Time, loc *time.Location) (*eqSeries, error) {
	if indexBars == nil || len(indexBars.Times) == 0 {
		return nil, nil
	}
	tokens := make([]string, 0, len(options))
	for _, opt := range options {
		tokens = append(tokens, opt.Token)
	}
	barsByToken, err := fetchOptionBars(ctx, st, tokens, start, end)
	if err != nil {
		return nil, err
	}
	stats := map[string]map[string]struct{ Min, Max float64 }{}
	for token, bars := range barsByToken {
		for _, b := range bars {
			dayKey := b.Ts.In(loc).Format("2006-01-02")
			if stats[token] == nil {
				stats[token] = map[string]struct{ Min, Max float64 }{}
			}
			stat, ok := stats[token][dayKey]
			if !ok {
				stat = struct{ Min, Max float64 }{Min: b.Close, Max: b.Close}
			} else {
				if b.Close < stat.Min {
					stat.Min = b.Close
				}
				if b.Close > stat.Max {
					stat.Max = b.Close
				}
			}
			stats[token][dayKey] = stat
		}
	}
	priceCache := map[string]*priceSeries{}
	for token, bars := range barsByToken {
		ps := &priceSeries{Index: map[time.Time]float64{}}
		for _, b := range bars {
			ps.Times = append(ps.Times, b.Ts)
			ps.Values = append(ps.Values, b.Close)
			ps.Index[b.Ts] = b.Close
		}
		priceCache["NFO:"+token] = ps
	}
	es := &eqSeries{Index: map[time.Time]eqRow{}}
	for _, ts := range indexBars.Times {
		bar := indexBars.Index[ts]
		strike := nearestStrike(strikes, bar.Close)
		ce := options[fmt.Sprintf("%.0f-CE", strike)]
		pe := options[fmt.Sprintf("%.0f-PE", strike)]
		if ce.Token == "" || pe.Token == "" {
			continue
		}
		cePrice, ok1 := getPriceFromCache(priceCache, ce, ts)
		pePrice, ok2 := getPriceFromCache(priceCache, pe, ts)
		dayKey := ts.In(loc).Format("2006-01-02")
		statCEM, okCE := stats[ce.Token]
		statPEM, okPE := stats[pe.Token]
		if !ok1 || !ok2 || !okCE || !okPE {
			continue
		}
		statCE, okCE := statCEM[dayKey]
		statPE, okPE := statPEM[dayKey]
		if !okCE || !okPE {
			continue
		}
		ceNorm := normalizeValue(cePrice, statCE.Min, statCE.Max)
		peNorm := normalizeValue(pePrice, statPE.Min, statPE.Max)
		ceVal := ceNorm
		peVal := peNorm
		row := eqRow{Ts: ts, CEMeanNorm: &ceVal, PEMeanNorm: &peVal}
		es.Times = append(es.Times, ts)
		es.Rows = append(es.Rows, row)
		es.Index[ts] = row
	}
	return es, nil
}

func getPriceFromCache(cache map[string]*priceSeries, ref optionRef, ts time.Time) (float64, bool) {
	ps := cache["NFO:"+ref.Token]
	if ps == nil {
		return 0, false
	}
	return findNearestOrLast(ps, ts, time.Minute, 3*time.Minute)
}

func runStockEquilibriumBacktest(ctx context.Context, st *store.Store, underlyings []string, start, end time.Time, loc *time.Location) error {
	results := []tradeResult{}
	lotCache := map[string]int{}
	maxDiffByUnderlying := map[string]float64{}
	for _, underlying := range underlyings {
		tradingDays, err := fetchStockTradingDays(ctx, st, underlying, start, end, loc)
		if err != nil {
			return err
		}
		for _, day := range tradingDays {
			dayStart := time.Date(day.Year(), day.Month(), day.Day(), 9, 15, 0, 0, loc).UTC()
			dayEnd := time.Date(day.Year(), day.Month(), day.Day(), 15, 30, 0, 0, loc).UTC()
			expiry, err := findNearestExpiryStock(ctx, st, underlying, day)
			if err != nil || expiry.IsZero() {
				continue
			}
			options, strikes, err := fetchOptionRefsStock(ctx, st, underlying, expiry)
			if err != nil || len(options) == 0 {
				continue
			}
			indexToken, err := fetchEquityToken(ctx, st, underlying)
			if err != nil || indexToken == "" {
				continue
			}
			indexBars, err := fetchBarSeriesOHLC(ctx, st, "NSE", indexToken, dayStart, dayEnd)
			if err != nil || len(indexBars.Times) == 0 {
				continue
			}
			eqBars, err := computeATMDiffSeriesFromBars(ctx, st, indexBars, options, strikes, dayStart, dayEnd, loc)
			if err != nil || eqBars == nil {
				continue
			}
			if len(eqBars.Times) == 0 {
				fmt.Printf("No ATM equilibrium rows for %s on %s\n", underlying, day.Format("2006-01-02"))
				continue
			}
			priceCache := map[string]*priceSeries{}
			dayOpen, dayHigh, dayLow := deriveDayOpenHighLow(indexBars)

			for _, ts := range indexBars.Times {
				ceNorm, peNorm, normDiff := computeEquilibrium(eqBars, ts)
				if normDiff > maxDiffByUnderlying[underlying] {
					maxDiffByUnderlying[underlying] = normDiff
				}
				if normDiff < 60 {
					continue
				}
				bar := indexBars.Index[ts]
				price := bar.Close
				strike := nearestStrike(strikes, price)
				ce := options[fmt.Sprintf("%.0f-CE", strike)]
				pe := options[fmt.Sprintf("%.0f-PE", strike)]
				if ce.Token == "" || pe.Token == "" {
					continue
				}
				cePrice, ok1 := getPrice(ctx, st, priceCache, ce, dayStart, dayEnd, ts)
				pePrice, ok2 := getPrice(ctx, st, priceCache, pe, dayStart, dayEnd, ts)
				if !ok1 || !ok2 {
					continue
				}
				qty := int64(fetchLotSize(ctx, st, lotCache, ce.Token, pe.Token))
				if qty == 0 {
					qty = 1
				}
				maxPoints, maxPnL, maxTs, maxCE, maxPE, eodPoints, eodPnL, exitCE, exitPE := computeComboStats(ctx, st, priceCache, ce, pe, dayStart, dayEnd, ts, qty)
				results = append(results, tradeResult{
					EntryTs:        ts,
					ExitTs:         dayEnd,
					Underlying:     underlying,
					Level:          0,
					Strike:         strike,
					CEToken:        ce.Token,
					PEToken:        pe.Token,
					EntryCE:        cePrice,
					EntryPE:        pePrice,
					ExitCE:         exitCE,
					ExitPE:         exitPE,
					Qty:            qty,
					PnL:            eodPnL,
					Reason:         "equilibrium_diff_ge60",
					MaxComboPoints: maxPoints,
					MaxComboPnL:    maxPnL,
					MaxComboTs:     maxTs,
					MaxComboCE:     maxCE,
					MaxComboPE:     maxPE,
					EODComboPoints: eodPoints,
					EODComboPnL:    eodPnL,
					CENorm:         ceNorm,
					PENorm:         peNorm,
					NormDiff:       normDiff,
					DayOpen:        dayOpen,
					DayHigh:        dayHigh,
					DayLow:         dayLow,
				})
			}
		}
	}

	outputPath := filepath.Join("state", "stock_equilibrium_diff_ge60.csv")
	if err := writeCSV(outputPath, results, loc); err != nil {
		altPath := filepath.Join("state", fmt.Sprintf("stock_equilibrium_diff_ge60_%s.csv", time.Now().Format("20060102_150405")))
		if err2 := writeCSV(altPath, results, loc); err2 != nil {
			return err
		}
		outputPath = altPath
	}

	var maxPnL float64
	var maxSeen bool
	for _, r := range results {
		if !maxSeen || r.MaxComboPnL > maxPnL {
			maxPnL = r.MaxComboPnL
			maxSeen = true
		}
	}
	fmt.Printf("Stock equilibrium diff>=60 max possible PnL: %.2f\n", maxPnL)
	for _, u := range underlyings {
		fmt.Printf("Max norm diff (%s): %.2f\n", u, maxDiffByUnderlying[u])
	}
	fmt.Printf("CSV written: %s\n", outputPath)
	return nil
}

func writeCSV(path string, results []tradeResult, loc *time.Location) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	w := csv.NewWriter(f)
	defer w.Flush()
	_ = w.Write([]string{"scenario", "entry_ts", "exit_ts", "underlying", "level", "strike", "ce_token", "pe_token", "entry_ce", "entry_pe", "exit_ce", "exit_pe", "qty", "pnl", "reason", "max_combo_points", "max_combo_pnl", "max_combo_ts", "max_combo_ce", "max_combo_pe", "eod_combo_points", "eod_combo_pnl", "rsi", "willr", "indiavix", "indiavix_delta", "indiavix_delta_3m", "ce_norm", "pe_norm", "norm_diff", "day_open", "day_high", "day_low", "open_combo", "current_combo", "combo_ratio"})
	for _, r := range results {
		_ = w.Write([]string{
			r.Reason,
			r.EntryTs.In(loc).Format(time.RFC3339),
			r.ExitTs.In(loc).Format(time.RFC3339),
			r.Underlying,
			fmt.Sprintf("%.0f", r.Level),
			fmt.Sprintf("%.0f", r.Strike),
			r.CEToken,
			r.PEToken,
			fmt.Sprintf("%.2f", r.EntryCE),
			fmt.Sprintf("%.2f", r.EntryPE),
			fmt.Sprintf("%.2f", r.ExitCE),
			fmt.Sprintf("%.2f", r.ExitPE),
			fmt.Sprintf("%d", r.Qty),
			fmt.Sprintf("%.2f", r.PnL),
			r.Reason,
			fmt.Sprintf("%.2f", r.MaxComboPoints),
			fmt.Sprintf("%.2f", r.MaxComboPnL),
			r.MaxComboTs.In(loc).Format(time.RFC3339),
			fmt.Sprintf("%.2f", r.MaxComboCE),
			fmt.Sprintf("%.2f", r.MaxComboPE),
			fmt.Sprintf("%.2f", r.EODComboPoints),
			fmt.Sprintf("%.2f", r.EODComboPnL),
			fmt.Sprintf("%.2f", r.RSI),
			fmt.Sprintf("%.2f", r.WILLR),
			fmt.Sprintf("%.2f", r.VIX),
			fmt.Sprintf("%.2f", r.VIXDelta),
			fmt.Sprintf("%.2f", r.VIXDelta3m),
			fmt.Sprintf("%.2f", r.CENorm),
			fmt.Sprintf("%.2f", r.PENorm),
			fmt.Sprintf("%.2f", r.NormDiff),
			fmt.Sprintf("%.2f", r.DayOpen),
			fmt.Sprintf("%.2f", r.DayHigh),
			fmt.Sprintf("%.2f", r.DayLow),
			fmt.Sprintf("%.2f", r.OpenCombo),
			fmt.Sprintf("%.2f", r.CurrentCombo),
			fmt.Sprintf("%.4f", r.ComboRatio),
		})
	}
	return nil
}

func printSummary(results []tradeResult) {
	var total float64
	var wins int
	var maxPnL float64
	var minPnL float64
	var maxComboMove float64
	var initialized bool
	for _, r := range results {
		total += r.PnL
		if r.PnL > 0 {
			wins++
		}
		comboMove := (r.ExitCE + r.ExitPE) - (r.EntryCE + r.EntryPE)
		if !initialized {
			maxPnL = r.PnL
			minPnL = r.PnL
			maxComboMove = comboMove
			initialized = true
		} else {
			if r.PnL > maxPnL {
				maxPnL = r.PnL
			}
			if r.PnL < minPnL {
				minPnL = r.PnL
			}
			if comboMove > maxComboMove {
				maxComboMove = comboMove
			}
		}
	}
	fmt.Printf("Backtest trades: %d\n", len(results))
	fmt.Printf("Total PnL: %.2f\n", total)
	if len(results) > 0 {
		fmt.Printf("Win rate: %.2f%%\n", float64(wins)/float64(len(results))*100)
		fmt.Printf("Max PnL: %.2f\n", maxPnL)
		fmt.Printf("Min PnL: %.2f\n", minPnL)
		fmt.Printf("Max Combo Move (points): %.2f\n", maxComboMove)
	}
}

func printDaywise(results []tradeResult, loc *time.Location) {
	type dayAgg struct {
		Trades int
		PnL    float64
	}
	byDay := map[string]*dayAgg{}
	for _, r := range results {
		day := r.EntryTs.In(loc).Format("2006-01-02")
		if byDay[day] == nil {
			byDay[day] = &dayAgg{}
		}
		byDay[day].Trades++
		byDay[day].PnL += r.PnL
	}
	days := make([]string, 0, len(byDay))
	for d := range byDay {
		days = append(days, d)
	}
	sort.Strings(days)
	fmt.Println("\nDay-wise summary:")
	for _, d := range days {
		agg := byDay[d]
		fmt.Printf("%s  trades=%d  pnl=%.2f\n", d, agg.Trades, agg.PnL)
	}
}
