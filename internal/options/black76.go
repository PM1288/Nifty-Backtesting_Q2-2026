package options

import "math"

type Greeks struct {
	Delta float64
	Gamma float64
	Theta float64
	Vega  float64
}

func normalCDF(x float64) float64 { return 0.5 * (1 + math.Erf(x/math.Sqrt2)) }
func normalPDF(x float64) float64 { return math.Exp(-0.5*x*x) / math.Sqrt(2*math.Pi) }

// Black76 prices a European option on a futures price. Theta is per calendar
// day and vega is per one percentage-point volatility change.
func Black76(future, strike, years, rate, volatility float64, isCall bool) (float64, Greeks, bool) {
	if future <= 0 || strike <= 0 || years <= 0 || volatility <= 0 {
		return 0, Greeks{}, false
	}
	sqrtT := math.Sqrt(years)
	d1 := (math.Log(future/strike) + 0.5*volatility*volatility*years) / (volatility * sqrtT)
	d2 := d1 - volatility*sqrtT
	discount := math.Exp(-rate * years)
	price := discount * (future*normalCDF(d1) - strike*normalCDF(d2))
	delta := discount * normalCDF(d1)
	if !isCall {
		price = discount * (strike*normalCDF(-d2) - future*normalCDF(-d1))
		delta = -discount * normalCDF(-d1)
	}
	gamma := discount * normalPDF(d1) / (future * volatility * sqrtT)
	vega := discount * future * normalPDF(d1) * sqrtT / 100
	thetaAnnual := -discount*future*normalPDF(d1)*volatility/(2*sqrtT) + rate*price
	return price, Greeks{Delta: delta, Gamma: gamma, Theta: thetaAnnual / 365, Vega: vega}, true
}

func ImpliedVolatility(price, future, strike, years, rate float64, isCall bool) (float64, bool) {
	if price <= 0 || future <= 0 || strike <= 0 || years <= 0 {
		return 0, false
	}
	low, high := 0.0001, 5.0
	lowPrice, _, _ := Black76(future, strike, years, rate, low, isCall)
	highPrice, _, _ := Black76(future, strike, years, rate, high, isCall)
	if price < lowPrice || price > highPrice {
		return 0, false
	}
	for i := 0; i < 100; i++ {
		mid := (low + high) / 2
		value, _, _ := Black76(future, strike, years, rate, mid, isCall)
		if math.Abs(value-price) < 1e-8 {
			return mid, true
		}
		if value < price {
			low = mid
		} else {
			high = mid
		}
	}
	return (low + high) / 2, true
}
