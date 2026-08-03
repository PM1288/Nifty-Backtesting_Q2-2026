package strategy

import "math"

func ema(values []float64, period int) float64 {
	if period <= 0 || len(values) < period {
		return 0
	}
	var sum float64
	for i := 0; i < period; i++ {
		sum += values[i]
	}
	ema := sum / float64(period)
	multiplier := 2.0 / float64(period+1)
	for i := period; i < len(values); i++ {
		ema = (values[i]-ema)*multiplier + ema
	}
	return ema
}

func rsi(values []float64, period int) float64 {
	if period <= 0 || len(values) <= period {
		return 0
	}
	var gain, loss float64
	for i := 1; i <= period; i++ {
		diff := values[i] - values[i-1]
		if diff >= 0 {
			gain += diff
		} else {
			loss -= diff
		}
	}
	avgGain := gain / float64(period)
	avgLoss := loss / float64(period)
	for i := period + 1; i < len(values); i++ {
		diff := values[i] - values[i-1]
		if diff >= 0 {
			avgGain = (avgGain*float64(period-1) + diff) / float64(period)
			avgLoss = (avgLoss * float64(period-1)) / float64(period)
		} else {
			avgGain = (avgGain * float64(period-1)) / float64(period)
			avgLoss = (avgLoss*float64(period-1) + (-diff)) / float64(period)
		}
	}
	if avgLoss == 0 {
		return 100
	}
	rs := avgGain / avgLoss
	return 100 - (100 / (1 + rs))
}

func atr(highs, lows, closes []float64, period int) float64 {
	if period <= 0 || len(highs) <= period || len(lows) != len(highs) || len(closes) != len(highs) {
		return 0
	}
	trs := make([]float64, 0, len(highs)-1)
	for i := 1; i < len(highs); i++ {
		hl := highs[i] - lows[i]
		hc := math.Abs(highs[i] - closes[i-1])
		lc := math.Abs(lows[i] - closes[i-1])
		tr := math.Max(hl, math.Max(hc, lc))
		trs = append(trs, tr)
	}
	if len(trs) < period {
		return 0
	}
	var sum float64
	for i := 0; i < period; i++ {
		sum += trs[i]
	}
	atr := sum / float64(period)
	for i := period; i < len(trs); i++ {
		atr = (atr*float64(period-1) + trs[i]) / float64(period)
	}
	return atr
}

func atrSeries(highs, lows, closes []float64, period int) []float64 {
	if period <= 0 || len(highs) <= period || len(lows) != len(highs) || len(closes) != len(highs) {
		return nil
	}
	n := len(closes)
	tr := make([]float64, n)
	for i := 1; i < n; i++ {
		hl := highs[i] - lows[i]
		hc := math.Abs(highs[i] - closes[i-1])
		lc := math.Abs(lows[i] - closes[i-1])
		tr[i] = math.Max(hl, math.Max(hc, lc))
	}
	atrVals := make([]float64, n)
	var sum float64
	for i := 1; i <= period; i++ {
		sum += tr[i]
	}
	atrVals[period] = sum / float64(period)
	for i := period + 1; i < n; i++ {
		atrVals[i] = (atrVals[i-1]*float64(period-1) + tr[i]) / float64(period)
	}
	return atrVals
}

func vwap(prices []float64, volumes []int64) float64 {
	if len(prices) == 0 || len(prices) != len(volumes) {
		return 0
	}
	var pv float64
	var total float64
	for i := range prices {
		if volumes[i] <= 0 {
			continue
		}
		pv += prices[i] * float64(volumes[i])
		total += float64(volumes[i])
	}
	if total == 0 {
		return 0
	}
	return pv / total
}

func sma(values []float64, period int) float64 {
	if period <= 0 || len(values) < period {
		return 0
	}
	var sum float64
	for _, v := range values[len(values)-period:] {
		sum += v
	}
	return sum / float64(period)
}

func stddev(values []float64, period int) float64 {
	if period <= 0 || len(values) < period {
		return 0
	}
	mean := sma(values, period)
	var sum float64
	for _, v := range values[len(values)-period:] {
		diff := v - mean
		sum += diff * diff
	}
	return math.Sqrt(sum / float64(period))
}

func bollinger(values []float64, period int, mult float64) (float64, float64, float64) {
	if period <= 0 || len(values) < period {
		return 0, 0, 0
	}
	mid := sma(values, period)
	dev := stddev(values, period)
	upper := mid + mult*dev
	lower := mid - mult*dev
	return mid, upper, lower
}

func willr(highs, lows, closes []float64, period int) float64 {
	if period <= 0 || len(closes) < period || len(highs) != len(closes) || len(lows) != len(closes) {
		return 0
	}
	start := len(closes) - period
	high := highs[start]
	low := lows[start]
	for i := start; i < len(closes); i++ {
		if highs[i] > high {
			high = highs[i]
		}
		if lows[i] < low {
			low = lows[i]
		}
	}
	if high == low {
		return 0
	}
	return -100 * ((high - closes[len(closes)-1]) / (high - low))
}

func bandwidthSeries(values []float64, period int, mult float64) []float64 {
	if period <= 0 || len(values) < period {
		return nil
	}
	out := make([]float64, len(values))
	for i := period - 1; i < len(values); i++ {
		mid := sma(values[:i+1], period)
		if mid == 0 {
			continue
		}
		dev := stddev(values[:i+1], period)
		upper := mid + mult*dev
		lower := mid - mult*dev
		out[i] = (upper - lower) / mid * 100
	}
	return out
}

func seriesSlopePct(series []float64, startIdx int) float64 {
	if len(series) == 0 {
		return 0
	}
	if startIdx < 0 {
		startIdx = 0
	}
	firstIdx := -1
	for i := startIdx; i < len(series); i++ {
		if series[i] > 0 {
			firstIdx = i
			break
		}
	}
	lastIdx := -1
	for i := len(series) - 1; i >= startIdx; i-- {
		if series[i] > 0 {
			lastIdx = i
			break
		}
	}
	if firstIdx == -1 || lastIdx == -1 || firstIdx == lastIdx {
		return 0
	}
	first := series[firstIdx]
	last := series[lastIdx]
	if first == 0 {
		return 0
	}
	return (last - first) / first * 100
}

func supertrend(highs, lows, closes []float64, period int, multiplier float64) (float64, int) {
	if period <= 0 || len(closes) <= period || len(highs) != len(closes) || len(lows) != len(closes) {
		return 0, 0
	}
	n := len(closes)
	tr := make([]float64, n)
	for i := 1; i < n; i++ {
		hl := highs[i] - lows[i]
		hc := math.Abs(highs[i] - closes[i-1])
		lc := math.Abs(lows[i] - closes[i-1])
		tr[i] = math.Max(hl, math.Max(hc, lc))
	}
	atrVals := make([]float64, n)
	var sum float64
	for i := 1; i <= period; i++ {
		sum += tr[i]
	}
	atrVals[period] = sum / float64(period)
	for i := period + 1; i < n; i++ {
		atrVals[i] = (atrVals[i-1]*float64(period-1) + tr[i]) / float64(period)
	}

	finalUpper := make([]float64, n)
	finalLower := make([]float64, n)
	direction := make([]int, n)

	for i := period; i < n; i++ {
		basicUpper := (highs[i]+lows[i])/2 + multiplier*atrVals[i]
		basicLower := (highs[i]+lows[i])/2 - multiplier*atrVals[i]
		if i == period {
			finalUpper[i] = basicUpper
			finalLower[i] = basicLower
			if closes[i] > finalUpper[i] {
				direction[i] = 1
			} else {
				direction[i] = -1
			}
			continue
		}
		if basicUpper < finalUpper[i-1] || closes[i-1] > finalUpper[i-1] {
			finalUpper[i] = basicUpper
		} else {
			finalUpper[i] = finalUpper[i-1]
		}
		if basicLower > finalLower[i-1] || closes[i-1] < finalLower[i-1] {
			finalLower[i] = basicLower
		} else {
			finalLower[i] = finalLower[i-1]
		}
		if direction[i-1] == -1 && closes[i] > finalUpper[i] {
			direction[i] = 1
		} else if direction[i-1] == 1 && closes[i] < finalLower[i] {
			direction[i] = -1
		} else {
			direction[i] = direction[i-1]
		}
	}

	last := n - 1
	if direction[last] >= 0 {
		return finalLower[last], 1
	}
	return finalUpper[last], -1
}
