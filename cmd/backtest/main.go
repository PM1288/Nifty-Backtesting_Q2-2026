package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"trading-stack/internal/backtest"
	"trading-stack/internal/config"
	"trading-stack/internal/logging"
	"trading-stack/internal/store"
)

func main() {
	configPath := flag.String("config", "/app/config.yaml", "Path to config file")
	dbMigrateOnly := flag.Bool("db-migrate-only", false, "Run migrations and exit")
	dbValidateOnly := flag.Bool("db-validate-only", false, "Validate schema and exit")
	archiveRun := flag.Bool("archive", false, "Run one-off archive backtest from local CSVs and exit")
	archiveSwing := flag.Bool("archive-swing", false, "Run archive swing backtest from local CSVs and exit")
	archiveRoot := flag.String("archive-root", "", "Root directory containing *_minute.csv files")
	archiveExchange := flag.String("archive-exchange", "", "Exchange for archive symbols (defaults to runtime.exchange)")
	archiveSymbols := flag.String("archive-symbols", "", "Comma-separated symbol list to limit archive run")
	archiveStart := flag.String("archive-start", "", "Archive start date (YYYY-MM-DD)")
	archiveEnd := flag.String("archive-end", "", "Archive end date (YYYY-MM-DD)")
	archiveRunID := flag.String("archive-run-id", "", "Override archive run id")
	runOnce := flag.Bool("run-once", false, "Run full daily backtest pipeline once and exit")
	runDate := flag.String("run-date", "", "Backtest date for --run-once (YYYY-MM-DD)")
	historyDays := flag.Int("history-days", 0, "Run full daily backtest pipeline for last N calendar days and exit")
	historyStart := flag.String("history-start", "", "Historical backtest start date (YYYY-MM-DD)")
	historyEnd := flag.String("history-end", "", "Historical backtest end date (YYYY-MM-DD)")
	strategyRunOnce := flag.Bool("strategy-run-once", false, "Run strategy backtest once and exit")
	strategyDate := flag.String("strategy-date", "", "Strategy backtest date (YYYY-MM-DD)")
	flag.Parse()

	cfg, err := config.Load(*configPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "config load failed: %v\n", err)
		os.Exit(1)
	}

	runtimeCfg := cfg.Runtime
	runtimeCfg.ServiceName = "backtest"
	baseLogger := logging.New(runtimeCfg)
	logger := logging.WithModule(baseLogger, "main")

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	loc, err := time.LoadLocation(cfg.Runtime.Timezone)
	if err != nil {
		logger.Error("timezone load failed", "err", err)
		os.Exit(1)
	}

	st, err := store.New(ctx, cfg.Postgres, baseLogger)
	if err != nil {
		logger.Error("postgres init failed", "err", err)
		os.Exit(1)
	}
	defer st.Close()

	if *dbMigrateOnly {
		if err := st.Migrate(ctx); err != nil {
			logger.Error("migration failed", "err", err)
			os.Exit(1)
		}
		logger.Info("migration complete")
		return
	}
	if *dbValidateOnly {
		if err := st.ValidateSchema(ctx); err != nil {
			logger.Error("schema validation failed", "err", err)
			os.Exit(1)
		}
		logger.Info("schema validation complete")
		return
	}

	if err := st.Migrate(ctx); err != nil {
		logger.Error("migration failed", "err", err)
		os.Exit(1)
	}

	if *archiveRun || *archiveSwing {
		opts := backtest.ArchiveOptions{
			Root:     *archiveRoot,
			Exchange: *archiveExchange,
			RunID:    *archiveRunID,
		}
		if trimmed := strings.TrimSpace(*archiveSymbols); trimmed != "" {
			split := strings.Split(trimmed, ",")
			for _, s := range split {
				clean := strings.TrimSpace(s)
				if clean != "" {
					opts.Symbols = append(opts.Symbols, clean)
				}
			}
		}
		if dt := parseDate(*archiveStart, loc); dt != nil {
			opts.StartDate = dt
		}
		if dt := parseDate(*archiveEnd, loc); dt != nil {
			opts.EndDate = dt
		}
		if *archiveRun {
			if err := backtest.RunArchiveFromCSV(ctx, st, *cfg, opts, loc, logger); err != nil {
				logger.Error("archive run failed", "err", err)
				os.Exit(1)
			}
			logger.Info("archive run complete")
		}
		if *archiveSwing {
			if err := backtest.RunArchiveSwingFromCSV(ctx, st, *cfg, opts, cfg.Backtest.Swing, loc, logger); err != nil {
				logger.Error("archive swing run failed", "err", err)
				os.Exit(1)
			}
			logger.Info("archive swing run complete")
		}
		return
	}

	runner := backtest.NewRunner(cfg, st, baseLogger, loc)
	if *runOnce {
		tradeDate := time.Now().In(loc)
		if dt := parseDate(*runDate, loc); dt != nil {
			tradeDate = *dt
		} else {
			resolved, err := runner.ResolveTradeDate(ctx, tradeDate)
			if err != nil {
				logger.Error("backtest trade date resolve failed", "err", err)
				os.Exit(1)
			}
			tradeDate = resolved
		}
		if err := runner.RunDailyForDate(ctx, tradeDate); err != nil {
			logger.Error("backtest run failed", "err", err)
			os.Exit(1)
		}
		logger.Info("backtest run complete", "trade_date", tradeDate.Format("2006-01-02"))
		return
	}
	if *historyDays > 0 || strings.TrimSpace(*historyStart) != "" || strings.TrimSpace(*historyEnd) != "" {
		endDate := time.Now().In(loc)
		if dt := parseDate(*historyEnd, loc); dt != nil {
			endDate = *dt
		}
		startDate := endDate
		if *historyDays > 0 {
			startDate = endDate.AddDate(0, 0, -(*historyDays - 1))
		}
		if dt := parseDate(*historyStart, loc); dt != nil {
			startDate = *dt
		}
		summary, err := runner.RunHistoricalRange(ctx, startDate, endDate)
		if err != nil {
			logger.Error("historical backtest run failed", "err", err)
			os.Exit(1)
		}
		logger.Info("historical backtest complete",
			"start", summary.StartDate.Format("2006-01-02"),
			"end", summary.EndDate.Format("2006-01-02"),
			"days_attempted", summary.DaysAttempted,
			"days_executed", summary.DaysExecuted,
			"stock_runs", summary.StockRunCount,
			"stock_trades", summary.StockTrades,
			"stock_win_rate", summary.StockWinRate,
			"stock_net_pnl", summary.StockNetPnL,
			"option_runs", summary.OptionRunCount,
			"option_trades", summary.OptionTrades,
			"option_win_rate", summary.OptionWinRate,
			"option_net_pnl", summary.OptionNetPnL,
		)
		return
	}
	if *strategyRunOnce {
		tradeDate := time.Now().In(loc)
		if dt := parseDate(*strategyDate, loc); dt != nil {
			tradeDate = *dt
		} else {
			resolved, err := runner.ResolveTradeDate(ctx, tradeDate)
			if err != nil {
				logger.Error("strategy trade date resolve failed", "err", err)
				os.Exit(1)
			}
			tradeDate = resolved
		}
		if err := runner.RunStrategyOnce(ctx, tradeDate); err != nil {
			logger.Error("strategy backtest run failed", "err", err)
			os.Exit(1)
		}
		logger.Info("strategy backtest run complete", "trade_date", tradeDate)
		return
	}
	if err := runner.Run(ctx); err != nil && ctx.Err() == nil {
		logger.Error("backtest runner exited", "err", err)
		os.Exit(1)
	}
}

func parseDate(value string, loc *time.Location) *time.Time {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	dt, err := time.ParseInLocation("2006-01-02", trimmed, loc)
	if err != nil {
		return nil
	}
	return &dt
}
