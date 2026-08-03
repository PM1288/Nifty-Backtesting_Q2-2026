package backtest

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

type HistoricalRunSummary struct {
	StartDate      time.Time
	EndDate        time.Time
	DaysAttempted  int
	DaysExecuted   int
	StockRunCount  int
	StockTrades    int
	StockWins      int
	StockWinRate   float64
	StockNetPnL    float64
	OptionRunCount int
	OptionTrades   int
	OptionWins     int
	OptionWinRate  float64
	OptionNetPnL   float64
}

func (r *Runner) RunDailyForDate(ctx context.Context, tradeDate time.Time) error {
	localDate := time.Date(tradeDate.In(r.loc).Year(), tradeDate.In(r.loc).Month(), tradeDate.In(r.loc).Day(), 0, 0, 0, 0, r.loc)
	return r.runDailyForDate(ctx, localDate)
}

func (r *Runner) RunHistoricalRange(ctx context.Context, startDate, endDate time.Time) (HistoricalRunSummary, error) {
	start := time.Date(startDate.In(r.loc).Year(), startDate.In(r.loc).Month(), startDate.In(r.loc).Day(), 0, 0, 0, 0, r.loc)
	end := time.Date(endDate.In(r.loc).Year(), endDate.In(r.loc).Month(), endDate.In(r.loc).Day(), 0, 0, 0, 0, r.loc)
	if end.Before(start) {
		return HistoricalRunSummary{}, fmt.Errorf("historical backtest end date before start date")
	}

	summary := HistoricalRunSummary{StartDate: start, EndDate: end}
	runStarted := time.Now().UTC()
	originalEODAlerts := r.eodAlerts
	r.eodAlerts = nil
	defer func() { r.eodAlerts = originalEODAlerts }()
	for day := start; !day.After(end); day = day.AddDate(0, 0, 1) {
		summary.DaysAttempted++
		runDay, err := r.shouldRunDate(ctx, day)
		if err != nil {
			return summary, err
		}
		if !runDay {
			continue
		}
		if err := r.runDailyForDate(ctx, day); err != nil {
			return summary, err
		}
		summary.DaysExecuted++
	}
	if err := r.populateHistoricalSummary(ctx, &summary, runStarted); err != nil {
		return summary, err
	}
	r.sendHistoricalSummaryAlert(ctx, summary)
	return summary, nil
}

func (r *Runner) shouldRunDate(ctx context.Context, day time.Time) (bool, error) {
	localDay := day.In(r.loc)
	if r.cfg.Backtest.SkipWeekends {
		if localDay.Weekday() == time.Saturday || localDay.Weekday() == time.Sunday {
			return false, nil
		}
	}
	if !r.cfg.Backtest.UseTradingCalendar {
		return true, nil
	}
	query := fmt.Sprintf(`SELECT is_trading_day FROM %s WHERE trade_date = $1`, pgx.Identifier{r.store.Schema, "trading_calendar"}.Sanitize())
	var isTrading bool
	err := r.store.Pool.QueryRow(ctx, query, time.Date(localDay.Year(), localDay.Month(), localDay.Day(), 0, 0, 0, 0, time.UTC)).Scan(&isTrading)
	if err != nil {
		if err == pgx.ErrNoRows {
			if localDay.Weekday() == time.Saturday || localDay.Weekday() == time.Sunday {
				return false, nil
			}
			return true, nil
		}
		return false, err
	}
	return isTrading, nil
}

func (r *Runner) populateHistoricalSummary(ctx context.Context, summary *HistoricalRunSummary, runStarted time.Time) error {
	if summary == nil {
		return nil
	}
	startUTC := time.Date(summary.StartDate.Year(), summary.StartDate.Month(), summary.StartDate.Day(), 0, 0, 0, 0, time.UTC)
	endUTC := time.Date(summary.EndDate.Year(), summary.EndDate.Month(), summary.EndDate.Day(), 0, 0, 0, 0, time.UTC)

	stockQuery := fmt.Sprintf(`WITH latest AS (
  SELECT DISTINCT ON (trade_date)
    trade_date,
    total_trades,
    wins,
    total_net_profit
  FROM %s
  WHERE trade_date >= $1 AND trade_date <= $2
    AND created_at >= $3
  ORDER BY trade_date, run_id DESC
)
SELECT COALESCE(count(*),0), COALESCE(sum(total_trades),0), COALESCE(sum(wins),0), COALESCE(sum(total_net_profit),0)
FROM latest`, pgx.Identifier{r.store.Schema, "a02_backtest_runs"}.Sanitize())
	if err := r.store.Pool.QueryRow(ctx, stockQuery, startUTC, endUTC, runStarted).Scan(&summary.StockRunCount, &summary.StockTrades, &summary.StockWins, &summary.StockNetPnL); err != nil {
		return err
	}
	if summary.StockTrades > 0 {
		summary.StockWinRate = float64(summary.StockWins) / float64(summary.StockTrades) * 100
	}

	optionQuery := fmt.Sprintf(`WITH latest AS (
  SELECT DISTINCT ON (trade_date)
    trade_date,
    total_trades,
    wins,
    total_pnl
  FROM %s
  WHERE trade_date >= $1 AND trade_date <= $2
    AND COALESCE(started_at, finished_at) >= $3
  ORDER BY trade_date, COALESCE(finished_at, started_at) DESC NULLS LAST, run_id DESC
)
SELECT COALESCE(count(*),0), COALESCE(sum(total_trades),0), COALESCE(sum(wins),0), COALESCE(sum(total_pnl),0)
FROM latest`, pgx.Identifier{r.store.Schema, "option_backtest_runs"}.Sanitize())
	if err := r.store.Pool.QueryRow(ctx, optionQuery, startUTC, endUTC, runStarted).Scan(&summary.OptionRunCount, &summary.OptionTrades, &summary.OptionWins, &summary.OptionNetPnL); err != nil {
		return err
	}
	if summary.OptionTrades > 0 {
		summary.OptionWinRate = float64(summary.OptionWins) / float64(summary.OptionTrades) * 100
	}
	return nil
}

func (r *Runner) sendHistoricalSummaryAlert(ctx context.Context, summary HistoricalRunSummary) {
	if r.eodAlerts == nil {
		return
	}
	msg := fmt.Sprintf("HISTORICAL %s..%s stock trades=%d win=%.1f%% net=%.2f | options trades=%d win=%.1f%% net=%.2f",
		summary.StartDate.In(r.loc).Format("2006-01-02"),
		summary.EndDate.In(r.loc).Format("2006-01-02"),
		summary.StockTrades,
		summary.StockWinRate,
		summary.StockNetPnL,
		summary.OptionTrades,
		summary.OptionWinRate,
		summary.OptionNetPnL,
	)
	_ = r.eodAlerts.Send(ctx, r.cfg.Backtest.Alerts.TitlePrefix+" history", msg)
}
