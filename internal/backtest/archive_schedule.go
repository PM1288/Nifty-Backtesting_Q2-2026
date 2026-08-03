package backtest

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"trading-stack/internal/universe"
)

func (r *Runner) runArchiveLoop(ctx context.Context) error {
	archiveCfg := r.cfg.Backtest.Archive
	if archiveCfg.RunOnStart {
		if err := r.runArchiveOnce(ctx, time.Now().In(r.loc)); err != nil && r.logger != nil {
			r.logger.Warn("archive_backtest_start_failed", "err", err)
		}
	}

	for {
		now := time.Now().In(r.loc)
		next := nextRunTime(now, archiveCfg.RunTimeIST, r.cfg.Backtest.SkipWeekends, r.loc)
		if r.logger != nil {
			r.logger.Info("archive_backtest_wait", "next", next)
		}
		if err := sleepUntil(ctx, next); err != nil {
			return err
		}
		if err := r.runArchiveOnce(ctx, time.Now().In(r.loc)); err != nil && r.logger != nil {
			r.logger.Warn("archive_backtest_failed", "err", err)
		}
	}
}

func (r *Runner) runArchiveOnce(ctx context.Context, now time.Time) error {
	archiveCfg := r.cfg.Backtest.Archive
	opts := ArchiveOptions{
		Root:     archiveCfg.Root,
		Exchange: strings.TrimSpace(archiveCfg.Exchange),
		RunID:    fmt.Sprintf("archive-%s", now.In(r.loc).Format("20060102-150405")),
	}

	if archiveCfg.StartDate != "" {
		start, err := time.ParseInLocation("2006-01-02", archiveCfg.StartDate, r.loc)
		if err != nil {
			return fmt.Errorf("archive start_date parse failed: %w", err)
		}
		opts.StartDate = &start
	}
	if archiveCfg.EndDate != "" {
		end, err := time.ParseInLocation("2006-01-02", archiveCfg.EndDate, r.loc)
		if err != nil {
			return fmt.Errorf("archive end_date parse failed: %w", err)
		}
		opts.EndDate = &end
	}

	symbols := normalizeArchiveSymbols(archiveCfg.Symbols)
	if len(symbols) == 0 {
		csvPath := strings.TrimSpace(archiveCfg.SymbolsCSVPath)
		if csvPath == "" {
			csvPath = strings.TrimSpace(r.cfg.Files.SymbolsCSVPath)
		}
		if csvPath != "" {
			loaded, err := universe.ParseSymbolsCSV(csvPath)
			if err != nil {
				return fmt.Errorf("archive symbols csv load failed: %w", err)
			}
			symbols = normalizeArchiveSymbols(loaded)
		}
	}
	if len(symbols) > 0 {
		opts.Symbols = symbols
	}

	log := r.logger
	if log == nil {
		log = slog.Default()
	}
	log.Info("archive_backtest_start", "run_id", opts.RunID, "root", opts.Root, "symbols", len(opts.Symbols))

	if archiveCfg.RunIntraday {
		if err := RunArchiveFromCSV(ctx, r.store, *r.cfg, opts, r.loc, log); err != nil {
			return err
		}
	}
	if archiveCfg.RunSwing {
		if err := RunArchiveSwingFromCSV(ctx, r.store, *r.cfg, opts, r.cfg.Backtest.Swing, r.loc, log); err != nil {
			return err
		}
	}

	log.Info("archive_backtest_complete", "run_id", opts.RunID)
	return nil
}

func normalizeArchiveSymbols(symbols []string) []string {
	if len(symbols) == 0 {
		return nil
	}
	seen := map[string]struct{}{}
	out := make([]string, 0, len(symbols))
	for _, sym := range symbols {
		clean := strings.ToUpper(strings.TrimSpace(sym))
		if clean == "" {
			continue
		}
		if _, ok := seen[clean]; ok {
			continue
		}
		seen[clean] = struct{}{}
		out = append(out, clean)
	}
	return out
}
