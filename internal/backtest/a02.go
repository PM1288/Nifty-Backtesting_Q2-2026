package backtest

import (
	"context"
	"encoding/json"
	"math"
	"runtime"
	"sort"
	"sync"
	"time"
)

type ChargeRates struct {
	BrokerageRate   float64
	BrokerageCap    float64
	STTRate         float64
	ExchangeTxnRate float64
	SEBIFeeRate     float64
	StampDutyRate   float64
	GSTRate         float64
}

type A02Trade struct {
	Exchange        string
	SymbolToken     string
	Symbol          string
	TradingSymbol   string
	EntryTime       time.Time
	EntryClose      float64
	ExitTime        time.Time
	ExitClose       float64
	Success         bool
	GainPct         float64
	DurationMinutes float64
	RSI             float64
	PrevRSI         float64
	WillR           float64
	PrevVolume      float64
	VolumeMedian    float64
	Percentile      float64
	Quantity        int
	InvestmentAmt   float64
	ExitValue       float64
	Turnover        float64
	GrossProfit     float64
	TotalCharges    float64
	NetProfit       float64
	NetGainPct      float64
	TargetPrice     float64
	BreakevenPoints float64
	Raw             []byte
}

type A02Summary struct {
	TotalTrades            int
	Wins                   int
	Losses                 int
	WinRate                float64
	DurationMin            *float64
	DurationMax            *float64
	DurationAvg            *float64
	DurationMedian         *float64
	DurationStd            *float64
	TotalGrossProfit       float64
	TotalCharges           float64
	TotalNetProfit         float64
	AverageBreakevenPoints *float64
	CapitalTrades          int
	CapitalWins            int
	CapitalLosses          int
	CapitalNetProfit       float64
}

type A02RunResult struct {
	RunID             time.Time
	TradeDate         time.Time
	Trades            []A02Trade
	Summary           A02Summary
	SymbolsEvaluated  int
	SymbolsWithTrades int
}

type instrumentRef struct {
	Exchange      string
	Token         string
	Symbol        string
	TradingSymbol string
}

type minuteBar struct {
	Ts     time.Time
	Open   float64
	High   float64
	Low    float64
	Close  float64
	Volume int64
}

type dailyClose struct {
	TradeDate time.Time
	Close     float64
}

type signalCandidate struct {
	Index          int
	EntryTime      time.Time
	EntryClose     float64
	RSI            float64
	PrevRSI        float64
	WillR          float64
	PrevVolume     float64
	CurrentVolume  float64
	VolumeMedian   float64
	VWAP           float64
	BollingerLow   float64
	VolumeSpike    bool
	PriceAboveVWAP bool
	BollingerTouch bool
}

type engineConfig struct {
	RSIPeriod               int
	WillRPeriod             int
	RSIThreshold            float64
	WillRThreshold          float64
	MaxPercentile           float64
	RequireDailyEMATrend    bool
	RequireBollingerTouch   bool
	RequireVWAPReclaim      bool
	RequireVolumeSpike      bool
	DailyEMAFast            int
	DailyEMASlow            int
	BollingerPeriod         int
	BollingerStdDev         float64
	BollingerLowerBufferPct float64
	VolumeSpikeMinRatio     float64
	CloseLookback           int
	VolumeLookback          int
	VolumeMedianMaxRatio    float64
	StartOffsetMinutes      int
	EntryCutoffTime         string
	TargetGain              float64
	TradeCapital            float64
	CapitalLimit            float64
	MaxConcurrent           int
	Charges                 ChargeRates
}

func runA02Backtest(ctx context.Context, tradeDate time.Time, symbols []instrumentRef, bars map[string][]minuteBar, percentiles map[string]float64, dailyTrend map[string]bool, cfg engineConfig, loc *time.Location) (A02RunResult, error) {
	tradeLocal := tradeDate
	if loc != nil {
		tradeLocal = tradeDate.In(loc)
	}
	runDateUTC := time.Date(tradeLocal.Year(), tradeLocal.Month(), tradeLocal.Day(), 0, 0, 0, 0, time.UTC)
	result := A02RunResult{RunID: runDateUTC, TradeDate: tradeDate}
	result.SymbolsEvaluated = len(symbols)
	trades := make([]A02Trade, 0, len(symbols))
	jobs := make(chan instrumentRef)
	var mu sync.Mutex
	var wg sync.WaitGroup
	workers := runtime.GOMAXPROCS(0)
	if workers < 1 {
		workers = 1
	}
	if workers > len(symbols) {
		workers = len(symbols)
	}
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for ref := range jobs {
				if ctx.Err() != nil {
					return
				}
				pct, ok := percentiles[ref.Token]
				if !ok || pct >= cfg.MaxPercentile {
					continue
				}
				rows := bars[ref.Token]
				if len(rows) == 0 {
					continue
				}
				if cfg.RequireDailyEMATrend {
					if dailyTrend == nil {
						continue
					}
					if ok, exists := dailyTrend[ref.Token]; !exists || !ok {
						continue
					}
				}
				trade := backtestSymbol(rows, pct, cfg, loc)
				if trade == nil {
					continue
				}
				trade.Exchange = ref.Exchange
				trade.SymbolToken = ref.Token
				trade.Symbol = ref.Symbol
				trade.TradingSymbol = ref.TradingSymbol
				mu.Lock()
				trades = append(trades, *trade)
				mu.Unlock()
			}
		}()
	}
	for _, ref := range symbols {
		if ctx.Err() != nil {
			break
		}
		jobs <- ref
	}
	close(jobs)
	wg.Wait()
	if err := ctx.Err(); err != nil {
		return result, err
	}
	sort.SliceStable(trades, func(i, j int) bool {
		if trades[i].EntryTime.Equal(trades[j].EntryTime) {
			return trades[i].SymbolToken < trades[j].SymbolToken
		}
		return trades[i].EntryTime.Before(trades[j].EntryTime)
	})

	result.Trades = trades
	result.SymbolsWithTrades = countUniqueSymbols(trades)
	result.Summary = summariseTrades(trades, cfg.CapitalLimit, cfg.MaxConcurrent)
	return result, nil
}

func backtestSymbol(bars []minuteBar, percentile float64, cfg engineConfig, loc *time.Location) *A02Trade {
	if len(bars) == 0 {
		return nil
	}
	closes := make([]float64, len(bars))
	highs := make([]float64, len(bars))
	lows := make([]float64, len(bars))
	volumes := make([]float64, len(bars))
	for i, bar := range bars {
		closes[i] = bar.Close
		highs[i] = bar.High
		lows[i] = bar.Low
		volumes[i] = float64(bar.Volume)
	}

	rsiSeries := rsiSeries(closes, cfg.RSIPeriod)
	willrSeries := willrSeries(highs, lows, closes, cfg.WillRPeriod)
	vwapSeries := vwapSeries(closes, volumes)
	bollingerLower := bollingerLowerSeries(closes, cfg.BollingerPeriod, cfg.BollingerStdDev)

	startTime := bars[0].Ts
	threshold := startTime.Add(time.Duration(cfg.StartOffsetMinutes) * time.Minute)
	minIndex := maxInt(cfg.CloseLookback, cfg.VolumeLookback, cfg.RSIPeriod, cfg.WillRPeriod, cfg.BollingerPeriod)

	for i := range bars {
		if bars[i].Ts.Before(threshold) {
			continue
		}
		if i < minIndex {
			continue
		}
		signal := evaluateSignal(i, bars, closes, volumes, rsiSeries, willrSeries, vwapSeries, bollingerLower, cfg)
		if signal == nil {
			continue
		}
		if cfg.EntryCutoffTime != "" && afterCutoff(signal.EntryTime, cfg.EntryCutoffTime, loc) {
			return nil
		}
		trade := evaluateExit(bars, signal, cfg)
		trade.Percentile = percentile
		dayHigh := maxHigh(highs)
		trade.Raw = mustJSON(map[string]any{
			"rsi":              signal.RSI,
			"prev_rsi":         signal.PrevRSI,
			"willr":            signal.WillR,
			"prev_volume":      signal.PrevVolume,
			"current_volume":   signal.CurrentVolume,
			"volume_median":    signal.VolumeMedian,
			"volume_spike":     signal.VolumeSpike,
			"vwap":             signal.VWAP,
			"price_above_vwap": signal.PriceAboveVWAP,
			"bollinger_low":    signal.BollingerLow,
			"bollinger_touch":  signal.BollingerTouch,
			"day_open":         bars[0].Open,
			"day_close":        bars[len(bars)-1].Close,
			"day_high":         dayHigh,
		})
		return trade
	}
	return nil
}

func evaluateSignal(index int, bars []minuteBar, closes, volumes, rsiVals, willrVals, vwapVals, bollingerLower []float64, cfg engineConfig) *signalCandidate {
	latest := bars[index]
	if math.IsNaN(rsiVals[index]) || math.IsNaN(rsiVals[index-1]) || math.IsNaN(willrVals[index]) {
		return nil
	}
	volumeMedian := median(volumes[index-cfg.VolumeLookback : index])
	prevVolume := volumes[index-1]
	currentVolume := volumes[index]
	ratio := cfg.VolumeMedianMaxRatio
	if ratio <= 0 {
		ratio = 1
	}
	spikeRatio := cfg.VolumeSpikeMinRatio
	if spikeRatio <= 0 {
		spikeRatio = 1
	}
	vwap := vwapVals[index]
	bollingerLow := bollingerLower[index]
	priceAboveVWAP := !math.IsNaN(vwap) && latest.Close >= vwap
	bollingerTouch := !math.IsNaN(bollingerLow) && latest.Close <= bollingerLow*(1+(cfg.BollingerLowerBufferPct/100))
	volumeSpike := currentVolume >= (volumeMedian * spikeRatio)

	conditions := []bool{
		rsiVals[index] < cfg.RSIThreshold,
		willrVals[index] < cfg.WillRThreshold,
		latest.Low > bars[index-1].Low,
		prevVolume <= volumeMedian*ratio,
	}
	if cfg.RequireVWAPReclaim {
		conditions = append(conditions, priceAboveVWAP)
	}
	if cfg.RequireBollingerTouch {
		conditions = append(conditions, bollingerTouch)
	}
	if cfg.RequireVolumeSpike {
		conditions = append(conditions, volumeSpike)
	}
	for _, ok := range conditions {
		if !ok {
			return nil
		}
	}
	return &signalCandidate{
		Index:          index,
		EntryTime:      latest.Ts,
		EntryClose:     latest.Close,
		RSI:            rsiVals[index],
		PrevRSI:        rsiVals[index-1],
		WillR:          willrVals[index],
		PrevVolume:     prevVolume,
		CurrentVolume:  currentVolume,
		VolumeMedian:   volumeMedian,
		VWAP:           vwap,
		BollingerLow:   bollingerLow,
		VolumeSpike:    volumeSpike,
		PriceAboveVWAP: priceAboveVWAP,
		BollingerTouch: bollingerTouch,
	}
}

func evaluateExit(bars []minuteBar, signal *signalCandidate, cfg engineConfig) *A02Trade {
	dayOpen := bars[0].Open
	dayClose := bars[len(bars)-1].Close
	entryPrice := (dayOpen + dayClose) / 2
	if entryPrice <= 0 {
		entryPrice = signal.EntryClose
	}
	targetPrice := entryPrice * (1 + cfg.TargetGain)
	entryTime := signal.EntryTime

	exitTime := bars[len(bars)-1].Ts
	exitClose := dayClose
	success := false
	for i := signal.Index; i < len(bars); i++ {
		if bars[i].High >= targetPrice {
			exitTime = bars[i].Ts
			exitClose = targetPrice
			success = true
			break
		}
	}
	gainPct := ((exitClose / entryPrice) - 1) * 100
	duration := exitTime.Sub(entryTime).Minutes()

	qty := int(math.Floor(cfg.TradeCapital / entryPrice))
	if qty < 1 {
		qty = 1
	}
	charges := CalculateTradeCosts(entryPrice, exitClose, qty, cfg.Charges)

	trade := &A02Trade{
		EntryTime:       entryTime,
		EntryClose:      entryPrice,
		ExitTime:        exitTime,
		ExitClose:       exitClose,
		Success:         success,
		GainPct:         gainPct,
		DurationMinutes: duration,
		RSI:             signal.RSI,
		PrevRSI:         signal.PrevRSI,
		WillR:           signal.WillR,
		PrevVolume:      signal.PrevVolume,
		VolumeMedian:    signal.VolumeMedian,
		Quantity:        qty,
		InvestmentAmt:   charges.EntryValue,
		ExitValue:       charges.ExitValue,
		Turnover:        charges.Turnover,
		GrossProfit:     charges.GrossProfit,
		TotalCharges:    charges.TotalCharges,
		NetProfit:       charges.NetProfit,
		NetGainPct:      charges.NetGainPct,
		TargetPrice:     round2(targetPrice),
		BreakevenPoints: charges.BreakevenPoints,
	}
	return trade
}

func summariseTrades(trades []A02Trade, capitalLimit float64, maxConcurrent int) A02Summary {
	summary := A02Summary{}
	summary.TotalTrades = len(trades)
	for _, trade := range trades {
		if trade.Success {
			summary.Wins++
		}
		summary.TotalGrossProfit += trade.GrossProfit
		summary.TotalCharges += trade.TotalCharges
		summary.TotalNetProfit += trade.NetProfit
	}
	summary.Losses = summary.TotalTrades - summary.Wins
	if summary.TotalTrades > 0 {
		summary.WinRate = float64(summary.Wins) / float64(summary.TotalTrades) * 100
	}
	durations := make([]float64, 0, len(trades))
	breakevens := make([]float64, 0, len(trades))
	for _, trade := range trades {
		durations = append(durations, trade.DurationMinutes)
		breakevens = append(breakevens, trade.BreakevenPoints)
	}
	summary.DurationMin, summary.DurationMax = minMaxPtr(durations)
	summary.DurationAvg = meanPtr(durations)
	summary.DurationMedian = medianPtr(durations)
	summary.DurationStd = stddevPtr(durations)
	summary.AverageBreakevenPoints = meanPtr(breakevens)

	selected := selectCapitalTrades(trades, capitalLimit, maxConcurrent)
	for _, trade := range selected {
		if trade.Success {
			summary.CapitalWins++
		}
		summary.CapitalNetProfit += trade.NetProfit
	}
	summary.CapitalTrades = len(selected)
	summary.CapitalLosses = summary.CapitalTrades - summary.CapitalWins
	return summary
}

func selectCapitalTrades(trades []A02Trade, capitalLimit float64, maxConcurrent int) []A02Trade {
	selected := make([]A02Trade, 0)
	if capitalLimit <= 0 || maxConcurrent <= 0 {
		return selected
	}
	sortedTrades := make([]A02Trade, 0, len(trades))
	for _, trade := range trades {
		if !trade.EntryTime.IsZero() && !trade.ExitTime.IsZero() {
			sortedTrades = append(sortedTrades, trade)
		}
	}
	sort.Slice(sortedTrades, func(i, j int) bool { return sortedTrades[i].EntryTime.Before(sortedTrades[j].EntryTime) })
	active := make([]A02Trade, 0)
	for _, trade := range sortedTrades {
		entry := trade.EntryTime
		active = filterActive(active, entry)
		allocated := 0.0
		for _, item := range active {
			allocated += item.InvestmentAmt
		}
		if len(active) >= maxConcurrent {
			continue
		}
		if trade.InvestmentAmt <= 0 || trade.InvestmentAmt > capitalLimit {
			continue
		}
		if trade.InvestmentAmt > (capitalLimit - allocated) {
			continue
		}
		active = append(active, trade)
		selected = append(selected, trade)
	}
	return selected
}

func filterActive(active []A02Trade, entry time.Time) []A02Trade {
	filtered := active[:0]
	for _, item := range active {
		if item.ExitTime.After(entry) {
			filtered = append(filtered, item)
		}
	}
	return filtered
}

func maxHigh(values []float64) float64 {
	maxV := 0.0
	for _, value := range values {
		if value > maxV {
			maxV = value
		}
	}
	return maxV
}

func rsiSeries(values []float64, period int) []float64 {
	out := make([]float64, len(values))
	for i := range out {
		out[i] = math.NaN()
	}
	if period <= 0 || len(values) <= period {
		return out
	}

	gains := make([]float64, len(values))
	losses := make([]float64, len(values))
	for i := 1; i < len(values); i++ {
		diff := values[i] - values[i-1]
		if diff >= 0 {
			gains[i] = diff
		} else {
			losses[i] = -diff
		}
	}

	var sumGain, sumLoss float64
	for i := 1; i <= period && i < len(values); i++ {
		sumGain += gains[i]
		sumLoss += losses[i]
	}
	if period < len(values) {
		out[period] = rsiValue(sumGain/float64(period), sumLoss/float64(period))
	}

	for i := period + 1; i < len(values); i++ {
		sumGain += gains[i] - gains[i-period]
		sumLoss += losses[i] - losses[i-period]
		out[i] = rsiValue(sumGain/float64(period), sumLoss/float64(period))
	}
	return out
}

func rsiValue(avgGain, avgLoss float64) float64 {
	if avgLoss == 0 {
		return 100
	}
	rs := avgGain / avgLoss
	return 100 - (100 / (1 + rs))
}

func emaValue(values []float64, period int) float64 {
	if len(values) == 0 {
		return math.NaN()
	}
	if period <= 1 {
		return values[len(values)-1]
	}
	alpha := 2.0 / float64(period+1)
	ema := values[0]
	for i := 1; i < len(values); i++ {
		ema = (values[i]-ema)*alpha + ema
	}
	return ema
}

func willrSeries(highs, lows, closes []float64, period int) []float64 {
	out := make([]float64, len(closes))
	for i := range out {
		out[i] = math.NaN()
	}
	if period <= 0 {
		return out
	}
	for i := period - 1; i < len(closes); i++ {
		high := highs[i]
		low := lows[i]
		for j := i - period + 1; j <= i; j++ {
			if highs[j] > high {
				high = highs[j]
			}
			if lows[j] < low {
				low = lows[j]
			}
		}
		if high == low {
			out[i] = 0
			continue
		}
		out[i] = -100 * ((high - closes[i]) / (high - low))
	}
	return out
}

func vwapSeries(closes, volumes []float64) []float64 {
	out := make([]float64, len(closes))
	var cumVol, cumPV float64
	for i := range closes {
		vol := volumes[i]
		cumVol += vol
		cumPV += closes[i] * vol
		if cumVol == 0 {
			out[i] = math.NaN()
			continue
		}
		out[i] = cumPV / cumVol
	}
	return out
}

func bollingerLowerSeries(values []float64, period int, stdDev float64) []float64 {
	out := make([]float64, len(values))
	for i := range out {
		out[i] = math.NaN()
	}
	if period < 2 || stdDev <= 0 {
		return out
	}
	for i := period - 1; i < len(values); i++ {
		window := values[i-period+1 : i+1]
		mean := average(window)
		var sum float64
		for _, v := range window {
			delta := v - mean
			sum += delta * delta
		}
		std := math.Sqrt(sum / float64(len(window)))
		out[i] = mean - (stdDev * std)
	}
	return out
}

func average(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	sum := 0.0
	for _, v := range values {
		sum += v
	}
	return sum / float64(len(values))
}

func median(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	copyVals := make([]float64, len(values))
	copy(copyVals, values)
	sort.Float64s(copyVals)
	mid := len(copyVals) / 2
	if len(copyVals)%2 == 1 {
		return copyVals[mid]
	}
	return (copyVals[mid-1] + copyVals[mid]) / 2
}

func minMaxPtr(values []float64) (*float64, *float64) {
	if len(values) == 0 {
		return nil, nil
	}
	minVal := values[0]
	maxVal := values[0]
	for _, v := range values[1:] {
		if v < minVal {
			minVal = v
		}
		if v > maxVal {
			maxVal = v
		}
	}
	return &minVal, &maxVal
}

func meanPtr(values []float64) *float64 {
	if len(values) == 0 {
		return nil
	}
	mean := average(values)
	return &mean
}

func medianPtr(values []float64) *float64 {
	if len(values) == 0 {
		return nil
	}
	med := median(values)
	return &med
}

func stddevPtr(values []float64) *float64 {
	if len(values) < 2 {
		return nil
	}
	mean := average(values)
	var sum float64
	for _, v := range values {
		delta := v - mean
		sum += delta * delta
	}
	std := math.Sqrt(sum / float64(len(values)))
	return &std
}

func afterCutoff(entry time.Time, cutoff string, loc *time.Location) bool {
	if cutoff == "" {
		return false
	}
	parsed, err := time.ParseInLocation("15:04", cutoff, loc)
	if err != nil {
		return false
	}
	local := entry.In(loc)
	cutoffTime := time.Date(local.Year(), local.Month(), local.Day(), parsed.Hour(), parsed.Minute(), 0, 0, loc)
	return local.After(cutoffTime)
}

func mustJSON(value any) []byte {
	raw, err := json.Marshal(value)
	if err != nil {
		return []byte("{}")
	}
	return raw
}

func maxInt(values ...int) int {
	max := 0
	for _, v := range values {
		if v > max {
			max = v
		}
	}
	return max
}

func countUniqueSymbols(trades []A02Trade) int {
	seen := map[string]struct{}{}
	for _, trade := range trades {
		if trade.SymbolToken == "" {
			continue
		}
		seen[trade.SymbolToken] = struct{}{}
	}
	return len(seen)
}
