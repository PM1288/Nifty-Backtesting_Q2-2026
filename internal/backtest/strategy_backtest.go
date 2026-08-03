package backtest

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
)

type StrategyBTTrade struct {
	Strategy      string
	Exchange      string
	SymbolToken   string
	Symbol        string
	TradingSymbol string
	Direction     string
	EntryTime     time.Time
	EntryPrice    float64
	ExitTime      time.Time
	ExitPrice     float64
	Qty           int64
	PnL           float64
	PnLPct        float64
	ExitReason    string
	Raw           []byte
}

type StrategyBTSummary struct {
	TotalTrades int
	Wins        int
	Losses      int
	WinRate     float64
	TotalPnL    float64
	MaxDrawdown float64
}

type StrategyEquityPoint struct {
	Ts       time.Time
	Equity   float64
	Drawdown float64
}

type StrategyBTRunResult struct {
	RunID            string
	TradeDate        time.Time
	Trades           []StrategyBTTrade
	Summary          StrategyBTSummary
	SymbolsEvaluated int
	EquityCurve      []StrategyEquityPoint
}

func (r *Runner) runStrategyBacktest(ctx context.Context, tradeDate time.Time) (StrategyBTRunResult, error) {
	universeName := strings.TrimSpace(r.cfg.Backtest.StrategyUniverseName)
	if universeName == "" {
		universeName = strings.TrimSpace(r.cfg.Backtest.UniverseName)
	}
	universe, err := fetchUniverse(ctx, r.store, universeName)
	if err != nil {
		return StrategyBTRunResult{}, err
	}
	if len(universe) == 0 {
		return StrategyBTRunResult{
			RunID:            fmt.Sprintf("strategy-%s-%s", tradeDate.In(r.loc).Format("20060102"), time.Now().UTC().Format("150405")),
			TradeDate:        tradeDate,
			Trades:           nil,
			Summary:          StrategyBTSummary{},
			SymbolsEvaluated: 0,
			EquityCurve:      nil,
		}, nil
	}
	maxSymbols := r.cfg.Backtest.StrategyMaxSymbols
	if maxSymbols > 0 && len(universe) > maxSymbols {
		universe = universe[:maxSymbols]
	}

	start, end, err := tradingWindowForDate(tradeDate, r.cfg.Runtime.TradingStart, r.cfg.Runtime.TradingEnd, r.loc)
	if err != nil {
		return StrategyBTRunResult{}, err
	}
	barsByToken, err := fetchMinuteBars(ctx, r.store, universe, start.UTC(), end.UTC())
	if err != nil {
		return StrategyBTRunResult{}, err
	}

	capital := r.cfg.Backtest.StrategyCapitalPerTrade
	if capital <= 0 {
		capital = r.cfg.Paper.CapitalPerTrade
	}
	if capital <= 0 {
		capital = 100000
	}
	slippageBps := r.cfg.Backtest.StrategySlippageBps
	timeStopMinutes := r.cfg.Backtest.StrategyTimeStopMinutes

	trades := make([]StrategyBTTrade, 0, len(universe))
	for _, ref := range universe {
		rows := barsByToken[ref.Token]
		if len(rows) < 5 {
			continue
		}
		simulated := simulateStrategyTrades(ref, rows, r.cfg.Strategy, capital, slippageBps, timeStopMinutes, r.loc, r.cfg.Runtime.TradingStart)
		if len(simulated) == 0 {
			continue
		}
		trades = append(trades, simulated...)
	}

	sort.SliceStable(trades, func(i, j int) bool {
		if trades[i].EntryTime.Equal(trades[j].EntryTime) {
			if trades[i].Strategy == trades[j].Strategy {
				return trades[i].SymbolToken < trades[j].SymbolToken
			}
			return trades[i].Strategy < trades[j].Strategy
		}
		return trades[i].EntryTime.Before(trades[j].EntryTime)
	})
	summary := summarizeStrategyTrades(trades)
	runID := fmt.Sprintf("strategy-%s-%s", tradeDate.In(r.loc).Format("20060102"), time.Now().UTC().Format("150405"))
	return StrategyBTRunResult{
		RunID:            runID,
		TradeDate:        tradeDate,
		Trades:           trades,
		Summary:          summary,
		SymbolsEvaluated: len(universe),
		EquityCurve:      buildEquityCurve(trades),
	}, nil
}

func buildStrategyBacktestFromA02(a02Result A02RunResult) StrategyBTRunResult {
	runID := fmt.Sprintf("equity-%s", a02Result.RunID.UTC().Format("20060102T150405"))
	trades := make([]StrategyBTTrade, 0, len(a02Result.Trades))
	for _, trade := range a02Result.Trades {
		exitReason := "eod_or_sl"
		if trade.Success {
			exitReason = "target_or_tp"
		}
		trades = append(trades, StrategyBTTrade{
			Strategy:      "equity_backtest",
			Exchange:      trade.Exchange,
			SymbolToken:   trade.SymbolToken,
			Symbol:        trade.Symbol,
			TradingSymbol: trade.TradingSymbol,
			Direction:     "BUY",
			EntryTime:     trade.EntryTime,
			EntryPrice:    trade.EntryClose,
			ExitTime:      trade.ExitTime,
			ExitPrice:     trade.ExitClose,
			Qty:           int64(trade.Quantity),
			PnL:           trade.NetProfit,
			PnLPct:        trade.NetGainPct / 100,
			ExitReason:    exitReason,
			Raw:           trade.Raw,
		})
	}
	summary := StrategyBTSummary{
		TotalTrades: len(trades),
		Wins:        a02Result.Summary.Wins,
		Losses:      a02Result.Summary.Losses,
		WinRate:     a02Result.Summary.WinRate,
		TotalPnL:    a02Result.Summary.TotalNetProfit,
		MaxDrawdown: maxDrawdown(trades),
	}
	return StrategyBTRunResult{
		RunID:            runID,
		TradeDate:        a02Result.TradeDate,
		Trades:           trades,
		Summary:          summary,
		SymbolsEvaluated: a02Result.SymbolsEvaluated,
		EquityCurve:      buildEquityCurve(trades),
	}
}

func (r *Runner) persistStrategyBacktest(ctx context.Context, result StrategyBTRunResult) error {
	if strings.TrimSpace(result.RunID) == "" {
		return nil
	}
	started := time.Now().UTC()
	return r.store.WithTx(ctx, func(tx pgx.Tx) error {
		stmtRun := fmt.Sprintf(`
INSERT INTO %s
  (run_id, trade_date, started_at, finished_at, status, error, symbols_evaluated, total_trades, wins, losses, win_rate, total_pnl, max_drawdown)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
ON CONFLICT (run_id) DO UPDATE SET
  trade_date = EXCLUDED.trade_date,
  finished_at = EXCLUDED.finished_at,
  status = EXCLUDED.status,
  error = EXCLUDED.error,
  symbols_evaluated = EXCLUDED.symbols_evaluated,
  total_trades = EXCLUDED.total_trades,
  wins = EXCLUDED.wins,
  losses = EXCLUDED.losses,
  win_rate = EXCLUDED.win_rate,
  total_pnl = EXCLUDED.total_pnl,
  max_drawdown = EXCLUDED.max_drawdown`, pgx.Identifier{r.store.Schema, "strategy_backtest_runs"}.Sanitize())
		finished := time.Now().UTC()
		summary := result.Summary
		if _, err := tx.Exec(ctx, stmtRun, result.RunID, result.TradeDate, started, finished, "complete", nil, result.SymbolsEvaluated, summary.TotalTrades, summary.Wins, summary.Losses, summary.WinRate, summary.TotalPnL, summary.MaxDrawdown); err != nil {
			return err
		}

		stmtTrade := fmt.Sprintf(`
INSERT INTO %s
  (run_id, strategy, exchange, symbol_token, symbol, tradingsymbol, direction, entry_time, entry_price, exit_time, exit_price, qty, pnl, pnl_pct, exit_reason, raw)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
ON CONFLICT (run_id, strategy, symbol_token, entry_time) DO NOTHING`, pgx.Identifier{r.store.Schema, "strategy_backtest_trades"}.Sanitize())
		for _, trade := range result.Trades {
			if _, err := tx.Exec(ctx, stmtTrade,
				result.RunID,
				trade.Strategy,
				trade.Exchange,
				trade.SymbolToken,
				trade.Symbol,
				trade.TradingSymbol,
				trade.Direction,
				trade.EntryTime,
				trade.EntryPrice,
				trade.ExitTime,
				trade.ExitPrice,
				trade.Qty,
				trade.PnL,
				trade.PnLPct,
				trade.ExitReason,
				trade.Raw,
			); err != nil {
				return err
			}
		}

		stmtEq := fmt.Sprintf(`
INSERT INTO %s
  (run_id, ts, equity, drawdown)
VALUES ($1,$2,$3,$4)
ON CONFLICT (run_id, ts) DO NOTHING`, pgx.Identifier{r.store.Schema, "strategy_backtest_equity"}.Sanitize())
		for _, point := range result.EquityCurve {
			if _, err := tx.Exec(ctx, stmtEq, result.RunID, point.Ts, point.Equity, point.Drawdown); err != nil {
				return err
			}
		}
		return nil
	})
}

func simulateStrategyTrades(ref instrumentRef, bars []minuteBar, cfg config.StrategyConfig, capital float64, slippageBps float64, timeStopMinutes int, loc *time.Location, tradingStart string) []StrategyBTTrade {
	var trades []StrategyBTTrade
	inPosition := false
	var position StrategyBTTrade
	var stopPrice float64
	var targetPrice float64
	var straddleEntry float64
	var straddlePremium float64
	var straddleQty int64

	for i := 0; i < len(bars); i++ {
		currentBars := bars[:i+1]
		now := currentBars[len(currentBars)-1].Ts.In(loc)
		if inPosition {
			if position.Direction == "STRADDLE" {
				exit, exitPrice, pnl, reason := evaluateExitStraddle(position.EntryTime, bars[i], straddleEntry, straddlePremium, straddleQty, cfg.OptionStopLossPct, cfg.OptionTargetPct, timeStopMinutes)
				if exit {
					position.ExitTime = bars[i].Ts
					position.ExitPrice = exitPrice
					position.ExitReason = reason
					position.PnL = pnl
					if straddlePremium > 0 && straddleQty > 0 {
						position.PnLPct = pnl / (straddlePremium * float64(straddleQty))
					}
					trades = append(trades, position)
					inPosition = false
				}
				continue
			}
			exit, exitPrice, reason := evaluateExitBT(position, stopPrice, targetPrice, bars[i], timeStopMinutes)
			if exit {
				position.ExitTime = bars[i].Ts
				position.ExitPrice = exitPrice
				position.ExitReason = reason
				position.PnL = position.PnLDirection(exitPrice)
				position.PnLPct = position.PnL / (position.EntryPrice * float64(position.Qty))
				trades = append(trades, position)
				inPosition = false
			}
			continue
		}
		drafts := evaluateStrategySetupsBT(now, ref, currentBars, cfg, loc, tradingStart)
		if len(drafts) == 0 {
			continue
		}
		draft := drafts[0]
		if draft.Direction == "STRADDLE" {
			if i+1 >= len(bars) {
				continue
			}
			entryBar := bars[i+1]
			entryUnderlying := entryBar.Open
			premium := 0.0
			if atr, ok := draft.Raw["atr"].(float64); ok && atr > 0 {
				premium = atr * cfg.StopATRMultiplier
			}
			if premium <= 0 {
				continue
			}
			qty := int64(math.Floor(capital / premium))
			if qty < 1 {
				continue
			}
			straddleEntry = entryUnderlying
			straddlePremium = premium
			straddleQty = qty
			position = StrategyBTTrade{
				Strategy:      draft.Strategy,
				Exchange:      ref.Exchange,
				SymbolToken:   ref.Token,
				Symbol:        ref.Symbol,
				TradingSymbol: ref.TradingSymbol,
				Direction:     "STRADDLE",
				EntryTime:     entryBar.Ts,
				EntryPrice:    premium,
				Qty:           qty,
				Raw:           mustJSONBT(map[string]any{"entry_underlying": entryUnderlying, "premium": premium}),
			}
			inPosition = true
			continue
		}
		if i+1 >= len(bars) {
			continue
		}
		entryBar := bars[i+1]
		entryPrice := applySlippageBT(entryBar.Open, "BUY", slippageBps)
		if entryPrice <= 0 {
			continue
		}
		qty := int64(math.Floor(capital / entryPrice))
		if qty < 1 {
			continue
		}
		stopPrice, targetPrice = draft.StopLoss, draft.TakeProfit
		if stopPrice == 0 || targetPrice == 0 {
			atrVal := atrBT(extractHighs(currentBars), extractLows(currentBars), extractCloses(currentBars), cfg.ATRPeriod)
			if atrVal > 0 {
				if draft.Direction == "PUT" {
					stopPrice = entryPrice + atrVal*cfg.StopATRMultiplier
					targetPrice = entryPrice - atrVal*cfg.TargetATRMultiplier
				} else {
					stopPrice = entryPrice - atrVal*cfg.StopATRMultiplier
					targetPrice = entryPrice + atrVal*cfg.TargetATRMultiplier
				}
			}
		}
		position = StrategyBTTrade{
			Strategy:      draft.Strategy,
			Exchange:      ref.Exchange,
			SymbolToken:   ref.Token,
			Symbol:        ref.Symbol,
			TradingSymbol: ref.TradingSymbol,
			Direction:     draft.Direction,
			EntryTime:     entryBar.Ts,
			EntryPrice:    entryPrice,
			Qty:           qty,
			Raw:           mustJSONBT(draft.Raw),
		}
		inPosition = true
	}
	if inPosition {
		last := bars[len(bars)-1]
		position.ExitTime = last.Ts
		if position.Direction == "STRADDLE" {
			position.ExitPrice = last.Close
			position.ExitReason = "eod"
			move := math.Abs(last.Close - straddleEntry)
			position.PnL = (move - straddlePremium) * float64(straddleQty)
			if straddlePremium > 0 && straddleQty > 0 {
				position.PnLPct = position.PnL / (straddlePremium * float64(straddleQty))
			}
		} else {
			position.ExitPrice = last.Close
			position.ExitReason = "eod"
			position.PnL = position.PnLDirection(last.Close)
			position.PnLPct = position.PnL / (position.EntryPrice * float64(position.Qty))
		}
		trades = append(trades, position)
	}
	return trades
}

func evaluateExitBT(pos StrategyBTTrade, stop, target float64, bar minuteBar, timeStopMinutes int) (bool, float64, string) {
	if timeStopMinutes > 0 && bar.Ts.Sub(pos.EntryTime) >= time.Duration(timeStopMinutes)*time.Minute {
		return true, bar.Close, "time_stop"
	}
	if pos.Direction == "PUT" {
		if stop > 0 && bar.High >= stop {
			return true, stop, "stop_loss"
		}
		if target > 0 && bar.Low <= target {
			return true, target, "take_profit"
		}
	} else {
		if stop > 0 && bar.Low <= stop {
			return true, stop, "stop_loss"
		}
		if target > 0 && bar.High >= target {
			return true, target, "take_profit"
		}
	}
	return false, 0, ""
}

func evaluateExitStraddle(entryTs time.Time, bar minuteBar, entryUnderlying float64, premium float64, qty int64, stopPct, targetPct float64, timeStopMinutes int) (bool, float64, float64, string) {
	if timeStopMinutes > 0 && bar.Ts.Sub(entryTs) >= time.Duration(timeStopMinutes)*time.Minute {
		move := math.Abs(bar.Close - entryUnderlying)
		pnl := (move - premium) * float64(qty)
		return true, bar.Close, pnl, "time_stop"
	}
	move := math.Abs(bar.Close - entryUnderlying)
	pnl := (move - premium) * float64(qty)
	if stopPct > 0 && pnl <= -(premium*float64(qty))*stopPct {
		return true, bar.Close, pnl, "stop_loss"
	}
	if targetPct > 0 && pnl >= (premium*float64(qty))*targetPct {
		return true, bar.Close, pnl, "take_profit"
	}
	return false, 0, 0, ""
}

func evaluateStrategySetupsBT(now time.Time, ref instrumentRef, bars []minuteBar, cfg config.StrategyConfig, loc *time.Location, tradingStart string) []signalDraftBT {
	var out []signalDraftBT
	if cfg.EMAPullbackEnable {
		if ok, draft := evaluateEMAPullbackBT(now, ref, bars, cfg, loc); ok {
			out = append(out, draft)
		}
	}
	if cfg.ORBEnable {
		if ok, draft := evaluateORBBT(now, ref, bars, cfg, loc, tradingStart); ok {
			out = append(out, draft)
		}
	}
	if cfg.SupertrendEnable {
		if ok, draft := evaluateSupertrendBT(now, ref, bars, cfg, loc); ok {
			out = append(out, draft)
		}
	}
	if cfg.BBSqueezeEnable {
		out = append(out, evaluateBBSqueezeBT(now, ref, bars, cfg, loc)...)
	}
	return out
}

type signalDraftBT struct {
	Strategy   string
	Direction  string
	StopLoss   float64
	TakeProfit float64
	Raw        map[string]any
}

func evaluateEMAPullbackBT(now time.Time, ref instrumentRef, bars []minuteBar, cfg config.StrategyConfig, loc *time.Location) (bool, signalDraftBT) {
	bars5m := aggregateBarsBT(bars, 5, loc)
	if len(bars5m) < cfg.ATRPeriod+2 {
		return false, signalDraftBT{}
	}
	close1m := extractCloses(bars)
	close5m := extractCloses(bars5m)
	emaFast5 := emaBT(close5m, cfg.EMAFast)
	emaSlow5 := emaBT(close5m, cfg.EMASlow)
	rsi5 := rsiBT(close5m, cfg.RSIPeriod)
	rsi1 := rsiBT(close1m, cfg.RSIPeriod)
	vwap1m := vwapBT(close1m, extractVolumes(bars))
	lastBar := bars[len(bars)-1]
	lastClose := lastBar.Close
	if emaFast5 <= emaSlow5 || emaFast5 == 0 {
		return false, signalDraftBT{}
	}
	pullbackDistance := math.Abs(lastClose-emaFast5) / emaFast5 * 100
	if pullbackDistance > cfg.PullbackPct {
		return false, signalDraftBT{}
	}
	if rsi5 < cfg.RSISetupMin || rsi5 > cfg.RSISetupMax {
		return false, signalDraftBT{}
	}
	vwapDistance := 0.0
	if vwap1m > 0 {
		vwapDistance = math.Abs(lastClose-vwap1m) / vwap1m * 100
	}
	if vwapDistance > cfg.VWAPDistancePct {
		return false, signalDraftBT{}
	}
	avgVol := averageVolumeBT(bars, 20)
	multiplier := cfg.VolumeSpikeMultiplier
	if multiplier <= 0 {
		multiplier = 1.5
	}
	volSpike := avgVol > 0 && float64(lastBar.Volume) > avgVol*multiplier
	trigger := rsi1 >= cfg.RSITrigger && lastClose > vwap1m && volSpike
	if !trigger {
		return false, signalDraftBT{}
	}
	atrVal := atrBT(extractHighs(bars5m), extractLows(bars5m), extractCloses(bars5m), cfg.ATRPeriod)
	if atrVal <= 0 {
		return false, signalDraftBT{}
	}
	raw := map[string]any{
		"ema_fast_5m": emaFast5,
		"ema_slow_5m": emaSlow5,
		"rsi_5m":      rsi5,
		"rsi_1m":      rsi1,
		"vwap_1m":     vwap1m,
		"atr_5m":      atrVal,
		"vol_spike":   volSpike,
	}
	return true, signalDraftBT{
		Strategy:   "ema_pullback",
		Direction:  "CALL",
		StopLoss:   lastClose - atrVal*cfg.StopATRMultiplier,
		TakeProfit: lastClose + atrVal*cfg.TargetATRMultiplier,
		Raw:        raw,
	}
}

func evaluateORBBT(now time.Time, ref instrumentRef, bars []minuteBar, cfg config.StrategyConfig, loc *time.Location, tradingStart string) (bool, signalDraftBT) {
	rangeMinutes := cfg.ORBRangeMinutes
	if rangeMinutes <= 0 {
		rangeMinutes = 15
	}
	openTime := marketOpenBT(now, tradingStart, loc)
	rangeEnd := openTime.Add(time.Duration(rangeMinutes) * time.Minute)
	lastBar := bars[len(bars)-1]
	if lastBar.Ts.Before(rangeEnd) {
		return false, signalDraftBT{}
	}
	var rangeHigh float64
	rangeLow := math.MaxFloat64
	var rangeVol int64
	rangeCount := 0
	for _, bar := range bars {
		local := bar.Ts.In(loc)
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
		return false, signalDraftBT{}
	}
	rangePct := (rangeHigh - rangeLow) / rangeLow * 100
	if cfg.ORBMinRangePct > 0 && rangePct < cfg.ORBMinRangePct {
		return false, signalDraftBT{}
	}
	if cfg.ORBMaxRangePct > 0 && rangePct > cfg.ORBMaxRangePct {
		return false, signalDraftBT{}
	}
	lastClose := lastBar.Close
	direction := ""
	if lastClose > rangeHigh {
		direction = "CALL"
	} else if lastClose < rangeLow && cfg.AllowShort {
		direction = "PUT"
	} else {
		return false, signalDraftBT{}
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
		return false, signalDraftBT{}
	}
	atrVal := atrBT(extractHighs(bars), extractLows(bars), extractCloses(bars), cfg.ATRPeriod)
	if atrVal <= 0 {
		return false, signalDraftBT{}
	}
	stop := lastClose - atrVal*cfg.StopATRMultiplier
	target := lastClose + atrVal*cfg.TargetATRMultiplier
	if direction == "PUT" {
		stop = lastClose + atrVal*cfg.StopATRMultiplier
		target = lastClose - atrVal*cfg.TargetATRMultiplier
	}
	raw := map[string]any{
		"range_high": rangeHigh,
		"range_low":  rangeLow,
		"range_pct":  rangePct,
		"vol_spike":  volSpike,
	}
	return true, signalDraftBT{
		Strategy:   "orb",
		Direction:  direction,
		StopLoss:   stop,
		TakeProfit: target,
		Raw:        raw,
	}
}

func evaluateSupertrendBT(now time.Time, ref instrumentRef, bars []minuteBar, cfg config.StrategyConfig, loc *time.Location) (bool, signalDraftBT) {
	tf := cfg.SupertrendTimeframe
	if tf <= 0 {
		tf = 5
	}
	barsTF := aggregateBarsBT(bars, tf, loc)
	if len(barsTF) < cfg.SupertrendATRPeriod+2 {
		return false, signalDraftBT{}
	}
	closes := extractCloses(barsTF)
	highs := extractHighs(barsTF)
	lows := extractLows(barsTF)
	line, dir := supertrendBT(highs, lows, closes, cfg.SupertrendATRPeriod, cfg.SupertrendMultiplier)
	if dir == 0 {
		return false, signalDraftBT{}
	}
	lastClose := closes[len(closes)-1]
	direction := ""
	if dir > 0 && lastClose > line {
		direction = "CALL"
	} else if dir < 0 && lastClose < line && cfg.AllowShort {
		direction = "PUT"
	} else {
		return false, signalDraftBT{}
	}
	atrVal := atrBT(highs, lows, closes, cfg.SupertrendATRPeriod)
	if atrVal <= 0 {
		return false, signalDraftBT{}
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
	}
	return true, signalDraftBT{
		Strategy:   "supertrend",
		Direction:  direction,
		StopLoss:   stop,
		TakeProfit: target,
		Raw:        raw,
	}
}

func evaluateBBSqueezeBT(now time.Time, ref instrumentRef, bars []minuteBar, cfg config.StrategyConfig, loc *time.Location) []signalDraftBT {
	tf := cfg.BBTimeframe
	if tf <= 0 {
		tf = 5
	}
	barsTF := aggregateBarsBT(bars, tf, loc)
	if len(barsTF) < cfg.BBPeriod+2 {
		return nil
	}
	closes := extractCloses(barsTF)
	mid, upper, lower := bollingerBT(closes, cfg.BBPeriod, cfg.BBStdDev)
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
			m, u, l := bollingerBT(closes[:i+1], cfg.BBPeriod, cfg.BBStdDev)
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
	mode := strings.ToLower(strings.TrimSpace(cfg.BBSqueezeMode))
	if mode == "" {
		mode = "directional"
	}
	atrVal := atrBT(extractHighs(barsTF), extractLows(barsTF), extractCloses(barsTF), cfg.ATRPeriod)
	if atrVal <= 0 {
		return nil
	}
	raw := map[string]any{
		"bb_mid":    mid,
		"bb_upper":  upper,
		"bb_lower":  lower,
		"bandwidth": bandwidth,
	}
	if mode == "straddle" {
		return []signalDraftBT{{
			Strategy:   "bb_squeeze",
			Direction:  "STRADDLE",
			StopLoss:   lastClose - atrVal*cfg.StopATRMultiplier,
			TakeProfit: lastClose + atrVal*cfg.TargetATRMultiplier,
			Raw:        raw,
		}}
	}
	if lastClose > upper {
		return []signalDraftBT{{
			Strategy:   "bb_squeeze",
			Direction:  "CALL",
			StopLoss:   lastClose - atrVal*cfg.StopATRMultiplier,
			TakeProfit: lastClose + atrVal*cfg.TargetATRMultiplier,
			Raw:        raw,
		}}
	}
	if lastClose < lower && cfg.AllowShort {
		return []signalDraftBT{{
			Strategy:   "bb_squeeze",
			Direction:  "PUT",
			StopLoss:   lastClose + atrVal*cfg.StopATRMultiplier,
			TakeProfit: lastClose - atrVal*cfg.TargetATRMultiplier,
			Raw:        raw,
		}}
	}
	return nil
}

func summarizeStrategyTrades(trades []StrategyBTTrade) StrategyBTSummary {
	summary := StrategyBTSummary{}
	if len(trades) == 0 {
		return summary
	}
	var wins, losses int
	var total float64
	for _, trade := range trades {
		total += trade.PnL
		if trade.PnL > 0 {
			wins++
		} else {
			losses++
		}
	}
	summary.TotalTrades = len(trades)
	summary.Wins = wins
	summary.Losses = losses
	if len(trades) > 0 {
		summary.WinRate = float64(wins) / float64(len(trades)) * 100
	}
	summary.TotalPnL = total
	summary.MaxDrawdown = maxDrawdown(trades)
	return summary
}

func buildEquityCurve(trades []StrategyBTTrade) []StrategyEquityPoint {
	if len(trades) == 0 {
		return nil
	}
	sorted := make([]StrategyBTTrade, len(trades))
	copy(sorted, trades)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].ExitTime.Before(sorted[j].ExitTime) })
	var equity float64
	var peak float64
	var curve []StrategyEquityPoint
	for _, trade := range sorted {
		equity += trade.PnL
		if equity > peak {
			peak = equity
		}
		drawdown := peak - equity
		curve = append(curve, StrategyEquityPoint{Ts: trade.ExitTime, Equity: equity, Drawdown: drawdown})
	}
	return curve
}

func maxDrawdown(trades []StrategyBTTrade) float64 {
	curve := buildEquityCurve(trades)
	maxDD := 0.0
	for _, point := range curve {
		if point.Drawdown > maxDD {
			maxDD = point.Drawdown
		}
	}
	return maxDD
}

func (t StrategyBTTrade) PnLDirection(exitPrice float64) float64 {
	if t.Direction == "PUT" {
		return (t.EntryPrice - exitPrice) * float64(t.Qty)
	}
	return (exitPrice - t.EntryPrice) * float64(t.Qty)
}

func mustJSONBT(v any) []byte {
	raw, _ := json.Marshal(v)
	return raw
}

func applySlippageBT(price float64, side string, bps float64) float64 {
	if bps <= 0 {
		return price
	}
	mult := 1 + (bps / 10000)
	if strings.EqualFold(side, "SELL") {
		mult = 1 - (bps / 10000)
	}
	return price * mult
}

func extractCloses(bars []minuteBar) []float64 {
	out := make([]float64, 0, len(bars))
	for _, bar := range bars {
		out = append(out, bar.Close)
	}
	return out
}

func extractHighs(bars []minuteBar) []float64 {
	out := make([]float64, 0, len(bars))
	for _, bar := range bars {
		out = append(out, bar.High)
	}
	return out
}

func extractLows(bars []minuteBar) []float64 {
	out := make([]float64, 0, len(bars))
	for _, bar := range bars {
		out = append(out, bar.Low)
	}
	return out
}

func extractVolumes(bars []minuteBar) []int64 {
	out := make([]int64, 0, len(bars))
	for _, bar := range bars {
		out = append(out, bar.Volume)
	}
	return out
}

func averageVolumeBT(bars []minuteBar, window int) float64 {
	if len(bars) == 0 {
		return 0
	}
	if window <= 0 || len(bars) < window {
		window = len(bars)
	}
	var sum int64
	for _, bar := range bars[len(bars)-window:] {
		sum += bar.Volume
	}
	return float64(sum) / float64(window)
}

func emaBT(values []float64, period int) float64 {
	if period <= 0 || len(values) < period {
		return 0
	}
	var sum float64
	for i := 0; i < period; i++ {
		sum += values[i]
	}
	ema := sum / float64(period)
	multiplier := 2.0 / float64(period+1)
	for i := period; i < len(values); i++ {
		ema = (values[i]-ema)*multiplier + ema
	}
	return ema
}

func rsiBT(values []float64, period int) float64 {
	if period <= 0 || len(values) <= period {
		return 0
	}
	var gain, loss float64
	for i := 1; i <= period; i++ {
		diff := values[i] - values[i-1]
		if diff >= 0 {
			gain += diff
		} else {
			loss -= diff
		}
	}
	avgGain := gain / float64(period)
	avgLoss := loss / float64(period)
	for i := period + 1; i < len(values); i++ {
		diff := values[i] - values[i-1]
		if diff >= 0 {
			avgGain = (avgGain*float64(period-1) + diff) / float64(period)
			avgLoss = (avgLoss * float64(period-1)) / float64(period)
		} else {
			avgGain = (avgGain * float64(period-1)) / float64(period)
			avgLoss = (avgLoss*float64(period-1) + (-diff)) / float64(period)
		}
	}
	if avgLoss == 0 {
		return 100
	}
	rs := avgGain / avgLoss
	return 100 - (100 / (1 + rs))
}

func atrBT(highs, lows, closes []float64, period int) float64 {
	if period <= 0 || len(highs) <= period || len(lows) != len(highs) || len(closes) != len(highs) {
		return 0
	}
	trs := make([]float64, 0, len(highs)-1)
	for i := 1; i < len(highs); i++ {
		hl := highs[i] - lows[i]
		hc := math.Abs(highs[i] - closes[i-1])
		lc := math.Abs(lows[i] - closes[i-1])
		tr := math.Max(hl, math.Max(hc, lc))
		trs = append(trs, tr)
	}
	if len(trs) < period {
		return 0
	}
	var sum float64
	for i := 0; i < period; i++ {
		sum += trs[i]
	}
	atr := sum / float64(period)
	for i := period; i < len(trs); i++ {
		atr = (atr*float64(period-1) + trs[i]) / float64(period)
	}
	return atr
}

func vwapBT(prices []float64, volumes []int64) float64 {
	if len(prices) == 0 || len(prices) != len(volumes) {
		return 0
	}
	var pv float64
	var total float64
	for i := range prices {
		if volumes[i] <= 0 {
			continue
		}
		pv += prices[i] * float64(volumes[i])
		total += float64(volumes[i])
	}
	if total == 0 {
		return 0
	}
	return pv / total
}

func bollingerBT(values []float64, period int, mult float64) (float64, float64, float64) {
	if period <= 0 || len(values) < period {
		return 0, 0, 0
	}
	mean := smaBT(values, period)
	dev := stddevBT(values, period)
	upper := mean + mult*dev
	lower := mean - mult*dev
	return mean, upper, lower
}

func smaBT(values []float64, period int) float64 {
	if period <= 0 || len(values) < period {
		return 0
	}
	var sum float64
	for _, v := range values[len(values)-period:] {
		sum += v
	}
	return sum / float64(period)
}

func stddevBT(values []float64, period int) float64 {
	if period <= 0 || len(values) < period {
		return 0
	}
	mean := smaBT(values, period)
	var sum float64
	for _, v := range values[len(values)-period:] {
		diff := v - mean
		sum += diff * diff
	}
	return math.Sqrt(sum / float64(period))
}

func supertrendBT(highs, lows, closes []float64, period int, multiplier float64) (float64, int) {
	if period <= 0 || len(closes) <= period || len(highs) != len(closes) || len(lows) != len(closes) {
		return 0, 0
	}
	n := len(closes)
	tr := make([]float64, n)
	for i := 1; i < n; i++ {
		hl := highs[i] - lows[i]
		hc := math.Abs(highs[i] - closes[i-1])
		lc := math.Abs(lows[i] - closes[i-1])
		tr[i] = math.Max(hl, math.Max(hc, lc))
	}
	atrVals := make([]float64, n)
	var sum float64
	for i := 1; i <= period; i++ {
		sum += tr[i]
	}
	atrVals[period] = sum / float64(period)
	for i := period + 1; i < n; i++ {
		atrVals[i] = (atrVals[i-1]*float64(period-1) + tr[i]) / float64(period)
	}
	finalUpper := make([]float64, n)
	finalLower := make([]float64, n)
	direction := make([]int, n)
	for i := period; i < n; i++ {
		basicUpper := (highs[i]+lows[i])/2 + multiplier*atrVals[i]
		basicLower := (highs[i]+lows[i])/2 - multiplier*atrVals[i]
		if i == period {
			finalUpper[i] = basicUpper
			finalLower[i] = basicLower
			if closes[i] > finalUpper[i] {
				direction[i] = 1
			} else {
				direction[i] = -1
			}
			continue
		}
		if basicUpper < finalUpper[i-1] || closes[i-1] > finalUpper[i-1] {
			finalUpper[i] = basicUpper
		} else {
			finalUpper[i] = finalUpper[i-1]
		}
		if basicLower > finalLower[i-1] || closes[i-1] < finalLower[i-1] {
			finalLower[i] = basicLower
		} else {
			finalLower[i] = finalLower[i-1]
		}
		if direction[i-1] == -1 && closes[i] > finalUpper[i] {
			direction[i] = 1
		} else if direction[i-1] == 1 && closes[i] < finalLower[i] {
			direction[i] = -1
		} else {
			direction[i] = direction[i-1]
		}
	}
	last := n - 1
	if direction[last] >= 0 {
		return finalLower[last], 1
	}
	return finalUpper[last], -1
}

func aggregateBarsBT(bars []minuteBar, minutes int, loc *time.Location) []minuteBar {
	if minutes <= 1 {
		return bars
	}
	out := make([]minuteBar, 0, len(bars)/minutes)
	bucketMap := map[time.Time]*minuteBar{}
	var keys []time.Time
	for _, bar := range bars {
		key := bucketStartBT(bar.Ts, minutes, loc)
		entry, ok := bucketMap[key]
		if !ok {
			entry = &minuteBar{Ts: key, Open: bar.Open, High: bar.High, Low: bar.Low, Close: bar.Close, Volume: bar.Volume}
			bucketMap[key] = entry
			keys = append(keys, key)
			continue
		}
		if bar.High > entry.High {
			entry.High = bar.High
		}
		if bar.Low < entry.Low {
			entry.Low = bar.Low
		}
		entry.Close = bar.Close
		entry.Volume += bar.Volume
	}
	sort.Slice(keys, func(i, j int) bool { return keys[i].Before(keys[j]) })
	for _, key := range keys {
		out = append(out, *bucketMap[key])
	}
	return out
}

func bucketStartBT(ts time.Time, minutes int, loc *time.Location) time.Time {
	local := ts.In(loc)
	truncated := time.Date(local.Year(), local.Month(), local.Day(), local.Hour(), local.Minute(), 0, 0, loc)
	offset := truncated.Minute() % minutes
	bucket := truncated.Add(-time.Duration(offset) * time.Minute)
	return bucket.UTC()
}

func marketOpenBT(now time.Time, tradingStart string, loc *time.Location) time.Time {
	parsed, err := time.ParseInLocation("15:04", tradingStart, loc)
	if err != nil {
		return time.Date(now.Year(), now.Month(), now.Day(), 9, 15, 0, 0, loc)
	}
	local := now.In(loc)
	return time.Date(local.Year(), local.Month(), local.Day(), parsed.Hour(), parsed.Minute(), 0, 0, loc)
}
