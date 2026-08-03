package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"sync"
	"time"
	"unicode"

	"trading-stack/internal/config"
	"trading-stack/internal/store"
)

type instrumentStateCache struct {
	mu      sync.Mutex
	entries map[string]store.InstrumentState
}

func newInstrumentStateCache() *instrumentStateCache {
	return &instrumentStateCache{
		mu:      sync.Mutex{},
		entries: make(map[string]store.InstrumentState),
	}
}

func (c *instrumentStateCache) Update(state store.InstrumentState) {
	state.Exchange = strings.ToUpper(strings.TrimSpace(state.Exchange))
	state.SymbolToken = strings.TrimSpace(state.SymbolToken)
	if state.Exchange == "" || state.SymbolToken == "" || state.LastSeen.IsZero() {
		return
	}
	key := state.Exchange + ":" + state.SymbolToken
	c.mu.Lock()
	if existing, ok := c.entries[key]; ok {
		if state.LastSeen.Before(existing.LastSeen) {
			state.LastSeen = existing.LastSeen
		}
		if state.LastPrice == nil {
			state.LastPrice = existing.LastPrice
		}
		if state.LastSource == "" {
			state.LastSource = existing.LastSource
		}
		state.LastBid = coalesceFloat(state.LastBid, existing.LastBid)
		state.LastAsk = coalesceFloat(state.LastAsk, existing.LastAsk)
		state.LastBidQty = coalesceInt(state.LastBidQty, existing.LastBidQty)
		state.LastAskQty = coalesceInt(state.LastAskQty, existing.LastAskQty)
		state.LastTradeQty = coalesceInt(state.LastTradeQty, existing.LastTradeQty)
		state.LastOpen = coalesceFloat(state.LastOpen, existing.LastOpen)
		state.LastHigh = coalesceFloat(state.LastHigh, existing.LastHigh)
		state.LastLow = coalesceFloat(state.LastLow, existing.LastLow)
		state.LastClose = coalesceFloat(state.LastClose, existing.LastClose)
		state.LastVolume = coalesceInt(state.LastVolume, existing.LastVolume)
		state.LastOI = coalesceInt(state.LastOI, existing.LastOI)
		state.LastOIChangePct = coalesceFloat(state.LastOIChangePct, existing.LastOIChangePct)
		state.TotalBuyQty = coalesceInt(state.TotalBuyQty, existing.TotalBuyQty)
		state.TotalSellQty = coalesceInt(state.TotalSellQty, existing.TotalSellQty)
		state.AvgPrice = coalesceFloat(state.AvgPrice, existing.AvgPrice)
		state.NetChange = coalesceFloat(state.NetChange, existing.NetChange)
		state.PercentChange = coalesceFloat(state.PercentChange, existing.PercentChange)
		state.UpperCircuit = coalesceFloat(state.UpperCircuit, existing.UpperCircuit)
		state.LowerCircuit = coalesceFloat(state.LowerCircuit, existing.LowerCircuit)
		state.Week52High = coalesceFloat(state.Week52High, existing.Week52High)
		state.Week52Low = coalesceFloat(state.Week52Low, existing.Week52Low)
	}
	c.entries[key] = state
	c.mu.Unlock()
}

func coalesceFloat(a, b *float64) *float64 {
	if a != nil {
		return a
	}
	return b
}

func coalesceInt(a, b *int64) *int64 {
	if a != nil {
		return a
	}
	return b
}

func (c *instrumentStateCache) Flush() []store.InstrumentState {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.entries) == 0 {
		return nil
	}
	out := make([]store.InstrumentState, 0, len(c.entries))
	for _, entry := range c.entries {
		out = append(out, entry)
	}
	c.entries = make(map[string]store.InstrumentState)
	return out
}

func runInstrumentStateFlush(ctx context.Context, cfg *config.Config, st *store.Store, cache *instrumentStateCache, logger *slog.Logger) error {
	if cfg == nil || !cfg.Metrics.Enable || cache == nil {
		return nil
	}
	interval := time.Duration(cfg.Metrics.StateFlushSeconds) * time.Second
	if interval <= 0 {
		interval = 5 * time.Second
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	flush := func() {
		states := cache.Flush()
		if len(states) == 0 {
			return
		}
		if err := st.UpsertInstrumentStates(ctx, states); err != nil && logger != nil {
			logger.Warn("instrument_state_flush_failed", "err", err)
		}
	}

	for {
		select {
		case <-ctx.Done():
			flush()
			return ctx.Err()
		case <-ticker.C:
			flush()
		}
	}
}

func buildInstrumentUniverseEntries(subs []store.Subscription) []store.InstrumentUniverseEntry {
	if len(subs) == 0 {
		return nil
	}
	entries := make([]store.InstrumentUniverseEntry, 0, len(subs))
	for _, sub := range subs {
		universeName := universeNameForSub(sub)
		meta := map[string]any{
			"kind":     strings.ToUpper(sub.Kind),
			"priority": sub.Priority,
			"reason":   sub.Reason,
		}
		encoded, _ := json.Marshal(meta)
		entry := store.InstrumentUniverseEntry{
			UniverseName:   universeName,
			Exchange:       strings.ToUpper(strings.TrimSpace(sub.Exchange)),
			SymbolToken:    strings.TrimSpace(sub.SymbolToken),
			TradingSymbol:  strings.TrimSpace(sub.TradingSymbol),
			Underlying:     strings.TrimSpace(sub.Underlying),
			Expiry:         sub.Expiry,
			Strike:         sub.Strike,
			Right:          strings.TrimSpace(sub.Right),
			InstrumentType: strings.TrimSpace(sub.InstrumentType),
			Metadata:       encoded,
		}
		if entry.UniverseName != "" && entry.Exchange != "" && entry.SymbolToken != "" {
			entries = append(entries, entry)
		}
	}
	return entries
}

func universeNameForSub(sub store.Subscription) string {
	kind := strings.ToUpper(strings.TrimSpace(sub.Kind))
	switch kind {
	case "EQUITY":
		return "nifty100_equity"
	case "INDEX":
		return "indices"
	case "FUT":
		upperType := strings.ToUpper(sub.InstrumentType)
		if strings.Contains(upperType, "FUTIDX") {
			return "futures_index"
		}
		return "futures_stock"
	case "OPTIDX":
		suffix := normalizeUniverseSuffix(sub.Underlying)
		if suffix == "" {
			return "options_index"
		}
		return "options_index_" + suffix
	case "OPTSTK":
		return "options_stock"
	default:
		return "other"
	}
}

func normalizeUniverseSuffix(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	var b strings.Builder
	for _, r := range value {
		if unicode.IsLetter(r) || unicode.IsNumber(r) {
			b.WriteRune(unicode.ToLower(r))
		} else {
			b.WriteRune('_')
		}
	}
	return strings.Trim(b.String(), "_")
}

func buildSourceSLAs(cfg *config.Config) []store.SourceSLA {
	if cfg == nil {
		return nil
	}
	out := make([]store.SourceSLA, 0, len(cfg.Metrics.SLA))
	for _, sla := range cfg.Metrics.SLA {
		barLate := (*int)(nil)
		if sla.BarLateSeconds > 0 {
			barLate = &sla.BarLateSeconds
		}
		out = append(out, store.SourceSLA{
			SourceName:              strings.TrimSpace(sla.SourceName),
			UniverseName:            strings.TrimSpace(sla.UniverseName),
			Dataset:                 strings.TrimSpace(sla.Dataset),
			ExpectedIntervalSeconds: sla.ExpectedIntervalSeconds,
			MaxStalenessSeconds:     sla.MaxStalenessSeconds,
			BarLateSeconds:          barLate,
			Endpoint:                strings.TrimSpace(sla.Endpoint),
			Priority:                strings.TrimSpace(sla.Priority),
			Enabled:                 sla.Enabled,
		})
	}
	return out
}

func buildTradingCalendar(now time.Time, tradingStart, tradingEnd string, loc *time.Location, daysBack, daysAhead int) ([]store.TradingDay, error) {
	if loc == nil {
		loc = time.UTC
	}
	startClock, err := time.ParseInLocation("15:04", tradingStart, loc)
	if err != nil {
		return nil, err
	}
	endClock, err := time.ParseInLocation("15:04", tradingEnd, loc)
	if err != nil {
		return nil, err
	}
	var days []store.TradingDay
	for i := -daysBack; i <= daysAhead; i++ {
		date := now.AddDate(0, 0, i)
		open := time.Date(date.Year(), date.Month(), date.Day(), startClock.Hour(), startClock.Minute(), 0, 0, loc)
		close := time.Date(date.Year(), date.Month(), date.Day(), endClock.Hour(), endClock.Minute(), 0, 0, loc)
		isTrading := date.Weekday() != time.Saturday && date.Weekday() != time.Sunday
		note := ""
		if !isTrading {
			note = "weekend"
		}
		days = append(days, store.TradingDay{
			TradeDate:    date,
			MarketOpen:   open,
			MarketClose:  close,
			IsTradingDay: isTrading,
			Note:         note,
		})
	}
	return days, nil
}

func runMetricsRollup(ctx context.Context, cfg *config.Config, st *store.Store, logger *slog.Logger, loc *time.Location) error {
	if cfg == nil || !cfg.Metrics.Enable {
		return nil
	}
	interval := time.Duration(cfg.Metrics.RollupIntervalSeconds) * time.Second
	if interval <= 0 {
		interval = time.Minute
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	datasetTables := map[string]string{
		"gainers_losers": "gainers_losers_snapshots",
		"oibuildup":      "oibuildup_snapshots",
		"putcallratio":   "putcallratio_snapshots",
		"option_greeks":  "option_greeks",
		"pcr_snapshots":  "pcr_snapshots",
	}

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			now := time.Now().UTC()
			minute := now.Truncate(time.Minute)
			if err := st.RefreshSymbolPerfSnapshot(ctx, defaultIndexName, now, now.In(loc), loc.String()); err != nil && logger != nil {
				logger.Warn("symbol_perf_snapshot_failed", "err", err)
			}
			var rows []store.MetricsRow
			for _, sla := range cfg.Metrics.SLA {
				if !sla.Enabled {
					continue
				}
				row := store.MetricsRow{
					MinuteTs:     minute,
					SourceName:   strings.TrimSpace(sla.SourceName),
					UniverseName: strings.TrimSpace(sla.UniverseName),
				}
				dataset := strings.ToLower(strings.TrimSpace(sla.Dataset))
				switch dataset {
				case "instrument_state":
					staleBefore := now.Add(-time.Duration(sla.MaxStalenessSeconds) * time.Second)
					stats, err := st.InstrumentStateStats(ctx, sla.UniverseName, now, staleBefore)
					if err != nil {
						if logger != nil {
							logger.Warn("metrics_state_stats_failed", "source", row.SourceName, "err", err)
						}
						continue
					}
					row.ExpectedInstruments = stats.Expected
					row.SeenInstruments = stats.Seen
					row.StalenessP50Sec = stats.P50
					row.StalenessP95Sec = stats.P95
					row.StalenessMaxSec = stats.Max
				case "bars_1m":
					targetMinute := minute.Add(-time.Minute)
					row.MinuteTs = targetMinute
					barLate := sla.BarLateSeconds
					if barLate <= 0 {
						barLate = 120
					}
					lateAfter := targetMinute.Add(time.Duration(barLate) * time.Second)
					stats, err := st.Bars1mStats(ctx, sla.UniverseName, targetMinute, lateAfter)
					if err != nil {
						if logger != nil {
							logger.Warn("metrics_bars_stats_failed", "source", row.SourceName, "err", err)
						}
						continue
					}
					row.ExpectedInstruments = stats.Expected
					row.SeenInstruments = stats.Written
					row.BarsExpected = &stats.Expected
					row.BarsWritten = &stats.Written
					missing := stats.Expected - stats.Written
					if missing < 0 {
						missing = 0
					}
					row.BarsMissing = &missing
					row.BarsLate = &stats.Late
				default:
					table, ok := datasetTables[dataset]
					if !ok {
						continue
					}
					last, err := st.SnapshotLastSeen(ctx, table)
					if err != nil {
						if logger != nil {
							logger.Warn("metrics_snapshot_failed", "source", row.SourceName, "err", err)
						}
						continue
					}
					row.ExpectedInstruments = 1
					if !last.IsZero() {
						staleness := now.Sub(last).Seconds()
						stalenessVal := staleness
						row.StalenessP50Sec = &stalenessVal
						row.StalenessP95Sec = &stalenessVal
						row.StalenessMaxSec = &stalenessVal
						if staleness <= float64(sla.MaxStalenessSeconds) {
							row.SeenInstruments = 1
						}
					}
				}

				if row.ExpectedInstruments > 0 {
					row.CoverageRatio = float64(row.SeenInstruments) / float64(row.ExpectedInstruments)
				}
				row.MissingInstruments = row.ExpectedInstruments - row.SeenInstruments
				if row.MissingInstruments < 0 {
					row.MissingInstruments = 0
				}

				if endpoint := strings.TrimSpace(sla.Endpoint); endpoint != "" {
					stats, err := st.APIRequestStats(ctx, endpoint, minute, minute.Add(time.Minute))
					if err != nil && logger != nil {
						logger.Warn("metrics_api_stats_failed", "source", row.SourceName, "err", err)
					} else {
						row.API429Count = stats.Throttled
						row.APIErrorCount = stats.Errors
						row.APILatencyP95Ms = stats.P95Ms
					}
				}
				rows = append(rows, row)
			}
			if err := st.UpsertMetrics1m(ctx, rows); err != nil && logger != nil {
				logger.Warn("metrics_rollup_failed", "err", err)
			}
		}
	}
}

func recordAPIRequest(ctx context.Context, cfg *config.Config, st *store.Store, logger *slog.Logger, entry store.APIRequestLog) {
	if cfg == nil || st == nil || !cfg.Metrics.Enable || !cfg.Metrics.EnableAPIRequestLog {
		return
	}
	if entry.Ts.IsZero() {
		entry.Ts = time.Now().UTC()
	}
	if err := st.InsertAPIRequestLogs(ctx, []store.APIRequestLog{entry}); err != nil && logger != nil {
		logger.Warn("api_request_log_failed", "endpoint", entry.Endpoint, "err", err)
	}
}

func errorMessage(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}
