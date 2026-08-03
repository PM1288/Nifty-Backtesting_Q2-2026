# Phase 3: A02 Backtest + Live Signals

## Objective
Implement the legacy A02 intraday backtest and live signal watcher using the Phase-1/2 data model (bars_1m + bars_1d). This is a non-trading module that evaluates the first intraday strategy and produces backtest reports, live signals, and summary metrics. Live trading must remain disabled.

## Inputs and dependencies
- bars_1m (intraday 1-minute bars from WS primary)
- bars_1d (daily history, 3 years for equities and indices)
- instrument_universe (NIFTY100 equities universe)
- trading_calendar (if available; fallback to last weekday)

## A02 signal rules (per symbol, per day)
- Evaluate only after start_offset_minutes from the first bar of the day.
- Signal conditions at bar index i:
  - rsi_i < rsi_threshold
  - rsi_i > rsi_{i-1}
  - willr_i < willr_threshold
  - close_i > mean(close_{i-close_lookback..i-1})
  - volume_{i-1} < median(volume_{i-volume_lookback..i-1})
- RSI uses simple rolling averages of gains/losses (legacy SMA-style), not Wilder smoothing.
- On first signal per symbol/day, enter at close_i.
- Exit rule: target_gain (entry * (1 + target_gain)); if not hit, exit at final bar of day.
- Record success, gain_pct, duration_minutes, and charge breakdown.
- Optional filters (configurable):
  - require_daily_ema_trend: only allow entries when daily EMA fast >= EMA slow.
  - require_bollinger_touch: require close near lower Bollinger band (bollinger_lower_buffer_pct).
  - require_vwap_reclaim: require close >= intraday VWAP.
  - require_volume_spike: require signal bar volume >= volume_spike_min_ratio * median volume.

## Percentile filter (daily_close_position)
- Before scanning, compute daily_close_position for equities using bars_1d.
- current_percentile = percentile rank of latest close vs last N days (days_back), fallback to all history if fewer than 5 values.
- Skip symbols where current_percentile >= max_percentile.

## Scheduling
- Daily backtest: run at backtest.daily_run_time_ist on trading days.
- Live signals: run every live_interval_seconds during market hours.
- If outside market hours and weekend_pull_last_working_day is true, use last working day for daily backtest.

## Storage (schema: public)
- daily_close_position
  - exchange, symbol_token, symbol, tradingsymbol, current_close, current_percentile,
    year_high, year_low, median_close, mean_close, updated_at
- a02_backtest_runs
  - run_id, trade_date, total_trades, wins, losses, win_rate,
    total_gross_profit, total_charges, total_net_profit, average_breakeven_points,
    capital_trades, capital_wins, capital_losses, capital_net_profit,
    symbols_evaluated, symbols_with_trades, created_at
- a02_backtest_results
  - run_id, trade_date, exchange, symbol_token, symbol, tradingsymbol,
    entry_time, entry_close, exit_time, exit_close, success, gain_pct, duration_minutes,
    rsi, prev_rsi, willr, prev_volume, volume_median,
    quantity, investment_amount, exit_value, turnover, gross_profit,
    total_charges, net_profit, net_gain_pct, target_price, breakeven_points,
    raw JSON
- a02_backtest_daily_stats
  - run_id, trade_date, duration_min_minutes, duration_max_minutes, duration_avg_minutes,
    duration_median_minutes, duration_std_minutes, total_gross_profit, total_charges,
    total_net_profit, average_breakeven_points, capital_trades, capital_wins, capital_losses,
    capital_net_profit, symbols_evaluated, symbols_with_trades, created_at
- a02_backtest_live_signals (dedupe on run_id + symbol + entry_time)
- a02_backtest_live_status (latest signal per symbol + heartbeat row)
- a02_backtest_live_stream (append-only stream of live backtest signals)

## Alerts
- Use the backtest alerts webhook to send a concise summary after each daily run.
- Use the backtest alerts webhook for live signals (max_per_run, max per day) during the live window.
- Never place orders; guardrails must remain active.

## Archive swing backtest (optional)
This is an offline replay that scans archive minute bars and captures the first A02 signal per symbol, then
holds until a same-day or swing target is reached (otherwise exits at the final bar).
Optional swing controls:
- swing.stop_loss_pct for protective exits.
- swing.hold_min_gain_pct to only hold overnight if entry-day close meets a minimum gain.

### Inputs
- Local CSV minute bars (`*_minute.csv`) per symbol.
- A02 signal rules from this spec (RSI/WILLR/volume/close lookbacks).

### Command
```
backtest --archive-swing --archive-root /path/to/archive --archive-start 2025-01-01 --archive-end 2025-12-31
```

### Storage
- a02_archive_swing_runs
- a02_archive_swing_results
- a02_archive_swing_daily_stats

## Archive daily runner (optional)
If local `*_minute.csv` archives exist, the backtest service can schedule a daily
archive replay for intraday and/or swing.

### Config
```
backtest:
  archive:
    enable: false
    run_time_ist: "17:00"
    run_on_start: false
    root: "/app/archive"
    exchange: "NSE"
    symbols_csv_path: ""
    symbols: []
    start_date: ""
    end_date: ""
    run_intraday: true
    run_swing: true
```

Notes:
- When `symbols` is empty, the runner loads symbols from `symbols_csv_path` (or `files.symbols_csv_path`), else auto-discovers `*_minute.csv` under `root`.

## Done criteria
- Backtest service builds in Docker and writes all tables.
- Daily run executes against last trading day and stores summary.
- Live run emits signals during market hours and writes live tables.
- Grafana dashboard shows latest backtest results, live signals, and run status.
