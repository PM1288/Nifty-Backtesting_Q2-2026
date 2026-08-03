package equilibrium

import (
	"testing"
	"time"
)

func TestNearestStrike(t *testing.T) {
	strikes := []float64{24000, 24050, 24100}

	if got := nearestStrike(strikes, 24070); got != 24050 {
		t.Fatalf("nearestStrike(24070)=%v, want 24050", got)
	}
	// Tie -> choose lower strike.
	if got := nearestStrike(strikes, 24075); got != 24050 {
		t.Fatalf("nearestStrike(24075)=%v, want 24050", got)
	}
}

func TestComputeATMSeries_NormalizesIndependently(t *testing.T) {
	t1 := time.Date(2026, 2, 10, 3, 45, 0, 0, time.UTC)
	t2 := t1.Add(1 * time.Minute)

	spotBars := []underlyingBar{
		{Ts: t1, Close: 24025}, // tie -> 24000
		{Ts: t2, Close: 24060}, // -> 24050
	}
	strikes := []float64{24000, 24050}

	optionRows := []barRow{
		{Ts: t1, Token: "CE24000", Close: 100, Strike: 24000, Right: "CE"},
		{Ts: t1, Token: "PE24000", Close: 200, Strike: 24000, Right: "PE"},
		{Ts: t2, Token: "CE24050", Close: 150, Strike: 24050, Right: "CE"},
		{Ts: t2, Token: "PE24050", Close: 100, Strike: 24050, Right: "PE"},
	}

	series := computeATMSeries(optionRows, strikes, spotBars, t1)
	if len(series) != 2 {
		t.Fatalf("len(series)=%d, want 2", len(series))
	}

	if series[0].CEMean == nil || series[1].CEMean == nil || series[0].PEMean == nil || series[1].PEMean == nil {
		t.Fatalf("expected CE/PE values to be present for both points")
	}
	// CE raw: [100,150] -> [0,100]
	if got := *series[0].CEMean; got != 0 {
		t.Fatalf("t1 CE=%v, want 0", got)
	}
	if got := *series[1].CEMean; got != 100 {
		t.Fatalf("t2 CE=%v, want 100", got)
	}

	// PE raw: [200,100] -> [100,0]
	if got := *series[0].PEMean; got != 100 {
		t.Fatalf("t1 PE=%v, want 100", got)
	}
	if got := *series[1].PEMean; got != 0 {
		t.Fatalf("t2 PE=%v, want 0", got)
	}

	if series[0].CECount != 1 || series[0].PECount != 1 || series[1].CECount != 1 || series[1].PECount != 1 {
		t.Fatalf("expected CE/PE counts to be 1, got %+v %+v", series[0], series[1])
	}
}
