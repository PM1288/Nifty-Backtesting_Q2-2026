package options

import (
	"math"
	"testing"
)

func TestImpliedVolatilityRoundTrip(t *testing.T) {
	price, expected, ok := Black76(100, 100, 30.0/365, 0.06, 0.25, true)
	if !ok {
		t.Fatal("pricing failed")
	}
	iv, ok := ImpliedVolatility(price, 100, 100, 30.0/365, 0.06, true)
	if !ok || math.Abs(iv-0.25) > 1e-6 {
		t.Fatalf("iv=%v ok=%v", iv, ok)
	}
	_, actual, ok := Black76(100, 100, 30.0/365, 0.06, iv, true)
	if !ok || math.Abs(actual.Delta-expected.Delta) > 1e-8 || actual.Gamma <= 0 || actual.Vega <= 0 {
		t.Fatalf("unexpected greeks: %+v", actual)
	}
}
