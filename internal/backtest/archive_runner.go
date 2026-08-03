package backtest

import (
	"bufio"
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"trading-stack/internal/config"
	"trading-stack/internal/store"
)

// ArchiveOptions controls a one-off archive backtest using local CSV minute bars.
// When invoked, results are persisted to the standard A02 tables.
type ArchiveOptions struct {
	Root      string
	Exchange  string
	Symbols   []string
	StartDate *time.Time
	EndDate   *time.Time
	RunID     string
}

type archiveSymbol struct {
	instrument Instrument
	barsByDate map[string][]minuteBar // keyed by YYYY-MM-DD in loc
	closes     []dailyClose           // daily closes across all dates
}

// RunArchiveFromCSV executes A02 against local minute-bar CSVs ( *_minute.csv ).
// It mirrors the old Python standalone runner but persists to Postgres directly.
func RunArchiveFromCSV(ctx context.Context, st *store.Store, cfg config.Config, opts ArchiveOptions, loc *time.Location, logger *slog.Logger) error {
	if opts.Root == "" {
		return errors.New("archive root is required")
	}
	root := filepath.Clean(opts.Root)
	symbols := opts.Symbols
	if len(symbols) == 0 {
		discovered, err := discoverArchiveSymbols(root)
		if err != nil {
			return err
		}
		symbols = discovered
	}
	if len(symbols) == 0 {
		return fmt.Errorf("no symbols discovered under %s", root)
	}

	exchange := opts.Exchange
	if exchange == "" {
		exchange = cfg.Portfolio.DefaultExchange
		if exchange == "" {
			exchange = cfg.Watchlist.Exchange
		}
	}

	runID := opts.RunID
	if runID == "" {
		runID = fmt.Sprintf("archive-%s", time.Now().Format("20060102-150405"))
	}

	if logger != nil {
		logger.Info("archive_run_start", "root", root, "symbols", len(symbols), "exchange", exchange, "run_id", runID)
	}

	symbolData := make([]archiveSymbol, 0, len(symbols))
	tradeDates := map[string]time.Time{}

	for _, sym := range symbols {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		data, err := loadArchiveSymbol(ctx, st, exchange, sym, root, loc, logger)
		if err != nil {
			return err
		}
		symbolData = append(symbolData, data)
		for key := range data.barsByDate {
			dt, err := time.ParseInLocation("2006-01-02", key, loc)
			if err != nil {
				continue
			}
			if opts.StartDate != nil && dt.Before(truncateDate(*opts.StartDate, loc)) {
				continue
			}
			if opts.EndDate != nil && dt.After(truncateDate(*opts.EndDate, loc)) {
				continue
			}
			tradeDates[key] = dt
		}
	}

	if len(tradeDates) == 0 {
		return errors.New("no trade dates found in archive range")
	}

	sortedDates := make([]time.Time, 0, len(tradeDates))
	for _, dt := range tradeDates {
		sortedDates = append(sortedDates, dt)
	}
	sort.Slice(sortedDates, func(i, j int) bool { return sortedDates[i].Before(sortedDates[j]) })

	for _, tradeDate := range sortedDates {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		bars := make(map[string][]minuteBar)
		percentiles := make(map[string]float64)
		instruments := make([]Instrument, 0, len(symbolData))
		dateKey := tradeDate.In(loc).Format("2006-01-02")

		for _, data := range symbolData {
			instruments = append(instruments, data.instrument)

			dayBars, ok := data.barsByDate[dateKey]
			if ok {
				bars[data.instrument.SymbolToken] = dayBars
			}

			closes := closesUpToDate(data.closes, tradeDate, loc)
			if len(closes) == 0 {
				continue
			}
			metrics := computeDailyMetrics(closes)
			percentiles[data.instrument.SymbolToken] = metrics.Percentile
		}

		if logger != nil {
			logger.Info("archive_run_date", "trade_date", dateKey, "symbols", len(instruments))
		}
		result, err := RunA02WithBars(ctx, st, cfg, tradeDate, instruments, bars, percentiles, loc)
		if err != nil {
			return err
		}
		if logger != nil {
			logger.Info("archive_run_persisted", "trade_date", dateKey, "trades", len(result.Trades), "symbols_with_trades", result.SymbolsWithTrades)
		}
	}

	if logger != nil {
		logger.Info("archive_run_complete", "run_id", runID)
	}
	return nil
}

func discoverArchiveSymbols(root string) ([]string, error) {
	pattern := filepath.Join(root, "*_minute.csv")
	matches, err := filepath.Glob(pattern)
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(matches))
	for _, path := range matches {
		base := filepath.Base(path)
		base = strings.TrimSuffix(base, filepath.Ext(base))
		base = strings.TrimSuffix(base, "_minute")
		if base != "" {
			out = append(out, strings.ToUpper(base))
		}
	}
	return out, nil
}

func loadArchiveSymbol(ctx context.Context, st *store.Store, exchange, symbol, root string, loc *time.Location, logger *slog.Logger) (archiveSymbol, error) {
	lookup, err := st.ResolveEquityToken(ctx, exchange, symbol)
	if err != nil {
		return archiveSymbol{}, fmt.Errorf("resolve token %s:%s: %w", exchange, symbol, err)
	}
	filePath := filepath.Join(root, fmt.Sprintf("%s_minute.csv", strings.ToUpper(symbol)))
	file, err := os.Open(filePath)
	if err != nil {
		return archiveSymbol{}, fmt.Errorf("open %s: %w", filePath, err)
	}
	defer file.Close()

	reader := csv.NewReader(bufio.NewReader(file))
	reader.TrimLeadingSpace = true

	headers, err := reader.Read()
	if err != nil {
		return archiveSymbol{}, fmt.Errorf("read header %s: %w", filePath, err)
	}
	headerIdx := map[string]int{}
	for idx, h := range headers {
		headerIdx[strings.ToLower(strings.TrimSpace(h))] = idx
	}

	timeIdx, ok := headerIdx["datetime"]
	if !ok {
		if idx, alt := headerIdx["timestamp"]; alt {
			timeIdx = idx
		} else if idx, alt := headerIdx["date"]; alt {
			timeIdx = idx
		} else {
			return archiveSymbol{}, fmt.Errorf("datetime column not found in %s", filePath)
		}
	}
	openIdx, ok := headerIdx["open"]
	if !ok {
		return archiveSymbol{}, fmt.Errorf("open column missing in %s", filePath)
	}
	highIdx, ok := headerIdx["high"]
	if !ok {
		return archiveSymbol{}, fmt.Errorf("high column missing in %s", filePath)
	}
	lowIdx, ok := headerIdx["low"]
	if !ok {
		return archiveSymbol{}, fmt.Errorf("low column missing in %s", filePath)
	}
	closeIdx, ok := headerIdx["close"]
	if !ok {
		return archiveSymbol{}, fmt.Errorf("close column missing in %s", filePath)
	}
	volumeIdx, volumePresent := headerIdx["volume"]

	barsByDate := make(map[string][]minuteBar)

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			if errors.Is(err, csv.ErrFieldCount) {
				continue
			}
			return archiveSymbol{}, fmt.Errorf("read row %s: %w", filePath, err)
		}
		if ctx.Err() != nil {
			return archiveSymbol{}, ctx.Err()
		}
		ts, err := parseArchiveTime(record[timeIdx], loc)
		if err != nil {
			continue
		}

		bar := minuteBar{
			Ts:    ts,
			Open:  parseFloat(record[openIdx]),
			High:  parseFloat(record[highIdx]),
			Low:   parseFloat(record[lowIdx]),
			Close: parseFloat(record[closeIdx]),
		}
		if volumePresent {
			bar.Volume = int64(parseFloat(record[volumeIdx]))
		}

		key := ts.In(loc).Format("2006-01-02")
		bars := barsByDate[key]
		bars = append(bars, bar)
		barsByDate[key] = bars
	}

	closes := make([]dailyClose, 0, len(barsByDate))
	for key, list := range barsByDate {
		sort.Slice(list, func(i, j int) bool { return list[i].Ts.Before(list[j].Ts) })
		barsByDate[key] = list
		day := list[len(list)-1]
		dt, _ := time.ParseInLocation("2006-01-02", key, loc)
		closes = append(closes, dailyClose{TradeDate: dt, Close: day.Close})
	}
	sort.Slice(closes, func(i, j int) bool { return closes[i].TradeDate.Before(closes[j].TradeDate) })

	if logger != nil {
		logger.Info("archive_symbol_loaded", "symbol", symbol, "dates", len(barsByDate), "path", filePath)
	}

	return archiveSymbol{
		instrument: Instrument{
			Exchange:      lookup.Exchange,
			SymbolToken:   lookup.SymbolToken,
			Symbol:        symbol,
			TradingSymbol: lookup.TradingSymbol,
		},
		barsByDate: barsByDate,
		closes:     closes,
	}, nil
}

func parseArchiveTime(value string, loc *time.Location) (time.Time, error) {
	trimmed := strings.TrimSpace(value)
	layouts := []string{
		"2006-01-02 15:04:05",
		"2006-01-02 15:04",
		time.RFC3339,
		"02-01-2006 15:04:05",
		"02-01-2006 15:04",
		"2006/01/02 15:04:05",
		"2006/01/02 15:04",
	}
	for _, layout := range layouts {
		if ts, err := time.ParseInLocation(layout, trimmed, loc); err == nil {
			return ts, nil
		}
	}
	return time.Time{}, fmt.Errorf("unable to parse time: %s", value)
}

func parseFloat(value string) float64 {
	out, _ := strconv.ParseFloat(strings.TrimSpace(value), 64)
	return out
}

func closesUpToDate(closes []dailyClose, tradeDate time.Time, loc *time.Location) []dailyClose {
	truncated := truncateDate(tradeDate, loc)
	out := make([]dailyClose, 0, len(closes))
	for _, row := range closes {
		if truncateDate(row.TradeDate, loc).After(truncated) {
			break
		}
		out = append(out, row)
	}
	return out
}

func truncateDate(dt time.Time, loc *time.Location) time.Time {
	local := dt.In(loc)
	return time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, loc)
}
