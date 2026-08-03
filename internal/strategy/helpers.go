package strategy

import (
	"fmt"
	"strings"
	"time"

	"trading-stack/internal/config"
)

func outsideMarketHours(now time.Time, tradingStart, tradingEnd string, loc *time.Location) bool {
	start, end, err := tradingWindow(now, tradingStart, tradingEnd, loc)
	if err != nil {
		return false
	}
	return now.Before(start) || now.After(end)
}

func tradingWindow(now time.Time, tradingStart, tradingEnd string, loc *time.Location) (time.Time, time.Time, error) {
	startParsed, err := time.ParseInLocation("15:04", tradingStart, loc)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("invalid trading_start: %w", err)
	}
	endParsed, err := time.ParseInLocation("15:04", tradingEnd, loc)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("invalid trading_end: %w", err)
	}
	start := time.Date(now.Year(), now.Month(), now.Day(), startParsed.Hour(), startParsed.Minute(), 0, 0, loc)
	end := time.Date(now.Year(), now.Month(), now.Day(), endParsed.Hour(), endParsed.Minute(), 0, 0, loc)
	return start, end, nil
}

func eventDateAllowed(now time.Time, dates []string, loc *time.Location) bool {
	if len(dates) == 0 {
		return false
	}
	today := now.In(loc).Format("2006-01-02")
	for _, date := range dates {
		if strings.TrimSpace(date) == "" {
			continue
		}
		if strings.TrimSpace(date) == today {
			return true
		}
	}
	return false
}

func eventWindow(now time.Time, startStr, endStr string, loc *time.Location) (time.Time, time.Time, bool, error) {
	startStr = strings.TrimSpace(startStr)
	endStr = strings.TrimSpace(endStr)
	if startStr == "" || endStr == "" {
		return time.Time{}, time.Time{}, false, nil
	}
	startParsed, err := time.ParseInLocation("15:04", startStr, loc)
	if err != nil {
		return time.Time{}, time.Time{}, false, fmt.Errorf("invalid event start: %w", err)
	}
	endParsed, err := time.ParseInLocation("15:04", endStr, loc)
	if err != nil {
		return time.Time{}, time.Time{}, false, fmt.Errorf("invalid event end: %w", err)
	}
	local := now.In(loc)
	start := time.Date(local.Year(), local.Month(), local.Day(), startParsed.Hour(), startParsed.Minute(), 0, 0, loc)
	end := time.Date(local.Year(), local.Month(), local.Day(), endParsed.Hour(), endParsed.Minute(), 0, 0, loc)
	return start, end, true, nil
}

func eventStraddleFetchStart(now time.Time, cfg config.StrategyConfig, loc *time.Location) time.Time {
	tf := cfg.EventStraddleTimeframeMinutes
	if tf <= 0 {
		tf = 5
	}
	lookback := cfg.EventStraddleLookbackMinutes
	if lookback <= 0 {
		lookback = 60
	}
	minLookback := cfg.BBPeriod * tf
	if minLookback > lookback {
		lookback = minLookback
	}
	start := now.Add(-time.Duration(lookback) * time.Minute)
	return time.Date(start.Year(), start.Month(), start.Day(), start.Hour(), start.Minute(), 0, 0, loc)
}

func formatWindowTime(ts time.Time, enabled bool) string {
	if !enabled {
		return ""
	}
	return ts.Format("15:04")
}
