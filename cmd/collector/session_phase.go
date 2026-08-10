package main

import (
	"strings"
	"time"

	"trading-stack/internal/instruments"
)

func buildCASEligibilityIndex(rows []instruments.Instrument) map[string]bool {
	result := make(map[string]bool)
	for _, row := range rows {
		if row.IsCASEnabled != nil && *row.IsCASEnabled {
			result[subKey(row.Exchange, row.SymbolToken)] = true
		}
	}
	return result
}

func marketSessionPhase(ts time.Time, exchange string, casEligible bool, loc *time.Location) string {
	if loc == nil {
		loc, _ = time.LoadLocation("Asia/Kolkata")
	}
	local := ts.In(loc)
	if local.Weekday() == time.Saturday || local.Weekday() == time.Sunday {
		return "CLOSED"
	}
	clock := local.Format("15:04:05")
	if clock < "09:15:00" {
		return "PREOPEN"
	}
	exchange = strings.ToUpper(strings.TrimSpace(exchange))
	if exchange == "NFO" || exchange == "BFO" {
		if clock <= "15:30:00" {
			return "REGULAR"
		}
		if clock <= "15:40:00" {
			return "FNO_EXTENDED"
		}
		return "CLOSED"
	}
	if !casEligible {
		if clock <= "15:30:00" {
			return "REGULAR"
		}
		if clock >= "15:50:00" && clock <= "16:00:00" {
			return "POST_CLOSE"
		}
		return "CLOSED"
	}
	switch {
	case clock < "15:15:00":
		return "REGULAR"
	case clock < "15:20:00":
		return "CAS_REFERENCE"
	case clock < "15:25:00":
		return "CAS_ORDER_ENTRY"
	case clock < "15:30:00":
		return "CAS_RANDOM_CLOSE"
	case clock < "15:35:00":
		return "CAS_MATCHING"
	case clock < "15:50:00":
		return "CAS_TRANSITION"
	case clock <= "16:00:00":
		return "POST_CLOSE"
	default:
		return "CLOSED"
	}
}
