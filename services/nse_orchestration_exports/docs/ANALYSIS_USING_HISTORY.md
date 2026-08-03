# Analyses that improve materially with historical data

## 1) Breakout reliability
With 6-24 months of data you can estimate:
- hit rate after breakout signals
- average forward return
- false-break frequency by sector and regime

## 2) Mean reversion quality
History lets you segment:
- oversold bounces in weak vs strong regimes
- reversal persistence
- reversion half-life

## 3) Delivery conviction baselines
Historical distributions are required to separate:
- ordinary volume bursts
- genuine accumulation
- one-off churn

## 4) Event drift studies
With historical windows you can study:
- corporate action drift
- announcement follow-through
- bulk/block flow persistence

## 5) Anomaly baselines
An anomaly score is only useful if compared with historical norms:
- symbol-level percentile
- sector-level percentile
- regime-adjusted percentile

## 6) Watchlist persistence
History answers:
- how often a symbol stays in a rule watchlist
- whether churn is healthy or noisy
- whether watchlists are stable enough to learn from

## 7) Signal performance summary
Longer history improves confidence in:
- hit rate
- median forward return
- sample stability
- regime sensitivity

## What to keep long-term

Keep compact tables much longer than raw daily files:
- `nse_app.security_daily_features`
- `nse_app.stock_analysis_signals_daily`
- `nse_app.signal_performance_summary`
- `nse_ops.dashboard_snapshot_daily`
- `nse_ops.dashboard_section_daily`
- `nse_ops.watchlist_snapshot_daily`
