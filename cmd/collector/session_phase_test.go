package main

import (
	"testing"
	"time"
)

func istTime(t *testing.T, hour, minute int) time.Time {
	t.Helper()
	loc, err := time.LoadLocation("Asia/Kolkata")
	if err != nil {
		t.Fatal(err)
	}
	return time.Date(2026, 8, 10, hour, minute, 0, 0, loc)
}

func TestMarketSessionPhaseCASAndFNOExtended(t *testing.T) {
	loc, _ := time.LoadLocation("Asia/Kolkata")
	tests := []struct {
		name, exchange string
		hour, minute   int
		cas            bool
		want           string
	}{
		{"regular cash", "NSE", 14, 0, true, "REGULAR"},
		{"cas reference", "NSE", 15, 17, true, "CAS_REFERENCE"},
		{"cas order entry", "NSE", 15, 22, true, "CAS_ORDER_ENTRY"},
		{"cas random close", "NSE", 15, 27, true, "CAS_RANDOM_CLOSE"},
		{"cas matching", "NSE", 15, 32, true, "CAS_MATCHING"},
		{"non cas close", "NSE", 15, 32, false, "CLOSED"},
		{"fno extended", "NFO", 15, 35, false, "FNO_EXTENDED"},
		{"fno closed", "NFO", 15, 41, false, "CLOSED"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := marketSessionPhase(istTime(t, tc.hour, tc.minute), tc.exchange, tc.cas, loc)
			if got != tc.want {
				t.Fatalf("got %q want %q", got, tc.want)
			}
		})
	}
}
