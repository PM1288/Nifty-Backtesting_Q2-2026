package parameters

import (
	"strings"

	"trading-stack/internal/config"
)

const (
	ScopeStrategyCore = "strategy_core"
	ScopeBacktestA02  = "backtest_a02"
)

type ParamKind string

const (
	KindNumber ParamKind = "number"
	KindInt    ParamKind = "int"
	KindBool   ParamKind = "bool"
	KindString ParamKind = "string"
)

type Definition struct {
	Scope       string
	Name        string
	Label       string
	Kind        ParamKind
	Default     any
	Min         *float64
	Max         *float64
	Step        *float64
	Description string
}

func StrategyCoreDefinitions(cfg *config.Config) []Definition {
	s := cfg.Strategy
	return []Definition{
		{Scope: ScopeStrategyCore, Name: "ema_pullback_enable", Label: "EMA Pullback Enabled", Kind: KindBool, Default: s.EMAPullbackEnable, Description: "Enable EMA pullback strategy."},
		{Scope: ScopeStrategyCore, Name: "orb_enable", Label: "ORB Enabled", Kind: KindBool, Default: s.ORBEnable, Description: "Enable Opening Range Breakout strategy."},
		{Scope: ScopeStrategyCore, Name: "supertrend_enable", Label: "Supertrend Enabled", Kind: KindBool, Default: s.SupertrendEnable, Description: "Enable Supertrend continuation strategy."},
		{Scope: ScopeStrategyCore, Name: "bb_squeeze_enable", Label: "BB Squeeze Enabled", Kind: KindBool, Default: s.BBSqueezeEnable, Description: "Enable Bollinger squeeze strategy."},
		{Scope: ScopeStrategyCore, Name: "max_symbols", Label: "Max Symbols", Kind: KindInt, Default: s.MaxSymbols, Min: floatPtr(1), Max: floatPtr(200), Step: floatPtr(1), Description: "Max ranked symbols evaluated per run."},
		{Scope: ScopeStrategyCore, Name: "min_daily_volume", Label: "Min Daily Volume", Kind: KindInt, Default: s.MinDailyVolume, Min: floatPtr(1), Step: floatPtr(1), Description: "Minimum average daily volume required in universe filter."},
		{Scope: ScopeStrategyCore, Name: "ema_fast", Label: "EMA Fast", Kind: KindInt, Default: s.EMAFast, Min: floatPtr(2), Max: floatPtr(100), Step: floatPtr(1), Description: "Fast EMA length for trend filter."},
		{Scope: ScopeStrategyCore, Name: "ema_slow", Label: "EMA Slow", Kind: KindInt, Default: s.EMASlow, Min: floatPtr(5), Max: floatPtr(200), Step: floatPtr(1), Description: "Slow EMA length for trend filter."},
		{Scope: ScopeStrategyCore, Name: "rsi_period", Label: "RSI Period", Kind: KindInt, Default: s.RSIPeriod, Min: floatPtr(2), Max: floatPtr(50), Step: floatPtr(1), Description: "RSI lookback length."},
		{Scope: ScopeStrategyCore, Name: "rsi_setup_min", Label: "RSI Setup Min", Kind: KindNumber, Default: s.RSISetupMin, Min: floatPtr(0), Max: floatPtr(100), Step: floatPtr(0.1), Description: "Minimum RSI for setup filter."},
		{Scope: ScopeStrategyCore, Name: "rsi_setup_max", Label: "RSI Setup Max", Kind: KindNumber, Default: s.RSISetupMax, Min: floatPtr(0), Max: floatPtr(100), Step: floatPtr(0.1), Description: "Maximum RSI for setup filter."},
		{Scope: ScopeStrategyCore, Name: "rsi_trigger", Label: "RSI Trigger", Kind: KindNumber, Default: s.RSITrigger, Min: floatPtr(0), Max: floatPtr(100), Step: floatPtr(0.1), Description: "RSI trigger threshold for entry."},
		{Scope: ScopeStrategyCore, Name: "vwap_distance_pct", Label: "VWAP Distance %", Kind: KindNumber, Default: s.VWAPDistancePct, Min: floatPtr(0), Max: floatPtr(5), Step: floatPtr(0.01), Description: "Max distance from VWAP in percent."},
		{Scope: ScopeStrategyCore, Name: "pullback_pct", Label: "Pullback %", Kind: KindNumber, Default: s.PullbackPct, Min: floatPtr(0), Max: floatPtr(5), Step: floatPtr(0.01), Description: "Max pullback from EMA in percent."},
		{Scope: ScopeStrategyCore, Name: "volume_spike_multiplier", Label: "Volume Spike Multiplier", Kind: KindNumber, Default: s.VolumeSpikeMultiplier, Min: floatPtr(0.5), Max: floatPtr(10), Step: floatPtr(0.1), Description: "Volume spike threshold vs average minute volume."},
		{Scope: ScopeStrategyCore, Name: "atr_period", Label: "ATR Period", Kind: KindInt, Default: s.ATRPeriod, Min: floatPtr(2), Max: floatPtr(50), Step: floatPtr(1), Description: "ATR length for stops and targets."},
		{Scope: ScopeStrategyCore, Name: "stop_atr_multiplier", Label: "Stop ATR Multiplier", Kind: KindNumber, Default: s.StopATRMultiplier, Min: floatPtr(0.1), Max: floatPtr(10), Step: floatPtr(0.1), Description: "Stop distance in ATR multiples."},
		{Scope: ScopeStrategyCore, Name: "target_atr_multiplier", Label: "Target ATR Multiplier", Kind: KindNumber, Default: s.TargetATRMultiplier, Min: floatPtr(0.1), Max: floatPtr(10), Step: floatPtr(0.1), Description: "Target distance in ATR multiples."},
		{Scope: ScopeStrategyCore, Name: "orb_range_minutes", Label: "ORB Range Minutes", Kind: KindInt, Default: s.ORBRangeMinutes, Min: floatPtr(1), Max: floatPtr(60), Step: floatPtr(1), Description: "Minutes used to define the opening range."},
		{Scope: ScopeStrategyCore, Name: "orb_volume_multiplier", Label: "ORB Volume Multiplier", Kind: KindNumber, Default: s.ORBVolumeMultiplier, Min: floatPtr(0.1), Max: floatPtr(10), Step: floatPtr(0.1), Description: "ORB breakout volume filter multiplier."},
		{Scope: ScopeStrategyCore, Name: "orb_min_range_pct", Label: "ORB Min Range %", Kind: KindNumber, Default: s.ORBMinRangePct, Min: floatPtr(0), Max: floatPtr(10), Step: floatPtr(0.1), Description: "Minimum ORB range percent."},
		{Scope: ScopeStrategyCore, Name: "orb_max_range_pct", Label: "ORB Max Range %", Kind: KindNumber, Default: s.ORBMaxRangePct, Min: floatPtr(0), Max: floatPtr(20), Step: floatPtr(0.1), Description: "Maximum ORB range percent."},
		{Scope: ScopeStrategyCore, Name: "supertrend_atr_period", Label: "Supertrend ATR Period", Kind: KindInt, Default: s.SupertrendATRPeriod, Min: floatPtr(2), Max: floatPtr(50), Step: floatPtr(1), Description: "ATR length for Supertrend."},
		{Scope: ScopeStrategyCore, Name: "supertrend_multiplier", Label: "Supertrend Multiplier", Kind: KindNumber, Default: s.SupertrendMultiplier, Min: floatPtr(1), Max: floatPtr(10), Step: floatPtr(0.1), Description: "Supertrend multiplier."},
		{Scope: ScopeStrategyCore, Name: "supertrend_timeframe_minutes", Label: "Supertrend Timeframe (min)", Kind: KindInt, Default: s.SupertrendTimeframe, Min: floatPtr(1), Max: floatPtr(60), Step: floatPtr(1), Description: "Supertrend aggregation timeframe in minutes."},
		{Scope: ScopeStrategyCore, Name: "bb_period", Label: "BB Period", Kind: KindInt, Default: s.BBPeriod, Min: floatPtr(5), Max: floatPtr(100), Step: floatPtr(1), Description: "Bollinger period length."},
		{Scope: ScopeStrategyCore, Name: "bb_stddev", Label: "BB StdDev", Kind: KindNumber, Default: s.BBStdDev, Min: floatPtr(0.5), Max: floatPtr(5), Step: floatPtr(0.1), Description: "Bollinger band stddev multiplier."},
		{Scope: ScopeStrategyCore, Name: "bb_timeframe_minutes", Label: "BB Timeframe (min)", Kind: KindInt, Default: s.BBTimeframe, Min: floatPtr(1), Max: floatPtr(60), Step: floatPtr(1), Description: "Bollinger aggregation timeframe in minutes."},
		{Scope: ScopeStrategyCore, Name: "bb_squeeze_bandwidth_pct", Label: "BB Squeeze Bandwidth %", Kind: KindNumber, Default: s.BBSqueezeBandwidthPct, Min: floatPtr(0.1), Max: floatPtr(10), Step: floatPtr(0.1), Description: "Bandwidth percent threshold for squeeze."},
		{Scope: ScopeStrategyCore, Name: "bb_squeeze_lookback", Label: "BB Squeeze Lookback", Kind: KindInt, Default: s.BBSqueezeLookback, Min: floatPtr(5), Max: floatPtr(200), Step: floatPtr(1), Description: "Lookback bars for squeeze comparison."},
		{Scope: ScopeStrategyCore, Name: "bb_squeeze_mode", Label: "BB Squeeze Mode", Kind: KindString, Default: s.BBSqueezeMode, Description: "Mode: directional or straddle."},
		{Scope: ScopeStrategyCore, Name: "event_straddle_enable", Label: "Event Straddle Enabled", Kind: KindBool, Default: s.EventStraddleEnable, Description: "Enable event-day straddle strategy."},
		{Scope: ScopeStrategyCore, Name: "event_straddle_dates", Label: "Event Straddle Dates", Kind: KindString, Default: strings.Join(s.EventStraddleDates, ","), Description: "Comma-separated event dates (YYYY-MM-DD)."},
		{Scope: ScopeStrategyCore, Name: "event_straddle_token", Label: "Event Straddle Token", Kind: KindString, Default: s.EventStraddleToken, Description: "Underlying token used for event straddle."},
		{Scope: ScopeStrategyCore, Name: "event_straddle_underlying", Label: "Event Straddle Underlying", Kind: KindString, Default: s.EventStraddleUnderlying, Description: "Underlying name for option mapping."},
		{Scope: ScopeStrategyCore, Name: "event_straddle_exchange", Label: "Event Straddle Exchange", Kind: KindString, Default: s.EventStraddleExchange, Description: "Exchange for event straddle token."},
		{Scope: ScopeStrategyCore, Name: "event_straddle_start", Label: "Event Straddle Start", Kind: KindString, Default: s.EventStraddleStart, Description: "Start time (HH:MM IST) for event straddle window."},
		{Scope: ScopeStrategyCore, Name: "event_straddle_end", Label: "Event Straddle End", Kind: KindString, Default: s.EventStraddleEnd, Description: "End time (HH:MM IST) for event straddle window."},
		{Scope: ScopeStrategyCore, Name: "event_straddle_timeframe_minutes", Label: "Event Straddle Timeframe (min)", Kind: KindInt, Default: s.EventStraddleTimeframeMinutes, Min: floatPtr(1), Max: floatPtr(60), Step: floatPtr(1), Description: "Aggregation timeframe for event straddle checks."},
		{Scope: ScopeStrategyCore, Name: "event_straddle_lookback_minutes", Label: "Event Straddle Lookback (min)", Kind: KindInt, Default: s.EventStraddleLookbackMinutes, Min: floatPtr(10), Max: floatPtr(600), Step: floatPtr(5), Description: "Lookback window in minutes for compression checks."},
		{Scope: ScopeStrategyCore, Name: "event_straddle_bandwidth_pct", Label: "Event Straddle Bandwidth %", Kind: KindNumber, Default: s.EventStraddleBandwidthPct, Min: floatPtr(0.1), Max: floatPtr(10), Step: floatPtr(0.1), Description: "Max Bollinger bandwidth percent to allow straddle entry."},
		{Scope: ScopeStrategyCore, Name: "event_straddle_bandwidth_slope_max", Label: "Event Straddle BW Slope Max", Kind: KindNumber, Default: s.EventStraddleBandwidthSlopeMax, Min: floatPtr(-10), Max: floatPtr(10), Step: floatPtr(0.1), Description: "Max bandwidth slope percent over lookback window."},
		{Scope: ScopeStrategyCore, Name: "event_straddle_range_pct", Label: "Event Straddle Range %", Kind: KindNumber, Default: s.EventStraddleRangePct, Min: floatPtr(0.1), Max: floatPtr(10), Step: floatPtr(0.1), Description: "Max price range percent over lookback window."},
		{Scope: ScopeStrategyCore, Name: "event_straddle_atr_pct_max", Label: "Event Straddle ATR % Max", Kind: KindNumber, Default: s.EventStraddleATRPercentMax, Min: floatPtr(0), Max: floatPtr(10), Step: floatPtr(0.1), Description: "Max ATR percent allowed for stabilization."},
		{Scope: ScopeStrategyCore, Name: "event_straddle_atr_pct_slope_max", Label: "Event Straddle ATR % Slope Max", Kind: KindNumber, Default: s.EventStraddleATRPercentSlopeMax, Min: floatPtr(-10), Max: floatPtr(10), Step: floatPtr(0.1), Description: "Max ATR percent slope over lookback window."},
		{Scope: ScopeStrategyCore, Name: "event_straddle_cooldown_minutes", Label: "Event Straddle Cooldown (min)", Kind: KindInt, Default: s.EventStraddleCooldownMinutes, Min: floatPtr(0), Max: floatPtr(1440), Step: floatPtr(1), Description: "Cooldown minutes after event straddle signal."},
		{Scope: ScopeStrategyCore, Name: "cooldown_minutes", Label: "Cooldown Minutes", Kind: KindInt, Default: s.CooldownMinutes, Min: floatPtr(0), Max: floatPtr(240), Step: floatPtr(1), Description: "Cooldown per symbol after signal."},
		{Scope: ScopeStrategyCore, Name: "lookback_minutes", Label: "Lookback Minutes", Kind: KindInt, Default: s.LookbackMinutes, Min: floatPtr(30), Max: floatPtr(600), Step: floatPtr(5), Description: "Minute bars used for setup evaluation."},
		{Scope: ScopeStrategyCore, Name: "max_signals_per_run", Label: "Max Signals Per Run", Kind: KindInt, Default: s.MaxSignalsPerRun, Min: floatPtr(1), Max: floatPtr(100), Step: floatPtr(1), Description: "Caps signals per execution."},
		{Scope: ScopeStrategyCore, Name: "min_confidence", Label: "Min Confidence", Kind: KindNumber, Default: s.MinConfidence, Min: floatPtr(0), Max: floatPtr(1), Step: floatPtr(0.01), Description: "Minimum signal confidence to emit."},
		{Scope: ScopeStrategyCore, Name: "allow_short", Label: "Allow Short", Kind: KindBool, Default: s.AllowShort, Description: "Enable short regime signals."},
		{Scope: ScopeStrategyCore, Name: "use_options", Label: "Use Options", Kind: KindBool, Default: s.UseOptions, Description: "Map strategy signals to option contracts."},
		{Scope: ScopeStrategyCore, Name: "option_expiry_rank", Label: "Option Expiry Rank", Kind: KindInt, Default: s.OptionExpiryRank, Min: floatPtr(0), Max: floatPtr(5), Step: floatPtr(1), Description: "Expiry rank (0 = nearest)."},
		{Scope: ScopeStrategyCore, Name: "option_min_days_to_expiry", Label: "Option Min Days", Kind: KindInt, Default: s.OptionMinDaysToExpiry, Min: floatPtr(0), Max: floatPtr(30), Step: floatPtr(1), Description: "Minimum days to expiry for option selection."},
		{Scope: ScopeStrategyCore, Name: "option_stop_loss_pct", Label: "Option Stop %", Kind: KindNumber, Default: s.OptionStopLossPct, Min: floatPtr(0.01), Max: floatPtr(1), Step: floatPtr(0.01), Description: "Option stop loss percent."},
		{Scope: ScopeStrategyCore, Name: "option_target_pct", Label: "Option Target %", Kind: KindNumber, Default: s.OptionTargetPct, Min: floatPtr(0.01), Max: floatPtr(5), Step: floatPtr(0.01), Description: "Option target percent."},
		{Scope: ScopeStrategyCore, Name: "option_time_stop_minutes", Label: "Option Time Stop (min)", Kind: KindInt, Default: s.OptionTimeStopMinutes, Min: floatPtr(0), Max: floatPtr(240), Step: floatPtr(1), Description: "Time stop minutes for option trades."},
		{Scope: ScopeStrategyCore, Name: "option_min_premium", Label: "Option Min Premium", Kind: KindNumber, Default: s.OptionMinPremium, Min: floatPtr(0), Max: floatPtr(10000), Step: floatPtr(1), Description: "Minimum option premium to trade."},
		{Scope: ScopeStrategyCore, Name: "option_allow_single_leg", Label: "Allow Single-Leg Options", Kind: KindBool, Default: s.OptionAllowSingleLeg, Description: "Allow naked option entries (CALL/PUT)."},
		{Scope: ScopeStrategyCore, Name: "option_straddle_equalize", Label: "Equalize Straddle Legs", Kind: KindBool, Default: s.OptionStraddleEqualize, Description: "Require CE/PE premiums to be balanced for straddles."},
		{Scope: ScopeStrategyCore, Name: "option_straddle_ratio_min", Label: "Straddle Ratio Min", Kind: KindNumber, Default: s.OptionStraddleRatioMin, Min: floatPtr(0.1), Max: floatPtr(5), Step: floatPtr(0.01), Description: "Minimum CE/PE premium ratio for straddles."},
		{Scope: ScopeStrategyCore, Name: "option_straddle_ratio_max", Label: "Straddle Ratio Max", Kind: KindNumber, Default: s.OptionStraddleRatioMax, Min: floatPtr(0.1), Max: floatPtr(5), Step: floatPtr(0.01), Description: "Maximum CE/PE premium ratio for straddles."},
		{Scope: ScopeStrategyCore, Name: "option_straddle_max_spread_pct", Label: "Straddle Max Spread %", Kind: KindNumber, Default: s.OptionStraddleMaxSpreadPct, Min: floatPtr(0), Max: floatPtr(10), Step: floatPtr(0.1), Description: "Max bid/ask spread percent allowed per leg."},
		{Scope: ScopeStrategyCore, Name: "run_outside_market_hours", Label: "Run Outside Market Hours", Kind: KindBool, Default: s.RunOutsideMarketHours, Description: "Allow strategy to run outside market hours."},
	}
}

func BacktestA02Definitions(cfg *config.Config) []Definition {
	b := cfg.Backtest
	return []Definition{
		{Scope: ScopeBacktestA02, Name: "days_back", Label: "Days Back (Percentile)", Kind: KindInt, Default: b.DaysBack, Min: floatPtr(30), Max: floatPtr(1500), Step: floatPtr(1), Description: "Lookback window for 52-week percentile."},
		{Scope: ScopeBacktestA02, Name: "max_percentile", Label: "Max Percentile", Kind: KindNumber, Default: b.MaxPercentile, Min: floatPtr(0), Max: floatPtr(100), Step: floatPtr(0.1), Description: "Percentile threshold for entry filter."},
		{Scope: ScopeBacktestA02, Name: "rsi_period", Label: "RSI Period", Kind: KindInt, Default: b.RSIPeriod, Min: floatPtr(2), Max: floatPtr(50), Step: floatPtr(1), Description: "RSI lookback for A02."},
		{Scope: ScopeBacktestA02, Name: "rsi_threshold", Label: "RSI Threshold", Kind: KindNumber, Default: b.RSIThreshold, Min: floatPtr(0), Max: floatPtr(100), Step: floatPtr(0.1), Description: "RSI must be below this value."},
		{Scope: ScopeBacktestA02, Name: "willr_period", Label: "WILLR Period", Kind: KindInt, Default: b.WILLRPeriod, Min: floatPtr(2), Max: floatPtr(50), Step: floatPtr(1), Description: "WILLR lookback for A02."},
		{Scope: ScopeBacktestA02, Name: "willr_threshold", Label: "WILLR Threshold", Kind: KindNumber, Default: b.WILLRThreshold, Min: floatPtr(-100), Max: floatPtr(0), Step: floatPtr(0.1), Description: "WILLR must be below this value."},
		{Scope: ScopeBacktestA02, Name: "require_daily_ema_trend", Label: "Require Daily EMA Trend", Kind: KindBool, Default: b.RequireDailyEMATrend, Description: "Require daily EMA fast >= EMA slow before entry."},
		{Scope: ScopeBacktestA02, Name: "daily_ema_fast", Label: "Daily EMA Fast", Kind: KindInt, Default: b.DailyEMAFast, Min: floatPtr(2), Max: floatPtr(200), Step: floatPtr(1), Description: "Fast EMA length for daily trend filter."},
		{Scope: ScopeBacktestA02, Name: "daily_ema_slow", Label: "Daily EMA Slow", Kind: KindInt, Default: b.DailyEMASlow, Min: floatPtr(5), Max: floatPtr(400), Step: floatPtr(1), Description: "Slow EMA length for daily trend filter."},
		{Scope: ScopeBacktestA02, Name: "require_bollinger_touch", Label: "Require Lower BB Touch", Kind: KindBool, Default: b.RequireBollingerTouch, Description: "Require close near lower Bollinger band."},
		{Scope: ScopeBacktestA02, Name: "bollinger_period", Label: "Bollinger Period", Kind: KindInt, Default: b.BollingerPeriod, Min: floatPtr(5), Max: floatPtr(100), Step: floatPtr(1), Description: "Bollinger period for A02 filter."},
		{Scope: ScopeBacktestA02, Name: "bollinger_stddev", Label: "Bollinger StdDev", Kind: KindNumber, Default: b.BollingerStdDev, Min: floatPtr(0.5), Max: floatPtr(5), Step: floatPtr(0.1), Description: "Bollinger stddev multiplier for A02 filter."},
		{Scope: ScopeBacktestA02, Name: "bollinger_lower_buffer_pct", Label: "BB Lower Buffer %", Kind: KindNumber, Default: b.BollingerLowerBufferPct, Min: floatPtr(0), Max: floatPtr(5), Step: floatPtr(0.01), Description: "Allowable percent above lower band for touch."},
		{Scope: ScopeBacktestA02, Name: "require_vwap_reclaim", Label: "Require VWAP Reclaim", Kind: KindBool, Default: b.RequireVWAPReclaim, Description: "Require close above intraday VWAP."},
		{Scope: ScopeBacktestA02, Name: "require_volume_spike", Label: "Require Volume Spike", Kind: KindBool, Default: b.RequireVolumeSpike, Description: "Require signal bar volume spike vs median."},
		{Scope: ScopeBacktestA02, Name: "volume_spike_min_ratio", Label: "Volume Spike Min Ratio", Kind: KindNumber, Default: b.VolumeSpikeMinRatio, Min: floatPtr(0.1), Max: floatPtr(10), Step: floatPtr(0.1), Description: "Signal volume must be >= median * ratio."},
		{Scope: ScopeBacktestA02, Name: "close_lookback", Label: "Close Lookback", Kind: KindInt, Default: b.CloseLookback, Min: floatPtr(1), Max: floatPtr(20), Step: floatPtr(1), Description: "Bars used for average close filter."},
		{Scope: ScopeBacktestA02, Name: "volume_lookback", Label: "Volume Lookback", Kind: KindInt, Default: b.VolumeLookback, Min: floatPtr(1), Max: floatPtr(50), Step: floatPtr(1), Description: "Bars used for median volume filter."},
		{Scope: ScopeBacktestA02, Name: "volume_median_max_ratio", Label: "Volume Median Max Ratio", Kind: KindNumber, Default: b.VolumeMedianMaxRatio, Min: floatPtr(0.1), Max: floatPtr(10), Step: floatPtr(0.1), Description: "Prev volume must be <= median * ratio."},
		{Scope: ScopeBacktestA02, Name: "start_offset_minutes", Label: "Start Offset (min)", Kind: KindInt, Default: b.StartOffsetMinutes, Min: floatPtr(0), Max: floatPtr(120), Step: floatPtr(1), Description: "Delay after market open before entries."},
		{Scope: ScopeBacktestA02, Name: "entry_cutoff_time", Label: "Entry Cutoff (HH:MM)", Kind: KindString, Default: b.EntryCutoffTime, Description: "Cutoff time for new entries."},
		{Scope: ScopeBacktestA02, Name: "target_gain", Label: "Target Gain", Kind: KindNumber, Default: b.TargetGain, Min: floatPtr(0.0001), Max: floatPtr(0.1), Step: floatPtr(0.0001), Description: "Target gain as fraction (0.0022 = 0.22%)."},
		{Scope: ScopeBacktestA02, Name: "trade_capital", Label: "Trade Capital", Kind: KindNumber, Default: b.TradeCapital, Min: floatPtr(1), Step: floatPtr(1), Description: "Capital allocated per trade for sizing."},
		{Scope: ScopeBacktestA02, Name: "capital_limit", Label: "Capital Limit", Kind: KindNumber, Default: b.CapitalLimit, Min: floatPtr(1), Step: floatPtr(1), Description: "Total capital limit for concurrent trades."},
		{Scope: ScopeBacktestA02, Name: "max_concurrent_trades", Label: "Max Concurrent Trades", Kind: KindInt, Default: b.MaxConcurrentTrades, Min: floatPtr(1), Max: floatPtr(50), Step: floatPtr(1), Description: "Max concurrent trades for capital allocation."},
	}
}

func DefinitionsForScope(cfg *config.Config, scope string) ([]Definition, bool) {
	switch scope {
	case ScopeStrategyCore:
		return StrategyCoreDefinitions(cfg), true
	case ScopeBacktestA02:
		return BacktestA02Definitions(cfg), true
	default:
		return nil, false
	}
}

func floatPtr(v float64) *float64 {
	return &v
}
