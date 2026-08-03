package backtest

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"

	"trading-stack/internal/config"
	"trading-stack/internal/store"
)

// Instrument is a lightweight handle for running backtests with preloaded bars.
type Instrument struct {
	Exchange      string
	SymbolToken   string
	Symbol        string
	TradingSymbol string
}

// RunA02WithBars runs the A02 engine for a specific trade date using provided minute bars
// and percentiles, then persists results into the backtest tables.
func RunA02WithBars(ctx context.Context, st *store.Store, cfg config.Config, tradeDate time.Time, instruments []Instrument, bars map[string][]minuteBar, percentiles map[string]float64, loc *time.Location) (A02RunResult, error) {
	refs := make([]instrumentRef, 0, len(instruments))
	for _, inst := range instruments {
		refs = append(refs, instrumentRef{
			Exchange:      inst.Exchange,
			Token:         inst.SymbolToken,
			Symbol:        inst.Symbol,
			TradingSymbol: inst.TradingSymbol,
		})
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
		Charges:                 buildChargeRates(cfg.Backtest.Charges),
	}

	result, err := runA02Backtest(ctx, tradeDate, refs, bars, percentiles, nil, engineCfg, loc)
	if err != nil {
		return A02RunResult{}, err
	}
	if err := persistA02Result(ctx, st, result); err != nil {
		return A02RunResult{}, err
	}
	return result, nil
}

func persistA02Result(ctx context.Context, st *store.Store, result A02RunResult) error {
	return st.WithTx(ctx, func(tx pgx.Tx) error {
		if err := upsertA02ResultsTx(ctx, st.Schema, tx, result); err != nil {
			return err
		}
		if err := upsertA02RunsTx(ctx, st.Schema, tx, result); err != nil {
			return err
		}
		if err := upsertA02StatsTx(ctx, st.Schema, tx, result); err != nil {
			return err
		}
		return nil
	})
}
