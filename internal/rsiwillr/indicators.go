package rsiwillr

import "math"

// RSI implementation matches the A02 backtest: simple rolling average of gains/losses (not Wilder smoothing).
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
