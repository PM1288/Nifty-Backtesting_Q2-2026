package backtest

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"trading-stack/internal/config"
	"trading-stack/internal/store"
)

type A02SwingTrade struct {
	Exchange           string
	SymbolToken        string
	Symbol             string
	TradingSymbol      string
	InstrumentType     string
	EntryTime          time.Time
	EntryClose         float64
	ExitTime           time.Time
	ExitClose          float64
	Success            bool
	GainPct            float64
	DurationMinutes    float64
	HoldingDays        int
	RSI                float64
	PrevRSI            float64
	WillR              float64
	PrevVolume         float64
	VolumeMedian       float64
	Quantity           int
	InvestmentAmt      float64
	ExitValue          float64
	Turnover           float64
	GrossProfit        float64
	TotalCharges       float64
	NetProfit          float64
	NetGainPct         float64
	Brokerage          float64
	BrokerageEntry     float64
	BrokerageExit      float64
	STT                float64
	ExchangeTxn        float64
	SEBIFee            float64
	StampDuty          float64
	GST                float64
	BreakevenPoints    float64
	TargetPriceSameDay float64
	TargetPriceSwing   float64
	ExitReason         string
	StrategyID         string
	StrategyName       string
	ExitRule           string
	StopReason         string
}

type A02SwingSummary struct {
	TotalTrades            int
	Wins                   int
	Losses                 int
	WinRate                float64
	DurationMin            *float64
	DurationMax            *float64
	DurationAvg            *float64
	DurationMedian         *float64
	DurationStd            *float64
	TotalGrossProfit       float64
	TotalCharges           float64
	TotalNetProfit         float64
	AverageBreakevenPoints *float64
	CapitalTrades          int
	CapitalWins            int
	CapitalLosses          int
	CapitalNetProfit       float64
}

type A02SwingRunResult struct {
	RunID             time.Time
	TradeDate         time.Time
	Trades            []A02SwingTrade
	Summary           A02SwingSummary
	SymbolsEvaluated  int
	SymbolsWithTrades int
	IndexTrades       int
	StockTrades       int
}

func RunArchiveSwingFromCSV(
	ctx context.Context,
	st *store.Store,
	cfg config.Config,
	opts ArchiveOptions,
	swingCfg config.BacktestSwingConfig,
	loc *time.Location,
	logger *slog.Logger,
) error {
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

	if logger != nil {
		logger.Info("archive_swing_start", "root", root, "symbols", len(symbols), "exchange", exchange)
	}

	symbolData := make([]archiveSymbol, 0, len(symbols))
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
	}

	engineCfg := engineConfig{
		RSIPeriod:               cfg.Backtest.RSIPeriod,
		WillRPeriod:             cfg.Backtest.WILLRPeriod,
		RSIThreshold:            cfg.Backtest.RSIThreshold,
		WillRThreshold:          cfg.Backtest.WILLRThreshold,
		MaxPercentile:           cfg.Backtest.MaxPercentile,
		RequireDailyEMATrend:    false,
		RequireBollingerTouch:   cfg.Backtest.RequireBollingerTouch,
		RequireVWAPReclaim:      cfg.Backtest.RequireVWAPReclaim,
		RequireVolumeSpike:      cfg.Backtest.RequireVolumeSpike,
		DailyEMAFast:            cfg.Backtest.DailyEMAFast,
		DailyEMASlow:            cfg.Backtest.DailyEMASlow,
		BollingerPeriod:         cfg.Backtest.BollingerPeriod,
		BollingerStdDev:         cfg.Backtest.BollingerStdDev,
		BollingerLowerBufferPct: cfg.Backtest.BollingerLowerBufferPct,
		VolumeSpikeMinRatio:     cfg.Backtest.VolumeSpikeMinRatio,
		CloseLookback:           cfg.Backtest.CloseLookback,
		VolumeLookback:          cfg.Backtest.VolumeLookback,
		VolumeMedianMaxRatio:    cfg.Backtest.VolumeMedianMaxRatio,
		StartOffsetMinutes:      cfg.Backtest.StartOffsetMinutes,
		EntryCutoffTime:         cfg.Backtest.EntryCutoffTime,
		TargetGain:              cfg.Backtest.TargetGain,
		TradeCapital:            cfg.Backtest.TradeCapital,
		CapitalLimit:            cfg.Backtest.CapitalLimit,
		MaxConcurrent:           cfg.Backtest.MaxConcurrentTrades,
		Charges:                 buildSwingChargeRates(cfg.Backtest.Charges, swingCfg),
	}

	tradesByDate := make(map[string][]A02SwingTrade)
	symbolsByDate := make(map[string]map[string]struct{})
	indexTradesByDate := make(map[string]int)
	stockTradesByDate := make(map[string]int)
	totalSymbols := len(symbolData)

	for _, data := range symbolData {
		bars := flattenArchiveBars(data.barsByDate, loc, opts.StartDate, opts.EndDate)
		if len(bars) == 0 {
			continue
		}
		trade := findSwingTrade(bars, data.instrument, engineCfg, swingCfg, cfg, loc)
		if trade == nil {
			continue
		}
		dateKey := trade.EntryTime.In(loc).Format("2006-01-02")
		tradesByDate[dateKey] = append(tradesByDate[dateKey], *trade)
		set := symbolsByDate[dateKey]
		if set == nil {
			set = make(map[string]struct{})
			symbolsByDate[dateKey] = set
		}
		set[data.instrument.SymbolToken] = struct{}{}
		if strings.EqualFold(trade.InstrumentType, "index") {
			indexTradesByDate[dateKey]++
		} else {
			stockTradesByDate[dateKey]++
		}
	}

	if len(tradesByDate) == 0 {
		if logger != nil {
			logger.Warn("archive_swing_no_trades")
		}
		return nil
	}

	keys := make([]string, 0, len(tradesByDate))
	for key := range tradesByDate {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	for _, key := range keys {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		tradeDate, err := time.ParseInLocation("2006-01-02", key, loc)
		if err != nil {
			return err
		}
		trades := tradesByDate[key]
		summary := summariseSwingTrades(trades, cfg.Backtest.CapitalLimit, cfg.Backtest.MaxConcurrentTrades)
		runID := time.Date(tradeDate.Year(), tradeDate.Month(), tradeDate.Day(), 0, 0, 0, 0, loc).UTC()
		symbolsWithTrades := len(symbolsByDate[key])
		result := A02SwingRunResult{
			RunID:             runID,
			TradeDate:         tradeDate,
			Trades:            trades,
			Summary:           summary,
			SymbolsEvaluated:  totalSymbols,
			SymbolsWithTrades: symbolsWithTrades,
			IndexTrades:       indexTradesByDate[key],
			StockTrades:       stockTradesByDate[key],
		}
		if err := persistA02SwingResult(ctx, st, result); err != nil {
			return err
		}
		if logger != nil {
			logger.Info("archive_swing_persisted", "trade_date", key, "trades", len(trades), "symbols_with_trades", symbolsWithTrades)
		}
	}

	if logger != nil {
		logger.Info("archive_swing_complete", "dates", len(tradesByDate))
	}
	return nil
}

func flattenArchiveBars(barsByDate map[string][]minuteBar, loc *time.Location, start, end *time.Time) []minuteBar {
	keys := make([]string, 0, len(barsByDate))
	for key := range barsByDate {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	out := make([]minuteBar, 0)
	var startAt time.Time
	var endAt time.Time
	if start != nil {
		startAt = truncateDate(*start, loc)
	}
	if end != nil {
		endAt = truncateDate(*end, loc).AddDate(0, 0, 1)
	}
	for _, key := range keys {
		bars := barsByDate[key]
		for _, bar := range bars {
			if start != nil && bar.Ts.Before(startAt) {
				continue
			}
			if end != nil && !bar.Ts.Before(endAt) {
				continue
			}
			out = append(out, bar)
		}
	}
	return out
}

func findSwingTrade(
	bars []minuteBar,
	inst Instrument,
	cfg engineConfig,
	swingCfg config.BacktestSwingConfig,
	appCfg config.Config,
	loc *time.Location,
) *A02SwingTrade {
	if len(bars) == 0 {
		return nil
	}
	closes := make([]float64, len(bars))
	highs := make([]float64, len(bars))
	lows := make([]float64, len(bars))
	volumes := make([]float64, len(bars))
	for i, bar := range bars {
		closes[i] = bar.Close
		highs[i] = bar.High
		lows[i] = bar.Low
		volumes[i] = float64(bar.Volume)
	}
	rsiVals := rsiSeries(closes, cfg.RSIPeriod)
	willrVals := willrSeries(highs, lows, closes, cfg.WillRPeriod)
	vwapVals := vwapSeries(closes, volumes)
	bollingerLower := bollingerLowerSeries(closes, cfg.BollingerPeriod, cfg.BollingerStdDev)
	minIndex := maxInt(cfg.CloseLookback, cfg.VolumeLookback, cfg.RSIPeriod, cfg.WillRPeriod, cfg.BollingerPeriod)

	var open *signalCandidate
	var exitTime time.Time
	var exitClose float64
	var exitReason string
	var success bool
	var targetSameDay float64
	var targetSwing float64
	var stopLoss float64
	var holdMinGain float64

	for i := minIndex; i < len(bars); i++ {
		if open != nil {
			current := bars[i]
			entryDate := open.EntryTime.In(loc).Format("2006-01-02")
			currentDate := current.Ts.In(loc).Format("2006-01-02")
			target := targetSwing
			if currentDate == entryDate {
				target = targetSameDay
			}
			if stopLoss > 0 && current.Close <= stopLoss {
				exitTime = current.Ts
				exitClose = current.Close
				exitReason = "stop_loss"
				success = false
				break
			}
			if current.Close >= target {
				exitTime = current.Ts
				exitClose = current.Close
				success = true
				if currentDate == entryDate {
					exitReason = "same_day_target"
				} else {
					exitReason = "swing_target"
				}
				break
			}
			if holdMinGain != 0 && currentDate != entryDate {
				previous := bars[i-1]
				entryGain := (previous.Close / open.EntryClose) - 1
				if entryGain < holdMinGain {
					exitTime = previous.Ts
					exitClose = previous.Close
					exitReason = "same_day_close"
					success = false
					break
				}
				holdMinGain = 0
			}
			continue
		}

		signal := evaluateSignal(i, bars, closes, volumes, rsiVals, willrVals, vwapVals, bollingerLower, cfg)
		if signal == nil {
			continue
		}
		open = signal
		targetSameDay = signal.EntryClose * (1 + swingCfg.IntradayTarget)
		targetSwing = signal.EntryClose * (1 + swingCfg.SwingTarget)
		if swingCfg.StopLossPct > 0 {
			stopLoss = signal.EntryClose * (1 - swingCfg.StopLossPct)
		}
		holdMinGain = swingCfg.HoldMinGainPct
	}

	if open == nil {
		return nil
	}
	if exitTime.IsZero() {
		last := bars[len(bars)-1]
		exitTime = last.Ts
		exitClose = last.Close
		exitReason = "final_close"
		success = exitClose >= targetSwing
	}

	entryTime := open.EntryTime
	duration := exitTime.Sub(entryTime).Minutes()
	gainPct := ((exitClose / open.EntryClose) - 1) * 100
	holdingDays := int(truncateDate(exitTime, loc).Sub(truncateDate(entryTime, loc)).Hours() / 24)

	qty := int(cfg.TradeCapital / open.EntryClose)
	if qty < 1 {
		qty = 1
	}
	charges := CalculateTradeCosts(open.EntryClose, exitClose, qty, cfg.Charges)

	instrumentType := "stock"
	if isIndexSymbol(inst.Symbol, appCfg) {
		instrumentType = "index"
	}

	trade := &A02SwingTrade{
		Exchange:           inst.Exchange,
		SymbolToken:        inst.SymbolToken,
		Symbol:             inst.Symbol,
		TradingSymbol:      inst.TradingSymbol,
		InstrumentType:     instrumentType,
		EntryTime:          entryTime,
		EntryClose:         open.EntryClose,
		ExitTime:           exitTime,
		ExitClose:          exitClose,
		Success:            success,
		GainPct:            gainPct,
		DurationMinutes:    duration,
		HoldingDays:        holdingDays,
		RSI:                open.RSI,
		PrevRSI:            open.PrevRSI,
		WillR:              open.WillR,
		PrevVolume:         open.PrevVolume,
		VolumeMedian:       open.VolumeMedian,
		Quantity:           qty,
		InvestmentAmt:      charges.EntryValue,
		ExitValue:          charges.ExitValue,
		Turnover:           charges.Turnover,
		GrossProfit:        charges.GrossProfit,
		TotalCharges:       charges.TotalCharges,
		NetProfit:          charges.NetProfit,
		NetGainPct:         charges.NetGainPct,
		Brokerage:          charges.BrokerageTotal,
		BrokerageEntry:     charges.BrokerageEntry,
		BrokerageExit:      charges.BrokerageExit,
		STT:                charges.STT,
		ExchangeTxn:        charges.ExchangeTxn,
		SEBIFee:            charges.SEBIFee,
		StampDuty:          charges.StampDuty,
		GST:                charges.GST,
		BreakevenPoints:    charges.BreakevenPoints,
		TargetPriceSameDay: round2(targetSameDay),
		TargetPriceSwing:   round2(targetSwing),
		ExitReason:         exitReason,
		StrategyID:         "SWING",
		StrategyName:       "Swing Archive",
		ExitRule:           exitReason,
		StopReason:         exitReason,
	}
	return trade
}

func summariseSwingTrades(trades []A02SwingTrade, capitalLimit float64, maxConcurrent int) A02SwingSummary {
	summary := A02SwingSummary{TotalTrades: len(trades)}
	durations := make([]float64, 0, len(trades))
	breakevens := make([]float64, 0, len(trades))
	converted := make([]A02Trade, 0, len(trades))
	for _, trade := range trades {
		if trade.Success {
			summary.Wins++
		}
		summary.TotalGrossProfit += trade.GrossProfit
		summary.TotalCharges += trade.TotalCharges
		summary.TotalNetProfit += trade.NetProfit
		durations = append(durations, trade.DurationMinutes)
		breakevens = append(breakevens, trade.BreakevenPoints)
		converted = append(converted, A02Trade{
			EntryTime:     trade.EntryTime,
			ExitTime:      trade.ExitTime,
			InvestmentAmt: trade.InvestmentAmt,
			NetProfit:     trade.NetProfit,
			Success:       trade.Success,
		})
	}
	summary.Losses = summary.TotalTrades - summary.Wins
	if summary.TotalTrades > 0 {
		summary.WinRate = float64(summary.Wins) / float64(summary.TotalTrades) * 100
	}
	summary.DurationMin, summary.DurationMax = minMaxPtr(durations)
	summary.DurationAvg = meanPtr(durations)
	summary.DurationMedian = medianPtr(durations)
	summary.DurationStd = stddevPtr(durations)
	summary.AverageBreakevenPoints = meanPtr(breakevens)

	selected := selectCapitalTrades(converted, capitalLimit, maxConcurrent)
	for _, trade := range selected {
		if trade.Success {
			summary.CapitalWins++
		}
		summary.CapitalNetProfit += trade.NetProfit
	}
	summary.CapitalTrades = len(selected)
	summary.CapitalLosses = summary.CapitalTrades - summary.CapitalWins
	return summary
}

func buildSwingChargeRates(base config.BacktestChargesConfig, swingCfg config.BacktestSwingConfig) ChargeRates {
	rates := buildChargeRates(base)
	if swingCfg.BrokerageCap > 0 {
		rates.BrokerageCap = swingCfg.BrokerageCap
	}
	return rates
}

func isIndexSymbol(symbol string, cfg config.Config) bool {
	clean := strings.ToUpper(strings.TrimSpace(symbol))
	if clean == "" {
		return false
	}
	if clean == "NIFTY" {
		return true
	}
	for _, name := range cfg.Universe.IncludeIndices {
		if strings.ToUpper(strings.TrimSpace(name)) == clean {
			return true
		}
	}
	return false
}

func persistA02SwingResult(ctx context.Context, st *store.Store, result A02SwingRunResult) error {
	return st.WithTx(ctx, func(tx pgx.Tx) error {
		if err := upsertA02SwingResultsTx(ctx, st.Schema, tx, result); err != nil {
			return err
		}
		if err := upsertA02SwingRunsTx(ctx, st.Schema, tx, result); err != nil {
			return err
		}
		if err := upsertA02SwingStatsTx(ctx, st.Schema, tx, result); err != nil {
			return err
		}
		return nil
	})
}

func upsertA02SwingResultsTx(ctx context.Context, schema string, tx pgx.Tx, result A02SwingRunResult) error {
	if len(result.Trades) == 0 {
		return nil
	}
	stmt := fmt.Sprintf(`
INSERT INTO %s.a02_archive_swing_results
  (run_id, trade_date, exchange, symbol_token, symbol, tradingsymbol, instrument_type,
   entry_time, entry_close, exit_time, exit_close, success, gain_pct, duration_minutes,
   holding_days, rsi, prev_rsi, willr, prev_volume, volume_median, quantity,
   investment_amount, exit_value, turnover, gross_profit, total_charges, net_profit,
   net_gain_pct, brokerage, brokerage_entry, brokerage_exit, stt, exchange_txn,
   sebi_fee, stamp_duty, gst, breakeven_points, target_price_same_day, target_price_swing,
   exit_reason, strategy_id, strategy_name, exit_rule, stop_reason)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
        $23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44)
ON CONFLICT (run_id, symbol_token, entry_time, strategy_id) DO UPDATE SET
  trade_date = EXCLUDED.trade_date,
  exchange = EXCLUDED.exchange,
  symbol = EXCLUDED.symbol,
  tradingsymbol = EXCLUDED.tradingsymbol,
  instrument_type = EXCLUDED.instrument_type,
  exit_time = EXCLUDED.exit_time,
  exit_close = EXCLUDED.exit_close,
  success = EXCLUDED.success,
  gain_pct = EXCLUDED.gain_pct,
  duration_minutes = EXCLUDED.duration_minutes,
  holding_days = EXCLUDED.holding_days,
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
  brokerage = EXCLUDED.brokerage,
  brokerage_entry = EXCLUDED.brokerage_entry,
  brokerage_exit = EXCLUDED.brokerage_exit,
  stt = EXCLUDED.stt,
  exchange_txn = EXCLUDED.exchange_txn,
  sebi_fee = EXCLUDED.sebi_fee,
  stamp_duty = EXCLUDED.stamp_duty,
  gst = EXCLUDED.gst,
  breakeven_points = EXCLUDED.breakeven_points,
  target_price_same_day = EXCLUDED.target_price_same_day,
  target_price_swing = EXCLUDED.target_price_swing,
  exit_reason = EXCLUDED.exit_reason,
  strategy_name = EXCLUDED.strategy_name,
  exit_rule = EXCLUDED.exit_rule,
  stop_reason = EXCLUDED.stop_reason,
  created_at = now()`, pgx.Identifier{schema, "a02_archive_swing_results"}.Sanitize())

	for _, trade := range result.Trades {
		_, err := tx.Exec(ctx, stmt,
			result.RunID,
			result.TradeDate,
			trade.Exchange,
			trade.SymbolToken,
			trade.Symbol,
			trade.TradingSymbol,
			trade.InstrumentType,
			trade.EntryTime,
			trade.EntryClose,
			trade.ExitTime,
			trade.ExitClose,
			trade.Success,
			trade.GainPct,
			trade.DurationMinutes,
			trade.HoldingDays,
			trade.RSI,
			trade.PrevRSI,
			trade.WillR,
			trade.PrevVolume,
			trade.VolumeMedian,
			trade.Quantity,
			trade.InvestmentAmt,
			trade.ExitValue,
			trade.Turnover,
			trade.GrossProfit,
			trade.TotalCharges,
			trade.NetProfit,
			trade.NetGainPct,
			trade.Brokerage,
			trade.BrokerageEntry,
			trade.BrokerageExit,
			trade.STT,
			trade.ExchangeTxn,
			trade.SEBIFee,
			trade.StampDuty,
			trade.GST,
			trade.BreakevenPoints,
			trade.TargetPriceSameDay,
			trade.TargetPriceSwing,
			trade.ExitReason,
			trade.StrategyID,
			trade.StrategyName,
			trade.ExitRule,
			trade.StopReason,
		)
		if err != nil {
			return err
		}
	}
	return nil
}

func upsertA02SwingRunsTx(ctx context.Context, schema string, tx pgx.Tx, result A02SwingRunResult) error {
	summary := result.Summary
	stmt := fmt.Sprintf(`
INSERT INTO %s.a02_archive_swing_runs
  (run_id, trade_date, total_trades, wins, losses, win_rate, total_gross_profit,
   total_charges, total_net_profit, average_breakeven_points, capital_trades, capital_wins,
   capital_losses, capital_net_profit, symbols_evaluated, symbols_with_trades, index_trades,
   stock_trades)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
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
  index_trades = EXCLUDED.index_trades,
  stock_trades = EXCLUDED.stock_trades,
  created_at = now()`, pgx.Identifier{schema, "a02_archive_swing_runs"}.Sanitize())
	_, err := tx.Exec(ctx, stmt,
		result.RunID,
		result.TradeDate,
		summary.TotalTrades,
		summary.Wins,
		summary.Losses,
		summary.WinRate,
		summary.TotalGrossProfit,
		summary.TotalCharges,
		summary.TotalNetProfit,
		summary.AverageBreakevenPoints,
		summary.CapitalTrades,
		summary.CapitalWins,
		summary.CapitalLosses,
		summary.CapitalNetProfit,
		result.SymbolsEvaluated,
		result.SymbolsWithTrades,
		result.IndexTrades,
		result.StockTrades,
	)
	return err
}

func upsertA02SwingStatsTx(ctx context.Context, schema string, tx pgx.Tx, result A02SwingRunResult) error {
	summary := result.Summary
	stmt := fmt.Sprintf(`
INSERT INTO %s.a02_archive_swing_daily_stats
  (run_id, trade_date, duration_min_minutes, duration_max_minutes, duration_avg_minutes,
   duration_median_minutes, duration_std_minutes, total_gross_profit, total_charges,
   total_net_profit, average_breakeven_points, capital_trades, capital_wins, capital_losses,
   capital_net_profit, symbols_evaluated, symbols_with_trades, index_trades, stock_trades)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
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
  index_trades = EXCLUDED.index_trades,
  stock_trades = EXCLUDED.stock_trades,
  created_at = now()`, pgx.Identifier{schema, "a02_archive_swing_daily_stats"}.Sanitize())
	_, err := tx.Exec(ctx, stmt,
		result.RunID,
		result.TradeDate,
		summary.DurationMin,
		summary.DurationMax,
		summary.DurationAvg,
		summary.DurationMedian,
		summary.DurationStd,
		summary.TotalGrossProfit,
		summary.TotalCharges,
		summary.TotalNetProfit,
		summary.AverageBreakevenPoints,
		summary.CapitalTrades,
		summary.CapitalWins,
		summary.CapitalLosses,
		summary.CapitalNetProfit,
		result.SymbolsEvaluated,
		result.SymbolsWithTrades,
		result.IndexTrades,
		result.StockTrades,
	)
	return err
}
