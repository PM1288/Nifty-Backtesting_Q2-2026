package store

import (
	"testing"
	"time"
	"trading-stack/internal/config"
)

func TestRetentionISTBoundary(t *testing.T) {
	loc, _ := time.LoadLocation("Asia/Kolkata")
	now := time.Date(2026, 9, 7, 18, 0, 0, 0, time.UTC)
	if got := cutoffUTC(now, 15, loc).Format(time.RFC3339); got != "2026-08-22T18:30:00Z" {
		t.Fatal(got)
	}
}
func TestRetentionCatalogBounds(t *testing.T) {
	cutoff := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	for _, tc := range []struct {
		bound string
		want  bool
	}{
		{"FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00')", true},
		{"FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00')", false},
		{"DEFAULT", false}, {"FOR VALUES IN ('2026-08-01')", false},
	} {
		if got := expiredPartition(tc.bound, cutoff); got != tc.want {
			t.Errorf("%s got %v", tc.bound, got)
		}
	}
}
func TestRetentionRequiredFamiliesAndProtectedExclusions(t *testing.T) {
	seen := map[string]bool{}
	for _, r := range retentionRules(config.RetentionConfig{}) {
		if seen[r.Table] {
			t.Fatal("duplicate", r.Table)
		}
		seen[r.Table] = true
	}
	for _, n := range []string{"market_ticks", "depth_5_metrics", "smartapi_option_chain_snapshots", "bars_1m", "option_greeks"} {
		if !seen[n] {
			t.Fatal("missing", n)
		}
	}
	for _, n := range []string{"bars_1d", "instruments", "trade_events", "decision_snapshot"} {
		if seen[n] {
			t.Fatal("protected", n)
		}
	}
}
