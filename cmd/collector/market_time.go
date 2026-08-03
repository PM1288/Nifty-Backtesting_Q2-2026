package main

import "time"

func outsideMarketHours(now time.Time, tradingStart, tradingEnd string, loc *time.Location) bool {
	now = now.In(defaultLoc(loc))
	if isWeekend(now) {
		return true
	}
	start, end, err := tradingWindow(now, tradingStart, tradingEnd, loc)
	if err != nil {
		return false
	}
	return now.Before(start) || now.After(end)
}

func lastWorkingDay(now time.Time, tradingStart, tradingEnd string, loc *time.Location) time.Time {
	now = now.In(defaultLoc(loc))
	if isWeekend(now) {
		return previousWeekday(now)
	}
	start, _, err := tradingWindow(now, tradingStart, tradingEnd, loc)
	if err == nil && now.Before(start) {
		return previousWeekday(now)
	}
	return now
}

func tradingWindow(now time.Time, tradingStart, tradingEnd string, loc *time.Location) (time.Time, time.Time, error) {
	loc = defaultLoc(loc)
	startParsed, err := time.ParseInLocation("15:04", tradingStart, loc)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	endParsed, err := time.ParseInLocation("15:04", tradingEnd, loc)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	start := time.Date(now.Year(), now.Month(), now.Day(), startParsed.Hour(), startParsed.Minute(), 0, 0, loc)
	end := time.Date(now.Year(), now.Month(), now.Day(), endParsed.Hour(), endParsed.Minute(), 0, 0, loc)
	return start, end, nil
}

func previousWeekday(now time.Time) time.Time {
	t := now.AddDate(0, 0, -1)
	for isWeekend(t) {
		t = t.AddDate(0, 0, -1)
	}
	return t
}

func isWeekend(now time.Time) bool {
	switch now.Weekday() {
	case time.Saturday, time.Sunday:
		return true
	default:
		return false
	}
}

func defaultLoc(loc *time.Location) *time.Location {
	if loc == nil {
		return time.UTC
	}
	return loc
}
