package main

import (
	"testing"
	"time"
)

func TestBuildPCRSnapshots(t *testing.T) {
	ts := time.Date(2026, time.January, 11, 10, 0, 0, 0, time.UTC)
	expiry := time.Date(2026, time.January, 30, 0, 0, 0, 0, time.UTC)
	accum := map[string]*pcrAgg{
		"NIFTY50|2026-01-30": {Underlying: "NIFTY50", Expiry: expiry, CEOI: 100, PEOI: 150},
	}
	rows := buildPCRSnapshots(ts, accum)
	if len(rows) != 1 {
		t.Fatalf("expected 1 row, got %d", len(rows))
	}
	if rows[0].PCR == nil || *rows[0].PCR != 1.5 {
		t.Fatalf("expected PCR 1.5, got %v", rows[0].PCR)
	}
}

func TestSplitDateRange(t *testing.T) {
	loc := time.UTC
	start := time.Date(2026, time.January, 1, 0, 0, 0, 0, loc)
	end := time.Date(2026, time.January, 10, 0, 0, 0, 0, loc)
	ranges := splitDateRange(start, end, 3, loc)
	if len(ranges) != 3 {
		t.Fatalf("expected 3 ranges, got %d", len(ranges))
	}
	if !ranges[0].start.Equal(time.Date(2026, time.January, 1, 0, 0, 0, 0, loc)) {
		t.Fatalf("unexpected first start: %v", ranges[0].start)
	}
	if ranges[2].end.Day() != 10 {
		t.Fatalf("unexpected last end: %v", ranges[2].end)
	}
}

func TestLastWorkingDay(t *testing.T) {
	loc := time.FixedZone("IST", 5*60*60+30*60)
	tradingStart := "09:15"
	tradingEnd := "15:30"

	saturday := time.Date(2026, time.January, 10, 12, 0, 0, 0, loc)
	last := lastWorkingDay(saturday, tradingStart, tradingEnd, loc)
	if last.Weekday() != time.Friday {
		t.Fatalf("expected Friday, got %s", last.Weekday())
	}

	premarket := time.Date(2026, time.January, 12, 8, 0, 0, 0, loc) // Monday
	last = lastWorkingDay(premarket, tradingStart, tradingEnd, loc)
	if last.Weekday() != time.Friday {
		t.Fatalf("expected Friday for premarket Monday, got %s", last.Weekday())
	}

	afterHours := time.Date(2026, time.January, 13, 18, 0, 0, 0, loc)
	last = lastWorkingDay(afterHours, tradingStart, tradingEnd, loc)
	if last.Day() != 13 {
		t.Fatalf("expected same day after hours, got %s", last.Format("2006-01-02"))
	}
}
