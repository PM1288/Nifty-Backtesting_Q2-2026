# OIIS data mapping

| Evidence | Canonical source | Phase-A use |
|---|---|---|
| Current Nifty 100 panel | `public.instrument_universe` | Current-panel universe; survivorship limitation retained |
| Stock OHLCV/delivery | `nse.fact_eod_prices` | Three-year features, execution path and participation proxies |
| Sector | `public.index_constituents` | Point-in-query sector grouping; missing sector becomes `OTHER` |
| NIFTY 50 / Bank NIFTY / India VIX | `integration.v_index_daily_history` | Regime calculation and decision context |
| Governed daily regimes | `strategy_eval.market_regime_daily` | Stock/index trend, persistence, volatility, zone and VIX slices |
| OIIS immutable evidence | `oiis.*` from migration 021 | Formula, replay, decisions, outcomes, buckets and artifacts |

Regime calculation now uses `nse.fact_eod_prices`, not the shorter latest
backtest feature batch, so current-panel stock regimes cover the requested
three-year window. All return/rolling features are backward-looking; signal
decisions occur after session close and fills use the next session open.
