package util

import (
	"testing"
	"time"
)

func TestMinuteStartUTC_IST(t *testing.T) {
	loc, err := time.LoadLocation("Asia/Kolkata")
	if err != nil {
		t.Fatalf("load location: %v", err)
	}

	ts := time.Date(2025, 1, 1, 0, 0, 30, 0, time.UTC)
	got := MinuteStartUTC(ts, loc)
	want := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	if !got.Equal(want) {
		t.Fatalf("expected %s, got %s", want, got)
	}

	tsIST := time.Date(2025, 1, 1, 5, 30, 59, 0, loc)
	got = MinuteStartUTC(tsIST, loc)
	if !got.Equal(want) {
		t.Fatalf("expected %s, got %s", want, got)
	}
}
