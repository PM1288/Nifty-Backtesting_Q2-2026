package main

import (
	"testing"
	"time"
)

func TestCalendarVerifiedHolidayAndForwardRefreshWindow(t *testing.T) {
	loc, _ := time.LoadLocation("Asia/Kolkata")
	now := time.Date(2026, 9, 18, 12, 0, 0, 0, loc)
	days, err := buildTradingCalendar(now, "09:15", "15:30", loc, 0, 31)
	if err != nil || len(days) != 32 {
		t.Fatalf("calendar: %d %v", len(days), err)
	}
	for _, day := range days {
		if day.TradeDate.Format("2006-01-02") == "2026-10-02" && day.IsTradingDay {
			t.Fatal("official holiday marked open")
		}
		if day.MarketClose.In(loc).Format("15:04") != "15:30" {
			t.Fatal("collector post-close capture window is not the cash close")
		}
	}
	days, err = buildTradingCalendar(time.Date(2027, 1, 4, 0, 0, 0, 0, loc), "09:15", "15:30", loc, 0, 7)
	if err != nil || len(days) != 0 {
		t.Fatal("unverified future calendar must not be generated")
	}
}
