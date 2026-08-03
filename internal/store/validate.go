package store

import (
	"context"
	"fmt"
	"strings"
	"time"
)

func (s *Store) ValidateSchema(ctx context.Context) error {
	var missing []string
	requiredTables := []string{
		"instruments",
		"universe_underlyings",
		"subscriptions",
		"derivative_token_plan",
		"index_constituents",
		"symbol_perf_snapshot",
		"bars_1m",
		"bars_1d",
		"quote_snapshots",
		"depth_5_snapshots",
		"oi_snapshots_equity",
		"oi_snapshots_index",
		"oi_snapshots_futures",
		"oi_snapshots_options",
		"pcr_snapshots",
		"gainers_losers_snapshots",
		"oibuildup_snapshots",
		"putcallratio_snapshots",
		"option_greeks",
		"equilibrium_mean_series",
		"equilibrium_strike_snapshot",
		"equilibrium_summary",
		"equilibrium_current_snapshot",
		"max_pain_runs",
		"max_pain_levels",
		"max_pain_summary",
		"strategy_runs",
		"strategy_state",
		"strategy_parameters",
		"strategy_parameter_history",
		"strategy_cooldowns",
		"strategy_signals",
		"paper_orders",
		"paper_trades",
		"paper_positions",
		"watermarks",
		"daily_close_position",
		"a02_backtest_runs",
		"a02_backtest_results",
		"a02_backtest_daily_stats",
		"a02_backtest_live_signals",
		"a02_backtest_live_status",
		"a02_backtest_live_stream",
		"a02_archive_swing_runs",
		"a02_archive_swing_results",
		"a02_archive_swing_daily_stats",
		"strategy_backtest_runs",
		"strategy_backtest_trades",
		"strategy_backtest_equity",
		"option_backtest_runs",
		"option_backtest_trades",
		"portfolio_positions",
	}
	for _, table := range requiredTables {
		ok, err := s.tableExists(ctx, table)
		if err != nil {
			return err
		}
		if !ok {
			missing = append(missing, "table:"+table)
		}
	}
	requiredColumns := []struct {
		table  string
		column string
	}{
		{table: "subscriptions", column: "instrumenttype"},
		{table: "subscriptions", column: "underlying"},
		{table: "subscriptions", column: "expiry"},
		{table: "subscriptions", column: "strike"},
		{table: "subscriptions", column: "right"},
		{table: "subscriptions", column: "priority"},
		{table: "bars_1m", column: "oi"},
	}
	for _, col := range requiredColumns {
		ok, err := s.columnExists(ctx, col.table, col.column)
		if err != nil {
			return err
		}
		if !ok {
			missing = append(missing, fmt.Sprintf("column:%s.%s", col.table, col.column))
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("schema validation failed: %s", strings.Join(missing, ", "))
	}
	return nil
}

func (s *Store) tableExists(ctx context.Context, table string) (bool, error) {
	query := `
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = $1 AND table_name = $2
)`
	start := time.Now()
	var exists bool
	err := s.Pool.QueryRow(ctx, query, s.Schema, table).Scan(&exists)
	s.logQuery("validate_table_"+table, start, 2, err)
	return exists, err
}

func (s *Store) columnExists(ctx context.Context, table, column string) (bool, error) {
	query := `
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
)`
	start := time.Now()
	var exists bool
	err := s.Pool.QueryRow(ctx, query, s.Schema, table, column).Scan(&exists)
	s.logQuery("validate_column_"+table+"_"+column, start, 3, err)
	return exists, err
}
