package util

import "time"

func MinuteStartUTC(ts time.Time, loc *time.Location) time.Time {
	if loc == nil {
		loc = time.UTC
	}
	local := ts.In(loc)
	truncated := time.Date(local.Year(), local.Month(), local.Day(), local.Hour(), local.Minute(), 0, 0, loc)
	return truncated.UTC()
}
