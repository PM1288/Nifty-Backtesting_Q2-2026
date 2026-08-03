package parameters

import (
	"strings"

	"trading-stack/internal/config"
)

func ApplyStrategyOverrides(cfg *config.StrategyConfig, values map[string]Value) {
	if cfg == nil {
		return
	}
	if v, ok := values["max_symbols"]; ok {
		if i, ok := v.Int(); ok {
			cfg.MaxSymbols = i
		}
	}
	if v, ok := values["ema_pullback_enable"]; ok {
		if b, ok := v.Bool(); ok {
			cfg.EMAPullbackEnable = b
		}
	}
	if v, ok := values["orb_enable"]; ok {
		if b, ok := v.Bool(); ok {
			cfg.ORBEnable = b
		}
	}
	if v, ok := values["supertrend_enable"]; ok {
		if b, ok := v.Bool(); ok {
			cfg.SupertrendEnable = b
		}
	}
	if v, ok := values["bb_squeeze_enable"]; ok {
		if b, ok := v.Bool(); ok {
			cfg.BBSqueezeEnable = b
		}
	}
	if v, ok := values["min_daily_volume"]; ok {
		if i, ok := v.Int(); ok {
			cfg.MinDailyVolume = int64(i)
		}
	}
	if v, ok := values["ema_fast"]; ok {
		if i, ok := v.Int(); ok {
			cfg.EMAFast = i
		}
	}
	if v, ok := values["ema_slow"]; ok {
		if i, ok := v.Int(); ok {
			cfg.EMASlow = i
		}
	}
	if v, ok := values["rsi_period"]; ok {
		if i, ok := v.Int(); ok {
			cfg.RSIPeriod = i
		}
	}
	if v, ok := values["rsi_setup_min"]; ok {
		if f, ok := v.Float64(); ok {
			cfg.RSISetupMin = f
		}
	}
	if v, ok := values["rsi_setup_max"]; ok {
		if f, ok := v.Float64(); ok {
			cfg.RSISetupMax = f
		}
	}
	if v, ok := values["rsi_trigger"]; ok {
		if f, ok := v.Float64(); ok {
			cfg.RSITrigger = f
		}
	}
	if v, ok := values["vwap_distance_pct"]; ok {
		if f, ok := v.Float64(); ok {
			cfg.VWAPDistancePct = f
		}
	}
	if v, ok := values["pullback_pct"]; ok {
		if f, ok := v.Float64(); ok {
			cfg.PullbackPct = f
		}
	}
	if v, ok := values["volume_spike_multiplier"]; ok {
		if f, ok := v.Float64(); ok {
			cfg.VolumeSpikeMultiplier = f
		}
	}
	if v, ok := values["atr_period"]; ok {
		if i, ok := v.Int(); ok {
			cfg.ATRPeriod = i
		}
	}
	if v, ok := values["stop_atr_multiplier"]; ok {
		if f, ok := v.Float64(); ok {
			cfg.StopATRMultiplier = f
		}
	}
	if v, ok := values["target_atr_multiplier"]; ok {
		if f, ok := v.Float64(); ok {
			cfg.TargetATRMultiplier = f
		}
	}
	if v, ok := values["orb_range_minutes"]; ok {
		if i, ok := v.Int(); ok {
			cfg.ORBRangeMinutes = i
		}
	}
	if v, ok := values["orb_volume_multiplier"]; ok {
		if f, ok := v.Float64(); ok {
			cfg.ORBVolumeMultiplier = f
		}
	}
	if v, ok := values["orb_min_range_pct"]; ok {
		if f, ok := v.Float64(); ok {
			cfg.ORBMinRangePct = f
		}
	}
	if v, ok := values["orb_max_range_pct"]; ok {
		if f, ok := v.Float64(); ok {
			cfg.ORBMaxRangePct = f
		}
	}
	if v, ok := values["supertrend_atr_period"]; ok {
		if i, ok := v.Int(); ok {
			cfg.SupertrendATRPeriod = i
		}
	}
	if v, ok := values["supertrend_multiplier"]; ok {
		if f, ok := v.Float64(); ok {
			cfg.SupertrendMultiplier = f
		}
	}
	if v, ok := values["supertrend_timeframe_minutes"]; ok {
		if i, ok := v.Int(); ok {
			cfg.SupertrendTimeframe = i
		}
	}
	if v, ok := values["bb_period"]; ok {
		if i, ok := v.Int(); ok {
			cfg.BBPeriod = i
		}
	}
	if v, ok := values["bb_stddev"]; ok {
		if f, ok := v.Float64(); ok {
			cfg.BBStdDev = f
		}
	}
	if v, ok := values["bb_timeframe_minutes"]; ok {
		if i, ok := v.Int(); ok {
			cfg.BBTimeframe = i
		}
	}
	if v, ok := values["bb_squeeze_bandwidth_pct"]; ok {
		if f, ok := v.Float64(); ok {
			cfg.BBSqueezeBandwidthPct = f
		}
	}
	if v, ok := values["bb_squeeze_lookback"]; ok {
		if i, ok := v.Int(); ok {
			cfg.BBSqueezeLookback = i
		}
	}
	if v, ok := values["bb_squeeze_mode"]; ok {
		if s, ok := v.String(); ok {
			cfg.BBSqueezeMode = s
		}
	}
	if v, ok := values["event_straddle_enable"]; ok {
		if b, ok := v.Bool(); ok {
			cfg.EventStraddleEnable = b
		}
	}
	if v, ok := values["event_straddle_dates"]; ok {
		if s, ok := v.String(); ok {
			cfg.EventStraddleDates = splitCSV(s)
		}
	}
	if v, ok := values["event_straddle_token"]; ok {
		if s, ok := v.String(); ok {
			cfg.EventStraddleToken = s
		}
	}
	if v, ok := values["event_straddle_underlying"]; ok {
		if s, ok := v.String(); ok {
			cfg.EventStraddleUnderlying = s
		}
	}
	if v, ok := values["event_straddle_exchange"]; ok {
		if s, ok := v.String(); ok {
			cfg.EventStraddleExchange = s
		}
	}
	if v, ok := values["event_straddle_start"]; ok {
		if s, ok := v.String(); ok {
			cfg.EventStraddleStart = s
		}
	}
	if v, ok := values["event_straddle_end"]; ok {
		if s, ok := v.String(); ok {
			cfg.EventStraddleEnd = s
		}
	}
	if v, ok := values["event_straddle_timeframe_minutes"]; ok {
		if i, ok := v.Int(); ok {
			cfg.EventStraddleTimeframeMinutes = i
		}
	}
	if v, ok := values["event_straddle_lookback_minutes"]; ok {
		if i, ok := v.Int(); ok {
			cfg.EventStraddleLookbackMinutes = i
		}
	}
	if v, ok := values["event_straddle_bandwidth_pct"]; ok {
		if f, ok := v.Float64(); ok {
			cfg.EventStraddleBandwidthPct = f
		}
	}
	if v, ok := values["event_straddle_range_pct"]; ok {
		if f, ok := v.Float64(); ok {
			cfg.EventStraddleRangePct = f
		}
	}
	if v, ok := values["event_straddle_bandwidth_slope_max"]; ok {
		if f, ok := v.Float64(); ok {
			cfg.EventStraddleBandwidthSlopeMax = f
		}
	}
	if v, ok := values["event_straddle_atr_pct_max"]; ok {
		if f, ok := v.Float64(); ok {
			cfg.EventStraddleATRPercentMax = f
		}
	}
	if v, ok := values["event_straddle_atr_pct_slope_max"]; ok {
		if f, ok := v.Float64(); ok {
			cfg.EventStraddleATRPercentSlopeMax = f
		}
	}
	if v, ok := values["event_straddle_cooldown_minutes"]; ok {
		if i, ok := v.Int(); ok {
			cfg.EventStraddleCooldownMinutes = i
		}
	}
	if v, ok := values["cooldown_minutes"]; ok {
		if i, ok := v.Int(); ok {
			cfg.CooldownMinutes = i
		}
	}
	if v, ok := values["lookback_minutes"]; ok {
		if i, ok := v.Int(); ok {
			cfg.LookbackMinutes = i
		}
	}
	if v, ok := values["max_signals_per_run"]; ok {
		if i, ok := v.Int(); ok {
			cfg.MaxSignalsPerRun = i
		}
	}
	if v, ok := values["min_confidence"]; ok {
		if f, ok := v.Float64(); ok {
			cfg.MinConfidence = f
		}
	}
	if v, ok := values["allow_short"]; ok {
		if b, ok := v.Bool(); ok {
			cfg.AllowShort = b
		}
	}
	if v, ok := values["use_options"]; ok {
		if b, ok := v.Bool(); ok {
			cfg.UseOptions = b
		}
	}
	if v, ok := values["option_expiry_rank"]; ok {
		if i, ok := v.Int(); ok {
			cfg.OptionExpiryRank = i
		}
	}
	if v, ok := values["option_min_days_to_expiry"]; ok {
		if i, ok := v.Int(); ok {
			cfg.OptionMinDaysToExpiry = i
		}
	}
	if v, ok := values["option_stop_loss_pct"]; ok {
		if f, ok := v.Float64(); ok {
			cfg.OptionStopLossPct = f
		}
	}
	if v, ok := values["option_target_pct"]; ok {
		if f, ok := v.Float64(); ok {
			cfg.OptionTargetPct = f
		}
	}
	if v, ok := values["option_time_stop_minutes"]; ok {
		if i, ok := v.Int(); ok {
			cfg.OptionTimeStopMinutes = i
		}
	}
	if v, ok := values["option_min_premium"]; ok {
		if f, ok := v.Float64(); ok {
			cfg.OptionMinPremium = f
		}
	}
	if v, ok := values["option_allow_single_leg"]; ok {
		if b, ok := v.Bool(); ok {
			cfg.OptionAllowSingleLeg = b
		}
	}
	if v, ok := values["option_straddle_equalize"]; ok {
		if b, ok := v.Bool(); ok {
			cfg.OptionStraddleEqualize = b
		}
	}
	if v, ok := values["option_straddle_ratio_min"]; ok {
		if f, ok := v.Float64(); ok {
			cfg.OptionStraddleRatioMin = f
		}
	}
	if v, ok := values["option_straddle_ratio_max"]; ok {
		if f, ok := v.Float64(); ok {
			cfg.OptionStraddleRatioMax = f
		}
	}
	if v, ok := values["option_straddle_max_spread_pct"]; ok {
		if f, ok := v.Float64(); ok {
			cfg.OptionStraddleMaxSpreadPct = f
		}
	}
	if v, ok := values["run_outside_market_hours"]; ok {
		if b, ok := v.Bool(); ok {
			cfg.RunOutsideMarketHours = b
		}
	}
}

func ApplyBacktestOverrides(cfg *config.BacktestConfig, values map[string]Value) {
	if cfg == nil {
		return
	}
	if v, ok := values["days_back"]; ok {
		if i, ok := v.Int(); ok {
			cfg.DaysBack = i
		}
	}
	if v, ok := values["max_percentile"]; ok {
		if f, ok := v.Float64(); ok {
			cfg.MaxPercentile = f
		}
	}
	if v, ok := values["rsi_period"]; ok {
		if i, ok := v.Int(); ok {
			cfg.RSIPeriod = i
		}
	}
	if v, ok := values["rsi_threshold"]; ok {
		if f, ok := v.Float64(); ok {
			cfg.RSIThreshold = f
		}
	}
	if v, ok := values["require_daily_ema_trend"]; ok {
		if b, ok := v.Bool(); ok {
			cfg.RequireDailyEMATrend = b
		}
	}
	if v, ok := values["daily_ema_fast"]; ok {
		if i, ok := v.Int(); ok {
			cfg.DailyEMAFast = i
		}
	}
	if v, ok := values["daily_ema_slow"]; ok {
		if i, ok := v.Int(); ok {
			cfg.DailyEMASlow = i
		}
	}
	if v, ok := values["require_bollinger_touch"]; ok {
		if b, ok := v.Bool(); ok {
			cfg.RequireBollingerTouch = b
		}
	}
	if v, ok := values["bollinger_period"]; ok {
		if i, ok := v.Int(); ok {
			cfg.BollingerPeriod = i
		}
	}
	if v, ok := values["bollinger_stddev"]; ok {
		if f, ok := v.Float64(); ok {
			cfg.BollingerStdDev = f
		}
	}
	if v, ok := values["bollinger_lower_buffer_pct"]; ok {
		if f, ok := v.Float64(); ok {
			cfg.BollingerLowerBufferPct = f
		}
	}
	if v, ok := values["require_vwap_reclaim"]; ok {
		if b, ok := v.Bool(); ok {
			cfg.RequireVWAPReclaim = b
		}
	}
	if v, ok := values["require_volume_spike"]; ok {
		if b, ok := v.Bool(); ok {
			cfg.RequireVolumeSpike = b
		}
	}
	if v, ok := values["volume_spike_min_ratio"]; ok {
		if f, ok := v.Float64(); ok {
			cfg.VolumeSpikeMinRatio = f
		}
	}
	if v, ok := values["willr_period"]; ok {
		if i, ok := v.Int(); ok {
			cfg.WILLRPeriod = i
		}
	}
	if v, ok := values["willr_threshold"]; ok {
		if f, ok := v.Float64(); ok {
			cfg.WILLRThreshold = f
		}
	}
	if v, ok := values["close_lookback"]; ok {
		if i, ok := v.Int(); ok {
			cfg.CloseLookback = i
		}
	}
	if v, ok := values["volume_lookback"]; ok {
		if i, ok := v.Int(); ok {
			cfg.VolumeLookback = i
		}
	}
	if v, ok := values["volume_median_max_ratio"]; ok {
		if f, ok := v.Float64(); ok {
			cfg.VolumeMedianMaxRatio = f
		}
	}
	if v, ok := values["start_offset_minutes"]; ok {
		if i, ok := v.Int(); ok {
			cfg.StartOffsetMinutes = i
		}
	}
	if v, ok := values["entry_cutoff_time"]; ok {
		if s, ok := v.String(); ok {
			cfg.EntryCutoffTime = s
		}
	}
	if v, ok := values["target_gain"]; ok {
		if f, ok := v.Float64(); ok {
			cfg.TargetGain = f
		}
	}
	if v, ok := values["trade_capital"]; ok {
		if f, ok := v.Float64(); ok {
			cfg.TradeCapital = f
		}
	}
	if v, ok := values["capital_limit"]; ok {
		if f, ok := v.Float64(); ok {
			cfg.CapitalLimit = f
		}
	}
	if v, ok := values["max_concurrent_trades"]; ok {
		if i, ok := v.Int(); ok {
			cfg.MaxConcurrentTrades = i
		}
	}
}

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}
		out = append(out, trimmed)
	}
	return out
}
