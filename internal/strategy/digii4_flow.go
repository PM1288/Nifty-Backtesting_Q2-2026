package strategy

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"trading-stack/internal/config"
	"trading-stack/internal/store"
)

type digii4Target struct {
	Exchange      string
	Token         string
	Symbol        string
	TradingSymbol string
	Source        string
}

type selectorStage struct {
	Label   string
	Count   int
	Symbols []string
}

const digii4ManualTrackersStateName = "digii4_flow:manual_trackers"
const digii4AutoRSIWillRNote = "auto:digii4_flow"

type digii4ManualTrackersState struct {
	Symbols   []string  `json:"symbols"`
	UpdatedAt time.Time `json:"updated_at,omitempty"`
}

type digii4FlowState struct {
	currentDate       string
	startupSent       bool
	targetsDate       string
	targets           map[string]digii4Target
	alerted           map[string]string
	monitorStartDate  string
	monitorClosedDate string
	lastEntryScan     string
	eodReportedDate   string
	vixAlertedDate    string
	niftyLevelAlerts  map[string]string
	silverLevelAlerts map[string]string
	silverJumpDate    string
	lastSilverCheck   string
	lastSumCheck      string
}

type digii4AutoCandidate struct {
	target     digii4Target
	rsi        float64
	willr      float64
	percentile float64
}

func (e *Engine) runDigii4Flow(ctx context.Context, now time.Time) error {
	cfg := e.cfg.Digii4Flow
	if !cfg.Enable {
		return nil
	}
	local := now.In(e.loc)
	dateKey := local.Format("2006-01-02")
	if e.logger != nil {
		e.logger.Info("digii4_flow_tick", "ts", local.Format("15:04"), "date", dateKey)
	}
	if e.digii4State.currentDate != dateKey {
		e.digii4State.currentDate = dateKey
		e.digii4State.startupSent = false
		e.digii4State.targetsDate = ""
		e.digii4State.targets = map[string]digii4Target{}
		e.digii4State.alerted = map[string]string{}
		e.digii4State.monitorStartDate = ""
		e.digii4State.monitorClosedDate = ""
		e.digii4State.eodReportedDate = ""
		e.digii4State.niftyLevelAlerts = map[string]string{}
		e.digii4State.silverLevelAlerts = map[string]string{}
		e.digii4State.silverJumpDate = ""
		e.digii4State.lastSilverCheck = ""
		e.digii4State.lastSumCheck = ""
		e.digii4State.vixAlertedDate = ""
		e.digii4State.lastEntryScan = ""
		if e.logger != nil {
			e.logger.Info("digii4_flow_reset", "date", dateKey)
		}
	}
	startAt, err := parseDailyTime(local, cfg.StartupAfter, e.loc)
	if err != nil {
		return err
	}
	if local.Before(startAt) {
		if e.logger != nil {
			e.logger.Info("digii4_flow_wait_startup", "startup_after", cfg.StartupAfter)
		}
		return nil
	}
	if !e.digii4State.startupSent {
		tradingDay, dataOK, dataCount, total := e.digii4StartupCheck(ctx, local, cfg)
		msg := fmt.Sprintf("%s trading=%t data=%t (%d/%d)", dateKey, tradingDay, dataOK, dataCount, total)
		e.sendDigii4Alert(ctx, "STOCK STARTUP", msg)
		e.digii4State.startupSent = true
		if e.logger != nil {
			e.logger.Info("digii4_flow_startup_sent", "trading_day", tradingDay, "data_ok", dataOK, "count", dataCount, "total", total)
		}
	}
	if e.digii4State.vixAlertedDate != dateKey {
		if ok, change := e.checkVixJump(ctx, local, cfg); ok {
			msg := fmt.Sprintf("INDIAVIX +%.2f%%", change)
			e.sendDigii4Alert(ctx, "STOCK VIX JUMP", msg)
			e.digii4State.vixAlertedDate = dateKey
			if e.logger != nil {
				e.logger.Info("digii4_flow_vix_jump", "change_pct", change)
			}
		}
	}
	e.checkSilverHourly(ctx, local, cfg)
	e.checkSumHourly(ctx, local, cfg)
	if e.digii4State.targetsDate != dateKey {
		scanTime, err := parseDailyTime(local, cfg.DailyScanTime, e.loc)
		if err != nil {
			return err
		}
		if !local.Before(scanTime) {
			targets, message, err := e.buildDigii4Targets(ctx, local, cfg)
			if err != nil {
				return err
			}
			if err := e.syncDigii4TargetsToRSIWillR(ctx, targets); err != nil {
				return err
			}
			e.digii4State.targets = targets
			e.digii4State.targetsDate = dateKey
			e.sendDigii4Alert(ctx, "STOCK DAILY PICKS", message)
			if e.logger != nil {
				e.logger.Info("digii4_flow_daily_picks", "targets", len(targets), "message", message)
			}
		} else if e.logger != nil {
			e.logger.Info("digii4_flow_wait_scan", "daily_scan_time", cfg.DailyScanTime)
		}
	}
	if len(e.digii4State.targets) == 0 {
		if e.logger != nil {
			e.logger.Info("digii4_flow_no_targets")
		}
		return nil
	}
	if outsideMarketHours(local, e.cfg.Runtime.TradingStart, e.cfg.Runtime.TradingEnd, e.loc) {
		if err := e.handleDigii4EOD(ctx, local); err != nil && e.logger != nil {
			e.logger.Warn("digii4_flow_eod_failed", "err", err)
		}
		if e.logger != nil {
			e.logger.Info("digii4_flow_outside_hours")
		}
		return nil
	}
	e.checkNiftyLevel(ctx, local, cfg)
	monitorStart, err := parseDailyTime(local, cfg.EntryMonitorStart, e.loc)
	if err != nil {
		return err
	}
	monitorEnd, err := parseDailyTime(local, cfg.EntryMonitorEnd, e.loc)
	if err != nil {
		return err
	}
	if !local.Before(monitorStart) && local.Before(monitorEnd) && e.digii4State.monitorStartDate != dateKey {
		msg := fmt.Sprintf("%s monitor active %s-%s targets=%d", dateKey, cfg.EntryMonitorStart, cfg.EntryMonitorEnd, len(e.digii4State.targets))
		e.sendDigii4Alert(ctx, "STOCK ENTRY MONITOR", msg)
		e.digii4State.monitorStartDate = dateKey
	}
	if local.Before(monitorStart) {
		if e.logger != nil {
			e.logger.Info("digii4_flow_wait_monitor_start", "entry_monitor_start", cfg.EntryMonitorStart)
		}
		return nil
	}
	if !local.Before(monitorEnd) {
		if e.digii4State.monitorClosedDate != dateKey {
			msg := fmt.Sprintf("%s entry window closed at %s alerted=%d", dateKey, cfg.EntryMonitorEnd, len(e.digii4State.alerted))
			e.sendDigii4Alert(ctx, "STOCK ENTRY CLOSED", msg)
			e.digii4State.monitorClosedDate = dateKey
		}
		return nil
	}
	minuteKey := local.Format("2006-01-02 15:04")
	if e.digii4State.lastEntryScan == minuteKey {
		return nil
	}
	e.digii4State.lastEntryScan = minuteKey
	if e.logger != nil {
		e.logger.Info("digii4_flow_entry_scan", "minute", minuteKey, "targets", len(e.digii4State.targets))
	}
	return e.evaluateDigii4Entries(ctx, local, cfg)
}

func (e *Engine) digii4StartupCheck(ctx context.Context, now time.Time, cfg config.Digii4FlowConfig) (bool, bool, int, int) {
	universe, err := fetchUniverse(ctx, e.store, cfg.UniverseName)
	if err != nil || len(universe) == 0 {
		return false, false, 0, 0
	}
	tokens := make([]string, 0, len(universe))
	for _, ref := range universe {
		tokens = append(tokens, ref.Token)
	}
	tradingDay := isTradingDay(ctx, e.store, now, e.loc)
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, e.loc)
	lookbackStart := start.AddDate(0, 0, -7)
	bars, err := fetchDailyBars(ctx, e.store, "NSE", tokens, lookbackStart)
	if err != nil {
		return tradingDay, false, 0, len(tokens)
	}
	dataCount := 0
	for _, series := range bars {
		if len(series) == 0 {
			continue
		}
		lastIdx := latestDailyIndexOnOrBefore(series, start, e.loc)
		if lastIdx < 0 {
			continue
		}
		last := series[lastIdx]
		lastDate := time.Date(last.Date.In(e.loc).Year(), last.Date.In(e.loc).Month(), last.Date.In(e.loc).Day(), 0, 0, 0, 0, e.loc)
		ageDays := int(start.Sub(lastDate).Hours() / 24)
		if ageDays <= 4 {
			dataCount++
		}
	}
	return tradingDay, dataCount > 0, dataCount, len(tokens)
}

func (e *Engine) buildDigii4Targets(ctx context.Context, now time.Time, cfg config.Digii4FlowConfig) (map[string]digii4Target, string, error) {
	universe, err := fetchUniverse(ctx, e.store, cfg.UniverseName)
	if err != nil {
		return nil, "", err
	}
	if len(universe) == 0 {
		return map[string]digii4Target{}, "targets 0", nil
	}
	tokens := make([]string, 0, len(universe))
	refByToken := make(map[string]instrumentRef, len(universe))
	for _, ref := range universe {
		tokens = append(tokens, ref.Token)
		refByToken[ref.Token] = ref
	}
	start := now.AddDate(0, 0, -cfg.DaysBack)
	dailyBars, err := fetchDailyBars(ctx, e.store, "NSE", tokens, start)
	if err != nil {
		return nil, "", err
	}

	stageName := func(token string) string {
		ref, ok := refByToken[token]
		if !ok {
			return strings.TrimSpace(token)
		}
		name := strings.TrimSpace(ref.TradingSymbol)
		if name == "" {
			name = strings.TrimSpace(ref.Underlying)
		}
		if name == "" {
			name = strings.TrimSpace(token)
		}
		return name
	}
	addStagePass := func(stages []selectorStage, index int, token string) {
		if index < 0 || index >= len(stages) {
			return
		}
		stages[index].Count++
		stages[index].Symbols = append(stages[index].Symbols, stageName(token))
	}

	ratioCap := e.cfg.Backtest.VolumeMedianMaxRatio
	if ratioCap <= 0 {
		ratioCap = 1
	}
	stages := []selectorStage{
		{Label: fmt.Sprintf("Select on day wise data percentile < %.0f", cfg.MaxPercentile)},
		{Label: fmt.Sprintf("and rsi < %.0f and willR < %.0f", cfg.DailyRSIMax, cfg.DailyWillRMax)},
		{Label: "low > prev low"},
		{Label: "today open > prev close"},
		{Label: "RSI improving i.e today rsi < yesterday rsi"},
		{Label: fmt.Sprintf("Previous volume <= median-volume ratio cap (%.2fx)", ratioCap)},
	}

	desiredAutoCount := cfg.DailyTargetCount
	if desiredAutoCount < 1 {
		desiredAutoCount = 10
	}
	targets := make(map[string]digii4Target)
	strictCandidates := make([]digii4AutoCandidate, 0)
	fallbackCandidates := make([]digii4AutoCandidate, 0)
	indicatorCandidates := make([]digii4AutoCandidate, 0)
	seenFallback := make(map[string]struct{})
	seenIndicator := make(map[string]struct{})
	tradeDate := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, e.loc)
	for token, series := range dailyBars {
		lastIdx := latestDailyIndexOnOrBefore(series, tradeDate, e.loc)
		if lastIdx < 1 {
			continue
		}
		last := series[lastIdx]
		prev := series[lastIdx-1]
		window := series[:lastIdx+1]
		closes := extractDailyCloses(window)
		highs := extractDailyHighs(window)
		lows := extractDailyLows(window)
		volumes := extractDailyVolumes(window)
		if len(closes) < maxInt(cfg.DailyRSIPeriod+1, cfg.DailyWillRPeriod) {
			continue
		}
		percentile := percentileRank(closes, last.Close)
		if percentile >= cfg.MaxPercentile {
			continue
		}
		addStagePass(stages, 0, token)

		rsiToday := rsi(closes, cfg.DailyRSIPeriod)
		rsiPrev := rsi(closes[:len(closes)-1], cfg.DailyRSIPeriod)
		willrToday := willr(highs, lows, closes, cfg.DailyWillRPeriod)
		if rsiToday == 0 || rsiPrev == 0 || willrToday == 0 {
			continue
		}
		if rsiToday >= cfg.DailyRSIMax {
			continue
		}
		if willrToday >= cfg.DailyWillRMax {
			continue
		}
		addStagePass(stages, 1, token)
		ref := refByToken[token]
		if _, ok := seenIndicator[token]; !ok {
			seenIndicator[token] = struct{}{}
			indicatorCandidates = append(indicatorCandidates, digii4AutoCandidate{
				target: digii4Target{
					Exchange:      ref.Exchange,
					Token:         token,
					Symbol:        ref.TradingSymbol,
					TradingSymbol: ref.TradingSymbol,
					Source:        "auto_indicator_fallback",
				},
				rsi:        rsiToday,
				willr:      willrToday,
				percentile: percentile,
			})
		}

		if last.Low <= prev.Low {
			continue
		}
		addStagePass(stages, 2, token)

		if last.Open <= prev.Close {
			continue
		}
		addStagePass(stages, 3, token)

		if rsiToday >= rsiPrev {
			continue
		}
		addStagePass(stages, 4, token)
		candidate := digii4AutoCandidate{
			target: digii4Target{
				Exchange:      ref.Exchange,
				Token:         token,
				Symbol:        ref.TradingSymbol,
				TradingSymbol: ref.TradingSymbol,
				Source:        "auto_rsi_fallback",
			},
			rsi:        rsiToday,
			willr:      willrToday,
			percentile: percentile,
		}
		if _, ok := seenFallback[token]; !ok {
			seenFallback[token] = struct{}{}
			fallbackCandidates = append(fallbackCandidates, candidate)
		}

		volumeLookback := e.cfg.Backtest.VolumeLookback
		if volumeLookback <= 0 {
			volumeLookback = 10
		}
		volStart := len(volumes) - 1 - volumeLookback
		if volStart < 0 {
			volStart = 0
		}
		volMedian := medianFloat64(volumes[volStart : len(volumes)-1])
		if volMedian > 0 && float64(prev.Volume) > volMedian*ratioCap {
			continue
		}
		addStagePass(stages, 5, token)
		candidate.target.Source = "auto"
		strictCandidates = append(strictCandidates, candidate)
	}

	sortDigii4AutoCandidates(strictCandidates)
	for _, candidate := range strictCandidates {
		if len(targets) >= desiredAutoCount {
			break
		}
		targets[candidate.target.Token] = candidate.target
	}

	fallbackAdded := 0
	fallbackAddedNames := make([]string, 0)
	if len(targets) < desiredAutoCount && len(fallbackCandidates) > 0 {
		sortDigii4AutoCandidates(fallbackCandidates)
		for _, candidate := range fallbackCandidates {
			if len(targets) >= desiredAutoCount {
				break
			}
			if _, ok := targets[candidate.target.Token]; ok {
				continue
			}
			target := candidate.target
			exchange := strings.TrimSpace(target.Exchange)
			if exchange == "" {
				exchange = "NSE"
			}
			tradingSymbol := strings.TrimSpace(target.TradingSymbol)
			if tradingSymbol == "" {
				tradingSymbol = strings.TrimSpace(stageName(target.Token))
			}
			if tradingSymbol == "" {
				tradingSymbol = strings.TrimSpace(target.Token)
			}
			target.Exchange = exchange
			target.Symbol = tradingSymbol
			target.TradingSymbol = tradingSymbol
			targets[target.Token] = target
			fallbackAdded++
			fallbackAddedNames = append(fallbackAddedNames, tradingSymbol)
		}
	}
	if len(targets) < desiredAutoCount && len(indicatorCandidates) > 0 {
		sortDigii4AutoCandidates(indicatorCandidates)
		for _, candidate := range indicatorCandidates {
			if len(targets) >= desiredAutoCount {
				break
			}
			if _, ok := targets[candidate.target.Token]; ok {
				continue
			}
			target := candidate.target
			exchange := strings.TrimSpace(target.Exchange)
			if exchange == "" {
				exchange = "NSE"
			}
			tradingSymbol := strings.TrimSpace(target.TradingSymbol)
			if tradingSymbol == "" {
				tradingSymbol = strings.TrimSpace(stageName(target.Token))
			}
			if tradingSymbol == "" {
				tradingSymbol = strings.TrimSpace(target.Token)
			}
			target.Exchange = exchange
			target.Symbol = tradingSymbol
			target.TradingSymbol = tradingSymbol
			targets[target.Token] = target
			fallbackAdded++
			fallbackAddedNames = append(fallbackAddedNames, tradingSymbol)
		}
	}

	manualAdded := 0
	manualAddedNames := make([]string, 0)
	manualSymbols := append([]string{}, cfg.ManualSymbols...)
	manualSymbols = append(manualSymbols, e.loadDigii4ManualSymbols(ctx)...)
	manualSymbols = normalizeManualSymbols(manualSymbols)
	if len(manualSymbols) > 0 {
		tokenMap, _ := resolveTokensBySymbol(ctx, e.store, "NSE", manualSymbols)
		missing := make([]string, 0)
		for _, sym := range manualSymbols {
			if tokenMap[sym] == "" {
				missing = append(missing, sym)
			}
		}
		if len(missing) > 0 {
			if bseMap, err := resolveTokensBySymbol(ctx, e.store, "BSE", missing); err == nil {
				for sym, token := range bseMap {
					if token != "" {
						tokenMap[sym] = token
					}
				}
			}
		}
		for _, sym := range manualSymbols {
			token := tokenMap[sym]
			if token == "" {
				continue
			}
			if _, ok := targets[token]; ok {
				continue
			}
			exchange := "NSE"
			ref, ok := refByToken[token]
			if ok && strings.TrimSpace(ref.Exchange) != "" {
				exchange = ref.Exchange
			}
			tradingSymbol := sym
			if !strings.Contains(tradingSymbol, "-") {
				tradingSymbol += "-EQ"
			}
			if ok && strings.TrimSpace(ref.TradingSymbol) != "" {
				tradingSymbol = ref.TradingSymbol
			}
			targets[token] = digii4Target{
				Exchange:      exchange,
				Token:         token,
				Symbol:        tradingSymbol,
				TradingSymbol: tradingSymbol,
				Source:        "manual",
			}
			manualAdded++
			manualAddedNames = append(manualAddedNames, tradingSymbol)
		}
	}
	message := buildTargetsMessage(now, e.loc, stages, targets, desiredAutoCount, fallbackAdded, fallbackAddedNames, manualAdded, manualAddedNames)
	return targets, message, nil
}

func (e *Engine) evaluateDigii4Entries(ctx context.Context, now time.Time, cfg config.Digii4FlowConfig) error {
	tokensByExchange := map[string][]string{}
	for _, target := range e.digii4State.targets {
		tokensByExchange[target.Exchange] = append(tokensByExchange[target.Exchange], target.Token)
	}
	lookback := time.Duration(cfg.EntryLookbackMinutes) * time.Minute
	start := now.Add(-lookback)
	for exchange, tokens := range tokensByExchange {
		barsByToken, err := fetchMinuteBars(ctx, e.store, exchange, tokens, start)
		if err != nil {
			return err
		}
		for _, token := range tokens {
			if e.digii4State.alerted[token] == e.digii4State.currentDate {
				continue
			}
			bars := barsByToken[token]
			if len(bars) == 0 {
				continue
			}
			closes := extractMinuteCloses(bars)
			highs := extractMinuteHighs(bars)
			lows := extractMinuteLows(bars)
			if len(closes) < maxInt(cfg.EntryRSIPeriod+1, cfg.EntryWillRPeriod) || len(bars) < 2 {
				continue
			}
			rsiVal := rsi(closes, cfg.EntryRSIPeriod)
			willrVal := willr(highs, lows, closes, cfg.EntryWillRPeriod)
			last := bars[len(bars)-1]
			prevBar := bars[len(bars)-2]
			if rsiVal == 0 || willrVal == 0 {
				continue
			}
			if rsiVal >= cfg.EntryRSIThreshold {
				continue
			}
			if willrVal >= cfg.EntryWillRThreshold {
				continue
			}
			if last.Low <= prevBar.Low {
				continue
			}
			target := e.digii4State.targets[token]
			if e.cfg.Paper.Enable && e.cfg.Paper.AutoPlace {
				if err := e.placeDigii4PaperTrade(ctx, target, last.Close, rsiVal, willrVal); err != nil && e.logger != nil {
					e.logger.Warn("digii4_flow_paper_place_failed", "token", token, "err", err)
				}
			}
			dayHigh := maxMinuteHigh(bars)
			capitalText := formatCapitalTargets(last.Close, dayHigh, cfg.AlertCapitals, e.cfg.Backtest.EquityIntradayTargetNet, e.cfg.Paper.BrokeragePerTrade)
			source := strings.ToUpper(strings.TrimSpace(target.Source))
			if source == "" {
				source = "AUTO"
			}
			message := fmt.Sprintf("%s BUY src=%s t=%s px=%.2f rsi=%.1f willr=%.1f low=%.2f>prev=%.2f dayHigh=%.2f %s", target.Symbol, source, last.Ts.In(e.loc).Format("15:04"), last.Close, rsiVal, willrVal, last.Low, prevBar.Low, dayHigh, capitalText)
			e.sendDigii4Alert(ctx, "STOCK BUY", message)
			e.digii4State.alerted[token] = e.digii4State.currentDate
		}
	}
	return nil
}

func (e *Engine) checkVixJump(ctx context.Context, now time.Time, cfg config.Digii4FlowConfig) (bool, float64) {
	vixToken := strings.TrimSpace(e.cfg.Strategy.VIXToken)
	if vixToken == "" {
		return false, 0
	}
	start := now.AddDate(0, 0, -10)
	seriesMap, err := fetchDailyBars(ctx, e.store, "NSE", []string{vixToken}, start)
	if err != nil {
		return false, 0
	}
	series := seriesMap[vixToken]
	if len(series) < 2 {
		return false, 0
	}
	last := series[len(series)-1]
	prev := series[len(series)-2]
	tradeDate := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, e.loc)
	if !sameDateInLoc(last.Date, tradeDate, e.loc) {
		return false, 0
	}
	if prev.Close == 0 {
		return false, 0
	}
	change := (last.Close/prev.Close - 1) * 100
	if change >= cfg.VIXJumpThresholdPct {
		return true, change
	}
	return false, change
}

func (e *Engine) checkNiftyLevel(ctx context.Context, now time.Time, cfg config.Digii4FlowConfig) {
	token := strings.TrimSpace(cfg.NiftyLevelToken)
	if token == "" {
		return
	}
	prices, err := fetchInstrumentPrices(ctx, e.store, "NSE", []string{token})
	if err != nil {
		return
	}
	price := prices[token]
	if price == 0 {
		return
	}
	step := cfg.NiftyLevelStep
	if step <= 0 {
		step = 100
	}
	buffer := cfg.NiftyLevelBuffer
	if buffer < 0 {
		buffer = 0
	}
	level := math.Round(price/step) * step
	if math.Abs(price-level) > buffer {
		return
	}
	key := fmt.Sprintf("%s-%d", now.Format("2006-01-02"), int(level))
	if e.digii4State.niftyLevelAlerts == nil {
		e.digii4State.niftyLevelAlerts = map[string]string{}
	}
	if _, ok := e.digii4State.niftyLevelAlerts[key]; ok {
		return
	}
	msg := fmt.Sprintf("NIFTY ~%.0f (±%.0f) px=%.2f", level, buffer, price)
	e.sendDigii4Alert(ctx, "STOCK NIFTY LEVEL", msg)
	e.digii4State.niftyLevelAlerts[key] = now.Format("15:04")
}

func (e *Engine) checkSilverHourly(ctx context.Context, now time.Time, cfg config.Digii4FlowConfig) {
	interval := cfg.SilverCheckIntervalMinutes
	if interval <= 0 {
		interval = 60
	}
	minKey := now.Format("2006-01-02 15:04")
	if e.digii4State.lastSilverCheck == minKey {
		return
	}
	if interval > 1 {
		minute := now.Minute()
		if minute%interval != 0 {
			return
		}
	}
	e.digii4State.lastSilverCheck = minKey
	token, symbol := e.resolveLatestSilverFuture(ctx, now, cfg)
	if token == "" {
		return
	}
	e.checkSilverLevel(ctx, now, cfg, token, symbol)
	e.checkSilverJump(ctx, now, cfg, token, symbol)
}

func (e *Engine) resolveLatestSilverFuture(ctx context.Context, now time.Time, cfg config.Digii4FlowConfig) (string, string) {
	exchange := strings.TrimSpace(cfg.SilverExchange)
	if exchange == "" {
		exchange = "MCX"
	}
	underlying := strings.ToUpper(strings.TrimSpace(cfg.SilverUnderlying))
	if underlying == "" {
		underlying = "SILVER"
	}
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	query := fmt.Sprintf(`SELECT symbol_token, tradingsymbol
FROM %s
WHERE exchange = $1
  AND instrumenttype ILIKE 'FUT%%'
  AND (name ILIKE $2 OR tradingsymbol ILIKE $2)
  AND expiry >= $3
ORDER BY expiry ASC
LIMIT 1`, pgx.Identifier{e.store.Schema, "instruments"}.Sanitize())
	var token, symbol string
	if err := e.store.Pool.QueryRow(ctx, query, exchange, underlying+"%", today).Scan(&token, &symbol); err == nil {
		return token, symbol
	}
	query = fmt.Sprintf(`SELECT symbol_token, tradingsymbol
FROM %s
WHERE exchange = $1
  AND instrumenttype ILIKE 'FUT%%'
  AND (name ILIKE $2 OR tradingsymbol ILIKE $2)
ORDER BY expiry DESC NULLS LAST
LIMIT 1`, pgx.Identifier{e.store.Schema, "instruments"}.Sanitize())
	if err := e.store.Pool.QueryRow(ctx, query, exchange, underlying+"%").Scan(&token, &symbol); err == nil {
		return token, symbol
	}
	return "", ""
}

func (e *Engine) checkSilverLevel(ctx context.Context, now time.Time, cfg config.Digii4FlowConfig, token, symbol string) {
	exchange := strings.TrimSpace(cfg.SilverExchange)
	prices, err := fetchInstrumentPrices(ctx, e.store, exchange, []string{token})
	if err != nil {
		return
	}
	price := prices[token]
	if price == 0 {
		return
	}
	step := cfg.SilverLevelStep
	if step <= 0 {
		step = 100000
	}
	buffer := cfg.SilverLevelBuffer
	if buffer < 0 {
		buffer = 0
	}
	level := math.Round(price/step) * step
	if math.Abs(price-level) > buffer {
		return
	}
	key := fmt.Sprintf("%s-%d", now.Format("2006-01-02"), int(level))
	if e.digii4State.silverLevelAlerts == nil {
		e.digii4State.silverLevelAlerts = map[string]string{}
	}
	if _, ok := e.digii4State.silverLevelAlerts[key]; ok {
		return
	}
	msg := fmt.Sprintf("%s ~%.0f (±%.0f) px=%.2f", strings.ToUpper(symbol), level, buffer, price)
	e.sendDigii4Alert(ctx, "STOCK SILVER LEVEL", msg)
	e.digii4State.silverLevelAlerts[key] = now.Format("15:04")
}

func (e *Engine) checkSilverJump(ctx context.Context, now time.Time, cfg config.Digii4FlowConfig, token, symbol string) {
	dateKey := now.In(e.loc).Format("2006-01-02")
	if e.digii4State.silverJumpDate == dateKey {
		return
	}
	exchange := strings.TrimSpace(cfg.SilverExchange)
	start := now.AddDate(0, 0, -10)
	seriesMap, err := fetchDailyBars(ctx, e.store, exchange, []string{token}, start)
	if err != nil {
		return
	}
	series := seriesMap[token]
	if len(series) < 2 {
		return
	}
	last := series[len(series)-1]
	prev := series[len(series)-2]
	tradeDate := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, e.loc)
	if !sameDateInLoc(last.Date, tradeDate, e.loc) {
		return
	}
	if prev.Close == 0 {
		return
	}
	change := (last.Close/prev.Close - 1) * 100
	if change >= cfg.SilverJumpThresholdPct {
		msg := fmt.Sprintf("%s +%.2f%%", strings.ToUpper(symbol), change)
		e.sendDigii4Alert(ctx, "STOCK SILVER JUMP", msg)
		e.digii4State.silverJumpDate = dateKey
	}
}

func (e *Engine) checkSumHourly(ctx context.Context, now time.Time, cfg config.Digii4FlowConfig) {
	interval := cfg.SumCheckIntervalMinutes
	if interval <= 0 {
		interval = 60
	}
	minKey := now.Format("2006-01-02 15:04")
	if e.digii4State.lastSumCheck == minKey {
		return
	}
	if interval > 1 {
		minute := now.Minute()
		if minute%interval != 0 {
			return
		}
	}
	e.digii4State.lastSumCheck = minKey
	if len(cfg.SumSymbols) == 0 {
		return
	}
	symbols := make([]string, 0, len(cfg.SumSymbols))
	for _, sym := range cfg.SumSymbols {
		clean := strings.TrimSpace(sym)
		if clean != "" {
			symbols = append(symbols, strings.ToUpper(clean))
		}
	}
	if len(symbols) == 0 {
		return
	}
	exchange := "NSE"
	tokenMap, err := resolveTokensBySymbol(ctx, e.store, exchange, symbols)
	if err != nil {
		return
	}
	tokenExchange := map[string]string{}
	for _, token := range tokenMap {
		if token != "" {
			tokenExchange[token] = exchange
		}
	}
	missing := make([]string, 0)
	for _, sym := range symbols {
		if tokenMap[sym] == "" {
			missing = append(missing, sym)
		}
	}
	if len(missing) > 0 {
		altMap, err := resolveTokensBySymbol(ctx, e.store, "BSE", missing)
		if err == nil {
			for sym, token := range altMap {
				if token != "" {
					tokenMap[sym] = token
					tokenExchange[token] = "BSE"
				}
			}
		}
	}
	if e.logger != nil && len(missing) > 0 {
		stillMissing := make([]string, 0)
		for _, sym := range missing {
			if tokenMap[sym] == "" {
				stillMissing = append(stillMissing, sym)
			}
		}
		if len(stillMissing) > 0 {
			e.logger.Info("digii4_flow_sum_missing_tokens", "symbols", strings.Join(stillMissing, ","))
		}
	}
	tokensNSE := make([]string, 0)
	tokensBSE := make([]string, 0)
	for _, token := range tokenMap {
		if token == "" {
			continue
		}
		if tokenExchange[token] == "BSE" {
			tokensBSE = append(tokensBSE, token)
		} else {
			tokensNSE = append(tokensNSE, token)
		}
	}
	prices := map[string]float64{}
	if len(tokensNSE) > 0 {
		if priceMap, err := fetchInstrumentPrices(ctx, e.store, "NSE", tokensNSE); err == nil {
			for token, price := range priceMap {
				prices[token] = price
			}
		}
	}
	if len(tokensBSE) > 0 {
		if priceMap, err := fetchInstrumentPrices(ctx, e.store, "BSE", tokensBSE); err == nil {
			for token, price := range priceMap {
				prices[token] = price
			}
		}
	}
	sum := 0.0
	for _, sym := range symbols {
		token := tokenMap[sym]
		if token == "" {
			continue
		}
		sum += prices[token]
	}
	diff := sum - cfg.SumLogTarget
	if e.logger != nil {
		e.logger.Info("digii4_flow_sum_status", "sum", sum, "distance_to_target", diff, "target", cfg.SumLogTarget, "exchange", exchange)
	}
	if sum > cfg.SumAlertThreshold {
		msg := fmt.Sprintf("SUM %.2f (>%.0f)", sum, cfg.SumAlertThreshold)
		e.sendDigii4Alert(ctx, "STOCK SUM ALERT", msg)
	}
}

func (e *Engine) sendDigii4Alert(ctx context.Context, title, message string) {
	if e.digii4Alerts == nil {
		return
	}
	title = stripLegacyD4Prefix(strings.TrimSpace(title))
	message = stripLegacyD4Prefix(strings.TrimSpace(message))
	if len(title) > 40 {
		title = title[:40]
	}
	if len(message) > 800 {
		message = message[:800]
	}
	if err := e.digii4Alerts.Send(ctx, title, message); err != nil && e.logger != nil {
		e.logger.Error("digii4_flow_alert_failed", "title", title, "error", err)
	}
}

func stripLegacyD4Prefix(value string) string {
	clean := strings.TrimSpace(value)
	clean = strings.TrimPrefix(clean, "D4 ")
	clean = strings.TrimPrefix(clean, "D4_")
	clean = strings.TrimPrefix(clean, "D4-")
	return strings.TrimSpace(clean)
}

func buildTargetsMessage(now time.Time, loc *time.Location, stages []selectorStage, targets map[string]digii4Target, desiredAutoCount int, fallbackAdded int, fallbackAddedNames []string, manualAdded int, manualAddedNames []string) string {
	local := now.In(loc)
	lines := []string{
		fmt.Sprintf("Daily picks %s", local.Format("2006-01-02")),
		fmt.Sprintf("• Main backtesting strategy is ON : %s", local.Format("15:04")),
	}

	showNamesFrom := -1
	for i := 2; i < len(stages); i++ {
		if stages[i].Count < 5 {
			showNamesFrom = i
			break
		}
	}
	for i := range stages {
		stage := stages[i]
		sort.Strings(stage.Symbols)
		line := fmt.Sprintf("• %s : %d", stage.Label, stage.Count)
		if showNamesFrom >= 0 && i >= showNamesFrom && stage.Count > 0 {
			line += " [" + strings.Join(stage.Symbols, ", ") + "]"
		}
		lines = append(lines, line)
	}

	finalNames := make([]string, 0, len(targets))
	autoCount := 0
	manualCount := 0
	for _, target := range targets {
		name := strings.TrimSpace(target.Symbol)
		if name == "" {
			name = strings.TrimSpace(target.TradingSymbol)
		}
		if name != "" {
			finalNames = append(finalNames, name)
		}
		if strings.EqualFold(strings.TrimSpace(target.Source), "manual") {
			manualCount++
		} else {
			autoCount++
		}
	}
	sort.Strings(finalNames)
	sort.Strings(fallbackAddedNames)
	sort.Strings(manualAddedNames)
	lines = append(lines, fmt.Sprintf("• Final tracked picks : %d (auto=%d manual=%d)", len(targets), autoCount, manualCount))
	if fallbackAdded > 0 {
		lines = append(lines, fmt.Sprintf("• Fallback fill (RSI-improving + indicator) to <%d auto final : %d [%s]", desiredAutoCount, fallbackAdded, strings.Join(fallbackAddedNames, ", ")))
	}
	if manualAdded > 0 {
		lines = append(lines, fmt.Sprintf("• Manual symbols added today : %d [%s]", manualAdded, strings.Join(manualAddedNames, ", ")))
	}
	if len(finalNames) > 0 {
		lines = append(lines, "• Picks: "+strings.Join(finalNames, ", "))
	}
	message := strings.Join(lines, "\n")
	if len(message) > 790 {
		message = message[:790]
	}
	return message
}

func sortDigii4AutoCandidates(candidates []digii4AutoCandidate) {
	sort.Slice(candidates, func(i, j int) bool {
		if candidates[i].rsi != candidates[j].rsi {
			return candidates[i].rsi < candidates[j].rsi
		}
		if candidates[i].willr != candidates[j].willr {
			return candidates[i].willr < candidates[j].willr
		}
		if candidates[i].percentile != candidates[j].percentile {
			return candidates[i].percentile < candidates[j].percentile
		}
		return candidates[i].target.Token < candidates[j].target.Token
	})
}

func (e *Engine) syncDigii4TargetsToRSIWillR(ctx context.Context, targets map[string]digii4Target) error {
	if e.store == nil {
		return nil
	}

	existing, err := e.store.ListRSIWillRTargets(ctx, true)
	if err != nil {
		return err
	}

	existingByToken := make(map[string]store.RSIWillRTarget, len(existing))
	for _, row := range existing {
		if strings.TrimSpace(row.SymbolToken) == "" {
			continue
		}
		existingByToken[row.SymbolToken] = row
	}

	selectedTokens := make(map[string]struct{}, len(targets))
	for token, target := range targets {
		selectedTokens[token] = struct{}{}
		if current, ok := existingByToken[token]; ok && strings.TrimSpace(current.Notes) != digii4AutoRSIWillRNote {
			if !current.Active {
				current.Active = true
				if err := e.store.UpdateRSIWillRTarget(ctx, current); err != nil {
					return err
				}
			}
			continue
		}

		exchange := strings.TrimSpace(target.Exchange)
		if exchange == "" {
			exchange = "NSE"
		}
		symbol := strings.TrimSpace(target.Symbol)
		if symbol == "" {
			symbol = strings.TrimSpace(target.TradingSymbol)
		}
		if symbol == "" {
			symbol = strings.TrimSpace(token)
		}

		_, err := e.store.UpsertRSIWillRTarget(ctx, store.RSIWillRTarget{
			Exchange:       exchange,
			Symbol:         symbol,
			SymbolToken:    token,
			TradingSymbol:  symbol,
			DisplayName:    symbol,
			Active:         true,
			Notes:          digii4AutoRSIWillRNote,
			EnableRSIWillR: true,
			EnablePrice:    false,
		})
		if err != nil {
			return err
		}
	}

	for _, row := range existing {
		if strings.TrimSpace(row.Notes) != digii4AutoRSIWillRNote {
			continue
		}
		if _, ok := selectedTokens[row.SymbolToken]; ok {
			continue
		}
		if !row.Active {
			continue
		}
		row.Active = false
		if err := e.store.UpdateRSIWillRTarget(ctx, row); err != nil {
			return err
		}
	}

	return nil
}

func (e *Engine) placeDigii4PaperTrade(ctx context.Context, target digii4Target, closePrice, rsiVal, willrVal float64) error {
	if closePrice <= 0 {
		return nil
	}
	positions, err := e.store.ListPaperPositions(ctx)
	if err != nil {
		return err
	}
	openCount := 0
	for _, pos := range positions {
		if pos.Qty != 0 {
			openCount++
		}
	}
	maxOpen := e.cfg.Paper.MaxOpenPositions
	if maxOpen > 0 && openCount >= maxOpen {
		return nil
	}
	key := positionKey(target.Exchange, target.Token)
	if pos, ok := positions[key]; ok && pos.Qty != 0 {
		return nil
	}
	entryPrice := applySlippage(closePrice, "BUY", e.cfg.Paper.SlippageBps)
	if entryPrice <= 0 {
		return nil
	}
	qty := int64(math.Floor(e.cfg.Paper.CapitalPerTrade / entryPrice))
	if qty < 1 {
		return nil
	}
	targetGain := e.cfg.Backtest.TargetGain
	if targetGain <= 0 {
		targetGain = 0.003
	}
	stopLoss := entryPrice * (1 - targetGain)
	takeProfit := entryPrice * (1 + targetGain)
	entryTs := time.Now().UTC()
	orderID := newRunID()
	tradeID := newRunID()
	raw := mustJSON(map[string]any{
		"source":      "digii4_flow",
		"symbol":      target.Symbol,
		"rsi":         rsiVal,
		"willr":       willrVal,
		"entry_close": closePrice,
		"stop_loss":   stopLoss,
		"take_profit": takeProfit,
	})
	orders := []store.PaperOrder{{
		OrderID:     orderID,
		CreatedAt:   entryTs,
		Strategy:    "digii4",
		Exchange:    target.Exchange,
		SymbolToken: target.Token,
		Side:        "BUY",
		Qty:         qty,
		OrderType:   "MARKET",
		Price:       entryPrice,
		Status:      "FILLED",
		FilledQty:   qty,
		FilledPrice: entryPrice,
		Raw:         raw,
	}}
	trades := []store.PaperTrade{{
		TradeID:     tradeID,
		OrderID:     orderID,
		Ts:          entryTs,
		Strategy:    "digii4",
		Exchange:    target.Exchange,
		SymbolToken: target.Token,
		Side:        "BUY",
		Qty:         qty,
		Price:       entryPrice,
		Fees:        e.cfg.Paper.BrokeragePerTrade,
		Raw:         raw,
	}}
	posUpdates := []store.PaperPosition{{
		Exchange:      target.Exchange,
		SymbolToken:   target.Token,
		Strategy:      "digii4",
		Side:          "BUY",
		Qty:           qty,
		AvgPrice:      entryPrice,
		EntryPrice:    &entryPrice,
		EntryTs:       &entryTs,
		StopLoss:      &stopLoss,
		TakeProfit:    &takeProfit,
		RealizedPNL:   -e.cfg.Paper.BrokeragePerTrade,
		UnrealizedPNL: 0,
		UpdatedAt:     entryTs,
	}}
	return e.store.RecordPaperBatch(ctx, orders, trades, posUpdates)
}

func (e *Engine) handleDigii4EOD(ctx context.Context, now time.Time) error {
	dateKey := now.In(e.loc).Format("2006-01-02")
	if e.digii4State.eodReportedDate == dateKey {
		return nil
	}
	endAt, err := parseDailyTime(now, e.cfg.Runtime.TradingEnd, e.loc)
	if err != nil {
		return err
	}
	if now.Before(endAt) {
		return nil
	}
	message, err := e.closeDigii4PaperPositions(ctx, now)
	if err != nil {
		return err
	}
	e.sendDigii4Alert(ctx, "STOCK EOD", message)
	e.digii4State.eodReportedDate = dateKey
	return nil
}

func (e *Engine) closeDigii4PaperPositions(ctx context.Context, now time.Time) (string, error) {
	positions, err := e.store.ListPaperPositions(ctx)
	if err != nil {
		return "", err
	}
	tokensByExchange := map[string][]string{}
	for _, pos := range positions {
		if !strings.HasPrefix(strings.ToLower(strings.TrimSpace(pos.Strategy)), "digii4") || pos.Qty == 0 {
			continue
		}
		tokensByExchange[pos.Exchange] = append(tokensByExchange[pos.Exchange], pos.SymbolToken)
	}
	prices := map[string]float64{}
	if len(tokensByExchange) > 0 {
		priceMap, err := fetchInstrumentPricesMulti(ctx, e.store, tokensByExchange)
		if err != nil {
			return "", err
		}
		prices = priceMap
	}
	orders := []store.PaperOrder{}
	trades := []store.PaperTrade{}
	updates := []store.PaperPosition{}
	closed := 0
	for key, pos := range positions {
		if !strings.HasPrefix(strings.ToLower(strings.TrimSpace(pos.Strategy)), "digii4") || pos.Qty == 0 {
			continue
		}
		price := prices[pos.SymbolToken]
		if price <= 0 {
			continue
		}
		exitSide := "SELL"
		if strings.EqualFold(pos.Side, "SELL") {
			exitSide = "BUY"
		}
		exitPrice := applySlippage(price, exitSide, e.cfg.Paper.SlippageBps)
		gross := (exitPrice - pos.AvgPrice) * float64(pos.Qty)
		if strings.EqualFold(pos.Side, "SELL") {
			gross = (pos.AvgPrice - exitPrice) * float64(pos.Qty)
		}
		realized := gross - e.cfg.Paper.BrokeragePerTrade
		orderID := newRunID()
		tradeID := newRunID()
		raw := mustJSON(map[string]any{
			"source":      "digii4_flow",
			"reason":      "eod",
			"entry_price": pos.AvgPrice,
			"exit_price":  exitPrice,
		})
		orders = append(orders, store.PaperOrder{
			OrderID:     orderID,
			CreatedAt:   now.UTC(),
			Strategy:    pos.Strategy,
			Exchange:    pos.Exchange,
			SymbolToken: pos.SymbolToken,
			Side:        exitSide,
			Qty:         pos.Qty,
			OrderType:   "MARKET",
			Price:       exitPrice,
			Status:      "FILLED",
			FilledQty:   pos.Qty,
			FilledPrice: exitPrice,
			Raw:         raw,
		})
		trades = append(trades, store.PaperTrade{
			TradeID:     tradeID,
			OrderID:     orderID,
			Ts:          now.UTC(),
			Strategy:    pos.Strategy,
			Exchange:    pos.Exchange,
			SymbolToken: pos.SymbolToken,
			Side:        exitSide,
			Qty:         pos.Qty,
			Price:       exitPrice,
			Fees:        e.cfg.Paper.BrokeragePerTrade,
			Raw:         raw,
		})
		pos.RealizedPNL += realized
		pos.UnrealizedPNL = 0
		pos.Qty = 0
		pos.UpdatedAt = now.UTC()
		updates = append(updates, pos)
		positions[key] = pos
		closed++
	}
	if len(orders) > 0 {
		if err := e.store.RecordPaperBatch(ctx, orders, trades, updates); err != nil {
			return "", err
		}
	}
	totalRealized := 0.0
	openCount := 0
	for _, pos := range positions {
		if !strings.HasPrefix(strings.ToLower(strings.TrimSpace(pos.Strategy)), "digii4") {
			continue
		}
		totalRealized += pos.RealizedPNL
		if pos.Qty != 0 {
			openCount++
		}
	}
	return fmt.Sprintf("%s closed=%d open=%d realized=%.2f", now.In(e.loc).Format("2006-01-02"), closed, openCount, totalRealized), nil
}

func extractDailyCloses(series []dailyBar) []float64 {
	out := make([]float64, 0, len(series))
	for _, bar := range series {
		out = append(out, bar.Close)
	}
	return out
}

func extractDailyHighs(series []dailyBar) []float64 {
	out := make([]float64, 0, len(series))
	for _, bar := range series {
		out = append(out, bar.High)
	}
	return out
}

func extractDailyLows(series []dailyBar) []float64 {
	out := make([]float64, 0, len(series))
	for _, bar := range series {
		out = append(out, bar.Low)
	}
	return out
}

func percentileRank(values []float64, current float64) float64 {
	if len(values) == 0 {
		return 100
	}
	sorted := make([]float64, len(values))
	copy(sorted, values)
	sort.Float64s(sorted)
	rank := sort.Search(len(sorted), func(i int) bool { return sorted[i] > current })
	return (float64(rank) / float64(len(sorted))) * 100
}

func parseDailyTime(now time.Time, value string, loc *time.Location) (time.Time, error) {
	parsed, err := time.ParseInLocation("15:04", strings.TrimSpace(value), loc)
	if err != nil {
		return time.Time{}, err
	}
	return time.Date(now.Year(), now.Month(), now.Day(), parsed.Hour(), parsed.Minute(), 0, 0, loc), nil
}

func sameDate(a, b time.Time) bool {
	return a.In(time.UTC).Format("2006-01-02") == b.In(time.UTC).Format("2006-01-02")
}

func sameDateInLoc(a, b time.Time, loc *time.Location) bool {
	return a.In(loc).Format("2006-01-02") == b.In(loc).Format("2006-01-02")
}

func latestDailyIndexOnOrBefore(series []dailyBar, tradeDate time.Time, loc *time.Location) int {
	if len(series) == 0 {
		return -1
	}
	target := tradeDate.In(loc).Format("2006-01-02")
	for i := len(series) - 1; i >= 0; i-- {
		if series[i].Date.In(loc).Format("2006-01-02") <= target {
			return i
		}
	}
	return -1
}

func extractDailyVolumes(series []dailyBar) []float64 {
	out := make([]float64, 0, len(series))
	for _, bar := range series {
		out = append(out, float64(bar.Volume))
	}
	return out
}

func medianFloat64(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	tmp := make([]float64, len(values))
	copy(tmp, values)
	sort.Float64s(tmp)
	n := len(tmp)
	mid := n / 2
	if n%2 == 1 {
		return tmp[mid]
	}
	return (tmp[mid-1] + tmp[mid]) / 2
}

func maxMinuteHigh(bars []minuteBar) float64 {
	maxV := 0.0
	for _, bar := range bars {
		if bar.High > maxV {
			maxV = bar.High
		}
	}
	return maxV
}

func formatCapitalTargets(entryPrice, dayHigh float64, capitals []float64, intradayTargetNet, brokerage float64) string {
	if entryPrice <= 0 {
		return ""
	}
	if len(capitals) == 0 {
		capitals = []float64{100000, 200000, 500000}
	}
	parts := make([]string, 0, len(capitals))
	for _, capital := range capitals {
		if capital <= 0 {
			continue
		}
		qty := int(math.Floor(capital / entryPrice))
		if qty < 1 {
			continue
		}
		requiredMove := (intradayTargetNet + 2*brokerage) / (float64(qty) * entryPrice)
		if requiredMove < 0 {
			requiredMove = 0
		}
		targetPrice := entryPrice * (1 + requiredMove)
		warn := ""
		if dayHigh > 0 && targetPrice > dayHigh {
			warn = " WARN(target>dayHigh)"
		}
		parts = append(parts, fmt.Sprintf("%.0fL q=%d t=%.2f(%.3f%%)%s", capital/100000.0, qty, targetPrice, requiredMove*100, warn))
	}
	return strings.Join(parts, " | ")
}

func isTradingDay(ctx context.Context, st *store.Store, now time.Time, loc *time.Location) bool {
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	query := fmt.Sprintf(`SELECT is_trading_day FROM %s WHERE trade_date = $1`, pgx.Identifier{st.Schema, "trading_calendar"}.Sanitize())
	var isTrading bool
	if err := st.Pool.QueryRow(ctx, query, today).Scan(&isTrading); err != nil {
		if now.In(loc).Weekday() == time.Saturday || now.In(loc).Weekday() == time.Sunday {
			return false
		}
		return true
	}
	return isTrading
}

func resolveTokensBySymbol(ctx context.Context, st *store.Store, exchange string, symbols []string) (map[string]string, error) {
	if len(symbols) == 0 {
		return map[string]string{}, nil
	}
	expanded := make([]string, 0, len(symbols)*2)
	baseMap := make(map[string]string, len(symbols))
	for _, sym := range symbols {
		clean := strings.ToUpper(strings.TrimSpace(sym))
		if clean == "" {
			continue
		}
		baseMap[clean] = clean
		expanded = append(expanded, clean)
		if !strings.Contains(clean, "-") {
			expanded = append(expanded, clean+"-EQ")
		}
	}
	query := fmt.Sprintf(`SELECT tradingsymbol, symbol_token
FROM %s
WHERE exchange = $1 AND tradingsymbol = ANY($2)`, pgx.Identifier{st.Schema, "instruments"}.Sanitize())
	rows, err := st.Pool.Query(ctx, query, exchange, expanded)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var sym, token string
		if err := rows.Scan(&sym, &token); err != nil {
			return nil, err
		}
		upper := strings.ToUpper(strings.TrimSpace(sym))
		base := strings.TrimSuffix(upper, "-EQ")
		if _, ok := baseMap[base]; ok {
			out[base] = token
		} else {
			out[upper] = token
		}
	}
	return out, rows.Err()
}

func (e *Engine) loadDigii4ManualSymbols(ctx context.Context) []string {
	st, err := e.store.GetLatestStrategyState(ctx, digii4ManualTrackersStateName)
	if err != nil || st == nil {
		return nil
	}
	if len(st.Raw) > 0 {
		var payload digii4ManualTrackersState
		if err := json.Unmarshal(st.Raw, &payload); err == nil {
			return normalizeManualSymbols(payload.Symbols)
		}
		var symbols []string
		if err := json.Unmarshal(st.Raw, &symbols); err == nil {
			return normalizeManualSymbols(symbols)
		}
	}
	if strings.TrimSpace(st.Value) == "" {
		return nil
	}
	return normalizeManualSymbols(strings.Split(st.Value, ","))
}

func normalizeManualSymbols(symbols []string) []string {
	if len(symbols) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(symbols))
	out := make([]string, 0, len(symbols))
	for _, symbol := range symbols {
		clean := strings.ToUpper(strings.TrimSpace(symbol))
		clean = strings.TrimSuffix(clean, "-EQ")
		clean = strings.TrimSpace(clean)
		if clean == "" {
			continue
		}
		if _, ok := seen[clean]; ok {
			continue
		}
		seen[clean] = struct{}{}
		out = append(out, clean)
	}
	sort.Strings(out)
	return out
}

func maxInt(values ...int) int {
	max := 0
	for _, v := range values {
		if v > max {
			max = v
		}
	}
	return max
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
