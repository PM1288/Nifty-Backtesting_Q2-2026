package store

import (
	"context"
	"fmt"
	"time"
)

type BacktestAggregate struct {
	RunDays int64   `json:"runDays"`
	Trades  int64   `json:"trades"`
	Wins    int64   `json:"wins"`
	Losses  int64   `json:"losses"`
	WinRate float64 `json:"winRate"`
	NetPnL  float64 `json:"netPnL"`
}

type BacktestSymbolSummary struct {
	Symbol  string  `json:"symbol"`
	Trades  int64   `json:"trades"`
	Wins    int64   `json:"wins"`
	Losses  int64   `json:"losses"`
	WinRate float64 `json:"winRate"`
	NetPnL  float64 `json:"netPnL"`
}

type BacktestCapitalSummary struct {
	Capital              float64 `json:"capital"`
	Trades               int64   `json:"trades"`
	IntradayHits         int64   `json:"intradayHits"`
	DeliveryHits         int64   `json:"deliveryHits"`
	IntradayHitRate      float64 `json:"intradayHitRate"`
	DeliveryHitRate      float64 `json:"deliveryHitRate"`
	AvgIntradayTargetPct float64 `json:"avgIntradayTargetPct"`
	AvgDeliveryTargetPct float64 `json:"avgDeliveryTargetPct"`
}

type BacktestOptionStrategySummary struct {
	Strategy       string  `json:"strategy"`
	Trades         int64   `json:"trades"`
	Wins           int64   `json:"wins"`
	Losses         int64   `json:"losses"`
	WinRate        float64 `json:"winRate"`
	TargetExits    int64   `json:"targetExits"`
	TargetExitRate float64 `json:"targetExitRate"`
	NetPnL         float64 `json:"netPnL"`
}

type BacktestRangeSummary struct {
	StartDate        time.Time                       `json:"startDate"`
	EndDate          time.Time                       `json:"endDate"`
	Equity           BacktestAggregate               `json:"equity"`
	Options          BacktestAggregate               `json:"options"`
	EquityBySymbol   []BacktestSymbolSummary         `json:"equityBySymbol"`
	EquityByCapital  []BacktestCapitalSummary        `json:"equityByCapital"`
	OptionsByTrigger []BacktestOptionStrategySummary `json:"optionsByTrigger"`
}

func (s *Store) FetchBacktestRangeSummary(ctx context.Context, startDate, endDate time.Time) (BacktestRangeSummary, error) {
	summary := BacktestRangeSummary{
		StartDate:        dateOnlyUTC(startDate),
		EndDate:          dateOnlyUTC(endDate),
		EquityBySymbol:   []BacktestSymbolSummary{},
		EquityByCapital:  []BacktestCapitalSummary{},
		OptionsByTrigger: []BacktestOptionStrategySummary{},
	}
	startUTC := dateOnlyUTC(startDate)
	endUTC := dateOnlyUTC(endDate)
	if endUTC.Before(startUTC) {
		startUTC, endUTC = endUTC, startUTC
		summary.StartDate = startUTC
		summary.EndDate = endUTC
	}

	equityAggQuery := fmt.Sprintf(`WITH latest_runs AS (
  SELECT DISTINCT ON (trade_date) run_id, trade_date
  FROM %s.a02_backtest_runs
  WHERE trade_date >= $1 AND trade_date <= $2
  ORDER BY trade_date, run_id DESC
)
SELECT COALESCE(count(*),0), COALESCE(sum(r.total_trades),0), COALESCE(sum(r.wins),0), COALESCE(sum(r.total_net_profit),0)
FROM latest_runs lr
JOIN %s.a02_backtest_runs r ON r.run_id = lr.run_id`, quoteIdent(s.Schema), quoteIdent(s.Schema))
	if err := s.Pool.QueryRow(ctx, equityAggQuery, startUTC, endUTC).Scan(&summary.Equity.RunDays, &summary.Equity.Trades, &summary.Equity.Wins, &summary.Equity.NetPnL); err != nil {
		return summary, err
	}
	summary.Equity.Losses = summary.Equity.Trades - summary.Equity.Wins
	if summary.Equity.Trades > 0 {
		summary.Equity.WinRate = (float64(summary.Equity.Wins) / float64(summary.Equity.Trades)) * 100
	}

	optionsAggQuery := fmt.Sprintf(`WITH latest_runs AS (
  SELECT DISTINCT ON (trade_date)
    trade_date, total_trades, wins, total_pnl
  FROM %s.option_backtest_runs
  WHERE trade_date >= $1 AND trade_date <= $2
  ORDER BY trade_date, COALESCE(finished_at, started_at) DESC NULLS LAST, run_id DESC
)
SELECT COALESCE(count(*),0), COALESCE(sum(total_trades),0), COALESCE(sum(wins),0), COALESCE(sum(total_pnl),0)
FROM latest_runs`, quoteIdent(s.Schema))
	if err := s.Pool.QueryRow(ctx, optionsAggQuery, startUTC, endUTC).Scan(&summary.Options.RunDays, &summary.Options.Trades, &summary.Options.Wins, &summary.Options.NetPnL); err != nil {
		return summary, err
	}
	summary.Options.Losses = summary.Options.Trades - summary.Options.Wins
	if summary.Options.Trades > 0 {
		summary.Options.WinRate = (float64(summary.Options.Wins) / float64(summary.Options.Trades)) * 100
	}

	equityBySymbolQuery := fmt.Sprintf(`WITH latest_runs AS (
  SELECT DISTINCT ON (trade_date) run_id
  FROM %s.a02_backtest_runs
  WHERE trade_date >= $1 AND trade_date <= $2
  ORDER BY trade_date, run_id DESC
)
SELECT COALESCE(NULLIF(trim(COALESCE(r.symbol, '')), ''), NULLIF(trim(COALESCE(r.tradingsymbol, '')), ''), r.symbol_token) AS symbol_name,
       COALESCE(count(*),0) AS trades,
       COALESCE(sum(CASE WHEN COALESCE(r.success, false) THEN 1 ELSE 0 END),0) AS wins,
       COALESCE(sum(COALESCE(r.net_profit, 0)),0) AS net_pnl
FROM %s.a02_backtest_results r
JOIN latest_runs lr ON lr.run_id = r.run_id
GROUP BY symbol_name
ORDER BY net_pnl DESC, symbol_name ASC`, quoteIdent(s.Schema), quoteIdent(s.Schema))
	rows, err := s.Pool.Query(ctx, equityBySymbolQuery, startUTC, endUTC)
	if err != nil {
		return summary, err
	}
	for rows.Next() {
		var row BacktestSymbolSummary
		if err := rows.Scan(&row.Symbol, &row.Trades, &row.Wins, &row.NetPnL); err != nil {
			rows.Close()
			return summary, err
		}
		row.Losses = row.Trades - row.Wins
		if row.Trades > 0 {
			row.WinRate = (float64(row.Wins) / float64(row.Trades)) * 100
		}
		summary.EquityBySymbol = append(summary.EquityBySymbol, row)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return summary, err
	}
	rows.Close()

	equityByCapitalQuery := fmt.Sprintf(`WITH latest_runs AS (
  SELECT DISTINCT ON (trade_date) run_id
  FROM %s.a02_backtest_runs
  WHERE trade_date >= $1 AND trade_date <= $2
  ORDER BY trade_date, run_id DESC
),
expanded AS (
  SELECT elem
  FROM %s.a02_backtest_results r
  JOIN latest_runs lr ON lr.run_id = r.run_id
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.raw->'capital_scenarios', '[]'::jsonb)) elem
)
SELECT (elem->>'capital')::numeric AS capital,
       COALESCE(count(*),0) AS trades,
       COALESCE(sum(CASE WHEN lower(COALESCE(elem->>'intraday_hit', 'false')) = 'true' THEN 1 ELSE 0 END),0) AS intraday_hits,
       COALESCE(sum(CASE WHEN lower(COALESCE(elem->>'delivery_close_hit', 'false')) = 'true' THEN 1 ELSE 0 END),0) AS delivery_hits,
       COALESCE(avg(NULLIF(elem->>'intraday_target_pct', '')::numeric),0) AS avg_intraday_target_pct,
       COALESCE(avg(NULLIF(elem->>'delivery_target_pct', '')::numeric),0) AS avg_delivery_target_pct
FROM expanded
WHERE NULLIF(elem->>'capital', '') IS NOT NULL
GROUP BY capital
ORDER BY capital ASC`, quoteIdent(s.Schema), quoteIdent(s.Schema))
	rows, err = s.Pool.Query(ctx, equityByCapitalQuery, startUTC, endUTC)
	if err != nil {
		return summary, err
	}
	for rows.Next() {
		var row BacktestCapitalSummary
		if err := rows.Scan(&row.Capital, &row.Trades, &row.IntradayHits, &row.DeliveryHits, &row.AvgIntradayTargetPct, &row.AvgDeliveryTargetPct); err != nil {
			rows.Close()
			return summary, err
		}
		if row.Trades > 0 {
			row.IntradayHitRate = (float64(row.IntradayHits) / float64(row.Trades)) * 100
			row.DeliveryHitRate = (float64(row.DeliveryHits) / float64(row.Trades)) * 100
		}
		summary.EquityByCapital = append(summary.EquityByCapital, row)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return summary, err
	}
	rows.Close()

	optionByStrategyQuery := fmt.Sprintf(`WITH latest_runs AS (
  SELECT DISTINCT ON (trade_date) run_id
  FROM %s.option_backtest_runs
  WHERE trade_date >= $1 AND trade_date <= $2
  ORDER BY trade_date, COALESCE(finished_at, started_at) DESC NULLS LAST, run_id DESC
)
SELECT COALESCE(NULLIF(trim(t.strategy), ''), 'unknown') AS strategy_name,
       COALESCE(count(*),0) AS trades,
       COALESCE(sum(CASE WHEN COALESCE(t.success, false) THEN 1 ELSE 0 END),0) AS wins,
       COALESCE(sum(COALESCE(t.pnl, 0)),0) AS net_pnl,
       COALESCE(sum(CASE WHEN lower(COALESCE(t.exit_reason, '')) = 'target' THEN 1 ELSE 0 END),0) AS target_exits
FROM %s.option_backtest_trades t
JOIN latest_runs lr ON lr.run_id = t.run_id
GROUP BY strategy_name
ORDER BY net_pnl DESC, strategy_name ASC`, quoteIdent(s.Schema), quoteIdent(s.Schema))
	rows, err = s.Pool.Query(ctx, optionByStrategyQuery, startUTC, endUTC)
	if err != nil {
		return summary, err
	}
	for rows.Next() {
		var row BacktestOptionStrategySummary
		if err := rows.Scan(&row.Strategy, &row.Trades, &row.Wins, &row.NetPnL, &row.TargetExits); err != nil {
			rows.Close()
			return summary, err
		}
		row.Losses = row.Trades - row.Wins
		if row.Trades > 0 {
			row.WinRate = (float64(row.Wins) / float64(row.Trades)) * 100
			row.TargetExitRate = (float64(row.TargetExits) / float64(row.Trades)) * 100
		}
		summary.OptionsByTrigger = append(summary.OptionsByTrigger, row)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return summary, err
	}
	rows.Close()

	return summary, nil
}

func dateOnlyUTC(value time.Time) time.Time {
	v := value.In(time.UTC)
	return time.Date(v.Year(), v.Month(), v.Day(), 0, 0, 0, 0, time.UTC)
}
