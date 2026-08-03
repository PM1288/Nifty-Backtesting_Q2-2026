package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

type Config struct {
	SmartAPI        SmartAPIConfig        `yaml:"smartapi"`
	Postgres        PostgresConfig        `yaml:"postgres"`
	Runtime         RuntimeConfig         `yaml:"runtime"`
	Files           FilesConfig           `yaml:"files"`
	Universe        UniverseConfig        `yaml:"universe"`
	WS              WSConfig              `yaml:"ws"`
	Health          HealthConfig          `yaml:"health"`
	RestTasks       RestTasksConfig       `yaml:"rest_tasks"`
	History         HistoryConfig         `yaml:"history"`
	Limits          LimitsConfig          `yaml:"limits"`
	Retention       RetentionConfig       `yaml:"retention"`
	Metrics         MetricsConfig         `yaml:"metrics"`
	Strategy        StrategyConfig        `yaml:"strategy"`
	Paper           PaperConfig           `yaml:"paper_trading"`
	Backtest        BacktestConfig        `yaml:"backtest"`
	Equilibrium     EquilibriumConfig     `yaml:"equilibrium"`
	MaxPain         MaxPainConfig         `yaml:"max_pain"`
	Alerts          AlertsConfig          `yaml:"alerts"`
	Watchlist       WatchlistConfig       `yaml:"watchlist"`
	RSIWillRMonitor RSIWillRMonitorConfig `yaml:"rsi_willr_monitor"`
	Portfolio       PortfolioConfig       `yaml:"portfolio"`
	Digii4Flow      Digii4FlowConfig      `yaml:"digii4_flow"`
	NiftyWatcher    NiftyWatcherConfig    `yaml:"nifty_watcher"`
}

type SmartAPIConfig struct {
	APIKey            string `yaml:"api_key"`
	ClientCode        string `yaml:"client_code"`
	Password          string `yaml:"password"`
	MPIN              string `yaml:"mpin"`
	TOTPSecret        string `yaml:"totp_secret"`
	TOTPCode          string `yaml:"totp_code"`
	AccessToken       string `yaml:"access_token"`
	FeedToken         string `yaml:"feed_token"`
	RestBaseURL       string `yaml:"rest_base_url"`
	WSURL             string `yaml:"ws_url"`
	DisableLiveOrders bool   `yaml:"disable_live_orders"`
}

type PostgresConfig struct {
	Host                   string `yaml:"host"`
	Port                   int    `yaml:"port"`
	User                   string `yaml:"user"`
	Password               string `yaml:"password"`
	Database               string `yaml:"database"`
	SSLMode                string `yaml:"sslmode"`
	Schema                 string `yaml:"schema"`
	AppName                string `yaml:"app_name"`
	ConnectTimeoutSeconds  int    `yaml:"connect_timeout_seconds"`
	MaxConns               int32  `yaml:"max_conns"`
	MinConns               int32  `yaml:"min_conns"`
	MaxConnIdleSeconds     int    `yaml:"max_conn_idle_seconds"`
	HealthCheckSeconds     int    `yaml:"health_check_seconds"`
	MaxConnLifetimeMinutes int    `yaml:"max_conn_lifetime_minutes"`
	SlowQueryMilliseconds  int    `yaml:"slow_query_ms"`
}

type RuntimeConfig struct {
	Timezone                  string `yaml:"timezone"`
	LogLevel                  string `yaml:"log_level"`
	LogJSON                   bool   `yaml:"log_json"`
	ServiceName               string `yaml:"service_name"`
	ServiceVersion            string `yaml:"service_version"`
	HTTPTimeoutSeconds        int    `yaml:"http_timeout_seconds"`
	FlushSeconds              int    `yaml:"flush_seconds"`
	TradingStart              string `yaml:"trading_start"`
	TradingEnd                string `yaml:"trading_end"`
	WeekendPullLastWorkingDay bool   `yaml:"weekend_pull_last_working_day"`
}

type FilesConfig struct {
	SymbolsCSVPath      string `yaml:"symbols_csv_path"`
	ConstituentsCSVPath string `yaml:"constituents_csv_path"`
	InstrumentCachePath string `yaml:"instrument_cache_path"`
}

type UniverseConfig struct {
	EquitiesExchange    string            `yaml:"equities_exchange"`
	DerivativesExchange string            `yaml:"derivatives_exchange"`
	IncludeIndices      []string          `yaml:"include_indices"`
	IndexTokens         map[string]string `yaml:"index_tokens"`
	FNOCurrentMonthOnly bool              `yaml:"fno_current_month_only"`
	Futures             FuturesConfig     `yaml:"futures"`
	Options             OptionsConfig     `yaml:"options"`
}

type FuturesConfig struct {
	EnableStockFutures bool `yaml:"enable_stock_futures"`
	EnableIndexFutures bool `yaml:"enable_index_futures"`
	ExpiryRank         int  `yaml:"expiry_rank"`
}

type OptionsConfig struct {
	EnableIndexOptions   bool     `yaml:"enable_index_options"`
	EnableStockOptions   bool     `yaml:"enable_stock_options"`
	IndexUnderlyings     []string `yaml:"index_underlyings"`
	StockUnderlyingsMax  int      `yaml:"stock_underlyings_max"`
	ExpiryRankIndex      int      `yaml:"expiry_rank_index"`
	ExpiryRankStock      int      `yaml:"expiry_rank_stock"`
	StrikesEachSide      int      `yaml:"strikes_each_side"`
	StrikeRefreshMinutes int      `yaml:"strike_refresh_minutes"`
	ATMShiftRebuildSteps int      `yaml:"atm_shift_rebuild_steps"`
}

type WSConfig struct {
	ModeEquities                 string   `yaml:"mode_equities"`
	ModeIndices                  string   `yaml:"mode_indices"`
	ModeFutures                  string   `yaml:"mode_futures"`
	ModeOptions                  string   `yaml:"mode_options"`
	MaxReconnectBackoffSeconds   int      `yaml:"max_reconnect_backoff_seconds"`
	MaxConnections               int      `yaml:"max_connections"`
	MaxTokensPerConnection       int      `yaml:"max_tokens_per_connection"`
	InsecureSkipVerify           bool     `yaml:"insecure_skip_verify"`
	EnableDepthSnapshots         bool     `yaml:"enable_depth_snapshots"`
	DepthSnapshotIntervalSeconds int      `yaml:"depth_snapshot_interval_seconds"`
	DepthSnapshotKinds           []string `yaml:"depth_snapshot_kinds"`
}

type HealthConfig struct {
	EnableHTTP bool   `yaml:"enable_http"`
	ListenAddr string `yaml:"listen_addr"`
}

type RestTasksConfig struct {
	EnableQuoteSnapshots                 bool             `yaml:"enable_quote_snapshots"`
	QuoteSnapshotIntervalSeconds         int              `yaml:"quote_snapshot_interval_seconds"`
	QuoteSnapshotIncludeOptions          bool             `yaml:"quote_snapshot_include_options"`
	QuoteSnapshotPrimaryKinds            []string         `yaml:"quote_snapshot_primary_kinds"`
	QuoteSnapshotPrimaryIndices          []string         `yaml:"quote_snapshot_primary_indices"`
	QuoteSnapshotRotationMaxTokens       int              `yaml:"quote_snapshot_rotation_max_tokens"`
	QuoteSnapshotRotationBudgets         []RotationBudget `yaml:"quote_snapshot_rotation_budgets"`
	EnableOptionQuoteSnapshots           bool             `yaml:"enable_option_quote_snapshots"`
	OptionQuoteSnapshotIntervalSeconds   int              `yaml:"option_quote_snapshot_interval_seconds"`
	OptionQuoteSnapshotRotationMaxTokens int              `yaml:"option_quote_snapshot_rotation_max_tokens"`
	EnableOptionGreeks                   bool             `yaml:"enable_option_greeks"`
	OptionGreeksIntervalSeconds          int              `yaml:"option_greeks_interval_seconds"`
	OptionGreeksUnderlyings              []string         `yaml:"option_greeks_underlyings"`
	EnableOISnapshots                    bool             `yaml:"enable_oi_snapshots"`
	OISnapshotIntervalSeconds            int              `yaml:"oi_snapshot_interval_seconds"`
	EnablePCRSnapshots                   bool             `yaml:"enable_pcr_snapshots"`
	PCRSnapshotIntervalSeconds           int              `yaml:"pcr_snapshot_interval_seconds"`
	EnableGainersLosers                  bool             `yaml:"enable_gainers_losers"`
	GainersLosersIntervalSeconds         int              `yaml:"gainers_losers_interval_seconds"`
	GainersLosersPayloads                []map[string]any `yaml:"gainers_losers_payloads"`
	EnableOIBuildup                      bool             `yaml:"enable_oi_buildup"`
	OIBuildupIntervalSeconds             int              `yaml:"oi_buildup_interval_seconds"`
	OIBuildupPayloads                    []map[string]any `yaml:"oi_buildup_payloads"`
	EnablePutCallRatio                   bool             `yaml:"enable_put_call_ratio"`
	PutCallRatioIntervalSeconds          int              `yaml:"put_call_ratio_interval_seconds"`
	EnableRestFallback                   bool             `yaml:"enable_rest_fallback"`
	RestFallbackIntervalSeconds          int              `yaml:"rest_fallback_interval_seconds"`
	RestFallbackStaleSeconds             int              `yaml:"rest_fallback_stale_seconds"`
	RestFallbackLookbackMinutes          int              `yaml:"rest_fallback_lookback_minutes"`
}

type RotationBudget struct {
	Kind      string `yaml:"kind"`
	MaxTokens int    `yaml:"max_tokens"`
}

type HistoryConfig struct {
	EnableDaily     bool     `yaml:"enable_daily"`
	DailyYears      int      `yaml:"daily_years"`
	DailyChunkDays  int      `yaml:"daily_chunk_days"`
	DailyRunTimeIST string   `yaml:"daily_run_time_ist"`
	TrackKinds      []string `yaml:"track_kinds"`
}

type LimitsConfig struct {
	QuoteRPS                   int `yaml:"quote_rps"`
	QuotePerMinuteCap          int `yaml:"quote_per_minute_cap"`
	QuotePerHourCap            int `yaml:"quote_per_hour_cap"`
	QuoteMaxSymbolsPerRequest  int `yaml:"quote_max_symbols_per_request"`
	CandlesRPS                 int `yaml:"candles_rps"`
	CandlesPerHourCap          int `yaml:"candles_per_hour_cap"`
	GreeksRPS                  int `yaml:"greeks_rps"`
	AggregatesRPS              int `yaml:"aggregates_rps"`
	AggregatesPerMinuteCap     int `yaml:"aggregates_per_minute_cap"`
	AggregatesPerHourCap       int `yaml:"aggregates_per_hour_cap"`
	AdaptiveMinRPS             int `yaml:"adaptive_min_rps"`
	AdaptiveStepUpAfterSeconds int `yaml:"adaptive_step_up_after_seconds"`
}

type RetentionConfig struct {
	EnableCleanup          bool   `yaml:"enable_cleanup"`
	Enable                 bool   `yaml:"enable"`
	IntradayDays           int    `yaml:"intraday_days"`
	Bars1mDays             int    `yaml:"bars_1m_days"`
	QuoteSnapshotsDays     int    `yaml:"quote_snapshots_days"`
	QuoteSnapshotsHours    int    `yaml:"quote_snapshots_hours"`
	Depth5Days             int    `yaml:"depth_5_days"`
	Depth5Hours            int    `yaml:"depth_5_hours"`
	OptionGreeksDays       int    `yaml:"option_greeks_days"`
	OISnapshotsHours       int    `yaml:"oi_snapshots_hours"`
	Depth5MaxGB            int    `yaml:"depth_5_max_gb"`
	KeepInstruments        bool   `yaml:"keep_instruments_forever"`
	DryRun                 bool   `yaml:"dry_run"`
	CleanupRunTimeIST      string `yaml:"cleanup_run_time_ist"`
	CleanupIntervalMinutes int    `yaml:"cleanup_interval_minutes"`
}

type MetricsConfig struct {
	Enable                bool              `yaml:"enable"`
	RollupIntervalSeconds int               `yaml:"rollup_interval_seconds"`
	StateFlushSeconds     int               `yaml:"state_flush_seconds"`
	EnableAPIRequestLog   bool              `yaml:"enable_api_request_log"`
	SLA                   []SourceSLAConfig `yaml:"sla"`
}

type StrategyConfig struct {
	Enable                                     bool                   `yaml:"enable"`
	RunIntervalSeconds                         int                    `yaml:"run_interval_seconds"`
	MaxSymbols                                 int                    `yaml:"max_symbols"`
	MinDailyVolume                             int64                  `yaml:"min_daily_volume"`
	EMAFast                                    int                    `yaml:"ema_fast"`
	EMASlow                                    int                    `yaml:"ema_slow"`
	RSIPeriod                                  int                    `yaml:"rsi_period"`
	RSISetupMin                                float64                `yaml:"rsi_setup_min"`
	RSISetupMax                                float64                `yaml:"rsi_setup_max"`
	RSITrigger                                 float64                `yaml:"rsi_trigger"`
	VWAPDistancePct                            float64                `yaml:"vwap_distance_pct"`
	PullbackPct                                float64                `yaml:"pullback_pct"`
	VolumeSpikeMultiplier                      float64                `yaml:"volume_spike_multiplier"`
	ATRPeriod                                  int                    `yaml:"atr_period"`
	StopATRMultiplier                          float64                `yaml:"stop_atr_multiplier"`
	TargetATRMultiplier                        float64                `yaml:"target_atr_multiplier"`
	CooldownMinutes                            int                    `yaml:"cooldown_minutes"`
	AllowShort                                 bool                   `yaml:"allow_short"`
	IndexToken                                 string                 `yaml:"index_token"`
	VIXToken                                   string                 `yaml:"vix_token"`
	LookbackMinutes                            int                    `yaml:"lookback_minutes"`
	MaxSignalsPerRun                           int                    `yaml:"max_signals_per_run"`
	MinConfidence                              float64                `yaml:"min_confidence"`
	RunOutsideMarketHours                      bool                   `yaml:"run_outside_market_hours"`
	UseOptions                                 bool                   `yaml:"use_options"`
	OptionExpiryRank                           int                    `yaml:"option_expiry_rank"`
	OptionMinDaysToExpiry                      int                    `yaml:"option_min_days_to_expiry"`
	OptionStopLossPct                          float64                `yaml:"option_stop_loss_pct"`
	OptionTargetPct                            float64                `yaml:"option_target_pct"`
	OptionTimeStopMinutes                      int                    `yaml:"option_time_stop_minutes"`
	OptionMinPremium                           float64                `yaml:"option_min_premium"`
	OptionAllowSingleLeg                       bool                   `yaml:"option_allow_single_leg"`
	OptionStraddleEqualize                     bool                   `yaml:"option_straddle_equalize"`
	OptionStraddleRatioMin                     float64                `yaml:"option_straddle_ratio_min"`
	OptionStraddleRatioMax                     float64                `yaml:"option_straddle_ratio_max"`
	OptionStraddleMaxSpreadPct                 float64                `yaml:"option_straddle_max_spread_pct"`
	EMAPullbackEnable                          bool                   `yaml:"ema_pullback_enable"`
	ORBEnable                                  bool                   `yaml:"orb_enable"`
	ORBRangeMinutes                            int                    `yaml:"orb_range_minutes"`
	ORBVolumeMultiplier                        float64                `yaml:"orb_volume_multiplier"`
	ORBMinRangePct                             float64                `yaml:"orb_min_range_pct"`
	ORBMaxRangePct                             float64                `yaml:"orb_max_range_pct"`
	SupertrendEnable                           bool                   `yaml:"supertrend_enable"`
	SupertrendATRPeriod                        int                    `yaml:"supertrend_atr_period"`
	SupertrendMultiplier                       float64                `yaml:"supertrend_multiplier"`
	SupertrendTimeframe                        int                    `yaml:"supertrend_timeframe_minutes"`
	BBSqueezeEnable                            bool                   `yaml:"bb_squeeze_enable"`
	BBPeriod                                   int                    `yaml:"bb_period"`
	BBStdDev                                   float64                `yaml:"bb_stddev"`
	BBTimeframe                                int                    `yaml:"bb_timeframe_minutes"`
	BBSqueezeBandwidthPct                      float64                `yaml:"bb_squeeze_bandwidth_pct"`
	BBSqueezeLookback                          int                    `yaml:"bb_squeeze_lookback"`
	BBSqueezeMode                              string                 `yaml:"bb_squeeze_mode"`
	EventStraddleEnable                        bool                   `yaml:"event_straddle_enable"`
	EventStraddleDates                         []string               `yaml:"event_straddle_dates"`
	EventStraddleToken                         string                 `yaml:"event_straddle_token"`
	EventStraddleUnderlying                    string                 `yaml:"event_straddle_underlying"`
	EventStraddleExchange                      string                 `yaml:"event_straddle_exchange"`
	EventStraddleStart                         string                 `yaml:"event_straddle_start"`
	EventStraddleEnd                           string                 `yaml:"event_straddle_end"`
	EventStraddleTimeframeMinutes              int                    `yaml:"event_straddle_timeframe_minutes"`
	EventStraddleLookbackMinutes               int                    `yaml:"event_straddle_lookback_minutes"`
	EventStraddleBandwidthPct                  float64                `yaml:"event_straddle_bandwidth_pct"`
	EventStraddleBandwidthSlopeMax             float64                `yaml:"event_straddle_bandwidth_slope_max"`
	EventStraddleRangePct                      float64                `yaml:"event_straddle_range_pct"`
	EventStraddleATRPercentMax                 float64                `yaml:"event_straddle_atr_pct_max"`
	EventStraddleATRPercentSlopeMax            float64                `yaml:"event_straddle_atr_pct_slope_max"`
	EventStraddleCooldownMinutes               int                    `yaml:"event_straddle_cooldown_minutes"`
	NiftyLevelStraddleEnable                   bool                   `yaml:"nifty_level_straddle_enable"`
	NiftyLevelStraddleUnderlying               string                 `yaml:"nifty_level_straddle_underlying"`
	NiftyLevelStraddleToken                    string                 `yaml:"nifty_level_straddle_token"`
	NiftyLevelStraddleStep                     float64                `yaml:"nifty_level_straddle_step"`
	NiftyLevelStraddleBuffer                   float64                `yaml:"nifty_level_straddle_buffer"`
	NiftyLevelStraddleExpiryRank               int                    `yaml:"nifty_level_straddle_expiry_rank"`
	NiftyLevelStraddleLots                     int                    `yaml:"nifty_level_straddle_lots"`
	NiftyLevelStraddleLotSize                  int                    `yaml:"nifty_level_straddle_lot_size"`
	NiftyLevelStraddleTargetRupees             float64                `yaml:"nifty_level_straddle_target_rupees"`
	NiftyLevelStraddleStopRupees               float64                `yaml:"nifty_level_straddle_stop_rupees"`
	NiftyLevelStraddleExitTime                 string                 `yaml:"nifty_level_straddle_exit_time"`
	NiftyLevelStraddleEquilibriumOn            bool                   `yaml:"nifty_level_straddle_equilibrium_on"`
	NiftyLevelStraddleEquilibriumDiffMax       float64                `yaml:"nifty_level_straddle_equilibrium_diff_max"`
	NiftyLevelStraddleEquilibriumMaxAgeMinutes int                    `yaml:"nifty_level_straddle_equilibrium_max_age_minutes"`
	ManualStraddles                            []ManualStraddleConfig `yaml:"manual_straddles"`
}

type ManualStraddleConfig struct {
	Name               string  `yaml:"name"`
	Enabled            bool    `yaml:"enabled"`
	Exchange           string  `yaml:"exchange"`
	CEToken            string  `yaml:"ce_token"`
	PEToken            string  `yaml:"pe_token"`
	CEEntry            float64 `yaml:"ce_entry"`
	PEEntry            float64 `yaml:"pe_entry"`
	QuantityLots       int     `yaml:"quantity_lots"`
	TargetProfitRupees float64 `yaml:"target_profit_rupees"`
	TPPercent          float64 `yaml:"tp_percent"`
	SLPercent          float64 `yaml:"sl_percent"`
	TrailPercent       float64 `yaml:"trail_percent"`
}

type PaperConfig struct {
	Enable            bool    `yaml:"enable"`
	AutoPlace         bool    `yaml:"auto_place"`
	CapitalPerTrade   float64 `yaml:"capital_per_trade"`
	MaxOpenPositions  int     `yaml:"max_open_positions"`
	SlippageBps       float64 `yaml:"slippage_bps"`
	BrokeragePerTrade float64 `yaml:"brokerage_per_trade"`
	AllowPartialFills bool    `yaml:"allow_partial_fills"`
}

type BacktestConfig struct {
	Enable                  bool                  `yaml:"enable"`
	RunDaily                bool                  `yaml:"run_daily"`
	RunLive                 bool                  `yaml:"run_live"`
	SkipWeekends            bool                  `yaml:"skip_weekends"`
	DailyRunTimeIST         string                `yaml:"daily_run_time_ist"`
	EODTelegramChatID       string                `yaml:"eod_telegram_chat_id"`
	LiveIntervalSeconds     int                   `yaml:"live_interval_seconds"`
	LiveWindowMinutes       int                   `yaml:"live_window_minutes"`
	LiveMaxSignalsPerRun    int                   `yaml:"live_max_signals_per_run"`
	LiveMaxAlertsPerDay     int                   `yaml:"live_max_alerts_per_day"`
	RunOutsideMarketHours   bool                  `yaml:"run_outside_market_hours"`
	UseTradingCalendar      bool                  `yaml:"use_trading_calendar"`
	UseLastWorkingDay       bool                  `yaml:"use_last_working_day"`
	UniverseName            string                `yaml:"universe_name"`
	StrategyEnable          bool                  `yaml:"strategy_enable"`
	StrategyUniverseName    string                `yaml:"strategy_universe_name"`
	StrategyMaxSymbols      int                   `yaml:"strategy_max_symbols"`
	StrategySlippageBps     float64               `yaml:"strategy_slippage_bps"`
	StrategyCapitalPerTrade float64               `yaml:"strategy_capital_per_trade"`
	StrategyTimeStopMinutes int                   `yaml:"strategy_time_stop_minutes"`
	DaysBack                int                   `yaml:"days_back"`
	MaxPercentile           float64               `yaml:"max_percentile"`
	RSIPeriod               int                   `yaml:"rsi_period"`
	WILLRPeriod             int                   `yaml:"willr_period"`
	RSIThreshold            float64               `yaml:"rsi_threshold"`
	WILLRThreshold          float64               `yaml:"willr_threshold"`
	RequireDailyEMATrend    bool                  `yaml:"require_daily_ema_trend"`
	DailyEMAFast            int                   `yaml:"daily_ema_fast"`
	DailyEMASlow            int                   `yaml:"daily_ema_slow"`
	RequireBollingerTouch   bool                  `yaml:"require_bollinger_touch"`
	BollingerPeriod         int                   `yaml:"bollinger_period"`
	BollingerStdDev         float64               `yaml:"bollinger_stddev"`
	BollingerLowerBufferPct float64               `yaml:"bollinger_lower_buffer_pct"`
	RequireVWAPReclaim      bool                  `yaml:"require_vwap_reclaim"`
	RequireVolumeSpike      bool                  `yaml:"require_volume_spike"`
	VolumeSpikeMinRatio     float64               `yaml:"volume_spike_min_ratio"`
	CloseLookback           int                   `yaml:"close_lookback"`
	VolumeLookback          int                   `yaml:"volume_lookback"`
	VolumeMedianMaxRatio    float64               `yaml:"volume_median_max_ratio"`
	StartOffsetMinutes      int                   `yaml:"start_offset_minutes"`
	EntryCutoffTime         string                `yaml:"entry_cutoff_time"`
	EquityEntryStart        string                `yaml:"equity_entry_start"`
	EquityEntryEnd          string                `yaml:"equity_entry_end"`
	EquitySelectionRSIMax   float64               `yaml:"equity_selection_rsi_max"`
	EquitySelectionWillRMax float64               `yaml:"equity_selection_willr_max"`
	EquityEntryRSIThreshold float64               `yaml:"equity_entry_rsi_threshold"`
	EquityEntryWillRThresh  float64               `yaml:"equity_entry_willr_threshold"`
	EquityIntradayTargetNet float64               `yaml:"equity_intraday_target_net"`
	EquityDeliveryTargetNet float64               `yaml:"equity_delivery_target_net"`
	EquityCapitalScenarios  []float64             `yaml:"equity_capital_scenarios"`
	EquityAlertCapitals     []float64             `yaml:"equity_alert_capitals"`
	TargetGain              float64               `yaml:"target_gain"`
	TradeCapital            float64               `yaml:"trade_capital"`
	CapitalLimit            float64               `yaml:"capital_limit"`
	MaxConcurrentTrades     int                   `yaml:"max_concurrent_trades"`
	Charges                 BacktestChargesConfig `yaml:"charges"`
	Swing                   BacktestSwingConfig   `yaml:"swing"`
	Archive                 BacktestArchiveConfig `yaml:"archive"`
	OptionBacktest          BacktestOptionConfig  `yaml:"option_backtest"`
	Alerts                  AlertsConfig          `yaml:"alerts"`
}

type EquilibriumConfig struct {
	Enable                  bool     `yaml:"enable"`
	RunIntervalSeconds      int      `yaml:"run_interval_seconds"`
	LookbackMinutes         int      `yaml:"lookback_minutes"`
	Underlyings             []string `yaml:"underlyings"`
	Kinds                   []string `yaml:"kinds"`
	ExpiryRank              int      `yaml:"expiry_rank"`
	MaxDataStalenessMinutes int      `yaml:"max_data_staleness_minutes"`
	UnderlyingStaleSeconds  int      `yaml:"underlying_stale_seconds"`
}

type MaxPainConfig struct {
	Enable                  bool         `yaml:"enable"`
	RunIntervalSeconds      int          `yaml:"run_interval_seconds"`
	RunOutsideMarketHours   bool         `yaml:"run_outside_market_hours"`
	Underlyings             []string     `yaml:"underlyings"`
	ExpiryRanks             []int        `yaml:"expiry_ranks"`
	MaxDataStalenessMinutes int          `yaml:"max_data_staleness_minutes"`
	Alerts                  AlertsConfig `yaml:"alerts"`
}

type BacktestChargesConfig struct {
	BrokerageRate   float64 `yaml:"brokerage_rate"`
	BrokerageCap    float64 `yaml:"brokerage_cap"`
	STTRate         float64 `yaml:"stt_rate"`
	ExchangeTxnRate float64 `yaml:"exchange_txn_rate"`
	SEBIFeeRate     float64 `yaml:"sebi_fee_rate"`
	StampDutyRate   float64 `yaml:"stamp_duty_rate"`
	GSTRate         float64 `yaml:"gst_rate"`
}

type BacktestSwingConfig struct {
	Enable         bool    `yaml:"enable"`
	IntradayTarget float64 `yaml:"intraday_target"`
	SwingTarget    float64 `yaml:"swing_target"`
	BrokerageCap   float64 `yaml:"brokerage_cap"`
	StopLossPct    float64 `yaml:"stop_loss_pct"`
	HoldMinGainPct float64 `yaml:"hold_min_gain_pct"`
}

type BacktestArchiveConfig struct {
	Enable         bool     `yaml:"enable"`
	RunTimeIST     string   `yaml:"run_time_ist"`
	RunOnStart     bool     `yaml:"run_on_start"`
	Root           string   `yaml:"root"`
	Exchange       string   `yaml:"exchange"`
	Symbols        []string `yaml:"symbols"`
	SymbolsCSVPath string   `yaml:"symbols_csv_path"`
	StartDate      string   `yaml:"start_date"`
	EndDate        string   `yaml:"end_date"`
	RunIntraday    bool     `yaml:"run_intraday"`
	RunSwing       bool     `yaml:"run_swing"`
}

type BacktestOptionConfig struct {
	Enable                   bool    `yaml:"enable"`
	Underlying               string  `yaml:"underlying"`
	IndexToken               string  `yaml:"index_token"`
	Step                     float64 `yaml:"step"`
	Buffer                   float64 `yaml:"buffer"`
	ExpiryRank               int     `yaml:"expiry_rank"`
	Lots                     int     `yaml:"lots"`
	LotSize                  int     `yaml:"lot_size"`
	TargetRupees             float64 `yaml:"target_rupees"`
	EntryStart               string  `yaml:"entry_start"`
	EntryEnd                 string  `yaml:"entry_end"`
	ExitTime                 string  `yaml:"exit_time"`
	RSIPeriod                int     `yaml:"rsi_period"`
	WILLRPeriod              int     `yaml:"willr_period"`
	LookbackMinutes          int     `yaml:"lookback_minutes"`
	RSILowThreshold          float64 `yaml:"rsi_low_threshold"`
	RSIHighThreshold         float64 `yaml:"rsi_high_threshold"`
	EquilibriumDiffThreshold float64 `yaml:"equilibrium_diff_threshold"`
	IncludeRSI80WillR40      bool    `yaml:"include_rsi80_willr40"`
	NormalizationStart       string  `yaml:"normalization_start"`
	SlopeGuardEnable         bool    `yaml:"slope_guard_enable"`
	SlopeGuardMinAngle       float64 `yaml:"slope_guard_min_angle"`
	RunTuesdayOnly           bool    `yaml:"run_tuesday_only"`
}

type AlertsConfig struct {
	EnableWebhook         bool              `yaml:"enable_webhook"`
	EnableErrorAlerts     bool              `yaml:"enable_error_alerts"`
	WebhookURL            string            `yaml:"webhook_url"`
	DiscordWebhookURL     string            `yaml:"discord_webhook_url"`
	WebhookTimeoutSeconds int               `yaml:"webhook_timeout_seconds"`
	TitlePrefix           string            `yaml:"title_prefix"`
	MaxPerRun             int               `yaml:"max_per_run"`
	WebhookHeaders        map[string]string `yaml:"webhook_headers"`
	TelegramEnable        bool              `yaml:"telegram_enable"`
	TelegramBotToken      string            `yaml:"telegram_bot_token"`
	TelegramChatID        string            `yaml:"telegram_chat_id"`
	TelegramParseMode     string            `yaml:"telegram_parse_mode"`
	IncludeDetails        bool              `yaml:"include_details"`
	IncludeTargets        bool              `yaml:"include_targets"`
}

type WatchlistConfig struct {
	Enable                   bool                    `yaml:"enable"`
	ListenAddr               string                  `yaml:"listen_addr"`
	Exchange                 string                  `yaml:"exchange"`
	CheckIntervalSeconds     int                     `yaml:"check_interval_seconds"`
	AlertWindowStart         string                  `yaml:"alert_window_start"`
	AlertWindowMinutes       int                     `yaml:"alert_window_minutes"`
	MaxAlertsPerDay          int                     `yaml:"max_alerts_per_day"`
	MaxAlertsPerRun          int                     `yaml:"max_alerts_per_run"`
	MaxPriceStalenessSeconds int                     `yaml:"max_price_staleness_seconds"`
	AlertTitle               string                  `yaml:"alert_title"`
	Defaults                 []WatchlistTargetConfig `yaml:"defaults"`
}

type RSIWillRMonitorConfig struct {
	Enable                 bool         `yaml:"enable"`
	ListenAddr             string       `yaml:"listen_addr"`
	Exchange               string       `yaml:"exchange"`
	EvalIntervalSeconds    int          `yaml:"eval_interval_seconds"`
	RunWindowStart         string       `yaml:"run_window_start"`
	RunWindowEnd           string       `yaml:"run_window_end"`
	LookbackMinutes        int          `yaml:"lookback_minutes"`
	RSIPeriod              int          `yaml:"rsi_period"`
	WillRPeriod            int          `yaml:"willr_period"`
	RSIThreshold           float64      `yaml:"rsi_threshold"`
	WillRThreshold         float64      `yaml:"willr_threshold"`
	MaxBarStalenessSeconds int          `yaml:"max_bar_staleness_seconds"`
	AlertCooldownMinutes   int          `yaml:"alert_cooldown_minutes"`
	AutoRetireDays         int          `yaml:"auto_retire_days"`
	RetireOnHit            bool         `yaml:"retire_on_hit"`
	Alerts                 AlertsConfig `yaml:"alerts"`
}

type PortfolioConfig struct {
	Enable          bool   `yaml:"enable"`
	DefaultExchange string `yaml:"default_exchange"`
}

type Digii4FlowConfig struct {
	Enable                     bool         `yaml:"enable"`
	StartupAfter               string       `yaml:"startup_after"`
	DailyScanTime              string       `yaml:"daily_scan_time"`
	UniverseName               string       `yaml:"universe_name"`
	DailyTargetCount           int          `yaml:"daily_target_count"`
	DaysBack                   int          `yaml:"days_back"`
	MaxPercentile              float64      `yaml:"max_percentile"`
	VIXJumpThresholdPct        float64      `yaml:"vix_jump_threshold_pct"`
	NiftyLevelToken            string       `yaml:"nifty_level_token"`
	NiftyLevelStep             float64      `yaml:"nifty_level_step"`
	NiftyLevelBuffer           float64      `yaml:"nifty_level_buffer"`
	SilverExchange             string       `yaml:"silver_exchange"`
	SilverUnderlying           string       `yaml:"silver_underlying"`
	SilverLevelStep            float64      `yaml:"silver_level_step"`
	SilverLevelBuffer          float64      `yaml:"silver_level_buffer"`
	SilverJumpThresholdPct     float64      `yaml:"silver_jump_threshold_pct"`
	SilverCheckIntervalMinutes int          `yaml:"silver_check_interval_minutes"`
	SumSymbols                 []string     `yaml:"sum_symbols"`
	SumAlertThreshold          float64      `yaml:"sum_alert_threshold"`
	SumLogTarget               float64      `yaml:"sum_log_target"`
	SumCheckIntervalMinutes    int          `yaml:"sum_check_interval_minutes"`
	DailyRSIPeriod             int          `yaml:"daily_rsi_period"`
	DailyRSIMax                float64      `yaml:"daily_rsi_max"`
	DailyWillRPeriod           int          `yaml:"daily_willr_period"`
	DailyWillRMax              float64      `yaml:"daily_willr_max"`
	EntryLookbackMinutes       int          `yaml:"entry_lookback_minutes"`
	EntryRSIPeriod             int          `yaml:"entry_rsi_period"`
	EntryRSIThreshold          float64      `yaml:"entry_rsi_threshold"`
	EntryWillRPeriod           int          `yaml:"entry_willr_period"`
	EntryWillRThreshold        float64      `yaml:"entry_willr_threshold"`
	EntryBBPeriod              int          `yaml:"entry_bb_period"`
	EntryBBStdDev              float64      `yaml:"entry_bb_stddev"`
	EntryMonitorStart          string       `yaml:"entry_monitor_start"`
	EntryMonitorEnd            string       `yaml:"entry_monitor_end"`
	ManualSymbols              []string     `yaml:"manual_symbols"`
	AlertCapitals              []float64    `yaml:"alert_capitals"`
	Alerts                     AlertsConfig `yaml:"alerts"`
}

type NiftyWatcherConfig struct {
	Enable                   bool         `yaml:"enable"`
	Underlying               string       `yaml:"underlying"`
	IndexToken               string       `yaml:"index_token"`
	Step                     float64      `yaml:"step"`
	Buffer                   float64      `yaml:"buffer"`
	ExpiryRank               int          `yaml:"expiry_rank"`
	Lots                     int          `yaml:"lots"`
	LotSize                  int          `yaml:"lot_size"`
	TargetRupees             float64      `yaml:"target_rupees"`
	EntryStart               string       `yaml:"entry_start"`
	EntryEnd                 string       `yaml:"entry_end"`
	ExitTime                 string       `yaml:"exit_time"`
	RSIPeriod                int          `yaml:"rsi_period"`
	WILLRPeriod              int          `yaml:"willr_period"`
	RSILowThreshold          float64      `yaml:"rsi_low_threshold"`
	RSIHighThreshold         float64      `yaml:"rsi_high_threshold"`
	LookbackMinutes          int          `yaml:"lookback_minutes"`
	EquilibriumDiffThreshold float64      `yaml:"equilibrium_diff_threshold"`
	IncludeRSI80WillR40      bool         `yaml:"include_rsi80_willr40"`
	NormalizationStart       string       `yaml:"normalization_start"`
	SlopeGuardEnable         bool         `yaml:"slope_guard_enable"`
	SlopeGuardMinAngle       float64      `yaml:"slope_guard_min_angle"`
	Alerts                   AlertsConfig `yaml:"alerts"`
}

type WatchlistTargetConfig struct {
	Symbol      string  `yaml:"symbol"`
	DisplayName string  `yaml:"display_name"`
	Threshold   float64 `yaml:"threshold"`
	Direction   string  `yaml:"direction"`
	Active      bool    `yaml:"active"`
	Notes       string  `yaml:"notes"`
}

type SourceSLAConfig struct {
	SourceName              string `yaml:"source_name"`
	UniverseName            string `yaml:"universe_name"`
	Dataset                 string `yaml:"dataset"`
	ExpectedIntervalSeconds int    `yaml:"expected_interval_seconds"`
	MaxStalenessSeconds     int    `yaml:"max_staleness_seconds"`
	BarLateSeconds          int    `yaml:"bar_late_seconds"`
	Endpoint                string `yaml:"endpoint"`
	Priority                string `yaml:"priority"`
	Enabled                 bool   `yaml:"enabled"`
}

func Load(path string) (*Config, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}

	var cfg Config
	if err := yaml.Unmarshal(raw, &cfg); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}

	applyEnvOverrides(&cfg)
	applyDefaults(&cfg)

	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func applyDefaults(cfg *Config) {
	if cfg.Runtime.HTTPTimeoutSeconds == 0 {
		cfg.Runtime.HTTPTimeoutSeconds = 15
	}
	if cfg.Runtime.FlushSeconds == 0 {
		cfg.Runtime.FlushSeconds = 2
	}
	if cfg.Runtime.TradingStart == "" {
		cfg.Runtime.TradingStart = "09:15"
	}
	if cfg.Runtime.TradingEnd == "" {
		cfg.Runtime.TradingEnd = "15:30"
	}
	if cfg.Runtime.Timezone == "" {
		cfg.Runtime.Timezone = "Asia/Kolkata"
	}
	if cfg.Runtime.LogLevel == "" {
		cfg.Runtime.LogLevel = "info"
	}
	if cfg.Runtime.ServiceName == "" {
		cfg.Runtime.ServiceName = "smartapi-collector"
	}
	if cfg.Runtime.ServiceVersion == "" {
		cfg.Runtime.ServiceVersion = "dev"
	}
	if cfg.Postgres.Port == 0 {
		cfg.Postgres.Port = 5432
	}
	if cfg.Postgres.Schema == "" {
		cfg.Postgres.Schema = "public"
	}
	if cfg.SmartAPI.RestBaseURL == "" {
		cfg.SmartAPI.RestBaseURL = "https://apiconnect.angelone.in"
	}
	if cfg.SmartAPI.WSURL == "" {
		cfg.SmartAPI.WSURL = "wss://smartapisocket.angelone.in/smart-stream"
	}
	if !cfg.SmartAPI.DisableLiveOrders {
		cfg.SmartAPI.DisableLiveOrders = true
	}
	if cfg.Files.ConstituentsCSVPath == "" {
		cfg.Files.ConstituentsCSVPath = cfg.Files.SymbolsCSVPath
	}
	if cfg.WS.MaxReconnectBackoffSeconds == 0 {
		cfg.WS.MaxReconnectBackoffSeconds = 30
	}
	if cfg.WS.MaxConnections == 0 {
		cfg.WS.MaxConnections = 3
	}
	if cfg.WS.MaxTokensPerConnection == 0 {
		cfg.WS.MaxTokensPerConnection = 1000
	}
	if cfg.WS.DepthSnapshotIntervalSeconds == 0 {
		cfg.WS.DepthSnapshotIntervalSeconds = 5
	}
	if len(cfg.WS.DepthSnapshotKinds) == 0 {
		cfg.WS.DepthSnapshotKinds = []string{"EQUITY", "INDEX"}
	}
	if cfg.WS.ModeFutures == "" {
		cfg.WS.ModeFutures = "LTP"
	}
	if cfg.WS.ModeOptions == "" {
		cfg.WS.ModeOptions = "QUOTE"
	}
	if cfg.Universe.DerivativesExchange == "" {
		cfg.Universe.DerivativesExchange = "NFO"
	}
	if !cfg.Universe.FNOCurrentMonthOnly {
		cfg.Universe.FNOCurrentMonthOnly = true
	}
	if cfg.Universe.Options.StockUnderlyingsMax == 0 {
		cfg.Universe.Options.StockUnderlyingsMax = 15
	}
	if cfg.Universe.Options.StrikesEachSide == 0 {
		cfg.Universe.Options.StrikesEachSide = 10
	}
	if cfg.Universe.Options.StrikeRefreshMinutes == 0 {
		cfg.Universe.Options.StrikeRefreshMinutes = 5
	}
	if cfg.Universe.Options.ATMShiftRebuildSteps == 0 {
		cfg.Universe.Options.ATMShiftRebuildSteps = 2
	}
	if cfg.RestTasks.QuoteSnapshotIntervalSeconds == 0 {
		cfg.RestTasks.QuoteSnapshotIntervalSeconds = 60
	}
	if len(cfg.RestTasks.QuoteSnapshotPrimaryKinds) == 0 {
		cfg.RestTasks.QuoteSnapshotPrimaryKinds = []string{"EQUITY", "INDEX"}
	}
	if len(cfg.RestTasks.QuoteSnapshotPrimaryIndices) == 0 && len(cfg.Universe.IncludeIndices) > 0 {
		cfg.RestTasks.QuoteSnapshotPrimaryIndices = append([]string{}, cfg.Universe.IncludeIndices...)
	}
	if cfg.RestTasks.OptionQuoteSnapshotIntervalSeconds == 0 {
		cfg.RestTasks.OptionQuoteSnapshotIntervalSeconds = 600
	}
	if cfg.RestTasks.OptionGreeksIntervalSeconds == 0 {
		cfg.RestTasks.OptionGreeksIntervalSeconds = 60
	}
	if cfg.RestTasks.OISnapshotIntervalSeconds == 0 {
		cfg.RestTasks.OISnapshotIntervalSeconds = 60
	}
	if cfg.RestTasks.PCRSnapshotIntervalSeconds == 0 {
		cfg.RestTasks.PCRSnapshotIntervalSeconds = 300
	}
	if cfg.RestTasks.GainersLosersIntervalSeconds == 0 {
		cfg.RestTasks.GainersLosersIntervalSeconds = 300
	}
	if cfg.RestTasks.OIBuildupIntervalSeconds == 0 {
		cfg.RestTasks.OIBuildupIntervalSeconds = 300
	}
	if cfg.RestTasks.PutCallRatioIntervalSeconds == 0 {
		cfg.RestTasks.PutCallRatioIntervalSeconds = 300
	}
	if cfg.RestTasks.RestFallbackIntervalSeconds == 0 {
		cfg.RestTasks.RestFallbackIntervalSeconds = 60
	}
	if cfg.RestTasks.RestFallbackStaleSeconds == 0 {
		cfg.RestTasks.RestFallbackStaleSeconds = 90
	}
	if cfg.RestTasks.RestFallbackLookbackMinutes == 0 {
		cfg.RestTasks.RestFallbackLookbackMinutes = 2
	}
	if cfg.History.DailyYears == 0 {
		cfg.History.DailyYears = 3
	}
	if cfg.History.DailyChunkDays == 0 {
		cfg.History.DailyChunkDays = 365
	}
	if cfg.History.DailyRunTimeIST == "" {
		cfg.History.DailyRunTimeIST = "18:00"
	}
	if cfg.Limits.QuoteRPS == 0 {
		cfg.Limits.QuoteRPS = 1
	}
	if cfg.Limits.QuotePerMinuteCap == 0 {
		cfg.Limits.QuotePerMinuteCap = 500
	}
	if cfg.Limits.QuotePerHourCap == 0 {
		cfg.Limits.QuotePerHourCap = 5000
	}
	if cfg.Limits.QuoteMaxSymbolsPerRequest == 0 {
		cfg.Limits.QuoteMaxSymbolsPerRequest = 50
	}
	if cfg.Limits.CandlesRPS == 0 {
		cfg.Limits.CandlesRPS = 3
	}
	if cfg.Limits.CandlesPerHourCap == 0 {
		cfg.Limits.CandlesPerHourCap = 5000
	}
	if cfg.Limits.GreeksRPS == 0 {
		cfg.Limits.GreeksRPS = 1
	}
	if cfg.Limits.AggregatesRPS == 0 {
		cfg.Limits.AggregatesRPS = 1
	}
	if cfg.Limits.AggregatesPerMinuteCap == 0 {
		cfg.Limits.AggregatesPerMinuteCap = 60
	}
	if cfg.Limits.AggregatesPerHourCap == 0 {
		cfg.Limits.AggregatesPerHourCap = 1000
	}
	if cfg.Limits.AdaptiveMinRPS == 0 {
		cfg.Limits.AdaptiveMinRPS = 1
	}
	if cfg.Limits.AdaptiveStepUpAfterSeconds == 0 {
		cfg.Limits.AdaptiveStepUpAfterSeconds = 5
	}
	if cfg.Retention.Enable && !cfg.Retention.EnableCleanup {
		cfg.Retention.EnableCleanup = true
	}
	if cfg.Retention.IntradayDays == 0 {
		cfg.Retention.IntradayDays = 90
	}
	if cfg.Retention.Bars1mDays == 0 {
		cfg.Retention.Bars1mDays = cfg.Retention.IntradayDays
	}
	if cfg.Retention.QuoteSnapshotsDays == 0 {
		cfg.Retention.QuoteSnapshotsDays = cfg.Retention.IntradayDays
	}
	if cfg.Retention.OptionGreeksDays == 0 {
		cfg.Retention.OptionGreeksDays = cfg.Retention.IntradayDays
	}
	if cfg.Retention.CleanupRunTimeIST == "" {
		cfg.Retention.CleanupRunTimeIST = "18:30"
	}
	if cfg.Watchlist.ListenAddr == "" {
		cfg.Watchlist.ListenAddr = "0.0.0.0:8090"
	}
	if cfg.Watchlist.Exchange == "" {
		cfg.Watchlist.Exchange = "NSE"
	}
	if cfg.Watchlist.CheckIntervalSeconds == 0 {
		cfg.Watchlist.CheckIntervalSeconds = 30
	}
	if cfg.Watchlist.AlertWindowStart == "" {
		cfg.Watchlist.AlertWindowStart = "09:30"
	}
	if cfg.Watchlist.AlertWindowMinutes == 0 {
		cfg.Watchlist.AlertWindowMinutes = 10
	}
	if cfg.Watchlist.MaxAlertsPerDay == 0 {
		cfg.Watchlist.MaxAlertsPerDay = 2
	}
	if cfg.Watchlist.MaxAlertsPerRun == 0 {
		cfg.Watchlist.MaxAlertsPerRun = 2
	}
	if cfg.Watchlist.MaxPriceStalenessSeconds == 0 {
		cfg.Watchlist.MaxPriceStalenessSeconds = 120
	}
	if cfg.RSIWillRMonitor.ListenAddr == "" {
		cfg.RSIWillRMonitor.ListenAddr = "0.0.0.0:8091"
	}
	if cfg.RSIWillRMonitor.Exchange == "" {
		if strings.TrimSpace(cfg.Universe.EquitiesExchange) != "" {
			cfg.RSIWillRMonitor.Exchange = strings.TrimSpace(cfg.Universe.EquitiesExchange)
		} else {
			cfg.RSIWillRMonitor.Exchange = "NSE"
		}
	}
	if cfg.RSIWillRMonitor.EvalIntervalSeconds == 0 {
		cfg.RSIWillRMonitor.EvalIntervalSeconds = 60
	}
	if cfg.RSIWillRMonitor.RunWindowStart == "" {
		cfg.RSIWillRMonitor.RunWindowStart = "09:30"
	}
	if cfg.RSIWillRMonitor.RunWindowEnd == "" {
		cfg.RSIWillRMonitor.RunWindowEnd = "13:00"
	}
	if cfg.RSIWillRMonitor.LookbackMinutes == 0 {
		cfg.RSIWillRMonitor.LookbackMinutes = 180
	}
	if cfg.RSIWillRMonitor.RSIPeriod == 0 {
		cfg.RSIWillRMonitor.RSIPeriod = 14
	}
	if cfg.RSIWillRMonitor.WillRPeriod == 0 {
		cfg.RSIWillRMonitor.WillRPeriod = 14
	}
	if cfg.RSIWillRMonitor.RSIThreshold == 0 {
		cfg.RSIWillRMonitor.RSIThreshold = 30
	}
	if cfg.RSIWillRMonitor.WillRThreshold == 0 {
		cfg.RSIWillRMonitor.WillRThreshold = -80
	}
	if cfg.RSIWillRMonitor.MaxBarStalenessSeconds == 0 {
		cfg.RSIWillRMonitor.MaxBarStalenessSeconds = 180
	}
	if cfg.RSIWillRMonitor.AlertCooldownMinutes == 0 {
		cfg.RSIWillRMonitor.AlertCooldownMinutes = 60
	}
	if cfg.RSIWillRMonitor.AutoRetireDays == 0 {
		cfg.RSIWillRMonitor.AutoRetireDays = 5
	}
	if !cfg.RSIWillRMonitor.RetireOnHit {
		cfg.RSIWillRMonitor.RetireOnHit = true
	}
	if cfg.RSIWillRMonitor.Alerts.WebhookURL == "" {
		cfg.RSIWillRMonitor.Alerts.WebhookURL = cfg.Alerts.WebhookURL
	}
	if cfg.RSIWillRMonitor.Alerts.DiscordWebhookURL == "" {
		cfg.RSIWillRMonitor.Alerts.DiscordWebhookURL = cfg.Alerts.DiscordWebhookURL
	}
	if cfg.RSIWillRMonitor.Alerts.TelegramBotToken == "" {
		cfg.RSIWillRMonitor.Alerts.TelegramBotToken = cfg.Alerts.TelegramBotToken
	}
	if cfg.RSIWillRMonitor.Alerts.TelegramChatID == "" {
		cfg.RSIWillRMonitor.Alerts.TelegramChatID = cfg.Alerts.TelegramChatID
	}
	if cfg.RSIWillRMonitor.Alerts.TelegramParseMode == "" {
		cfg.RSIWillRMonitor.Alerts.TelegramParseMode = cfg.Alerts.TelegramParseMode
	}
	if !cfg.RSIWillRMonitor.Alerts.TelegramEnable {
		cfg.RSIWillRMonitor.Alerts.TelegramEnable = cfg.Alerts.TelegramEnable
	}
	if !cfg.RSIWillRMonitor.Alerts.IncludeDetails {
		cfg.RSIWillRMonitor.Alerts.IncludeDetails = cfg.Alerts.IncludeDetails
	}
	if !cfg.RSIWillRMonitor.Alerts.IncludeTargets {
		cfg.RSIWillRMonitor.Alerts.IncludeTargets = cfg.Alerts.IncludeTargets
	}
	if cfg.RSIWillRMonitor.Alerts.WebhookTimeoutSeconds == 0 {
		cfg.RSIWillRMonitor.Alerts.WebhookTimeoutSeconds = cfg.Alerts.WebhookTimeoutSeconds
	}
	// Only inherit headers when not specified. An explicit empty map (`{}` in YAML)
	// should mean "no headers".
	if cfg.RSIWillRMonitor.Alerts.WebhookHeaders == nil {
		cfg.RSIWillRMonitor.Alerts.WebhookHeaders = cfg.Alerts.WebhookHeaders
	}
	if !cfg.RSIWillRMonitor.Alerts.EnableWebhook {
		cfg.RSIWillRMonitor.Alerts.EnableWebhook = cfg.Alerts.EnableWebhook
	}
	if cfg.RSIWillRMonitor.Alerts.TitlePrefix == "" {
		cfg.RSIWillRMonitor.Alerts.TitlePrefix = "rsi_willr"
	}
	if cfg.RSIWillRMonitor.Alerts.MaxPerRun == 0 {
		cfg.RSIWillRMonitor.Alerts.MaxPerRun = 5
	}
	if !cfg.Portfolio.Enable {
		cfg.Portfolio.Enable = true
	}
	if cfg.Portfolio.DefaultExchange == "" {
		cfg.Portfolio.DefaultExchange = cfg.Watchlist.Exchange
	}
	if cfg.Digii4Flow.StartupAfter == "" {
		cfg.Digii4Flow.StartupAfter = "09:15"
	}
	if cfg.Digii4Flow.DailyScanTime == "" {
		cfg.Digii4Flow.DailyScanTime = "09:22"
	}
	if cfg.Digii4Flow.UniverseName == "" {
		cfg.Digii4Flow.UniverseName = "nifty100_equity"
	}
	if cfg.Digii4Flow.DailyTargetCount == 0 {
		cfg.Digii4Flow.DailyTargetCount = 10
	}
	if cfg.Digii4Flow.DaysBack == 0 {
		cfg.Digii4Flow.DaysBack = 365
	}
	if cfg.Digii4Flow.MaxPercentile == 0 {
		cfg.Digii4Flow.MaxPercentile = 60
	}
	if cfg.Digii4Flow.VIXJumpThresholdPct == 0 {
		cfg.Digii4Flow.VIXJumpThresholdPct = 2
	}
	if cfg.Digii4Flow.NiftyLevelToken == "" {
		cfg.Digii4Flow.NiftyLevelToken = "99926000"
	}
	if cfg.Digii4Flow.NiftyLevelStep == 0 {
		cfg.Digii4Flow.NiftyLevelStep = 100
	}
	if cfg.Digii4Flow.NiftyLevelBuffer == 0 {
		cfg.Digii4Flow.NiftyLevelBuffer = 3
	}
	if cfg.Digii4Flow.SilverExchange == "" {
		cfg.Digii4Flow.SilverExchange = "MCX"
	}
	if cfg.Digii4Flow.SilverUnderlying == "" {
		cfg.Digii4Flow.SilverUnderlying = "SILVER"
	}
	if cfg.Digii4Flow.SilverLevelStep == 0 {
		cfg.Digii4Flow.SilverLevelStep = 100000
	}
	if cfg.Digii4Flow.SilverLevelBuffer == 0 {
		cfg.Digii4Flow.SilverLevelBuffer = 50000
	}
	if cfg.Digii4Flow.SilverJumpThresholdPct == 0 {
		cfg.Digii4Flow.SilverJumpThresholdPct = 10
	}
	if cfg.Digii4Flow.SilverCheckIntervalMinutes == 0 {
		cfg.Digii4Flow.SilverCheckIntervalMinutes = 60
	}
	if len(cfg.Digii4Flow.SumSymbols) == 0 {
		cfg.Digii4Flow.SumSymbols = []string{"TMCV", "TMPV"}
	}
	if cfg.Digii4Flow.SumAlertThreshold == 0 {
		cfg.Digii4Flow.SumAlertThreshold = 900
	}
	if cfg.Digii4Flow.SumLogTarget == 0 {
		cfg.Digii4Flow.SumLogTarget = 910
	}
	if cfg.Digii4Flow.SumCheckIntervalMinutes == 0 {
		cfg.Digii4Flow.SumCheckIntervalMinutes = 60
	}
	if cfg.Digii4Flow.DailyRSIPeriod == 0 {
		cfg.Digii4Flow.DailyRSIPeriod = 14
	}
	if cfg.Digii4Flow.DailyRSIMax == 0 {
		cfg.Digii4Flow.DailyRSIMax = 50
	}
	if cfg.Digii4Flow.DailyWillRPeriod == 0 {
		cfg.Digii4Flow.DailyWillRPeriod = 14
	}
	if cfg.Digii4Flow.DailyWillRMax == 0 {
		cfg.Digii4Flow.DailyWillRMax = -60
	}
	if cfg.Digii4Flow.EntryLookbackMinutes == 0 {
		cfg.Digii4Flow.EntryLookbackMinutes = 180
	}
	if cfg.Digii4Flow.EntryRSIPeriod == 0 {
		cfg.Digii4Flow.EntryRSIPeriod = 14
	}
	if cfg.Digii4Flow.EntryRSIThreshold == 0 {
		cfg.Digii4Flow.EntryRSIThreshold = 25
	}
	if cfg.Digii4Flow.EntryWillRPeriod == 0 {
		cfg.Digii4Flow.EntryWillRPeriod = 14
	}
	if cfg.Digii4Flow.EntryWillRThreshold == 0 {
		cfg.Digii4Flow.EntryWillRThreshold = -80
	}
	if cfg.Digii4Flow.EntryBBPeriod == 0 {
		cfg.Digii4Flow.EntryBBPeriod = 20
	}
	if cfg.Digii4Flow.EntryBBStdDev == 0 {
		cfg.Digii4Flow.EntryBBStdDev = 2
	}
	if cfg.Digii4Flow.EntryMonitorStart == "" {
		cfg.Digii4Flow.EntryMonitorStart = "09:30"
	}
	if cfg.Digii4Flow.EntryMonitorEnd == "" {
		cfg.Digii4Flow.EntryMonitorEnd = "12:30"
	}
	if len(cfg.Digii4Flow.AlertCapitals) == 0 {
		cfg.Digii4Flow.AlertCapitals = []float64{100000, 200000, 500000}
	}
	if cfg.Digii4Flow.Alerts.DiscordWebhookURL == "" {
		cfg.Digii4Flow.Alerts.DiscordWebhookURL = cfg.Alerts.DiscordWebhookURL
	}
	if cfg.Digii4Flow.Alerts.TelegramBotToken == "" {
		cfg.Digii4Flow.Alerts.TelegramBotToken = cfg.Alerts.TelegramBotToken
	}
	if cfg.Digii4Flow.Alerts.TelegramChatID == "" {
		cfg.Digii4Flow.Alerts.TelegramChatID = cfg.Alerts.TelegramChatID
	}
	if cfg.Digii4Flow.Alerts.TelegramParseMode == "" {
		cfg.Digii4Flow.Alerts.TelegramParseMode = cfg.Alerts.TelegramParseMode
	}
	if !cfg.Digii4Flow.Alerts.TelegramEnable {
		cfg.Digii4Flow.Alerts.TelegramEnable = cfg.Alerts.TelegramEnable
	}
	if !cfg.Digii4Flow.Alerts.IncludeDetails {
		cfg.Digii4Flow.Alerts.IncludeDetails = cfg.Alerts.IncludeDetails
	}
	if !cfg.Digii4Flow.Alerts.IncludeTargets {
		cfg.Digii4Flow.Alerts.IncludeTargets = cfg.Alerts.IncludeTargets
	}
	if cfg.Digii4Flow.Alerts.TitlePrefix == "" {
		cfg.Digii4Flow.Alerts.TitlePrefix = "stock"
	}
	if cfg.Digii4Flow.Alerts.WebhookTimeoutSeconds == 0 {
		cfg.Digii4Flow.Alerts.WebhookTimeoutSeconds = 5
	}
	if cfg.Digii4Flow.Alerts.WebhookHeaders == nil {
		cfg.Digii4Flow.Alerts.WebhookHeaders = cfg.Alerts.WebhookHeaders
	}
	if !cfg.Digii4Flow.Alerts.EnableWebhook {
		cfg.Digii4Flow.Alerts.EnableWebhook = cfg.Alerts.EnableWebhook
	}
	if cfg.Digii4Flow.Alerts.MaxPerRun == 0 {
		cfg.Digii4Flow.Alerts.MaxPerRun = cfg.Alerts.MaxPerRun
	}
	if cfg.Digii4Flow.Alerts.MaxPerRun == 0 {
		cfg.Digii4Flow.Alerts.MaxPerRun = 5
	}

	if cfg.NiftyWatcher.Underlying == "" {
		cfg.NiftyWatcher.Underlying = "NIFTY50"
	}
	if cfg.NiftyWatcher.IndexToken == "" {
		cfg.NiftyWatcher.IndexToken = "99926000"
	}
	if cfg.NiftyWatcher.Step == 0 {
		cfg.NiftyWatcher.Step = 100
	}
	if cfg.NiftyWatcher.Buffer == 0 {
		cfg.NiftyWatcher.Buffer = 4
	}
	if cfg.NiftyWatcher.Lots == 0 {
		cfg.NiftyWatcher.Lots = 1
	}
	if cfg.NiftyWatcher.LotSize == 0 {
		cfg.NiftyWatcher.LotSize = 65
	}
	if cfg.NiftyWatcher.TargetRupees == 0 {
		cfg.NiftyWatcher.TargetRupees = 350
	}
	if cfg.NiftyWatcher.EntryStart == "" {
		cfg.NiftyWatcher.EntryStart = "10:00"
	}
	if cfg.NiftyWatcher.EntryEnd == "" {
		cfg.NiftyWatcher.EntryEnd = "12:00"
	}
	if cfg.NiftyWatcher.ExitTime == "" {
		cfg.NiftyWatcher.ExitTime = "15:30"
	}
	if cfg.NiftyWatcher.RSIPeriod == 0 {
		cfg.NiftyWatcher.RSIPeriod = 14
	}
	if cfg.NiftyWatcher.WILLRPeriod == 0 {
		cfg.NiftyWatcher.WILLRPeriod = 14
	}
	if cfg.NiftyWatcher.LookbackMinutes == 0 {
		cfg.NiftyWatcher.LookbackMinutes = 180
	}
	if cfg.NiftyWatcher.RSILowThreshold == 0 {
		cfg.NiftyWatcher.RSILowThreshold = 30
	}
	if cfg.NiftyWatcher.RSIHighThreshold == 0 {
		cfg.NiftyWatcher.RSIHighThreshold = 70
	}
	if cfg.NiftyWatcher.EquilibriumDiffThreshold == 0 {
		cfg.NiftyWatcher.EquilibriumDiffThreshold = 60
	}
	if cfg.NiftyWatcher.NormalizationStart == "" {
		cfg.NiftyWatcher.NormalizationStart = "09:15"
	}
	if cfg.NiftyWatcher.SlopeGuardMinAngle == 0 {
		cfg.NiftyWatcher.SlopeGuardMinAngle = 45
	}
	if !cfg.NiftyWatcher.IncludeRSI80WillR40 {
		cfg.NiftyWatcher.IncludeRSI80WillR40 = true
	}
	if !cfg.NiftyWatcher.SlopeGuardEnable {
		cfg.NiftyWatcher.SlopeGuardEnable = true
	}
	if cfg.NiftyWatcher.Alerts.TitlePrefix == "" {
		cfg.NiftyWatcher.Alerts.TitlePrefix = "niftywatch"
	}
	if cfg.NiftyWatcher.Alerts.WebhookTimeoutSeconds == 0 {
		cfg.NiftyWatcher.Alerts.WebhookTimeoutSeconds = 5
	}
	for i := range cfg.Strategy.ManualStraddles {
		entry := &cfg.Strategy.ManualStraddles[i]
		if entry.Exchange == "" {
			entry.Exchange = "NFO"
		}
		if !entry.Enabled {
			entry.Enabled = true
		}
		if entry.QuantityLots <= 0 {
			entry.QuantityLots = 1
		}
		if entry.TargetProfitRupees < 0 {
			entry.TargetProfitRupees = 0
		}
		if entry.TPPercent == 0 {
			entry.TPPercent = 0.2
		}
		if entry.SLPercent == 0 {
			entry.SLPercent = 0.12
		}
		if entry.TrailPercent == 0 {
			entry.TrailPercent = 0.1
		}
	}
	if cfg.Postgres.ConnectTimeoutSeconds == 0 {
		cfg.Postgres.ConnectTimeoutSeconds = 10
	}
	if cfg.Postgres.MaxConns == 0 {
		cfg.Postgres.MaxConns = 10
	}
	if cfg.Postgres.MinConns == 0 {
		cfg.Postgres.MinConns = 2
	}
	if cfg.Postgres.MaxConnIdleSeconds == 0 {
		cfg.Postgres.MaxConnIdleSeconds = 10
	}
	if cfg.Postgres.HealthCheckSeconds == 0 {
		cfg.Postgres.HealthCheckSeconds = 15
	}
	if cfg.Postgres.MaxConnLifetimeMinutes == 0 {
		cfg.Postgres.MaxConnLifetimeMinutes = 30
	}
	if cfg.Postgres.SlowQueryMilliseconds == 0 {
		cfg.Postgres.SlowQueryMilliseconds = 250
	}
	if len(cfg.Metrics.SLA) == 0 {
		cfg.Metrics.SLA = []SourceSLAConfig{
			{
				SourceName:              "equity_ticks",
				UniverseName:            "nifty100_equity",
				Dataset:                 "instrument_state",
				ExpectedIntervalSeconds: 4,
				MaxStalenessSeconds:     15,
				Priority:                "P0",
				Enabled:                 true,
			},
			{
				SourceName:              "equity_bars_1m",
				UniverseName:            "nifty100_equity",
				Dataset:                 "bars_1m",
				ExpectedIntervalSeconds: 60,
				MaxStalenessSeconds:     120,
				BarLateSeconds:          120,
				Priority:                "P0",
				Enabled:                 true,
			},
			{
				SourceName:              "indices_ticks",
				UniverseName:            "indices",
				Dataset:                 "instrument_state",
				ExpectedIntervalSeconds: 1,
				MaxStalenessSeconds:     5,
				Priority:                "P0",
				Enabled:                 true,
			},
			{
				SourceName:              "futures_stock_ticks",
				UniverseName:            "futures_stock",
				Dataset:                 "instrument_state",
				ExpectedIntervalSeconds: 60,
				MaxStalenessSeconds:     180,
				Priority:                "P1",
				Enabled:                 true,
			},
			{
				SourceName:              "futures_index_ticks",
				UniverseName:            "futures_index",
				Dataset:                 "instrument_state",
				ExpectedIntervalSeconds: 60,
				MaxStalenessSeconds:     180,
				Priority:                "P1",
				Enabled:                 true,
			},
			{
				SourceName:              "options_index_nifty_ticks",
				UniverseName:            "options_index_nifty50",
				Dataset:                 "instrument_state",
				ExpectedIntervalSeconds: 5,
				MaxStalenessSeconds:     10,
				Priority:                "P1",
				Enabled:                 true,
			},
			{
				SourceName:              "options_index_banknifty_ticks",
				UniverseName:            "options_index_banknifty",
				Dataset:                 "instrument_state",
				ExpectedIntervalSeconds: 5,
				MaxStalenessSeconds:     10,
				Priority:                "P1",
				Enabled:                 true,
			},
			{
				SourceName:              "options_stock_ticks",
				UniverseName:            "options_stock",
				Dataset:                 "instrument_state",
				ExpectedIntervalSeconds: 60,
				MaxStalenessSeconds:     180,
				Priority:                "P1",
				Enabled:                 true,
			},
			{
				SourceName:              "gainers_losers",
				UniverseName:            "aggregate",
				Dataset:                 "gainers_losers",
				ExpectedIntervalSeconds: 300,
				MaxStalenessSeconds:     600,
				Endpoint:                "aggregates",
				Priority:                "P2",
				Enabled:                 true,
			},
			{
				SourceName:              "oi_buildup",
				UniverseName:            "aggregate",
				Dataset:                 "oibuildup",
				ExpectedIntervalSeconds: 300,
				MaxStalenessSeconds:     600,
				Endpoint:                "aggregates",
				Priority:                "P2",
				Enabled:                 true,
			},
			{
				SourceName:              "put_call_ratio",
				UniverseName:            "aggregate",
				Dataset:                 "putcallratio",
				ExpectedIntervalSeconds: 300,
				MaxStalenessSeconds:     600,
				Endpoint:                "aggregates",
				Priority:                "P2",
				Enabled:                 true,
			},
			{
				SourceName:              "option_greeks",
				UniverseName:            "aggregate",
				Dataset:                 "option_greeks",
				ExpectedIntervalSeconds: 60,
				MaxStalenessSeconds:     180,
				Endpoint:                "greeks",
				Priority:                "P2",
				Enabled:                 true,
			},
		}
	}
	if cfg.Metrics.RollupIntervalSeconds == 0 {
		cfg.Metrics.RollupIntervalSeconds = 60
	}
	if cfg.Metrics.StateFlushSeconds == 0 {
		cfg.Metrics.StateFlushSeconds = 5
	}
	if !cfg.Metrics.Enable && len(cfg.Metrics.SLA) > 0 {
		cfg.Metrics.Enable = true
	}
	if !cfg.Metrics.EnableAPIRequestLog {
		cfg.Metrics.EnableAPIRequestLog = true
	}
	if cfg.Strategy.RunIntervalSeconds == 0 {
		cfg.Strategy.RunIntervalSeconds = 30
	}
	if cfg.Strategy.MaxSymbols == 0 {
		cfg.Strategy.MaxSymbols = 25
	}
	if cfg.Strategy.MinDailyVolume == 0 {
		cfg.Strategy.MinDailyVolume = 1000000
	}
	if cfg.Strategy.EMAFast == 0 {
		cfg.Strategy.EMAFast = 20
	}
	if cfg.Strategy.EMASlow == 0 {
		cfg.Strategy.EMASlow = 50
	}
	if cfg.Strategy.RSIPeriod == 0 {
		cfg.Strategy.RSIPeriod = 14
	}
	if cfg.Strategy.RSISetupMin == 0 {
		cfg.Strategy.RSISetupMin = 45
	}
	if cfg.Strategy.RSISetupMax == 0 {
		cfg.Strategy.RSISetupMax = 60
	}
	if cfg.Strategy.RSITrigger == 0 {
		cfg.Strategy.RSITrigger = 50
	}
	if cfg.Strategy.VWAPDistancePct == 0 {
		cfg.Strategy.VWAPDistancePct = 0.3
	}
	if cfg.Strategy.PullbackPct == 0 {
		cfg.Strategy.PullbackPct = 0.5
	}
	if cfg.Strategy.VolumeSpikeMultiplier == 0 {
		cfg.Strategy.VolumeSpikeMultiplier = 1.5
	}
	if cfg.Strategy.ATRPeriod == 0 {
		cfg.Strategy.ATRPeriod = 14
	}
	if cfg.Strategy.StopATRMultiplier == 0 {
		cfg.Strategy.StopATRMultiplier = 1.2
	}
	if cfg.Strategy.TargetATRMultiplier == 0 {
		cfg.Strategy.TargetATRMultiplier = 2.4
	}
	if cfg.Strategy.CooldownMinutes == 0 {
		cfg.Strategy.CooldownMinutes = 15
	}
	if cfg.Strategy.LookbackMinutes == 0 {
		cfg.Strategy.LookbackMinutes = 180
	}
	if cfg.Strategy.MaxSignalsPerRun == 0 {
		cfg.Strategy.MaxSignalsPerRun = 20
	}
	if cfg.Strategy.MinConfidence == 0 {
		cfg.Strategy.MinConfidence = 0.6
	}
	if cfg.Strategy.IndexToken == "" {
		if token := cfg.Universe.IndexTokens["NIFTY50"]; token != "" {
			cfg.Strategy.IndexToken = token
		}
	}
	if cfg.Strategy.VIXToken == "" {
		cfg.Strategy.VIXToken = "99926017"
	}
	if cfg.Strategy.NiftyLevelStraddleUnderlying == "" {
		cfg.Strategy.NiftyLevelStraddleUnderlying = "NIFTY50"
	}
	if cfg.Strategy.NiftyLevelStraddleToken == "" {
		if token := cfg.Universe.IndexTokens["NIFTY50"]; token != "" {
			cfg.Strategy.NiftyLevelStraddleToken = token
		} else {
			cfg.Strategy.NiftyLevelStraddleToken = "99926000"
		}
	}
	if cfg.Strategy.NiftyLevelStraddleStep == 0 {
		cfg.Strategy.NiftyLevelStraddleStep = 100
	}
	if cfg.Strategy.NiftyLevelStraddleBuffer == 0 {
		cfg.Strategy.NiftyLevelStraddleBuffer = 2
	}
	if cfg.Strategy.NiftyLevelStraddleLots == 0 {
		cfg.Strategy.NiftyLevelStraddleLots = 1
	}
	if cfg.Strategy.NiftyLevelStraddleLotSize == 0 {
		cfg.Strategy.NiftyLevelStraddleLotSize = 65
	}
	if cfg.Strategy.NiftyLevelStraddleTargetRupees == 0 {
		cfg.Strategy.NiftyLevelStraddleTargetRupees = 500
	}
	if cfg.Strategy.NiftyLevelStraddleStopRupees == 0 {
		cfg.Strategy.NiftyLevelStraddleStopRupees = -2000
	}
	if cfg.Strategy.NiftyLevelStraddleExitTime == "" {
		cfg.Strategy.NiftyLevelStraddleExitTime = "15:30"
	}
	if !cfg.Strategy.NiftyLevelStraddleEquilibriumOn {
		cfg.Strategy.NiftyLevelStraddleEquilibriumOn = true
	}
	if cfg.Strategy.NiftyLevelStraddleEquilibriumDiffMax == 0 {
		cfg.Strategy.NiftyLevelStraddleEquilibriumDiffMax = 5
	}
	if cfg.Strategy.NiftyLevelStraddleEquilibriumMaxAgeMinutes == 0 {
		cfg.Strategy.NiftyLevelStraddleEquilibriumMaxAgeMinutes = 5
	}
	if cfg.Paper.CapitalPerTrade == 0 {
		cfg.Paper.CapitalPerTrade = 100000
	}
	if cfg.Paper.MaxOpenPositions == 0 {
		cfg.Paper.MaxOpenPositions = 10
	}
	if cfg.Paper.SlippageBps == 0 {
		cfg.Paper.SlippageBps = 2
	}
	if cfg.Paper.BrokeragePerTrade == 0 {
		cfg.Paper.BrokeragePerTrade = 20
	}
	if cfg.Backtest.UniverseName == "" {
		cfg.Backtest.UniverseName = "nifty100_equity"
	}
	if cfg.Backtest.DailyRunTimeIST == "" {
		cfg.Backtest.DailyRunTimeIST = "16:00"
	}
	if cfg.Backtest.LiveIntervalSeconds == 0 {
		cfg.Backtest.LiveIntervalSeconds = 60
	}
	if cfg.Backtest.LiveWindowMinutes == 0 {
		cfg.Backtest.LiveWindowMinutes = 5
	}
	if cfg.Backtest.LiveMaxSignalsPerRun == 0 {
		cfg.Backtest.LiveMaxSignalsPerRun = 5
	}
	if cfg.Backtest.LiveMaxAlertsPerDay == 0 {
		cfg.Backtest.LiveMaxAlertsPerDay = 2
	}
	if cfg.Backtest.DaysBack == 0 {
		cfg.Backtest.DaysBack = 365
	}
	if cfg.Backtest.MaxPercentile == 0 {
		cfg.Backtest.MaxPercentile = 60
	}
	if cfg.Backtest.RSIPeriod == 0 {
		cfg.Backtest.RSIPeriod = 14
	}
	if cfg.Backtest.WILLRPeriod == 0 {
		cfg.Backtest.WILLRPeriod = 14
	}
	if cfg.Backtest.RSIThreshold == 0 {
		cfg.Backtest.RSIThreshold = 30
	}
	if cfg.Backtest.WILLRThreshold == 0 {
		cfg.Backtest.WILLRThreshold = -80
	}
	if cfg.Backtest.DailyEMAFast == 0 {
		cfg.Backtest.DailyEMAFast = 20
	}
	if cfg.Backtest.DailyEMASlow == 0 {
		cfg.Backtest.DailyEMASlow = 50
	}
	if cfg.Backtest.BollingerPeriod == 0 {
		cfg.Backtest.BollingerPeriod = 20
	}
	if cfg.Backtest.BollingerStdDev == 0 {
		cfg.Backtest.BollingerStdDev = 2
	}
	if cfg.Backtest.VolumeSpikeMinRatio == 0 {
		cfg.Backtest.VolumeSpikeMinRatio = 1.5
	}
	if cfg.Backtest.CloseLookback == 0 {
		cfg.Backtest.CloseLookback = 3
	}
	if cfg.Backtest.VolumeLookback == 0 {
		cfg.Backtest.VolumeLookback = 10
	}
	if cfg.Backtest.VolumeMedianMaxRatio == 0 {
		cfg.Backtest.VolumeMedianMaxRatio = 1
	}
	if cfg.Backtest.StartOffsetMinutes == 0 {
		cfg.Backtest.StartOffsetMinutes = 30
	}
	if cfg.Backtest.EquityEntryStart == "" {
		cfg.Backtest.EquityEntryStart = "09:30"
	}
	if cfg.Backtest.EquityEntryEnd == "" {
		cfg.Backtest.EquityEntryEnd = "12:30"
	}
	if cfg.Backtest.EquitySelectionRSIMax == 0 {
		cfg.Backtest.EquitySelectionRSIMax = 50
	}
	if cfg.Backtest.EquitySelectionWillRMax == 0 {
		cfg.Backtest.EquitySelectionWillRMax = -60
	}
	if cfg.Backtest.EquityEntryRSIThreshold == 0 {
		cfg.Backtest.EquityEntryRSIThreshold = 25
	}
	if cfg.Backtest.EquityEntryWillRThresh == 0 {
		cfg.Backtest.EquityEntryWillRThresh = -80
	}
	if cfg.Backtest.EquityIntradayTargetNet == 0 {
		cfg.Backtest.EquityIntradayTargetNet = 1000
	}
	if cfg.Backtest.EquityDeliveryTargetNet == 0 {
		cfg.Backtest.EquityDeliveryTargetNet = 1500
	}
	if len(cfg.Backtest.EquityCapitalScenarios) == 0 {
		cfg.Backtest.EquityCapitalScenarios = []float64{200000, 500000, 1000000}
	}
	if len(cfg.Backtest.EquityAlertCapitals) == 0 {
		cfg.Backtest.EquityAlertCapitals = []float64{100000, 200000, 500000}
	}
	if cfg.Backtest.TargetGain == 0 {
		cfg.Backtest.TargetGain = 0.0022
	}
	if cfg.Backtest.TradeCapital == 0 {
		cfg.Backtest.TradeCapital = 1000000
	}
	if cfg.Backtest.CapitalLimit == 0 {
		cfg.Backtest.CapitalLimit = 2000000
	}
	if cfg.Backtest.MaxConcurrentTrades == 0 {
		cfg.Backtest.MaxConcurrentTrades = 2
	}
	if cfg.Backtest.EODTelegramChatID == "" {
		cfg.Backtest.EODTelegramChatID = cfg.Backtest.Alerts.TelegramChatID
	}
	if !cfg.Backtest.OptionBacktest.Enable {
		cfg.Backtest.OptionBacktest.Enable = cfg.NiftyWatcher.Enable
	}
	if cfg.Backtest.OptionBacktest.Underlying == "" {
		cfg.Backtest.OptionBacktest.Underlying = cfg.NiftyWatcher.Underlying
	}
	if cfg.Backtest.OptionBacktest.IndexToken == "" {
		cfg.Backtest.OptionBacktest.IndexToken = cfg.NiftyWatcher.IndexToken
	}
	if cfg.Backtest.OptionBacktest.Step == 0 {
		cfg.Backtest.OptionBacktest.Step = cfg.NiftyWatcher.Step
	}
	if cfg.Backtest.OptionBacktest.Buffer == 0 {
		cfg.Backtest.OptionBacktest.Buffer = cfg.NiftyWatcher.Buffer
	}
	if cfg.Backtest.OptionBacktest.ExpiryRank == 0 {
		cfg.Backtest.OptionBacktest.ExpiryRank = cfg.NiftyWatcher.ExpiryRank
	}
	if cfg.Backtest.OptionBacktest.Lots == 0 {
		cfg.Backtest.OptionBacktest.Lots = cfg.NiftyWatcher.Lots
	}
	if cfg.Backtest.OptionBacktest.LotSize == 0 {
		cfg.Backtest.OptionBacktest.LotSize = cfg.NiftyWatcher.LotSize
	}
	if cfg.Backtest.OptionBacktest.TargetRupees == 0 {
		cfg.Backtest.OptionBacktest.TargetRupees = cfg.NiftyWatcher.TargetRupees
	}
	if cfg.Backtest.OptionBacktest.EntryStart == "" {
		cfg.Backtest.OptionBacktest.EntryStart = cfg.NiftyWatcher.EntryStart
	}
	if cfg.Backtest.OptionBacktest.EntryEnd == "" {
		cfg.Backtest.OptionBacktest.EntryEnd = cfg.NiftyWatcher.EntryEnd
	}
	if cfg.Backtest.OptionBacktest.ExitTime == "" {
		cfg.Backtest.OptionBacktest.ExitTime = cfg.NiftyWatcher.ExitTime
	}
	if cfg.Backtest.OptionBacktest.RSIPeriod == 0 {
		cfg.Backtest.OptionBacktest.RSIPeriod = cfg.NiftyWatcher.RSIPeriod
	}
	if cfg.Backtest.OptionBacktest.WILLRPeriod == 0 {
		cfg.Backtest.OptionBacktest.WILLRPeriod = cfg.NiftyWatcher.WILLRPeriod
	}
	if cfg.Backtest.OptionBacktest.LookbackMinutes == 0 {
		cfg.Backtest.OptionBacktest.LookbackMinutes = cfg.NiftyWatcher.LookbackMinutes
	}
	if cfg.Backtest.OptionBacktest.RSILowThreshold == 0 {
		cfg.Backtest.OptionBacktest.RSILowThreshold = 30
	}
	if cfg.Backtest.OptionBacktest.RSIHighThreshold == 0 {
		cfg.Backtest.OptionBacktest.RSIHighThreshold = 70
	}
	if cfg.Backtest.OptionBacktest.EquilibriumDiffThreshold == 0 {
		cfg.Backtest.OptionBacktest.EquilibriumDiffThreshold = cfg.NiftyWatcher.EquilibriumDiffThreshold
	}
	if cfg.Backtest.OptionBacktest.NormalizationStart == "" {
		cfg.Backtest.OptionBacktest.NormalizationStart = cfg.NiftyWatcher.NormalizationStart
	}
	if cfg.Backtest.OptionBacktest.NormalizationStart == "" {
		cfg.Backtest.OptionBacktest.NormalizationStart = "09:15"
	}
	if cfg.Backtest.OptionBacktest.SlopeGuardMinAngle == 0 {
		cfg.Backtest.OptionBacktest.SlopeGuardMinAngle = cfg.NiftyWatcher.SlopeGuardMinAngle
	}
	if cfg.Backtest.OptionBacktest.SlopeGuardMinAngle == 0 {
		cfg.Backtest.OptionBacktest.SlopeGuardMinAngle = 45
	}
	if !cfg.Backtest.OptionBacktest.IncludeRSI80WillR40 {
		cfg.Backtest.OptionBacktest.IncludeRSI80WillR40 = true
	}
	if !cfg.Backtest.OptionBacktest.SlopeGuardEnable {
		cfg.Backtest.OptionBacktest.SlopeGuardEnable = true
	}
	if cfg.Equilibrium.RunIntervalSeconds == 0 {
		cfg.Equilibrium.RunIntervalSeconds = 60
	}
	if cfg.Equilibrium.LookbackMinutes == 0 {
		cfg.Equilibrium.LookbackMinutes = 390
	}
	if len(cfg.Equilibrium.Underlyings) == 0 {
		cfg.Equilibrium.Underlyings = []string{"NIFTY50"}
	}
	if len(cfg.Equilibrium.Kinds) == 0 {
		cfg.Equilibrium.Kinds = []string{"OPTIDX"}
	}
	if cfg.Equilibrium.MaxDataStalenessMinutes == 0 {
		cfg.Equilibrium.MaxDataStalenessMinutes = 480
	}
	if cfg.Equilibrium.UnderlyingStaleSeconds == 0 {
		cfg.Equilibrium.UnderlyingStaleSeconds = 120
	}
	if cfg.MaxPain.RunIntervalSeconds == 0 {
		cfg.MaxPain.RunIntervalSeconds = 300
	}
	if len(cfg.MaxPain.Underlyings) == 0 {
		cfg.MaxPain.Underlyings = []string{"NIFTY50"}
	}
	if len(cfg.MaxPain.ExpiryRanks) == 0 {
		cfg.MaxPain.ExpiryRanks = []int{0}
	}
	if cfg.MaxPain.MaxDataStalenessMinutes == 0 {
		cfg.MaxPain.MaxDataStalenessMinutes = 10
	}
	if cfg.Backtest.Charges.BrokerageRate == 0 {
		cfg.Backtest.Charges.BrokerageRate = 0.0003
	}
	if cfg.Backtest.Charges.BrokerageCap == 0 {
		cfg.Backtest.Charges.BrokerageCap = 20
	}
	if cfg.Backtest.Charges.STTRate == 0 {
		cfg.Backtest.Charges.STTRate = 0.00025
	}
	if cfg.Backtest.Charges.ExchangeTxnRate == 0 {
		cfg.Backtest.Charges.ExchangeTxnRate = 0.0000307
	}
	if cfg.Backtest.Charges.SEBIFeeRate == 0 {
		cfg.Backtest.Charges.SEBIFeeRate = 0.000001
	}
	if cfg.Backtest.Charges.StampDutyRate == 0 {
		cfg.Backtest.Charges.StampDutyRate = 0.00003
	}
	if cfg.Backtest.Charges.GSTRate == 0 {
		cfg.Backtest.Charges.GSTRate = 0.18
	}
	if cfg.Backtest.Swing.IntradayTarget == 0 {
		cfg.Backtest.Swing.IntradayTarget = 0.0022
	}
	if cfg.Backtest.Swing.SwingTarget == 0 {
		cfg.Backtest.Swing.SwingTarget = 0.021
	}
	if cfg.Backtest.Swing.BrokerageCap == 0 {
		cfg.Backtest.Swing.BrokerageCap = 250
	}
	if cfg.Backtest.Archive.RunTimeIST == "" {
		cfg.Backtest.Archive.RunTimeIST = "17:00"
	}
	if cfg.Backtest.Archive.Enable && !cfg.Backtest.Archive.RunIntraday && !cfg.Backtest.Archive.RunSwing {
		cfg.Backtest.Archive.RunIntraday = true
	}
	if cfg.Backtest.Enable && !cfg.Backtest.RunDaily && !cfg.Backtest.RunLive {
		cfg.Backtest.RunDaily = true
		cfg.Backtest.RunLive = true
	}
	if cfg.Backtest.Alerts.WebhookURL == "" {
		cfg.Backtest.Alerts.WebhookURL = cfg.Alerts.WebhookURL
	}
	if cfg.Backtest.Alerts.DiscordWebhookURL == "" {
		cfg.Backtest.Alerts.DiscordWebhookURL = cfg.Alerts.DiscordWebhookURL
	}
	if cfg.Backtest.Alerts.TelegramBotToken == "" {
		cfg.Backtest.Alerts.TelegramBotToken = cfg.Alerts.TelegramBotToken
	}
	if cfg.Backtest.Alerts.TelegramChatID == "" {
		cfg.Backtest.Alerts.TelegramChatID = cfg.Alerts.TelegramChatID
	}
	if cfg.Backtest.EODTelegramChatID == "" {
		cfg.Backtest.EODTelegramChatID = cfg.Backtest.Alerts.TelegramChatID
	}
	if cfg.Backtest.Alerts.TelegramParseMode == "" {
		cfg.Backtest.Alerts.TelegramParseMode = cfg.Alerts.TelegramParseMode
	}
	if !cfg.Backtest.Alerts.TelegramEnable {
		cfg.Backtest.Alerts.TelegramEnable = cfg.Alerts.TelegramEnable
	}
	if !cfg.Backtest.Alerts.IncludeDetails {
		cfg.Backtest.Alerts.IncludeDetails = cfg.Alerts.IncludeDetails
	}
	if !cfg.Backtest.Alerts.IncludeTargets {
		cfg.Backtest.Alerts.IncludeTargets = cfg.Alerts.IncludeTargets
	}
	if cfg.Backtest.Alerts.WebhookTimeoutSeconds == 0 {
		cfg.Backtest.Alerts.WebhookTimeoutSeconds = cfg.Alerts.WebhookTimeoutSeconds
	}
	// Only inherit headers when not specified. An explicit empty map (`{}` in YAML)
	// should mean "no headers".
	if cfg.Backtest.Alerts.WebhookHeaders == nil {
		cfg.Backtest.Alerts.WebhookHeaders = cfg.Alerts.WebhookHeaders
	}
	if !cfg.Backtest.Alerts.EnableWebhook {
		cfg.Backtest.Alerts.EnableWebhook = cfg.Alerts.EnableWebhook
	}
	if cfg.Backtest.Alerts.TitlePrefix == "" {
		cfg.Backtest.Alerts.TitlePrefix = "equity_backtest"
	}
	if cfg.Backtest.Alerts.MaxPerRun == 0 {
		cfg.Backtest.Alerts.MaxPerRun = 5
	}
	if cfg.MaxPain.Alerts.WebhookURL == "" {
		cfg.MaxPain.Alerts.WebhookURL = cfg.Alerts.WebhookURL
	}
	if cfg.MaxPain.Alerts.DiscordWebhookURL == "" {
		cfg.MaxPain.Alerts.DiscordWebhookURL = cfg.Alerts.DiscordWebhookURL
	}
	if cfg.MaxPain.Alerts.TelegramBotToken == "" {
		cfg.MaxPain.Alerts.TelegramBotToken = cfg.Alerts.TelegramBotToken
	}
	if cfg.MaxPain.Alerts.TelegramChatID == "" {
		cfg.MaxPain.Alerts.TelegramChatID = cfg.Alerts.TelegramChatID
	}
	if cfg.MaxPain.Alerts.TelegramParseMode == "" {
		cfg.MaxPain.Alerts.TelegramParseMode = cfg.Alerts.TelegramParseMode
	}
	if !cfg.MaxPain.Alerts.TelegramEnable {
		cfg.MaxPain.Alerts.TelegramEnable = cfg.Alerts.TelegramEnable
	}
	if !cfg.MaxPain.Alerts.IncludeDetails {
		cfg.MaxPain.Alerts.IncludeDetails = cfg.Alerts.IncludeDetails
	}
	if !cfg.MaxPain.Alerts.IncludeTargets {
		cfg.MaxPain.Alerts.IncludeTargets = cfg.Alerts.IncludeTargets
	}
	if cfg.MaxPain.Alerts.WebhookTimeoutSeconds == 0 {
		cfg.MaxPain.Alerts.WebhookTimeoutSeconds = cfg.Alerts.WebhookTimeoutSeconds
	}
	// Only inherit headers when not specified. An explicit empty map (`{}` in YAML)
	// should mean "no headers".
	if cfg.MaxPain.Alerts.WebhookHeaders == nil {
		cfg.MaxPain.Alerts.WebhookHeaders = cfg.Alerts.WebhookHeaders
	}
	if !cfg.MaxPain.Alerts.EnableWebhook {
		cfg.MaxPain.Alerts.EnableWebhook = cfg.Alerts.EnableWebhook
	}
	if cfg.MaxPain.Alerts.TitlePrefix == "" {
		cfg.MaxPain.Alerts.TitlePrefix = "max_pain"
	}
	if cfg.MaxPain.Alerts.MaxPerRun == 0 {
		cfg.MaxPain.Alerts.MaxPerRun = 5
	}
	if cfg.Alerts.WebhookTimeoutSeconds == 0 {
		cfg.Alerts.WebhookTimeoutSeconds = 5
	}
	if cfg.Alerts.TitlePrefix == "" {
		cfg.Alerts.TitlePrefix = "strategy"
	}
	if cfg.Alerts.MaxPerRun == 0 {
		cfg.Alerts.MaxPerRun = 5
	}
}

func applyEnvOverrides(cfg *Config) {
	if v := os.Getenv("SMARTAPI_API_KEY"); v != "" {
		cfg.SmartAPI.APIKey = v
	}
	if v := os.Getenv("SMARTAPI_CLIENT_CODE"); v != "" {
		cfg.SmartAPI.ClientCode = v
	}
	if v := os.Getenv("SMARTAPI_PASSWORD"); v != "" {
		cfg.SmartAPI.Password = v
	}
	if v := os.Getenv("SMARTAPI_MPIN"); v != "" {
		cfg.SmartAPI.MPIN = v
		cfg.SmartAPI.Password = v
	}
	if v := os.Getenv("SMARTAPI_TOTP_SECRET"); v != "" {
		cfg.SmartAPI.TOTPSecret = v
	}
	if v := os.Getenv("SMARTAPI_TOTP_CODE"); v != "" {
		cfg.SmartAPI.TOTPCode = v
	}
	if v := os.Getenv("SMARTAPI_ACCESS_TOKEN"); v != "" {
		cfg.SmartAPI.AccessToken = v
	}
	if v := os.Getenv("SMARTAPI_FEED_TOKEN"); v != "" {
		cfg.SmartAPI.FeedToken = v
	}
	if v := os.Getenv("POSTGRES_USER"); v != "" {
		cfg.Postgres.User = v
	}
	if v := os.Getenv("POSTGRES_PASSWORD"); v != "" {
		cfg.Postgres.Password = v
	}
	if v := os.Getenv("POSTGRES_DB"); v != "" {
		cfg.Postgres.Database = v
	}
	if v := os.Getenv("POSTGRES_MAX_CONNS"); v != "" {
		if maxConns, err := strconv.Atoi(v); err == nil {
			cfg.Postgres.MaxConns = int32(maxConns)
		}
	}
	if v := os.Getenv("POSTGRES_MIN_CONNS"); v != "" {
		if minConns, err := strconv.Atoi(v); err == nil {
			cfg.Postgres.MinConns = int32(minConns)
		}
	}
	if v := os.Getenv("POSTGRES_MAX_CONN_IDLE_SECONDS"); v != "" {
		if seconds, err := strconv.Atoi(v); err == nil {
			cfg.Postgres.MaxConnIdleSeconds = seconds
		}
	}
	if v := os.Getenv("POSTGRES_HEALTH_CHECK_SECONDS"); v != "" {
		if seconds, err := strconv.Atoi(v); err == nil {
			cfg.Postgres.HealthCheckSeconds = seconds
		}
	}
	if v := os.Getenv("RETENTION_DRY_RUN"); v != "" {
		cfg.Retention.DryRun = strings.EqualFold(v, "true") || v == "1"
	}
	if v := os.Getenv("BARS_DAYS"); v != "" {
		if days, err := strconv.Atoi(v); err == nil {
			cfg.Retention.Bars1mDays = days
		}
	}
	if v := os.Getenv("SNAP_DAYS"); v != "" {
		if days, err := strconv.Atoi(v); err == nil {
			cfg.Retention.QuoteSnapshotsDays = days
		}
	}
	if v := os.Getenv("SNAP_HOURS"); v != "" {
		if hours, err := strconv.Atoi(v); err == nil {
			cfg.Retention.QuoteSnapshotsHours = hours
		}
	}
	if v := os.Getenv("DEPTH5_DAYS"); v != "" {
		if days, err := strconv.Atoi(v); err == nil {
			cfg.Retention.Depth5Days = days
		}
	}
	if v := os.Getenv("DEPTH5_HOURS"); v != "" {
		if hours, err := strconv.Atoi(v); err == nil {
			cfg.Retention.Depth5Hours = hours
		}
	}
	if v := os.Getenv("GREEKS_DAYS"); v != "" {
		if days, err := strconv.Atoi(v); err == nil {
			cfg.Retention.OptionGreeksDays = days
		}
	}
	if v := os.Getenv("OI_HOURS"); v != "" {
		if hours, err := strconv.Atoi(v); err == nil {
			cfg.Retention.OISnapshotsHours = hours
		}
	}
	if v := os.Getenv("DEPTH5_MAX_GB"); v != "" {
		if gb, err := strconv.Atoi(v); err == nil {
			cfg.Retention.Depth5MaxGB = gb
		}
	}
	if v := os.Getenv("ALERTS_WEBHOOK_URL"); v != "" {
		cfg.Alerts.WebhookURL = v
	}
	if v := os.Getenv("ALERTS_DISCORD_WEBHOOK_URL"); v != "" {
		cfg.Alerts.DiscordWebhookURL = v
	}
	if v := os.Getenv("ALERTS_ENABLE_ERROR_ALERTS"); v != "" {
		cfg.Alerts.EnableErrorAlerts = strings.EqualFold(v, "true") || v == "1"
	}
	if v := os.Getenv("TELEGRAM_ENABLE"); v != "" {
		cfg.Alerts.TelegramEnable = strings.EqualFold(v, "true") || v == "1"
	}
	if v := os.Getenv("TELEGRAM_BOT_TOKEN"); v != "" {
		cfg.Alerts.TelegramBotToken = v
	}
	if v := os.Getenv("TELEGRAM_CHAT_ID"); v != "" {
		cfg.Alerts.TelegramChatID = v
	}
	if v := os.Getenv("TELEGRAM_PARSE_MODE"); v != "" {
		cfg.Alerts.TelegramParseMode = v
	}
	if v := os.Getenv("DIGII4_TELEGRAM_CHAT_ID"); v != "" {
		cfg.Digii4Flow.Alerts.TelegramChatID = v
		cfg.Digii4Flow.Alerts.TelegramEnable = true
	}
	if v := os.Getenv("BACKTEST_TELEGRAM_CHAT_ID"); v != "" {
		cfg.Backtest.Alerts.TelegramChatID = v
		cfg.Backtest.Alerts.TelegramEnable = true
	}
	if v := os.Getenv("BACKTEST_EOD_TELEGRAM_CHAT_ID"); v != "" {
		cfg.Backtest.EODTelegramChatID = v
	}
	if v := os.Getenv("ALERTS_WEBHOOK_AUTH"); v != "" {
		if cfg.Alerts.WebhookHeaders == nil {
			cfg.Alerts.WebhookHeaders = map[string]string{}
		}
		cfg.Alerts.WebhookHeaders["Authorization"] = v
	}
}

func (c *Config) Validate() error {
	if c.SmartAPI.APIKey == "" || c.SmartAPI.ClientCode == "" {
		return errors.New("smartapi.api_key and smartapi.client_code are required")
	}
	if c.SmartAPI.MPIN != "" {
		c.SmartAPI.Password = c.SmartAPI.MPIN
	}
	if c.SmartAPI.AccessToken == "" || c.SmartAPI.FeedToken == "" {
		if c.SmartAPI.Password == "" {
			return errors.New("smartapi.password (or smartapi.mpin) is required when access/feed tokens are not provided")
		}
	}
	if c.Files.SymbolsCSVPath == "" {
		return errors.New("files.symbols_csv_path is required")
	}
	if c.Files.InstrumentCachePath == "" {
		return errors.New("files.instrument_cache_path is required")
	}
	if c.Postgres.Host == "" || c.Postgres.User == "" || c.Postgres.Database == "" {
		return errors.New("postgres.host/user/database are required")
	}
	if c.Health.EnableHTTP && c.Health.ListenAddr == "" {
		return errors.New("health.listen_addr required when health.enable_http is true")
	}
	if _, err := time.LoadLocation(c.Runtime.Timezone); err != nil {
		return fmt.Errorf("invalid runtime.timezone: %w", err)
	}
	if _, err := time.Parse("15:04", c.Runtime.TradingStart); err != nil {
		return fmt.Errorf("invalid runtime.trading_start: %w", err)
	}
	if _, err := time.Parse("15:04", c.Runtime.TradingEnd); err != nil {
		return fmt.Errorf("invalid runtime.trading_end: %w", err)
	}
	if c.WS.MaxConnections < 1 {
		return errors.New("ws.max_connections must be >= 1")
	}
	if c.WS.MaxTokensPerConnection < 1 {
		return errors.New("ws.max_tokens_per_connection must be >= 1")
	}
	if c.WS.EnableDepthSnapshots && c.WS.DepthSnapshotIntervalSeconds < 1 {
		return errors.New("ws.depth_snapshot_interval_seconds must be >= 1 when depth snapshots are enabled")
	}
	if c.Limits.QuoteMaxSymbolsPerRequest < 1 {
		return errors.New("limits.quote_max_symbols_per_request must be >= 1")
	}
	if c.Limits.QuotePerMinuteCap < 1 {
		return errors.New("limits.quote_per_minute_cap must be >= 1")
	}
	if c.Limits.QuotePerHourCap < 1 {
		return errors.New("limits.quote_per_hour_cap must be >= 1")
	}
	if c.Limits.CandlesPerHourCap < 1 {
		return errors.New("limits.candles_per_hour_cap must be >= 1")
	}
	if c.Limits.AggregatesPerMinuteCap < 1 {
		return errors.New("limits.aggregates_per_minute_cap must be >= 1")
	}
	if c.Limits.AggregatesPerHourCap < 1 {
		return errors.New("limits.aggregates_per_hour_cap must be >= 1")
	}
	if c.RestTasks.EnableOptionQuoteSnapshots && c.RestTasks.OptionQuoteSnapshotIntervalSeconds < 1 {
		return errors.New("rest_tasks.option_quote_snapshot_interval_seconds must be >= 1")
	}
	if c.RestTasks.QuoteSnapshotRotationMaxTokens < 0 {
		return errors.New("rest_tasks.quote_snapshot_rotation_max_tokens must be >= 0")
	}
	for _, budget := range c.RestTasks.QuoteSnapshotRotationBudgets {
		if strings.TrimSpace(budget.Kind) == "" {
			return errors.New("rest_tasks.quote_snapshot_rotation_budgets.kind is required")
		}
		if budget.MaxTokens < 0 {
			return errors.New("rest_tasks.quote_snapshot_rotation_budgets.max_tokens must be >= 0")
		}
	}
	if c.RestTasks.OptionQuoteSnapshotRotationMaxTokens < 0 {
		return errors.New("rest_tasks.option_quote_snapshot_rotation_max_tokens must be >= 0")
	}
	if c.RestTasks.EnableGainersLosers && len(c.RestTasks.GainersLosersPayloads) == 0 {
		return errors.New("rest_tasks.gainers_losers_payloads must be provided when enable_gainers_losers is true")
	}
	if c.RestTasks.EnableOIBuildup && len(c.RestTasks.OIBuildupPayloads) == 0 {
		return errors.New("rest_tasks.oi_buildup_payloads must be provided when enable_oi_buildup is true")
	}
	if c.RestTasks.EnablePutCallRatio && c.RestTasks.PutCallRatioIntervalSeconds < 1 {
		return errors.New("rest_tasks.put_call_ratio_interval_seconds must be >= 1")
	}
	if c.RestTasks.EnableRestFallback {
		if c.RestTasks.RestFallbackIntervalSeconds < 1 {
			return errors.New("rest_tasks.rest_fallback_interval_seconds must be >= 1")
		}
		if c.RestTasks.RestFallbackStaleSeconds < 1 {
			return errors.New("rest_tasks.rest_fallback_stale_seconds must be >= 1")
		}
		if c.RestTasks.RestFallbackLookbackMinutes < 1 {
			return errors.New("rest_tasks.rest_fallback_lookback_minutes must be >= 1")
		}
	}
	if c.History.DailyYears < 1 {
		return errors.New("history.daily_years must be >= 1")
	}
	if c.History.DailyChunkDays < 1 {
		return errors.New("history.daily_chunk_days must be >= 1")
	}
	if _, err := time.Parse("15:04", c.History.DailyRunTimeIST); err != nil {
		return fmt.Errorf("invalid history.daily_run_time_ist: %w", err)
	}
	if c.Retention.EnableCleanup {
		if c.Retention.Bars1mDays < 1 {
			return errors.New("retention.bars_1m_days must be >= 1")
		}
		if c.Retention.QuoteSnapshotsDays < 1 {
			return errors.New("retention.quote_snapshots_days must be >= 1")
		}
		if c.Retention.QuoteSnapshotsHours < 0 {
			return errors.New("retention.quote_snapshots_hours must be >= 0")
		}
		if c.Retention.Depth5Days < 1 {
			return errors.New("retention.depth_5_days must be >= 1")
		}
		if c.Retention.Depth5Hours < 0 {
			return errors.New("retention.depth_5_hours must be >= 0")
		}
		if c.Retention.OptionGreeksDays < 1 {
			return errors.New("retention.option_greeks_days must be >= 1")
		}
		if c.Retention.OISnapshotsHours < 0 {
			return errors.New("retention.oi_snapshots_hours must be >= 0")
		}
		if c.Retention.Depth5MaxGB < 0 {
			return errors.New("retention.depth_5_max_gb must be >= 0")
		}
		if c.Retention.CleanupIntervalMinutes < 0 {
			return errors.New("retention.cleanup_interval_minutes must be >= 0")
		}
		if _, err := time.Parse("15:04", c.Retention.CleanupRunTimeIST); err != nil {
			return fmt.Errorf("invalid retention.cleanup_run_time_ist: %w", err)
		}
	}
	if c.Metrics.Enable {
		if c.Metrics.RollupIntervalSeconds < 1 {
			return errors.New("metrics.rollup_interval_seconds must be >= 1")
		}
		if c.Metrics.StateFlushSeconds < 1 {
			return errors.New("metrics.state_flush_seconds must be >= 1")
		}
		for _, sla := range c.Metrics.SLA {
			if strings.TrimSpace(sla.SourceName) == "" {
				return errors.New("metrics.sla.source_name is required")
			}
			if strings.TrimSpace(sla.Dataset) == "" {
				return errors.New("metrics.sla.dataset is required")
			}
			if sla.ExpectedIntervalSeconds < 1 {
				return errors.New("metrics.sla.expected_interval_seconds must be >= 1")
			}
			if sla.MaxStalenessSeconds < 1 {
				return errors.New("metrics.sla.max_staleness_seconds must be >= 1")
			}
			if strings.EqualFold(sla.Dataset, "bars_1m") && sla.BarLateSeconds < 1 {
				return errors.New("metrics.sla.bar_late_seconds must be >= 1 for bars_1m")
			}
		}
	}
	if c.Strategy.Enable {
		if c.Strategy.IndexToken == "" {
			return errors.New("strategy.index_token is required when strategy.enable is true")
		}
		if c.Strategy.RSIPeriod < 2 {
			return errors.New("strategy.rsi_period must be >= 2")
		}
		if c.Strategy.RSISetupMin >= c.Strategy.RSISetupMax {
			return errors.New("strategy.rsi_setup_min must be < strategy.rsi_setup_max")
		}
		if c.Strategy.RSITrigger <= 0 {
			return errors.New("strategy.rsi_trigger must be > 0")
		}
		if c.Strategy.VolumeSpikeMultiplier <= 0 {
			return errors.New("strategy.volume_spike_multiplier must be > 0")
		}
		if c.Strategy.ATRPeriod < 2 {
			return errors.New("strategy.atr_period must be >= 2")
		}
		if c.Strategy.StopATRMultiplier <= 0 || c.Strategy.TargetATRMultiplier <= 0 {
			return errors.New("strategy.stop_atr_multiplier and target_atr_multiplier must be > 0")
		}
		if c.Strategy.MaxSignalsPerRun < 1 {
			return errors.New("strategy.max_signals_per_run must be >= 1")
		}
		if c.Strategy.NiftyLevelStraddleEnable {
			if c.Strategy.NiftyLevelStraddleStep <= 0 {
				return errors.New("strategy.nifty_level_straddle_step must be > 0")
			}
			if c.Strategy.NiftyLevelStraddleBuffer < 0 {
				return errors.New("strategy.nifty_level_straddle_buffer must be >= 0")
			}
			if c.Strategy.NiftyLevelStraddleLots < 1 {
				return errors.New("strategy.nifty_level_straddle_lots must be >= 1")
			}
			if c.Strategy.NiftyLevelStraddleLotSize < 1 {
				return errors.New("strategy.nifty_level_straddle_lot_size must be >= 1")
			}
			if strings.TrimSpace(c.Strategy.NiftyLevelStraddleExitTime) == "" {
				return errors.New("strategy.nifty_level_straddle_exit_time is required")
			}
			if _, err := time.Parse("15:04", c.Strategy.NiftyLevelStraddleExitTime); err != nil {
				return fmt.Errorf("invalid strategy.nifty_level_straddle_exit_time: %w", err)
			}
			if c.Strategy.NiftyLevelStraddleEquilibriumDiffMax < 0 {
				return errors.New("strategy.nifty_level_straddle_equilibrium_diff_max must be >= 0")
			}
			if c.Strategy.NiftyLevelStraddleEquilibriumMaxAgeMinutes < 1 {
				return errors.New("strategy.nifty_level_straddle_equilibrium_max_age_minutes must be >= 1")
			}
		}
	}
	if c.Paper.Enable {
		if c.Paper.CapitalPerTrade <= 0 {
			return errors.New("paper_trading.capital_per_trade must be > 0 when enabled")
		}
		if c.Paper.MaxOpenPositions < 1 {
			return errors.New("paper_trading.max_open_positions must be >= 1 when enabled")
		}
	}
	if c.Backtest.Enable {
		if _, err := time.Parse("15:04", c.Backtest.DailyRunTimeIST); err != nil {
			return fmt.Errorf("invalid backtest.daily_run_time_ist: %w", err)
		}
		if c.Backtest.LiveIntervalSeconds < 1 {
			return errors.New("backtest.live_interval_seconds must be >= 1")
		}
		if c.Backtest.LiveWindowMinutes < 1 {
			return errors.New("backtest.live_window_minutes must be >= 1")
		}
		if c.Backtest.LiveMaxSignalsPerRun < 1 {
			return errors.New("backtest.live_max_signals_per_run must be >= 1")
		}
		if c.Backtest.LiveMaxAlertsPerDay < 1 {
			return errors.New("backtest.live_max_alerts_per_day must be >= 1")
		}
		if c.Backtest.UniverseName == "" {
			return errors.New("backtest.universe_name is required when backtest is enabled")
		}
		if c.Backtest.DaysBack < 1 {
			return errors.New("backtest.days_back must be >= 1")
		}
		if c.Backtest.RSIPeriod < 2 {
			return errors.New("backtest.rsi_period must be >= 2")
		}
		if c.Backtest.WILLRPeriod < 2 {
			return errors.New("backtest.willr_period must be >= 2")
		}
		if c.Backtest.RequireDailyEMATrend {
			if c.Backtest.DailyEMAFast < 2 || c.Backtest.DailyEMASlow < 2 {
				return errors.New("backtest.daily_ema_fast and daily_ema_slow must be >= 2 when daily trend filter is enabled")
			}
			if c.Backtest.DailyEMAFast >= c.Backtest.DailyEMASlow {
				return errors.New("backtest.daily_ema_fast must be < daily_ema_slow when daily trend filter is enabled")
			}
		}
		if c.Backtest.RequireBollingerTouch {
			if c.Backtest.BollingerPeriod < 2 {
				return errors.New("backtest.bollinger_period must be >= 2 when bollinger touch filter is enabled")
			}
			if c.Backtest.BollingerStdDev <= 0 {
				return errors.New("backtest.bollinger_stddev must be > 0 when bollinger touch filter is enabled")
			}
		}
		if c.Backtest.BollingerLowerBufferPct < 0 {
			return errors.New("backtest.bollinger_lower_buffer_pct must be >= 0")
		}
		if c.Backtest.RequireVolumeSpike && c.Backtest.VolumeSpikeMinRatio <= 0 {
			return errors.New("backtest.volume_spike_min_ratio must be > 0 when volume spike filter is enabled")
		}
		if c.Backtest.CloseLookback < 1 {
			return errors.New("backtest.close_lookback must be >= 1")
		}
		if c.Backtest.VolumeLookback < 1 {
			return errors.New("backtest.volume_lookback must be >= 1")
		}
		if c.Backtest.VolumeMedianMaxRatio <= 0 {
			return errors.New("backtest.volume_median_max_ratio must be > 0")
		}
		if c.Backtest.StartOffsetMinutes < 0 {
			return errors.New("backtest.start_offset_minutes must be >= 0")
		}
		if _, err := time.Parse("15:04", c.Backtest.EquityEntryStart); err != nil {
			return fmt.Errorf("invalid backtest.equity_entry_start: %w", err)
		}
		if _, err := time.Parse("15:04", c.Backtest.EquityEntryEnd); err != nil {
			return fmt.Errorf("invalid backtest.equity_entry_end: %w", err)
		}
		if c.Backtest.EquitySelectionRSIMax <= 0 || c.Backtest.EquitySelectionRSIMax >= 100 {
			return errors.New("backtest.equity_selection_rsi_max must be between 0 and 100")
		}
		if c.Backtest.EquitySelectionWillRMax > 0 || c.Backtest.EquitySelectionWillRMax < -100 {
			return errors.New("backtest.equity_selection_willr_max must be between -100 and 0")
		}
		if c.Backtest.EquityEntryRSIThreshold <= 0 || c.Backtest.EquityEntryRSIThreshold >= 100 {
			return errors.New("backtest.equity_entry_rsi_threshold must be between 0 and 100")
		}
		if c.Backtest.EquityEntryWillRThresh > 0 || c.Backtest.EquityEntryWillRThresh < -100 {
			return errors.New("backtest.equity_entry_willr_threshold must be between -100 and 0")
		}
		if c.Backtest.EquityIntradayTargetNet <= 0 {
			return errors.New("backtest.equity_intraday_target_net must be > 0")
		}
		if c.Backtest.EquityDeliveryTargetNet <= 0 {
			return errors.New("backtest.equity_delivery_target_net must be > 0")
		}
		for _, capital := range c.Backtest.EquityCapitalScenarios {
			if capital <= 0 {
				return errors.New("backtest.equity_capital_scenarios values must be > 0")
			}
		}
		for _, capital := range c.Backtest.EquityAlertCapitals {
			if capital <= 0 {
				return errors.New("backtest.equity_alert_capitals values must be > 0")
			}
		}
		if c.Backtest.TargetGain <= 0 {
			return errors.New("backtest.target_gain must be > 0")
		}
		if c.Backtest.TradeCapital <= 0 {
			return errors.New("backtest.trade_capital must be > 0")
		}
		if c.Backtest.CapitalLimit <= 0 {
			return errors.New("backtest.capital_limit must be > 0")
		}
		if c.Backtest.MaxConcurrentTrades < 1 {
			return errors.New("backtest.max_concurrent_trades must be >= 1")
		}
		if c.Backtest.EntryCutoffTime != "" {
			if _, err := time.Parse("15:04", c.Backtest.EntryCutoffTime); err != nil {
				return fmt.Errorf("invalid backtest.entry_cutoff_time: %w", err)
			}
		}
		if c.Backtest.Alerts.EnableWebhook && strings.TrimSpace(c.Backtest.Alerts.WebhookURL) == "" && strings.TrimSpace(c.Backtest.Alerts.DiscordWebhookURL) == "" {
			return errors.New("backtest.alerts.webhook_url required when backtest alerts are enabled")
		}
		if c.Backtest.Alerts.TelegramEnable && (strings.TrimSpace(c.Backtest.Alerts.TelegramBotToken) == "" || strings.TrimSpace(c.Backtest.Alerts.TelegramChatID) == "") {
			return errors.New("backtest.alerts.telegram_bot_token and telegram_chat_id required when telegram is enabled")
		}
		if c.Backtest.OptionBacktest.Enable {
			if strings.TrimSpace(c.Backtest.OptionBacktest.IndexToken) == "" {
				return errors.New("backtest.option_backtest.index_token is required when option backtest is enabled")
			}
			if strings.TrimSpace(c.Backtest.OptionBacktest.Underlying) == "" {
				return errors.New("backtest.option_backtest.underlying is required when option backtest is enabled")
			}
			if c.Backtest.OptionBacktest.Step <= 0 {
				return errors.New("backtest.option_backtest.step must be > 0")
			}
			if c.Backtest.OptionBacktest.Buffer < 0 {
				return errors.New("backtest.option_backtest.buffer must be >= 0")
			}
			if c.Backtest.OptionBacktest.Lots < 1 {
				return errors.New("backtest.option_backtest.lots must be >= 1")
			}
			if c.Backtest.OptionBacktest.LotSize < 1 {
				return errors.New("backtest.option_backtest.lot_size must be >= 1")
			}
			if c.Backtest.OptionBacktest.RSIPeriod < 2 {
				return errors.New("backtest.option_backtest.rsi_period must be >= 2")
			}
			if c.Backtest.OptionBacktest.WILLRPeriod < 2 {
				return errors.New("backtest.option_backtest.willr_period must be >= 2")
			}
			if c.Backtest.OptionBacktest.LookbackMinutes < 1 {
				return errors.New("backtest.option_backtest.lookback_minutes must be >= 1")
			}
			if c.Backtest.OptionBacktest.RSILowThreshold >= c.Backtest.OptionBacktest.RSIHighThreshold {
				return errors.New("backtest.option_backtest.rsi_low_threshold must be < rsi_high_threshold")
			}
			if c.Backtest.OptionBacktest.EquilibriumDiffThreshold <= 0 {
				return errors.New("backtest.option_backtest.equilibrium_diff_threshold must be > 0")
			}
			if _, err := time.Parse("15:04", c.Backtest.OptionBacktest.EntryStart); err != nil {
				return fmt.Errorf("invalid backtest.option_backtest.entry_start: %w", err)
			}
			if _, err := time.Parse("15:04", c.Backtest.OptionBacktest.EntryEnd); err != nil {
				return fmt.Errorf("invalid backtest.option_backtest.entry_end: %w", err)
			}
			if _, err := time.Parse("15:04", c.Backtest.OptionBacktest.ExitTime); err != nil {
				return fmt.Errorf("invalid backtest.option_backtest.exit_time: %w", err)
			}
			if _, err := time.Parse("15:04", c.Backtest.OptionBacktest.NormalizationStart); err != nil {
				return fmt.Errorf("invalid backtest.option_backtest.normalization_start: %w", err)
			}
			if c.Backtest.OptionBacktest.SlopeGuardMinAngle < 0 || c.Backtest.OptionBacktest.SlopeGuardMinAngle > 90 {
				return errors.New("backtest.option_backtest.slope_guard_min_angle must be between 0 and 90")
			}
		}
		if c.Backtest.Swing.Enable {
			if c.Backtest.Swing.IntradayTarget <= 0 {
				return errors.New("backtest.swing.intraday_target must be > 0")
			}
			if c.Backtest.Swing.SwingTarget <= 0 {
				return errors.New("backtest.swing.swing_target must be > 0")
			}
			if c.Backtest.Swing.BrokerageCap <= 0 {
				return errors.New("backtest.swing.brokerage_cap must be > 0")
			}
			if c.Backtest.Swing.StopLossPct < 0 || c.Backtest.Swing.StopLossPct >= 1 {
				return errors.New("backtest.swing.stop_loss_pct must be between 0 and 1")
			}
			if c.Backtest.Swing.HoldMinGainPct < -1 || c.Backtest.Swing.HoldMinGainPct > 1 {
				return errors.New("backtest.swing.hold_min_gain_pct must be between -1 and 1")
			}
		}
		if c.Backtest.Archive.Enable {
			if strings.TrimSpace(c.Backtest.Archive.Root) == "" {
				return errors.New("backtest.archive.root is required when archive is enabled")
			}
			if _, err := time.Parse("15:04", c.Backtest.Archive.RunTimeIST); err != nil {
				return fmt.Errorf("invalid backtest.archive.run_time_ist: %w", err)
			}
			if !c.Backtest.Archive.RunIntraday && !c.Backtest.Archive.RunSwing {
				return errors.New("backtest.archive.run_intraday or run_swing must be true when archive is enabled")
			}
			if c.Backtest.Archive.StartDate != "" {
				if _, err := time.Parse("2006-01-02", c.Backtest.Archive.StartDate); err != nil {
					return fmt.Errorf("invalid backtest.archive.start_date: %w", err)
				}
			}
			if c.Backtest.Archive.EndDate != "" {
				if _, err := time.Parse("2006-01-02", c.Backtest.Archive.EndDate); err != nil {
					return fmt.Errorf("invalid backtest.archive.end_date: %w", err)
				}
			}
			if c.Backtest.Archive.StartDate != "" && c.Backtest.Archive.EndDate != "" {
				start, _ := time.Parse("2006-01-02", c.Backtest.Archive.StartDate)
				end, _ := time.Parse("2006-01-02", c.Backtest.Archive.EndDate)
				if end.Before(start) {
					return errors.New("backtest.archive.end_date must be after start_date")
				}
			}
		}
	}
	if c.Equilibrium.Enable {
		if c.Equilibrium.RunIntervalSeconds < 10 {
			return errors.New("equilibrium.run_interval_seconds must be >= 10 when enabled")
		}
		if c.Equilibrium.LookbackMinutes < 1 {
			return errors.New("equilibrium.lookback_minutes must be >= 1 when enabled")
		}
		if len(c.Equilibrium.Underlyings) == 0 {
			return errors.New("equilibrium.underlyings must be provided when enabled")
		}
		if len(c.Equilibrium.Kinds) == 0 {
			return errors.New("equilibrium.kinds must be provided when enabled")
		}
		if c.Equilibrium.ExpiryRank < 0 {
			return errors.New("equilibrium.expiry_rank must be >= 0 when enabled")
		}
		if c.Equilibrium.MaxDataStalenessMinutes < 1 {
			return errors.New("equilibrium.max_data_staleness_minutes must be >= 1 when enabled")
		}
		if c.Equilibrium.UnderlyingStaleSeconds < 1 {
			return errors.New("equilibrium.underlying_stale_seconds must be >= 1 when enabled")
		}
	}
	if c.MaxPain.Enable {
		if c.MaxPain.RunIntervalSeconds < 10 {
			return errors.New("max_pain.run_interval_seconds must be >= 10 when enabled")
		}
		if len(c.MaxPain.Underlyings) == 0 {
			return errors.New("max_pain.underlyings must be provided when enabled")
		}
		if len(c.MaxPain.ExpiryRanks) == 0 {
			return errors.New("max_pain.expiry_ranks must be provided when enabled")
		}
		for _, rank := range c.MaxPain.ExpiryRanks {
			if rank < 0 {
				return errors.New("max_pain.expiry_ranks must be >= 0 when enabled")
			}
		}
		if c.MaxPain.MaxDataStalenessMinutes < 1 {
			return errors.New("max_pain.max_data_staleness_minutes must be >= 1 when enabled")
		}
		if c.MaxPain.Alerts.EnableWebhook && strings.TrimSpace(c.MaxPain.Alerts.WebhookURL) == "" && strings.TrimSpace(c.MaxPain.Alerts.DiscordWebhookURL) == "" {
			return errors.New("max_pain.alerts.webhook_url required when max pain alerts are enabled")
		}
		if c.MaxPain.Alerts.TelegramEnable && (strings.TrimSpace(c.MaxPain.Alerts.TelegramBotToken) == "" || strings.TrimSpace(c.MaxPain.Alerts.TelegramChatID) == "") {
			return errors.New("max_pain.alerts.telegram_bot_token and telegram_chat_id required when telegram is enabled")
		}
	}
	if c.Alerts.EnableWebhook && strings.TrimSpace(c.Alerts.WebhookURL) == "" && strings.TrimSpace(c.Alerts.DiscordWebhookURL) == "" {
		return errors.New("alerts.webhook_url required when alerts.enable_webhook is true")
	}
	if c.Alerts.TelegramEnable && (strings.TrimSpace(c.Alerts.TelegramBotToken) == "" || strings.TrimSpace(c.Alerts.TelegramChatID) == "") {
		return errors.New("alerts.telegram_bot_token and telegram_chat_id required when telegram is enabled")
	}
	if c.Watchlist.Enable {
		if strings.TrimSpace(c.Watchlist.ListenAddr) == "" {
			return errors.New("watchlist.listen_addr is required when watchlist is enabled")
		}
		if _, err := time.Parse("15:04", c.Watchlist.AlertWindowStart); err != nil {
			return fmt.Errorf("invalid watchlist.alert_window_start: %w", err)
		}
		if c.Watchlist.AlertWindowMinutes < 1 {
			return errors.New("watchlist.alert_window_minutes must be >= 1")
		}
		if c.Watchlist.MaxAlertsPerDay < 1 {
			return errors.New("watchlist.max_alerts_per_day must be >= 1")
		}
		if c.Watchlist.MaxAlertsPerRun < 1 {
			return errors.New("watchlist.max_alerts_per_run must be >= 1")
		}
	}
	if c.RSIWillRMonitor.Enable {
		if strings.TrimSpace(c.RSIWillRMonitor.ListenAddr) == "" {
			return errors.New("rsi_willr_monitor.listen_addr is required when enabled")
		}
		if strings.TrimSpace(c.RSIWillRMonitor.Exchange) == "" {
			return errors.New("rsi_willr_monitor.exchange is required when enabled")
		}
		if c.RSIWillRMonitor.EvalIntervalSeconds < 5 {
			return errors.New("rsi_willr_monitor.eval_interval_seconds must be >= 5 when enabled")
		}
		if _, err := time.Parse("15:04", c.RSIWillRMonitor.RunWindowStart); err != nil {
			return fmt.Errorf("invalid rsi_willr_monitor.run_window_start: %w", err)
		}
		if _, err := time.Parse("15:04", c.RSIWillRMonitor.RunWindowEnd); err != nil {
			return fmt.Errorf("invalid rsi_willr_monitor.run_window_end: %w", err)
		}
		if strings.TrimSpace(c.RSIWillRMonitor.RunWindowStart) != "" && strings.TrimSpace(c.RSIWillRMonitor.RunWindowEnd) != "" {
			start, _ := time.Parse("15:04", c.RSIWillRMonitor.RunWindowStart)
			end, _ := time.Parse("15:04", c.RSIWillRMonitor.RunWindowEnd)
			if end.Before(start) || end.Equal(start) {
				return errors.New("rsi_willr_monitor.run_window_end must be after run_window_start")
			}
		}
		if c.RSIWillRMonitor.LookbackMinutes < 1 {
			return errors.New("rsi_willr_monitor.lookback_minutes must be >= 1 when enabled")
		}
		if c.RSIWillRMonitor.RSIPeriod < 2 {
			return errors.New("rsi_willr_monitor.rsi_period must be >= 2 when enabled")
		}
		if c.RSIWillRMonitor.WillRPeriod < 2 {
			return errors.New("rsi_willr_monitor.willr_period must be >= 2 when enabled")
		}
		if c.RSIWillRMonitor.MaxBarStalenessSeconds < 0 {
			return errors.New("rsi_willr_monitor.max_bar_staleness_seconds must be >= 0 when enabled")
		}
		if c.RSIWillRMonitor.AlertCooldownMinutes < 0 {
			return errors.New("rsi_willr_monitor.alert_cooldown_minutes must be >= 0 when enabled")
		}
		if c.RSIWillRMonitor.Alerts.MaxPerRun < 1 {
			return errors.New("rsi_willr_monitor.alerts.max_per_run must be >= 1 when enabled")
		}
		if c.RSIWillRMonitor.Alerts.EnableWebhook && strings.TrimSpace(c.RSIWillRMonitor.Alerts.WebhookURL) == "" && strings.TrimSpace(c.RSIWillRMonitor.Alerts.DiscordWebhookURL) == "" {
			return errors.New("rsi_willr_monitor.alerts.webhook_url required when enable_webhook is true")
		}
		if c.RSIWillRMonitor.Alerts.TelegramEnable && (strings.TrimSpace(c.RSIWillRMonitor.Alerts.TelegramBotToken) == "" || strings.TrimSpace(c.RSIWillRMonitor.Alerts.TelegramChatID) == "") {
			return errors.New("rsi_willr_monitor.alerts.telegram_bot_token and telegram_chat_id required when telegram is enabled")
		}
		if !c.RSIWillRMonitor.Alerts.EnableWebhook && strings.TrimSpace(c.RSIWillRMonitor.Alerts.DiscordWebhookURL) == "" && !c.RSIWillRMonitor.Alerts.TelegramEnable {
			return errors.New("rsi_willr_monitor.alerts must enable webhook, discord, or telegram")
		}
	}
	if c.Digii4Flow.Enable {
		if _, err := time.Parse("15:04", c.Digii4Flow.StartupAfter); err != nil {
			return fmt.Errorf("invalid digii4_flow.startup_after: %w", err)
		}
		if _, err := time.Parse("15:04", c.Digii4Flow.DailyScanTime); err != nil {
			return fmt.Errorf("invalid digii4_flow.daily_scan_time: %w", err)
		}
		if _, err := time.Parse("15:04", c.Digii4Flow.EntryMonitorStart); err != nil {
			return fmt.Errorf("invalid digii4_flow.entry_monitor_start: %w", err)
		}
		if _, err := time.Parse("15:04", c.Digii4Flow.EntryMonitorEnd); err != nil {
			return fmt.Errorf("invalid digii4_flow.entry_monitor_end: %w", err)
		}
		entryStart, _ := time.Parse("15:04", c.Digii4Flow.EntryMonitorStart)
		entryEnd, _ := time.Parse("15:04", c.Digii4Flow.EntryMonitorEnd)
		if !entryEnd.After(entryStart) {
			return errors.New("digii4_flow.entry_monitor_end must be after entry_monitor_start")
		}
		if strings.TrimSpace(c.Digii4Flow.UniverseName) == "" {
			return errors.New("digii4_flow.universe_name is required when enabled")
		}
		if c.Digii4Flow.DailyTargetCount < 1 {
			return errors.New("digii4_flow.daily_target_count must be >= 1")
		}
		if c.Digii4Flow.DaysBack < 5 {
			return errors.New("digii4_flow.days_back must be >= 5")
		}
		if c.Digii4Flow.DailyRSIPeriod < 2 || c.Digii4Flow.EntryRSIPeriod < 2 {
			return errors.New("digii4_flow rsi periods must be >= 2")
		}
		if c.Digii4Flow.DailyWillRPeriod < 2 || c.Digii4Flow.EntryWillRPeriod < 2 {
			return errors.New("digii4_flow willr periods must be >= 2")
		}
		if c.Digii4Flow.EntryBBPeriod < 2 || c.Digii4Flow.EntryBBStdDev <= 0 {
			return errors.New("digii4_flow entry bollinger config invalid")
		}
		if c.Digii4Flow.Alerts.EnableWebhook && strings.TrimSpace(c.Digii4Flow.Alerts.WebhookURL) == "" {
			return errors.New("digii4_flow.alerts.webhook_url required when alerts are enabled")
		}
		if c.Digii4Flow.Alerts.TelegramEnable && (strings.TrimSpace(c.Digii4Flow.Alerts.TelegramBotToken) == "" || strings.TrimSpace(c.Digii4Flow.Alerts.TelegramChatID) == "") {
			return errors.New("digii4_flow.alerts.telegram_bot_token and telegram_chat_id required when telegram is enabled")
		}
		if c.Digii4Flow.NiftyLevelStep <= 0 {
			return errors.New("digii4_flow.nifty_level_step must be > 0")
		}
		if c.Digii4Flow.NiftyLevelBuffer < 0 {
			return errors.New("digii4_flow.nifty_level_buffer must be >= 0")
		}
		if c.Digii4Flow.SilverLevelStep <= 0 {
			return errors.New("digii4_flow.silver_level_step must be > 0")
		}
		if c.Digii4Flow.SilverLevelBuffer < 0 {
			return errors.New("digii4_flow.silver_level_buffer must be >= 0")
		}
		if c.Digii4Flow.SilverJumpThresholdPct < 0 {
			return errors.New("digii4_flow.silver_jump_threshold_pct must be >= 0")
		}
		if c.Digii4Flow.SilverCheckIntervalMinutes < 1 {
			return errors.New("digii4_flow.silver_check_interval_minutes must be >= 1")
		}
		if c.Digii4Flow.SumCheckIntervalMinutes < 1 {
			return errors.New("digii4_flow.sum_check_interval_minutes must be >= 1")
		}
		for _, capital := range c.Digii4Flow.AlertCapitals {
			if capital <= 0 {
				return errors.New("digii4_flow.alert_capitals values must be > 0")
			}
		}
	}
	if c.NiftyWatcher.Enable {
		if strings.TrimSpace(c.NiftyWatcher.Underlying) == "" {
			return errors.New("nifty_watcher.underlying is required when enabled")
		}
		if strings.TrimSpace(c.NiftyWatcher.IndexToken) == "" {
			return errors.New("nifty_watcher.index_token is required when enabled")
		}
		if c.NiftyWatcher.Step <= 0 {
			return errors.New("nifty_watcher.step must be > 0")
		}
		if c.NiftyWatcher.Buffer < 0 {
			return errors.New("nifty_watcher.buffer must be >= 0")
		}
		if c.NiftyWatcher.Lots < 1 {
			return errors.New("nifty_watcher.lots must be >= 1")
		}
		if c.NiftyWatcher.LotSize < 1 {
			return errors.New("nifty_watcher.lot_size must be >= 1")
		}
		if c.NiftyWatcher.TargetRupees <= 0 {
			return errors.New("nifty_watcher.target_rupees must be > 0")
		}
		if _, err := time.Parse("15:04", c.NiftyWatcher.EntryStart); err != nil {
			return fmt.Errorf("invalid nifty_watcher.entry_start: %w", err)
		}
		if _, err := time.Parse("15:04", c.NiftyWatcher.EntryEnd); err != nil {
			return fmt.Errorf("invalid nifty_watcher.entry_end: %w", err)
		}
		if _, err := time.Parse("15:04", c.NiftyWatcher.ExitTime); err != nil {
			return fmt.Errorf("invalid nifty_watcher.exit_time: %w", err)
		}
		if c.NiftyWatcher.RSIPeriod < 2 {
			return errors.New("nifty_watcher.rsi_period must be >= 2")
		}
		if c.NiftyWatcher.WILLRPeriod < 2 {
			return errors.New("nifty_watcher.willr_period must be >= 2")
		}
		if c.NiftyWatcher.LookbackMinutes < 10 {
			return errors.New("nifty_watcher.lookback_minutes must be >= 10")
		}
		if c.NiftyWatcher.RSILowThreshold >= c.NiftyWatcher.RSIHighThreshold {
			return errors.New("nifty_watcher.rsi_low_threshold must be < rsi_high_threshold")
		}
		if _, err := time.Parse("15:04", c.NiftyWatcher.NormalizationStart); err != nil {
			return fmt.Errorf("invalid nifty_watcher.normalization_start: %w", err)
		}
		if c.NiftyWatcher.SlopeGuardMinAngle < 0 || c.NiftyWatcher.SlopeGuardMinAngle > 90 {
			return errors.New("nifty_watcher.slope_guard_min_angle must be between 0 and 90")
		}
		if c.NiftyWatcher.EquilibriumDiffThreshold < 0 {
			return errors.New("nifty_watcher.equilibrium_diff_threshold must be >= 0")
		}
		if c.NiftyWatcher.Alerts.EnableWebhook && strings.TrimSpace(c.NiftyWatcher.Alerts.WebhookURL) == "" {
			return errors.New("nifty_watcher.alerts.webhook_url required when alerts are enabled")
		}
	}
	return nil
}
