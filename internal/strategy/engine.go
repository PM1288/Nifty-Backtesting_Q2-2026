package strategy

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"sort"
	"strings"
	"time"

	"trading-stack/internal/alerts"
	"trading-stack/internal/config"
	"trading-stack/internal/parameters"
	"trading-stack/internal/store"
)

type Engine struct {
	cfg                  *config.Config
	store                *store.Store
	logger               *slog.Logger
	loc                  *time.Location
	webhook              *alerts.Client
	manualStraddleStates map[string]*manualStraddleState
	digii4Alerts         *alerts.Client
	digii4State          digii4FlowState
	niftyWatcherAlerts   *alerts.Client
}

type candidate struct {
	ref       instrumentRef
	score     float64
	lastClose float64
	emaFast   float64
	emaSlow   float64
	avgVol    float64
}

type signalDraft struct {
	Strategy         string
	Exchange         string
	UnderlyingToken  string
	UnderlyingSymbol string
	UnderlyingName   string
	UnderlyingPrice  float64
	Direction        string
	Confidence       float64
	StopLoss         float64
	TakeProfit       float64
	Timeframe        string
	Reason           string
	Raw              map[string]any
}

type regimeState struct {
	Regime     string  `json:"regime"`
	RiskBudget float64 `json:"risk_budget"`
	IndexClose float64 `json:"index_close"`
	VIX        float64 `json:"vix"`
}

type manualStraddleState struct {
	Peak       float64
	LastSignal string
}

type manualStraddleStatus struct {
	Name               string  `json:"name"`
	Exchange           string  `json:"exchange"`
	CE                 string  `json:"ce_symbol"`
	PE                 string  `json:"pe_symbol"`
	CEToken            string  `json:"ce_token"`
	PEToken            string  `json:"pe_token"`
	CEPrice            float64 `json:"ce_price"`
	PEPrice            float64 `json:"pe_price"`
	EntryTotal         float64 `json:"entry_total"`
	CurrentTotal       float64 `json:"current_total"`
	TP                 float64 `json:"tp"`
	SL                 float64 `json:"sl"`
	Trail              float64 `json:"trail"`
	Peak               float64 `json:"peak"`
	LotSize            int     `json:"lot_size"`
	Lots               int     `json:"lots"`
	TargetProfitRupees float64 `json:"target_profit_rupees"`
	PnlRupees          float64 `json:"pnl_rupees"`
	Signal             string  `json:"signal"`
}

func NewEngine(cfg *config.Config, st *store.Store, logger *slog.Logger, loc *time.Location) *Engine {
	return &Engine{
		cfg:                  cfg,
		store:                st,
		logger:               logger,
		loc:                  loc,
		webhook:              alerts.NewClient(cfg.Alerts),
		manualStraddleStates: map[string]*manualStraddleState{},
		digii4Alerts:         alerts.NewClient(cfg.Digii4Flow.Alerts),
		digii4State:          digii4FlowState{targets: map[string]digii4Target{}, alerted: map[string]string{}},
		niftyWatcherAlerts:   alerts.NewClient(cfg.NiftyWatcher.Alerts),
	}
}

func (e *Engine) Run(ctx context.Context) error {
	if !e.cfg.Strategy.Enable {
		if e.logger != nil {
			e.logger.Info("strategy_disabled")
		}
		<-ctx.Done()
		return ctx.Err()
	}
	ticker := time.NewTicker(time.Duration(e.cfg.Strategy.RunIntervalSeconds) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			if err := e.runOnce(ctx); err != nil && e.logger != nil {
				e.logger.Warn("strategy_run_failed", "err", err)
			}
		}
	}
}

func (e *Engine) runOnce(ctx context.Context) error {
	now := time.Now().In(e.loc)
	cfg := e.cfg.Strategy
	defs := parameters.StrategyCoreDefinitions(e.cfg)
	if values, err := parameters.LoadScope(ctx, e.store, parameters.ScopeStrategyCore, defs, "strategy"); err != nil {
		if e.logger != nil {
			e.logger.Warn("strategy_params_load_failed", "err", err)
		}
	} else {
		parameters.ApplyStrategyOverrides(&cfg, values)
	}

	if e.cfg.Digii4Flow.Enable {
		if err := e.runDigii4Flow(ctx, now); err != nil && e.logger != nil {
			e.logger.Warn("digii4_flow_failed", "err", err)
		}
	}
	if e.cfg.NiftyWatcher.Enable {
		if err := e.runNiftyWatcher(ctx, now); err != nil && e.logger != nil {
			e.logger.Warn("nifty_watcher_failed", "err", err)
			if e.cfg.NiftyWatcher.Alerts.EnableErrorAlerts {
				e.sendNiftyWatcherAlert(ctx, "ERROR", "system", err.Error())
			}
		}
	}
	if !cfg.RunOutsideMarketHours && outsideMarketHours(now, e.cfg.Runtime.TradingStart, e.cfg.Runtime.TradingEnd, e.loc) {
		return nil
	}

	runID := newRunID()
	start := time.Now().UTC()
	if err := e.store.InsertStrategyRun(ctx, store.StrategyRun{
		RunID:      runID,
		StartedAt:  start,
		Status:     "running",
		ConfigHash: hashStrategyConfig(cfg),
	}); err != nil && e.logger != nil {
		e.logger.Warn("strategy_run_insert_failed", "err", err)
	}

	status := "complete"
	var runErr error
	defer func() {
		if runErr != nil {
			status = "failed"
		}
		if err := e.store.FinishStrategyRun(ctx, runID, status, errorMessage(runErr)); err != nil && e.logger != nil {
			e.logger.Warn("strategy_run_finish_failed", "err", err)
		}
	}()

	if err := e.evaluateManualStraddles(ctx, cfg, now); err != nil && e.logger != nil {
		e.logger.Warn("manual_straddle_eval_failed", "err", err)
	}

	universe, err := fetchUniverse(ctx, e.store, "nifty100_equity")
	if err != nil {
		runErr = err
		return err
	}
	if len(universe) == 0 {
		runErr = fmt.Errorf("no universe instruments found")
		return runErr
	}

	indexToken := strings.TrimSpace(cfg.IndexToken)
	indexBars, err := fetchDailyBars(ctx, e.store, "NSE", []string{indexToken}, dailyStart(cfg.EMASlow, now))
	if err != nil {
		runErr = err
		return err
	}
	indexSeries := indexBars[indexToken]
	if len(indexSeries) < cfg.EMASlow {
		runErr = fmt.Errorf("insufficient index daily bars")
		return runErr
	}

	regime := e.evaluateRegime(ctx, indexSeries, now, cfg)
	if err := e.store.UpsertStrategyStates(ctx, []store.StrategyState{
		{
			Ts:    now.UTC(),
			Name:  "regime",
			Value: regime.Regime,
			Raw:   mustJSON(regime),
		},
	}); err != nil && e.logger != nil {
		e.logger.Warn("strategy_state_upsert_failed", "err", err)
	}

	universeTokens := make([]string, 0, len(universe))
	for _, ref := range universe {
		universeTokens = append(universeTokens, ref.Token)
	}
	dailyBars, err := fetchDailyBars(ctx, e.store, "NSE", universeTokens, dailyStart(cfg.EMASlow, now))
	if err != nil {
		runErr = err
		return err
	}

	candidates := e.selectCandidates(universe, dailyBars, indexSeries, cfg)
	if len(candidates) == 0 {
		return nil
	}

	maxSymbols := cfg.MaxSymbols
	if maxSymbols > 0 && len(candidates) > maxSymbols {
		candidates = candidates[:maxSymbols]
	}

	underlyingsWithOptions, err := fetchOptionUnderlyings(ctx, e.store)
	if err != nil {
		runErr = err
		return err
	}

	candidateTokens := make([]string, 0, len(candidates))
	for _, cand := range candidates {
		candidateTokens = append(candidateTokens, cand.ref.Token)
	}
	minuteStart := strategyStartTime(now, cfg, e.cfg.Runtime.TradingStart, e.loc)
	minuteBars, err := fetchMinuteBars(ctx, e.store, "NSE", candidateTokens, minuteStart)
	if err != nil {
		runErr = err
		return err
	}
	cooldowns, _ := fetchCooldowns(ctx, e.store, "core")
	positions, _ := e.store.ListPaperPositions(ctx)
	tokensByExchange := map[string][]string{}
	for _, cand := range candidates {
		tokensByExchange[cand.ref.Exchange] = append(tokensByExchange[cand.ref.Exchange], cand.ref.Token)
	}
	positionTokens := make([]string, 0, len(positions))
	for _, pos := range positions {
		if pos.SymbolToken == "" {
			continue
		}
		positionTokens = append(positionTokens, pos.SymbolToken)
		tokensByExchange[pos.Exchange] = append(tokensByExchange[pos.Exchange], pos.SymbolToken)
	}
	priceMap, _ := fetchInstrumentPricesMulti(ctx, e.store, tokensByExchange)
	openUnderlyings := map[string]struct{}{}
	if len(positionTokens) > 0 {
		if underlyingMap, err := fetchOptionUnderlyingByTokens(ctx, e.store, positionTokens); err == nil {
			for _, underlying := range underlyingMap {
				trimmed := strings.TrimSpace(strings.ToUpper(underlying))
				if trimmed != "" {
					openUnderlyings[trimmed] = struct{}{}
				}
			}
		}
	}
	if len(positions) > 0 && len(priceMap) > 0 {
		updates, exitOrders, exitTrades := e.updatePaperPositions(now, positions, priceMap)
		if len(exitOrders) > 0 {
			if err := e.store.RecordPaperBatch(ctx, exitOrders, exitTrades, updates); err != nil && e.logger != nil {
				e.logger.Warn("paper_exit_update_failed", "err", err)
			}
		} else if len(updates) > 0 {
			if err := e.store.UpsertPaperPositions(ctx, updates); err != nil && e.logger != nil {
				e.logger.Warn("paper_positions_update_failed", "err", err)
			}
		}
		for _, pos := range updates {
			positions[positionKey(pos.Exchange, pos.SymbolToken)] = pos
		}
	}

	if err := e.evaluateNiftyLevelStraddle(ctx, now, cfg, positions); err != nil && e.logger != nil {
		e.logger.Warn("nifty_level_straddle_failed", "err", err)
	}

	var signals []store.StrategySignal
	var drafts []signalDraft
	var cooldownUpdates []store.StrategyCooldown
	eventCooldowns, _ := fetchCooldowns(ctx, e.store, "event_straddle")
	if cfg.EventStraddleEnable {
		draft, cooldown, err := e.buildEventStraddleDraft(ctx, now, cfg, underlyingsWithOptions, openUnderlyings, eventCooldowns)
		if err != nil && e.logger != nil {
			e.logger.Warn("event_straddle_failed", "err", err)
		}
		if draft != nil {
			drafts = append(drafts, *draft)
			if cooldown != nil {
				cooldownUpdates = append(cooldownUpdates, *cooldown)
			}
		}
	}
	for _, cand := range candidates {
		underlyingKey := strings.ToUpper(strings.TrimSpace(cand.ref.Underlying))
		if underlyingKey == "" {
			underlyingKey = strings.TrimSuffix(strings.ToUpper(strings.TrimSpace(cand.ref.TradingSymbol)), "-EQ")
		}
		if _, ok := underlyingsWithOptions[underlyingKey]; !ok {
			continue
		}
		if _, ok := openUnderlyings[underlyingKey]; ok {
			continue
		}
		if pos, ok := positions[positionKey(cand.ref.Exchange, cand.ref.Token)]; ok && pos.Qty != 0 {
			continue
		}
		if until, ok := cooldowns[cooldownKey("core", cand.ref.Exchange, cand.ref.Token)]; ok && now.Before(until) {
			continue
		}
		bars := minuteBars[cand.ref.Token]
		if len(bars) < 5 {
			continue
		}
		lastPrice := priceMap[cand.ref.Token]
		added := false
		for _, draft := range e.evaluateSetups(now, cand, bars, lastPrice, cfg) {
			if draft.Confidence < cfg.MinConfidence {
				continue
			}
			drafts = append(drafts, draft)
			added = true
			if cfg.MaxSignalsPerRun > 0 && len(drafts) >= cfg.MaxSignalsPerRun {
				break
			}
		}
		if added {
			cooldownUpdates = append(cooldownUpdates, store.StrategyCooldown{
				Strategy:      "core",
				Exchange:      cand.ref.Exchange,
				SymbolToken:   cand.ref.Token,
				CooldownUntil: now.Add(time.Duration(cfg.CooldownMinutes) * time.Minute).UTC(),
			})
		}
		if cfg.MaxSignalsPerRun > 0 && len(drafts) >= cfg.MaxSignalsPerRun {
			break
		}
	}

	if len(drafts) > 0 && cfg.UseOptions {
		mappedSignals, err := e.convertDraftsToSignals(ctx, now, drafts, cfg)
		if err != nil && e.logger != nil {
			e.logger.Warn("strategy_options_mapping_failed", "err", err)
		}
		signals = append(signals, mappedSignals...)
	} else {
		for _, draft := range drafts {
			if cfg.MaxSignalsPerRun > 0 && len(signals) >= cfg.MaxSignalsPerRun {
				break
			}
			signal := store.StrategySignal{
				Ts:          now.UTC(),
				Strategy:    draft.Strategy,
				Exchange:    draft.Exchange,
				SymbolToken: draft.UnderlyingToken,
				Side:        "BUY",
				Confidence:  draft.Confidence,
				EntryPrice:  draft.UnderlyingPrice,
				StopLoss:    draft.StopLoss,
				TakeProfit:  draft.TakeProfit,
				Timeframe:   draft.Timeframe,
				Reason:      draft.Reason,
				Raw:         mustJSON(draft.Raw),
			}
			signals = append(signals, signal)
		}
	}

	if err := e.store.UpsertStrategyStates(ctx, []store.StrategyState{
		{
			Ts:    now.UTC(),
			Name:  "candidates",
			Value: fmt.Sprintf("%d", len(candidates)),
			Raw:   mustJSON(map[string]any{"count": len(candidates)}),
		},
		{
			Ts:    now.UTC(),
			Name:  "signals",
			Value: fmt.Sprintf("%d", len(signals)),
			Raw:   mustJSON(map[string]any{"count": len(signals)}),
		},
	}); err != nil && e.logger != nil {
		e.logger.Warn("strategy_state_counts_failed", "err", err)
	}

	if len(signals) > 0 {
		if err := e.store.InsertStrategySignals(ctx, signals); err != nil && e.logger != nil {
			e.logger.Warn("strategy_signals_insert_failed", "err", err)
		}
		if len(cooldownUpdates) > 0 {
			if err := e.store.UpsertStrategyCooldowns(ctx, cooldownUpdates); err != nil && e.logger != nil {
				e.logger.Warn("strategy_cooldown_upsert_failed", "err", err)
			}
		}
		e.sendSignalAlerts(ctx, signals)
		if e.cfg.Paper.Enable && e.cfg.Paper.AutoPlace {
			if err := e.executePaperTrades(ctx, signals, priceMap, positions); err != nil && e.logger != nil {
				e.logger.Warn("paper_trading_failed", "err", err)
			}
		}
	}
	return nil
}

func (e *Engine) evaluateRegime(ctx context.Context, series []dailyBar, now time.Time, cfg config.StrategyConfig) regimeState {
	values := extractCloses(series)
	emaFast := ema(values, cfg.EMAFast)
	emaSlow := ema(values, cfg.EMASlow)
	last := values[len(values)-1]
	regime := "range"
	if emaFast > emaSlow && last > emaFast {
		regime = "trend_up"
	} else if emaFast < emaSlow && last < emaFast && cfg.AllowShort {
		regime = "trend_down"
	}
	vix := 0.0
	if cfg.VIXToken != "" {
		if prices, err := fetchInstrumentPrices(ctx, e.store, "NSE", []string{cfg.VIXToken}); err == nil {
			vix = prices[cfg.VIXToken]
		}
	}
	riskBudget := 1.0
	if vix >= 30 {
		riskBudget = 0.4
	} else if vix >= 20 {
		riskBudget = 0.7
	}
	return regimeState{
		Regime:     regime,
		RiskBudget: riskBudget,
		IndexClose: last,
		VIX:        vix,
	}
}

func (e *Engine) selectCandidates(universe []instrumentRef, dailyBars map[string][]dailyBar, indexSeries []dailyBar, cfg config.StrategyConfig) []candidate {
	_ = indexSeries
	var out []candidate
	for _, ref := range universe {
		series := dailyBars[ref.Token]
		if len(series) < cfg.EMASlow {
			continue
		}
		closes := extractCloses(series)
		emaFastVal := ema(closes, cfg.EMAFast)
		emaSlowVal := ema(closes, cfg.EMASlow)
		lastClose := closes[len(closes)-1]
		avgVol := averageVolume(series, 20)
		if avgVol < float64(cfg.MinDailyVolume) {
			continue
		}
		strength := avgVol
		if emaFastVal > 0 {
			strength = avgVol * (1 + math.Abs((lastClose/emaFastVal)-1))
		}
		out = append(out, candidate{
			ref:       ref,
			score:     strength,
			lastClose: lastClose,
			emaFast:   emaFastVal,
			emaSlow:   emaSlowVal,
			avgVol:    avgVol,
		})
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].score > out[j].score })
	return out
}

func (e *Engine) evaluateSetups(now time.Time, cand candidate, bars []minuteBar, lastPrice float64, cfg config.StrategyConfig) []signalDraft {
	out := []signalDraft{}
	if cfg.EMAPullbackEnable {
		if ok, draft := e.evaluateEMAPullback(now, cand, bars, lastPrice, cfg); ok {
			out = append(out, draft)
		}
	}
	if cfg.ORBEnable {
		if ok, draft := e.evaluateORB(now, cand, bars, lastPrice, cfg); ok {
			out = append(out, draft)
		}
	}
	if cfg.SupertrendEnable {
		if ok, draft := e.evaluateSupertrend(now, cand, bars, lastPrice, cfg); ok {
			out = append(out, draft)
		}
	}
	if cfg.BBSqueezeEnable {
		out = append(out, e.evaluateBBSqueeze(now, cand, bars, lastPrice, cfg)...)
	}
	return out
}

func (e *Engine) evaluateEMAPullback(now time.Time, cand candidate, bars []minuteBar, lastPrice float64, cfg config.StrategyConfig) (bool, signalDraft) {
	bars5m := aggregateBars(bars, 5, e.loc)
	if len(bars5m) < cfg.ATRPeriod+2 {
		return false, signalDraft{}
	}
	close1m := extractMinuteCloses(bars)
	close5m := extractMinuteCloses(bars5m)
	emaFast5 := ema(close5m, cfg.EMAFast)
	emaSlow5 := ema(close5m, cfg.EMASlow)
	rsi5 := rsi(close5m, cfg.RSIPeriod)
	rsi1 := rsi(close1m, cfg.RSIPeriod)
	vwap1m := vwap(extractMinuteCloses(bars), extractMinuteVolumes(bars))
	lastBar := bars[len(bars)-1]
	lastClose := lastBar.Close
	if lastPrice > 0 {
		lastClose = lastPrice
	}
	if emaFast5 <= emaSlow5 || emaFast5 == 0 {
		return false, signalDraft{}
	}
	pullbackDistance := math.Abs(lastClose-emaFast5) / emaFast5 * 100
	if pullbackDistance > cfg.PullbackPct {
		return false, signalDraft{}
	}
	if rsi5 < cfg.RSISetupMin || rsi5 > cfg.RSISetupMax {
		return false, signalDraft{}
	}
	vwapDistance := 0.0
	if vwap1m > 0 {
		vwapDistance = math.Abs(lastClose-vwap1m) / vwap1m * 100
	}
	if vwapDistance > cfg.VWAPDistancePct {
		return false, signalDraft{}
	}

	avgVol := averageMinuteVolume(bars, 20)
	multiplier := cfg.VolumeSpikeMultiplier
	if multiplier <= 0 {
		multiplier = 1.5
	}
	volSpike := avgVol > 0 && float64(lastBar.Volume) > avgVol*multiplier
	trigger := rsi1 >= cfg.RSITrigger && lastClose > vwap1m && volSpike
	if !trigger {
		return false, signalDraft{}
	}

	confidence := 0.5
	if volSpike {
		confidence += 0.15
	}
	if rsi1 > cfg.RSITrigger {
		confidence += 0.1
	}
	if lastClose > emaFast5 {
		confidence += 0.1
	}
	confidence = math.Min(confidence, 0.95)

	atrVal := atr(extractMinuteHighs(bars5m), extractMinuteLows(bars5m), extractMinuteCloses(bars5m), cfg.ATRPeriod)
	if atrVal <= 0 {
		return false, signalDraft{}
	}
	stop := lastClose - atrVal*cfg.StopATRMultiplier
	target := lastClose + atrVal*cfg.TargetATRMultiplier

	raw := map[string]any{
		"ema_fast_5m": emaFast5,
		"ema_slow_5m": emaSlow5,
		"rsi_5m":      rsi5,
		"rsi_1m":      rsi1,
		"vwap_1m":     vwap1m,
		"atr_5m":      atrVal,
		"vol_spike":   volSpike,
		"direction":   "CALL",
	}
	draft := signalDraft{
		Strategy:         "ema_pullback",
		Exchange:         cand.ref.Exchange,
		UnderlyingToken:  cand.ref.Token,
		UnderlyingSymbol: cand.ref.TradingSymbol,
		UnderlyingName:   cand.ref.Underlying,
		UnderlyingPrice:  lastClose,
		Direction:        "CALL",
		Confidence:       confidence,
		StopLoss:         stop,
		TakeProfit:       target,
		Timeframe:        "1m",
		Reason:           fmt.Sprintf("ema_pullback_%s", cand.ref.TradingSymbol),
		Raw:              raw,
	}
	return true, draft
}

func (e *Engine) evaluateORB(now time.Time, cand candidate, bars []minuteBar, lastPrice float64, cfg config.StrategyConfig) (bool, signalDraft) {
	rangeMinutes := cfg.ORBRangeMinutes
	if rangeMinutes <= 0 {
		rangeMinutes = 15
	}
	openTime := marketOpenTime(now, e.cfg.Runtime.TradingStart, e.loc)
	rangeEnd := openTime.Add(time.Duration(rangeMinutes) * time.Minute)
	lastBar := bars[len(bars)-1]
	if lastBar.Ts.Before(rangeEnd) {
		return false, signalDraft{}
	}
	var rangeHigh float64
	rangeLow := math.MaxFloat64
	var rangeVol int64
	rangeCount := 0
	for _, bar := range bars {
		local := bar.Ts.In(e.loc)
		if local.Before(openTime) || !local.Before(rangeEnd) {
			continue
		}
		if bar.High > rangeHigh {
			rangeHigh = bar.High
		}
		if bar.Low < rangeLow {
			rangeLow = bar.Low
		}
		rangeVol += bar.Volume
		rangeCount++
	}
	if rangeHigh == 0 || rangeLow == math.MaxFloat64 {
		return false, signalDraft{}
	}
	rangePct := (rangeHigh - rangeLow) / rangeLow * 100
	if cfg.ORBMinRangePct > 0 && rangePct < cfg.ORBMinRangePct {
		return false, signalDraft{}
	}
	if cfg.ORBMaxRangePct > 0 && rangePct > cfg.ORBMaxRangePct {
		return false, signalDraft{}
	}
	lastClose := lastBar.Close
	if lastPrice > 0 {
		lastClose = lastPrice
	}
	direction := ""
	if lastClose > rangeHigh {
		direction = "CALL"
	} else if lastClose < rangeLow && cfg.AllowShort {
		direction = "PUT"
	} else {
		return false, signalDraft{}
	}
	avgVol := 0.0
	if rangeCount > 0 {
		avgVol = float64(rangeVol) / float64(rangeCount)
	}
	volMultiplier := cfg.ORBVolumeMultiplier
	if volMultiplier <= 0 {
		volMultiplier = 1.2
	}
	volSpike := avgVol > 0 && float64(lastBar.Volume) > avgVol*volMultiplier
	if !volSpike {
		return false, signalDraft{}
	}
	atrVal := atr(extractMinuteHighs(bars), extractMinuteLows(bars), extractMinuteCloses(bars), cfg.ATRPeriod)
	if atrVal <= 0 {
		return false, signalDraft{}
	}
	stop := lastClose - atrVal*cfg.StopATRMultiplier
	target := lastClose + atrVal*cfg.TargetATRMultiplier
	if direction == "PUT" {
		stop = lastClose + atrVal*cfg.StopATRMultiplier
		target = lastClose - atrVal*cfg.TargetATRMultiplier
	}
	confidence := 0.55
	if volSpike {
		confidence += 0.1
	}
	raw := map[string]any{
		"range_high": rangeHigh,
		"range_low":  rangeLow,
		"range_pct":  rangePct,
		"vol_spike":  volSpike,
		"direction":  direction,
	}
	draft := signalDraft{
		Strategy:         "orb",
		Exchange:         cand.ref.Exchange,
		UnderlyingToken:  cand.ref.Token,
		UnderlyingSymbol: cand.ref.TradingSymbol,
		UnderlyingName:   cand.ref.Underlying,
		UnderlyingPrice:  lastClose,
		Direction:        direction,
		Confidence:       confidence,
		StopLoss:         stop,
		TakeProfit:       target,
		Timeframe:        "1m",
		Reason:           fmt.Sprintf("orb_break_%s", cand.ref.TradingSymbol),
		Raw:              raw,
	}
	return true, draft
}

func (e *Engine) evaluateSupertrend(now time.Time, cand candidate, bars []minuteBar, lastPrice float64, cfg config.StrategyConfig) (bool, signalDraft) {
	tf := cfg.SupertrendTimeframe
	if tf <= 0 {
		tf = 5
	}
	barsTF := aggregateBars(bars, tf, e.loc)
	if len(barsTF) < cfg.SupertrendATRPeriod+2 {
		return false, signalDraft{}
	}
	closes := extractMinuteCloses(barsTF)
	highs := extractMinuteHighs(barsTF)
	lows := extractMinuteLows(barsTF)
	line, dir := supertrend(highs, lows, closes, cfg.SupertrendATRPeriod, cfg.SupertrendMultiplier)
	if dir == 0 {
		return false, signalDraft{}
	}
	lastClose := closes[len(closes)-1]
	if lastPrice > 0 {
		lastClose = lastPrice
	}
	direction := ""
	if dir > 0 && lastClose > line {
		direction = "CALL"
	} else if dir < 0 && lastClose < line && cfg.AllowShort {
		direction = "PUT"
	} else {
		return false, signalDraft{}
	}
	atrVal := atr(highs, lows, closes, cfg.SupertrendATRPeriod)
	if atrVal <= 0 {
		return false, signalDraft{}
	}
	stop := lastClose - atrVal*cfg.StopATRMultiplier
	target := lastClose + atrVal*cfg.TargetATRMultiplier
	if direction == "PUT" {
		stop = lastClose + atrVal*cfg.StopATRMultiplier
		target = lastClose - atrVal*cfg.TargetATRMultiplier
	}
	raw := map[string]any{
		"supertrend_line": line,
		"direction":       direction,
		"atr":             atrVal,
	}
	draft := signalDraft{
		Strategy:         "supertrend",
		Exchange:         cand.ref.Exchange,
		UnderlyingToken:  cand.ref.Token,
		UnderlyingSymbol: cand.ref.TradingSymbol,
		UnderlyingName:   cand.ref.Underlying,
		UnderlyingPrice:  lastClose,
		Direction:        direction,
		Confidence:       0.6,
		StopLoss:         stop,
		TakeProfit:       target,
		Timeframe:        fmt.Sprintf("%dm", tf),
		Reason:           fmt.Sprintf("supertrend_%s", cand.ref.TradingSymbol),
		Raw:              raw,
	}
	return true, draft
}

func (e *Engine) evaluateBBSqueeze(now time.Time, cand candidate, bars []minuteBar, lastPrice float64, cfg config.StrategyConfig) []signalDraft {
	tf := cfg.BBTimeframe
	if tf <= 0 {
		tf = 5
	}
	barsTF := aggregateBars(bars, tf, e.loc)
	if len(barsTF) < cfg.BBPeriod+2 {
		return nil
	}
	closes := extractMinuteCloses(barsTF)
	mid, upper, lower := bollinger(closes, cfg.BBPeriod, cfg.BBStdDev)
	if mid == 0 {
		return nil
	}
	bandwidth := (upper - lower) / mid * 100
	if cfg.BBSqueezeBandwidthPct > 0 && bandwidth > cfg.BBSqueezeBandwidthPct {
		return nil
	}
	if cfg.BBSqueezeLookback > 0 && len(closes) >= cfg.BBSqueezeLookback {
		minBandwidth := math.MaxFloat64
		for i := len(closes) - cfg.BBSqueezeLookback; i < len(closes); i++ {
			m, u, l := bollinger(closes[:i+1], cfg.BBPeriod, cfg.BBStdDev)
			if m == 0 {
				continue
			}
			bw := (u - l) / m * 100
			if bw < minBandwidth {
				minBandwidth = bw
			}
		}
		if bandwidth > minBandwidth {
			return nil
		}
	}
	lastClose := closes[len(closes)-1]
	if lastPrice > 0 {
		lastClose = lastPrice
	}
	mode := strings.ToLower(strings.TrimSpace(cfg.BBSqueezeMode))
	if mode == "" {
		mode = "directional"
	}
	atrVal := atr(extractMinuteHighs(barsTF), extractMinuteLows(barsTF), extractMinuteCloses(barsTF), cfg.ATRPeriod)
	if atrVal <= 0 {
		return nil
	}
	raw := map[string]any{
		"bb_mid":    mid,
		"bb_upper":  upper,
		"bb_lower":  lower,
		"bandwidth": bandwidth,
		"mode":      mode,
		"atr":       atrVal,
		"timeframe": tf,
		"direction": "",
	}
	if mode == "straddle" {
		raw["direction"] = "STRADDLE"
		return []signalDraft{
			{
				Strategy:         "bb_squeeze",
				Exchange:         cand.ref.Exchange,
				UnderlyingToken:  cand.ref.Token,
				UnderlyingSymbol: cand.ref.TradingSymbol,
				UnderlyingName:   cand.ref.Underlying,
				UnderlyingPrice:  lastClose,
				Direction:        "STRADDLE",
				Confidence:       0.55,
				StopLoss:         lastClose - atrVal*cfg.StopATRMultiplier,
				TakeProfit:       lastClose + atrVal*cfg.TargetATRMultiplier,
				Timeframe:        fmt.Sprintf("%dm", tf),
				Reason:           fmt.Sprintf("bb_squeeze_straddle_%s", cand.ref.TradingSymbol),
				Raw:              raw,
			},
		}
	}
	if lastClose > upper {
		raw["direction"] = "CALL"
		return []signalDraft{{
			Strategy:         "bb_squeeze",
			Exchange:         cand.ref.Exchange,
			UnderlyingToken:  cand.ref.Token,
			UnderlyingSymbol: cand.ref.TradingSymbol,
			UnderlyingName:   cand.ref.Underlying,
			UnderlyingPrice:  lastClose,
			Direction:        "CALL",
			Confidence:       0.6,
			StopLoss:         lastClose - atrVal*cfg.StopATRMultiplier,
			TakeProfit:       lastClose + atrVal*cfg.TargetATRMultiplier,
			Timeframe:        fmt.Sprintf("%dm", tf),
			Reason:           fmt.Sprintf("bb_squeeze_break_%s", cand.ref.TradingSymbol),
			Raw:              raw,
		}}
	}
	if lastClose < lower && cfg.AllowShort {
		raw["direction"] = "PUT"
		return []signalDraft{{
			Strategy:         "bb_squeeze",
			Exchange:         cand.ref.Exchange,
			UnderlyingToken:  cand.ref.Token,
			UnderlyingSymbol: cand.ref.TradingSymbol,
			UnderlyingName:   cand.ref.Underlying,
			UnderlyingPrice:  lastClose,
			Direction:        "PUT",
			Confidence:       0.6,
			StopLoss:         lastClose + atrVal*cfg.StopATRMultiplier,
			TakeProfit:       lastClose - atrVal*cfg.TargetATRMultiplier,
			Timeframe:        fmt.Sprintf("%dm", tf),
			Reason:           fmt.Sprintf("bb_squeeze_break_%s", cand.ref.TradingSymbol),
			Raw:              raw,
		}}
	}
	return nil
}

func (e *Engine) buildEventStraddleDraft(ctx context.Context, now time.Time, cfg config.StrategyConfig, underlyingsWithOptions map[string]struct{}, openUnderlyings map[string]struct{}, cooldowns map[string]time.Time) (*signalDraft, *store.StrategyCooldown, error) {
	if !cfg.EventStraddleEnable {
		return nil, nil, nil
	}
	if !eventDateAllowed(now, cfg.EventStraddleDates, e.loc) {
		return nil, nil, nil
	}
	token := strings.TrimSpace(cfg.EventStraddleToken)
	if token == "" {
		token = strings.TrimSpace(cfg.IndexToken)
	}
	if token == "" {
		return nil, nil, nil
	}
	underlying := strings.ToUpper(strings.TrimSpace(cfg.EventStraddleUnderlying))
	if underlying == "" {
		return nil, nil, nil
	}
	if _, ok := underlyingsWithOptions[underlying]; !ok {
		return nil, nil, nil
	}
	if _, ok := openUnderlyings[underlying]; ok {
		return nil, nil, nil
	}
	exchange := strings.TrimSpace(cfg.EventStraddleExchange)
	if exchange == "" {
		exchange = "NSE"
	}
	if until, ok := cooldowns[cooldownKey("event_straddle", exchange, token)]; ok && now.Before(until) {
		return nil, nil, nil
	}
	start := eventStraddleFetchStart(now, cfg, e.loc)
	minuteBars, err := fetchMinuteBars(ctx, e.store, exchange, []string{token}, start)
	if err != nil {
		return nil, nil, err
	}
	bars := minuteBars[token]
	if len(bars) < cfg.BBPeriod+2 {
		return nil, nil, nil
	}
	priceMap, err := fetchInstrumentPrices(ctx, e.store, exchange, []string{token})
	if err != nil {
		return nil, nil, err
	}
	lastPrice := priceMap[token]
	ref := instrumentRef{
		Exchange:      exchange,
		Token:         token,
		TradingSymbol: underlying,
		Underlying:    underlying,
	}
	ok, draft := e.evaluateEventStraddle(now, ref, bars, lastPrice, cfg)
	if !ok {
		return nil, nil, nil
	}
	cooldownMinutes := cfg.EventStraddleCooldownMinutes
	if cooldownMinutes <= 0 {
		cooldownMinutes = cfg.CooldownMinutes
	}
	var cooldown *store.StrategyCooldown
	if cooldownMinutes > 0 {
		cooldown = &store.StrategyCooldown{
			Strategy:      "event_straddle",
			Exchange:      exchange,
			SymbolToken:   token,
			CooldownUntil: now.Add(time.Duration(cooldownMinutes) * time.Minute).UTC(),
		}
	}
	return &draft, cooldown, nil
}

func (e *Engine) evaluateEventStraddle(now time.Time, ref instrumentRef, bars []minuteBar, lastPrice float64, cfg config.StrategyConfig) (bool, signalDraft) {
	start, end, enforceWindow, err := eventWindow(now, cfg.EventStraddleStart, cfg.EventStraddleEnd, e.loc)
	if err != nil {
		return false, signalDraft{}
	}
	if enforceWindow && (now.Before(start) || now.After(end)) {
		return false, signalDraft{}
	}
	tf := cfg.EventStraddleTimeframeMinutes
	if tf <= 0 {
		tf = 5
	}
	barsTF := aggregateBars(bars, tf, e.loc)
	if len(barsTF) < cfg.BBPeriod+2 {
		return false, signalDraft{}
	}
	lookbackMinutes := cfg.EventStraddleLookbackMinutes
	if lookbackMinutes <= 0 {
		lookbackMinutes = 60
	}
	lookbackBars := lookbackMinutes / tf
	if lookbackBars < cfg.BBPeriod {
		lookbackBars = cfg.BBPeriod
	}
	if len(barsTF) < lookbackBars {
		return false, signalDraft{}
	}
	startIdx := len(barsTF) - lookbackBars
	if startIdx < 0 {
		startIdx = 0
	}
	closes := extractMinuteCloses(barsTF)
	highs := extractMinuteHighs(barsTF)
	lows := extractMinuteLows(barsTF)
	mid, upper, lower := bollinger(closes, cfg.BBPeriod, cfg.BBStdDev)
	if mid == 0 {
		return false, signalDraft{}
	}
	lastClose := closes[len(closes)-1]
	if lastPrice > 0 {
		lastClose = lastPrice
	}
	bandwidth := (upper - lower) / mid * 100
	if cfg.EventStraddleBandwidthPct > 0 && bandwidth > cfg.EventStraddleBandwidthPct {
		return false, signalDraft{}
	}
	bandSeries := bandwidthSeries(closes, cfg.BBPeriod, cfg.BBStdDev)
	bwSlope := seriesSlopePct(bandSeries, startIdx)
	if cfg.EventStraddleBandwidthSlopeMax != 0 && bwSlope > cfg.EventStraddleBandwidthSlopeMax {
		return false, signalDraft{}
	}
	rangeHigh := 0.0
	rangeLow := math.MaxFloat64
	for i := startIdx; i < len(barsTF); i++ {
		if highs[i] > rangeHigh {
			rangeHigh = highs[i]
		}
		if lows[i] < rangeLow {
			rangeLow = lows[i]
		}
	}
	if rangeLow == math.MaxFloat64 || rangeHigh == 0 {
		return false, signalDraft{}
	}
	rangePct := (rangeHigh - rangeLow) / lastClose * 100
	if cfg.EventStraddleRangePct > 0 && rangePct > cfg.EventStraddleRangePct {
		return false, signalDraft{}
	}
	atrVals := atrSeries(highs, lows, closes, cfg.ATRPeriod)
	if len(atrVals) == 0 {
		return false, signalDraft{}
	}
	atrPctSeries := make([]float64, len(atrVals))
	for i, v := range atrVals {
		if v > 0 && closes[i] > 0 {
			atrPctSeries[i] = v / closes[i] * 100
		}
	}
	atrPct := atrPctSeries[len(atrPctSeries)-1]
	if cfg.EventStraddleATRPercentMax > 0 && atrPct > cfg.EventStraddleATRPercentMax {
		return false, signalDraft{}
	}
	atrSlope := seriesSlopePct(atrPctSeries, startIdx)
	if cfg.EventStraddleATRPercentSlopeMax != 0 && atrSlope > cfg.EventStraddleATRPercentSlopeMax {
		return false, signalDraft{}
	}
	atrVal := atr(highs, lows, closes, cfg.ATRPeriod)
	if atrVal <= 0 {
		return false, signalDraft{}
	}
	raw := map[string]any{
		"event_date":        now.In(e.loc).Format("2006-01-02"),
		"window_start":      formatWindowTime(start, enforceWindow),
		"window_end":        formatWindowTime(end, enforceWindow),
		"timeframe_minutes": tf,
		"lookback_minutes":  lookbackMinutes,
		"bandwidth_pct":     bandwidth,
		"bandwidth_slope":   bwSlope,
		"range_pct":         rangePct,
		"atr_pct":           atrPct,
		"atr_pct_slope":     atrSlope,
		"direction":         "STRADDLE",
	}
	draft := signalDraft{
		Strategy:         "event_straddle",
		Exchange:         ref.Exchange,
		UnderlyingToken:  ref.Token,
		UnderlyingSymbol: ref.TradingSymbol,
		UnderlyingName:   ref.Underlying,
		UnderlyingPrice:  lastClose,
		Direction:        "STRADDLE",
		Confidence:       0.7,
		StopLoss:         lastClose - atrVal*cfg.StopATRMultiplier,
		TakeProfit:       lastClose + atrVal*cfg.TargetATRMultiplier,
		Timeframe:        fmt.Sprintf("%dm", tf),
		Reason:           fmt.Sprintf("event_straddle_%s", ref.TradingSymbol),
		Raw:              raw,
	}
	return true, draft
}

func (e *Engine) convertDraftsToSignals(ctx context.Context, now time.Time, drafts []signalDraft, cfg config.StrategyConfig) ([]store.StrategySignal, error) {
	underlyingSet := map[string]struct{}{}
	for _, draft := range drafts {
		underlying := resolveUnderlyingName(draft)
		if underlying != "" {
			underlyingSet[underlying] = struct{}{}
		}
	}
	underlyings := make([]string, 0, len(underlyingSet))
	for key := range underlyingSet {
		underlyings = append(underlyings, key)
	}
	contractsByUnderlying, err := fetchOptionContracts(ctx, e.store, underlyings)
	if err != nil {
		return nil, err
	}

	type pendingLeg struct {
		draft   signalDraft
		draftID int
		right   string
		option  optionContract
	}
	var pending []pendingLeg
	pendingByDraft := map[int]map[string]pendingLeg{}
	for idx, draft := range drafts {
		underlying := resolveUnderlyingName(draft)
		if underlying == "" {
			continue
		}
		contracts := contractsByUnderlying[underlying]
		if len(contracts) == 0 {
			continue
		}
		rights := []string{}
		switch strings.ToUpper(strings.TrimSpace(draft.Direction)) {
		case "STRADDLE", "STRANGLE":
			rights = []string{"CE", "PE"}
		case "CALL":
			if !cfg.OptionAllowSingleLeg {
				continue
			}
			rights = []string{"CE"}
		case "PUT":
			if !cfg.OptionAllowSingleLeg {
				continue
			}
			rights = []string{"PE"}
		default:
			continue
		}
		for _, right := range rights {
			option, ok := selectOptionContract(contracts, draft.UnderlyingPrice, right, cfg.OptionExpiryRank, cfg.OptionMinDaysToExpiry, now, e.loc)
			if !ok {
				continue
			}
			leg := pendingLeg{draft: draft, draftID: idx, right: right, option: option}
			pending = append(pending, leg)
			if _, ok := pendingByDraft[idx]; !ok {
				pendingByDraft[idx] = map[string]pendingLeg{}
			}
			pendingByDraft[idx][right] = leg
		}
	}
	if len(pending) == 0 {
		return nil, nil
	}
	tokensByExchange := map[string][]string{}
	for _, leg := range pending {
		tokensByExchange[leg.option.Exchange] = append(tokensByExchange[leg.option.Exchange], leg.option.Token)
	}
	quotes, err := fetchInstrumentQuotesMulti(ctx, e.store, tokensByExchange)
	if err != nil {
		return nil, err
	}
	allowStraddle := map[int]bool{}
	if cfg.OptionStraddleEqualize {
		minRatio := cfg.OptionStraddleRatioMin
		maxRatio := cfg.OptionStraddleRatioMax
		maxSpread := cfg.OptionStraddleMaxSpreadPct
		for id, legs := range pendingByDraft {
			leg := legs["CE"]
			if !strings.EqualFold(leg.draft.Direction, "STRADDLE") && !strings.EqualFold(leg.draft.Direction, "STRANGLE") {
				allowStraddle[id] = true
				continue
			}
			ce, okCE := legs["CE"]
			pe, okPE := legs["PE"]
			if !okCE || !okPE {
				continue
			}
			ceQuote := quotes[ce.option.Token]
			peQuote := quotes[pe.option.Token]
			if ceQuote.Price <= 0 || peQuote.Price <= 0 {
				continue
			}
			ratio := ceQuote.Price / peQuote.Price
			if minRatio > 0 && ratio < minRatio {
				continue
			}
			if maxRatio > 0 && ratio > maxRatio {
				continue
			}
			if maxSpread > 0 {
				if spreadPct(ceQuote) > maxSpread || spreadPct(peQuote) > maxSpread {
					continue
				}
			}
			allowStraddle[id] = true
		}
	}
	var signals []store.StrategySignal
	for _, leg := range pending {
		if cfg.MaxSignalsPerRun > 0 && len(signals) >= cfg.MaxSignalsPerRun {
			break
		}
		if cfg.OptionStraddleEqualize && (strings.EqualFold(leg.draft.Direction, "STRADDLE") || strings.EqualFold(leg.draft.Direction, "STRANGLE")) {
			if !allowStraddle[leg.draftID] {
				continue
			}
		}
		price := quotes[leg.option.Token].Price
		if price <= 0 {
			continue
		}
		if cfg.OptionMinPremium > 0 && price < cfg.OptionMinPremium {
			continue
		}
		stop := 0.0
		target := 0.0
		if cfg.OptionStopLossPct > 0 {
			stop = price * (1 - cfg.OptionStopLossPct)
		}
		if cfg.OptionTargetPct > 0 {
			target = price * (1 + cfg.OptionTargetPct)
		}
		raw := map[string]any{}
		for k, v := range leg.draft.Raw {
			raw[k] = v
		}
		raw["underlying"] = resolveUnderlyingName(leg.draft)
		raw["underlying_token"] = leg.draft.UnderlyingToken
		raw["underlying_price"] = leg.draft.UnderlyingPrice
		raw["option_token"] = leg.option.Token
		raw["option_symbol"] = leg.option.TradingSymbol
		raw["option_expiry"] = leg.option.Expiry.Format("2006-01-02")
		raw["option_strike"] = leg.option.Strike
		raw["option_right"] = leg.right
		raw["option_price"] = price
		raw["option_stop"] = stop
		raw["option_target"] = target
		signal := store.StrategySignal{
			Ts:          now.UTC(),
			Strategy:    leg.draft.Strategy,
			Exchange:    leg.option.Exchange,
			SymbolToken: leg.option.Token,
			Side:        "BUY",
			Confidence:  leg.draft.Confidence,
			EntryPrice:  price,
			StopLoss:    stop,
			TakeProfit:  target,
			Timeframe:   leg.draft.Timeframe,
			Reason:      leg.draft.Reason,
			Raw:         mustJSON(raw),
		}
		signals = append(signals, signal)
	}
	return signals, nil
}

func spreadPct(q instrumentQuote) float64 {
	if q.Bid == nil || q.Ask == nil {
		return 0
	}
	if *q.Bid <= 0 || *q.Ask <= 0 {
		return 0
	}
	mid := (*q.Bid + *q.Ask) / 2
	if mid <= 0 {
		return 0
	}
	return (*q.Ask - *q.Bid) / mid * 100
}

func resolveUnderlyingName(draft signalDraft) string {
	if trimmed := strings.TrimSpace(draft.UnderlyingName); trimmed != "" {
		return strings.ToUpper(trimmed)
	}
	if trimmed := strings.TrimSpace(draft.UnderlyingSymbol); trimmed != "" {
		clean := strings.TrimSuffix(strings.ToUpper(trimmed), "-EQ")
		return clean
	}
	return ""
}

func selectOptionContract(contracts []optionContract, underlyingPrice float64, right string, expiryRank int, minDays int, now time.Time, loc *time.Location) (optionContract, bool) {
	if len(contracts) == 0 {
		return optionContract{}, false
	}
	right = strings.ToUpper(strings.TrimSpace(right))
	cutoff := time.Date(now.In(loc).Year(), now.In(loc).Month(), now.In(loc).Day(), 0, 0, 0, 0, loc)
	if minDays > 0 {
		cutoff = cutoff.AddDate(0, 0, minDays)
	}
	expiries := []time.Time{}
	seen := map[time.Time]struct{}{}
	for _, c := range contracts {
		if c.Expiry.Before(cutoff) {
			continue
		}
		if _, ok := seen[c.Expiry]; ok {
			continue
		}
		seen[c.Expiry] = struct{}{}
		expiries = append(expiries, c.Expiry)
	}
	sort.Slice(expiries, func(i, j int) bool { return expiries[i].Before(expiries[j]) })
	if len(expiries) == 0 {
		return optionContract{}, false
	}
	rank := expiryRank
	if rank < 0 {
		rank = 0
	}
	if rank >= len(expiries) {
		rank = len(expiries) - 1
	}
	chosenExpiry := expiries[rank]
	var best optionContract
	bestDiff := math.MaxFloat64
	found := false
	for _, c := range contracts {
		if c.Expiry != chosenExpiry {
			continue
		}
		if strings.ToUpper(strings.TrimSpace(c.Right)) != right {
			continue
		}
		diff := math.Abs(c.Strike - underlyingPrice)
		if diff < bestDiff {
			bestDiff = diff
			best = c
			found = true
		}
	}
	return best, found
}

func marketOpenTime(now time.Time, tradingStart string, loc *time.Location) time.Time {
	parsed, err := time.ParseInLocation("15:04", tradingStart, loc)
	if err != nil {
		return time.Date(now.Year(), now.Month(), now.Day(), 9, 15, 0, 0, loc)
	}
	local := now.In(loc)
	return time.Date(local.Year(), local.Month(), local.Day(), parsed.Hour(), parsed.Minute(), 0, 0, loc)
}

func strategyStartTime(now time.Time, cfg config.StrategyConfig, tradingStart string, loc *time.Location) time.Time {
	start := now.Add(-time.Duration(cfg.LookbackMinutes) * time.Minute)
	if cfg.ORBEnable {
		open := marketOpenTime(now, tradingStart, loc)
		if open.Before(start) {
			start = open
		}
	}
	return start
}

func (e *Engine) sendSignalAlerts(ctx context.Context, signals []store.StrategySignal) {
	if !e.cfg.Alerts.EnableWebhook || e.webhook == nil || len(signals) == 0 {
		return
	}
	max := e.cfg.Alerts.MaxPerRun
	if max <= 0 {
		max = len(signals)
	}
	tokens := make([]string, 0, len(signals))
	for _, sig := range signals {
		if sig.SymbolToken != "" {
			tokens = append(tokens, sig.SymbolToken)
		}
	}
	details, _ := fetchInstrumentDetails(ctx, e.store, tokens)
	for i, sig := range signals {
		if i >= max {
			break
		}
		title := fmt.Sprintf("%s signal %s", e.cfg.Alerts.TitlePrefix, sig.Side)
		detail := details[sig.SymbolToken]
		symbolLabel := detail.TradingSymbol
		if symbolLabel == "" {
			symbolLabel = sig.SymbolToken
		}
		metaParts := []string{}
		if detail.Underlying != "" {
			metaParts = append(metaParts, detail.Underlying)
		}
		if detail.Right != "" {
			metaParts = append(metaParts, detail.Right)
		}
		if detail.Strike > 0 {
			metaParts = append(metaParts, fmt.Sprintf("%.0f", detail.Strike))
		}
		if !detail.Expiry.IsZero() && detail.Expiry.Year() > 1 {
			metaParts = append(metaParts, detail.Expiry.Format("02Jan"))
		}
		meta := strings.TrimSpace(strings.Join(metaParts, " "))
		msg := fmt.Sprintf("%s %s %s @ %.2f SL %.2f TP %.2f", sig.Strategy, symbolLabel, meta, sig.EntryPrice, sig.StopLoss, sig.TakeProfit)
		_ = e.webhook.Send(ctx, title, msg)
	}
}

func (e *Engine) evaluateManualStraddles(ctx context.Context, cfg config.StrategyConfig, now time.Time) error {
	if len(cfg.ManualStraddles) == 0 {
		return nil
	}
	active := make([]config.ManualStraddleConfig, 0, len(cfg.ManualStraddles))
	tokensByExchange := map[string][]string{}
	tokenSet := map[string]struct{}{}
	for _, entry := range cfg.ManualStraddles {
		if !entry.Enabled {
			continue
		}
		if strings.TrimSpace(entry.CEToken) == "" || strings.TrimSpace(entry.PEToken) == "" {
			continue
		}
		exch := strings.TrimSpace(entry.Exchange)
		if exch == "" {
			exch = "NFO"
		}
		entry.Exchange = exch
		active = append(active, entry)
		tokensByExchange[exch] = append(tokensByExchange[exch], entry.CEToken, entry.PEToken)
		tokenSet[entry.CEToken] = struct{}{}
		tokenSet[entry.PEToken] = struct{}{}
	}
	if len(active) == 0 {
		return nil
	}
	quotes, err := fetchInstrumentQuotesMulti(ctx, e.store, tokensByExchange)
	if err != nil {
		return err
	}
	tokens := make([]string, 0, len(tokenSet))
	for token := range tokenSet {
		tokens = append(tokens, token)
	}
	lotSizes, _ := fetchInstrumentLotSizes(ctx, e.store, tokens)
	details, _ := fetchInstrumentDetails(ctx, e.store, tokens)

	states := make([]store.StrategyState, 0, len(active))
	for _, entry := range active {
		ceQuote, okCE := quotes[entry.CEToken]
		peQuote, okPE := quotes[entry.PEToken]
		if !okCE || !okPE {
			continue
		}
		if ceQuote.Price <= 0 || peQuote.Price <= 0 {
			continue
		}
		entryTotal := entry.CEEntry + entry.PEEntry
		if entryTotal <= 0 {
			continue
		}
		total := ceQuote.Price + peQuote.Price
		state, ok := e.manualStraddleStates[entry.Name]
		if !ok {
			state = &manualStraddleState{Peak: total}
			e.manualStraddleStates[entry.Name] = state
		}
		if total > state.Peak {
			state.Peak = total
		}

		lotSize := lotSizes[entry.CEToken]
		if lotSize == 0 {
			lotSize = lotSizes[entry.PEToken]
		}
		if lotSize == 0 {
			lotSize = 1
		}
		lots := entry.QuantityLots
		if lots <= 0 {
			lots = 1
		}
		tp := 0.0
		if entry.TargetProfitRupees > 0 && lotSize > 0 && lots > 0 {
			tp = entryTotal + entry.TargetProfitRupees/float64(lotSize*lots)
		} else if entry.TPPercent > 0 {
			tp = entryTotal * (1 + entry.TPPercent)
		}
		sl := entryTotal * (1 - entry.SLPercent)
		trail := 0.0
		if entry.TrailPercent > 0 && state.Peak > 0 {
			trail = state.Peak * (1 - entry.TrailPercent)
		}
		signal := ""
		if state.LastSignal == "" {
			if entry.SLPercent > 0 && total <= sl {
				signal = "SL"
			} else if tp > 0 && total >= tp {
				signal = "TP"
			} else if entry.TrailPercent > 0 && state.Peak > entryTotal && total <= trail {
				signal = "TRAIL"
			}
		}

		ceDetail := details[entry.CEToken]
		peDetail := details[entry.PEToken]
		name := strings.TrimSpace(entry.Name)
		if name == "" {
			if ceDetail.Underlying != "" && ceDetail.Expiry.After(time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC)) {
				name = fmt.Sprintf("%s %s %.0f", ceDetail.Underlying, ceDetail.Expiry.Format("02Jan06"), ceDetail.Strike)
			} else {
				name = fmt.Sprintf("Straddle %s/%s", entry.CEToken, entry.PEToken)
			}
		}

		pnlRupees := (total - entryTotal) * float64(lotSize*lots)
		status := manualStraddleStatus{
			Name:               name,
			Exchange:           entry.Exchange,
			CE:                 ceDetail.TradingSymbol,
			PE:                 peDetail.TradingSymbol,
			CEToken:            entry.CEToken,
			PEToken:            entry.PEToken,
			CEPrice:            ceQuote.Price,
			PEPrice:            peQuote.Price,
			EntryTotal:         entryTotal,
			CurrentTotal:       total,
			TP:                 tp,
			SL:                 sl,
			Trail:              trail,
			Peak:               state.Peak,
			LotSize:            lotSize,
			Lots:               lots,
			TargetProfitRupees: entry.TargetProfitRupees,
			PnlRupees:          pnlRupees,
			Signal:             signal,
		}
		states = append(states, store.StrategyState{
			Ts:    now.UTC(),
			Name:  "manual_straddle:" + name,
			Value: signalOrOpen(signal),
			Raw:   mustJSON(status),
		})

		if signal != "" && e.webhook != nil && e.cfg.Alerts.EnableWebhook {
			state.LastSignal = signal
			title := strings.TrimSpace(e.cfg.Alerts.TitlePrefix)
			if title != "" {
				title = title + " Manual Straddle Exit"
			} else {
				title = "Manual Straddle Exit"
			}
			message := fmt.Sprintf("%s | CE %.2f + PE %.2f = %.2f (Entry %.2f) PnL ₹%.0f | TP %.2f SL %.2f Trail %.2f Peak %.2f | EXIT %s",
				name, ceQuote.Price, peQuote.Price, total, entryTotal, pnlRupees, tp, sl, trail, state.Peak, signal)
			if err := e.webhook.Send(ctx, title, message); err != nil && e.logger != nil {
				e.logger.Warn("manual_straddle_alert_failed", "name", name, "err", err)
			}
		}
	}
	if len(states) > 0 {
		_ = e.store.UpsertStrategyStates(ctx, states)
	}
	return nil
}

func signalOrOpen(signal string) string {
	if strings.TrimSpace(signal) == "" {
		return "open"
	}
	return signal
}

func (e *Engine) executePaperTrades(ctx context.Context, signals []store.StrategySignal, prices map[string]float64, positions map[string]store.PaperPosition) error {
	openCount := 0
	for _, pos := range positions {
		if pos.Qty != 0 {
			openCount++
		}
	}
	maxOpen := e.cfg.Paper.MaxOpenPositions
	var orders []store.PaperOrder
	var trades []store.PaperTrade
	var posUpdates []store.PaperPosition

	for _, sig := range signals {
		if openCount >= maxOpen {
			break
		}
		if !strings.EqualFold(sig.Side, "BUY") {
			continue
		}
		key := positionKey(sig.Exchange, sig.SymbolToken)
		if pos, ok := positions[key]; ok && pos.Qty != 0 {
			continue
		}
		price := sig.EntryPrice
		if last, ok := prices[sig.SymbolToken]; ok && last > 0 {
			price = last
		}
		if price <= 0 {
			continue
		}
		price = applySlippage(price, sig.Side, e.cfg.Paper.SlippageBps)
		qty := int64(math.Floor(e.cfg.Paper.CapitalPerTrade / price))
		if qty < 1 {
			continue
		}
		orderID := newRunID()
		tradeID := newRunID()
		entryTs := time.Now().UTC()
		stopLoss := sig.StopLoss
		takeProfit := sig.TakeProfit
		raw := mustJSON(map[string]any{
			"signal":      json.RawMessage(sig.Raw),
			"stop_loss":   sig.StopLoss,
			"take_profit": sig.TakeProfit,
			"confidence":  sig.Confidence,
		})
		orders = append(orders, store.PaperOrder{
			OrderID:     orderID,
			CreatedAt:   time.Now().UTC(),
			Strategy:    sig.Strategy,
			Exchange:    sig.Exchange,
			SymbolToken: sig.SymbolToken,
			Side:        sig.Side,
			Qty:         qty,
			OrderType:   "MARKET",
			Price:       price,
			Status:      "FILLED",
			FilledQty:   qty,
			FilledPrice: price,
			Raw:         raw,
		})
		trades = append(trades, store.PaperTrade{
			TradeID:     tradeID,
			OrderID:     orderID,
			Ts:          time.Now().UTC(),
			Strategy:    sig.Strategy,
			Exchange:    sig.Exchange,
			SymbolToken: sig.SymbolToken,
			Side:        sig.Side,
			Qty:         qty,
			Price:       price,
			Fees:        e.cfg.Paper.BrokeragePerTrade,
			Raw:         raw,
		})
		posUpdates = append(posUpdates, store.PaperPosition{
			Exchange:      sig.Exchange,
			SymbolToken:   sig.SymbolToken,
			Strategy:      sig.Strategy,
			Side:          sig.Side,
			Qty:           qty,
			AvgPrice:      price,
			EntryPrice:    &price,
			EntryTs:       &entryTs,
			StopLoss:      &stopLoss,
			TakeProfit:    &takeProfit,
			RealizedPNL:   -e.cfg.Paper.BrokeragePerTrade,
			UnrealizedPNL: 0,
			UpdatedAt:     time.Now().UTC(),
		})
		openCount++
	}
	if len(orders) == 0 {
		return nil
	}
	return e.store.RecordPaperBatch(ctx, orders, trades, posUpdates)
}

func (e *Engine) updatePaperPositions(now time.Time, positions map[string]store.PaperPosition, prices map[string]float64) ([]store.PaperPosition, []store.PaperOrder, []store.PaperTrade) {
	var updates []store.PaperPosition
	var orders []store.PaperOrder
	var trades []store.PaperTrade

	for key, pos := range positions {
		if pos.Qty == 0 {
			continue
		}
		price := prices[pos.SymbolToken]
		if price <= 0 {
			continue
		}
		side := strings.ToUpper(strings.TrimSpace(pos.Side))
		if side == "" {
			side = "BUY"
			pos.Side = side
		}
		unrealized := (price - pos.AvgPrice) * float64(pos.Qty)
		if side == "SELL" {
			unrealized = (pos.AvgPrice - price) * float64(pos.Qty)
		}
		pos.UnrealizedPNL = unrealized
		pos.UpdatedAt = now.UTC()

		exitReason := ""
		exitSide := ""
		if cfgStop := e.cfg.Strategy.OptionTimeStopMinutes; cfgStop > 0 && pos.EntryTs != nil {
			if now.Sub(*pos.EntryTs) >= time.Duration(cfgStop)*time.Minute {
				exitReason = "time_stop"
				if side == "BUY" {
					exitSide = "SELL"
				} else {
					exitSide = "BUY"
				}
			}
		}
		if side == "BUY" {
			if pos.StopLoss != nil && price <= *pos.StopLoss {
				exitReason = "stop_loss"
				exitSide = "SELL"
			} else if pos.TakeProfit != nil && price >= *pos.TakeProfit {
				exitReason = "take_profit"
				exitSide = "SELL"
			}
		} else if side == "SELL" {
			if pos.StopLoss != nil && price >= *pos.StopLoss {
				exitReason = "stop_loss"
				exitSide = "BUY"
			} else if pos.TakeProfit != nil && price <= *pos.TakeProfit {
				exitReason = "take_profit"
				exitSide = "BUY"
			}
		}

		if exitReason != "" {
			qty := pos.Qty
			exitPrice := applySlippage(price, exitSide, e.cfg.Paper.SlippageBps)
			gross := (exitPrice - pos.AvgPrice) * float64(qty)
			if side == "SELL" {
				gross = (pos.AvgPrice - exitPrice) * float64(qty)
			}
			realized := gross - e.cfg.Paper.BrokeragePerTrade
			pos.RealizedPNL += realized
			pos.Qty = 0
			pos.UnrealizedPNL = 0
			pos.UpdatedAt = now.UTC()

			strategy := pos.Strategy
			if strategy == "" {
				strategy = "core"
			}
			orderID := newRunID()
			tradeID := newRunID()
			raw := mustJSON(map[string]any{
				"reason":      exitReason,
				"entry_price": pos.AvgPrice,
				"exit_price":  exitPrice,
				"stop_loss":   pos.StopLoss,
				"take_profit": pos.TakeProfit,
				"entry_ts":    pos.EntryTs,
			})
			orders = append(orders, store.PaperOrder{
				OrderID:     orderID,
				CreatedAt:   now.UTC(),
				Strategy:    strategy,
				Exchange:    pos.Exchange,
				SymbolToken: pos.SymbolToken,
				Side:        exitSide,
				Qty:         qty,
				OrderType:   "MARKET",
				Price:       exitPrice,
				Status:      "FILLED",
				FilledQty:   qty,
				FilledPrice: exitPrice,
				Raw:         raw,
			})
			trades = append(trades, store.PaperTrade{
				TradeID:     tradeID,
				OrderID:     orderID,
				Ts:          now.UTC(),
				Strategy:    strategy,
				Exchange:    pos.Exchange,
				SymbolToken: pos.SymbolToken,
				Side:        exitSide,
				Qty:         qty,
				Price:       exitPrice,
				Fees:        e.cfg.Paper.BrokeragePerTrade,
				Raw:         raw,
			})
		}
		updates = append(updates, pos)
		positions[key] = pos
	}

	return updates, orders, trades
}

func newRunID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err == nil {
		return hex.EncodeToString(b)
	}
	return fmt.Sprintf("%d", time.Now().UnixNano())
}

func hashStrategyConfig(cfg config.StrategyConfig) string {
	raw, _ := json.Marshal(cfg)
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])
}

func errorMessage(err error) *string {
	if err == nil {
		return nil
	}
	msg := err.Error()
	return &msg
}

func mustJSON(v any) []byte {
	raw, _ := json.Marshal(v)
	return raw
}

func applySlippage(price float64, side string, bps float64) float64 {
	if bps <= 0 {
		return price
	}
	mult := 1 + (bps / 10000)
	if strings.EqualFold(side, "SELL") {
		mult = 1 - (bps / 10000)
	}
	return price * mult
}
