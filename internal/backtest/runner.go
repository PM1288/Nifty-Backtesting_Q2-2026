package backtest

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/sync/errgroup"

	"trading-stack/internal/alerts"
	"trading-stack/internal/config"
	"trading-stack/internal/logging"
	"trading-stack/internal/parameters"
	"trading-stack/internal/store"
)

const heartbeatKey = "__heartbeat__"

type Runner struct {
	cfg                *config.Config
	store              *store.Store
	logger             *slog.Logger
	loc                *time.Location
	alerts             *alerts.Client
	eodAlerts          *alerts.Client
	mu                 sync.Mutex
	percentileDt       string
	percentiles        map[string]float64
	dailyTrend         map[string]bool
	dailyTrendFast     int
	dailyTrendSlow     int
	percentileDaysBack int
	alertDate          string
	alertsSent         int
}

func NewRunner(cfg *config.Config, st *store.Store, logger *slog.Logger, loc *time.Location) *Runner {
	eodCfg := cfg.Backtest.Alerts
	if chatID := strings.TrimSpace(cfg.Backtest.EODTelegramChatID); chatID != "" {
		eodCfg.TelegramChatID = chatID
		eodCfg.TelegramEnable = true
	}
	return &Runner{
		cfg:       cfg,
		store:     st,
		logger:    logging.WithModule(logger, "backtest"),
		loc:       loc,
		alerts:    alerts.NewClient(cfg.Backtest.Alerts),
		eodAlerts: alerts.NewClient(eodCfg),
	}
}

func (r *Runner) Run(ctx context.Context) error {
	if !r.cfg.Backtest.Enable {
		if r.logger != nil {
			r.logger.Info("backtest_disabled")
		}
		<-ctx.Done()
		return ctx.Err()
	}
	g, gctx := errgroup.WithContext(ctx)
	if r.cfg.Backtest.RunDaily {
		g.Go(func() error { return r.runDailyLoop(gctx) })
	}
	if r.cfg.Backtest.RunLive {
		g.Go(func() error { return r.runLiveLoop(gctx) })
	}
	if r.cfg.Backtest.Archive.Enable {
		g.Go(func() error { return r.runArchiveLoop(gctx) })
	}
	return g.Wait()
}

func (r *Runner) runDailyLoop(ctx context.Context) error {
	for {
		now := time.Now().In(r.loc)
		next := nextRunTime(now, r.cfg.Backtest.DailyRunTimeIST, r.cfg.Backtest.SkipWeekends, r.loc)
		if r.logger != nil {
			r.logger.Info("backtest_daily_wait", "next", next)
		}
		if err := sleepUntil(ctx, next); err != nil {
			return err
		}
		if err := r.runDailyOnce(ctx, time.Now().In(r.loc)); err != nil && r.logger != nil {
			r.logger.Warn("backtest_daily_failed", "err", err)
		}
	}
}

func (r *Runner) runDailyOnce(ctx context.Context, now time.Time) error {
	tradeDate, err := r.resolveTradeDate(ctx, now)
	if err != nil {
		return err
	}
	return r.runDailyForDate(ctx, tradeDate)
}

func (r *Runner) runDailyForDate(ctx context.Context, tradeDate time.Time) error {
	result, err := r.runA02(ctx, tradeDate)
	if err != nil {
		return err
	}
	if err := r.persistA02Results(ctx, result); err != nil {
		return err
	}
	r.sendDailyAlert(ctx, result)
	if r.cfg.Paper.Enable && r.cfg.Paper.AutoPlace {
		if err := r.recordDailyPaperTrades(ctx, result.Trades); err != nil && r.logger != nil {
			r.logger.Warn("backtest_daily_paper_trading_failed", "err", err)
		}
	}
	if r.cfg.Backtest.StrategyEnable {
		strategyResult, err := r.runStrategyBacktest(ctx, tradeDate)
		if err != nil {
			return err
		}
		if err := r.persistStrategyBacktest(ctx, strategyResult); err != nil {
			return err
		}
	}
	if r.cfg.Backtest.OptionBacktest.Enable {
		if !(r.cfg.Backtest.OptionBacktest.RunTuesdayOnly && tradeDate.In(r.loc).Weekday() != time.Tuesday) {
			optionResult, err := r.runOptionBacktest(ctx, tradeDate)
			if err != nil {
				return err
			}
			if err := r.persistOptionBacktest(ctx, optionResult); err != nil {
				return err
			}
			r.sendOptionDailyAlert(ctx, optionResult)
			if r.cfg.Paper.Enable && r.cfg.Paper.AutoPlace {
				if err := r.recordOptionBacktestPaperTrades(ctx, optionResult.Trades); err != nil && r.logger != nil {
					r.logger.Warn("backtest_option_paper_trading_failed", "err", err)
				}
			}
		}
	}
	return nil
}

func (r *Runner) runLiveLoop(ctx context.Context) error {
	interval := time.Duration(r.cfg.Backtest.LiveIntervalSeconds) * time.Second
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			now := time.Now().In(r.loc)
			if !r.cfg.Backtest.RunOutsideMarketHours && outsideMarketHours(now, r.cfg.Runtime.TradingStart, r.cfg.Runtime.TradingEnd, r.loc) {
				continue
			}
			tradeDate, err := r.resolveTradeDate(ctx, now)
			if err != nil {
				if r.logger != nil {
					r.logger.Warn("backtest_live_trade_date_failed", "err", err)
				}
				continue
			}
			result, err := r.runA02(ctx, tradeDate)
			if err != nil {
				if r.logger != nil {
					r.logger.Warn("backtest_live_run_failed", "err", err)
				}
				continue
			}
			cutoff := now.Add(-time.Duration(r.cfg.Backtest.LiveWindowMinutes) * time.Minute)
			recent := filterRecentTrades(result.Trades, cutoff)
			inserted, err := r.persistLiveSignals(ctx, result.RunID, now, recent)
			if err != nil {
				if r.logger != nil {
					r.logger.Warn("backtest_live_persist_failed", "err", err)
				}
				continue
			}
			if len(inserted) > 0 && r.cfg.Paper.Enable && r.cfg.Paper.AutoPlace {
				if err := r.recordLivePaperTrades(ctx, inserted); err != nil && r.logger != nil {
					r.logger.Warn("backtest_live_paper_trading_failed", "err", err)
				}
			}
			r.sendLiveAlert(ctx, inserted)
		}
	}
}

func (r *Runner) runA02(ctx context.Context, tradeDate time.Time) (A02RunResult, error) {
	cfg := r.cfg.Backtest
	defs := parameters.BacktestA02Definitions(r.cfg)
	if values, err := parameters.LoadScope(ctx, r.store, parameters.ScopeBacktestA02, defs, "backtest"); err != nil {
		if r.logger != nil {
			r.logger.Warn("backtest_params_load_failed", "err", err)
		}
	} else {
		parameters.ApplyBacktestOverrides(&cfg, values)
	}

	universe, err := fetchUniverse(ctx, r.store, r.cfg.Backtest.UniverseName)
	if err != nil {
		return A02RunResult{}, err
	}
	if len(universe) == 0 {
		return A02RunResult{}, errors.New("no instruments found for backtest universe")
	}

	percentiles, dailyTrend, err := r.ensurePercentiles(ctx, tradeDate, universe, cfg.DaysBack, cfg.DailyEMAFast, cfg.DailyEMASlow, cfg.RequireDailyEMATrend)
	if err != nil {
		return A02RunResult{}, err
	}

	eligible, dailyMeta, err := r.filterEquityUniverse(ctx, tradeDate, universe, percentiles, cfg)
	if err != nil {
		return A02RunResult{}, err
	}
	if len(eligible) == 0 {
		return A02RunResult{
			RunID:            time.Now().UTC(),
			TradeDate:        tradeDate,
			Trades:           nil,
			Summary:          A02Summary{},
			SymbolsEvaluated: len(universe),
		}, nil
	}

	start, end, err := tradingWindowForDate(tradeDate, r.cfg.Runtime.TradingStart, r.cfg.Runtime.TradingEnd, r.loc)
	if err != nil {
		return A02RunResult{}, err
	}
	bars, err := fetchMinuteBars(ctx, r.store, eligible, start.UTC(), end.UTC())
	if err != nil {
		return A02RunResult{}, err
	}
	startOffset := cfg.StartOffsetMinutes
	if cfg.EquityEntryStart != "" {
		entryStart, parseErr := parseClockAtDate(tradeDate, cfg.EquityEntryStart, r.loc)
		tradeStart, winErr := parseClockAtDate(tradeDate, r.cfg.Runtime.TradingStart, r.loc)
		if parseErr == nil && winErr == nil {
			diff := int(entryStart.Sub(tradeStart).Minutes())
			if diff > 0 {
				startOffset = diff
			}
		}
	}
	entryCutoff := cfg.EntryCutoffTime
	if strings.TrimSpace(cfg.EquityEntryEnd) != "" {
		entryCutoff = cfg.EquityEntryEnd
	}

	engineCfg := engineConfig{
		RSIPeriod:               cfg.RSIPeriod,
		WillRPeriod:             cfg.WILLRPeriod,
		RSIThreshold:            cfg.EquityEntryRSIThreshold,
		WillRThreshold:          cfg.EquityEntryWillRThresh,
		MaxPercentile:           cfg.MaxPercentile,
		RequireDailyEMATrend:    cfg.RequireDailyEMATrend,
		RequireBollingerTouch:   cfg.RequireBollingerTouch,
		RequireVWAPReclaim:      cfg.RequireVWAPReclaim,
		RequireVolumeSpike:      cfg.RequireVolumeSpike,
		DailyEMAFast:            cfg.DailyEMAFast,
		DailyEMASlow:            cfg.DailyEMASlow,
		BollingerPeriod:         cfg.BollingerPeriod,
		BollingerStdDev:         cfg.BollingerStdDev,
		BollingerLowerBufferPct: cfg.BollingerLowerBufferPct,
		VolumeSpikeMinRatio:     cfg.VolumeSpikeMinRatio,
		CloseLookback:           cfg.CloseLookback,
		VolumeLookback:          cfg.VolumeLookback,
		VolumeMedianMaxRatio:    cfg.VolumeMedianMaxRatio,
		StartOffsetMinutes:      startOffset,
		EntryCutoffTime:         entryCutoff,
		TargetGain:              cfg.TargetGain,
		TradeCapital:            cfg.TradeCapital,
		CapitalLimit:            cfg.CapitalLimit,
		MaxConcurrent:           cfg.MaxConcurrentTrades,
		Charges:                 buildChargeRates(cfg.Charges),
	}

	result, err := runA02Backtest(ctx, tradeDate, eligible, bars, percentiles, dailyTrend, engineCfg, r.loc)
	if err != nil {
		return A02RunResult{}, err
	}
	result.SymbolsEvaluated = len(universe)
	for i := range result.Trades {
		baseMeta := map[string]any{}
		meta, ok := dailyMeta[result.Trades[i].SymbolToken]
		if !ok {
			meta = map[string]any{}
		}
		for k, v := range meta {
			baseMeta[k] = v
		}
		for k, v := range buildEquityScenarioMeta(result.Trades[i], cfg.EquityCapitalScenarios, cfg.EquityIntradayTargetNet, cfg.EquityDeliveryTargetNet, r.cfg.Paper.BrokeragePerTrade) {
			baseMeta[k] = v
		}
		result.Trades[i].Raw = mergeRawFields(result.Trades[i].Raw, baseMeta)
	}
	return result, nil
}

func (r *Runner) ensurePercentiles(ctx context.Context, tradeDate time.Time, universe []instrumentRef, daysBack, emaFast, emaSlow int, requireTrend bool) (map[string]float64, map[string]bool, error) {
	tradeKey := tradeDate.In(r.loc).Format("2006-01-02")
	r.mu.Lock()
	if r.percentiles != nil && r.percentileDt == tradeKey && r.percentileDaysBack == daysBack && r.dailyTrendFast == emaFast && r.dailyTrendSlow == emaSlow {
		cached := make(map[string]float64, len(r.percentiles))
		for k, v := range r.percentiles {
			cached[k] = v
		}
		trendCached := make(map[string]bool, len(r.dailyTrend))
		for k, v := range r.dailyTrend {
			trendCached[k] = v
		}
		r.mu.Unlock()
		return cached, trendCached, nil
	}
	r.mu.Unlock()

	rows := make([]dailyClosePosition, 0, len(universe))
	percentiles := make(map[string]float64, len(universe))
	trend := make(map[string]bool, len(universe))
	lookback := daysBack
	if requireTrend && emaSlow > lookback {
		lookback = emaSlow * 2
	}
	for _, ref := range universe {
		closes, err := fetchDailyCloses(ctx, r.store, ref.Exchange, ref.Token, tradeDate, lookback)
		if err != nil {
			return nil, nil, err
		}
		if len(closes) < 5 {
			closes, err = fetchDailyCloses(ctx, r.store, ref.Exchange, ref.Token, tradeDate, 0)
			if err != nil {
				return nil, nil, err
			}
		}
		if len(closes) == 0 {
			continue
		}
		metrics := computeDailyMetrics(closes)
		rows = append(rows, dailyClosePosition{
			Exchange:      ref.Exchange,
			SymbolToken:   ref.Token,
			Symbol:        ref.Symbol,
			TradingSymbol: ref.TradingSymbol,
			CurrentClose:  metrics.CurrentClose,
			Percentile:    metrics.Percentile,
			YearHigh:      metrics.YearHigh,
			YearLow:       metrics.YearLow,
			MedianClose:   metrics.MedianClose,
			MeanClose:     metrics.MeanClose,
			UpdatedAt:     time.Now().UTC(),
		})
		percentiles[ref.Token] = metrics.Percentile
		if requireTrend {
			trend[ref.Token] = dailyEMATrend(closes, emaFast, emaSlow)
		} else {
			trend[ref.Token] = true
		}
	}
	if err := upsertDailyClosePositions(ctx, r.store, rows); err != nil {
		return nil, nil, err
	}

	r.mu.Lock()
	r.percentileDt = tradeKey
	r.percentiles = percentiles
	r.dailyTrend = trend
	r.dailyTrendFast = emaFast
	r.dailyTrendSlow = emaSlow
	r.percentileDaysBack = daysBack
	r.mu.Unlock()

	return percentiles, trend, nil
}

func (r *Runner) persistA02Results(ctx context.Context, result A02RunResult) error {
	return r.store.WithTx(ctx, func(tx pgx.Tx) error {
		tradeLocal := result.TradeDate
		if r.loc != nil {
			tradeLocal = result.TradeDate.In(r.loc)
		}
		tradeDateUTC := time.Date(tradeLocal.Year(), tradeLocal.Month(), tradeLocal.Day(), 0, 0, 0, 0, time.UTC)
		deleteResults := fmt.Sprintf(`DELETE FROM %s WHERE trade_date = $1`, pgx.Identifier{r.store.Schema, "a02_backtest_results"}.Sanitize())
		if _, err := tx.Exec(ctx, deleteResults, tradeDateUTC); err != nil {
			return err
		}
		deleteStats := fmt.Sprintf(`DELETE FROM %s WHERE trade_date = $1`, pgx.Identifier{r.store.Schema, "a02_backtest_daily_stats"}.Sanitize())
		if _, err := tx.Exec(ctx, deleteStats, tradeDateUTC); err != nil {
			return err
		}
		deleteRuns := fmt.Sprintf(`DELETE FROM %s WHERE trade_date = $1`, pgx.Identifier{r.store.Schema, "a02_backtest_runs"}.Sanitize())
		if _, err := tx.Exec(ctx, deleteRuns, tradeDateUTC); err != nil {
			return err
		}

		if err := upsertA02ResultsTx(ctx, r.store.Schema, tx, result); err != nil {
			return err
		}
		if err := upsertA02RunsTx(ctx, r.store.Schema, tx, result); err != nil {
			return err
		}
		if err := upsertA02StatsTx(ctx, r.store.Schema, tx, result); err != nil {
			return err
		}
		return nil
	})
}

func (r *Runner) persistLiveSignals(ctx context.Context, runID time.Time, now time.Time, trades []A02Trade) ([]A02Trade, error) {
	if len(trades) == 0 {
		if err := r.upsertLiveHeartbeat(ctx, runID, now, 0); err != nil {
			return nil, err
		}
		return nil, nil
	}
	inserted := make([]A02Trade, 0, len(trades))
	for _, trade := range trades {
		ok, err := insertLiveSignal(ctx, r.store, runID, trade)
		if err != nil {
			return inserted, err
		}
		if ok {
			inserted = append(inserted, trade)
		}
		if err := upsertLiveStream(ctx, r.store, runID, trade); err != nil {
			return inserted, err
		}
		if err := upsertLiveStatus(ctx, r.store, runID, trade); err != nil {
			return inserted, err
		}
	}
	if err := r.upsertLiveHeartbeat(ctx, runID, now, len(inserted)); err != nil {
		return inserted, err
	}
	return inserted, nil
}

func (r *Runner) upsertLiveHeartbeat(ctx context.Context, runID time.Time, now time.Time, inserted int) error {
	status := liveStatusRow{
		Key:             heartbeatKey,
		LastEntryTime:   now.UTC(),
		LastRunID:       runID.UTC(),
		LastInsertCount: inserted,
		UpdatedAt:       time.Now().UTC(),
	}
	return upsertLiveStatusRow(ctx, r.store, status)
}

func (r *Runner) sendDailyAlert(ctx context.Context, result A02RunResult) {
	if r.eodAlerts == nil {
		return
	}
	msg := fmt.Sprintf("EQUITY %s trades=%d win=%.1f%% net=%.2f", result.TradeDate.In(r.loc).Format("2006-01-02"), result.Summary.TotalTrades, result.Summary.WinRate, result.Summary.TotalNetProfit)
	_ = r.eodAlerts.Send(ctx, r.cfg.Backtest.Alerts.TitlePrefix+" eod", msg)
}

func (r *Runner) sendLiveAlert(ctx context.Context, trades []A02Trade) {
	if r.alerts == nil || len(trades) == 0 {
		return
	}
	if !r.allowLiveAlert() {
		return
	}
	maxPerRun := r.cfg.Backtest.Alerts.MaxPerRun
	if maxPerRun <= 0 {
		maxPerRun = r.cfg.Backtest.LiveMaxSignalsPerRun
	}
	if maxPerRun > len(trades) {
		maxPerRun = len(trades)
	}
	msg := r.buildLiveAlertMessage(trades[:maxPerRun], len(trades))
	_ = r.alerts.Send(ctx, r.cfg.Backtest.Alerts.TitlePrefix+" live", msg)
}

func (r *Runner) buildLiveAlertMessage(trades []A02Trade, total int) string {
	if len(trades) == 0 {
		return ""
	}
	if !r.cfg.Backtest.Alerts.IncludeDetails {
		names := make([]string, 0, len(trades))
		for _, trade := range trades {
			if trade.Symbol != "" {
				names = append(names, trade.Symbol)
			} else {
				names = append(names, trade.TradingSymbol)
			}
		}
		return fmt.Sprintf("Equity live signals (%d): %s", total, strings.Join(names, ", "))
	}
	lines := make([]string, 0, len(trades)+1)
	lines = append(lines, fmt.Sprintf("Equity live signals (%d)", total))
	for _, trade := range trades {
		name := trade.TradingSymbol
		if trade.Symbol != "" {
			name = trade.Symbol
		}
		line := fmt.Sprintf("%s @ %.2f rsi=%.1f willr=%.1f", name, trade.EntryClose, trade.RSI, trade.WillR)
		if r.cfg.Backtest.Alerts.IncludeTargets {
			line = fmt.Sprintf("%s target=%.2f", line, trade.TargetPrice)
		}
		lines = append(lines, line)
	}
	return strings.Join(lines, "\n")
}

func (r *Runner) allowLiveAlert() bool {
	if r.cfg.Backtest.LiveMaxAlertsPerDay <= 0 {
		return true
	}
	current := time.Now().In(r.loc).Format("2006-01-02")
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.alertDate != current {
		r.alertDate = current
		r.alertsSent = 0
	}
	if r.alertsSent >= r.cfg.Backtest.LiveMaxAlertsPerDay {
		return false
	}
	r.alertsSent++
	return true
}

func resolveUniverseSymbol(ref instrumentRef) string {
	if ref.Symbol != "" {
		return ref.Symbol
	}
	clean := strings.ToUpper(strings.TrimSpace(ref.TradingSymbol))
	clean = strings.TrimSuffix(clean, "-EQ")
	return clean
}

func fetchUniverse(ctx context.Context, st *store.Store, universe string) ([]instrumentRef, error) {
	activeQuery := fmt.Sprintf(`SELECT exchange, symbol_token, COALESCE(tradingsymbol, ''), COALESCE(underlying, '')
FROM %s
WHERE universe_name = $1
  AND active_to IS NULL
ORDER BY tradingsymbol`, pgx.Identifier{st.Schema, "instrument_universe"}.Sanitize())
	out, err := scanUniverseRefs(ctx, st, activeQuery, universe)
	if err != nil {
		return nil, err
	}
	if len(out) > 0 {
		return out, nil
	}
	fallbackQuery := fmt.Sprintf(`SELECT exchange, symbol_token, COALESCE(tradingsymbol, ''), COALESCE(underlying, '')
FROM %s
WHERE universe_name = $1
ORDER BY active_from DESC, tradingsymbol`, pgx.Identifier{st.Schema, "instrument_universe"}.Sanitize())
	return scanUniverseRefs(ctx, st, fallbackQuery, universe)
}

func scanUniverseRefs(ctx context.Context, st *store.Store, query string, universe string) ([]instrumentRef, error) {
	rows, err := st.Pool.Query(ctx, query, universe)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]instrumentRef, 0)
	for rows.Next() {
		var ref instrumentRef
		if err := rows.Scan(&ref.Exchange, &ref.Token, &ref.TradingSymbol, &ref.Symbol); err != nil {
			return nil, err
		}
		ref.Symbol = resolveUniverseSymbol(ref)
		out = append(out, ref)
	}
	return out, rows.Err()
}

func fetchMinuteBars(ctx context.Context, st *store.Store, universe []instrumentRef, start, end time.Time) (map[string][]minuteBar, error) {
	tokensByExchange := map[string][]string{}
	for _, ref := range universe {
		tokensByExchange[ref.Exchange] = append(tokensByExchange[ref.Exchange], ref.Token)
	}
	if len(tokensByExchange) == 0 {
		return map[string][]minuteBar{}, nil
	}

	query := fmt.Sprintf(`SELECT symbol_token, ts, open, high, low, close, volume
FROM %s
WHERE exchange = $1 AND symbol_token = ANY($2) AND ts >= $3 AND ts < $4
ORDER BY symbol_token, ts ASC`, pgx.Identifier{st.Schema, "bars_1m"}.Sanitize())

	out := make(map[string][]minuteBar)
	for exchange, tokens := range tokensByExchange {
		if len(tokens) == 0 {
			continue
		}
		rows, err := st.Pool.Query(ctx, query, exchange, tokens, start, end)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var token string
			var bar minuteBar
			if err := rows.Scan(&token, &bar.Ts, &bar.Open, &bar.High, &bar.Low, &bar.Close, &bar.Volume); err != nil {
				rows.Close()
				return nil, err
			}
			out[token] = append(out[token], bar)
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}
	return out, nil
}

func fetchDailyCloses(ctx context.Context, st *store.Store, exchange, token string, tradeDate time.Time, daysBack int) ([]dailyClose, error) {
	tradeDateUTC := time.Date(tradeDate.Year(), tradeDate.Month(), tradeDate.Day(), 0, 0, 0, 0, time.UTC)
	var query string
	var args []any
	if daysBack > 0 {
		cutoff := tradeDateUTC.AddDate(0, 0, -daysBack)
		query = fmt.Sprintf(`SELECT trade_date, close FROM %s WHERE exchange = $1 AND symbol_token = $2 AND trade_date <= $3 AND trade_date >= $4 ORDER BY trade_date ASC`, pgx.Identifier{st.Schema, "bars_1d"}.Sanitize())
		args = []any{exchange, token, tradeDateUTC, cutoff}
	} else {
		query = fmt.Sprintf(`SELECT trade_date, close FROM %s WHERE exchange = $1 AND symbol_token = $2 AND trade_date <= $3 ORDER BY trade_date ASC`, pgx.Identifier{st.Schema, "bars_1d"}.Sanitize())
		args = []any{exchange, token, tradeDateUTC}
	}
	rows, err := st.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []dailyClose{}
	for rows.Next() {
		var row dailyClose
		if err := rows.Scan(&row.TradeDate, &row.Close); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

type dailyOHLCV struct {
	TradeDate time.Time
	Open      float64
	High      float64
	Low       float64
	Close     float64
	Volume    float64
}

func fetchDailyOHLCV(ctx context.Context, st *store.Store, exchange, token string, tradeDate time.Time, daysBack int) ([]dailyOHLCV, error) {
	tradeDateUTC := time.Date(tradeDate.Year(), tradeDate.Month(), tradeDate.Day(), 0, 0, 0, 0, time.UTC)
	var query string
	var args []any
	if daysBack > 0 {
		cutoff := tradeDateUTC.AddDate(0, 0, -daysBack)
		query = fmt.Sprintf(`SELECT trade_date, open, high, low, close, volume FROM %s WHERE exchange = $1 AND symbol_token = $2 AND trade_date <= $3 AND trade_date >= $4 ORDER BY trade_date ASC`, pgx.Identifier{st.Schema, "bars_1d"}.Sanitize())
		args = []any{exchange, token, tradeDateUTC, cutoff}
	} else {
		query = fmt.Sprintf(`SELECT trade_date, open, high, low, close, volume FROM %s WHERE exchange = $1 AND symbol_token = $2 AND trade_date <= $3 ORDER BY trade_date ASC`, pgx.Identifier{st.Schema, "bars_1d"}.Sanitize())
		args = []any{exchange, token, tradeDateUTC}
	}
	rows, err := st.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []dailyOHLCV{}
	for rows.Next() {
		var row dailyOHLCV
		if err := rows.Scan(&row.TradeDate, &row.Open, &row.High, &row.Low, &row.Close, &row.Volume); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func parseClockAtDate(tradeDate time.Time, hhmm string, loc *time.Location) (time.Time, error) {
	parsed, err := time.ParseInLocation("15:04", strings.TrimSpace(hhmm), loc)
	if err != nil {
		return time.Time{}, err
	}
	localDate := tradeDate.In(loc)
	return time.Date(localDate.Year(), localDate.Month(), localDate.Day(), parsed.Hour(), parsed.Minute(), 0, 0, loc), nil
}

func mergeRawFields(raw []byte, fields map[string]any) []byte {
	out := map[string]any{}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &out)
	}
	for key, value := range fields {
		out[key] = value
	}
	b, _ := json.Marshal(out)
	return b
}

func buildEquityScenarioMeta(trade A02Trade, capitals []float64, intradayTargetNet, deliveryTargetNet, brokerage float64) map[string]any {
	meta := map[string]any{}
	if trade.EntryClose <= 0 {
		return meta
	}
	if len(capitals) == 0 {
		capitals = []float64{200000, 500000, 1000000}
	}
	dayHigh := readRawFloat(trade.Raw, "day_high")
	detail := make([]map[string]any, 0, len(capitals))
	for _, capital := range capitals {
		if capital <= 0 {
			continue
		}
		qty := int(math.Floor(capital / trade.EntryClose))
		if qty < 1 {
			continue
		}
		intraMove := (intradayTargetNet + 2*brokerage) / (float64(qty) * trade.EntryClose)
		if intraMove < 0 {
			intraMove = 0
		}
		intraTarget := trade.EntryClose * (1 + intraMove)
		deliveryMove := (deliveryTargetNet + 2*brokerage) / (float64(qty) * trade.EntryClose)
		if deliveryMove < 0 {
			deliveryMove = 0
		}
		deliveryTarget := trade.EntryClose * (1 + deliveryMove)
		row := map[string]any{
			"capital":              capital,
			"qty":                  qty,
			"intraday_target":      intraTarget,
			"intraday_target_pct":  intraMove * 100,
			"intraday_hit":         dayHigh > 0 && dayHigh >= intraTarget,
			"delivery_target":      deliveryTarget,
			"delivery_target_pct":  deliveryMove * 100,
			"delivery_close_hit":   trade.ExitClose >= deliveryTarget,
			"delivery_close_price": trade.ExitClose,
		}
		detail = append(detail, row)
	}
	meta["capital_scenarios"] = detail
	return meta
}

func readRawFloat(raw []byte, key string) float64 {
	if len(raw) == 0 {
		return 0
	}
	m := map[string]any{}
	if err := json.Unmarshal(raw, &m); err != nil {
		return 0
	}
	val, ok := m[key]
	if !ok {
		return 0
	}
	if f, ok := val.(float64); ok {
		return f
	}
	return 0
}

func (r *Runner) filterEquityUniverse(ctx context.Context, tradeDate time.Time, universe []instrumentRef, percentiles map[string]float64, cfg config.BacktestConfig) ([]instrumentRef, map[string]map[string]any, error) {
	filtered := make([]instrumentRef, 0, len(universe))
	meta := make(map[string]map[string]any, len(universe))
	lookback := cfg.DaysBack
	minDays := maxInt(cfg.RSIPeriod+2, cfg.WILLRPeriod+2, cfg.VolumeLookback+2)
	if lookback < minDays {
		lookback = minDays
	}
	volumeRatio := cfg.VolumeMedianMaxRatio
	if volumeRatio <= 0 {
		volumeRatio = 1
	}
	for _, ref := range universe {
		pct, ok := percentiles[ref.Token]
		if !ok || pct >= cfg.MaxPercentile {
			continue
		}
		series, err := fetchDailyOHLCV(ctx, r.store, ref.Exchange, ref.Token, tradeDate, lookback)
		if err != nil {
			return nil, nil, err
		}
		if len(series) < 3 {
			continue
		}
		closes := make([]float64, len(series))
		highs := make([]float64, len(series))
		lows := make([]float64, len(series))
		volumes := make([]float64, len(series))
		for i, row := range series {
			closes[i] = row.Close
			highs[i] = row.High
			lows[i] = row.Low
			volumes[i] = row.Volume
		}
		rsiVals := rsiSeries(closes, cfg.RSIPeriod)
		willrVals := willrSeries(highs, lows, closes, cfg.WILLRPeriod)
		last := len(series) - 1
		prev := last - 1
		if prev < 1 {
			continue
		}
		rsiToday := rsiVals[last]
		rsiPrev := rsiVals[prev]
		willrToday := willrVals[last]
		if math.IsNaN(rsiToday) || math.IsNaN(rsiPrev) || math.IsNaN(willrToday) {
			continue
		}
		volStart := prev - cfg.VolumeLookback
		if volStart < 0 {
			volStart = 0
		}
		volMedian := median(volumes[volStart:prev])
		lastBar := series[last]
		prevBar := series[prev]
		if rsiToday >= cfg.EquitySelectionRSIMax {
			continue
		}
		if willrToday >= cfg.EquitySelectionWillRMax {
			continue
		}
		if lastBar.Low <= prevBar.Low {
			continue
		}
		if lastBar.Open <= prevBar.Close {
			continue
		}
		if rsiToday >= rsiPrev {
			continue
		}
		if volMedian > 0 && prevBar.Volume > volMedian*volumeRatio {
			continue
		}
		filtered = append(filtered, ref)
		meta[ref.Token] = map[string]any{
			"daily_percentile":       pct,
			"daily_rsi":              rsiToday,
			"daily_prev_rsi":         rsiPrev,
			"daily_willr":            willrToday,
			"daily_low":              lastBar.Low,
			"daily_prev_low":         prevBar.Low,
			"daily_open":             lastBar.Open,
			"daily_prev_close":       prevBar.Close,
			"daily_prev_volume":      prevBar.Volume,
			"daily_volume_median":    volMedian,
			"daily_volume_ratio_cap": volumeRatio,
		}
	}
	return filtered, meta, nil
}

func tradingWindowForDate(tradeDate time.Time, tradingStart, tradingEnd string, loc *time.Location) (time.Time, time.Time, error) {
	startParsed, err := time.ParseInLocation("15:04", tradingStart, loc)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	endParsed, err := time.ParseInLocation("15:04", tradingEnd, loc)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	localDate := tradeDate.In(loc)
	start := time.Date(localDate.Year(), localDate.Month(), localDate.Day(), startParsed.Hour(), startParsed.Minute(), 0, 0, loc)
	end := time.Date(localDate.Year(), localDate.Month(), localDate.Day(), endParsed.Hour(), endParsed.Minute(), 0, 0, loc).Add(time.Minute)
	return start, end, nil
}

func nextRunTime(now time.Time, runTime string, skipWeekends bool, loc *time.Location) time.Time {
	parsed, err := time.ParseInLocation("15:04", runTime, loc)
	if err != nil {
		return now.Add(24 * time.Hour)
	}
	candidate := time.Date(now.Year(), now.Month(), now.Day(), parsed.Hour(), parsed.Minute(), 0, 0, loc)
	if !candidate.After(now) {
		candidate = candidate.AddDate(0, 0, 1)
	}
	if skipWeekends {
		for candidate.Weekday() == time.Saturday || candidate.Weekday() == time.Sunday {
			candidate = candidate.AddDate(0, 0, 1)
		}
	}
	return candidate
}

func sleepUntil(ctx context.Context, target time.Time) error {
	for {
		now := time.Now()
		if now.After(target) || now.Equal(target) {
			return nil
		}
		remaining := time.Until(target)
		if remaining > 5*time.Minute {
			remaining = 5 * time.Minute
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(remaining):
		}
	}
}

func outsideMarketHours(now time.Time, tradingStart, tradingEnd string, loc *time.Location) bool {
	local := now.In(loc)
	if local.Weekday() == time.Saturday || local.Weekday() == time.Sunday {
		return true
	}
	start, end, err := tradingWindowForDate(local, tradingStart, tradingEnd, loc)
	if err != nil {
		return false
	}
	return local.Before(start) || local.After(end)
}

func (r *Runner) resolveTradeDate(ctx context.Context, now time.Time) (time.Time, error) {
	local := now.In(r.loc)
	if r.cfg.Backtest.UseTradingCalendar {
		tradeDate, ok, err := lookupTradingDay(ctx, r.store, local, r.loc)
		if err != nil {
			return time.Time{}, err
		}
		if ok {
			return tradeDate, nil
		}
	}
	if !r.cfg.Backtest.UseLastWorkingDay {
		return time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, r.loc), nil
	}
	candidate := lastWorkingDay(local, r.cfg.Runtime.TradingStart, r.cfg.Runtime.TradingEnd, r.loc)
	return time.Date(candidate.Year(), candidate.Month(), candidate.Day(), 0, 0, 0, 0, r.loc), nil
}

func (r *Runner) ResolveTradeDate(ctx context.Context, now time.Time) (time.Time, error) {
	return r.resolveTradeDate(ctx, now)
}

func (r *Runner) RunStrategyOnce(ctx context.Context, tradeDate time.Time) error {
	if !r.cfg.Backtest.StrategyEnable {
		return nil
	}
	result, err := r.runStrategyBacktest(ctx, tradeDate)
	if err != nil {
		return err
	}
	return r.persistStrategyBacktest(ctx, result)
}

func lookupTradingDay(ctx context.Context, st *store.Store, now time.Time, loc *time.Location) (time.Time, bool, error) {
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	query := fmt.Sprintf(`SELECT trade_date, is_trading_day FROM %s WHERE trade_date <= $1 ORDER BY trade_date DESC LIMIT 1`, pgx.Identifier{st.Schema, "trading_calendar"}.Sanitize())
	var tradeDate time.Time
	var isTrading bool
	if err := st.Pool.QueryRow(ctx, query, today).Scan(&tradeDate, &isTrading); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return time.Time{}, false, nil
		}
		return time.Time{}, false, err
	}
	if isTrading {
		return tradeDate.In(loc), true, nil
	}
	query = fmt.Sprintf(`SELECT trade_date FROM %s WHERE trade_date < $1 AND is_trading_day = true ORDER BY trade_date DESC LIMIT 1`, pgx.Identifier{st.Schema, "trading_calendar"}.Sanitize())
	if err := st.Pool.QueryRow(ctx, query, today).Scan(&tradeDate); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return time.Time{}, false, nil
		}
		return time.Time{}, false, err
	}
	return tradeDate.In(loc), true, nil
}

func lastWorkingDay(now time.Time, tradingStart, tradingEnd string, loc *time.Location) time.Time {
	local := now.In(loc)
	if local.Weekday() == time.Saturday || local.Weekday() == time.Sunday {
		return previousWeekday(local)
	}
	start, _, err := tradingWindowForDate(local, tradingStart, tradingEnd, loc)
	if err == nil && local.Before(start) {
		return previousWeekday(local)
	}
	return local
}

func previousWeekday(now time.Time) time.Time {
	cursor := now.AddDate(0, 0, -1)
	for cursor.Weekday() == time.Saturday || cursor.Weekday() == time.Sunday {
		cursor = cursor.AddDate(0, 0, -1)
	}
	return cursor
}

func filterRecentTrades(trades []A02Trade, cutoff time.Time) []A02Trade {
	recent := make([]A02Trade, 0)
	for _, trade := range trades {
		if !trade.EntryTime.IsZero() && (trade.EntryTime.Equal(cutoff) || trade.EntryTime.After(cutoff)) {
			recent = append(recent, trade)
		}
	}
	return recent
}

func buildChargeRates(cfg config.BacktestChargesConfig) ChargeRates {
	return ChargeRates{
		BrokerageRate:   cfg.BrokerageRate,
		BrokerageCap:    cfg.BrokerageCap,
		STTRate:         cfg.STTRate,
		ExchangeTxnRate: cfg.ExchangeTxnRate,
		SEBIFeeRate:     cfg.SEBIFeeRate,
		StampDutyRate:   cfg.StampDutyRate,
		GSTRate:         cfg.GSTRate,
	}
}

func computeDailyMetrics(closes []dailyClose) dailyMetrics {
	values := make([]float64, 0, len(closes))
	for _, row := range closes {
		values = append(values, row.Close)
	}
	if len(values) == 0 {
		return dailyMetrics{}
	}
	sorted := make([]float64, len(values))
	copy(sorted, values)
	sort.Float64s(sorted)
	current := values[len(values)-1]
	yearHigh := sorted[len(sorted)-1]
	yearLow := sorted[0]
	medianVal := median(sorted)
	meanVal := average(sorted)
	rank := sort.Search(len(sorted), func(i int) bool { return sorted[i] > current })
	percentile := (float64(rank) / float64(len(sorted))) * 100
	return dailyMetrics{
		CurrentClose: current,
		Percentile:   percentile,
		YearHigh:     yearHigh,
		YearLow:      yearLow,
		MedianClose:  medianVal,
		MeanClose:    meanVal,
	}
}

type dailyMetrics struct {
	CurrentClose float64
	Percentile   float64
	YearHigh     float64
	YearLow      float64
	MedianClose  float64
	MeanClose    float64
}

func dailyEMATrend(closes []dailyClose, fast, slow int) bool {
	if fast < 2 || slow < 2 {
		return false
	}
	values := make([]float64, 0, len(closes))
	for _, row := range closes {
		values = append(values, row.Close)
	}
	if len(values) < slow {
		return false
	}
	emaFast := emaValue(values, fast)
	emaSlow := emaValue(values, slow)
	return emaFast >= emaSlow
}

type dailyClosePosition struct {
	Exchange      string
	SymbolToken   string
	Symbol        string
	TradingSymbol string
	CurrentClose  float64
	Percentile    float64
	YearHigh      float64
	YearLow       float64
	MedianClose   float64
	MeanClose     float64
	UpdatedAt     time.Time
}

type liveStatusRow struct {
	Key             string
	Exchange        string
	SymbolToken     string
	Symbol          string
	TradingSymbol   string
	LastEntryTime   time.Time
	LastRunID       time.Time
	LastEntryClose  float64
	LastSuccess     bool
	LastGainPct     float64
	LastInsertCount int
	UpdatedAt       time.Time
}

func upsertDailyClosePositions(ctx context.Context, st *store.Store, rows []dailyClosePosition) error {
	if len(rows) == 0 {
		return nil
	}
	stmt := fmt.Sprintf(`
INSERT INTO %s
  (exchange, symbol_token, symbol, tradingsymbol, current_close, current_percentile, year_high, year_low, median_close, mean_close, updated_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
ON CONFLICT (exchange, symbol_token) DO UPDATE SET
  symbol = EXCLUDED.symbol,
  tradingsymbol = EXCLUDED.tradingsymbol,
  current_close = EXCLUDED.current_close,
  current_percentile = EXCLUDED.current_percentile,
  year_high = EXCLUDED.year_high,
  year_low = EXCLUDED.year_low,
  median_close = EXCLUDED.median_close,
  mean_close = EXCLUDED.mean_close,
  updated_at = EXCLUDED.updated_at`, pgx.Identifier{st.Schema, "daily_close_position"}.Sanitize())
	batch := &pgx.Batch{}
	for _, row := range rows {
		batch.Queue(stmt, row.Exchange, row.SymbolToken, row.Symbol, row.TradingSymbol, row.CurrentClose, row.Percentile, row.YearHigh, row.YearLow, row.MedianClose, row.MeanClose, row.UpdatedAt)
	}
	return execBatch(ctx, st, "upsert_daily_close_position", batch)
}

func upsertA02ResultsTx(ctx context.Context, schema string, tx pgx.Tx, result A02RunResult) error {
	stmt := fmt.Sprintf(`
INSERT INTO %s
  (run_id, trade_date, exchange, symbol_token, symbol, tradingsymbol, entry_time, entry_close, exit_time, exit_close, success, gain_pct, duration_minutes, rsi, prev_rsi, willr, prev_volume, volume_median, quantity, investment_amount, exit_value, turnover, gross_profit, total_charges, net_profit, net_gain_pct, target_price, breakeven_points, raw)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
ON CONFLICT (run_id, symbol_token, entry_time) DO UPDATE SET
  trade_date = EXCLUDED.trade_date,
  exit_time = EXCLUDED.exit_time,
  exit_close = EXCLUDED.exit_close,
  success = EXCLUDED.success,
  gain_pct = EXCLUDED.gain_pct,
  duration_minutes = EXCLUDED.duration_minutes,
  rsi = EXCLUDED.rsi,
  prev_rsi = EXCLUDED.prev_rsi,
  willr = EXCLUDED.willr,
  prev_volume = EXCLUDED.prev_volume,
  volume_median = EXCLUDED.volume_median,
  quantity = EXCLUDED.quantity,
  investment_amount = EXCLUDED.investment_amount,
  exit_value = EXCLUDED.exit_value,
  turnover = EXCLUDED.turnover,
  gross_profit = EXCLUDED.gross_profit,
  total_charges = EXCLUDED.total_charges,
  net_profit = EXCLUDED.net_profit,
  net_gain_pct = EXCLUDED.net_gain_pct,
  target_price = EXCLUDED.target_price,
  breakeven_points = EXCLUDED.breakeven_points,
  raw = EXCLUDED.raw,
  created_at = now()`, pgx.Identifier{schema, "a02_backtest_results"}.Sanitize())
	for _, trade := range result.Trades {
		_, err := tx.Exec(ctx, stmt, result.RunID, result.TradeDate, trade.Exchange, trade.SymbolToken, trade.Symbol, trade.TradingSymbol, trade.EntryTime, trade.EntryClose, trade.ExitTime, trade.ExitClose, trade.Success, trade.GainPct, trade.DurationMinutes, trade.RSI, trade.PrevRSI, trade.WillR, trade.PrevVolume, trade.VolumeMedian, trade.Quantity, trade.InvestmentAmt, trade.ExitValue, trade.Turnover, trade.GrossProfit, trade.TotalCharges, trade.NetProfit, trade.NetGainPct, trade.TargetPrice, trade.BreakevenPoints, trade.Raw)
		if err != nil {
			return err
		}
	}
	return nil
}

func upsertA02RunsTx(ctx context.Context, schema string, tx pgx.Tx, result A02RunResult) error {
	summary := result.Summary
	stmt := fmt.Sprintf(`
INSERT INTO %s
  (run_id, trade_date, total_trades, wins, losses, win_rate, total_gross_profit, total_charges, total_net_profit, average_breakeven_points, capital_trades, capital_wins, capital_losses, capital_net_profit, symbols_evaluated, symbols_with_trades)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
ON CONFLICT (run_id) DO UPDATE SET
  trade_date = EXCLUDED.trade_date,
  total_trades = EXCLUDED.total_trades,
  wins = EXCLUDED.wins,
  losses = EXCLUDED.losses,
  win_rate = EXCLUDED.win_rate,
  total_gross_profit = EXCLUDED.total_gross_profit,
  total_charges = EXCLUDED.total_charges,
  total_net_profit = EXCLUDED.total_net_profit,
  average_breakeven_points = EXCLUDED.average_breakeven_points,
  capital_trades = EXCLUDED.capital_trades,
  capital_wins = EXCLUDED.capital_wins,
  capital_losses = EXCLUDED.capital_losses,
  capital_net_profit = EXCLUDED.capital_net_profit,
  symbols_evaluated = EXCLUDED.symbols_evaluated,
  symbols_with_trades = EXCLUDED.symbols_with_trades,
  created_at = now()`, pgx.Identifier{schema, "a02_backtest_runs"}.Sanitize())
	_, err := tx.Exec(ctx, stmt, result.RunID, result.TradeDate, summary.TotalTrades, summary.Wins, summary.Losses, summary.WinRate, summary.TotalGrossProfit, summary.TotalCharges, summary.TotalNetProfit, summary.AverageBreakevenPoints, summary.CapitalTrades, summary.CapitalWins, summary.CapitalLosses, summary.CapitalNetProfit, result.SymbolsEvaluated, result.SymbolsWithTrades)
	return err
}

func upsertA02StatsTx(ctx context.Context, schema string, tx pgx.Tx, result A02RunResult) error {
	summary := result.Summary
	stmt := fmt.Sprintf(`
INSERT INTO %s
  (run_id, trade_date, duration_min_minutes, duration_max_minutes, duration_avg_minutes, duration_median_minutes, duration_std_minutes, total_gross_profit, total_charges, total_net_profit, average_breakeven_points, capital_trades, capital_wins, capital_losses, capital_net_profit, symbols_evaluated, symbols_with_trades)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
ON CONFLICT (run_id) DO UPDATE SET
  trade_date = EXCLUDED.trade_date,
  duration_min_minutes = EXCLUDED.duration_min_minutes,
  duration_max_minutes = EXCLUDED.duration_max_minutes,
  duration_avg_minutes = EXCLUDED.duration_avg_minutes,
  duration_median_minutes = EXCLUDED.duration_median_minutes,
  duration_std_minutes = EXCLUDED.duration_std_minutes,
  total_gross_profit = EXCLUDED.total_gross_profit,
  total_charges = EXCLUDED.total_charges,
  total_net_profit = EXCLUDED.total_net_profit,
  average_breakeven_points = EXCLUDED.average_breakeven_points,
  capital_trades = EXCLUDED.capital_trades,
  capital_wins = EXCLUDED.capital_wins,
  capital_losses = EXCLUDED.capital_losses,
  capital_net_profit = EXCLUDED.capital_net_profit,
  symbols_evaluated = EXCLUDED.symbols_evaluated,
  symbols_with_trades = EXCLUDED.symbols_with_trades,
  created_at = now()`, pgx.Identifier{schema, "a02_backtest_daily_stats"}.Sanitize())
	_, err := tx.Exec(ctx, stmt, result.RunID, result.TradeDate, summary.DurationMin, summary.DurationMax, summary.DurationAvg, summary.DurationMedian, summary.DurationStd, summary.TotalGrossProfit, summary.TotalCharges, summary.TotalNetProfit, summary.AverageBreakevenPoints, summary.CapitalTrades, summary.CapitalWins, summary.CapitalLosses, summary.CapitalNetProfit, result.SymbolsEvaluated, result.SymbolsWithTrades)
	return err
}

func insertLiveSignal(ctx context.Context, st *store.Store, runID time.Time, trade A02Trade) (bool, error) {
	stmt := fmt.Sprintf(`
INSERT INTO %s
  (run_id, exchange, symbol_token, symbol, tradingsymbol, entry_time, entry_close, success, gain_pct, percentile)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
ON CONFLICT (run_id, symbol_token, entry_time) DO NOTHING
RETURNING symbol_token`, pgx.Identifier{st.Schema, "a02_backtest_live_signals"}.Sanitize())
	var token string
	row := st.Pool.QueryRow(ctx, stmt, runID, trade.Exchange, trade.SymbolToken, trade.Symbol, trade.TradingSymbol, trade.EntryTime, trade.EntryClose, trade.Success, trade.GainPct, trade.Percentile)
	if err := row.Scan(&token); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func upsertLiveStream(ctx context.Context, st *store.Store, runID time.Time, trade A02Trade) error {
	stmt := fmt.Sprintf(`
INSERT INTO %s
  (run_id, exchange, symbol_token, symbol, tradingsymbol, entry_time, entry_close, success, gain_pct, percentile)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
ON CONFLICT (run_id, symbol_token, entry_time) DO NOTHING`, pgx.Identifier{st.Schema, "a02_backtest_live_stream"}.Sanitize())
	_, err := st.Pool.Exec(ctx, stmt, runID, trade.Exchange, trade.SymbolToken, trade.Symbol, trade.TradingSymbol, trade.EntryTime, trade.EntryClose, trade.Success, trade.GainPct, trade.Percentile)
	return err
}

func upsertLiveStatus(ctx context.Context, st *store.Store, runID time.Time, trade A02Trade) error {
	row := liveStatusRow{
		Key:             trade.SymbolToken,
		Exchange:        trade.Exchange,
		SymbolToken:     trade.SymbolToken,
		Symbol:          trade.Symbol,
		TradingSymbol:   trade.TradingSymbol,
		LastEntryTime:   trade.EntryTime,
		LastRunID:       runID,
		LastEntryClose:  trade.EntryClose,
		LastSuccess:     trade.Success,
		LastGainPct:     trade.GainPct,
		LastInsertCount: 1,
		UpdatedAt:       time.Now().UTC(),
	}
	return upsertLiveStatusRow(ctx, st, row)
}

func execBatch(ctx context.Context, st *store.Store, op string, batch *pgx.Batch) error {
	start := time.Now()
	br := st.Pool.SendBatch(ctx, batch)
	defer br.Close()
	var err error
	for i := 0; i < batch.Len(); i++ {
		if _, execErr := br.Exec(); execErr != nil {
			err = execErr
			break
		}
	}
	if st.Logger != nil {
		fields := []any{"op", op, "duration_ms", time.Since(start).Milliseconds(), "batch_len", batch.Len()}
		if err != nil {
			st.Logger.Warn("sql_error", append(fields, "err", err)...)
		} else {
			st.Logger.Debug("sql_ok", fields...)
		}
	}
	return err
}

func upsertLiveStatusRow(ctx context.Context, st *store.Store, row liveStatusRow) error {
	stmt := fmt.Sprintf(`
INSERT INTO %s
  (key, exchange, symbol_token, symbol, tradingsymbol, last_entry_time, last_run_id, last_entry_close, last_success, last_gain_pct, last_insert_count, updated_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
ON CONFLICT (key) DO UPDATE SET
  exchange = EXCLUDED.exchange,
  symbol_token = EXCLUDED.symbol_token,
  symbol = EXCLUDED.symbol,
  tradingsymbol = EXCLUDED.tradingsymbol,
  last_entry_time = EXCLUDED.last_entry_time,
  last_run_id = EXCLUDED.last_run_id,
  last_entry_close = EXCLUDED.last_entry_close,
  last_success = EXCLUDED.last_success,
  last_gain_pct = EXCLUDED.last_gain_pct,
  last_insert_count = EXCLUDED.last_insert_count,
  updated_at = EXCLUDED.updated_at`, pgx.Identifier{st.Schema, "a02_backtest_live_status"}.Sanitize())
	_, err := st.Pool.Exec(ctx, stmt, row.Key, nullableString(row.Exchange), nullableString(row.SymbolToken), nullableString(row.Symbol), nullableString(row.TradingSymbol), row.LastEntryTime, row.LastRunID, row.LastEntryClose, row.LastSuccess, row.LastGainPct, row.LastInsertCount, row.UpdatedAt)
	return err
}

func nullableString(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}
