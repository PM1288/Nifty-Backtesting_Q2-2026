package watchlist

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"trading-stack/internal/store"
)

type backtestSummaryResponse struct {
	Summary store.BacktestRangeSummary `json:"summary"`
}

func (s *Service) handleBacktestSummary(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, fmt.Errorf("method not allowed"))
		return
	}
	startDate, endDate, err := parseBacktestSummaryRange(r, s.loc)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	summary, err := s.store.FetchBacktestRangeSummary(r.Context(), startDate, endDate)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, backtestSummaryResponse{Summary: summary})
}

func parseBacktestSummaryRange(r *http.Request, loc *time.Location) (time.Time, time.Time, error) {
	if loc == nil {
		loc = time.UTC
	}
	now := time.Now()
	now = now.In(loc)
	endDate := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	days := 15

	if q := strings.TrimSpace(r.URL.Query().Get("days")); q != "" {
		v, err := strconv.Atoi(q)
		if err != nil || v <= 0 {
			return time.Time{}, time.Time{}, fmt.Errorf("invalid days value")
		}
		days = v
	}
	if q := strings.TrimSpace(r.URL.Query().Get("end")); q != "" {
		dt, err := time.ParseInLocation("2006-01-02", q, loc)
		if err != nil {
			return time.Time{}, time.Time{}, fmt.Errorf("invalid end date")
		}
		endDate = time.Date(dt.Year(), dt.Month(), dt.Day(), 0, 0, 0, 0, time.UTC)
	}
	startDate := endDate.AddDate(0, 0, -(days - 1))
	if q := strings.TrimSpace(r.URL.Query().Get("start")); q != "" {
		dt, err := time.ParseInLocation("2006-01-02", q, loc)
		if err != nil {
			return time.Time{}, time.Time{}, fmt.Errorf("invalid start date")
		}
		startDate = time.Date(dt.Year(), dt.Month(), dt.Day(), 0, 0, 0, 0, time.UTC)
	}
	if endDate.Before(startDate) {
		startDate, endDate = endDate, startDate
	}
	return startDate, endDate, nil
}
